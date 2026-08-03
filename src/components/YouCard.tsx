import { Sparkles, ChevronRight } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { getLang } from "@/lib/prefs";

/**
 * "You, in simple words" — the first thing a beginner should see about their
 * chart, in plain language with ZERO jargon. The dashboard used to open with
 * Lagna / Rashi / Nakshatra / Dasha, which reads as "complicated" to someone
 * who doesn't know astrology. This translates the same real placements (Moon
 * sign = nature, running mahadasha = the life-phase) into a warm sentence about
 * who they are and what season of life they're in — then invites them to ask.
 *
 * Deterministic and instant (no AI): it's a lookup from the person's own chart.
 */

type Tri = { en: string; hi: string; hinglish: string };
type Lang = "en" | "hi" | "hinglish";
const asLang = (v: string): Lang => (v === "hi" || v === "hinglish" ? v : "en");
const pick = (t: Tri, l: Lang) => t[l];

// Moon sign (Rashi) → nature. Vedic reads the Moon for the mind and temperament,
// so this is the honest "what you're like" signal, kept jargon-free.
const MOON_NATURE: Record<string, Tri> = {
  Aries:       { en: "bold, energetic and quick to act — a natural starter", hi: "साहसी, ऊर्जावान और तुरंत कदम उठाने वाले — एक स्वाभाविक शुरुआत करने वाले", hinglish: "saahsi, energetic aur turant kadam uthane wale — ek natural starter" },
  Taurus:      { en: "steady, patient and calm — you value comfort and security", hi: "स्थिर, धैर्यवान और शांत — आपको सुख और सुरक्षा पसंद है", hinglish: "steady, patient aur shaant — aapko sukh aur security pasand hai" },
  Gemini:      { en: "curious, talkative and quick-minded — you love variety", hi: "जिज्ञासु, बातूनी और तेज़ दिमाग़ — आपको विविधता पसंद है", hinglish: "curious, baatuni aur tez-dimaag — aapko variety pasand hai" },
  Cancer:      { en: "caring, sensitive and family-loving — you feel things deeply", hi: "स्नेही, संवेदनशील और परिवार-प्रेमी — आप गहराई से महसूस करते हैं", hinglish: "caring, sensitive aur parivaar-premi — aap gehrai se feel karte ho" },
  Leo:         { en: "warm, confident and generous — you like to lead", hi: "गर्मजोश, आत्मविश्वासी और उदार — आपको नेतृत्व पसंद है", hinglish: "warm, confident aur udaar — aapko lead karna pasand hai" },
  Virgo:       { en: "practical, careful and helpful — you notice the details", hi: "व्यावहारिक, सावधान और मददगार — आप छोटी बातों पर ध्यान देते हैं", hinglish: "practical, savdhaan aur helpful — aap choti baaton par dhyan dete ho" },
  Libra:       { en: "friendly, fair and easy-going — you value harmony", hi: "मिलनसार, न्यायप्रिय और सहज — आपको शांति और तालमेल पसंद है", hinglish: "friendly, nyaypriya aur easy-going — aapko harmony pasand hai" },
  Scorpio:     { en: "intense, deep and strong-willed — private but loyal", hi: "गहरे, तीव्र और दृढ़-इच्छाशक्ति वाले — निजी पर वफ़ादार", hinglish: "intense, gehre aur dridh-ichhashakti wale — private par wafadaar" },
  Sagittarius: { en: "optimistic, free-spirited and honest — you love learning", hi: "आशावादी, स्वतंत्र और सच्चे — आपको सीखना पसंद है", hinglish: "optimistic, azaad-khayal aur sacche — aapko seekhna pasand hai" },
  Capricorn:   { en: "disciplined, ambitious and patient — a steady builder", hi: "अनुशासित, महत्वाकांक्षी और धैर्यवान — टिककर बनाने वाले", hinglish: "disciplined, ambitious aur patient — tik ke banane wale" },
  Aquarius:    { en: "independent, original and humane — a forward thinker", hi: "स्वतंत्र, मौलिक और मानवीय — आगे की सोच वाले", hinglish: "independent, original aur humane — aage ki soch wale" },
  Pisces:      { en: "gentle, imaginative and kind — you feel with your heart", hi: "कोमल, कल्पनाशील और दयालु — आप दिल से महसूस करते हैं", hinglish: "komal, kalpanashil aur dayalu — aap dil se feel karte ho" },
};

