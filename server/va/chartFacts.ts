/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * Kundli Facts: every astrological FACT the AI is allowed to state, computed by
 * rule, never guessed.
 *
 * The audit found the chat and the report stating things the code never computed:
 * yogas, exaltation or debilitation, combustion, "Saturn's drishti on your 7th", doshas,
 * "your strongest planet", career fields, the weak body areas, what the partner is
 * like, lucky number and colour, salary level, and the 1-10 ratings. All of these are
 * now derived here from the chart with classical rules. The AI only turns them
 * into words.
 *
 * Covered (Parashari rules unless noted):
 *   - dignity: exalted / moolatrikona / own / friend / neutral / enemy /
 *     debilitated, by natural friendship
 *   - combustion, with the standard orbs (Mercury and Venus tighter when retrograde)
 *   - dig bala (directional strength)
 *   - graha drishti: 7th for all; Mars 4/8, Jupiter 5/9, Saturn 3/10. Rahu and
 *     Ketu are left out because traditions differ.
 *   - conjunctions, and D9 dignity with vargottama
 *   - functional nature for this lagna: yogakaraka / benefic / malefic / maraka
 *   - Jaimini Atmakaraka / Amatyakaraka / Darakaraka (7-planet scheme)
 *   - doshas: Manglik, Kaal Sarp, Grahan, Guru Chandal, Pitra, Shrapit, Angarak.
 *     The last four are the "popular definitions" and are labelled so.
 *   - graha bal: a transparent, simplified strength score. It is NOT full Shadbala.
 *   - indicators: career fields, health areas, partner, lucky things, wealth level
 *   - ratings per life area: natal promise + the current dasha, from the timing engine
 */
import { SIGNS, NAKSHATRAS } from "../normalize";
import { detectYogas } from "./yogas";
import { computeAshtakavarga } from "./ashtakavarga";
import { computeTiming, type TimingTopic } from "./timing";
import { saturnCycles, transitCalendarForChart } from "./ingress";
import { lifePathNumber } from "./numerology";

const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
const SEVEN = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
const NINE = [...SEVEN, "Rahu", "Ketu"];
const VIM_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

export const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6, Rahu: 1, Ketu: 7 };
export const DEBIL: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0, Rahu: 7, Ketu: 1 };
const OWN: Record<string, number[]> = { Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10] };
// Moolatrikona: [sign, fromDeg, toDeg]
const MT: Record<string, [number, number, number]> = {
  Sun: [4, 0, 20], Moon: [1, 3, 30], Mars: [0, 0, 12], Mercury: [5, 15, 20], Jupiter: [8, 0, 10], Venus: [6, 0, 15], Saturn: [10, 0, 20],
};
// Naisargika (natural) friendship.
const FRIENDS: Record<string, string[]> = {
  Sun: ["Moon", "Mars", "Jupiter"], Moon: ["Sun", "Mercury"], Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"], Jupiter: ["Sun", "Moon", "Mars"], Venus: ["Mercury", "Saturn"], Saturn: ["Mercury", "Venus"],
};
const ENEMIES: Record<string, string[]> = {
  Sun: ["Venus", "Saturn"], Moon: [], Mars: ["Mercury"], Mercury: ["Moon"], Jupiter: ["Mercury", "Venus"], Venus: ["Sun", "Moon"], Saturn: ["Sun", "Moon", "Mars"],
};
const COMBUST_ORB: Record<string, [number, number]> = { Moon: [12, 12], Mars: [17, 17], Mercury: [14, 12], Jupiter: [11, 11], Venus: [10, 8], Saturn: [15, 15] };
const DIG_HOUSE: Record<string, number> = { Sun: 10, Mars: 10, Jupiter: 1, Mercury: 1, Moon: 4, Venus: 4, Saturn: 7 };
const SPECIAL_ASPECTS: Record<string, number[]> = { Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10] };
const NATURAL_MALEFIC = new Set(["Sun", "Mars", "Saturn", "Rahu", "Ketu"]);
const KENDRA = [1, 4, 7, 10];
const DUSTHANA = [6, 8, 12];

