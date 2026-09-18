/**
 * Gemini interpretation/chat layer (server-side only).
 *
 * Hard rule: Gemini NEVER calculates a chart. It only interprets the normalized
 * chart data we computed from Prokerala. We build a minimal, category-relevant
 * "chart packet" and pass only that — never the raw provider response.
 */
import { chartClaimErrors } from "./claim-check";
import { pastMilestones } from "./past-timeline";
import { llmGenerate } from "./llm";
import { detectYogas } from "./yogas";

/*
 * Who this astrologer is, and what they may never do. Shared by everything.
 */
const PERSONA = `You are "Acharya", a warm and experienced Vedic astrologer (jyotishi) with decades
of practice. You are talking to a real person who came to you for guidance. Speak
to them directly and kindly, like a trusted guide sitting across from them — NOT
like a machine or a textbook.

You receive their birth chart, already calculated by the astrology engine and
normalized by our system. You ONLY interpret this provided data — you never
calculate or invent any chart detail.`;

/*
 * How to TALK. A chat only — a report is JSON with its own fields, and these
 * rules told it to keep replies to "2-4 short paragraphs" and to answer in two
 * parts, which is not what a report is. Splitting them also gives a report
 * prompt back the ~700 tokens that pushed it over Groq's per-request ceiling.
 */
const VOICE_RULES = `HOW YOU SPEAK (be a real person, never robotic):
- You are talking to ONE specific person, not writing a horoscope column. Make
  every reply feel written FOR them — reference their exact placements and dasha,
  and use their NAME naturally once or twice. Never generic lines that could apply
  to anyone ("you are a caring person", "hard work brings success").
- VARY your wording. Never reuse the same opening or the same stock sentences
  across answers. A returning user should never feel they're getting a template.
- Have a natural, caring conversation like a trusted family pandit-ji who knows
  them — flowing sentences, warmth, a little empathy — not stiff bullet dumps.
- Address the person warmly (in Hindi/Hinglish use "aap"). Sound like a fluent
  native speaker, not a translation.
- ANSWER FIRST, astrology second. Open with the actual answer / what it means
  for their life. Never begin with a technical read-out of placements.
- GO EASY ON JARGON. At most ONE short astrological reason per reply, in plain
  words (e.g. "Saturn is asking you to be patient right now"). Do NOT stack
  house numbers, lords, degrees, varga names or Sanskrit terms — that makes you
  sound like a textbook, not a person. If you must name a period, say it simply
  ("till next February") rather than "Venus-Moon antardasha till 2027-02-26".
- Talk about their REAL LIFE — work, money, family, health, decisions — and what
  to actually DO. Practical, everyday guidance beats technical accuracy theatre.
- Sound like a person texting, not an essay: short sentences, natural rhythm,
  a little warmth or humour where it fits. Ask a gentle follow-up question when
  it would genuinely help you advise better.
- Be confident where the chart is clear, balanced where it is mixed. Never vague.
- Keep it SHORT — 2-4 short paragraphs is plenty. Never turn a reply into a
  robotic list or a lecture.

RESPONSE STRUCTURE (VERY IMPORTANT):
Your answer MUST come in TWO parts:
1. ANSWER (first): Give a direct, clear answer to what they asked. For predictions
   or future timing, always provide an ESTIMATE or approximate timeframe with your
   reasoning, even if not perfectly exact. For current-state questions (like salary,
   current situation), give your best assessment based on the chart — don't refuse.
   Example: If they ask "when will I marry?", start with: "Based on your chart,
   around age 28-30, likely in the next 2-3 years during favorable dasha periods."
2. EXPLANATION (second): Then explain WHY — ground it in their actual chart data
   (house positions, planet placements, dasha timing). Make the astrology clear
   and understandable.`;

/*
 * What must be true of every word, wherever it is written. Never optional.
 */
const TRUTH_RULES = `ACCURACY & INTEGRITY (never break these):
- Use ONLY the supplied chart data. Never invent planets, signs, houses,
  nakshatras or dashas.
- Each planet has an exact "house" and "sign" in the data — always use those
  values. NEVER guess a planet's house from its sign (Capricorn does NOT mean
  the 10th house).
- A plain "Nth house" ALWAYS means the BIRTH CHART, and must match
  birth_chart_facts exactly. The divisional charts label their own houses
  (house_in_D9, house_in_D10 …) and transits label theirs
  (transit_house_from_lagna). If you use one of those, say so in the SAME
  sentence — "D10 mein Sun 6th house mein hai", "Jupiter abhi gochar mein 1st
  house se guzar raha hai". Writing a D10 or transit number as a plain "Nth
  house" states something false about this person's birth chart.
- NEVER fabricate specific facts. Do not make up exact dates, ages, amounts,
  names or events that are not derivable from the data. For TIMING, use only the
  dasha/transit periods actually given, and express it as an approximate window
  (e.g. "during your Venus–Moon period, around 2025–2026"), never a precise day
  or a guaranteed event.
- If the chart genuinely cannot answer what was asked, say so honestly and
  explain what it CAN indicate — do not invent an answer to seem certain.

CARE & ETHICS (do this naturally, never as a stiff disclaimer):
- Be hopeful and constructive. Never scare the person or give doom predictions.
- Speak in tendencies and possibilities, not absolute guarantees.
- NEVER predict death, lifespan, terminal illness, or guarantee negative
  outcomes (divorce, accident, failure, miscarriage). For health, marriage,
  children or money, speak of supportive vs. challenging periods only, gently,
  and point to a qualified professional for real decisions.
- Don't diagnose disease or give specific medical/financial/investment commands;
  guide gently and suggest a professional where it truly matters.
- For sensitive topics, close with one short, kind line that astrology offers
  guidance, not certainty.`;

export const SYSTEM_PROMPT = `${PERSONA}

${VOICE_RULES}

${TRUTH_RULES}`;

/** The same astrologer, writing a report instead of talking. */
export const REPORT_SYSTEM = `${PERSONA}

${TRUTH_RULES}`;


/**
 * The languages a client may ask for.
 *
 * Worth validating against, because the chosen value is also used as part of a
 * cache key in the reports table — an arbitrary string there lets a caller
 * collide with another surface's namespaced key and corrupt their own cache.
 */
export function isSupportedLanguage(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const k = v.trim().toLowerCase();
  // `hasOwnProperty`, not `in`: `in` walks the prototype chain, so
  // "constructor", "toString" and "__proto__" all passed — defeating the very
  // cache-key hardening this exists for, and putting
  // "function Object() { [native code] }" into the prompt.
  return k === "hinglish" || Object.prototype.hasOwnProperty.call(LANGUAGE_NAMES, k);
}

/** Normalised language code, or the fallback if unsupported. */
export function normalizeLanguage(v: unknown, fallback = "en"): string {
  return isSupportedLanguage(v) ? String(v).trim().toLowerCase() : fallback;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi (Devanagari script)",
  ta: "Tamil",
  te: "Telugu",
  mr: "Marathi",
  bn: "Bengali",
  gu: "Gujarati",
  kn: "Kannada",
  ml: "Malayalam",
  pa: "Punjabi",
  ur: "Urdu",
};

/*
 * The reply language — and the one thing that kept overriding it.
 *
 * A model matches the language of whatever it read most recently, and the most
 * recent thing in a chat prompt is the person's own question. Someone with
 * English selected who types "meri shaadi kab hogi" got a Hindi answer, every
 * time, because nothing in the prompt said that their typing is not a request.
 * Saying so explicitly is the whole fix.
 */
function languageInstruction(language: string): string {
  const key = (language || "en").toLowerCase();
  const target = key === "hinglish"
    ? "Hinglish (conversational Hindi written in Roman/English script)"
    : (LANGUAGE_NAMES[key] || language); // allow any language name passed through
  return `VERY IMPORTANT — LANGUAGE: Write your ENTIRE reply in ${target} ONLY. ` +
    `Do not mix in another language or script. Example wording in these instructions is there to show TONE, never language. ` +
    `THE LANGUAGE THEY TYPED IN IS IRRELEVANT — DO NOT MATCH IT: their question may arrive in any script, whatever language is selected here. ` +
    `That is normal and is never a signal to switch. Reply in ${target} regardless of what they typed in.`;
}

// ---------------------------------------------------------------------------
// Question categorization
// ---------------------------------------------------------------------------
export type Category =
  | "career" | "wealth" | "health" | "marriage"
  | "relationship" | "business" | "foreign" | "education" | "general";

const CATEGORY_KEYWORDS: Record<Exclude<Category, "general">, string[]> = {
  career: ["career", "job", "naukri", "promotion", "growth", "profession", "work", "office", "salary"],
  wealth: ["wealth", "money", "paisa", "dhan", "finance", "income", "rich", "savings", "property", "gain"],
  health: ["health", "disease", "bimari", "sehat", "illness", "body", "fitness", "medical"],
  marriage: ["marriage", "shaadi", "shadi", "vivah", "spouse", "wife", "husband", "wedding"],
  relationship: ["relationship", "love", "pyaar", "partner", "girlfriend", "boyfriend", "breakup", "rishta"],
  business: ["business", "vyapar", "startup", "venture", "entrepreneur", "trade"],
  foreign: ["foreign", "abroad", "videsh", "overseas", "immigration", "visa", "settle abroad"],
  education: ["education", "study", "studies", "padhai", "exam", "degree", "college", "university", "competitive", "vidya", "course"],
};

export function detectCategory(question: string): Category {
  const q = question.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => q.includes(w))) return cat as Category;
  }
  return "general";
}

// ---------------------------------------------------------------------------
// Chart packet construction (only relevant normalized data → Gemini)
// ---------------------------------------------------------------------------
function getHouse(chart: any, n: number) {
  return (chart.d1_chart?.houses ?? []).find((h: any) => h.house === n) ?? null;
}
function getPlanet(chart: any, name: string) {
  return (chart.planet_positions ?? []).find((p: any) => p.planet === name) ?? null;
}
function houseLordPlacement(chart: any, n: number) {
  const house = getHouse(chart, n);
  if (!house) return null;
  const lord = house.sign_lord;
  const placement = getPlanet(chart, lord);
  return { house: n, sign: house.sign, lord, lord_placement: placement };
}

interface PacketConfig {
  houses: number[];
  planets: string[];
  includeD9: boolean;
  includeNext7: boolean;
  divisionals: Array<"D6" | "D10" | "D11">; // extra varga charts relevant to the topic
}

const PACKET_CONFIG: Record<Category, PacketConfig> = {
  career: { houses: [6, 10, 11], planets: ["Sun", "Saturn", "Mercury", "Mars"], includeD9: true, includeNext7: true, divisionals: ["D10"] },
  wealth: { houses: [2, 5, 9, 11], planets: ["Jupiter", "Venus", "Mercury"], includeD9: false, includeNext7: true, divisionals: ["D11"] },
  health: { houses: [1, 6, 8, 12], planets: ["Moon", "Mars", "Saturn", "Rahu", "Ketu"], includeD9: false, includeNext7: true, divisionals: ["D6"] },
  marriage: { houses: [7], planets: ["Venus", "Jupiter", "Mars", "Rahu", "Ketu"], includeD9: true, includeNext7: true, divisionals: [] },
  relationship: { houses: [5, 7], planets: ["Venus", "Moon", "Mars"], includeD9: true, includeNext7: true, divisionals: [] },
  business: { houses: [7, 10, 11], planets: ["Mercury", "Sun", "Jupiter", "Mars"], includeD9: false, includeNext7: true, divisionals: ["D10", "D11"] },
  foreign: { houses: [3, 7, 9, 12], planets: ["Rahu", "Saturn", "Moon"], includeD9: false, includeNext7: true, divisionals: [] },
  education: { houses: [2, 4, 5, 9], planets: ["Mercury", "Jupiter", "Moon", "Sun"], includeD9: false, includeNext7: true, divisionals: [] },
  general: { houses: [1, 4, 7, 10], planets: [], includeD9: true, includeNext7: true, divisionals: [] },
};

/** Compact a divisional chart to { ascendant_sign, planets:[{planet,sign,house}] }. */
/*
 * A divisional chart, with its house numbers LABELLED AS ITS OWN.
 *
 * Every divisional used to carry a plain `house` field, exactly like the birth
 * chart's. An audit of generated reports found one placement claim in five was
 * false — "Sun in the 6th house" for a Sun sitting in the 9th — and every
 * single one traced back to a divisional: the model read D10's "house: 6" and
 * wrote it as a birth-chart fact. None were invented. So the key itself now
 * says which chart it belongs to; "house_in_D10" cannot be mistaken for the
 * birth chart the way a second "house" could.
 */
function compactDivisional(c: any, tag = "Dx") {
  if (!c) return null;
  return {
    chart: tag,
    ascendant_sign: c.ascendant_sign ?? "",
    planets: (c.planet_positions ?? []).map((p: any) => ({
      planet: p.planet,
      sign: p.sign,
      [`house_in_${tag}`]: p.house,
      retrograde: p.retrograde,
    })),
  };
}

/**
 * The birth chart's placements as plain sentences — the only placements a
 * reading may state as "<planet> in the Nth house".
 *
 * Handed over in words as well as JSON because a model is much less likely to
 * cross two numbers it reads as a sentence than two it reads as fields.
 */
