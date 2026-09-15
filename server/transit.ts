/**
 * Transit (Gochar) analysis — reads the LIVE sky against a saved natal chart.
 *
 * The transit planet positions come from our own astronomy engine (same one
 * used for the natal chart). Each transiting planet is then placed into a house
 * relative to the natal lagna AND the natal moon (Chandra lagna) — the two
 * reference points Vedic astrology uses for gochar. A few deterministic
 * highlights (Sade Sati, Saturn/Jupiter/Rahu-Ketu houses) are computed in plain
 * code, never guessed.
 */
import { computeTransits } from "./engine";
import { SIGNS, NAKSHATRAS } from "./normalize";

const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];

// Vimshottari order (nakshatra lords + dasha years) — for nakshatra & KP sub lord.
const VIM: Array<[string, number]> = [
  ["Ketu", 7], ["Venus", 20], ["Sun", 6], ["Moon", 10], ["Mars", 7],
  ["Rahu", 18], ["Jupiter", 16], ["Saturn", 19], ["Mercury", 17],
];

function signIdxOf(name: string): number {
  return SIGNS.indexOf(name);
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "12°25′31″" from a degree value (within its sign, 0-30). */
function toDMS(deg: number): string {
  let d = Math.floor(deg);
  let mf = (deg - d) * 60;
  let m = Math.floor(mf);
  let s = Math.round((mf - m) * 60);
  if (s === 60) { s = 0; m++; }
  if (m === 60) { m = 0; d++; }
  return `${pad2(d)}°${pad2(m)}′${pad2(s)}″`;
}

/** Latitude / Shara as "00° N 41′ 18″". */
function toShara(latDeg: number): string {
  const ns = latDeg >= 0 ? "N" : "S";
  const a = Math.abs(latDeg);
  let d = Math.floor(a);
  let mf = (a - d) * 60;
  let m = Math.floor(mf);
  let s = Math.round((mf - m) * 60);
  if (s === 60) { s = 0; m++; }
  if (m === 60) { m = 0; d++; }
  return `${pad2(d)}° ${ns} ${pad2(m)}′ ${pad2(s)}″`;
}

/** Nakshatra name, pada (1-4), nakshatra lord and KP sub lord from a sidereal longitude. */
function nakInfo(lon: number): { nakshatra: string; pada: number; nakLord: string; subLord: string } {
  const span = 360 / 27; // 13°20'
  const n = ((lon % 360) + 360) % 360;
  const idx = Math.floor(n / span) % 27;
  const within = n - idx * span;
  const pada = Math.floor(within / (span / 4)) + 1;
  const startLord = idx % 9;
  const nakLord = VIM[startLord][0];
  // KP sub lord: nakshatra split into 9 parts proportional to Vimshottari years.
  let acc = 0;
  let subLord = VIM[startLord][0];
  for (let i = 0; i < 9; i++) {
    const li = (startLord + i) % 9;
    const sub = span * (VIM[li][1] / 120);
    if (within < acc + sub) { subLord = VIM[li][0]; break; }
    acc += sub;
  }
  return { nakshatra: NAKSHATRAS[idx], pada, nakLord, subLord };
}

const houseFrom = (signIdx: number, refIdx: number) =>
  refIdx >= 0 && signIdx >= 0 ? ((signIdx - refIdx + 12) % 12) + 1 : null;

export interface TransitResult {
  datetime: string;
  natal: { lagna: string; lagna_idx: number; moon: string; moon_idx: number };
  planets: Array<{
    planet: string;
    sign: string;
    sign_index: number;
    longitude: number;
    full_degree: number;
    dms: string;
    sign_lord: string;
    degree: number;
    nakshatra: string;
    pada: number;
    nak_lord: string;
    sub_lord: string;
    latitude: number;
    shara: string;
    speed: number;
    ra: number;
    dec: number;
    retrograde: boolean;
    house_from_lagna: number | null;
    house_from_moon: number | null;
  }>;
  highlights: string[];
}

/** Build the full transit picture for `chart` at moment `nowIso`. */
export function buildTransit(chart: any, ayanamsa: number, nowIso: string): TransitResult {
  const t = computeTransits(nowIso, ayanamsa);

  const natalLagna = chart?.ascendant?.sign ?? chart?.summary?.lagna ?? "";
  const natalMoon = chart?.summary?.rashi ?? "";
  const lagnaIdx = signIdxOf(natalLagna);
  const moonIdx = signIdxOf(natalMoon);

  const planets = t.planet_position.map((p: any) => {
    const sIdx = p.rasi.id;
    const lon = p.longitude ?? 0;
    const nk = nakInfo(lon);
    const lat = p.latitude ?? 0;
    return {
      planet: p.name,
      sign: p.rasi.name,
      sign_index: sIdx,
      longitude: Number(lon.toFixed(2)),
      full_degree: Number(lon.toFixed(2)),
      dms: toDMS(p.degree ?? 0),
      sign_lord: SIGN_LORDS[sIdx] ?? "",
      degree: Number((p.degree ?? 0).toFixed(2)),
      nakshatra: nk.nakshatra,
      pada: nk.pada,
      nak_lord: nk.nakLord,
      sub_lord: nk.subLord,
      latitude: Number(lat.toFixed(2)),
      shara: toShara(lat),
      speed: Number((p.speed ?? 0).toFixed(2)),
      ra: Number((p.ra ?? 0).toFixed(2)),
      dec: Number((p.dec ?? 0).toFixed(2)),
      retrograde: Boolean(p.is_retrograde),
      house_from_lagna: houseFrom(sIdx, lagnaIdx),
      house_from_moon: houseFrom(sIdx, moonIdx),
    };
  });

  const highlights: string[] = [];
  const find = (n: string) => planets.find((p) => p.planet === n);

  // Sade Sati — Saturn in the 12th, 1st or 2nd from the natal Moon.
  const sat = find("Saturn");
  if (sat && sat.house_from_moon && [12, 1, 2].includes(sat.house_from_moon)) {
    const phase =
      sat.house_from_moon === 12 ? "rising (first) phase"
      : sat.house_from_moon === 1 ? "peak phase"
      : "setting (final) phase";
    highlights.push(
      `Sade Sati is active — Saturn is in the ${ordinal(sat.house_from_moon)} house from your Moon (${phase}). A period that rewards patience and steady effort.`
    );
  } else if (sat && sat.house_from_moon && [4, 8].includes(sat.house_from_moon)) {
    highlights.push(
      `Dhaiya (Kantaka Shani) — Saturn is in the ${ordinal(sat.house_from_moon)} house from your Moon. Pace yourself and avoid overload.`
    );
  }
  if (sat?.house_from_lagna) {
    highlights.push(`Saturn is transiting your ${ordinal(sat.house_from_lagna)} house (${sat.sign})${sat.retrograde ? ", retrograde" : ""}.`);
  }

  const jup = find("Jupiter");
  if (jup?.house_from_lagna) {
    highlights.push(`Jupiter is transiting your ${ordinal(jup.house_from_lagna)} house (${jup.sign})${jup.retrograde ? ", retrograde" : ""} — a generally supportive influence on that area of life.`);
  }

  const rahu = find("Rahu");
  const ketu = find("Ketu");
  if (rahu?.house_from_lagna && ketu?.house_from_lagna) {
    highlights.push(`The Rahu–Ketu axis runs through your ${ordinal(rahu.house_from_lagna)}–${ordinal(ketu.house_from_lagna)} houses, where life is asking for growth and letting-go right now.`);
  }

  return {
    datetime: t.datetime,
    natal: { lagna: natalLagna, lagna_idx: lagnaIdx, moon: natalMoon, moon_idx: moonIdx },
    planets,
    highlights,
  };
}

/** Compact transit summary passed to the AI for current/near-future accuracy. */
export function compactTransitForAI(tr: TransitResult) {
  return {
    as_of: tr.datetime,
    note: "LIVE planetary transits right now. Use these (together with the dasha) for the PRESENT and near-FUTURE phases of the answer.",
    natal_reference: { lagna: tr.natal.lagna, moon_rashi: tr.natal.moon },
    // Labelled as TRANSIT houses. A plain "house_from_lagna" was being read as
    // a birth-chart placement, so a report would say "Jupiter in the 1st house"
    // about a Jupiter that is only passing through it this year.
    transiting_planets: tr.planets.map((p) => ({
      planet: p.planet,
      sign: p.sign,
      transit_house_from_lagna: p.house_from_lagna,
      transit_house_from_moon: p.house_from_moon,
      retrograde: p.retrograde,
    })),
    highlights: tr.highlights,
  };
}
