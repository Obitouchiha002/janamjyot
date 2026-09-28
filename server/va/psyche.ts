/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Self-contained rules — no JanamJyot module is changed by this file. */
/**
 * The behavioural layer: HOW this person thinks, decides, trusts, fights and sabotages
 * themselves — computed from the chart instead of being improvised by the AI.
 *
 * Why: the readings felt fake because the factual layer (yogas, dashas, timing) was
 * calculated while the human layer was left to the model, so everyone got the same
 * "aap mehnati hain, thoda dhyan dijiye". A pandit's edge is exactly this layer: "aap
 * har baar shuru zor se karte ho, beech mein mann ut jaata hai" — and it comes from
 * classical, checkable places: the Moon (mann), Mercury (soch), the lagna lord (khud ka
 * roop), the Sun (pehchaan ki bhookh), Saturn (dar aur zimmedari), Mars (gussa), and the
 * Rahu-Ketu axis (bechaini aur khaalipan).
 *
 * Every pattern carries BOTH sides: the same placement that makes someone over-think
 * also makes them careful. A reading that only lists faults is as useless as one that
 * only flatters.
 */

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const ELEMENT: Record<string, "fire" | "earth" | "air" | "water"> = {
  Aries: "fire", Leo: "fire", Sagittarius: "fire",
  Taurus: "earth", Virgo: "earth", Capricorn: "earth",
  Gemini: "air", Libra: "air", Aquarius: "air",
  Cancer: "water", Scorpio: "water", Pisces: "water",
};
const ord = (n: number) => `${n}${["th", "st", "nd", "rd"][(n % 100 - 20) % 10] ?? ["th", "st", "nd", "rd"][n] ?? "th"}`;
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

export type PsycheArea =
  | "mind" | "thinking" | "identity" | "fear" | "control"
  | "trust" | "conflict" | "self_sabotage" | "validation" | "decision";

export interface PsychePattern {
  id: string;
  area: PsycheArea;
  /** What they actually do — the sentence they should recognise themselves in. */
  pattern: string;
  /** Where it shows up in real life. */
  shows_up_as: string;
  /** The same placement's good side, so the reading is not a list of faults. */
  gift: string;
  /** The chart evidence. */
  because: string;
  weight: number;
}

interface P {
  sign: string; house: number; dignity: string; retrograde: boolean; combust: boolean;
  conjunct_with: string[]; nakshatra?: string;
}

interface Ctx {
  p: (name: string) => P;
  has: (name: string) => boolean;
  with: (a: string, b: string) => boolean;
  aspectedBy: (house: number) => string[];
  hitBy: (planet: string, by: string) => boolean;
  lordOf: (h: number) => string;
  lagnaLord: string;
  /** A Moon close to the Sun is "kshin" (dark, weak) — classical paksha bala. */
  moonWeak: boolean | null;
  sadeSati: boolean;
}

type Rule = (c: Ctx) => Omit<PsychePattern, "id"> & { id: string } | null;

