import { useState } from "react";
import { Sun, Sparkles, Moon, Clock, CalendarDays, ChevronDown } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { getLang } from "@/lib/prefs";

/** "Aaj Ka Din" — a compact card that expands on click to show a personalised
 *  daily snapshot. Data (and the AI tip) load only when first opened. */
export default function TodayCard({ chartId, lang = getLang() }: { chartId?: string; lang?: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !d && chartId && !loading) {
      setLoading(true);
      fetch(`/api/chart/${chartId}/today`).then((r) => r.json())
        .then((j) => { if (!j.error) setD(j); }).catch(() => {}).finally(() => setLoading(false));
    }
  };

  const chip = (icon: any, label: string, value: string) => {
    const Icon = icon;
    return value ? (
      <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
        <Icon className="w-4 h-4 text-amber-300 shrink-0" />
        <div className="min-w-0"><p className="text-[10px] uppercase tracking-wider text-white/60">{label}</p><p className="font-semibold text-sm truncate text-white">{value}</p></div>
      </div>
    ) : null;
  };
  const ord = (n: number | null) => (n ? `${n}th house` : "");

  return (
    <div className="rounded-2xl text-white shadow-lg overflow-hidden" style={{ background: "linear-gradient(135deg,#1E293B,#0f172a)" }}>
      {/* compact header — click to expand */}
      <button onClick={toggle} className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-white/5 transition-colors">
        <span className="flex items-center gap-2 font-bold"><Sun className="w-5 h-5 text-amber-300" /> Today</span>
        <span className="flex items-center gap-3 text-white/60 text-xs">
          {!open && <span className="hidden sm:inline">tap for today's guidance</span>}
          <ChevronDown className={`w-5 h-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {open && (
        <div className="px-5 pb-5 animate-in fade-in">
          {loading && !d && <p className="text-sm text-white/60 py-2 flex items-center gap-2"><Sun className="w-4 h-4 animate-spin" /> Loading…</p>}
          {d && (
            <div className="space-y-4">
              <p className="text-xs text-white/60 flex items-center gap-1"><CalendarDays className="w-3.5 h-3.5" /> {d.panchang?.weekday ? `${d.panchang.weekday}, ` : ""}{d.date}</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {chip(Sparkles, "Dasha", d.dasha ? `${d.dasha.mahadasha}-${d.dasha.antardasha}` : "")}
                {chip(Moon, "Moon transit", d.moon_transit ? `${d.moon_transit.sign} · ${ord(d.moon_transit.house_from_lagna)}` : "")}
                {chip(CalendarDays, "Tithi / Nakshatra", d.panchang ? `${d.panchang.tithi.replace(/^(Shukla|Krishna) /, "")} · ${d.panchang.nakshatra}` : "")}
                {chip(Clock, "Rahu Kaal", d.panchang?.rahu_kaal ? `${d.panchang.rahu_kaal.start}–${d.panchang.rahu_kaal.end}` : "")}
              </div>

              {d.transit_highlights?.length > 0 && (
                <ul className="space-y-1.5">
                  {d.transit_highlights.slice(0, 2).map((h: string, i: number) => (
                    <li key={i} className="text-sm text-white/85 flex gap-2"><span className="text-amber-300 mt-0.5">•</span><span>{h}</span></li>
                  ))}
                </ul>
              )}

              {d.tip && (
                <div className="rounded-2xl bg-white/5 border border-amber-300/25 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] uppercase tracking-widest font-bold text-amber-300">Today's guidance</p>
                    <SpeakButton text={d.tip} lang={lang} className="text-amber-200 hover:text-amber-100" />
                  </div>
                  {/* force light text on the dark card */}
                  <div className="[&_p]:text-white/90 [&_li]:text-white/90 [&_h4]:text-amber-300 [&_strong]:text-amber-200 [&_strong]:font-bold">
                    <AnswerText text={d.tip} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
