import { useEffect, useState } from "react";
import { ChevronDown, Sparkles, Sun, TriangleAlert, Info } from "lucide-react";
import { getLang } from "@/lib/prefs";
import { haptic } from "@/lib/native";

/**
 * The home-screen daily line — one clear sentence about today, with the real
 * astrology tucked under "Reason".
 *
 * It reads from /day-signals, which is deterministic and has NO AI, so this
 * loads instantly and says the same thing all day (the notification the user
 * got at 8 AM and this banner are the same message). The tone — and the
 * colour — follow the day's severity: a heavy day is amber/plain, a clear day
 * is green, an ordinary day is quiet gold.
 *
 * Every line under "Reason" is a genuine placement (Moon house, Sade Sati,
 * dasha, the day's windows), never an AI sentence — that is the promise the
 * expander keeps: readable on top, verifiable underneath.
 */

type Factor = { code: string; kind: "good" | "careful" | "neutral"; title: string; detail: string };
type Signals = {
  headline: string;
  lean: "good" | "mixed" | "careful";
  severity: 0 | 1 | 2 | 3;
  tone: "good" | "advice" | "warn";
  factors: Factor[];
  best_time: { name: string; start: string; end: string } | null;
  caution_time: { name: string; start: string; end: string } | null;
};

const TONE = {
  warn:   { tint: "#F0A93B", Icon: TriangleAlert, label: "Aaj sambhal ke" },
  advice: { tint: "#C9A24B", Icon: Info,          label: "Aaj ka din" },
  good:   { tint: "#22C55E", Icon: Sun,           label: "Aaj ka din" },
} as const;

const DOT = { good: "#22C55E", careful: "#F0A93B", neutral: "#8C93A4" } as const;

export default function DayBanner({ chartId }: { chartId: string }) {
  const [d, setD] = useState<Signals | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/chart/${chartId}/day-signals?lang=${encodeURIComponent(getLang())}`)
      .then((r) => r.json())
      .then((j) => { if (alive && !j.error) setD(j); })
      .catch(() => { /* banner just doesn't show */ });
    return () => { alive = false; };
  }, [chartId]);

  if (!d) return null;
  const t = TONE[d.tone];
  const { Icon } = t;

  return (
    <section
      className="m-card m-enter overflow-hidden"
      style={{ borderColor: `${t.tint}55`, background: `linear-gradient(180deg, ${t.tint}14, transparent 70%)` }}
    >
      <div className="flex items-start gap-3.5 p-4">
        <span
          className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{ background: `${t.tint}22`, color: t.tint }}
        >
          <Icon className="h-[22px] w-[22px]" strokeWidth={2.1} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: t.tint }}>
            {t.label}
          </p>
          <p className="mt-1 text-[15.5px] font-semibold leading-snug">{d.headline}</p>

          {/* quick time chips — the two windows people actually act on */}
          {(d.best_time || d.caution_time) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {d.best_time && (
                <span className="rounded-full bg-[#22C55E1f] px-2.5 py-1 text-[11px] font-semibold text-[#1f9d52]">
                  ✓ {d.best_time.start}–{d.best_time.end}
                </span>
              )}
              {d.caution_time && (
                <span className="rounded-full bg-[#F0A93B1f] px-2.5 py-1 text-[11px] font-semibold text-[#b9791a]">
                  {d.caution_time.name} {d.caution_time.start}–{d.caution_time.end}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Reason — collapsed by default. Technical astrology lives here, not up top. */}
      <button
        type="button"
        onClick={() => { haptic.tap(); setOpen((o) => !o); }}
        className="flex w-full items-center justify-center gap-1 border-t border-border/70 py-2.5 text-[12px] font-bold text-muted-foreground"
      >
        Reason
        <ChevronDown className={`h-[15px] w-[15px] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-border/70 px-4 py-3.5">
          {d.factors.map((f) => (
            <div key={f.code} className="flex gap-2.5">
              <span
                className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                style={{ background: DOT[f.kind] }}
              />
              <div className="min-w-0">
                <p className="text-[12.5px] font-bold leading-tight">{f.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{f.detail}</p>
              </div>
            </div>
          ))}
          <p className="pt-1 text-[10.5px] leading-relaxed text-muted-foreground/70">
            Aapki janam kundli ke aaj ke gochar se — sab calculated, koi tuki nahi.
          </p>
        </div>
      )}
    </section>
  );
}