const RULES: Rule[] = [
  // ---- mann (Moon) -----------------------------------------------------------------
  (c) => {
    const m = c.p("Moon");
    if (!m) return null;
    const el = ELEMENT[m.sign];
    const text: Record<string, [string, string, string]> = {
      water: [
        "You go by the heart — decisions come from feeling rather than logic, and old things are hard to let go of.",
        "Something someone said can sting for months; your pace of work rises and falls with your mood.",
        "You read people and understand their hurt — which is exactly why people trust you.",
      ],
      fire: [
        "Your mind heats up quickly — whatever feels right gets done at once, and the thinking comes after.",
        "First to start something new, but interest fades on anything that drags on.",
        "Courage and initiative — while others are still thinking it over, you have begun.",
      ],
      earth: [
        "You do not move until a thing looks solid — you check the ground before taking a risk.",
        "Change takes you time; people call it stubbornness, but you simply want to be sure.",
        "What you take on, you see through — over a long stretch you end up holding more than most.",
      ],
      air: [
        "Your mind does not settle in one place — several things run at once.",
        "Strong with words, but staying on one task for months is the hard part.",
        "New ideas and easy connection — you can start a conversation with anyone.",
      ],
    };
    const [pattern, shows, gift] = text[el] ?? text.air;
    return {
      id: `mind-${el}`, area: "mind", pattern, shows_up_as: shows, gift,
      because: `The Moon is in ${m.sign}, ${el === "water" ? "a water sign" : el === "fire" ? "a fire sign" : el === "earth" ? "an earth sign" : "an air sign"} — this is what shapes the mind.`,
      weight: 3,
    };
  },
  (c) => {
    if (!c.hitBy("Moon", "Saturn")) return null;
    return {
      id: "mind-saturn", area: "fear",
      pattern: "Before you let yourself be happy you have already worked out what could go wrong — there is a quiet weight on the mind.",
      shows_up_as: "Feeling alone even in a full room, sleep or mood swinging, and putting your own happiness off for later.",
      gift: "You handle hard times best — where others break, you hold.",
      because: "Moon par Saturn ka prabhav (saath ya drishti) hai.",
      weight: 3,
    };
  },
  (c) => {
    if (!c.hitBy("Moon", "Rahu") && !c.with("Moon", "Rahu")) return null;
    return {
      id: "mind-rahu", area: "fear",
      pattern: "There is a restlessness in you — what you have feels like less, and what you do not have stays on your mind.",
      shows_up_as: "Hours lost on the phone at night, comparing yourself with others, and suddenly making a big decision.",
      gift: "You can reach where nobody in your family has — that same restlessness is what pushes you forward.",
      because: "Moon par Rahu ka prabhav hai.",
      weight: 3,
    };
  },
  (c) => {
    if (!c.with("Moon", "Ketu") && !c.hitBy("Moon", "Ketu")) return null;
    return {
      id: "mind-ketu", area: "trust",
      pattern: "Every so often it all starts to feel pointless — and you want distance from the very thing you love most.",
      shows_up_as: "Feeling alone inside a relationship, suddenly going quiet, and regretting it afterwards.",
      gift: "You hold on to things lightly, so a loss does not break you the way it breaks others — and the spiritual side runs deep.",
      because: "Moon par Ketu ka prabhav hai.",
      weight: 3,
    };
  },
  (c) => {
    if (c.moonWeak !== true) return null;
    return {
      id: "mind-waning", area: "identity",
      pattern: "You underrate yourself — even after good work it feels like it was not quite enough.",
      shows_up_as: "Discomfort at a compliment, playing your own wins down, and staying quiet at first in a new place.",
      gift: "Arrogance never sets in, and people come closer because of that modesty.",
      because: "Janm ke samay Chandrama kshin (waning) tha — paksha bala kam hai.",
      weight: 2,
    };
  },

  // ---- soch (Mercury) ---------------------------------------------------------------
  (c) => {
    const me = c.p("Mercury");
    if (!me) return null;
    const slow = me.retrograde || c.hitBy("Mercury", "Saturn");
    if (!slow) return null;
    return {
      id: "think-loop", area: "decision",
      pattern: "You turn the same thing over and over — every angle gets examined before you decide, and the time goes in the turning.",
      shows_up_as: "Message type karke mitana, mauka nikal jaane ke baad 'haan kar dena chahiye tha' lagna.",
      gift: "Your decisions hold up — what you think through tends to last.",
      because: me.retrograde ? "Mercury vakri (retrograde) hai." : "Mercury par Saturn ka prabhav hai.",
      weight: 3,
    };
  },
  (c) => {
    const me = c.p("Mercury");
    if (!me?.combust) return null;
    return {
      id: "think-fused", area: "thinking",
      pattern: "You are so sure of your own view that a different one is hard to sit with.",
      shows_up_as: "Winning the argument, and realising afterwards that the other person may also have been right.",
      gift: "You speak with conviction, so people go along with you.",
      because: "Mercury Sun ke bahut paas hai (ast/combust) — soch aur khud ki pehchaan ek ho jaati hai.",
      weight: 2,
    };
  },
  (c) => {
    if (!c.with("Mercury", "Rahu") && !c.hitBy("Mercury", "Rahu")) return null;
    return {
      id: "think-shortcut", area: "thinking",
      pattern: "Aapka dimaag shortcut dhoondhta hai — seedha raasta chhodkar chalaak raasta pehle dikhta hai.",
      shows_up_as: "Jumping on a new idea quickly, then getting tangled in the detail.",
      gift: "Where others get stuck, you find some way through.",
      because: "Mercury par Rahu ka prabhav hai.",
      weight: 2,
    };
  },

  // ---- pehchaan (Sun, lagna lord) ---------------------------------------------------
  (c) => {
    const s = c.p("Sun");
    if (!s) return null;
    const weak = /debilit|enemy/i.test(s.dignity) || c.hitBy("Sun", "Saturn");
    if (!weak) return null;
    return {
      id: "identity-approval", area: "validation",
      pattern: "A question sits underneath it all — \"am I enough?\" — which makes other people's approval feel necessary.",
      shows_up_as: "Bade logon ya boss ke saamne asahaj hona, na keh paana, aur apna kaam kam karke batana.",
      gift: "You make your place through the work, not through ego — which is why people take you as genuine.",
      because: /debilit|enemy/i.test(s.dignity) ? `The Sun is ${s.dignity}.` : "Saturn influences the Sun — friction with authority.",
      weight: 3,
    };
  },
  (c) => {
    const s = c.p("Sun");
    if (!s) return null;
    if (![1, 10, 11].includes(s.house) && !/exalt|own/i.test(s.dignity)) return null;
    return {
      id: "identity-recognition", area: "validation",
      pattern: "You need the recognition as much as the work — without the credit, even your best work feels empty.",
      shows_up_as: "Work where the credit goes to someone else does not hold you; staying in the background feels heavy.",
      gift: "Responsibility and leadership suit you — people put you in front.",
      because: `The Sun sits in your ${ord(s.house)} house${/exalt|own/i.test(s.dignity) ? `, and it is ${s.dignity}` : ""}.`,
      weight: 2,
    };
  },
  (c) => {
    const l = c.p(c.lagnaLord);
    if (!l) return null;
    if (![6, 8, 12].includes(l.house)) return null;
    return {
      id: "identity-hidden", area: "self_sabotage",
      pattern: "You hold yourself back — the chance is right there and you still say \"not yet\".",
      shows_up_as: "Underselling what you can do, watching the opening go to someone else, and being angry with yourself later.",
      gift: "Away from the show, you work deeply — and that gives you an understanding the visible people do not have.",
      because: `Your lagna lord, ${c.lagnaLord}, sits in the ${ord(l.house)} house.`,
      weight: 3,
    };
  },

  // ---- dar, control, bharosa --------------------------------------------------------
  (c) => {
    const sa = c.p("Saturn");
    if (!sa) return null;
    if (![1, 4, 10].includes(sa.house) && !c.sadeSati) return null;
    return {
      id: "control-duty", area: "control",
      pattern: "You want everything in your own hands — leaving it to someone else feels like it will go wrong.",
      shows_up_as: "Checking the work yourself even after handing it over, and tiredness from carrying the responsibility.",
      gift: "People trust you without a second thought, because you do not leave things half done.",
      because: c.sadeSati ? "Sade Sati is running, and Saturn is tied to the house of responsibility." : `Saturn sits in your ${ord(sa.house)} house.`,
      weight: 2,
    };
  },
  (c) => {
    const ra = c.p("Rahu");
    if (!ra) return null;
    const free = [1, 9, 11].includes(ra.house);
    const sa = c.p("Saturn");
    const bound = sa && [1, 2, 4, 10].includes(sa.house);
    if (!free || !bound) return null;
    return {
      id: "control-vs-freedom", area: "control",
      pattern: "Two things pull against each other inside — you want the freedom, and you are afraid to leave the safe road. So the big decision keeps getting postponed.",
      shows_up_as: "Naukri chhodne ka mann par na chhodna, naya kaam shuru karne ka plan banakar rakh dena.",
      gift: "When you do jump, you never jump unprepared — so your risks go wrong less often than other people's.",
      because: `Rahu sits in your ${ord(ra.house)} house (freedom and big dreams) and Saturn in the ${ord(sa!.house)} (safety and duty).`,
      weight: 3,
    };
  },
  (c) => {
    const h4 = c.aspectedBy(4).filter((p) => ["Saturn", "Mars", "Rahu", "Ketu"].includes(p));
    const moonHouse = c.p("Moon")?.house;
    if (!h4.length && ![8, 12].includes(moonHouse ?? 0)) return null;
    return {
      id: "trust-guarded", area: "trust",
      pattern: "You do not open up quickly — the real thing is shared with one or two people, and even then not fully.",
      shows_up_as: "Saying everything is fine when it is not, and hesitating to ask for help.",
      gift: "You never break a confidence — what you were told stays with you.",
      because: h4.length ? `Your 4th house (the root of the mind, and home) is influenced by ${h4.join(", ")}.` : `Moon ${ord(moonHouse!)} house (chhupi bhavnaayein) mein hai.`,
      weight: 2,
    };
  },

  // ---- gussa aur takraar -------------------------------------------------------------
  (c) => {
    const ma = c.p("Mars");
    if (!ma) return null;
    const suppressed = c.hitBy("Mars", "Saturn") || [8, 12].includes(ma.house);
    return {
      id: suppressed ? "conflict-hold" : "conflict-direct",
      area: "conflict",
      pattern: suppressed
        ? "You do not let anger out as it comes — it collects, and one day a small thing brings all of it out at once."
        : "You say it straight — in a clash, telling the truth feels necessary even if the relationship suffers.",
      shows_up_as: suppressed
        ? "Days of silence, then a sharp word out of nowhere — and guilt afterwards."
        : "Your tone sharpens in an argument, and the other person goes quiet.",
      gift: suppressed
        ? "You do not flare up easily — so people see you as calm and steady."
        : "Nobody is misled with you — whatever it is, you say it to their face.",
      because: suppressed
        ? (c.hitBy("Mars", "Saturn") ? "Saturn influences Mars." : `Mars sits in your ${ord(ma.house)} house.`)
        : `Mars is in ${ma.sign}, in your ${ord(ma.house)} house.`,
      weight: 2,
    };
  },

  // ---- khud ko rokne wali aadat ------------------------------------------------------
  (c) => {
    const ra = c.p("Rahu");
    if (!ra || ![5, 8].includes(ra.house)) return null;
    return {
      id: "impulse", area: "self_sabotage",
      pattern: "When something takes hold of you, the big decision happens in one go — and when the interest lifts, you drop it just as fast.",
      shows_up_as: "Starting a job, a course or a relationship suddenly and stopping midway; putting money in all at once.",
      gift: "You catch the chances that the over-thinkers lose.",
      because: `Rahu sits in your ${ord(ra.house)} house.`,
      weight: 2,
    };
  },
  (c) => {
    const ke = c.p("Ketu");
    if (!ke || ![1, 10, 11].includes(ke.house)) return null;
    return {
      id: "unfinished", area: "self_sabotage",
      pattern: "The start is superb, but the moment it turns into routine the interest lifts — and the work is left at eighty percent.",
      shows_up_as: "Several unfinished projects, courses or plans; and then the guilt of \"I am not consistent\".",
      gift: "You have touched many things — and when one of them truly takes you, you go very deep into it.",
      because: `Ketu sits in your ${ord(ke.house)} house.`,
      weight: 3,
    };
  },
];

