/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Self-contained rules — no JanamJyot module is changed by this file. */
/**
 * Deterministic checks on a finished chat reply, run in code rather than asked for in the
 * prompt — the prompt already says "do NOT repeat things you already told them", and the
 * model still does it.
 *
 * Live (25 Sep 2026, one session): the answer to "is week koi business meeting hogi" ended
 * with a paragraph about Sep 2026 – Feb 2027, and four minutes later the answer to a
 * completely different question (a Russian client's meeting: kab tak hogi, success hogi,
 * long-term fayda) carried that same paragraph back word for word, together with the same
 * three weekday lines. The user's words: "kai baar question ka answer repeat kar raha hai …
 * poora sawal theek se nahi padh raha".
 *
 * So two things get measured here:
 *   1. how much of a new reply is lines already sent in this same chat, and
 *   2. what the person actually asked — each separate ask in one message, and whether a
 *      "kab / kab tak" question came back with a real time window at all.
 */

// ---- normalising ----------------------------------------------------------------------

/** Bold marks, bullets, punctuation and spacing carry no meaning for a repeat check. */
function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\*\*|__|[•·]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** One reply split into the units a reader notices as "you said this already". */
function sentences(text: string): string[] {
  return String(text || "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter(Boolean);
}

/** Shared-word ratio against the shorter side, so a repeat with one extra clause counts. */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const counts = new Map<string, number>();
  for (const w of b) counts.set(w, (counts.get(w) ?? 0) + 1);
  let shared = 0;
  for (const w of a) {
    const left = counts.get(w) ?? 0;
    if (left > 0) { shared++; counts.set(w, left - 1); }
  }
  return shared / Math.min(a.length, b.length);
}

// ---- 1. repetition -------------------------------------------------------------------

/** A short line ("Chaliye dekhte hain.") repeating is normal speech, not a repeated answer. */
const MIN_WORDS = 8;
/** Two sentences this similar are the same sentence to a reader. */
const SAME = 0.8;

export interface RepetitionReport {
  /** The offending sentences, as they appear in the new reply. */
  lines: string[];
  /** Share of the reply's substantial words that were already said (0–1). */
  share: number;
}

/** What a new reply repeats from what was already sent in this chat. */
export function repetition(answer: string, priorAnswers: string[]): RepetitionReport {
  const prior = priorAnswers.flatMap((a) => sentences(a)).map(words).filter((w) => w.length >= MIN_WORDS);
  if (!prior.length) return { lines: [], share: 0 };

  const lines: string[] = [];
  let total = 0;
  let repeated = 0;
  for (const sentence of sentences(answer)) {
    const w = words(sentence);
    if (w.length < MIN_WORDS) continue;
    total += w.length;
    if (prior.some((p) => overlap(w, p) >= SAME)) {
      lines.push(sentence);
      repeated += w.length;
    }
  }
  return { lines, share: total ? repeated / total : 0 };
}

/**
 * Worth regenerating once roughly a third of the reply is old ground (the live repeat was
 * 47%). Below that, a line or two carried over is left alone — restating a fact where it
 * belongs is how people talk, and a rewrite costs the user an extra wait.
 */
export function repeatsTooMuch(r: RepetitionReport): boolean {
  return r.share >= 0.3;
}

// ---- 2. what they actually asked ------------------------------------------------------

// Users type fast and phonetically, so every cue below also lists the spellings that
// actually arrive ("kay" for kya, "kasie" for kaise, "kabn" for kab, "bto" for batao).
const CUE_RE =
  /\b(kya|kay|kaya|kab|kabn|kabhi|kaise|kasie|kaisa|kaisi|ksie|kaun|kon|kitna|kitne|kitni|kitan|kahan|kaha|khan|kyun|kyu|kyon|bata|bato|btao|batao|bto|bta|batana|success|fayda|fayada|problem|remedy|upay|when|what|how|why|who|where|which|will|should)\b/i;
/** A long rambling chunk carries its topic at the front and its actual ask at the end
 *  ("…uss meeting ke bare me jaana hai ki kab tak hogi"), so both ends are kept. */
function condense(chunk: string): string {
  return chunk.length <= 200 ? chunk : `${chunk.slice(0, 95).trim()} … ${chunk.slice(-100).trim()}`;
}

/** Where one ask ends and the next begins in a single typed-out message. */
const SPLIT_RE = /\?|\bor\b|\baur\b|\band\b|\bya phir\b|[,;\n]+/gi;

/**
 * The separate things one message asks for. "…kab tak hogi or kay wo success hogi or kay
 * usse koi fayda hoga long term mein" is three asks, and an answer that covers only the
 * first is the reply the user called "poora sawal shi se nahi padh raha".
 * Returns [] when the message is a single ask (nothing to spell out).
 */
