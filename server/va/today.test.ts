/**
 * Aaj Ka Din engine: the parts checked live against Drik Panchang on 21 Sep 2026, Delhi.
 * Abhijit is 11:50 AM–12:38 PM there, and Yamaganda runs till 12:14 PM. The reply once
 * gave only "12:14–12:38", which looked like a wrong Abhijit.
 */
import { describe, it, expect } from "./__shim__/vitest";
import { buildDayContext, dayContextForAI, weekContextForAI } from "./today";

// Gemini lagna, Moon in Pisces / Revati: the profile used in the live check.
const chart = {
  birth_details: { name: "Test", date_of_birth: "2005-01-16", time_of_birth: "17:00:00", timezone: "Asia/Kolkata", latitude: 28.65195, longitude: 77.23149 },
  ascendant: { sign: "Gemini" },
  summary: { lagna: "Gemini", rashi: "Pisces", nakshatra: "Revati" },
  planet_positions: [
    { planet: "Sun", sign: "Capricorn", house: 8, nakshatra: "Uttara Ashadha" },
    { planet: "Moon", sign: "Pisces", house: 10, nakshatra: "Revati" },
    { planet: "Mars", sign: "Scorpio", house: 6, nakshatra: "Anuradha" },
    { planet: "Mercury", sign: "Sagittarius", house: 7, nakshatra: "Mula" },
    { planet: "Jupiter", sign: "Virgo", house: 4, nakshatra: "Hasta" },
    { planet: "Venus", sign: "Sagittarius", house: 7, nakshatra: "Purva Ashadha" },
    { planet: "Saturn", sign: "Gemini", house: 1, nakshatra: "Punarvasu" },
    { planet: "Rahu", sign: "Aries", house: 11, nakshatra: "Bharani" },
    { planet: "Ketu", sign: "Libra", house: 5, nakshatra: "Swati" },
  ],
  dasha: { current: {} },
};
const DELHI = { latitude: 28.65195, longitude: 77.23149, timezone: "Asia/Kolkata", label: "Delhi" };

describe("Aaj Ka Din, 21 Sep 2026, Delhi", () => {
  const ai: any = dayContextForAI(buildDayContext(chart, "2026-09-21", 1, DELHI));
  const lines: string[] = ai.day_parts.flatMap((p: any) => p.what_happens_in_this_part);

  it("gives Abhijit's full span and its clean part", () => {
    const ab = lines.find((l) => l.includes("Abhijit"))!;
    expect(ab).toMatch(/^11:(49|50) AM to 12:38 PM: Abhijit Muhurat, but Yamaganda also runs in part of it, so the clean part is 12:14 PM to 12:38 PM/);
  });

  it("lists every avoid window, Gulika included", () => {
    expect(lines.some((l) => /Rahu Kaal/.test(l))).toBe(true);
    expect(lines.some((l) => /Yamaganda/.test(l))).toBe(true);
    expect(lines.some((l) => /01:45 PM to 03:1[67] PM: Gulika Kaal/.test(l))).toBe(true);
  });

  it("never calls Rog or Kaal a best time in the evening", () => {
    // Monday night: Char 6:19, Rog 7:48, Kaal 9:17 (Drik Panchang).
    expect(lines.some((l) => /07:4\d PM.*(Labh|Amrit)/.test(l))).toBe(false);
    expect(lines.some((l) => /09:1\d PM.*(Labh|Amrit)/.test(l))).toBe(false);
  });
});

describe("week outlook", () => {
  it("has 7 dated days, in words only, with best and careful days in date order", () => {
    const w = weekContextForAI(chart, "2026-09-21", 1, DELHI);
    expect(w.days).toHaveLength(7);
    expect(w.days[0]).toMatch(/^Monday 2026-09-21: /);
    expect(w.days.join(" ")).not.toMatch(/\d+\/10/);
    const order = (l: string) => w.days.findIndex((d) => d.startsWith(l));
    expect([...w.best_days].sort((a, b) => order(a) - order(b))).toEqual(w.best_days);
    expect([...w.careful_days].sort((a, b) => order(a) - order(b))).toEqual(w.careful_days);
  });
});
