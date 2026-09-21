/* Ported from VedicAstra (new-vedic-astra/server) to run its chat system inside JanamJyot.
   Core computation (engine, normalize, validate, panchang, transit, llm) is JanamJyot's own,
   verified against Swiss Ephemeris and ProKerala. */
/**
 * Gochar calendar: exact sign-change (ingress) dates of the slow grahas. These are
 * Saturn, Jupiter, and Rahu with Ketu opposite it. From them it derives a person's
 * Sade Sati and Dhaiya phases, and which house each slow planet moves through, when.
 *
 * Before this existed, only "today's" transit was computed. So "Sade Sati kab khatam
 * hogi?" or "Guru mere 7th house mein kab aayega?" got a date the AI made up.
 *
 * Method: sample the sidereal longitudes (same engine as the charts) every 5 days
 * from 1995 to 2046. Where the sign index changes, bisect down to the hour.
 * Retrograde back-and-forth shows up as separate short stays. Jupiter's 2025
 * "atichari" entry into Cancer and its return to Gemini are one example. The
 * result does not depend on the chart, so it is computed once per ayanamsa and cached.
 */
import { slowPlanetLongitudes } from "../engine";
import { SIGNS } from "../normalize";

type Body = "Jupiter" | "Saturn" | "Rahu";
export interface Stay {
  planet: string;
  sign: string;
  sign_idx: number;
  from_ms: number;
  to_ms: number;
  from: string; // YYYY-MM-DD (India time)
  to: string;
}

const START_MS = Date.UTC(1995, 0, 1);
const END_MS = Date.UTC(2046, 0, 1);
const STEP_MS = 5 * 86400000;
const DAY = 86400000;

export const fmtDate = (ms: number, tz = "Asia/Kolkata") => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms));
const signAt = (body: Body, ms: number, ayanamsa: number) => Math.floor(slowPlanetLongitudes(new Date(ms), ayanamsa)[body] / 30) % 12;

const calendarCache = new Map<number, Record<string, Stay[]>>();

/** Every stay of Jupiter, Saturn, Rahu and Ketu in a sign, 1995–2045. */
export function ingressCalendar(ayanamsa: number): Record<string, Stay[]> {
  const hit = calendarCache.get(ayanamsa);
  if (hit) return hit;
  const out: Record<string, Stay[]> = {};
  for (const body of ["Jupiter", "Saturn", "Rahu"] as Body[]) {
    const stays: Stay[] = [];
    let curSign = signAt(body, START_MS, ayanamsa);
    let curFrom = START_MS;
    let prevT = START_MS;
    for (let t = START_MS + STEP_MS; t <= END_MS; t += STEP_MS) {
      const sgn = signAt(body, t, ayanamsa);
      if (sgn !== curSign) {
        let lo = prevT, hi = t; // lo still in curSign, hi in the new sign
        while (hi - lo > 3600 * 1000) {
          const mid = (lo + hi) / 2;
          if (signAt(body, mid, ayanamsa) === curSign) lo = mid; else hi = mid;
        }
        stays.push({ planet: body, sign: SIGNS[curSign], sign_idx: curSign, from_ms: curFrom, to_ms: hi, from: fmtDate(curFrom), to: fmtDate(hi) });
        curSign = sgn;
        curFrom = hi;
      }
      prevT = t;
    }
    stays.push({ planet: body, sign: SIGNS[curSign], sign_idx: curSign, from_ms: curFrom, to_ms: END_MS, from: fmtDate(curFrom), to: fmtDate(END_MS) });
    // The first stay starts at the search boundary, not at a real ingress.
    stays[0] = { ...stays[0], from: "before 1995" };
    out[body] = stays;
  }
  // Ketu is always exactly opposite Rahu.
  out.Ketu = out.Rahu.map((s) => {
    const k = (s.sign_idx + 6) % 12;
    return { ...s, planet: "Ketu", sign: SIGNS[k], sign_idx: k };
  });
  calendarCache.set(ayanamsa, out);
  return out;
}

const houseFrom = (signIdx: number, refIdx: number) => ((signIdx - refIdx + 12) % 12) + 1;

/** Groups consecutive stays in `wanted` signs; gaps of up to `gapDays` (retrograde dips out) stay inside one block. */
function blocks(stays: Stay[], wanted: Set<number>, gapDays: number) {
  const hits = stays.filter((s) => wanted.has(s.sign_idx));
  const groups: Stay[][] = [];
  for (const s of hits) {
    const g = groups[groups.length - 1];
    if (g && s.from_ms - g[g.length - 1].to_ms <= gapDays * DAY) g.push(s);
    else groups.push([s]);
  }
  return groups;
}

