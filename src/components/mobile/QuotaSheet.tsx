/**
 * Quota-reached bottom sheet.
 *
 * Shows when a metered endpoint returns 429. It's driven entirely by the global
 * `va-quota` window event (dispatched from `src/lib/quota.ts`), so pages never
 * import or render it directly — mount `<QuotaListener/>` once, high in the tree.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import type { QuotaPayload } from "@/lib/quota";

/** Friendly names for each metered action the server reports. */
const ACTION_LABEL: Record<string, string> = {
  chart: "saved kundlis",
  report: "life reports",
  ask: "AI questions",
  match: "kundli matches",
};

function labelFor(action: string): string {
  return ACTION_LABEL[action] ?? "requests";
}

/** Honest note on when the free allowance comes back (no fake "upgrade"). */
const RESET_HINT: Record<string, string> = {
  ask: "Your free questions refresh tomorrow.",
  match: "Your free matches refresh tomorrow.",
  report: "Your free reports refresh next month.",
  chart: "Delete a saved kundli to add a new one.",
};

/** The app's spring, mirrored from `--spring` in index.css. */
const SPRING = { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.9 };

function QuotaSheet({ data, onClose }: { data: QuotaPayload; onClose: () => void }) {
  const what = labelFor(data.action);
  const hasCount = typeof data.limit === "number" && data.limit >= 0;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Limit reached for ${what}`}
    >
      {/* backdrop */}
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-black/50"
      />

      {/* sheet */}
      <motion.div
        className="relative w-full max-w-[520px] rounded-t-[28px] border border-border bg-card px-5 pt-3 text-card-foreground shadow-2xl"
        style={{ paddingBottom: "calc(var(--sab, 0px) + 20px)" }}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={SPRING}
      >
        {/* grabber */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />

        <Pressable
          onClick={onClose}
          feedback="tap"
          aria-label="Close"
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </Pressable>

        <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Sparkles className="h-7 w-7" />
        </div>

        <h2 className="text-[19px] font-bold leading-tight">
          You've reached your {what} limit
        </h2>

        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {data.error || `You've used all of your ${what} on the current plan.`}
          {RESET_HINT[data.action] ? ` ${RESET_HINT[data.action]}` : ""}
        </p>

        {hasCount && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-muted px-4 py-3 text-[13px] font-semibold">
            <span className="text-muted-foreground">Used</span>
            <span className="text-foreground">
              {data.used} / {data.limit}
            </span>
            {data.plan && (
              <span className="ml-auto rounded-full bg-accent/15 px-2.5 py-1 text-[11.5px] uppercase tracking-wide text-accent">
                {data.plan}
              </span>
            )}
          </div>
        )}

        <div className="mt-5 space-y-2.5">
          <Pressable
            feedback="medium"
            onClick={onClose}
            className="flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
          >
            Got it
          </Pressable>
          <Pressable
            feedback="tap"
            onClick={() => { window.open("mailto:vk1234888i@gmail.com?subject=JanamJyot%20—%20need%20more%20access", "_blank"); onClose(); }}
            className="flex w-full items-center justify-center rounded-full border border-input px-5 py-3.5 text-[14px] font-bold text-foreground"
          >
            Need more? Contact us
          </Pressable>
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Mount once, high in the tree. Listens for `va-quota` and renders the sheet.
 */
export default function QuotaListener() {
  const [data, setData] = useState<QuotaPayload | null>(null);

  useEffect(() => {
    const onQuota = (e: Event) => {
      const detail = (e as CustomEvent<QuotaPayload>).detail;
      if (!detail) return;
      haptic.warning();
      setData(detail);
    };
    window.addEventListener("va-quota", onQuota as EventListener);
    return () => window.removeEventListener("va-quota", onQuota as EventListener);
  }, []);

  return (
    <AnimatePresence>
      {data && <QuotaSheet data={data} onClose={() => setData(null)} />}
    </AnimatePresence>
  );
}
