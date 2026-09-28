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
  Aries: "quick, direct in speech, decides fast",
  Taurus: "calm, drawn to beauty, a little stubborn",
  Gemini: "talkative, restless, quick-minded",
  Cancer: "emotional, attached to home, caring",
  Leo: "confident, striking to look at, a little ego",
  Virgo: "sensible, notices detail, mildly critical",
  Libra: "sociable, attractive, tries to keep everyone happy",
  Scorpio: "deep, keeps things to themselves, very intense",
  Sagittarius: "open-minded, loves to travel, speaks plainly",
  Capricorn: "practical, hard-working, shows little emotion",
  Aquarius: "thinks differently, friendly, keeps some distance",
  Pisces: "soft-hearted, dreamy, warms to people quickly",
};
/** How old they are likely to be, from the nature of the house lord. */
const AGE_BY_LORD: Record<string, string> = {
  Sun: "older than you, or more mature",
  Saturn: "considerably older than you, or serious beyond their years",
  Jupiter: "older or better educated, teacher-like",
  Mars: "about your age, full of energy",
  Venus: "about your age or slightly younger",
  Mercury: "younger than you, or looks younger than they are",
  Moon: "younger than you, or very emotional",
  Rahu: "the age gap may be obvious, or the background entirely different",
  Ketu: "from a different world, keeps some distance",
};
/** Where the meeting is likely to have come from, by the house the lord sits in. */
const MET_BY_HOUSE: Record<number, string> = {
  1: "close by, in your everyday surroundings",
  2: "through family or people you already know",
  3: "the neighbourhood, a sibling's friends, or talking online",
  4: "home, the neighbourhood or school",
  5: "college, an event, or a shared interest — music, sport, art",
  6: "the workplace, daily routine, or service work",
  7: "meeting people, business, or somewhere public",
  8: "suddenly, or through a bond that stayed hidden from the start",
  9: "study, a teacher, or travel far from home",
  10: "through work or career",
  11: "a group of friends or a wider circle",
  12: "from far away, online, or somewhere others could not see",
};
const HOUSE_BOND: Record<number, string> = {
  3: "a friendship", 4: "a family-like bond", 5: "love, or an attachment like one has to a child",
  7: "a partnership", 11: "a bond within a group of friends",
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
      based_on: `The ${house}th house is ${signOf(house)}, and its lord ${lord} sits in the ${lordHouse}th house.`,
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
    love: sketch(5, "a love or attraction"),
    marriage: sketch(7, "a life partner, or a bond meant to last"),
    past_windows: past_windows.slice(-4),
    cannot_say:
      "A chart never gives a name, a face or a gender, and it cannot say whether the person was a child or an adult. " +
      "It can only give the KIND of bond (love, friendship, family, work), that person's temperament, a sense of their age, and where the meeting is likely to have come from. " +
      "To go further than that, their own birth details are needed.",
  };
}
