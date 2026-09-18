/**
 * Limit-reached bottom sheet.
 *
 * Driven entirely by the global `va-quota` event (dispatched from
 * `src/lib/quota.ts` on every 402/429), so it appears every single time a
 * feature is refused — pages never import or render it directly. Mount
 * `<QuotaListener/>` once, high in the tree.
 *
 * It sells from the moment the need appears. It used to say "This costs 2
 * credits" and offer one button to a Plan screen, and a plain limit got only
 * "Got it" — a dead end at the exact point someone wanted to keep going. Now
 * every pack and the ₹1 trial are right here, one tap from checkout, each
 * saying who it is for.
 *
 * `daily` is the exception: it is a safety cap on the free guidance pages that
 * credits do not lift, so offering a purchase there would sell something that
 * does not work. That sheet only says when it resets.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Sparkles, X } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";
import { getUiLang } from "@/lib/prefs";
import { useAuth } from "@/auth";
import { openCheckout, packWhy, PACK_NAME, type Lang } from "@/lib/checkout";
import type { QuotaPayload } from "@/lib/quota";

type Tri = { en: string; hi: string; hinglish: string };
const t = (x: Tri, l: Lang) => x[l] ?? x.en;

const WHAT: Record<string, Tri> = {
  chart: { en: "free kundlis", hi: "मुफ़्त कुंडली", hinglish: "free kundli" },
  report: { en: "free reports", hi: "मुफ़्त रिपोर्ट", hinglish: "free reports" },
  ask: { en: "free questions", hi: "मुफ़्त सवाल", hinglish: "free sawaal" },
  match: { en: "free matchings", hi: "मुफ़्त मिलान", hinglish: "free matching" },
};

/** Actions that credits (or the trial) can pay for. */
const BUYABLE = new Set(["ask", "match", "report", "chart"]);

const L = {
  usedUp: { en: "Your {w} are used up", hi: "आपके {w} खत्म हो गए", hinglish: "Aapke {w} khatam ho gaye" },
  dailyTitle: { en: "Today's limit is reached", hi: "आज की सीमा पूरी हो गई", hinglish: "Aaj ki limit poori ho gayi" },
  pick: { en: "Keep going — pick a pack", hi: "जारी रखें — पैक चुनें", hinglish: "Aage badhein — pack chuniye" },
  balance: { en: "Your balance", hi: "आपका बैलेंस", hinglish: "Aapka balance" },
  needMore: { en: "need {n} more", hi: "{n} और चाहिए", hinglish: "{n} aur chahiye" },
  credits: { en: "credits", hi: "क्रेडिट", hinglish: "credits" },
  trial: { en: "₹{r} · {d}-day full access", hi: "₹{r} · {d} दिन पूरा एक्सेस", hinglish: "₹{r} · {d} din full access" },
  seeAll: { en: "See all plans & my credits", hi: "सारे प्लान और मेरे क्रेडिट", hinglish: "Saare plans aur mere credits" },
  notNow: { en: "Not now", hi: "अभी नहीं", hinglish: "Abhi nahi" },
  gotIt: { en: "Got it", hi: "ठीक है", hinglish: "Theek hai" },
  popular: { en: "Most popular", hi: "सबसे पसंदीदा", hinglish: "Sabse popular" },
} satisfies Record<string, Tri>;

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

interface Offer {
  packs: { id: string; rupees: number; credits: number }[];
  trial: { used: boolean; active: boolean; rupees: number; days: number } | null;
  balance: number;
}

const SPRING = { type: "spring" as const, stiffness: 420, damping: 40, mass: 0.9 };

