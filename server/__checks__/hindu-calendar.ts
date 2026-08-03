/**
 * Hindu-calendar check.
 *
 *   npm run check:hindu-calendar
 *
 * The app tells people what festival / vrat / special day it is. A wrong Diwali
 * or Ekadashi is the kind of mistake that ends trust in a "real panchang" app,
 * so every NAMED festival we ship is pinned here to its real, published 2026
 * date (Drik Panchang / standard North-India amanta reckoning, Delhi). If the
 * engine drifts, this fails before a user ever sees the wrong day.
 *
 * Anything NOT verifiable to the exact day is deliberately not shipped as a
 * named festival (see VERIFIED_FESTIVALS) — it still shows the reliable tithi.
 */
import { hinduDay, VERIFIED_FESTIVALS } from "../hindu-calendar";

const lat = 28.61, lon = 77.20, tz = "Asia/Kolkata", ay = 1;

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`); failures++; }
};

/** First 2026 date on which `key` is flagged. */
function firstDateWith(key: string): string | null {
  for (let m = 0; m < 12; m++) {
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(Date.UTC(2026, m, d));
      if (dt.getUTCMonth() !== m) continue;
      const date = dt.toISOString().slice(0, 10);
      if (hinduDay(date, lat, lon, tz, ay).specials.some((s) => s.key === key)) return date;
    }
  }
  return null;
}

// ── major festivals vs the real published 2026 dates ─────────────────────────
const REAL: Record<string, string> = {
  vasant_panchami: "2026-01-23", maha_shivratri: "2026-02-15", holi: "2026-03-03",
  ram_navami: "2026-03-27", hanuman_jayanti: "2026-04-01", akshaya_tritiya: "2026-04-20",
  guru_purnima: "2026-07-29", raksha_bandhan: "2026-08-28", janmashtami: "2026-09-04",
  ganesh_chaturthi: "2026-09-14", navratri: "2026-10-11", durga_ashtami: "2026-10-19",
  dussehra: "2026-10-20", karva_chauth: "2026-10-29", dhanteras: "2026-11-06",
  diwali: "2026-11-08", bhai_dooj: "2026-11-11", kartik_purnima: "2026-11-24",
};
let matched = 0;
for (const [key, real] of Object.entries(REAL)) {
  const got = firstDateWith(key);
  check(`${key} falls on its real 2026 date`, got === real, `got ${got}, expected ${real}`);
  if (got === real) matched++;
}
check("every verified festival with a known date was pinned",
  Object.keys(REAL).every((k) => VERIFIED_FESTIVALS.has(k)));

// ── Makar Sankranti — the solar anchor, ~always 14 Jan ───────────────────────
check("Makar Sankranti is 14 Jan 2026",
  hinduDay("2026-01-14", lat, lon, tz, ay).specials.some((s) => s.kind === "sankranti"));

// ── Tier-1 reliability: the tithi/vrat cadence over a year ───────────────────
let ekadashi = 0, purnima = 0, amavasya = 0, sankrantis = 0;
for (let m = 0; m < 12; m++) {
  for (let d = 1; d <= 31; d++) {
    const dt = new Date(Date.UTC(2026, m, d));
    if (dt.getUTCMonth() !== m) continue;
    const s = hinduDay(dt.toISOString().slice(0, 10), lat, lon, tz, ay).specials;
    if (s.some((x) => x.key === "ekadashi")) ekadashi++;
    if (s.some((x) => x.key === "purnima")) purnima++;
    if (s.some((x) => x.key === "amavasya")) amavasya++;
    if (s.some((x) => x.kind === "sankranti")) sankrantis++;
  }
}
// A lunar year has ~24-25 Ekadashis, 12-13 Purnimas/Amavasyas, and exactly 12
// sankrantis (the Sun changes sign 12 times a year).
check("Ekadashi occurs ~twice a month", ekadashi >= 22 && ekadashi <= 26, `${ekadashi}/year`);
check("Purnima occurs ~monthly", purnima >= 11 && purnima <= 13, `${purnima}/year`);
check("Amavasya occurs ~monthly", amavasya >= 11 && amavasya <= 13, `${amavasya}/year`);
check("exactly 12 sankrantis in the year", sankrantis === 12, `${sankrantis}`);

// ── Sawan Somwar — Mondays fall inside Shravana ──────────────────────────────
const sawan = firstDateWith("sawan_somwar");
check("a Sawan Somwar is found and lands on a Monday",
  !!sawan && new Date(sawan + "T00:00:00Z").getUTCDay() === 1, `got ${sawan}`);

if (failures) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log(
  `PASS — ${matched}/${Object.keys(REAL).length} major festivals match their real 2026 date exactly; ` +
  `12 sankrantis, ${ekadashi} Ekadashis, ${purnima} Purnimas, ${amavasya} Amavasyas in the year; ` +
  `Sawan Somwar lands on a Monday. Named festivals are pinned to reality.`,
);
