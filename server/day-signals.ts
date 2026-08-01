/**
 * Day Signals — "what is today like for THIS person, and why".
 *
 * This is the deterministic core behind the 8 AM notification, the home-screen
 * banner and the chat's "how is today / tomorrow" answers. It takes ONE clear
 * line to the top and keeps the real astrology underneath as a list of factors
 * the user can open — and every factor is a genuine computed placement, never
 * an AI guess. That is the whole promise: the message is readable, the reason
 * is verifiable.
 *
 * NO AI and NO NETWORK. It must run on a phone with the app closed (the week of
 * notifications is scheduled from here), be identical every time the same day
 * is asked about, and cost nothing. Everything is composed from real signals we
 * already compute in plain code, ordered from most-daily to standing-backdrop:
 *
 *   1. Tarabala (DRIVES the day) — the Moon's nakshatra counted from the
 *      person's OWN birth nakshatra, folded into the classical 9 taras. The
 *      Moon changes nakshatra almost every day, so this is genuinely different
 *      each day AND unique to this person. This leads the message.
 *   2. Chandrabala — the Moon's house from the natal Moon (~2¼-day mood).
 *   3. Panchang    — the day's best choghadiya window, its Rahu Kaal, and the
 *                    real tithi + nakshatra (daily context in the Reason).
 *   Backdrop (context only, weight 0, never leads): Sade Sati / Dhaiya (a
 *   2½-year phase) and the running mahadasha. These used to FREEZE the line —
 *   Sade Sati made every day read "take care" for years. They now sit in the
 *   Reason as ongoing context and never decide a single day.
 *
 * Each factor is tagged good / careful / neutral with a weight; the weights add
 * up to a severity (0–3) that drives BOTH the overall lean and the TONE — a
 * heavy day speaks plainly ("aaj sambhal ke"), a light day only nudges. That
 * tone-by-severity split is a deliberate product choice, not an accident.
 *
 * LANGUAGES: phrasing ships for en / hi / hinglish — the languages this app's
 * users actually read. Any other language falls back to English wording (the
 * factor DATA is language-neutral, so a caller that wants, say, Tamil can still
 * re-phrase from `factors`). This is called out rather than faking 11-language
 * astrology copy that no one here could proof-read.
 */
import { buildTransit, type TransitResult } from "./transit";
import { buildPanchang } from "./panchang";
import { buildIsoDatetime } from "./validate";
import { NAKSHATRAS } from "./normalize";

export type Kind = "good" | "careful" | "neutral";
export type Lean = "good" | "mixed" | "careful";
export type Tone = "good" | "advice" | "warn";

export interface DayFactor {
  /** Machine-readable so a caller can re-render or re-phrase without parsing text. */
  code: string;
  kind: Kind;
  /** 0–3; careful factors push severity up, good factors pull the lean up. */
  weight: number;
  /** Short chip, e.g. "Chandrama 8ve bhaav mein". */
  title: string;
  /** The reason line the user opens — the real astrological cause (may name the
   *  planet/house; this is where the technical detail is allowed). */
  detail: string;
  /** Plain-language, headline-worthy one-liner for THIS factor — no jargon, the
   *  real-life "what today feels like / what to do". Only set on factors worth
   *  leading with (Moon house, Sade Sati). */
  lead?: string;
  time?: { start: string; end: string };
}

export interface DaySignals {
  date: string;
  lang: string;
  name: string | null;
  lean: Lean;
  severity: 0 | 1 | 2 | 3;
  tone: Tone;
  /** Short localized eyebrow for the banner, e.g. "Aaj dhyan se". */
  label: string;
  /** One clear line, with greeting/name — home banner + chat. */
  headline: string;
  /** Notification body: the same message without the greeting. */
  short: string;
  /** The reason, most important first. */
  factors: DayFactor[];
  best_time: { name: string; start: string; end: string } | null;
  caution_time: { name: string; start: string; end: string } | null;
}

/* ── language plumbing ─────────────────────────────────────────────────────
   A tiny t() that reads from a per-string table. Unknown languages resolve to
   English so a missing translation degrades to readable, never to blank. */
type Lang = "en" | "hi" | "hinglish";
function asLang(v: string | undefined): Lang {
  const k = (v || "en").toLowerCase();
  return k === "hi" || k === "hinglish" ? (k as Lang) : "en";
}
type Tri = { en: string; hi: string; hinglish: string };
const pick = (t: Tri, l: Lang) => t[l];

/* ── planet nature — the mahadasha baseline ────────────────────────────────
   Coarse but real: the running mahadasha lord tints the whole period. This is
   NOT a day signal, so it carries low weight — it sets a mood, it does not make
   or break a day. */
