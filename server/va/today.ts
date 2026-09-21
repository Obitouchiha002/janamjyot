/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * "Aaj Ka Din": the deterministic calculation of one person's day.
 *
 * All the astrology that decides how today goes is computed here in plain
 * code. None of it is left for the AI to guess:
 *   - Tara Bala: today's nakshatra counted from the birth nakshatra.
 *   - Chandra Bala: the transit Moon's house from the natal Moon, including
 *     Chandrashtama.
 *   - Every change of the Moon's sign or nakshatra during the Vedic day, and
 *     of the tithi and yoga, with exact times.
 *   - Gochara of all 9 grahas from the natal Moon, with house from lagna and
 *     from the Moon.
 *   - Transit planets conjoining natal planets.
 *   - Mahadasha / Antardasha, plus the running Pratyantar computed here.
 *   - The weekday lord and the houses it rules for this lagna.
 *   - Panchang quality (tithi class, yoga, karana).
 *   - Best and avoid time windows: good Choghadiya minus Rahu Kaal,
 *     Yamaganda and Gulika, plus Abhijit.
 *   - A 1-10 day score, with every factor that moved it.
 *
 * The AI (generateDayReading) only turns this into readable guidance. The day
 * is the Vedic day, from sunrise to the next sunrise, at the birth place. That
 * keeps the reading identical on every refresh, and it can be cached per day.
 */
import { eclipticLongitudes, sunRiseSet } from "../engine";
import { buildIsoDatetime } from "../validate";
import { SIGNS, NAKSHATRAS } from "../normalize";
import { buildPanchang } from "./panchang";
import { buildTransit } from "../transit";

const SIGN_LORDS = [
  "Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury",
  "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter",
];
const VIM_ORDER = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];
const VIM_YEARS: Record<string, number> = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };
const WEEKDAY_LORDS = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn"];
const YOGAS = [
  "Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda", "Sukarma", "Dhriti", "Shula",
  "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi", "Vyatipata", "Variyana",
  "Parigha", "Shiva", "Siddha", "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti",
];
const BAD_YOGAS = new Set(["Vishkambha", "Atiganda", "Shula", "Ganda", "Vyaghata", "Vajra", "Vyatipata", "Parigha", "Vaidhriti"]);
const NAK_SPAN = 360 / 27;
const norm = (x: number) => ((x % 360) + 360) % 360;

/** What each house from the lagna governs. It names the life area the Moon (or any transit) lights up. */
export const HOUSE_AREAS: Record<number, string> = {
  1: "self, body, energy, confidence, appearance",
  2: "money & savings, family, food, speech",
  3: "courage, effort, communication, siblings, short trips, media/online",
  4: "home, mother, comfort, vehicles, property, peace of mind",
  5: "children, romance, creativity, studies, speculation, clever ideas",
  6: "daily work & routine, competition, health niggles, loans/debts, disputes",
  7: "spouse/partner, business deals, contracts, public dealings",
  8: "sudden events, secrets, research, in-laws, anxiety, hidden matters",
  9: "luck, father, teachers/gurus, religion, long journeys, higher learning",
  10: "career, status, boss/authority, reputation, big actions",
  11: "gains & income, friends, network, wishes fulfilled, elder siblings",
  12: "expenses, sleep & rest, foreign lands, hospitals, spirituality, losses",
};

// Tara Bala: the 9-fold cycle of nakshatras counted from the birth star.
const TARAS: Array<{ name: string; quality: "good" | "bad" | "mixed"; meaning: string; score: number }> = [
  { name: "Janma", quality: "mixed", meaning: "own birth star: body and mind are sensitive; avoid big risks and new starts, keep things routine", score: -0.5 },
  { name: "Sampat", quality: "good", meaning: "wealth star: gains, money matters and material progress go well", score: 1.5 },
  { name: "Vipat", quality: "bad", meaning: "danger star: losses, mistakes and obstacles more likely; double-check, avoid risk", score: -1.5 },
  { name: "Kshema", quality: "good", meaning: "well-being star: comfort, health and steady progress", score: 1 },
  { name: "Pratyari", quality: "bad", meaning: "obstacle star: opposition, delays, arguments; stay patient and diplomatic", score: -1.5 },
  { name: "Sadhana", quality: "good", meaning: "achievement star: efforts succeed, good for starting and finishing tasks", score: 1.5 },
  { name: "Naidhana (Vadha)", quality: "bad", meaning: "most adverse star: avoid important starts, travel risks and confrontations; rest and be careful", score: -2.5 },
  { name: "Mitra", quality: "good", meaning: "friendly star: support from people, cooperation, pleasant dealings", score: 1.5 },
  { name: "Param Mitra", quality: "good", meaning: "best-friend star: very favourable, help and luck come easily", score: 2 },
];