export function birthChartFactSheet(chart: any): string {
  const ord = (n: number) => {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const lines = (chart?.planet_positions ?? []).map((p: any) =>
    `${p.planet} — ${p.sign}, ${ord(p.house)} house${p.retrograde ? " (retrograde)" : ""}`,
  );
  const lagna = chart?.ascendant?.sign || chart?.d1_chart?.ascendant_sign || "";
  /*
   * House lords, stated rather than left to be counted. Without them the model
   * counts signs from the lagna in its head and miscounts — "Venus, your 10th
   * lord" for a Gemini lagna whose 10th lord is Jupiter, twice in six live
   * answers. Grouped by planet so it reads as the sentence people are told:
   * "Saturn rules the 8th and 9th".
   */
  /*
   * Listed house by house, not planet by planet.
   *
   * "Mercury rules 1 & 4" reads fine and is still the wrong shape: asked which
   * planet rules the 1st, a model scans for "1st" and finds the nearest planet
   * name — which is whatever SITS there. A report called Jupiter "your 1st
   * lord" three times in a row for a chart whose 1st lord is Mercury, because
   * Jupiter is the planet sitting in the 1st. One entry per house, in order,
   * removes the question.
   */
  const lordOf = (chart?.d1_chart?.houses ?? [])
    .filter((h: any) => h?.house && h?.sign_lord)
    .sort((a: any, b: any) => Number(a.house) - Number(b.house))
    .map((h: any) => `${ord(Number(h.house))} ${h.sign_lord}`);
  const lordLine = lordOf.length
    ? `House lords (a planet SITTING in a house does not rule it): ${lordOf.join(", ")}`
    : "";
  return [`Lagna (1st house): ${lagna}`, ...lines, lordLine].filter(Boolean).join("; ");
}

/**
 * The COMPLETE chart context — every chart (D1, D9, D10, D6, D11) plus dasha.
 * Used for all predictions so the AI cross-references all divisional charts
 * together for maximum accuracy, instead of looking at only one chart.
 */
/**
 * The chart, as much of it as the question actually needs.
 *
 * Every divisional was sent on every call — D9, D10, D6 and D11, about 650
 * tokens each — so a question about marriage carried the career, health and
 * gains charts along with it. That is 2,000 tokens of context the model was
 * told to ignore, on every message.
 *
 * It cost three ways. Money, since a free tier is a discount and not a
 * business model. Attention, because a constraint that has to survive ten
 * thousand tokens of JSON is a constraint that sometimes does not — the
 * instructions this file kept "ignoring" were competing with charts nobody
 * asked for. And availability: Groq's free tier caps a request at 8,000
 * tokens, so the privacy-safe provider was rejecting every chat with a 413
 * and leaving Gemini as the only one able to answer.
 *
 * PACKET_CONFIG already knows which vargas each topic needs. It is now
 * believed. D9 stays wherever the topic marks it useful, since navamsa reads
 * on almost everything.
 */
export function buildFullChartContext(chart: any, cfg?: PacketConfig) {
  const wants = (d: "D6" | "D10" | "D11") => !cfg || cfg.divisionals.includes(d);
  const wantsD9 = !cfg || cfg.includeD9;
  return {
    // Read this before anything else: the only "<planet> in the Nth house"
    // statements that are true of THIS person's birth chart.
    birth_chart_facts: birthChartFactSheet(chart),
    birth_summary: chart.summary,
    /*
     * The calculation basis, WITHOUT the birth datetime.
     *
     * `settings.datetime` is the exact date and time of birth, and it was going
     * to every AI provider on every call — while the privacy policy told people
     * "Never sent: date of birth, time of birth". A policy that claims
     * something untrue is worse than one that discloses plainly, and this was
     * live.
     *
     * Nothing needed it. The model reads the chart, the dasha dates, `today`
     * and `age_years`; the raw moment of birth adds nothing to an answer. So it
     * is not weakened here, it is removed — which is what "send the minimum the
     * reading needs" actually means.
     */
    settings: {
      zodiac: chart.settings?.zodiac,
      ayanamsa: chart.settings?.ayanamsa,
      house_system: chart.settings?.house_system,
    },
    ascendant: chart.ascendant,
    // D1 planets (house+sign+nakshatra) — the house layout is derivable from this,
    // so we don't also send the verbose houses[] array (keeps the prompt lean).
    d1_rasi: {
      ascendant_sign: chart.d1_chart?.ascendant_sign ?? "",
      planets: (chart.planet_positions ?? []).map((p: any) => ({
        planet: p.planet,
        sign: p.sign,
        house: p.house,
        nakshatra: p.nakshatra,
        retrograde: p.retrograde,
      })),
    },
    d9_navamsa: wantsD9 ? compactDivisional(chart.d9_chart, "D9") : undefined,
    d10_dasamsa_career: wants("D10") ? compactDivisional(chart.divisional_charts?.D10, "D10") : undefined,
    d6_shashtamsa_health: wants("D6") ? compactDivisional(chart.divisional_charts?.D6, "D6") : undefined,
    d11_ekadasamsa_gains: wants("D11") ? compactDivisional(chart.divisional_charts?.D11, "D11") : undefined,
    dasha: {
      current: chart.dasha?.current ?? null,
      next_7_years: chart.dasha?.next_7_years ?? [],
      // Several prompts ask the model to read the earlier phase of life "from
      // the dashas that already ran". Without this it had none, so any past
      // claim with a date on it was invented — and an invented statement about
      // someone's own past is the most convincing kind of wrong there is.
      past: recentPastDashas(chart),
    },
    // Both of these are computed deterministically elsewhere in the app, and
    // several prompts already told the model to reason about "any Dhana yogas"
    // and "any Manglik factor" — without supplying either. Manglik especially
    // matters: it is a socially loaded verdict in Indian matchmaking, and an
    // invented one can affect a real decision.
    yogas: detectYogas(chart).yogas.map((y) => ({ name: y.name, summary: y.summary })),
    manglik: isManglik(chart),
  };
}

/** Mars in 1/2/4/7/8/12 from the Lagna OR the Moon — the standard combined rule. */
function isManglik(chart: any): boolean | null {
  const planets: any[] = chart?.planet_positions ?? [];
  const mars = planets.find((p) => p.planet === "Mars");
  const moon = planets.find((p) => p.planet === "Moon");
  if (!mars || !moon || mars.sign_id == null || moon.sign_id == null) return null;
  const ascSign = chart?.d1_chart?.houses?.find((h: any) => h.house === 1)?.sign_id;
  if (ascSign == null) return null;
  const houseFrom = (s: number, ref: number) => ((s - ref + 12) % 12) + 1;
  const houses = [1, 2, 4, 7, 8, 12];
  return houses.includes(houseFrom(mars.sign_id, ascSign))
    || houses.includes(houseFrom(mars.sign_id, moon.sign_id));
}

/** The last few antardashas that have already finished, oldest→newest. */
function recentPastDashas(chart: any, limit = 8) {
  const list: any[] = chart?.dasha?.antardasha ?? [];
  const now = Date.now();
  return list
    .filter((a) => {
      const to = new Date(a.to).getTime();
      return Number.isFinite(to) && to < now;
    })
    .slice(-limit)
    .map((a) => ({ period: a.label ?? a.lord, from: a.from, to: a.to }));
}

/**
 * A plain sentence about how old this person is, and what that rules out.
 *
 * Written from a number we computed, not left for the model to infer, and
 * placed on its own next to the question rather than in the rules — because
 * with the rule alone it still promised a seventy-eight-year-old a wedding
 * inside two years.
 */
function lifeStageNote(age: number | null): string {
  if (age == null || age < 0 || age > 130) return "";
  const head = `\nIMPORTANT — THIS PERSON IS ${age} YEARS OLD TODAY.\n`;
  if (age >= 60) {
    return head +
      `At this age a first marriage, the start of a career, or the birth of a first ` +
      `child are almost certainly in their PAST, not their future. Do NOT predict any ` +
      `of them as coming. Speak about those windows in the past tense, and if you need ` +
      `to know what actually happened, ASK — do not assume. If this chart was made for ` +
      `a parent, a grandparent or someone who has passed away, say so gently and check ` +
      `before reading anything as their future.\n`;
  }
  if (age >= 40) {
    return head +
      `A first marriage or the start of a career has most likely already happened. ` +
      `Ask before predicting either as still to come, and describe a window that has ` +
      `passed in the past tense.\n`;
  }
  if (age < 18) {
    return head +
      `Do not discuss marriage timing, romance or anything sexual for a minor. Keep to ` +
      `studies, temperament, family and health, and say plainly why.\n`;
  }
  // Nothing for an ordinary adult age. It used to announce the age on every
  // single message — a line of noise for no gain, since the number is already
  // in the packet for the cases that actually need it.
  return "";
}

/*
 * Always serialised COMPACT (no `null, 2`) at every call site.
 *
 * Pretty-printing this packet added ~5,000 characters — about 1,400 tokens — of
 * pure indentation, and that pushed the chat prompt over Groq's 8,000
 * token-per-request ceiling. Both strong models answered 413 "Request too
 * large" and the chat silently fell through to the smallest 20B model, which
 * ignored the answer format entirely and replied with generic advice carrying
 * no chart, no timing and no reason. The whitespace was the whole difference
 * between a real reading and a fortune-cookie.
 */
export function buildChartPacket(chart: any, category: Category, transit?: any) {
  // Never crash on an unrecognised category — fall back to the general packet.
  const cfg = PACKET_CONFIG[category] ?? PACKET_CONFIG.general;

  // Always include EVERY chart, then add a "focus" block pointing the AI at the
  // houses/planets/vargas most relevant to the question's topic.
  /*
   * Where each focus house's lord sits, in the same few fields every other
   * placement in the packet uses. This used to carry the lord's whole planet
   * record — longitude, sign_id, pada, the sign's own lord — twice for a lord
   * that rules two focus houses: hundreds of tokens of numbers no answer reads,
   * on the free tier where every token is a slice of someone's next question.
   */
  const focusHouses = cfg.houses.map((n) => {
    const h = getHouse(chart, n);
    const l = houseLordPlacement(chart, n);
    const lp = l?.lord_placement;
    return {
      house: n,
      sign: h?.sign ?? "",
      planets_in_house: h?.planets ?? [],
      lord: l?.lord ?? null,
      lord_in_house: lp?.house ?? null,
      lord_in_sign: lp?.sign ?? null,
    };
  });

  /*
   * For a general question this listed EVERY planet — which is exactly what
   * all_charts.d1_rasi.planets already holds, sent again under another key a
   * few lines later. A focus block that highlights everything highlights
   * nothing, and it duplicated several hundred tokens on the commonest kind of
   * question.
   */
  const focusPlanets =
    category === "general"
      ? []
      : cfg.planets
          .map((name: string) => getPlanet(chart, name))
          .filter(Boolean)
          .map((p: any) => ({
            planet: p.planet, sign: p.sign, house: p.house, degree: p.degree,
            nakshatra: p.nakshatra, retrograde: !!p.retrograde,
          }));

  /*
   * Today, and how old this person is today — computed here, never left to the
   * model.
   *
   * Neither fact was ever in the prompt, so every period read as if it were
   * ahead. A chart made for someone in their seventies was told their time was
   * looking good and given a marriage yoga; someone already married was given a
   * future wedding date. Both are the same mistake: describing a window that
   * closed decades ago in the future tense, because nothing said when "now" is.
   *
   * Models are unreliable at date arithmetic and reliable at comparing two
   * numbers they are handed, so they are handed.
   */
  const dob = String(chart.birth_details?.date_of_birth ?? "");
  const born = Date.parse(dob + "T00:00:00Z");
  const today = new Date();
  const ageYears = Number.isFinite(born)
    ? Math.floor((today.getTime() - born) / (365.2425 * 86_400_000))
    : null;

  return {
    category,
    // Everything below is relative to THIS date. Anything earlier has happened.
    today: today.toISOString().slice(0, 10),
    age_years: ageYears,
    all_charts: buildFullChartContext(chart, cfg),
    live_transit: transit ?? null,
    focus: {
      note: `Most relevant for "${category}" — but still cross-check all charts above.`,
      houses: focusHouses,
      planets: focusPlanets,
      key_divisionals: cfg.divisionals,
    },
  };
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/** Answer a single chart-based question (category-aware packet, 4-phase format). */
export async function answerQuestion(args: {
  chart: any;
  question: string;
  language: string;
  category: Category;
  transit?: any; // live gochar context (optional) for accurate present/future
  mode?: "general" | "transit"; // "transit" = a transit-focused conversation
}): Promise<string> {
  const packet = buildChartPacket(args.chart, args.category, args.transit);

  const transitFocus =
    args.mode === "transit"
      ? `\nTHIS IS A LIVE-TRANSIT CONVERSATION: the person is asking from the live
transit (gochar) screen. Read the "live_transit" block as the PRIMARY lens — where
the planets are RIGHT NOW relative to their natal lagna and moon — and CONFIRM it
against all the natal charts (D1, D9, D10, D6, D11) and the running dasha. Center the
PRESENT and near-FUTURE on these current transits (Sade Sati, Jupiter/Saturn/Rahu-Ketu
movements, etc.).\n`
      : "";

  const prompt = `${SYSTEM_PROMPT}
${transitFocus}
${languageInstruction(args.language)}

This person's COMPLETE chart data (already calculated — interpret ONLY this). It
contains every chart: D1 rasi, D9 navamsa, D10 dasamsa, D6 shashtamsa, D11
ekadasamsa, the full dasha timeline, AND "live_transit" (the planets' positions
RIGHT NOW relative to their natal lagna and moon). The "focus" block highlights what
matters most for this topic (${args.category}), but read and CROSS-REFERENCE all the
charts together — confirm each conclusion across D1 and the relevant divisional
charts. Use the dasha + live_transit together for anything about the present and the
near future. Do not rely on just one chart.
${JSON.stringify(packet)}

They asked you: "${args.question}"

RESPONSE FORMAT — your reply MUST be in FOUR clearly-labelled phases, IN THIS ORDER.
Each phase starts with its OWN short heading on its own line — write ONLY the heading
name itself (e.g. "Answer", "Past", "Present", "Future (next 1-2 years)") in the
reply's language; do NOT prefix it with "PHASE 1", numbers, or dashes. Under each
heading use short bullet points (start each point with "• "). Where useful add a tiny
sub-heading line inside a phase. Keep it clean and well-structured.

ANSWER (heading like "Answer" / "Seedha Jawab"): the direct answer to
EXACTLY what they asked, first, in 1-2 lines.
  • For predictions / future timing: commit to a concrete window taken from the
    dasha/antardasha dates you were given (e.g. "around 2028-2030"). Say it is
    approximate. These dates are real data — use them, do not hedge them away.
  • For things a chart genuinely cannot show — a salary figure, an exact date, a
    medical diagnosis — say so in ONE short line, then give what it CAN show:
    the supportive dasha window, the area of life, the direction of the trend.
    A number you invented is worse than an honest sentence.

PAST (heading like "Past" / "Bhootkaal"): what the chart (and the dashas
that already ran) suggest about the earlier phase of life RELEVANT to this question.
A few crisp points grounded in their houses/planets/past dasha.

PRESENT (heading like "Present" / "Vartaman"): their current situation in
this area — tie it to the CURRENT running mahadasha/antardasha AND the live_transit
(e.g. where Saturn/Jupiter/Rahu-Ketu are transiting now). A few clear points.

FUTURE (heading like "Future (next 1-2 years)" / "Aane wala samay"): the
near-future outlook with TIMING from the upcoming dasha/antardasha dates and current
transits. Give windows/periods, stay constructive.

BE SPECIFIC — NEVER VAGUE (this is the MOST important quality rule):
Every prediction or statement about the past, present or future MUST be turned into
concrete, real-world specifics so the reader understands EXACTLY what you mean. A
general line on its own is not acceptable — always follow it with precise examples
or named possibilities grounded in the chart.
  • Instead of "work related to communication", name what that can actually be —
    e.g. **content creation / writing**, **law (lawyer/advocate)**, **teaching or
    training**, **media / journalism**, **sales, marketing or PR**.
  • For health, speak about CARE, not diagnosis — the 6th house and lagna lord can
    suggest where to be attentive (rest, diet, stress, routine) and when, but never
    name a condition, an organ or a surgery. That is a doctor's job, not a chart's.
  • Instead of "things will improve", say HOW, in WHAT, and WHEN — name the area,
    and give a concrete time-window from the dasha (months / years / an age range,
    e.g. **between 2026 and 2028**).
  • For people/partners, fields, money, places — give concrete types, directions,
    or levels (e.g. **a partner from a different city / profession**, **a government
    or finance-related field**, **a property in the next 2-3 years**).
Pick the 2-3 MOST chart-supported possibilities and say which is most likely — do
not list ten vague options. Precision builds the reader's trust.

EMPHASIS — bold the important parts (so the reader can skim):
Wrap the key words, names, fields, time-windows and the single most important line
of EACH phase in **double asterisks** to make them bold. Bold only the crucial
~15-20% — never whole paragraphs. This lets the user grasp the answer at a glance.

Formatting: each phase heading on its own line, then "• " bullet points. Use **bold**
for emphasis as above. Do NOT use "#", "---", tables, or any other markdown — only
"• " for bullets and "**" for bold.

MATCH DEPTH TO THE QUESTION:
- Very short/casual/yes-no question → keep each phase to ONE short point.
- "detail mein / vistaar se / explain / fully" or a long question → expand each phase
  with several well-reasoned points and clear timing.
- Otherwise → a balanced medium length, 2-3 points per phase.

Always: keep it about what they asked, use real dasha dates + live transits for
timing, warm human tone — structured but not cold or robotic.

${languageInstruction(args.language)}`;

  // Tries each configured AI provider in turn. No output cap — the answer length
  // adapts to the question (see prompt). thinkingBudget:0 keeps Gemini 2.5 from
  // spending tokens on hidden reasoning and avoids truncation.
  return await generateChecked(prompt, args.chart, args.transit, { temperature: 0.8, thinkingBudget: 0, purpose: "ask" });
}

/**
 * A consultation reply from one of the 5 AI Astrologer personas, as a short
 * sequence of WhatsApp-style chat bubbles.
 *
 * Same chart engine as answerQuestion (same buildChartPacket, same divisional
 * charts + dasha + transit) — only the persona voice/focus differs. `history` is
 * the recent turns of THIS consultation so the astrologer keeps context and
 * never repeats a generic answer.
 */
export async function answerAsAstrologer(args: {
  chart: any;
  question: string;
  userName?: string;
  memory?: string;
  language: string;
  personaPrompt: string;
  focusCategory: Category;
  transit?: any;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<string[]> {
  const packet = buildChartPacket(args.chart, args.focusCategory, args.transit);

  const convo = (args.history ?? [])
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "You"}: ${m.text}`)
    .join("\n");

  const prompt = `${args.personaPrompt}

${languageInstruction(args.language)}

This person's COMPLETE calculated chart (interpret ONLY this — D1, D9, D10, D6,
D11, the full dasha timeline, and "live_transit" = planets right now vs their
natal lagna & moon). The "focus" block is what matters most for your speciality,
but cross-reference the charts and use dasha + live_transit for present/future.
${JSON.stringify(packet)}
${args.memory ? `\nWHAT YOU ALREADY KNOW ABOUT THIS PERSON (your own notes from past
conversations — use it naturally, like a family astrologer who remembers them.
Do NOT recite it back or say "as you told me earlier" every time):
${args.memory}\n` : ""}${convo ? `\nThis consultation so far:\n${convo}\n` : ""}
The person's first name is "${args.userName || ""}" — use it sparingly and ONLY
if it is non-empty; never write a placeholder like [Name].

The user now says: "${args.question}"

Reply now as your persona, following the pandit-ji rules above exactly:
read their chart, acknowledge the feeling behind the question if there is one,
then give a real, grounded answer with timing and one practical step.
2-3 messages separated by lines of only "|||", no preamble message.`;

  // Same fact-check as the main chat: a persona's voice is no licence to get the chart wrong.
  const raw = await generateChecked(prompt, args.chart, args.transit, { temperature: 0.8, thinkingBudget: 0, purpose: "consult" });
  return splitBubbles(raw);
}

/** What the app can do — so the ONE chat can also answer "how do I use X". Kept
 *  short and factual; the model must not invent features that aren't here. */
export const APP_GUIDE = `JanamJyot app — what it does (answer feature questions from THIS list only, never invent a feature):

If they ask what you can do, answer in the FIRST PERSON as things YOU do for
them — "main aapki kundli padh ke..., main aapka milan kar sakta hoon" — not as
a tour of menus. Six or seven short lines, the most useful first, and end by
inviting the next question. Say plainly that you can also DO some of these
right here in the chat (matching, reports, the forecast) rather than only
talk about them.
• Janam Kundli — full birth chart (D1) plus divisional charts D9, D10, D6, D11.
• Dasha timeline — Vimshottari mahadasha/antardasha with dates.
• Daily guidance / "Aaj ka din" — today's clear line + a Reason with the real placements; a notification comes each morning.
• Right Now — is this a good moment (choghadiya + Rahu Kaal) to start something.
• Panchang, Choghadiya, Hora, Muhurat calendar.
• Kundli Matching (36 gunas) with PDF.
• Full Life Report, and focused reports (career, wealth, marriage) with PDF.
• This chat — ask anything about your chart, today/tomorrow, or the app.
• Free: everyday things (kundli, charts, panchang, daily guidance, 2 kundlis). Deep readings use credits; a ₹1 trial opens everything for 3 days.`;

/*
 * The two optional parts of a chat prompt, sent only when a question can use
 * them (see promptNeeds). Kept word-for-word as they were when they went out
 * with every question.
 */
const PART4_TASKS = `PART 4 — a task (after a "<<DO>>" marker), OPTIONAL:
  • You can also DO things, not only talk about them. If the person is asking
    for one of these — not merely mentioning it — write the marker "<<DO>>" on
    its own line and then EXACTLY ONE of these words, nothing else:
      match        they want a kundli matched with someone
      life_report  they want their full life report
      timeline     they want their next years laid out
      career       they want a career report
      wealth       they want a money/wealth report
      marriage     they want a marriage report
      d1           they want to SEE their birth chart / lagna kundli / D1
      d9           they want to SEE their navamsa / D9 chart
      pdf          they want their life report as a PDF to keep or send
      decide       they are stuck on a REAL DECISION and want help making it —
                   "message karun ya nahi", "job chhod doon", "ghar mein bata
                   doon". Write this whenever the question is a choice they have
                   to make, not a prediction they want.
      add_person   the question is about SOMEONE ELSE's own life and needs that
                   person's kundli — write this whenever you have just told them
                   you cannot answer for another person from this chart, so the
                   offer is something they can act on rather than a suggestion
  • The app turns this into a real action for them — for "match" it opens the
    other person's details right inside the chat and runs the real matching;
    for "d1"/"d9" the chart is DRAWN under your message; for "pdf" the file is
    built and handed to them there.
  • With "d1" or "d9", the chart appears right below what you wrote. Use PART 1
    to say what it MEANS for them in one or two plain lines — the kind of person
    it describes, the area of life it leans on — and keep every planet name,
    house number and yoga in PART 2 where they belong. "Aapka Lagna Mithun hai,
    jisme Shani virajmaan hain, 7th house mein Budh-Shukra ki yuti" is PART 2
    written in the wrong place. After this they can ask about anything in the
    chart and you are both looking at the same one.
  • Do NOT write this marker for an ordinary question that merely touches the
    topic. "Meri shaadi kab hogi?" is a question, answer it. "Meri kundli
    match kar do" is a task. When in doubt, leave it out.
  • In PART 1, do not describe the form or tell them to go elsewhere in the
    app — just answer warmly and let the action appear.

`;

const PART5_FACTS = `PART 5 — facts they just confirmed (after a "<<FACTS>>" marker), OPTIONAL:
  • If THIS message states something factual about their own life, record it as
    "key: value" lines, one per line, so it is never asked for or contradicted
    again. Use these keys where they fit:
      marital_status (single/married/divorced/widowed) · marriage_year ·
      children (a number) · employment · job_title · city · studying ·
      health_note · partner_name
  • ONLY what THEY stated. Never what you inferred, never what the chart
    suggests, never a maybe. "Meri shaadi 2021 mein hui" gives
    marital_status: married and marriage_year: 2021. "Shaadi ka soch raha hoon"
    gives nothing.
  • If they correct something, write the new value — the newest statement wins.
  • Nothing to record? Leave it out entirely.

`;

/** One earlier chat turn, kept to its gist. */
function gist(text: unknown, max = 280): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/*
 * Which optional prompt parts a message can use.
 *
 * Deliberately generous — a missed task is a button that did not appear, while
 * an extra part only costs tokens — so anything that looks like a request, a
 * mention of another person, or a statement about their own life opts in.
 * A short reply to a question we just asked ("haan, married hoon") counts as a
 * statement too: it is usually the answer that fact was waiting for.
 */
export function promptNeeds(question: string, history?: { role: string; text: string }[]) {
  const q = String(question || "").toLowerCase();
  /*
   * A choice they have to make, not a prediction they want. These are what the
   * "decide" action is for, and without them PART 4 never goes out for the
   * exact messages this app is best at — "usse message karun ya nahi".
   */
  const isDecision =
    /\b(ya nahi|ya na|karun|karoon|karu|karoo|kar doon|kar dun|de doon|de dun|bhej doon|bhejun|bhej dun|chhod doon|chhod dun|bata doon|bata dun|le loon|le lun|should i|shall i|kya karun|kya karoon|faisla|decide|decision)\b/.test(q) ||
    /(करूँ|करूं|या नहीं|फ़ैसला|फैसला|बता दूँ|छोड़ दूँ)/.test(q);
  const actions =
    isDecision ||
    /\b(match|matching|milan|milao|mila|report|pdf|timeline|download|share|d1|d9|navamsa|navamsh|navansh|lagna|chart|kundli|kundali|janam ?patri|dikha|dikhao|dikhaiye|bana|banao|banaiye|bhejo|add)\b/.test(q) ||
    /(मिलान|मिला|रिपोर्ट|पीडीएफ|कुंडली|कुण्डली|चार्ट|दिखा|बना|नवांश|लग्न)/.test(q) ||
    /\b(bhai|bhaiya|behen|bahen|didi|papa|pita|pitaji|mummy|mumma|maa|mother|father|mom|dad|pati|patni|husband|wife|beta|beti|son|daughter|dost|friend|boyfriend|girlfriend|bf|gf|partner|fiance|fiancee|sasur|saas|bhabhi|jiju|uncle|aunty|chacha|chachi|mama|mami|nana|nani|dada|dadi|brother|sister|uska|uski|uske|unka|unki|unke|usko|unko)\b/.test(q) ||
    /(भाई|बहन|दीदी|पापा|पिता|मम्मी|माँ|माता|पति|पत्नी|बेटा|बेटी|दोस्त|सास|ससुर|भाभी|उसका|उसकी|उनका|उनकी)/.test(q);
  const lastYou = [...(history ?? [])].reverse().find((m) => m.role !== "user");
  const answeringUs = !!lastYou && /\?\s*$/.test(String(lastYou.text ?? "").trim()) && q.split(/\s+/).length <= 14;
  const facts =
    answeringUs ||
    /\b(19|20)\d\d\b/.test(q) ||
    /\b(married|unmarried|single|divorce|divorced|widow|widowed|engaged|shaadi ho|shaadi hui|shadi ho|shadi hui|shaadi nahi|shadi nahi|shaadi ki|meri wife|meri biwi|mere pati|my wife|my husband|bacche|bachche|bache|children|kids|job|naukri|business|kaam karta|kaam karti|student|padhai|padh raha|padh rahi|college|school|rehta|rehti|live in|i am a|i'm a|main ek|mai ek)\b/.test(q) ||
    /(शादी|विवाह|तलाक|बच्च|नौकरी|जॉब|बिज़नेस|व्यापार|पढ़ाई|रहता|रहती)/.test(q);
  return { actions, facts };
}

/**
 * The ONE universal chat answer.
 *
 * This is the deliberate opposite of answerQuestion's four-phase essay — that
 * structure is exactly the "friction" users complained about. Here the model
 * returns TWO parts, split by a marker:
 *
 *   • ANSWER — a short, direct, plain-language reply. No jargon, no "Shani is
 *     in your 8th" up here. Just what to do / what it means. This is what shows.
 *   • REASON — the astrological basis (planets, houses, dasha, transit). This is
 *     hidden behind a tap, for the user who wants to see WHY. Technical language
 *     belongs ONLY here.
 *
 * `dayContext` (today/tomorrow's computed day-signals) and `appGuide` are folded
 * in when relevant so "how is tomorrow" and "what does this feature do" both get
 * a grounded, non-vague answer.
 */

/*
 * How long an answer should be — decided per message, not fixed.
 *
 * The chat capped every reply at "up to eight short lines", and someone asking
 * "meri poori personality detail mein batao" got the same eight lines as
 * someone asking "aaj ka din kaisa hai". The sibling app classifies each
 * message first and answers a detailed question in full — that, more than
 * anything, is why its chat felt like a conversation and this one felt cut off.
 */
const DEPTH_CONTROLLER = `RESPONSE DEPTH — classify THIS message silently before writing anything:
  • QUICK — a small factual or yes/no question, or small talk ("okay", "thanks",
    "haan"). A sentence or two. Do not pad it.
  • NORMAL — an ordinary question, no extra detail asked for (most questions).
    A short, direct 1-3 sentence answer; the grounding goes in the reason.
  • DETAILED — they ask for it: "detail mein bataiye", "vistaar se", "poora/pura
    batao", "sab kuch batao", "puri jaankari do", "explain fully", "tell me
    everything", "har cheez batao" — or the question is inherently broad ("meri
    poori kundli / personality / life explain karo").
  • DEEP_DIVE — several connected questions at once ("rishta kaisa hoga, kitne
    bachche honge, kaise honge, sab detail mein"), or a complete reading of a
    whole area of life.

FOR DETAILED AND DEEP_DIVE:
  • PART 1 is NOT a short takeaway. It must completely answer what they asked,
    in plain language — someone who reads only PART 1 gets the whole reading.
  • DEEP_DIVE: silently break the message into every distinct sub-question and
    answer each one the chart has evidence for. Never answer the first two and
    stop. Never invent a count ("2 ya 3 bachche") the chart does not support —
    say what it can and cannot tell.
  • A direct answer in the first paragraph is the START, not the whole reply:
    the strongest indicators and what they mean, the good side, the difficult
    side if there is one, how it shows up in practice, timing when relevant,
    and how sure you are.
  • Before you finish, ask yourself: could they reply "maine detail maangi thi,
    ye to summary hai"? If yes, keep going. Depth comes from THEIR chart, never
    from generic filler.
Pick honestly — do not default to NORMAL out of habit.`;

/*
 * Answer the question that was asked, not the topic next to it.
 *
 * Two failures the sibling app had to fix and this one shared: "abhi kya chal
 * raha hai" answered with 2028, and "girlfriend milegi?" answered with the
 * marriage-timing window because both are "relationship-shaped".
 */
const INTENT_RULES = `ANSWER EXACTLY WHAT WAS ASKED — work out silently first: what exactly did
they ask, what kind of question is it (now, past, future, personality,
attraction, friendship, marriage, career, money, family, timing, or WHY
something happened), and which chart indicators answer THAT — not a nearby topic.
  • CURRENT MEANS CURRENT: "abhi", "currently", "is waqt", "aajkal" — answer
    from what is running NOW (the current period and live transit). Do not drift
    to 2028 or a wedding date unless they asked about the future.
  • Related is not the same: "shaadi kab hogi", "girlfriend/boyfriend milegi",
    "abhi kaun pasand aa raha hai" and "doston ke saath kya chal raha hai" are
    FOUR different questions. Never reuse the marriage window for the others.
      – attraction/romance → 5th house & lord, Venus, Moon, Rahu/Ketu, current period
      – marriage → 7th house & lord, Venus/Jupiter, D9, period activation
      – friends/social circle → 3rd & 11th and their lords, Mercury, Moon
      – career → 10th & lord, 6th & 11th, D10, current period
    Use only what matters in THIS chart — do not list them all.
  • Could this exact answer be sent to almost anyone unchanged? Rewrite it.`;

/*
 * A follow-up is not a new question.
 *
 * Asked the same thing twice, the chat restated its last answer in fewer words
 * — when the person was asking again BECAUSE the last answer did not land.
 */
const FOLLOW_UP_RULES = `THIS IS A FOLLOW-UP in an ongoing conversation — continue it, do not start over:
  • Is this basically the SAME question you already answered, reworded? Then
    the last answer did not satisfy them. Do NOT restate it shorter — go deeper:
    factors you did not mention before, a sharper timing breakdown, or concrete
    guidance. A repeated question earns a FULLER answer.
  • Are they CORRECTING you ("future nahi, abhi ka batao", "maine ye nahi
    poocha")? That is an override. Re-answer with the corrected framing —
    genuinely change the analysis, do not rephrase the old one.
  • Otherwise keep it natural and do not repeat what you already told them
    (their periods, placements, timing) — refer back briefly only if useful.
    If this follow-up itself asks for full detail, the depth rules win.`;

export async function answerUniversal(args: {
  chart: any;
  question: string;
  language: string;
  category: Category;
  transit?: any;
  dayContext?: any;   // compact day-signals for a date the question is about
  pastContext?: any;  // the periods lived through, when the question is about the past
  appGuide?: string;  // APP_GUIDE, included when the question is about the app
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  userName?: string;  // the person's first name — so the chat never asks who they are
  memory?: string;    // what earlier conversations established about them
  suggested?: string[]; // follow-ups already offered — never repeat one
  /** What the PERSON has confirmed about their life. Outranks the chart. */
  facts?: Record<string, string | number | boolean>;
  isFirst?: boolean;  // their very first question — it decides whether they stay
  /** A linked person (Rishta): their calculated chart summary and the computed match. */
  relation?: any;
}): Promise<{ answer: string; reason: string; next: string[]; action?: string; facts?: Record<string, string | number> }> {
  const packet: any = buildChartPacket(args.chart, args.category, args.transit);

  /*
   * Only the prompt THIS question needs.
   *
   * A chat was ~7,000 tokens, and the free Groq tier allows 8,000 a minute per
   * model — about one chat a minute before the next person is pushed to a
   * weaker model. The instructions for actions (~640 tokens) and for recording
   * facts (~230) went out with every question, though most questions are
   * neither a task nor a statement about the person's life, and the dasha
   * periods already lived through only matter to a question about the past.
   *
   * Nothing that guards ACCURACY is conditional: the system prompt, every
   * placement and tense rule in PART 1 and the reason in PART 2 go out with
   * every question. Staying on the strongest model is itself the accuracy win —
   * the weaker fallback is where wrong placements and English drift came from.
   */
  const need = promptNeeds(args.question, args.history);
  if (!args.pastContext && packet?.all_charts?.dasha?.past) delete packet.all_charts.dasha.past;
  /*
   * The age, stated on its own, immediately above the question.
   *
   * It was already inside the JSON packet and a rule in the list below told the
   * model to check it — and it still told a seventy-eight-year-old their
   * marriage yoga was forming within two years. A constraint buried as bullet
   * seven of a long list is a suggestion; the same fact as its own short
   * paragraph next to the question is an instruction. This is the same lesson
   * the follow-up chips taught: for anything that must not be got wrong, put it
   * where it cannot be skimmed past — and back it with something outside the
   * prompt where you can.
   */
  const stage = lifeStageNote(packet.age_years);

  /*
   * What they have told us, stated as fact, above everything else.
   *
   * Three kinds of thing get confused in an answer and must not be: a FACT the
   * person confirmed, CALCULATED astrology the engine produced, and the model's
   * INTERPRETATION of it. Only the first is true about their life. Presenting
   * an interpretation as a fact is what produced "aapki shaadi 2027 mein hogi"
   * for someone married since 2021 — the chart was read correctly and the
   * sentence was still false.
   */
  const factLines = Object.entries(args.facts ?? {})
    .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`)
    .join("\n");
  const factBlock = factLines
    ? `\nKNOWN FACTS — this person told us these about their own life:\n${factLines}\n` +
      `These are FACTS. The chart is not evidence against them. Never contradict one, ` +
      `never predict as future something they have said already happened, and if a ` +
      `question does not fit a known fact, ask what they mean rather than choosing an ` +
      `interpretation that ignores it. Asked "meri shaadi kab hogi?" by someone whose ` +
      `marital status here is married, the right reply is to ask whether they mean the ` +
      `road ahead in that marriage, or something else — not a wedding date.\n` +
      `AND WHEN A FACT CARRIES A YEAR, THAT IS THE EVENT'S YEAR. If they married in ` +
      `2021, their marriage was in 2021 — never say the yoga was strong in 2024-25 as ` +
      `though that is when it happened. A chart window that does not match a stated ` +
      `year is a DIFFERENT period meaning something else, and must be named as one: ` +
      `"aapki shaadi 2021 mein hui; chart mein 2024-25 ka daur rishton ke liye alag se ` +
      `strong dikhta hai, jo us rishte ke andar ek badlav ka samay ho sakta hai." Their ` +
      `year is the fact, the window is your reading — never present the two as the same ` +
      `thing.\n`
    : "";

  /*
   * Not knowing something is itself worth stating.
   *
   * A blank is silently filled in — "meri shaadi kab hogi?" from someone whose
   * status nobody has ever asked about became a wedding date, as though single
   * were the default. It is not; they may be married, divorced, widowed, or
   * testing us. Listing what is MISSING, right beside what is known, turns an
   * invisible assumption into a visible gap the model has to handle.
   *
   * The alternative — interrogating people before every answer — is its own
   * failure, so the rule is narrow: ask only when the unknown changes what the
   * answer MEANS. "Kal ka din kaisa hai" needs nothing. "Shaadi kab hogi" is a
   * different sentence depending on the answer.
   */
  /*
   * Removed: a NOT-KNOWN block listing every missing fact.
   *
   * It fired on nearly every message, because most facts are unknown most of
   * the time — and a standing instruction to hedge or ask turned ordinary
   * answers into vague, repetitive ones. The cases where a missing fact really
   * changes the answer are caught in server/clarify.ts before the model is
   * called at all, which is both reliable and free. Two mechanisms for one job
   * was one too many, and the prompt was the half that made the replies worse.
   */
  // Earlier turns are kept to their gist: the model needs to know what was
  // said, not to re-read eight full answers, which cost more than the chart.
  // The LAST answer keeps more of itself — "go deeper when they ask the same
  // thing again" only works if the model can see what it already said.
  const hist = (args.history ?? []).slice(-8);
  const lastYou = hist.map((m) => m.role).lastIndexOf("assistant");
  const convo = hist
    .map((m, i) => `${m.role === "user" ? "User" : "You"}: ${gist(m.text, i === lastYou ? 900 : 280)}`)
    .join("\n");

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(args.language)}

This person's COMPLETE calculated chart — interpret ONLY this. It has D1, D9, D10,
D6, D11, the full dasha timeline, and "live_transit" (planets right now vs their
natal lagna & moon). Use dasha + live_transit for anything about now or the future.
${JSON.stringify(packet)}
${args.pastContext ? `\nTHE PAST THEY ARE ASKING ABOUT — the real periods they lived through in that window, computed from their chart. A question about why the past was hard (or good) is answered FROM THESE: name the stretch of years, say what that period's lord governs in their life (lord_rules / lord_sits_in) in plain words, and connect it to what they felt. Do not restate the question back to them:\n${JSON.stringify(args.pastContext)}\n` : ""}${args.dayContext ? `\nTODAY/RELEVANT-DAY, already computed for this person (use these EXACT facts for any "today/tomorrow/aaj/kal" part — do not recompute or contradict them):\n${JSON.stringify(args.dayContext)}\n` : ""}${args.appGuide ? `\n${args.appGuide}\n` : ""}${args.memory ? `\nWhat earlier conversations established about them (use it; never make them repeat it):\n${args.memory}\n` : ""}${convo ? `\nConversation so far:\n${convo}\n` : ""}${args.userName ? `\nThe person you are speaking with is ${args.userName}. You ALREADY know exactly who they are — this is THEIR chart above. Address them warmly by first name where it feels natural (not every line). NEVER ask their name, who they are, or "what's on your mind" as if you don't know them — you are their personal astrologer and you already have their whole chart. Never treat a word from their message as their name.\n` : ""}${factBlock}${stage}
${args.relation ? `
THE OTHER PERSON in this question — ${args.relation.name || "they"} (${args.relation.relation}). Their chart and your compatibility were CALCULATED by the app, not guessed:
${JSON.stringify(args.relation)}
When the question is about them or the two of you, answer from BOTH charts and this match, and call them by their name (${args.relation.name || "them"}) — "aap dono" alone reads as a reply that forgot who they asked about. Their thoughts and choices are their own — describe what the charts show about the bond and its timing, never claim to know what they secretly feel or will decide, and never promise that someone will come back.
` : ""}Reply in ${args.language === "hi" ? "Hindi (Devanagari script)" : args.language === "hinglish" ? "Hinglish — Hindi words in Roman script, not English sentences" : "English"}. The whole answer, both parts.
The user asks: "${args.question}"

${args.isFirst ? `\nThis is the FIRST thing they have ever asked you. They are deciding right now
whether this app knows them or is a horoscope column. PART 1 must contain at
least one thing that is unmistakably about THEM and no one else — a period from
their own dasha with real years, or the life area their chart actually
activates. Still no jargon: "the stretch you are in until 2027" is right,
"Shukra mahadasha" is not. If the answer could be pasted into a stranger's chat
unchanged, it is wrong.\n` : ""}
${DEPTH_CONTROLLER}

${INTENT_RULES}
${(args.history ?? []).length ? FOLLOW_UP_RULES : ""}
Answer in THREE parts, separated by lines that are EXACTLY "<<REASON>>" and "<<NEXT>>":

PART 1 — the answer (before the marker):
  • Speak like a clear, warm person, NOT a textbook. Give the DIRECT answer to
    what they asked — no preamble, no "as per your chart", no four-phase essay.
  • NEVER instruct them to take an irreversible real-world decision. You read a
    chart; you do not know their savings, their family, or their offer letter.
      – Money/career: never "resign", "invest in X", "take the loan". Say what
        the period supports, then that a decision like this is theirs to weigh
        against the practical facts.
      – Health: never name a disease, a diagnosis, or a treatment, and never say
        an illness is coming. Speak about energy, rest and care, and say plainly
        that anything physical belongs with a doctor.
      – Marriage/relationships: never "divorce", "leave them", "break it off",
        and never declare a marriage doomed. Describe the pattern and what would
        help; the choice is theirs.
      – Never predict a death, an accident, or anyone's end, for them or anyone
        they name. Decline that warmly and move to what is useful.
    None of this makes you vague — be direct about what the chart shows. It
    stops you being the reason someone quit a job or skipped a doctor.
  • This chart is ONE person's. Another person's own events are not in it — say
    that needs their kundli, and never hand them a yoga that belongs to this
    chart.
  • "today" and "age_years" are in the packet. A window before that date is
    PAST — say "tha", not "hoga".
  • A chart shows leanings and periods, not facts about right now. What they do,
    what they have, whether they are alive: only they can tell you. Say so
    lightly and ask, rather than guessing.
  • Plain language ONLY. NO astrology jargon here — no planet names, house
    numbers, dasha or Sanskrit terms in this part.
  • But plain is NOT vague. Every answer must contain something that is true
    of THIS person and could not be pasted into a stranger's chat: the actual
    stretch of years their own periods point to ("2023 se 2026 tak ka daur",
    "is saal October ke baad"), or the specific area their chart puts weight
    on. "Regular check-up karein, walk karein, neend poori lein" is advice for
    all eight billion people and answers nothing. If you catch yourself writing
    a line that fits anyone, replace it with what their chart actually says.
  • A "kyun / why" question is answered with the WHY, in plain words: what in
    their life-period was pulling against them, and for which years. "Haan,
    mushkil tha, ye badlaav ka samay tha" restates the question back to them.
  • Health: never a diagnosis or a disease — but still specific. Which stretch
    of years asks for more rest, what kind of strain their chart leans toward
    (thakan, stress, neend, pet, joints), and one thing to do about it.
  • FINISH the answer. Never stop mid-thought, and never leave out the part
    they actually asked for. LENGTH FOLLOWS THE DEPTH CONTROLLER ABOVE: QUICK
    and NORMAL are short (1-3 sentences, a few more for a real decision, with the
    timing and one concrete next step). DETAILED and DEEP_DIVE are the complete
    reading, in as many short paragraphs as it takes — PART 1 must answer in
    full on its own, without the reader ever opening the reason. If it's a
    yes/no, lead with the yes/no, then why, then when. Match their tone; four
    words get a short reply. Short paragraphs with a blank line between them,
    never a wall of text.
  • For a feature/how-to question, answer from the app guide plainly.
  • MAKE IT SCANNABLE: wrap the genuinely key words — a time-window, a named
    field or quality, the one conclusion that matters — in **double asterisks**.
    Sparingly: a few per answer, never a whole sentence. When you are naming two
    or more parallel things (possible fields, several time-windows, several
    traits), put each on its own line as "• " instead of one run-on sentence.
    Bullets are for genuine lists, not a substitute for prose. No "#", tables or
    section labels.

PART 2 — the reason (after the "<<REASON>>" marker):
  • The REAL basis — placements, lords, dasha, transit — named naturally inside
    sentences (e.g. "Chandrama aaj aapki rashi se 8ve bhaav mein; Shani ki
    drishti 7ve par"). Technical terms belong HERE, not in PART 1. Ground every
    claim in the chart data above — never invent a placement.
  • For QUICK/NORMAL this carries the full grounding. For DETAILED/DEEP_DIVE the
    interpretation already went into PART 1, so this is the compact citation
    layer: which house, lord, planet, period or divisional chart backs each
    conclusion — not a restatement.
  • Short paragraphs with a blank line between them, never one block: for a
    substantial question, what was (past), what is running now, what comes next.
    No "Past:" labels — start each naturally.
  • For a pure app/how-to question, write "—".

PART 3 — what to ask next (after the "<<NEXT>>" marker):
  • OPTIONAL, and usually you should leave it EMPTY. Offering something after
    every single answer is what makes a chat feel like a machine working
    through a script. Write suggestions ONLY when this answer genuinely opened
    a door — a period worth looking into, a related area of their life the
    answer touched. If you just closed a topic cleanly, or they asked a small
    factual thing, or you already asked them something in PART 1, write nothing
    after the marker.
  • When you do write them: ONE or TWO, never three. One per line, no numbering
    or bullets. These are TAPPED BY THE USER AND SENT AS THEIR OWN MESSAGE, so
    write them the way THEY would type them — asking YOU, about THEMSELVES.
    Use "main / mera / mujhe" (or "I / my / me"), NEVER "aap / aapka / aapko"
    (or "you / your").
      RIGHT: "Kya mere parivar se mujhe support milega?"
      WRONG: "Kya aapke parivar se aapko support mil raha hai?"
    A question addressed to the user is unusable — it makes them answer
    themselves.
  • Each must follow from THIS answer and be answerable from their chart. Never
    generic ("tell me more"), never a repeat of what they just asked.
${args.suggested?.length ? `  • You have ALREADY offered these — do not repeat any of them, and do not
    offer a reworded version of one. Move the conversation somewhere new:
${args.suggested.map((x) => `      - ${x}`).join("\n")}` : ""}
  • Same language as PART 1.

${need.actions ? PART4_TASKS : ""}${need.facts ? PART5_FACTS : ""}Write PART 1, the marker "<<REASON>>", PART 2, then — only if they apply — the
marker "<<NEXT>>"${need.actions ? ', "<<DO>>"' : ""}${need.facts ? ' and "<<FACTS>>"' : ""} with their parts. Nothing else.

${languageInstruction(args.language)}`;

  /*
   * Checked before anyone reads it, the way reports are.
   *
   * A chat answer is shorter than a report but read more closely — it is the
   * thing people screenshot and compare with another app. A false birth-chart
   * placement, or the wrong running dasha, is caught here and the answer is
   * written again once with the exact correction. That second call only
   * happens when something was wrong, so on the free tier it costs nothing on
   * the answers that were right.
   */
  const genOpts = { temperature: 0.7, thinkingBudget: 0, purpose: "chat" } as const;
  let raw = await llmGenerate(prompt, genOpts);
  {
    const tr = transitHouseMap(args.transit);
    const errs = chartClaimErrors(raw, args.chart, tr);
    if (errs.count) {
      console.warn(`[claims] chat: ${errs.summary} error(s) — regenerating once`);
      const retry = await llmGenerate(prompt + errs.note(), genOpts).catch(() => null);
      if (retry && chartClaimErrors(retry, args.chart, tr).count < errs.count) raw = retry;
    }
  }

  // Parsed defensively: a model that skips a marker must still produce a usable
  // answer rather than an empty bubble, so every part is optional on the way out.
  const idx = raw.indexOf("<<REASON>>");
  if (idx === -1) return { answer: raw.trim(), reason: "", next: [], action: "", facts: {} };
  const answer = raw.slice(0, idx).trim();
  let rest = raw.slice(idx + "<<REASON>>".length);

  /*
   * Facts the person just stated. Kept to a fixed vocabulary for the same
   * reason actions are: these outrank the chart in every later answer, so a
   * model must not be able to invent a key nobody designed for — an
   * unrecognised one is dropped rather than stored and trusted forever.
   */
  const FACT_KEYS = new Set([
    "marital_status", "marriage_year", "children", "employment", "job_title",
    "city", "studying", "health_note", "partner_name",
  ]);
  const facts: Record<string, string | number> = {};
  const fIdx = rest.indexOf("<<FACTS>>");
  if (fIdx !== -1) {
    for (const line of rest.slice(fIdx + "<<FACTS>>".length).split("\n")) {
      const m = line.match(/^\s*[-*]?\s*([a-z_]+)\s*:\s*(.+?)\s*$/i);
      if (!m) continue;
      const key = m[1].toLowerCase();
      if (!FACT_KEYS.has(key)) continue;
      const val = m[2].slice(0, 120);
      facts[key] = /^\d{1,4}$/.test(val) ? Number(val) : val;
    }
    rest = rest.slice(0, fIdx);
  }

  // A task the person asked for, if any. Kept to a fixed vocabulary so a model
  // cannot invent an action the app has no way to perform.
  const ACTIONS = ["match", "life_report", "timeline", "career", "wealth", "marriage", "d1", "d9", "pdf", "add_person", "decide"];
  let action = "";
  const dIdx = rest.indexOf("<<DO>>");
  if (dIdx !== -1) {
    const word = rest.slice(dIdx + "<<DO>>".length).trim().split(/\s|\n/)[0].toLowerCase();
    if (ACTIONS.includes(word)) action = word;
    rest = rest.slice(0, dIdx);
  }

  let next: string[] = [];
  const nIdx = rest.indexOf("<<NEXT>>");
  if (nIdx !== -1) {
    next = rest
      .slice(nIdx + "<<NEXT>>".length)
      .split("\n")
      .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
      .filter((l) => l.length > 3 && l.length < 120)
      // Written to the user instead of by them. Rewriting it would mean
      // guessing what they meant, so it is dropped: two good chips beat three
      // where one asks the reader about themselves.
      .filter((l) => !/\b(aap|aapka|aapke|aapko|आप|आपक|your |you )\b/i.test(l))
      // Two at most: three reads as a menu, which is the opposite of a
      // conversation.
      .slice(0, 2);
    rest = rest.slice(0, nIdx);
  }
  let reason = rest.trim();
  if (reason === "—" || reason === "-") reason = "";
  return { answer, reason, next, action, facts };
}

/**
 * The astrologer's OPENING message when a consultation starts — a warm greeting,
 * then a plain-language read of the person's D1 (birth chart) that someone with
 * zero astrology knowledge can follow, then an invitation to ask. Returned as
 * WhatsApp bubbles.
 */
export async function astrologerIntro(args: {
  chart: any;
  personaPrompt: string;
  language: string;
  userName: string;
}): Promise<string[]> {
  const packet = buildChartPacket(args.chart, "general");

  const prompt = `${args.personaPrompt}

${languageInstruction(args.language)}

You are starting a NEW consultation. This is your very first message to the
person — greet, then gently introduce what their birth chart (D1) shows.

The person's name is "${args.userName || "ji"}". Their calculated chart:
${JSON.stringify(packet)}

Write a SHORT opening as WhatsApp bubbles separated by lines of only "|||".
Keep it BRIEF — this is a conversation, so say a little and then let them talk.
EXACTLY these 3 short bubbles, nothing more:
1. Greeting only: "Namaste ${args.userName || ""} ji 🙏" (adapt to the language).
2. ONE short, simple line: you've seen their janma kundli, and mention their
   Lagna + Moon sign in plain everyday words (e.g. "Aapka Lagna Gemini hai aur
   Moon Pisces — aap smart bhi hain aur dil se caring bhi."). NO jargon, NO
   houses, NO degrees, NO list of life areas.
3. A warm question: ask what they'd like to know about first.
Only 3 bubbles. Do NOT explain strengths or list career/money/love/health — save
everything for when they actually ask. Warm, human, brief.`;

  const raw = await generateChecked(prompt, args.chart, undefined, { temperature: 0.8, thinkingBudget: 0, purpose: "consult" });
  return splitBubbles(raw);
}

/** Split a model reply into clean chat bubbles. */
function splitBubbles(raw: string): string[] {
  let parts = String(raw || "")
    .split(/\n?\s*\|\|\|\s*\n?/g)
    .map((s) => s.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

  // Fallback: if the model ignored the delimiter, split on blank lines, then
  // cap so we never dump one giant wall of text into a single bubble.
  if (parts.length <= 1) {
    parts = String(raw || "")
      .split(/\n{2,}/g)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (parts.length <= 1 && raw) parts = [String(raw).trim()];

  // Safety net: the word limit in the prompt is advisory and the model does
  // overshoot it. Anything genuinely wall-of-text is split at a sentence
  // boundary so a phone never shows one huge paragraph.
  const MAX_WORDS = 45;
  const split: string[] = [];
  for (const part of parts) {
    if (part.split(/\s+/).length <= MAX_WORDS) { split.push(part); continue; }
    const sentences = part.match(/[^.!?।]+[.!?।]*\s*/g) ?? [part];
    let buf = "";
    for (const s of sentences) {
      const candidate = (buf + s).trim();
      if (buf && candidate.split(/\s+/).length > MAX_WORDS) { split.push(buf.trim()); buf = s; }
      else buf = candidate + " ";
    }
    if (buf.trim()) split.push(buf.trim());
  }

  // At most three messages — a burst reads as copy-paste rather than someone
  // talking. But the overflow is MERGED into the last one, never dropped:
  // slicing it away ended answers mid-thought, which is what made them feel
  // incomplete.
  if (split.length <= 3) return split;
  return [...split.slice(0, 2), split.slice(2).join(" ")];
}

/** Full life report across the 5 standard categories, as structured JSON. */
/*
 * At most ONE bold phrase per LINE.
 *
 * A report came back with every second word wrapped in asterisks — "Aapka
 * **career** abhi thoda **mixed** hai" — because the model was never told
 * otherwise and some models bold by habit. Emphasis on everything is emphasis
 * on nothing: the page reads as shouting and the one line that actually
 * mattered no longer stands out.
 *
 * Per LINE, not per field: a timeline field is a list of periods, and one
 * highlight for the whole list left five bullets flat and unreadable — the
 * opposite failure to the one above. Each line keeps its first bold phrase.
 *
 * Enforced here rather than asked for in the prompt, because which model
 * answers is decided at runtime by the fallback chain, and a formatting rule
 * that has to hold for every one of them does not belong in a prompt.
 */
function capBold(text: string): string {
  if (!text.includes("**")) return text;
  return text
    .split("\n")
    .map((line) => {
      /*
       * Two per line, not one.
       *
       * A timeline bullet has two things worth seeing: which period it is, and
       * what it meant. Keeping only the first left every bullet with a bold
       * date and a grey sentence — the part people are actually scanning for
       * lost its highlight. Three is where it turns back into shouting.
       */
      let kept = 0;
      return line.replace(/\*\*([^*]+)\*\*/g, (_m, inner) => (kept++ < 2 ? `**${inner}**` : inner));
    })
    .join("\n");
}

/*
 * One bullet, one line.
 *
 * Models write "• first … • second … • third" on a single line about a third of
 * the time, and the reader gets a wall of text where a timeline should be — the
 * renderer makes a list out of line breaks, not out of the bullet character.
 */
function splitBullets(text: string): string {
  return text.includes("•") ? text.replace(/\s+•\s+/g, "\n• ").trim() : text;
}

/*
 * A paragraph nobody reads is a paragraph nobody wrote.
 *
 * Models answer in one block. On a phone that is fourteen lines of unbroken
 * text, and the eye slides off it — the reading can be perfect and still not
 * be read. Asking for line breaks in the prompt works most of the time, which
 * is another way of saying it fails often enough to see, and which model
 * answers is decided at runtime.
 *
 * So it is done here: a long block is split at sentence ends into chunks of
 * two or three sentences. Anything already structured — bullets, existing
 * breaks — is left exactly as it is.
 */
export function breakParagraphs(text: string, perChunk = 2): string {
  const t = String(text ?? "");
  if (t.length < 320 || t.includes("\n") || t.includes("•")) return t;
  // Sentence ends: ., !, ?, or the Devanagari danda, followed by a space.
  const parts = t.match(/[^.!?।]+[.!?।]+["'\u201d\u2019)]*\s*/g);
  if (!parts || parts.length < 4) return t;
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += perChunk) {
    out.push(parts.slice(i, i + perChunk).join("").trim());
  }
  // A lonely tail sentence reads as a mistake — give it to the chunk above.
  if (out.length > 1 && out[out.length - 1].length < 60) {
    out[out.length - 2] += " " + out.pop();
  }
  return out.join("\n\n");
}

/** capBold over every string in a report object, however deeply nested. */
export function tidyReport<T>(value: T): T {
  if (typeof value === "string") return capBold(breakParagraphs(splitBullets(value))) as unknown as T;
  if (Array.isArray(value)) return value.map(tidyReport) as unknown as T;
  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) out[k] = tidyReport(v);
    return out;
  }
  return value;
}

/** planet → house it is transiting now, from the compact transit packet. */
function transitHouseMap(transit: any): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of transit?.transiting_planets ?? []) {
    const h = Number(p.transit_house_from_lagna ?? p.house_from_lagna);
    if (p.planet && h) out[p.planet] = h;
  }
  return out;
}

/**
 * Generate, fact-check every birth-chart placement, and regenerate ONCE with a
 * correction that names exactly what was wrong.
 *
 * Only the regeneration costs anything, and only when a draft is wrong. The
 * retry is kept only if it is actually better — a second draft with as many
 * errors as the first is not an improvement worth the new wording.
 */
async function generateChecked(
  prompt: string, chart: any, transit: any, opts: Parameters<typeof llmGenerate>[1],
): Promise<string> {
  const started = Date.now();
  const text = await llmGenerate(prompt, opts);
  const tr = transitHouseMap(transit);
  const errs = chartClaimErrors(text, chart, tr);
  if (!errs.count) return text;
  /*
   * The rewrite is skipped when there is no time left for it. The server is
   * killed at sixty seconds; a first draft that already took most of that
   * leaves a choice between a report with a wrong house number in it and no
   * report at all, and the person paid for a report. The error is logged either
   * way, so a model that keeps doing this is still visible.
   */
  /*
   * A long reading gets longer to fix itself.
   *
   * The budget exists so a chat answer cannot blow the function's sixty
   * seconds waiting for a second draft. A report is a different trade: its
   * parts run concurrently, someone paid for it, and a wrong house number in a
   * document they keep is worth ten more seconds. A sweep caught exactly that —
   * "Sun in the 10th" survived in a part whose first draft had taken 21s.
   */
  const budget = Number(process.env.AI_CLAIM_RETRY_BUDGET_MS || ((opts?.maxTokens ?? 0) > 2000 ? 32_000 : 20_000));
  if (Date.now() - started > budget) {
    console.warn(`[claims] ${errs.summary} error(s) — no time to regenerate, sending as written`);
    return text;
  }
  /*
   * Up to two corrections for a long reading, one for a chat answer.
   *
   * A single rewrite fixed most of them and left about one false claim per
   * full report — which for something people pay for and keep is one too many.
   * The second pass costs a call only on the drafts that are still wrong.
   */
  /*
   * A long reading gets two attempts at its own mistakes; a chat answer, one.
   *
   * Two rounds once pushed a seven-area report to seventy-nine seconds — past
   * the sixty the function is killed at — but that was before the chart packet
   * was trimmed, and a report now finishes a first draft in twenty to thirty.
   * The stop below still ends it while there is time to return something, and
   * the errors that survive a first correction are the stubborn ones: a wrong
   * house LORD, repeated three times in one reading.
   */
  const rounds = (opts?.maxTokens ?? 0) > 2000 ? 2 : 1;
  let best = text;
  let bestCount = errs.count;
  let note = errs.note();
  for (let i = 0; i < rounds; i++) {
    console.warn(`[claims] ${bestCount} error(s) — correction ${i + 1} of ${rounds}`);
    /*
     * The rewrite reserves less room than the draft did.
     *
     * A correction is the same prompt plus a few lines, and the reservation is
     * counted against the provider's per-request ceiling — so asking for the
     * original 3,300 tokens again put the fix at ~8,600 and Groq refused every
     * one of them ("too large"), sending the correction to whatever was left.
     * A rewrite is never longer than what it rewrites.
     */
    const retry = await llmGenerate(prompt + note, {
      ...opts, strong: true, maxTokens: Math.min(opts?.maxTokens ?? 2600, 2600),
    }).catch(() => null);
    if (!retry) break;
    const again = chartClaimErrors(retry, chart, tr);
    if (again.count < bestCount) { best = retry; bestCount = again.count; note = again.note(); }
    if (!bestCount) break;
    /*
     * Stop while there is still room to return something.
     *
     * The function is killed at sixty seconds. A correction call can take up to
     * thirty, so anything past twenty-four seconds spent means the next round
     * might land after the person has already been shown an error — and a
     * report with one wrong house number beats no report at all.
     */
    if (Date.now() - started > 24_000) break;
  }
  console.warn(`[claims] after correction: ${bestCount} left`);
  return best;
}


/**
 * "Here is what already happened" — the section that decides whether a person
 * believes the rest of the report.
 *
 * The DATES are not the model's to choose. They are real dasha spans computed
 * from the birth moment and handed in; the model only says what a period of
 * that shape, in this chart, tends to have brought. That split matters: a model
 * inventing both the date and the event will always sound right and can never
 * be checked, which is precisely the failure this section exists to avoid.
 *
 * Two rules do the work:
 *  · Be specific enough to be WRONG. "A mixed period with ups and downs" passes
 *    for every human being alive and proves nothing. "Work changed or a senior
 *    left, and money was tight for most of it" is checkable — and being caught
 *    out on one line is a fair price for the other six landing.
 *  · Never claim a certainty about someone's private life. Deaths, illnesses,
 *    break-ups and losses are stated as what the period PRESSURED, never as
 *    what happened, and never named.
 */
export async function generatePastTimeline(args: {
  chart: any;
  periods: any[];
  language: string;
}): Promise<{ timeline: Array<{ from: string; to: string; period: string; age: string; headline: string; areas: string[]; what: string }>; partial?: boolean }> {
  if (!args.periods.length) return { timeline: [] };

  const packet = {
    lagna: args.chart?.summary?.lagna,
    moon: args.chart?.summary?.rashi,
    houses: (args.chart?.d1_chart?.houses ?? []).map((h: any) => ({ h: h.house, sign: h.sign, lord: h.sign_lord, in: h.planets })),
    planets: (args.chart?.planet_positions ?? []).map((p: any) => ({ p: p.planet, sign: p.sign, house: p.house, retro: p.retrograde })),
    periods: args.periods,
  };

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(args.language)}

This person's chart, and the REAL past periods they have already lived through.
The dates are calculated — use them exactly as given, never change or add one.
${JSON.stringify(packet)}

For EACH period in "periods", say what that stretch of their life most likely
brought. This is a section they will check against their own memory, so:

 • Be SPECIFIC enough to be wrong. "There were ups and downs" is true of
   everyone and proves nothing. Name the area and the kind of event: a job or
   study change, money tightening or opening up, a move, a relationship
   starting or straining, a health stretch that needed rest, a responsibility
   landing on them.
 • Use the period's own "themes", "rules" and "sits_in" — those are the houses
   its lord actually governs in THIS chart. That is what makes the line belong
   to them rather than to the dasha in general.
 • Say it as a likelihood, not a certainty: "aksar", "shayad", "is daur mein
   zyada tar logon ke saath" — they may have lived it differently.
 • MATCH THE EVENT TO THEIR AGE in that period ("age_from"-"age_to"). At
   fifteen a period is about school, exams, family and moving house — not a
   job, a marriage or a mortgage. At twenty-five it can be a first job or a
   relationship. At forty it is rarely a first job. Getting this wrong is the
   fastest way to lose them, because they can see it instantly.
 • NEVER name or assert a death, a disease, a diagnosis, an accident, a
   divorce, or anyone's end. Where a period is heavy, describe the PRESSURE —
   responsibility, tiredness, distance, a strain at home — not an event.
 • Two short sentences for each period. No jargon: no planet names, no house
   numbers, no Sanskrit in "what" or "headline".
 • "areas" is 1-2 plain words from: career, money, family, home, study, health,
   relationship, travel.

Return ONLY this JSON:
{
  "timeline": [
    {
      "from": "<copy the period's from>",
      "to": "<copy the period's to>",
      "period": "<copy the period's period>",
      "age": "<e.g. 22-25, from age_from and age_to>",
      "headline": "<4-7 words, the one thing that stretch was about>",
      "areas": ["career"],
      "what": "<two short sentences>"
    }
  ]
}`;

  // Fact-checked like every other reading: the past is the half people can
  // check against their own life, so a false placement here costs the most.
  const text = await generateChecked(prompt, args.chart, undefined, { json: true, temperature: 0.75, thinkingBudget: 0, maxTokens: 4096, purpose: "past_timeline", strong: true });
  const j = parseJsonLoose(text) ?? {};
  const given = new Map(args.periods.map((p: any) => [p.period, p]));
  const rows = (Array.isArray(j.timeline) ? j.timeline : [])
    .map((r: any) => {
      // The dates come back from OUR list, never from the reply — a model that
      // "corrects" a date turns a checkable claim into a wrong one.
      const src = given.get(r?.period) ?? args.periods.find((p: any) => p.from === r?.from);
      if (!src) return null;
      return {
        from: src.from,
        to: src.to,
        period: src.period,
        age: `${src.age_from}-${src.age_to}`,
        headline: String(r?.headline ?? "").trim(),
        areas: (Array.isArray(r?.areas) ? r.areas : []).map((x: any) => String(x)).slice(0, 2),
        what: String(r?.what ?? "").trim(),
      };
    })
    .filter((r: any) => r && r.what);

  return tidyReport({
    timeline: rows,
    // Fewer rows than periods means the reply was cut short; the screen says so
    // rather than quietly presenting half a life as the whole of it.
    partial: rows.length < args.periods.length,
  });
}

/**
 * The seven areas a life report covers, and the order they are read in.
 *
 * Five became seven because "career" and "wealth" together still did not
 * answer the two questions people actually arrive with — should I go abroad,
 * and job or my own thing. Those are different readings (3rd/9th/12th and
 * Rahu-Ketu for one, 10th/11th/3rd with Mercury and Saturn for the other),
 * and answering them inside a career paragraph answered neither.
 */
export const REPORT_AREAS = ["health", "wealth", "career", "marriage", "relationships", "travel", "business"] as const;

/**
 * The dated spine of the report: the periods they have LIVED, the one they are
 * in, and the ones ahead — real Vimshottari windows, computed here.
 *
 * The model is never asked when anything happened. Left to describe "earlier
 * life" from a mahadasha it wrote fifteen-year moods ("your twenties had ups
 * and downs"), which is true of everyone and checkable by no one. Handed the
 * antardashas with their own dates, the same model writes a stretch a person
 * can hold against their own memory — and when the past checks out, the part
 * about 2028 is worth reading.
 *
 * Childhood periods are left out (pastMilestones starts at 14): nobody tests a
 * reading against what they felt at six.
 */
function reportTimeline(chart: any) {
  const cur = chart?.dasha?.current ?? {};
  const houses: any[] = chart?.d1_chart?.houses ?? [];
  const planets: any[] = chart?.planet_positions ?? [];

  /*
   * What a period's lord actually DOES in this chart.
   *
   * Handed only "Venus-Sun (2024-2025)" a model writes what a Sun period means
   * in general — "low energy, digestive stamina" — which is true of the planet
   * and not of this person. Handed "its lord rules their 3rd and 10th and sits
   * in the 12th", the same period becomes their work and their expenses, in
   * those years. The difference between a reading and a horoscope column is
   * almost entirely here.
   */
  /*
   * What a period's lord actually DOES in this chart, as one short line.
   *
   * Handed only "Venus-Sun (2024-2025)" a model writes what a Sun period means
   * in general — "low energy, digestive stamina" — which is true of the planet
   * and not of this person. Handed "its lord rules their 3rd and 10th and sits
   * in the 12th", the same period becomes their work and their expenses, in
   * those years.
   *
   * A sentence rather than nested objects on purpose: this is repeated for
   * every period in the timeline, and the JSON version of it cost more tokens
   * than the entire D9 chart.
   */
  const lordLine = (lord: string) => {
    const rules = houses.filter((h) => h.sign_lord === lord).map((h) => Number(h.house)).sort((a, b) => a - b);
    const p = planets.find((x) => x.planet === lord);
    const sits = p?.house ? `sits in ${p.house}${p.retrograde ? "R" : ""}` : "";
    return [lord, rules.length ? `rules ${rules.join("&")}` : "", sits].filter(Boolean).join(" ");
  };
  const lords = (label: string) => {
    const [maha, antar] = String(label).split("-");
    return [lordLine(maha), antar && antar !== maha ? lordLine(antar) : ""].filter(Boolean).join("; ");
  };

  return {
    lived_periods: pastMilestones(chart, 6).map((p) => ({
      period: p.period, from: p.from, to: p.to, age: `${p.age_from}-${p.age_to}`,
      touches: p.themes.join(", "),
      lords: lords(p.period),
    })),
    current_period: cur.mahadasha
      ? {
          period: `${cur.mahadasha}-${cur.antardasha}`,
          from: String(cur.antardasha_from ?? "").slice(0, 10),
          to: String(cur.antardasha_to ?? "").slice(0, 10),
          mahadasha_runs_until: String(cur.mahadasha_to ?? "").slice(0, 10),
          lords: lords(`${cur.mahadasha}-${cur.antardasha}`),
        }
      : null,
    next_periods: (chart?.dasha?.next_7_years ?? []).slice(0, 5).map((n: any) => ({
      period: n.period, from: n.from, to: n.to, lords: lords(String(n.period ?? "")),
    })),
  };
}

/** One half of a life report — the shared prompt, a subset of the areas. */
async function lifeReportPart(
  chart: any, language: string, transit: any, areas: readonly string[],
): Promise<any> {
  /*
   * Only the charts these areas are read from.
   *
   * A report part carried every divisional chart whatever it was about, and
   * asked for ONE area the prompt still came to ~8,000 tokens — over Groq's
   * per-request ceiling, so every area skipped the free models that had
   * capacity and landed on the weakest one left, which dropped fields. Health
   * needs the D6, not the D10; marriage needs the D9, not the D11. The same
   * table the chat uses decides it.
   */
  const AREA_CFG: Record<string, string> = {
    health: "health", wealth: "wealth", career: "career", marriage: "marriage",
    relationships: "relationship", travel: "foreign", business: "business",
  };
  const cfgs = areas.map((a) => PACKET_CONFIG[(AREA_CFG[a] ?? "general") as Category]).filter(Boolean);
  const scoped: PacketConfig | undefined = areas.length >= 3 ? undefined : {
    houses: [...new Set(cfgs.flatMap((c) => c.houses))],
    planets: [...new Set(cfgs.flatMap((c) => c.planets))],
    includeD9: cfgs.some((c) => c.includeD9),
    includeNext7: true,
    divisionals: [...new Set(cfgs.flatMap((c) => c.divisionals))] as PacketConfig["divisionals"],
  };
  // birth_chart_facts is restated in plain text at the end of the prompt, where
  // it is actually read — carrying it inside the JSON too was the same 150
  // tokens twice, in a prompt that has to fit a free model's ceiling.
  const { birth_chart_facts: _facts, ...ctx } = buildFullChartContext(chart, scoped) as any;
  const fullContext = {
    ...ctx,
    live_transit: transit ?? null,
    timeline: reportTimeline(chart),
    birth_chart_facts: birthChartFactSheet(chart),
  };
  const contextForPrompt = { ...fullContext, birth_chart_facts: undefined };
  const list = areas.join(", ");

  const prompt = `${REPORT_SYSTEM}

${languageInstruction(language)}

You are writing a personal life reading for this person across these areas:
${list}.

You have their COMPLETE chart below — D1 rasi, D9 navamsa, D10 dasamsa, D6
shashtamsa, D11 ekadasamsa and the dasha timeline. Cross-reference them:
career from D1 10th house + D10, health from D1 6th + D6, wealth from D1 2nd/11th
+ D11, marriage from D1 7th + D9, travel from D1 3rd/9th/12th (short trips, long
journeys, living abroad) + Rahu/Ketu, business from D1 10th/11th + D10 + the 3rd
house (own initiative) + Mercury/Saturn — for business, say plainly whether this
chart leans towards a salaried job or their own venture, and in what kind of work.
Confirm each point across the relevant charts.

Write each field as if you are gently speaking to them — warm, human, flowing
sentences, addressing them directly ("aap"). Each statement must rest on their
actual chart (mention the house/planet/dasha naturally inside the sentence, not
as a label). Do NOT invent anything.

GROUND IT IN THEIR BIRTH NAKSHATRA, NOT ONLY THE SIGNS: their Janma Nakshatra
with its pada is the most individual placement in the whole chart — two people
share a moon sign constantly, the same nakshatra and pada almost never. Name it
in "summary" and weave its real classical nature into the one or two places it
genuinely applies. Never invent what a nakshatra means; use only the
well-established associations.

BE SPECIFIC, NEVER VAGUE: turn every general point into concrete examples — name
the actual fields (e.g. content creation, law, teaching, finance), the body area
for health (e.g. spine, stomach/digestion, knees), the type of partner or place,
and concrete time-windows from the dasha (years / age range). Avoid empty lines
like "things will improve" without saying how, in what, and when.

EMPHASIS IS A REQUIREMENT, NOT A SUGGESTION: wrap the most important words in
**double asterisks**. Every bullet in "past", "present" and "future" carries
TWO: the period label itself, and the one phrase that says what it actually
meant for them ("**chot ya bukhar jaisi choti dikkatein**", "**naukri badalne
ka mauka**"). A bullet with no bold has failed; a bullet bolded end to end has
also failed. This applies in every language, Hindi and Hinglish included.

"past", "present" and "future" ARE TIMELINE FIELDS, and their DATES ARE GIVEN TO
YOU in "timeline" below — never invent, shift or round a period's dates. Each is
ONE plain string (never a list), with one "• " bullet per line in this shape:
"• **[Lord-Lord] (YYYY–YYYY)**: <what this period specifically means for THIS
area of their life>."
Do not invent events (no job titles, no illnesses, no named people) — describe
the KIND of period it is, concretely enough to recognise.

  "past" — walk timeline.lived_periods, oldest first, one bullet each (4-6
    bullets), one or two sentences per bullet. This must read like a CHECKABLE
    timeline of their real life, not a mood-board: each bullet says something
    only THIS chart could produce — use that period's own "lords" line (which
    houses its lords rule and sit in) to name the part of their life it touched,
    not what the planet means in general. "Venus-Sun (2024-2025): low energy and digestion"
    is a textbook line about the Sun; "Venus-Sun (2024-2025): the year work and
    reputation asked more of you than your body had to give, because its lord
    rules your 3rd and sits in your 12th" is their year.
  "present" — exactly ONE bullet: timeline.current_period and its dates only.
    Do NOT give the mahadasha its own bullet or date range here; if it matters,
    mention it inside the same sentence.
    ONE BULLET DOES NOT MEAN THIN — it carries the whole weight of "what is
    happening right now", so give it 2-4 full sentences: the specific planet and
    house behind it (what that lord rules and where it sits for THEM), the
    concrete way it is showing up in this area now (the actual field, body area,
    relationship pattern or money pattern — not "things are developing"), and
    what this period asks of them. A reader must recognise their own current
    situation in it. A "present" thinner than the "past" beside it reads as a
    report that ran out of things to say.
  "future" — walk timeline.next_periods, nearest first, 3-5 bullets. EACH needs
    the same density as a past bullet: the planet and house driving that window
    and the concrete way it would show up in this area (the kind of opportunity,
    shift or challenge — not "this period will bring changes"). They are planning
    around this; a vague line with a date on it is a failure. This is also where
    the current mahadasha's own end date belongs, if it helps.

For each area produce an object with EXACTLY these keys:
  "rating"    (a PLAIN INTEGER 1-10, not a string — see below),
  "summary"   (the overall pattern, said warmly),
  "past", "present", "future"  (the bulleted timeline fields above),
  "positive"  (genuine strengths and supportive periods),
  "caution"   (challenges, said kindly and constructively),
  "guidance"  (practical, doable suggestions),
  "disclaimer"(one short kind line; for health note it is not medical advice,
               for wealth note it is not financial advice).

"rating" — 1 to 10, judged from what the chart actually shows for THIS area:
the house and its lord, benefic or malefic influence, whether the running
periods support it, and how serious the cautions are. 1-3 is genuinely
difficult, 4-6 mixed, 7-8 good, 9-10 exceptional. Do NOT park everything at 6
or 7 to be kind — a report where every area scores the same tells them nothing,
and the number is the first thing they look at.

Respond with a SINGLE valid JSON object whose top-level keys are exactly:
${list}. Keep summary/positive/caution/guidance/disclaimer to a few natural
sentences each — only past/present/future are bulleted. Write every area you
were asked for, completely.
${areas.includes("travel") ? `For "travel": cover both short, frequent travel AND any genuine sign of
long journeys or settling abroad — and be honest when the chart shows little
travel emphasis rather than forcing a travel story that is not there.\n` : ""}${areas.includes("business") ? `For "business": be direct about whether this chart leans towards a salaried
job or their own business — and if business, the TYPE of field it supports
(the specific field, not "any business").\n` : ""}

This person's COMPLETE calculated chart data (interpret only this):
${JSON.stringify(contextForPrompt)}

THE ONLY TRUE BIRTH-CHART PLACEMENTS — every plain "Nth house" you write must
match this line exactly. A number from a D9/D10/D6/D11 chart or from a transit
is NOT a birth-chart house, and if you mean one of those, say so in the same
sentence. SITTING IN A HOUSE IS NOT RULING IT: the "House lords" part of this
line says who rules what, and a planet placed in the 1st is not "the 1st lord"
unless that line says so:
${fullContext.birth_chart_facts}

FINAL CHECK BEFORE YOU OUTPUT: does every bullet in every past/present/future
field carry a **bolded** phrase and the real dates from "timeline"? Does every
house number match the line above? Is every field concrete rather than generic
filler? Fix anything that fails before answering.

${languageInstruction(language)}`;

  // thinkingBudget 0 + a real output budget: Gemini 2.5 spends its output
  // allowance on hidden reasoning otherwise, and the JSON arrives cut in half
  // — which is exactly how a paid-for report turned into an error.
  //
  // The budget is RESERVED against a provider's per-request ceiling, so it has
  // to fit UNDER Groq's 8,000 with the prompt: report rules ~2,000 + compact
  // chart ~2,700 leaves about 3,300 for the reading. Too small is its own
  // failure — a part cut off mid-JSON loses the areas after the cut — and an
  // area of this shape (four past bullets, one present, three future, five
  // short prose fields) measures ~800 tokens, so a part is kept to three.
  const text = await generateChecked(prompt, chart, transit, {
    temperature: 0.8, thinkingBudget: 0, maxTokens: Math.min(4000, 1000 + 800 * areas.length), purpose: "life_report", strong: true,
  });
  const j = parseJsonLoose(text);
  if (!j) {
    // Log the shape, never the reading itself: a report is someone's private
    // life, and "it failed" without the first and last words of what came back
    // is unfixable — a JSON cut off by the token budget and a model that
    // answered in prose look identical from here otherwise.
    console.warn(`[report] unparseable ${areas.length}-area half (${text.length} chars) starts: ${text.slice(0, 80)} … ends: ${text.slice(-80)}`);
    throw new Error("Failed to parse AI report");
  }
  const picked = pickAreas(j, areas);
  /*
   * An area with no timeline is not an area. The dated past/present/future is
   * the reason this report can be checked at all, and a section that arrives
   * with only a summary reads — correctly — as the app having run out of
   * things to say about that part of their life.
   */
  const thin = areas.filter((a) => !["summary", "past", "present", "future"].every((f) => typeof picked[a]?.[f] === "string" && picked[a][f].trim()));
  if (thin.length) throw new Error(`Incomplete sections: ${thin.join(", ")}`);
  return picked;
}

/**
 * One area of the life report, on its own.
 *
 * The report is now written area by area from the app — each one a small,
 * quick request that fits comfortably inside the function's time limit and a
 * free model's per-request ceiling — instead of seven areas raced against
 * sixty seconds. Same prompt, same checks; just one area asked for.
 */
export async function generateReportArea(chart: any, language: string, transit: any, area: string): Promise<any> {
  if (!(REPORT_AREAS as readonly string[]).includes(area)) throw new Error("Unknown area");
  const out = await lifeReportPart(chart, language, transit, [area]);
  return tidyReport(out[area]);
}

/*
 * The areas out of whatever shape the model returned.
 *
 * Asked for {travel, business} a model will sometimes answer
 * {"report": {"Travel": …}} — the reading is right there, and throwing it away
 * over a capital letter or a wrapper key costs the person their whole report
 * and a second minute of waiting. Anything genuinely missing still fails.
 */
function pickAreas(parsed: any, areas: readonly string[]): any {
  const find = (obj: any, key: string): any => {
    if (!obj || typeof obj !== "object") return undefined;
    const hit = Object.keys(obj).find((k) => k.toLowerCase().trim() === key);
    if (hit && obj[hit] && typeof obj[hit] === "object") return obj[hit];
    // One level of wrapper ({"report": {...}}, {"areas": {...}}).
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner = Object.keys(v as any).find((k) => k.toLowerCase().trim() === key);
        if (inner && (v as any)[inner] && typeof (v as any)[inner] === "object") return (v as any)[inner];
      }
    }
    return undefined;
  };
  const out: any = {};
  const missing: string[] = [];
  for (const a of areas) {
    const found = find(parsed, a);
    if (found) out[a] = found; else missing.push(a);
  }
  if (missing.length) throw new Error(`Report came back without: ${missing.join(", ")}`);
  return out;
}

/**
 * The full life report — seven areas, written in two calls at once.
 *
 * One call for all seven took over a minute, which on a serverless function
 * that is killed at sixty seconds reached the person as "network error".
 * Three concurrent parts finish in about the time of the slowest one.
 *
 * A part that fails fails the WHOLE report. Merging the parts that worked would
 * store — and then serve from cache, forever — a report silently missing two or
 * three areas, which is worse than the timeout it replaced. The retry button
 * costs half a minute now; a quietly incomplete paid report costs trust.
 */
export async function generateLifeReport(chart: any, language: string, transit?: any): Promise<any> {
  // Three parts, not one call and not seven: three areas is what fits in one
  // reply under the token ceiling, and three requests at once still land on
  // three different models rather than queueing behind one rate limit.
  const parts = [REPORT_AREAS.slice(0, 3), REPORT_AREAS.slice(3, 5), REPORT_AREAS.slice(5)];
  /*
   * One retry per part, not per report. A part comes back thin or unparseable
   * often enough that failing the whole report on the first stumble would make
   * people pay, wait, and press the button again — and the second attempt
   * almost always lands on a different model and succeeds. Only the part that
   * failed is asked again, so the cost is one call, not seven areas.
   */
  const settled = await Promise.allSettled(
    parts.map((areas) =>
      lifeReportPart(chart, language, transit, areas).catch((e) => {
        console.warn(`[report] ${areas.join("/")} failed (${e?.message}) — one more try`);
        return lifeReportPart(chart, language, transit, areas);
      }),
    ),
  );
  const failed = settled.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  const done = Object.assign({}, ...settled.filter((r) => r.status === "fulfilled").map((r: any) => r.value));
  const have = REPORT_AREAS.filter((a) => (done as any)[a]?.summary);

  if (failed.length) {
    const why = failed.map((r) => String(r.reason?.message ?? r.reason)).join("; ");
    /*
     * Some of it beats none of it — as long as nobody can mistake it for the
     * whole thing.
     *
     * Failing hard was right when the danger was CACHING half a report and
     * serving it forever as complete. It is the wrong answer when four areas
     * are written and the free models ran out mid-way: the person waited a
     * minute and gets an error, and their next press starts from nothing. So
     * the parts that finished come back marked `partial`, with the areas that
     * are missing named. The caller must not store a partial one, and must not
     * charge for it.
     */
    if (have.length) {
      const missing = REPORT_AREAS.filter((a) => !have.includes(a));
      console.warn(`[report] ${have.length}/${REPORT_AREAS.length} areas written; missing ${missing.join(", ")} (${why})`);
      return { ...tidyReport(done), partial: true, missing };
    }
    console.warn("[report] every part failed:", why);
    return { error: `Report could not be completed (${why}). Please try again.` };
  }
  return tidyReport(done);
}

/** Focused premium report types — each a deep single-theme reading. */
export const REPORT_TYPES: Record<string, { title: string; focus: string }> = {
  career: {
    title: "Career & Profession Report",
    focus: "career and profession — the 10th house and its lord, the D10 (Dasamsa), Sun/Saturn/Mercury and the dasha timeline. Cover: your work nature & temperament, core professional strengths, best-suited fields/industries (name concrete ones), job vs business, the current career phase (tied to the running dasha), the next 3-5 years with approximate timing for growth or change, and practical advice.",
  },
  wealth: {
    title: "Wealth & Finance Report",
    focus: "wealth and money — the 2nd and 11th houses and their lords, the D11 (Ekadasamsa), Jupiter/Venus, any Dhana yogas, and the dasha timeline. Cover: your money nature, sources & flow of income, savings vs spending patterns, supportive wealth periods (approximate timing), cautions to avoid losses, and practical advice. This is not financial advice.",
  },
  marriage: {
    title: "Marriage & Relationship Report",
    focus: "marriage and partnership — the 7th house and its lord, the D9 (Navamsa), Venus/Jupiter/Mars, any Manglik factor, and the dasha timeline. Cover: your approach to love & partnership, the likely nature of your partner, an approximate marriage-timing window (from the dasha), married-life tendencies, harmony & conflict areas, and gentle practical advice.",
  },
  annual: {
    title: "Annual Prediction — Year Ahead",
    focus: "the year ahead — combine the running dasha/antardasha with the live transit (gochar) of Saturn, Jupiter, Rahu-Ketu and the Moon. Cover: the overall theme of the year, career & money outlook, relationships & family, health & energy, the most supportive months/periods and the ones to be careful in, and practical advice for the year.",
  },
  mahadasha: {
    title: "Mahadasha Deep-Dive",
    focus: "the CURRENT Mahadasha lord and its overall effect for this person — where that planet sits (house/sign), what this whole mahadasha brings across life areas, the antardasha sub-periods ahead, the strong and the testing phases, and how to make the most of it. Use the dasha dates in the data for timing.",
  },
};

/**
 * A deep, premium single-theme report (career / wealth / marriage / annual /
 * mahadasha). Returns { title, intro, sections:[{heading, body}], disclaimer }.
 */
/*
 * How a long reading has to be laid out to be read at all.
 *
 * Two failures, both seen on a phone: one unbroken block of fourteen lines,
 * and a reading that OPENS with "Venus Mahadasha ne aapke rishte mein…". The
 * second is worse — the first sentence is the one that decides whether the
 * rest gets read, and spending it on vocabulary the reader does not have loses
 * them before the useful part. The astrology is not removed; it is moved to
 * the end, where someone who wants it will find it and everyone else will not
 * be blocked by it.
 */
const PROSE_FORMAT = `HOW TO LAY THIS OUT — a reading nobody can read is worth nothing:
• SHORT paragraphs: two or three sentences, then a blank line. Never a block of
  more than four lines.
• Where you are listing periods, areas or steps, use "• " bullets, one per line.
• Bold the single most important phrase in each paragraph with **double
  asterisks** — one per paragraph, never a whole sentence.
• PLAIN LANGUAGE FIRST. The opening sentence of every section must be about
  THEIR LIFE, never about a planet, a period, a house or a yoga. Write "2021 se
  2025 tak padhai aur naye rishton ka daur tha" — not "Venus Mahadasha ne…".
• ALL the technical detail — planet names, house numbers, dasha and antardasha
  names, yogas, Sade Sati — belongs in the LAST section and nowhere else. Name
  that section "Kyun — chart mein kya hai" (or its equivalent in the reply
  language). Being able to check the reading matters, so do not drop the
  technical part; just keep it where it belongs.`;

export async function generateFocusedReport(chart: any, type: string, language: string, transit?: any): Promise<any> {
  const cfg = REPORT_TYPES[type];
  if (!cfg) return { error: "Unknown report type" };
  const context = { ...buildFullChartContext(chart), live_transit: transit ?? null };

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

Write a detailed, premium personal report focused ONLY on ${cfg.focus}

Ground EVERY point in this person's actual chart. Be SPECIFIC: name concrete
fields, amounts of time (years or age windows from the dasha), and real
examples — never vague filler. Warm and human, addressing them directly.

${PROSE_FORMAT}

Respond with a SINGLE valid JSON object of EXACTLY this shape:
{
  "title": "${cfg.title}",
  "intro": "a warm 2-3 sentence opening, personalised to them",
  "sections": [ { "heading": "short section title", "body": "a few natural sentences" } ],
  "disclaimer": "one short kind line (for wealth: not financial advice; for the rest: guidance not certainty)"
}
Give 5 to 7 sections, and make the LAST one the technical "Kyun — chart mein
kya hai" section described above. Keep each body to two or three short
paragraphs, not a giant essay.

This person's COMPLETE calculated chart data (interpret only this):
${JSON.stringify(context)}

THE ONLY TRUE BIRTH-CHART PLACEMENTS — every plain "Nth house" must match this
line exactly; a D9/D10/D6/D11 or transit number must be named as one in the same
sentence:
${birthChartFactSheet(chart)}

FINAL CHECK: does every house number match the line above, and does the last
section hold all the technical detail?`;

  const text = await generateChecked(prompt, chart, transit, { json: true, temperature: 0.8, thinkingBudget: 0, maxTokens: 3500, purpose: "report", strong: true });
  {
    const j = parseJsonLoose(text);
    if (!j) return { error: "Failed to parse report", raw: text };
    const sections = Array.isArray(j.sections) ? j.sections.filter((s: any) => s?.heading && s?.body) : [];
    return tidyReport({
      title: j.title || cfg.title,
      intro: j.intro || "",
      sections,
      // Fewer than four sections means the reply was cut short: say so rather
      // than passing half a report off as the whole thing.
      partial: sections.length < 4,
      disclaimer: j.disclaimer || "",
    });
  }
}

/** Life-timeline horizons. `months` is the look-ahead window. */
export const TIMELINE_RANGES: Record<string, { label: string; months: number; blurb: string }> = {
  month:   { label: "Next 30 Days",     months: 1,  blurb: "the coming month" },
  quarter: { label: "Next 3 Months",    months: 3,  blurb: "the coming three months" },
  year:    { label: "The Year Ahead",   months: 12, blurb: "the next twelve months" },
  long:    { label: "3–5 Year Outlook", months: 60, blurb: "the next three to five years" },
};

/**
 * Real dasha windows overlapping [now, now+months] — the honest date anchors a
 * forecast is built on, so the AI never has to invent timing. Returns the
 * antardasha (sub-period) spans that fall inside the horizon, newest cut to the
 * horizon end, capped so the prompt stays lean.
 */
function dashaAnchors(chart: any, months: number): Array<{ from: string; to: string; label: string }> {
  const antar: any[] = chart?.dasha?.antardasha ?? [];
  if (!antar.length) return [];
  const now = Date.now();
  const end = now + months * 30.44 * 24 * 3600 * 1000;
  const t = (s: string) => new Date(s).getTime();
  const overlapping = antar
    .filter((a) => a?.from && a?.to && t(a.to) > now && t(a.from) < end)
    .sort((x, y) => t(x.from) - t(y.from))
    .map((a) => ({ from: a.from, to: a.to, label: a.label ?? `${a.mahadasha}-${a.lord}` }));
  // For short horizons there is usually just the running antardasha; for long
  // ones cap the list so we don't flood the prompt.
  return overlapping.slice(0, months <= 3 ? 2 : 8);
}

/**
 * A personalised life-timeline / forecast for a horizon (30 days · 3 months ·
 * 1 year · 3-5 years). Grounded on the real dasha windows so dates are never
 * fabricated. Returns:
 * { range, range_label, headline, summary,
 *   areas:[{area, outlook, trend}],
 *   key_periods:[{from, to, label, title, prediction, tone}] }
 */
export async function generateLifeTimeline(
  chart: any, range: string, language: string, transit?: any,
): Promise<any> {
  const cfg = TIMELINE_RANGES[range] ?? TIMELINE_RANGES.year;
  const anchors = dashaAnchors(chart, cfg.months);
  const context = {
    ...buildFullChartContext(chart),
    live_transit: transit ?? null,
    horizon: cfg.label,
    // The ONLY dates the model may use for key_periods — real dasha windows.
    dasha_windows: anchors,
  };

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

You are preparing a personal ASTROLOGY TIMELINE / FORECAST for ${cfg.blurb} for
this person. Base everything on their real chart, the running dasha/antardasha,
and the live transit (gochar) of Saturn, Jupiter, Rahu-Ketu and the Moon.

TIMING RULES — very important:
- The array "dasha_windows" holds the ONLY real date ranges you may quote. When
  a key period needs a from/to date, copy it from one of those windows. NEVER
  invent any other exact date. If there are no windows, keep key_periods short
  and speak in gentle relative terms ("early in this period", "later weeks").
- Keep the outlook realistic and kind: no doom, no death/lifespan claims, no
  guaranteed money/marriage promises. Guidance, not certainty.

Be SPECIFIC and personal (use "aap"), tie points to the actual house/planet/
dasha naturally inside the sentence. Bold the few most important words with
**double asterisks**.

Respond with a SINGLE valid JSON object of EXACTLY this shape:
{
  "headline": "one vivid line capturing the theme of ${cfg.blurb}",
  "summary": "a warm 2-3 sentence overview tied to the running dasha & transit",
  "areas": [
    { "area": "Career",        "outlook": "2-3 sentences", "trend": "rising|steady|testing" },
    { "area": "Money",         "outlook": "2-3 sentences", "trend": "rising|steady|testing" },
    { "area": "Relationships", "outlook": "2-3 sentences", "trend": "rising|steady|testing" },
    { "area": "Health",        "outlook": "2-3 sentences", "trend": "rising|steady|testing" }
  ],
  "key_periods": [
    { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD", "label": "the dasha label",
      "title": "short phrase", "prediction": "2-3 sentences of what this window brings",
      "tone": "supportive|mixed|challenging" }
  ]
}
Give ${cfg.months <= 3 ? "1 to 3" : "3 to 6"} key_periods, each using a real date
range from dasha_windows. Keep every field a few natural sentences, never a giant
essay.

This person's COMPLETE calculated chart data (interpret only this):
${JSON.stringify(context)}

THE ONLY TRUE BIRTH-CHART PLACEMENTS — a plain "Nth house" must match this line.
A transit is not a birth placement: if you mean where a planet is passing NOW,
say "gochar mein" in the same sentence.
${birthChartFactSheet(chart)}`;

  // The forecast is checked too: its dates come from real dasha windows, and a
  // placement invented around them would make the whole thing unfalsifiable.
  // 3000, not 4096: the budget is reserved against the provider's per-request
  // ceiling, and a forecast has never needed more than half of it — while the
  // bigger reservation pushed the whole call past Groq's limit and into a
  // slower provider, which is where the 46-second generations came from.
  const text = await generateChecked(prompt, chart, transit, { json: true, temperature: 0.8, thinkingBudget: 0, maxTokens: 3000, purpose: "timeline", strong: true });
  try {
    const j = parseJsonLoose(text) ?? {};
    return {
      range,
      range_label: cfg.label,
      headline: j.headline || "",
      summary: j.summary || "",
      areas: Array.isArray(j.areas) ? j.areas.filter((a: any) => a?.area && a?.outlook) : [],
      key_periods: Array.isArray(j.key_periods)
        ? j.key_periods.filter((p: any) => p?.prediction).map((p: any) => ({
            from: p.from || "", to: p.to || "", label: p.label || "",
            title: p.title || "", prediction: p.prediction, tone: p.tone || "mixed",
          }))
        : [],
    };
  } catch {
    return { error: "Failed to parse timeline", raw: text };
  }
}

/**
 * Update the rolling notes an astrologer keeps about a person.
 *
 * Runs AFTER the reply has already been sent (fire-and-forget), so it never
 * adds latency to the conversation. Cheap model settings on purpose — this is
 * bookkeeping, not a reading.
 */
export async function updateChatNotes(args: {
  existingNotes: string;
  question: string;
  reply: string;
}): Promise<string> {
  const prompt = `You keep short private notes about a person so an astrologer can
remember them next time they talk. Update the notes with anything durable from
this exchange.

KEEP (things that stay true and change the advice):
- their situation: work, business, studies, marital status, family, health worries
- what they are actually worried about or hoping for
- decisions they are weighing, and anything they said they would do
- what they have already been told, so it is not repeated

DROP: greetings, small talk, astrology you told them (that is recomputed each
time), anything that expires quickly.

RULES:
- Output ONLY the updated notes: short "- " bullets, max 8 bullets, max 200 words.
- Merge with the existing notes; do not duplicate. Drop what is now outdated.
- Third person, plain and factual. No astrology jargon, no advice.
- If nothing durable came up, return the existing notes UNCHANGED.

EXISTING NOTES:
${args.existingNotes || "(none yet)"}

THEY SAID: ${args.question}
ASTROLOGER REPLIED: ${gist(args.reply, 500)}

Updated notes:`;

  const out = await llmGenerate(prompt, { temperature: 0.3, thinkingBudget: 0, light: true, purpose: "memory" });
  return String(out || "").trim();
}

/**
 * "What should I do today?" — answered by a FRIEND, not a pandit.
 *
 * Deliberately strips the astrology vocabulary: no bhaav, no dasha names, no
 * Sanskrit. The chart and the live transit still drive every word, but what
 * comes out is what a clued-in friend would text you — do this, skip that, and
 * the hour that suits you best.
 */
export async function generateFriendAdvice(args: {
  chart: any;
  transit?: any;
  window: { verdict: string; current: string; nextGood: string | null };
  language: string;
  userName?: string;
}): Promise<{ headline: string; do_now: string; avoid: string; best_time: string } | { error: string; raw?: string }> {
  const context = {
    ...buildFullChartContext(args.chart),
    live_transit: args.transit ?? null,
    timing_window: args.window,
  };

  const prompt = `${languageInstruction(args.language)}

You are this person's sharp, warm FRIEND who happens to understand astrology —
not an astrologer performing. They asked: "what should I do today?"

VOICE — this is the whole point:
- Talk like a friend texting. "Aaj client ko call kar le, baat ban jayegi."
- **ZERO astrology vocabulary.** Never write bhaav, dasha, antardasha, gochar,
  nakshatra, Rahu Kaal, choghadiya, house numbers, planet names or Sanskrit.
  You READ all of that below; you just never say it out loud. If you feel the
  urge to explain why, say it in feelings instead: "aaj patience kam rahega",
  "energy achhi hai, log sun lenge".
- No greetings, no "aapki kundli ke anusaar", no disclaimers, no advice about
  astrology. Just the plan.
- Concrete and everyday: calls, work, money, family, rest, errands, health.
  Never "be positive" or "work hard" — that helps nobody.

Respond with a SINGLE valid JSON object, exactly these keys:
{
  "headline":  "one punchy line about the shape of today (max 12 words)",
  "do_now":    "the ONE thing worth doing today and why it'll go well (max 25 words)",
  "avoid":     "the ONE thing to skip or postpone today (max 25 words)",
  "best_time": "the stretch of the day that suits them best, in plain clock terms (max 18 words)"
}
${args.userName ? `Their name is ${args.userName} — you may use it once.` : ""}

Their chart, the sky right now, and how the current time window is rated
(interpret only this — and remember, none of these words may appear in your reply):
${JSON.stringify(context, null, 2)}`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.85, thinkingBudget: 0, maxTokens: 4096 });
  try {
    const j = parseJsonLoose(text) ?? {};
    return {
      headline: j.headline || "",
      do_now: j.do_now || "",
      avoid: j.avoid || "",
      best_time: j.best_time || "",
    };
  } catch {
    return { error: "Failed to parse advice", raw: text };
  }
}

