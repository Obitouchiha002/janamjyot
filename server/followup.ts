/**
 * "Pichli baar aapne naukri ke baare mein poocha tha — tab se kya hua?"
 *
 * Asking after something they told us is the difference between a chat that
 * remembers and a horoscope column. Built from their own last question and its
 * topic: no model call, nothing invented, and it never pretends a person wrote
 * it. Offered only in a window where asking makes sense — not minutes after
 * they left, and not weeks later when it would read as a script.
 */
import { detectCategory, type Category } from "./gemini";

type Lang = "en" | "hi" | "hinglish";

const TOPIC: Partial<Record<Category, Record<Lang, string>>> = {
  career: { en: "your work", hi: "नौकरी/काम", hinglish: "naukri/kaam" },
  wealth: { en: "money", hi: "पैसे", hinglish: "paise" },
  health: { en: "your health", hi: "सेहत", hinglish: "sehat" },
  marriage: { en: "marriage", hi: "शादी", hinglish: "shaadi" },
  relationship: { en: "your relationship", hi: "रिश्ते", hinglish: "rishte" },
  business: { en: "your business", hi: "बिज़नेस", hinglish: "business" },
  foreign: { en: "going abroad", hi: "विदेश", hinglish: "videsh" },
  education: { en: "your studies", hi: "पढ़ाई", hinglish: "padhai" },
};

const MIN_AGE_MS = 18 * 3600_000;
const MAX_AGE_MS = 10 * 86400_000;

export interface Followup { topic: Category; line: string; chips: string[] }

export function followupFor(
  rows: Array<{ role: string; message: string; created_at?: string | Date | null }>,
  lang: string,
  name?: string,
  now = Date.now(),
): Followup | null {
  const L: Lang = lang === "hi" || lang === "hinglish" ? lang : "en";
  const lastUser = [...(rows ?? [])].reverse().find((r) => r?.role === "user");
  if (!lastUser) return null;
  const topic = detectCategory(String(lastUser.message || ""));
  const t = TOPIC[topic];
  if (!t) return null;
  if (lastUser.created_at) {
    const age = now - new Date(lastUser.created_at).getTime();
    if (!(age >= MIN_AGE_MS && age <= MAX_AGE_MS)) return null;
  }
  const who = name ? (L === "en" ? `${name}, ` : `${name} ji, `) : "";
  const line =
    L === "en" ? `${who}last time you asked about ${t.en}. How has it gone since?`
    : L === "hi" ? `${who}पिछली बार आपने ${t.hi} के बारे में पूछा था — तब से क्या हुआ?`
    : `${who}pichli baar aapne ${t.hinglish} ke baare mein poocha tha — tab se kya hua?`;
  // Real questions only: a chip is sent as their message and costs a question,
  // so "let me tell you" would spend one on nothing.
  const chips =
    L === "en" ? ["Nothing has changed yet — when will it?", `What should I do about ${t.en} now?`]
    : L === "hi" ? ["अभी तक कुछ नहीं बदला — कब बदलेगा?", `अब ${t.hi} के लिए क्या करूँ?`]
    : ["Abhi tak kuch nahi badla — kab badlega?", `Ab ${t.hinglish} ke liye kya karun?`];
  return { topic, line, chips };
}
