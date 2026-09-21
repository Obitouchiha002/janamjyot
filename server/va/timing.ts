/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * Event timing engine: "kab hoga?" (when will it happen?), computed deterministically.
 *
 * The chat used to let the AI guess a year, so the same question gave a different
 * date on every ask (seen live: "Shaadi kab hogi?" came back as 2027-28, 2028-30
 * and 2030-33). Here the window is CALCULATED from the chart, so it is identical
 * every time and backed by stated reasons.
 *
 * Method (classical Parashari + KP significators):
 *   1. Each graha signifies the houses it SITS in and RULES. It also signifies,
 *      through its nakshatra lord, the houses that lord sits in and rules (KP: a
 *      planet gives the results of its star lord). Rahu and Ketu act for their
 *      dispositor.
 *   2. Every event has main houses, supporting houses and denying houses. For
 *      marriage: main 7; support 2, 11; deny 1, 6, 10. It also has natural
 *      karakas (Venus for marriage, Jupiter for children, and so on).
 *   3. Every Antardasha in the next 12 years is scored from its Mahadasha and
 *      Antardasha lords (the Antardasha weighs most). Bonuses: Jupiter's transit
 *      on the main house, and Jupiter + Saturn together (the "double
 *      transit"). Inside each one, the best Pratyantar (with transits) gives the
 *      peak months.
 *   4. The EARLIEST Antardasha scoring within 80% of the best is the "most
 *      likely" answer. The next two strongest are the alternatives.
 */
import { computeTransits } from "../engine";
import { SIGNS, NAKSHATRAS } from "../normalize";
import { HOUSE_AREAS } from "./today";

const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
const VIM_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
const VIM_YEARS: Record<string, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HORIZON_YEARS = 12;

export type TimingTopic =
  | "marriage" | "relationship" | "career" | "wealth" | "property"
  | "children" | "foreign" | "business" | "education" | "health";

interface TopicRule {
  label: string;
  primary: number[];
  support: number[];
  negative: number[];
  karakas: string[];
  minAge: number;
  /** health: windows are "sensitive periods to be careful", not an event to wait for. */
  adverse?: boolean;
}

const TOPICS: Record<TimingTopic, TopicRule> = {
  marriage: { label: "marriage", primary: [7], support: [2, 11], negative: [1, 6, 10], karakas: ["Venus"], minAge: 20 },
  relationship: { label: "love / a new relationship", primary: [5], support: [7, 11], negative: [6, 10], karakas: ["Venus", "Moon"], minAge: 16 },
  career: { label: "job / career growth", primary: [10], support: [6, 11, 2], negative: [5, 8, 12], karakas: ["Sun", "Saturn"], minAge: 18 },
  wealth: { label: "money gains", primary: [11, 2], support: [9, 5, 10], negative: [12, 8], karakas: ["Jupiter"], minAge: 18 },
  property: { label: "property / home / vehicle", primary: [4], support: [11, 2], negative: [3, 12], karakas: ["Mars", "Venus"], minAge: 21 },
  children: { label: "a child", primary: [5], support: [2, 11], negative: [1, 4, 10], karakas: ["Jupiter"], minAge: 21 },
  foreign: { label: "foreign travel / settling abroad", primary: [12], support: [9, 3, 7], negative: [4], karakas: ["Rahu"], minAge: 16 },
  business: { label: "business growth", primary: [7, 10], support: [11, 2], negative: [8, 12], karakas: ["Mercury"], minAge: 18 },
  education: { label: "studies / exams / higher education", primary: [4, 5], support: [9, 11], negative: [3, 8, 12], karakas: ["Mercury", "Jupiter"], minAge: 0 },
  health: { label: "health", primary: [6, 8], support: [12, 1], negative: [5, 11], karakas: [], minAge: 0, adverse: true },
};

// Keyword detection. Specific topics (children, property) are checked BEFORE the broad
// chat category, because "ghar kab lunga" would otherwise land in wealth.
// Short words carry spaces so they don't fire inside other words: live, "mere upr loan"
// matched "pr " (foreign) and "is person" matched "son " (children). Common misspellings
// are listed, and long keywords also match with 1-2 typos (see fuzzyHit): live, "buines"
// and "buiesn" found no topic, so no business window was calculated.
const TOPIC_WORDS: Array<[TimingTopic, string[]]> = [
  ["children", ["bachch", "bacch", "baby", "santan", "santaan", "child", "kids", "aulad", "aulaad", "pregnan", "putra", " son ", "daughter"]],
  ["property", ["property", "ghar ", "ghar kab", "makaan", "makan", "flat", "plot", "zameen", " land ", "gaadi", "gadi", "car ", "vehicle", "house", " bike", "biek", "scooty"]],
  ["marriage", ["marriage", "shaadi", "shadi", "shaddi", "saadi", "vivah", "vivaah", "wedding", "spouse", "wife", "husband", "patni", " pati "]],
  ["relationship", ["love", "pyaar", "pyar", "girlfriend", "boyfriend", " gf ", " bf ", "relationship", "crush", "affair"]],
  ["foreign", ["foreign", "abroad", "videsh", "overseas", "visa", "settle", " pr ", "canada", " usa ", " uk ", "australia", "dubai"]],
  ["business", ["business", "busines", "buisness", "bussiness", "buines", "buiesn", "biznes", "bizness", "bijnes", "vyapar", "vyaapar", "vyavsay", "startup", "dhandha", "dhanda", "venture", "shop", "dukaan", " deal", "client"]],
  ["career", ["job", "naukri", "naukari", "nokri", "noukri", "career", "carrer", "carier", "carreer", "promotion", "salary", "increment", "govt job", "sarkari", "transfer", "interview"]],
  ["education", ["padhai", "study", "exam", "degree", "college", "admission", "result", "education", "course", "neet", "jee", "upsc"]],
  ["wealth", ["paisa", "paise", "pesa", "money", " dhan ", "dhanlabh", "wealth", "income", "rich", " amir", " amer ", "ameer", "savings", "loan", "karz", "karj", "karza", "debt", "udhaar", "udhar", "financ", "kamai", "kamaai", "earning", "aamdani", "amdani"]],
  ["health", ["health", "sehat", "bimari", "beemari", "illness", "disease", "surgery", "operation", "hospital"]],
];

// Words one or two typos away from a long keyword that mean something else.
const FUZZY_STOP = new Set(["properly", "prosperity", "carriage", "oversees"]);
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
/** A word of 6+ letters within 2 edits of a keyword of 8+ letters ("buisness", "marrige"). */
function fuzzyHit(words: string[], keywords: string[]) {
  const long = keywords.filter((k) => /^[a-z]{8,}$/.test(k));
  return words.some((w) => w.length >= 6 && !FUZZY_STOP.has(w) && long.some((k) => editDistance(w, k) <= 2));
}

const CATEGORY_TO_TOPIC: Record<string, TimingTopic | undefined> = {
  career: "career", wealth: "wealth", health: "health", marriage: "marriage", relationship: "relationship",
  business: "business", foreign: "foreign", education: "education",
};

export function detectTimingTopic(text: string, category?: string): TimingTopic | null {
  return detectTimingTopics(text, category)[0] ?? null;
}

/** Every topic a question touches, in priority order. Live, "shaadi kab, gaadi kab, amir
 *  kab banunga, ghar kab" computed only the first (property), so the marriage and money
 *  dates in the reply were guessed. */
export function detectTimingTopics(text: string, category?: string): TimingTopic[] {
  const lower = text.toLowerCase();
  const q = ` ${lower.replace(/[?!.,;:()"'\n]/g, " ")} `;
  const words = lower.split(/[^a-z]+/).filter(Boolean);
  const found = TOPIC_WORDS.filter(([, kws]) => kws.some((w) => q.includes(w)) || fuzzyHit(words, kws)).map(([t]) => t);
  if (found.length) return found;
  const c = category && CATEGORY_TO_TOPIC[category];
  return c ? [c] : [];
}

const ord = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const monthLabel = (ms: number) => { const d = new Date(ms); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

// ---- significators ------------------------------------------------------------
interface Sig { weight: Map<number, number>; how: Map<number, string[]> }

function buildSignificators(chart: any) {
  const planets: any[] = chart?.planet_positions ?? chart?.planets ?? [];
  const lagnaSign: string = chart?.d1_chart?.ascendant_sign || chart?.ascendant?.sign || chart?.summary?.lagna || "";
  const lagnaIdx = SIGNS.indexOf(lagnaSign);
  const byName = new Map<string, any>(planets.map((p) => [p.planet ?? p.name, p]));
  const occ = (name: string): number | null => byName.get(name)?.house ?? null;
  const owns = (name: string): number[] => {
    if (lagnaIdx < 0) return [];
    const out: number[] = [];
    for (let h = 1; h <= 12; h++) if (SIGN_LORDS[(lagnaIdx + h - 1) % 12] === name) out.push(h);
    return out;
  };
  const starLord = (name: string): string | null => {
    const nk = byName.get(name)?.nakshatra;
    const i = NAKSHATRAS.indexOf(nk);
    return i >= 0 ? VIM_ORDER[i % 9] : null;
  };
  const dispositor = (name: string): string | null => {
    const si = SIGNS.indexOf(byName.get(name)?.sign);
    return si >= 0 ? SIGN_LORDS[si] : null;
  };

  const sigs = new Map<string, Sig>();
  for (const name of VIM_ORDER) {
    const sig: Sig = { weight: new Map(), how: new Map() };
    const add = (h: number | null, w: number, why: string) => {
      if (!h) return;
      sig.weight.set(h, Math.min(2, (sig.weight.get(h) ?? 0) + w));
      sig.how.set(h, [...(sig.how.get(h) ?? []), why]);
    };
    add(occ(name), 1, `sits in it`);
    for (const h of owns(name)) add(h, 1, `rules it`);
    if (name === "Rahu" || name === "Ketu") {
      const d = dispositor(name);
      if (d) {
        add(occ(d), 0.75, `acts for its sign lord ${d}, which sits there`);
        for (const h of owns(d)) add(h, 0.75, `acts for its sign lord ${d}, which rules it`);
      }
    }
    const s = starLord(name);
    if (s && s !== name) {
      add(occ(s), 0.75, `works through its nakshatra lord ${s}, which sits there`);
      for (const h of owns(s)) add(h, 0.75, `works through its nakshatra lord ${s}, which rules it`);
    }
    sigs.set(name, sig);
  }
  return { sigs, lagnaIdx, byName };
}

function lordScore(name: string, sig: Sig | undefined, rule: TopicRule) {
  if (!sig) return { score: 0, reasons: [] as string[] };
  let score = 0;
  const reasons: string[] = [];
  const cite = (h: number) => `${name} is linked to your ${ord(h)} house (${HOUSE_AREAS[h]}): it ${[...new Set(sig.how.get(h) ?? [])].join(" and ")}`;
  for (const h of rule.primary) { const w = sig.weight.get(h) ?? 0; if (w) { score += 3 * w; reasons.push(cite(h)); } }
  for (const h of rule.support) { const w = sig.weight.get(h) ?? 0; if (w) { score += 1.5 * w; reasons.push(cite(h)); } }
  for (const h of rule.negative) { const w = sig.weight.get(h) ?? 0; if (w) score -= 2 * w; }
  if (rule.karakas.includes(name)) { score += 1.5; reasons.push(`${name} is the natural significator (karaka) of ${rule.label}`); }
  return { score, reasons };
}

// ---- transits: Jupiter & Saturn sign per month (cached across requests) ----------
const transitCache = new Map<string, { jup: number; sat: number }>();
function slowTransitsAt(ms: number, ayanamsa: number) {
  const d = new Date(ms);
  const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}:${ayanamsa}`;
  let v = transitCache.get(key);
  if (!v) {
    const mid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 15);
    const t = computeTransits(new Date(mid).toISOString(), ayanamsa);
    const sign = (n: string) => t.planet_position.find((p: any) => p.name === n)?.rasi?.id ?? -1;
    v = { jup: sign("Jupiter"), sat: sign("Saturn") };
    transitCache.set(key, v);
  }
  return v;
}
// Graha drishti counted from the planet's sign: Jupiter 1/5/7/9, Saturn 1/3/7/10.
const influences = (fromSign: number, targetSign: number, aspects: number[]) =>
  fromSign >= 0 && aspects.includes(((targetSign - fromSign + 12) % 12) + 1);

/** Share of months in [f, t) where Jupiter (and Jupiter + Saturn) influence any target sign. */
function transitSupport(targetSigns: number[], f: number, t: number, ayanamsa: number) {
  let months = 0, jup = 0, dbl = 0;
  for (let m = f; m < t; m += 30.44 * 86400000) {
    const tr = slowTransitsAt(m, ayanamsa);
    const j = targetSigns.some((sg) => influences(tr.jup, sg, [1, 5, 7, 9]));
    const sa = targetSigns.some((sg) => influences(tr.sat, sg, [1, 3, 7, 10]));
    months++; if (j) jup++; if (j && sa) dbl++;
  }
  return { jf: months ? jup / months : 0, df: months ? dbl / months : 0 };
}

// ---- the engine ----------------------------------------------------------------
export function computeTiming(chart: any, topic: TimingTopic, ayanamsa: number, nowMs = Date.now()) {
  const rule = TOPICS[topic];
  const { sigs, lagnaIdx } = buildSignificators(chart);
  const ads: any[] = chart?.dasha?.antardasha ?? [];
  if (!ads.length || lagnaIdx < 0) return null;

  const birthMs = Date.parse(chart?.birth_details?.date_of_birth ?? "");
  const minStart = Number.isFinite(birthMs) ? birthMs + rule.minAge * 365.25 * 86400000 : -Infinity;
  const start = Math.max(nowMs, minStart);
  const end = nowMs + HORIZON_YEARS * 365.25 * 86400000;
  if (start >= end) return null;

  const lordCache = new Map<string, ReturnType<typeof lordScore>>();
  const ls = (name: string) => {
    if (!lordCache.has(name)) lordCache.set(name, lordScore(name, sigs.get(name), rule));
    return lordCache.get(name)!;
  };
  const targetSigns = rule.primary.map((h) => (lagnaIdx + h - 1) % 12);
  const transitFrac = (f: number, t: number) => transitSupport(targetSigns, f, t, ayanamsa);

  // Antardasha = the answer window. Pratyantar = the peak months inside it.
  type AdWin = {
    md: string; ad: string; from_ms: number; to_ms: number; score: number;
    jf: number; df: number; peak: { label: string; pd: string[] } | null;
  };
  const adWins: AdWin[] = [];
  for (const a of ads) {
    const aFrom = Date.parse(a.from), aTo = Date.parse(a.to);
    const f = Math.max(aFrom, start), t = Math.min(aTo, end);
    if (t - f < 30 * 86400000) continue;
    const md = a.mahadasha, ad = a.lord;
    const { jf, df } = transitFrac(f, t);
    const score = 0.35 * ls(md).score + 0.65 * ls(ad).score + 1.5 * jf + 1.5 * df;

    // Pratyantars inside the clipped window.
    const pds: Array<{ pd: string; f: number; t: number; score: number }> = [];
    const first = VIM_ORDER.indexOf(ad);
    let acc = aFrom;
    for (let i = 0; i < 9; i++) {
      const pd = VIM_ORDER[(first + i) % 9];
      const len = (aTo - aFrom) * (VIM_YEARS[pd] / 120);
      const pf = Math.max(acc, f), pt = Math.min(acc + len, t);
      acc += len;
      if (pt - pf < 7 * 86400000) continue;
      const tr = transitFrac(pf, pt);
      pds.push({ pd, f: pf, t: pt, score: 0.3 * ls(md).score + 0.45 * ls(ad).score + 0.25 * ls(pd).score + 1.5 * tr.jf + 1.5 * tr.df });
    }
    let peak: AdWin["peak"] = null;
    if (pds.length) {
      const bi = pds.reduce((b, x, i) => (x.score > pds[b].score ? i : b), 0);
      const cut = pds[bi].score * 0.92;
      let lo = bi, hi = bi;
      while (lo > 0 && pds[lo - 1].score >= cut) lo--;
      while (hi < pds.length - 1 && pds[hi + 1].score >= cut) hi++;
      const a = monthLabel(pds[lo].f), b = monthLabel(pds[hi].t);
      peak = { label: a === b ? a : `${a} – ${b}`, pd: pds.slice(lo, hi + 1).map((x) => x.pd) };
    }
    adWins.push({ md, ad, from_ms: f, to_ms: t, score: Math.round(score * 100) / 100, jf, df, peak });
  }
  if (!adWins.length) return null;

  const max = Math.max(...adWins.map((w) => w.score));
  const threshold = max > 0 ? max * 0.8 : max;

  const describe = (w: AdWin) => {
    const why = [...new Set([...ls(w.ad).reasons, ...ls(w.md).reasons.slice(0, 2)])].slice(0, 5);
    if (w.df >= 0.3) why.push(`Jupiter and Saturn both activate your ${rule.primary.map(ord).join("/")} house by transit during it (the classical "double transit")`);
    else if (w.jf >= 0.4) why.push(`Jupiter's transit supports your ${rule.primary.map(ord).join("/")} house during it`);
    return {
      window: `${monthLabel(w.from_ms)} – ${monthLabel(w.to_ms)}`,
      period: `${w.md} Mahadasha – ${w.ad} Antardasha`,
      peak_months: w.peak ? `${w.peak.label} (${w.peak.pd.join("/")} Pratyantar)` : null,
      score: w.score,
      why,
    };
  };

  const mostW = adWins.find((w) => w.score >= threshold)!;
  const alternatives = adWins
    .filter((w) => w !== mostW && w.score > 0)
    .sort((x, y) => y.score - x.score).slice(0, 2)
    .sort((x, y) => x.from_ms - y.from_ms)
    .map(describe);

  const nowW = adWins.find((w) => w.from_ms <= nowMs && w.to_ms > nowMs) ?? null;
  const strength = (w: AdWin) => (w.score >= threshold ? "strong" : w.score >= max * 0.5 ? "moderate" : "weak");

  // How clearly the chart promises this at all in the horizon (absolute, not relative).
  const confidence = max >= 4 ? "clear" : max >= 2 ? "moderate" : "weak";

  return {
    topic, label: rule.label, adverse: !!rule.adverse, confidence,
    houses: { main: rule.primary, support: rule.support, deny: rule.negative, karakas: rule.karakas },
    most_likely: describe(mostW),
    also_possible: alternatives,
    right_now: nowW ? { period: `${nowW.md}–${nowW.ad}`, strength: strength(nowW), window: `${monthLabel(nowW.from_ms)} – ${monthLabel(nowW.to_ms)}` } : null,
    all_periods: adWins.map((w) => ({ period: `${w.md}–${w.ad}`, window: `${monthLabel(w.from_ms)} – ${monthLabel(w.to_ms)}`, score: w.score })),
    // Raw form for combining two charts (Kundli Matching): ISO dates + score relative to this chart's best.
    periods_raw: adWins.map((w) => ({
      md: w.md, ad: w.ad,
      from: new Date(w.from_ms).toISOString().slice(0, 10), to: new Date(w.to_ms).toISOString().slice(0, 10),
      from_ms: w.from_ms, to_ms: w.to_ms,
      rel: max > 0 ? Math.round((w.score / max) * 100) / 100 : 0,
      strong: w.score >= threshold,
    })),
    horizon: `${monthLabel(start)} – ${monthLabel(end)}`,
  };
}