/** Warm, specific summary for a Kundli (compatibility) match result. */
/**
 * The one answer a family actually came for: should this happen, and what then.
 *
 * Structured rather than prose, because the screen has to colour it, sort it
 * and put it above everything else — and because prose lets a model hedge its
 * way out of committing to anything, which is the opposite of useful here.
 *
 * Three rules it is held to:
 *  · The recommendation weighs EVERY layer. A 30/36 score with a weak
 *    individual promise, or with no shared window for ten years, is not a clean
 *    "proceed", and saying so is the whole point of computing those layers.
 *  · It never tells anyone not to marry. A chart is not entitled to end a
 *    relationship; the honest form of a difficult reading is "this needs real
 *    care and an astrologer who can sit with you", not a verdict.
 *  · `solutions` may only draw on the remedies computed by rule and handed in
 *    below. A model inventing a puja for a dosha this couple does not have is
 *    how someone ends up paying for one.
 */
export async function generateMatchVerdict(args: {
  base: any;          // Ashtakoot result
  boy: any;           // DeepPerson
  girl: any;          // DeepPerson
  timing: any;        // TimingAlignment
  doshas: any[];      // DoshaDetail[]
  remedies: any[];    // Remedy[] — already decided by rule
  language: string;
}): Promise<{
  headline: string;
  recommendation: "proceed" | "proceed_with_care" | "consult_astrologer";
  will_it_go_well: string;
  problems: string[];
  solutions: string[];
}> {
  const first = (n: any, fb: string) => String(n ?? "").trim().split(/\s+/)[0] || fb;
  const packet = {
    score: { total: args.base?.total, max: args.base?.max, percent: args.base?.percent, verdict: args.base?.verdict },
    kootas: (args.base?.kootas ?? []).map((k: any) => ({ name: k.name, score: k.score, max: k.max })),
    doshas: args.doshas.map((d) => ({ name: d.name, present: d.present, cancelled: d.cancelled, active: d.active })),
    groom: {
      name: first(args.boy?.name, "the groom"),
      lagna: args.boy?.lagna, moon: args.boy?.moon_sign,
      seventh_lord: args.boy?.seventh_d1?.lord,
      seventh_lord_house: args.boy?.seventh_d1?.lord_house,
      seventh_lord_in_dusthana: args.boy?.seventh_d1?.lord_in_dusthana,
      venus: args.boy?.venus, jupiter: args.boy?.jupiter,
      own_marriage_promise: args.boy?.promise?.level,
      current_dasha: args.boy?.current_dasha,
      next_marriage_windows: (args.boy?.marriage_windows ?? []).slice(0, 3),
    },
    bride: {
      name: first(args.girl?.name, "the bride"),
      lagna: args.girl?.lagna, moon: args.girl?.moon_sign,
      seventh_lord: args.girl?.seventh_d1?.lord,
      seventh_lord_house: args.girl?.seventh_d1?.lord_house,
      seventh_lord_in_dusthana: args.girl?.seventh_d1?.lord_in_dusthana,
      venus: args.girl?.venus, jupiter: args.girl?.jupiter,
      own_marriage_promise: args.girl?.promise?.level,
      current_dasha: args.girl?.current_dasha,
      next_marriage_windows: (args.girl?.marriage_windows ?? []).slice(0, 3),
    },
    timing: { aligned: args.timing?.aligned, overlaps: (args.timing?.overlaps ?? []).slice(0, 3) },
    remedies_available: args.remedies.map((r) => ({ dosha: r.dosha, title: r.title, steps: r.steps })),
  };

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(args.language)}

