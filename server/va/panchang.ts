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
import { eclipticLongitudes, sunRiseSet } from "../engine";
import { buildIsoDatetime } from "../validate";

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

function fmtTime(d: Date | null, tz: string): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(d);
}

export interface PanchangInput { date: string; latitude: number; longitude: number; timezone: string; ayanamsa: number; }

export function buildPanchang(input: PanchangInput) {
  const { date, latitude, longitude, timezone, ayanamsa } = input;

  // Start of the chosen local day → find that day's sunrise/sunset.
  const localMidnight = new Date(buildIsoDatetime(date, "00:00:00", timezone));
  const { sunrise, sunset } = sunRiseSet(localMidnight, latitude, longitude);
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

  // Vara (weekday of the chosen date)
  const dow = new Date(date + "T00:00:00Z").getUTCDay();

  // Inauspicious periods (need sunrise & sunset)
  // start_ms/end_ms (epoch) ride along with the display strings so callers can
  // compare windows exactly (e.g. Aaj Ka Din's "best time" excludes Rahu Kaal).
  const periods: Record<string, { start: string; end: string; start_ms: number; end_ms: number }> = {};
  if (sunrise && sunset) {
    const dayLen = sunset.getTime() - sunrise.getTime();
    const part = dayLen / 8;
    const seg = (oneBasedIdx: number) => {
      const s = new Date(sunrise.getTime() + (oneBasedIdx - 1) * part);
      const e = new Date(s.getTime() + part);
      return { start: fmtTime(s, timezone), end: fmtTime(e, timezone), start_ms: s.getTime(), end_ms: e.getTime() };
    };
    periods.rahu_kaal = seg(RAHU[dow]);
    periods.yamaganda = seg(YAMA[dow]);
    periods.gulika = seg(GULIKA[dow]);
  }

  // Choghadiya (day + night)
  const dayChoghadiya: any[] = [];
  const nightChoghadiya: any[] = [];
  if (sunrise && sunset) {
    const dayPart = (sunset.getTime() - sunrise.getTime()) / 8;
    for (let i = 0; i < 8; i++) {
      const name = CHO_CYCLE[(CHO_DAY_START[dow] + i) % 7];
      const s = new Date(sunrise.getTime() + i * dayPart);
      const e = new Date(s.getTime() + dayPart);
      dayChoghadiya.push({ name, start: fmtTime(s, timezone), end: fmtTime(e, timezone), start_ms: s.getTime(), end_ms: e.getTime(), quality: CHO_GOOD.has(name) ? "good" : CHO_BAD.has(name) ? "bad" : "neutral" });
    }
    const nextSunrise = sunRiseSet(sunset, latitude, longitude).sunrise;
    if (nextSunrise) {
      const nightPart = (nextSunrise.getTime() - sunset.getTime()) / 8;
      for (let i = 0; i < 8; i++) {
        // The night sequence steps 5 places around the cycle, not 1 (Monday night: Char, Rog,
        // Kaal, Labh, Udveg, Shubh, Amrit, Char). With +1 only the first night slot was right;
        // live, 7:48–9:17 PM (Rog) was called "Labh".
        const name = CHO_CYCLE[(CHO_NIGHT_START[dow] + 5 * i) % 7];
        const s = new Date(sunset.getTime() + i * nightPart);
        const e = new Date(s.getTime() + nightPart);
        nightChoghadiya.push({ name, start: fmtTime(s, timezone), end: fmtTime(e, timezone), start_ms: s.getTime(), end_ms: e.getTime(), quality: CHO_GOOD.has(name) ? "good" : CHO_BAD.has(name) ? "bad" : "neutral" });
      }
    }
  }

  return {
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
