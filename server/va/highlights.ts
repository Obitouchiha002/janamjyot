/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Self-contained rules — no JanamJyot module is changed by this file. */
/**
 * "What actually stands out in THIS chart" — the blunt, specific things a real astrologer
 * says in the first minute, computed by rule instead of left to the AI.
 *
 * Why this exists: a friend's chart (Gemini lagna, Moon in the 7th, Moon mahadasha
 * running, Venus ruling the 5th AND the 12th, retrograde, aspected by Saturn) was read by
 * a pandit as "ladki ke chakkar mein fansa hai". The app answered "sab theek hai, padhai
 * par dhyan do" — because nothing in the data told it what was striking. The AI was given
 * lists (yogas, doshas, lords) and was left to decide what mattered, so it defaulted to
 * generic advice, the same for everyone.
 *
 * Each rule below is a classical combination with a plain-language meaning and the exact
 * chart reason. A highlight that involves the running Mahadasha/Antardasha lord — or a
 * house that lord rules — is marked active_now, because that is what shows up in life
 * today. The chat and report lead with these.
 */

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
const MALEFIC = new Set(["Saturn", "Mars", "Rahu", "Ketu", "Sun"]);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Feb 2027" from an ISO date, for "ye kab tak rahega". */
function monthYear(iso?: string | null): string | null {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export type Theme =
  | "love" | "marriage" | "studies" | "career" | "money" | "debt"
  | "health" | "family" | "foreign" | "mind" | "spiritual" | "strength";

export interface Highlight {
  id: string;
  theme: Theme;
  /** "problem" = kya dikkat hai, "strength" = kya faydemand hai. Both are named, so a
   *  reader gets the full picture in one reply. */
  kind: "problem" | "strength";
  /** What to tell the person, in life language. */
  says: string;
  /** The chart reason, for the "why" section. */
  because: string;
  /** 3 = say it first, 1 = mention only if asked. */
  weight: number;
  /** The running dasha touches this, so it is live right now. */
  active_now: boolean;
  /** The near answer to "ye kab tak rahega": when the running antardasha ends and the
   *  phase changes. A mahadasha can run 15+ years, so that is background, not an answer. */
  until?: string | null;
  /** The long backdrop, when the mahadasha lord is the driver. */
  background_until?: string | null;
}

interface Ctx {
  lagnaIdx: number;
  dignity: (p: string) => string;
  strengthOf: (p: string) => number;
  bindus: (h: number) => number;
  yogas: string[];
  planet: (p: string) => { sign: string; house: number; retrograde: boolean; nakshatra?: string | null } | null;
  houseOf: (p: string) => number;
  lordOf: (h: number) => string;
  housesRuledBy: (p: string) => number[];
  occupants: (h: number) => string[];
  aspectedBy: (h: number) => string[];
  together: (a: string, b: string) => boolean;
  dashaLords: string[];
  age: number | null;
  gender: string;
}

/** Every rule: it returns a highlight when the combination is present. */
type RuleOut = Omit<Highlight, "active_now" | "id" | "kind" | "until"> & { id: string; kind?: "problem" | "strength"; lords?: string[] };
const RULES: Array<(c: Ctx) => RuleOut | null> = [
  // ---- love & relationships ------------------------------------------------------
  (c) => {
    const h = c.houseOf("Moon");
    if (h !== 5 && h !== 7) return null;
    return {
      id: "moon-in-love-house",
      theme: "love",
      says: h === 7
        ? "Your mind stays fixed on relationships — one person keeps coming back into your thoughts, and it shows in your studies and work."
        : "Your heart engages quickly — love, attraction and matters of the heart tend to take over your thinking.",
      because: `The Moon (the mind) sits in your ${h}th house — the house of ${h === 7 ? "partners and bonds" : "love and romance"}.`,
      weight: 3,
      lords: ["Moon"],
    };
  },
  (c) => {
    if (!c.together("Venus", "Rahu")) return null;
    return {
      id: "venus-rahu",
      theme: "love",
      says: "There is a very strong pull towards someone — it starts fast, and it tends to carry confusion or something kept hidden.",
      because: `Venus (love) and Rahu sit together in your ${c.houseOf("Venus")}th house.`,
      weight: 3,
      lords: ["Venus", "Rahu"],
    };
  },
  (c) => {
    const fifthLord = c.lordOf(5);
    const rules12 = c.housesRuledBy(fifthLord).includes(12);
    const in12 = c.houseOf(fifthLord) === 12;
    if (!rules12 && !in12) return null;
    return {
      id: "love-secret",
      theme: "love",
      says: "Love tends to stay private, or apart from the family — not everyone is told, and that itself keeps the tension on.",
      because: in12
        ? `The lord of your 5th house (love), ${fifthLord}, sits in the 12th — the house of hidden things.`
        : `${fifthLord} 5th (prem) aur 12th (chhupi baatein, kharch) dono ka swami hai.`,
      weight: 3,
      lords: [fifthLord],
    };
  },
  (c) => {
    const h = c.houseOf("Rahu");
    if (h !== 5 && h !== 7) return null;
    return {
      id: "rahu-in-love-house",
      theme: h === 7 ? "marriage" : "love",
      says: h === 7
        ? "A partner may come from a different background or community, and in marriage there is a risk of both haste and being misled — move thoughtfully."
        : "Love runs on intensity — you attach quickly, and only later see that the other person was not quite what you thought.",
      because: `Rahu sits in your ${h}th house.`,
      weight: 3,
      lords: ["Rahu"],
    };
  },
  (c) => {
    const v = c.planet("Venus");
    if (!v) return null;
    const withSaturn = c.together("Venus", "Saturn") || c.aspectedBy(c.houseOf("Venus")).includes("Saturn");
    if (!v.retrograde && !withSaturn) return null;
    return {
      id: "venus-delay",
      theme: "love",
      says: "Relationships move in stops and starts — it builds, it stalls, it builds again. Rushing will not help here.",
      because: `Venus ${v.retrograde ? "is retrograde" : ""}${v.retrograde && withSaturn ? " and " : ""}${withSaturn ? "sits with Saturn, or under its aspect" : ""}.`,
      weight: 2,
      lords: ["Venus", ...(withSaturn ? ["Saturn"] : [])],
    };
  },
  (c) => {
    const lord7 = c.lordOf(7);
    const h = c.houseOf(lord7);
    if (![6, 8, 12].includes(h)) return null;
    return {
      id: "seventh-lord-dusthana",
      theme: "marriage",
      says: "Distance, arguments or one-sided effort can show up in relationships — take your time choosing a partner.",
      because: `The lord of your 7th house (bonds), ${lord7}, sits in the ${h}th — the house of ${h === 6 ? "conflict" : h === 8 ? "obstruction" : "distance and spending"}.`,
      weight: 2,
      lords: [lord7],
    };
  },
  (c) => {
    const m = c.houseOf("Mars");
    if (![7, 8].includes(m)) return null;
    return {
      id: "mars-marriage-heat",
      theme: "marriage",
      says: "Heat and stubbornness arrive quickly in a bond — a small thing turns big. Pausing before you speak is the remedy.",
      because: `Mars sits in your ${m}th house.`,
      weight: 2,
      lords: ["Mars"],
    };
  },

  // ---- mind, health -----------------------------------------------------------------
  (c) => {
    const withSat = c.together("Moon", "Saturn");
    const withKetu = c.together("Moon", "Ketu");
    if (!withSat && !withKetu) return null;
    return {
      id: "moon-heavy",
      theme: "mind",
      says: withSat
        ? "There is a weight on the mind — loneliness, overthinking, and trouble with sleep or mood. This is a planetary position, not a weakness in you."
        : "The mind can feel empty at times, with nothing quite holding your interest — there is a pull towards the spiritual side too.",
      because: `The Moon sits with ${withSat ? "Saturn" : "Ketu"}.`,
      weight: 3,
      lords: ["Moon", withSat ? "Saturn" : "Ketu"],
    };
  },
  (c) => {
    const sixth = c.occupants(6).filter((p) => MALEFIC.has(p));
    if (sixth.length < 2) return null;
    return {
      id: "sixth-loaded",
      theme: "health",
      says: "Small health niggles keep returning — mostly the stomach, the nerves or plain tiredness. A steady routine and regular meals keep it in check.",
      because: `Your 6th house (illness) holds ${sixth.join(" and ")}.`,
      weight: 2,
      lords: sixth,
    };
  },

  // ---- studies & career -------------------------------------------------------------
  (c) => {
    if (c.age !== null && c.age > 30) return null;
    const lord5 = c.lordOf(5);
    const bad = [6, 8, 12].includes(c.houseOf(lord5));
    const rahuIn4or5 = [4, 5].includes(c.houseOf("Rahu"));
    if (!bad && !rahuIn4or5) return null;
    return {
      id: "studies-disturbed",
      theme: "studies",
      says: "Focus slips while studying — the mind is somewhere else, so the result lags behind the effort.",
      because: bad
        ? `The lord of your 5th house (study and intellect), ${lord5}, sits in the ${c.houseOf(lord5)}th.`
        : `Rahu sits in your ${c.houseOf("Rahu")}th house.`,
      weight: 2,
      lords: bad ? [lord5] : ["Rahu"],
    };
  },
  (c) => {
    const tenth = c.occupants(10);
    const lord10 = c.lordOf(10);
    const slow = tenth.includes("Saturn") || c.houseOf(lord10) === 12 || tenth.includes("Ketu");
    if (!slow) return null;
    return {
      id: "career-slow-start",
      theme: "career",
      says: "Career starts slow — more effort, recognition later. Whoever holds on here goes a long way.",
      because: tenth.includes("Saturn")
        ? "Saturn sits in your 10th house — the house of career."
        : tenth.includes("Ketu")
          ? "Ketu sits in your 10th house — the house of career."
          : `The lord of your 10th house, ${lord10}, sits in the 12th.`,
      weight: 2,
      lords: tenth.includes("Saturn") ? ["Saturn"] : tenth.includes("Ketu") ? ["Ketu"] : [lord10],
    };
  },

  // ---- money ------------------------------------------------------------------------
  (c) => {
    const lord6 = c.lordOf(6);
    const in2or11 = [2, 11].includes(c.houseOf(lord6));
    const rahu2 = c.houseOf("Rahu") === 2;
    if (!in2or11 && !rahu2) return null;
    return {
      id: "loans",
      theme: "debt",
      says: "Loans, EMIs or money lent out keep running — as the income grows, so do the outgoings.",
      because: in2or11
        ? `The lord of your 6th house (debt), ${lord6}, sits in the ${c.houseOf(lord6)}th — the house of wealth.`
        : "Rahu sits in your 2nd house — the house of wealth.",
      weight: 2,
      lords: in2or11 ? [lord6] : ["Rahu"],
    };
  },
  (c) => {
    const twelfth = c.occupants(12);
    if (twelfth.length < 2) return null;
    return {
      id: "expenses",
      theme: "money",
      says: "Money comes but does not stay — expenses appear out of nowhere. Savings only survive in a separate account.",
      because: `Your 12th house (spending) holds ${twelfth.join(", ")}.`,
      weight: 2,
      lords: twelfth,
    };
  },

  // ---- family, foreign, spiritual ---------------------------------------------------
  (c) => {
    const fourth = c.occupants(4).filter((p) => MALEFIC.has(p));
    const lord4 = c.lordOf(4);
    const away = [6, 8, 12].includes(c.houseOf(lord4));
    if (!fourth.length && !away) return null;
    return {
      id: "home-distance",
      theme: "family",
      says: "Home feels a little distant — either the thinking does not match at home, or work takes you away from it.",
      because: fourth.length
        ? `Your 4th house (home and mother) holds ${fourth.join(", ")}.`
        : `The lord of your 4th house, ${lord4}, sits in the ${c.houseOf(lord4)}th.`,
      weight: 2,
      lords: fourth.length ? fourth : [lord4],
    };
  },
  (c) => {
    const r = c.houseOf("Rahu");
    const lord12 = c.lordOf(12);
    if (![9, 12].includes(r) && c.houseOf(lord12) !== 9) return null;
    return {
      id: "foreign",
      theme: "foreign",
      says: "Work abroad, or far from your own city, pays off — luck opens up at a distance.",
      because: [9, 12].includes(r) ? `Rahu sits in your ${r}th house.` : `The lord of your 12th house, ${lord12}, sits in the 9th.`,
      weight: 1,
      lords: [[9, 12].includes(r) ? "Rahu" : lord12],
    };
  },
  // ---- strengths: what clearly works in this person's favour -----------------------
  (c) => {
    const exalted = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"].filter((p) => /exalt/i.test(c.dignity(p)));
    if (!exalted.length) return null;
    const p = exalted[0];
    const area: Record<string, string> = {
      Sun: "standing, recognition and authority", Moon: "strength of mind and connecting with people",
      Mars: "courage, property and hard work", Mercury: "sharp thinking, communication and business",
      Jupiter: "knowledge, guiding others and good fortune", Venus: "art, comfort, and drawing people to you",
      Saturn: "staying with the work and winning the long race",
    };
    return {
      id: `exalted-${p}`,
      theme: "strength",
      kind: "strength",
      says: `Your strongest side is ${area[p]} — effort on this road pays you more than it pays most people.`,
      because: `${p} is exalted.`,
      weight: 3,
      lords: [p],
    };
  },
  (c) => {
    const good = ["Gaja Kesari Yoga", "Budha-Aditya Yoga", "Raj Yoga", "Viparita Raja Yoga (Harsha)", "Dharma-Karmadhipati Yoga"].filter((y) => c.yogas.some((x) => x.startsWith(y.split(" (")[0])));
    if (!good.length) return null;
    const meaning: Record<string, string> = {
      "Gaja Kesari Yoga": "people listen to you and respect you — you shine in work that asks you to lead",
      "Budha-Aditya Yoga": "a sharp mind and a gift for explaining — teaching, advising, writing or business",
      "Raj Yoga": "position, respect and a rise — once you get the opening, you hold it",
      "Viparita Raja Yoga": "your big wins come after the hard part — where others give up, you get through",
      "Dharma-Karmadhipati Yoga": "luck and effort pull together — your own venture, or a senior position",
    };
    const key = Object.keys(meaning).find((k) => good[0].startsWith(k.split(" (")[0]))!;
    return {
      id: "yoga-strength",
      theme: "strength",
      kind: "strength",
      says: `Your chart forms ${key}: ${meaning[key]}.`,
      because: `${good.join(", ")} is formed in your chart.`,
      weight: 3,
    };
  },
  (c) => {
    const lord2 = c.lordOf(2), lord11 = c.lordOf(11);
    const strong = c.strengthOf(lord2) >= 6.5 || c.strengthOf(lord11) >= 6.5;
    const bindus = c.bindus(2) >= 30 || c.bindus(11) >= 30;
    if (!strong && !bindus) return null;
    return {
      id: "money-strength",
      theme: "money",
      kind: "strength",
      says: "You are good at both earning and keeping money — wherever you put your attention, an income opens up.",
      because: strong
        ? `Dhan ke gharon ka swami (${strong && c.strengthOf(lord2) >= 6.5 ? lord2 : lord11}) mazboot hai.`
        : "The ashtakavarga points on your 2nd and 11th houses are 30 or more.",
      weight: 2,
      lords: [lord2, lord11],
    };
  },
  (c) => {
    const lord10 = c.lordOf(10);
    if (c.strengthOf(lord10) < 6.5 && ![1, 4, 7, 10].includes(c.houseOf(lord10))) return null;
    return {
      id: "career-strength",
      theme: "career",
      kind: "strength",
      says: "Work and career are your strongest side — in the right field you make a name for yourself.",
      because: `The lord of your 10th house (career), ${lord10}, ${c.strengthOf(lord10) >= 6.5 ? "is strong" : `sits in a kendra (the ${c.houseOf(lord10)}th)`}.`,
      weight: 2,
      lords: [lord10],
    };
  },
  (c) => {
    const lord9 = c.lordOf(9);
    const jupKendra = [1, 4, 7, 10].includes(c.houseOf("Jupiter"));
    if (c.strengthOf(lord9) < 6.5 && !jupKendra) return null;
    return {
      id: "luck-strength",
      theme: "strength",
      kind: "strength",
      says: "When things get hard, help arrives from somewhere — seniors, a teacher or family stand by you.",
      because: jupKendra ? `Jupiter sits in a kendra (the ${c.houseOf("Jupiter")}th).` : `The lord of your 9th house (fortune), ${lord9}, is strong.`,
      weight: 2,
      lords: jupKendra ? ["Jupiter"] : [lord9],
    };
  },

  (c) => {
    const k = c.houseOf("Ketu");
    if (![9, 12, 5].includes(k)) return null;
    return {
      id: "spiritual",
      theme: "spiritual",
      says: "Inside there is an emptiness and big questions — prayer, meditation or a teacher's company steadies the mind.",
      because: `Ketu sits in your ${k}th house.`,
      weight: 1,
      lords: ["Ketu"],
    };
  },
];

/**
 * The striking points of a chart, strongest first. `facts` is chartFactsForAI()'s output.
 */
export function chartHighlights(chart: any, facts: any, nowMs = Date.now()): Highlight[] {
  const lagnaIdx = SIGNS.indexOf(facts?.lagna ?? chart?.d1_chart?.ascendant_sign ?? "");
  if (lagnaIdx < 0) return [];
  const byName = new Map<string, any>((facts?.planets ?? []).map((p: any) => [p.planet, p]));
  const planet = (p: string) => byName.get(p) ?? null;
  const houseOf = (p: string) => Number(byName.get(p)?.house ?? 0);
  const lordOf = (h: number) => SIGN_LORDS[(lagnaIdx + h - 1) % 12];
  const housesRuledBy = (p: string) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => lordOf(h) === p);
  const hl = new Map<number, any>((facts?.house_lords ?? []).map((h: any) => [h.house, h]));
  const occupants = (h: number) => (hl.get(h)?.occupants ?? []) as string[];
  const aspectedBy = (h: number) => (hl.get(h)?.aspected_by ?? []) as string[];
  const together = (a: string, b: string) => {
    const x = byName.get(a), y = byName.get(b);
    return !!x && !!y && x.sign === y.sign;
  };

  const dc = chart?.dasha?.current ?? {};
  const dashaLords = [dc.mahadasha, dc.antardasha].filter(Boolean) as string[];
  const birthMs = Date.parse(chart?.birth_details?.date_of_birth ?? "");
  const age = Number.isFinite(birthMs) ? Math.floor((nowMs - birthMs) / (365.25 * 86400000)) : null;

  const dignity = (p: string) => String(byName.get(p)?.dignity ?? "");
  const strengthOf = (p: string) => Number((facts?.strength_ranking ?? []).find((x: any) => x.planet === p)?.score ?? byName.get(p)?.strength ?? 0);
  const bindus = (h: number) => Number(hl.get(h)?.sav_bindus ?? 0);
  const yogas = (facts?.yogas ?? []).map((y: any) => String(y.name ?? y));

  const ctx: Ctx = {
    lagnaIdx, planet, houseOf, lordOf, housesRuledBy, occupants, aspectedBy, together,
    dignity, strengthOf, bindus, yogas,
    dashaLords, age, gender: String(chart?.birth_details?.gender ?? ""),
  };

  const out: Highlight[] = [];
  for (const rule of RULES) {
    let r: any = null;
    try { r = rule(ctx); } catch { r = null; }
    if (!r) continue;
    // Live now when the running dasha lord is one of the planets involved, or rules a
    // house the rule is about.
    const lords: string[] = r.lords ?? [];
    const active = lords.some((l) => dashaLords.includes(l));
    // "Kab tak?" — a live highlight lasts as long as the period that drives it. The
    // antardasha is the closer answer; the mahadasha is the outer one.
    // The near date is always the running antardasha's end — that is when the phase
    // actually turns. The mahadasha end is only background ("Feb 2041 tak" as an answer
    // to "kab tak" is useless).
    const until = active ? monthYear(dc.antardasha_to) : null;
    const background = active && lords.includes(dc.mahadasha) ? monthYear(dc.mahadasha_to) : null;
    out.push({
      id: r.id, theme: r.theme, kind: r.kind ?? "problem", says: r.says, because: r.because,
      weight: r.weight, active_now: active, until, background_until: background,
    });
  }
  // The reply must carry both sides, so problems and strengths are picked separately and
  // then merged (live ones first). Only problems would read like a warning list; only
  // strengths would read like flattery.
  const rank = (a: Highlight, b: Highlight) => Number(b.active_now) - Number(a.active_now) || b.weight - a.weight;
  const problems = out.filter((h) => h.kind === "problem").sort(rank).slice(0, 4);
  const strengths = out.filter((h) => h.kind === "strength").sort(rank).slice(0, 3);
  return [...problems, ...strengths].sort(rank);
}
