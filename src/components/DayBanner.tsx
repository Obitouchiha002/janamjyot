import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Sun, TriangleAlert, Info, Clock } from "lucide-react";
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
/**
 * Two colours per tone: `tint` for the small marks, `ink` for anything sitting
 * on the card. The old card tinted its whole body amber and then dropped a pure
 * white strip into the middle of it — two different surfaces fighting inside
 * one card, which is what made it feel cheap. The card is one surface now and
 * colour is used sparingly, on the things that carry meaning.
 *
 * `ink` values are the darker cousins of the tints, chosen so text on white
 * clears WCAG AA. The amber that reads fine as a 2px rail is unreadable as
 * 13px type, which is why they are not the same value.
 */
const TONE = {
  warn:   { tint: "#F0A93B", ink: "#A16207", Icon: TriangleAlert },
  advice: { tint: "#C9A24B", ink: "#8A6D1F", Icon: Info },
  good:   { tint: "#22C55E", ink: "#15803D", Icon: Sun },
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
      <section className="m-card p-4">
        <div className="space-y-2.5">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-2/3" />
          <div className="skeleton mt-1 h-12 w-full rounded-xl" />
        </div>
      </section>
    ) : null;
  }
  // An unknown tone must not take Home down with it — Home is the chat's
  // front door now. Fall back to the neutral look.
  const t = TONE[d.tone as keyof typeof TONE] ?? TONE.advice;
  const { Icon } = t;

  return (
    <motion.section
      className="m-card relative overflow-hidden"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* The tone, as a hairline rail rather than a wash over everything. A
          whole card shaded amber reads as an error state; a rail says "this is
          the careful kind of day" without shouting it. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: `linear-gradient(180deg, ${t.tint}, ${t.tint}22)` }}
      />

      <div className="px-4 pb-3.5 pt-3.5 pl-[19px]">
        <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.11em]" style={{ color: t.ink }}>
          <Icon className="h-[13px] w-[13px]" strokeWidth={2.4} />
          {d.label}
        </p>
        {/* Full-strength foreground: the sentence is the point of the card, and
            it was previously competing with an amber wash behind it. */}
        <p className="mt-1.5 text-[15.5px] font-semibold leading-[1.5] text-foreground">{d.headline}</p>
      </div>

      {/* The two windows people act on. One soft surface, hairline between, and
          colour only on the numbers — so the row belongs to the card instead of
          punching a white hole through it. */}
      {(d.best_time || d.caution_time) && (
        <div className="mx-4 mb-3.5 ml-[19px] grid grid-cols-2 overflow-hidden rounded-xl bg-muted/70">
          {d.best_time && (
            <div className="px-3.5 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-[11px] w-[11px]" /> {BEST_LABEL[lang] || BEST_LABEL.en}
              </p>
              <p className="mt-1 text-[13.5px] font-bold tabular-nums" style={{ color: "#15803D" }}>
                {d.best_time.start}–{d.best_time.end}
              </p>
            </div>
          )}
          {d.caution_time && (
            <div className={`px-3.5 py-2.5 ${d.best_time ? "border-l border-border/60" : ""}`}>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {d.caution_time.name}
              </p>
              <p className="mt-1 text-[13.5px] font-bold tabular-nums" style={{ color: "#A16207" }}>
                {d.caution_time.start}–{d.caution_time.end}
              </p>
            </div>
          )}
        </div>
      )}

      {/* A quiet inline link, not the full-width bar that looked like the card's
          main action when it is really a footnote. */}
      <button
        type="button"
        onClick={() => { haptic.tap(); setOpen((o) => !o); }}
        className="mb-3 ml-[19px] flex items-center gap-1 rounded-full px-1 py-0.5 text-[11.5px] font-semibold text-muted-foreground"
      >
        {WHY_LABEL[lang] || WHY_LABEL.en}
        <ChevronDown className={`h-[13px] w-[13px] transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Height is animated so the card grows instead of jumping — the same
          spring the rest of the app uses. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="why"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-2.5 border-t border-border/70 px-4 py-3.5 pl-[19px]">
              {d.factors.map((f) => (
                <div key={f.code} className="flex gap-2.5">
                  <span className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: DOT[f.kind] }} />
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
