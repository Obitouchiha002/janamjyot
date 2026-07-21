import { useEffect, useRef, useState } from "react";
import {
  Sunrise, Sunset, AlertTriangle, Clock, Sparkles, MapPin, CalendarDays,
} from "lucide-react";
import AnswerText from "@/components/AnswerText";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";

interface Place { label: string; latitude: number; longitude: number; timezone: string; }
const DEFAULT: Place = { label: "New Delhi, India", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" };
const RASHIS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
// Each sign's actual zodiac symbol + Hindi rashi name.
const ZODIAC: Record<string, { glyph: string; hindi: string }> = {
  Aries: { glyph: "♈", hindi: "Mesh" }, Taurus: { glyph: "♉", hindi: "Vrishabh" },
  Gemini: { glyph: "♊", hindi: "Mithun" }, Cancer: { glyph: "♋", hindi: "Kark" },
  Leo: { glyph: "♌", hindi: "Simha" }, Virgo: { glyph: "♍", hindi: "Kanya" },
  Libra: { glyph: "♎", hindi: "Tula" }, Scorpio: { glyph: "♏", hindi: "Vrishchik" },
  Sagittarius: { glyph: "♐", hindi: "Dhanu" }, Capricorn: { glyph: "♑", hindi: "Makar" },
  Aquarius: { glyph: "♒", hindi: "Kumbh" }, Pisces: { glyph: "♓", hindi: "Meen" },
};

// Choghadiya quality → tint. Inline tints (like MorePage) so the colours survive
// the dark cosmic theme, where bg-emerald-50 / text-rose-800 would be unreadable.
const CHO_TINT: Record<string, string> = { good: "#34D399", bad: "#F87171" };
const NEUTRAL_TINT = "#E8B44A";

export default function PanchangPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [place, setPlace] = useState<Place>(DEFAULT);
  const [q, setQ] = useState(DEFAULT.label);
  const [opts, setOpts] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<any>(null);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // horoscope
  const [horo, setHoro] = useState<Record<string, string> | null>(null);
  const [horoLoading, setHoroLoading] = useState(false);
  const [horoErr, setHoroErr] = useState<string | null>(null);

  const reqRef = useRef(0);
  const load = (d: string, p: Place) => {
    const id = ++reqRef.current;
    setLoading(true);
    fetch(`/api/panchang?date=${d}&lat=${p.latitude}&lon=${p.longitude}&tz=${encodeURIComponent(p.timezone)}`)
      .then((r) => r.json()).then((j) => { if (id === reqRef.current && !j.error) setData(j); })
      .catch(() => {}).finally(() => { if (id === reqRef.current) setLoading(false); });
  };
  useEffect(() => { load(date, place); }, [date, place]); // eslint-disable-line

  useEffect(() => {
    if (q.length < 2 || q === place.label) { setOpts([]); return; }
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(q)}`).then((r) => r.json())
        .then((d) => { setOpts(Array.isArray(d) ? d : []); setOpen(true); }).catch(() => {});
    }, 300);
  }, [q]); // eslint-disable-line

  const loadHoroscope = () => {
    setHoroLoading(true); setHoroErr(null);
    fetch("/api/horoscope", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok) setHoroErr(j.error || "Could not load horoscope."); else setHoro(j.horoscope); })
      .catch(() => setHoroErr("Network error.")).finally(() => setHoroLoading(false));
  };

  const elements = data ? [
    ["Tithi", data.tithi], ["Nakshatra", data.nakshatra], ["Yoga", data.yoga],
    ["Karana", data.karana], ["Paksha", data.paksha], ["Moon Sign", data.moon_sign],
  ] : [];
  const inausp = data?.periods ? [
    ["Rahu Kaal", data.periods.rahu_kaal], ["Yamaganda", data.periods.yamaganda], ["Gulika Kaal", data.periods.gulika],
  ].filter(([, v]) => v) : [];

  const choTint = (q: string) => CHO_TINT[q] ?? NEUTRAL_TINT;

  return (
    <div className="space-y-6 pt-2">
      {/* date + place */}
      <section className="m-card m-enter space-y-3 p-4">
        <label className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-1">
          <CalendarDays className="h-[18px] w-[18px] shrink-0 text-accent" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 w-full min-w-0 bg-transparent text-[14px] font-semibold text-foreground focus:outline-none"
          />
        </label>

        <div className="relative">
          <label className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-1">
            <MapPin className="h-[18px] w-[18px] shrink-0 text-accent" />
            <input
              value={q}
              onChange={(e) => { setQ(e.target.value); }}
              placeholder="Search city…"
              className="selectable h-11 w-full min-w-0 bg-transparent text-[14px] font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
          {open && opts.length > 0 && (
            <div className="m-card absolute left-0 right-0 z-30 mt-1.5 max-h-60 overflow-y-auto">
              {opts.map((p, i) => (
                <Pressable
                  key={i}
                  subtle
                  onClick={() => { setPlace(p); setQ(p.label); setOpen(false); }}
                  className="block w-full border-b border-border px-4 py-3 text-left text-[13.5px] last:border-0"
                >
                  {p.label}
                </Pressable>
              ))}
            </div>
          )}
        </div>

        {data && (
          <p className="px-1 text-[12px] text-muted-foreground">
            {data.weekday}, {data.date}
          </p>
        )}
      </section>

      {loading && !data ? (
        <div className="space-y-3">
          <div className="skeleton h-[80px]" />
          <div className="skeleton h-[170px]" />
          <div className="skeleton h-[140px]" />
        </div>
      ) : data && (
        <>
          {/* sunrise / sunset / vara */}
          <section className="m-enter space-y-2.5" style={{ animationDelay: '0.06s' }}>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="m-card flex items-center gap-2.5 px-3.5 py-3">
                <Sunrise className="h-[22px] w-[22px] shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sunrise</p>
                  <p className="truncate text-[15px] font-bold leading-tight">{data.sunrise}</p>
                </div>
              </div>
              <div className="m-card flex items-center gap-2.5 px-3.5 py-3">
                <Sunset className="h-[22px] w-[22px] shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sunset</p>
                  <p className="truncate text-[15px] font-bold leading-tight">{data.sunset}</p>
                </div>
              </div>
            </div>
            <div className="m-card px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Vara (Weekday)</p>
              <p className="mt-0.5 text-[17px] font-bold leading-tight">{data.weekday}</p>
            </div>
          </section>

          {/* panchang elements */}
          <section className="m-enter" style={{ animationDelay: '0.1s' }}>
            <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              Panchang Elements
            </h3>
            <div className="m-card grid grid-cols-2 gap-2.5 p-3">
              {elements.map(([k, v]) => (
                <div key={k as string} className="rounded-2xl bg-muted p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k as string}</p>
                  <p className="mt-0.5 text-[14px] font-bold leading-tight">{v as string}</p>
                </div>
              ))}
            </div>
          </section>

          {/* inauspicious */}
          {inausp.length > 0 && (
            <section className="m-enter" style={{ animationDelay: '0.14s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-[15px] w-[15px]" /> Inauspicious periods
              </h3>
              <div className="m-card divide-y divide-border">
                {inausp.map(([k, v]: any) => (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <span className="text-[13.5px] font-bold">{k}</span>
                    <span className="shrink-0 text-[13px] font-semibold text-destructive">{v.start} – {v.end}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Abhijit — the one reliably auspicious window most people look for. */}
          {data.periods?.abhijit && (
            <section className="m-enter" style={{ animationDelay: '0.16s' }}>
              <div
                className="m-card flex items-center gap-3.5 p-4"
                style={{ background: 'linear-gradient(180deg, rgba(52,211,153,0.12), transparent)', borderColor: '#34D39955' }}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  <Sparkles className="h-[21px] w-[21px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold leading-tight">Abhijit Muhurat</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                    {data.periods.abhijit.note ?? 'Around midday — good for starting almost anything'}
                  </span>
                </span>
                {!data.periods.abhijit.note && (
                  <span className="shrink-0 text-[13px] font-bold text-emerald-400">
                    {data.periods.abhijit.start} – {data.periods.abhijit.end}
                  </span>
                )}
              </div>
            </section>
          )}

          {/* choghadiya */}
          {data.day_choghadiya?.length > 0 && (
            <section className="m-enter" style={{ animationDelay: '0.18s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-[15px] w-[15px]" /> Choghadiya
              </h3>
              <div className="m-card space-y-4 p-4">
                {[["Day", data.day_choghadiya], ["Night", data.night_choghadiya]].map(([lbl, list]: any) => (
                  <div key={lbl}>
                    <p className="mb-2 text-[12px] font-bold text-muted-foreground">{lbl}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {list.map((c: any, i: number) => {
                        // A blocked slot is Rahu Kaal / Yamaganda / Gulika. It
                        // can be a "good" choghadiya by name and still be a
                        // window nobody starts anything in, so it must not
                        // read as green.
                        const tint = c.blocked ? '#F87171' : choTint(c.quality);
                        return (
                          <div
                            key={i}
                            className="rounded-xl border px-3 py-2"
                            style={{ background: `${tint}1A`, borderColor: `${tint}44` }}
                          >
                            <p className="text-[13px] font-bold" style={{ color: tint }}>
                              {c.name}
                              {c.blocked && <span className="ml-1 text-[10px] font-bold">✕</span>}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{c.start} – {c.end}</p>
                            {c.blocked && (
                              <p className="mt-0.5 text-[10.5px] font-bold" style={{ color: tint }}>{c.blocked}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Green = auspicious · Amber = neutral · Red = avoid. A ✕ marks a window that falls
                  inside Rahu Kaal, Yamaganda or Gulika — skip it even if the name looks good.
                </p>
              </div>
            </section>
          )}

          {/* Hora — 24 planetary hours. Unequal by convention: day and night are
              each divided into 12, so they are rarely 60 minutes long. */}
          {data.hora?.length > 0 && (
            <section className="m-enter" style={{ animationDelay: '0.20s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-[15px] w-[15px]" /> Hora — planetary hours
              </h3>
              <div className="m-card p-4">
                <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" style={{ scrollbarWidth: 'none' }}>
                  {data.hora.map((h: any, i: number) => {
                    const tint = choTint(h.quality);
                    return (
                      <div
                        key={i}
                        className="w-[104px] shrink-0 rounded-xl border px-3 py-2.5"
                        style={{ background: `${tint}14`, borderColor: `${tint}3A` }}
                      >
                        <p className="text-[13px] font-bold" style={{ color: tint }}>{h.lord}</p>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{h.start}</p>
                        <p className="text-[11px] leading-snug text-muted-foreground">– {h.end}</p>
                        <p className="mt-1 text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">
                          {h.is_day ? 'Day' : 'Night'}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                  Each hora is ruled by a planet — Jupiter, Venus, Mercury and Moon horas suit new
                  work, money and talks. Day and night are each split into 12, so a hora is not
                  exactly one hour.
                </p>
              </div>
            </section>
          )}

          {/* daily horoscope */}
          <section className="m-enter" style={{ animationDelay: '0.22s' }}>
            <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-[15px] w-[15px] text-accent" /> Today's horoscope
            </h3>

            {!horo && (
              <div className="m-card p-4">
                {horoErr && <p className="mb-3 text-[13px] text-destructive">{horoErr}</p>}
                {!horoLoading && (
                  <p className="text-[13px] text-muted-foreground">
                    See today's AI prediction for all 12 moon signs.
                  </p>
                )}
                {horoLoading ? (
                  <div className="mt-3 space-y-2.5">
                    {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[70px]" />)}
                  </div>
                ) : (
                  <Pressable
                    onClick={() => { haptic.tap(); loadHoroscope(); }}
                    feedback="medium"
                    className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
                  >
                    <Sparkles className="h-[17px] w-[17px]" strokeWidth={2.4} /> Show horoscope
                  </Pressable>
                )}
              </div>
            )}

            {horo && (
              <div className="space-y-2.5">
                {RASHIS.map((r) => {
                  // tolerant lookup — AI may vary key casing/spacing
                  const v = horo[r] ?? horo[Object.keys(horo).find((k) => k.trim().toLowerCase() === r.toLowerCase()) ?? ""];
                  if (!v) return null;
                  return (
                    <div key={r} className="m-card p-4">
                      <p className="mb-2 flex items-center gap-2 text-[15px] font-bold">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-[15px] leading-none text-accent">
                          {ZODIAC[r].glyph}
                        </span>
                        {r}
                        <span className="text-[12px] font-normal text-muted-foreground">({ZODIAC[r].hindi})</span>
                      </p>
                      <div className="selectable text-[13px] leading-relaxed text-foreground/85"><AnswerText text={v} /></div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <p className="px-2 pb-2 text-center text-[11.5px] text-muted-foreground">
            Computed for {place.label}. Astrology offers guidance, not certainty.
          </p>
        </>
      )}
    </div>
  );
}
