/**
 * The first two minutes.
 *
 * Someone who opens this app for the first time lands on a home screen full of
 * cards about a kundli they have not made yet, and the one thing that makes any
 * of it work — their birth details — is behind a tab they have no reason to
 * tap. So the app showed its best face to people who already knew what it was,
 * and a wall to everyone else.
 *
 * This is a short preview of what the app will actually do for them, and then
 * a single door into the one action that turns it on. Three screens, not ten.
 *
 * Skip is on every screen, in the same place, and it is a real skip: it never
 * asks again. A first-run tour that traps you is worse than no tour, and a
 * person who wants to look around first is not a person to argue with.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, MessageCircle, CalendarHeart, ArrowRight } from 'lucide-react';
import { haptic } from '@/lib/native';
import { getLang } from '@/lib/prefs';

const SEEN_KEY = 'jj:onboarded';

/** True once the tour has been finished or skipped. */
export function onboardingSeen(): boolean {
  try { return !!localStorage.getItem(SEEN_KEY); } catch { return true; }
}
export function markOnboarded(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* ignore */ }
}

type Lang = 'en' | 'hi' | 'hinglish';

/*
 * Written per language rather than run through the dictionary.
 *
 * This is the one screen where the sentences carry the whole product, and a
 * word-for-word translation of an English pitch reads like a translated
 * English pitch. Each version is written to sound like someone speaking it.
 */
const COPY: Record<Lang, {
  skip: string; next: string; start: string; steps: Array<{ title: string; body: string }>;
}> = {
  hinglish: {
    skip: 'Abhi nahi',
    next: 'Aage',
    start: 'Meri kundli banaiye',
    steps: [
      { title: 'Aapki apni kundli, do minute mein',
        body: 'Sirf janm ki tareekh, samay aur jagah. Usi se poora chart banta hai — lagna, rashi, nakshatra, dasha.' },
      { title: 'Roz ka ek saaf jawab',
        body: 'Aaj ka din kaisa hai, kaun sa samay accha hai, kis cheez se bachna hai. Har subah, aapki apni kundli se.' },
      { title: 'Jo poochna ho, poochiye',
        body: 'Shaadi, kaam, paisa, ghar — apni bhasha mein poochiye. Jawab aapke chart se aata hai, kisi aam rashifal se nahi.' },
    ],
  },
  hi: {
    skip: 'अभी नहीं',
    next: 'आगे',
    start: 'मेरी कुंडली बनाएँ',
    steps: [
      { title: 'आपकी अपनी कुंडली, दो मिनट में',
        body: 'बस जन्म की तारीख़, समय और जगह। उसी से पूरा चार्ट बनता है — लग्न, राशि, नक्षत्र, दशा।' },
      { title: 'रोज़ एक साफ़ जवाब',
        body: 'आज का दिन कैसा है, कौन सा समय शुभ है, किससे बचना है। हर सुबह, आपकी अपनी कुंडली से।' },
      { title: 'जो पूछना हो, पूछिए',
        body: 'विवाह, काम, पैसा, घर — अपनी भाषा में पूछिए। जवाब आपके चार्ट से आता है, किसी आम राशिफल से नहीं।' },
    ],
  },
  en: {
    skip: 'Not now',
    next: 'Next',
    start: 'Create my kundli',
    steps: [
      { title: 'Your own kundli, in two minutes',
        body: 'Just your date, time and place of birth. Everything is built from that — lagna, moon sign, nakshatra, dasha.' },
      { title: 'One clear answer each day',
        body: 'How today looks, which hours are good, what to leave alone. Every morning, from your own chart.' },
      { title: 'Ask whatever you actually want to ask',
        body: 'Marriage, work, money, home — in your own words. The answer comes from your chart, not a generic horoscope.' },
    ],
  },
};

const ICONS = [Sparkles, CalendarHeart, MessageCircle];

export default function Onboarding({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  const raw = getLang();
  const lang: Lang = raw === 'hi' || raw === 'hinglish' ? raw : 'en';
  const c = COPY[lang];
  const [i, setI] = useState(0);
  const last = i === c.steps.length - 1;
  const Icon = ICONS[i] ?? Sparkles;

  const skip = () => { haptic.tap(); markOnboarded(); onSkip(); };
  const next = () => {
    haptic.tap();
    if (!last) { setI((n) => n + 1); return; }
    markOnboarded();
    onStart();
  };

  return (
    <div className="hm hm-page-bg fixed inset-0 z-[120] flex flex-col overflow-y-auto">
      {/* Skip sits in the same place on every screen, above everything. */}
      <div className="flex justify-end px-5" style={{ paddingTop: 'calc(var(--sat, 0px) + 14px)' }}>
        <button
          onClick={skip}
          className="tap-44 relative rounded-full px-3 py-1.5 text-[13.5px] font-semibold"
          style={{ color: 'var(--hm-text-2)' }}
        >
          {c.skip}
        </button>
      </div>

      <div className="flex flex-1 flex-col justify-center px-7 pb-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
          >
            <span
              className="mb-6 grid h-16 w-16 place-items-center rounded-3xl"
              style={{ background: 'var(--hm-accent-soft, rgba(216,171,78,.16))', color: 'var(--hm-accent, #B7791F)' }}
            >
              <Icon className="h-8 w-8" strokeWidth={1.8} />
            </span>
            <h1
              className="hm-title text-[27px] font-bold leading-[1.2]"
              style={{ fontFamily: 'Fraunces, serif', color: 'var(--hm-text-1)' }}
            >
              {c.steps[i].title}
            </h1>
            <p className="mt-3 text-[15.5px] leading-relaxed" style={{ color: 'var(--hm-text-2)' }}>
              {c.steps[i].body}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-7" style={{ paddingBottom: 'calc(var(--sab, 0px) + 26px)' }}>
        {/* Where you are, without numbers. */}
        <div className="mb-5 flex gap-1.5" role="presentation">
          {c.steps.map((_, n) => (
            <span
              key={n}
              className="h-[3px] flex-1 rounded-full transition-all duration-300"
              style={{ background: n <= i ? 'var(--hm-accent, #B7791F)' : 'var(--hm-line, rgba(0,0,0,.12))' }}
            />
          ))}
        </div>
        <button
          onClick={next}
          className="flex w-full items-center justify-center gap-2 rounded-full py-4 text-[15.5px] font-bold shadow-lg"
          style={{
            background: 'var(--hm-accent, #B7791F)',
            color: 'var(--hm-on-accent, #fff)',
            boxShadow: '0 10px 30px -12px var(--hm-accent, #B7791F)',
          }}
        >
          {last ? c.start : c.next}
          <ArrowRight className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}