export function questionParts(question: string): string[] {
  const q = String(question || "").replace(/\s+/g, " ").trim();
  if (!q) return [];
  const parts: string[] = [];
  for (const raw of q.split(SPLIT_RE)) {
    const chunk = (raw ?? "").trim().replace(/^(to|toh|ki|ye|yeh|bhi)\s+/i, "").trim();
    if (!chunk) continue;
    // A fragment with no question cue is a detail of the ask before it, not a new one.
    if (!CUE_RE.test(chunk) || chunk.split(/\s+/).length < 2) {
      if (parts.length) parts[parts.length - 1] = condense(`${parts[parts.length - 1]} ${chunk}`);
      continue;
    }
    parts.push(condense(chunk));
  }
  return parts.length >= 2 ? parts.slice(0, 6) : [];
}

const WHEN_RE = /\b(kab|kabn|kab tak|kitne din|kitna time|kitna samay|kitne saal|kitne mahine|when|how long|till when|kab se)\b/i;
const MONTHS_RE =
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b(20\d{2})\b|\b(january|february|march|april|june|july|august|september|october|november|december)\b/i;
const PERIOD_RE =
  /\b(aaj|kal|parso|today|tomorrow|is hafte|agle hafte|this week|next week|is mahine|agle mahine|this month|next month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|somvaar|mangalvaar|budhvaar|guruvaar|shukravaar|shanivaar|ravivaar|\d{1,2}\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i;

/** True when the person asked about timing. */
export function asksWhen(question: string): boolean {
  return WHEN_RE.test(String(question || ""));
}

/** True when a reply actually carries a time window they can use. */
export function givesTime(answer: string): boolean {
  const a = String(answer || "");
  return MONTHS_RE.test(a) || PERIOD_RE.test(a);
}

/**
 * The substantial sentences already sent in this chat, longest first — quoted back into the
 * next prompt so "do not repeat yourself" points at actual lines instead of being a rule the
 * model can read past.
 */
export function alreadySaid(priorAnswers: string[], max = 8): string[] {
  const seen = new Set<string>();
  const out: Array<{ text: string; n: number }> = [];
  for (const a of priorAnswers) {
    for (const sentence of sentences(a)) {
      const w = words(sentence);
      if (w.length < MIN_WORDS) continue;
      const key = w.slice(0, 12).join(" ");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: sentence.replace(/\*\*/g, "").trim(), n: w.length });
    }
  }
  return out.sort((a, b) => b.n - a.n).slice(0, max).map((s) => (s.text.length > 150 ? `${s.text.slice(0, 150)}…` : s.text));
}

// ---- 3. the birth nakshatra must be THEIR birth nakshatra --------------------------------

/**
 * Every classical name, with the spellings that show up in practice. A reading leans on the
 * janma nakshatra because it is the most individual placement in a chart — so naming the
 * wrong one is the worst kind of error: it reads as precise and is simply not them.
 */
const NAKSHATRA_NAMES: string[][] = [
  ["ashwini", "ashvini"], ["bharani"], ["krittika", "kritika", "krutika"], ["rohini"],
  ["mrigashira", "mrigashirsha", "mrighashira", "mrigasira"], ["ardra", "aardra"],
  ["punarvasu"], ["pushya", "pushyami"], ["ashlesha", "aslesha"], ["magha", "makha"],
  ["purva phalguni", "poorva phalguni"], ["uttara phalguni", "uttra phalguni"], ["hasta"],
  ["chitra", "chitta"], ["swati", "swathi"], ["vishakha", "vishaka"], ["anuradha"],
  ["jyeshtha", "jyestha", "jyeshta"], ["mula", "moola"], ["purva ashadha", "poorvashadha", "purvashadha"],
  ["uttara ashadha", "uttarashadha"], ["shravana", "sravana", "shravan"], ["dhanishta", "dhanishtha"],
  ["shatabhisha", "shatabhishak", "satabhisha"], ["purva bhadrapada", "poorva bhadrapada"],
  ["uttara bhadrapada", "uttra bhadrapada"], ["revati", "revathi"],
];
/** Right before the name: whose nakshatra this is being called. */
const MINE_RE = /\b(aapki|aapka|aapke|aap|your|you|janma|janam|birth|unki|unka|uske|iski)\b[^.!?\n]{0,40}$/i;

/**
 * Nakshatra names a text claims as THEIR birth nakshatra while the chart says otherwise.
 * Only possessive phrasing is flagged ("aapki Rohini Nakshatra ke karan…"), so a legitimate
 * mention of where the Moon is transiting today stays untouched.
 */
export function wrongBirthNakshatra(text: string, actual: string): string[] {
  const t = String(text || "");
  if (!t || !actual) return [];
  const mine = String(actual).toLowerCase().replace(/\s+/g, " ").trim();
  const isActual = (group: string[]) => group.some((n) => mine.includes(n));
  const found: string[] = [];
  for (const group of NAKSHATRA_NAMES) {
    if (isActual(group)) continue;
    for (const name of group) {
      const re = new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\b`, "gi");
      for (const m of t.matchAll(re)) {
        const before = t.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0);
        if (MINE_RE.test(before)) { found.push(name); break; }
      }
      if (found.includes(name)) break;
    }
  }
  return [...new Set(found)];
}
