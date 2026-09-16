/**
 * "Ab kya karun?" — the decision a person is actually stuck on.
 *
 * Not an astrology feature with astrology on top. People arrive at midnight
 * with "should I message her or not", "should I take the offer", "do I tell my
 * parents yet" — and they ask a chatbot, which starts from nothing every time,
 * knows none of their life, and has no opinion about WHEN. This answers the
 * same question with three things a chatbot cannot have: what they have already
 * told us, a real time window computed from the panchang and their own periods,
 * and a record of how their past decisions actually went.
 *
 * What lives HERE is everything that must be identical every time it is asked:
 * what kind of decision this is, which two or three facts change the answer,
 * and the window. The model writes only the words — and never the timing,
 * because a model asked for a time will invent a confident one.
 */
import { buildPanchang } from "./panchang";
import { buildRightNow, type Verdict } from "./right-now";

export type DecisionKind =
  | "message"      // should I text / call / reply to someone
  | "relationship" // propose, break up, patch up, meet the family
  | "career"       // job, offer, resignation, business move
  | "money"        // spend, lend, invest, buy
  | "family"       // telling parents, family expectations
  | "study"        // course, exam, college, abroad
  | "other";

/*
 * Which kind of decision this is.
 *
 * Ordered most specific first and SCORED, not first-match: "job chhod doon"
 * contains "chhod doon", which is also how someone says they are leaving a
 * person, and a first-match reader called a resignation a breakup. The words
 * that belong to one kind and no other are what decide it.
 */
const KIND_WORDS: Array<[DecisionKind, RegExp]> = [
  ["career", /\b(job|naukri|offer|resign|resignation|quit|notice period|switch|interview|promotion|appraisal|boss|manager|office|company|business|startup|freelance|kaam shuru)\b|(नौकरी|इस्तीफ़ा|ऑफर|बिज़नेस|दफ़्तर)/gi],
  ["money", /\b(paisa|paise|loan|udhaar|udhar|invest|investment|kharch|buy|khareed|sell|bech|emi|rent|property|plot|gold|share|stock|crypto|lend|refund)\b|(पैसा|उधार|निवेश|ख़रीद|किराया)/gi],
  ["study", /\b(exam|padhai|course|college|admission|degree|abroad|videsh|coaching|drop|semester|form bharu|apply karun)\b|(परीक्षा|पढ़ाई|कोर्स|विदेश|कॉलेज)/gi],
  ["family", /\b(ghar mein|ghar walon|ghar walo|parents|mummy|papa|maa|pita|pitaji|family ko|ghar par bata|rishtedar|bhai ko|behen ko|sasural)\b|(घर में|घर वालों|माता|पिता|परिवार|ससुराल)/gi],
  ["relationship", /\b(propose|breakup|break up|rishta|rishte|shaadi karun|shadi karun|marry|girlfriend|boyfriend|crush|patch up|maaf|forgive|dating|ex|alag ho|usse alag)\b|(प्रपोज|ब्रेकअप|रिश्ता|शादी करूँ)/gi],
  ["message", /\b(message|msg|text|whatsapp|dm|call karun|call karoon|phone karun|reply|read kar|block|unblock|insta|chat karun|baat karun|bol doon|bata doon|puchh loon|pooch loon)\b|(मैसेज|कॉल करूँ|रिप्लाई|बात करूँ)/gi],
];

/** How many distinct words of a kind appear in the question. */
function score(re: RegExp, q: string): number {
  re.lastIndex = 0;
  return new Set((q.match(re) ?? []).map((m) => m.toLowerCase())).size;
}

/** What kind of decision this is. Falls back to "other", never guesses wildly. */
export function decisionKind(question: string): DecisionKind {
  const q = String(question ?? "");
  let best: DecisionKind = "other";
  let bestScore = 0;
  for (const [kind, re] of KIND_WORDS) {
    const n = score(re, q);
    // Strictly greater: a tie goes to the earlier, more specific kind.
    if (n > bestScore) { best = kind; bestScore = n; }
  }
  return best;
}

/*
 * Decisions this app must not make for someone.
 *
 * Not squeamishness — these are the ones where a confident answer from a phone
 * does real damage: anything about ending a life, hurting someone, a medical
 * choice, or a legal one. The feature says so plainly and points at the person
 * who should actually be answering.
 */
