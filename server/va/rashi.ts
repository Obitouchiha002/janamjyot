/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * Rashi, the way it is actually reckoned in India. It comes with proof, because
 * everyone knows their rashi and a wrong one destroys trust instantly.
 *
 * People mean one of THREE different things by "meri rashi":
 *   1. Janma Rashi (Chandra Rashi): the sidereal (Lahiri) sign the MOON was in at
 *      birth. Kundli, Rashifal, Sade Sati and Guna Milan all use this. This is
 *      "the" rashi.
 *   2. Naam Rashi: from the first akshar of the name, via the Avakahada chakra
 *      (27 nakshatras × 4 padas = 108 syllables, 9 per rashi). Many people know
 *      only this one, and it often differs from the Janma Rashi.
 *   3. Surya Rashi: the Sun's sidereal sign. Also given: the Western (tropical) sun
 *      sign that English newspapers use. It is usually one sign ahead.
 *
 * Janma Rashi comes with proof: the Moon's exact degree, nakshatra and pada, the
 * exact times the Moon entered and left that rashi around the birth, and how far
 * the birth time would have to be off for the rashi to change. There is also a
 * month-long table of which rashi the Moon was in on which dates, so a "but
 * my pandit said X" can be traced to the date that would give X.
 *
 * Verified on 16 Jan 2005, 17:00, Delhi: this engine gives 352.85°, an independent
 * Meeus lunar formula gives 352.85°, and Drik Panchang shows "Meena upto 06:13 AM,
 * Jan 17". All three put it in Meen, Revati pada 2.
 */
import { eclipticLongitudes } from "../engine";
import { buildIsoDatetime } from "../validate";
import { SIGNS, NAKSHATRAS } from "../normalize";
import { SWARS, SWAR_BY_KEY, signOfPada } from "./swar";

export const SIGN_HI = ["Mesh", "Vrishabh", "Mithun", "Kark", "Singh", "Kanya", "Tula", "Vrishchik", "Dhanu", "Makar", "Kumbh", "Meen"];
const NAK_SPAN = 360 / 27;
const PADA_SPAN = 360 / 108;