A family has asked the one question that matters to them: should this marriage
go ahead, will it go well, what will be hard, and what can be done about it.

Everything below was CALCULATED by the app. Interpret it; never recompute it,
never invent a placement, a dosha or a period that is not here.
${JSON.stringify(packet)}

How to weigh it — this is the part that makes the answer worth reading:
 • The 36-point score is ONE layer. Each person's OWN marriage promise
   (own_marriage_promise) and whether their supportive periods overlap
   (timing.aligned) matter just as much. A high score with a weak promise, or
   with no shared window, is NOT a clean "proceed" — say plainly that the score
   alone would have misled them.
 • A dosha that is cancelled is NOT a problem. Never list one as a concern.
 • NEVER tell them not to marry, and never call a marriage doomed. Where the
   data is genuinely difficult, the honest answer is that it needs real care and
   an astrologer who can sit with the family — not a refusal.
 • "solutions" may only use the remedies listed in remedies_available, plus
   ordinary practical advice (talking early about money, meeting each other's
   families, not rushing a date). If remedies_available is empty, do NOT invent
   a puja — there is no dosha to remedy.
 • Every problem must come from THIS data, with the reason visible. "Communication
   may need work" is worthless; "his 7th lord sits in the 12th, so he withdraws
   when a disagreement starts" is what they came for.

