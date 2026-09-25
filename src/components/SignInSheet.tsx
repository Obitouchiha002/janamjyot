/**
 * The sign-in asked for at the moment of need.
 *
 * Driven by the global `jj-signin` event (see lib/gate.ts), so no page imports
 * it: mount `<SignInListener/>` once and any feature can say "this one needs an
 * account" without owning a sign-in screen. It leads with WHY — the question
 * they just typed, the report they just asked for — because "Sign in" with no
 * reason reads as a toll gate, and what it is actually protecting is their own
 * saved readings.
 *
 * On a phone it rises from the bottom like the app's other sheets; on a desktop
 * it is a centred card, because a bottom sheet on a 27" monitor is a phone
 * pretending.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Sparkles, MessageCircle, FileText, HeartHandshake, Compass, BookmarkCheck, Crown } from 'lucide-react';
import LoginPage from '@/pages/LoginPage';
import { getUiLang } from '@/lib/prefs';
import { SIGNIN_EVENT, type GateReason, type SignInRequest } from '@/lib/gate';
import { useAuth } from '@/auth';

type Tri = { en: string; hi: string };
const t = (x: Tri) => (getUiLang() === 'hi' ? x.hi : x.en);

/** One line per gate, naming the thing they were doing. */
const WHY: Record<GateReason, { icon: typeof MessageCircle; title: Tri; sub: Tri }> = {
  chat: {
    icon: MessageCircle,
    title: { en: 'Sign in to ask', hi: 'पूछने के लिए साइन इन करें' },
    sub: {
      en: 'Your question, the answer and everything the astrologer remembers about you stay in your account.',
      hi: 'आपका सवाल, जवाब और ज्योतिषी की आपसे जुड़ी हर बात आपके अकाउंट में सुरक्षित रहती है।',
    },
  },
  report: {
    icon: FileText,
    title: { en: 'Sign in to read your full report', hi: 'पूरी रिपोर्ट के लिए साइन इन करें' },
    sub: {
      en: 'A full life report takes a few minutes to write — an account is what lets you come back to it.',
      hi: 'पूरी जीवन रिपोर्ट बनने में कुछ मिनट लगते हैं — अकाउंट से आप उसे कभी भी दोबारा खोल सकते हैं।',
    },
  },
  match: {
    icon: HeartHandshake,
    title: { en: 'Sign in to match two kundlis', hi: 'दो कुंडली मिलाने के लिए साइन इन करें' },
    sub: {
      en: 'Matching reads two charts together and saves the result for both of you.',
      hi: 'मिलान दोनों कुंडलियों को साथ पढ़ता है और नतीजा सुरक्षित रखता है।',
    },
  },
  decide: {
    icon: Compass,
    title: { en: 'Sign in for your decision', hi: 'फ़ैसले के लिए साइन इन करें' },
    sub: {
      en: 'Faisla remembers what you decided and what actually happened — that needs an account.',
      hi: 'फ़ैसला याद रखता है कि आपने क्या तय किया और आगे क्या हुआ — इसके लिए अकाउंट चाहिए।',
    },
  },
  save: {
    icon: BookmarkCheck,
    title: { en: 'Sign in to keep this', hi: 'सहेजने के लिए साइन इन करें' },
    sub: {
      en: 'The kundlis you made here are kept on this device — sign in and they move with you.',
      hi: 'यहाँ बनाई कुंडलियाँ इसी डिवाइस पर हैं — साइन इन करते ही वे आपके साथ चलेंगी।',
    },
  },
  plan: {
    icon: Crown,
    title: { en: 'Sign in to buy', hi: 'खरीदने के लिए साइन इन करें' },
    sub: {
      en: 'Credits are attached to your account, so they work on the web and in the app.',
      hi: 'क्रेडिट आपके अकाउंट से जुड़ते हैं, इसलिए वे वेब और ऐप दोनों में चलते हैं।',
    },
  },
};

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 36 };

function Sheet({ req, onClose }: { req: SignInRequest; onClose: () => void }) {
  const why = WHY[req.reason] ?? WHY.chat;
  const Icon = why.icon;

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex items-end justify-center md:items-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      role="dialog" aria-modal="true" aria-label={t(why.title)}
    >
      <button aria-label="Close" onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/55 backdrop-blur-[3px]" />

      <motion.div
        className="relative max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[28px] border border-border bg-card px-5 pt-3 text-card-foreground shadow-2xl md:rounded-[28px] md:pt-6"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 20px)' }}
        initial={{ y: '100%', opacity: 0.6, scale: 1 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.6 }}
        transition={SPRING}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30 md:hidden" />
        <button type="button" onClick={onClose} aria-label="Close"
          className="tap-44 absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted">
          <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </button>

        <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Icon className="h-7 w-7" />
        </div>
        <h2 className="text-[20px] font-bold leading-snug">{t(why.title)}</h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{t(why.sub)}</p>

        <div className="mt-3 flex items-center gap-1.5 text-[12.5px] font-semibold text-accent">
          <Sparkles className="h-[14px] w-[14px]" />
          {t({ en: 'Free to create — takes a few seconds', hi: 'बनाना मुफ़्त है — कुछ ही सेकंड' })}
        </div>

        {/* The real sign-in form, not a copy of it: one screen, one behaviour,
            wherever it is shown. */}
        <div className="-mx-2 mt-1">
          <LoginPage onDone={onClose} />
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function SignInListener() {
  const { user } = useAuth();
  const [req, setReq] = useState<SignInRequest | null>(null);

  useEffect(() => {
    const open = (e: Event) => setReq((e as CustomEvent<SignInRequest>).detail);
    window.addEventListener(SIGNIN_EVENT, open as EventListener);
    return () => window.removeEventListener(SIGNIN_EVENT, open as EventListener);
  }, []);

  /*
   * Signed in — close, and finish what they were doing. The retry runs after
   * the sheet is gone so the answer appears on the screen they were on, not
   * behind a dialog.
   */
  useEffect(() => {
    if (!user || !req) return;
    const retry = req.retry;
    setReq(null);
    if (retry) setTimeout(retry, 60);
  }, [user, req]);

  return (
    <AnimatePresence>
      {req && <Sheet key="signin" req={req} onClose={() => setReq(null)} />}
    </AnimatePresence>
  );
}