const dms = (deg: number) => {
  const d = Math.floor(deg), mf = (deg - d) * 60, m = Math.floor(mf), s = Math.round((mf - m) * 60);
  return `${d}°${String(m).padStart(2, "0")}′${String(s === 60 ? 59 : s).padStart(2, "0")}″`;
};
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "9 Nov 1984, 1:15 PM" (or without the year for the compact month table). */
const fmt = (ms: number, tz: string, withYear = true) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.day} ${MON[Number(p.month) - 1]}${withYear ? ` ${p.year}` : ""}, ${p.hour}:${p.minute} ${String(p.dayPeriod).toUpperCase()}`;
};

const moonSignAt = (ms: number, ayan: number) => Math.floor(eclipticLongitudes(new Date(ms), ayan).moonSidereal / 30) % 12;

/** Moon-sign windows between two instants, with each change located to the minute. */
function moonWindows(fromMs: number, toMs: number, ayan: number) {
  const STEP = 2 * 3600 * 1000; // the Moon spends ~2.25 days per sign, so 2h can't skip one
  const out: Array<{ sign: number; from: number; to: number }> = [];
  let cur = moonSignAt(fromMs, ayan), start = fromMs, prev = fromMs;
  for (let t = fromMs + STEP; t <= toMs; t += STEP) {
    const s = moonSignAt(t, ayan);
    if (s !== cur) {
      let lo = prev, hi = t;
      while (hi - lo > 30 * 1000) { const mid = (lo + hi) / 2; if (moonSignAt(mid, ayan) === cur) lo = mid; else hi = mid; }
      out.push({ sign: cur, from: start, to: hi });
      cur = s; start = hi;
    }
    prev = t;
  }
  out.push({ sign: cur, from: start, to: toMs });
  return out;
}

// ---- Naam Rashi: the Avakahada chakra (shared 108-swar table, server/swar.ts) --------------
// Each pada is 3°20′, so a swar's sign = floor(padaIndex / 9); see swar.ts.

// In English spelling some aksharas collide: ट/त → "t", ड/द → "d", ण/न → "n", ष/श/स → "sh"/"s",
// ठ/थ → "th". The most common reading of each Roman prefix comes first; others are alternatives.
const ROMAN: Array<{ prefix: string; keys: string[] }> = [
  { prefix: "chh", keys: ["chha"] },
  { prefix: "ta", keys: ["ta", "tta"] }, { prefix: "ti", keys: ["ti", "tti"] }, { prefix: "tu", keys: ["tu", "ttu"] },
  { prefix: "te", keys: ["te", "tte"] }, { prefix: "to", keys: ["to", "tto"] },
  { prefix: "da", keys: ["da", "dda"] }, { prefix: "di", keys: ["di", "ddi"] }, { prefix: "du", keys: ["du", "ddu"] },
  { prefix: "de", keys: ["de", "dde"] }, { prefix: "do", keys: ["do", "ddo"] },
  { prefix: "dha", keys: ["dha", "ddha"] },
  { prefix: "tha", keys: ["tha", "ttha"] },
  { prefix: "na", keys: ["na", "nna"] },
  { prefix: "sha", keys: ["sha", "sa"] }, { prefix: "shi", keys: ["si", "sha"] }, { prefix: "shu", keys: ["su", "sha"] },
  { prefix: "she", keys: ["se", "sha"] }, { prefix: "sho", keys: ["so", "sha"] }, { prefix: "shr", keys: ["sha", "si"] },
  { prefix: "ba", keys: ["va", "bha"] }, { prefix: "bi", keys: ["vi", "bhi"] }, { prefix: "bu", keys: ["vu", "bhu"] },
  { prefix: "be", keys: ["bhe", "ve"] }, { prefix: "bo", keys: ["bho", "vo"] },
  { prefix: "kha", keys: ["khi"] }, { prefix: "kri", keys: ["ki"] }, { prefix: "kr", keys: ["ki"] },
  { prefix: "fa", keys: ["pha"] }, { prefix: "ph", keys: ["pha"] },
];

function normaliseName(name: string) {
  let n = String(name || "").trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
  n = n.replace(/^w/, "v").replace(/^aa/, "a").replace(/^ee/, "i").replace(/^oo/, "u").replace(/^ai/, "e").replace(/^au/, "o");
  // Conjunct aksharas take the first consonant's syllable: प्रि (Priya) → "pi", कृ (Krishna) → "ki",
  // व्यो (Vyom) → "vo", श्रे (Shreya) → "she", स्वा (Swati) → "sa", त्रि (Tripti) → "ti",
  // स्मि (Smita) → "si", स्ने (Sneha) → "se", क्षि (Kshitij) → "ki". An "h" digraph (sh, ch, chh,
  // kh, gh, jh, th, dh, ph, bh) is ONE letter, so it is kept whole.
  const run = (n.match(/^[bcdfghjklmnpqrstvwxyz]+/) || [""])[0];
  if (run) {
    const first = (run.match(/^(chh|ch|sh|kh|gh|jh|th|dh|ph|bh|ng)/) || [run[0]])[0];
    if (run.length > first.length) n = first + n.slice(run.length);
  }
  // long-vowel spellings after the first consonant cluster: "vaa" → "va", "dee" → "di", "soo" → "su"
  n = n.replace(/^([^aeiou]+)aa/, "$1a").replace(/^([^aeiou]+)ee/, "$1i").replace(/^([^aeiou]+)oo/, "$1u").replace(/^([^aeiou]+)ai/, "$1e").replace(/^([^aeiou]+)au/, "$1o");
  return n;
}

export function naamRashi(name: string) {
  const n = normaliseName(name);
  if (!n) return null;
  const direct = new Map(SWARS.map((w) => [w.key, { nak: w.nak, pada: w.pada }]));
  let keys: string[] = [];
  const special = ROMAN.filter((r) => n.startsWith(r.prefix)).sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (special) keys = special.keys;
  else {
    const hit = SWARS.filter((w) => !/^(dd|tt|nn)/.test(w.key) && w.key !== "yna" && n.startsWith(w.key)).sort((a, b) => b.key.length - a.key.length)[0];
    if (hit) keys = [hit.key];
  }
  // No swar with this exact vowel (e.g. ध्रु "Dhruv" → "dhu"): fall back to the same consonant's
  // swar, marked approximate. Traditional lists group such names by consonant.
  let approximate = false;
  if (!keys.length) {
    const cons = (n.match(/^[^aeiou]+/) || [""])[0];
    const same = cons ? SWARS.filter((w) => !/^(dd|tt|nn)/.test(w.key) && w.key.startsWith(cons) && /^[aeiou]$/.test(w.key.charAt(cons.length))) : [];
    if (same.length) { keys = [same[0].key]; approximate = true; }
  }
  if (!keys.length) return null;
  const options = [...new Set(keys)].filter((k) => direct.has(k)).map((k) => {
    const { nak, pada } = direct.get(k)!;
    const s = signOfPada(nak, pada);
    const sw = SWAR_BY_KEY.get(k)!;
    return { key: k, akshar: `${sw.label} (${sw.dev})`, sign: SIGNS[s], sign_hi: SIGN_HI[s], nakshatra: NAKSHATRAS[nak], pada };
  });
  const distinct = [...new Set(options.map((o) => o.sign))];
  return {
    from_name: String(name).trim().split(/\s+/)[0],
    primary: options[0],
    alternatives: distinct.length > 1 ? options.slice(1).filter((o) => o.sign !== options[0].sign) : [],
    approximate,
    note: approximate
      ? "This exact akshar has no swar of its own; grouped by its consonant, as traditional lists do."
      : distinct.length > 1
        ? "In English spelling this akshar can be read two ways (e.g. त/ट, द/ड, न/ण). The first is the usual reading; the exact Hindi akshar decides."
        : "",
  };
}

export function rashiInfo(chart: any, ayanamsa: number) {
  const b = chart?.birth_details || {};
  const tz: string = b.timezone || "Asia/Kolkata";
  const time = String(b.time_of_birth || "12:00:00").slice(0, 8);
  const birthMs = Date.parse(buildIsoDatetime(b.date_of_birth, time.length === 5 ? `${time}:00` : time, tz));
  if (!Number.isFinite(birthMs)) return null;

  const { moonSidereal, sunSidereal, sunTropical } = eclipticLongitudes(new Date(birthMs), ayanamsa);
  const sign = Math.floor(moonSidereal / 30) % 12;
  const nak = Math.floor(moonSidereal / NAK_SPAN) % 27;
  const pada = Math.floor((moonSidereal % NAK_SPAN) / PADA_SPAN) + 1;

  const DAY = 86400000;
  const windows = moonWindows(birthMs - 16 * DAY, birthMs + 16 * DAY, ayanamsa);
  const mine = windows.find((w) => w.from <= birthMs && w.to > birthMs)!;
  const marginMs = Math.min(birthMs - mine.from, mine.to - birthMs);
  const hours = marginMs / 3600000;

  // Is the rashi the same for the whole birth DATE (local)? Then the birth time doesn't matter.
  const dayStart = Date.parse(buildIsoDatetime(b.date_of_birth, "00:00:00", tz));
  const dayEnd = dayStart + DAY - 60000;
  const wholeDay = mine.from <= dayStart && mine.to >= dayEnd;

  const confidence = wholeDay
    ? "certain: the Moon was in this rashi for the whole birth date, so any birth time that day gives the same rashi"
    : hours >= 3
      ? `high: the birth time would have to be off by more than ${Math.floor(hours)} hours for the rashi to change`
      : `check the birth time: the Moon changed rashi ${Math.round(marginMs / 60000)} minutes ${birthMs - mine.from < mine.to - birthMs ? "before" : "after"} the given birth time, so an inexact time can change the rashi`;

  const nearbyChange = !wholeDay && hours < 3
    ? { other_sign: SIGNS[birthMs - mine.from < mine.to - birthMs ? windows[windows.indexOf(mine) - 1]?.sign ?? sign : windows[windows.indexOf(mine) + 1]?.sign ?? sign], at: fmt(birthMs - mine.from < mine.to - birthMs ? mine.from : mine.to, tz) }
    : null;

  return {
    janma_rashi: {
      sign: SIGNS[sign], sign_hi: SIGN_HI[sign],
      moon_degree_in_sign: dms(moonSidereal % 30),
      moon_longitude: Math.round(moonSidereal * 100) / 100,
      nakshatra: NAKSHATRAS[nak], pada,
      moon_in_this_rashi: { from: fmt(mine.from, tz), to: fmt(mine.to, tz) },
      whole_birth_date_same: wholeDay,
      confidence,
      nearby_change: nearbyChange ? { ...nearbyChange, other_sign_hi: SIGN_HI[SIGNS.indexOf(nearbyChange.other_sign)] } : null,
      method: "Moon's sidereal position at the moment of birth, Lahiri (Chitrapaksha) ayanamsa, which is the standard in Indian panchangs",
    },
    naam_rashi: naamRashi(b.name),
    // Lagna Rashi: the sign rising in the east at birth. It needs an exact birth time,
    // because it changes about every 2 hours.
    lagna_rashi: (() => {
      const sign = chart?.ascendant?.sign ?? chart?.d1_chart?.ascendant_sign;
      const i = SIGNS.indexOf(sign);
      return i >= 0 ? { sign, sign_hi: SIGN_HI[i], degree: typeof chart?.ascendant?.degree === "number" ? dms(chart.ascendant.degree) : null } : null;
    })(),
    surya_rashi: {
      vedic: { sign: SIGNS[Math.floor(sunSidereal / 30) % 12], sign_hi: SIGN_HI[Math.floor(sunSidereal / 30) % 12] },
      western: { sign: SIGNS[Math.floor(sunTropical / 30) % 12], note: "tropical zodiac, as in English newspaper horoscopes" },
    },
    moon_calendar_around_birth: windows
      .filter((w) => w.to > birthMs - 12 * DAY && w.from < birthMs + 12 * DAY)
      .map((w) => ({ sign: SIGNS[w.sign], sign_hi: SIGN_HI[w.sign], from: fmt(w.from, tz, false), to: fmt(w.to, tz, false), is_birth: w === mine })),
    birth: { date: b.date_of_birth, time, place: b.place_of_birth ?? null, timezone: tz, display: fmt(birthMs, tz) },
  };
}
