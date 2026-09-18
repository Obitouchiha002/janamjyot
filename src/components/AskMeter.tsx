/**
 * "What will this message cost me?" — answered before it is sent.
 *
 * A chat that silently spends money is the fastest way to lose someone's
 * trust, and until now nothing in the app told you that a question had a price
 * at all: the free allowance ran out and the next tap produced an error. This
 * says, in one line above the composer, which of the three states you are in —
 * still free, paying per question, or out of both — and it moves the moment a
 * question is answered.
 *
 * Everything shown comes from the server. Nothing here decides what anything
 * costs; the charge is authorised and settled server-side, and this only
 * reports it.
 */
import { useEffect, useState } from "react";
import { Coins, Sparkles } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { getUiLang } from "@/lib/prefs";

type Lang = "en" | "hi" | "hinglish";
type Tri = { en: string; hi: string; hinglish: string };
const t = (x: Tri, l: Lang) => x[l] ?? x.en;

const L = {
  freeLeft: {
    en: "free question", hi: "मुफ़्त सवाल", hinglish: "free sawaal",
  },
  freeLeftPlural: {
    en: "free questions", hi: "मुफ़्त सवाल", hinglish: "free sawaal",
  },
  thisWeek: { en: "left this week", hi: "इस हफ़्ते बचे", hinglish: "iss hafte bache" },
  thisMonth: { en: "left this month", hi: "इस महीने बचे", hinglish: "iss mahine bache" },
  today: { en: "left today", hi: "आज बचे", hinglish: "aaj bache" },
  perQuestion: {
    en: "1 credit per question",
    hi: "हर सवाल पर 1 क्रेडिट",
    hinglish: "har sawaal par 1 credit",
  },
  balance: { en: "left", hi: "बचे", hinglish: "bache" },
  outOfCredits: {
    en: "Free questions are over and your balance is empty.",
    hi: "मुफ़्त सवाल खत्म और बैलेंस खाली है।",
    hinglish: "Free sawaal khatam aur balance khali hai.",
  },
  addCredits: { en: "Add credits", hi: "क्रेडिट लें", hinglish: "Credits lein" },
} satisfies Record<string, Tri>;

interface State {
  freeLeft: number;
  window: "day" | "week" | "month" | "total";
  balance: number;
  price: number;
}

export default function AskMeter() {
  const lang = getUiLang() as Lang;
  const [s, setS] = useState<State | null>(null);

  useEffect(() => {
    let alive = true;
    const read = () =>
      Promise.all([
        fetch("/api/me/usage").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/credits").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]).then(([u, c]) => {
        if (!alive || !u?.usage?.ask) return;
        const ask = u.usage.ask;
        setS({
          // -1 means unlimited, and there is nothing useful to say about that.
          freeLeft: ask.limit < 0 ? -1 : Math.max(0, ask.limit - ask.used),
          window: ask.window ?? "week",
          balance: c?.balance ?? 0,
          price: c?.prices?.chat ?? 1,
        });
      });
    read();
    // Fired by the fetch interceptor after any metered call succeeds.
    window.addEventListener("jj:credits", read);
    return () => { alive = false; window.removeEventListener("jj:credits", read); };
  }, []);

  if (!s || s.freeLeft === -1) return null;

  const resetWord =
    s.window === "month" ? t(L.thisMonth, lang)
    : s.window === "week" ? t(L.thisWeek, lang)
    : t(L.today, lang);

  // Still inside the free allowance — say how much is left, and nothing about money.
  if (s.freeLeft > 0) {
    return (
      <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11.5px] text-muted-foreground">
        <Sparkles className="h-[13px] w-[13px] text-accent" />
        <span>
          <b className="text-foreground">{s.freeLeft}</b>{" "}
          {t(s.freeLeft === 1 ? L.freeLeft : L.freeLeftPlural, lang)} {resetWord}
        </span>
      </div>
    );
  }

  // Free is gone but credits can cover it — show the price and what is left.
  if (s.balance >= s.price) {
    return (
      <div className="flex items-center gap-1.5 px-1 pb-1.5 text-[11.5px] text-muted-foreground">
        <Coins className="h-[13px] w-[13px] text-accent" />
        <span>
          {t(L.perQuestion, lang)} · <b className="text-foreground">{s.balance}</b> {t(L.balance, lang)}
        </span>
      </div>
    );
  }

  // Neither — say so here rather than letting the send button fail.
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2 rounded-xl bg-accent/10 px-3 py-2">
      <span className="text-[11.5px] leading-snug text-muted-foreground">{t(L.outOfCredits, lang)}</span>
      <Pressable
        to="/plan"
        feedback="medium"
        className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[11.5px] font-bold text-accent-foreground"
      >
        {t(L.addCredits, lang)}
      </Pressable>
    </div>
  );
}
