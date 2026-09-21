/**
 * Local Vedic astrology calculation engine — NO external API required.
 *
 * Uses the pure-JS `astronomy-engine` (Swiss-Ephemeris-grade accuracy) to compute
 * true-of-date geocentric ecliptic longitudes, then applies the Lahiri ayanamsa
 * to get sidereal positions — exactly the pipeline a provider like Prokerala uses.
 *
 * Verified against Swiss Ephemeris (pyswisseph, Lahiri + whole-sign) over 60
 * random Indian charts spanning 1930-2024: every planet and the ascendant agree
 * to within 0.011°, with zero sign and zero nakshatra mismatches.
 *
 * EXCEPT Rahu/Ketu, which are the MEAN node here (classical, and what AstroSage
 * uses). Sites defaulting to the TRUE node differ by up to ~1.9°, which changes
 * Rahu's sign ~2.5% and its nakshatra ~7% of the time. An earlier version of
 * this comment claimed ~0.01° agreement with Prokerala for every body; that was
 * never true for the nodes if the reference used the true node.
 *
 * Output mimics Prokerala's response shapes (planet_position[] + dasha_periods[])
 * so the existing normalizer consumes it unchanged.
 */
import * as A from "astronomy-engine";

const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];
const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

const norm360 = (x: number) => ((x % 360) + 360) % 360;
const DEG = Math.PI / 180;

/**
 * Should the sidereal longitude keep nutation in it?
 *
 * This is a real convention split between two respected references, measured
 * directly (see `__checks__/accuracy.ts`) against both:
 *
 *   • ProKerala (and Indian panchang software generally) does
 *     `apparent tropical − MEAN ayanamsa`, so nutation stays in.
 *   • Swiss Ephemeris `calc_ut(FLG_SIDEREAL)` removes it.
 *
 * The two disagree by nutation in longitude — ±17″ on an 18.6-year cycle — so
 * no engine can match both at once. We default to the ProKerala convention
 * because that is what our users cross-check against, and confirmed it
 * empirically: planets and the ascendant then agree with live ProKerala output
 * to 0.1-6″. Set AYANAMSA_NUTATION=1 to match Swiss instead.
 *
 * Either way the choice is far too small to move a sign, nakshatra or pada
 * (a pada spans 12000″).
 */
const KEEP_NUTATION = process.env.AYANAMSA_NUTATION === "1";

/**
 * Lahiri (Chitrapaksha) ayanamsa, with small offsets for Raman(3)/KP(5).
 *
 * The mean constants are fitted to swisseph's `get_ayanamsa_ut()` (max ~0.6″
 * over 1900-2050), which is also the value ProKerala subtracts.
 *
 * Careful when "correcting" this: swisseph exposes TWO Lahiri values —
 * `get_ayanamsa_ut()` (mean) and whatever `calc_ut(FLG_SIDEREAL)` effectively
 * applies (mean + nutation) — and they differ by up to 17″. Tuning these
 * constants against the wrong one, or tuning them without also settling the
 * nutation question above, makes the app agree with real sites WORSE while
 * looking better on paper. Both were gotten wrong that way before. Always
 * measure end-to-end against a live platform, not against a single swisseph
 * helper.
 */
function ayanamsaDeg(t: A.AstroTime, ayanamsa: number): number {
  const mean = 23.857092 + (50.2829 / 3600) * (t.tt / 365.25);
  const lahiri = KEEP_NUTATION ? mean + A.e_tilt(t).dpsi / 3600 : mean;
  if (ayanamsa === 3) return lahiri - 1.39; // Raman (approx)
  if (ayanamsa === 5) return lahiri - 0.06; // KP (approx)
  return lahiri; // 1 = Lahiri (default)
}