const PLANET: Record<string, { kind: Kind; theme: Tri }> = {
  Jupiter: { kind: "good", theme: { en: "growth and good counsel", hi: "वृद्धि और अच्छी सलाह", hinglish: "vriddhi aur acchi salah" } },
  Venus:   { kind: "good", theme: { en: "comfort and relationships", hi: "सुख और रिश्ते", hinglish: "sukh aur rishte" } },
  Mercury: { kind: "good", theme: { en: "clear thinking and dealings", hi: "स्पष्ट सोच और काम-काज", hinglish: "clear soch aur kaam-kaaj" } },
  Moon:    { kind: "neutral", theme: { en: "feelings and the mind", hi: "मन और भावनाएँ", hinglish: "mann aur bhavnaayein" } },
  Sun:     { kind: "neutral", theme: { en: "confidence and standing", hi: "आत्मविश्वास और मान", hinglish: "aatmvishwas aur maan" } },
  Mars:    { kind: "careful", theme: { en: "energy and temper", hi: "ऊर्जा और गुस्सा", hinglish: "energy aur gussa" } },
  Saturn:  { kind: "careful", theme: { en: "hard work and patience", hi: "मेहनत और धैर्य", hinglish: "mehnat aur dhairya" } },
  Rahu:    { kind: "careful", theme: { en: "confusion and sudden turns", hi: "उलझन और अचानक बदलाव", hinglish: "uljhan aur achanak badlaav" } },
  Ketu:    { kind: "careful", theme: { en: "detachment and second-guessing", hi: "विरक्ति और दुविधा", hinglish: "virakti aur duvidha" } },
};

/* ── Moon house from natal Moon — the day-to-day signal ─────────────────────
   Classic Chandra-bala reading of the Moon's house counted from the birth Moon.
   1,3,6,7,10,11 support the day; 2,5,9 are mixed; 4,8,12 drain it. Each carries
   a plain-language "what today feels like" and, for the heavy ones, what to
   watch. Weight tracks how strongly the tradition reads that house. */
