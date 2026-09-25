/**
 * Fixtures here are the real messages from one live session (25 Sep 2026) that the user
 * reported: "kai baar question ka answer repeat kar raha hai … poora sawal theek se nahi
 * padh raha".
 */
import { describe, it, expect } from "./__shim__/vitest";
import { repetition, repeatsTooMuch, questionParts, asksWhen, givesTime } from "./replyChecks";

// 09:11 — answer to "is week koi business meeting hogi, naya client milega?"
const BUSINESS_ANSWER = `Vansh, aapke sawaal ko dekhte hue, aapke business mein is hafte ya is mahine mein koi **nayee meeting, client ya project** milne ke yog **madhyam** hain.

Agar aap naye business meetings ya project shuru karne ka soch rahe hain, to **is hafte mein Saturday, 26 September aur Monday, 28 September** ka din aapke liye **sabse shubh** dikh raha hai.

Bade aur mahatvapurn business deals ya naye client milne ke **kaafi majboot yog** aapke liye **September 2026 se February 2027** tak ban rahe hain. Ismein bhi **September 2026 se January 2027** tak ka samay **vishesh roop se faydemand** rahega. Is dauran aapko apne vyapar mein **acchi growth aur naye avasar** mil sakte hain, jisse aapki aamdani bhi badhegi.`;

// 09:15 — answer to a different question (a specific client's meeting), carrying the same
// two paragraphs back word for word.
const REPEATED_ANSWER = `Vansh, aapke is naye foreign client aur meeting ke bare mein aapki utsukta swabhavik hai.

Agar aap is meeting ke liye koi din dekh rahe hain, to is hafte mein **Saturday, 26 September** ya **Monday, 28 September** ka din **zyada shubh** dikh raha hai.

Bade aur mahatvapurn business deals ya naye client milne ke **kaafi majboot yog** aapke liye **September 2026 se February 2027** tak ban rahe hain. Ismein bhi **September 2026 se January 2027** tak ka samay **vishesh roop se faydemand** rahega. Is dauran aapko apne vyapar mein **acchi growth aur naye avasar** mil sakte hain, jisse aapki aamdani bhi badhegi.`;

const FRESH_ANSWER = `Vansh, is meeting ke liye **26 September** sabse saaf din hai — us din baat-cheet aapke favour mein rehti hai.

Meeting khud **agle 10-12 din** ke andar tay ho jayegi, aur uska natija **madhyam** hai: turant bada order nahi, par rishta bana rahega.

Long term mein isse fayda **February 2027 ke baad** dikhta hai, jab aapke videsh se jude kaam ka samay khulta hai.`;

describe("a reply must not re-serve what this chat already said", () => {
  it("catches two paragraphs sent back word for word", () => {
    const r = repetition(REPEATED_ANSWER, [BUSINESS_ANSWER]);
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    expect(r.share).toBeGreaterThan(0.5);
    expect(repeatsTooMuch(r)).toBe(true);
  });

  it("catches a repeat that was only lightly reworded", () => {
    const reworded = "Bade aur mahatvapurn business deals ya naye client milne ke bahut majboot yog aapke liye September 2026 se February 2027 tak ban rahe hain.";
    expect(repetition(reworded, [BUSINESS_ANSWER]).lines.length).toBe(1);
    expect(repeatsTooMuch(repetition(reworded, [BUSINESS_ANSWER]))).toBe(true); // that IS the whole reply
  });

  it("allows a couple of old lines inside a long, genuinely new answer", () => {
    const longFresh = `${FRESH_ANSWER}\n\n${FRESH_ANSWER.replace(/26 September/g, "28 September")}\n\nAapke liye is baar sabse alag baat ye hai ki videsh se juda kaam aapke dasve bhav se chalta hai, aur wahi is meeting ko asar deta hai.\n\nIs hafte mein Saturday, 26 September aur Monday, 28 September ka din aapke liye sabse shubh dikh raha hai.\n\nIs dauran aapko apne vyapar mein acchi growth aur naye avasar mil sakte hain, jisse aapki aamdani bhi badhegi.`;
    const r = repetition(longFresh, [BUSINESS_ANSWER]);
    expect(r.lines.length).toBe(2);
    expect(repeatsTooMuch(r)).toBe(false); // two old lines in a long new answer is not a repeat
  });

  it("allows one old line inside an otherwise fresh answer", () => {
    const mostlyNew = `${FRESH_ANSWER}\n\nBade aur mahatvapurn business deals ya naye client milne ke bahut majboot yog aapke liye September 2026 se February 2027 tak ban rahe hain.`;
    const r = repetition(mostlyNew, [BUSINESS_ANSWER]);
    expect(r.lines.length).toBe(1);
    expect(repeatsTooMuch(r)).toBe(false); // restating one fact where it belongs is normal
  });

  it("leaves a genuinely new answer alone", () => {
    const r = repetition(FRESH_ANSWER, [BUSINESS_ANSWER]);
    expect(r.lines).toEqual([]);
    expect(r.share).toBe(0);
    expect(repeatsTooMuch(r)).toBe(false);
  });

  it("has nothing to compare against on the first message of a chat", () => {
    expect(repetition(BUSINESS_ANSWER, [])).toEqual({ lines: [], share: 0 });
  });
});

