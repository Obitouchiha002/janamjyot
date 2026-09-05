import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Send, ChevronDown, ShieldCheck, Plus, RotateCw } from "lucide-react";
import AskMeter from "@/components/AskMeter";
import ChatAction from "@/components/ChatAction";
import AnswerText from "@/components/AnswerText";
import { getLang } from "@/lib/prefs";
import { haptic } from "@/lib/native";

const LANGS = [
  { key: "en", label: "EN" },
  { key: "hinglish", label: "Hinglish" },
  { key: "hi", label: "हिंदी" },
] as const;

/**
 * The ONE chat.
 *
 * Replaces the old sprawl — persona picker, Sectors, Transit, Ask — with a
 * single screen. Ask about your chart, today/tomorrow, or the app itself, and
 * you get ONE clear answer. The astrology behind it sits under "Reason", one
 * tap away, so the message on top stays plain and the technical basis is there
 * for anyone who wants it. Backed by /api/chat/universal.
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
};

const REASON_MARK = "\n<<REASON>>\n";

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
    starters: ["How will my day go today?", "How is tomorrow?", "When will my career settle?", "How do I use this app?"],
  },
  hinglish: {
    hi: "Namaste 🙏",
    sub: "Kuch bhi poochho — aaj/kal ka din, career, rishte, ya app kaise chalta hai. Main aapki kundli padh ke seedha jawab dunga.",
    starters: ["Aaj mera din kaisa rahega?", "Kal ka din kaisa hai?", "Meri job/career kab set hogi?", "Ye app kaise use karun?"],
  },
  hi: {
    hi: "नमस्ते 🙏",
    sub: "कुछ भी पूछें — आज/कल का दिन, करियर, रिश्ते, या ऐप कैसे चलता है। मैं आपकी कुंडली पढ़कर सीधा जवाब दूँगा।",
    starters: ["आज मेरा दिन कैसा रहेगा?", "कल का दिन कैसा है?", "मेरी नौकरी कब सेट होगी?", "यह ऐप कैसे इस्तेमाल करूँ?"],
  },
};

const READ: Record<string, string> = {
  en: "I've read your kundli. Ask me whatever is on your mind.",
  hinglish: "Maine aapki kundli padh li hai. Ab jo mann me ho poochiye.",
  hi: "मैंने आपकी कुंडली पढ़ ली है। अब जो मन में हो पूछिए।",
};

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

export default function ChatPage() {
  const { chartId } = useParams();
  const [intro, setIntro] = useState<any>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [openReason, setOpenReason] = useState<Record<number, boolean>>({});
  const [lang, setLang] = useState<string>(getLang());
  /** How much of the opening has "been typed" — 0 dots, 1 hello, 2 chart, 3 all. */
  const [greetStep, setGreetStep] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

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
  }, [chartId]);

  /*
   * Let the opening arrive rather than appear.
   *
   * Paced like someone typing: a beat before the hello, longer before the
   * chart because reading a kundli takes a moment, shorter before the
   * invitation. The exact numbers matter less than the fact that there are
   * gaps at all — three things landing together is a page, three things
   * landing in sequence is a person.
   *
   * Only for a genuinely new thread; someone returning to their history has
   * already met us and should not be made to wait through an introduction.
   */
  useEffect(() => {
    if (turns.length > 0) { setGreetStep(3); return; }
    const t1 = setTimeout(() => setGreetStep(1), 700);
    const t2 = setTimeout(() => setGreetStep(2), 2100);
    const t3 = setTimeout(() => setGreetStep(3), 3400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [turns.length]);

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
    fetch(`/api/chat-history/${chartId}?context=chat`)
      .then((r) => r.json())
      .then((rows: Array<{ role: string; message: string }>) => {
        if (!alive || !Array.isArray(rows)) return;
        setTurns(
          rows.map((m) =>
            m.role === "user"
              ? { role: "user" as const, answer: m.message }
              : { role: "assistant" as const, ...splitReason(m.message || "") },
          ),
        );
        scrollToEnd();
      })
      .catch(() => { /* start empty */ });
    return () => { alive = false; };
  }, [chartId, scrollToEnd]);

  const send = async (raw: string) => {
    const q = raw.trim();
    // `busy` is the double-send guard: a second tap while one is in flight
    // would be a second question and a second credit.
    if (!q || busy || !chartId) return;
    haptic.tap();
    setTurns((p) => [...p, { role: "user", answer: q }]);
    setQuestion("");
    setBusy(true);
    setTyping(true);
    scrollToEnd();

    // A model call that stalls rather than fails used to leave the typing dots
    // running forever with `busy` stuck true — no answer, and no way to even
    // retry. Ninety seconds is long enough for a slow generation and short
    // enough that nobody sits staring at it.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 90_000);
    try {
      const res = await fetch("/api/chat/universal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, question: q, language: lang }),
        signal: ctl.signal,
      });
      const data = await res.json().catch(() => ({}));
      setTyping(false);

      // 402 and 429 are already answered by the global sheet, which shows the
      // price, the balance and a way to top up. Repeating them as an error
      // bubble put two different explanations on screen at once.
      if (res.status === 429 || res.status === 402) {
        setTurns((p) => p.slice(0, -1));
        setQuestion(q);
        return;
      }
      if (res.ok && data.answer && data.answer.trim()) {
        setTurns((p) => [...p, {
          role: "assistant",
          answer: data.answer,
          reason: data.reason || undefined,
          // Two is right after a real answer; a greeting is a menu by nature,
          // so it may offer four.
          next: Array.isArray(data.next) ? data.next.slice(0, data.card ? 4 : 2) : undefined,
          action: data.action || undefined,
          card: data.card || undefined,
        }]);
        haptic.success();
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

  /** Start a fresh chat: clear the thread on the server and on screen. */
  const newChat = async () => {
    if (busy) return;
    haptic.tap();
    setTurns([]);
    setOpenReason({});
    try { await fetch(`/api/chat-history/${chartId}?context=chat`, { method: "DELETE" }); } catch { /* ignore */ }
  };

  const switchLang = (k: string) => {
    if (k === lang) return;
    haptic.select();
    setLang(k);
  };

  const shellStyle: React.CSSProperties = {
    height: "calc(100dvh - var(--sat) - var(--topbar-h) - 44px - var(--kb-inset))",
  };

  return (
    <div className="-mx-4 -mb-6 flex flex-col overflow-hidden" style={shellStyle}>
      {/* toolbar — the app-shell top bar already says "Jyotish", so this row is
          just the controls the old chat was missing: language + a new chat. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-3 py-2">
        <div className="flex items-center gap-1">
          {LANGS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => switchLang(l.key)}
              className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
                lang === l.key ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={newChat}
          className="flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px] font-bold text-muted-foreground"
        >
          <Plus className="h-[14px] w-[14px]" strokeWidth={2.6} /> New chat
        </button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {turns.length === 0 && (() => {
          const g = GREETING[lang] || GREETING.en;
          const who = intro?.name ? `${intro.name} ji` : null;
          const bubble = "max-w-[86%] rounded-[20px] rounded-bl-md border border-border bg-card px-4 py-3 shadow-sm";
          return (
          <div className="space-y-3">
            {/* The opening arrives the way a person sends it: a short hello,
                then the chart, then the invitation — each after a pause, with
                the typing dots in between. It used to land as one wall of text
                the instant the screen opened, which reads as a page rather than
                as someone who has just looked at your kundli. Everything shown
                is calculated, not generated. */}
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

            {/* Dots between the bubbles, not only before the first one. */}
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

            {greetStep >= 3 && (
              <div className="m-enter space-y-2 pt-1">
                {g.starters.map((s) => (
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
                  {{ en: "AI · from your real chart, all calculated", hi: "एआई · आपकी असली कुंडली से, सब calculated", hinglish: "AI · aapki asli kundli se, sab calculated" }[lang] || "AI · from your real chart"}
                </p>
              </div>
            )}
          </div>
          );
        })()}

        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-md bg-accent px-4 py-2.5 text-[14.5px] font-medium leading-[1.5] text-accent-foreground">
                {t.answer}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className={`max-w-[86%] rounded-[20px] rounded-bl-md border px-4 py-3 ${t.error ? "border-red-500/30 bg-red-500/5" : "border-border bg-card shadow-sm"}`}>
                <div className="selectable text-[14.5px] leading-[1.6]">
                  <AnswerText text={t.answer} />
                </div>

                {/* "I've looked at your chart" is a claim; this is the evidence,
                    drawn from the same calculation the rest of the app uses. */}
                {t.card === "chart" && intro && (
                  <div className="mt-2.5">
                    <ChartGlance intro={intro} lang={lang} />
                  </div>
                )}

                {t.reason && (
                  <>
                    <button
                      type="button"
                      onClick={() => { haptic.tap(); setOpenReason((o) => ({ ...o, [i]: !o[i] })); }}
                      className="mt-2 flex items-center gap-1 text-[11.5px] font-bold text-muted-foreground"
                    >
                      Reason
                      <ChevronDown className={`h-[14px] w-[14px] transition-transform ${openReason[i] ? "rotate-180" : ""}`} />
                    </button>
                    {openReason[i] && (
                      <div className="mt-2 rounded-xl border border-border/70 bg-muted/50 px-3 py-2 text-[12.5px] leading-relaxed text-muted-foreground">
                        <AnswerText text={t.reason} />
                      </div>
                    )}
                  </>
                )}

                {/* The task they asked for, done here rather than described. */}
                {t.action && chartId && <ChatAction action={t.action} chartId={chartId} />}

                {/* One tap to keep going. A long answer that ends in silence
                    puts the whole burden of "what now" on the person, and most
                    people simply close the app — these are written in their own
                    voice so tapping one is the same as typing it. */}
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

                {/* A failed answer that cannot be retried makes someone retype
                    a question they already asked. */}
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
        {/* What the next message costs, before it is sent. */}
        <AskMeter />
        <div className="flex items-end gap-2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(question); }
            }}
            rows={1}
            placeholder="Kuch bhi poochho…"
            className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-[14px] outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={() => send(question)}
            disabled={busy || !question.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
          >
            <Send className="h-[19px] w-[19px]" />
          </button>
        </div>
      </div>
    </div>
  );
}
