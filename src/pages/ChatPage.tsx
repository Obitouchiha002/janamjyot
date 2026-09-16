import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Send, ChevronDown, ShieldCheck, Plus, RotateCw, Mic, Square, ChevronRight, HeartHandshake } from "lucide-react";
import AskMeter from "@/components/AskMeter";
import ChatAction from "@/components/ChatAction";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import RelationSheet, { relationLabel, type Relation } from "@/components/RelationSheet";
import { getLang } from "@/lib/prefs";
import { haptic } from "@/lib/native";
import { voiceAvailable, startVoice, stopVoice, type VoiceLang } from "@/lib/voice";
import { openCheckout, packWhy, PACK_NAME, type Lang } from "@/lib/checkout";
import { scheduleFollowUp } from "@/lib/notifications";
import { useAuth } from "@/auth";

const LANGS = [
  { key: "en", label: "EN" },
  { key: "hinglish", label: "Hinglish" },
  { key: "hi", label: "हिंदी" },
] as const;

/**
 * The ONE chat — and the centre of the app.
 *
 * Ask about your chart, today/tomorrow, the person in your life, or the app
 * itself, and you get ONE clear answer; the astrology behind it sits under
 * "Reason". Everything else feeds into this screen: Home sends its question
 * here, the morning and night notifications open it on the day, and a
 * question about your life is asked after the next evening.
 * Backed by /api/chat/universal.
 */

type Turn = {
  role: "user" | "assistant";
  answer: string;
  reason?: string;
  error?: boolean;
  /** Follow-ups the model suggested, in the user's own voice. */
  next?: string[];
  /** A task the person asked for, carried out inside the thread. */
  action?: string;
  /** Something to draw with the message — "chart" is their four key numbers. */
  card?: string;
  /** The question to re-send when an answer failed. */
  retry?: string;
  /** Free questions ran out mid-conversation: the price, answered in place. */
  paywall?: { price: number; balance: number };
};

const REASON_MARK = "\n<<REASON>>\n";

/**
 * The thread as last seen, per kundli, for this session. Coming back to the
 * chat sat on a blank "•••" while the history refetched; now it shows at once
 * and refreshes underneath. Memory only — chat is never written to storage.
 */
const historyCache = new Map<string, Turn[]>();

/** Split a stored/received assistant message into its answer and hidden reason. */
function splitReason(raw: string): { answer: string; reason?: string } {
  const i = raw.indexOf(REASON_MARK);
  if (i === -1) return { answer: raw.trim() };
  const reason = raw.slice(i + REASON_MARK.length).trim();
  return { answer: raw.slice(0, i).trim(), reason: reason || undefined };
}

// Greeting + starter questions follow the SELECTED language, so an English
// user doesn't see a Hinglish welcome (that mismatch read as sloppy).
const GREETING: Record<string, { hi: string; sub: string; starters: string[] }> = {
  en: {
    hi: "Namaste 🙏",
    sub: "Ask me anything — how today or tomorrow looks, your career, relationships, or how the app works. I'll read your chart and answer in plain words.",
    starters: ["How will my day go today?", "When will my career settle?", "How will money be this year?"],
  },
  hinglish: {
    hi: "Namaste 🙏",
    sub: "Kuch bhi poochho — aaj/kal ka din, career, rishte, ya app kaise chalta hai. Main aapki kundli padh ke seedha jawab dunga.",
    starters: ["Aaj mera din kaisa rahega?", "Meri job/career kab set hogi?", "Is saal paisa kaisa rahega?"],
  },
  hi: {
    hi: "नमस्ते 🙏",
    sub: "कुछ भी पूछें — आज/कल का दिन, करियर, रिश्ते, या ऐप कैसे चलता है। मैं आपकी कुंडली पढ़कर सीधा जवाब दूँगा।",
    starters: ["आज मेरा दिन कैसा रहेगा?", "मेरी नौकरी कब सेट होगी?", "इस साल पैसा कैसा रहेगा?"],
  },
};

