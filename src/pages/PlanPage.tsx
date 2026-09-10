/**
 * My Plan — what this account actually has right now.
 *
 * Three separate things decide what a person can do, and until this screen
 * existed none of them were visible inside the app:
 *   1. the plan (free / pro / unlimited) and the quota it grants,
 *   2. the ₹1 trial, which unlocks everything for a few days and then ends,
 *   3. the credit balance, which is spent per action and never expires.
 * Someone who has paid must be able to see what they bought, what is left,
 * and exactly when the trial runs out — so all three are shown together with
 * real numbers, not a badge.
 *
 * Buying happens on /checkout.html (the web page, so Razorpay's flow is the
 * same everywhere). In the APK that opens in a system browser; the email is
 * carried over as a prefill, never the token.
 */
import { useEffect, useState } from "react";
import {
  Sparkles, Clock, Coins, ReceiptText, RefreshCw, ChevronRight, ShieldCheck,
} from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import ReferCard from "@/components/ReferCard";
import { useAuth } from "@/auth";
import { getLang } from "@/lib/prefs";
import { API_BASE } from "@/lib/api";
import { isNative } from "@/lib/native";

type Lang = "en" | "hi" | "hinglish";
type Tri = { en: string; hi: string; hinglish: string };
const t = (x: Tri, l: Lang) => x[l] ?? x.en;

interface Credits {
  balance: number;
  trial: { active: boolean; used: boolean; ends_at: string | null; rupees: number; days: number };
  prices: Record<string, number>;
  packs: Array<{ id: string; label: string; credits: number; rupees: number }>;
}
interface Usage {
  plan: string;
  usage: Record<string, { used: number; limit: number; window: string }>;
}
interface Payment {
  order_id: string; payment_id: string | null; pack_id: string;
  amount_paise: number; credits: number; status: string; created_at: string;
}

const L = {
  plan: { en: "Your plan", hi: "आपका प्लान", hinglish: "Aapka plan" },
  free: { en: "Free", hi: "फ्री", hinglish: "Free" },
  pro: { en: "Pro", hi: "प्रो", hinglish: "Pro" },
  unlimited: { en: "Unlimited", hi: "अनलिमिटेड", hinglish: "Unlimited" },
  trialOn: { en: "Full access is on", hi: "फुल एक्सेस चालू है", hinglish: "Full access chalu hai" },
  endsOn: { en: "Ends on", hi: "खत्म होगा", hinglish: "Khatam hoga" },
  noRenew: {
    en: "It ends on its own. Nothing renews and no card is saved.",
    hi: "यह अपने आप खत्म हो जाएगा। कुछ भी अपने आप रिन्यू नहीं होगा और कार्ड सेव नहीं है।",
    hinglish: "Ye apne aap khatam ho jayega. Kuch bhi auto-renew nahi hoga, card bhi save nahi hai.",
  },
  trialOver: { en: "Your trial has ended", hi: "आपका ट्रायल खत्म हो चुका है", hinglish: "Aapka trial khatam ho chuka hai" },
  trialOverOn: { en: "It ended on", hi: "यह खत्म हुआ", hinglish: "Ye khatam hua" },
  left: { en: "left", hi: "बचा है", hinglish: "bacha hai" },
  days: { en: "days", hi: "दिन", hinglish: "din" },
  hours: { en: "hours", hi: "घंटे", hinglish: "ghante" },
  minutes: { en: "minutes", hi: "मिनट", hinglish: "minute" },
  credits: { en: "Credits", hi: "क्रेडिट", hinglish: "Credits" },
  neverExpire: { en: "Credits never expire.", hi: "क्रेडिट कभी एक्सपायर नहीं होते।", hinglish: "Credits kabhi expire nahi hote." },
  buys: { en: "What your balance buys", hi: "आपके बैलेंस से क्या मिलेगा", hinglish: "Aapke balance se kya milega" },
  noCredits: {
    en: "You have no credits yet. Add some to ask questions and pull full reports.",
    hi: "अभी आपके पास क्रेडिट नहीं हैं। सवाल पूछने और पूरी रिपोर्ट के लिए क्रेडिट लें।",
    hinglish: "Abhi aapke paas credits nahi hain. Sawal poochne aur poori report ke liye credits lijiye.",
  },
  usedToday: { en: "Used in this plan", hi: "इस प्लान में इस्तेमाल", hinglish: "Iss plan me istemaal" },
  buy: { en: "Add credits", hi: "क्रेडिट लें", hinglish: "Credits lein" },
  renew: { en: "Add more credits", hi: "और क्रेडिट लें", hinglish: "Aur credits lein" },
  startTrial: { en: "Start full access", hi: "फुल एक्सेस शुरू करें", hinglish: "Full access shuru karein" },
  history: { en: "Your purchases", hi: "आपकी खरीद", hinglish: "Aapki kharid" },
  noHistory: { en: "No purchases yet.", hi: "अभी कोई खरीद नहीं।", hinglish: "Abhi koi kharid nahi." },
  signIn: {
    en: "Sign in to see your plan, credits and purchases.",
    hi: "अपना प्लान, क्रेडिट और खरीद देखने के लिए साइन इन करें।",
    hinglish: "Apna plan, credits aur kharid dekhne ke liye sign in karein.",
  },
  signInBtn: { en: "Sign in", hi: "साइन इन करें", hinglish: "Sign in karein" },
  safe: {
    en: "Payments are handled by Razorpay. We never see or store your card.",
    hi: "पेमेंट Razorpay से होता है। आपका कार्ड हम न देखते हैं न सेव करते हैं।",
    hinglish: "Payment Razorpay se hota hai. Aapka card hum na dekhte hain na save karte hain.",
  },
  refresh: { en: "Refresh", hi: "रिफ्रेश", hinglish: "Refresh" },
  perDay: { en: "per day", hi: "प्रति दिन", hinglish: "roz" },
  perMonth: { en: "per month", hi: "प्रति महीना", hinglish: "mahine me" },
  lifetime: { en: "in total", hi: "कुल", hinglish: "total" },
  unlimitedWord: { en: "Unlimited", hi: "अनलिमिटेड", hinglish: "Unlimited" },
  failed: { en: "Could not load your plan. Pull to refresh.", hi: "प्लान लोड नहीं हो सका।", hinglish: "Plan load nahi ho paya." },
  missing: { en: "Paid but nothing showed up?", hi: "पैसे कट गए पर कुछ नहीं मिला?", hinglish: "Paise kat gaye par kuch nahi mila?" },
  checking: { en: "Checking with the bank…", hi: "बैंक से जाँच रहे हैं…", hinglish: "Bank se check kar rahe hain…" },
  foundIt: { en: "Found it — your account is updated.", hi: "मिल गया — आपका अकाउंट अपडेट हो गया।", hinglish: "Mil gaya — aapka account update ho gaya." },
  nothingPending: {
    en: "No unfinished payment found. If money left your account, write to support with the time you paid.",
    hi: "कोई अधूरा पेमेंट नहीं मिला। अगर पैसे कटे हैं तो सपोर्ट को समय बताकर लिखें।",
    hinglish: "Koi adhura payment nahi mila. Agar paise kate hain to support ko time bataakar likhiye.",
  },
} satisfies Record<string, Tri>;