// Chandra Bala: the transit Moon's house from the natal Moon.
export function chandraBala(h: number): { quality: "good" | "bad" | "mixed"; meaning: string; score: number } {
  switch (h) {
    case 1: return { quality: "good", meaning: "Moon over own moon sign: emotions are strong and self-focused, mood-driven day", score: 1 };
    case 2: return { quality: "mixed", meaning: "focus on money, family and food; watch speech and spending", score: 0 };
    case 3: return { quality: "good", meaning: "courage and initiative high; efforts pay, good for communication", score: 1.5 };
    case 4: return { quality: "bad", meaning: "restless mind, home or mother matters may disturb peace", score: -1 };
    case 5: return { quality: "mixed", meaning: "creative and romantic, but judgement may be emotional; avoid speculation", score: 0 };
    case 6: return { quality: "good", meaning: "beats competition and pending work; good for health routines and clearing tasks", score: 1.5 };
    case 7: return { quality: "good", meaning: "good for partner, meetings and deals; people are receptive", score: 1.5 };
    case 8: return { quality: "bad", meaning: "CHANDRASHTAMA: the most sensitive Moon of the month; low mood, sudden hurdles, avoid big decisions, arguments and risky travel", score: -2.5 };
    case 9: return { quality: "mixed", meaning: "luck and faith active; good for guidance and elders, slower for material rush", score: 0.25 };
    case 10: return { quality: "good", meaning: "work gets attention; recognition, responsibility and action favoured", score: 1.5 };
    case 11: return { quality: "good", meaning: "best Moon: gains, wishes fulfilled, friends helpful", score: 2 };
    case 12: return { quality: "bad", meaning: "low energy, expenses and sleep issues; good only for rest, charity and spiritual work", score: -1.25 };
    default: return { quality: "mixed", meaning: "", score: 0 };
  }
}

// Classical gochara: the houses from the natal Moon where each graha gives good results.
export const GOCHARA_GOOD: Record<string, number[]> = {
  Sun: [3, 6, 10, 11], Moon: [1, 3, 6, 7, 10, 11], Mars: [3, 6, 11], Mercury: [2, 4, 6, 8, 10, 11],
  Jupiter: [2, 5, 7, 9, 11], Venus: [1, 2, 3, 4, 5, 8, 9, 11, 12], Saturn: [3, 6, 11], Rahu: [3, 6, 11], Ketu: [3, 6, 11],
};

// Classical beej mantra + a simple daan per graha: the remedy options handed to the AI
// (so it never invents a mantra).
const GRAHA_REMEDY: Record<string, { mantra: string; daan: string; deity: string }> = {
  Sun: { mantra: "Om Hraam Hreem Hraum Sah Suryaya Namah", daan: "offer water (arghya) to the rising Sun; donate wheat or jaggery", deity: "Surya" },
  Moon: { mantra: "Om Shraam Shreem Shraum Sah Chandraya Namah", daan: "offer water/milk on a Shivling; donate rice, milk or white cloth", deity: "Shiva" },
  Mars: { mantra: "Om Kraam Kreem Kraum Sah Bhaumaya Namah", daan: "recite Hanuman Chalisa; donate red lentils (masoor dal)", deity: "Hanuman" },
  Mercury: { mantra: "Om Braam Breem Braum Sah Budhaya Namah", daan: "feed green grass to a cow; donate green moong dal", deity: "Vishnu / Ganesha" },
  Jupiter: { mantra: "Om Graam Greem Graum Sah Gurave Namah", daan: "donate chana dal, turmeric or yellow sweets; touch elders' feet", deity: "Vishnu / Brihaspati" },
  Venus: { mantra: "Om Draam Dreem Draum Sah Shukraya Namah", daan: "donate white sweets, curd or rice; keep yourself well groomed", deity: "Lakshmi" },
  Saturn: { mantra: "Om Praam Preem Praum Sah Shanaischaraya Namah", daan: "light a mustard-oil lamp; help a worker or someone in need", deity: "Shani / Hanuman" },
  Rahu: { mantra: "Om Bhraam Bhreem Bhraum Sah Rahave Namah", daan: "recite Durga Chalisa; donate black sesame or a blanket", deity: "Durga" },
  Ketu: { mantra: "Om Sraam Sreem Sraum Sah Ketave Namah", daan: "worship Ganesha; feed a stray dog", deity: "Ganesha" },
};

// Direction in which a journey started today is traditionally avoided (Disha Shool).
const DISHA_SHOOL = ["West", "East", "North", "North", "South", "West", "East"];
const VAAR_COLOUR: Record<string, string> = {
  Sun: "Orange / copper", Moon: "White / silver", Mars: "Red", Mercury: "Green",
  Jupiter: "Yellow", Venus: "White / light pink", Saturn: "Blue / black",
};

export function fmtTime(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(ms));
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

type Kind = "moon_sign" | "nakshatra" | "tithi" | "yoga";

function indicesAt(ms: number, ayanamsa: number): Record<Kind, number> {
  const { sunSidereal: s, moonSidereal: m } = eclipticLongitudes(new Date(ms), ayanamsa);
  return {
    moon_sign: Math.floor(m / 30) % 12,
    nakshatra: Math.floor(m / NAK_SPAN) % 27,
    tithi: Math.floor(norm(m - s) / 12),
    yoga: Math.floor(norm(s + m) / NAK_SPAN) % 27,
  };
}

function tithiName(idx: number): string {
  const names = ["Pratipada", "Dwitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi", "Saptami", "Ashtami",
    "Navami", "Dashami", "Ekadashi", "Dwadashi", "Trayodashi", "Chaturdashi"];
  const paksha = idx < 15 ? "Shukla" : "Krishna";
  const n = idx % 15;
  return `${paksha} ${n < 14 ? names[n] : paksha === "Shukla" ? "Purnima" : "Amavasya"}`;
}

const labelFor: Record<Kind, (i: number) => string> = {
  moon_sign: (i) => SIGNS[i],
  nakshatra: (i) => NAKSHATRAS[i],
  tithi: tithiName,
  yoga: (i) => YOGAS[i],
};