export function psychePatterns(chart: any, facts: any): PsychePattern[] {
  const lagnaIdx = SIGNS.indexOf(facts?.lagna ?? chart?.d1_chart?.ascendant_sign ?? "");
  if (lagnaIdx < 0) return [];
  const byName = new Map<string, any>((facts?.planets ?? []).map((x: any) => [x.planet, x]));
  const hl = new Map<number, any>((facts?.house_lords ?? []).map((h: any) => [h.house, h]));
  const p = (n: string) => byName.get(n) as P;
  const aspectedBy = (h: number) => (hl.get(h)?.aspected_by ?? []) as string[];
  const withP = (a: string, b: string) => {
    const x = byName.get(a), y = byName.get(b);
    return !!x && !!y && x.sign === y.sign;
  };
  /** Conjunct, or the house the planet sits in is aspected by the other planet. */
  const hitBy = (planet: string, by: string) => {
    const x = byName.get(planet);
    if (!x) return false;
    return withP(planet, by) || aspectedBy(x.house).includes(by);
  };

  // Paksha bala: the Moon is weak when it is within 72° of the Sun on either side —
  // that is the dark Moon around amavasya, whichever fortnight it falls in.
  let moonWeak: boolean | null = null;
  const pos = (chart?.planet_positions ?? []) as any[];
  const sunL = pos.find((x) => x.planet === "Sun")?.longitude;
  const moonL = pos.find((x) => x.planet === "Moon")?.longitude;
  if (Number.isFinite(sunL) && Number.isFinite(moonL)) {
    const d = ((moonL - sunL) % 360 + 360) % 360;
    moonWeak = d < 72 || d > 288;
  }
  const sadeSati = /Sade Sati/i.test(JSON.stringify(facts?.saturn_cycles ?? {}));

  const ctx: Ctx = {
    p, has: (n) => byName.has(n), with: withP, aspectedBy, hitBy,
    lordOf: (h) => SIGN_LORDS[(lagnaIdx + h - 1) % 12],
    lagnaLord: SIGN_LORDS[lagnaIdx],
    moonWeak, sadeSati,
  };

  const out: PsychePattern[] = [];
  for (const rule of RULES) {
    let r: any = null;
    try { r = rule(ctx); } catch { r = null; }
    if (r) out.push(r);
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 7);
}