/** Mean obliquity of the ecliptic (radians), Meeus. */
function meanObliquity(t: A.AstroTime): number {
  const T = t.tt / 36525;
  const deg = 23.439291 - (46.815 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600;
  return deg * DEG;
}

/** Tropical, true-of-date geocentric ecliptic longitude (degrees). */
function tropicalLongitude(body: A.Body, t: A.AstroTime): number {
  const v = A.GeoVector(body, t, true);
  const ect = A.RotateVector(A.Rotation_EQJ_ECT(t), v);
  return norm360(A.SphereFromVector(ect).lon);
}

const PLANETS: Array<{ id: number; name: string; body: A.Body }> = [
  { id: 0, name: "Sun", body: A.Body.Sun },
  { id: 1, name: "Moon", body: A.Body.Moon },
  { id: 2, name: "Mercury", body: A.Body.Mercury },
  { id: 3, name: "Venus", body: A.Body.Venus },
  { id: 4, name: "Mars", body: A.Body.Mars },
  { id: 5, name: "Jupiter", body: A.Body.Jupiter },
  { id: 6, name: "Saturn", body: A.Body.Saturn },
];

function siderealOf(body: A.Body, t: A.AstroTime, ayan: number): number {
  return norm360(tropicalLongitude(body, t) - ayan);
}

/**
 * Retrograde if sidereal longitude is decreasing *at* this moment.
 *
 * Uses the centred difference (±12h) that `speedPerDay` below already
 * implements. The old forward difference over a full day answered a subtly
 * different question — "will it be behind tomorrow?" — which disagrees with
 * the instantaneous direction for a planet sitting near a station. Measured at
 * ~0.4% of charts, almost all Mercury.
 */
function isRetrograde(body: A.Body, _t: A.AstroTime, dateMs: number, ayan: number): boolean {
  return speedPerDay((tt) => siderealOf(body, tt, ayan), dateMs) < 0;
}

/** Mean lunar node (Rahu) tropical longitude (degrees). */
function meanNodeTropical(t: A.AstroTime): number {
  const T = t.tt / 36525;
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);
}

/** Mean lunar node (Rahu), sidereal degrees. */
function rahuSidereal(t: A.AstroTime, ayan: number): number {
  return norm360(meanNodeTropical(t) - ayan);
}

/** True-of-date ecliptic latitude (celestial latitude / shara), degrees. */
function eclipticLatitude(body: A.Body, t: A.AstroTime): number {
  const v = A.GeoVector(body, t, true);
  const ect = A.RotateVector(A.Rotation_EQJ_ECT(t), v);
  return A.SphereFromVector(ect).lat;
}

/**
 * Convert an ecliptic position (of date) to equatorial RA + declination.
 * Verified against reference ephemerides: Sun near solstice → dec ≈ 23.4°.
 */
function eclipticToEquatorial(lonDeg: number, latDeg: number, eps: number): { ra: number; dec: number } {
  const lam = lonDeg * DEG;
  const bet = latDeg * DEG;
  const dec = Math.asin(Math.sin(bet) * Math.cos(eps) + Math.cos(bet) * Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.sin(lam) * Math.cos(eps) - Math.tan(bet) * Math.sin(eps), Math.cos(lam));
  return { ra: norm360(ra / DEG), dec: dec / DEG };
}