const MOON_HOUSE: Record<number, { kind: Kind; weight: number; title: Tri; detail: Tri; lead: Tri }> = {
  1:  { kind: "neutral", weight: 0, title: { en: "Moon over your sign", hi: "चंद्रमा आपकी राशि पर", hinglish: "Chandrama aapki rashi par" },
        lead: { en: "your feelings run close to the surface — a day more for yourself than for others",
                hi: "भावनाएँ आज ऊपर रहेंगी — यह दिन दूसरों से ज़्यादा अपने लिए है",
                hinglish: "aaj bhavnaayein upar rahengi — ye din doosron se zyada apne liye hai" },
        detail: { en: "The Moon is on your birth sign today — feelings run close to the surface. A day for yourself more than for others.",
                  hi: "आज चंद्रमा आपकी जन्म राशि पर है — भावनाएँ ऊपर रहेंगी। यह दिन दूसरों से ज़्यादा अपने लिए है।",
                  hinglish: "Aaj Chandrama aapki janam rashi par hai — bhavnaayein upar rahengi. Ye din doosron se zyada apne liye hai." } },
  3:  { kind: "good", weight: 1, title: { en: "Moon in your 3rd", hi: "तीसरे भाव में चंद्रमा", hinglish: "Teesre bhaav mein Chandrama" },
        lead: { en: "your courage and effort will pay off — a good day to push a task forward",
                hi: "आज हिम्मत और मेहनत रंग लाएगी — किसी काम को आगे बढ़ाने का दिन",
                hinglish: "aaj himmat aur mehnat rang laayegi — kisi kaam ko aage badhane ka din" },
        detail: { en: "Moon in your 3rd from birth — courage and effort pay off. Good for pushing a task forward or a hard conversation.",
                  hi: "जन्म राशि से तीसरे भाव में चंद्रमा — हिम्मत और मेहनत रंग लाएगी। किसी काम को आगे बढ़ाने का दिन।",
                  hinglish: "Janam rashi se teesre bhaav mein Chandrama — himmat aur mehnat rang laayegi. Kisi kaam ko aage badhane ka din." } },
  6:  { kind: "good", weight: 1, title: { en: "Moon in your 6th", hi: "छठे भाव में चंद्रमा", hinglish: "Chhathe bhaav mein Chandrama" },
        lead: { en: "you have the upper hand over problems today — settle something that's been pending",
                hi: "आज समस्याओं पर आपका पलड़ा भारी है — कोई रुका काम निपटा लें",
                hinglish: "aaj samasyaon par aapka palda bhaari hai — koi ruka kaam nipta lein" },
        detail: { en: "Moon in your 6th — you have the upper hand over problems and rivals today. A good day to settle something pending.",
                  hi: "छठे भाव में चंद्रमा — आज समस्याओं और विरोधियों पर आपका पलड़ा भारी है। कोई रुका काम निपटाने का दिन।",
                  hinglish: "Chhathe bhaav mein Chandrama — aaj samasyaon aur virodhiyon par aapka palda bhaari hai. Koi ruka kaam niptaane ka din." } },
  7:  { kind: "good", weight: 1, title: { en: "Moon in your 7th", hi: "सातवें भाव में चंद्रमा", hinglish: "Saatvein bhaav mein Chandrama" },
        lead: { en: "dealings with people go smoothly — good for meetings, partners and travel",
                hi: "लोगों के साथ काम अच्छे से चलेंगे — मीटिंग, साझेदारी और यात्रा के लिए अच्छा",
                hinglish: "logon ke saath kaam acche se chalenge — meeting, partnership aur yatra ke liye accha" },
        detail: { en: "Moon in your 7th — dealings with others go smoothly. Good for meetings, partners and travel out.",
                  hi: "सातवें भाव में चंद्रमा — दूसरों के साथ काम अच्छे से चलेंगे। मीटिंग, साझेदारी और यात्रा के लिए अच्छा।",
                  hinglish: "Saatvein bhaav mein Chandrama — doosron ke saath kaam acche se chalenge. Meeting, saajhedari aur yatra ke liye accha." } },
  10: { kind: "good", weight: 1, title: { en: "Moon in your 10th", hi: "दसवें भाव में चंद्रमा", hinglish: "Dasvein bhaav mein Chandrama" },
        lead: { en: "work and reputation are on your side — put your name to something today",
                hi: "काम और प्रतिष्ठा आपके साथ हैं — आज किसी काम में आगे आएँ",
                hinglish: "kaam aur naam aapke saath hain — aaj kisi kaam mein aage aayein" },
        detail: { en: "Moon in your 10th — work and reputation are favoured. Put your name to something today.",
                  hi: "दसवें भाव में चंद्रमा — काम और प्रतिष्ठा के लिए अच्छा। आज किसी काम में आगे आएँ।",
                  hinglish: "Dasvein bhaav mein Chandrama — kaam aur pratishtha ke liye accha. Aaj kisi kaam mein aage aayein." } },
  11: { kind: "good", weight: 1, title: { en: "Moon in your 11th", hi: "ग्यारहवें भाव में चंद्रमा", hinglish: "Gyaarahvein bhaav mein Chandrama" },
        lead: { en: "gains and good news lean your way — a good day to ask, and for money matters",
                hi: "लाभ और अच्छी ख़बर की ओर झुकाव — माँगने और धन के काम के लिए अच्छा दिन",
                hinglish: "laabh aur acchi khabar ki or jhukaav — maangne aur paise ke kaam ke liye accha din" },
        detail: { en: "Moon in your 11th — gains and good news lean your way. A favourable day for asking and for money matters.",
                  hi: "ग्यारहवें भाव में चंद्रमा — लाभ और अच्छी ख़बर की ओर झुकाव। माँगने और धन के काम के लिए अच्छा दिन।",
                  hinglish: "Gyaarahvein bhaav mein Chandrama — laabh aur acchi khabar ki or jhukaav. Maangne aur dhan ke kaam ke liye accha din." } },
  2:  { kind: "neutral", weight: 0, title: { en: "Moon in your 2nd", hi: "दूसरे भाव में चंद्रमा", hinglish: "Doosre bhaav mein Chandrama" },
        lead: { en: "a steady, ordinary day — good for money and family routine, nothing dramatic",
                hi: "एक सामान्य, टिका हुआ दिन — धन और परिवार के रोज़ के काम के लिए ठीक",
                hinglish: "ek samanya, tika hua din — paise aur parivaar ke roz ke kaam ke liye theek" },
        detail: { en: "Moon in your 2nd — a steady day for money and family. Nothing dramatic; handle the routine.",
                  hi: "दूसरे भाव में चंद्रमा — धन और परिवार के लिए सामान्य दिन। रोज़ के काम निपटाएँ।",
                  hinglish: "Doosre bhaav mein Chandrama — dhan aur parivaar ke liye samanya din. Roz ke kaam niptaayein." } },
  5:  { kind: "neutral", weight: 0, title: { en: "Moon in your 5th", hi: "पाँचवें भाव में चंद्रमा", hinglish: "Paanchvein bhaav mein Chandrama" },
        lead: { en: "a lighter, creative day — good with children and for anything you enjoy",
                hi: "हल्का और रचनात्मक दिन — बच्चों और पसंद के कामों के लिए अच्छा",
                hinglish: "halka aur creative din — bachchon aur pasand ke kaamon ke liye accha" },
        detail: { en: "Moon in your 5th — a lighter, creative day. Good with children and for anything you enjoy.",
                  hi: "पाँचवें भाव में चंद्रमा — हल्का और रचनात्मक दिन। बच्चों और पसंद के कामों के लिए अच्छा।",
                  hinglish: "Paanchvein bhaav mein Chandrama — halka aur creative din. Bachchon aur pasand ke kaamon ke liye accha." } },
  9:  { kind: "neutral", weight: 0, title: { en: "Moon in your 9th", hi: "नवें भाव में चंद्रमा", hinglish: "Navein bhaav mein Chandrama" },
        lead: { en: "a calm, fortunate feeling — fine for travel and matters of belief",
                hi: "शांत और भाग्यशाली अनुभव — यात्रा और आस्था के काम ठीक रहेंगे",
                hinglish: "shaant aur bhagyashali anubhav — yatra aur aastha ke kaam theek rahenge" },
        detail: { en: "Moon in your 9th — a calm, fortunate feeling. Fine for travel and for matters of belief.",
                  hi: "नवें भाव में चंद्रमा — शांत और भाग्यशाली अनुभव। यात्रा और आस्था के काम ठीक रहेंगे।",
                  hinglish: "Navein bhaav mein Chandrama — shaant aur bhagyashali anubhav. Yatra aur aastha ke kaam theek rahenge." } },
  4:  { kind: "careful", weight: 2, title: { en: "Moon in your 4th", hi: "चौथे भाव में चंद्रमा", hinglish: "Chauthe bhaav mein Chandrama" },
        lead: { en: "your mind will feel restless and home matters may tug — keep the day light, don't force big moves",
                hi: "मन बेचैन रहेगा और घर की बातें खींच सकती हैं — दिन हल्का रखें, बड़े फ़ैसले न थोपें",
                hinglish: "mann bechain rahega aur ghar ki baatein kheench sakti hain — din halka rakho, bada faisla mat thopo" },
        detail: { en: "Moon in your 4th — the mind is restless and home matters may tug at you. Keep the day light and don't force big moves.",
                  hi: "चौथे भाव में चंद्रमा — मन बेचैन रहेगा, घर की बातें खींच सकती हैं। दिन हल्का रखें, बड़े फ़ैसले न थोपें।",
                  hinglish: "Chauthe bhaav mein Chandrama — mann bechain rahega, ghar ki baatein kheench sakti hain. Din halka rakhein, bade faisle na thopein." } },
  8:  { kind: "careful", weight: 3, title: { en: "Moon in your 8th", hi: "आठवें भाव में चंद्रमा", hinglish: "Aathvein bhaav mein Chandrama" },
        lead: { en: "your mind will feel heavy and small things may sting — put off new starts, travel and money decisions, and just hold steady",
                hi: "मन भारी रहेगा और छोटी बातें चुभेंगी — नई शुरुआत, यात्रा और पैसे के फ़ैसले टाल दें, बस स्थिर रहें",
                hinglish: "mann bhaari rahega aur choti baatein chubh sakti hain — nayi shuruaat, safar aur paise ke bade faisle aaj taal do, bas tike raho" },
        detail: { en: "Moon in your 8th from birth — the heaviest day of the Moon's cycle. Mind feels low, small things get under your skin. Avoid new starts, travel and money moves; keep to what's already running.",
                  hi: "जन्म राशि से आठवें भाव में चंद्रमा — चंद्र चक्र का सबसे भारी दिन। मन उदास, छोटी बातें चुभेंगी। नई शुरुआत, यात्रा और धन के फ़ैसले टालें; जो चल रहा है उसी पर रहें।",
                  hinglish: "Janam rashi se aathvein bhaav mein Chandrama — Chandra chakra ka sabse bhaari din. Mann udaas, choti baatein chubhengi. Nai shuruaat, yatra aur dhan ke faisle taalein; jo chal raha hai usi par rahein." } },
  12: { kind: "careful", weight: 2, title: { en: "Moon in your 12th", hi: "बारहवें भाव में चंद्रमा", hinglish: "Baarahvein bhaav mein Chandrama" },
        lead: { en: "energy and focus will run low and spending can slip — rest, don't overcommit, and watch the wallet",
                hi: "ऊर्जा और ध्यान कम रहेगा और ख़र्च बढ़ सकता है — आराम करें, ज़्यादा वादे न लें, ख़र्च पर नज़र रखें",
                hinglish: "energy aur dhyan kam rahega aur kharch badh sakta hai — aaram karo, zyada vaade mat lo, kharch par nazar rakho" },
        detail: { en: "Moon in your 12th — energy and focus run low, and spending can slip. Rest, don't overcommit, and watch the wallet.",
                  hi: "बारहवें भाव में चंद्रमा — ऊर्जा और ध्यान कम रहेगा, ख़र्च बढ़ सकता है। आराम करें, ज़्यादा वादे न लें, ख़र्च पर नज़र रखें।",
                  hinglish: "Baarahvein bhaav mein Chandrama — energy aur dhyan kam rahega, kharch badh sakta hai. Aaram karein, zyada vaade na lein, kharch par nazar rakhein." } },
};

