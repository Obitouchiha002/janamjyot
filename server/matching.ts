/**
 * Kundli Matching — Ashtakoot Guna Milan (36 points), computed from our own
 * astrology engine (no external API). Follows the classical BPHS Ashtakoot
 * system used by standard Vedic software:
 *
 *   Varna (1) · Vashya (2) · Tara (3) · Yoni (4) · Graha Maitri (5)
 *   Gana (6) · Bhakoot (7) · Nadi (8)   = 36 total
 *
 * Plus Mangal (Manglik) dosha and Bhakoot / Nadi dosha checks with the standard
 * cancellation exceptions. Everything keys off each person's MOON nakshatra and
 * MOON rasi, which we derive from the exact sidereal Moon longitude.
 */
import { computeChart } from "./engine";
import { buildIsoDatetime, type BirthInput } from "./validate";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
  "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni",
  "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta",
  "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

// ---------------------------------------------------------------------------
// Per-person Moon/Mars data from birth details
// ---------------------------------------------------------------------------
export interface PersonMoon {
  name: string;
  moonLongitude: number;
  nakIndex: number;   // 0-26
  signIndex: number;  // 0-11 (Moon rasi)
  nakshatra: string;
  rasi: string;
  rasiLord: string;
  marsSignIndex: number;
  marsHouseFromMoon: number;
  marsHouseFromLagna: number;
  manglik: boolean;
}

const norm = (x: number) => ((x % 360) + 360) % 360;

export function personMoon(input: BirthInput, ayanamsa: number): PersonMoon {
  const iso = buildIsoDatetime(input.date_of_birth, input.time_of_birth, input.timezone);
  const c = computeChart({ datetime: iso, latitude: input.latitude, longitude: input.longitude, ayanamsa });
  const pp = c.planetPositionData.planet_position;
  const get = (n: string) => pp.find((p: any) => p.name === n);
  const moon = get("Moon"), mars = get("Mars"), asc = get("Ascendant");

  const moonLon = norm(moon?.longitude ?? 0);
  const nakIndex = Math.floor(moonLon / (360 / 27)) % 27;
  const signIndex = Math.floor(moonLon / 30) % 12;
  const marsSign = Math.floor(norm(mars?.longitude ?? 0) / 30) % 12;
  const ascSign = Math.floor(norm(asc?.longitude ?? 0) / 30) % 12;

  const houseFrom = (s: number, ref: number) => ((s - ref + 12) % 12) + 1;
  const marsFromMoon = houseFrom(marsSign, signIndex);
  const marsFromLagna = houseFrom(marsSign, ascSign);
  /*
   * Manglik is read from the LAGNA.
   *
   * It was "from the Lagna OR the Moon", which flags roughly three people in
   * four — and every one of them was then told they were Manglik and pointed
   * at a Mangal Shanti puja. Across six charts checked against ProKerala, the
   * Lagna rule agreed 6/6 and the combined rule 5/6: it called a chart Manglik
   * whose Mars is 9th from the Lagna and only 12th from the Moon. The Moon
   * position is still carried (marsHouseFromMoon) for anyone who reads both.
   */
  const manglikHouses = [1, 2, 4, 7, 8, 12];
  const manglik = manglikHouses.includes(marsFromLagna);

  return {
    name: input.name,
    moonLongitude: Number(moonLon.toFixed(4)),
    nakIndex,
    signIndex,
    nakshatra: NAKSHATRAS[nakIndex],
    rasi: SIGNS[signIndex],
    rasiLord: SIGN_LORDS[signIndex],
    marsSignIndex: marsSign,
    marsHouseFromMoon: marsFromMoon,
    marsHouseFromLagna: marsFromLagna,
    manglik,
  };
}

// ---------------------------------------------------------------------------
// Koota tables
// ---------------------------------------------------------------------------

// Varna by sign: water=Brahmin(4), fire=Kshatriya(3), earth=Vaishya(2), air=Shudra(1)
const VARNA = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4]; // Aries..Pisces
const VARNA_NAME = ["", "Shudra", "Vaishya", "Kshatriya", "Brahmin"];

// Vashya group per sign.
// 0 Chatushpada(quadruped) 1 Nara(human) 2 Jalachara(watery) 3 Vanachara(wild) 4 Keeta(insect)
const VASHYA_GROUP = [0, 0, 1, 2, 3, 1, 1, 4, 1, 2, 1, 2];