const ord = (n: number) => { const s = ["th", "st", "nd", "rd"]; const v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const r1 = (x: number) => Math.round(x * 10) / 10;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ---- classical interpretation tables (karakatva) ---------------------------------
export const CAREER_FIELDS: Record<string, string[]> = {
  Sun: ["government / administration", "politics & public leadership", "medicine (physician)", "management / authority roles"],
  Moon: ["hospitality & food", "nursing / healthcare support", "public dealing & customer relations", "water, dairy or liquids trade", "travel & tourism"],
  Mars: ["army / police / defence", "engineering & technical work", "surgery", "real estate & construction", "sports & fitness"],
  Mercury: ["business & trading", "accounts / commerce / banking operations", "writing, media & communication", "IT / software", "teaching (commerce, languages)"],
  Jupiter: ["teaching & education", "law & judiciary", "finance / banking / advisory", "counselling & consulting", "religion / priesthood"],
  Venus: ["arts, music & entertainment", "fashion, design & beauty", "luxury goods & hospitality", "media & creative industry", "vehicles & jewellery trade"],
  Saturn: ["manufacturing & heavy industry", "mining, oil & metals", "construction & labour-intensive work", "civil services / administration", "law & justice (disciplined roles)"],
  Rahu: ["technology & software", "foreign companies / MNCs", "aviation & research", "politics & mass media", "unconventional / new-age fields"],
  Ketu: ["research & analysis", "coding / technical specialisation", "spirituality & occult sciences", "alternative healing", "investigation"],
};
const SIGN_BODY = ["head & brain", "face, throat & neck", "shoulders, arms & lungs", "chest, stomach & breasts", "heart & upper back", "digestion & intestines", "kidneys & lower back", "reproductive & excretory organs", "hips, thighs & liver", "knees, bones & joints", "calves, ankles & circulation", "feet, lymph & sleep"];
const HOUSE_BODY: Record<number, string> = {
  1: "head & overall vitality", 2: "face, eyes, teeth & throat", 3: "throat, shoulders & arms", 4: "chest, lungs & heart", 5: "upper abdomen & stomach", 6: "intestines & digestion",
  7: "lower abdomen & kidneys", 8: "reproductive organs & chronic conditions", 9: "hips & thighs", 10: "knees & joints", 11: "calves, ankles & left ear", 12: "feet, left eye & sleep",
};
const PLANET_BODY: Record<string, string> = {
  Sun: "heart, bones, eyesight & vitality", Moon: "mind, sleep, fluids & chest", Mars: "blood, muscles, injuries, BP & inflammation", Mercury: "nerves, skin & speech",
  Jupiter: "liver, fat metabolism & blood sugar", Venus: "kidneys, hormones & reproductive health", Saturn: "bones, joints, teeth & long-term (chronic) issues",
  Rahu: "allergies, toxins & hard-to-diagnose issues", Ketu: "infections, wounds & sudden viral issues",
};
const SIGN_DIRECTION = ["East", "South", "West", "North", "East", "South", "West", "North", "East", "South", "West", "North"];
const SIGN_MODALITY = ["movable", "fixed", "dual", "movable", "fixed", "dual", "movable", "fixed", "dual", "movable", "fixed", "dual"];
const SIGN_TEMPERAMENT = [
  "energetic, direct, quick to act", "steady, practical, loyal, likes comfort", "communicative, curious, youthful, sociable", "caring, emotional, family-oriented",
  "confident, proud, generous, likes respect", "analytical, practical, detail-minded, health-conscious", "balanced, charming, diplomatic, artistic", "intense, private, deeply loyal, determined",
  "optimistic, principled, straightforward, likes freedom", "disciplined, responsible, ambitious, mature", "independent, intellectual, friendly but reserved", "gentle, sensitive, imaginative, spiritual",
];
const MEET_BY_HOUSE: Record<number, string> = {
  1: "through your own efforts / personal circle", 2: "through family introduction", 3: "through neighbourhood, siblings, short trips or communication/online",
  4: "through relatives, home circle or place of study", 5: "through a love affair / romance, college or creative circle", 6: "through workplace, service or maternal relatives",
  7: "through social life, business or public dealings", 8: "suddenly / unexpectedly, or through in-laws", 9: "at a religious place, long journey, or via teachers / father's circle",
  10: "through work or career circle", 11: "through friends, network or social media", 12: "at a distant or foreign place, online, or away from home",
};
const PLANET_COLOUR: Record<string, string> = { Sun: "orange / copper", Moon: "white / silver", Mars: "red", Mercury: "green", Jupiter: "yellow", Venus: "white / light pink", Saturn: "dark blue / black" };
const PLANET_DAY: Record<string, string> = { Sun: "Sunday", Moon: "Monday", Mars: "Tuesday", Mercury: "Wednesday", Jupiter: "Thursday", Venus: "Friday", Saturn: "Saturday" };
const PLANET_GEM: Record<string, string> = { Sun: "Ruby (Manik)", Moon: "Pearl (Moti)", Mars: "Red Coral (Moonga)", Mercury: "Emerald (Panna)", Jupiter: "Yellow Sapphire (Pukhraj)", Venus: "Diamond / White Sapphire", Saturn: "Blue Sapphire (Neelam)" };
const PLANET_DIRECTION: Record<string, string> = { Sun: "East", Moon: "North-West", Mars: "South", Mercury: "North", Jupiter: "North-East", Venus: "South-East", Saturn: "West" };
const PLANET_NUMBER: Record<string, number> = { Sun: 1, Moon: 2, Jupiter: 3, Rahu: 4, Mercury: 5, Venus: 6, Ketu: 7, Saturn: 8, Mars: 9 };
const PLANET_DEITY: Record<string, string> = { Sun: "Surya", Moon: "Shiva", Mars: "Hanuman", Mercury: "Vishnu / Ganesha", Jupiter: "Vishnu / Brihaspati", Venus: "Lakshmi", Saturn: "Shani / Hanuman" };

// ---- core -------------------------------------------------------------------------
export function computeChartFacts(chart: any, ayanamsa: number, nowMs = Date.now()) {
  const planetsRaw: any[] = chart?.planet_positions ?? [];
  const byName = new Map<string, any>(planetsRaw.map((p) => [p.planet, p]));
  const lagnaSign: string = chart?.d1_chart?.ascendant_sign || chart?.ascendant?.sign || "";
  const lagnaIdx = SIGNS.indexOf(lagnaSign);
  // Partial charts (e.g. test fixtures) can't support these rules, so skip them.
  if (lagnaIdx < 0 || NINE.some((pl) => !byName.has(pl))) return null;
  const signIdx = (n: string) => { const p = byName.get(n); return p ? (typeof p.sign_id === "number" ? p.sign_id : SIGNS.indexOf(p.sign)) : -1; };
  const lon = (n: string) => { const p = byName.get(n); return typeof p?.longitude === "number" ? p.longitude : signIdx(n) * 30 + (p?.degree ?? 0); };
  const house = (n: string) => byName.get(n)?.house ?? (signIdx(n) >= 0 ? ((signIdx(n) - lagnaIdx + 12) % 12) + 1 : 0);
  const houseSign = (h: number) => (lagnaIdx + h - 1) % 12;
  const lordOf = (h: number) => SIGN_LORDS[houseSign(h)];
  const ownedBy = (pl: string) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => lordOf(h) === pl);
  const occupants = (h: number) => NINE.filter((pl) => house(pl) === h);
  const moonIdx = signIdx("Moon");
  const gender = String(chart?.birth_details?.gender || "").toLowerCase();

  // D9 signs
  const d9 = new Map<string, number>(((chart?.d9_chart?.planet_positions ?? []) as any[]).map((p) => [p.planet, typeof p.sign_id === "number" ? p.sign_id : SIGNS.indexOf(p.sign)]));

  const dignityIn = (pl: string, si: number, degInSign: number | null): string => {
    if (si < 0) return "unknown";
    if (EXALT[pl] === si) return "exalted";
    if (DEBIL[pl] === si) return "debilitated";
    if (pl === "Rahu" || pl === "Ketu") return "neutral";
    const mt = MT[pl];
    if (mt && mt[0] === si && degInSign !== null && degInSign >= mt[1] && degInSign < mt[2]) return "moolatrikona";
    if (OWN[pl]?.includes(si)) return "own sign";
    const lord = SIGN_LORDS[si];
    if (FRIENDS[pl]?.includes(lord)) return "friendly sign";
    if (ENEMIES[pl]?.includes(lord)) return "enemy sign";
    return "neutral sign";
  };

  const sunLon = lon("Sun");
  const angDist = (a: number, b: number) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return d > 180 ? 360 - d : d; };

  // Functional nature for this lagna.
  const functional = (pl: string) => {
    if (pl === "Rahu" || pl === "Ketu") return { nature: "depends on sign lord & house", maraka: false };
    const owns = ownedBy(pl);
    const kendra = owns.filter((h) => [4, 7, 10].includes(h));
    const trikona = owns.filter((h) => [5, 9].includes(h));
    if (kendra.length && trikona.length) return { nature: "yogakaraka (best planet for this lagna)", maraka: owns.some((h) => h === 2 || h === 7) };
    let score = 0;
    for (const h of owns) {
      if (h === 1 || h === 5 || h === 9) score += 2;
      else if (h === 4 || h === 7 || h === 10) score += NATURAL_MALEFIC.has(pl) ? 1 : 0; // kendradhipati: benefics lose beneficence
      else if (h === 3 || h === 6 || h === 11) score -= 2;
      else if (h === 8 && !owns.includes(1)) score -= 2;
    }
    const nature = owns.includes(1) ? "lagna lord (always supportive)" : score > 0 ? "functional benefic" : score < 0 ? "functional malefic" : "neutral";
    return { nature, maraka: owns.some((h) => h === 2 || h === 7) };
  };

  // Aspects (whole-sign graha drishti).
  const aspectsFrom = (pl: string): number[] => {
    if (pl === "Rahu" || pl === "Ketu") return [];
    const h = house(pl);
    return (SPECIAL_ASPECTS[pl] ?? [7]).map((n) => ((h + n - 2) % 12) + 1);
  };
  const aspectedBy = (h: number) => SEVEN.filter((pl) => aspectsFrom(pl).includes(h));

  // Jaimini chara karakas (7-planet scheme: by degree within sign, highest first).
  const karakaOrder = [...SEVEN].sort((a, b) => (lon(b) % 30) - (lon(a) % 30));
  const jaimini = { atmakaraka: karakaOrder[0], amatyakaraka: karakaOrder[1], darakaraka: karakaOrder[6] };

  // Ashtakavarga (BAV bindus of each planet in its own sign; SAV per sign).
  const av = computeAshtakavarga(chart);
  const savOf = (si: number) => av.sav[si]?.bindus ?? 28;

  const planets = NINE.map((pl) => {
    const si = signIdx(pl);
    const degIn = byName.get(pl) ? lon(pl) % 30 : null;
    const retro = !!byName.get(pl)?.retrograde;
    const nk = byName.get(pl)?.nakshatra ?? null;
    const nkIdx = NAKSHATRAS.indexOf(nk);
    const combustDist = pl !== "Sun" && COMBUST_ORB[pl] ? angDist(lon(pl), sunLon) : null;
    const combust = combustDist !== null && combustDist < (retro ? COMBUST_ORB[pl][1] : COMBUST_ORB[pl][0]);
    const digH = DIG_HOUSE[pl];
    let dig: number | null = null;
    if (digH) { const d = Math.abs(house(pl) - digH); const dist = Math.min(d, 12 - d); dig = r1(1 - dist / 6); }
    const d9si = d9.get(pl) ?? -1;
    const fn = functional(pl);
    return {
      planet: pl,
      sign: SIGNS[si], house: house(pl), degree_in_sign: degIn !== null ? r1(degIn) : null,
      nakshatra: nk, nakshatra_lord: nkIdx >= 0 ? VIM_ORDER[nkIdx % 9] : null,
      retrograde: retro,
      dignity: dignityIn(pl, si, degIn),
      ...(pl === "Rahu" || pl === "Ketu" ? { dignity_note: "Rahu/Ketu dignity follows the common view (Rahu exalted in Taurus, Ketu in Scorpio); traditions differ, so do not stress it" } : {}),
      combust, combust_distance: combustDist !== null ? r1(combustDist) : null,
      dig_bala: dig, // 1 = full directional strength, 0 = none
      rules_houses: ownedBy(pl),
      functional: fn.nature, maraka: fn.maraka,
      aspects_houses: aspectsFrom(pl),
      conjunct_with: NINE.filter((o) => o !== pl && house(o) === house(pl)),
      d9_sign: d9si >= 0 ? SIGNS[d9si] : null,
      d9_dignity: d9si >= 0 ? dignityIn(pl, d9si, null) : null,
      vargottama: d9si >= 0 && d9si === si,
      bav_bindus_in_own_sign: av.bav[pl] ? av.bav[pl][si] : null,
    };
  });
  const P = (n: string) => planets.find((p) => p.planet === n)!;

  // ---- doshas ----
  const yogas = detectYogas(chart).yogas;
  const neechaBhanga = new Set(yogas.filter((y) => y.name === "Neecha Bhanga Raja Yoga").flatMap((y) => y.planets));
  const marsFrom = (refIdx: number) => refIdx >= 0 ? ((signIdx("Mars") - refIdx + 12) % 12) + 1 : 0;
  const MANGLIK_H = [1, 2, 4, 7, 8, 12];
  const manglikLagna = MANGLIK_H.includes(marsFrom(lagnaIdx));
  const manglikMoon = MANGLIK_H.includes(marsFrom(moonIdx));
  const manglikVenus = MANGLIK_H.includes(marsFrom(signIdx("Venus")));
  const cancel: string[] = [];
  if ([0, 7, 9].includes(signIdx("Mars"))) cancel.push(`Mars is in its own/exalted sign (${SIGNS[signIdx("Mars")]})`);
  if (P("Mars").conjunct_with.includes("Jupiter") || aspectsFrom("Jupiter").includes(house("Mars"))) cancel.push("Jupiter conjoins or aspects Mars");
  const manglik = {
    // Same rule the Kundli Matching page uses (lagna OR Moon), so both screens agree.
    is_manglik: manglikLagna || manglikMoon,
    from_lagna: manglikLagna, from_moon: manglikMoon, from_venus: manglikVenus,
    mars_house_from_lagna: marsFrom(lagnaIdx), mars_house_from_moon: marsFrom(moonIdx),
    mitigating_factors: cancel,
    // The correct explanation, written by code: the model once "explained" a non-Manglik
    // chart as "Mars in the 6th cancels the dosha" (the 6th isn't a Manglik house at all).
    explanation: (() => {
      const hl = marsFrom(lagnaIdx), hm = marsFrom(moonIdx);
      const houses = "1st, 2nd, 4th, 7th, 8th or 12th";
      if (!(manglikLagna || manglikMoon)) return `Mars is ${ord(hl)} from the lagna and ${ord(hm)} from the Moon. Manglik needs Mars in the ${houses} from either, so this chart is NOT Manglik. There is nothing to cancel.`;
      const where = [manglikLagna ? `${ord(hl)} from the lagna` : "", manglikMoon ? `${ord(hm)} from the Moon` : ""].filter(Boolean).join(" and ");
      return `Mars is ${where}, which is a Manglik position (${houses}).` + (cancel.length ? ` Its effect is reduced because ${cancel.join("; ")}.` : "");
    })(),
    verdict: !(manglikLagna || manglikMoon) ? "Not Manglik"
      : cancel.length ? "Manglik, but mitigated (see mitigating_factors)"
      : manglikLagna && manglikMoon ? "Manglik (from both Lagna and Moon)" : `Manglik (from ${manglikLagna ? "Lagna" : "Moon"} only — milder)`,
  };

  // Kaal Sarp: all 7 planets on one side of the Rahu–Ketu axis.
  const rahuLon = lon("Rahu");
  const offs = SEVEN.map((pl) => ((lon(pl) - rahuLon) % 360 + 360) % 360);
  const sideA = offs.filter((o) => o > 0 && o < 180).length;
  const sideB = offs.filter((o) => o > 180 && o < 360).length;
  const KS_NAMES = ["Anant", "Kulik", "Vasuki", "Shankhpal", "Padma", "Mahapadma", "Takshak", "Karkotak", "Shankhachood", "Ghatak", "Vishdhar", "Sheshnag"];
  const kaalSarp = sideA === 7 || sideB === 7
    ? { present: true, type: `${KS_NAMES[house("Rahu") - 1]} Kaal Sarp (Rahu in ${ord(house("Rahu"))} house)`, note: sideA === 7 ? "all planets from Rahu towards Ketu" : "all planets from Ketu towards Rahu (some call this Kaal Amrit)" }
    : sideA === 6 || sideB === 6
      ? { present: false, type: "partial (one planet outside the axis) — most astrologers do NOT count this as Kaal Sarp", note: "" }
      : { present: false, type: "none", note: "" };

  const sameSign = (a: string, b: string) => signIdx(a) >= 0 && signIdx(a) === signIdx(b);
  const doshas = {
    manglik,
    kaal_sarp: kaalSarp,
    grahan: { present: ["Sun", "Moon"].some((l) => sameSign(l, "Rahu") || sameSign(l, "Ketu")), with: ["Sun", "Moon"].flatMap((l) => ["Rahu", "Ketu"].filter((n) => sameSign(l, n)).map((n) => `${l}+${n}`)) },
    guru_chandal: { present: sameSign("Jupiter", "Rahu"), note: "popular definition: Jupiter with Rahu" },
    pitra: {
      present: sameSign("Sun", "Rahu") || sameSign("Sun", "Ketu") || [9].includes(house("Rahu")) || [9].includes(house("Ketu")),
      note: "popular definition: Sun with Rahu/Ketu, or Rahu/Ketu in the 9th house",
    },
    shrapit: { present: sameSign("Saturn", "Rahu"), note: "popular definition: Saturn with Rahu" },
    angarak: { present: sameSign("Mars", "Rahu") || sameSign("Mars", "Ketu"), note: "popular definition: Mars with Rahu/Ketu" },
    kemadruma: { present: yogas.some((y) => y.name === "Kemadruma Yoga"), note: "Moon unsupported, uncancelled" },
  };

  // ---- graha bal (simplified, transparent strength) ----
  const strength = SEVEN.map((pl) => {
    const p = P(pl);
    let s = 5; const why: string[] = [];
    const dg: Record<string, number> = { exalted: 2.5, moolatrikona: 2, "own sign": 2, "friendly sign": 1, "neutral sign": 0, "enemy sign": -1, debilitated: -2.5 };
    let dv = dg[p.dignity] ?? 0;
    if (p.dignity === "debilitated" && neechaBhanga.has(pl)) { dv = -1; why.push("debilitated but cancelled (Neecha Bhanga)"); }
    else if (dv) why.push(`${p.dignity} (${dv > 0 ? "+" : ""}${dv})`);
    s += dv;
    if (p.dig_bala !== null) { const v = r1((p.dig_bala - 0.5) * 2); s += v; if (p.dig_bala >= 0.99) why.push("full directional strength (dig bala)"); else if (p.dig_bala <= 0.01) why.push("no directional strength"); }
    if (KENDRA.includes(p.house)) { s += 1; why.push(`in a kendra (${ord(p.house)})`); }
    else if ([5, 9].includes(p.house)) { s += 1; why.push(`in a trikona (${ord(p.house)})`); }
    else if (p.house === 11) s += 0.5;
    else if (DUSTHANA.includes(p.house)) { s -= 1.5; why.push(`in a dusthana (${ord(p.house)})`); }
    if (p.combust) { s -= 2; why.push(`combust (${p.combust_distance}° from Sun)`); }
    if (p.retrograde && pl !== "Sun" && pl !== "Moon") { s += 0.5; why.push("retrograde (cheshta bala)"); }
    if (p.vargottama) { s += 1; why.push("vargottama (same sign in D9)"); }
    else if (p.d9_dignity === "exalted" || p.d9_dignity === "own sign") { s += 0.75; why.push(`${p.d9_dignity} in D9`); }
    else if (p.d9_dignity === "debilitated") { s -= 0.75; why.push("debilitated in D9"); }
    if (p.bav_bindus_in_own_sign !== null) {
      if (p.bav_bindus_in_own_sign >= 5) { s += 0.75; why.push(`${p.bav_bindus_in_own_sign} ashtakavarga bindus`); }
      else if (p.bav_bindus_in_own_sign <= 2) { s -= 0.75; why.push(`only ${p.bav_bindus_in_own_sign} ashtakavarga bindus`); }
    }
    const asp = aspectedBy(p.house).filter((o) => o !== pl);
    for (const o of asp) { if (o === "Jupiter" || o === "Venus") s += 0.4; else if (o === "Saturn" || o === "Mars") s -= 0.4; }
    if (asp.length) why.push(`aspected by ${asp.join(", ")}`);
    if (p.conjunct_with.includes("Rahu") || p.conjunct_with.includes("Ketu")) { s -= 0.5; why.push("with Rahu/Ketu"); }
    if (pl === "Moon") {
      const el = ((lon("Moon") - sunLon) % 360 + 360) % 360;
      if (el < 72 || el > 288) { s -= 1; why.push("weak (dark) Moon near the Sun"); }
      else if (el > 144 && el < 216) { s += 1; why.push("bright, near-full Moon"); }
    }
    return { planet: pl, score: r1(clamp(s, 0, 10)), why };
  }).sort((a, b) => b.score - a.score);
  const strengthOf = (pl: string) => strength.find((x) => x.planet === pl)?.score ?? 5;

  // ---- career indicators ----
  const d10 = chart?.divisional_charts?.D10;
  const d10Asc = SIGNS.indexOf(d10?.ascendant_sign ?? "");
  const roles = new Map<string, { w: number; roles: string[] }>();
  const role = (pl: string, w: number, r: string) => { if (!pl || !CAREER_FIELDS[pl]) return; const x = roles.get(pl) ?? { w: 0, roles: [] }; x.w += w; x.roles.push(r); roles.set(pl, x); };
  role(lordOf(10), 3, "10th lord");
  for (const o of occupants(10)) role(o, 2, "sits in the 10th");
  if (d10Asc >= 0) { role(SIGN_LORDS[d10Asc], 2, "D10 lagna lord"); role(SIGN_LORDS[(d10Asc + 9) % 12], 1.5, "D10 10th lord"); }
  role(jaimini.amatyakaraka, 2, "Amatyakaraka (Jaimini career significator)");
  role(lordOf(1), 1, "lagna lord");
  const careerRank = [...roles.entries()]
    .map(([pl, x]) => ({ planet: pl, weight: r1(x.w * (0.5 + (["Rahu", "Ketu"].includes(pl) ? 5 : strengthOf(pl)) / 10)), roles: x.roles, fields: CAREER_FIELDS[pl] }))
    .sort((a, b) => b.weight - a.weight);
  const bizScore = r1((strengthOf(lordOf(7)) + strengthOf(lordOf(3)) + strengthOf("Mercury")) / 3);
  const jobScore = r1((strengthOf(lordOf(6)) + strengthOf(lordOf(10)) + strengthOf("Saturn")) / 3);
  const career = {
    top_significators: careerRank.slice(0, 3),
    tenth_house: { sign: SIGNS[houseSign(10)], lord: lordOf(10), lord_in_house: house(lordOf(10)), occupants: occupants(10), aspected_by: aspectedBy(10) },
    job_vs_business: { job_score: jobScore, business_score: bizScore, lean: Math.abs(jobScore - bizScore) < 0.5 ? "both workable (balanced)" : jobScore > bizScore ? "service / job" : "own business / independent work" },
  };

  // ---- health indicators ----
  const areas = new Map<string, { w: number; why: string[] }>();
  const addArea = (label: string, w: number, why: string) => { const x = areas.get(label) ?? { w: 0, why: [] }; x.w += w; x.why.push(why); areas.set(label, x); };
  addArea(SIGN_BODY[houseSign(6)], 2, `sign of the 6th house (disease) is ${SIGNS[houseSign(6)]}`);
  addArea(SIGN_BODY[houseSign(8)], 1.5, `sign of the 8th house (chronic issues) is ${SIGNS[houseSign(8)]}`);
  for (const o of occupants(6)) addArea(PLANET_BODY[o], 1.5, `${o} sits in the 6th house`);
  for (const o of occupants(8)) addArea(PLANET_BODY[o], 1.5, `${o} sits in the 8th house`);
  if (strengthOf(lordOf(1)) < 4.5) addArea(SIGN_BODY[lagnaIdx], 1.5, `lagna lord ${lordOf(1)} is weak`);
  for (const p of planets.filter((x) => SEVEN.includes(x.planet))) {
    if (p.dignity === "debilitated" && !neechaBhanga.has(p.planet)) addArea(PLANET_BODY[p.planet], 1.25, `${p.planet} is debilitated`);
    if (p.combust) addArea(PLANET_BODY[p.planet], 1, `${p.planet} is combust`);
    const mal = aspectedBy(p.house).filter((o) => o === "Saturn" || o === "Mars").length + (p.conjunct_with.some((o) => ["Saturn", "Mars", "Rahu", "Ketu"].includes(o)) ? 1 : 0);
    if (mal >= 2) addArea(PLANET_BODY[p.planet], 1, `${p.planet} is afflicted by malefics`);
  }
  for (const o of occupants(12)) addArea(HOUSE_BODY[12], 0.75, `${o} sits in the 12th house`);
  const health = {
    watch_areas: [...areas.entries()].map(([area, x]) => ({ area, weight: r1(x.w), why: x.why })).sort((a, b) => b.weight - a.weight).slice(0, 4),
    vitality: { lagna_lord: lordOf(1), lagna_lord_strength: strengthOf(lordOf(1)), sun_strength: strengthOf("Sun"), moon_strength: strengthOf("Moon") },
  };

  // ---- partner indicators ----
  const l7 = lordOf(7);
  const spouseKaraka = gender.startsWith("f") ? "Jupiter" : "Venus";
  const d9Asc = SIGNS.indexOf(chart?.d9_chart?.ascendant_sign ?? "");
  const partner = {
    seventh_house: { sign: SIGNS[houseSign(7)], temperament_of_sign: SIGN_TEMPERAMENT[houseSign(7)], occupants: occupants(7), aspected_by: aspectedBy(7) },
    seventh_lord: { planet: l7, in_house: house(l7), in_sign: P(l7).sign, dignity: P(l7).dignity, strength: strengthOf(l7) },
    how_you_may_meet: MEET_BY_HOUSE[house(l7)],
    direction_of_partner: `${SIGN_DIRECTION[houseSign(7)]} (from the 7th sign ${SIGNS[houseSign(7)]})`,
    distance: SIGN_MODALITY[signIdx(l7)] === "movable" ? "likely from a farther place / different city" : SIGN_MODALITY[signIdx(l7)] === "fixed" ? "likely from nearby / same city or known circle" : "moderate distance",
    partner_work_fields: [...new Set([...(CAREER_FIELDS[l7] ?? []).slice(0, 2), ...(CAREER_FIELDS[jaimini.darakaraka] ?? []).slice(0, 2)])],
    spouse_karaka: { planet: spouseKaraka, sign: P(spouseKaraka).sign, house: P(spouseKaraka).house, dignity: P(spouseKaraka).dignity, strength: strengthOf(spouseKaraka) },
    darakaraka: jaimini.darakaraka,
    d9: d9Asc >= 0 ? { navamsa_lagna: SIGNS[d9Asc], seventh_sign: SIGNS[(d9Asc + 6) % 12], seventh_lord: SIGN_LORDS[(d9Asc + 6) % 12] } : null,
  };

  // ---- lucky factors ----
  const dob: string = chart?.birth_details?.date_of_birth ?? "";
  const day = Number(dob.slice(8, 10));
  const reduce = (n: number) => { while (n > 9) n = String(n).split("").reduce((a, b) => a + Number(b), 0); return n; };
  const ll = lordOf(1), l5 = lordOf(5), l9 = lordOf(9);
  const malefic68 = [lordOf(6), lordOf(8)].filter((pl) => pl !== ll && !ownedBy(pl).some((h) => [1, 5, 9].includes(h)));
  const lucky = {
    moolank: Number.isFinite(day) && day > 0 ? reduce(day) : null,
    bhagyank: dob ? (() => { try { return lifePathNumber(dob); } catch { return null; } })() : null,
    lagna_lord: ll,
    lucky_numbers: [...new Set([PLANET_NUMBER[ll], PLANET_NUMBER[l5], PLANET_NUMBER[l9]].filter(Boolean))],
    lucky_colours: [...new Set([PLANET_COLOUR[ll], PLANET_COLOUR[l5], PLANET_COLOUR[l9]].filter(Boolean))],
    lucky_days: [...new Set([PLANET_DAY[ll], PLANET_DAY[l9]].filter(Boolean))],
    lucky_direction: PLANET_DIRECTION[ll],
    deity: PLANET_DEITY[ll],
    gemstone: { primary: PLANET_GEM[ll], supportive: [...new Set([PLANET_GEM[l5], PLANET_GEM[l9]].filter((g) => g && g !== PLANET_GEM[ll]))], caution: "wear only after checking with a qualified astrologer" },
    less_favourable_colours: [...new Set(malefic68.map((pl) => PLANET_COLOUR[pl]).filter(Boolean))],
    basis: `lagna lord ${ll} + trikona lords ${l5} (5th) and ${l9} (9th)`,
  };

  // ---- wealth level (qualitative ONLY — never an amount) ----
  // Only true wealth yogas count fully; raja yogas (status/rise) add a little.
  const dhanaYogas = yogas.filter((y) => /Dhana|Lakshmi|Chandra-Mangal/.test(y.name)).map((y) => y.name);
  const rajaYogas = yogas.filter((y) => /Raj|Yogakaraka|Mahapurusha/.test(y.name)).map((y) => y.name);
  const sav2 = savOf(houseSign(2)), sav11 = savOf(houseSign(11));
  const wScore = (strengthOf(lordOf(2)) + strengthOf(lordOf(11)) + strengthOf("Jupiter") + strengthOf(lordOf(9))) / 4
    + (sav2 >= 28 ? 0.5 : sav2 < 24 ? -0.5 : 0) + (sav11 >= 28 ? 0.5 : sav11 < 24 ? -0.5 : 0) + Math.min(1.5, dhanaYogas.length * 0.5) + Math.min(0.75, rajaYogas.length * 0.25);
  const wealth = {
    level: wScore >= 7.5 ? "strong wealth potential" : wScore >= 6 ? "above-average wealth potential" : wScore >= 4.5 ? "average — grows with steady effort" : "needs disciplined effort and saving",
    score: r1(wScore),
    second_lord: { planet: lordOf(2), house: house(lordOf(2)), strength: strengthOf(lordOf(2)) },
    eleventh_lord: { planet: lordOf(11), house: house(lordOf(11)), strength: strengthOf(lordOf(11)) },
    ashtakavarga: { second_house_bindus: sav2, eleventh_house_bindus: sav11, note: "28+ bindus = strong" },
    wealth_yogas: dhanaYogas,
    status_yogas: rajaYogas,
  };

  // ---- ratings per life area (natal promise + current dasha) ----
  const savScore = (si: number) => clamp((savOf(si) - 18) / 2, 0, 10);
  const occAdj = (h: number) => occupants(h).reduce((a, o) => a + (o === "Jupiter" || o === "Venus" ? 0.5 : NATURAL_MALEFIC.has(o) && o !== "Sun" ? -0.5 : 0), 0);
  const promise = (hs: number[], karakas: string[]) => {
    const lords = hs.map((h) => strengthOf(lordOf(h)));
    const k = karakas.map(strengthOf);
    const sv = hs.map((h) => savScore(houseSign(h)));
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 5);
    return clamp(0.5 * mean(lords) + 0.2 * mean(k) + 0.3 * mean(sv) + hs.reduce((a, h) => a + occAdj(h), 0), 1, 10);
  };
  const AREA: Record<string, { houses: number[]; karakas: string[]; topic: TimingTopic }> = {
    health: { houses: [1], karakas: ["Sun", "Moon"], topic: "health" },
    wealth: { houses: [2, 11], karakas: ["Jupiter"], topic: "wealth" },
    career: { houses: [10], karakas: ["Sun", "Saturn"], topic: "career" },
    marriage: { houses: [7], karakas: [spouseKaraka], topic: "marriage" },
    relationships: { houses: [5, 11, 4], karakas: ["Venus", "Moon"], topic: "relationship" },
    travel: { houses: [12, 9, 3], karakas: ["Moon"], topic: "foreign" },
    business: { houses: [7, 10, 11], karakas: ["Mercury"], topic: "business" },
  };
  const ratings: Record<string, { rating: number; natal_promise: number; current_period: string; basis: string }> = {};
  for (const [area, cfg] of Object.entries(AREA)) {
    const pr = promise(cfg.houses, cfg.karakas);
    let cur = "unknown", curVal = 5.5;
    try {
      const t = computeTiming(chart, cfg.topic, ayanamsa, nowMs);
      const st = t?.right_now?.strength;
      if (st) {
        cur = cfg.topic === "health" ? (st === "strong" ? "sensitive period" : st === "moderate" ? "moderate" : "supportive period") : st;
        curVal = cfg.topic === "health" ? (st === "strong" ? 3.5 : st === "moderate" ? 5.5 : 8) : (st === "strong" ? 8 : st === "moderate" ? 5.5 : 3.5);
      }
    } catch { /* timing optional */ }
    ratings[area] = {
      rating: clamp(Math.round(0.65 * pr + 0.35 * curVal), 1, 10),
      natal_promise: r1(pr),
      current_period: cur,
      basis: `houses ${cfg.houses.join("/")} lords' strength, karaka ${cfg.karakas.join("/")}, ashtakavarga of those houses, occupants, and the running antardasha`,
    };
  }

  // ---- gochar calendar + Sade Sati ----
  let gochar: any = null, saturn: any = null;
  try {
    gochar = transitCalendarForChart(lagnaIdx, moonIdx, ayanamsa, nowMs, 12);
    saturn = moonIdx >= 0 ? saturnCycles(moonIdx, ayanamsa, nowMs) : null;
  } catch { /* optional */ }

  return {
    lagna: SIGNS[lagnaIdx],
    planets,
    house_lords: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => ({ house: h, sign: SIGNS[houseSign(h)], lord: lordOf(h), lord_in_house: house(lordOf(h)), occupants: occupants(h), aspected_by: aspectedBy(h), sav_bindus: savOf(houseSign(h)) })),
    jaimini,
    yogas: yogas.map((y) => ({ name: y.name, planets: y.planets, meaning: y.summary })),
    doshas,
    strength_ranking: strength,
    career, health, partner, lucky, wealth,
    ratings,
    gochar_calendar: gochar,
    saturn_cycles: saturn,
  };
}

