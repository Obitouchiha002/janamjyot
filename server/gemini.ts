/**
 * Gemini interpretation/chat layer (server-side only).
 *
 * Hard rule: Gemini NEVER calculates a chart. It only interprets the normalized
 * chart data we computed from Prokerala. We build a minimal, category-relevant
 * "chart packet" and pass only that — never the raw provider response.
 */
import { llmGenerate } from "./llm";
import { detectYogas } from "./yogas";

export const SYSTEM_PROMPT = `You are "Acharya", a warm and experienced Vedic astrologer (jyotishi) with decades
of practice. You are talking to a real person who came to you for guidance. Speak
to them directly and kindly, like a trusted guide sitting across from them — NOT
like a machine or a textbook.

You receive their birth chart, already calculated by the astrology engine and
normalized by our system. You ONLY interpret this provided data — you never
calculate or invent any chart detail.

HOW YOU SPEAK (be a real person, never robotic):
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
   and understandable.

ACCURACY & INTEGRITY (never break these):
- Use ONLY the supplied chart data. Never invent planets, signs, houses,
  nakshatras or dashas.
- Each planet has an exact "house" and "sign" in the data — always use those
  values. NEVER guess a planet's house from its sign (Capricorn does NOT mean
  the 10th house).
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

function languageInstruction(language: string): string {
  const key = (language || "en").toLowerCase();
  if (key === "hinglish") {
    return "VERY IMPORTANT — LANGUAGE: Write your ENTIRE reply in Hinglish (conversational Hindi written in Roman/English script).";
  }
  const name = LANGUAGE_NAMES[key] || language; // allow any language name passed through
  return `VERY IMPORTANT — LANGUAGE: Write your ENTIRE reply in ${name} ONLY. Do not mix in any other language or script. Any example wording in the instructions above was only to show tone, not language.`;
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
function compactDivisional(c: any) {
  if (!c) return null;
  return {
    ascendant_sign: c.ascendant_sign ?? "",
    planets: (c.planet_positions ?? []).map((p: any) => ({
      planet: p.planet,
      sign: p.sign,
      house: p.house,
      retrograde: p.retrograde,
    })),
  };
}

/**
 * The COMPLETE chart context — every chart (D1, D9, D10, D6, D11) plus dasha.
 * Used for all predictions so the AI cross-references all divisional charts
 * together for maximum accuracy, instead of looking at only one chart.
 */
export function buildFullChartContext(chart: any) {
  return {
    birth_summary: chart.summary,
    settings: chart.settings,
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
    d9_navamsa: compactDivisional(chart.d9_chart),
    d10_dasamsa_career: compactDivisional(chart.divisional_charts?.D10),
    d6_shashtamsa_health: compactDivisional(chart.divisional_charts?.D6),
    d11_ekadasamsa_gains: compactDivisional(chart.divisional_charts?.D11),
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

export function buildChartPacket(chart: any, category: Category, transit?: any) {
  // Never crash on an unrecognised category — fall back to the general packet.
  const cfg = PACKET_CONFIG[category] ?? PACKET_CONFIG.general;

  // Always include EVERY chart, then add a "focus" block pointing the AI at the
  // houses/planets/vargas most relevant to the question's topic.
  const focusHouses = cfg.houses.map((n) => {
    const h = getHouse(chart, n);
    return {
      house: n,
      sign: h?.sign ?? "",
      planets_in_house: h?.planets ?? [],
      lord_info: houseLordPlacement(chart, n),
    };
  });

  const focusPlanetNames =
    category === "general"
      ? (chart.planet_positions ?? []).map((p: any) => p.planet)
      : cfg.planets;
  const focusPlanets = focusPlanetNames
    .map((name: string) => getPlanet(chart, name))
    .filter(Boolean);

  return {
    category,
    all_charts: buildFullChartContext(chart),
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
${JSON.stringify(packet, null, 2)}

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
  return await llmGenerate(prompt, { temperature: 0.85, thinkingBudget: 0 });
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
${JSON.stringify(packet, null, 2)}
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

  const raw = await llmGenerate(prompt, { temperature: 0.85, thinkingBudget: 0 });
  return splitBubbles(raw);
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
${JSON.stringify(packet, null, 2)}

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

  const raw = await llmGenerate(prompt, { temperature: 0.85, thinkingBudget: 0 });
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

  // Hard cap at 3. Even when the model over-produces, the user should never get
  // a burst of messages — that is what made replies feel copy-pasted rather
  // than like someone talking to them.
  return split.slice(0, 3);
}

/** Full life report across the 5 standard categories, as structured JSON. */
export async function generateLifeReport(chart: any, language: string, transit?: any): Promise<any> {
  // One COMPLETE context (all charts) — the report covers every area, so it reads
  // D1 + D9 + D10 + D6 + D11 + dasha together (+ live transit for present/future).
  const fullContext = { ...buildFullChartContext(chart), live_transit: transit ?? null };

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

You are writing a personal life reading for this person across five areas:
health, wealth, career, marriage, relationships.

You have their COMPLETE chart below — D1 rasi, D9 navamsa, D10 dasamsa, D6
shashtamsa, D11 ekadasamsa and the dasha timeline. Cross-reference all of them:
e.g. career from D1 10th house + D10, health from D1 6th house + D6, wealth from
D1 2nd/11th + D11, marriage from D1 7th + D9. Confirm each point across the
relevant charts for accuracy.

Write each field as if you are gently speaking to them — warm, human, flowing
sentences, addressing them directly ("aap"). Each statement must rest on their
actual chart (mention the house/planet/dasha naturally inside the sentence, not
as a label). Do NOT invent anything.

BE SPECIFIC, NEVER VAGUE: turn every general point into concrete examples — name
the actual fields (e.g. content creation, law, teaching, finance), the body area
for health (e.g. spine, stomach/digestion, knees), the type of partner or place,
and concrete time-windows from the dasha (years / age range). Avoid empty lines
like "things will improve" without saying how, in what, and when.

EMPHASIS: wrap the few MOST important words/phrases in each field — key fields,
names, time-windows and the crucial conclusion — in **double asterisks** to bold
them. Bold only a few crucial words per field, never whole sentences.

For each category produce an object with EXACTLY these string keys:
  "summary"   (the overall pattern, said warmly),
  "past"      (what the chart suggests about earlier life),
  "present"   (the current phase, tied to the running dasha),
  "future"    (the next 5-7 years, using the dasha timeline),
  "positive"  (genuine strengths and supportive periods),
  "caution"   (challenges, said kindly and constructively),
  "guidance"  (practical, doable suggestions),
  "disclaimer"(one short kind line; for health note it is not medical advice,
               for wealth note it is not financial advice).

Respond with a SINGLE valid JSON object whose top-level keys are exactly:
health, wealth, career, marriage, relationships. Keep each field to a few natural
sentences (not a single dry line, not a giant essay).

This person's COMPLETE calculated chart data (interpret only this):
${JSON.stringify(fullContext, null, 2)}`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.8 });

  try {
    return JSON.parse(stripJsonFences(text || "{}"));
  } catch {
    return { error: "Failed to parse AI report", raw: text };
  }
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
export async function generateFocusedReport(chart: any, type: string, language: string, transit?: any): Promise<any> {
  const cfg = REPORT_TYPES[type];
  if (!cfg) return { error: "Unknown report type" };
  const context = { ...buildFullChartContext(chart), live_transit: transit ?? null };

  const prompt = `${SYSTEM_PROMPT}

${languageInstruction(language)}

Write a detailed, premium personal report focused ONLY on ${cfg.focus}

Ground EVERY point in this person's actual chart — mention the specific house,
planet or dasha naturally inside your sentences (not as a label). Be SPECIFIC:
name concrete fields, amounts of time (years or age windows from the dasha), and
real examples — never vague filler. Warm and human, addressing them directly.
Bold the few most important words in each section with **double asterisks**.

Respond with a SINGLE valid JSON object of EXACTLY this shape:
{
  "title": "${cfg.title}",
  "intro": "a warm 2-3 sentence opening, personalised to them",
  "sections": [ { "heading": "short section title", "body": "a few natural sentences" } ],
  "disclaimer": "one short kind line (for wealth: not financial advice; for the rest: guidance not certainty)"
}
Give 5 to 7 sections. Keep each body a few natural sentences, not a giant essay.

This person's COMPLETE calculated chart data (interpret only this):
${JSON.stringify(context, null, 2)}`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.8 });
  try {
    const j = JSON.parse(stripJsonFences(text || "{}"));
    return {
      title: j.title || cfg.title,
      intro: j.intro || "",
      sections: Array.isArray(j.sections) ? j.sections.filter((s: any) => s?.heading && s?.body) : [],
      disclaimer: j.disclaimer || "",
    };
  } catch {
    return { error: "Failed to parse report", raw: text };
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
${JSON.stringify(context, null, 2)}`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.8 });
  try {
    const j = JSON.parse(stripJsonFences(text || "{}"));
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
ASTROLOGER REPLIED: ${args.reply}

Updated notes:`;

  const out = await llmGenerate(prompt, { temperature: 0.3, thinkingBudget: 0 });
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

  const text = await llmGenerate(prompt, { json: true, temperature: 0.85 });
  try {
    const j = JSON.parse(stripJsonFences(text || "{}"));
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

  const text = await llmGenerate(prompt, { json: true, temperature: 0.8 });
  try {
    const j = JSON.parse(stripJsonFences(text || "{}"));
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

  const text = await llmGenerate(prompt, { json: true, temperature: 0.85, thinkingBudget: 0 });
  try {
    return JSON.parse(stripJsonFences(text || "{}"));
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

Data: ${JSON.stringify(context, null, 2)}

Respond with a SINGLE valid JSON object with EXACTLY these keys:
- "career": today's work/career tendency + one practical step
- "money": today's money/finance tendency (no investment guarantees)
- "relationship": today's relationships/family tendency
- "health": today's energy/wellbeing tendency (gentle, never a medical diagnosis)
- "advice": one practical thing to do today (a single actionable line)`;

  const text = await llmGenerate(prompt, { json: true, temperature: 0.85, thinkingBudget: 0 });
  try {
    const j = JSON.parse(stripJsonFences(text || "{}"));
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
function stripJsonFences(s: string): string {
  let t = s.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}
