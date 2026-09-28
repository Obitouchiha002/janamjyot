/**
 * "The update is here — want it now?"
 *
 * A downloaded bundle takes over on the next COLD start, and reopening an app
 * from the recents list is not a cold start. So people updated, restarted the
 * way anyone would, saw the same screens, and concluded over-the-air updates
 * simply did not work — which, from where they stood, was true.
 *
 * This says the update has arrived and applies it on a tap. Dismissing it is
 * fine: the bundle is already queued and will take over by itself.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUpCircle, X } from 'lucide-react';
import { haptic } from '@/lib/native';
import { getUiLang } from '@/lib/prefs';
import { applyWebUpdate, OTA_READY_EVENT } from '@/lib/ota';

const T = {
  en: { title: 'Update ready', body: 'A new version has downloaded.', now: 'Restart now', later: 'Later' },
  hi: { title: 'अपडेट तैयार है', body: 'नया वर्ज़न डाउनलोड हो गया है।', now: 'अभी लगाएँ', later: 'बाद में' },
} as const;

export default function OtaBanner() {
  const [build, setBuild] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const t = T[getUiLang() === 'hi' ? 'hi' : 'en'];

  useEffect(() => {
    const on = (e: Event) => setBuild(String((e as CustomEvent).detail?.build || 'new'));
    window.addEventListener(OTA_READY_EVENT, on as EventListener);
    return () => window.removeEventListener(OTA_READY_EVENT, on as EventListener);
  }, []);

  return (
    <AnimatePresence>
      {build && (
        <motion.div
          className="fixed inset-x-3 z-[120] mx-auto max-w-[460px]"
          style={{ bottom: 'calc(var(--sab, 0px) + var(--tabbar-h, 0px) + 12px)' }}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          role="status"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-2xl">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
              <ArrowUpCircle className="h-[19px] w-[19px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold leading-tight">{t.title}</p>
              <p className="truncate text-[12px] text-muted-foreground">{t.body}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={async () => { haptic.medium(); setBusy(true); await applyWebUpdate(); }}
              className="shrink-0 rounded-full bg-accent px-3.5 py-2 text-[13px] font-bold text-accent-foreground shadow-sm shadow-accent/25 disabled:opacity-60"
            >
              {busy ? '…' : t.now}
            </button>
            <button
              type="button"
              onClick={() => setBuild(null)}
              aria-label={t.later}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground"
            >
              <X className="h-[17px] w-[17px]" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