export type TimingResult = NonNullable<ReturnType<typeof computeTiming>>;

/** Plain-language block for the prompt: the ONLY dates the model may give. */
export function timingForAI(t: TimingResult) {
  const w = (x: any) => x && `${x.window}, ${x.period}${x.peak_months ? `; peak months ${x.peak_months}` : ""}. Why: ${x.why.join("; ")}.`;
  return {
    topic: t.label,
    note: t.adverse
      ? "These are SENSITIVE periods to be careful about health (not an event to wait for). Say so gently."
      : "Computed from the dasha (Mahadasha–Antardasha–Pratyantar) and Jupiter/Saturn transits. These are the ONLY dates you may give.",
    MOST_LIKELY: w(t.most_likely),
    ALSO_POSSIBLE: t.also_possible.map(w),
    INDICATION: t.confidence === "clear"
      ? "clear: say the window confidently"
      : t.confidence === "moderate"
        ? "moderate: give the window, and add that effort or circumstances also matter"
        : "weak: the chart shows no strong window in this period, so give the window as the best possibility and say it plainly, without false certainty",
    RIGHT_NOW: t.right_now ? `${t.right_now.window}: ${t.right_now.strength} for ${t.label} (period ${t.right_now.period})` : null,
    searched: t.horizon,
  };
}