/* ── Tarabala — the DAILY-changing signal ──────────────────────────────────
   The Moon's nakshatra counted from the person's OWN birth nakshatra, folded
   into the classical 9 taras. Unlike Chandrabala (Moon house, ~2¼ days) and
   unlike Sade Sati (a 2½-year backdrop), the Moon changes nakshatra almost
   every day, so this is genuinely different each day AND unique to this person's
   birth star. This is what makes today's reading actually about TODAY. */
const TARA: Record<number, { name: string; kind: Kind; weight: number; lead: Tri; detail: Tri }> = {
  1: { name: "Janma",  kind: "careful", weight: 1,
       lead: { en: "watch your health and energy today — don't overexert",
               hi: "आज सेहत और ऊर्जा का ध्यान रखें — ज़्यादा न थकें",
               hinglish: "aaj sehat aur energy ka dhyan rakho — zyada mat thako" },
       detail: { en: "Today's Moon sits on your Janma tara (your own birth star group) — a day to protect your body and not overdo things.",
                 hi: "आज का चंद्रमा आपकी जन्म तारा पर है — शरीर का ध्यान रखने और ज़्यादा न करने का दिन।",
                 hinglish: "Aaj ka Chandrama aapki Janma tara par hai — sharir ka dhyan rakhne aur zyada na karne ka din." } },
  2: { name: "Sampat", kind: "good", weight: 2,
       lead: { en: "a genuinely favourable day — good for money moves and starting things",
               hi: "आज सचमुच शुभ दिन — धन के काम और नई शुरुआत के लिए अच्छा",
               hinglish: "aaj sachmuch shubh din — paise ke kaam aur nayi shuruaat ke liye accha" },
       detail: { en: "Today's Moon makes your Sampat tara — the wealth-giving star. One of the best days of your cycle to begin or invest.",
                 hi: "आज चंद्रमा आपकी सम्पत तारा बना रहा है — धन देने वाली तारा। शुरुआत या निवेश के लिए बेहतरीन दिन।",
                 hinglish: "Aaj Chandrama aapki Sampat tara bana raha hai — dhan dene wali tara. Shuruaat ya nivesh ke liye behtareen din." } },
  3: { name: "Vipat",  kind: "careful", weight: 2,
       lead: { en: "an accident-prone, slippery day — go slow, avoid risks and rushing",
               hi: "आज दुर्घटना वाला, फिसलन भरा दिन — धीरे चलें, जोखिम और जल्दबाज़ी से बचें",
               hinglish: "aaj durghatna wala, phislan bhara din — dheere chalo, jokhim aur jaldbaazi se bacho" },
       detail: { en: "Today's Moon makes your Vipat tara — the 'danger' star. Small mistakes cost more today; postpone anything risky and drive/handle things carefully.",
                 hi: "आज चंद्रमा आपकी विपत तारा बना रहा है — 'ख़तरे' की तारा। आज छोटी ग़लतियाँ भारी पड़ती हैं; जोखिम वाला काम टालें, सँभल कर चलें।",
                 hinglish: "Aaj Chandrama aapki Vipat tara bana raha hai — 'khatre' ki tara. Aaj choti galtiyan bhaari padti hain; jokhim wala kaam taalo, sambhal ke chalo." } },
  4: { name: "Kshema", kind: "good", weight: 1,
       lead: { en: "a safe, comfortable day — things you attempt tend to hold",
               hi: "आज सुरक्षित, आरामदेह दिन — जो करेंगे वो टिकेगा",
               hinglish: "aaj surakshit, aaramdeh din — jo karoge wo tikega" },
       detail: { en: "Today's Moon makes your Kshema tara — the well-being star. A steady, protected day; good for anything you want to last.",
                 hi: "आज चंद्रमा आपकी क्षेम तारा बना रहा है — कल्याण की तारा। टिकाऊ, सुरक्षित दिन।",
                 hinglish: "Aaj Chandrama aapki Kshema tara bana raha hai — kalyan ki tara. Tikau, surakshit din." } },
  5: { name: "Pratyak", kind: "careful", weight: 2,
       lead: { en: "expect friction and pushback — don't force decisions, avoid confrontation",
               hi: "आज रुकावट और विरोध — फ़ैसले न थोपें, टकराव से बचें",
               hinglish: "aaj rukawat aur virodh — faisle mat thopo, takraav se bacho" },
       detail: { en: "Today's Moon makes your Pratyari tara — the 'obstacle/opponent' star. Efforts meet resistance today; a poor day to push hard or pick a fight.",
                 hi: "आज चंद्रमा आपकी प्रत्यरि तारा बना रहा है — 'बाधा' की तारा। आज मेहनत में रुकावट आती है; ज़ोर लगाने या झगड़े का ग़लत दिन।",
                 hinglish: "Aaj Chandrama aapki Pratyari tara bana raha hai — 'baadha' ki tara. Aaj mehnat mein rukawat aati hai; zor lagane ya jhagde ka galat din." } },
  6: { name: "Sadhaka", kind: "good", weight: 2,
       lead: { en: "a get-things-done day — hard tasks and goals move forward",
               hi: "आज काम बनने का दिन — मुश्किल काम और लक्ष्य आगे बढ़ेंगे",
               hinglish: "aaj kaam banne ka din — mushkil kaam aur lakshya aage badhenge" },
       detail: { en: "Today's Moon makes your Sadhaka tara — the 'accomplishment' star. Effort pays off; a strong day to finish what's been stuck.",
                 hi: "आज चंद्रमा आपकी साधक तारा बना रहा है — 'सिद्धि' की तारा। मेहनत रंग लाती है; रुका काम पूरा करने का दिन।",
                 hinglish: "Aaj Chandrama aapki Sadhaka tara bana raha hai — 'siddhi' ki tara. Mehnat rang laati hai; ruka kaam poora karne ka din." } },
  7: { name: "Vadha",  kind: "careful", weight: 3,
       lead: { en: "the most cautious day of your cycle — don't start anything new or important",
               hi: "आपके चक्र का सबसे सावधान दिन — कोई नया या ज़रूरी काम शुरू न करें",
               hinglish: "aapke cycle ka sabse savdhaan din — koi naya ya zaroori kaam shuru mat karo" },
       detail: { en: "Today's Moon makes your Vadha tara — traditionally the most avoided star of the cycle. Hold off on new beginnings, big purchases and important commitments; keep to routine.",
                 hi: "आज चंद्रमा आपकी वध तारा बना रहा है — चक्र की सबसे टालने योग्य तारा। नई शुरुआत, बड़ी ख़रीद और ज़रूरी वादे टालें; रोज़ के काम पर रहें।",
                 hinglish: "Aaj Chandrama aapki Vadha tara bana raha hai — cycle ki sabse taalne yogya tara. Nayi shuruaat, badi khareed aur zaroori vaade taalo; roz ke kaam par raho." } },
  8: { name: "Mitra",  kind: "good", weight: 1,
       lead: { en: "a friendly, supportive day — people and luck are on your side",
               hi: "आज मित्रवत, सहयोगी दिन — लोग और क़िस्मत साथ हैं",
               hinglish: "aaj mitravat, sahyogi din — log aur kismat saath hain" },
       detail: { en: "Today's Moon makes your Mitra tara — the 'friend' star. Help comes easily; good for asking, meeting and cooperation.",
                 hi: "आज चंद्रमा आपकी मित्र तारा बना रहा है — 'मित्र' की तारा। मदद आसानी से मिलती है; माँगने और मेल-जोल के लिए अच्छा।",
                 hinglish: "Aaj Chandrama aapki Mitra tara bana raha hai — 'mitra' ki tara. Madad aasani se milti hai; maangne aur mel-jol ke liye accha." } },
  9: { name: "Ati-Mitra", kind: "good", weight: 2,
       lead: { en: "one of your strongest days — go ahead with confidence",
               hi: "आपके सबसे मज़बूत दिनों में से एक — विश्वास के साथ आगे बढ़ें",
               hinglish: "aapke sabse mazboot dinon mein se ek — vishwas ke saath aage badho" },
       detail: { en: "Today's Moon makes your Parama-Mitra tara — the most favourable star of the cycle. A green-light day for almost anything you've been planning.",
                 hi: "आज चंद्रमा आपकी परम-मित्र तारा बना रहा है — चक्र की सबसे शुभ तारा। लगभग हर योजना के लिए हरी झंडी।",
                 hinglish: "Aaj Chandrama aapki Parama-Mitra tara bana raha hai — cycle ki sabse shubh tara. Lagbhag har yojana ke liye hari jhandi." } },
};

