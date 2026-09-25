/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Self-contained rules — no JanamJyot module is changed by this file. */
/**
 * "Wo kaun tha?" — what a chart can honestly say about a past or present connection.
 *
 * The user asked the app who their past connection was, and got nothing. A chart cannot
 * name a person or their gender, and pretending otherwise is a lie. What it CAN say,
 * classically, is:
 *   - the kind of bond the period was lighting up (romance, friendship, family, work),
 *   - the temperament of that person, from the sign on the house and its lord,
 *   - whether they were older, younger or about the same age (from the lord's nature),
 *   - where and how the meeting is likely to have happened (from the lord's house),
 *   - which past years actually carried that connection (from the period profile).
 *
 * Everything here is derived, and the `cannot_say` line keeps the reply honest.
 */

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
const SIGN_NATURE: Record<string, string> = {
  Aries: "tez, seedha bolne wala, jaldi decide karne wala",
  Taurus: "shaant, sundarta pasand, thoda zidd wala",
  Gemini: "baaton wala, chanchal, dimaag tez",
  Cancer: "bhavuk, ghar se juda, dhyan rakhne wala",
  Leo: "aatmvishwasi, dikhne mein aakarshak, thoda ego wala",
  Virgo: "samajhdar, detail dekhne wala, halka critical",
  Libra: "milansaar, sundar, sabko khush rakhne wali aadat",
  Scorpio: "gehra, apni baat chhupane wala, bahut intense",
  Sagittarius: "khula vichaar, ghoomne wala, seedha bolne wala",
  Capricorn: "practical, mehnati, jazbaat kam dikhata hai",
  Aquarius: "alag soch, dosti wala, thoda door-door",
  Pisces: "narm dil, sapne dekhne wala, jaldi ghul-mil jaata hai",
};
/** How old they are likely to be, from the nature of the house lord. */
const AGE_BY_LORD: Record<string, string> = {
  Sun: "aapse bada ya zyada mature",
  Saturn: "aapse kaafi bada, ya umar se zyada gambhir",
  Jupiter: "aapse bada ya padha-likha, guru jaisa",
  Mars: "lagbhag aapki umar ka, energy wala",
  Venus: "lagbhag aapki umar ka ya thoda chhota",
  Mercury: "aapse chhota ya umar se kam lagne wala",
  Moon: "aapse chhota ya bahut bhavuk",
  Rahu: "umar ka fark saaf ho sakta hai, ya background bilkul alag",
  Ketu: "alag duniya ka, thoda door-door rehne wala",
};
/** Where the meeting is likely to have come from, by the house the lord sits in. */
const MET_BY_HOUSE: Record<number, string> = {
  1: "aas-paas hi, roz ke maahaul mein",
  2: "parivaar ya jaan-pehchaan ke zariye",
  3: "aas-padosh, bhai-behen ke dost, ya phone/online baat se",
  4: "ghar, mohalle ya school se",
  5: "college, function, ya kisi shauk (music, sports, art) ke zariye",
  6: "kaam ki jagah, roz ke routine ya kisi seva ke kaam se",
  7: "logon se milne-julne, business ya kisi public jagah se",
  8: "achanak, ya aise rishte se jo shuru se chhupa raha",
  9: "padhai, guru, ya ghar se door safar mein",
  10: "kaam/career ki jagah se",
  11: "doston ke group ya kisi bade circle se",
  12: "door se, online, ya aise jagah jahan doosre na dekh sakein",
};
const HOUSE_BOND: Record<number, string> = {
  3: "dosti jaisa rishta", 4: "ghar-parivaar wala rishta", 5: "prem ya bachchon jaisa lagav",
  7: "partner jaisa rishta", 11: "doston ke group wala rishta",
};

export interface PersonSketch {
  about: string;
  nature: string;
  age_hint: string;
  how_met: string;
  based_on: string;
}
export interface ConnectionFacts {
  love: PersonSketch | null;
  marriage: PersonSketch | null;
  /** Past stretches when a bond was actually live, with the kind of bond. */
  past_windows: Array<{ years: string; period: string; bond: string }>;
  cannot_say: string;
}

export function connectionFacts(chart: any, facts: any, periods: any[] | null): ConnectionFacts | null {
  const lagnaIdx = SIGNS.indexOf(facts?.lagna ?? chart?.d1_chart?.ascendant_sign ?? "");
  if (lagnaIdx < 0) return null;
  const byName = new Map<string, any>((facts?.planets ?? []).map((p: any) => [p.planet, p]));
  const signOf = (h: number) => SIGNS[(lagnaIdx + h - 1) % 12];
  const lordOf = (h: number) => SIGN_LORDS[(lagnaIdx + h - 1) % 12];
  const houseOf = (p: string) => Number(byName.get(p)?.house ?? 0);

  const sketch = (house: number, about: string): PersonSketch => {
    const lord = lordOf(house);
    const lordHouse = houseOf(lord);
    return {
      about,
      nature: SIGN_NATURE[signOf(house)] ?? "",
      age_hint: AGE_BY_LORD[lord] ?? "",
      how_met: MET_BY_HOUSE[lordHouse] ?? "",
      based_on: `${house}th house ${signOf(house)} mein hai, uska swami ${lord} ${lordHouse}th house mein hai.`,
    };
  };

  // Past years that actually carried a bond, from the same period profile the rest of the
  // app uses — so "kab tha" and "kaisa tha" agree.
  const past_windows: ConnectionFacts["past_windows"] = [];
  for (const row of periods ?? []) {
    if (row.when !== "past") continue;
    const lit = [...(row.strong_for ?? []), ...(row.good_for ?? [])];
    const bonds: string[] = [];
    if (lit.includes("love")) bonds.push(HOUSE_BOND[5]);
    if (lit.includes("marriage")) bonds.push(HOUSE_BOND[7]);
    if (!bonds.length) continue;
    past_windows.push({
      years: `${String(row.from).slice(0, 7)} – ${String(row.to).slice(0, 7)}`,
      period: row.period,
      bond: bonds.join(" / "),
    });
  }

  return {
    love: sketch(5, "prem / aakarshan wala rishta"),
    marriage: sketch(7, "jeevansathi ya lamba chalne wala rishta"),
    past_windows: past_windows.slice(-4),
    cannot_say:
      "Kundli kisi ka naam, chehra ya gender nahi batati, aur na hi ye ki wo bachcha tha ya bada. " +
      "Wo sirf rishte ka TYPE (prem, dosti, ghar, kaam), samne wale ka swabhav, umar ka andaza aur milne ki jagah bata sakti hai. " +
      "Isse aage jaana ho to unki apni janm details chahiye.",
  };
}