/** Every change of Moon sign / nakshatra / tithi / yoga in [startMs, endMs), located to the minute. */
export function scanChanges(startMs: number, endMs: number, ayanamsa: number) {
  const STEP = 20 * 60 * 1000; // 20 min: far shorter than any of these segments
  const kinds: Kind[] = ["moon_sign", "nakshatra", "tithi", "yoga"];
  const events: Array<{ kind: Kind; from: string; to: string; at_ms: number; from_idx: number; to_idx: number }> = [];
  let prevT = startMs;
  let prev = indicesAt(startMs, ayanamsa);
  for (let t = startMs + STEP; t <= endMs + STEP; t += STEP) {
    const tt = Math.min(t, endMs);
    const cur = indicesAt(tt, ayanamsa);
    for (const k of kinds) {
      if (cur[k] !== prev[k]) {
        let lo = prevT, hi = tt;
        while (hi - lo > 30 * 1000) {
          const mid = (lo + hi) / 2;
          if (indicesAt(mid, ayanamsa)[k] === prev[k]) lo = mid; else hi = mid;
        }
        events.push({ kind: k, from: labelFor[k](prev[k]), to: labelFor[k](cur[k]), at_ms: Math.round(hi), from_idx: prev[k], to_idx: cur[k] });
      }
    }
    prev = cur;
    prevT = tt;
    if (tt >= endMs) break;
  }
  return events.sort((a, b) => a.at_ms - b.at_ms);
}

/** Running Pratyantar dasha inside the current Antardasha, which has its own from/to dates. */
function pratyantarAt(adLord: string, adFrom: string, adTo: string, atMs: number) {
  const start = Date.parse(adFrom);
  const end = Date.parse(adTo);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !VIM_YEARS[adLord]) return null;
  const total = end - start;
  const first = VIM_ORDER.indexOf(adLord);
  let acc = start;
  for (let i = 0; i < 9; i++) {
    const lord = VIM_ORDER[(first + i) % 9];
    const len = total * (VIM_YEARS[lord] / 120);
    if (atMs < acc + len || i === 8) {
      return { lord, from: new Date(acc).toISOString().slice(0, 10), to: new Date(acc + len).toISOString().slice(0, 10) };
    }
    acc += len;
  }
  return null;
}

export interface DayPlace { latitude: number; longitude: number; timezone: string; label?: string }

/** `place` = where the person lives NOW ("Mera Shehar" in Settings). Sunrise, Rahu Kaal,
 *  Choghadiya and Abhijit depend on it; the natal chart parts never do. Falls back to
 *  the birth place when not set. */
