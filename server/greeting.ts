/**
 * Answering "hi".
 *
 * A hello is not a question, and it was being answered with six lines about
 * Shani in the lagna and a Venus mahadasha running to 2027 — before the person
 * had asked anything at all. That reads as a machine emptying itself, not as
 * someone who has just opened your kundli.
 *
 * What a person does instead is short: greet you by name, say they have looked
 * at the chart, and ask what you want to know. That is all this returns —
 * three lines, the chart as a card the client already knows how to draw, and a
 * few things they might actually want.
 *
 * Deterministic on purpose. It costs no AI call, no credit and no waiting, it
 * cannot wander into an essay on a bad generation, and it works when every
 * provider is down. The first exchange decides whether someone stays, so it is
 * the last thing that should be left to chance.
 */

type Lang = "en" | "hi" | "hinglish";
const lang = (l?: string): Lang => (l === "hi" ? "hi" : l === "hinglish" ? "hinglish" : "en");

/**
 * Only a greeting, and nothing else. "hi" qualifies; "hi, meri shaadi kab
 * hogi" does not — that is a real question wearing a hello, and it must reach
 * the model. Hence the word cap and the whole-string match.
 */
const GREETING = new RegExp(
  "^(" +
  "hi+|hey+|h[ae]llo+|h[il]{1,2}o|yo|" +
  "namaste|namaskar|namashkar|pranam|pranaam|ram ram|jai shree ram|" +
  "namaste ji|hello ji|hi ji|" +
  "good (morning|afternoon|evening|night)|" +
  "सुप्रभात|नमस्ते|नमस्कार|प्रणाम|" +
  "kaise ho|kaisi ho|kya haal|how are you|whats up|what's up|sup" +
  ")[\\s!.,🙏]*$",
  "i",
);

export function isGreetingOnly(text: string): boolean {
  const q = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!q || q.length > 40) return false;
  // Anything longer than three words is carrying more than a hello.
  if (q.split(" ").length > 3) return false;
  return GREETING.test(q);
}

/** Things people actually open with, in their own voice so a tap sends them. */
const TOPICS: Record<Lang, string[]> = {
  en: [
    "How will my day go today?",
    "When will my career settle?",
    "When will I get married?",
    "How will my money situation be?",
  ],
  hinglish: [
    "Aaj mera din kaisa rahega?",
    "Meri job/career kab set hogi?",
    "Meri shaadi kab hogi?",
    "Paisa aur savings kaisi rahegi?",
  ],
  hi: [
    "आज मेरा दिन कैसा रहेगा?",
    "मेरी नौकरी कब सेट होगी?",
    "मेरी शादी कब होगी?",
    "पैसा और बचत कैसी रहेगी?",
  ],
};

export function greetingReply(l: string | undefined, name?: string): { answer: string; next: string[] } {
  const who = name ? ` ${name} ji` : "";
  const answer = {
    en: `Namaste${who} 🙏\n\nI've looked at your chart. Ask me whatever is on your mind — or pick one below.`,
    hi: `नमस्ते${who} 🙏\n\nमैंने आपकी कुंडली देख ली है। जो मन में हो पूछिए — या नीचे से कोई चुन लीजिए।`,
    hinglish: `Namaste${who} 🙏\n\nMaine aapki kundli dekh li hai. Jo mann me ho poochiye — ya neeche se koi chun lijiye.`,
  }[lang(l)];
  return { answer, next: TOPICS[lang(l)] };
}