const ACTION_LABEL: Record<string, Tri> = {
  chart: { en: "Kundlis", hi: "कुंडली", hinglish: "Kundli" },
  report: { en: "Life reports", hi: "लाइफ रिपोर्ट", hinglish: "Life report" },
  ask: { en: "Questions", hi: "सवाल", hinglish: "Sawal" },
  match: { en: "Matchings", hi: "मिलान", hinglish: "Matching" },
};

const SPEND_LABEL: Array<[string, Tri]> = [
  ["chat", { en: "questions", hi: "सवाल", hinglish: "sawal" }],
  ["report", { en: "focused reports", hi: "फोकस्ड रिपोर्ट", hinglish: "focused report" }],
  ["matching", { en: "kundli matchings", hi: "कुंडली मिलान", hinglish: "kundli matching" }],
  ["life_report", { en: "full life reports", hi: "पूरी लाइफ रिपोर्ट", hinglish: "poori life report" }],
];

function fmtDate(iso: string, l: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(l === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

/** "2 days 4 hours" — the exact remaining time, not a rounded "expiring soon". */
function timeLeft(iso: string, l: Lang): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d > 0) return `${d} ${t(L.days, l)} ${h} ${t(L.hours, l)}`;
  if (h > 0) return `${h} ${t(L.hours, l)} ${m} ${t(L.minutes, l)}`;
  return `${m} ${t(L.minutes, l)}`;
}

/**
 * Open the checkout, carrying the signed-in session across.
 *
 * The app is a WebView with its own storage; the browser it opens has none. So
 * buying from inside the app used to mean signing in again by emailed code at
 * the payment step — which is both the worst possible moment to add friction
 * and exactly what people are taught to treat as a scam.
 *
 * The handoff is fetched first and expires in five minutes; if it cannot be
 * had, checkout still opens and asks for the code as before. A failure to
 * smooth the path must never become a failure to buy.
 */
async function openCheckout(pack: string, email?: string) {
  const q = new URLSearchParams({ pack });
  if (email) q.set("email", email);
  try {
    const r = await fetch("/api/billing/handoff", { method: "POST" });
    if (r.ok) {
      const d = await r.json();
      if (d?.token) q.set("ct", d.token);
    }
  } catch { /* open without it — they can still sign in */ }

  const url = `${API_BASE}/checkout.html?${q.toString()}`;
  if (isNative) {
    import("@capacitor/browser")
      .then(({ Browser }) => Browser.open({ url }))
      .catch(() => window.open(url, "_blank"));
  } else {
    window.location.href = url;
  }
}