const REFUSE = /\b(suicide|khudkushi|jaan de|marr jau|mar jaun|end it|kill|maar doon|maar dun|revenge|badla loon|police|fir|case|court|lawyer|divorce file|abortion|medicine|dawai|tablet|dose|surgery|operation|chemo|insulin)\b|(आत्महत्या|जान दे|दवाई|ऑपरेशन|मुक़दमा)/i;

export type DecisionRefusal = "self_harm" | "harm_other" | "medical" | "legal" | null;

export function refusalFor(question: string): DecisionRefusal {
  const q = String(question ?? "");
  if (!REFUSE.test(q)) return null;
  if (/\b(suicide|khudkushi|jaan de|marr jau|mar jaun|end it)\b|(आत्महत्या|जान दे)/i.test(q)) return "self_harm";
  if (/\b(kill|maar doon|maar dun|revenge|badla loon)\b/i.test(q)) return "harm_other";
  if (/\b(medicine|dawai|tablet|dose|surgery|operation|chemo|insulin|abortion)\b|(दवाई|ऑपरेशन)/i.test(q)) return "medical";
  return "legal";
}

/* ── The two or three facts that change the answer ───────────────────────
   Rule-based and free: no model call, instant, and the same every time. Kept
   SHORT on purpose — a decision tool that interrogates you before helping is
   a form, and people close forms. */

export interface Clarifier {
  id: string;
  question: string;
  options: string[];
}

type L = "en" | "hi" | "hinglish";
const lang = (l?: string): L => (l === "hi" ? "hi" : l === "hinglish" ? "hinglish" : "en");

const T = {
  lastTalk: {
    en: { q: "How did it end last time you spoke?", o: ["It was fine", "We argued", "They ignored me", "We've never really spoken"] },
    hi: { q: "पिछली बार बात कैसे ख़त्म हुई थी?", o: ["ठीक थी", "झगड़ा हुआ था", "उन्होंने अनदेखा किया", "कभी ठीक से बात ही नहीं हुई"] },
    hinglish: { q: "Pichhli baar baat kaise khatam hui thi?", o: ["Theek thi", "Jhagda hua tha", "Unhone ignore kiya", "Kabhi theek se baat hi nahi hui"] },
  },
  want: {
    en: { q: "What do you actually want out of this?", o: ["Just a reply", "Clarity, yes or no", "To fix things", "To end it cleanly"] },
    hi: { q: "आप असल में इससे क्या चाहते हैं?", o: ["बस एक जवाब", "साफ़ जवाब — हाँ या ना", "बात सुधारना", "ठीक से ख़त्म करना"] },
    hinglish: { q: "Aap asal mein isse chahte kya ho?", o: ["Bas ek reply", "Clarity — haan ya na", "Baat sudharna", "Theek se khatam karna"] },
  },
  howLong: {
    en: { q: "How long has this been going on?", o: ["A few days", "A few weeks", "Months", "Years"] },
    hi: { q: "यह कब से चल रहा है?", o: ["कुछ दिन", "कुछ हफ़्ते", "महीनों से", "सालों से"] },
    hinglish: { q: "Ye kab se chal raha hai?", o: ["Kuch din", "Kuch hafte", "Mahinon se", "Saalon se"] },
  },
  pressure: {
    en: { q: "Is there a deadline on this?", o: ["Today", "This week", "This month", "No deadline"] },
    hi: { q: "क्या इसकी कोई समय-सीमा है?", o: ["आज", "इस हफ़्ते", "इस महीने", "कोई समय-सीमा नहीं"] },
    hinglish: { q: "Iski koi deadline hai?", o: ["Aaj", "Is hafte", "Is mahine", "Koi deadline nahi"] },
  },
  safety: {
    en: { q: "If this goes badly, what's the worst that happens?", o: ["I feel bad for a while", "I lose the relationship", "I lose money", "I lose something I can't get back"] },
    hi: { q: "अगर यह ग़लत गया, तो सबसे बुरा क्या होगा?", o: ["कुछ समय बुरा लगेगा", "रिश्ता चला जाएगा", "पैसा जाएगा", "कुछ ऐसा जाएगा जो वापस नहीं आता"] },
    hinglish: { q: "Agar ye galat gaya, to sabse bura kya hoga?", o: ["Kuch samay bura lagega", "Rishta chala jayega", "Paisa jayega", "Kuch aisa jayega jo wapas nahi aata"] },
  },
  backup: {
    en: { q: "Do you have a fallback if this doesn't work?", o: ["Yes, a solid one", "Sort of", "No", "Haven't thought about it"] },
    hi: { q: "अगर यह नहीं चला तो कोई दूसरा रास्ता है?", o: ["हाँ, पक्का है", "थोड़ा-बहुत", "नहीं", "सोचा नहीं"] },
    hinglish: { q: "Agar ye nahi chala to koi doosra raasta hai?", o: ["Haan, pakka hai", "Thoda-bahut", "Nahi", "Socha nahi"] },
  },
} as const;