/**
 * Vashya group from the Moon's exact longitude, not just its sign.
 *
 * Two signs are classically SPLIT at the midpoint, and treating them as whole
 * signs mis-scored every Moon in their second half by up to 2 of the 36 points:
 *   • Sagittarius — first half Nara (the archer's human torso),
 *     second half Chatushpada (the horse body).
 *   • Capricorn — first half Chatushpada (the goat),
 *     second half Jalachara (the makara's fish tail).
 */
function vashyaGroupOf(moonLongitude: number): number {
  const sign = Math.floor(norm(moonLongitude) / 30) % 12;
  const deg = norm(moonLongitude) % 30;
  if (sign === 8) return deg < 15 ? 1 : 0;  // Sagittarius: Nara -> Chatushpada
  if (sign === 9) return deg < 15 ? 0 : 2;  // Capricorn: Chatushpada -> Jalachara
  return VASHYA_GROUP[sign];
}
const VASHYA_NAME = ["Chatushpada", "Nara", "Jalachara", "Vanachara", "Keeta"];
/*
 * Vashya score matrix, [boy][girl].
 *
 * Published Vashya tables genuinely disagree — PyJHora ships two of them side
 * by side (Saravali and AstroYogi). Rather than pick one from memory, both were
 * scored against ProKerala's own koota-by-koota results for nine measured
 * couples: this one (AstroYogi, read [boy][girl]) matched 9/9; the table this
 * replaced matched 8/9, getting a Jalachara groom with a Vanachara bride wrong.
 * Cells no measured couple reached are taken from the same published table.
 */
const VASHYA_MATRIX = [
  //         Q    N    J    W    K
  /* Q */ [2, 1, 1, 1.5, 1],
  /* N */ [1, 2, 1.5, 0, 1],
  /* J */ [1, 1.5, 2, 1, 1],
  /* W */ [0, 0, 0, 2, 0],
  /* K */ [1, 1, 1, 0, 2],
];

// Yoni (animal) per nakshatra (0-based). 14 yonis.
// 0 Horse 1 Elephant 2 Sheep 3 Serpent 4 Dog 5 Cat 6 Rat 7 Cow 8 Buffalo 9 Tiger 10 Deer 11 Monkey 12 Mongoose 13 Lion
const YONI_OF_NAK = [
  0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1,
];
const YONI_NAME = ["Horse", "Elephant", "Sheep", "Serpent", "Dog", "Cat", "Rat", "Cow", "Buffalo", "Tiger", "Deer", "Monkey", "Mongoose", "Lion"];
/*
 * Yoni Kuta, the full 14x14 table ([boy][girl]; symmetric).
 *
 * This used to be a three-tier simplification — same yoni 4, the seven mortal
 * enemies 0, and EVERYTHING else 2 — on the grounds that published matrices
 * disagree. Measured against ProKerala's koota-by-koota results for nine
 * couples, the simplification got two of nine wrong (a Cow groom with a Deer
 * bride is 3, not 2) while this table, from PyJHora (the Python port of
 * Jagannatha Hora), matched all nine. Rounding every friendly pair down to
 * "neutral" was not caution, it was a consistent error in one direction.
 */
const YONI_MATRIX = [
  /* Horse    */ [4, 2, 2, 3, 2, 2, 2, 1, 0, 1, 1, 3, 2, 1],
  /* Elephant */ [2, 4, 3, 3, 2, 2, 2, 2, 3, 1, 2, 3, 2, 0],
  /* Sheep    */ [2, 3, 4, 2, 1, 2, 1, 3, 3, 1, 2, 0, 3, 1],
  /* Serpent  */ [3, 3, 2, 4, 2, 1, 1, 1, 1, 2, 2, 2, 0, 2],
  /* Dog      */ [2, 2, 1, 2, 4, 2, 1, 2, 2, 1, 0, 2, 1, 1],
  /* Cat      */ [2, 2, 2, 1, 2, 4, 0, 2, 2, 1, 3, 3, 2, 1],
  /* Rat      */ [2, 2, 1, 1, 1, 0, 4, 2, 2, 2, 2, 2, 1, 2],
  /* Cow      */ [1, 2, 3, 1, 2, 2, 2, 4, 3, 0, 3, 2, 2, 1],
  /* Buffalo  */ [0, 3, 3, 1, 2, 2, 2, 3, 4, 1, 2, 2, 2, 1],
  /* Tiger    */ [1, 1, 1, 2, 1, 1, 2, 0, 1, 4, 1, 1, 2, 1],
  /* Deer     */ [1, 2, 2, 2, 0, 3, 2, 3, 2, 1, 4, 2, 2, 1],
  /* Monkey   */ [3, 3, 0, 2, 2, 3, 2, 2, 2, 1, 2, 4, 3, 2],
  /* Mongoose */ [2, 2, 3, 0, 1, 2, 1, 2, 2, 2, 2, 3, 4, 2],
  /* Lion     */ [1, 0, 1, 2, 1, 1, 2, 1, 1, 1, 1, 2, 2, 4],
];
function yoniScore(a: number, b: number): { score: number; simplified: boolean } {
  return { score: YONI_MATRIX[a][b], simplified: false };
}

