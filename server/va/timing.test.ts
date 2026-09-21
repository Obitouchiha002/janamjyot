/**
 * The timing engine must be deterministic: same chart + same question = same
 * window, every time. It must also pick the textbook answer on a chart where the
 * answer is obvious.
 */
import { describe, it, expect } from "./__shim__/vitest";
import { computeTiming, detectTimingTopic, detectTimingTopics, timingForAI } from "./timing";

const VIM: Array<[string, number]> = [
  ["Ketu", 7], ["Venus", 20], ["Sun", 6], ["Moon", 10], ["Mars", 7],
  ["Rahu", 18], ["Jupiter", 16], ["Saturn", 19], ["Mercury", 17],
];
const DAY = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Antardashas for consecutive mahadashas starting with `firstMd` at `startIso`. */
function antardashas(firstMd: string, startIso: string, mdCount = 3) {
  const out: any[] = [];
  let mdStart = Date.parse(startIso);
  let mi = VIM.findIndex(([n]) => n === firstMd);
  for (let k = 0; k < mdCount; k++, mi = (mi + 1) % 9) {
    const [md, mdYears] = VIM[mi];
    const mdLen = mdYears * 365.25 * DAY;
    let acc = mdStart;
    for (let j = 0; j < 9; j++) {
      const [ad, adYears] = VIM[(mi + j) % 9];
      const len = mdLen * (adYears / 120);
      out.push({ mahadasha: md, lord: ad, label: `${md}-${ad}`, from: iso(acc), to: iso(acc + len) });
      acc += len;
    }
    mdStart += mdLen;
  }
  return out;
}

// Aries lagna. Venus sits in the 7th (Libra) and also rules the 2nd and 7th, so it is
// the clear marriage significator. Every other planet stays away from 7/2/11.
const chart = {
  birth_details: { date_of_birth: "1996-03-01", gender: "male" },
  d1_chart: { ascendant_sign: "Aries" },
  planet_positions: [
    { planet: "Sun", sign: "Leo", house: 5, nakshatra: "Magha" },
    { planet: "Moon", sign: "Taurus", house: 2, nakshatra: "Rohini" },
    { planet: "Mars", sign: "Aries", house: 1, nakshatra: "Ashwini" },
    { planet: "Mercury", sign: "Virgo", house: 6, nakshatra: "Hasta" },
    { planet: "Jupiter", sign: "Cancer", house: 4, nakshatra: "Pushya" },
    { planet: "Venus", sign: "Libra", house: 7, nakshatra: "Swati" },
    { planet: "Saturn", sign: "Capricorn", house: 10, nakshatra: "Shravana" },
    { planet: "Rahu", sign: "Gemini", house: 3, nakshatra: "Ardra" },
    { planet: "Ketu", sign: "Sagittarius", house: 9, nakshatra: "Mula" },
  ],
  dasha: { antardasha: antardashas("Jupiter", "2020-01-01") },
};
const NOW = Date.UTC(2026, 0, 1);

describe("timing engine", () => {
  it("puts marriage in the Venus antardasha when Venus sits in and rules the 7th", () => {
    const t = computeTiming(chart, "marriage", 1, NOW)!;
    expect(t).toBeTruthy();
    expect(t.most_likely.period).toBe("Jupiter Mahadasha – Venus Antardasha");
    expect(t.most_likely.why.join(" ")).toMatch(/7th house/);
  });

  it("is deterministic: same inputs give identical output", () => {
    const a = computeTiming(chart, "marriage", 1, NOW);
    const b = computeTiming(chart, "marriage", 1, NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(timingForAI(a!))).toBe(JSON.stringify(timingForAI(b!)));
  });

  it("never returns a window before the minimum age or in the past", () => {
    const t = computeTiming(chart, "marriage", 1, NOW)!;
    for (const p of t.all_periods) expect(Number(p.window.slice(-4))).toBeGreaterThanOrEqual(2026);
  });

  it("detects topics from Hinglish questions, specific topics first", () => {
    expect(detectTimingTopic("Shaadi kab hogi?")).toBe("marriage");
    expect(detectTimingTopic("Mera ghar kab banega?")).toBe("property");
    expect(detectTimingTopic("Bachcha kab hoga?")).toBe("children");
    expect(detectTimingTopic("Naukri kab lagegi?")).toBe("career");
    expect(detectTimingTopic("Videsh jaane ka yog kab hai?")).toBe("foreign");
    expect(detectTimingTopic("aur kuch batao")).toBe(null);
    expect(detectTimingTopic("aur kuch batao", "wealth")).toBe("wealth");
  });

  it("finds the topics of the live test questions, typos included", () => {
    expect(detectTimingTopics("kya is week koi buines meating ho ksati hai koi new deal mil sakti hai bato")).toEqual(["business"]);
    expect(detectTimingTopics("kiss type ki buiesn deal hogi or extaly kab tak hoagi ye bato")).toEqual(["business"]);
    expect(detectTimingTopics("ok merei shadi kab tak hogi me new biek ya koi bhi gadi kab tak le pauanag or me amer banayunag ya nahi or banuang to kab tak buanag")).toEqual(["property", "marriage", "wealth"]);
    expect(detectTimingTopic("Carrer ke bare bato")).toBe("career");
    expect(detectTimingTopic("OR BATAO ME FINANCIAL STRPNG KAB HOUGA")).toBe("wealth");
    expect(detectTimingTopic("buisness kab badhega")).toBe("business");
    expect(detectTimingTopic("meri marrige kab hogi")).toBe("marriage");
  });

  it("does not fire inside other words", () => {
    expect(detectTimingTopic("OKAY AB BATAO  MERE UPR LOAN H ??")).toBe("wealth"); // not "pr " → foreign
    expect(detectTimingTopic("is person ke saath kaisa rahega")).toBe(null); // not "son "
    expect(detectTimingTopic("meri rashi dhanu hai")).toBe(null); // not "dhan"
    expect(detectTimingTopic("properly samjhao")).toBe(null); // one typo from "property"
    expect(detectTimingTopic("hamari compatibility kaisi hai")).toBe(null); // not "pati"
  });
});
