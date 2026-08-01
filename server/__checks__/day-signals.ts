/**
 * Day-signals check.
 *
 *   npm run check:day-signals
 *
 * The day-signals engine is what a person reads at 8 AM and on the home screen,
 * so two things must hold no matter what the sky is doing:
 *
 *   • the REASON is real — the Moon factor it shows must be the Moon's actual
 *     house from the natal Moon, not a number it made up;
 *   • the TONE follows the SEVERITY — a heavy day (severity ≥ 2) must speak
 *     plainly ("warn"), a one-thing day nudges ("advice"), a clear day
 *     encourages ("good"). This is the exact behaviour the product promises,
 *     so it is pinned here.
 *
 * Everything runs against a real computed chart over a 60-day sweep, so the
 * invariants are checked across the full range of Moon houses rather than on
 * one convenient day.
 */
import { computeChart } from "../engine";
import { buildIsoDatetime } from "../validate";
import { normalizeChart } from "../normalize";
import { buildTransit } from "../transit";
import { buildDaySignals, buildUpcomingDaySignals } from "../day-signals";

const AYAN = 1;

function makeChart(fx: { date: string; time: string; tz: string; lat: number; lon: number; name: string }) {
  const iso = buildIsoDatetime(fx.date, fx.time, fx.tz);
  const local = computeChart({ datetime: iso, latitude: fx.lat, longitude: fx.lon, ayanamsa: AYAN } as any);
  const { normalized } = normalizeChart({
    birth: {
      name: fx.name,
      date_of_birth: fx.date,
      time_of_birth: fx.time,
      place_of_birth: "Test",
      latitude: fx.lat,
      longitude: fx.lon,
      timezone: fx.tz,
    } as any,
    isoDatetime: iso,
    ayanamsa: AYAN,
    planetPositionData: local.planetPositionData,
    dashaData: local.dashaData,
    raw: {},
    provider: "local",
  } as any);
  // buildDaySignals reads birth_details.name / latitude / longitude / timezone.
  normalized.birth_details = {
    ...(normalized.birth_details || {}),
    name: fx.name,
    latitude: fx.lat,
    longitude: fx.lon,
    timezone: fx.tz,
  };
  return normalized;
}

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`); failures++; }
};

const chart = makeChart({ date: "1990-08-24", time: "14:30:00", tz: "Asia/Kolkata", lat: 28.61, lon: 77.20, name: "Vansh Kumar" });
const tz = "Asia/Kolkata";

// ── invariants across a 60-day sweep ─────────────────────────────────────────
let sawSev3 = false, sawGoodTone = false, moonReasonEverWrong = false, toneRuleBroke = false;
let missingHeadline = 0, missingName = 0;

const days = buildUpcomingDaySignals({
  chart, startDate: "2026-07-30", days: 60, tz, lang: "hinglish",
  latitude: 28.61, longitude: 77.20, ayanamsa: AYAN, name: "Vansh Kumar",
});
check("batch returns exactly the days asked for", days.length === 60, `got ${days.length}`);

// contiguous dates
let contiguous = true;
for (let i = 1; i < days.length; i++) {
  const a = new Date(days[i - 1].date + "T00:00:00Z").getTime();
  const b = new Date(days[i].date + "T00:00:00Z").getTime();
  if (b - a !== 86400_000) contiguous = false;
}
check("batch dates are contiguous, one per day", contiguous);

for (const sig of days) {
  // severity is in range and is a valid step
  if (![0, 1, 2, 3].includes(sig.severity)) toneRuleBroke = true;

  // TONE follows SEVERITY
  const expectTone = sig.severity >= 2 ? "warn" : sig.severity === 1 ? "advice" : null;
  if (expectTone && sig.tone !== expectTone) toneRuleBroke = true;
  if (sig.severity >= 2 && sig.lean !== "careful") toneRuleBroke = true;
  if (sig.tone === "good" && sig.severity !== 0) toneRuleBroke = true;

  if (sig.severity === 3) sawSev3 = true;
  if (sig.tone === "good") sawGoodTone = true;

  if (!sig.headline || !sig.headline.trim()) missingHeadline++;
  if (!sig.headline.startsWith("Vansh")) missingName++;

  // the REASON must match the real sky: recompute the Moon house independently
  const moonFactor = sig.factors.find((f) => f.code.startsWith("moon_h"));
  if (moonFactor) {
    const tr = buildTransit(chart, AYAN, new Date(buildIsoDatetime(sig.date, "12:00:00", tz)).toISOString());
    const realHouse = tr.planets.find((p) => p.planet === "Moon")?.house_from_moon ?? null;
    if (moonFactor.code !== `moon_h${realHouse}`) moonReasonEverWrong = true;
  }
}

check("severity is always a valid 0–3 step", !toneRuleBroke);
check("tone follows severity on every one of 60 days", !toneRuleBroke,
  "warn⇐sev≥2, advice⇐sev1, good⇒sev0");
check("the Moon reason always matches the real Moon house", !moonReasonEverWrong);
check("every day produced a headline", missingHeadline === 0, `${missingHeadline} blank`);
check("the person's name leads every headline", missingName === 0, `${missingName} missing`);
check("a heavy day (severity 3) occurs in the sweep", sawSev3,
  "Moon 8th from natal Moon should appear within 60 days");
check("a clear, encouraging day occurs in the sweep", sawGoodTone);

// ── the DAILY-VARIATION guarantee — the whole reason for Tarabala ────────────
// The user's complaint was "same message for days". The Moon's nakshatra (hence
// its tara from the birth star) changes almost daily, so the daily line must
// change too — and Sade Sati (a 2½-year backdrop) must NOT freeze it.
const distinctLines = new Set(days.map((d) => d.short)).size;
check("the daily line varies — many distinct lines over 60 days", distinctLines >= 15,
  `only ${distinctLines} distinct in 60 days`);

let worstRun = 1, run = 1;
for (let i = 1; i < days.length; i++) {
  run = days[i].short === days[i - 1].short ? run + 1 : 1;
  if (run > worstRun) worstRun = run;
}
check("no long run of identical days (Sade Sati no longer freezes the line)", worstRun <= 3,
  `${worstRun} identical days in a row`);

// Tarabala is present and actually cycles (a real daily signal, not a constant).
const taras = new Set(days.map((d) => d.factors.find((f) => f.code.startsWith("tara_"))?.code).filter(Boolean));
check("Tarabala is computed and cycles through several taras", taras.size >= 5,
  `only ${taras.size} distinct taras seen`);

// Standing factors are CONTEXT — they must never carry a headline `lead`.
const standingLeaked = days.some((d) =>
  d.factors.some((f) => /^(sade_sati|dhaiya|dasha_)/.test(f.code) && f.lead));
check("standing factors (Sade Sati/dasha) never lead the headline", !standingLeaked);

// ── the "reason is real" promise, spelled out on one day ─────────────────────
const one = buildDaySignals({
  chart, date: days.find((d) => d.severity === 3)?.date ?? "2026-07-30", tz, lang: "hinglish",
  latitude: 28.61, longitude: 77.20, ayanamsa: AYAN, name: "Vansh Kumar",
});
check("a heavy day carries a careful factor with real weight",
  one.factors.some((f) => f.kind === "careful" && f.weight >= 2));
check("factors are ordered most-important-first (careful before neutral)", (() => {
  const kinds = one.factors.map((f) => (f.code === "best_window" || f.code === "rahu_kaal") ? "z" : f.kind);
  const firstNeutral = kinds.indexOf("neutral");
  const lastCareful = kinds.lastIndexOf("careful");
  return firstNeutral === -1 || lastCareful === -1 || lastCareful < firstNeutral;
})());

// ── languages ────────────────────────────────────────────────────────────────
const en = buildDaySignals({ chart, date: one.date, tz, lang: "en", latitude: 28.61, longitude: 77.20, ayanamsa: AYAN, name: "Vansh Kumar" });
const hi = buildDaySignals({ chart, date: one.date, tz, lang: "hi", latitude: 28.61, longitude: 77.20, ayanamsa: AYAN, name: "Vansh Kumar" });
check("English and Hindi headlines both render and differ",
  !!en.headline && !!hi.headline && en.headline !== hi.headline);
check("an unknown language falls back rather than blanking", (() => {
  const ta = buildDaySignals({ chart, date: one.date, tz, lang: "ta", latitude: 28.61, longitude: 77.20, ayanamsa: AYAN, name: "Vansh Kumar" });
  return !!ta.headline && ta.headline.trim().length > 0;
})());

// ── no-location degradation: still works, just without time windows ──────────
const noLoc = buildDaySignals({ chart, date: one.date, tz, lang: "hinglish", ayanamsa: AYAN, name: "Vansh Kumar" });
check("without a location it still produces a headline and factors",
  !!noLoc.headline && noLoc.factors.length > 0 && noLoc.best_time === null);

if (failures) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log(
  `PASS — 60-day sweep: tone tracks severity every day, the Moon reason always ` +
  `matches the real Moon house, name leads every headline, en/hi/hinglish render ` +
  `and a heavy (sev-3) and a clear day both occur. Reason is real, not written.`,
);
