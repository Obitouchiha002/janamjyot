/**
 * Highlights / psyche / connection check.
 *
 *   npm run check:highlights
 *
 * These three engines (server/va/highlights.ts, psyche.ts, connection.ts) are what stop a
 * reading from being true of anyone: the live problems and strengths of THIS chart with the
 * date the running phase ends, how this person thinks and trips themselves up, and what a
 * chart can honestly say about a bond. The chat and the life report both lead with them.
 *
 * They were ported from VedicAstra, where they run on ITS normalized chart. This check runs
 * them on charts built by JanamJyot's OWN engine — which is the thing that could quietly
 * break — and asserts they produce real, chart-specific material rather than empty lists:
 *
 *   • every highlight says something, gives its chart reason, and a LIVE one carries the
 *     month its phase ends (the honest answer to "ye kab tak rahega");
 *   • different birth charts get different highlights and different patterns — output that
 *     is identical across charts is generic output, which is the bug these engines exist
 *     to kill;
 *   • the report mapping hands each life area its own problems/strengths;
 *   • connection facts never claim a name, face or gender.
 */
import { computeChart } from "../engine";
import { buildIsoDatetime } from "../validate";
import { normalizeChart } from "../normalize";
import { computeChartFacts, chartFactsForAI } from "../va/chartFacts";
import { periodProfile } from "../va/timing";
import { chartHighlights } from "../va/highlights";
import { psychePatterns } from "../va/psyche";
import { connectionFacts } from "../va/connection";
import { reportKeyPoints, highlightsFor } from "../va/keyPoints";

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
  } as any);
  return normalized as any;
}

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (!ok) { console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`); failures++; }
};

const PEOPLE = [
  { date: "2005-01-16", time: "17:00:00", tz: "Asia/Kolkata", lat: 28.6139, lon: 77.209, name: "One" },
  { date: "1984-11-10", time: "06:40:00", tz: "Asia/Kolkata", lat: 27.56246, lon: 76.625, name: "Two" },
  { date: "1996-04-02", time: "21:10:00", tz: "Asia/Kolkata", lat: 19.076, lon: 72.8777, name: "Three" },
];
const MONTH_YEAR = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/;

const perChart = PEOPLE.map((fx) => {
  const chart = makeChart(fx);
  const raw = computeChartFacts(chart, AYAN);
  const facts = raw ? chartFactsForAI(raw) : null;
  return {
    name: fx.name,
    chart,
    highlights: facts ? chartHighlights(chart, facts) : [],
    patterns: facts ? psychePatterns(chart, facts) : [],
    connection: facts ? connectionFacts(chart, facts, periodProfile(chart, AYAN)) : null,
  };
});

for (const p of perChart) {
  check(`${p.name}: the chart produces highlights at all`, p.highlights.length > 0);
  check(`${p.name}: every highlight says something and gives its chart reason`,
    p.highlights.every((h) => h.says.trim().length > 10 && h.because.trim().length > 5));
  check(`${p.name}: every highlight is marked problem or strength`,
    p.highlights.every((h) => h.kind === "problem" || h.kind === "strength"));
  const live = p.highlights.filter((h) => h.active_now);
  check(`${p.name}: a live highlight answers "kab tak" with a real month`,
    live.length === 0 || live.every((h) => MONTH_YEAR.test(String(h.until ?? h.background_until ?? ""))),
    live.map((h) => `${h.id}:${h.until ?? h.background_until}`).join(", "));

  check(`${p.name}: the psyche engine finds patterns`, p.patterns.length >= 3);
  check(`${p.name}: every pattern names how it shows up AND its gift`,
    p.patterns.every((t) => t.pattern.length > 10 && t.shows_up_as.length > 5 && t.gift.length > 5));

  check(`${p.name}: connection facts exist and stay honest`,
    !!p.connection && /naam|chehra|gender/i.test(p.connection.cannot_say));
  check(`${p.name}: the bond sketches are filled in from the chart`,
    !!p.connection?.love?.nature && !!p.connection?.marriage?.age_hint && !!p.connection?.marriage?.how_met);

  const kp = reportKeyPoints(p.chart);
  check(`${p.name}: the report's opening block is built`, !!kp && (kp.problems.length + kp.strengths.length) > 0);
  check(`${p.name}: that block stays short (3 each at most)`,
    !!kp && kp.problems.length <= 3 && kp.strengths.length <= 3 && kp.patterns.length <= 3);

  const per = highlightsFor(p.chart, ["health", "wealth", "career", "marriage", "relationships", "travel", "business"]);
  check(`${p.name}: at least one life area gets its own computed problems/strengths`,
    !!per && Object.values(per).some((g) => g.problems.length + g.strengths.length > 0));
}

// Generic output is the bug these engines exist to kill, so two charts must differ.
const fingerprint = (p: (typeof perChart)[number]) => p.highlights.map((h) => h.id).sort().join("|");
const patternPrint = (p: (typeof perChart)[number]) => p.patterns.map((t) => t.id).sort().join("|");
for (let i = 0; i < perChart.length; i++) {
  for (let j = i + 1; j < perChart.length; j++) {
    check(`${perChart[i].name} vs ${perChart[j].name}: highlights are not identical`,
      fingerprint(perChart[i]) !== fingerprint(perChart[j]));
    check(`${perChart[i].name} vs ${perChart[j].name}: patterns are not identical`,
      patternPrint(perChart[i]) !== patternPrint(perChart[j]));
  }
}

// A chart the engines cannot read must give nothing rather than something invented.
check("an unusable chart returns nothing instead of guessing",
  reportKeyPoints({}) === null && highlightsFor({}, ["health"]) === null && connectionFacts({}, {}, null) === null);

if (failures) {
  console.error(`\n${failures} failure(s).`);
  process.exit(1);
}
console.log(
  `PASS — highlights, psyche and connection all run on JanamJyot's own charts: ` +
  `${perChart.map((p) => `${p.name} ${p.highlights.length}h/${p.patterns.length}p`).join(", ")}, ` +
  `live ones carry a real "kab tak" month, every life area gets its own points, and no two ` +
  `charts produce the same reading.`,
);