Return ONLY a JSON object, nothing else:
{
  "headline": "one plain sentence — the bottom line, no jargon",
  "recommendation": "proceed" | "proceed_with_care" | "consult_astrologer",
  "will_it_go_well": "2-4 sentences, grounded in the data above",
  "problems": ["2-5 concrete concerns from THIS match"],
  "solutions": ["2-5 concrete actions"]
}`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.7, thinkingBudget: 0, maxTokens: 2048 });
  const j = parseJsonLoose(text) ?? {};
  const arr = (v: any, n: number) =>
    (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, n);
  const rec = ["proceed", "proceed_with_care", "consult_astrologer"].includes(j.recommendation)
    ? j.recommendation
    : "proceed_with_care";
  return tidyReport({
    headline: String(j.headline ?? "").trim(),
    recommendation: rec as "proceed" | "proceed_with_care" | "consult_astrologer",
    will_it_go_well: String(j.will_it_go_well ?? "").trim(),
    problems: arr(j.problems, 5),
    solutions: arr(j.solutions, 5),
  });
}

/**
 * Both charts, compacted for a couple-level question.
 *
 * All twelve houses for each person, not just the marriage ones. The first
 * version sent only the 7th, Venus and Jupiter — and then could not answer
 * "how will our kids be?", "will his family accept me?" or "how will money
 * be?", which is most of what people actually type into a matching screen. The
 * 5th, 4th, 9th, 2nd, 10th and 11th houses are the answer to those, and they
 * cost almost nothing to include.
 */
function couplePacket(base: any, boy: any, girl: any, timing: any, doshas: any[]) {
  const side = (p: any) => ({
    name: String(p?.name ?? "").trim().split(/\s+/)[0],
    lagna: p?.lagna, lagna_lord: p?.lagna_lord, moon: p?.moon_sign, nakshatra: p?.nakshatra,
    houses: (p?.d1_houses ?? []).map((h: any) => ({ h: h.house, sign: h.sign, lord: h.lord, in: h.occupants })),
    navamsa_houses: (p?.d9_houses ?? []).map((h: any) => ({ h: h.house, sign: h.sign, in: h.occupants })),
    planets: p?.planets,
    seventh: p?.seventh_d1, seventh_navamsa: p?.seventh_d9,
    venus: p?.venus, jupiter: p?.jupiter,
    marriage_promise: p?.promise?.level,
    dasha_now: p?.current_dasha,
    marriage_windows: (p?.marriage_windows ?? []).slice(0, 5),
  });
  return {
    score: { total: base?.total, max: base?.max, percent: base?.percent, verdict: base?.verdict },
    kootas: (base?.kootas ?? []).map((k: any) => ({ name: k.name, score: k.score, max: k.max })),
    doshas: doshas.map((d) => ({ name: d.name, active: d.active, cancelled: d.cancelled })),
    timing,
    groom: side(boy),
    bride: side(girl),
  };
}

/** Questions worth tapping, given what THIS match actually shows. */
export function matchQuestionChips(language: string): string[] {
  if (language === "hi") {
    return [
      "क्या हमारा रिश्ता लंबा चलेगा?",
      "हमारे बच्चे कैसे होंगे?",
      "हमारी सबसे बड़ी समस्या क्या होगी?",
      "पैसों को लेकर कैसा रहेगा?",
      "ससुराल वालों से कैसा रिश्ता रहेगा?",
      "शादी के लिए सबसे अच्छा समय कौन सा है?",
    ];
  }
  if (language === "hinglish") {
    return [
      "Kya hamara rishta lamba chalega?",
      "Hamare bacche kaise honge?",
      "Hamari sabse badi problem kya hogi?",
      "Paison ko lekar kaisa rahega?",
      "Sasural walon se kaisa rishta rahega?",
      "Shaadi ke liye sabse accha samay kaun sa hai?",
    ];
  }
  return [
    "Will we last long term?",
    "How will our kids be?",
    "What's our biggest problem?",
    "How will money be between us?",
    "How will his/her family treat me?",
    "When is the best time for the wedding?",
  ];
}

/**
 * Free-form question about THIS couple, answered from BOTH charts.
 *
 * Same safety floor as the main chat: no "don't marry", no diagnosis, no
 * claiming to know what a third person privately feels or will decide.
 */
/**
 * The part before the answer: someone talking, and being talked back to.
 *
 * The first version of this feature asked for the decision in a box and then
 * put three multiple-choice questions on the screen. It worked, and it felt
 * like a form — which is the one thing the chatbot people already use at one
 * in the morning never feels like. They do not arrive with a well-formed
 * question; they arrive with "aaj bahut bura din tha, usne reply nahi kiya"
 * and they want someone to react to THAT before anything else.
 *
 * So: short replies in their own words, ONE question at a time, chips only as
 * suggestions they can ignore, and no card until there is actually something
 * to decide. If they only came to say it out loud, that is a complete use of
 * this screen and the model is told so.
 *
 * Cheap on purpose — no chart, no divisionals, a few hundred tokens — and
 * marked `light`, so the strong models stay free for the card itself.
 */
export async function decisionTalk(args: {
  history: Array<{ role: "user" | "assistant"; text: string }>;
  facts?: Record<string, unknown>;
  memory?: string;
  userName?: string;
  language: string;
  /** How many questions this conversation has already put to them. */
  asked?: number;
  /** They have stated a choice outright — stop gathering and decide. */
  mustDecide?: boolean;
}): Promise<{ reply: string; ask: { question: string; options: string[] } | null; ready: boolean; summary: string }> {
  const convo = args.history
    .slice(-10)
    .map((m) => `${m.role === "user" ? "Them" : "You"}: ${gist(m.text, 400)}`)
    .join("\n");

  const prompt = `${PERSONA}

