import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Download, Sparkles, X } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
import { checkForUpdate, skipVersion, startUpdate, type UpdateInfo } from '@/lib/appUpdate';

const SPRING = { type: 'spring' as const, stiffness: 400, damping: 36, mass: 0.9 };

/**
 * Mount once, high in the tree. Checks for a newer APK on launch and offers it.
 * Silent when the app is already current — it must never nag.
 */
export default function UpdateSheet() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    // Wait a moment so this never competes with the splash or first paint.
    const t = setTimeout(() => { checkForUpdate().then(setInfo).catch(() => {}); }, 2500);
    return () => clearTimeout(t);
  }, []);

  const close = () => {
    if (info && !info.mandatory) skipVersion(info.latest);
    setInfo(null);
  };

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-end justify-center"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog" aria-modal="true" aria-label="App update available"
        >
          <button
            aria-label="Close"
            onClick={info.mandatory ? undefined : close}
            className="absolute inset-0 h-full w-full bg-black/60"
          />

          <motion.div
            className="relative w-full max-w-[520px] rounded-t-[28px] border border-border bg-card px-5 pt-3 text-card-foreground shadow-2xl"
            style={{ paddingBottom: 'calc(var(--sab, 0px) + 20px)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={SPRING}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
            {!info.mandatory && (
              <Pressable
                onClick={close} feedback="tap" aria-label="Close"
                className="tap-44 absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground"
              >
                <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
              </Pressable>
            )}

            <motion.span
              className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Sparkles className="h-7 w-7" />
            </motion.span>

            <h2 className="text-[19px] font-bold leading-tight">A new version is ready</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
              {info.notes
                ? info.notes
                : 'Update to get the latest features and fixes.'}
            </p>
            <p className="mt-2 text-[12px] text-muted-foreground">
              You have v{info.current} · latest is v{info.latest}
            </p>

            <Pressable
              feedback="medium"
              onClick={() => { haptic.medium(); startUpdate(info.apkUrl); }}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
            >
              <Download className="h-[17px] w-[17px]" /> Update now
            </Pressable>

            {!info.mandatory && (
              <Pressable
                subtle onClick={close}
                className="mt-2 block w-full py-2.5 text-center text-[13px] font-semibold text-muted-foreground"
              >
                Later
              </Pressable>
            )}

            <p className="mt-3 text-center text-[11.5px] leading-relaxed text-muted-foreground">
              Android will ask you to confirm the install — that prompt is normal for
              apps downloaded outside the Play Store.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
