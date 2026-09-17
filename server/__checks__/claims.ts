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
import { wrongPlacements, wrongDashaClaims, wrongLordships, wrongDashaWindows } from "../claim-check";

// A chart where Sun is in the 9th, Saturn the 8th, Jupiter the 4th, Mars the 10th.
const chart = {
  planet_positions: [
    { planet: "Sun", house: 9 }, { planet: "Saturn", house: 8 },
    { planet: "Jupiter", house: 4 }, { planet: "Mars", house: 10 },
    { planet: "Moon", house: 2 }, { planet: "Venus", house: 9 },
  ],
  // Jupiter rules the 7th here — so "Jupiter ka 7th house" is a lordship.
  d1_chart: { houses: [1,2,3,4,5,6,7,8,9,10,11,12].map((h) => ({ house: h, sign_lord: h === 7 ? "Jupiter" : "Mercury" })) },
};
const transit = { Jupiter: 1 }; // Jupiter is passing through the 1st right now

const cases: Array<[string, string, number]> = [
  // [description, text, expected number of flags]
  ["true birth placement",                 "Aapka Sun 9th house mein hai.",                         0],
  ["false birth placement",                "Aapka Sun 6th house mein hai.",                         1],
  ["false, Hindi planet name",             "Shani 11th house mein baitha hai.",                     1],
  ["D10 placement, labelled",              "D10 mein Sun 6th house mein hai.",                      0],
  ["navamsa placement, labelled",          "Navamsa mein Saturn 7th house mein hai.",               0],
  ["D10 named once, two claims after it",  "D10 mein Mars aur Jupiter 10th house mein hain, lekin Sun 11th house mein hone se career mixed hai.", 0],
  ["transit, labelled",                    "Jupiter abhi gochar mein 1st house se guzar raha hai.", 0],
  ["transit, unlabelled but true now",     "Jupiter 1st house growth laata hai.",                   0],
  ["lordship, not placement",              "Mars, 7th house ka lord, career ko energy deta hai.",   0],
  ["counted from the Moon",                "Saturn chandra se 12th house mein hai.",                0],
  ["nearest planet, not first",            "Mercury-Rahu period mein Jupiter 4th house mein hai.",  0],
  ["nearest planet is the false one",      "Mercury-Rahu period mein Mars 2nd house mein hai.",     1],
  ["two claims, one false",                "Sun 9th house mein hai; Saturn 3rd house mein hai.",    1],
  ["house first, planet after — both true", "2nd house mein Moon aur 9th house mein Sun hone se…",   0],
  ["house first, planet after — false",     "2nd house mein Moon aur 9th house mein Saturn hone se…", 1],
  ["an aspect is not a placement",         "Jupiter ki drishti 10th house par hai.",                0],
  ["planet paired with a house it rules",  "Jupiter ka 7th house rishton ko majboot karta hai.",    0],
  ["lordship stated after the house",      "Jupiter 10th house ka swami hone se career strong hai.", 0],
  ["English lordship after the house",     "Jupiter governs the 10th house for you.",               0],
  ["English aspect, also fine",            "Jupiter aspects the 10th house from there.",            0],
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
  ["a future period beside the word abhi",  "Venus-Mercury (2027-2029) ki antardasha ke liye abhi se taiyari rakhein.", 0],
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

// Real antardasha rows: Venus-Saturn ran 2023-11-28 → 2027-01-27.
const wchart = { dasha: { antardasha: [
  { mahadasha: "Venus", lord: "Saturn", from: "2023-11-28", to: "2027-01-27" },
  { mahadasha: "Venus", lord: "Mercury", from: "2027-01-27", to: "2029-11-27" },
] } };
const windowCases: Array<[string, string, number]> = [
  ["dates as given",            "**Venus-Saturn (2023–2027)**: mehnat ka daur.",     0],
  ["a year of slack is fine",   "Venus-Saturn (2024–2027) mein dhyan rakhein.",      0],
  ["invented dates",            "**Venus-Saturn (2021–2025)** mein padhai achhi rahi.", 1],
  ["a period we do not have",   "Sun-Rahu (2031–2033) acha rahega.",                 0],
  ["prose, right dates",        "Venus-Mercury 2027 to 2029 tak achha samay hai.",   0],
  ["prose, wrong dates",        "Venus-Mercury 2030 to 2033 tak achha samay hai.",   1],
];
for (const [label, text, want] of windowCases) {
  const got = wrongDashaWindows(text, wchart).length;
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(36)} expected ${want}, got ${got}`);
}
cases.push(...windowCases);

if (failed) {
  console.error(`\nFAIL — ${failed} of ${cases.length} cases wrong.`);
  process.exit(1);
}
console.log(`\nPASS — ${cases.length} cases: false placements flagged; labelled divisionals, transits, lordships and Moon-relative houses left alone; a wrongly named running dasha, house lord or period date is flagged, while future periods, divisional lordships and a year of rounding are not.`);