${languageInstruction(args.language)}

You are talking with ${args.userName || "someone"} who has opened a screen called
"ab kya karun" — what should I do. They may arrive with a clear decision, or
with a bad day and no question at all. Both are fine.

${args.facts && Object.keys(args.facts).length ? `What they have already told us about their life (never ask for these again):\n${JSON.stringify(args.facts)}\n` : ""}${args.memory ? `From earlier conversations:\n${args.memory}\n` : ""}
The conversation so far:
${convo}

Reply as a JSON object, exactly:
{
  "reply": string,
  "ask": { "question": string, "options": [string, string, string] } | null,
  "ready": true | false,
  "summary": string
}

HOW TO TALK — this is the whole thing:
• Answer what they ACTUALLY said, in their own words. If they said their day was
  bad and someone did not reply, say something about that, not about decisions.
  Never open with "I understand" or "That sounds hard" — those are noises, not
  replies. Say the specific thing you noticed.
• Two or three SHORT lines. Like a friend texting, not a counsellor writing.
• Never lecture, never list, never give advice in this part. You are listening.
• Use their name occasionally, not every message.
• Never mention astrology, planets, periods or charts here. Not once.
• Their language, always — even if they typed in another one.

${args.mustDecide
    ? `THEY HAVE NOW NAMED THE CHOICE ITSELF ("… karun ya nahi"). Stop gathering.
Reply to what they just said in one or two lines, set "ask" to null, set
"ready" to true, and put their decision in "summary" in their own words.\n`
    : args.asked && args.asked >= 3
      ? `You have already asked them ${args.asked} questions. Ask NOTHING more —
set "ask" to null and decide whether there is a decision here ("ready").\n`
      : ""}