export function buildDayContext(chart: any, dateLocal: string, ayanamsa: number, place?: DayPlace) {
  const b = chart?.birth_details || {};
  const tz: string = place?.timezone || b.timezone || "Asia/Kolkata";
  const lat = place ? place.latitude : Number.isFinite(b.latitude) ? b.latitude : 28.6139;
  const lon = place ? place.longitude : Number.isFinite(b.longitude) ? b.longitude : 77.209;

  // ---- the Vedic day: sunrise to next sunrise ------------------------------
  const localMidnight = new Date(buildIsoDatetime(dateLocal, "00:00:00", tz));
  const rs = sunRiseSet(localMidnight, lat, lon);
  const sunrise = (rs.sunrise ?? new Date(buildIsoDatetime(dateLocal, "06:00:00", tz))).getTime();
  const sunset = (rs.sunset ?? new Date(buildIsoDatetime(dateLocal, "18:00:00", tz))).getTime();
  const nextSunrise = (sunRiseSet(new Date(sunset), lat, lon).sunrise?.getTime()) ?? sunrise + 24 * 3600 * 1000;
  const midday = (sunrise + sunset) / 2;
  // "Waking day" = sunrise → ~5h after sunset (bed-time): what the person actually lives through.
  const wakingEnd = Math.min(sunset + 5 * 3600 * 1000, nextSunrise);
  const dow = new Date(dateLocal + "T00:00:00Z").getUTCDay();

  const panchang = buildPanchang({ date: dateLocal, latitude: lat, longitude: lon, timezone: tz, ayanamsa });

  // ---- natal reference points ----------------------------------------------
  const lagnaSign: string = chart?.ascendant?.sign ?? chart?.summary?.lagna ?? "";
  const lagnaIdx = SIGNS.indexOf(lagnaSign);
  const natalMoonSign: string = chart?.summary?.rashi ?? "";
  const natalMoonIdx = SIGNS.indexOf(natalMoonSign);
  const birthNak: string = chart?.summary?.nakshatra ?? "";
  const birthNakIdx = NAKSHATRAS.indexOf(birthNak);
  const natalPlanets: any[] = (chart?.planets ?? chart?.planet_positions ?? []).map((p: any) => ({
    planet: p.planet ?? p.name, sign: p.sign, house: p.house, nakshatra: p.nakshatra, retrograde: !!p.retrograde,
  })).filter((p: any) => p.planet && p.sign);
  const housesRuledBy = (planet: string): number[] => {
    if (lagnaIdx < 0) return [];
    const out: number[] = [];
    for (let h = 1; h <= 12; h++) if (SIGN_LORDS[(lagnaIdx + h - 1) % 12] === planet) out.push(h);
    return out;
  };
  const natalOf = (planet: string) => {
    const p = natalPlanets.find((x) => x.planet === planet);
    return { natal_house: p?.house ?? null, natal_sign: p?.sign ?? null, rules_houses: housesRuledBy(planet) };
  };
  const houseFrom = (signIdx: number, ref: number) => (signIdx >= 0 && ref >= 0 ? ((signIdx - ref + 12) % 12) + 1 : null);

  // ---- what changes during the day -----------------------------------------
  const events = scanChanges(sunrise, nextSunrise, ayanamsa);

  // Moon segments (split at every sign/nakshatra change), each with its own Tara & Chandra Bala.
  const cuts = [sunrise, ...events.filter((e) => e.kind === "moon_sign" || e.kind === "nakshatra").map((e) => e.at_ms), nextSunrise];
  const moonSegments = [] as any[];
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], z = cuts[i + 1];
    if (z - a < 60 * 1000) continue;
    const idx = indicesAt((a + z) / 2, ayanamsa);
    const taraCount = birthNakIdx >= 0 ? ((idx.nakshatra - birthNakIdx + 27) % 27) + 1 : null;
    const tara = taraCount ? TARAS[(taraCount - 1) % 9] : null;
    const cbHouse = houseFrom(idx.moon_sign, natalMoonIdx);
    const cb = cbHouse ? chandraBala(cbHouse) : null;
    const houseFromLagna = houseFrom(idx.moon_sign, lagnaIdx);
    const moonSignIdx = idx.moon_sign;
    const overNatal = natalPlanets.filter((p) => p.sign === SIGNS[moonSignIdx] && p.planet !== "Moon").map((p) => p.planet);
    const oppositeNatal = natalPlanets.filter((p) => p.sign === SIGNS[(moonSignIdx + 6) % 12] && p.planet !== "Moon").map((p) => p.planet);
    moonSegments.push({
      from_ms: a, to_ms: z, from: fmtTime(a, tz), to: fmtTime(z, tz),
      moon_sign: SIGNS[moonSignIdx], nakshatra: NAKSHATRAS[idx.nakshatra],
      nakshatra_lord: VIM_ORDER[idx.nakshatra % 9],
      moon_house_from_lagna: houseFromLagna,
      life_area_lit_up: houseFromLagna ? HOUSE_AREAS[houseFromLagna] : null,
      tara_bala: tara ? { count: taraCount, tara: tara.name, quality: tara.quality, meaning: tara.meaning, score: tara.score } : null,
      chandra_bala: cb ? { house_from_natal_moon: cbHouse, quality: cb.quality, meaning: cb.meaning, score: cb.score } : null,
      moon_over_natal_planets: overNatal,
      moon_opposite_natal_planets: oppositeNatal,
    });
  }
  // The segment the person mostly lives through today (largest overlap with the waking day).
  const overlap = (s: any) => Math.max(0, Math.min(s.to_ms, wakingEnd) - Math.max(s.from_ms, sunrise));
  const primary = moonSegments.reduce((best, s) => (overlap(s) > overlap(best) ? s : best), moonSegments[0]);

  // ---- all 9 grahas (slow ones barely move in a day, so midday is the reference) ----
  const tr = buildTransit(chart, ayanamsa, new Date(midday).toISOString());
  const transits = tr.planets.map((p) => {
    const fromMoon = p.house_from_moon;
    const good = p.planet !== "Moon" && fromMoon ? GOCHARA_GOOD[p.planet]?.includes(fromMoon) ?? null : null;
    return {
      planet: p.planet, sign: p.sign, nakshatra: p.nakshatra, retrograde: p.retrograde,
      house_from_lagna: p.house_from_lagna, house_from_moon: fromMoon,
      gochara_from_moon: p.planet === "Moon" ? "see moon_segments" : good === null ? "unknown" : good ? "favourable" : "unfavourable",
      over_natal_planets: natalPlanets.filter((n) => n.sign === p.sign && n.planet !== p.planet).map((n) => n.planet),
    };
  });
  const tp = (n: string) => transits.find((t) => t.planet === n);

  // ---- dasha (with the Pratyantar the chart doesn't store) ---------------------
  const dc = chart?.dasha?.current ?? {};
  const pd = dc.antardasha && dc.antardasha_from && dc.antardasha_to ? pratyantarAt(dc.antardasha, dc.antardasha_from, dc.antardasha_to, midday) : null;
  const dashaLord = (lord: string | undefined) => lord ? { lord, ...natalOf(lord), transit_house_from_lagna: tp(lord)?.house_from_lagna ?? null, transit_sign: tp(lord)?.sign ?? null } : null;
  const dasha = {
    mahadasha: dashaLord(dc.mahadasha), mahadasha_to: dc.mahadasha_to ?? null,
    antardasha: dashaLord(dc.antardasha), antardasha_to: dc.antardasha_to ?? null,
    pratyantar: pd ? { ...dashaLord(pd.lord), from: pd.from, to: pd.to } : null,
  };
  const dashaLords = [dc.mahadasha, dc.antardasha, pd?.lord].filter(Boolean);
  const moonOnDashaLord = primary ? dashaLords.filter((l: string) => primary.moon_over_natal_planets.includes(l)) : [];

  // ---- weekday lord ----------------------------------------------------------
  const vaarLord = WEEKDAY_LORDS[dow];
  const weekday = { day: panchang.weekday, lord: vaarLord, ...natalOf(vaarLord), is_a_dasha_lord: dashaLords.includes(vaarLord) };

  // ---- panchang quality ------------------------------------------------------
  const sunriseIdx = indicesAt(sunrise, ayanamsa);
  const tNum = (sunriseIdx.tithi % 15) + 1;
  const tithiClass = ["Nanda (joy)", "Bhadra (good for work)", "Jaya (victory)", "Rikta (empty: avoid new starts)", "Purna (complete)"][(tNum - 1) % 5];
  const isAmavasya = sunriseIdx.tithi === 29;
  const isPurnima = sunriseIdx.tithi === 14;
  const isEkadashi = tNum === 11;
  const yogaBad = BAD_YOGAS.has(panchang.yoga);
  const vishti = /Vishti/.test(panchang.karana);

  // ---- time windows ----------------------------------------------------------
  const per = panchang.periods as Record<string, any>;
  const badStarts = ["rahu_kaal", "yamaganda", "gulika"].map((k) => per[k]?.start_ms).filter(Boolean);
  const clash = (c: any) => badStarts.some((s: number) => Math.abs(s - c.start_ms) < 1000);
  const goodDay = (panchang.day_choghadiya as any[]).filter((c) => c.quality === "good" && !clash(c));
  const goodEvening = (panchang.night_choghadiya as any[]).filter((c) => c.quality === "good" && c.start_ms < sunset + 4 * 3600 * 1000);
  const abhijit = dow !== 3
    ? { from_ms: midday - (sunset - sunrise) / 30, to_ms: midday + (sunset - sunrise) / 30 }
    : null;
  const win = (name: string, a: number, z: number) => ({ name, from: fmtTime(a, tz), to: fmtTime(z, tz), from_ms: a, to_ms: z });
  const avoidWindows = [
    per.rahu_kaal && win("Rahu Kaal", per.rahu_kaal.start_ms, per.rahu_kaal.end_ms),
    per.yamaganda && win("Yamaganda", per.yamaganda.start_ms, per.yamaganda.end_ms),
    per.gulika && win("Gulika Kaal", per.gulika.start_ms, per.gulika.end_ms),
    ...moonSegments.filter((s) => s.chandra_bala?.house_from_natal_moon === 8).map((s) => win("Chandrashtama", s.from_ms, s.to_ms)),
  ].filter(Boolean).sort((a: any, b: any) => a.from_ms - b.from_ms) as any[];
  // A "best" window never overlaps an avoid window: trim it to the clean part (Abhijit often
  // straddles Rahu Kaal), and drop anything left shorter than 15 minutes.
  const trim = (name: string, a: number, z: number) => {
    let parts: Array<[number, number]> = [[a, z]];
    for (const w of avoidWindows) {
      parts = parts.flatMap(([x, y]) => (w.to_ms <= x || w.from_ms >= y ? [[x, y]] : [[x, Math.min(y, w.from_ms)], [Math.max(x, w.to_ms), y]]).filter(([p, q]) => q > p) as Array<[number, number]>);
    }
    return parts.filter(([x, y]) => y - x >= 15 * 60 * 1000).map(([x, y]) => win(name, x, y));
  };
  // Abhijit keeps its full span on record: Drik Panchang shows e.g. 11:50–12:38, and a bare
  // "12:14–12:38" looked like a wrong Abhijit. The clean part is still what we recommend.
  const abhijitParts = abhijit
    ? trim("Abhijit Muhurat", abhijit.from_ms, abhijit.to_ms).map((w) => {
        const clipped = w.from_ms !== abhijit.from_ms || w.to_ms !== abhijit.to_ms;
        if (!clipped) return w;
        const over = avoidWindows.filter((a: any) => a.from_ms < abhijit.to_ms && a.to_ms > abhijit.from_ms).map((a: any) => a.name);
        return { ...w, full_from: fmtTime(abhijit.from_ms, tz), full_to: fmtTime(abhijit.to_ms, tz), full_from_ms: abhijit.from_ms, overlaps: over };
      })
    : [];
  const bestWindows = [
    ...abhijitParts,
    ...goodDay.flatMap((c) => trim(`${c.name} Choghadiya`, c.start_ms, c.end_ms)),
    ...goodEvening.flatMap((c) => trim(`${c.name} Choghadiya (evening)`, c.start_ms, c.end_ms)),
  ].sort((a, b) => a.from_ms - b.from_ms);

  // ---- day score (every factor recorded, so it's auditable) --------------------
  const factors: Array<{ factor: string; effect: number; note: string }> = [];
  const add = (factor: string, effect: number, note: string) => { if (effect) factors.push({ factor, effect, note }); };
  // Classical rule: in Shukla paksha Chandra Bala carries more weight, in Krishna paksha Tara Bala does.
  const shukla = sunriseIdx.tithi < 15;
  const taraW = shukla ? 0.7 : 1.2;
  const chandraW = shukla ? 1.2 : 0.7;
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const segScore = (s: any) => (s?.tara_bala?.score ?? 0) * taraW + (s?.chandra_bala?.score ?? 0) * chandraW;
  if (primary?.tara_bala) add(`Tara Bala: ${primary.tara_bala.tara} (${primary.tara_bala.count} from birth star ${birthNak})`, r2(primary.tara_bala.score * taraW), `${primary.tara_bala.meaning} [weighted ×${taraW}: ${shukla ? "Shukla" : "Krishna"} paksha]`);
  if (primary?.chandra_bala) add(`Chandra Bala: Moon ${ordinal(primary.chandra_bala.house_from_natal_moon)} from natal Moon`, r2(primary.chandra_bala.score * chandraW), `${primary.chandra_bala.meaning} [weighted ×${chandraW}: ${shukla ? "Shukla" : "Krishna"} paksha]`);
  if (yogaBad) add(`Yoga: ${panchang.yoga}`, -0.5, "an inauspicious yoga: work patiently, avoid new ventures");
  if (vishti) add("Karana: Vishti (Bhadra)", -0.5, "Bhadra karana: not for auspicious starts");
  if (tNum === 4 || tNum === 9 || tNum === 14) add(`Tithi: ${panchang.tithi} (Rikta)`, -0.25, "Rikta tithi: finish old work rather than start new");
  if (isAmavasya) add("Amavasya", -0.5, "new moon: low energy, good for ancestors/prayer, not for new starts");
  if (isPurnima) add("Purnima", 0.25, "full moon: emotions and results peak");
  for (const n of ["Sun", "Mars", "Mercury", "Venus"]) {
    const t = tp(n);
    if (t?.gochara_from_moon === "favourable") add(`${n} transit ${ordinal(t.house_from_moon!)} from Moon`, 0.3, `${n}'s current position supports you`);
    if (t?.gochara_from_moon === "unfavourable") add(`${n} transit ${ordinal(t.house_from_moon!)} from Moon`, -0.3, `${n}'s current position is not supportive`);
  }
  const jup = tp("Jupiter");
  if (jup?.gochara_from_moon === "favourable") add(`Jupiter ${ordinal(jup.house_from_moon!)} from Moon`, 0.5, "Jupiter's protection is active");
  else if (jup?.gochara_from_moon === "unfavourable") add(`Jupiter ${ordinal(jup.house_from_moon!)} from Moon`, -0.25, "Jupiter's support is weaker this year");
  const sat = tp("Saturn");
  const satH = sat?.house_from_moon ?? 0;
  if ([12, 1, 2].includes(satH)) add(`Sade Sati (Saturn ${ordinal(satH)} from Moon)`, -0.5, "long Saturn phase: pressure, delays; steady effort wins");
  else if ([4, 8].includes(satH)) add(`Saturn Dhaiya (${ordinal(satH)} from Moon)`, -0.5, "Saturn's small panoti: pace yourself");
  else if (sat?.gochara_from_moon === "favourable") add(`Saturn ${ordinal(satH)} from Moon`, 0.5, "Saturn is supportive: hard work pays");
  if (primary) {
    const benefic = primary.moon_over_natal_planets.filter((p: string) => ["Jupiter", "Venus"].includes(p));
    const malefic = primary.moon_over_natal_planets.filter((p: string) => ["Saturn", "Rahu", "Ketu", "Mars"].includes(p));
    if (benefic.length) add(`Moon over natal ${benefic.join(" & ")}`, 0.25, "the Moon touches a helpful planet of your birth chart: pleasant turns");
    if (malefic.length) add(`Moon over natal ${malefic.join(" & ")}`, -0.25, "the Moon touches a harsh planet of your birth chart: mood dips or friction");
  }
  const raw = 5.5 + factors.reduce((s, f) => s + f.effect, 0);
  const score = Math.max(1, Math.min(10, Math.round(raw)));
  const label = score >= 8 ? "Excellent" : score >= 7 ? "Good" : score >= 5 ? "Mixed" : score >= 4 ? "Challenging" : "Tough";

  // Does the day turn (better/worse) at a Moon change during waking hours?
  const shifts = moonSegments
    .filter((s) => s !== primary && s.from_ms > sunrise && s.from_ms < wakingEnd)
    .map((s) => ({ at: s.from, becomes: segScore(s) > segScore(primary) ? "better" : segScore(s) < segScore(primary) ? "harder" : "similar", tara: s.tara_bala?.tara, chandra_house: s.chandra_bala?.house_from_natal_moon, moon_house_from_lagna: s.moon_house_from_lagna }));

  return {
    date: dateLocal,
    sunrise_ms: sunrise,
    noon_ms: new Date(buildIsoDatetime(dateLocal, "12:00:00", tz)).getTime(),
    sunset_ms: sunset,
    waking_end_ms: wakingEnd,
    changes_ms: events.map((e) => ({ what: e.kind, from: e.from, to: e.to, at: fmtTime(e.at_ms, tz), at_ms: e.at_ms })),
    timezone: tz,
    place: place?.label ?? b.place_of_birth ?? null,
    place_is_birth_place: !place,
    sunrise: fmtTime(sunrise, tz),
    sunset: fmtTime(sunset, tz),
    natal: {
      name: b.name ?? null,
      lagna: lagnaSign, moon_sign: natalMoonSign, birth_nakshatra: birthNak,
      planets: natalPlanets.map((p) => ({ ...p, rules_houses: housesRuledBy(p.planet) })),
    },
    score, label, factors,
    day_turns: shifts,
    moon_segments: moonSegments,
    primary_moon: primary,
    moon_on_dasha_lord: moonOnDashaLord,
    transits,
    dasha,
    weekday,
    panchang: {
      weekday: panchang.weekday, tithi: panchang.tithi, tithi_class: tithiClass, ekadashi: isEkadashi,
      nakshatra: panchang.nakshatra, yoga: panchang.yoga, yoga_quality: yogaBad ? "inauspicious" : "fine",
      karana: panchang.karana, moon_sign: panchang.moon_sign, sun_sign: panchang.sun_sign,
    },
    changes_today: events.map((e) => ({ what: e.kind, from: e.from, to: e.to, at: fmtTime(e.at_ms, tz) })),
    best_windows: bestWindows,
    avoid_windows: avoidWindows,
    disha_shool: DISHA_SHOOL[dow],
    vaar_colour: VAAR_COLOUR[vaarLord],
  };
}