/** Tarabala: fold the Moon's nakshatra (counted from the birth nakshatra) into
 *  the 1..9 tara. Returns null if either nakshatra can't be resolved. */
function tarabala(natalNak: string, todayNak: string): { tara: number; count: number } | null {
  const a = NAKSHATRAS.indexOf(natalNak);
  const b = NAKSHATRAS.indexOf(todayNak);
  if (a < 0 || b < 0) return null;
  const count = ((b - a + 27) % 27) + 1; // 1..27
  const tara = ((count - 1) % 9) + 1;     // 1..9
  return { tara, count };
}

/* Greeting + closers, tone-aware, per language. */
const GREET = (name: string | null, l: Lang): string => {
  const n = name?.trim().split(/\s+/)[0];
  if (!n) return "";
  return l === "en" ? `${n}, ` : `${n}, `;
};

const BEST_LINE: Tri = {
  en: "Best window today: {a}–{b}.",
  hi: "आज का सबसे अच्छा समय: {a}–{b}।",
  hinglish: "Aaj ka sabse accha samay: {a}–{b}.",
};
const CAUTION_LINE: Tri = {
  en: "Avoid starting anything new during {name} ({a}–{b}).",
  hi: "{name} ({a}–{b}) में कोई नया काम शुरू न करें।",
  hinglish: "{name} ({a}–{b}) mein koi naya kaam shuru na karein.",
};
const fillTime = (tpl: string, t: { start: string; end: string; name?: string }) =>
  tpl.replace("{a}", t.start).replace("{b}", t.end).replace("{name}", t.name ?? "");

