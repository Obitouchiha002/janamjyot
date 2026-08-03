/**
 * Hindu calendar — "what is special about today" from the REAL panchang.
 *
 * Everyday reason to open the app that no birth-chart needs: today's tithi,
 * the lunar month (masa), sankrantis, the vrat days (Ekadashi/Pradosh/Shivratri
 * /Chaturthi), Purnima/Amavasya, Sawan Somwar, and the major festivals — all
 * COMPUTED from our own astronomy engine, never a hard-coded date list that
 * rots. It reuses the same sankranti + new-moon + tithi-at-sunrise machinery
 * that the (published-date-verified) Chaturmas feature uses.
 *
 * Two honesty notes:
 *  • The calendar DAY takes the tithi prevailing at local SUNRISE — the standard
 *    convention. So "today is Ekadashi" means Ekadashi held at sunrise here.
 *  • Festival day-of rules have regional variants (amanta vs purnimanta, and
 *    tie-break rules when a tithi spans two sunrises). This uses the amanta
 *    month + tithi-at-sunrise; the guard verifies the big ones against real
 *    published 2026 dates, and anything not verified is not shipped as a named
 *    festival — it still shows the reliable tithi ("Shukla Chaturthi") instead.
 */
import { eclipticLongitudes, sunRiseSet } from "./engine";
import { buildIsoDatetime } from "./validate";
import { newMoonBefore, sunSidereal, elongation } from "./chaturmas";

const DAY_MS = 86_400_000;

/* ── month + tithi names ───────────────────────────────────────────────────*/
const MASA = [
  "Chaitra", "Vaishakha", "Jyeshtha", "Ashadha", "Shravana", "Bhadrapada",
  "Ashwina", "Kartika", "Margashirsha", "Pausha", "Magha", "Phalguna",
];
// Amanta rule (verified in Chaturmas): the month is named by the sign the Sun
// ENTERS within it. Cancer→Ashadha, Scorpio→Kartika, etc.
const SIGN_TO_MASA: Record<number, string> = {
  0: "Chaitra", 1: "Vaishakha", 2: "Jyeshtha", 3: "Ashadha", 4: "Shravana",
  5: "Bhadrapada", 6: "Ashwina", 7: "Kartika", 8: "Margashirsha", 9: "Pausha",
  10: "Magha", 11: "Phalguna",
};
const TITHI_NAMES = [
  "Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dwadashi",
  "Trayodashi", "Chaturdashi",
];
const SANKRANTI_NAME: Record<number, string> = {
  9: "Makar Sankranti", 3: "Karka Sankranti", 0: "Mesha Sankranti (Solar New Year)",
  6: "Tula Sankranti", 4: "Simha Sankranti", 1: "Vrishabha Sankranti",
  2: "Mithuna Sankranti", 5: "Kanya Sankranti", 7: "Vrishchika Sankranti",
  8: "Dhanu Sankranti", 10: "Kumbha Sankranti", 11: "Meena Sankranti",
};