function QuotaSheet({ data, onClose }: { data: QuotaPayload; onClose: () => void }) {
  const lang = getUiLang() as Lang;
  const email = useAuth()?.user?.email as string | undefined;
  const buyable = BUYABLE.has(data.action);
  const price = data.needs_credits ?? 0;
  const [offer, setOffer] = useState<Offer | null>(null);

  // The live packs, trial and balance — never a list baked into the app.
  useEffect(() => {
    if (!buyable) return;
    let alive = true;
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!alive || !c) return;
        setOffer({ packs: c.packs ?? [], trial: c.trial ?? null, balance: c.balance ?? data.balance ?? 0 });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [buyable, data.balance]);

  const balance = offer?.balance ?? data.balance ?? 0;
  const what = WHAT[data.action] ? t(WHAT[data.action], lang) : "";
  const buy = (pack: string) => { haptic.success(); onClose(); openCheckout(pack, email); };
  const trialOpen = offer?.trial && !offer.trial.used && !offer.trial.active;

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-end justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      role="dialog" aria-modal="true" aria-label={buyable ? fill(t(L.usedUp, lang), { w: what }) : t(L.dailyTitle, lang)}
    >
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/50" />

      <motion.div
        className="relative max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-t-[28px] border border-border bg-card px-5 pt-3 text-card-foreground shadow-2xl"
        style={{ paddingBottom: "calc(var(--sab, 0px) + 20px)" }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={SPRING}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <Pressable onClick={onClose} feedback="tap" aria-label="Close"
          className="tap-44 absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-muted-foreground">
          <X className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </Pressable>

        <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-accent/15 text-accent">
          <Sparkles className="h-7 w-7" />
        </div>

        <h2 className="pr-8 text-[19px] font-bold leading-tight">
          {buyable ? fill(t(L.usedUp, lang), { w: what }) : t(L.dailyTitle, lang)}
        </h2>
        {/* The server's own words: it knows the exact reset window and price. */}
        {data.error && <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{data.error}</p>}

        {buyable && price > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3 text-[13.5px] font-semibold">
            <span className="text-muted-foreground">{t(L.balance, lang)}</span>
            <span className="text-foreground">
              {balance} {t(L.credits, lang)}
              {balance < price && (
                <span className="ml-2 text-destructive">{fill(t(L.needMore, lang), { n: price - balance })}</span>
              )}
            </span>
          </div>
        )}

        {buyable && !!offer?.packs.length && (
          <div className="mt-4">
            <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">{t(L.pick, lang)}</p>
            <div className="space-y-2">
              {offer.packs.map((p, i) => {
                const hot = p.id === "popular";
                return (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 + i * 0.06, duration: 0.3 }}>
                    <Pressable onClick={() => buy(p.id)} feedback="medium"
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3.5 py-3 text-left ${hot ? "border-accent bg-accent/10" : "border-border"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="text-[14px] font-bold">{PACK_NAME[p.id] ?? p.id}</span>
                          {hot && (
                            <span className="rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent">
                              {t(L.popular, lang)}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12px] font-semibold text-foreground/85">{packWhy(p.id, lang)}</span>
                        <span className="block text-[11.5px] text-muted-foreground">{p.credits} {t(L.credits, lang)}</span>
                      </span>
                      <span className="shrink-0 text-[17px] font-black tabular-nums">₹{p.rupees}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </Pressable>
                  </motion.div>
                );
              })}
              {trialOpen && offer?.trial && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 + offer.packs.length * 0.06, duration: 0.3 }}>
                  <Pressable onClick={() => buy("trial")} feedback="medium"
                    className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-emerald-500/60 bg-emerald-500/5 px-3.5 py-3 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-bold">
                        {fill(t(L.trial, lang), { r: offer.trial.rupees, d: offer.trial.days })}
                      </span>
                      <span className="mt-0.5 block text-[12px] font-semibold text-foreground/85">
                        {packWhy("trial", lang, offer.trial.days)}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Pressable>
                </motion.div>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2.5">
          {buyable ? (
            <>
              <Pressable feedback="tap" to="/plan" onClick={onClose}
                className="flex w-full items-center justify-center rounded-full border border-input px-5 py-3.5 text-[14px] font-bold text-foreground">
                {t(L.seeAll, lang)}
              </Pressable>
              <Pressable feedback="tap" onClick={onClose}
                className="flex w-full items-center justify-center rounded-full px-5 py-2.5 text-[13px] font-semibold text-muted-foreground">
                {t(L.notNow, lang)}
              </Pressable>
            </>
          ) : (
            <Pressable feedback="medium" onClick={onClose}
              className="flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25">
              {t(L.gotIt, lang)}
            </Pressable>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/** Mount once, high in the tree. Opens on every `va-quota`, every time. */
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
