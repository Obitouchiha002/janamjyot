/**
 * Questions the chart cannot sensibly answer at this age.
 *
 * Asked "inki shaadi kab hogi?" about a seventy-eight-year-old, the model
 * replied "aapki shaadi ka yog agle 2 saal ke andar ban raha hai". It was told
 * the age inside the chart packet. It was told again in a rule. It was told a
 * third time in a short paragraph directly above the question. It said the same
 * thing every time.
 *
 * At that point the instruction is not the fix. A model asked to hold a
 * constraint across ten thousand tokens of chart JSON will sometimes drop it,
 * and "sometimes" is not a standard you can put in front of strangers — this is
 * the failure that made someone say the app is not capable yet, and they were
 * right. So the clear-cut cases are decided here, in code, where the outcome
 * does not depend on which provider answered or how long the prompt was.
 *
 * The reply ASKS rather than asserts. A seventy-year-old who has genuinely
 * never married exists, and telling them their marriage already happened would
 * be its own failure. Asking is correct in both directions, and it collects the
 * one fact that makes every later answer better.
 */

export type AgeIssue = "elder_first_event" | "minor_marriage" | null;

type Lang = "en" | "hi" | "hinglish";
const lang = (l?: string): Lang => (l === "hi" ? "hi" : l === "hinglish" ? "hinglish" : "en");

/** Asking WHEN a first marriage happens — not about marriage in general. */
const MARRIAGE_TIMING = new RegExp(
  "(shaadi|shadi|sadi|vivah|marriage|wedding|शादी|विवाह)" +
  "[^?]{0,40}" +
  "(kab|kb|when|kitne saal|kis saal|kab tak|कब|योग)",
  "i",
);
const MARRIAGE_TIMING_REVERSED = new RegExp(
  "(kab|when|कब)[^?]{0,40}(shaadi|shadi|vivah|marriage|wedding|शादी|विवाह)",
  "i",
);

/** Other firsts that stop being ahead of you at some point. */
const FIRST_EVENT = new RegExp(
  "(naukri|job|career|kaam) [^?]{0,20}(kab|when)|" +
  "(kab|when) [^?]{0,20}(naukri|job|career) (lagegi|milegi|start)|" +
  "(pehla|first) (bachcha|child|baby)|" +
  "(bachche|santaan|children) [^?]{0,20}(kab|when)",
  "i",
);

export function ageIssue(question: string, age: number | null): AgeIssue {
  if (age == null || age < 0 || age > 130) return null;
  const q = String(question ?? "").trim();
  if (!q) return null;

  const marriageTiming = MARRIAGE_TIMING.test(q) || MARRIAGE_TIMING_REVERSED.test(q);

  // A minor asking about marriage timing gets redirected, whatever the chart says.
  if (age < 18 && marriageTiming) return "minor_marriage";

  // 55 is deliberately conservative: it is well past when a first marriage or a
  // first job is plausibly still ahead, so a false trigger is close to
  // impossible — and the reply asks anyway, so being wrong costs nothing.
  if (age >= 55 && (marriageTiming || FIRST_EVENT.test(q))) return "elder_first_event";

  return null;
}

export function ageReply(issue: Exclude<AgeIssue, null>, l: string | undefined, age: number, name?: string) {
  const who = name ? `${name} ji, ` : "";
  if (issue === "minor_marriage") {
    return {
      answer: {
        en: `${who}you're ${age}, so this isn't the right thing for me to read for you. Ask me about your studies, your temperament, or how a phase ahead looks — I can be genuinely useful there.`,
        hi: `${who}आप ${age} के हैं, इसलिए यह पढ़ना मेरे लिए ठीक नहीं होगा। पढ़ाई, स्वभाव, या आने वाले दौर के बारे में पूछिए — वहाँ मैं सच में काम आ सकता हूँ।`,
        hinglish: `${who}aap ${age} ke hain, isliye ye padhna mere liye theek nahi hoga. Padhai, swabhav, ya aane wale daur ke baare me poochiye — wahan main sach me kaam aa sakta hoon.`,
      }[lang(l)],
      next: {
        en: ["What do my studies look like?", "What kind of person does my chart show?"],
        hi: ["मेरी पढ़ाई कैसी रहेगी?", "मेरी कुंडली मुझे कैसा इंसान बताती है?"],
        hinglish: ["Meri padhai kaisi rahegi?", "Meri kundli mujhe kaisa insaan batati hai?"],
      }[lang(l)],
    };
  }

  return {
    answer: {
      en:
        `${who}this chart is ${age} years old today, so a first marriage is almost certainly behind it rather than ahead — and I'd be making something up if I gave you a future date.\n\n` +
        `Two things and I can read this properly:\n` +
        `• Is this chart yours, or someone else's?\n` +
        `• Has the marriage already happened, and roughly when?\n\n` +
        `Tell me and I'll read what that period actually brought — and what the years ahead hold.`,
      hi:
        `${who}यह कुंडली आज ${age} साल की है, तो पहली शादी आगे नहीं, पीछे रह चुकी होगी — और भविष्य की तारीख देना मेरी तरफ़ से मनगढ़ंत होगा।\n\n` +
        `दो बातें बता दीजिए, फिर ठीक से पढ़ूँगा:\n` +
        `• यह कुंडली आपकी है या किसी और की?\n` +
        `• शादी हो चुकी है? लगभग कब?\n\n` +
        `बताइए, फिर देखता हूँ उस दौर ने क्या दिया — और आगे के साल क्या कहते हैं।`,
      hinglish:
        `${who}ye kundli aaj ${age} saal ki hai, to pehli shaadi aage nahi, peeche ho chuki hogi — aur future ki date dena meri taraf se mangadhant hoga.\n\n` +
        `Do baatein bata dijiye, phir theek se padhta hoon:\n` +
        `• Ye kundli aapki hai ya kisi aur ki?\n` +
        `• Shaadi ho chuki hai? Lagbhag kab?\n\n` +
        `Bataiye, phir dekhta hoon uss daur ne kya diya — aur aage ke saal kya kehte hain.`,
    }[lang(l)],
    next: {
      en: ["This chart is someone else's", "Yes, the marriage already happened"],
      hi: ["यह कुंडली किसी और की है", "हाँ, शादी हो चुकी है"],
      hinglish: ["Ye kundli kisi aur ki hai", "Haan, shaadi ho chuki hai"],
    }[lang(l)],
  };
}

/** Age today from a YYYY-MM-DD birth date. */
export function ageFromDob(dob?: string | null): number | null {
  const born = Date.parse(String(dob ?? "") + "T00:00:00Z");
  if (!Number.isFinite(born)) return null;
  const years = Math.floor((Date.now() - born) / (365.2425 * 86_400_000));
  return years >= 0 && years <= 130 ? years : null;
}