/**
 * Period profile: every Antardasha from age 12 up to 12 years ahead, labelled per life
 * area (strong / good / average / weak). The labels come from the same significator
 * scores the "when" engine uses. The report's past and future bullets and the chat's
 * "agle 5-7 saal kaise rahenge?" can then say which period favoured what, and that
 * comes from calculation, not narration. Natal significators only, without
 * transits, so past and future are judged the same way.
 */
const PROFILE_TOPICS: TimingTopic[] = ["career", "wealth", "marriage", "relationship", "property", "children", "foreign", "business", "education", "health"];
const PROFILE_LABEL: Record<string, string> = {
  career: "career", wealth: "money", marriage: "marriage", relationship: "love", property: "property/home",
  children: "children", foreign: "travel/foreign", business: "business", education: "studies", health: "health",
};

export function periodProfile(chart: any, ayanamsa: number, nowMs = Date.now(), yearsAhead = 12) {
  const { sigs, lagnaIdx } = buildSignificators(chart);
  const ads: any[] = chart?.dasha?.antardasha ?? [];
  if (!ads.length || lagnaIdx < 0) return null;
  const birthMs = Date.parse(chart?.birth_details?.date_of_birth ?? "");
  const startMs = Number.isFinite(birthMs) ? birthMs + 12 * 365.25 * 86400000 : nowMs - 30 * 365.25 * 86400000;
  const endMs = nowMs + yearsAhead * 365.25 * 86400000;
  const list = ads.filter((a) => Date.parse(a.to) > startMs && Date.parse(a.from) < endMs);
  if (!list.length) return null;
  const isFuture = list.map((a) => Date.parse(a.to) > nowMs); // current + future

  // EXACTLY the "when" engine's AD formula (dasha lords + Jupiter/Saturn transit share);
  // for the running period only the part from today on, like the engine. So the
  // period the engine calls "most likely" is always "strong" here too.
  const scores: Record<string, number[]> = {};
  for (const topic of PROFILE_TOPICS) {
    const rule = TOPICS[topic];
    const targetSigns = rule.primary.map((h) => (lagnaIdx + h - 1) % 12);
    const cache = new Map<string, number>();
    const ls = (n: string) => { if (!cache.has(n)) cache.set(n, lordScore(n, sigs.get(n), rule).score); return cache.get(n)!; };
    scores[topic] = list.map((a, i) => {
      const f = isFuture[i] ? Math.max(Date.parse(a.from), nowMs) : Date.parse(a.from);
      const t = Math.min(Date.parse(a.to), endMs);
      const { jf, df } = transitSupport(targetSigns, f, t, ayanamsa);
      return 0.35 * ls(a.mahadasha) + 0.65 * ls(a.lord) + 1.5 * jf + 1.5 * df;
    });
  }
  // Labels are relative within the same time frame: past periods against the past,
  // current/future periods against the future (the engine's 80%-of-best rule for "strong").
  const label = (topic: string, i: number) => {
    const idx = list.map((_, k) => k).filter((k) => isFuture[k] === isFuture[i]);
    const xs = idx.map((k) => scores[topic][k]);
    const max = Math.max(...xs), min = Math.min(...xs);
    const v = scores[topic][i];
    const strongCut = max > 0 ? max * 0.8 : max;
    const rel = max === min ? 0.5 : (v - min) / (max - min);
    return v >= strongCut && max > min ? "strong" : rel >= 0.5 ? "good" : rel >= 0.2 ? "average" : "weak";
  };

  return list.map((a, i) => {
    const from = Date.parse(a.from), to = Date.parse(a.to);
    const age = Number.isFinite(birthMs) ? (from - birthMs) / (365.25 * 86400000) : 30;
    const when = to <= nowMs ? "past" : from <= nowMs ? "current" : "future";
    const strong: string[] = [], weak: string[] = [];
    for (const topic of PROFILE_TOPICS) {
      if (topic === "health") continue;
      if (age < TOPICS[topic].minAge) continue; // no "strong for marriage" at age 13
      const l = label(topic, i);
      if (l === "strong") strong.push(PROFILE_LABEL[topic]);
      else if (l === "weak") weak.push(PROFILE_LABEL[topic]);
    }
    const h = label("health", i);
    return {
      period: `${a.mahadasha}–${a.lord}`,
      from: a.from, to: a.to, when,
      strong_for: strong, weak_for: weak,
      health: h === "strong" ? "sensitive (take care)" : h === "good" ? "watch" : "stable",
    };
  });
}
