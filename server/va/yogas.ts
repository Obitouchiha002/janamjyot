/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * Yoga detection — scans a normalized chart for classical Vedic yogas.
 * Original computation (no external API). Detects the well-defined yogas:
 * Gaja Kesari, Budha-Aditya, Chandra-Mangal, the 5 Pancha Mahapurusha yogas,
 * Sunapha/Anapha/Durudhara, Kemadruma, Raj Yoga (kendra+trikona lords, yogakaraka),
 * Dharma-Karmadhipati, Parivartana, Viparita Raja, Neecha Bhanga Raja and Dhana Yoga.
 */

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
// own signs (sign indexes) per planet
const OWN: Record<string, number[]> = {
  Sun: [4], Moon: [3], Mars: [0, 7], Mercury: [2, 5], Jupiter: [8, 11], Venus: [1, 6], Saturn: [9, 10],
};
const EXALT: Record<string, number> = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
const MAHAPURUSHA: Record<string, string> = { Mars: "Ruchaka", Mercury: "Bhadra", Jupiter: "Hamsa", Venus: "Malavya", Saturn: "Sasa" };
const KENDRA = [1, 4, 7, 10];
const TRIKONA = [1, 5, 9];

export interface Yoga { name: string; present: boolean; planets: string[]; summary: string; }

