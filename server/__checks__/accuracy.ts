/**
 * Accuracy guard for the chart engine.
 *
 *   npm run check:accuracy
 *
 * Checks the engine against TWO independent references stored in
 * `reference-charts.json`:
 *
 *   • `prokerala` — captured from live ProKerala API responses. This is a real
 *     Indian platform users cross-check against, so it is the primary target.
 *   • `expected`  — Swiss Ephemeris (pyswisseph, Lahiri + whole-sign), the
 *     library most serious astrology software is built on.
 *
 * The two references genuinely disagree, by nutation in longitude (±17″ on an
 * 18.6-year cycle): ProKerala subtracts a MEAN ayanamsa from apparent
 * longitudes and so keeps nutation, while Swiss's `calc_ut(FLG_SIDEREAL)`
 * removes it. No engine can match both at once. `AYANAMSA_NUTATION` (see
 * engine.ts) picks which one we follow; this script asserts a tight tolerance
 * against whichever is selected and a loose one against the other, so a real
 * regression fails while the known convention gap does not.
 *
 * Exits non-zero on any failure, so it can gate a deploy.
 *
 * Sign / nakshatra / pada are checked against BOTH references unconditionally.
 * A pada spans 3°20′ (12000″), so no convention choice can move one — if those
 * ever differ, something is genuinely broken.
 *
 * The fixtures deliberately include India's 1943 wartime +06:30 DST and a US
 * spring-forward date, because resolving a UTC offset from a wall clock is
 * where this engine has historically been wrong, and an hour of error moves
 * the ascendant ~15°.
 *
 * To regenerate: fetch each chart from ProKerala (credentials in .env.local)
 * and from pyswisseph with FLG_SWIEPH | FLG_SIDEREAL, plus houses_ex(..., b'W')
 * for the ascendant.
 */
import { computeChart } from "../engine";
import { buildIsoDatetime } from "../validate";
import fixtures from "./reference-charts.json";

/** Which reference the current engine settings are supposed to match. */
const PRIMARY = process.env.AYANAMSA_NUTATION === "1" ? "swiss" : "prokerala";

/** Rahu comes from a mean-node polynomial (and Ketu is Rahu+180, so it
 *  inherits exactly the same offset); Venus is the weakest body in the
 *  underlying ephemeris. All three sit a little above the rest by
 *  construction, not because of any defect. */
const TIGHT: Record<string, number> = {
  Ascendant: 5, Rahu: 25, Ketu: 25, Venus: 25, default: 15,
};
/** The other reference is offset by nutation (±17″), so allow that plus slack. */
const LOOSE = 45;

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const signOf = (lon: number) => SIGNS[Math.floor(lon / 30) % 12];
const nakOf = (lon: number) => Math.floor(lon / (360 / 27)) % 27;
const padaOf = (lon: number) => Math.floor(lon / (360 / 108)) % 108;

/** Shortest angular separation, in arcseconds. */
const sepArcsec = (a: number, b: number) =>
  Math.abs(((((a - b + 180) % 360) + 360) % 360) - 180) * 3600;

let failures = 0;
const worst: Record<string, { arcsec: number; label: string }> = {
  prokerala: { arcsec: 0, label: "" },
  swiss: { arcsec: 0, label: "" },
};

for (const fx of fixtures as any[]) {
  const iso = buildIsoDatetime(fx.date, fx.time, fx.tz);
  const res = computeChart({
    datetime: iso, latitude: fx.lat, longitude: fx.lon, ayanamsa: 1,
  } as any);

  const got: Record<string, number> = {};
  for (const p of res.planetPositionData.planet_position) got[p.name] = p.longitude;

  const refs: [string, Record<string, number> | null][] = [
    ["prokerala", fx.prokerala],
    ["swiss", fx.expected],
  ];

  for (const [refName, ref] of refs) {
    if (!ref) continue;
    const isPrimary = refName === PRIMARY;

    for (const [body, expected] of Object.entries(ref)) {
      const actual = got[body];
      if (actual == null) continue; // reference may carry bodies we don't emit

      const off = sepArcsec(actual, expected);
      if (off > worst[refName].arcsec) worst[refName] = { arcsec: off, label: `${fx.name} ${body}` };

      const tol = isPrimary ? (TIGHT[body] ?? TIGHT.default) : LOOSE;
      if (off > tol) {
        console.error(
          `FAIL ${fx.name} ${body} vs ${refName}: ${off.toFixed(1)}" ` +
          `(got ${actual.toFixed(5)}, ref ${expected.toFixed(5)}, tolerance ${tol}")`,
        );
        failures++;
      }

      // The part that actually reaches the user. No convention choice can
      // move these, so both references must agree.
      for (const [what, fn] of [["sign", signOf], ["nakshatra", nakOf], ["pada", padaOf]] as const) {
        if (fn(actual) !== fn(expected)) {
          console.error(
            `FAIL ${fx.name} ${body} vs ${refName}: ${what} differs — ` +
            `got ${fn(actual)}, ref ${fn(expected)}`,
          );
          failures++;
        }
      }
    }
  }
}