export type Tri = { en: string; hi: string; hinglish: string };
export type SpecialKind = "festival" | "vrat" | "sankranti" | "moon" | "month" | "tithi";
export interface Special {
  key: string;
  kind: SpecialKind;
  label: Tri;
  note?: Tri;
}
export interface HinduDay {
  date: string;
  masa: string;
  paksha: "Shukla" | "Krishna";
  tithi: string;      // e.g. "Shukla Chaturthi"
  tithiNum: number;   // 1..15 within the paksha
  weekday: string;
  isAdhik: boolean;
  specials: Special[];   // most important first
  headline: Special | null; // the single most special thing today (or null)
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Tithi index 0..29 at a given instant (0 = Shukla Pratipada .. 29 = Amavasya). */
function tithiIndexAt(t: Date, ayanamsa: number): number {
  return Math.floor(elongation(t, ayanamsa) / 12) % 30;
}

/** Local sunrise instant for `date` (YYYY-MM-DD). */
function sunriseOf(date: string, lat: number, lon: number, tz: string): Date | null {
  return sunRiseSet(new Date(buildIsoDatetime(date, "00:00:00", tz)), lat, lon).sunrise ?? null;
}

/** The instant of a given part of `date` locally — the reference moment a
 *  festival's tithi is judged at. midnight = nishita (late in the night). */
function partInstant(date: string, part: string, lat: number, lon: number, tz: string): Date {
  if (part === "sunrise") return sunriseOf(date, lat, lon, tz) ?? new Date(buildIsoDatetime(date, "06:00:00", tz));
  if (part === "sunset")
    return sunRiseSet(new Date(buildIsoDatetime(date, "00:00:00", tz)), lat, lon).sunset
      ?? new Date(buildIsoDatetime(date, "18:30:00", tz));
  const time = part === "noon" ? "12:00:00" : part === "afternoon" ? "15:30:00" : "23:59:00"; // midnight = nishita
  return new Date(buildIsoDatetime(date, time, tz));
}

/** The amanta masa for `date`: the sign the Sun enters between this month's new
 *  moon and the next. Returns Adhik when the month contains no sankranti. */
function masaFor(refInstant: Date, ayanamsa: number): { masa: string; isAdhik: boolean } {
  const monthStart = newMoonBefore(refInstant, ayanamsa);
  if (!monthStart) return { masa: "", isAdhik: false };
  const signAt = (t: Date) => Math.floor(sunSidereal(t, ayanamsa) / 30) % 12;
  let prev = signAt(monthStart);
  // Scan the ~29.5-day lunation for the one sign-ingress it contains.
  for (let d = 1; d <= 31; d++) {
    const t = new Date(monthStart.getTime() + d * DAY_MS);
    // stop at the next new moon (month over)
    if (d >= 28 && newMoonBefore(t, ayanamsa)?.getTime() !== monthStart.getTime()) break;
    const s = signAt(t);
    if (s !== prev) return { masa: SIGN_TO_MASA[s] ?? "", isAdhik: false };
    prev = s;
  }
  // No sankranti inside the month → Adhik (extra) month, named after the NEXT
  // sign the Sun will enter.
  const next = new Date(monthStart.getTime() + 30 * DAY_MS);
  return { masa: SIGN_TO_MASA[(signAt(next) + 1) % 12] ?? "", isAdhik: true };
}

/* ── festival table: (masa, paksha, tithiNum) → name ───────────────────────
   Amanta months. Only the entries the guard confirms against real published
   2026 dates are trusted as named festivals; the rest still show as the plain
   tithi so nothing is ever WRONG, only less specific. */
type Paksha = "Shukla" | "Krishna";
// Most festivals fall on the day their tithi holds at SUNRISE. A few big ones
// use a specific part of the day instead — Diwali/Dhanteras at pradosh (sunset),
// Maha Shivratri at nishita (midnight), Ganesh Chaturthi at madhyahna (midday),
// Dussehra at aparahna (afternoon). `at` says which; default = sunrise.
type DayPart = "sunrise" | "sunset" | "midnight" | "noon" | "afternoon";
interface Fest { masa: string; paksha: Paksha; tithi: number; key: string; label: Tri; at?: DayPart; }
const FESTIVALS: Fest[] = [
  { masa: "Chaitra", paksha: "Shukla", tithi: 1, key: "gudi_padwa", label: { en: "Gudi Padwa / Ugadi (Hindu New Year)", hi: "गुड़ी पड़वा / उगादि (नववर्ष)", hinglish: "Gudi Padwa / Ugadi (Hindu Naya Saal)" } },
  { masa: "Chaitra", paksha: "Shukla", tithi: 9, key: "ram_navami", label: { en: "Ram Navami", hi: "राम नवमी", hinglish: "Ram Navami" } },
  { masa: "Chaitra", paksha: "Shukla", tithi: 15, key: "hanuman_jayanti", at: "sunset", label: { en: "Hanuman Jayanti", hi: "हनुमान जयंती", hinglish: "Hanuman Jayanti" } },
  { masa: "Vaishakha", paksha: "Shukla", tithi: 3, key: "akshaya_tritiya", label: { en: "Akshaya Tritiya", hi: "अक्षय तृतीया", hinglish: "Akshaya Tritiya" } },
  { masa: "Ashadha", paksha: "Shukla", tithi: 2, key: "rath_yatra", label: { en: "Rath Yatra", hi: "रथ यात्रा", hinglish: "Rath Yatra" } },
  { masa: "Ashadha", paksha: "Shukla", tithi: 11, key: "devshayani", label: { en: "Devshayani Ekadashi (Chaturmas begins)", hi: "देवशयनी एकादशी (चातुर्मास आरंभ)", hinglish: "Devshayani Ekadashi (Chaturmas shuru)" } },
  { masa: "Ashadha", paksha: "Shukla", tithi: 15, key: "guru_purnima", label: { en: "Guru Purnima", hi: "गुरु पूर्णिमा", hinglish: "Guru Purnima" } },
  { masa: "Shravana", paksha: "Shukla", tithi: 15, key: "raksha_bandhan", label: { en: "Raksha Bandhan", hi: "रक्षा बंधन", hinglish: "Raksha Bandhan" } },
  { masa: "Shravana", paksha: "Krishna", tithi: 8, key: "janmashtami", label: { en: "Krishna Janmashtami", hi: "कृष्ण जन्माष्टमी", hinglish: "Krishna Janmashtami" } },
  { masa: "Bhadrapada", paksha: "Shukla", tithi: 4, key: "ganesh_chaturthi", at: "noon", label: { en: "Ganesh Chaturthi", hi: "गणेश चतुर्थी", hinglish: "Ganesh Chaturthi" } },
  { masa: "Bhadrapada", paksha: "Shukla", tithi: 15, key: "anant_chaturdashi", label: { en: "Anant Chaturdashi", hi: "अनंत चतुर्दशी", hinglish: "Anant Chaturdashi" } },
  { masa: "Ashwina", paksha: "Shukla", tithi: 1, key: "navratri", label: { en: "Sharad Navratri begins", hi: "शारदीय नवरात्रि आरंभ", hinglish: "Sharad Navratri shuru" } },
  { masa: "Ashwina", paksha: "Shukla", tithi: 8, key: "durga_ashtami", label: { en: "Durga Ashtami", hi: "दुर्गा अष्टमी", hinglish: "Durga Ashtami" } },
  { masa: "Ashwina", paksha: "Shukla", tithi: 10, key: "dussehra", at: "afternoon", label: { en: "Dussehra (Vijayadashami)", hi: "दशहरा (विजयादशमी)", hinglish: "Dussehra (Vijayadashami)" } },
  { masa: "Ashwina", paksha: "Shukla", tithi: 15, key: "sharad_purnima", label: { en: "Sharad Purnima", hi: "शरद पूर्णिमा", hinglish: "Sharad Purnima" } },
  // Krishna-paksha of the Diwali cluster: named by PURNIMANTA Kartika, which is
  // AMANTA Ashwina (one month back). Getting this wrong put Diwali in December.
  { masa: "Ashwina", paksha: "Krishna", tithi: 4, key: "karva_chauth", label: { en: "Karva Chauth", hi: "करवा चौथ", hinglish: "Karva Chauth" } },
  { masa: "Ashwina", paksha: "Krishna", tithi: 13, key: "dhanteras", at: "sunset", label: { en: "Dhanteras", hi: "धनतेरस", hinglish: "Dhanteras" } },
  { masa: "Ashwina", paksha: "Krishna", tithi: 14, key: "narak_chaturdashi", at: "sunset", label: { en: "Narak Chaturdashi (Choti Diwali)", hi: "नरक चतुर्दशी (छोटी दिवाली)", hinglish: "Narak Chaturdashi (Choti Diwali)" } },
  { masa: "Ashwina", paksha: "Krishna", tithi: 15, key: "diwali", at: "sunset", label: { en: "Diwali (Lakshmi Puja)", hi: "दिवाली (लक्ष्मी पूजा)", hinglish: "Diwali (Lakshmi Puja)" } },
  { masa: "Kartika", paksha: "Shukla", tithi: 1, key: "govardhan", at: "sunset", label: { en: "Govardhan Puja", hi: "गोवर्धन पूजा", hinglish: "Govardhan Puja" } },
  { masa: "Kartika", paksha: "Shukla", tithi: 2, key: "bhai_dooj", label: { en: "Bhai Dooj", hi: "भाई दूज", hinglish: "Bhai Dooj" } },
  { masa: "Kartika", paksha: "Shukla", tithi: 11, key: "devuthani", label: { en: "Devuthani Ekadashi (Chaturmas ends)", hi: "देवउठनी एकादशी (चातुर्मास समाप्त)", hinglish: "Devuthani Ekadashi (Chaturmas khatam)" } },
  { masa: "Kartika", paksha: "Shukla", tithi: 15, key: "kartik_purnima", label: { en: "Kartik Purnima / Dev Diwali", hi: "कार्तिक पूर्णिमा / देव दिवाली", hinglish: "Kartik Purnima / Dev Diwali" } },
  { masa: "Magha", paksha: "Shukla", tithi: 5, key: "vasant_panchami", label: { en: "Vasant Panchami", hi: "वसंत पंचमी", hinglish: "Vasant Panchami" } },
  { masa: "Magha", paksha: "Krishna", tithi: 14, key: "maha_shivratri", at: "midnight", label: { en: "Maha Shivratri", hi: "महा शिवरात्रि", hinglish: "Maha Shivratri" } },
  { masa: "Phalguna", paksha: "Shukla", tithi: 15, key: "holi", label: { en: "Holika Dahan / Holi", hi: "होलिका दहन / होली", hinglish: "Holika Dahan / Holi" } },
];
// Only festivals whose computed day matches the real published date (proven in
// check:hindu-calendar against 2026) are shown by name. `govardhan` is excluded:
// it sits in the tightly-compressed post-Diwali cluster where our simplified
// ephemeris and Drik Panchang differ by ~a day, so that date shows the reliable
// tithi ("Kartika Shukla Pratipada") instead of a possibly-wrong name.
export const VERIFIED_FESTIVALS = new Set<string>(
  FESTIVALS.map((f) => f.key).filter((k) => k !== "govardhan"),
);

/* ── recurring vrat tags from the tithi alone (always reliable) ─────────────*/
function tithiVrats(paksha: Paksha, n: number, weekdayIdx: number): Special[] {
  const out: Special[] = [];
  if (n === 11) out.push({ key: "ekadashi", kind: "vrat", label: { en: "Ekadashi (fasting day)", hi: "एकादशी (व्रत)", hinglish: "Ekadashi (vrat ka din)" } });
  if (n === 13) out.push({ key: "pradosh", kind: "vrat", label: { en: "Pradosh Vrat", hi: "प्रदोष व्रत", hinglish: "Pradosh Vrat" } });
  if (paksha === "Krishna" && n === 14) out.push({ key: "masik_shivratri", kind: "vrat", label: { en: "Masik Shivratri", hi: "मासिक शिवरात्रि", hinglish: "Masik Shivratri" } });
  if (n === 4) out.push({ key: "chaturthi", kind: "vrat",
    label: paksha === "Krishna"
      ? { en: "Sankashti Chaturthi", hi: "संकष्टी चतुर्थी", hinglish: "Sankashti Chaturthi" }
      : { en: "Vinayaka Chaturthi", hi: "विनायक चतुर्थी", hinglish: "Vinayaka Chaturthi" } });
  return out;
}

/**
 * Everything special about `date` at this location — the real panchang made
 * human. `weekOfMonth` lets us say "Sawan ka pehla Somwar".
 */
export function hinduDay(
  date: string, latitude: number, longitude: number, timeZone: string, ayanamsa: number,
): HinduDay {
  const sr = sunriseOf(date, latitude, longitude, timeZone);
  const ref = sr ?? new Date(buildIsoDatetime(date, "06:00:00", timeZone));
  const tIdx = tithiIndexAt(ref, ayanamsa);                 // 0..29
  const paksha: Paksha = tIdx < 15 ? "Shukla" : "Krishna";
  const tithiNum = (tIdx % 15) + 1;                          // 1..15
  const isAmavasya = tIdx === 29;
  const isPurnima = tIdx === 14;
  const tithiLabel = isPurnima ? "Purnima" : isAmavasya ? "Amavasya" : `${paksha} ${TITHI_NAMES[tithiNum - 1]}`;

  const { masa, isAdhik } = masaFor(ref, ayanamsa);
  const [Y, M, D] = date.split("-").map(Number);
  const weekdayIdx = new Date(Date.UTC(Y, M - 1, D)).getUTCDay();
  const weekday = WEEKDAYS[weekdayIdx];

  const specials: Special[] = [];

  // 1) Named festival (only if the tithi-at-sunrise matches an amanta rule).
  if (!isAdhik) {
    // Each festival is checked at ITS OWN reference time (sunrise by default,
    // but pradosh/nishita/madhyahna/aparahna for the ones observed then) — that
    // is what moves Diwali/Shivratri/Ganesh onto the correct day.
    for (const f of FESTIVALS) {
      if (f.masa !== masa || !VERIFIED_FESTIVALS.has(f.key)) continue;
      const inst = partInstant(date, f.at ?? "sunrise", latitude, longitude, timeZone);
      const ti = tithiIndexAt(inst, ayanamsa);
      const fp: Paksha = ti < 15 ? "Shukla" : "Krishna";
      const fn = (ti % 15) + 1;
      if (fp === f.paksha && fn === f.tithi) {
        specials.push({ key: f.key, kind: "festival", label: f.label });
        break;
      }
    }
  }

  // 2) Sankranti — did the Sun change sign on this date? (solar festival)
  const sunAtStart = Math.floor(sunSidereal(new Date(buildIsoDatetime(date, "00:00:01", timeZone)), ayanamsa) / 30) % 12;
  const sunAtEnd = Math.floor(sunSidereal(new Date(buildIsoDatetime(date, "23:59:00", timeZone)), ayanamsa) / 30) % 12;
  if (sunAtStart !== sunAtEnd) {
    const name = SANKRANTI_NAME[sunAtEnd] ?? "Sankranti";
    specials.push({ key: "sankranti", kind: "sankranti", label: { en: name, hi: name, hinglish: name } });
  }

  // 3) Purnima / Amavasya
  if (isPurnima) specials.push({ key: "purnima", kind: "moon", label: { en: "Purnima (full moon)", hi: "पूर्णिमा", hinglish: "Purnima (poornmaasi)" } });
  if (isAmavasya) specials.push({ key: "amavasya", kind: "moon", label: { en: "Amavasya (new moon)", hi: "अमावस्या", hinglish: "Amavasya" } });

  // 4) Recurring vrats from the tithi
  specials.push(...tithiVrats(paksha, tithiNum, weekdayIdx));

  // 5) Sawan Somwar — Monday in Shravana (Sawan). Highly searched, very personal
  //    to devotees; we also number it within the month.
  if (masa === "Shravana" && weekdayIdx === 1) {
    const which = Math.min(4, Math.floor((D - 1) / 7) + 1); // rough 1st..4th Monday of the month
    const ord: Tri = [
      { en: "", hi: "", hinglish: "" },
      { en: "first", hi: "पहला", hinglish: "pehla" },
      { en: "second", hi: "दूसरा", hinglish: "doosra" },
      { en: "third", hi: "तीसरा", hinglish: "teesra" },
      { en: "fourth", hi: "चौथा", hinglish: "chautha" },
    ][which];
    specials.push({ key: "sawan_somwar", kind: "festival",
      label: { en: `Sawan Somwar (the ${ord.en} Monday of Shravan)`, hi: `सावन सोमवार (श्रावण का ${ord.hi} सोमवार)`, hinglish: `Sawan Somwar (Shravan ka ${ord.hinglish} Somwar)` } });
  }

  // 6) Month/paksha start — the day after Amavasya (Shukla Pratipada) begins the
  //    lunar month people name.
  if (paksha === "Shukla" && tithiNum === 1 && masa) {
    specials.push({ key: "month_start", kind: "month",
      label: { en: `${masa} month begins`, hi: `${masa} मास आरंभ`, hinglish: `${masa} mahina shuru` } });
  }

  // Order by importance: festival > sankranti > moon > vrat > month.
  const order: Record<SpecialKind, number> = { festival: 0, sankranti: 1, moon: 2, vrat: 3, month: 4, tithi: 5 };
  specials.sort((a, b) => order[a.kind] - order[b.kind]);

  return {
    date, masa, paksha, tithi: tithiLabel, tithiNum, weekday, isAdhik,
    specials,
    headline: specials[0] ?? null,
  };
}

export const _internals = { masaFor, tithiIndexAt, FESTIVALS };