/**
 * Sade Sati (Saturn in the 12th, 1st, 2nd from the natal Moon) and Dhaiya / Kantaka
 * Shani (Saturn in the 4th or 8th from the Moon): previous, current and next, with dates.
 */
export function saturnCycles(moonSignIdx: number, ayanamsa: number, nowMs = Date.now()) {
  const sat = ingressCalendar(ayanamsa).Saturn;
  const s12 = (moonSignIdx + 11) % 12, s1 = moonSignIdx, s2 = (moonSignIdx + 1) % 12;
  const phaseName = (idx: number) => (idx === s12 ? "rising (1st phase, Saturn 12th from Moon)" : idx === s1 ? "peak (2nd phase, Saturn over the Moon sign)" : "setting (3rd phase, Saturn 2nd from Moon)");

  const ss = blocks(sat, new Set([s12, s1, s2]), 400).map((g) => ({
    from: g[0].from, to: g[g.length - 1].to, from_ms: g[0].from_ms, to_ms: g[g.length - 1].to_ms,
    phases: g.map((s) => ({ phase: phaseName(s.sign_idx), sign: s.sign, from: s.from, to: s.to, from_ms: s.from_ms, to_ms: s.to_ms })),
  }));
  const pick = <T extends { from_ms: number; to_ms: number }>(list: T[]) => ({
    previous: [...list].reverse().find((x) => x.to_ms <= nowMs) ?? null,
    current: list.find((x) => x.from_ms <= nowMs && x.to_ms > nowMs) ?? null,
    next: list.find((x) => x.from_ms > nowMs) ?? null,
  });
  const dhaiya = [4, 8].flatMap((h) =>
    blocks(sat, new Set([(moonSignIdx + h - 1) % 12]), 400).map((g) => ({
      kind: h === 4 ? "Kantaka Shani / Dhaiya (Saturn 4th from Moon)" : "Ashtama Shani / Dhaiya (Saturn 8th from Moon)",
      from: g[0].from, to: g[g.length - 1].to, from_ms: g[0].from_ms, to_ms: g[g.length - 1].to_ms,
    }))
  ).sort((a, b) => a.from_ms - b.from_ms);

  const strip = (x: any) => (x ? JSON.parse(JSON.stringify(x, (k, v) => (k.endsWith("_ms") ? undefined : v))) : null);
  const sadeSati = pick(ss);
  const curPhase = sadeSati.current?.phases.find((p) => p.from_ms <= nowMs && p.to_ms > nowMs) ?? null;
  const dh = pick(dhaiya);
  return {
    sade_sati: {
      active_now: !!sadeSati.current,
      current_phase: curPhase ? `${curPhase.phase}: ${curPhase.from} to ${curPhase.to}` : null,
      current: strip(sadeSati.current),
      previous: strip(sadeSati.previous),
      next: strip(sadeSati.next),
    },
    dhaiya: { active_now: !!dh.current, current: strip(dh.current), previous: strip(dh.previous), next: strip(dh.next) },
  };
}

/**
 * The slow grahas' movement through THIS chart's houses (from the lagna and from the
 * Moon), from a little before now to `years` ahead.
 */
export function transitCalendarForChart(lagnaIdx: number, moonIdx: number, ayanamsa: number, nowMs = Date.now(), years = 12) {
  const cal = ingressCalendar(ayanamsa);
  const end = nowMs + years * 365.25 * DAY;
  const out: Record<string, Array<{ sign: string; from: string; to: string; house_from_lagna: number | null; house_from_moon: number | null; note?: string }>> = {};
  for (const planet of ["Saturn", "Jupiter", "Rahu", "Ketu"]) {
    const list = cal[planet].filter((s) => s.to_ms > nowMs && s.from_ms < end);
    out[planet] = list.map((s, i) => {
      const brief = s.to_ms - s.from_ms < (planet === "Jupiter" ? 120 : 250) * DAY;
      return {
        sign: s.sign, from: s.from, to: s.to_ms >= END_MS ? "after 2045" : s.to,
        house_from_lagna: lagnaIdx >= 0 ? houseFrom(s.sign_idx, lagnaIdx) : null,
        house_from_moon: moonIdx >= 0 ? houseFrom(s.sign_idx, moonIdx) : null,
        ...(brief ? { note: "short stay (retrograde back-and-forth / atichari)" } : {}),
        ...(i === 0 && s.from_ms <= nowMs ? { note: "current position" } : {}),
      };
    });
  }
  return out;
}
