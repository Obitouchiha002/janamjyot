/**
 * Refer & earn.
 *
 * Both sides are paid in credits rather than cash, so the whole thing settles
 * inside our own ledger and every movement is auditable.
 *
 * The reward for sharing is deliberately not paid the moment someone signs up:
 * anyone can invent an email address, and paying on a bare signup would let one
 * person mint credits from accounts that do not exist. It lands once the
 * invited account proves it holds its inbox — an emailed code or a Google
 * sign-in. That waiting state is shown here rather than hidden, because a
 * reward that silently does not arrive is worse than one that is explained.
 */
import { useEffect, useState } from "react";
import { Gift, Copy, Check, Share2 } from "lucide-react";
import { Pressable } from "@/components/mobile/Pressable";
import { shareText, haptic } from "@/lib/native";
import { getLang } from "@/lib/prefs";

type Lang = "en" | "hi" | "hinglish";
type Tri = { en: string; hi: string; hinglish: string };
const t = (x: Tri, l: Lang) => x[l] ?? x.en;

const L = {
  title: { en: "Refer & earn", hi: "रेफर करें, कमाएँ", hinglish: "Refer karo, kamao" },
  how: {
    en: "Share your code. When a friend signs up with it they get {i} credits, and you get {r} once they verify their email.",
    hi: "अपना कोड शेयर करें। दोस्त इससे जुड़ेगा तो उसे {i} क्रेडिट मिलेंगे, और ईमेल वेरिफ़ाई होते ही आपको {r}।",
    hinglish: "Apna code share karo. Dost usse judega to usko {i} credits milenge, aur uska email verify hote hi aapko {r}.",
  },
  yourCode: { en: "Your code", hi: "आपका कोड", hinglish: "Aapka code" },
  copied: { en: "Copied", hi: "कॉपी हो गया", hinglish: "Copy ho gaya" },
  share: { en: "Share", hi: "शेयर करें", hinglish: "Share karo" },
  joined: { en: "Joined", hi: "जुड़े", hinglish: "Jude" },
  earned: { en: "Earned", hi: "कमाए", hinglish: "Kamaye" },
  waiting: { en: "Waiting to verify", hi: "वेरिफ़ाई होना बाकी", hinglish: "Verify hona baaki" },
  waitingWhy: {
    en: "They joined but have not signed in with an emailed code yet, so your credits are still pending.",
    hi: "वे जुड़ गए हैं पर अभी ईमेल कोड से साइन इन नहीं किया, इसलिए आपके क्रेडिट रुके हैं।",
    hinglish: "Wo jud gaye hain par abhi email code se sign in nahi kiya, isliye aapke credits ruke hain.",
  },
  haveCode: { en: "Got a code from a friend?", hi: "दोस्त से कोड मिला है?", hinglish: "Dost se code mila hai?" },
  apply: { en: "Apply", hi: "लगाएँ", hinglish: "Lagao" },
  applied: { en: "Applied — credits added.", hi: "लग गया — क्रेडिट जुड़ गए।", hinglish: "Lag gaya — credits jud gaye." },
  msg: {
    en: "I use JanamJyot for my daily Vedic astrology. Use my code {c} when you sign up and you get {i} free credits:",
    hi: "मैं रोज़ की ज्योतिष के लिए JanamJyot इस्तेमाल करता हूँ। साइन अप करते समय मेरा कोड {c} लगाओ, {i} मुफ़्त क्रेडिट मिलेंगे:",
    hinglish: "Main roz ki jyotish ke liye JanamJyot use karta hoon. Sign up karte waqt mera code {c} lagao, {i} free credits milenge:",
  },
} satisfies Record<string, Tri>;

interface Ref {
  code: string; link: string;
  joined: number; pending: number; earned: number;
  reward: number; invitee_reward: number;
}

export default function ReferCard({ canApply, onChanged }: { canApply: boolean; onChanged?: () => void }) {
  const lang = getLang() as Lang;
  const [r, setR] = useState<Ref | null>(null);
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/referral")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d && d.code) setR(d); })
      .catch(() => {});

  useEffect(() => { load(); }, []);

  if (!r) return null;

  const line = t(L.how, lang)
    .replace("{i}", String(r.invitee_reward))
    .replace("{r}", String(r.reward));

  const copy = () => {
    haptic.tap();
    navigator.clipboard?.writeText(r.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = () =>
    shareText(
      "JanamJyot",
      t(L.msg, lang).replace("{c}", r.code).replace("{i}", String(r.invitee_reward)),
      r.link,
    );

  const applyCode = () => {
    if (!code.trim() || busy) return;
    setBusy(true); setMsg("");
    fetch("/api/referral/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    })
      .then((res) => res.json().then((d) => ({ ok: res.ok, d })))
      .then(({ ok, d }) => {
        setMsg(ok ? t(L.applied, lang) : d.error || "That code did not work.");
        if (ok) { setCode(""); load(); onChanged?.(); }
      })
      .catch(() => setMsg("Could not apply that code."))
      .finally(() => setBusy(false));
  };

  return (
    <section className="m-card p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
              style={{ background: "#34D39922", color: "#34D399" }}>
          <Gift className="h-[17px] w-[17px]" />
        </span>
        <h3 className="text-[14px] font-bold">{t(L.title, lang)}</h3>
      </div>

      <p className="text-[12.5px] leading-relaxed text-muted-foreground">{line}</p>

      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded-xl border border-dashed border-border bg-muted/60 px-3 py-2.5 text-center text-[17px] font-black tracking-[0.14em]">
          {r.code}
        </code>
        <Pressable onClick={copy} aria-label="Copy code"
                   className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border">
          {copied ? <Check className="h-[18px] w-[18px]" style={{ color: "#34D399" }} />
                  : <Copy className="h-[18px] w-[18px]" />}
        </Pressable>
      </div>

      <Pressable onClick={share} feedback="medium"
                 className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[14px] font-bold text-primary-foreground">
        <Share2 className="h-4 w-4" /> {t(L.share, lang)}
      </Pressable>

      <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-border pt-3">
        {([
          [t(L.joined, lang), r.joined],
          [t(L.earned, lang), `${r.earned}`],
          [t(L.waiting, lang), r.pending],
        ] as const).map(([k, v]) => (
          <div key={k} className="text-center">
            <p className="text-[17px] font-black leading-none tabular-nums">{v}</p>
            <p className="mt-1 text-[10.5px] leading-tight text-muted-foreground">{k}</p>
          </div>
        ))}
      </div>

      {r.pending > 0 && (
        <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted-foreground">{t(L.waitingWhy, lang)}</p>
      )}

      {canApply && (
        <div className="mt-3.5 border-t border-border pt-3">
          <p className="mb-2 text-[12.5px] font-bold">{t(L.haveCode, lang)}</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="JJXXXXXX"
              className="min-w-0 flex-1 rounded-xl border border-input bg-card px-3 py-2.5 text-[14px] uppercase tracking-wider outline-none focus:border-accent"
            />
            <Pressable onClick={applyCode} disabled={busy} feedback="medium"
                       className="shrink-0 rounded-xl border border-border px-4 py-2.5 text-[13.5px] font-bold">
              {t(L.apply, lang)}
            </Pressable>
          </div>
          {msg && <p className="mt-2 text-[12px] text-muted-foreground">{msg}</p>}
        </div>
      )}
    </section>
  );
}
