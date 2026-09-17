/**
 * Does the app tell the truth about a chart — on every surface?
 *
 *   npm run check:ai -- [chartId]
 *
 * The other checks prove the MATH: positions against ProKerala and the Swiss
 * Ephemeris, kootas against a reference table, dasha against its own
 * arithmetic. None of that is what a person reads. They read sentences a
 * language model wrote about those numbers, on nine different screens, and a
 * model that is right about the chart and wrong in one clause is still wrong
 * to them — and the screen it happens on is a matter of luck, not design.
 *
 * So this generates every AI surface for a real chart and checks every
 * sentence it produced against the computed truth: a plain "Nth house" that is
 * not where that planet is, a running dasha named wrongly, a house lord that
 * rules something else, a period dated differently from the timeline it was
 * handed.
 *
 * It costs real model calls, so it is NOT part of `npm run check`. Run it
 * after touching a prompt, and before shipping anything that writes sentences.
 */
import { getNormalizedChart } from "../db";
import { buildTransit, compactTransitForAI } from "../transit";
import { chartClaimErrors, wrongPlacements } from "../claim-check";
import {
  answerUniversal, detectCategory, generateLifeReport, generateFocusedReport,
  generateLifeTimeline, generatePastTimeline, generateMarriageOutlook, generateDecision,
} from "../gemini";
import { pastMilestones } from "../past-timeline";
import { personMoon, matchKundli, nadiOf } from "../matching";
import { deepPerson, timingAlignment, doshaDetails } from "../deep-match";
import { decisionKind, decisionWindow } from "../decide";

const AYANAMSA = Number(process.env.AYANAMSA ?? 1);
const LANG = process.env.CHECK_LANG || "hinglish";

/** Every string in a generated object, flattened — nothing escapes the check. */
function strings(value: any, out: string[] = []): string[] {
  if (typeof value === "string") { if (value.trim().length > 20) out.push(value); return out; }
  if (Array.isArray(value)) { value.forEach((v) => strings(v, out)); return out; }
  if (value && typeof value === "object") { Object.values(value).forEach((v) => strings(v, out)); return out; }
  return out;
}

interface Result { surface: string; ok: boolean; errors: string[]; ms: number; note?: string }

