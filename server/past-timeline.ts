/**
 * What already happened — the part of a reading a person can check.
 *
 * A forecast is unfalsifiable at the moment you read it, so it earns no trust.
 * The past is the opposite: if the report says a hard stretch ran from 2016 to
 * 2018 in work, and it did, the next sentence about 2027 is worth reading. If
 * it says something that plainly did not happen, that is worth knowing too.
 * This module builds the spine of that section — real dasha spans with real
 * dates — so the model is never inventing WHEN, only interpreting what a
 * period of that kind tends to bring.
 *
 * Deliberately short. The whole timeline is a handful of periods, not a list of
 * every antardasha since birth: sixty rows of "a mixed time" is not a test
 * anybody can apply to their own life.
 */

/** Houses whose lords mark a life event people actually remember. */
const THEME_HOUSES: Record<number, string> = {
  2: "money & family",
  4: "home & mother",
  5: "children & study",
  6: "health & work pressure",
  7: "marriage & partnership",
  9: "luck, father & travel",
  10: "career",
  11: "income & gains",
  12: "loss, foreign & expense",
};

/** Planets that mark a turning point whatever they rule. */
const HEAVY = new Set(["Saturn", "Rahu", "Ketu", "Jupiter"]);

export interface PastPeriod {
  period: string;      // "Venus-Saturn"
  maha: string;
  antar: string;
  from: string;        // YYYY-MM-DD
  to: string;
  age_from: number;
  age_to: number;
  /** Which areas this period's lords actually touch in THIS chart. */
  themes: string[];
  /** House numbers the antardasha lord rules and occupies. */
  rules: number[];
  sits_in: number | null;
}

const ms = (d: string) => new Date(`${String(d).slice(0, 10)}T00:00:00`).getTime();
const YEAR = 365.25 * 24 * 3600 * 1000;

/**
 * The past periods worth putting in front of someone.
 *
 * Ranked, not truncated: taking the first N would return a run of childhood
 * sub-periods and stop before the years they remember best. Significance is
 * whether the period's lord actually governs a life area in THIS chart, how
 * long it ran, and whether it is one of the four planets that mark turning
 * points regardless.
 */
export function pastMilestones(chart: any, max = 7): PastPeriod[] {
  const rows: any[] = chart?.dasha?.antardasha ?? [];
  const houses: any[] = chart?.d1_chart?.houses ?? [];
  const planets: any[] = chart?.planet_positions ?? [];
  const dob = ms(chart?.birth_details?.date_of_birth ?? "");
  if (!rows.length || !Number.isFinite(dob)) return [];

  const now = Date.now();
  /** Every house a planet rules in this chart (a planet can rule two). */
  const rulesOf = (planet: string) =>
    houses.filter((h) => h.sign_lord === planet).map((h) => h.house);
  const houseOf = (planet: string) => {
    const p = planets.find((x: any) => x.planet === planet);
    return p && Number.isFinite(p.house) ? Number(p.house) : null;
  };

  const scored = rows
    .map((a) => {
      const from = ms(a.from), to = ms(a.to);
      const ageFrom = (from - dob) / YEAR;
      const ageTo = (to - dob) / YEAR;
      return { a, from, to, ageFrom, ageTo };
    })
    // Ended, and late enough that the person was living a life they can check.
    // The period must START at fourteen or later, not merely end there: a span
    // running from twelve to fifteen was being described as a first job, which
    // is not something a twelve-year-old can confirm or deny.
    .filter((x) => Number.isFinite(x.from) && x.to < now && x.ageFrom >= 14)
    .map((x) => {
      const antar = x.a.lord;
      const rules = rulesOf(antar);
      const sits = houseOf(antar);
      const themes = Array.from(new Set(
        [...rules, ...(sits ? [sits] : [])].map((h) => THEME_HOUSES[h]).filter(Boolean) as string[],
      ));
      const years = (x.to - x.from) / YEAR;
      let score = themes.length * 2 + Math.min(years, 3);
      if (HEAVY.has(antar)) score += 2;
      if (HEAVY.has(x.a.mahadasha)) score += 1;
      // Recent history is checkable; 1998 mostly is not.
      const yearsAgo = (now - x.to) / YEAR;
      score += Math.max(0, 3 - yearsAgo / 8);
      return {
        score,
        row: {
          period: x.a.label ?? `${x.a.mahadasha}-${antar}`,
          maha: x.a.mahadasha,
          antar,
          from: String(x.a.from).slice(0, 10),
          to: String(x.a.to).slice(0, 10),
          age_from: Math.max(0, Math.floor(x.ageFrom)),
          age_to: Math.max(0, Math.floor(x.ageTo)),
          themes,
          rules,
          sits_in: sits,
        } as PastPeriod,
      };
    });

  if (!scored.length) return [];

  /*
   * Spread across the years rather than clustered.
   *
   * Scoring alone returned five sub-periods of one mahadasha — technically the
   * most significant, and useless as a test of accuracy, because they all
   * describe the same two or three years of someone's life.
   */
  const picked: PastPeriod[] = [];
  for (const cand of [...scored].sort((a, b) => b.score - a.score)) {
    const tooClose = picked.some(
      (p) => Math.abs(ms(p.from) - ms(cand.row.from)) < 2 * YEAR,
    );
    if (tooClose) continue;
    picked.push(cand.row);
    if (picked.length >= max) break;
  }
  return picked.sort((a, b) => (a.from < b.from ? -1 : 1));
}


/**
 * The periods someone lived through in the last `years` — for a chat question
 * about the past ("pichhle 5 saal mushkil kyun the?").
 *
 * The chat already hands the model the computed facts for "today" and
 * "tomorrow", and it answered those well. It had nothing equivalent for the
 * past, so "why were the last five years hard" came back as "it was a time of
 * pressure" — the question restated, with no years and no reason, every time.
 * The periods are in the chart; this puts the relevant ones where the model
 * cannot miss them, with dates and the life areas each period's lord actually
 * governs in THIS chart.
 */
export function recentPastPeriods(chart: any, years = 5): Array<{
  period: string; from: string; to: string; lord_rules: string[]; lord_sits_in: string | null;
}> {
  const rows: any[] = chart?.dasha?.antardasha ?? [];
  const houses: any[] = chart?.d1_chart?.houses ?? [];
  const planets: any[] = chart?.planet_positions ?? [];
  const now = Date.now();
  const since = now - years * YEAR;
  const area = (h: number) => THEME_HOUSES[h] ?? (h === 1 ? "self & health" : h === 3 ? "effort & siblings" : h === 8 ? "sudden change & hidden matters" : `house ${h}`);
  return rows
    .filter((a) => ms(a.to) > since && ms(a.from) < now)
    .map((a) => {
      const rules = houses.filter((h) => h.sign_lord === a.lord).map((h) => h.house);
      const sits = planets.find((p: any) => p.planet === a.lord)?.house;
      return {
        period: a.label ?? `${a.mahadasha}-${a.lord}`,
        from: String(a.from).slice(0, 10),
        to: String(a.to).slice(0, 10),
        lord_rules: rules.map(area),
        lord_sits_in: sits ? area(Number(sits)) : null,
      };
    });
}
