/**
 * Chaturmas — the four holy months when marriages are not performed.
 *
 * It runs from Devshayani Ekadashi (Ashadha Shukla Ekadashi) to Devuthani /
 * Prabodhini Ekadashi (Kartika Shukla Ekadashi). Both are LUNAR dates, so the
 * long-standing solar approximation here ("Sun in Cancer→Libra") could be up
 * to a month wrong at either edge — it blocked all of July 2026 for marriage,
 * for instance, when Chaturmas that year actually starts on 25 July.
 *
 * Identifying the right lunar month, verified against published dates for
 * 2024-2026: the amanta month containing Karka Sankranti (Sun entering
 * sidereal Cancer) is Ashadha, and the one containing Vrishchika Sankranti
 * (sidereal Scorpio) is Kartika. So:
 *
 *   1. find the sankranti instant,
 *   2. step back to the new moon that opens that lunar month,
 *   3. take that month's Shukla Ekadashi.
 *
 * On the Ekadashi day itself: the standard rule is the day whose SUNRISE falls
 * inside the tithi. Where Ekadashi is a kshaya tithi and touches no sunrise at
 * all (Devuthani 2026), it is observed on the day the tithi begins. Note that
 * in years where the tithi starts after sunrise, the Smarta and Vaishnava
 * calendars genuinely publish different days — this returns the Vaishnava one,
 * so a boundary can be a day later than some almanacs. That is immaterial for
 * "is today inside Chaturmas", and far better than the ±30 days it replaces.
 */
import { eclipticLongitudes, sunRiseSet } from "./engine";
import { buildIsoDatetime } from "./validate";

const DAY_MS = 86_400_000;
const norm = (x: number) => ((x % 360) + 360) % 360;

export const sunSidereal = (t: Date, ayanamsa: number) => eclipticLongitudes(t, ayanamsa).sunSidereal;
export const elongation = (t: Date, ayanamsa: number) => {
  const { sunSidereal: s, moonSidereal: m } = eclipticLongitudes(t, ayanamsa);
  return norm(m - s);
};
export const DAY_MS_ = DAY_MS;

/** Bisect [lo,hi] for the instant a boolean test flips away from `startState`. */
function bisect(lo: Date, hi: Date, test: (t: Date) => boolean, startState: boolean): Date {
  let a = lo, b = hi;
  for (let i = 0; i < 40; i++) {
    const mid = new Date((a.getTime() + b.getTime()) / 2);
    if (test(mid) === startState) a = mid; else b = mid;
  }
  return b;
}

/** The instant the Sun's sidereal longitude crosses `deg`, scanning a month range. */
function sankranti(year: number, deg: number, fromMonth: number, toMonth: number, ayanamsa: number): Date | null {
  const start = new Date(Date.UTC(year, fromMonth - 1, 1));
  const end = new Date(Date.UTC(year, toMonth, 1));
  const before = (t: Date) => norm(sunSidereal(t, ayanamsa) - deg) < 180;
  let prev = before(start);
  for (let t = new Date(start.getTime() + DAY_MS); t <= end; t = new Date(t.getTime() + DAY_MS)) {
    if (before(t) !== prev) return bisect(new Date(t.getTime() - DAY_MS), t, before, prev);
  }
  return null;
}

/** The new moon immediately before `t` — the start of `t`'s lunar month. */
export function newMoonBefore(t: Date, ayanamsa: number): Date | null {
  const start = new Date(t.getTime() - 31 * DAY_MS);
  let last: Date | null = null;
  let prev = elongation(start, ayanamsa);
  for (let x = new Date(start.getTime() + DAY_MS); x <= t; x = new Date(x.getTime() + DAY_MS)) {
    const cur = elongation(x, ayanamsa);
    // Elongation wraps 360 -> 0 exactly at conjunction.
    if (cur < prev) {
      last = bisect(new Date(x.getTime() - DAY_MS), x, (m) => elongation(m, ayanamsa) > 180, true);
    }
    prev = cur;
  }
  return last;
}

