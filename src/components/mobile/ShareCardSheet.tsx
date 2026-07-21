import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Share2, Download, Sparkles } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic, isNative, saveToDownloads, shareFile } from '@/lib/native';
import { renderShareCardPremium, type ShareCardData } from '@/lib/shareCard';

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 34, mass: 0.9 };

/**
 * Preview + share sheet for the Kundli card.
 *
 * The shared file is a still PNG, so the motion lives here: the card is
 * "developed" in front of the user — a brief starfield shimmer, then the poster
 * flips up and a light sweeps across it. That reveal is what makes people
 * actually want to send it.
 */
export default function ShareCardSheet({
  data,
  onClose,
}: {
  data: ShareCardData;
  onClose: () => void;
}) {
  const [png, setPng] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'share' | 'save'>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    renderShareCardPremium(data)
      .then((url) => alive && setPng(url))
      .catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [data]);

  const fileName = `${(data.name || 'My').replace(/\s+/g, '_')}_Kundli.png`;

  const onShare = async () => {
    if (!png || busy) return;
    setBusy('share');
    haptic.medium();
    try {
      if (!isNative) {
        const a = document.createElement('a');
        a.href = png; a.download = fileName; a.click();
      } else {
        const uri = await saveToDownloads(fileName, png, {
          notifyTitle: 'Kundli card ready',
          notifyBody: 'Your shareable kundli image is ready',
        });
        if (uri) await shareFile(uri, 'My Janam Kundli');
      }
      haptic.success();
    } catch { haptic.error(); }
    finally { setBusy(''); }
  };

  const onSave = async () => {
    if (!png || busy) return;
    setBusy('save');
    try {
      if (!isNative) {
        const a = document.createElement('a');
        a.href = png; a.download = fileName; a.click();
      } else {
        await saveToDownloads(fileName, png, {
          notifyTitle: 'Kundli card saved',
          notifyBody: `${fileName} is in your files`,
        });
      }
      haptic.success();
    } catch { haptic.error(); }
    finally { setBusy(''); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[120] flex items-end justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog" aria-modal="true" aria-label="Share your Kundli"
    >
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/65" />

      <motion.div
        className="relative w-full max-w-[520px] rounded-t-[28px] border border-border bg-card px-5 pt-3 text-card-foreground shadow-2xl"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 20px)' }}
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={SPRING}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <Pressable
          onClick={onClose} feedback="tap" aria-label="Close"
          className="tap-44 absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </Pressable>

        <h2 className="text-[18px] font-bold leading-tight">Your Kundli card</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Send it to family — the QR brings them straight to their own free kundli.
        </p>

        <div className="mt-4 flex justify-center">
          {failed ? (
            <p className="py-10 text-[13px] text-muted-foreground">Couldn&apos;t create the card. Please try again.</p>
          ) : !png ? (
            /* "developing" state — a slow gold shimmer while the canvas draws */
            <div className="relative h-[300px] w-[240px] overflow-hidden rounded-2xl border border-border bg-muted">
              <motion.div
                className="absolute inset-y-0 w-1/2"
                style={{ background: 'linear-gradient(100deg,transparent,rgba(216,171,78,0.22),transparent)' }}
                animate={{ x: ['-120%', '260%'] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
              <div className="absolute inset-0 grid place-items-center">
                <Sparkles className="h-7 w-7 animate-pulse text-accent" />
              </div>
            </div>
          ) : (
            <motion.div
              className="relative overflow-hidden rounded-2xl"
              initial={{ opacity: 0, scale: 0.9, rotateX: 18, y: 18 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0, y: 0 }}
              transition={{ ...SPRING, delay: 0.05 }}
              style={{ perspective: 800 }}
            >
              <img src={png} alt="Your Kundli card" className="block w-[240px] rounded-2xl shadow-2xl" />
              {/* one-shot light sweep across the finished card */}
              <motion.div
                className="pointer-events-none absolute inset-y-0 w-1/2"
                style={{ background: 'linear-gradient(100deg,transparent,rgba(255,255,255,0.28),transparent)' }}
                initial={{ x: '-130%' }}
                animate={{ x: '280%' }}
                transition={{ duration: 0.9, delay: 0.35, ease: 'easeOut' }}
              />
            </motion.div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Pressable
            onClick={onSave} disabled={!png || !!busy} subtle
            className="flex items-center justify-center gap-1.5 rounded-full border border-border py-3.5 text-[13.5px] font-bold"
          >
            <Download className="h-[16px] w-[16px]" /> {busy === 'save' ? 'Saving…' : 'Save'}
          </Pressable>
          <Pressable
            onClick={onShare} disabled={!png || !!busy} feedback="medium"
            className="flex items-center justify-center gap-1.5 rounded-full bg-accent py-3.5 text-[13.5px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
          >
            <Share2 className="h-[16px] w-[16px]" /> {busy === 'share' ? 'Opening…' : 'Share'}
          </Pressable>
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Convenience wrapper so pages can just render `<ShareCardHost .../>`. */
export function ShareCardHost({ data, open, onClose }: { data: ShareCardData; open: boolean; onClose: () => void }) {
  return <AnimatePresence>{open && <ShareCardSheet data={data} onClose={onClose} />}</AnimatePresence>;
}
