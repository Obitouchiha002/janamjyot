import { useState } from "react";
import { ChevronDown, Sun, TriangleAlert, Info } from "lucide-react";
import { getLang } from "@/lib/prefs";
import { haptic } from "@/lib/native";
import { useCachedFetch } from "@/lib/useCachedFetch";

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
  label: string;
  lean: "good" | "mixed" | "careful";
  severity: 0 | 1 | 2 | 3;
  tone: "good" | "advice" | "warn";
  factors: Factor[];
  best_time: { name: string; start: string; end: string } | null;
  caution_time: { name: string; start: string; end: string } | null;
};

// Colour + icon only — the LABEL text now comes from the engine (localized),
// so a Hindi user never sees a Hinglish eyebrow over an English line again.
const TONE = {
  warn:   { tint: "#F0A93B", Icon: TriangleAlert },
  advice: { tint: "#C9A24B", Icon: Info },
  good:   { tint: "#22C55E", Icon: Sun },
} as const;

const BEST_LABEL: Record<string, string> = {
  en: "Best time", hi: "सबसे अच्छा समय", hinglish: "Sabse accha samay",
};
const WHY_LABEL: Record<string, string> = {
  en: "Why this?", hi: "ऐसा क्यों?", hinglish: "Aisa kyun?",
};

const DOT = { good: "#22C55E", careful: "#F0A93B", neutral: "#8C93A4" } as const;

// The "all calculated, nothing guessed" footer follows the selected language —
// an English day should not end on a Hinglish disclaimer (that mix read as sloppy).
const CALC_NOTE: Record<string, string> = {
  en: "From your birth chart's transits for today — all calculated, nothing guessed.",
  hi: "आपकी जन्म कुंडली के आज के गोचर से — सब गणना से, कोई तुक्का नहीं।",
  hinglish: "Aapki janam kundli ke aaj ke gochar se — sab calculated, koi tuki nahi.",
};

export default function DayBanner({ chartId }: { chartId: string }) {
  const [open, setOpen] = useState(false);
  const lang = getLang();
  // Stale-while-revalidate: shows the last-known day instantly, refreshes quietly.
  const { data: d, loading } = useCachedFetch<Signals>(
    `/api/chart/${chartId}/day-signals?lang=${encodeURIComponent(lang)}`,
  );

  // First-ever load with nothing cached: a shaped skeleton, not a blank gap, so
  // the home screen never looks half-built.
  if (!d) {
    return loading ? (
      <section className="m-card m-enter p-4">
        <div className="flex items-start gap-3.5">
          <div className="skeleton h-11 w-11 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        </div>
      </section>
    ) : null;
  }
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
            {d.label}
          </p>
          <p className="mt-1 text-[15px] font-semibold leading-[1.45]">{d.headline}</p>

        </div>
      </div>

      {/* The two windows people actually act on. Loose pills said a time without
          saying what it was for, and one of them repeated the sentence above;
          a labelled pair reads at a glance and survives long Hindi labels. */}
      {(d.best_time || d.caution_time) && (
        <div className="grid grid-cols-2 gap-px border-t border-border/70 bg-border/70">
          {d.best_time && (
            <div className="bg-card px-4 py-2.5">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                {BEST_LABEL[lang] || BEST_LABEL.en}
              </p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums" style={{ color: "#1f9d52" }}>
                {d.best_time.start}–{d.best_time.end}
              </p>
            </div>
          )}
          {d.caution_time && (
            <div className="bg-card px-4 py-2.5">
              <p className="truncate text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                {d.caution_time.name}
              </p>
              <p className="mt-0.5 text-[13px] font-bold tabular-nums" style={{ color: "#b9791a" }}>
                {d.caution_time.start}–{d.caution_time.end}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Reason — collapsed by default. Technical astrology lives here, not up top. */}
      <button
        type="button"
        onClick={() => { haptic.tap(); setOpen((o) => !o); }}
        className="flex w-full items-center justify-center gap-1 border-t border-border/70 py-2 text-[11.5px] font-semibold text-muted-foreground/80"
      >
        {WHY_LABEL[lang] || WHY_LABEL.en}
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
            {CALC_NOTE[lang] || CALC_NOTE.en}
          </p>
        </div>
      )}
    </section>
  );
}
