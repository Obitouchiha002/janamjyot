/**
 * Rashi must match what Indian panchangs say. Everyone knows their rashi, so
 * getting it wrong costs all trust. Reference values come from Drik Panchang and
 * standard naam-rashi (Avakahada) charts.
 */
import { describe, it, expect } from "./__shim__/vitest";
import { rashiInfo, naamRashi } from "./rashi";

const person = (date: string, time: string, name = "Test") => ({
  birth_details: { name, date_of_birth: date, time_of_birth: time, timezone: "Asia/Kolkata", place_of_birth: "Delhi" },
});
const minutesApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 60000;

describe("Janma Rashi (Moon sign, Lahiri)", () => {
  it("16 Jan 2005, 5 PM, Delhi → Meen, Revati pada 2 (Drik Panchang: 'Meena upto 06:13 AM, Jan 17')", () => {
    const r = rashiInfo(person("2005-01-16", "17:00:00", "Vansh Kashyap"), 1)!;
    expect(r.janma_rashi.sign_hi).toBe("Meen");
    expect(r.janma_rashi.nakshatra).toBe("Revati");
    expect(r.janma_rashi.pada).toBe(2);
    expect(r.janma_rashi.whole_birth_date_same).toBe(true); // the time of day can't change it
    // Moon leaves Meen at 6:12-6:13 AM on 17 Jan
    expect(minutesApart(r.janma_rashi.moon_in_this_rashi.to.replace(",", ""), "17 Jan 2005 6:13 AM GMT+0530")).toBeLessThanOrEqual(3);
  });
  it("10 Nov 1984, 6:40 AM → Vrishabh, Krittika pada 4", () => {
    const r = rashiInfo(person("1984-11-10", "06:40:00"), 1)!;
    expect(r.janma_rashi.sign_hi).toBe("Vrishabh");
    expect(r.janma_rashi.nakshatra).toBe("Krittika");
    expect(r.janma_rashi.pada).toBe(4);
  });
  it("a birth minutes after the Moon changed rashi is flagged (the time must be checked)", () => {
    // The Moon entered Meen at ~00:23 on 15 Jan 2005; a 00:40 birth is 17 minutes in.
    const r = rashiInfo(person("2005-01-15", "00:40:00"), 1)!;
    expect(r.janma_rashi.sign_hi).toBe("Meen");
    expect(r.janma_rashi.whole_birth_date_same).toBe(false);
    expect(r.janma_rashi.confidence).toMatch(/check the birth time/);
    expect(r.janma_rashi.nearby_change?.other_sign_hi).toBe("Kumbh");
  });
  it("the month table places Vrishchik on 7-8 Jan 2005 (so 'Vrishchik' needs a different birth date)", () => {
    const r = rashiInfo(person("2005-01-16", "17:00:00"), 1)!;
    const v = r.moon_calendar_around_birth.find((w) => w.sign_hi === "Vrishchik")!;
    expect(v.from).toMatch(/^6 Jan,/);
    expect(v.to).toMatch(/^9 Jan,/);
  });
  it("Surya rashi: Vedic Makar; Western Capricorn for 16 Jan", () => {
    const r = rashiInfo(person("2005-01-16", "17:00:00"), 1)!;
    expect(r.surya_rashi.vedic.sign_hi).toBe("Makar");
    expect(r.surya_rashi.western.sign).toBe("Capricorn");
  });
});

describe("Naam Rashi (Avakahada chakra)", () => {
  const cases: Array<[string, string]> = [
    ["Vansh", "Vrishabh"], ["Abhishek", "Mesh"], ["Rahul", "Tula"], ["Priya", "Kanya"], ["Krishna", "Mithun"],
    ["Manish", "Singh"], ["Yash", "Vrishchik"], ["Naina", "Vrishchik"], ["Hemant", "Kark"], ["Chirag", "Meen"],
    ["Gaurav", "Kumbh"], ["Bhavya", "Dhanu"], ["Lakshya", "Mesh"], ["Deepanshu", "Meen"], ["Jatin", "Makar"],
  ];
  for (const [name, sign] of cases) it(`${name} → ${sign}`, () => expect(naamRashi(name)!.primary.sign_hi).toBe(sign));
  it("flags spellings that can be two aksharas (त/ट)", () => {
    const t = naamRashi("Tarun")!;
    expect(t.primary.sign_hi).toBe("Tula");
    expect(t.alternatives.map((a) => a.sign_hi)).toContain("Singh");
  });
});