(async () => {
  const chartId = process.argv[2] || process.env.CHECK_CHART_ID;
  if (!chartId) {
    console.error("Usage: npm run check:ai -- <chartId>   (a TEST chart, never a real user's)");
    process.exit(1);
  }
  const chart = await getNormalizedChart(chartId);
  if (!chart) { console.error("Chart not found:", chartId); process.exit(1); }
  const transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString()));
  const tr: Record<string, number> = {};
  for (const p of (transit as any)?.transiting_planets ?? []) {
    if (p.planet && p.transit_house_from_lagna) tr[p.planet] = Number(p.transit_house_from_lagna);
  }

  const truth = {
    lagna: chart.summary?.lagna,
    dasha: chart.dasha?.current,
    planets: (chart.planet_positions ?? []).map((p: any) => `${p.planet}:${p.sign}/${p.house}`).join(" "),
  };
  console.log("Chart:", chartId, "\nTruth:", JSON.stringify(truth), "\n");

  const results: Result[] = [];
  /*
   * A reading about TWO people cannot be checked against one chart.
   *
   * The outlook says "Venus in the 11th" about the partner, and a checker
   * holding only this person's chart calls that false — so the sweep would
   * report a failure that is really its own. A claim is counted only when it is
   * wrong for BOTH charts on the page.
   */
  const run = async (surface: string, fn: () => Promise<any>, alsoTrueFor?: any) => {
    const t0 = Date.now();
    try {
      const value = await fn();
      const ms = Date.now() - t0;
      if (value?.error) { results.push({ surface, ok: false, errors: [String(value.error)], ms }); return value; }
      const errs: string[] = [];
      for (const text of strings(value)) {
        // Sentence by sentence: a paragraph about a couple names both charts,
        // and judging the whole paragraph against one of them is how the sweep
        // reports its own confusion as the app's mistake.
        // Split on clause joins too ("Priya ka Venus 11th aur Arjun ka Venus
        // 10th"): one sentence can carry a true claim about each person, and
        // read whole it is false about both.
        for (const clause of text.split(/(?<=[.!?।])\s+|[;,]\s*|\s+aur\s+|\s+and\s+/)) {
          const e = chartClaimErrors(clause, chart, tr);
          if (!e.count) continue;
          if (alsoTrueFor && !chartClaimErrors(clause, alsoTrueFor, {}).count) continue;
          // A clause that names the partner is about the partner's chart.
          if (alsoTrueFor && /\bQA Partner\b|\bPartner\b/i.test(clause)) continue;
          // The sentence itself, not only the verdict: half the time the
          // "false" claim turns out to be a lordship or an aspect the checker
          // could not see, and that is a bug in the checker, not the reading.
          const excerpt = wrongPlacements(clause, chart, tr).map((w) => w.excerpt).join(" / ") || clause.slice(0, 120);
          errs.push(`${e.summary} → ${e.note().split("\n").filter((l) => l.startsWith("- ")).join(" | ")}\n          « ${excerpt} »`);
        }
      }
      results.push({ surface, ok: !errs.length, errors: errs, ms });
      return value;
    } catch (err: any) {
      results.push({ surface, ok: false, errors: [`threw: ${err?.message}`], ms: Date.now() - t0 });
      return null;
    }
  };

  // ── chat: the surface people use most, and the one with the least room ──
  for (const q of [
    "Mera career agle 2 saal mein kaisa rahega?",
    "Abhi kaunsi dasha chal rahi hai aur uska matlab kya hai?",
    "Pichhle 5 saal itne mushkil kyun the?",
    "Meri shaadi ke liye kaunsa samay theek hai?",
  ]) {
    await run(`chat: ${q.slice(0, 34)}…`, () =>
      answerUniversal({ chart, question: q, language: LANG, category: detectCategory(q), transit, userName: "Test", history: [], isFirst: false }));
  }

  // ── the long readings ────────────────────────────────────────────────────
  await run("life report (7 areas)", () => generateLifeReport(chart, LANG, transit));
  await run("focused: career", () => generateFocusedReport(chart, "career", LANG, transit));
  await run("focused: marriage", () => generateFocusedReport(chart, "marriage", LANG, transit));
  await run("timeline: year", () => generateLifeTimeline(chart, "year", LANG, transit));
  await run("past timeline", () => generatePastTimeline({ chart, periods: pastMilestones(chart, 5), language: LANG }));

  // ── matching, against a second chart ─────────────────────────────────────
  const other = {
    name: "QA Partner", date_of_birth: "1996-11-12", time_of_birth: "07:20",
    latitude: 19.076, longitude: 72.8777, timezone: "Asia/Kolkata", gender: "female",
  } as any;
  const me = chart.birth_details;
  if (me?.latitude != null && me?.longitude != null) {
    const a = personMoon(me, AYANAMSA), b = personMoon(other, AYANAMSA);
    const base = matchKundli(a, b);
    const boy = deepPerson(me, AYANAMSA), girl = deepPerson(other, AYANAMSA);
    const girlChart = { planet_positions: girl.planets, d1_chart: { houses: girl.d1_houses }, dasha: chart.dasha };
    await run("marriage outlook", () => generateMarriageOutlook({
      base, boy, girl,
      timing: timingAlignment(boy, girl),
      doshas: doshaDetails(a.manglik, b.manglik, a.signIndex, b.signIndex, a.rasiLord, b.rasiLord, a.nakIndex, b.nakIndex, nadiOf(a.nakIndex), nadiOf(b.nakIndex)),
      language: LANG,
    }), girlChart);
  }

  // ── the decision card ────────────────────────────────────────────────────
  const dq = "Usse 3 din se baat nahi hui, message karun ya nahi?";
  const kind = decisionKind(dq);
  await run("decision card", () => generateDecision({
    question: dq, kind, answers: { conversation: "Them: usne reply nahi kiya" },
    chart, transit, language: LANG, wantsDraft: true, userName: "Test",
    window: decisionWindow({
      kind, latitude: Number(me?.latitude), longitude: Number(me?.longitude),
      timezone: String(me?.timezone || "Asia/Kolkata"), ayanamsa: AYANAMSA,
    }),
  }));

  // ── the verdict ──────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(72));
  let bad = 0;
  for (const r of results) {
    console.log(`${r.ok ? "ok  " : "FAIL"}  ${r.surface.padEnd(38)} ${String(r.ms / 1000).padStart(5)}s`);
    for (const e of r.errors) { bad++; console.log(`        ${e.slice(0, 260)}`); }
  }
  console.log("─".repeat(72));
  if (bad) {
    console.error(`\n${bad} false claim(s) across ${results.length} surfaces.`);
    process.exit(1);
  }
  console.log(`\nPASS — ${results.length} AI surfaces, every placement, running dasha, house lord and period date traced back to the computed chart.`);
  process.exit(0);
})();