function Card({ children }: { children: React.ReactNode }) {
  return <section className="m-card p-4">{children}</section>;
}

function Heading({ icon: Icon, tint, children }: { icon: any; tint: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: `${tint}22`, color: tint }}>
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <h3 className="text-[14px] font-bold">{children}</h3>
    </div>
  );
}

export default function PlanPage() {
  const { user } = useAuth();
  const lang = getLang() as Lang;
  const [credits, setCredits] = useState<Credits | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [verify, setVerify] = useState<"idle" | "busy" | "found" | "none">("idle");
  const [failed, setFailed] = useState(false);
  // Re-renders once a minute so the trial countdown is honest while the screen
  // is open, instead of freezing at whatever it said when the page loaded.
  const [, tick] = useState(0);

  const load = () => {
    setFailed(false);
    Promise.all([
      fetch("/api/credits").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/me/usage").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/billing/history").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([c, u, h]) => {
        if (!c && !u) setFailed(true);
        if (c && !c.error) setCredits(c);
        if (u && !u.error) setUsage(u);
        if (h && !h.error) setPayments(h.payments ?? []);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  };

  /* A webhook can be delayed or dropped, and then someone is left holding a
     debit with nothing to show for it. This asks the server to check the
     payment with Razorpay directly and settle it — the same path the checkout
     page takes when its own polling runs out. */
  const checkMissing = () => {
    setVerify("busy");
    fetch("/api/billing/verify", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => {
        if (v && (v.recovered > 0 || v.trial_active || (v.balance ?? 0) > (credits?.balance ?? 0))) {
          setVerify("found");
          load();
        } else setVerify("none");
      })
      .catch(() => setVerify("none"));
  };

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    load();
    const id = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(id);
  }, [user?.id]);

  if (!user) {
    return (
      <div className="space-y-3 pt-2">
        <Card>
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">{t(L.signIn, lang)}</p>
          <Pressable to="/login" feedback="medium"
                     className="mt-3.5 block w-full rounded-xl bg-primary py-3 text-center text-[14px] font-bold text-primary-foreground">
            {t(L.signInBtn, lang)}
          </Pressable>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3 pt-2">
        <div className="skeleton h-[130px]" />
        <div className="skeleton h-[160px]" />
        <div className="skeleton h-[120px]" />
      </div>
    );
  }

  if (failed) {
    return (
      <div className="space-y-3 pt-2">
        <Card>
          <p className="text-[13.5px] text-muted-foreground">{t(L.failed, lang)}</p>
          <Pressable onClick={load} feedback="medium"
                     className="mt-3.5 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-3 text-[14px] font-bold">
            <RefreshCw className="h-4 w-4" /> {t(L.refresh, lang)}
          </Pressable>
        </Card>
      </div>
    );
  }

  const plan = usage?.plan ?? "free";
  const planName = plan === "unlimited" ? t(L.unlimited, lang) : plan === "pro" ? t(L.pro, lang) : t(L.free, lang);
  const trial = credits?.trial;
  const trialActive = !!trial?.active && !!trial.ends_at;
  const balance = credits?.balance ?? 0;
  const popular = credits?.packs?.find((p) => p.id === "popular") ?? credits?.packs?.[0];

  return (
    <div className="space-y-3 pb-8 pt-2">
      {/* ── What is active right now ───────────────────────────────── */}
      <Card>
        <Heading icon={trialActive ? Sparkles : ShieldCheck} tint={trialActive ? "#E8B44A" : "#7DD3C0"}>
          {t(L.plan, lang)}
        </Heading>

        {trialActive ? (
          <>
            <p className="text-[19px] font-black leading-tight">{t(L.trialOn, lang)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[13.5px] font-bold" style={{ color: "#E8B44A" }}>
              <Clock className="h-4 w-4" />
              {timeLeft(trial!.ends_at!, lang)} {t(L.left, lang)}
            </p>
            <p className="mt-2 text-[12.5px] text-muted-foreground">
              {t(L.endsOn, lang)}: <b className="text-foreground">{fmtDate(trial!.ends_at!, lang)}</b>
            </p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t(L.noRenew, lang)}</p>
          </>
        ) : (
          <>
            <p className="text-[19px] font-black leading-tight">{planName}</p>
            {trial?.used && trial.ends_at && (
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                {t(L.trialOver, lang)} — {t(L.trialOverOn, lang)} <b className="text-foreground">{fmtDate(trial.ends_at, lang)}</b>
              </p>
            )}
          </>
        )}

        {/* The quota this plan actually grants, with what is already spent. */}
        {usage?.usage && plan !== "unlimited" && (
          <div className="mt-3.5 border-t border-border pt-3">
            <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
              {t(L.usedToday, lang)}
            </p>
            <ul className="space-y-1.5">
              {Object.entries(usage.usage).map(([k, v]) => {
                const win = v.window === "day" ? t(L.perDay, lang) : v.window === "month" ? t(L.perMonth, lang) : t(L.lifetime, lang);
                return (
                  <li key={k} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-muted-foreground">{t(ACTION_LABEL[k] ?? { en: k, hi: k, hinglish: k }, lang)}</span>
                    <span className="font-bold tabular-nums">
                      {v.limit < 0 ? t(L.unlimitedWord, lang) : `${v.used} / ${v.limit}`}
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">{v.limit < 0 ? "" : win}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      {/* ── Credits ────────────────────────────────────────────────── */}
      <Card>
        <Heading icon={Coins} tint="#C07A1E">{t(L.credits, lang)}</Heading>
        <p className="text-[30px] font-black leading-none tabular-nums">{balance}</p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{t(L.neverExpire, lang)}</p>

        {balance > 0 && credits?.prices ? (
          <div className="mt-3.5 border-t border-border pt-3">
            <p className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-muted-foreground">
              {t(L.buys, lang)}
            </p>
            <ul className="space-y-1.5">
              {SPEND_LABEL.map(([key, label]) => {
                const price = credits.prices[key];
                if (!price) return null;
                const n = Math.floor(balance / price);
                if (n < 1) return null;
                return (
                  <li key={key} className="flex items-baseline justify-between gap-3 text-[13px]">
                    <span className="text-muted-foreground">{t(label, lang)}</span>
                    <span className="font-bold tabular-nums">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">{t(L.noCredits, lang)}</p>
        )}

        <Pressable
          onClick={() => openCheckout(popular?.id ?? "popular", user.email)}
          feedback="medium"
          className="mt-3.5 block w-full rounded-xl bg-primary py-3 text-center text-[14px] font-bold text-primary-foreground"
        >
          {balance > 0 ? t(L.renew, lang) : t(L.buy, lang)}
          {popular ? ` — ₹${popular.rupees} / ${popular.credits}` : ""}
        </Pressable>

        {/* The ₹1 trial is offered only to accounts that never used it. */}
        {trial && !trial.used && (
          <Pressable
            onClick={() => openCheckout("trial", user.email)}
            className="mt-2 block w-full rounded-xl border border-border py-3 text-center text-[14px] font-bold"
          >
            {t(L.startTrial, lang)} — ₹{trial.rupees} / {trial.days} {t(L.days, lang)}
          </Pressable>
        )}

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">{t(L.safe, lang)}</p>
      </Card>

      {/* Free credits, before asking anyone to pay for them. */}
      <ReferCard canApply onChanged={load} />

      {/* ── Receipts ───────────────────────────────────────────────── */}
      <Card>
        <Heading icon={ReceiptText} tint="#60A5FA">{t(L.history, lang)}</Heading>
        {payments && payments.length > 0 ? (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.order_id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-bold">
                    ₹{(p.amount_paise / 100).toFixed(0)}
                    {p.credits ? ` · ${p.credits} ${t(L.credits, lang).toLowerCase()}` : ""}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                    {fmtDate(p.created_at, lang)}
                  </span>
                </span>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold"
                  style={
                    p.status === "paid"
                      ? { background: "#34D39922", color: "#34D399" }
                      : { background: "#8A8AA322", color: "#8A8AA3" }
                  }
                >
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted-foreground">{t(L.noHistory, lang)}</p>
        )}
      </Card>

      {/* Recovery, kept quiet and last: most people never need it, and the
          person who does needs it to be obviously there. */}
      <Card>
        <p className="text-[13.5px] font-bold">{t(L.missing, lang)}</p>
        {verify === "found" ? (
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "#34D399" }}>{t(L.foundIt, lang)}</p>
        ) : verify === "none" ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{t(L.nothingPending, lang)}</p>
        ) : (
          <Pressable
            onClick={checkMissing}
            disabled={verify === "busy"}
            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-[13.5px] font-bold"
          >
            <RefreshCw className={`h-4 w-4 ${verify === "busy" ? "animate-spin" : ""}`} />
            {verify === "busy" ? t(L.checking, lang) : t(L.missing, lang)}
          </Pressable>
        )}
      </Card>

      <Pressable
        onClick={load}
        className="flex w-full items-center justify-center gap-2 py-2 text-[13px] font-bold text-muted-foreground"
      >
        <RefreshCw className="h-4 w-4" /> {t(L.refresh, lang)}
        <ChevronRight className="hidden" />
      </Pressable>
    </div>
  );
}
