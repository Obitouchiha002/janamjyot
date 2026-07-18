import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Calendar, Clock, UserIcon, Check, Loader2, ChevronRight, ChevronLeft, Sparkles,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
import { requestFeedback } from '@/lib/feedback';

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
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
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
        const res = await fetch(`/api/places?q=${encodeURIComponent(placeQuery.trim())}`);
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
        setShowSuggestions(true);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [placeQuery, selectedPlace]);

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
      const res = await fetch('/api/create-chart', {
        method: 'POST',
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
        navigate(`/dashboard/${data.id}`);
        // Everything worked smoothly — ask for a rating once the new chart's
        // dashboard has settled. The helper self-limits (never nags).
        setTimeout(() => requestFeedback('chart'), 1400);
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
              {s}
            </p>
          </div>
        ))}
      </div>

      {/* overflow-visible so the place-search dropdown (absolutely positioned)
          is not clipped by .m-card's overflow:hidden — that was hiding it. */}
      <div className="m-card m-enter space-y-5 p-5" style={{ overflow: 'visible' }} key={step}>
        {step === 0 && (
          <>
            <Field label="Full name">
              <div className="relative">
                <UserIcon className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  className={`${inputCls} pl-11`}
                  placeholder="Vansh Kashyap"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </Field>

            <Field label="Gender">
              <Segmented
                value={formData.gender}
                onChange={(v) => setFormData({ ...formData, gender: v })}
                options={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                  { value: 'other', label: 'Other' },
                ]}
              />
            </Field>

            <Field label="Language">
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
            <Field label="Date of birth">
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  type="date"
                  className={`${inputCls} pl-11`}
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
              </div>
            </Field>

            <Field label="Exact birth time">
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

            <p className="flex items-start gap-2 rounded-2xl bg-accent/10 p-3 text-[12px] leading-relaxed text-accent">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              Choose AM/PM carefully — even a few minutes can change the Lagna and divisional charts.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-2" ref={boxRef}>
              <label className="px-1 text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
                Birth place
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  className={`${inputCls} pl-11 pr-11`}
                  placeholder="City name, e.g. Alwar"
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
            Next <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.6} />
          </Pressable>
        ) : (
          <button
            type="submit"
            disabled={loading || !selectedPlace}
            className="pressable flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3.5 text-[15px] font-bold text-accent-foreground shadow-lg shadow-accent/25 disabled:opacity-50"
          >
            {loading ? (
              <><Loader2 className="h-[18px] w-[18px] animate-spin" /> Creating chart…</>
            ) : (
              <><Sparkles className="h-[18px] w-[18px]" strokeWidth={2.4} /> Create Kundli</>
            )}
          </button>
        )}
      </div>
    </form>
  );
}
