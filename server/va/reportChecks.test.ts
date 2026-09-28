/**
 * Fixtures are real text from the two reports behind the complaint (26 Sep 2026):
 * "Vansh kashyap" (Gemini lagna, Revati, Venus–Moon) and his friend "Dhurv"
 * (Gemini lagna, Purva Ashadha, Moon–Saturn), generated four minutes apart.
 */
import { describe, it, expect } from "./__shim__/vitest";
import { chartAnchors, chartAnchored, genericFields } from "./reportChecks";

describe("chartAnchored", () => {
  it("accepts a line built on a real placement", () => {
    expect(chartAnchored("Moon aapke 2nd house ka Swami hokar 10th house mein baithe hain")).toBe(true);
  });

  it("accepts Devanagari", () => {
    expect(chartAnchored("आपका शनि पहले भाव में है, इसलिए काम में देरी होती है")).toBe(true);
  });

  it("accepts a dated period", () => {
    expect(chartAnchored("Sep 2026 se Mar 2027 tak ka samay sabse anukool dikhta hai")).toBe(true);
  });

  it("accepts a named yoga and a nakshatra", () => {
    expect(chartAnchors("Aapke paas Gaja Kesari Yoga hai")).toContain("yoga");
    expect(chartAnchors("Aapki Janma Nakshatra Revati hai")).toContain("nakshatra");
  });

  // The actual generic lines, lifted from the two live reports.
  it.each([
    "Aapko rishton mein dhairya aur transparency rakhni chahiye. Apne bhavnaon ko sahi tareeke se vyakt karna seekhein.",
    "Aapko apne partner ke saath khuli aur imandaar baat-cheet banaye rakhni chahiye, jaldbaazi na karein.",
    "Apni sehat ko behtar banaye rakhne ke liye aapko niyamit roop se yoga ya dhyaan karna chahiye aur santulit aahar lein.",
    "Keep patience, communicate openly with the people around you, and things will steadily improve for you.",
  ])("rejects advice that would fit anybody: %s", (line) => {
    expect(chartAnchored(line)).toBe(false);
  });

  it("does not count a bare number as a house", () => {
    expect(chartAnchored("Roz 10 minute tak shant baith kar apne mann ko sthir karein aur gehri saans lein")).toBe(false);
  });

  it("counts a number only when a house word follows it", () => {
    expect(chartAnchors("Mangal 6th house mein hai")).toContain("house");
    expect(chartAnchors("शनि 3 भाव में बैठे हैं")).toContain("house");
  });
});

describe("genericFields", () => {
  const good = {
    summary: "Aapki Janma Nakshatra Revati hai, jo aapko creative aur sensitive banati hai, aur yeh aapke kaam mein bhi jhalak sakta hai clearly.",
    positive: "Jupiter, jo 10th house ke Swami hain, 4th house mein hain, isliye teaching aur finance mein safalta mil sakti hai aapko.",
    caution: "Aapka Saturn 1st house mein hai, jo kabhi kabhi aapko apne career ko lekar thoda insecure mehsoos kara sakta hai.",
    guidance: "Venus–Moon (2025–2027) ke dauran apne kaam ko lekar bade faisle lein, kyunki Moon aapke 10th house mein hai abhi.",
  };
  const vague = { ...good, guidance: "Aapko dhairya rakhna chahiye aur apne logon se khulkar baat karni chahiye, sab theek ho jayega dheere dheere." };

  it("passes a section whose every field names the chart", () => {
    expect(genericFields({ career: good }, ["career"])).toEqual([]);
  });

  it("names the field that floats free of the chart", () => {
    expect(genericFields({ career: vague }, ["career"])).toEqual(["career.guidance"]);
  });

  it("ignores short lines like a one-sentence disclaimer", () => {
    const short = { ...good, guidance: "Dhairya rakhein." };
    expect(genericFields({ career: short }, ["career"])).toEqual([]);
  });

  it("skips sections that are missing or failed", () => {
    expect(genericFields({ career: null }, ["career", "health"])).toEqual([]);
  });
});