const PLAN: Record<DecisionKind, Array<keyof typeof T>> = {
  message: ["lastTalk", "want", "howLong"],
  relationship: ["lastTalk", "want", "safety"],
  career: ["pressure", "backup", "safety"],
  money: ["safety", "backup", "pressure"],
  family: ["pressure", "safety", "want"],
  study: ["pressure", "backup"],
  other: ["want", "pressure", "safety"],
};

/** The questions worth asking for this decision — never more than three. */
export function clarifiersFor(kind: DecisionKind, language?: string): Clarifier[] {
  const L = lang(language);
  return PLAN[kind].map((id) => ({ id, question: T[id][L].q, options: [...T[id][L].o] }));
}

/* ── When ────────────────────────────────────────────────────────────────
   The part no chatbot can fake, and the part a model must never write. */

/** Which right-now activity a decision behaves like. */
const ACTIVITY: Record<DecisionKind, string> = {
  message: "call",
  relationship: "meeting",
  career: "newwork",
  money: "money",
  family: "meeting",
  study: "newwork",
  other: "general",
};

export interface DecisionWindow {
  verdict: Verdict;
  /** "now" | "later today" | "tomorrow" — what the app shows as the headline timing. */
  when: "now" | "later_today" | "tomorrow";
  /** A real clock window, in their timezone, e.g. "11:12–13:04". */
  window: string | null;
  /** The window to stay out of, when one is running or next (Rahu Kaal etc.). */
  avoid: string | null;
  /** The panchang's own words for why — shown as the small print, never invented. */
  reason: string;
  date: string;
  timezone: string;
}

/**
 * The window to act in, from the panchang for THEIR place — today if today
 * still has a clean stretch, otherwise tomorrow's first one.
 *
 * Deterministic on purpose: asked twice in the same minute it answers the same
 * thing, which is the difference between advice and a horoscope.
 */
export function decisionWindow(args: {
  kind: DecisionKind;
  latitude: number;
  longitude: number;
  timezone: string;
  ayanamsa: number;
  now?: Date;
}): DecisionWindow | null {
  const { latitude, longitude, timezone, ayanamsa } = args;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const now = args.now ?? new Date();
  const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d);
  const hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  /*
   * The panchang speaks in "04:52 PM" and Intl gives us "16:05", and a window
   * printed as "16:05–04:52 PM" reads as a bug to anyone who sees it. The
   * clock the person is shown is 12-hour throughout.
   */
  const nowLabel = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: true }).format(now);

  try {
    const today = buildPanchang({ date: fmt(now), latitude, longitude, timezone, ayanamsa, atInstant: now });
    const rn = buildRightNow(today, hhmm, ACTIVITY[args.kind]);
    const base = {
      verdict: rn.verdict,
      avoid: rn.blocking ? `${rn.blocking.name} ${rn.blocking.start}–${rn.blocking.end}` : null,
      reason: rn.reason,
      date: fmt(now),
      timezone,
    };

    if (rn.verdict === "go" && rn.current) {
      return { ...base, when: "now", window: `${nowLabel}–${rn.current.ends}` };
    }
    if (rn.next_good) {
      return { ...base, when: "later_today", window: `${rn.next_good.start}–${rn.next_good.end}` };
    }
    // Nothing clean left today: the first good stretch after tomorrow's sunrise.
    const tmr = new Date(now.getTime() + 24 * 3600_000);
    const tp = buildPanchang({ date: fmt(tmr), latitude, longitude, timezone, ayanamsa });
    const early = buildRightNow(tp, "07:00", ACTIVITY[args.kind]);
    return {
      ...base,
      when: "tomorrow",
      window: early.next_good ? `${early.next_good.start}–${early.next_good.end}` : null,
      date: fmt(tmr),
    };
  } catch {
    // A missing sunrise (polar latitudes, a bad timezone) is not a reason to
    // refuse the whole decision — the reading just goes out without a clock.
    return null;
  }
}