export type DayContext = ReturnType<typeof buildDayContext>;

const PLAIN_AREA = (h: number | null | undefined) => (h ? `their ${ordinal(h)} house (${HOUSE_AREAS[h]})` : "an unknown house");

/**
 * The AI-facing view. Every fact is pre-written by code as a plain, unambiguous
 * sentence: houses are ALWAYS counted from the lagna, and each time window is
 * already placed in its part of the day. The model only rephrases, so it can't
 * mix up the birth star with today's star, or houses from the Moon with houses
 * from the lagna. The first live test showed it does exactly that when handed
 * the raw structure.
 */
export function dayContextForAI(d: DayContext) {
  const planetsByName = new Map(d.natal.planets.map((p: any) => [p.planet, p]));
  const natalLine = (name: string) => {
    const p: any = planetsByName.get(name);
    if (!p) return `${name}`;
    const rules = p.rules_houses?.length ? ` and rules ${p.rules_houses.map((h: number) => PLAIN_AREA(h)).join(" + ")}` : "";
    return `${name} (in the birth chart it sits in ${PLAIN_AREA(p.house)}${rules})`;
  };

  const facts: string[] = [];
  const pm: any = d.primary_moon;

  // Moon, today's single biggest daily factor.
  for (const seg of d.moon_segments as any[]) {
    if (seg.to_ms <= d.sunrise_ms || seg.from_ms >= d.waking_end_ms) continue;
    const main = seg === pm ? " [MAIN MOON OF TODAY]" : "";
    facts.push(`${seg.from} to ${seg.to}: the Moon is in ${seg.moon_sign} (${seg.nakshatra} nakshatra), transiting ${PLAIN_AREA(seg.moon_house_from_lagna)}. This is the life area in focus during this time.${main}`);
    // The classical name is included so a technical explanation never has to guess it
    // (the chat once called the 16th star "Vipat"; it is Naidhana). The Aaj Ka Din card's
    // prompt still keeps these names out of its plain-language text.
    if (seg.tara_bala) facts.push(`${seg.from} to ${seg.to}: in this person's personal 9-star cycle (Tara Bala), today's nakshatra ${seg.nakshatra} (counted ${seg.tara_bala.count} from their birth nakshatra ${d.natal.birth_nakshatra}) is the "${seg.tara_bala.tara}" tara, a ${seg.tara_bala.quality.toUpperCase()} star, which means: ${seg.tara_bala.meaning}.`);
    if (seg.chandra_bala) facts.push(`${seg.from} to ${seg.to}: the Moon is ${ordinal(seg.chandra_bala.house_from_natal_moon)} from their birth Moon sign ${d.natal.moon_sign}, which is ${seg.chandra_bala.quality.toUpperCase()} for mood and luck: ${seg.chandra_bala.meaning}.`);
    for (const n of seg.moon_over_natal_planets) facts.push(`${seg.from} to ${seg.to}: the Moon passes over their birth-chart ${natalLine(n)}. Those matters get triggered in real life.`);
    for (const n of seg.moon_opposite_natal_planets) facts.push(`${seg.from} to ${seg.to}: the Moon faces (opposes) their birth-chart ${natalLine(n)}. That brings attention or tension in those matters.`);
  }

  // Dasha: the running life chapter.
  const dz: any = d.dasha;
  if (dz.mahadasha) facts.push(`Running major life period (years-long): ${natalLine(dz.mahadasha.lord)}, until ${dz.mahadasha_to}.`);
  if (dz.antardasha) facts.push(`Running sub-period (1-3 years): ${natalLine(dz.antardasha.lord)}, until ${dz.antardasha_to}.`);
  if (dz.pratyantar) facts.push(`Running most-immediate period (weeks to months, strongest for daily events): ${natalLine(dz.pratyantar.lord)}, ${dz.pratyantar.from} to ${dz.pratyantar.to}.`);
  for (const l of d.moon_on_dasha_lord) facts.push(`IMPORTANT: today the Moon touches ${l}, a running period lord. ${l}'s matters are especially likely to show up as real events TODAY.`);

  // Weekday lord.
  facts.push(`Today is ${d.weekday.day}, ruled by ${natalLine(d.weekday.lord)}.${d.weekday.is_a_dasha_lord ? " It is also a running period lord, so it is doubly active today." : ""}`);

  // Planets: fast ones are the monthly backdrop, slow ones the long background.
  for (const t of d.transits as any[]) {
    if (t.planet === "Moon") continue;
    const verdict = t.gochara_from_moon === "favourable" ? "SUPPORTIVE for them right now" : t.gochara_from_moon === "unfavourable" ? "NOT supportive for them right now" : "neutral";
    const kind = ["Sun", "Mercury", "Venus", "Mars"].includes(t.planet) ? "This month" : "Long-term background";
    const over = t.over_natal_planets.length ? ` It is passing over their birth-chart ${t.over_natal_planets.join(", ")}.` : "";
    facts.push(`${kind}: ${t.planet} is in ${t.sign}${t.retrograde ? " (retrograde)" : ""}, transiting ${PLAIN_AREA(t.house_from_lagna)}, and is ${verdict}.${over}`);
  }
  const satF = d.factors.find((f) => /Sade Sati|Dhaiya/.test(f.factor));
  if (satF) facts.push(`Long-term background: ${satF.factor}: ${satF.note}.`);

  // Panchang.
  const pc = d.panchang;
  facts.push(`Panchang at sunrise: tithi ${pc.tithi} (${pc.tithi_class})${pc.ekadashi ? ", Ekadashi (a fasting day)" : ""}; yoga ${pc.yoga} (${pc.yoga_quality}); karana ${pc.karana}.`);
  const dirName = ({ West: "WEST (Paschim)", East: "EAST (Purab)", North: "NORTH (Uttar)", South: "SOUTH (Dakshin)" } as Record<string, string>)[d.disha_shool] ?? d.disha_shool;
  facts.push(`Disha Shool today = ${dirName}: traditionally avoid starting a journey towards the ${dirName} today. Only this direction; do not change it.`);

  // Remedy: aimed at today's weakest point, from the classical table only.
  const nakLordToday = pm?.nakshatra_lord as string | undefined;
  const harsh = (pm?.moon_over_natal_planets ?? []).find((p: string) => ["Saturn", "Rahu", "Ketu", "Mars"].includes(p));
  const remedyPlanet =
    pm?.chandra_bala?.quality === "bad" ? "Moon"
    : pm?.tara_bala?.quality === "bad" && nakLordToday ? nakLordToday
    : harsh ? harsh
    : d.weekday.lord;
  const why =
    remedyPlanet === "Moon" ? "today's Moon position is weak for them"
    : remedyPlanet === nakLordToday && pm?.tara_bala?.quality === "bad" ? `today's nakshatra ${pm.nakshatra} is unfavourable for them and is ruled by ${remedyPlanet}`
    : remedyPlanet === harsh ? `the Moon touches their birth-chart ${harsh} today`
    : `today is ruled by ${remedyPlanet}`;
  const rem = GRAHA_REMEDY[remedyPlanet];
  if (rem) facts.push(`REMEDY OPTIONS for today (because ${why}), so use ONLY these, exactly as written: mantra "${rem.mantra}" (11 or 108 times), OR ${rem.daan}, OR a prayer to ${rem.deity}.`);

  // Timeline: every window and change, placed in its part of the day by code.
  type Item = { at_ms: number; text: string };
  const items: Item[] = [
    ...d.best_windows.map((w: any) => w.full_from
      ? { at_ms: w.full_from_ms, text: `${w.full_from} to ${w.full_to}: ${w.name}, but ${w.overlaps.join(" and ")} also runs in part of it, so the clean part is ${w.from} to ${w.to}. BEST time for important work or starts (in the clean part).` }
      : { at_ms: w.from_ms, text: `${w.from} to ${w.to}: ${w.name}. BEST time for important work or starts.` }),
    ...d.avoid_windows.map((w: any) => ({ at_ms: w.from_ms, text: `${w.from} to ${w.to}: ${w.name}. AVOID starting anything important.` })),
    ...d.changes_ms.map((c: any) => ({ at_ms: c.at_ms, text: `${c.at}: ${c.what === "moon_sign" ? "Moon changes sign" : c.what === "nakshatra" ? "nakshatra changes" : c.what} from ${c.from} to ${c.to}.` })),
  ].sort((a, b) => a.at_ms - b.at_ms);
  const part = (label: string, a: number, z: number) => ({
    part: label,
    range: `${new Intl.DateTimeFormat("en-US", { timeZone: d.timezone, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(a))} to ${new Intl.DateTimeFormat("en-US", { timeZone: d.timezone, hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(z))}`,
    what_happens_in_this_part: items.filter((i) => i.at_ms >= a && i.at_ms < z).map((i) => i.text),
  });
  const day_parts = [
    part("morning", d.sunrise_ms, d.noon_ms),
    part("afternoon", d.noon_ms, d.sunset_ms),
    part("evening/night", d.sunset_ms, d.waking_end_ms),
  ];

  return {
    date: d.date,
    person: { name: d.natal.name, lagna: d.natal.lagna, moon_sign: d.natal.moon_sign, birth_nakshatra: d.natal.birth_nakshatra },
    DAY_SCORE: `${d.score}/10 (${d.label})`,
    // The one word the reply must call the day, so the tone can't drift. Live test: a 7/10
    // "Good" day was described as "mila-jula", and a 4/10 day as "mishrit".
    DAY_TONE_WORD: ({ Excellent: "excellent / bahut shubh", Good: "good / accha", Mixed: "mixed / mila-jula", Challenging: "challenging / thoda mushkil", Tough: "tough / kathin" } as Record<string, string>)[d.label] ?? d.label,
    why_this_score: d.factors.map((f) => `${f.effect > 0 ? "+" : ""}${f.effect}: ${f.note.replace(/\s*\[weighted[^\]]*\]/, "")}`),
    facts,
    day_parts,
  };
}