// Gana per nakshatra: 0 Deva, 1 Manushya, 2 Rakshasa
const GANA_OF_NAK = [
  0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0,
];
const GANA_NAME = ["Deva", "Manushya", "Rakshasa"];
// [boy][girl]. A Deva groom with a Rakshasa bride is 0, not 1: ProKerala scored
// two measured couples that way, and this cell was the only one that differed.
const GANA_MATRIX = [
  /* Deva */ [6, 6, 0],
  /* Manu */ [5, 6, 0],
  /* Raks */ [1, 0, 6],
];

// Nadi per nakshatra: pattern repeats every 6. 0 Adi 1 Madhya 2 Antya
const NADI_PATTERN = [0, 1, 2, 2, 1, 0];
const NADI_NAME = ["Adi", "Madhya", "Antya"];

/** The Nadi a nakshatra belongs to. Exported so the deep-match layer asks the
 *  same table rather than keeping a second copy that can drift out of step. */
export function nadiOf(nakIndex: number): string {
  return NADI_NAME[NADI_PATTERN[nakIndex % 6]];
}

// Planetary natural relationships for Graha Maitri.
const FRIENDS: Record<string, string[]> = {
  Sun: ["Moon", "Mars", "Jupiter"],
  Moon: ["Sun", "Mercury"],
  Mars: ["Sun", "Moon", "Jupiter"],
  Mercury: ["Sun", "Venus"],
  Jupiter: ["Sun", "Moon", "Mars"],
  Venus: ["Mercury", "Saturn"],
  Saturn: ["Mercury", "Venus"],
};
const ENEMIES: Record<string, string[]> = {
  Sun: ["Venus", "Saturn"],
  Moon: [],
  Mars: ["Mercury"],
  Mercury: ["Moon"],
  Jupiter: ["Mercury", "Venus"],
  Venus: ["Sun", "Moon"],
  Saturn: ["Sun", "Moon", "Mars"],
};
function relation(a: string, b: string): "friend" | "neutral" | "enemy" {
  if (FRIENDS[a]?.includes(b)) return "friend";
  if (ENEMIES[a]?.includes(b)) return "enemy";
  return "neutral";
}
function grahaMaitriScore(lordA: string, lordB: string): number {
  if (lordA === lordB) return 5;
  const r1 = relation(lordA, lordB), r2 = relation(lordB, lordA);
  const key = [r1, r2].sort().join("-");
  const table: Record<string, number> = {
    "friend-friend": 5,
    "friend-neutral": 4,
    "neutral-neutral": 3,
    "enemy-friend": 1,
    "enemy-neutral": 0.5,
    "enemy-enemy": 0,
  };
  return table[key] ?? 3;
}

