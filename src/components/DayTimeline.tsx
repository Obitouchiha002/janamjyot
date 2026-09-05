import { Sun, Moon } from "lucide-react";
import { useCachedFetch } from "@/lib/useCachedFetch";
import { getLang } from "@/lib/prefs";

/**
 * "Aaj ka poora din" — the whole-day, time-ordered reading.
 *
 * Deterministic (no AI): a warm 3-4 line summary of how the day goes, then the
 * day laid out block by block (each real choghadiya window with a plain note),
 * with the block you're in RIGHT NOW marked "abhi". Same calculation the morning
 * / night / Rahu-Kaal notifications carry, so the app and the buzz never differ.
 * Backed by /api/chart/:id/day-plan.
 */

type Plan = {
  date: string;
  name?: string | null;
  lean?: string;
  summary: string[];
  timeline: Array<{ name: string; start: string; end: string; kind: "good" | "careful" | "neutral"; note: string }>;
  nightRecap: string;
};

const DOT = { good: "#22C55E", careful: "#F0A93B", neutral: "#9AA0AC" } as const;

/** "H:MM AM/PM" → minutes since midnight (for the "abhi" marker). */
function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)?/i.exec((hhmm || "").trim());
  if (!m) return null;
  let h = Number(m[1]);
  const ap = (m[3] || "").toUpperCase();
  if (ap === "PM" && h < 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

export default function DayTimeline({ chartId }: { chartId: string }) {
  const lang = getLang();
  const { data } = useCachedFetch<Plan>(`/api/chart/${chartId}/day-plan?lang=${encodeURIComponent(lang)}`);

  if (!data) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-[110px]" />
        <div className="skeleton h-[220px]" />
      </div>
    );
  }

  const nowM = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();
  const label = { en: "Your whole day", hi: "आपका पूरा दिन", hinglish: "Aapka poora din" }[lang] || "Your whole day";

  return (
    <div className="space-y-4">
      {/* Warm summary — the same lines the morning notification carries. */}
      <section className="m-card m-enter overflow-hidden">
        <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2.5">
          <Sun className="h-4 w-4 text-accent" />
          <p className="text-[11px] font-bold uppercase tracking-widest text-accent">{label}</p>
        </div>
        <div className="space-y-1.5 px-4 py-3.5">
          {data.summary.map((line, i) => (
            <p key={i} className={`text-[14px] leading-relaxed ${i === 0 ? "font-semibold" : "text-muted-foreground"}`}>{line}</p>
          ))}
        </div>
      </section>

      {/* Time-blocked day. The block containing "now" is lifted and marked. */}
      <section className="m-card m-enter overflow-hidden" style={{ animationDelay: "0.04s" }}>
        <ul className="divide-y divide-border/50">
          {data.timeline.map((b, i) => {
            const s = toMin(b.start), e = toMin(b.end);
            const isNow = s != null && e != null && nowM >= s && nowM < e;
            return (
              <li key={i} className={`flex gap-3 px-4 py-3 ${isNow ? "bg-accent/[0.06]" : ""}`}>
                <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOT[b.kind] }} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[12.5px] font-bold">
                    <span className="tabular-nums text-muted-foreground">{b.start}–{b.end}</span>
                    <span>{b.name}</span>
                    {isNow && <span className="rounded-full bg-accent px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-accent-foreground">Abhi</span>}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{b.note}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Night recap — a quiet close. */}
      {data.nightRecap && (
        <section className="m-enter flex items-start gap-2.5 rounded-2xl border border-border/70 bg-muted/40 px-4 py-3" style={{ animationDelay: "0.08s" }}>
          <Moon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">{data.nightRecap}</p>
        </section>
      )}
    </div>
  );
}
