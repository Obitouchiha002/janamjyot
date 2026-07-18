/**
 * Feedback / rating bottom sheet.
 *
 * Driven entirely by the global `jj-feedback` window event (dispatched from
 * `src/lib/feedback.ts`), so pages never import or render it directly — mount
 * `<FeedbackListener/>` once, high in the tree.
 *
 * Flow: tap a star (1-5) → a short comment box slides in → Submit. A positive
 * rating (4-5★) with a real comment is auto-published to the website
 * testimonials by the backend. "Later" defers, "Never" silences it for good.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Star, X, Heart, PartyPopper } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
import {
  submitFeedback, markLater, markNever, type FeedbackStatus,
} from '@/lib/feedback';

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 0.9 };

const RATING_WORD = ['', 'Not good', 'Could be better', 'It’s okay', 'Really good', 'Loved it!'];

function Stars({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <Pressable
            key={n}
            feedback="select"
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => { haptic.select(); onPick(n); }}
            className="grid h-12 w-12 place-items-center"
          >
            <motion.span
              animate={active ? { scale: [1, 1.35, 1] } : { scale: 1 }}
              transition={{ duration: 0.28 }}
            >
              <Star
                className={active ? 'text-accent' : 'text-muted-foreground/35'}
                fill={active ? 'currentColor' : 'none'}
                strokeWidth={2}
                style={{ width: 34, height: 34 }}
              />
            </motion.span>
          </Pressable>
        );
      })}
    </div>
  );
}

function FeedbackSheet({ context, onClose }: { context: string; onClose: () => void }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | { published: boolean }>(null);

  const submit = async () => {
    if (rating < 1 || busy) return;
    setBusy(true);
    haptic.success();
    const r = await submitFeedback({ rating, comment: comment.trim(), context });
    setDone({ published: r.published && rating >= 4 });
  };

  return (
    <motion.div
      className="fixed inset-0 z-[110] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label="Rate your experience"
    >
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/55" />

      <motion.div
        className="relative w-full max-w-[520px] overflow-hidden rounded-t-[28px] border border-border bg-card px-5 pt-3 text-card-foreground shadow-2xl"
        style={{ paddingBottom: 'calc(var(--sab, 0px) + 20px)' }}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={SPRING}
      >
        {/* soft accent glow */}
        <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />

          <Pressable
            onClick={onClose}
            feedback="tap"
            aria-label="Close"
            className="absolute -top-1 right-0 grid h-8 w-8 place-items-center rounded-full text-muted-foreground"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
          </Pressable>

          {done ? (
            <div className="py-4 text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING}
                className="mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full bg-accent/15 text-accent"
              >
                {done.published ? <PartyPopper className="h-8 w-8" /> : <Heart className="h-8 w-8" fill="currentColor" />}
              </motion.div>
              <h2 className="text-[19px] font-bold leading-tight">Thank you! 🙏</h2>
              <p className="mx-auto mt-2 max-w-[300px] text-[13.5px] leading-relaxed text-muted-foreground">
                {done.published
                  ? 'Your review may appear on our website to help others discover JanamJyot.'
                  : 'Your feedback helps us make JanamJyot better for everyone.'}
              </p>
              <Pressable
                feedback="medium"
                onClick={onClose}
                className="mt-5 flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
              >
                Done
              </Pressable>
            </div>
          ) : (
            <>
              <div className="mb-1 grid h-12 w-12 place-items-center rounded-2xl bg-accent/15 text-accent">
                <Star className="h-6 w-6" fill="currentColor" />
              </div>
              <h2 className="mt-2 text-[20px] font-bold leading-tight">Enjoying JanamJyot?</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                Tap a star to rate your experience. It takes a second and means a lot.
              </p>

              <div className="mt-5">
                <Stars value={rating} onPick={setRating} />
                <div className="mt-2 h-5 text-center text-[13px] font-semibold text-accent">
                  {rating > 0 ? RATING_WORD[rating] : ''}
                </div>
              </div>

              <AnimatePresence initial={false}>
                {rating > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value.slice(0, 600))}
                      rows={3}
                      placeholder={rating >= 4 ? 'What did you love? (optional)' : 'How can we do better? (optional)'}
                      className="mt-2 w-full resize-none rounded-2xl border border-input bg-muted/50 px-4 py-3 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-accent/60"
                    />
                    <Pressable
                      feedback="medium"
                      onClick={submit}
                      className={`mt-3 flex w-full items-center justify-center rounded-full px-5 py-3.5 text-[14px] font-bold shadow-lg transition-opacity ${
                        busy ? 'bg-accent/60 text-accent-foreground' : 'bg-accent text-accent-foreground shadow-accent/25'
                      }`}
                    >
                      {busy ? 'Sending…' : 'Submit feedback'}
                    </Pressable>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-3 flex items-center justify-center gap-6">
                <Pressable
                  feedback="tap"
                  onClick={() => { markLater(); onClose(); }}
                  className="text-[13px] font-semibold text-muted-foreground"
                >
                  Later
                </Pressable>
                <span className="h-3 w-px bg-border" />
                <Pressable
                  feedback="tap"
                  onClick={() => { markNever(); onClose(); }}
                  className="text-[13px] font-semibold text-muted-foreground"
                >
                  Never
                </Pressable>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Mount once, high in the tree. Listens for `jj-feedback` and shows the sheet. */
export default function FeedbackListener() {
  const [ctx, setCtx] = useState<string | null>(null);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const detail = (e as CustomEvent<{ context?: string }>).detail;
      haptic.tap();
      setCtx(detail?.context ?? 'app');
    };
    window.addEventListener('jj-feedback', onEvt as EventListener);
    return () => window.removeEventListener('jj-feedback', onEvt as EventListener);
  }, []);

  return (
    <AnimatePresence>
      {ctx !== null && <FeedbackSheet context={ctx} onClose={() => setCtx(null)} />}
    </AnimatePresence>
  );
}

// re-exported for callers that want the type without importing the lib too
export type { FeedbackStatus };