const READ: Record<string, string> = {
  en: "I've read your kundli. Ask me whatever is on your mind.",
  hinglish: "Maine aapki kundli padh li hai. Ab jo mann me ho poochiye.",
  hi: "मैंने आपकी कुंडली पढ़ ली है। अब जो मन में हो पूछिए।",
};

type Tri = { en: string; hi: string; hinglish: string };
const tr = (x: Tri, l: string) => (x as any)[l] ?? x.en;

/** Topics worth asking after the next evening. */
const TOPICAL = new Set(["career", "wealth", "health", "marriage", "relationship", "business", "foreign", "education"]);

/** What to offer when they arrive from the morning or night notification. */
const DAY_CHIPS: Record<"today" | "night", Record<string, string[]>> = {
  today: {
    en: ["What's the best thing to do today?", "What should I avoid today?", "Which time is best today?"],
    hinglish: ["Aaj kya karna sabse accha rahega?", "Aaj kis cheez se bachna chahiye?", "Aaj ka sabse accha samay kaunsa hai?"],
    hi: ["आज क्या करना सबसे अच्छा रहेगा?", "आज किस चीज़ से बचना चाहिए?", "आज का सबसे अच्छा समय कौन सा है?"],
  },
  night: {
    en: ["How will tomorrow be?", "What did today mean for me?"],
    hinglish: ["Kal ka din kaisa rahega?", "Aaj jo hua uska mere liye kya matlab tha?"],
    hi: ["कल का दिन कैसा रहेगा?", "आज जो हुआ उसका मेरे लिए क्या मतलब था?"],
  },
};
const NIGHT_LINE: Tri = {
  en: "The day is done 🌙 How did it go? Tell me anything — or ask how tomorrow looks.",
  hi: "दिन पूरा हुआ 🌙 कैसा गया? कुछ भी बताइए — या कल का हाल पूछिए।",
  hinglish: "Din poora hua 🌙 Kaisa gaya? Kuch bhi batao — ya kal ka haal poochho.",
};

/** The opening once a person is linked — questions only both charts can answer. */
function rishtaLead(r: Relation, lang: string): { text: string; chips: string[] } {
  const n = r.name || (lang === "en" ? "them" : "unke");
  const kind = relationLabel(r.relation, lang as Lang);
  const romantic = ["partner", "spouse", "crush"].includes(r.relation);
  if (lang === "en") {
    return {
      text: `${n}'s kundli is linked (${kind}). Ask about the two of you — I'll read both charts.`,
      chips: r.relation === "ex" ? [`Can things work out again with ${n}?`, `Why did it break with ${n}?`]
        : romantic ? [`How will my relationship with ${n} go ahead?`, `When is marriage indicated for ${n} and me?`, `Where do ${n} and I clash?`]
        : [`How is my bond with ${n}?`, `Where do ${n} and I clash?`],
    };
  }
  if (lang === "hi") {
    return {
      text: `${n} की कुंडली जुड़ी है (${kind})। आप दोनों के बारे में पूछिए — मैं दोनों कुंडलियाँ पढ़ूँगा।`,
      chips: r.relation === "ex" ? [`क्या ${n} के साथ बात फिर बन सकती है?`, `${n} के साथ रिश्ता क्यों टूटा?`]
        : romantic ? [`मेरा और ${n} का रिश्ता आगे कैसा रहेगा?`, `${n} और मेरी शादी का योग कब है?`, `हम दोनों में टकराव किस बात पर होता है?`]
        : [`${n} के साथ मेरा रिश्ता कैसा है?`, `${n} से किस बात पर टकराव होता है?`],
    };
  }
  return {
    text: `${n} ki kundli judi hai (${kind}). Aap dono ke baare mein poochiye — main dono kundliyan padhunga.`,
    chips: r.relation === "ex" ? [`Kya ${n} ke saath baat phir ban sakti hai?`, `${n} ke saath rishta kyun toota?`]
      : romantic ? [`Mera aur ${n} ka rishta aage kaisa rahega?`, `${n} aur meri shaadi ka yog kab hai?`, `Hum dono mein takraav kis baat pe hota hai?`]
      : [`${n} ke saath mera rishta kaisa hai?`, `${n} se kis baat pe takraav hota hai?`],
  };
}

