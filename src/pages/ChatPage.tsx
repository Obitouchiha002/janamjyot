import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Send, ChevronDown, ShieldCheck, Plus } from "lucide-react";
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
};

const REASON_MARK = "\n<<REASON>>\n";

/** Split a stored/received assistant message into its answer and hidden reason. */
function splitReason(raw: string): { answer: string; reason?: string } {
  const i = raw.indexOf(REASON_MARK);
  if (i === -1) return { answer: raw.trim() };
  const reason = raw.slice(i + REASON_MARK.length).trim();
  return { answer: raw.slice(0, i).trim(), reason: reason || undefined };
}

const STARTERS = [
  "Aaj mera din kaisa rahega?",
  "Kal ka din kaisa hai?",
  "Meri job/career kab set hogi?",
  "Ye app kaise use karun?",
];

export default function ChatPage() {
  const { chartId } = useParams();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [openReason, setOpenReason] = useState<Record<number, boolean>>({});
  const [lang, setLang] = useState<string>(getLang());
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

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
    if (!q || busy || !chartId) return;
    haptic.tap();
    setTurns((p) => [...p, { role: "user", answer: q }]);
    setQuestion("");
    setBusy(true);
    setTyping(true);
    scrollToEnd();
    try {
      const res = await fetch("/api/chat/universal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, question: q, language: lang }),
      });
      const data = await res.json().catch(() => ({}));
      setTyping(false);
      if (res.status === 429) {
        setTurns((p) => [...p, { role: "assistant", answer: "Aaj ke sawaal khatam ho gaye — kal reset ho jayenge, ya apna plan dekhein.", error: true }]);
        return;
      }
      if (res.ok && data.answer) {
        setTurns((p) => [...p, { role: "assistant", answer: data.answer, reason: data.reason || undefined }]);
        haptic.success();
      } else {
        setTurns((p) => [...p, { role: "assistant", answer: data.error || "Jawab nahi mil paya. Dobara koshish karein.", error: true }]);
        haptic.error();
      }
    } catch {
      setTyping(false);
      setTurns((p) => [...p, { role: "assistant", answer: "Network error. Dobara koshish karein.", error: true }]);
      haptic.error();
    } finally {
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
        {turns.length === 0 && (
          <div className="px-1 pt-3">
            <p className="text-[15px] font-semibold">Namaste 🙏</p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
              Kuch bhi poochho — aaj/kal ka din, career, rishte, ya app kaise chalta hai. Main aapki kundli padh ke seedha jawab dunga.
            </p>
            <div className="mt-4 space-y-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="m-card block w-full px-4 py-3 text-left text-[13.5px] font-semibold"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> AI · aapki asli kundli se, sab calculated
            </p>
          </div>
        )}

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
