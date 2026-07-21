import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";

interface Place { latitude: number; longitude: number; timezone: string; }
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Month calendar that highlights dates suitable for the chosen activity (e.g. marriage). */
export default function MuhuratCalendar({ value, onChange, activity, place }: {
  value: string; onChange: (date: string) => void; activity: string; place: Place;
}) {
  const init = value ? value.split("-").map(Number) : [new Date().getFullYear(), new Date().getMonth() + 1, 1];
  const [y, setY] = useState(init[0]);
  const [m, setM] = useState(init[1]); // 1-indexed
  /** date -> { suitable, quality, windows, tithi, paksha, nakshatra, weekday } */
  const [days, setDays] = useState<Record<string, any>>({});
  // Distinct from "empty month": a failed fetch drew a grid with no dots,
  // which reads as "no auspicious dates" to someone planning a wedding.
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    const id = ++reqRef.current;
    setLoading(true);
    // Clear first: the keys are month-scoped ISO dates, so switching ACTIVITY
    // within the same month would otherwise keep showing the previous
    // activity's quality dots until the new response landed.
    setDays({});
    setFailed(false);
    fetch(`/api/muhurat-month?year=${y}&month=${m}&lat=${place.latitude}&lon=${place.longitude}&tz=${encodeURIComponent(place.timezone)}&activity=${activity}`)
      .then((r) => r.json())
      .then((j) => {
        if (id !== reqRef.current || !j.days) return;
        const map: Record<string, any> = {};
        j.days.forEach((d: any) => { map[d.date] = d; });
        setDays(map);
      }).catch(() => { if (id === reqRef.current) setFailed(true); })
      .finally(() => { if (id === reqRef.current) setLoading(false); });
  }, [y, m, activity, place, reload]); // eslint-disable-line

  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1).getDay(); // 0=Sun
    const total = new Date(y, m, 0).getDate();
    const arr: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= total; d++) arr.push(d);
    return arr;
  }, [y, m]);

  const prev = () => { if (m === 1) { setY(y - 1); setM(12); } else setM(m - 1); };
  const next = () => { if (m === 12) { setY(y + 1); setM(1); } else setM(m + 1); };
  // Every activity now carries a real per-day quality (how many usable windows
  // the day has once Rahu Kaal and friends are excluded), so the calendar is
  // informative for all of them — not just marriage, where it used to be the
  // only case with any day-to-day variation.
  const QUALITY_TINT: Record<string, string> = {
    best: "#34D399",
    good: "#A3E635",
    ok: "#E8B44A",
    avoid: "#F87171",
  };

  return (
    <div className="m-card w-full p-4">
      <div className="mb-2 flex items-center justify-between">
        <Pressable onClick={prev} aria-label="Previous month" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground">
          <ChevronLeft className="h-[18px] w-[18px]" />
        </Pressable>
        <span className="text-[14px] font-bold">{MONTHS[m - 1]} {y}{loading ? " …" : ""}</span>
        <Pressable onClick={next} aria-label="Next month" className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground">
          <ChevronRight className="h-[18px] w-[18px]" />
        </Pressable>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {WD.map((w) => <div key={w} className="py-1 text-[10px] font-bold text-muted-foreground">{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const date = iso(y, m, d);
          const selected = date === value;
          const info = days[date];
          const tint = info ? QUALITY_TINT[info.quality] : null;
          return (
            <Pressable
              key={i}
              subtle
              feedback="select"
              onClick={() => onChange(date)}
              aria-label={info ? `${d} — ${info.tithi}, ${info.nakshatra}, ${info.windows} good windows` : String(d)}
              className={`relative grid h-14 place-items-center rounded-xl leading-none ${selected ? "bg-accent font-bold text-accent-foreground" : "text-foreground"}`}
            >
              <span className="text-[14px]">{d}</span>
              {/* Tithi is what makes this a Hindu calendar rather than a date
                  grid — abbreviated to fit, full text is in the aria-label. */}
              {info?.tithi && (
                <span className={`mt-0.5 block max-w-full truncate px-0.5 text-[8.5px] ${selected ? "opacity-80" : "text-muted-foreground"}`}>
                  {info.tithi.replace("Shukla ", "S ").replace("Krishna ", "K ")}
                </span>
              )}
              {tint && (
                <span
                  className="absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                  style={{ background: selected ? "currentColor" : tint }}
                />
              )}
            </Pressable>
          );
        })}
      </div>
      {failed && (
        <button
          type="button"
          onClick={() => setReload((n) => n + 1)}
          className="mt-3 w-full rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-left text-[11.5px] leading-relaxed text-amber-300"
        >
          Couldn&apos;t load this month — an empty grid here doesn&apos;t mean there are no
          good dates. Tap to retry.
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px] text-muted-foreground">
        {(["best", "good", "ok", "avoid"] as const).map((q) => (
          <span key={q} className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: QUALITY_TINT[q] }} />
            {q === "best" ? "many good windows" : q === "avoid" ? `not a ${activity} day` : `${q}`}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground">
        S = Shukla paksha, K = Krishna paksha. Windows exclude Rahu Kaal, Yamaganda and Gulika.
      </p>
    </div>
  );
}