export type ChartFacts = NonNullable<ReturnType<typeof computeChartFacts>>;

/** What each yoga means in everyday life, with no planet or house words. It is what the
 *  user-facing "answer" may say. The formation stays in how_it_forms (for "reason"). */
const YOGA_LIFE: Array<[RegExp, string]> = [
  [/^Gaja Kesari/, "wisdom, respect and lasting success"],
  [/^Budha-Aditya/, "sharp intellect and good communication"],
  [/^Chandra-Mangal/, "strong drive to earn; money through bold effort"],
  [/^Ruchaka/, "courage, energy and natural leadership"],
  [/^Bhadra/, "intelligence, business sense and good speech"],
  [/^Hamsa/, "wisdom, good values and respect in society"],
  [/^Malavya/, "comfort, charm, love for arts and a happy married life"],
  [/^Sasa/, "discipline, authority and success through hard work"],
  [/^Durudhara/, "all-round comfort and support from people"],
  [/^Sunapha/, "self-earned wealth and a steady mind"],
  [/^Anapha/, "a pleasant, well-liked and contented nature"],
  [/^Kemadruma/, "emotional ups and downs; routine and support help a lot"],
  [/^Yogakaraka Raj/, "a built-in blessing for rise and success, strongest in its period"],
  [/^Raj Yoga/, "rise in status, authority and success"],
  [/^Dharma-Karmadhipati/, "luck and career support each other: meaningful work and status"],
  [/^Parivartana/, "two areas of life strongly support each other"],
  [/^Viparita/, "rise after difficulties: obstacles turn into gains"],
  [/^Neecha Bhanga/, "early struggles that turn into strength and rise"],
  [/^Dhana/, "good potential to build wealth"],
];
const yogaLife = (name: string) => YOGA_LIFE.find(([re]) => re.test(name))?.[1] ?? "";