/**
 * Vimshottari self-consistency.
 *
 * Kept separate from the longitude comparison because the reference platforms
 * are NOT a usable oracle here: ProKerala's published dasha dates disagree with
 * ProKerala's own published Moon longitude by up to ~18 arcseconds, which shows
 * up as a boundary landing a day either side of ours. Chasing that would mean
 * copying someone else's rounding.
 *
 * What IS checkable, and what actually matters, is that our dasha is exactly
 * the dasha our Moon implies: the balance at birth derived from the emitted
 * dates must equal the balance derived from the Moon's traversal of its
 * nakshatra, the lord order must follow the 120-year cycle from the birth
 * nakshatra, the periods must be contiguous, and each must run its planet's
 * full allotted years.
 */
const VIM_YEARS: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17,
};
const VIM_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
const YEAR_DAYS = 365.25;
const NAK_SPAN = 360 / 27;

for (const fx of fixtures as any[]) {
  const iso = buildIsoDatetime(fx.date, fx.time, fx.tz);
  const res = computeChart({ datetime: iso, latitude: fx.lat, longitude: fx.lon, ayanamsa: 1 } as any);
  const moon = res.planetPositionData.planet_position.find((p: any) => p.name === "Moon")?.longitude;
  const periods = res.dashaData.dasha_periods;
  if (moon == null || !periods?.length) {
    console.error(`FAIL ${fx.name}: no Moon or no dasha periods`);
    failures++;
    continue;
  }

  const nakIdx = Math.floor(moon / NAK_SPAN);
  const birth = Date.parse(iso);

  // Balance at birth, two independent ways.
  const balanceDays = (Date.parse(periods[0].end) - birth) / 86_400_000;
  const fromDates = 1 - balanceDays / (VIM_YEARS[periods[0].name] * YEAR_DAYS);
  const fromMoon = (moon - nakIdx * NAK_SPAN) / NAK_SPAN;
  const driftArcsec = Math.abs(fromDates - fromMoon) * NAK_SPAN * 3600;
  if (driftArcsec > 1) {
    console.error(`FAIL ${fx.name}: dasha balance disagrees with the Moon by ${driftArcsec.toFixed(2)}" of Moon travel`);
    failures++;
  }

  if (periods[0].name !== VIM_ORDER[nakIdx % 9]) {
    console.error(`FAIL ${fx.name}: first dasha lord ${periods[0].name}, expected ${VIM_ORDER[nakIdx % 9]}`);
    failures++;
  }

  for (let k = 0; k < periods.length; k++) {
    const p = periods[k];
    const wantLord = VIM_ORDER[(VIM_ORDER.indexOf(periods[0].name) + k) % 9];
    if (p.name !== wantLord) {
      console.error(`FAIL ${fx.name}: dasha ${k} is ${p.name}, expected ${wantLord}`);
      failures++;
    }
    const lenErr = Math.abs((Date.parse(p.end) - Date.parse(p.start)) / 86_400_000 - VIM_YEARS[p.name] * YEAR_DAYS);
    if (lenErr > 1e-6) {
      console.error(`FAIL ${fx.name}: ${p.name} mahadasha length off by ${(lenErr * 86400).toFixed(3)}s`);
      failures++;
    }
    if (k > 0 && p.start !== periods[k - 1].end) {
      console.error(`FAIL ${fx.name}: gap between ${periods[k - 1].name} and ${p.name}`);
      failures++;
    }
  }
}

const n = (fixtures as any[]).length;
if (failures) {
  console.error(`\n${failures} failure(s) across ${n} reference charts.`);
  process.exit(1);
}
console.log(
  `PASS — ${n} charts.  ` +
  `vs ProKerala: worst ${worst.prokerala.arcsec.toFixed(1)}" (${worst.prokerala.label}).  ` +
  `vs Swiss: worst ${worst.swiss.arcsec.toFixed(1)}" (${worst.swiss.label}).  ` +
  `Matching ${PRIMARY}; zero sign, nakshatra or pada differences against either; ` +
  `Vimshottari self-consistent (balance, lord order, contiguity, lengths).`,
);
