import { useEffect, useRef, useState } from "react";
import { Clock4, MapPin, AlertTriangle, CheckCircle2, Heart } from "lucide-react";
import MuhuratCalendar from "@/components/MuhuratCalendar";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";

interface Place { label: string; latitude: number; longitude: number; timezone: string; }
const DEFAULT: Place = { label: "New Delhi, India", latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata" };
const ACTIVITIES = [
  { key: "marriage", label: "Marriage / Shaadi" },
  { key: "business", label: "Business / New Work" },
  { key: "travel", label: "Travel / Yatra" },
  { key: "education", label: "Education / Study" },
  { key: "general", label: "General / Auspicious" },
];

// Inline tints survive the dark cosmic theme (emerald-50 / rose-50 do not).
const GOOD = "#34D399";
const BAD = "#F87171";
const PINK = "#F26D9B";

export default function MuhuratPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [activity, setActivity] = useState("marriage");
  const [place, setPlace] = useState<Place>(DEFAULT);
  const [q, setQ] = useState(DEFAULT.label);
  const [opts, setOpts] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const reqRef = useRef(0);
  const load = () => {
    const id = ++reqRef.current;
    setLoading(true);
    fetch(`/api/muhurat?date=${date}&lat=${place.latitude}&lon=${place.longitude}&tz=${encodeURIComponent(place.timezone)}&activity=${activity}`)
      .then((r) => r.json()).then((j) => { if (id === reqRef.current && !j.error) setData(j); }).catch(() => {}).finally(() => { if (id === reqRef.current) setLoading(false); });
  };
  useEffect(() => { load(); }, [date, activity, place]); // eslint-disable-line

  useEffect(() => {
    if (q.length < 2 || q === place.label) { setOpts([]); return; }
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => {
      fetch(`/api/places?q=${encodeURIComponent(q)}`).then((r) => r.json())
        .then((d) => { setOpts(Array.isArray(d) ? d : []); setOpen(true); }).catch(() => {});
    }, 300);
  }, [q]); // eslint-disable-line

  return (
    <div className="space-y-6 pt-2">
      {/* activity + place */}
      <section className="m-card m-enter space-y-3 p-4">
        <label className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-1">
          <Clock4 className="h-[18px] w-[18px] shrink-0 text-accent" />
          <select
            value={activity}
            onChange={(e) => { haptic.select(); setActivity(e.target.value); }}
            className="h-11 w-full min-w-0 bg-transparent text-[14px] font-semibold text-foreground focus:outline-none"
          >
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key} className="bg-card text-foreground">{a.label}</option>
            ))}
          </select>
        </label>

        <div className="relative">
          <label className="flex items-center gap-3 rounded-2xl bg-muted px-3.5 py-1">
            <MapPin className="h-[18px] w-[18px] shrink-0 text-accent" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
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

        {loading && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1.5 text-[11.5px] font-bold text-accent">
            <Clock4 className="h-3.5 w-3.5 animate-spin" /> Updating…
          </span>
        )}
      </section>

      {/* Calendar — pick a date; auspicious days for the activity are dotted */}
      <section className="m-enter space-y-2" style={{ animationDelay: '0.06s' }}>
        {/* `place` is passed by reference, not rebuilt inline. A fresh object
            literal here is a new identity every render, and the calendar's
            effect depends on it — so one date tap re-fetched the whole month
            several times, and typing a city fired a request per keystroke. */}
        <MuhuratCalendar value={date} onChange={setDate} activity={activity} place={place} />
        <p className="px-1 text-[12px] text-muted-foreground">
          Selected: <b className="text-foreground">{date}</b>{data?.weekday ? ` · ${data.weekday}` : ""}
        </p>
      </section>

      {loading && !data ? (
        <div className="space-y-3">
          <div className="skeleton h-[60px]" />
          <div className="skeleton h-[110px]" />
          <div className="skeleton h-[150px]" />
        </div>
      ) : data && (
        <div className={`space-y-6 transition-opacity duration-200 ${loading ? "opacity-50" : "opacity-100"}`}>
          <div className="m-enter rounded-2xl border border-accent/25 bg-accent/10 px-4 py-3.5 text-[13px] leading-relaxed">
            <b className="capitalize text-accent">{data.activity}</b> — {data.tip}
          </div>

          <section className="m-card m-enter divide-y divide-border" style={{ animationDelay: '0.06s' }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[12px] text-muted-foreground">Day</span>
              <span className="text-[13.5px] font-bold">{data.weekday}, {data.date}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[12px] text-muted-foreground">Tithi</span>
              <span className="text-[13.5px] font-bold">{data.panchang.tithi}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[12px] text-muted-foreground">Nakshatra</span>
              <span className="text-[13.5px] font-bold">{data.panchang.nakshatra}</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-[12px] text-muted-foreground">Sunrise · Sunset</span>
              <span className="text-[13.5px] font-bold">{data.panchang.sunrise} · {data.panchang.sunset}</span>
            </div>
          </section>

          {/* Not suitable (marriage day blocked by Kharmas / Ast / nakshatra / tithi) */}
          {data.suitable === false && (
            <section className="m-enter" style={{ animationDelay: '0.1s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-[15px] w-[15px]" /> Not a {data.activity} day
              </h3>
              <div className="m-card p-4">
                <p className="text-[13px] leading-relaxed">{data.note}</p>
                <ul className="mt-3 space-y-2">
                  {data.blockers?.map((b: string, i: number) => (
                    <li key={i} className="flex gap-2 text-[13px] text-muted-foreground">
                      <span className="mt-0.5 shrink-0 text-destructive">✕</span><span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Auspicious windows (only when the day itself is suitable) */}
          {data.suitable !== false && (
            <section className="m-enter" style={{ animationDelay: '0.1s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                <CheckCircle2 className="h-[15px] w-[15px]" style={{ color: GOOD }} /> Auspicious windows
              </h3>
              <div className="m-card space-y-3 p-4">
                {data.positives?.length > 0 && (
                  <ul className="space-y-1.5">
                    {data.positives.map((pz: string, i: number) => (
                      <li key={i} className="flex gap-1.5 text-[12.5px]" style={{ color: GOOD }}>
                        <span>✓</span><span>{pz}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {data.windows.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No strongly auspicious Choghadiya windows today — consider another date.</p>
                ) : (
                  <div className="space-y-2">
                    {data.windows.map((w: any, i: number) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 ${
                          w.best ? "border-accent/45 bg-accent/12" : ""
                        }`}
                        style={w.best ? undefined : { background: `${GOOD}14`, borderColor: `${GOOD}33` }}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[14px] font-bold">
                            {w.name}
                            {w.best && (
                              <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase text-accent-foreground">Best</span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[12px] uppercase tracking-wider text-muted-foreground">{w.phase}</span>
                        </span>
                        <span className="shrink-0 text-[13px] font-semibold">{w.start} – {w.end}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Marriage ceremony timing guide */}
          {data.ceremony?.length > 0 && (
            <section className="m-enter" style={{ animationDelay: '0.14s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
                <Heart className="h-[15px] w-[15px]" style={{ color: PINK }} /> Wedding timing guide
              </h3>
              <div className="space-y-2.5">
                {data.ceremony.map((c: any, i: number) => (
                  <div
                    key={i}
                    className="m-card p-4"
                    style={c.primary ? { borderColor: `${PINK}55`, background: `${PINK}12` } : undefined}
                  >
                    <p className="flex items-center gap-1.5 text-[14.5px] font-bold">
                      {c.stage}
                      {c.primary && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase text-white" style={{ background: PINK }}>Main</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{c.desc}</p>
                    <p className="mt-2 text-[14px] font-bold">{c.start} – {c.end}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">{c.name} choghadiya</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 px-1 text-[11.5px] text-muted-foreground">For the exact Vivah Lagna, also confirm with a jyotishi.</p>
            </section>
          )}

          {/* Abhijit — auspicious, so it belongs above the avoid list, not in it. */}
          {data.abhijit && (
            <section className="m-enter" style={{ animationDelay: '0.17s' }}>
              <div
                className="m-card flex items-center gap-3.5 p-4"
                style={{ background: 'linear-gradient(180deg, rgba(52,211,153,0.12), transparent)', borderColor: '#34D39955' }}
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                  <CheckCircle2 className="h-[21px] w-[21px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-bold leading-tight">Abhijit Muhurat</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">
                    {data.abhijit.note ?? 'Around midday — auspicious for almost any beginning'}
                  </span>
                </span>
                {!data.abhijit.note && (
                  <span className="shrink-0 text-[13px] font-bold" style={{ color: GOOD }}>
                    {data.abhijit.start} – {data.abhijit.end}
                  </span>
                )}
              </div>
            </section>
          )}

          {data.avoid && (
            <section className="m-enter" style={{ animationDelay: '0.18s' }}>
              <h3 className="mb-3 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-[15px] w-[15px]" /> Avoid these periods
              </h3>
              <div className="m-card divide-y divide-border">
                {Object.entries(data.avoid).map(([k, v]: any) => v && (
                  <div key={k} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <span className="text-[13.5px] font-bold capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="shrink-0 text-[13px] font-semibold" style={{ color: BAD }}>{v.start} – {v.end}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="px-2 pb-2 text-center text-[11.5px] text-muted-foreground">
            Computed for {place.label}. For major events, also consult a jyotishi for the full muhurat.
          </p>
        </div>
      )}
    </div>
  );
}