/** Daily longitude motion (deg/day) by central difference; negative = retrograde. */
function speedPerDay(lonAt: (t: A.AstroTime) => number, dateMs: number): number {
  const a = lonAt(A.MakeTime(new Date(dateMs - 43_200_000)));
  const b = lonAt(A.MakeTime(new Date(dateMs + 43_200_000)));
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/** Rising sign degree (Lagna), sidereal degrees. */
function ascendantSidereal(t: A.AstroTime, lat: number, lon: number, ayan: number): number {
  // TRUE obliquity, to match the apparent sidereal time used below — pairing
  // apparent GAST with the *mean* obliquity mixed two frames.
  const eps = A.e_tilt(t).tobl * DEG;
  const gast = A.SiderealTime(t); // Greenwich apparent sidereal time, hours
  const ramc = norm360((gast + lon / 15) * 15) * DEG; // local sidereal time as angle
  const phi = lat * DEG;
  const asc =
    Math.atan2(
      Math.cos(ramc),
      -(Math.sin(ramc) * Math.cos(eps) + Math.tan(phi) * Math.sin(eps))
    ) / DEG;
  return norm360(norm360(asc) - ayan);
}

function planetEntry(id: number, name: string, sidLon: number, retro: boolean) {
  const signIdx = Math.floor(sidLon / 30) % 12;
  return {
    id,
    name,
    longitude: Number(sidLon.toFixed(4)),
    is_retrograde: retro,
    position: signIdx + 1, // sign ordinal (the normalizer recomputes house from the ascendant)
    degree: Number((sidLon % 30).toFixed(4)),
    rasi: { id: signIdx, name: SIGNS[signIdx], lord: { name: SIGN_LORDS[signIdx] } },
  };
}

// ---------------------------------------------------------------------------
// Vimshottari Dasha
// ---------------------------------------------------------------------------
const DASHA_LORDS: Array<[string, number]> = [
  ["Ketu", 7], ["Venus", 20], ["Sun", 6], ["Moon", 10], ["Mars", 7],
  ["Rahu", 18], ["Jupiter", 16], ["Saturn", 19], ["Mercury", 17],
];
const YEAR_DAYS = 365.25;
const DAY_MS = 86_400_000;

function buildDashaPeriods(moonSidLon: number, birthMs: number) {
  const nakSpan = 360 / 27; // 13°20'
  const nakIndex = Math.floor(moonSidLon / nakSpan) % 27;
  const startLordIdx = nakIndex % 9;
  const traversed = (moonSidLon % nakSpan) / nakSpan; // 0..1 of current nakshatra

  // The running mahadasha began before birth by the traversed fraction.
  const firstLordYears = DASHA_LORDS[startLordIdx][1];
  let cursor = birthMs - traversed * firstLordYears * YEAR_DAYS * DAY_MS;

  const periods: any[] = [];
  let idx = startLordIdx;
  for (let n = 0; n < 9; n++) {
    const [lord, years] = DASHA_LORDS[idx];
    const start = cursor;
    const end = start + years * YEAR_DAYS * DAY_MS;

    // Antardashas, starting from the mahadasha lord, proportional to 120 yrs.
    const antardasha: any[] = [];
    let aCursor = start;
    for (let m = 0; m < 9; m++) {
      const [aLord, aYears] = DASHA_LORDS[(idx + m) % 9];
      const aEnd = aCursor + (years * aYears / 120) * YEAR_DAYS * DAY_MS;
      antardasha.push({
        name: aLord,
        start: new Date(aCursor).toISOString(),
        end: new Date(aEnd).toISOString(),
      });
      aCursor = aEnd;
    }

    periods.push({
      name: lord,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      antardasha,
    });
    cursor = end;
    idx = (idx + 1) % 9;
  }
  return periods;
}

// ---------------------------------------------------------------------------
// Public: compute a full chart locally, in Prokerala-compatible shape.
// ---------------------------------------------------------------------------
export interface EngineInput {
  /** ISO-8601 datetime WITH offset, e.g. "1984-11-10T06:40:00+05:30". */
  datetime: string;
  latitude: number;
  longitude: number;
  ayanamsa: number;
}

export function computeChart(input: EngineInput): {
  planetPositionData: { planet_position: any[] };
  dashaData: { dasha_periods: any[] };
} {
  const date = new Date(input.datetime);
  if (isNaN(date.getTime())) throw new Error(`Invalid datetime: ${input.datetime}`);
  const dateMs = date.getTime();
  const t = A.MakeTime(date);
  const ayan = ayanamsaDeg(t, input.ayanamsa);

  const planet_position: any[] = [];

  // Ascendant (id 100, like Prokerala) — first entry.
  const ascLon = ascendantSidereal(t, input.latitude, input.longitude, ayan);
  planet_position.push(planetEntry(100, "Ascendant", ascLon, false));

  // Grahas.
  let moonSidLon = 0;
  for (const p of PLANETS) {
    const sidLon = siderealOf(p.body, t, ayan);
    if (p.name === "Moon") moonSidLon = sidLon;
    planet_position.push(planetEntry(p.id, p.name, sidLon, isRetrograde(p.body, t, dateMs, ayan)));
  }

  // Rahu (mean node) + Ketu (180° opposite). Both always retrograde.
  const rahu = rahuSidereal(t, ayan);
  planet_position.push(planetEntry(7, "Rahu", rahu, true));
  planet_position.push(planetEntry(8, "Ketu", norm360(rahu + 180), true));

  const dasha_periods = buildDashaPeriods(moonSidLon, dateMs);

  return {
    planetPositionData: { planet_position },
    dashaData: { dasha_periods },
  };
}

/**
 * Sun & Moon ecliptic longitudes (tropical + sidereal) at a given instant.
 * Used by the Panchang engine (tithi/nakshatra/yoga/karana). Tithi & karana use
 * the Moon–Sun elongation (ayanamsa cancels), nakshatra uses Moon sidereal,
 * yoga uses (Sun+Moon) sidereal.
 */
export function eclipticLongitudes(date: Date, ayanamsa: number): {
  sunTropical: number; moonTropical: number; sunSidereal: number; moonSidereal: number;
} {
  const t = A.MakeTime(date);
  const ayan = ayanamsaDeg(t, ayanamsa);
  const sunT = tropicalLongitude(A.Body.Sun, t);
  const moonT = tropicalLongitude(A.Body.Moon, t);
  return {
    sunTropical: sunT,
    moonTropical: moonT,
    sunSidereal: norm360(sunT - ayan),
    moonSidereal: norm360(moonT - ayan),
  };
}

/** Sunrise & sunset (UTC Date) for a place on the day containing `fromInstant`. */
export function sunRiseSet(fromInstant: Date, latitude: number, longitude: number): {
  sunrise: Date | null; sunset: Date | null;
} {
  const observer = new A.Observer(latitude, longitude, 0);
  const start = A.MakeTime(fromInstant);
  const rise = A.SearchRiseSet(A.Body.Sun, observer, +1, start, 1);
  const set = A.SearchRiseSet(A.Body.Sun, observer, -1, start, 1);
  return { sunrise: rise ? rise.date : null, sunset: set ? set.date : null };
}

// ---------------------------------------------------------------------------
// Transits (Gochar) — live planetary positions for a given moment.
// ---------------------------------------------------------------------------
/**
 * Current (or any-moment) sidereal positions of all grahas — no ascendant /
 * birth place needed, because transit houses are read relative to the natal
 * lagna and natal moon (done in transit.ts). Same accurate engine as the natal
 * chart, just evaluated at "now".
 */
/**
 * Where the three slow movers are on a date — Jupiter, Saturn and the (mean)
 * node. The chat's timing and transit-calendar code (ported from VedicAstra)
 * scans these day by day to find sign changes, so it needs them without the
 * cost of a full planetary computation.
 */
export function slowPlanetLongitudes(date: Date, ayanamsa: number): { Jupiter: number; Saturn: number; Rahu: number } {
  const t = A.MakeTime(date);
  const ayan = ayanamsaDeg(t, ayanamsa);
  const wrap = (x: number) => ((x % 360) + 360) % 360;
  return {
    Jupiter: siderealOf(A.Body.Jupiter, t, ayan),
    Saturn: siderealOf(A.Body.Saturn, t, ayan),
    Rahu: wrap(meanNodeTropical(t) - ayan),
  };
}

export function computeTransits(
  datetimeIso: string,
  ayanamsa: number
): { datetime: string; planet_position: any[] } {
  const date = new Date(datetimeIso);
  if (isNaN(date.getTime())) throw new Error(`Invalid datetime: ${datetimeIso}`);
  const dateMs = date.getTime();
  const t = A.MakeTime(date);
  const ayan = ayanamsaDeg(t, ayanamsa);
  const eps = meanObliquity(t);

  const planet_position: any[] = [];
  for (const p of PLANETS) {
    const sidLon = siderealOf(p.body, t, ayan);
    const tropLon = tropicalLongitude(p.body, t);
    const lat = eclipticLatitude(p.body, t);
    const eq = eclipticToEquatorial(tropLon, lat, eps);
    const speed = speedPerDay((tt) => tropicalLongitude(p.body, tt), dateMs);
    const e: any = planetEntry(p.id, p.name, sidLon, speed < 0);
    e.latitude = Number(lat.toFixed(4));
    e.speed = Number(speed.toFixed(4));
    e.ra = Number(eq.ra.toFixed(4));
    e.dec = Number(eq.dec.toFixed(4));
    planet_position.push(e);
  }

  // Rahu/Ketu — mean node, latitude 0, always retrograde.
  const rahuTrop = meanNodeTropical(t);
  const nodeSpeed = speedPerDay((tt) => meanNodeTropical(tt), dateMs);
  const nodes: Array<[number, string, number]> = [
    [7, "Rahu", rahuTrop],
    [8, "Ketu", norm360(rahuTrop + 180)],
  ];
  for (const [id, name, tropLon] of nodes) {
    const eq = eclipticToEquatorial(tropLon, 0, eps);
    const e: any = planetEntry(id, name, norm360(tropLon - ayan), true);
    e.latitude = 0;
    e.speed = Number(nodeSpeed.toFixed(4));
    e.ra = Number(eq.ra.toFixed(4));
    e.dec = Number(eq.dec.toFixed(4));
    planet_position.push(e);
  }

  return { datetime: date.toISOString(), planet_position };
}
