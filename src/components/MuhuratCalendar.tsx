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
  const [days, setDays] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    const id = ++reqRef.current;
    setLoading(true);
    fetch(`/api/muhurat-month?year=${y}&month=${m}&lat=${place.latitude}&lon=${place.longitude}&tz=${encodeURIComponent(place.timezone)}&activity=${activity}`)
      .then((r) => r.json())
      .then((j) => {
        if (id !== reqRef.current || !j.days) return;
        const map: Record<string, boolean> = {};
        j.days.forEach((d: any) => { map[d.date] = d.suitable; });
        setDays(map);
      }).catch(() => {}).finally(() => { if (id === reqRef.current) setLoading(false); });
  }, [y, m, activity, place]); // eslint-disable-line

  const cells = useMemo(() => {
    const first = new Date(y, m - 1, 1).getDay(); // 0=Sun
    const total = new Date(y, m, 0).getDate();
    const arr: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= total; d++) arr.push(d);
    return arr;
  }, [y, m]);

  const prev = () => { if (m === 1) { setY(y - 1); setM(12); } else setM(m - 1); };
  const next = () => { if (m === 12) { setY(y + 1); setM(1); } else setM(m + 1); };
  const markDots = activity === "marriage"; // only marriage has restricted days worth marking

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
          const suitable = days[date];
          return (
            <Pressable
              key={i}
              subtle
              feedback="select"
              onClick={() => onChange(date)}
              className={`relative grid h-11 place-items-center rounded-xl text-[14px] ${selected ? "bg-accent font-bold text-accent-foreground" : "text-foreground"}`}
            >
              {d}
              {markDots && suitable && (
                <span
                  className="absolute bottom-1.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full"
                  style={{ background: selected ? "currentColor" : "#34D399" }}
                />
              )}
            </Pressable>
          );
        })}
      </div>
      {markDots && (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#34D399" }} /> green dot = auspicious {activity} day
        </p>
      )}
    </div>
  );
}
