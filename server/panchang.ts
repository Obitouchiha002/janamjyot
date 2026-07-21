/**
 * Daily Panchang — computed from our own engine (no external API).
 *
 *   Tithi · Nakshatra · Yoga · Karana · Vara (weekday)
 *   Sunrise / Sunset · Rahu Kaal · Yamaganda · Gulika Kaal · Choghadiya
 *
 * Panchang elements are read at SUNRISE for the chosen place & date (the classical
 * convention). All inauspicious-period maths follow the standard 8-part day/night
 * division with the fixed per-weekday segment indices.
 */
import { eclipticLongitudes, sunRiseSet } from "./engine";
import { buildIsoDatetime } from "./validate";

const norm = (x: number) => ((x % 360) + 360) % 360;

const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const NAKSHATRAS = [
  "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha",
  "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha",
  "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati",
];
const YOGAS = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula",
  "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana",
  "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];
const TITHI_NAMES = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami",
  "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi",
];
const KARANA_MOVABLE = ["Bava", "Balava", "Kaulava", "Taitila", "Gara", "Vanija", "Vishti (Bhadra)"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Segment index (1-based) of the inauspicious period per weekday (Sun..Sat).
const RAHU = [8, 2, 7, 5, 6, 4, 3];
const YAMA = [5, 4, 3, 2, 1, 7, 6];
const GULIKA = [7, 6, 5, 4, 3, 2, 1];

// Choghadiya cycle + per-weekday starting index (day & night).
const CHO_CYCLE = ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog"];
const CHO_DAY_START = [0, 3, 6, 2, 5, 1, 4];   // Sun..Sat
const CHO_NIGHT_START = [5, 1, 4, 0, 3, 6, 2]; // Sun..Sat
const CHO_GOOD = new Set(["Amrit", "Shubh", "Labh"]);
const CHO_BAD = new Set(["Rog", "Kaal", "Udveg"]);

// Hora — the Chaldean order, descending. The first hora of a day belongs to
// that weekday's lord, which is exactly what HORA_START encodes (Sun..Sat).
const HORA_LORDS = ["Sun", "Venus", "Mercury", "Moon", "Saturn", "Jupiter", "Mars"];
const HORA_START = [0, 3, 6, 2, 5, 1, 4];
const HORA_GOOD = new Set(["Jupiter", "Venus", "Mercury", "Moon"]);
const HORA_BAD = new Set(["Saturn", "Mars", "Sun"]);

function fmtTime(d: Date | null, tz: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

export interface PanchangInput {
  date: string;
  latitude: number;
  longitude: number;
  timezone: string;
  ayanamsa: number;
  /**
   * The moment being asked about, for live "what is running now" callers.
   * Before sunrise this rolls the whole panchang back to the previous date,
   * because the Vedic day runs sunrise-to-sunrise. Omit for a plain
   * panchang-for-a-date (the Panchang page), where the civil date is meant.
   */
  atInstant?: Date;
}

export function buildPanchang(input: PanchangInput): any {
  const { date, latitude, longitude, timezone, ayanamsa } = input;

  // Start of the chosen local day → find that day's sunrise/sunset.
  const localMidnight = new Date(buildIsoDatetime(date, "00:00:00", timezone));
  const { sunrise, sunset } = sunRiseSet(localMidnight, latitude, longitude);

  // The Vedic day runs sunrise-to-sunrise, so a live caller asking about a
  // moment before today's sunrise is really asking about YESTERDAY's panchang.
  // Rebuild the whole thing from that date — shifting only the weekday would
  // stamp yesterday's Rahu Kaal and choghadiya pattern onto today's daylight
  // hours, which is wrong for both days.
  if (input.atInstant && sunrise && input.atInstant.getTime() < sunrise.getTime()) {
    const prev = new Date(`${date}T12:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return buildPanchang({ ...input, date: prev.toISOString().slice(0, 10), atInstant: undefined });
  }
  const refMoment = sunrise ?? new Date(buildIsoDatetime(date, "12:00:00", timezone));

  // Panchang elements at sunrise.
  const { sunSidereal, moonSidereal } = eclipticLongitudes(refMoment, ayanamsa);
  const elong = norm(moonSidereal - sunSidereal); // Moon - Sun (sidereal == tropical diff)

  // Tithi
  const tithiIdx = Math.floor(elong / 12); // 0..29
  const paksha = tithiIdx < 15 ? "Shukla" : "Krishna";
  const tNum = tithiIdx % 15;
  const tithiName = tNum < 14 ? TITHI_NAMES[tNum] : (paksha === "Shukla" ? "Purnima" : "Amavasya");

  // Nakshatra
  const nakIdx = Math.floor(moonSidereal / (360 / 27)) % 27;

  // Yoga
  const yogaIdx = Math.floor(norm(sunSidereal + moonSidereal) / (360 / 27)) % 27;

  // Karana (half-tithi)
  const kIdx = Math.floor(elong / 6); // 0..59
  let karana: string;
  if (kIdx === 0) karana = "Kimstughna";
  else if (kIdx <= 56) karana = KARANA_MOVABLE[(kIdx - 1) % 7];
  else karana = ["Shakuni", "Chatushpada", "Naga"][kIdx - 57];

  // Vara (weekday). Classically the vara runs sunrise-to-sunrise, so the hours
  // between midnight and sunrise still belong to the PREVIOUS weekday — which
  // matters because Rahu Kaal, choghadiya and hora are all keyed off `dow`.
  //
  // For a date-driven panchang (the Panchang page) the civil weekday of the
  // requested date is what the user means, so that stays the default. Live
  // callers that ask "what is running right now" pass `atInstant`, and get the
  // vara that actually governs that moment.
  const dow = new Date(date + "T00:00:00Z").getUTCDay();

  // Inauspicious periods (need sunrise & sunset)
  const periods: Record<string, { start: string; end: string; note?: string }> = {};
  if (sunrise && sunset) {
    const dayLen = sunset.getTime() - sunrise.getTime();
    const part = dayLen / 8;
    const seg = (oneBasedIdx: number) => {
      const s = new Date(sunrise.getTime() + (oneBasedIdx - 1) * part);
      const e = new Date(s.getTime() + part);
      return { start: fmtTime(s, timezone), end: fmtTime(e, timezone) };
    };
    periods.rahu_kaal = seg(RAHU[dow]);
    periods.yamaganda = seg(YAMA[dow]);
    periods.gulika = seg(GULIKA[dow]);

    // Abhijit — the 8th of the day's 15 muhurtas, straddling local apparent
    // noon (~48 min). Traditionally it is NOT reckoned on Wednesday, so we say
    // so rather than quietly offering a window nobody would use.
    const muhurtaLen = dayLen / 15;
    const abhijitStart = new Date(sunrise.getTime() + 7 * muhurtaLen);
    periods.abhijit = dow === 3
      ? { start: "—", end: "—", note: "Abhijit is not reckoned on Wednesday." }
      : {
          start: fmtTime(abhijitStart, timezone),
          end: fmtTime(new Date(abhijitStart.getTime() + muhurtaLen), timezone),
        };
  }

  // Choghadiya (day + night)
  const dayChoghadiya: any[] = [];
  const nightChoghadiya: any[] = [];
  if (sunrise && sunset) {
    // Rahu Kaal / Yamaganda / Gulika occupy the SAME eighths of the day as the
    // day choghadiya, so they align exactly — and on five weekdays out of
    // seven a blocked eighth is also a "good" choghadiya (Thursday's Rahu Kaal
    // is Amrit, the highest-ranked window there is). Tag them here so anything
    // that recommends a timing can exclude them, instead of cheerfully
    // offering Rahu Kaal as the best muhurat.
    const blockedSeg: Record<number, string> = {
      [GULIKA[dow]]: "Gulika",
      [YAMA[dow]]: "Yamaganda",
      [RAHU[dow]]: "Rahu Kaal", // last: Rahu Kaal wins if two ever coincide
    };
    const dayPart = (sunset.getTime() - sunrise.getTime()) / 8;
    for (let i = 0; i < 8; i++) {
      const name = CHO_CYCLE[(CHO_DAY_START[dow] + i) % 7];
      const s = new Date(sunrise.getTime() + i * dayPart);
      const e = new Date(s.getTime() + dayPart);
      dayChoghadiya.push({ name, start: fmtTime(s, timezone), end: fmtTime(e, timezone), quality: CHO_GOOD.has(name) ? "good" : CHO_BAD.has(name) ? "bad" : "neutral", blocked: blockedSeg[i + 1] ?? null });
    }
    const nextSunrise = sunRiseSet(sunset, latitude, longitude).sunrise;
    if (nextSunrise) {
      const nightPart = (nextSunrise.getTime() - sunset.getTime()) / 8;
      for (let i = 0; i < 8; i++) {
        // The night sequence steps BACK two, not forward one.
        //
        // The +1 form (copied from the day loop above) made every night an
        // exact replica of some other day — Wednesday night came out identical
        // to Sunday day, which is the copy-paste tell. Verified against live
        // ProKerala choghadiya for four weekdays: our day rows matched exactly
        // and every night row was wrong until this step was corrected.
        //   Sunday night, ProKerala: Shubh Amrit Char Rog Kaal Labh Udveg
        //   which is indices 5,3,1,6,4,2,0 — a clean -2 walk.
        const name = CHO_CYCLE[(((CHO_NIGHT_START[dow] - 2 * i) % 7) + 7) % 7];
        const s = new Date(sunset.getTime() + i * nightPart);
        const e = new Date(s.getTime() + nightPart);
        // Rahu Kaal and friends are daytime-only, so nothing is blocked here —
        // the field is present purely so day and night entries share a shape.
        nightChoghadiya.push({ name, start: fmtTime(s, timezone), end: fmtTime(e, timezone), quality: CHO_GOOD.has(name) ? "good" : CHO_BAD.has(name) ? "bad" : "neutral", blocked: null });
      }
    }
  }

  // Hora — 24 planetary hours, the first ruled by the weekday's lord and the
  // rest walking the Chaldean order. Day and night horas are UNEQUAL: twelve
  // of dayLen/12 then twelve of nightLen/12, which is the convention ProKerala
  // prints (their Thursday horas run 67m39s, not 60m).
  const hora: any[] = [];
  if (sunrise && sunset) {
    const nextSunrise = sunRiseSet(sunset, latitude, longitude).sunrise;
    const dayHora = (sunset.getTime() - sunrise.getTime()) / 12;
    const nightHora = nextSunrise ? (nextSunrise.getTime() - sunset.getTime()) / 12 : null;
    // The lord index advances by one continuously across all 24 hours.
    const startIdx = HORA_START[dow];
    for (let i = 0; i < 24; i++) {
      const isDay = i < 12;
      if (!isDay && nightHora == null) break;
      const len = isDay ? dayHora : nightHora!;
      const base = isDay ? sunrise.getTime() : sunset.getTime();
      const s = new Date(base + (isDay ? i : i - 12) * len);
      const lord = HORA_LORDS[(startIdx + i) % 7];
      hora.push({
        lord,
        is_day: isDay,
        start: fmtTime(s, timezone),
        end: fmtTime(new Date(s.getTime() + len), timezone),
        quality: HORA_GOOD.has(lord) ? "good" : HORA_BAD.has(lord) ? "bad" : "neutral",
      });
    }
  }

  return {
    hora,
    date,
    timezone,
    weekday: WEEKDAYS[dow],
    sunrise: fmtTime(sunrise, timezone),
    sunset: fmtTime(sunset, timezone),
    tithi: `${paksha} ${tithiName}`,
    paksha,
    nakshatra: NAKSHATRAS[nakIdx],
    yoga: YOGAS[yogaIdx],
    karana,
    moon_sign: SIGNS[Math.floor(moonSidereal / 30) % 12],
    sun_sign: SIGNS[Math.floor(sunSidereal / 30) % 12],
    periods,
    day_choghadiya: dayChoghadiya,
    night_choghadiya: nightChoghadiya,
  };
}
