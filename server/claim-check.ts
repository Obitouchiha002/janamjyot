/**
 * Does a reading say something about the birth chart that is not true?
 *
 * An audit of generated reports found one "<planet> in the Nth house" claim in
 * five was false. None were invented — every one was a real number read from
 * the wrong chart: D10's "Sun, 6th house" written up as if it were the birth
 * chart. The packet now labels every divisional house as its own, which is the
 * prevention. This is the check, so a report that still slips is caught before
 * a person reads it rather than after they compare it with another app.
 *
 * Deliberately conservative: it only flags a claim it is sure about. A clause
 * that names D9/D10/a transit/a lordship/"from the Moon" is not a birth-chart
 * placement claim and is left alone, and a number that is true of the current
 * TRANSIT is not called a lie. A checker that cries wolf gets ignored, or
 * worse, "fixes" a sentence that was right.
 */

const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
const ALIASES: Record<string, string> = {
  surya: "Sun", chandra: "Moon", mangal: "Mars", budh: "Mercury",
  guru: "Jupiter", brihaspati: "Jupiter", shukra: "Venus", shani: "Saturn",
};
const PLANET_RE = new RegExp(`\\b(${[...PLANETS, ...Object.keys(ALIASES)].join("|")})\\b`, "gi");
const HOUSE_RE = /\b(\d{1,2})(?:st|nd|rd|th|va|vein|ve)?\s*(?:house|bhav|bhaav|भाव)/gi;

export interface WrongPlacement {
  planet: string;
  said: number;
  actual: number;
  excerpt: string;
}

function canonical(raw: string): string {
  const k = raw.toLowerCase();
  return ALIASES[k] ?? raw[0].toUpperCase() + raw.slice(1).toLowerCase();
}

/**
 * Every birth-chart placement claim in `text` that contradicts the chart.
 * `transitHouses` (planet → house from lagna, now) excuses a true-but-unlabelled
 * transit reference.
 */
export function wrongPlacements(
  text: string,
  chart: any,
  transitHouses: Record<string, number> = {},
): WrongPlacement[] {
  const truth: Record<string, number> = {};
  for (const p of chart?.planet_positions ?? []) truth[p.planet] = Number(p.house);

  const out: WrongPlacement[] = [];
  for (const m of text.matchAll(HOUSE_RE)) {
    const said = Number(m[1]);
    if (!said || said > 12) continue;
    const at = m.index ?? 0;
    const around = text.slice(Math.max(0, at - 70), at + m[0].length + 25).toLowerCase();
    if (/transit|gochar|guzar|moving through/.test(around)) continue;
    if (/\bd(9|10|6|11|60)\b|navamsa|navamsha|dasamsa|dashamsa|varga/.test(around)) continue;
    if (/lord|swami|svami|adhipati|स्वामी|ruler/.test(around)) continue;
    if (/from (the )?moon|chandra se|moon se/.test(around)) continue;

    // The planet named nearest before the house, within the same clause.
    const clause = text.slice(Math.max(0, at - 45), at).split(/[.;,।!?\n]/).pop() ?? "";
    const names = [...clause.matchAll(PLANET_RE)];
    if (!names.length) continue;
    const planet = canonical(names[names.length - 1][1]);
    const actual = truth[planet];
    if (!actual || actual === said) continue;
    if (transitHouses[planet] === said) continue;
    out.push({
      planet, said, actual,
      excerpt: text.slice(Math.max(0, at - 40), at + m[0].length).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

/** The correction a regeneration is sent, naming exactly what was wrong. */
export function correctionNote(wrong: WrongPlacement[]): string {
  const uniq = new Map<string, WrongPlacement>();
  for (const w of wrong) uniq.set(`${w.planet}:${w.said}`, w);
  const lines = [...uniq.values()].map(
    (w) => `- You wrote ${w.planet} in the ${w.said} house. In the BIRTH CHART it is in the ${w.actual} house.`,
  );
  return (
    "\n\nCORRECTION — your previous draft stated birth-chart placements that are false:\n" +
    lines.join("\n") +
    "\nThose numbers came from a divisional chart or a transit. Every plain \"Nth house\" you write must " +
    "match birth_chart_facts. If you mean a D9/D10 or transit placement, say so in the same sentence. " +
    "Rewrite the whole reading with this fixed.\n"
  );
}
