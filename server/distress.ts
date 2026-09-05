/**
 * When a question is not really an astrology question.
 *
 * People bring an astrology app the things they cannot say anywhere else. Most
 * of that is ordinary — lonely, stuck, heartbroken — and the chart is a fine
 * place to work through it. Some of it is not, and an app that answers "when
 * will my life get better" with a dasha date, to someone who has stopped
 * wanting to be alive, has failed them completely.
 *
 * Two tiers, because treating both the same is its own kind of harm:
 *
 *   severe — talk of ending their life, or of hurting themselves. The AI is not
 *            called at all. A fixed, warm message with real numbers goes back
 *            instead, and it is NOT charged. A model asked to be reassuring is
 *            exactly the wrong instrument here: it may soothe, hedge, or wrap
 *            the moment in fate, and none of those put a person in front of
 *            someone who can help. This path cannot be reworded by a model or
 *            skipped by a bad generation, because it never reaches one.
 *
 *   low    — loneliness, hopelessness, "kuch acha nahi lagta". The normal
 *            answer stands; it is their chart and they asked about it. One
 *            quiet line is added saying help exists, without turning a sad day
 *            into an emergency.
 *
 * Detection is deterministic, not AI: this must work when every provider is
 * down, must never cost a credit to evaluate, and must behave the same way
 * every time. It over-triggers by design — a helpline shown to someone having
 * an ordinary bad day costs them one line of text; the reverse costs more.
 *
 * The numbers are India's free, 24×7 government services, listed because the
 * users are here. They are stated plainly and never as a way to end the
 * conversation: the app still answers, and still says it is there.
 */

export type DistressLevel = "none" | "low" | "severe";

/** Ending one's life, or harming oneself. Written across the three scripts
 *  people actually type in, including the romanised Hindi most users use. */
const SEVERE = [
  // English
  "kill myself", "killing myself", "end my life", "ending my life", "want to die",
  "wanna die", "wish i was dead", "better off dead", "no reason to live",
  "suicide", "suicidal", "hurt myself", "harm myself", "cut myself",
  "not want to live", "don't want to live", "dont want to live",
  // Romanised Hindi
  "marna chahta", "marna chahti", "mar jau", "mar jaun", "mar jaana chahta",
  "jeene ka mann nahi", "jeene ka man nahi", "jeena nahi chahta", "jeena nahi chahti",
  "khudkushi", "atmahatya", "aatmhatya", "apne aap ko khatam",
  "zindagi khatam kar", "jaan de dun", "jaan dena chahta",
  // Devanagari
  "आत्महत्या", "खुदकुशी", "मरना चाहता", "मरना चाहती", "जीने का मन नहीं",
  "जान दे दूं", "खुद को खत्म",
];

/** Real pain, but not an emergency. */
const LOW = [
  "depress", "hopeless", "worthless", "give up", "giving up", "can't go on",
  "cant go on", "so alone", "very alone", "no one cares", "nobody cares",
  "panic attack", "anxiety attack", "breakdown",
  "akela lagta", "akelapan", "bahut dukhi", "bohot dukhi", "man nahi lagta",
  "kuch acha nahi lagta", "kuchh accha nahi lagta", "himmat nahi", "haar gaya",
  "haar gayi", "ghabrahat", "bechaini", "udaas",
  "अकेला", "अकेलापन", "निराश", "हिम्मत नहीं", "उदास", "घबराहट",
];

/** Normalised so spacing and case cannot slip a phrase past the check. */
function flatten(text: string): string {
  return String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function distressLevel(question: string): DistressLevel {
  const q = flatten(question);
  if (!q) return "none";
  if (SEVERE.some((p) => q.includes(p))) return "severe";
  if (LOW.some((p) => q.includes(p))) return "low";
  return "none";
}

type Lang = "en" | "hi" | "hinglish";
const lang = (l?: string): Lang =>
  l === "hi" ? "hi" : l === "hinglish" ? "hinglish" : "en";

/**
 * The whole reply for a severe message. No chart, no dasha, no timing — none of
 * that is what this moment needs, and offering it would suggest the feeling is
 * something to wait out.
 */
export function severeReply(l?: string, name?: string): { answer: string; next: string[] } {
  const n = name ? `${name}, ` : "";
  const answer = {
    en:
      `${n}thank you for telling me this. What you're carrying sounds genuinely heavy, and you should not have to carry it alone.\n\n` +
      `I'm an astrology app — I can read your chart, but I'm not the right help for this, and I'd rather say so than pretend otherwise.\n\n` +
      `Please talk to someone today. In India these are free, 24×7, and answered by trained people:\n` +
      `**Tele-MANAS — 14416**\n**KIRAN — 1800-599-0019**\n\n` +
      `If you are in immediate danger, call **112**, or tell one person near you right now — anyone you trust.\n\n` +
      `I'm still here whenever you want to talk about your chart.`,
    hi:
      `${n}यह बताने के लिए धन्यवाद। आप जो सह रहे हैं वह वाकई भारी है, और यह अकेले सहने की चीज़ नहीं है।\n\n` +
      `मैं एक ज्योतिष ऐप हूँ — कुंडली पढ़ सकता हूँ, पर इस बात के लिए सही मदद नहीं हूँ, और यह छिपाने से बेहतर है कि साफ़ कह दूँ।\n\n` +
      `आज ही किसी से बात कीजिए। भारत में ये मुफ़्त हैं, 24×7, और प्रशिक्षित लोग उठाते हैं:\n` +
      `**टेली-मानस — 14416**\n**किरण — 1800-599-0019**\n\n` +
      `अगर तुरंत ख़तरा है तो **112** पर कॉल कीजिए, या अभी अपने पास किसी एक भरोसे के इंसान को बता दीजिए।\n\n` +
      `कुंडली की बात जब भी करनी हो, मैं यहीं हूँ।`,
    hinglish:
      `${n}ye batane ke liye shukriya. Aap jo utha rahe hain wo sach me bhaari hai, aur ise akele uthana zaroori nahi hai.\n\n` +
      `Main ek astrology app hoon — kundli padh sakta hoon, par iss baat ke liye sahi madad nahi hoon, aur chhupane se behtar hai ki saaf keh doon.\n\n` +
      `Aaj hi kisi se baat kijiye. India me ye muft hain, 24×7, aur trained log uthate hain:\n` +
      `**Tele-MANAS — 14416**\n**KIRAN — 1800-599-0019**\n\n` +
      `Agar turant khatra hai to **112** par call kijiye, ya abhi apne paas kisi ek bharose ke insaan ko bata dijiye.\n\n` +
      `Kundli ki baat jab bhi karni ho, main yahin hoon.`,
  }[lang(l)];

  // No follow-ups. Suggesting the next thing to ask would turn this into an
  // engagement loop, which is the opposite of what is needed.
  return { answer, next: [] };
}

/** One line appended to an ordinary answer when the person sounds low. */
export function lowNote(l?: string): string {
  return {
    en: "\n\nAnd if this has been sitting on you for a while, Tele-MANAS (**14416**) is free and answers 24×7. There's no shame in using it.",
    hi: "\n\nऔर अगर यह काफ़ी समय से मन पर है, तो टेली-मानस (**14416**) मुफ़्त है और 24×7 उठाते हैं। इसमें कोई शर्म नहीं है।",
    hinglish: "\n\nAur agar ye kaafi time se mann par hai, to Tele-MANAS (**14416**) muft hai aur 24×7 uthate hain. Isme koi sharam nahi hai.",
  }[lang(l)];
}
