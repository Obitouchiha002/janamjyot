/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Self-contained rules — no JanamJyot module is changed by this file. */
/**
 * The "what is actually going on" block for the Life Report — computed, never AI-written.
 *
 * The report read general ("wahan bhi report ab general thi"), because every one of its
 * seven sections was written by the model from the raw chart, with nothing telling it what
 * this particular chart is shouting about. The chat already solved that with two rule-based
 * engines, so the report now opens with the same computed material:
 *   - server/highlights.ts — the live problems and strengths, ranked, each with the date the
 *     running phase ends ("kab tak"),
 *   - server/psyche.ts — how this person thinks, decides and trips themselves up.
 *
 * Nothing here is generated, so nothing here can be invented. The same block is also handed
 * to the report prompt per category (see highlightsFor), so a section's "caution" names the
 * real problem instead of generic advice.
 */
import { chartHighlights, type Highlight, type Theme } from "./highlights";
import { psychePatterns } from "./psyche";
import { computeChartFacts, chartFactsForAI } from "./chartFacts";

export interface KeyPoint {
  says: string;
  because: string;
  /** When the running phase ends — the honest answer to "ye kab tak rahega". */
  until?: string | null;
  /** The long backdrop behind it, when a mahadasha is the driver. */
  background_until?: string | null;
  /** Live right now (the running dasha touches it), rather than a lifelong tendency. */
  active_now: boolean;
  theme: Theme;
}
export interface KeyPattern {
  pattern: string;
  shows_up_as: string;
  gift: string;
  because: string;
}
export interface ReportKeyPoints {
  problems: KeyPoint[];
  strengths: KeyPoint[];
  patterns: KeyPattern[];
}

const asPoint = (h: Highlight): KeyPoint => ({
  says: h.says,
  because: h.because,
  until: h.until ?? null,
  background_until: h.background_until ?? null,
  active_now: h.active_now,
  theme: h.theme,
});

/** Everything the report's opening block shows, computed from the chart alone. */
export function reportKeyPoints(chart: any, nowMs = Date.now()): ReportKeyPoints | null {
  try {
    const ayanamsa = Number(process.env.PROKERALA_AYANAMSA) || 1;
    const raw = computeChartFacts(chart, ayanamsa, nowMs);
    if (!raw) return null;
    const facts = chartFactsForAI(raw);
    const highlights = chartHighlights(chart, facts, nowMs) ?? [];
    return {
      problems: highlights.filter((h) => h.kind === "problem").slice(0, 3).map(asPoint),
      strengths: highlights.filter((h) => h.kind === "strength").slice(0, 3).map(asPoint),
      patterns: (psychePatterns(chart, facts) ?? []).slice(0, 3).map((p) => ({
        pattern: p.pattern,
        shows_up_as: p.shows_up_as,
        gift: p.gift,
        because: p.because,
      })),
    };
  } catch (e: any) {
    console.warn("[report] key points skipped:", e?.message);
    return null;
  }
}

/** Which report section each highlight theme belongs to. */
const THEME_SECTIONS: Record<Theme, string[]> = {
  love: ["relationships", "marriage"],
  marriage: ["marriage", "relationships"],
  studies: ["career"],
  career: ["career", "business"],
  money: ["wealth", "business"],
  debt: ["wealth"],
  health: ["health"],
  family: ["relationships"],
  foreign: ["travel"],
  mind: ["health", "relationships"],
  spiritual: ["health"],
  strength: ["career", "wealth", "business"],
};

/**
 * The computed problems and strengths that belong to each of these report sections, so the
 * section's own "caution"/"positive" can be required to name them.
 */
export function highlightsFor(
  chart: any,
  categories: readonly string[],
  nowMs = Date.now()
): Record<string, { problems: KeyPoint[]; strengths: KeyPoint[] }> | null {
  try {
    const ayanamsa = Number(process.env.PROKERALA_AYANAMSA) || 1;
    const raw = computeChartFacts(chart, ayanamsa, nowMs);
    if (!raw) return null;
    const highlights = chartHighlights(chart, chartFactsForAI(raw), nowMs) ?? [];
    const out: Record<string, { problems: KeyPoint[]; strengths: KeyPoint[] }> = {};
    for (const cat of categories) {
      const mine = highlights.filter((h) => (THEME_SECTIONS[h.theme] ?? []).includes(cat));
      if (!mine.length) continue;
      out[cat] = {
        problems: mine.filter((h) => h.kind === "problem").slice(0, 3).map(asPoint),
        strengths: mine.filter((h) => h.kind === "strength").slice(0, 2).map(asPoint),
      };
    }
    return Object.keys(out).length ? out : null;
  } catch (e: any) {
    console.warn("[report] section highlights skipped:", e?.message);
    return null;
  }
}
