/**
 * Normalizes raw Prokerala responses into our internal, provider-agnostic chart
 * format. Frontend and Gemini consume ONLY this normalized shape, never the raw
 * Prokerala JSON — so swapping providers later won't break either layer.
 *
 * What comes from Prokerala (real data):
 *   - planet positions, signs, houses, retrograde, longitude  (planet-position)
 *   - janma nakshatra, moon/sun rasi                           (birth-details)
 *   - vimshottari dasha timeline                               (dasha-periods)
 *
 * What we derive deterministically from the real Prokerala longitudes (exact,
 * standard transforms — NOT guesses):
 *   - each planet's nakshatra+pada (from sidereal longitude)
 *   - the D9 navamsa chart (standard navamsa division of the longitude)
 *   - whole-sign house layout for D1 and D9
 */

import type { BirthInput } from "./validate";

export const SIGNS = [
  "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
  "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
];

export const NAKSHATRAS = [
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

// Prokerala returns rasi names in Sanskrit (e.g. "Tula" for Libra) even when
// la=en, so we map every known spelling (English + Sanskrit variants) to a
// canonical 0-based sign index and always store the English name.
const SIGN_ALIASES: Record<string, number> = {};
function registerSign(idx: number, ...names: string[]) {
  for (const n of names) SIGN_ALIASES[n.toLowerCase()] = idx;
}
registerSign(0, "Aries", "Mesha", "Mesa", "Medam");
registerSign(1, "Taurus", "Vrishabha", "Vrushabha", "Vrishaba", "Rishaba", "Edavam");
registerSign(2, "Gemini", "Mithuna", "Midhunam");
registerSign(3, "Cancer", "Karka", "Karkata", "Kataka", "Karkataka", "Karkidakam");
registerSign(4, "Leo", "Simha", "Sinha", "Chingam");
registerSign(5, "Virgo", "Kanya", "Kanni");
registerSign(6, "Libra", "Tula", "Thula", "Tulam");
registerSign(7, "Scorpio", "Vrishchika", "Vruschika", "Vrischika", "Vrishchik", "Vrichigam");
registerSign(8, "Sagittarius", "Dhanu", "Dhanus", "Dhanusu", "Danu", "Dhanu Rashi");
registerSign(9, "Capricorn", "Makara", "Makaram", "Makar");
registerSign(10, "Aquarius", "Kumbha", "Kumbham", "Kumba");
registerSign(11, "Pisces", "Meena", "Meenam", "Mina");

function signIndex(name: string): number {
  if (!name) return -1;
  const direct = SIGNS.indexOf(name);
  if (direct >= 0) return direct;
  const alias = SIGN_ALIASES[name.trim().toLowerCase()];
  return alias === undefined ? -1 : alias;
}

/** Canonical English sign name from any known spelling ("" if unknown). */
function canonicalSign(name: string): string {
  const i = signIndex(name);
  return i >= 0 ? SIGNS[i] : "";
}

/** Nakshatra (name) + pada (1-4) from absolute sidereal longitude (0-360). */
function nakshatraFromLongitude(lon: number): { name: string; pada: number } {
  const norm = ((lon % 360) + 360) % 360;
  const span = 360 / 27; // 13.333...
  const idx = Math.floor(norm / span) % 27;
  const within = norm - idx * span;
  const pada = Math.floor(within / (span / 4)) + 1;
  return { name: NAKSHATRAS[idx], pada };
}

/** Navamsa (D9) sign index (0=Aries) from absolute sidereal longitude. */
function navamsaSignIndex(lon: number): number {
  const norm = ((lon % 360) + 360) % 360;
  return Math.floor(norm / (30 / 9)) % 12; // 3.333... deg per navamsa
}

/**
 * Divisional (varga) sign index (0=Aries) for division `n` from a sidereal
 * longitude. Uses the classical BPHS rule for D9 and D10, the "from same sign"
 * rule for D12, and the parivritti (cyclic) method for other divisions (D6, D11).
 * Verified: D9 here matches Prokerala's navamsa output exactly.
 */
function vargaSignIndex(lon: number, n: number): number {
  const norm = ((lon % 360) + 360) % 360;
  const s = Math.floor(norm / 30) % 12; // sign index 0-11
  const d = norm % 30; // degrees within the sign
  const part = Math.floor(d / (30 / n)); // 0 .. n-1
  switch (n) {
    case 9:
      return Math.floor(norm / (30 / 9)) % 12; // BPHS navamsa
    case 10:
      // Dasamsa: odd signs (1-indexed) count from the same sign, even signs
      // from the 9th sign. (s even => odd 1-indexed sign.)
      return s % 2 === 0 ? (s + part) % 12 : (s + 8 + part) % 12;
    case 12:
      // Dwadasamsa: from the same sign.
      return (s + part) % 12;
    default:
      // Parivritti (cyclic) for divisions without a single universal rule (D6, D11).
      return (s * n + part) % 12;
  }
}

function houseFromAsc(signIdx: number, ascSignIdx: number): number {
  return ((signIdx - ascSignIdx + 12) % 12) + 1;
}

interface RawPlanet {
  id: number;
  name: string;
  longitude: number;
  is_retrograde: boolean;
  position: number; // house number per Prokerala
  degree: number;
  rasi: { id: number; name: string; lord?: { name?: string } };
}

const ASCENDANT_NAMES = new Set(["Ascendant", "Lagna", "Ascendent"]);

function isAscendant(p: RawPlanet): boolean {
  return ASCENDANT_NAMES.has(p.name) || p.id === 100;
}

interface NormalizeArgs {
  birth: BirthInput;
  isoDatetime: string;
  ayanamsa: number;
  planetPositionData: any; // raw .data from planet-position
  birthDetailsData: any; // raw .data from birth-details
  dashaData: any; // raw .data from dasha-periods
  raw: any; // full raw responses for storage
  provider?: string; // "local" (built-in engine) or "prokerala"
}

export interface NormalizedChart {
  [key: string]: any;
}

export function normalizeChart(args: NormalizeArgs): {
  normalized: NormalizedChart;
  validationStatus: string;
} {
  const { birth, isoDatetime, ayanamsa } = args;
  const rawPlanets: RawPlanet[] = args.planetPositionData?.planet_position ?? [];

  const ascRaw = rawPlanets.find(isAscendant);
  const ascLongitude = ascRaw?.longitude ?? 0;
  const ascSignIdx = signIndex(ascRaw?.rasi?.name ?? "");
  // Always store the canonical English sign name.
  const ascSign = ascSignIdx >= 0 ? SIGNS[ascSignIdx] : (ascRaw?.rasi?.name ?? "");

  // --- D1: flat planet list (excludes ascendant) -------------------------
  const planetPositions = rawPlanets
    .filter((p) => !isAscendant(p))
    .map((p) => {
      const nk = nakshatraFromLongitude(p.longitude);
      const sIdx = signIndex(p.rasi?.name ?? "");
      return {
        planet: p.name,
        sign: sIdx >= 0 ? SIGNS[sIdx] : (p.rasi?.name ?? ""),
        sign_id: sIdx,
        // Prokerala's `position` is the sign ordinal (Aries=1), NOT the bhava.
        // Compute the whole-sign house relative to the ascendant.
        house: sIdx >= 0 && ascSignIdx >= 0 ? houseFromAsc(sIdx, ascSignIdx) : p.position,
        degree: Number((p.degree ?? 0).toFixed(2)),
        longitude: Number((p.longitude ?? 0).toFixed(4)),
        retrograde: Boolean(p.is_retrograde),
        nakshatra: nk.name,
        pada: nk.pada,
        rasi_lord: sIdx >= 0 ? SIGN_LORDS[sIdx] : (p.rasi?.lord?.name ?? ""),
      };
    });

  // --- D1 ascendant -------------------------------------------------------
  const ascNak = nakshatraFromLongitude(ascLongitude);
  const ascendant = {
    sign: ascSign,
    sign_id: ascSignIdx,
    degree: Number((ascRaw?.degree ?? 0).toFixed(2)),
    longitude: Number(ascLongitude.toFixed(4)),
    nakshatra: ascNak.name,
    pada: ascNak.pada,
    lord: ascSignIdx >= 0 ? SIGN_LORDS[ascSignIdx] : "",
  };

  // --- D1 houses (whole sign) --------------------------------------------
  const d1Houses = buildHouses(ascSignIdx, (signIdx) =>
    planetPositions
      .filter((p) => p.sign_id === signIdx)
      .map((p) => ({ planet: p.planet, retrograde: p.retrograde, degree: p.degree }))
  );

  // --- D9 navamsa (computed from real longitudes) ------------------------
  const d9AscSignIdx = navamsaSignIndex(ascLongitude);
  const d9Planets = rawPlanets
    .filter((p) => !isAscendant(p))
    .map((p) => {
      const navIdx = navamsaSignIndex(p.longitude);
      return {
        planet: p.name,
        sign: SIGNS[navIdx],
        sign_id: navIdx,
        house: houseFromAsc(navIdx, d9AscSignIdx),
        retrograde: Boolean(p.is_retrograde),
      };
    });
  const d9Houses = buildHouses(d9AscSignIdx, (signIdx) =>
    d9Planets
      .filter((p) => p.sign_id === signIdx)
      .map((p) => ({ planet: p.planet, retrograde: p.retrograde }))
  );

  // --- other divisional charts (computed from real longitudes) -----------
  const divisional_charts = {
    D6: buildDivisionalChart(rawPlanets, ascLongitude, 6, "Shashtamsa (Health)"),
    D10: buildDivisionalChart(rawPlanets, ascLongitude, 10, "Dasamsa (Career)"),
    D11: buildDivisionalChart(rawPlanets, ascLongitude, 11, "Ekadasamsa (Gains)"),
  };

  // --- birth details ------------------------------------------------------
  const bd = args.birthDetailsData ?? {};
  const moonSign = canonicalSign(bd?.chandra_rasi?.name ?? "") || planetSign(planetPositions, "Moon");
  const sunSign = canonicalSign(bd?.soorya_rasi?.name ?? "") || planetSign(planetPositions, "Sun");
  // Janma nakshatra IS the Moon's nakshatra — derive from the Moon's longitude
  // for a consistent English spelling, falling back to the provider's value.
  const moonRaw = rawPlanets.find((p) => p.name === "Moon");
  const moonNak = moonRaw ? nakshatraFromLongitude(moonRaw.longitude) : null;
  const janmaNakshatra = moonNak?.name ?? (bd?.nakshatra?.name ?? "");
  const janmaPada = moonNak?.pada ?? (bd?.nakshatra?.pada ?? null);

  // --- dasha --------------------------------------------------------------
  const dasha = normalizeDasha(args.dashaData, birth.timezone);

  // --- summary ------------------------------------------------------------
  const summary = {
    lagna: ascSign,
    rashi: moonSign,
    sun_sign: sunSign,
    nakshatra: janmaNakshatra,
    nakshatra_pada: janmaPada,
    current_mahadasha: dasha.current.mahadasha ?? "",
    current_antardasha: dasha.current.antardasha ?? "",
  };

  // --- normalized output (spec format + legacy aliases for the UI) -------
  const normalized: NormalizedChart = {
    birth_details: {
      name: birth.name,
      date_of_birth: birth.date_of_birth,
      time_of_birth: birth.time_of_birth,
      place_of_birth: birth.place_of_birth,
      latitude: birth.latitude,
      longitude: birth.longitude,
      timezone: birth.timezone,
      gender: birth.gender ?? "",
      language: birth.language,
    },
    settings: {
      provider: args.provider ?? "local",
      zodiac: "sidereal",
      ayanamsa: ayanamsa === 1 ? "lahiri" : ayanamsa === 3 ? "raman" : ayanamsa === 5 ? "kp" : String(ayanamsa),
      house_system: "whole_sign",
      chart_style: "north_indian",
      datetime: isoDatetime,
    },
    summary,

    planet_positions: planetPositions,

    d1_chart: {
      chart_type: "D1",
      chart_style: "north_indian",
      ascendant_sign: ascSign,
      houses: d1Houses,
    },
    d9_chart: {
      chart_type: "D9",
      chart_style: "north_indian",
      ascendant_sign: SIGNS[d9AscSignIdx] ?? "",
      houses: d9Houses,
      planet_positions: d9Planets,
    },
    divisional_charts,
    dasha,

    // ---- legacy aliases so existing React pages keep working unchanged ----
    ascendant: {
      sign: ascendant.sign,
      degree: ascendant.degree,
      nakshatra: ascendant.nakshatra,
      pada: ascendant.pada,
    },
    planets: planetPositions.map((p) => ({
      planet: p.planet,
      sign: p.sign,
      house: p.house,
      degree: p.degree,
      nakshatra: p.nakshatra,
      pada: p.pada,
      retrograde: p.retrograde,
    })),
    dashas: {
      current_mahadasha: dasha.current.mahadasha,
      current_antardasha: dasha.current.antardasha,
      current_period: {
        from: dasha.current.antardasha_from ?? dasha.current.mahadasha_from ?? "",
        to: dasha.current.antardasha_to ?? dasha.current.mahadasha_to ?? "",
      },
      next_7_years: dasha.next_7_years,
    },

    raw_provider_response: {
      provider: args.provider ?? "local",
      data: args.raw,
    },
  };

  // --- validation ---------------------------------------------------------
  const errors: string[] = [];
  if (ascSignIdx < 0) errors.push("ascendant sign missing/unrecognized");
  if (planetPositions.length < 9) errors.push("expected at least 9 planets");
  if (!summary.rashi) errors.push("moon rasi missing");
  if (!summary.nakshatra) errors.push("janma nakshatra missing");
  if (!dasha.mahadasha.length) errors.push("dasha timeline missing");
  const validationStatus = errors.length === 0 ? "verified" : `partial: ${errors.join("; ")}`;

  return { normalized, validationStatus };
}

function buildHouses(
  ascSignIdx: number,
  planetsInSign: (signIdx: number) => Array<{ planet: string; [k: string]: any }>
) {
  const houses = [];
  for (let h = 1; h <= 12; h++) {
    const sIdx = ((ascSignIdx < 0 ? 0 : ascSignIdx) + h - 1) % 12;
    const occupants = planetsInSign(sIdx);
    houses.push({
      house: h,
      sign: SIGNS[sIdx],
      sign_id: sIdx,
      sign_lord: SIGN_LORDS[sIdx],
      planets: occupants.map((p) => p.planet),
      planet_details: occupants,
    });
  }
  return houses;
}

function planetSign(planets: Array<{ planet: string; sign: string }>, name: string): string {
  return planets.find((p) => p.planet === name)?.sign ?? "";
}

/** Build a divisional (varga) chart for division `n` from raw planet longitudes. */
function buildDivisionalChart(
  rawPlanets: RawPlanet[],
  ascLongitude: number,
  n: number,
  label: string
) {
  const ascIdx = vargaSignIndex(ascLongitude, n);
  const planetPositions = rawPlanets
    .filter((p) => !isAscendant(p))
    .map((p) => {
      const idx = vargaSignIndex(p.longitude, n);
      return {
        planet: p.name,
        sign: SIGNS[idx],
        sign_id: idx,
        house: houseFromAsc(idx, ascIdx),
        retrograde: Boolean(p.is_retrograde),
      };
    });
  const houses = buildHouses(ascIdx, (signIdx) =>
    planetPositions
      .filter((p) => p.sign_id === signIdx)
      .map((p) => ({ planet: p.planet, retrograde: p.retrograde }))
  );
  return {
    chart_type: `D${n}`,
    label,
    chart_style: "north_indian",
    ascendant_sign: SIGNS[ascIdx],
    houses,
    planet_positions: planetPositions,
  };
}

interface DashaSpan {
  lord: string;
  from: string;
  to: string;
}

function normalizeDasha(dashaData: any, tz?: string) {
  const periods: any[] = dashaData?.dasha_periods ?? [];
  const now = Date.now();

  const mahadasha: DashaSpan[] = periods.map((m) => ({
    lord: m.name,
    from: m.start,
    to: m.end,
  }));

  // Flatten all antardashas with a "Maha-Antar" label.
  const antardasha: Array<{ mahadasha: string; lord: string; label: string; from: string; to: string }> = [];
  for (const m of periods) {
    for (const a of m.antardasha ?? []) {
      antardasha.push({
        mahadasha: m.name,
        lord: a.name,
        label: `${m.name}-${a.name}`,
        from: a.start,
        to: a.end,
      });
    }
  }

  const t = (s: string) => new Date(s).getTime();
  const currentMaha = mahadasha.find((m) => t(m.from) <= now && now < t(m.to));
  const currentAntar = antardasha.find((a) => t(a.from) <= now && now < t(a.to));

  // Next ~7 years of antardashas (those active now or starting within 7 years).
  const sevenYears = now + 7 * 365.25 * 24 * 3600 * 1000;
  const next_7_years = antardasha
    .filter((a) => t(a.to) > now && t(a.from) < sevenYears)
    .sort((x, y) => t(x.from) - t(y.from))
    .map((a) => ({ period: a.label, from: dateOnly(a.from, tz), to: dateOnly(a.to, tz) }));

  return {
    mahadasha: mahadasha.map((m) => ({ ...m, from: dateOnly(m.from, tz), to: dateOnly(m.to, tz) })),
    antardasha: antardasha.map((a) => ({ ...a, from: dateOnly(a.from, tz), to: dateOnly(a.to, tz) })),
    current: {
      mahadasha: currentMaha?.lord ?? "",
      mahadasha_from: currentMaha ? dateOnly(currentMaha.from, tz) : "",
      mahadasha_to: currentMaha ? dateOnly(currentMaha.to, tz) : "",
      antardasha: currentAntar?.lord ?? "",
      antardasha_from: currentAntar ? dateOnly(currentAntar.from, tz) : "",
      antardasha_to: currentAntar ? dateOnly(currentAntar.to, tz) : "",
    },
    next_7_years,
  };
}

/**
 * The calendar date a dasha boundary falls on, in the chart's own timezone.
 *
 * Two very different shapes arrive here:
 *   • Prokerala sends local time with a real offset ("…T01:30:00+05:30") —
 *     slicing the leading YYYY-MM-DD is correct.
 *   • The local engine sends UTC ("…T20:00:00Z") — slicing that showed the
 *     PREVIOUS day for every boundary falling between 18:30 and 24:00 IST,
 *     roughly a fifth of all dates. That is exactly the kind of one-day
 *     discrepancy a user spots when cross-checking against AstroSage.
 *
 * So: zone-aware formatting for UTC stamps, plain slicing for offset stamps.
 */
function dateOnly(s: string, timeZone?: string): string {
  if (!s) return "";
  const isUtc = /Z$/.test(s);
  if (!isUtc) {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
    if (m) return m[1];
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  if (timeZone) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat("en-CA", {
        timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(d);
    } catch { /* unknown zone — fall through to UTC */ }
  }
  return d.toISOString().slice(0, 10);
}