describe("reading the whole question", () => {
  it("splits one typed-out message into its separate asks", () => {
    const parts = questionParts(
      "bro ek banda hi rusisa akha ahi uske shat meri ek meating honi hai muej nahipata kabn iss week ya next week mene use baat ri ke new porkjct mil sata hi ager meatng acheh rehe to uss meating ke bare me janahai ki kab tak hpogi muej nahi paat kab tak hgi or kay wo sucess hoagi or kay uisse koi fayada hoag ong term em"
    );
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(parts.some((p) => /kab tak/i.test(p))).toBe(true);
    expect(parts.some((p) => /sucess/i.test(p))).toBe(true);
    expect(parts.some((p) => /fayada/i.test(p))).toBe(true);
  });

  it("keeps a single ask as a single ask", () => {
    expect(questionParts("ok mere risto ke bare me bato yar")).toEqual([]);
    expect(questionParts("Shaadi kab hogi?")).toEqual([]);
    expect(questionParts("meri kundli me acha ya bura time chal raha hai")).toEqual([]);
  });

  it("spots a timing question, and a reply that dodges the timing", () => {
    expect(asksWhen("meri shaadi kab hogi")).toBe(true);
    expect(asksWhen("ye problem kab tak rahegi")).toBe(true);
    expect(asksWhen("mera swabhav kaisa hai")).toBe(false);
    expect(givesTime("Ye samay February 2027 se behtar hota hai.")).toBe(true);
    expect(givesTime("is hafte Saturday ka din sabse shubh hai.")).toBe(true);
    expect(givesTime("Aapke rishton mein sudhaar ke yog achhe hain, dhairya rakhein.")).toBe(false);
  });
});

describe("the birth nakshatra must be theirs", () => {
  it("catches an invented one and leaves the real one alone", async () => {
    const { wrongBirthNakshatra } = await import("./replyChecks");
    // Live 25 Sep 2026: a Revati pada-2 chart came back as "Aapki Rohini Nakshatra".
    expect(wrongBirthNakshatra("Aapki Rohini Nakshatra ka prabhav aapko ek caring partner ki taraf le jaata hai.", "Revati")).toEqual(["rohini"]);
    expect(wrongBirthNakshatra("Aapki Revati Nakshatra ka prabhav aapko narm dil banata hai.", "Revati")).toEqual([]);
    expect(wrongBirthNakshatra("Your Purva Ashadha nakshatra gives you drive.", "Purva Ashadha")).toEqual([]);
    // A transit mention is not a claim about their birth nakshatra.
    expect(wrongBirthNakshatra("Dopahar 11:21 AM ke baad chandrama Purva Bhadrapada nakshatra mein aa jayega.", "Revati")).toEqual([]);
    expect(wrongBirthNakshatra("", "Revati")).toEqual([]);
  });
});