/** Local calendar date (YYYY-MM-DD) of an instant. */
function localDate(t: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(t);
}

/**
 * The Shukla Ekadashi of the lunar month opening at `newMoon`.
 * Returns a local YYYY-MM-DD.
 */
function shuklaEkadashi(
  newMoon: Date, latitude: number, longitude: number, timeZone: string, ayanamsa: number,
): string | null {
  let firstAfter: string | null = null;
  // Ekadashi is the 11th tithi, so it lands ~10-12 days in; scan wide enough to
  // cover a slow lunation without wandering into the next paksha.
  for (let d = 8; d <= 15; d++) {
    const probe = new Date(newMoon.getTime() + d * DAY_MS);
    const dateStr = localDate(probe, timeZone);
    // LOCAL midnight, not UTC — `sunRiseSet` searches forward, and a UTC
    // midnight is 05:30 IST, already past a summer sunrise in Delhi. That
    // silently returned the NEXT day's sunrise and moved every boundary a day.
    const sunrise = sunRiseSet(
      new Date(buildIsoDatetime(dateStr, "00:00:00", timeZone)), latitude, longitude,
    ).sunrise;
    if (!sunrise) continue;
    const tithiIdx = Math.floor(elongation(sunrise, ayanamsa) / 12);
    if (tithiIdx === 10) return dateStr;          // sunrise inside Ekadashi
    if (tithiIdx > 10 && firstAfter === null) {
      // Ekadashi is kshaya — it began and ended between two sunrises, so it is
      // observed on the previous day, the one it started in.
      firstAfter = localDate(new Date(probe.getTime() - DAY_MS), timeZone);
    }
  }
  return firstAfter;
}

export interface ChaturmasWindow { start: string; end: string }

/** Per-year cache: scanMonth asks this for all 30 days of a month. */
const cache = new Map<string, ChaturmasWindow | null>();

/**
 * Chaturmas for a calendar year: Devshayani → Devuthani Ekadashi, as local
 * YYYY-MM-DD. Null if either boundary could not be resolved (never guess —
 * the caller falls back to not blocking).
 */
export function chaturmasFor(
  year: number, latitude: number, longitude: number, timeZone: string, ayanamsa: number,
): ChaturmasWindow | null {
  const key = `${year}|${timeZone}|${Math.round(latitude)}|${Math.round(longitude)}|${ayanamsa}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  let out: ChaturmasWindow | null = null;
  try {
    const karka = sankranti(year, 90, 6, 8, ayanamsa);       // Sun -> sidereal Cancer
    const vrishchika = sankranti(year, 210, 10, 12, ayanamsa); // Sun -> sidereal Scorpio
    const nmAshadha = karka && newMoonBefore(karka, ayanamsa);
    const nmKartika = vrishchika && newMoonBefore(vrishchika, ayanamsa);
    const start = nmAshadha && shuklaEkadashi(nmAshadha, latitude, longitude, timeZone, ayanamsa);
    const end = nmKartika && shuklaEkadashi(nmKartika, latitude, longitude, timeZone, ayanamsa);
    if (start && end) out = { start, end };
  } catch { /* leave null — better to not block than to block wrongly */ }

  cache.set(key, out);
  return out;
}

/**
 * Is `date` (YYYY-MM-DD) inside Chaturmas? Marriages resume ON Devuthani
 * Ekadashi itself, so the end boundary is exclusive.
 */
export function inChaturmas(
  date: string, latitude: number, longitude: number, timeZone: string, ayanamsa: number,
): ChaturmasWindow | null {
  const year = Number(date.slice(0, 4));
  const w = chaturmasFor(year, latitude, longitude, timeZone, ayanamsa);
  if (!w) return null;
  return date >= w.start && date < w.end ? w : null;
}