/**
 * The next 7 days, one line each, for "is hafte" questions. Live, "is week business
 * meeting ho sakti hai?" was answered from the running dasha alone, because nothing
 * weekly was calculated. Each day comes from buildDayContext (the Aaj Ka Din engine);
 * the model gets words, never the score.
 */
export function weekContextForAI(chart: any, startDate: string, ayanamsa: number, place?: DayPlace) {
  const TONE: Record<string, string> = { Excellent: "very good", Good: "good", Mixed: "mixed", Challenging: "challenging", Tough: "tough" };
  const days: Array<{ label: string; score: number; line: string }> = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    const d = buildDayContext(chart, date, ayanamsa, place);
    const pm: any = d.primary_moon;
    const rk: any = d.avoid_windows.find((w: any) => w.name === "Rahu Kaal");
    const label = `${d.panchang.weekday} ${date}`;
    const moonLine = pm
      ? ` Life area in focus: ${PLAIN_AREA(pm.moon_house_from_lagna)}. Moon from their rashi: ${pm.chandra_bala?.quality ?? "?"} (${pm.chandra_bala?.meaning ?? ""}). Star of the day: ${pm.tara_bala?.quality ?? "?"} (${pm.tara_bala?.meaning ?? ""}).`
      : "";
    days.push({ label, score: d.score, line: `${label}: ${TONE[d.label] ?? d.label} day.${moonLine}${rk ? ` Rahu Kaal ${rk.from} to ${rk.to}.` : ""}` });
  }
  const top = new Set([...days].sort((a, b) => b.score - a.score).filter((d) => d.score >= 7).slice(0, 3));
  return {
    note: "Calculated for each of the next 7 days with the same engine as the Aaj Ka Din card (Moon, star, transits).",
    days: days.map((d) => d.line),
    best_days: days.filter((d) => top.has(d)).map((d) => d.label),
    careful_days: days.filter((d) => d.score <= 4).map((d) => d.label),
  };
}
