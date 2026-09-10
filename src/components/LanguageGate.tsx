/**
 * First launch: pick the language, once.
 *
 * Everything that speaks three languages — Home, the chat, the day's line, the
 * morning notification — reads this choice, so it is asked at the door rather
 * than left to be discovered under Settings (where it can still be changed).
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { Check } from 'lucide-react';
import { setLang } from '@/lib/prefs';
import { haptic } from '@/lib/native';

const CHOSEN_KEY = 'jj:lang-chosen';

/** True once a language was picked here or anywhere else (Settings). */
export function languageChosen(): boolean {
  try { return !!localStorage.getItem(CHOSEN_KEY) || !!localStorage.getItem('jj:lang'); } catch { return true; }
}

const OPTIONS = [
  { k: 'hinglish', title: 'Hinglish', sample: 'Aaj ka din aapke liye kaisa hai?' },
  { k: 'hi', title: 'हिंदी', sample: 'आज का दिन आपके लिए कैसा है?' },
  { k: 'en', title: 'English', sample: 'How does today look for you?' },
] as const;

const COPY: Record<string, { head: string; sub: string; go: string }> = {
  hinglish: { head: 'Apni bhasha chuniye', sub: 'Poora app isi bhasha mein chalega. Baad mein Settings se badal sakte hain.', go: 'Aage badhein' },
  hi: { head: 'अपनी भाषा चुनें', sub: 'पूरा ऐप इसी भाषा में चलेगा। बाद में सेटिंग्स से बदल सकते हैं।', go: 'आगे बढ़ें' },
  en: { head: 'Choose your language', sub: 'The whole app will use it. You can change it later in Settings.', go: 'Continue' },
};

export default function LanguageGate({ onDone }: { onDone: () => void }) {
  const [pick, setPick] = useState<string>(() => (typeof navigator !== 'undefined' && /^hi/i.test(navigator.language) ? 'hi' : 'hinglish'));
  const c = COPY[pick] ?? COPY.en;
  const done = () => {
    haptic.success();
    setLang(pick);
    try { localStorage.setItem(CHOSEN_KEY, '1'); } catch { /* ignore */ }
    onDone();
  };
  return (
    <div className="hm app-shell flex flex-col" style={{ background: 'linear-gradient(180deg, #FBF3E6 0%, #F5F1EA 60%)' }}>
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6" style={{ paddingTop: 'calc(var(--sat, 0px) + 56px)', paddingBottom: 'calc(var(--sab, 0px) + 24px)' }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
          <p className="hm-eyebrow" style={{ color: '#7A6A55' }}>JanamJyot</p>
          <h1 className="mt-2 text-[28px] font-semibold leading-[1.2] tracking-[-0.01em]" style={{ color: '#1A1A1F' }}>{c.head}</h1>
          <p className="mt-2 text-[15px] leading-[22px]" style={{ color: '#6B6B73' }}>{c.sub}</p>
        </motion.div>

        <div className="mt-8 space-y-3" role="radiogroup" aria-label={c.head}>
          {OPTIONS.map((o, i) => {
            const on = pick === o.k;
            return (
              <motion.button key={o.k} type="button" role="radio" aria-checked={on}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.06 * (i + 1), ease: [0.2, 0.8, 0.2, 1] }}
                onClick={() => { haptic.select(); setPick(o.k); }}
                className="flex w-full items-center gap-4 rounded-[20px] px-5 py-4 text-left transition-transform active:scale-[0.98]"
                style={{ background: '#FFFDF9', border: `1.5px solid ${on ? '#C9923C' : 'rgba(120,90,40,.12)'}`, boxShadow: on ? '0 10px 30px rgba(60,40,10,.10)' : '0 1px 2px rgba(20,16,8,.04)' }}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[18px] font-semibold" style={{ color: '#1A1A1F' }}>{o.title}</span>
                  <span className="mt-0.5 block text-[14px]" style={{ color: '#6B6B73' }}>{o.sample}</span>
                </span>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full"
                  style={{ background: on ? '#A35F18' : 'transparent', border: on ? 'none' : '1.5px solid rgba(120,90,40,.25)' }}>
                  {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                </span>
              </motion.button>
            );
          })}
        </div>

        <div className="flex-1" />
        <button type="button" onClick={done}
          className="mt-8 flex h-[52px] w-full items-center justify-center rounded-[16px] text-[16px] font-semibold text-white transition-transform active:scale-[0.98]"
          style={{ background: '#A35F18' }}>
          {c.go}
        </button>
      </div>
    </div>
  );
}