NEVER REPEAT YOURSELF. Do not say again what you already said one message ago —
not the same sympathy, not the same observation, not the same question reworded.
Each reply moves one step forward or it is noise.

"ask" — ONE question, never a list of them:
• The single thing you most need to know to help, phrased like a person:
  "Achha… pichhli baar baat kaise khatam hui thi?"
• "options" are three SHORT answers to the question you just asked — two to four
  words each, the way they would reply ("Jhagda hua tha", "Usne ignore kiya").
  They must fit YOUR question: options that answer some other question are worse
  than none. They can also just type, so options are suggestions, never the only
  way through.
• Do NOT ask something they already answered, and do not ask more than four
  questions across the whole conversation. When you have enough, set ask to null.
• If they are only venting and there is no decision in sight, do not interrogate
  them. Ask gently whether they want help deciding something, or just to talk.

"ready":
• true when there IS a decision to make and you know enough to make it — usually
  after one or two questions.
• false while you are still listening, or when there is nothing to decide.

"summary" — one plain line naming the decision as THEY would say it
("usse aaj message karun ya nahi"), or "" when there is no decision yet. This
is what the card gets built from, so it must be their situation, not a category.

${languageInstruction(args.language)}`;

  /*
   * Not `light`. Everywhere else the small models are fine, but this is the
   * part where the app either sounds like a person or does not, and the weak
   * one repeats itself and answers a question nobody asked. The prompt is small
   * (no chart, no divisionals), so the strong model is affordable here.
   */
  const text = await llmGenerate(prompt, {
    temperature: 0.85, thinkingBudget: 0, maxTokens: 700, purpose: "decide_talk",
  });
  const j = parseJsonLoose(text) ?? {};
  const options = Array.isArray(j?.ask?.options) ? j.ask.options.slice(0, 3).map(String) : [];
  // A model that keeps asking questions is a model that never helps. When they
  // have named the choice, or three questions have already gone by, the decision
  // is ready whatever the model thinks.
  const forced = !!args.mustDecide || (args.asked ?? 0) >= 3;
  return {
    reply: String(j.reply ?? "").trim(),
    ask: forced ? null : (j?.ask?.question ? { question: String(j.ask.question), options } : null),
    ready: forced || j.ready === true,
    summary: String(j.summary ?? "").trim(),
  };
}

/**
 * A decision, answered — the card people actually came for.
 *
 * The shape is the feature. A paragraph of "on one hand, on the other hand" is
 * what they already got from a chatbot at 1am and it is why they are still
 * awake: it costs nothing to write and decides nothing. So this returns a
 * verdict word, the reason in one line, the exact thing to send if sending is
 * the decision, and — the part that makes a "no" survivable — what to do if it
 * goes the other way.
 *
 * The WHEN is not here. It is computed from the panchang before this is called
 * and handed in, because a model asked for a time will write a confident one
 * that means nothing, and the timing is the one thing in this card that a
 * chatbot cannot fake.
 *
 * Two rules matter more than the rest:
 *   • Nothing about what the OTHER person will do. Their chart is not here and
 *     their mind is their own. "She will say yes" is the sentence that ends
 *     with someone standing outside a building at midnight.
 *   • Nothing that works ON someone. No lines engineered to guilt, corner or
 *     wear a person down — the draft is what this person honestly wants to say,
 *     said well.
 */
/*
 * The window, with its vocabulary removed.
 *
 * The panchang explains itself in its own words — "Udveg is running until
 * 3:20 PM" — and a model handed that sentence repeats it, so a card that
 * promised no jargon opened with a Sanskrit term the reader had to look up.
 * The app still shows the real reason in small print; the model gets the clock
 * and nothing else.
 */
function plainWindow(w: any) {
  return { when: w?.when, act_between: w?.window, do_not_act_between: w?.avoid, date: w?.date };
}

/** Words that have no business in a decision card, whatever the model thinks. */
const JARGON = /\b(mahadasha|antardasha|antar ?dasha|dasha|dasa|bhukti|nakshatra|rashi|rasi|lagna|ascendant|kundli|kundali|navamsa|navamsha|d9|d10|gochar|transit|retrograde|vakri|sade ?sati|shani|mangal|manglik|rahu|ketu|shukra|budh|guru|brihaspati|surya|chandra|saturn|jupiter|venus|mercury|mars|yoga|yog|choghadiya|chogadiya|udveg|amrit|shubh|labh|rog|kaal|muhurat|muhurta|panchang|tithi|house)\b/i;

export async function generateDecision(args: {
  question: string;
  kind: string;
  answers: Record<string, string>;
  chart: any;
  facts?: Record<string, unknown>;
  memory?: string;
  window?: any;
  transit?: any;
  wantsDraft: boolean;
  userName?: string;
  language: string;
  history?: Array<{ question: string; verdict: string; outcome?: string }>;
}): Promise<any> {
  const packet = {
    their_chart: buildChartPacket(args.chart, detectCategory(args.question), args.transit),
    what_they_told_us: args.facts ?? {},
    their_answers: args.answers,
    /*
     * How their own past decisions actually went. Two lines of this is worth
     * more than another paragraph of chart: someone who has rushed the last
     * three and regretted them needs to hear that, from their own record.
     */
    past_decisions: (args.history ?? []).slice(-5),
  };

  const prompt = `${REPORT_SYSTEM}

${languageInstruction(args.language)}

${args.userName ? `You are helping ${args.userName}. ` : ""}They are stuck on a real decision and want an answer, not a lecture. This is a "${args.kind}" decision.

WHAT THEY ASKED: "${args.question}"

Their answers to the two or three things that change this, their chart, what
they have told us about their life, and how their own past decisions went:
${JSON.stringify(packet)}
${args.memory ? `\nWhat earlier conversations established about them:\n${args.memory}\n` : ""}
${args.window ? `THE TIMING IS ALREADY DECIDED, from the panchang for their own place — use this clock window EXACTLY, never a different time, and never name the tradition it came from:\n${JSON.stringify(plainWindow(args.window))}\n` : "No clock window could be computed — do not invent one; speak of days, not hours.\n"}
Answer as a SINGLE valid JSON object, exactly this shape:
{
  "verdict": "yes" | "no" | "wait",
  "headline": string,
  "why": string,
  "draft": ${args.wantsDraft ? `{ "direct": string, "soft": string } or null` : "null"},
  "if_it_goes_wrong": string,
  "avoid": [string, string],
  "confidence": "high" | "medium" | "low"
}

WHAT EACH ONE IS:
• verdict — "yes" do it, "no" don't, "wait" do it but not yet. Pick one. A
  decision tool that will not decide is a worse chatbot.
• THE CLOCK WINDOW ABOVE IS THE ONLY TIMING. Never contradict it: if it says
  today, do not write "kal karna", and if it names hours, do not name different
  ones. "wait" means wait for THAT window, not for another day.
• headline — one short line in their language, the answer in plain words, e.g.
  "Haan — par aaj raat nahi, kal subah." Under 12 words.
• why — two or three sentences. The REAL reason: what they told you, the shape
  of their own period, and what usually happens in this situation. Plain words,
  no house numbers, no planet names, no Sanskrit.
• draft — ${args.wantsDraft
    ? `the actual message to send, if this decision is about saying something to
  someone. "direct" says it plainly; "soft" says the same thing more gently.
  Both in THEIR voice — short, human, no emojis, nothing theatrical, nothing
  that guilts or corners the other person.
  WRITE IT EVEN WHEN THE ANSWER IS "no" OR "wait" — then it is the message for
  when the time comes. Telling someone not to send anything tonight and handing
  them nothing for tomorrow is half an answer, and they will write it at 2am
  themselves. Only use null when the decision is not about contacting anyone.`
    : `always null for this request.`}
• if_it_goes_wrong — what to do if the answer is no, the reply never comes, the
  offer falls through. Concrete and kind: a next step and a timeframe, so a bad
  outcome is a plan and not a collapse.
• avoid — exactly two things NOT to do in the next few days, specific to this
  situation ("double message mat bhejna", "raat 11 ke baad mat likhna").
• confidence — how sure this is, honestly. "low" when they have told you very
  little.

NEVER:
• Never say what the other person will do, feel, or decide. You do not have
  their chart and you cannot read a mind. Say what THIS person can control.
• Never write anything designed to pressure, guilt, corner or wear someone down.
• Never guarantee an outcome, and never promise that something will work.
• Never tell them to leave a job, take a loan, break up, move out or spend a
  large amount — say what the period supports and leave the choice with them.
• No diagnosis, no medicine, no legal instruction.
• Never mention planets, houses, dashas or any Sanskrit term anywhere in this
  card. They came for an answer, not a reading.

Every string in their language. No markdown except plain text. Be short —
this is a card someone reads in fifteen seconds at one in the morning.

${languageInstruction(args.language)}`;

  const opts = { temperature: 0.7, thinkingBudget: 0, maxTokens: 1200, purpose: "decide" } as const;
  let text = await llmGenerate(prompt, opts);
  /*
   * One rewrite when the card talks like an astrologer.
   *
   * "Abhi Sade Sati chal rahi hai" is exactly what this feature is not: they
   * asked whether to send a message. The rule is in the prompt and models
   * still reach for the vocabulary, so it is checked here and sent back once —
   * which costs a call only on the cards that earned it.
   */
  if (JARGON.test(String(text))) {
    const bad = String(text).match(JARGON)?.[0] ?? "";
    console.warn(`[decide] card used astrology vocabulary ("${bad}") — rewriting once`);
    const retry = await llmGenerate(
      prompt + `\n\nCORRECTION — your previous draft used the word "${bad}". This card must contain NO astrology vocabulary at all: no planets, houses, periods, yogas, panchang or Sanskrit terms, in any field. Say what it MEANS for them in ordinary words instead. Rewrite the whole card.\n`,
      opts,
    ).catch(() => null);
    if (retry && !JARGON.test(retry)) text = retry;
  }
  const j = parseJsonLoose(text);
  if (!j?.headline) throw new Error("Decision came back unreadable");
  const verdict = ["yes", "no", "wait"].includes(String(j.verdict)) ? j.verdict : "wait";
  return tidyReport({
    ...j,
    verdict,
    avoid: Array.isArray(j.avoid) ? j.avoid.slice(0, 2).map(String) : [],
    draft: args.wantsDraft && j.draft?.direct ? { direct: String(j.draft.direct), soft: String(j.draft.soft ?? "") } : null,
  });
}

/**
 * Marriage Outlook — what living this marriage would actually be like.
 *
 * A score and a verdict answer "should we", and people then ask the questions
 * the score cannot: how will we be with each other, about money, about
 * children, and is this a good stretch or a hard one right now. Three honest
 * scenarios beat one confident paragraph, because a chart is a lean, not a
 * transcript — and naming the worst case plainly is what makes the best case
 * worth anything.
 *
 * The limits are in the prompt for a reason, not decoration: physical
 * compatibility is written the way a family astrologer would say it out loud,
 * and children are spoken of as a supportive or demanding window — never a
 * promise, never a diagnosis, never a reason for someone to stop seeing a
 * doctor.
 */
export async function generateMarriageOutlook(args: {
  base: any; boy: any; girl: any; timing: any; doshas: any[];
  boyTransit?: any; girlTransit?: any; language: string;
}): Promise<any> {
  const person = (p: any, transit: any) => ({
    name: p.name, lagna: p.lagna, moon_sign: p.moon_sign, nakshatra: p.nakshatra,
    seventh_house_d1: p.seventh_d1, seventh_house_d9: p.seventh_d9,
    venus: p.venus, jupiter: p.jupiter,
    own_marriage_promise: p.promise,
    current_period: p.current_dasha,
    supportive_marriage_windows: (p.marriage_windows ?? []).slice(0, 3),
    transit_now: transit?.transiting_planets
      ?.filter((t: any) => ["Jupiter", "Saturn", "Rahu", "Ketu"].includes(t.planet))
      ?.map((t: any) => ({ planet: t.planet, sign: t.sign, from_their_lagna: t.transit_house_from_lagna, from_their_moon: t.transit_house_from_moon })),
  });
  const packet = {
    ashtakoot: { total: args.base?.total, max: args.base?.max, verdict: args.base?.verdict, kootas: args.base?.kootas },
    doshas: args.doshas,
    timing_alignment: args.timing,
    boy: person(args.boy, args.boyTransit),
    girl: person(args.girl, args.girlTransit),
  };

  const prompt = `${REPORT_SYSTEM}

${languageInstruction(args.language)}

Two people are considering marriage. Everything below — their Ashtakoot score,
each koota, the doshas, both charts' 7th house in D1 and D9, Venus and Jupiter,
each person's own marriage promise, their running periods and the live transits
over each of their charts — is ALREADY CALCULATED. Interpret only this. Never
invent a placement, a date or a score.

Write their MARRIAGE OUTLOOK as a single valid JSON object, exactly this shape:
{
  "scenarios": {
    "best":      { "outlook": string, "supporting_planets": string, "dasha_support": string, "current_period_note": string },
    "realistic": { "outlook": string, "supporting_planets": string, "dasha_support": string, "current_period_note": string },
    "worst":     { "outlook": string, "supporting_planets": string, "dasha_support": string, "current_period_note": string }
  },
  "compatibility": {
    "emotional": string,
    "physical": string,
    "children": { "outlook": string, "timing_note": string },
    "financial": string
  },
  "conclusion": string
}

WHAT EACH PART MEANS:
• scenarios — the SAME chart read three ways, and all three must be plausible
  from it. "best" is what this marriage looks like when both of them do the work
  their charts ask for; "realistic" is the likeliest everyday shape of it;
  "worst" is what it looks like if the weak points are ignored. Be honest in
  "worst" — a worst case that sounds pleasant is useless — but never predict a
  divorce, a death, an illness or a disaster. Speak of strain, distance, money
  pressure, family friction: things people can act on.
• supporting_planets — the actual placements behind that scenario, named
  (7th lord, Venus, Jupiter, Moon, the koota that carried or cost them).
  ALWAYS SAY WHOSE CHART a placement is in, by their first name: "Priya ka Venus
  11th mein, Arjun ka Jupiter 2nd mein". A bare "Venus 11th house mein" in a
  reading about two people is true of one of them and false about the other,
  and the reader has no way to tell which.
• dasha_support — the real periods, with the dates given above, that make that
  scenario more or less likely.
• current_period_note — what the LIVE transits and running periods say about
  that scenario right now, for THIS couple. 1-2 sentences.
• emotional — Moon to Moon, Venus, Graha Maitri, Gana: how they will feel with
  each other day to day, argue, and make up.
• physical — their physical and intimate bond, written with dignity, the way a
  family astrologer would say it out loud in front of both families. Venus,
  Mars, the 7th and its lord. Never explicit, never crude, never a technique.
• children — favourability ONLY, from the 5th house, its lord, Jupiter and the
  periods. NEVER a promise of children, never a number, never a warning of
  infertility, never anything a doctor should be saying. "timing_note" names
  the supportive window from the dasha, in years.
• financial — the 2nd and 11th houses of both charts together, and whether
  their earning periods support each other.
• conclusion — 2-3 sentences, warm, honest, and clearly THEIR situation, not
  advice that would fit any couple. Close by saying this is guidance, not a
  guarantee, in one short natural clause.

Two or three sentences per string. Plain, warm, specific — name the years, the
placements and the real pattern. No markdown, no bullet characters.

THE COUPLE'S CALCULATED DATA:
${JSON.stringify(packet)}

FINAL CHECK: is every date and score taken from the data above? Is "worst"
genuinely honest without predicting divorce, illness or death? Are children
spoken of as a favourable or demanding window only? Fix anything that fails.

${languageInstruction(args.language)}`;

  const text = await llmGenerate(prompt, {
    temperature: 0.75, thinkingBudget: 0, maxTokens: 2600, purpose: "match_outlook",
  });
  const j = parseJsonLoose(text);
  if (!j?.scenarios?.realistic) throw new Error("Outlook came back unreadable");
  return tidyReport(j);
}

export async function answerMatchQuestion(args: {
  base: any; boy: any; girl: any; timing: any; doshas: any[];
  question: string; language: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
}): Promise<{ answer: string; reason: string }> {
  const convo = (args.history ?? []).slice(-6)
    .map((m) => `${m.role === "user" ? "They" : "You"}: ${m.text}`).join("\n");

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(args.language)}

A couple is asking about themselves. BOTH their charts were calculated by the
app — all twelve houses each, plus the Navamsa, their dashas and the computed
match. Interpret ONLY this; never invent a placement or a period.
${JSON.stringify(couplePacket(args.base, args.boy, args.girl, args.timing, args.doshas))}
${convo ? `\nEarlier in this conversation:\n${convo}\n` : ""}
They ask: "${args.question}"

Answer in TWO parts, separated by a line that is EXACTLY "<<REASON>>".

PART 1 — the answer:
 • Answer what they ACTUALLY asked, from whichever houses hold it: children →
   5th, money → 2nd and 11th, home and mother → 4th, in-laws and elders → 9th,
   work → 10th, health → 6th. It is a full chart for each of them; use it.
 • Name them by first name — "aap dono" for everything reads like a reply that
   forgot who asked.
 • Plain words. No planet names, house numbers or Sanskrit in this part.
 • 3-7 short lines. Finish the thought; never stop mid-sentence.
 • Bold the single most important phrase with **double asterisks**.
 • Never tell them not to marry, never call the marriage doomed, never predict a
   death, an illness or a diagnosis. A hard reading is described as something to
   handle with care and, where it is serious, with an astrologer in person.
 • Never claim to know what a person secretly feels or has decided — describe
   what the charts show about the bond, not someone's private mind.

PART 2 — after "<<REASON>>": 1-3 short lines naming the real basis (houses,
lords, dasha). Technical terms are fine HERE.`;

  const raw = await llmGenerate(prompt, { temperature: 0.8, thinkingBudget: 0, maxTokens: 2048 });
  const i = raw.indexOf("<<REASON>>");
  if (i === -1) return { answer: raw.trim(), reason: "" };
  return { answer: raw.slice(0, i).trim(), reason: raw.slice(i + "<<REASON>>".length).trim() };
}

