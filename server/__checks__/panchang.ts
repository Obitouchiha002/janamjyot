/**
 * Panchang guard — choghadiya sequences against live ProKerala output.
 *
 *   npm run check:panchang
 *
 * The fixtures below were captured from the ProKerala choghadiya endpoint for
 * Delhi. They exist because the night sequence was wrong for a long time in a
 * way no amount of code review caught: it was generated with the day loop's
 * `+1` step, which made every night an exact replica of some other day's
 * daytime row. Only a comparison against a real platform exposed it — the true
 * night walk steps BACK two through the cycle.
 *
 * Day rows are included too. They were already correct, and this locks that in.
 *
 * Choghadiya boundaries follow sunrise/sunset, so this also fails if the
 * sunrise search or the timezone handling regresses.
 */
import { buildPanchang } from "../panchang";
import { chaturmasFor } from "../chaturmas";

const DELHI = { latitude: 28.6139, longitude: 77.209, timezone: "Asia/Kolkata", ayanamsa: 1 };

/** Captured from ProKerala. Their "Amrut" is spelled "Amrit" here. */
const FIXTURES: Record<string, { weekday: string; day: string[]; night: string[] }> = {
  "2026-07-19": {
    weekday: "Sunday",
    day: ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg"],
    night: ["Shubh", "Amrit", "Char", "Rog", "Kaal", "Labh", "Udveg", "Shubh"],
  },
  "2026-07-20": {
    weekday: "Monday",
    day: ["Amrit", "Kaal", "Shubh", "Rog", "Udveg", "Char", "Labh", "Amrit"],
    night: ["Char", "Rog", "Kaal", "Labh", "Udveg", "Shubh", "Amrit", "Char"],
  },
  "2026-07-21": {
    weekday: "Tuesday",
    day: ["Rog", "Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog"],
    night: ["Kaal", "Labh", "Udveg", "Shubh", "Amrit", "Char", "Rog", "Kaal"],
  },
  "2026-07-22": {
    weekday: "Wednesday",
    day: ["Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg", "Char", "Labh"],
    night: ["Udveg", "Shubh", "Amrit", "Char", "Rog", "Kaal", "Labh", "Udveg"],
  },
};

/** Rahu Kaal, Yamaganda and Gulika are eighths of the DAY, so each must land on
 *  a day choghadiya slot and be tagged — the muhurat picker relies on it. */
function checkBlockedTagging(p: any, date: string): number {
  let bad = 0;
  const blocked = (p.day_choghadiya ?? []).filter((c: any) => c.blocked);
  if (blocked.length !== 3) {
    console.error(`FAIL ${date}: expected 3 blocked day slots, got ${blocked.length}`);
    bad++;
  }
  const names = new Set(blocked.map((c: any) => c.blocked));
  for (const want of ["Rahu Kaal", "Yamaganda", "Gulika"]) {
    if (!names.has(want)) {
      console.error(`FAIL ${date}: no day slot tagged "${want}"`);
      bad++;
    }
  }
  if ((p.night_choghadiya ?? []).some((c: any) => c.blocked)) {
    console.error(`FAIL ${date}: a night slot is tagged blocked (these are daytime-only)`);
    bad++;
  }
  return bad;
}

let failures = 0;
for (const [date, fx] of Object.entries(FIXTURES)) {
  const p: any = buildPanchang({ date, ...DELHI } as any);

  for (const [phase, want] of [["day", fx.day], ["night", fx.night]] as const) {
    const got = (p[`${phase}_choghadiya`] ?? []).map((c: any) => c.name);
    const ok = got.length === want.length && got.every((x: string, i: number) => x === want[i]);
    if (!ok) {
      console.error(`FAIL ${date} (${fx.weekday}) ${phase} choghadiya:`);
      console.error(`  ours: ${got.join(",")}`);
      console.error(`  pk:   ${want.join(",")}`);
      failures++;
    }
  }

  failures += checkBlockedTagging(p, date);
}

/**
 * Chaturmas boundaries are lunar (Devshayani → Devuthani Ekadashi), computed
 * from a sankranti + the new moon that opens that lunar month. Locked against
 * published dates, because the failure mode is silent: a wrong boundary just
 * blocks or permits marriage dates with no visible error.
 *
 * 2025's end is a day after the widely-published date — in that year the
 * Ekadashi tithi begins after sunrise, which is exactly where the Smarta and
 * Vaishnava calendars diverge. Encoded as the expected value rather than
 * papered over.
 */
const CHATURMAS: Record<number, [string, string]> = {
  2024: ["2024-07-17", "2024-11-12"],
  2025: ["2025-07-06", "2025-11-02"],
  2026: ["2026-07-25", "2026-11-20"],
};
for (const [yearStr, [wantStart, wantEnd]] of Object.entries(CHATURMAS)) {
  const w = chaturmasFor(Number(yearStr), DELHI.latitude, DELHI.longitude, DELHI.timezone, DELHI.ayanamsa);
  if (!w) {
    console.error(`FAIL ${yearStr}: Chaturmas window could not be computed`);
    failures++;
  } else if (w.start !== wantStart || w.end !== wantEnd) {
    console.error(`FAIL ${yearStr}: Chaturmas ${w.start}..${w.end}, expected ${wantStart}..${wantEnd}`);
    failures++;
  }
}

const n = Object.keys(FIXTURES).length;
if (failures) {
  console.error(`\n${failures} failure(s) across ${n} days.`);
  process.exit(1);
}
console.log(
  `PASS — ${n} weekdays: day and night choghadiya match ProKerala exactly, ` +
  `Rahu Kaal / Yamaganda / Gulika are tagged on the day slots, and ` +
  `${Object.keys(CHATURMAS).length} years of Chaturmas boundaries match published dates.`,
);
