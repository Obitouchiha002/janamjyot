/**
 * Muhurat finder — auspicious time windows for an activity (marriage, business,
 * travel, general) on a given date & place. Built on the Panchang's Choghadiya,
 * excluding the inauspicious periods (Rahu Kaal / Yamaganda / Gulika).
 */
import { buildPanchang, type PanchangInput } from "./panchang";
import { computeTransits, eclipticLongitudes, sunRiseSet } from "./engine";
import { buildIsoDatetime } from "./validate";

const NAK_NAMES = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];
// Indexes (0-based) of the Vivah (marriage) nakshatras.
const VIVAH_IDX = new Set([3, 4, 9, 11, 12, 14, 16, 18, 20, 25, 26]);

function angSep(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Does an auspicious Vivah window (a Vivah nakshatra with a non-Rikta/non-Amavasya
 * tithi) occur at ANY time today (sunrise → next sunrise)? Sampling the whole day
 * (not just sunrise) catches dates where the nakshatra begins late at night.
 */
function vivahWindowExists(input: MuhuratInput): { found: boolean; nakshatra?: string } {
  const midnight = new Date(buildIsoDatetime(input.date, "00:00:00", input.timezone));
  const sr = sunRiseSet(midnight, input.latitude, input.longitude).sunrise || midnight;
  for (let h = 0; h <= 24; h += 2) {
    const t = new Date(sr.getTime() + h * 3600_000);
    const { sunSidereal, moonSidereal } = eclipticLongitudes(t, input.ayanamsa);
    const m = ((moonSidereal % 360) + 360) % 360;
    const nakIdx = Math.floor(m / (360 / 27)) % 27;
    if (!VIVAH_IDX.has(nakIdx)) continue;
    const elong = (((moonSidereal - sunSidereal) % 360) + 360) % 360;
    const tIdx = Math.floor(elong / 12); // 0..29
    const num = tIdx % 15; // 0-based within paksha
    const rikta = [3, 8, 13].includes(num); // Chaturthi, Navami, Chaturdashi
    const amavasya = tIdx === 29;
    if (!rikta && !amavasya) return { found: true, nakshatra: NAK_NAMES[nakIdx] };
  }
  return { found: false };
}

/** Is the DAY itself fit for marriage? Returns blockers + positives. */
function marriageDayCheck(input: MuhuratInput, p: any): { suitable: boolean; blockers: string[]; positives: string[] } {
  const blockers: string[] = [];
  const positives: string[] = [];

  // Kharmas / Malmas — Sun in Sagittarius or Pisces (sidereal).
  if (p.sun_sign === "Sagittarius" || p.sun_sign === "Pisces") {
    blockers.push(`Kharmas (Malmas) — the Sun is in ${p.sun_sign}, an inauspicious solar month; marriages are not held until the Sun moves on (around mid-month).`);
  }

  // Chaturmas — Devshayani to Devuthani Ekadashi (~mid-July to mid-November),
  // when Vishnu "sleeps" and marriages are paused. Approximated by the Sun's
  // sidereal sign (Cancer → Libra).
  if (["Cancer", "Leo", "Virgo", "Libra"].includes(p.sun_sign)) {
    blockers.push(`Chaturmas — the Sun is in ${p.sun_sign}; this is the holy four-month period (≈ mid-July to mid-November, until Devuthani Ekadashi) when marriages are not performed.`);
  }

  // Guru Ast / Shukra Ast — Jupiter or Venus combust (too close to the Sun).
  try {
    const t = computeTransits(buildIsoDatetime(input.date, "12:00:00", input.timezone), input.ayanamsa);
    const lon = (n: string) => t.planet_position.find((x: any) => x.name === n)?.longitude ?? 0;
    const sun = lon("Sun");
    if (angSep(lon("Jupiter"), sun) < 11) blockers.push("Guru Ast — Jupiter is combust (too close to the Sun). Marriages are paused during this period (often several weeks).");
    if (angSep(lon("Venus"), sun) < 10) blockers.push("Shukra Ast — Venus is combust. Marriages are avoided until Venus rises again.");
  } catch { /* ignore */ }

  // Vivah nakshatra + acceptable tithi anywhere during the day (not just sunrise).
  const vw = vivahWindowExists(input);
  if (vw.found) positives.push(`An auspicious Vivah nakshatra (${vw.nakshatra}) with a good tithi occurs today.`);
  else blockers.push("No auspicious Vivah nakshatra + tithi window occurs today.");

  return { suitable: blockers.length === 0, blockers, positives };
}

// Ranked preferred Choghadiya per activity (index 0 = best). Sets genuinely
// differ — e.g. business/travel value Char, marriage values Amrit/Shubh.
const PREFERRED: Record<string, string[]> = {
  marriage: ["Amrit", "Shubh", "Labh"],
  business: ["Labh", "Amrit", "Shubh", "Char"],
  travel: ["Char", "Labh", "Amrit", "Shubh"],
  education: ["Shubh", "Amrit", "Labh"],
  general: ["Amrit", "Shubh", "Labh"],
};
const TIPS: Record<string, string> = {
  marriage: "For marriage, Amrit and Shubh are the most auspicious choghadiyas. Avoid Rahu Kaal.",
  business: "For business, money deals and openings, Labh (gain) is ideal — then Amrit, Shubh and Char.",
  travel: "For travel and journeys, Char (movement) is excellent, along with Labh and Amrit.",
  education: "For study, learning and exams, Shubh works best, followed by Amrit and Labh.",
  general: "Amrit, Shubh and Labh are the auspicious choghadiyas. Avoid Rahu Kaal.",
};

export interface MuhuratInput extends PanchangInput { activity: string; }

/** Scan a whole month: which dates are suitable for the activity (for the calendar). */
export function scanMonth(input: { year: number; month: number; latitude: number; longitude: number; timezone: string; ayanamsa: number; activity: string }) {
  const { year, month, latitude, longitude, timezone, ayanamsa, activity } = input;
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed here
  const days: Array<{ date: string; day: number; suitable: boolean; nakshatra: string }> = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    try {
      const p = buildPanchang({ date, latitude, longitude, timezone, ayanamsa });
      let suitable = true;
      if (activity === "marriage") suitable = marriageDayCheck({ date, latitude, longitude, timezone, ayanamsa, activity }, p).suitable;
      days.push({ date, day, suitable, nakshatra: p.nakshatra });
    } catch {
      days.push({ date, day, suitable: false, nakshatra: "" });
    }
  }
  return { year, month, activity, days };
}

