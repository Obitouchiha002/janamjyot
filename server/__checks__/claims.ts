/**
 * The placement fact-checker: flags what is false, and ONLY what is false.
 *
 * Both halves matter. Missing a false "Sun in the 6th house" lets a report tell
 * someone something untrue about their own chart. Flagging a TRUE sentence
 * triggers a needless regeneration — or, worse, teaches whoever reads the logs
 * to ignore the checker.
 *
 *   npm run check:claims
 */
import { wrongPlacements } from "../claim-check";

// A chart where Sun is in the 9th, Saturn the 8th, Jupiter the 4th, Mars the 10th.
const chart = {
  planet_positions: [
    { planet: "Sun", house: 9 }, { planet: "Saturn", house: 8 },
    { planet: "Jupiter", house: 4 }, { planet: "Mars", house: 10 },
    { planet: "Moon", house: 2 }, { planet: "Venus", house: 9 },
  ],
};
const transit = { Jupiter: 1 }; // Jupiter is passing through the 1st right now

const cases: Array<[string, string, number]> = [
  // [description, text, expected number of flags]
  ["true birth placement",                 "Aapka Sun 9th house mein hai.",                         0],
  ["false birth placement",                "Aapka Sun 6th house mein hai.",                         1],
  ["false, Hindi planet name",             "Shani 11th house mein baitha hai.",                     1],
  ["D10 placement, labelled",              "D10 mein Sun 6th house mein hai.",                      0],
  ["navamsa placement, labelled",          "Navamsa mein Saturn 7th house mein hai.",               0],
  ["transit, labelled",                    "Jupiter abhi gochar mein 1st house se guzar raha hai.", 0],
  ["transit, unlabelled but true now",     "Jupiter 1st house growth laata hai.",                   0],
  ["lordship, not placement",              "Mars, 7th house ka lord, career ko energy deta hai.",   0],
  ["counted from the Moon",                "Saturn chandra se 12th house mein hai.",                0],
  ["nearest planet, not first",            "Mercury-Rahu period mein Jupiter 4th house mein hai.",  0],
  ["nearest planet is the false one",      "Mercury-Rahu period mein Mars 2nd house mein hai.",     1],
  ["two claims, one false",                "Sun 9th house mein hai; Saturn 3rd house mein hai.",    1],
];

let failed = 0;
for (const [label, text, want] of cases) {
  const got = wrongPlacements(text, chart, transit).length;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(36)} expected ${want}, got ${got}`);
}
if (failed) {
  console.error(`\nFAIL — ${failed} of ${cases.length} cases wrong.`);
  process.exit(1);
}
console.log(`\nPASS — ${cases.length} cases: false placements flagged; labelled divisionals, transits, lordships and Moon-relative houses left alone.`);