// Running mahadasha lord → the SEASON of life, in plain words.
const DASHA_PHASE: Record<string, Tri> = {
  Sun:     { en: "stepping into your own authority and recognition", hi: "अपने आत्मविश्वास और पहचान में आने का", hinglish: "apne aatmvishwas aur pehchaan mein aane ka" },
  Moon:    { en: "feelings, home and people mattering more", hi: "भावनाओं, घर और लोगों के अहम होने का", hinglish: "emotions, ghar aur logon ke aham hone ka" },
  Mars:    { en: "action, courage and pushing your goals ahead", hi: "कर्म, हिम्मत और लक्ष्यों को आगे बढ़ाने का", hinglish: "action, himmat aur lakshya aage badhane ka" },
  Mercury: { en: "learning, communication and smart work", hi: "सीखने, बातचीत और समझदारी भरे काम का", hinglish: "seekhne, baat-cheet aur samajhdari bhare kaam ka" },
  Jupiter: { en: "growth, wisdom and good fortune", hi: "वृद्धि, ज्ञान और अच्छे भाग्य का", hinglish: "vriddhi, gyaan aur acche bhagya ka" },
  Venus:   { en: "relationships, comfort, love and money", hi: "रिश्तों, सुख, प्रेम और धन का", hinglish: "rishton, sukh, pyaar aur paise ka" },
  Saturn:  { en: "hard work and discipline that builds something lasting", hi: "मेहनत और अनुशासन का, जो कुछ टिकाऊ बनाता है", hinglish: "mehnat aur anushasan ka, jo kuch tikau banata hai" },
  Rahu:    { en: "ambition, big changes and new directions", hi: "महत्वाकांक्षा, बड़े बदलाव और नई दिशाओं का", hinglish: "ambition, bade badlaav aur nayi dishaon ka" },
  Ketu:    { en: "turning inward, letting go and finding meaning", hi: "अंदर मुड़ने, छोड़ने और अर्थ पाने का", hinglish: "andar mudne, chhodne aur arth paane ka" },
};

export default function YouCard({
  chartId, name, moonSign, dashaLord,
}: { chartId?: string; name?: string; moonSign?: string; dashaLord?: string }) {
  const l = asLang(getLang());
  const nature = moonSign ? MOON_NATURE[moonSign] : null;
  const phase = dashaLord ? DASHA_PHASE[dashaLord] : null;
  if (!nature) return null; // nothing to say without at least the Moon sign

  const first = name?.trim().split(/\s+/)[0] || "";
  const natureLine = {
    en: `${first ? first + ", you're " : "You're "}${pick(nature, l)}.`,
    hi: `${first ? first + ", आप " : "आप "}${pick(nature, l)}।`,
    hinglish: `${first ? first + ", aap " : "Aap "}${pick(nature, l)}.`,
  }[l];
  const phaseLine = phase
    ? {
        en: ` Right now you're in a phase of ${pick(phase, l)}.`,
        hi: ` अभी आप ${pick(phase, l)} दौर में हैं।`,
        hinglish: ` Abhi aap ${pick(phase, l)} daur mein ho.`,
      }[l]
    : "";

  return (
    <section className="m-card m-enter overflow-hidden">
      <div className="p-4">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent">
          <Sparkles className="h-3.5 w-3.5" />
          {{ en: "You, in simple words", hi: "आप, आसान शब्दों में", hinglish: "Aap, aasaan shabdon mein" }[l]}
        </p>
        <p className="mt-2 text-[15px] leading-relaxed">
          {natureLine}<span className="text-muted-foreground">{phaseLine}</span>
        </p>
      </div>
      {chartId && (
        <Pressable
          to={`/chat/${chartId}`}
          feedback="select"
          className="flex w-full items-center justify-between gap-2 border-t border-border/70 px-4 py-3 text-[13px] font-bold text-accent"
        >
          {{ en: "Ask about your life →", hi: "अपनी ज़िंदगी के बारे में पूछें →", hinglish: "Apni zindagi ke baare mein poochho →" }[l]}
          <ChevronRight className="h-[16px] w-[16px]" />
        </Pressable>
      )}
    </section>
  );
}