/** Compact AI view: the same facts, minus fields the model doesn't need. */
export function chartFactsForAI(f: ChartFacts) {
  return {
    note: "CALCULATED BY CODE with classical rules. These are the ONLY yogas, doshas, dignities, aspects, strengths, indicators, ratings and transit dates you may state.",
    lagna: f.lagna,
    planets: f.planets.map((p) => ({
      planet: p.planet, sign: p.sign, house: p.house, dignity: p.dignity, ...((p as any).dignity_note ? { dignity_note: (p as any).dignity_note } : {}),
      retrograde: p.retrograde, combust: p.combust, dig_bala: p.dig_bala, functional: p.functional, maraka: p.maraka,
      rules_houses: p.rules_houses, aspects_houses: p.aspects_houses, conjunct_with: p.conjunct_with,
      d9_sign: p.d9_sign, vargottama: p.vargottama, nakshatra: p.nakshatra, nakshatra_lord: p.nakshatra_lord,
    })),
    house_lords: f.house_lords,
    jaimini: f.jaimini,
    yogas: f.yogas.map((y) => ({ name: y.name, life_meaning: yogaLife(y.name), how_it_forms: y.meaning, planets: y.planets })),
    doshas: f.doshas,
    strength_ranking: f.strength_ranking.map((x) => ({ planet: x.planet, score_out_of_10: x.score, why: x.why })),
    career: f.career,
    health: f.health,
    partner: f.partner,
    lucky: f.lucky,
    wealth: f.wealth,
    ratings: f.ratings,
    saturn_cycles: f.saturn_cycles,
    // One ordered sentence per planet with readable dates. The model misread the stays
    // list as JSON (it merged retrograde back-and-forth stays); a plain sequence reads right.
    gochar_calendar: gocharTimeline(f.gochar_calendar),
  };
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const human = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : iso);

/** "Jupiter: NOW in Cancer (10th from lagna, 3rd from Moon) until 31 Oct 2026 → then Leo (11th/4th) 31 Oct 2026 – 25 Jan 2027 [short stay] → …" */
export function gocharTimeline(cal: any): Record<string, string> | null {
  if (!cal) return null;
  const out: Record<string, string> = {};
  for (const [planet, stays] of Object.entries(cal as Record<string, any[]>)) {
    out[planet] = stays.map((s, i) => {
      const where = `${s.sign} (${s.house_from_lagna ? `${ord(s.house_from_lagna)} house from lagna` : "?"}, ${s.house_from_moon ? `${ord(s.house_from_moon)} from Moon` : "?"})`;
      const short = s.note && /short stay/.test(s.note) ? " [short stay, retrograde back-and-forth]" : "";
      return i === 0 ? `NOW in ${where} until ${human(s.to)}` : `then ${where} from ${human(s.from)} to ${human(s.to)}${short}`;
    }).join(" → ");
  }
  return out;
}
