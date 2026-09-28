/**
 * Is this section of the Life Report actually about THIS chart?
 *
 * A real complaint, from a real pair of reports (26 Sep 2026): a user and his friend
 * generated full reports minutes apart and said they were "same to same, line by line".
 * They were not — measured field by field, the two shared 0% of their six-word phrases in
 * summary/past/present/future/guidance. But the feeling was honest, for two reasons:
 * both men genuinely have Gemini lagna (so both reports correctly say "Mercury", and
 * suggest the same Mercury professions), and — the part that is our fault — the advice
 * fields were interchangeable. "Keep patience", "communicate openly", "do yoga daily" fit
 * anybody with a pulse, and that is what the eye catches when two reports sit side by side.
 *
 * The prompt already forces "summary"/"positive"/"caution" to carry computed highlights.
 * "guidance" had no such rule and drifted straight into fortune-cookie territory. Asking
 * the model more nicely does not fix that — checking does. A field that never names a
 * planet, a house, a nakshatra, a dasha or a year is not a reading of this chart, whatever
 * else it is, and it gets sent back to be written again.
 *
 * Deliberately script-agnostic: the report is written in whichever language the person
 * chose, so the anchors are the things that survive translation — digits, and the proper
 * nouns of the chart, in Latin or Devanagari.
 */

/** Planets, as every language we write in spells them. */
const PLANETS = [
  "sun", "moon", "mars", "mercury", "jupiter", "venus", "saturn", "rahu", "ketu",
  "surya", "ravi", "chandra", "chandrama", "mangal", "kuja", "budh", "budha",
  "guru", "brihaspati", "shukra", "shani", "sani",
  "सूर्य", "रवि", "चंद्र", "चन्द्र", "चंद्रमा", "मंगल", "बुध", "गुरु", "बृहस्पति",
  "शुक्र", "शनि", "राहु", "केतु",
];

const NAKSHATRAS = [
  "ashwini", "bharani", "krittika", "rohini", "mrigashira", "ardra", "punarvasu",
  "pushya", "ashlesha", "magha", "purva phalguni", "uttara phalguni", "hasta",
  "chitra", "swati", "vishakha", "anuradha", "jyeshtha", "mula", "moola",
  "purva ashadha", "uttara ashadha", "shravana", "dhanishta", "shatabhisha",
  "purva bhadrapada", "uttara bhadrapada", "revati",
];

/** Words that mark a number as a house number rather than a quantity. */
const HOUSE_WORDS = ["house", "ghar", "bhav", "bhava", "भाव", "घर", "स्थान"];

/** Dasha vocabulary — a named period is always a chart fact. */
const PERIOD_WORDS = [
  "dasha", "dasa", "mahadasha", "antardasha", "antardasa", "pratyantar",
  "दशा", "महादशा", "अंतर्दशा",
];

const RASHIS = [
  "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio",
  "sagittarius", "capricorn", "aquarius", "pisces",
  "mesh", "vrishabh", "mithun", "kark", "simha", "kanya", "tula", "vrishchik",
  "dhanu", "makar", "kumbh", "meen",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const anyOf = (words: string[]) => new RegExp(`(^|[^\\p{L}])(${words.map(esc).join("|")})([^\\p{L}]|$)`, "iu");

const PLANET_RE = anyOf(PLANETS);
const NAK_RE = anyOf(NAKSHATRAS);
const RASHI_RE = anyOf(RASHIS);
const PERIOD_RE = anyOf(PERIOD_WORDS);
/** "10th house", "10ve ghar", "7 भाव" — a bare number is not enough. */
const HOUSE_RE = new RegExp(`\\d{1,2}\\s*\\p{L}{0,4}\\s*(${HOUSE_WORDS.map(esc).join("|")})`, "iu");
/** A real year, not a quantity: 1900-2099. */
const YEAR_RE = /\b(19|20)\d{2}\b/;
/**
 * Named chart combinations. Matching the bare word "yoga" does not work: half the health
 * guidance in the app says "niyamit roop se yoga karein", which is exercise, not a chart
 * fact. So the name has to be one the engine (or classical practice) actually uses.
 */
const YOGA_NAMES = [
  "gaja kesari", "gajakesari", "kesari", "raj", "raja", "rajya", "dhana", "neecha bhanga",
  "parivartana", "sunapha", "anapha", "durudhara", "kemadruma", "yogakaraka",
  "budha-aditya", "budha aditya", "budhaditya", "chandra mangal", "vipreet", "viparita",
  "ruchaka", "bhadra", "hamsa", "malavya", "sasha", "shasha", "adhi", "amala",
  "saraswati", "lakshmi", "shakat", "kaal sarp", "kal sarp", "guru chandal", "panch mahapurush",
  "गज केसरी", "गजकेसरी", "राज", "धन", "विपरीत", "पंच महापुरुष", "बुधादित्य",
];
const YOGA_RE = new RegExp(
  `(${YOGA_NAMES.map(esc).join("|")})[\\s-]*(yoga|yog|योग)\\b`, "iu");

/** Every distinct kind of chart fact this text names. */
export function chartAnchors(text: string): string[] {
  const t = String(text ?? "");
  const found: string[] = [];
  if (PLANET_RE.test(t)) found.push("planet");
  if (HOUSE_RE.test(t)) found.push("house");
  if (NAK_RE.test(t)) found.push("nakshatra");
  if (PERIOD_RE.test(t)) found.push("dasha");
  if (YEAR_RE.test(t)) found.push("year");
  if (YOGA_RE.test(t)) found.push("yoga");
  if (RASHI_RE.test(t)) found.push("rashi");
  return found;
}

/** Does this text stand on at least one thing calculated from the chart? */
export function chartAnchored(text: string): boolean {
  return chartAnchors(text).length > 0;
}

/**
 * Short fields are allowed to be plain — a one-line disclaimer naming a planet would be
 * odd. Anything long enough to read as a paragraph has room to say WHY.
 */
const MIN_WORDS = 12;

/** Fields that must be about this chart, not about people in general. */
const MUST_ANCHOR = ["summary", "positive", "caution", "guidance"] as const;

/**
 * Which "<section>.<field>" pairs read as advice for anybody. Empty is the good case.
 */
export function genericFields(report: any, sections: readonly string[]): string[] {
  const out: string[] = [];
  for (const sec of sections) {
    const body = report?.[sec];
    if (!body || typeof body !== "object") continue;
    for (const field of MUST_ANCHOR) {
      const text = String(body[field] ?? "");
      if (text.trim().split(/\s+/).length < MIN_WORDS) continue;
      if (!chartAnchored(text)) out.push(`${sec}.${field}`);
    }
  }
  return out;
}
