/**
 * Muhurat finder — auspicious time windows for an activity (marriage, business,
 * travel, general) on a given date & place. Built on the Panchang's Choghadiya,
 * excluding the inauspicious periods (Rahu Kaal / Yamaganda / Gulika).
 */
import { buildPanchang, type PanchangInput } from "./panchang";
import { computeTransits, eclipticLongitudes, sunRiseSet } from "./engine";
import { buildIsoDatetime } from "./validate";
import { inChaturmas } from "./chaturmas";

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

  // Chaturmas — Devshayani to Devuthani Ekadashi, when Vishnu "sleeps" and
  // marriages are paused. Both boundaries are real lunar dates (see
  // chaturmas.ts); the old solar proxy ("Sun in Cancer→Libra") blocked whole
  // valid weeks, e.g. all of July 2026 when Chaturmas starts on the 25th.
  const cm = inChaturmas(input.date, input.latitude, input.longitude, input.timezone, input.ayanamsa);
  if (cm) {
    blockers.push(`Chaturmas — the holy four-month period runs from Devshayani Ekadashi (${cm.start}) to Devuthani Ekadashi (${cm.end}); marriages are not performed until it ends.`);
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
  const { year, month, latitude, longitude, timezone, ayanamsa } = input;
  // Lowercased to match buildMuhurat — without it "Marriage" missed both the
  // PREFERRED lookup and the ==="marriage" test, reporting all 31 days suitable.
  const activity = (input.activity || "general").toLowerCase();
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-indexed here
  const pref = PREFERRED[activity] || PREFERRED.general;
  const days: Array<{
    date: string; day: number; suitable: boolean;
    nakshatra: string; tithi: string; paksha: string; weekday: string;
    windows: number; quality: "best" | "good" | "ok" | "avoid";
  }> = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    try {
      const p = buildPanchang({ date, latitude, longitude, timezone, ayanamsa });
      let suitable = true;
      if (activity === "marriage") suitable = marriageDayCheck({ date, latitude, longitude, timezone, ayanamsa, activity }, p).suitable;

      // How many genuinely usable windows the day actually has, excluding the
      // eighths that are Rahu Kaal / Yamaganda / Gulika. Without this every
      // non-marriage activity reported `suitable: true` for all 30 days and
      // the calendar told the user nothing.
      const windows = suitable
        ? [...(p.day_choghadiya ?? []), ...(p.night_choghadiya ?? [])]
            .filter((c: any) => pref.includes(c.name) && !c.blocked).length
        : 0;
      days.push({
        date, day, suitable, windows,
        quality: "ok", // ranked against the rest of the month once all days are in
        nakshatra: p.nakshatra, tithi: p.tithi, paksha: p.paksha, weekday: p.weekday,
      });
    } catch {
      days.push({
        date, day, suitable: false, windows: 0, quality: "avoid",
        nakshatra: "", tithi: "", paksha: "", weekday: "",
      });
    }
  }
  // Quality is RELATIVE to the rest of the month, which is the only thing that
  // works across activities. Absolute thresholds can't: `business` and `travel`
  // accept four of the seven choghadiya where `marriage` accepts three, so any
  // fixed cut-off that discriminates for one paints the other's whole month a
  // single colour. And a calendar is asking "which days this month are best?"
  // anyway — a relative answer is the honest one.
  const usable = days.filter((d) => d.suitable).map((d) => d.windows).sort((a, b) => b - a);
  if (usable.length) {
    const at = (frac: number) => usable[Math.min(usable.length - 1, Math.floor(usable.length * frac))];
    const bestCut = at(0.25);
    const goodCut = at(0.65);
    for (const d of days) {
      if (!d.suitable) { d.quality = "avoid"; continue; }
      d.quality = d.windows >= bestCut ? "best" : d.windows >= goodCut ? "good" : "ok";
    }
  }

  return { year, month, activity, days };
}

export function buildMuhurat(input: MuhuratInput) {
  const activity = (input.activity || "general").toLowerCase();
  const pref = PREFERRED[activity] || PREFERRED.general;
  const p = buildPanchang(input);

  // `!c.blocked` drops the eighths that ARE Rahu Kaal / Yamaganda / Gulika.
  // They share boundaries with the choghadiya, so without this filter the
  // module recommended them: on Thursday, Rahu Kaal *is* Amrit and was being
  // offered as the single best window of the day.
  const pick = (list: any[], phase: string) =>
    list
      .filter((c) => pref.includes(c.name) && !c.blocked)
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
    // `seq` is chronological position: the day slots run 0-7 from sunrise and
    // the night slots 8-15 from sunset, so ordering by it orders by clock time
    // without having to re-parse the formatted strings.
    const good = [
      ...p.day_choghadiya.map((c: any, i: number) => ({ ...c, phase: "Day", seq: i })),
      ...p.night_choghadiya.map((c: any, i: number) => ({ ...c, phase: "Night", seq: 8 + i })),
    ].filter((c) => ["Amrit", "Shubh", "Labh"].includes(c.name) && !c.blocked);
    const night = good.filter((c) => c.phase === "Night");
    const pool = night.length ? night : good;
    const rank: Record<string, number> = { Amrit: 0, Shubh: 1, Labh: 2 };
    const pheras = [...pool].sort((a, b) => rank[a.name] - rank[b.name])[0];
    if (pheras) {
      // A wedding runs Baraat → Jaimala → Pheras, so the earlier stages must
      // fall BEFORE the pheras window. Choosing purely by choghadiya rank
      // produced timelines like "pheras 6:14 PM, groom arrives 12:34 AM" —
      // which reads as an obvious mistake to anyone actually planning a day.
      const before = pool
        .filter((c) => c.seq < pheras.seq)
        .sort((a, b) => a.seq - b.seq);
      const stage = (s: string, desc: string, c: any) =>
        ({ stage: s, desc, name: c.name, start: c.start, end: c.end });

      // Prefer the two windows immediately preceding the pheras; if the pheras
      // is the earliest good window, only it is offered rather than inventing
      // an out-of-order slot.
      const [baraat, jaimala] = before.length >= 2
        ? [before[before.length - 2], before[before.length - 1]]
        : [before[0], undefined];

      if (baraat) ceremony.push(stage("Baraat / Welcome", "groom's arrival", baraat));
      if (jaimala) ceremony.push(stage("Jaimala / Var Mala", "garland exchange", jaimala));
      ceremony.push({ ...stage("Pheras (Vivah Muhurat)", "the main wedding ceremony", pheras), primary: true });
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
    // Enumerated, NOT `p.periods` wholesale. Abhijit lives in the same object
    // and is the most auspicious window of the day — passing the object
    // through published it under the UI's red "Avoid these periods" heading.
    avoid: {
      rahu_kaal: p.periods?.rahu_kaal ?? null,
      yamaganda: p.periods?.yamaganda ?? null,
      gulika: p.periods?.gulika ?? null,
    },
    abhijit: p.periods?.abhijit ?? null,
    windows,
    ceremony,
    note: activity === "marriage" && !suitable
      ? "This day is not suitable for marriage — see the reasons below. Try another date."
      : `Auspicious Choghadiya windows for ${activity}. Avoid Rahu Kaal, Yamaganda and Gulika periods.`,
  };
}