// Tara: count nakshatras between the two; remainder 3,5,7 are inauspicious.
function taraOne(from: number, to: number): boolean {
  const count = ((to - from + 27) % 27) + 1;
  const rem = count % 9;
  return ![3, 5, 7].includes(rem); // true = auspicious
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------
export interface Koota {
  name: string; max: number; score: number; boy: string; girl: string; note: string;
  /** True where our scoring is a documented simplification of the classical
   *  table, so the UI can flag it instead of implying false precision. */
  approximate?: boolean;
}
export interface MatchResult {
  boy: PersonMoon;
  girl: PersonMoon;
  kootas: Koota[];
  total: number;
  max: number;
  percent: number;
  verdict: string;
  doshas: {
    mangal: string; bhakoot: string; nadi: string;
    /** Computed verdicts — never re-derive these from the text, which is translated. */
    mangalClear: boolean; bhakootClear: boolean; nadiClear: boolean;
  };
}

export function matchKundli(boy: PersonMoon, girl: PersonMoon): MatchResult {
  const kootas: Koota[] = [];

  // 1) Varna
  const vScore = VARNA[boy.signIndex] >= VARNA[girl.signIndex] ? 1 : 0;
  kootas.push({
    name: "Varna", max: 1, score: vScore,
    boy: VARNA_NAME[VARNA[boy.signIndex]], girl: VARNA_NAME[VARNA[girl.signIndex]],
    note: vScore ? "Work/ego compatibility is supported." : "Groom's varna is lower than bride's.",
  });

  // 2) Vashya
  const boyVashya = vashyaGroupOf(boy.moonLongitude);
  const girlVashya = vashyaGroupOf(girl.moonLongitude);
  const vaScore = VASHYA_MATRIX[boyVashya][girlVashya];
  kootas.push({
    name: "Vashya", max: 2, score: vaScore,
    boy: VASHYA_NAME[boyVashya], girl: VASHYA_NAME[girlVashya],
    note: vaScore >= 2 ? "Strong mutual attraction & influence." : vaScore >= 1 ? "Moderate mutual control." : "Low mutual influence.",
  });

  // 3) Tara
  const t1 = taraOne(boy.nakIndex, girl.nakIndex);
  const t2 = taraOne(girl.nakIndex, boy.nakIndex);
  const tScore = (t1 ? 1.5 : 0) + (t2 ? 1.5 : 0);
  kootas.push({
    name: "Tara", max: 3, score: tScore,
    boy: boy.nakshatra, girl: girl.nakshatra,
    note: tScore === 3 ? "Health & destiny well-aligned." : tScore >= 1.5 ? "Partly favourable for well-being." : "Star compatibility is weak.",
  });

  // 4) Yoni
  const yoni = yoniScore(YONI_OF_NAK[boy.nakIndex], YONI_OF_NAK[girl.nakIndex]);
  const yScore = yoni.score;
  kootas.push({
    name: "Yoni", max: 4, score: yScore,
    boy: YONI_NAME[YONI_OF_NAK[boy.nakIndex]], girl: YONI_NAME[YONI_OF_NAK[girl.nakIndex]],
    approximate: yoni.simplified,
    note: yScore === 4 ? "Excellent physical & intimate compatibility."
      : yScore === 0 ? "Conflicting temperaments (enemy yoni)."
      : "Reasonable intimate compatibility. These two yonis are neither the same nor traditional enemies, and sources differ on the exact points here — we score the middle, so this koota may read 1 point different elsewhere.",
  });

  // 5) Graha Maitri
  const gmScore = grahaMaitriScore(boy.rasiLord, girl.rasiLord);
  kootas.push({
    name: "Graha Maitri", max: 5, score: gmScore,
    boy: boy.rasiLord, girl: girl.rasiLord,
    note: gmScore >= 4 ? "Mental & emotional bonding is strong." : gmScore >= 3 ? "Friendship is workable." : "Mental wavelengths differ.",
  });

  // 6) Gana
  const ganaScore = GANA_MATRIX[GANA_OF_NAK[boy.nakIndex]][GANA_OF_NAK[girl.nakIndex]];
  kootas.push({
    name: "Gana", max: 6, score: ganaScore,
    boy: GANA_NAME[GANA_OF_NAK[boy.nakIndex]], girl: GANA_NAME[GANA_OF_NAK[girl.nakIndex]],
    note: ganaScore >= 5 ? "Temperaments match well." : ganaScore >= 1 ? "Some temperament differences." : "Strong temperament clash.",
  });

  // 7) Bhakoot (rasi distance). 6-8, 2-12, 5-9 => 0 (Bhakoot dosha) unless cancelled.
  const d1 = ((girl.signIndex - boy.signIndex + 12) % 12) + 1;
  const d2 = ((boy.signIndex - girl.signIndex + 12) % 12) + 1;
  const pair = [d1, d2].sort((a, b) => a - b).join("-");
  const badBhakoot = ["6-8", "2-12", "5-9"].includes(pair);
  // Cancellation: same rasi lord, or lords are mutual friends.
  const lordsFriendly = boy.rasiLord === girl.rasiLord ||
    (FRIENDS[boy.rasiLord]?.includes(girl.rasiLord) && FRIENDS[girl.rasiLord]?.includes(boy.rasiLord));
  const bhakootCancelled = badBhakoot && lordsFriendly;
  /*
   * The cancellation softens the DOSHA; it does not hand back the 7 points.
   *
   * This used to score a cancelled Bhakoot as a full 7, which put totals up to
   * seven points above what ProKerala — and the classical table — give: a
   * couple ProKerala scores 21/36 read here as 27, "very good" instead of
   * "good". Across nine measured couples, 0-on-a-bad-distance matched every
   * one. The cancellation is still reported, in the note and in the dosha.
   */
  const bhScore = badBhakoot ? 0 : 7;
  kootas.push({
    name: "Bhakoot", max: 7, score: bhScore,
    boy: boy.rasi, girl: girl.rasi,
    note: !badBhakoot
      ? "Prosperity & family welfare supported."
      : bhakootCancelled
        ? `Bhakoot dosha (${pair}), softened because the Moon-sign lords are friendly.`
        : `Bhakoot dosha (${pair}) — affects finances/health.`,
  });

  // 8) Nadi. Same nadi => 0 (Nadi dosha) unless same nakshatra (exception).
  const nadiB = NADI_PATTERN[boy.nakIndex % 6], nadiG = NADI_PATTERN[girl.nakIndex % 6];
  const sameNadi = nadiB === nadiG;
  const nadiException = sameNadi && boy.nakIndex === girl.nakIndex && boy.signIndex !== girl.signIndex;
  const nadiScore = !sameNadi || nadiException ? 8 : 0;
  kootas.push({
    name: "Nadi", max: 8, score: nadiScore,
    boy: NADI_NAME[nadiB], girl: NADI_NAME[nadiG],
    note: nadiScore === 8 ? (nadiException ? "Nadi dosha cancelled (same star, different rasi)." : "Genetic/progeny compatibility is good.") : "Nadi dosha — important for health & progeny.",
  });

  const total = Number(kootas.reduce((s, k) => s + k.score, 0).toFixed(1));
  const max = 36;
  const percent = Math.round((total / max) * 100);

  let verdict: string;
  if (total >= 28) verdict = "Excellent match";
  else if (total >= 24) verdict = "Very good match";
  else if (total >= 18) verdict = "Good — acceptable match";
  else if (total >= 14) verdict = "Average — needs consideration";
  else verdict = "Low — careful thought advised";

  // Mangal dosha verdict (both manglik cancels).
  let mangal: string;
  if (boy.manglik && girl.manglik) mangal = "Both are Manglik — the dosha is mutually cancelled (compatible).";
  else if (boy.manglik) mangal = "Groom is Manglik, bride is not — remedies advised before marriage.";
  else if (girl.manglik) mangal = "Bride is Manglik, groom is not — remedies advised before marriage.";
  else mangal = "Neither is Manglik — no Mangal dosha.";

  // The score and the dosha are two different questions now: a cancelled
  // Bhakoot still scores 0 (the classical table), but as a DOSHA it is softened
  // and should not be shown as a live danger.
  const bhakoot = !badBhakoot
    ? "No Bhakoot dosha."
    : bhakootCancelled
      ? `Bhakoot dosha present (${pair}), but cancelled — the Moon-sign lords are friendly.`
      : `Bhakoot dosha present (${pair}).`;
  const nadi = nadiScore === 8 ? "No Nadi dosha." : "Nadi dosha present.";

  // `clear` is decided HERE, from the scores, and shipped alongside the text.
  // The UI used to infer it by regex-matching English words ("no", "cancel") in
  // this sentence — so a perfectly clean match rendered three red danger icons
  // the moment the text came back in Hindi, on a marriage-compatibility screen.
  return {
    boy, girl, kootas, total, max, percent, verdict,
    doshas: {
      mangal, bhakoot, nadi,
      mangalClear: !(boy.manglik !== girl.manglik),
      bhakootClear: !badBhakoot || bhakootCancelled,
      nadiClear: nadiScore === 8,
    },
  };
}