export function detectYogas(chart: any): { yogas: Yoga[]; count: number } {
  const planets: any[] = chart?.planet_positions ?? [];
  const houses: any[] = chart?.d1_chart?.houses ?? [];
  const ascIdx = SIGNS.indexOf(chart?.ascendant?.sign ?? chart?.d1_chart?.ascendant_sign ?? "");
  const P = (n: string) => planets.find((p) => p.planet === n);
  const houseOf = (n: string) => P(n)?.house ?? 0;
  const signOf = (n: string) => P(n)?.sign_id ?? -1;
  const houseSignIdx = (h: number) => houses.find((x) => x.house === h)?.sign_id ?? -1;
  const lordOfHouse = (h: number) => { const s = houseSignIdx(h); return s >= 0 ? SIGN_LORDS[s] : ""; };
  // house number counted FROM the moon
  const moonSign = signOf("Moon");
  const houseFromMoon = (n: string) => { const s = signOf(n); return s >= 0 && moonSign >= 0 ? ((s - moonSign + 12) % 12) + 1 : 0; };

  const out: Yoga[] = [];
  const add = (name: string, present: boolean, planets: string[], summary: string) => out.push({ name, present, planets, summary });

  // Gaja Kesari — Jupiter in a kendra (1/4/7/10) from the Moon.
  const gk = KENDRA.includes(houseFromMoon("Jupiter"));
  if (gk) add("Gaja Kesari Yoga", true, ["Jupiter", "Moon"], "Jupiter sits in a kendra from your Moon — gives wisdom, respect, good reputation and lasting success.");

  // Budha-Aditya — Sun & Mercury in the same house.
  if (houseOf("Sun") && houseOf("Sun") === houseOf("Mercury")) add("Budha-Aditya Yoga", true, ["Sun", "Mercury"], "Sun and Mercury together — sharp intellect, good communication and analytical skill.");

  // Chandra-Mangal — Moon & Mars together (wealth through effort).
  if (houseOf("Moon") && houseOf("Moon") === houseOf("Mars")) add("Chandra-Mangal Yoga", true, ["Moon", "Mars"], "Moon with Mars — drive to earn; money through enterprise and bold action.");

  // Pancha Mahapurusha — Mars/Mercury/Jupiter/Venus/Saturn in own/exalted sign AND in a kendra.
  for (const pl of Object.keys(MAHAPURUSHA)) {
    const s = signOf(pl), h = houseOf(pl);
    const strong = s >= 0 && (OWN[pl]?.includes(s) || EXALT[pl] === s);
    if (strong && KENDRA.includes(h)) {
      add(`${MAHAPURUSHA[pl]} Yoga (Pancha Mahapurusha)`, true, [pl], `${pl} is powerful (own/exalted sign) in a kendra — a hallmark of a strong, successful personality.`);
    }
  }

  // Moon-based: Sunapha / Anapha / Durudhara / Kemadruma (planets other than Sun in 2nd/12th from Moon).
  const others = ["Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  const in2 = others.filter((p) => houseFromMoon(p) === 2);
  const in12 = others.filter((p) => houseFromMoon(p) === 12);
  if (in2.length && in12.length) add("Durudhara Yoga", true, [...in2, ...in12], "Planets flank the Moon on both sides — all-round comfort, balanced wealth and support.");
  else if (in2.length) add("Sunapha Yoga", true, in2, "Planets in the 2nd from the Moon — self-earned wealth and a sound mind.");
  else if (in12.length) add("Anapha Yoga", true, in12, "Planets in the 12th from the Moon — a pleasant, well-regarded and contented nature.");
  else {
    // Kemadruma — but apply the standard cancellations (then it does NOT apply):
    //  (a) a planet is conjunct the Moon, (b) the Moon is in a kendra from the
    //  Lagna, or (c) a benefic (Jupiter/Venus/Mercury) sits in a kendra from the Moon.
    const moonHouse = houseOf("Moon");
    const conjunct = others.some((p) => houseOf(p) === moonHouse);
    const moonInKendra = KENDRA.includes(((signOf("Moon") - ascIdx + 12) % 12) + 1);
    const beneficKendraFromMoon = ["Jupiter", "Venus", "Mercury"].some((p) => KENDRA.includes(houseFromMoon(p)));
    if (!conjunct && !moonInKendra && !beneficKendraFromMoon) {
      add("Kemadruma Yoga", true, ["Moon"], "The Moon is unsupported (no planets in the 2nd/12th from it, and uncancelled) — guard against ups-and-downs; strengthen the Moon with routine and calm.");
    }
  }

  // Basic Raj Yoga — a kendra lord and a trikona lord placed in the same house.
  const kendraLords = new Set(KENDRA.map(lordOfHouse));
  const trikonaLords = new Set(TRIKONA.map(lordOfHouse));
  for (const h of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    const here = planets.filter((p) => p.house === h).map((p) => p.planet);
    const hasK = here.find((p) => kendraLords.has(p));
    const hasT = here.find((p) => trikonaLords.has(p) && p !== hasK);
    if (hasK && hasT) {
      add("Raj Yoga", true, [hasK, hasT], `${hasK} and ${hasT} (a kendra lord and a trikona lord) join in house ${h} — a classic raja yoga giving rise in status, authority and success.`);
    }
  }

  // Yogakaraka: a single planet that rules BOTH a kendra (4/7/10) and a trikona (5/9),
  // e.g. Saturn for Taurus/Libra lagna, Mars for Cancer/Leo, Venus for Capricorn/Aquarius.
  // It is a raja yoga by itself (classically strongest when it is also well placed).
  for (const pl of ["Mars", "Venus", "Saturn"]) {
    const owned = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((h) => lordOfHouse(h) === pl);
    if (owned.some((h) => [4, 7, 10].includes(h)) && owned.some((h) => [5, 9].includes(h))) {
      add("Yogakaraka Raj Yoga", true, [pl], `${pl} rules both a kendra and a trikona (houses ${owned.join(" & ")}) for this lagna — it is the chart's yogakaraka, a built-in raja yoga that gives rise and success especially in its dasha.`);
    }
  }

  // Dharma-Karmadhipati Yoga — 9th lord and 10th lord together (or exchanging signs).
  const l9 = lordOfHouse(9), l10 = lordOfHouse(10);
  if (l9 && l10 && l9 !== l10) {
    const together = houseOf(l9) && houseOf(l9) === houseOf(l10);
    const exchange = signOf(l9) >= 0 && signOf(l10) >= 0 && SIGN_LORDS[signOf(l9)] === l10 && SIGN_LORDS[signOf(l10)] === l9;
    if (together || exchange) add("Dharma-Karmadhipati Yoga", true, [l9, l10], `The 9th lord (${l9}) and 10th lord (${l10}) are ${together ? "together" : "in sign exchange"} — luck and career work hand in hand; a strong yoga for status and meaningful work.`);
  }

  // Parivartana Yoga — two planets in each other's signs (mutual exchange).
  const seven = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
  for (let i = 0; i < seven.length; i++) {
    for (let j = i + 1; j < seven.length; j++) {
      const a = seven[i], b = seven[j];
      if (signOf(a) >= 0 && signOf(b) >= 0 && SIGN_LORDS[signOf(a)] === b && SIGN_LORDS[signOf(b)] === a) {
        add("Parivartana Yoga", true, [a, b], `${a} and ${b} sit in each other's signs (houses ${houseOf(a)} and ${houseOf(b)}) — the two houses become strongly linked and support each other.`);
      }
    }
  }

  // Viparita Raja Yoga — a lord of 6/8/12 placed in another of 6/8/12 (adversity turns into gain).
  for (const h of [6, 8, 12]) {
    const lord = lordOfHouse(h);
    const at = houseOf(lord);
    if (lord && [6, 8, 12].includes(at) && at !== h) {
      const name = h === 6 ? "Harsha" : h === 8 ? "Sarala" : "Vimala";
      add(`Viparita Raja Yoga (${name})`, true, [lord], `The ${h}th lord (${lord}) sits in the ${at}th house — obstacles tend to defeat themselves; rise after difficulties.`);
    }
  }

  // Neecha Bhanga Raja Yoga — a debilitated planet whose debilitation is cancelled. The
  // standard cancellations are: the lord of its debilitation sign, or of its exaltation
  // sign, sits in a kendra from the Lagna or the Moon; or the planet exalted in that same
  // sign is conjunct it.
  const DEBIL: Record<string, number> = { Sun: 6, Moon: 7, Mars: 3, Mercury: 11, Jupiter: 9, Venus: 5, Saturn: 0 };
  const EXALTED_IN = (signIdx: number) => Object.keys(EXALT).find((pl) => EXALT[pl] === signIdx);
  const kendraFrom = (pl: string, refSign: number) => { const s = signOf(pl); return s >= 0 && refSign >= 0 && KENDRA.includes(((s - refSign + 12) % 12) + 1); };
  for (const pl of seven) {
    if (signOf(pl) !== DEBIL[pl]) continue;
    const debLord = SIGN_LORDS[DEBIL[pl]];
    const exLord = SIGN_LORDS[EXALT[pl]];
    const why: string[] = [];
    if (kendraFrom(debLord, ascIdx) || kendraFrom(debLord, moonSign)) why.push(`${debLord} (lord of the debilitation sign) is in a kendra`);
    if (exLord !== debLord && (kendraFrom(exLord, ascIdx) || kendraFrom(exLord, moonSign))) why.push(`${exLord} (lord of its exaltation sign) is in a kendra`);
    const exaltedHere = EXALTED_IN(DEBIL[pl]);
    if (exaltedHere && houseOf(exaltedHere) === houseOf(pl)) why.push(`${exaltedHere}, exalted in the same sign, sits with it`);
    if (why.length) add("Neecha Bhanga Raja Yoga", true, [pl], `${pl} is debilitated in ${SIGNS[DEBIL[pl]]}, but the debilitation is cancelled: ${why.join("; ")}. Early struggle in its matters turns into strength and rise.`);
  }

  // Basic Dhana Yoga — 2nd lord and 11th lord together (wealth).
  const l2 = lordOfHouse(2), l11 = lordOfHouse(11);
  if (l2 && l11 && houseOf(l2) && houseOf(l2) === houseOf(l11)) {
    add("Dhana Yoga", true, [l2, l11], `The 2nd lord (${l2}) and 11th lord (${l11}) combine — strong potential for accumulating wealth and steady gains.`);
  }

  const present = out.filter((y) => y.present);
  return { yogas: present, count: present.length };
}
