import React, { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MapPin, Calendar, Clock, UserIcon, Check, Loader2, ChevronRight, ChevronLeft, Sparkles, ShieldCheck,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
import { invalidateProfiles } from '@/pages/HomePage';

interface Place {
  label: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country: string;
}

const STEPS = ['About you', 'Birth time', 'Birth place'];

/** Segmented control — used for gender, AM/PM and language. */
function Segmented<T extends string>({
  value, onChange, options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="grid gap-1 rounded-2xl bg-muted p-1" style={{ gridTemplateColumns: `repeat(${options.length},1fr)` }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') haptic.select(); }}
            onClick={() => onChange(o.value)}
            className={`rounded-xl py-2.5 text-[13.5px] font-semibold transition-all duration-200 ${
              on ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="px-1 text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  'w-full rounded-2xl border border-input bg-card px-4 py-3.5 text-[15px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-accent transition-colors';

export default function CreateChartPage() {
  const t = useT();
  const navigate = useNavigate();
  // Same screen, two jobs. `/create-chart` builds a new kundli; `/edit/:chartId`
  // corrects an existing one in place — which the app had been promising on
  // this very page while offering no way to do it.
  const { chartId } = useParams();
  const editing = !!chartId;
  const [step, setStep] = useState(0);
  const [prefilling, setPrefilling] = useState(editing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    date_of_birth: '',
    gender: 'male',
    language: 'en',
  });

  // Birth time stays a 12-hour value (hour 1-12 + minute + AM/PM). A native
  // <input type=time> is where the old AM/PM bugs came from, and a wrong AM/PM
  // moves the Lagna by half a zodiac — so this stays explicit.
  const [time, setTime] = useState({ hour: '', minute: '', ampm: 'AM' });
  const [unknownTime, setUnknownTime] = useState(false);
  // Date of birth as three independent parts (like `time`). Deriving them from
  // the combined string doesn't work: the string is only built once all three
  // are chosen, so picking one alone would reset to the placeholder.
  const [dob, setDob] = useState({ d: '', m: '', y: '' });
  // Combine parts → the YYYY-MM-DD the rest of the form expects.
  useEffect(() => {
    setFormData((f) => ({
      ...f,
      date_of_birth: dob.d && dob.m && dob.y ? `${dob.y}-${dob.m}-${dob.d}` : '',
    }));
  }, [dob]);
  // Edit mode: when a saved chart prefills the date, split it into the parts so
  // the dropdowns show it. Guarded so it runs once, not in a loop.
  useEffect(() => {
    if (formData.date_of_birth && !dob.y) {
      const [y, m, d] = formData.date_of_birth.split('-');
      if (y && m && d) setDob({ d, m, y });
    }
  }, [formData.date_of_birth]); // eslint-disable-line react-hooks/exhaustive-deps
  const [placeError, setPlaceError] = useState('');

  const [placeQuery, setPlaceQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedPlace && placeQuery === selectedPlace.label) return;
    if (placeQuery.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setPlaceError('');
        const res = await fetch(`/api/places?q=${encodeURIComponent(placeQuery.trim())}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setShowSuggestions(true);
      } catch {
        // Was silent. With no suggestion the user cannot pick a place, and the
        // submit button below is hard-disabled on `selectedPlace` — so a failed
        // lookup left them stuck on the last step with their city typed in and
        // no idea why nothing happened. This was the app's single worst
        // abandonment point.
        setSuggestions([]);
        setPlaceError("Couldn't search places. Check your connection and try again.");
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [placeQuery, selectedPlace]);

  // Load the existing details when editing.
  useEffect(() => {
    if (!chartId) return;
    let alive = true;
    fetch(`/api/chart/${chartId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive || d?.error) throw new Error(d?.error || 'load failed');
        const b = d.birth_details ?? {};
        setFormData({
          name: b.name ?? '',
          date_of_birth: b.date_of_birth ?? '',
          gender: b.gender || 'male',
          language: b.language || 'en',
        });
        const [hh, mm] = String(b.time_of_birth ?? '').split(':').map(Number);
        if (Number.isFinite(hh)) {
          setTime({
            hour: String(hh % 12 === 0 ? 12 : hh % 12),
            minute: String(mm ?? 0),
            ampm: hh >= 12 ? 'PM' : 'AM',
          });
        }
        if (b.place_of_birth) {
          setPlaceQuery(b.place_of_birth);
          setSelectedPlace({
            label: b.place_of_birth, name: b.place_of_birth,
            latitude: b.latitude, longitude: b.longitude,
            timezone: b.timezone, country: '',
          });
        }
      })
      .catch(() => { if (alive) setError("Couldn't load this kundli to edit."); })
      .finally(() => { if (alive) setPrefilling(false); });
    return () => { alive = false; };
  }, [chartId]);

  useEffect(() => {
    const onDown = (e: Event) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const pickPlace = (p: Place) => {
    haptic.success();
    setSelectedPlace(p);
    setPlaceQuery(p.label);
    setSuggestions([]);
    setShowSuggestions(false);
    setError(null);
  };

  const onPlaceChange = (value: string) => {
    setPlaceQuery(value);
    // Editing invalidates a previous selection so coordinates always match.
    if (selectedPlace) setSelectedPlace(null);
  };

  /** What has to be true before the step's "Next" button lights up. */
  const stepValid = (s: number): boolean => {
    if (s === 0) return formData.name.trim().length > 1;
    if (s === 1) {
      const h = parseInt(time.hour, 10);
      const m = parseInt(time.minute, 10);
      return !!formData.date_of_birth && h >= 1 && h <= 12 && m >= 0 && m <= 59;
    }
    return !!selectedPlace;
  };

  const next = () => {
    if (!stepValid(step)) { haptic.warning(); return; }
    haptic.tap();
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const prev = () => { haptic.tap(); setStep((s) => Math.max(s - 1, 0)); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPlace) {
      setError('Please choose a birth place from the suggestions — coordinates come with it.');
      return;
    }
    const h = parseInt(time.hour, 10);
    const m = parseInt(time.minute, 10);
    if (!(h >= 1 && h <= 12) || !(m >= 0 && m <= 59)) {
      setError('Enter a valid birth time (hour 1-12, minute 0-59, AM/PM).');
      return;
    }
    // 12-hour -> 24-hour "HH:MM".
    const h24 = time.ampm === 'PM' ? (h % 12) + 12 : h % 12;
    const time_of_birth = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

    setLoading(true);
    haptic.medium();
    try {
      const res = await fetch(editing ? `/api/profiles/${chartId}` : '/api/create-chart', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          time_of_birth,
          place_of_birth: selectedPlace.label,
          latitude: selectedPlace.latitude,
          longitude: selectedPlace.longitude,
          timezone: selectedPlace.timezone,
        }),
      });
      const data = await res.json();
      if (res.ok && data.id) {
        haptic.success();
        invalidateProfiles(); // else Home shows a stale list without the new chart
        // `replace` on edit so Back doesn't drop the user into the form again.
        // Made from the chat's Rishta flow: go back there with the new kundli
        // ready to link. Same-app paths only — never an open redirect.
        const ret = !editing ? new URLSearchParams(window.location.search).get('return') : null;
        if (ret && ret.startsWith('/') && !ret.startsWith('//')) {
          navigate(`${ret}${ret.includes('?') ? '&' : '?'}relate=${data.id}`, { replace: true });
        } else {
          navigate(`/dashboard/${data.id}`, { replace: editing });
        }
        // Deliberately NOT asking for a rating here. It used to fire 1.4s after
        // the very first kundli — covering the dashboard before the user had
        // read a single line of their own chart, which is the worst possible
        // first impression. The ask now happens after they've actually got
        // value from a reading (see requestFeedback callers elsewhere).
      } else {
        haptic.error();
        setError(
          [data.error, ...(data.details ?? [])].filter(Boolean).join(' — ') || 'Could not create the chart.',
        );
      }
    } catch (err) {
      console.error(err);
      haptic.error();
      setError('Network error while creating the chart.');
    } finally {
      setLoading(false);
    }
  };

  const last = step === STEPS.length - 1;

  return (
    <form onSubmit={handleSubmit} className="pt-2">
      {/* progress */}
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={`h-1 rounded-full transition-colors duration-300 ${
                i <= step ? 'bg-accent' : 'bg-muted'
              }`}
            />
            <p className={`mt-2 text-[11px] font-semibold ${i === step ? 'text-accent' : 'text-muted-foreground'}`}>
              {t(s)}
            </p>
          </div>
        ))}
      </div>

      {/* overflow-visible so the place-search dropdown (absolutely positioned)
          is not clipped by .m-card's overflow:hidden — that was hiding it. */}
      {/* relative z-20 lifts the whole card (and its place-search dropdown) above
          the Next/Create actions row below — the m-enter transform makes a
          stacking context, so without this the button painted over the list. */}
      <div className="m-card m-enter relative z-20 space-y-5 p-5" style={{ overflow: 'visible' }} key={step}>
        {step === 0 && (
          <>
            {/* A one-line bridge so a newcomer knows what the payoff is before
                filling a form — "hope → what you'll get". */}
            <p className="-mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              {t("Let's read your birth chart — I'll tell you about yourself and your life in plain words. Just three quick steps.")}
            </p>
            <Field label={t("Full name")}>
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  className={`${inputCls} pl-11`}
                  placeholder={t("Your full name")}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </Field>

            <Field label={t("Gender")}>
              <Segmented
                value={formData.gender}
                onChange={(v) => setFormData({ ...formData, gender: v })}
                options={[
                  { value: 'male', label: t('Male') },
                  { value: 'female', label: t('Female') },
                  { value: 'other', label: t('Other') },
                ]}
              />
            </Field>

            <Field label={t("Language")}>
              <Segmented
                value={formData.language}
                onChange={(v) => setFormData({ ...formData, language: v })}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'hi', label: 'हिंदी' },
                  { value: 'hinglish', label: 'Hinglish' },
                ]}
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <>
            <Field label={t("Date of birth")}>
              {/* Day / Month / Year dropdowns instead of a native date picker:
                  that picker opened on the CURRENT month, so reaching a birth
                  year 25-30 years back meant tapping the calendar's back-arrow
                  dozens of times. Dropdowns jump straight to any year. */}
              <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
                <select className={`${inputCls} appearance-none text-center`} value={dob.d}
                  onChange={(e) => setDob({ ...dob, d: e.target.value })}>
                  <option value="" disabled>Day</option>
                  {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((d) =>
                    <option key={d} value={d}>{Number(d)}</option>)}
                </select>
                <select className={`${inputCls} appearance-none text-center`} value={dob.m}
                  onChange={(e) => setDob({ ...dob, m: e.target.value })}>
                  <option value="" disabled>Month</option>
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label, i) =>
                    <option key={label} value={String(i + 1).padStart(2, '0')}>{label}</option>)}
                </select>
                <select className={`${inputCls} appearance-none text-center`} value={dob.y}
                  onChange={(e) => setDob({ ...dob, y: e.target.value })}>
                  <option value="" disabled>Year</option>
                  {Array.from({ length: 110 }, (_, i) => String(new Date().getFullYear() - i)).map((y) =>
                    <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </Field>

            <Field label={t("Exact birth time")}>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={inputCls}
                  value={time.hour}
                  onChange={(e) => { haptic.select(); setTime({ ...time, hour: e.target.value }); }}
                >
                  <option value="">Hour</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
                <select
                  className={inputCls}
                  value={time.minute}
                  onChange={(e) => { haptic.select(); setTime({ ...time, minute: e.target.value }); }}
                >
                  <option value="">Minute</option>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                  ))}
                </select>
              </div>
              <div className="pt-2">
                <Segmented
                  value={time.ampm}
                  onChange={(v) => setTime({ ...time, ampm: v })}
                  options={[{ value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]}
                />
              </div>
            </Field>

            {/* Plenty of people genuinely don't know the minute they were born.
                Without this they simply cannot proceed past step 2. */}
            <Pressable
              subtle
              onClick={() => {
                haptic.tap();
                setUnknownTime(true);
                setTime({ hour: '12', minute: '0', ampm: 'PM' });
              }}
              className="w-full rounded-2xl border border-dashed border-border py-3 text-[12.5px] font-semibold text-muted-foreground"
            >
              I don&apos;t know my exact birth time
            </Pressable>

            <p className="flex items-start gap-2 rounded-2xl bg-accent/10 p-3 text-[12px] leading-relaxed text-accent">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              {unknownTime
                ? "No problem — we'll use noon. Your Moon sign, nakshatra and dashas stay accurate; only the rising sign (Lagna) and house-based details may shift. You can correct the time later — open the kundli list and tap Edit."
                : t("Pick AM/PM carefully. Birth time decides your rising sign (Lagna), so an accurate time gives a sharper reading.")}
            </p>

            {/* Said at the moment we ask, not buried in a policy page. */}
            <p className="flex items-start gap-2 px-1 text-[11.5px] leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Your birth details are used only to calculate your chart. They stay
              private to you and are never shown to anyone else.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2" ref={boxRef}>
              <label className="px-1 text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("Birth place")}
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  className={`${inputCls} pl-11 pr-11`}
                  placeholder={t("City name, e.g. Alwar")}
                  value={placeQuery}
                  autoComplete="off"
                  onChange={(e) => onPlaceChange(e.target.value)}
                  onFocus={() => suggestions.length && setShowSuggestions(true)}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2">
                  {searching ? (
                    <Loader2 className="h-[18px] w-[18px] animate-spin text-muted-foreground" />
                  ) : selectedPlace ? (
                    <Check className="h-[18px] w-[18px] text-emerald-400" />
                  ) : null}
                </span>

                {showSuggestions && suggestions.length > 0 && (
                  <ul className="absolute z-30 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-border bg-card shadow-2xl">
                    {suggestions.map((p, i) => (
                      <li key={`${p.label}-${i}`} className="border-b border-border last:border-0">
                        <Pressable
                          onClick={() => pickPlace(p)}
                          subtle
                          feedback="none"
                          className="flex w-full items-start gap-2.5 px-4 py-3 text-left"
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                          <span className="min-w-0">
                            <span className="block truncate text-[14px] font-semibold">{p.name}</span>
                            <span className="block truncate text-[12px] text-muted-foreground">{p.label}</span>
                          </span>
                        </Pressable>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {placeError && !selectedPlace && (
                <button
                  type="button"
                  onClick={() => { const q = placeQuery; setPlaceQuery(''); setTimeout(() => setPlaceQuery(q), 0); }}
                  className="w-full rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-left text-[12.5px] leading-relaxed text-amber-300"
                >
                  {placeError} Tap to retry.
                </button>
              )}

              {selectedPlace ? (
                <p className="px-1 text-[12px] text-emerald-400">
                  Location set: {selectedPlace.latitude.toFixed(4)}, {selectedPlace.longitude.toFixed(4)} · {selectedPlace.timezone}
                </p>
              ) : (
                <p className="px-1 text-[12px] text-muted-foreground">
                  Pick your city from the list — latitude, longitude and timezone fill in automatically.
                </p>
              )}
            </div>

            {/* summary before submit */}
            <div className="space-y-1.5 rounded-2xl bg-muted p-4 text-[13px]">
              <p className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-semibold">{formData.name || '—'}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Date</span><span className="font-semibold">{formData.date_of_birth || '—'}</span></p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">Time</span>
                <span className="font-semibold">
                  {time.hour ? `${time.hour}:${String(time.minute || 0).padStart(2, '0')} ${time.ampm}` : '—'}
                </span>
              </p>
            </div>
          </>
        )}

        {error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] leading-relaxed text-destructive">
            {error}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="mt-5 flex items-center gap-3">
        {step > 0 && (
          <Pressable
            onClick={prev}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-border text-foreground"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Pressable>
        )}

        {!last ? (
          <Pressable
            onClick={next}
            disabled={!stepValid(step)}
            feedback="none"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-3.5 text-[15px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
          >
            {t("Next")} <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.6} />
          </Pressable>
        ) : (
          <button
            type="submit"
            disabled={loading || !selectedPlace}
            className="pressable flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[15px] font-bold text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="h-[18px] w-[18px] animate-spin" /> {editing ? 'Saving…' : 'Creating chart…'}</>
            ) : (
              <><Sparkles className="h-[18px] w-[18px]" strokeWidth={2.4} /> {editing ? 'Save changes' : 'Create Kundli'}</>
            )}
          </button>
        )}
      </div>
    </form>
  );
}