/* Short eyebrow label for the banner, by lean. NOT the message — just a chip.
   The message itself is built from the day's actual lead factor (below), never
   from a fixed opener, so two different days never read the same. */
const LABEL: Record<Tone, Tri> = {
  warn:   { en: "Take care today", hi: "आज ध्यान से", hinglish: "Aaj dhyan se" },
  advice: { en: "Today",           hi: "आज का दिन",   hinglish: "Aaj ka din" },
  good:   { en: "A good day",      hi: "अच्छा दिन",    hinglish: "Accha din" },
};

/** Noon of `date` in `tz`, as an ISO instant — a fair representative moment for
 *  a whole day's transit (the Moon moves ~13°, so noon is mid-range). */
function noonIso(date: string, tz: string): string {
  return new Date(buildIsoDatetime(date, "12:00:00", tz)).toISOString();
}

export function buildDaySignals(input: {
  chart: any;
  date: string;
  tz: string;
  lang?: string;
  latitude?: number;
  longitude?: number;
  ayanamsa: number;
  name?: string | null;
  /** Pass a precomputed transit to save work in a batch; else it's computed. */
  transit?: TransitResult;
}): DaySignals {
  const l = asLang(input.lang);
  const langKey = (input.lang || "en").toLowerCase();
  const name = (input.name ?? input.chart?.birth_details?.name ?? null) as string | null;

  const tr = input.transit ?? buildTransit(input.chart, input.ayanamsa, noonIso(input.date, input.tz));

  const factors: DayFactor[] = [];

  // ── 1. Tarabala — the DAILY driver (Moon's nakshatra vs the birth star) ──
  // This changes almost every day and is unique to this person, so it's what
  // makes today's reading actually about today. It leads the message.
  const moon = tr.planets.find((p) => p.planet === "Moon");
  const natalNak = String(input.chart?.summary?.nakshatra || "").trim();
  const todayNak = String(moon?.nakshatra || "").trim();
  const tb = natalNak && todayNak ? tarabala(natalNak, todayNak) : null;
  if (tb && TARA[tb.tara]) {
    const ta = TARA[tb.tara];
    factors.push({
      code: `tara_${tb.tara}`,
      kind: ta.kind,
      weight: ta.weight,
      title: {
        en: `${ta.name} tara today`,
        hi: `आज ${ta.name} तारा`,
        hinglish: `Aaj ${ta.name} tara`,
      }[l],
      detail: pick(ta.detail, l),
      lead: pick(ta.lead, l),
    });
  }

  // ── 2. Chandrabala — the Moon's house from the birth Moon (~2¼-day mood) ──
  const mh = moon?.house_from_moon ?? null;
  if (mh && MOON_HOUSE[mh]) {
    const m = MOON_HOUSE[mh];
    factors.push({
      code: `moon_h${mh}`,
      kind: m.kind,
      weight: m.weight,
      title: pick(m.title, l),
      detail: pick(m.detail, l),
      lead: pick(m.lead, l),
    });
  }

  // ── 3. Sade Sati / Dhaiya — STANDING backdrop (context only) ─────────────
  const sat = tr.planets.find((p) => p.planet === "Saturn");
  const shm = sat?.house_from_moon ?? null;
  if (shm && [12, 1, 2].includes(shm)) {
    const phase: Tri =
      shm === 1
        ? { en: "peak phase", hi: "चरम चरण", hinglish: "charam charan" }
        : shm === 12
        ? { en: "first phase", hi: "पहला चरण", hinglish: "pehla charan" }
        : { en: "final phase", hi: "अंतिम चरण", hinglish: "antim charan" };
    // STANDING background (~2½ years) — shown as context, but weight 0 so it
    // NEVER drives the daily severity or leads the headline. Sade Sati made
    // every single day read "take care today" for years; that was the bug.
    factors.push({
      code: "sade_sati",
      kind: "neutral",
      weight: 0,
      title: { en: "Sade Sati running", hi: "साढ़े साती चल रही है", hinglish: "Sade Sati chal rahi hai" }[l],
      detail: {
        en: `Ongoing backdrop: Saturn is transiting the ${shm === 12 ? "12th" : shm === 1 ? "1st" : "2nd"} from your Moon — Sade Sati's ${pick(phase, l)}. A multi-year stretch that rewards patience; it colours the phase, not any single day.`,
        hi: `चलता हुआ आधार: चंद्रमा से ${shm === 12 ? "बारहवें" : shm === 1 ? "पहले" : "दूसरे"} भाव में शनि — साढ़े साती का ${pick(phase, l)}। यह कई साल का दौर है जो धैर्य माँगता है; यह दौर को रंग देता है, किसी एक दिन को नहीं।`,
        hinglish: `Chalta hua aadhar: Chandrama se ${shm === 12 ? "baarahvein" : shm === 1 ? "pehle" : "doosre"} bhaav mein Shani — Sade Sati ka ${pick(phase, l)}. Ye kai saal ka daur hai jo dhairya maangta hai; ye daur ko rang deta hai, kisi ek din ko nahi.`,
      }[l],
    });
  } else if (shm && [4, 8].includes(shm)) {
    factors.push({
      code: "dhaiya",
      kind: "neutral",
      weight: 0,
      title: { en: "Dhaiya (small panoti)", hi: "ढैया", hinglish: "Dhaiya" }[l],
      detail: {
        en: `Ongoing backdrop: Saturn is in the ${shm}th from your Moon (Dhaiya) — a slower ~2½-year phase. It colours the period, not any single day.`,
        hi: `चलता हुआ आधार: चंद्रमा से ${shm === 4 ? "चौथे" : "आठवें"} भाव में शनि (ढैया) — क़रीब ढाई साल का धीमा दौर। यह दौर को रंग देता है, किसी एक दिन को नहीं।`,
        hinglish: `Chalta hua aadhar: Chandrama se ${shm === 4 ? "chauthe" : "aathvein"} bhaav mein Shani (Dhaiya) — kareeb dhaai saal ka dheema daur. Ye daur ko rang deta hai, kisi ek din ko nahi.`,
      }[l],
    });
  }

  // ── 3. Dasha baseline (STANDING period mood, weight 0 — context only) ─────
  const maha = String(input.chart?.dasha?.current?.mahadasha || "").trim();
  if (maha && PLANET[maha]) {
    const pl = PLANET[maha];
    factors.push({
      code: `dasha_${maha.toLowerCase()}`,
      kind: "neutral",
      weight: 0,
      title: {
        en: `${maha} period`,
        hi: `${maha} की महादशा`,
        hinglish: `${maha} ki mahadasha`,
      }[l],
      detail: {
        en: `You're in a ${maha} mahadasha — the backdrop of this whole phase is ${pick(pl.theme, l)}. It tints the day but doesn't decide it.`,
        hi: `आप ${maha} की महादशा में हैं — इस पूरे दौर का आधार है ${pick(pl.theme, l)}। यह दिन को रंग देता है, तय नहीं करता।`,
        hinglish: `Aap ${maha} ki mahadasha mein hain — is poore daur ka aadhar hai ${pick(pl.theme, l)}. Ye din ko rang deta hai, tay nahi karta.`,
      }[l],
    });
  }

  // ── 5. Panchang: best/caution windows + today's tithi & nakshatra ────────
  let best: DaySignals["best_time"] = null;
  let caution: DaySignals["caution_time"] = null;
  if (Number.isFinite(input.latitude) && Number.isFinite(input.longitude)) {
    try {
      const p = buildPanchang({
        date: input.date,
        latitude: input.latitude!,
        longitude: input.longitude!,
        timezone: input.tz,
        ayanamsa: input.ayanamsa,
      });
      const goodSlot = (p.day_choghadiya || []).find((c: any) => c.quality === "good" && !c.blocked);
      if (goodSlot) {
        best = { name: goodSlot.name, start: goodSlot.start, end: goodSlot.end };
        factors.push({
          code: "best_window",
          kind: "good",
          weight: 0,
          title: { en: "A good window today", hi: "आज का शुभ समय", hinglish: "Aaj ka shubh samay" }[l],
          detail: fillTime(pick(BEST_LINE, l), best) + " " +
            { en: `(${goodSlot.name} choghadiya)`, hi: `(${goodSlot.name} चौघड़िया)`, hinglish: `(${goodSlot.name} choghadiya)` }[l],
          time: { start: best.start, end: best.end },
        });
      }
      const rk = p.periods?.rahu_kaal;
      if (rk?.start && rk?.end) {
        caution = { name: "Rahu Kaal", start: rk.start, end: rk.end };
        factors.push({
          code: "rahu_kaal",
          kind: "careful",
          weight: 0, // a fixed daily window, not a reason the day itself is heavy
          title: { en: "Rahu Kaal", hi: "राहु काल", hinglish: "Rahu Kaal" }[l],
          detail: fillTime(pick(CAUTION_LINE, l), caution),
          time: { start: caution.start, end: caution.end },
        });
      }
      // Real, daily-changing panchang context (proof the reading is today's,
      // not a template): the tithi and the nakshatra the Moon sits in today.
      if (p.tithi && p.nakshatra) {
        factors.push({
          code: "panchang_today",
          kind: "neutral",
          weight: 0,
          title: { en: "Today's panchang", hi: "आज का पंचांग", hinglish: "Aaj ka panchang" }[l],
          detail: {
            en: `Today is ${p.tithi}, with the Moon in ${p.nakshatra} nakshatra.`,
            hi: `आज ${p.tithi} है, चंद्रमा ${p.nakshatra} नक्षत्र में।`,
            hinglish: `Aaj ${p.tithi} hai, Chandrama ${p.nakshatra} nakshatra mein.`,
          }[l],
        });
      }
    } catch { /* polar / no sunrise — skip timing, keep the rest */ }
  }

  // ── severity, lean, tone ──────────────────────────────────────────────────
  const carefulWeight = factors.filter((f) => f.kind === "careful").reduce((n, f) => n + f.weight, 0);
  const goodWeight = factors.filter((f) => f.kind === "good").reduce((n, f) => n + f.weight, 0);
  const severity: DaySignals["severity"] = carefulWeight >= 3 ? 3 : carefulWeight === 2 ? 2 : carefulWeight === 1 ? 1 : 0;
  const lean: Lean = severity >= 2 ? "careful" : severity === 1 ? (goodWeight >= 1 ? "mixed" : "mixed") : goodWeight >= 1 ? "good" : "mixed";
  const tone: Tone = severity >= 2 ? "warn" : severity === 1 ? "advice" : goodWeight >= 1 ? "good" : "advice";

  // Order the reason the way a person would want it: what matters most first.
  // Careful outranks good outranks neutral; heavier weight first within a kind;
  // the two fixed time windows sink to the bottom (they're reference, not verdict).
  const rank = (f: DayFactor) =>
    (f.code === "best_window" || f.code === "rahu_kaal" ? -10 : 0) +
    (f.kind === "careful" ? 100 : f.kind === "good" ? 50 : 10) + f.weight * 5;
  factors.sort((a, b) => rank(b) - rank(a));

  // ── the one clear line ────────────────────────────────────────────────────
  // Built from the day's ACTUAL dominant factor, never a fixed opener — so a
  // heavy day and a good day read completely differently, and two people with
  // different charts get different lines. The lead phrase is plain (no jargon);
  // the technical placement stays in the factor's `detail` under "Reason".
  const leadFactor =
    factors.find((f) => f.lead && f.kind === (tone === "good" ? "good" : "careful")) ??
    factors.find((f) => f.lead) ?? null;
  const leadText = leadFactor?.lead ?? "";
  const bestClause = best ? " " + fillTime(pick(BEST_LINE, l), best) : "";

  // After a "Vansh, " greeting the lead is mid-sentence (lowercase reads right);
  // with no name it starts the sentence (capitalise). Notifications have no
  // greeting, so they always capitalise.
  const greet = GREET(name, l);
  const headline = leadText
    ? (greet + (greet ? leadText : capFirst(leadText)) + "." + bestClause).trim()
    : (greet + pick(LABEL[tone], l) + "." + bestClause).trim();
  const short = (capFirst(leadText || pick(LABEL[tone], l)) + "." + bestClause).trim();

  return {
    date: input.date,
    lang: langKey,
    name,
    lean,
    severity,
    tone,
    label: pick(LABEL[tone], l),
    headline,
    short,
    factors,
    best_time: best,
    caution_time: caution,
  };
}

function capFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Batch: today .. today+days-1, one DaySignals each. This is what the app calls
 * to fill a week of notification bodies in a single pass while it has network,
 * so the phone can then fire them with the app closed.
 */
export function buildUpcomingDaySignals(input: {
  chart: any;
  startDate: string;
  days: number;
  tz: string;
  lang?: string;
  latitude?: number;
  longitude?: number;
  ayanamsa: number;
  name?: string | null;
}): DaySignals[] {
  const out: DaySignals[] = [];
  const [y, m, d] = input.startDate.split("-").map(Number);
  for (let i = 0; i < input.days; i++) {
    // Step the calendar date in UTC purely as date arithmetic (no clock/tz math
    // — the tz is applied later by buildIsoDatetime/buildPanchang per date).
    const dt = new Date(Date.UTC(y, m - 1, d + i));
    const date = dt.toISOString().slice(0, 10);
    out.push(buildDaySignals({ ...input, date }));
  }
  return out;
}
