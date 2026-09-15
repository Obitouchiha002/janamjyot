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
import { wrongPlacements, wrongDashaClaims, wrongLordships } from "../claim-check";

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
// Running periods: Venus mahadasha, Saturn antardasha.
const dchart = { dasha: { current: { mahadasha: "Venus", antardasha: "Saturn" } } };
const dashaCases: Array<[string, string, number]> = [
  ["true running mahadasha",               "Abhi aapki Venus mahadasha chal rahi hai.",               0],
  ["false running mahadasha",              "Abhi aapki Shani mahadasha chal rahi hai.",               1],
  ["Hindi name, true",                     "Aap Shukra mahadasha mein hain.",                         0],
  ["pair, true",                           "Abhi Venus-Saturn antardasha chal rahi hai.",             0],
  ["pair, false antardasha",               "Abhi Venus-Mercury antardasha chal rahi hai.",            1],
  ["future period, not a claim about now", "2031 se Sun mahadasha shuru hogi.",                       0],
  ["false running antardasha",             "Currently Rahu antardasha running hai.",                  1],
  ["past period, then a clause about now", "Pichhle saal Rahu antardasha thi, abhi samay behtar hai.", 0],
];
for (const [label, text, want] of dashaCases) {
  const got = wrongDashaClaims(text, dchart).length;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(36)} expected ${want}, got ${got}`);
}
cases.push(...dashaCases);

// Lordships for a Gemini lagna: 10th Pisces→Jupiter, 11th Aries→Mars, 5th Libra→Venus.
const LORDS = ["Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter", "Mars", "Venus"];
const lchart = { d1_chart: { houses: LORDS.map((l, i) => ({ house: i + 1, sign_lord: l })) } };
const lordCases: Array<[string, string, number]> = [
  ["live bug: Venus as 10th lord",          "Venus aapke 10th house ka lord hai jo career ke liye important hai.", 1],
  ["live bug: 11th lord Mercury",           "11th house ke lord Mercury ka prabhav se paise aayenge.",            1],
  ["true lordship, planet after",           "10th house ke lord Jupiter 1st house mein hain.",                    0],
  ["true lordship, planet before",          "Mars, 11th house ka lord, gains deta hai.",                          0],
  ["English, true",                         "Venus is the lord of the 5th house.",                                0],
  ["English, false",                        "Saturn is the lord of the 5th house.",                               1],
  ["D10 lordship left alone",               "D10 mein 10th lord Venus hai.",                                      0],
  ["from the Moon left alone",              "Chandra se 10th house ka lord Mars hai.",                            0],
  ["two houses named together",             "Saturn 8th aur 9th house ka lord hai.",                              0],
  ["no planet bound",                       "10th house ka lord strong hai.",                                     0],
];
for (const [label, text, want] of lordCases) {
  const got = wrongLordships(text, lchart).length;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(36)} expected ${want}, got ${got}`);
}
cases.push(...lordCases);

if (failed) {
  console.error(`\nFAIL — ${failed} of ${cases.length} cases wrong.`);
  process.exit(1);
}
console.log(`\nPASS — ${cases.length} cases: false placements flagged; labelled divisionals, transits, lordships and Moon-relative houses left alone; a wrongly named running dasha or house lord is flagged, future periods and divisional lordships are not.`);