/** The four numbers people recognise, from the chart we already fetched. */
function ChartGlance({ intro, lang }: { intro: any; lang: string }) {
  const K: Record<string, string[]> = {
    en: ["Lagna", "Moon sign", "Nakshatra", "Running dasha"],
    hinglish: ["Lagna", "Chandra rashi", "Nakshatra", "Chal rahi dasha"],
    hi: ["लग्न", "चंद्र राशि", "नक्षत्र", "चल रही दशा"],
  };
  const keys = K[lang] || K.en;
  const vals = [intro.lagna, intro.rashi, intro.nakshatra, intro.dasha];
  if (!vals.some(Boolean)) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
      {keys.map((k, i) => (
        <div key={k} className="bg-card px-3 py-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p>
          <p className="mt-0.5 truncate text-[13px] font-bold">{vals[i] || "—"}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Free questions ran out in the middle of a conversation.
 *
 * Answered here, in the thread, by the one they were talking to — not by a
 * sheet sliding over it. Their question waits in the box below, and every
 * pack is one tap from checkout. Nothing is held back as a cliffhanger: the
 * previous answer was complete, this is only the price of the next one.
 */
function Paywall({ price, balance, lang, email }: { price: number; balance: number; lang: string; email?: string }) {
  const [offer, setOffer] = useState<{ packs: any[]; trial: any } | null>(null);
  useEffect(() => {
    fetch("/api/credits")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && setOffer({ packs: c.packs ?? [], trial: c.trial ?? null }))
      .catch(() => {});
  }, []);
  const L = (lang === "hi" || lang === "hinglish" ? lang : "en") as Lang;
  const head: Tri = { en: "Let's not stop half-way.", hi: "इसे अधूरा नहीं छोड़ते।", hinglish: "Isse adhoora nahi chhodte." };
  const body: Tri = {
    en: `This week's free questions are used up. The next answer costs ${price} credit${price === 1 ? "" : "s"} — you have ${balance}.`,
    hi: `इस हफ़्ते के मुफ़्त सवाल खत्म हो गए। अगले जवाब के ${price} क्रेडिट लगेंगे — आपके पास ${balance} हैं।`,
    hinglish: `Is hafte ke free sawaal khatam ho gaye. Agle jawab ke ${price} credit lagenge — aapke paas ${balance} hain.`,
  };
  const after: Tri = {
    en: "Your question is waiting below — send it again once you're back.",
    hi: "आपका सवाल नीचे रखा है — लौटकर दोबारा भेज दीजिए।",
    hinglish: "Aapka sawaal neeche rakha hai — wapas aake dobara bhej dijiye.",
  };
  const trialLine: Tri = { en: "3 days, everything open", hi: "3 दिन सब कुछ खुला", hinglish: "3 din sab kuch khula" };
  const trialOpen = offer?.trial && !offer.trial.used && !offer.trial.active;
  const buy = (id: string) => { haptic.success(); openCheckout(id, email); };
  return (
    <div className="w-[86%] rounded-[20px] rounded-bl-md border border-accent/40 bg-accent/5 px-4 py-3 shadow-sm">
      <p className="text-[14.5px] font-bold">{tr(head, L)}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{tr(body, L)}</p>
      <div className="mt-3 space-y-1.5">
        {(offer?.packs ?? []).map((p: any) => (
          <button key={p.id} type="button" onClick={() => buy(p.id)}
            className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left ${p.id === "popular" ? "border-accent bg-accent/10" : "border-border bg-card"}`}>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold">{PACK_NAME[p.id] ?? p.id} · {p.credits} credits</span>
              <span className="block truncate text-[11.5px] text-muted-foreground">{packWhy(p.id, L)}</span>
            </span>
            <span className="shrink-0 text-[15px] font-black tabular-nums">₹{p.rupees}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        ))}
        {trialOpen && (
          <button type="button" onClick={() => buy("trial")}
            className="flex w-full items-center gap-2.5 rounded-xl border border-dashed border-emerald-500/60 bg-emerald-500/5 px-3 py-2.5 text-left">
            <span className="min-w-0 flex-1 text-[13px] font-bold">₹{offer!.trial.rupees} · {tr(trialLine, L)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}
        {!offer && <div className="skeleton h-12" />}
      </div>
      <p className="mt-2.5 text-[11.5px] text-muted-foreground">{tr(after, L)}</p>
    </div>
  );
}

export default function ChatPage() {
  const { chartId } = useParams();
  const [params, setParams] = useSearchParams();
  const email = useAuth()?.user?.email as string | undefined;
  const [intro, setIntro] = useState<any>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [openReason, setOpenReason] = useState<Record<number, boolean>>({});
  const [lang, setLang] = useState<string>(getLang());
  /** How much of the opening has "been typed" — 0 dots, 1 hello, 2 chart, 3 all. */
  const [greetStep, setGreetStep] = useState(0);
  /**
   * Whether the prior conversation has come back yet. Without this, `turns` is
   * empty for the moment the fetch is in flight, the opening decides it is a
   * new thread and greets — so every refresh replayed "Namaste Vansh ji" over a
   * conversation that was already there.
   */
  const [historyLoaded, setHistoryLoaded] = useState(false);
  /** A card the app opens with — the day, a follow-up, the linked person. Not stored. */
  const [lead, setLead] = useState<{ text: string; chips: string[] } | null>(null);
  const [rel, setRel] = useState<Relation | null>(null);
  const [relOpen, setRelOpen] = useState(false);
  const [relPre, setRelPre] = useState<string | undefined>();
  const [canVoice, setCanVoice] = useState(false);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const arrivalHandled = useRef(false);

  useEffect(() => {
    if (!chartId) return;
    fetch(`/api/chart/${chartId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!c) return;
        const s = c.summary ?? {};
        setIntro({
          name: String(c.birth_details?.name || "").split(" ")[0],
          lagna: s.lagna, rashi: s.rashi, nakshatra: s.nakshatra,
          dasha: [s.current_mahadasha, s.current_antardasha].filter(Boolean).join(" / "),
        });
      })
      .catch(() => {});
    fetch(`/api/chat/relation/${chartId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRel(d?.linked ? { chartId: d.chartId, relation: d.relation, name: d.name } : null))
      .catch(() => {});
  }, [chartId]);

  useEffect(() => { voiceAvailable().then(setCanVoice).catch(() => {}); }, []);
  useEffect(() => () => { stopVoice().catch(() => {}); }, []);

  /*
   * Let the opening arrive rather than appear.
   *
   * Paced like someone typing: a beat before the hello, longer before the
   * chart because reading a kundli takes a moment, shorter before the
   * invitation. Only for a genuinely new thread; someone returning to their
   * history has already met us and should not wait through an introduction.
   */
  useEffect(() => {
    if (!historyLoaded) return;
    if (turns.length > 0) { setGreetStep(3); return; }
    const t1 = setTimeout(() => setGreetStep(1), 700);
    const t2 = setTimeout(() => setGreetStep(2), 2100);
    const t3 = setTimeout(() => setGreetStep(3), 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [historyLoaded, turns.length]);

  // Each bubble pushes the view along, so the dots stay in sight while they run.
  useEffect(() => {
    if (greetStep > 0 && turns.length === 0) {
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
    }
  }, [greetStep, turns.length]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }));
  }, []);

  // Load prior conversation (same context the backend writes to).
  useEffect(() => {
    if (!chartId) return;
    let alive = true;
    const cached = historyCache.get(chartId);
    if (cached) { setTurns(cached); setHistoryLoaded(true); scrollToEnd(); }
    fetch(`/api/chat-history/${chartId}?context=chat`)
      .then((r) => r.json())
      .then((rows: Array<{ role: string; message: string; response_json?: any }>) => {
        if (!alive || !Array.isArray(rows)) return;
        setTurns(
          rows.map((m) => {
            if (m.role === "user") return { role: "user" as const, answer: m.message };
            // Restore what was drawn WITH the message, not only the words.
            const j = m.response_json ?? {};
            return {
              role: "assistant" as const,
              ...splitReason(m.message || ""),
              next: Array.isArray(j.next) && j.next.length ? j.next : undefined,
              action: j.action || undefined,
              card: j.card || undefined,
            };
          }),
        );
        scrollToEnd();
      })
      .catch(() => { /* start empty */ })
      .finally(() => { if (alive) setHistoryLoaded(true); });
    return () => { alive = false; };
  }, [chartId, scrollToEnd]);

  const send = async (raw: string) => {
    const q = raw.trim();
    // `busy` is the double-send guard: a second tap while one is in flight
    // would be a second question and a second credit.
    if (!q || busy || !chartId) return;
    haptic.tap();
    if (listening) { stopVoice().catch(() => {}); setListening(false); }
    setLead(null);
    setTurns((p) => [...p.filter((t) => !t.paywall), { role: "user", answer: q }]);
    setQuestion("");
    setBusy(true);
    setTyping(true);
    scrollToEnd();

    // A model call that stalls rather than fails used to leave the typing dots
    // running forever with `busy` stuck true — ninety seconds, then retry.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90_000);
    try {
      // `quota=inline`: a refusal is answered inside this conversation, so the
      // global limit sheet stays out of the way.
      const res = await fetch("/api/chat/universal?quota=inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, question: q, language: lang }),
        signal: ctl.signal,
      });
      const data = await res.json().catch(() => ({}));
      setTyping(false);

      if (res.status === 402) {
        setTurns((p) => [...p.slice(0, -1), {
          role: "assistant", answer: "",
          paywall: { price: Number(data.needs_credits) || 1, balance: Number(data.balance) || 0 },
        }]);
        setQuestion(q);
        haptic.warning();
        return;
      }
      if (res.ok && data.answer && data.answer.trim()) {
        setTurns((p) => [...p, {
          role: "assistant",
          answer: data.answer,
          reason: data.reason || undefined,
          // Two is right after a real answer; a greeting is a menu by nature.
          next: Array.isArray(data.next) ? data.next.slice(0, data.card ? 4 : 2) : undefined,
          action: data.action || undefined,
          card: data.card || undefined,
        }]);
        haptic.success();
        if (TOPICAL.has(data.category)) scheduleFollowUp({ chartId, topic: data.category, name: intro?.name }).catch(() => {});
      } else {
        setTurns((p) => [...p, { role: "assistant", answer: data.error || "Jawab nahi mil paya. Dobara koshish karein.", error: true, retry: q }]);
        haptic.error();
      }
    } catch (e: any) {
      setTyping(false);
      const timedOut = e?.name === "AbortError";
      setTurns((p) => [...p, {
        role: "assistant",
        answer: timedOut ? "Jawab aane mein bahut der lag gayi. Dobara bhejein." : "Network error. Dobara koshish karein.",
        error: true,
        retry: q,
      }]);
      haptic.error();
    } finally {
      clearTimeout(timer);
      setBusy(false);
      scrollToEnd();
    }
  };

  /*
   * Where they came from decides how the chat opens — once, after the history
   * is known, and then the address is cleaned so a refresh does not replay it.
   *   ?q=        a question typed on Home — sent as theirs
   *   ?from=today|night   the morning / night notification
   *   ?from=followup      "how did it go?" the evening after
   *   ?from=rishta        the person-in-your-life entry
   *   ?relate=<chartId>   just made their kundli — ready to link
   */
  useEffect(() => {
    if (!historyLoaded || arrivalHandled.current || !chartId) return;
    arrivalHandled.current = true;
    const q = params.get("q");
    const from = params.get("from");
    const relate = params.get("relate");
    if (q || from || relate) setParams({}, { replace: true });
    if (relate) { setRelPre(relate); setRelOpen(true); }
    if (q) { send(q); return; }
    if (from === "today") {
      fetch(`/api/chart/${chartId}/day-signals?lang=${encodeURIComponent(lang)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.headline && setLead({ text: d.headline, chips: DAY_CHIPS.today[lang] ?? DAY_CHIPS.today.en }))
        .catch(() => {});
    } else if (from === "night") {
      setLead({ text: tr(NIGHT_LINE, lang), chips: DAY_CHIPS.night[lang] ?? DAY_CHIPS.night.en });
    } else if (from === "followup") {
      fetch(`/api/chat/followup/${chartId}?lang=${encodeURIComponent(lang)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.followup && setLead({ text: d.followup.line, chips: d.followup.chips }))
        .catch(() => {});
    } else if (from === "rishta") {
      fetch(`/api/chat/relation/${chartId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.linked) setLead(rishtaLead({ chartId: d.chartId, relation: d.relation, name: d.name }, lang));
          else setRelOpen(true);
        })
        .catch(() => setRelOpen(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded]);

  /** Start a fresh chat: clear the thread on the server and on screen. */
  const newChat = async () => {
    if (busy) return;
    haptic.tap();
    setTurns([]);
    setOpenReason({});
    setLead(null);
    try { await fetch(`/api/chat-history/${chartId}?context=chat`, { method: "DELETE" }); } catch { /* ignore */ }
  };

  // Keep the session cache in step with what is on screen.
  useEffect(() => {
    if (chartId && historyLoaded) historyCache.set(chartId, turns.filter((t) => !t.paywall));
  }, [chartId, historyLoaded, turns]);

  const switchLang = (k: string) => {
    if (k === lang) return;
    haptic.select();
    setLang(k);
  };

  const toggleMic = async () => {
    if (listening) { await stopVoice().catch(() => {}); setListening(false); return; }
    haptic.tap();
    const started = await startVoice({
      lang: (lang === "hi" || lang === "hinglish" ? lang : "en") as VoiceLang,
      onPartial: (t) => setQuestion(t),
      onFinal: (t) => { setQuestion(t); setListening(false); },
      onError: () => setListening(false),
      onEnd: () => setListening(false),
    });
    setListening(started);
  };

  const shellStyle: React.CSSProperties = {
    height: "calc(100dvh - var(--sat) - var(--topbar-h) - 44px - var(--kb-inset))",
  };

  const g = GREETING[lang] || GREETING.en;
  const starters = rel ? [rishtaLead(rel, lang).chips[0], ...g.starters] : g.starters;
  const rishtaWord: Tri = { en: "Rishta", hi: "रिश्ता", hinglish: "Rishta" };
  const placeholder: Tri = { en: "Ask anything…", hi: "कुछ भी पूछिए…", hinglish: "Kuch bhi poochho…" };
  const listeningWord: Tri = { en: "Listening…", hi: "सुन रहा हूँ…", hinglish: "Sun raha hoon…" };

  return (
    <div className="-mx-4 -mb-6 flex flex-col overflow-hidden" style={shellStyle}>
      {/* toolbar — language, the person in your life, and a new chat. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
        <div className="flex items-center gap-1">
          {LANGS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => switchLang(l.key)}
              /* tap-44: the pill stays small, the TAPPABLE box does not.
                 At 25px tall these were under every platform's minimum and
                 people hit the wrong language. */
              className={`tap-44 relative rounded-full px-2.5 py-1.5 text-[11.5px] font-bold transition-colors ${
                lang === l.key ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { haptic.tap(); setRelPre(undefined); setRelOpen(true); }}
            className={`max-w-[120px] truncate rounded-full px-2.5 py-1.5 text-[11.5px] font-bold ${
              rel ? "bg-rose-500/12 text-rose-600" : "border border-border text-muted-foreground"
            }`}
          >
            <span className="inline-flex items-center gap-1"><HeartHandshake className="h-[14px] w-[14px] shrink-0" /> {rel?.name || tr(rishtaWord, lang)}</span>
          </button>
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground"
          >
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.6} />
          </button>
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {/* Loading the thread: quiet placeholders, not typing dots — dots say
            someone is writing to you, and nobody is yet. */}
        {!historyLoaded && (
          <div className="space-y-3" aria-hidden>
            <div className="skeleton h-12 w-2/3 rounded-2xl" />
            <div className="skeleton ml-auto h-10 w-1/2 rounded-2xl" />
            <div className="skeleton h-16 w-3/4 rounded-2xl" />
          </div>
        )}

        {historyLoaded && turns.length === 0 && (() => {
          const who = intro?.name ? `${intro.name} ji` : null;
          const bubble = "max-w-[86%] rounded-[20px] rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm";
          return (
          <div className="space-y-3">
            {greetStep >= 1 && (
              <div className="m-enter flex justify-start">
                <div className={bubble}>
                  <p className="text-[14.5px] font-semibold">
                    {who ? `${g.hi.replace(" 🙏", "")} ${who} 🙏` : g.hi}
                  </p>
                </div>
              </div>
            )}

            {greetStep >= 2 && intro && (
              <div className="m-enter flex w-full justify-start">
                <div className={`${bubble} w-[86%]`}>
                  <ChartGlance intro={intro} lang={lang} />
                </div>
              </div>
            )}

            {greetStep >= 3 && (
              <div className="m-enter flex justify-start">
                <div className={bubble}>
                  <p className="text-[14.5px] leading-[1.6]">{intro ? (READ[lang] || READ.en) : g.sub}</p>
                </div>
              </div>
            )}

            {greetStep < 3 && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
                  <span className="flex items-center gap-1">
                    {[0, 1, 2].map((k) => (
                      <span key={k} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${k * 0.15}s` }} />
                    ))}
                  </span>
                </div>
              </div>
            )}

            {greetStep >= 3 && !lead && (
              <div className="m-enter space-y-2 pt-1">
                {starters.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="m-card block w-full px-4 py-3 text-left text-[13.5px] font-semibold"
                  >
                    {s}
                  </button>
                ))}
                <p className="flex items-center gap-1.5 px-1 pt-2 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {{ en: "AI · from your real chart, all calculated", hi: "एआई · आपकी असली कुंडली से, सब calculated", hinglish: "AI · aapki asli kundli se, sab calculated" }[lang] || "AI · from your real chart, all calculated"}
                </p>
              </div>
            )}
          </div>
          );
        })()}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] font-medium leading-[1.5] text-accent-foreground shadow-sm">
                {t.answer}
              </div>
            </div>
          ) : t.paywall ? (
            <div key={i} className="m-enter flex justify-start">
              <Paywall price={t.paywall.price} balance={t.paywall.balance} lang={lang} email={email} />
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className={`max-w-[86%] rounded-[20px] rounded-bl-md border px-4 py-3 ${t.error ? "border-red-500/30 bg-red-500/5" : "border-border bg-card shadow-sm"}`}>
                <div className="selectable text-[14.5px] leading-[1.6]">
                  <AnswerText text={t.answer} />
                </div>

                {t.card === "chart" && intro && (
                  <div className="mt-2.5">
                    <ChartGlance intro={intro} lang={lang} />
                  </div>
                )}

                {!t.error && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {t.reason ? (
                      <button
                        type="button"
                        onClick={() => { haptic.tap(); setOpenReason((o) => ({ ...o, [i]: !o[i] })); }}
                        className="flex items-center gap-1 text-[11.5px] font-bold text-muted-foreground"
                      >
                        Reason
                        <ChevronDown className={`h-[14px] w-[14px] transition-transform ${openReason[i] ? "rotate-180" : ""}`} />
                      </button>
                    ) : <span />}
                    {/* Heard, not only read — the way a pandit-ji is. */}
                    <SpeakButton text={t.answer} context="chat" />
                  </div>
                )}
                {t.reason && openReason[i] && (
                  <div className="mt-2 rounded-xl border border-border/70 bg-muted/50 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                    <AnswerText text={t.reason} />
                  </div>
                )}

                {/* The question that produced this action — so a decision opens
                    already filled in rather than asking them to type it twice. */}
                {t.action && chartId && (
                  <ChatAction
                    action={t.action}
                    chartId={chartId}
                    question={[...turns.slice(0, i)].reverse().find((x) => x.role === "user")?.answer}
                  />
                )}

                {!!t.next?.length && !t.error && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                    {t.next.map((n) => (
                      <button
                        key={n}
                        type="button"
                        disabled={busy}
                        onClick={() => send(n)}
                        className="rounded-full border border-accent/35 bg-accent/8 px-3 py-1.5 text-left text-[12px] font-semibold text-accent disabled:opacity-40"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                )}

                {t.error && t.retry && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => send(t.retry!)}
                    className="mt-2 flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold disabled:opacity-40"
                  >
                    <RotateCw className="h-[13px] w-[13px]" /> Dobara bhejein
                  </button>
                )}
              </div>
            </div>
          ),
        )}

        {/* The app's own opening for where they came from — the day, a
            follow-up, the linked person. Calculated or taken from what they
            said; never stored as if it were a reply. */}
        {lead && !typing && (greetStep >= 3 || turns.length > 0) && (
          <div className="m-enter flex justify-start">
            <div className="max-w-[86%] rounded-[20px] rounded-bl-md border border-accent/30 bg-accent/5 px-4 py-3 shadow-sm">
              <div className="text-[14.5px] leading-[1.6]"><AnswerText text={lead.text} /></div>
              <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
                {lead.chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={busy}
                    onClick={() => send(c)}
                    className="rounded-full border border-accent/35 bg-accent/8 px-3 py-1.5 text-left text-[12px] font-semibold text-accent disabled:opacity-40"
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {typing && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
              <span className="flex items-center gap-1">
                {[0, 1, 2].map((k) => (
                  <span key={k} className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${k * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* composer */}
      <div className="shrink-0 border-t border-border bg-background px-3 py-2.5">
        <AskMeter />
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(question); }
            }}
            rows={1}
            placeholder={listening ? tr(listeningWord, lang) : tr(placeholder, lang)}
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-[14px] outline-none focus:border-accent"
          />
          {canVoice && (
            <button
              type="button"
              onClick={toggleMic}
              aria-label={listening ? "Stop listening" : "Speak your question"}
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
                listening ? "animate-pulse border-red-500 bg-red-500/10 text-red-600" : "border-border text-muted-foreground"
              }`}
            >
              {listening ? <Square className="h-[16px] w-[16px]" /> : <Mic className="h-[19px] w-[19px]" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => send(question)}
            disabled={busy || !question.trim()}
            aria-label="Send"
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${
              question.trim() && !busy ? "bg-accent text-accent-foreground shadow-md shadow-accent/30" : "bg-muted text-muted-foreground"
            }`}
          >
            <Send className="h-[19px] w-[19px]" />
          </button>
        </div>
      </div>

      {chartId && (
        <RelationSheet
          open={relOpen}
          chartId={chartId}
          current={rel}
          preselect={relPre}
          onClose={() => setRelOpen(false)}
          onLinked={(r) => { setRel(r); setRelOpen(false); setLead(rishtaLead(r, lang)); scrollToEnd(); }}
          onUnlinked={() => { setRel(null); setRelOpen(false); setLead(null); }}
        />
      )}
    </div>
  );
}