export function buildMuhurat(input: MuhuratInput) {
  const activity = (input.activity || "general").toLowerCase();
  const pref = PREFERRED[activity] || PREFERRED.general;
  const p = buildPanchang(input);

  const pick = (list: any[], phase: string) =>
    list
      .filter((c) => pref.includes(c.name))
      .map((c) => ({ phase, name: c.name, start: c.start, end: c.end, quality: c.quality, rank: pref.indexOf(c.name), best: c.name === pref[0] }));

  // For marriage, first check whether the DAY itself is fit (Kharmas, Guru/Shukra
  // Ast, Vivah nakshatra, tithi). If not, no muhurat windows are shown.
  let suitable = true;
  let blockers: string[] = [];
  let positives: string[] = [];
  if (activity === "marriage") {
    const c = marriageDayCheck(input, p);
    suitable = c.suitable; blockers = c.blockers; positives = c.positives;
  }

  const windows = suitable
    ? [...pick(p.day_choghadiya, "Day"), ...pick(p.night_choghadiya, "Night")].sort((a, b) => a.rank - b.rank)
    : [];

  // Marriage ceremony timing guide (only when the day is suitable) — derived from
  // the auspicious Choghadiya, preferring night windows for the main ceremony.
  let ceremony: any[] = [];
  if (activity === "marriage" && suitable) {
    const good = [
      ...p.day_choghadiya.map((c: any) => ({ ...c, phase: "Day" })),
      ...p.night_choghadiya.map((c: any) => ({ ...c, phase: "Night" })),
    ].filter((c) => ["Amrit", "Shubh", "Labh"].includes(c.name));
    const night = good.filter((c) => c.phase === "Night");
    const pool = night.length ? night : good;
    const rank: Record<string, number> = { Amrit: 0, Shubh: 1, Labh: 2 };
    const pheras = [...pool].sort((a, b) => rank[a.name] - rank[b.name])[0];
    if (pheras) {
      const others = pool.filter((c) => c !== pheras);
      ceremony.push({ stage: "Pheras (Vivah Muhurat)", desc: "the main wedding ceremony", name: pheras.name, start: pheras.start, end: pheras.end, primary: true });
      if (others[0]) ceremony.push({ stage: "Baraat / Welcome", desc: "groom's arrival", name: others[0].name, start: others[0].start, end: others[0].end });
      if (others[1]) ceremony.push({ stage: "Jaimala / Var Mala", desc: "garland exchange", name: others[1].name, start: others[1].start, end: others[1].end });
    }
  }

  return {
    date: p.date,
    weekday: p.weekday,
    activity,
    suitable,
    blockers,
    positives,
    recommended: pref[0],
    tip: TIPS[activity] || TIPS.general,
    preferred: pref,
    panchang: { tithi: p.tithi, nakshatra: p.nakshatra, yoga: p.yoga, sun_sign: p.sun_sign, sunrise: p.sunrise, sunset: p.sunset },
    avoid: p.periods,
    windows,
    ceremony,
    note: activity === "marriage" && !suitable
      ? "This day is not suitable for marriage — see the reasons below. Try another date."
      : `Auspicious Choghadiya windows for ${activity}. Avoid Rahu Kaal, Yamaganda and Gulika periods.`,
  };
}
