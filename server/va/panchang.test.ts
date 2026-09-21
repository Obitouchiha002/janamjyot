/**
 * Choghadiya order against the standard table (the one Drik Panchang prints), for
 * every weekday, day and night. Live bug: the night order stepped +1 around the cycle,
 * so only the first night slot was right. 21 Sep 2026 (Monday), Delhi, 7:48–9:17 PM was
 * shown as "Labh"; Drik Panchang says Rog.
 */
import { describe, it, expect } from "./__shim__/vitest";
import { buildPanchang } from "./panchang";

const DELHI = { latitude: 28.65195, longitude: 77.23149, timezone: "Asia/Kolkata", ayanamsa: 1 };
const DAY: Record<string, string[]> = {
  Sunday: ["Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg"],
  Monday: ["Amrit", "Kaal", "Shubh", "Rog", "Udveg", "Char", "Labh", "Amrit"],
  Tuesday: ["Rog", "Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog"],
  Wednesday: ["Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg", "Char", "Labh"],
  Thursday: ["Shubh", "Rog", "Udveg", "Char", "Labh", "Amrit", "Kaal", "Shubh"],
  Friday: ["Char", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Udveg", "Char"],
  Saturday: ["Kaal", "Shubh", "Rog", "Udveg", "Char", "Labh", "Amrit", "Kaal"],
};
const NIGHT: Record<string, string[]> = {
  Sunday: ["Shubh", "Amrit", "Char", "Rog", "Kaal", "Labh", "Udveg", "Shubh"],
  Monday: ["Char", "Rog", "Kaal", "Labh", "Udveg", "Shubh", "Amrit", "Char"],
  Tuesday: ["Kaal", "Labh", "Udveg", "Shubh", "Amrit", "Char", "Rog", "Kaal"],
  Wednesday: ["Udveg", "Shubh", "Amrit", "Char", "Rog", "Kaal", "Labh", "Udveg"],
  Thursday: ["Amrit", "Char", "Rog", "Kaal", "Labh", "Udveg", "Shubh", "Amrit"],
  Friday: ["Rog", "Kaal", "Labh", "Udveg", "Shubh", "Amrit", "Char", "Rog"],
  Saturday: ["Labh", "Udveg", "Shubh", "Amrit", "Char", "Rog", "Kaal", "Labh"],
};

describe("choghadiya order", () => {
  // 20 Sep 2026 is a Sunday, so 20..26 covers every weekday once.
  for (let d = 20; d <= 26; d++) {
    const date = `2026-09-${d}`;
    const weekday = new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
    it(`${date} (${weekday}): day and night match the standard table`, () => {
      const p: any = buildPanchang({ date, ...DELHI });
      expect(p.day_choghadiya.map((c: any) => c.name)).toEqual(DAY[weekday]);
      expect(p.night_choghadiya.map((c: any) => c.name)).toEqual(NIGHT[weekday]);
    });
  }

  it("21 Sep 2026, Delhi: night times match Drik Panchang within 2 minutes", () => {
    const p: any = buildPanchang({ date: "2026-09-21", ...DELHI });
    const at = (hhmm: string) => Date.parse(`2026-09-21T${hhmm}:00+05:30`);
    // Drik Panchang: Chara 06:19–07:48 PM, Roga 07:48–09:17 PM, Kala 09:17–10:45 PM, Labha 10:45 PM–12:14 AM.
    const drik = [["Char", "18:19"], ["Rog", "19:48"], ["Kaal", "21:17"], ["Labh", "22:45"]] as const;
    drik.forEach(([name, start], i) => {
      expect(p.night_choghadiya[i].name).toBe(name);
      expect(Math.abs(p.night_choghadiya[i].start_ms - at(start))).toBeLessThan(2 * 60 * 1000);
    });
  });
});
