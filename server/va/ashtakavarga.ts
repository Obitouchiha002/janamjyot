/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * Ashtakavarga — Bhinnashtakavarga (per planet) + Sarvashtakavarga (total bindus
 * per sign). Uses the classical Parashari benefic-point tables (the standard set
 * whose grand total is 337 bindus). Great for a "sign strength" bar chart.
 */
const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const PLANETS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
// reference order for every table: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Lagna
const BENEFIC: Record<string, number[][]> = {
  Sun: [[1, 2, 4, 7, 8, 9, 10, 11], [3, 6, 10, 11], [1, 2, 4, 7, 8, 9, 10, 11], [3, 5, 6, 9, 10, 11, 12], [5, 6, 9, 11], [6, 7, 12], [1, 2, 4, 7, 8, 9, 10, 11], [3, 4, 6, 10, 11, 12]],
  Moon: [[3, 6, 7, 8, 10, 11], [1, 3, 6, 7, 10, 11], [2, 3, 5, 6, 9, 10, 11], [1, 3, 4, 5, 7, 8, 10, 11], [1, 4, 7, 8, 10, 11, 12], [3, 4, 5, 7, 9, 10, 11], [3, 5, 6, 11], [3, 6, 10, 11]],
  Mars: [[3, 5, 6, 10, 11], [3, 6, 11], [1, 2, 4, 7, 8, 10, 11], [3, 5, 6, 11], [6, 10, 11, 12], [6, 8, 11, 12], [1, 4, 7, 8, 9, 10, 11], [1, 3, 6, 10, 11]],
  Mercury: [[5, 6, 9, 11, 12], [2, 4, 6, 8, 10, 11], [1, 2, 4, 7, 8, 9, 10, 11], [1, 3, 5, 6, 9, 10, 11, 12], [6, 8, 11, 12], [1, 2, 3, 4, 5, 8, 9, 11], [1, 2, 4, 7, 8, 9, 10, 11], [1, 2, 4, 6, 8, 10, 11]],
  Jupiter: [[1, 2, 3, 4, 7, 8, 9, 10, 11], [2, 5, 7, 9, 11], [1, 2, 4, 7, 8, 10, 11], [1, 2, 4, 5, 6, 9, 10, 11], [1, 2, 3, 4, 7, 8, 10, 11], [2, 5, 6, 9, 10, 11], [3, 5, 6, 12], [1, 2, 4, 5, 6, 7, 9, 10, 11]],
  Venus: [[8, 11, 12], [1, 2, 3, 4, 5, 8, 9, 11, 12], [3, 5, 6, 9, 11, 12], [3, 5, 6, 9, 11], [5, 8, 9, 10, 11], [1, 2, 3, 4, 5, 8, 9, 10, 11], [3, 4, 5, 8, 9, 10, 11], [1, 2, 3, 4, 5, 8, 9, 11]],
  Saturn: [[1, 2, 4, 7, 8, 10, 11], [3, 6, 11], [3, 5, 6, 10, 11, 12], [6, 8, 9, 10, 11, 12], [5, 6, 11, 12], [6, 11, 12], [3, 5, 6, 11], [1, 3, 4, 6, 10, 11]],
};

export function computeAshtakavarga(chart: any) {
  const planets: any[] = chart?.planet_positions ?? [];
  const signOf = (n: string) => planets.find((p) => p.planet === n)?.sign_id ?? -1;
  // ascendant.sign_id isn't in the legacy alias — derive from the sign NAME.
  const ascName = chart?.ascendant?.sign ?? chart?.d1_chart?.ascendant_sign ?? "";
  const ascIdx = SIGNS.indexOf(ascName) >= 0 ? SIGNS.indexOf(ascName) : 0;
  const refSign = (i: number) => (i < 7 ? signOf(PLANETS[i]) : ascIdx); // 0-6 planets, 7 = Lagna

  const bav: Record<string, number[]> = {};
  const sav = new Array(12).fill(0);

  for (const pl of PLANETS) {
    const counts = new Array(12).fill(0);
    BENEFIC[pl].forEach((houses, refIdx) => {
      const rs = refSign(refIdx);
      if (rs < 0) return;
      for (const h of houses) counts[(rs + h - 1) % 12]++;
    });
    bav[pl] = counts;
    for (let s = 0; s < 12; s++) sav[s] += counts[s];
  }

  const savBySign = SIGNS.map((sign, i) => ({ sign, bindus: sav[i] }));
  const bavTotals = PLANETS.map((pl) => ({ planet: pl, total: bav[pl].reduce((a, b) => a + b, 0) }));

  return {
    signs: SIGNS,
    sav: savBySign,                 // [{sign, bindus}] — for the bar chart
    savTotal: sav.reduce((a, b) => a + b, 0), // 337
    bav,                            // {planet: number[12]}
    bavTotals,                      // [{planet, total}]
    ascendant_sign: SIGNS[ascIdx],
  };
}