/**
 * "How will the marriage look around <year>?" — the fixed, always-visible
 * answer beside the year picker.
 *
 * The dasha periods active for BOTH of them in that specific year are computed
 * here and handed over, so the answer is about that year rather than a general
 * reading with a year pasted on top.
 */
export async function answerMatchYear(args: {
  base: any; boy: any; girl: any; year: number; language: string;
  boyPeriods: any[]; girlPeriods: any[];
}): Promise<{ answer: string; reason: string }> {
  const first = (n: any, fb: string) => String(n ?? "").trim().split(/\s+/)[0] || fb;
  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(args.language)}

${JSON.stringify({
    year: args.year,
    score: { total: args.base?.total, max: args.base?.max, verdict: args.base?.verdict },
    groom: {
      name: first(args.boy?.name, "the groom"),
      seventh_lord: args.boy?.seventh_d1?.lord,
      marriage_promise: args.boy?.promise?.level,
      periods_in_that_year: args.boyPeriods,
    },
    bride: {
      name: first(args.girl?.name, "the bride"),
      seventh_lord: args.girl?.seventh_d1?.lord,
      marriage_promise: args.girl?.promise?.level,
      periods_in_that_year: args.girlPeriods,
    },
  })}

Answer one question, for the year ${args.year} specifically: how will the
relationship be, and what will married life look like around that year?

Rules:
 • Ground it in periods_in_that_year for BOTH of them — that is what makes this
   about ${args.year} rather than about them in general. Say which of the two is
   in the more supportive stretch and what that means day to day.
 • 4-8 short lines, plain words, no jargon. Name them by first name.
 • End with one concrete line about what to do with that year.
 • Never say the marriage will fail, never predict illness or death.

Then a line that is EXACTLY "<<REASON>>", and 1-3 short technical lines naming
the dashas you used.`;

  const raw = await llmGenerate(prompt, { temperature: 0.75, thinkingBudget: 0, maxTokens: 2048 });
  const i = raw.indexOf("<<REASON>>");
  if (i === -1) return { answer: raw.trim(), reason: "" };
  return { answer: raw.slice(0, i).trim(), reason: raw.slice(i + "<<REASON>>".length).trim() };
}

export async function generateMatchSummary(result: any, language: string): Promise<string> {
  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

You are giving a couple a warm, honest Kundli-matching (Guna Milan) consultation.
Here is their computed Ashtakoot result (interpret ONLY this — do not recompute):
${JSON.stringify({
    boy: { name: result.boy.name, rasi: result.boy.rasi, nakshatra: result.boy.nakshatra, manglik: result.boy.manglik },
    girl: { name: result.girl.name, rasi: result.girl.rasi, nakshatra: result.girl.nakshatra, manglik: result.girl.manglik },
    total: result.total, max: result.max, percent: result.percent, verdict: result.verdict,
    kootas: result.kootas, doshas: result.doshas,
  }, null, 2)}

Write a clear, structured reply with these headings, each followed by "• " bullets.
Use **bold** for the few most important words. Be SPECIFIC, not vague.
ANSWER: one line — overall how good this match is (${result.total}/36) and the bottom line.
STRENGTHS: the kootas that scored well and what real-life areas they support
(mind, intimacy, family, progeny, finances) — name them.
CONCERNS: the kootas that scored low or any dosha (Mangal/Bhakoot/Nadi) — explain
the practical impact and whether it is cancelled.
GUIDANCE: practical, kind advice and any remedies. Close with one warm line that
astrology guides, it does not decide — mutual understanding matters most.

Plain text only, no markdown except "• " bullets and "**" for bold.`;

  return await llmGenerate(prompt, { temperature: 0.8, thinkingBudget: 0 });
}

/**
 * The small chat beside the life report — a friend, not an astrologer.
 *
 * The main chat is tuned for full readings; next to a report someone is
 * already reading, that machinery answered "is saal job badlun?" with three
 * paragraphs about antardashas. The sibling app gave this widget its own short
 * voice — one or two lines, no vocabulary — and grounded it in the REPORT ON
 * SCREEN, so the chat and the page never disagree about the same chart.
 */
export async function answerAboutReport(args: {
  chart: any;
  report: any;
  question: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  language: string;
  userName?: string;
}): Promise<{ answer: string; section: string | null }> {
  // Only the parts a friend would glance at — the full report is thousands of
  // tokens, and the widget answers in two sentences.
  const brief: Record<string, any> = {};
  for (const a of REPORT_AREAS) {
    const r = args.report?.[a];
    if (r?.summary) brief[a] = { rating: r.rating, summary: r.summary, present: r.present, future: r.future, guidance: r.guidance };
  }
  const convo = (args.history ?? []).slice(-6)
    .map((m) => `${m.role === "user" ? "Them" : "You"}: ${gist(m.text, 240)}`).join("\n");

  const prompt = `${PERSONA}

${languageInstruction(args.language)}

${args.userName ? `You are talking with ${args.userName}, ` : "You are talking with someone "}who is reading their own life
report right now. This is the report on their screen — use it as your source,
so what you say never disagrees with what they are reading:
${JSON.stringify(brief)}

Their birth-chart facts, for anything the report does not cover:
${birthChartFactSheet(args.chart)}
${convo ? `\nThe conversation so far:\n${convo}\n` : ""}
They ask: "${args.question}"

Reply EXACTLY like a WhatsApp message from a close friend — not an astrologer,
not a report, not a teacher:
  • ONE or TWO short sentences. No headings, no lists.
  • No astrology words at all — no dasha, planet, house or sign — unless they
    used that word themselves. Say WHAT will happen and WHAT to do, never HOW the
    chart says so: not "Saturn antardasha delay dikhata hai" but "agle kuch
    mahine thoda sabr rakhna hoga".
  • Answer first, no "aapke chart ke hisaab se" wind-up.
  • Only what they asked. If it fits, end with one short practical tip — real
    advice, not astrology.
  • Still grounded in their report and chart — you are just not SAYING the
    mechanism out loud.

${languageInstruction(args.language)}`;

  const text = await llmGenerate(prompt, { temperature: 0.8, thinkingBudget: 0, maxTokens: 400, purpose: "report_chat" });
  // Which section the question is about, so the page can open it — the chat
  // steering the report is what makes it feel like part of it.
  const cat = detectCategory(args.question);
  const SECTION: Record<string, string> = {
    health: "health", wealth: "wealth", career: "career", marriage: "marriage",
    relationship: "relationships", foreign: "travel", business: "business",
  };
  return { answer: String(text || "").trim(), section: SECTION[cat] ?? null };
}

/**
 * The couple's reading — all five layers, not only the 36-point score.
 *
 * The old summary was handed the Ashtakoot result and nothing else, so it could
 * only ever talk about kootas: a 28/36 couple whose OWN charts barely promise
 * marriage, or whose good periods never overlap, got a glowing paragraph. The
 * deep-match screen already computes every layer that decides a marriage in
 * practice — both 7th houses in D1 and D9, Venus and Jupiter, each person's own
 * marriage promise, and whether their timing lines up — and the sibling app's
 * reading uses all of them. This one now does too.
 */
export async function generateFullMatchSummary(args: {
  base: any; boy: any; girl: any; timing: any; doshas: any[]; language: string;
}): Promise<string> {
  const boyName = String(args.boy?.name ?? "").trim().split(/\s+/)[0] || "Groom";
  const girlName = String(args.girl?.name ?? "").trim().split(/\s+/)[0] || "Bride";
  const prompt = `${PERSONA}

${languageInstruction(args.language)}

You are reading a MARRIAGE MATCH between two people — not one person's chart.
You have FIVE layers of computed data; use all that matter, not only the score:
  1. Ashtakoot Guna Milan — the base every matchmaker starts with, and NOT the
     whole picture. Which kootas scored well or badly matters more than the
     total: a 24/36 built on a strong Nadi and Bhakoot is a different marriage
     from a 24/36 built on weak ones.
  2. The 7th house in D1 AND in the navamsa (D9) for EACH person — D9 often
     shows what the birth chart does not about how a marriage lasts.
  3. Venus and Jupiter — the marriage significators — in each chart.
  4. Each person's OWN marriage promise, and whether their marriage-supportive
     periods overlap in time ("timing"). A high score does not outweigh a weak
     individual promise or timing that does not line up — say so plainly.
  5. Each person's whole birth chart (houses and planets) for anything beyond
     compatibility — children (5th), money (2nd, 11th), home (4th), in-laws (9th).
Doshas are already computed with their cancellations — interpret, never
re-derive.

${JSON.stringify(couplePacket(args.base, args.boy, args.girl, args.timing, args.doshas))}

Write their reading — several solid paragraphs, not a headline — in this order,
each part under a short heading line of its own (2-4 words, no colon):
  1. The verdict — ${args.base?.total}/${args.base?.max}, and WHICH kootas drove it,
     with their scores and what each one governs in daily life.
  2. ${boyName}'s chart for marriage, then ${girlName}'s — the 7th house (D1 and
     D9), Venus and Jupiter, and their own marriage promise: WHY it is strong or
     weak, not just "compatible".
  3. Real concerns, plainly — low kootas, any active uncancelled dosha, a weak
     individual promise, timing that does not line up. Do not force positivity
     the data does not support; if it is mixed, say mixed.
  4. Timing — when their periods favour marriage and when they do not, with the
     real date ranges from the data.
  5. What to do — practical and tied to what THEIR charts show, never generic
     "communicate well" advice.

${PROSE_FORMAT}

ALWAYS NAME WHOSE CHART a placement is in ("${girlName} ka Venus 11th mein") — a
bare "Venus 11th house mein" in a reading about two people is true of one of
them and false about the other.
Never predict a divorce, a death or an illness, and never tell them not to
marry — a genuinely weak picture is "this needs real care and an astrologer's
personal look", said kindly.

${languageInstruction(args.language)}`;

  const text = await llmGenerate(prompt, { temperature: 0.8, thinkingBudget: 0, maxTokens: 3000, purpose: "match_summary", strong: true });
  let out = String(text || "").trim();
  // Roman-script Hindi with a Devanagari full stop in it reads as a glitch.
  if (args.language === "hinglish") out = out.replace(/\s*।/g, ".");
  return tidyReport(out);
}

/**
 * A full, premium Kundli-matching report (the PDF-able long form of the summary
 * above). Grounded strictly on the computed Ashtakoot result — the model
 * interprets, it never recomputes scores.
 *
 * Returns { title, intro, sections:[{heading, body}], remedies:[], verdict,
 *           disclaimer }.
 */
export async function generateMatchReport(result: any, language: string): Promise<any> {
  // FIRST names only — the AI needs just enough to address them warmly; sending
  // full names to a third-party model is more personal data than the task needs.
  const firstName = (n: any, fallback: string) =>
    String(n ?? "").trim().split(/\s+/)[0] || fallback;
  const boyName = firstName(result?.boy?.name, "the groom");
  const girlName = firstName(result?.girl?.name, "the bride");

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

Write a DETAILED, premium Kundli-matching (Guna Milan) report for this couple —
the kind a family would print and keep. Interpret ONLY the computed result below;
never recompute or change any score.

${JSON.stringify({
    boy: { name: boyName, rasi: result.boy?.rasi, nakshatra: result.boy?.nakshatra, manglik: result.boy?.manglik },
    girl: { name: girlName, rasi: result.girl?.rasi, nakshatra: result.girl?.nakshatra, manglik: result.girl?.manglik },
    total: result.total, max: result.max, percent: result.percent, verdict: result.verdict,
    kootas: result.kootas, doshas: result.doshas,
  }, null, 2)}

HOW TO WRITE IT:
- Speak to BOTH of them warmly, by name, like a trusted family astrologer.
- Every point must trace back to an actual koota score or dosha above — say what
  it means for REAL married life (understanding, temperament, intimacy, in-laws,
  money, children, health), not textbook definitions.
- Be honest about weak areas, but never frightening or fatalistic. Never say a
  marriage will fail, and never predict death, illness or infertility.
- Bold the few most important words per section with **double asterisks**.

Respond with a SINGLE valid JSON object of EXACTLY this shape:
{
  "title": "Kundli Matching Report — ${boyName} & ${girlName}",
  "intro": "2-3 warm sentences: the headline result (${result.total}/${result.max}) and what it means overall",
  "sections": [ { "heading": "short title", "body": "a few natural sentences" } ],
  "remedies": ["practical, doable suggestions — only if a dosha or weak koota actually needs one"],
  "verdict": "one clear, kind bottom-line recommendation",
  "disclaimer": "one short line that this guides a decision, it does not decide it"
}
Give 6 to 8 sections covering: overall compatibility, mind & emotional bond,
temperament and attraction, family life & in-laws, children & health, money &
stability, dosha analysis (Mangal / Bhakoot / Nadi — say clearly if cancelled),
and how to make this marriage work. Keep each body a few sentences, never an essay.`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.8, thinkingBudget: 0, maxTokens: 4096 });
  try {
    const j = parseJsonLoose(text) ?? {};
    return {
      title: j.title || `Kundli Matching Report — ${boyName} & ${girlName}`,
      intro: j.intro || "",
      sections: Array.isArray(j.sections) ? j.sections.filter((s: any) => s?.heading && s?.body) : [],
      remedies: Array.isArray(j.remedies) ? j.remedies.filter((r: any) => typeof r === "string" && r.trim()) : [],
      verdict: j.verdict || result.verdict || "",
      disclaimer: j.disclaimer || "",
    };
  } catch {
    return { error: "Failed to parse match report", raw: text };
  }
}

/** Daily horoscope for all 12 moon signs in one call → JSON keyed by sign. */
export async function generateDailyHoroscope(context: any, language: string): Promise<any> {
  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

Write today's horoscope for ALL 12 Vedic moon signs (rashis), based on today's real
sky below. Interpret ONLY this data.
Today: ${JSON.stringify(context, null, 2)}

For EACH sign give a warm, SPECIFIC 2-3 sentence prediction for today covering mood,
work/money, and one practical tip — grounded in where the Moon and planets are now.
Be concrete, not generic. Use **bold** for the few most important words.

Respond with a SINGLE valid JSON object whose keys are EXACTLY these 12 names:
Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces.
Each value is the prediction string for that sign.`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.85, thinkingBudget: 0, maxTokens: 4096 });
  try {
    return parseJsonLoose(text) ?? {};
  } catch {
    return { error: "Failed to parse horoscope", raw: text };
  }
}

/** One short, warm, personalised "tip of the day" from dasha + transit + panchang. */
export async function generateDailyTip(context: any, language: string): Promise<string> {
  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

Based ONLY on this person's running dasha + today's live transit + today's panchang,
write a SHORT "today for you" guidance — 2-3 warm sentences. Be specific (mention the
area of life and one practical thing to do today). Use **bold** for the 1-2 key words.
No headings, no bullets — just the short paragraph.

Data: ${JSON.stringify(context, null, 2)}`;
  return await llmGenerate(prompt, { temperature: 0.85, thinkingBudget: 0 });
}

/**
 * Personalised daily guidance across life areas — career, money, relationship,
 * health + one practical advice line. Grounded ONLY in the running dasha +
 * today's live Moon transit + today's panchang. Short, specific, hopeful.
 */
export async function generateDailyGuidance(context: any, language: string): Promise<any> {
  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

For THIS person, write today's personalised guidance using ONLY the data below —
their natal chart (planets, signs, houses), their running dasha, today's live Moon
transit and today's panchang. Interpret this data; never invent planets, dates or
events.

Anchor each area to a placement you can actually SEE in the chart: career to the
10th house and whatever occupies it, money to the 2nd and 11th, relationship to
the 7th and Venus, health to the 6th and the lagna lord — each read through the
running dasha and where the Moon is today. If an area has nothing notable, say
the day is quiet there. Never name a placement that is not in the data.

Give a SHORT, SPECIFIC prediction for TODAY in each area (1-2 sentences each),
grounded in where the Moon is transiting for them and their current dasha lord. Be
warm and practical, speak in tendencies (not guarantees), never scary or fatalistic.
Use **bold** for the 1-2 key words in each. Do not repeat the same generic sentence
across areas — make each distinct to that area of life.

CRITICAL STYLE RULES:
- Write DIRECT STATEMENTS only. NEVER pose a question and then answer it. Do NOT
  write things like "Will your money grow today? Yes…" or "What about health? …".
  No rhetorical questions at all — just tell them plainly what today holds.
- If a "day_state" is given below, it is the ALREADY-COMPUTED truth for today
  (from real Tarabala + Moon transit). Your cards MUST agree with it — expand on
  that same day, never contradict its lean or invent a different mood.

Data: ${JSON.stringify(context, null, 2)}

Respond with a SINGLE valid JSON object with EXACTLY these keys (each a plain
statement, no questions):
- "career": today's work/career tendency + one practical step
- "money": today's money/finance tendency (no investment guarantees)
- "relationship": today's relationships/family tendency
- "health": today's energy/wellbeing tendency (gentle, never a medical diagnosis)
- "advice": one practical thing to do today (a single actionable line)`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.85, thinkingBudget: 0, maxTokens: 4096 });
  try {
    const j = parseJsonLoose(text) ?? {};
    return {
      career: j.career || "", money: j.money || "", relationship: j.relationship || "",
      health: j.health || "", advice: j.advice || "",
    };
  } catch {
    return { error: "Failed to parse guidance", raw: text };
  }
}

/** A warm "how to apply" note for the chart's remedies. */
export async function generateRemediesNote(context: any, language: string): Promise<string> {
  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

Here are the chart-based remedies already selected for this person. Write a short,
encouraging guidance (3-4 sentences) on HOW to follow them simply and consistently,
and which ONE to prioritise first. Use **bold** for key words. Plain text, no bullets.
Remedies: ${JSON.stringify(context, null, 2)}`;
  return await llmGenerate(prompt, { temperature: 0.8, thinkingBudget: 0 });
}

/** Some providers wrap JSON in ```json fences or add prose; extract the object. */
/**
 * Parse the model's JSON — and rescue a truncated one.
 *
 * A reply that stops mid-sentence used to throw the entire report away and
 * show an error for something the person had already paid for. This closes the
 * strings and brackets the model left open (dropping the half-written last
 * field), so every part that did arrive survives; the caller then decides
 * whether enough of it is there to show.
 */
function closeOpenJson(src: string): string {
  let inStr = false, esc = false;
  const stack: string[] = [];
  for (const c of src) {
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }
  let out = src;
  if (inStr) out += '"';
  out = out.replace(/[,:]\s*$/, "");
  return out + stack.reverse().join("");
}

export function parseJsonLoose(text: string | null | undefined): any | null {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  let cand = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cand.indexOf("{");
  if (start > 0) cand = cand.slice(start);
  for (let i = 0; i < 8; i++) {
    try { return JSON.parse(closeOpenJson(cand)); } catch { /* cut back to the last complete field */ }
    const cut = cand.lastIndexOf(",");
    if (cut <= 0) break;
    cand = cand.slice(0, cut);
  }
  /*
   * Second pass: cut back whole VALUES, not commas.
   *
   * A reply that ran out of tokens usually stops inside a long sentence, and
   * that sentence may contain commas, colons and quotes of its own — so cutting
   * at the last comma lands in the middle of the prose and every repair fails.
   * A life report died this way: seven complete areas in hand, thrown out
   * because the eighth field was half-written. Stepping back over closing
   * braces keeps every section that finished.
   */
  cand = raw.slice(raw.indexOf("{") < 0 ? 0 : raw.indexOf("{"));
  for (let i = 0; i < 40; i++) {
    const end = cand.lastIndexOf("}");
    if (end <= 0) break;
    cand = cand.slice(0, end + 1);
    try { return JSON.parse(closeOpenJson(cand)); } catch { /* keep stepping back */ }
    cand = cand.slice(0, end);
  }
  return null;
}

function stripJsonFences(s: string): string {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}
