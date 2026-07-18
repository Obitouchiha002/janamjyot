/**
 * Yoga detection — scans a normalized chart for classical Vedic yogas.
 * Original computation (no external API). Detects the well-defined yogas:
 * Gaja Kesari, Budha-Aditya, Chandra-Mangal, the 5 Pancha Mahapurusha yogas,
 * Sunapha/Anapha/Durudhara, Kemadruma, basic Raj Yoga & Dhana Yoga.
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
      break;
    }
  }

  // Basic Dhana Yoga — 2nd lord and 11th lord together (wealth).
  const l2 = lordOfHouse(2), l11 = lordOfHouse(11);
  if (l2 && l11 && houseOf(l2) && houseOf(l2) === houseOf(l11)) {
    add("Dhana Yoga", true, [l2, l11], `The 2nd lord (${l2}) and 11th lord (${l11}) combine — strong potential for accumulating wealth and steady gains.`);
  }

  const present = out.filter((y) => y.present);
  return { yogas: present, count: present.length };
}
