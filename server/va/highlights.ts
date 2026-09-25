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
        ? "Mann rishton par tika rehta hai — kisi ek vyakti ka khayal baar-baar aata hai, aur uska asar padhai/kaam par padta hai."
        : "Dil jaldi lag jaata hai — pyaar, aakarshan aur dil ki baatein soch par haavi rehti hain.",
      because: `Moon (mann) ${h}th house mein hai (${h === 7 ? "partner/rishte" : "prem, romance"} ka ghar).`,
      weight: 3,
      lords: ["Moon"],
    };
  },
  (c) => {
    if (!c.together("Venus", "Rahu")) return null;
    return {
      id: "venus-rahu",
      theme: "love",
      says: "Kisi ke prati bahut tez aakarshan rehta hai — rishta tez shuru hota hai, aur usmein uljhan ya chhupav aa sakta hai.",
      because: `Venus (prem) aur Rahu ek saath ${c.houseOf("Venus")}th house mein hain.`,
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
      says: "Prem sambandh chhupa hua ya gharwalon se alag rehta hai — sab ko bataya nahi jaata, aur isi wajah se tanav rehta hai.",
      because: in12
        ? `5th house (prem) ka swami ${fifthLord} 12th house (chhupi baatein) mein hai.`
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
        ? "Partner alag maahaul ya alag samaj se ho sakta hai, aur shaadi ke maamle mein jaldi ya dhoka dono ka khatra rehta hai — soch samajh kar kadam lijiye."
        : "Pyaar mein junoon zyada rehta hai — jaldi jud jaate hain, aur baad mein pata chalta hai ki samne wala waisa nahi tha.",
      because: `Rahu ${h}th house mein hai.`,
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
      says: "Rishton mein deri aur on-off chalta rehta hai — baat banti hai, rukti hai, phir banti hai. Jaldbaazi se kaam nahi banega.",
      because: `Venus ${v.retrograde ? "vakri (retrograde) hai" : ""}${v.retrograde && withSaturn ? " aur " : ""}${withSaturn ? "Saturn ke saath/drishti mein hai" : ""}.`,
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
      says: "Rishton mein door-door rehna, bahas ya ek tarfa mehnat ban sakti hai — partner chunte waqt jaldi mat kijiye.",
      because: `7th house (rishte) ka swami ${lord7} ${h}th house mein hai (${h === 6 ? "vivaad" : h === 8 ? "rukawat" : "door/kharch"} ka ghar).`,
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
      says: "Rishte mein garmi aur zid jaldi aa jaati hai — chhoti baat bhi badi ban jaati hai. Bolne se pehle ruk jaana hi upay hai.",
      because: `Mars ${m}th house mein hai.`,
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
        ? "Mann par bojh rehta hai — akelapan, soch zyada, aur neend ya mood ki dikkat. Ye kamzori nahi, grah ki sthiti hai."
        : "Mann kabhi-kabhi khaali sa lagta hai, kisi cheez mein dil nahi lagta — spiritual taraf jhukav bhi rehta hai.",
      because: `Moon ${withSat ? "Saturn" : "Ketu"} ke saath hai.`,
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
      says: "Sehat mein chhoti-moti dikkatein lagi rehti hain, khaaskar pet/nas ya thakan ki. Routine aur khaana theek rakhein toh kaabu mein rehta hai.",
      because: `6th house (rog) mein ${sixth.join(" aur ")} hain.`,
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
      says: "Padhai mein dhyan tootta hai — mann kahin aur rehta hai, isliye mehnat ke hisaab se result kam aata hai.",
      because: bad
        ? `5th house (padhai/buddhi) ka swami ${lord5} ${c.houseOf(lord5)}th house mein hai.`
        : `Rahu ${c.houseOf("Rahu")}th house mein hai.`,
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
      says: "Career shuru mein dheema chalta hai — mehnat zyada, pehchaan der se. Jo tik gaya, wo aage bahut upar jaata hai.",
      because: tenth.includes("Saturn")
        ? "Saturn 10th house (career) mein hai."
        : tenth.includes("Ketu")
          ? "Ketu 10th house (career) mein hai."
          : `10th house ka swami ${lord10} 12th house mein hai.`,
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
      says: "Udhaar, EMI ya kisi ko diya hua paisa chalta rehta hai — kamai ke saath kharch bhi badhta hai.",
      because: in2or11
        ? `6th house (karz) ka swami ${lord6} ${c.houseOf(lord6)}th house (dhan) mein hai.`
        : "Rahu 2nd house (dhan) mein hai.",
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
      says: "Paisa aata hai par tikta nahi — kharch achanak nikal aate hain. Bachat alag khaate mein rakhna hi kaam aata hai.",
      because: `12th house (kharch) mein ${twelfth.join(", ")} hain.`,
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
      says: "Ghar se mann thoda door rehta hai — ya toh gharwalon se soch nahi milti, ya kaam ke liye ghar chhodna padta hai.",
      because: fourth.length
        ? `4th house (ghar, maa) mein ${fourth.join(", ")} hain.`
        : `4th house ka swami ${lord4} ${c.houseOf(lord4)}th house mein hai.`,
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
      says: "Videsh ya apne shehar se door ke kaam se fayda milta hai — door jaane par kismat khulti hai.",
      because: [9, 12].includes(r) ? `Rahu ${r}th house mein hai.` : `12th house ka swami ${lord12} 9th house mein hai.`,
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
      Sun: "naam, pehchaan aur authority", Moon: "mann ki taakat aur logon se judaav",
      Mars: "himmat, zameen-jaydaad aur mehnat", Mercury: "dimaag, baat-cheet aur business",
      Jupiter: "gyaan, salah dena aur bhagya", Venus: "kala, sukh, aur logon ko apni taraf khinchna",
      Saturn: "tik kar kaam karna aur lambi race jeetna",
    };
    return {
      id: `exalted-${p}`,
      theme: "strength",
      kind: "strength",
      says: `Aapki sabse badi taakat ${area[p]} hai — is raaste par mehnat ka phal doosron se zyada milta hai.`,
      because: `${p} uchch (exalted) hai.`,
      weight: 3,
      lords: [p],
    };
  },
  (c) => {
    const good = ["Gaja Kesari Yoga", "Budha-Aditya Yoga", "Raj Yoga", "Viparita Raja Yoga (Harsha)", "Dharma-Karmadhipati Yoga"].filter((y) => c.yogas.some((x) => x.startsWith(y.split(" (")[0])));
    if (!good.length) return null;
    const meaning: Record<string, string> = {
      "Gaja Kesari Yoga": "log aapki baat sunte hain aur izzat dete hain — leadership wale kaam mein aap chamakte hain",
      "Budha-Aditya Yoga": "dimaag tez hai aur baat samjhane mein aap aage hain — padhana, salah dena, likhna ya business",
      "Raj Yoga": "pad, samman aur upar uthne ke yog hain — ek baar mauka mila toh aap tik jaate hain",
      "Viparita Raja Yoga": "mushkil ke baad hi aapki badi jeet aati hai — jahan doosre haar maante hain, wahan aap nikal jaate hain",
      "Dharma-Karmadhipati Yoga": "kismat aur mehnat ek saath chalte hain — apna kaam ya bade pad tak pahunchne ka yog",
    };
    const key = Object.keys(meaning).find((k) => good[0].startsWith(k.split(" (")[0]))!;
    return {
      id: "yoga-strength",
      theme: "strength",
      kind: "strength",
      says: `Aapki kundli mein ${key} bana hai: ${meaning[key]}.`,
      because: `${good.join(", ")} kundli mein ban raha hai.`,
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
      says: "Paisa kamaane aur bachane ki kshamata acchi hai — jahan aap dhyan lagate hain, wahan se aamdani ka rasta ban jaata hai.",
      because: strong
        ? `Dhan ke gharon ka swami (${strong && c.strengthOf(lord2) >= 6.5 ? lord2 : lord11}) mazboot hai.`
        : "2nd/11th house ke ashtakavarga bindu 30+ hain.",
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
      says: "Kaam aur career aapke liye sabse mazboot pehlu hai — sahi field mein aap naam bana lete hain.",
      because: `10th house (career) ka swami ${lord10} ${c.strengthOf(lord10) >= 6.5 ? "mazboot hai" : `kendra (${c.houseOf(lord10)}th) mein hai`}.`,
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
      says: "Mushkil waqt mein kahin na kahin se madad aa hi jaati hai — bade log, guru ya parivar ka haath saath rehta hai.",
      because: jupKendra ? `Jupiter kendra (${c.houseOf("Jupiter")}th) mein hai.` : `9th house (bhagya) ka swami ${lord9} mazboot hai.`,
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
      says: "Andar se ek khaalipan aur sawal rehte hain — puja, dhyaan ya guru ka saath mann ko sambhaalta hai.",
      because: `Ketu ${k}th house mein hai.`,
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
