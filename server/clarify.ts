/**
 * Questions that cannot be answered honestly without one more fact.
 *
 * "Meri shaadi kab hogi?" from someone whose marital status nobody has ever
 * asked about is not a question with an answer. They may be married, divorced,
 * widowed, or testing us — and a wedding date handed to any of those is not a
 * near miss, it is the moment they stop believing the app.
 *
 * This was attempted three times in the prompt: as a rule in the list, as the
 * age stated on its own line above the question, and as an explicit "NOT KNOWN"
 * block beside the known facts. Each time the model produced a flat future date
 * anyway. At some point the honest reading is that instructions are the wrong
 * tool: a model holding a constraint across ten thousand tokens of chart JSON
 * will sometimes drop it, and "sometimes" is not a standard to put in front of
 * strangers.
 *
 * So the clear-cut cases are decided here, in code, before any model is called.
 * No AI request, no credit, no latency, and the same outcome every time
 * whichever provider is up.
 *
 * The reply is one short question with tappable choices. The answer to it is
 * stored as a fact, so it is asked exactly once and every later reading is
 * better for it — which is the whole point: the clarification is not friction,
 * it is the app learning something it will use for years.
 *
 * Deliberately narrow. It fires only where the unknown changes what the answer
 * MEANS — marriage timing, a first child, when work will come. "Kal ka din
 * kaisa rahega" asks nobody anything.
 */

type Lang = "en" | "hi" | "hinglish";
const lang = (l?: string): Lang => (l === "hi" ? "hi" : l === "hinglish" ? "hinglish" : "en");

export type Need = "marital_status" | "children" | "employment" | null;

/** Asking WHEN a marriage happens — not about marriage as a subject. */
const MARRIAGE_WHEN = [
  /(shaadi|shadi|sadi|vivah|marriage|wedding|शादी|विवाह)[^?]{0,40}(kab|kb|when|kis saal|kitne saal|कब)/i,
  /(kab|when|कब)[^?]{0,40}(shaadi|shadi|vivah|marriage|wedding|शादी|विवाह)/i,
];
const CHILD_WHEN = [
  /(bachch?e|bacche|baccha|santaan|santan|child|children|baby|बच्च|संतान)[^?]{0,40}(kab|when|कब)/i,
  /(kab|when|कब)[^?]{0,40}(bachch?a|santaan|child|baby|बच्च|संतान)/i,
];
const JOB_WHEN = [
  /(naukri|job|nokri|rozgar|नौकरी)[^?]{0,40}(kab|when|lagegi|milegi|कब)/i,
  /(kab|when|कब)[^?]{0,40}(naukri|job|nokri|नौकरी)/i,
];

const hits = (list: RegExp[], q: string) => list.some((re) => re.test(q));

/**
 * Which single fact is missing that this question turns on. Null when the
 * question stands on its own, or when we already know.
 */
export function whatToAsk(question: string, facts: Record<string, unknown>): Need {
  const q = String(question ?? "").trim();
  if (!q) return null;
  const known = (k: string) => facts && Object.prototype.hasOwnProperty.call(facts, k);

  if (hits(MARRIAGE_WHEN, q) && !known("marital_status")) return "marital_status";
  if (hits(CHILD_WHEN, q) && !known("children")) return "children";
  if (hits(JOB_WHEN, q) && !known("employment")) return "employment";
  return null;
}

/**
 * The question to ask, and the choices to tap. Their reply travels the ordinary
 * path, so the model records it as a fact and answers properly in the same turn.
 */
export function askFor(need: Exclude<Need, null>, l: string | undefined, name?: string) {
  const who = name ? `${name}, ` : "";
  const L = lang(l);

  if (need === "marital_status") {
    return {
      answer: {
        en: `${who}before I answer that — this changes completely depending on where you are right now, and I would rather ask than guess.`,
        hi: `${who}इससे पहले कि मैं बताऊँ — जवाब पूरी तरह इस पर निर्भर करता है कि आप अभी कहाँ हैं, और अंदाज़ा लगाने से बेहतर है पूछ लूँ।`,
        hinglish: `${who}iska jawab dene se pehle — ye poori tarah is par depend karta hai ki aap abhi kahan hain, aur andaza lagane se behtar hai poochh loon.`,
      }[L],
      question: {
        en: "Are you unmarried, married, divorced or widowed?",
        hi: "आप अभी अविवाहित हैं, विवाहित, तलाकशुदा, या विधुर/विधवा?",
        hinglish: "Aap abhi unmarried hain, married, divorced, ya widowed?",
      }[L],
      next: {
        en: ["I'm unmarried", "I'm married", "I'm divorced", "I'd rather not say"],
        hi: ["मैं अविवाहित हूँ", "मैं विवाहित हूँ", "मैं तलाकशुदा हूँ", "नहीं बताना चाहता"],
        hinglish: ["Main unmarried hoon", "Main married hoon", "Main divorced hoon", "Nahi batana chahta"],
      }[L],
    };
  }

  if (need === "children") {
    return {
      answer: {
        en: `${who}one thing first, so I read this for where you actually are.`,
        hi: `${who}एक बात पहले, ताकि मैं आपकी असल स्थिति के हिसाब से पढ़ूँ।`,
        hinglish: `${who}ek baat pehle, taaki main aapki asli sthiti ke hisaab se padhoon.`,
      }[L],
      question: {
        en: "Do you already have children?",
        hi: "क्या आपके पहले से बच्चे हैं?",
        hinglish: "Kya aapke pehle se bachche hain?",
      }[L],
      next: {
        en: ["No children yet", "Yes, one", "Yes, more than one", "I'd rather not say"],
        hi: ["अभी नहीं", "हाँ, एक", "हाँ, एक से ज़्यादा", "नहीं बताना चाहता"],
        hinglish: ["Abhi nahi", "Haan, ek", "Haan, ek se zyada", "Nahi batana chahta"],
      }[L],
    };
  }

  return {
    answer: {
      en: `${who}quick check, so this is about your actual situation.`,
      hi: `${who}एक छोटी बात, ताकि यह आपकी असल स्थिति पर हो।`,
      hinglish: `${who}ek chhoti baat, taaki ye aapki asli sthiti par ho.`,
    }[L],
    question: {
      en: "Are you working right now, or looking for a job?",
      hi: "आप अभी काम कर रहे हैं, या नौकरी ढूँढ रहे हैं?",
      hinglish: "Aap abhi kaam kar rahe hain, ya job dhoondh rahe hain?",
    }[L],
    next: {
      en: ["I'm working", "I'm looking for a job", "I'm studying", "I run my own thing"],
      hi: ["मैं काम कर रहा हूँ", "मैं नौकरी ढूँढ रहा हूँ", "मैं पढ़ाई कर रहा हूँ", "मेरा अपना काम है"],
      hinglish: ["Main kaam kar raha hoon", "Main job dhoondh raha hoon", "Main padhai kar raha hoon", "Mera apna kaam hai"],
    }[L],
  };
}

/** The whole reply, assembled. */
export function clarifyReply(need: Exclude<Need, null>, l: string | undefined, name?: string) {
  const a = askFor(need, l, name);
  return { answer: `${a.answer}\n\n**${a.question}**`, next: a.next };
}
