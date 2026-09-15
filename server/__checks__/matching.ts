/**
 * Kundli matching, Manglik and the divisional charts, against ProKerala.
 *
 *   npm run check:matching
 *
 * None of these had a test before. The accuracy check covers planetary
 * longitudes, but the parts built ON them — which sign a planet lands in for
 * D9/D10/D6, the eight koota scores, whether someone is Manglik — were never
 * compared to anything. When they finally were, the guna milan total was wrong
 * for three couples in four (27 where ProKerala says 21), and one chart in six
 * was called Manglik when it is not.
 *
 * Fixtures are ProKerala's own answers (reference-matching.json). Exits
 * non-zero on any disagreement, so it can gate a deploy.
 *
 * Known limit, stated so nobody mistakes this for more than it is: nine couples
 * reach nine cells of each 14x14 / 5x5 / 3x3 koota table, not every cell.
 * ProKerala's credits ran out before the full tables could be measured.
 */
import fixtures from "./reference-matching.json";
import { personMoon, matchKundli } from "../matching";
import { computeChart } from "../engine";
import { normalizeChart } from "../normalize";

const person = ([date, time, lat, lon]: any[]) =>
  personMoon({ name: "x", date_of_birth: date, time_of_birth: time, place_of_birth: "x",
    latitude: lat, longitude: lon, timezone: "Asia/Kolkata", language: "en" } as any, 1);

let failed = 0;
const fail = (msg: string) => { failed++; console.log("FAIL  " + msg); };

// ── Guna milan: every koota of every couple ──
const NAMES = ["Varna", "Vashya", "Tara", "Yoni", "Graha Maitri", "Gana", "Bhakoot", "Nadi"];
for (const c of fixtures.couples) {
  const r = matchKundli(person(c.boy), person(c.girl));
  if (r.total !== c.total) fail(`guna total ${c.boy[0]} + ${c.girl[0]}: ours ${r.total}, ProKerala ${c.total}`);
  r.kootas.forEach((k: any, i: number) => {
    if (k.score !== c.kootas[i]) fail(`${NAMES[i]} ${c.boy[0]} + ${c.girl[0]}: ours ${k.score}, ProKerala ${c.kootas[i]}`);
  });
}

// ── Manglik ──
for (const m of fixtures.manglik) {
  const ours = person(m.birth).manglik;
  if (ours !== m.has_dosha) fail(`manglik ${m.birth[0]} ${m.birth[1]}: ours ${ours}, ProKerala ${m.has_dosha}`);
}

// ── Divisional charts: sign and house of every planet ──
for (const dv of fixtures.divisional) {
  const [date, time, lat, lon] = dv.birth as any[];
  const iso = `${date}T${time}:00+05:30`;
  const local = computeChart({ datetime: iso, latitude: lat, longitude: lon, ayanamsa: 1 });
  const n: any = normalizeChart({
    birth: { name: "x", date_of_birth: date, time_of_birth: time, place_of_birth: "x", latitude: lat, longitude: lon, timezone: "Asia/Kolkata", language: "en" } as any,
    isoDatetime: iso, ayanamsa: 1, planetPositionData: local.planetPositionData,
    birthDetailsData: undefined, dashaData: local.dashaData, raw: undefined, provider: "local",
  }).normalized;
  const chart = dv.chart === "D9" ? n.d9_chart : n.divisional_charts?.[dv.chart];
  const ours: Record<string, { sign: string; house: number }> = {};
  if (chart?.planet_positions) for (const p of chart.planet_positions) ours[p.planet] = { sign: p.sign, house: p.house };
  else for (const h of chart?.houses ?? []) for (const pl of h.planets ?? []) ours[pl] = { sign: h.sign, house: h.house };
  for (const [planet, want] of Object.entries(dv.planets as Record<string, { sign: string; house: number }>)) {
    if (planet === "Ascendant") {
      if (chart?.ascendant_sign !== want.sign) fail(`${dv.chart} lagna ${date}: ours ${chart?.ascendant_sign}, ProKerala ${want.sign}`);
      continue;
    }
    const o = ours[planet];
    if (!o || o.sign !== want.sign || o.house !== want.house)
      fail(`${dv.chart} ${planet} ${date}: ours ${o?.sign}/${o?.house}, ProKerala ${want.sign}/${want.house}`);
  }
}

if (failed) { console.error(`\nFAIL — ${failed} disagreement(s) with ProKerala.`); process.exit(1); }
console.log(
  `PASS — ${fixtures.couples.length} couples: every koota score and total matches ProKerala; ` +
  `${fixtures.manglik.length} Manglik verdicts match; ${fixtures.divisional.length} divisional charts (D9/D10/D6) match sign and house for every planet.`,
);
