import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Sparkles, Bot, Send, Mic } from "lucide-react";
import AnswerText from "@/components/AnswerText";
import SpeakButton from "@/components/SpeakButton";
import { Pressable } from "@/components/mobile/Pressable";
import { haptic } from "@/lib/native";

// Maps the chat language to a BCP-47 code for browser speech recognition.
const SPEECH_LANG: Record<string, string> = {
  en: "en-IN", hinglish: "hi-IN", hi: "hi-IN", ta: "ta-IN", te: "te-IN",
  mr: "mr-IN", bn: "bn-IN", gu: "gu-IN", kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", ur: "ur-IN",
};

const LANGS: Array<[string, string]> = [
  ["en", "English"], ["hinglish", "Hinglish"], ["hi", "हिंदी"], ["ta", "தமிழ்"],
  ["te", "తెలుగు"], ["mr", "मराठी"], ["bn", "বাংলা"], ["gu", "ગુજરાતી"],
  ["kn", "ಕನ್ನಡ"], ["ml", "മലയാളം"], ["pa", "ਪੰਜਾਬੀ"], ["ur", "اردو"],
];

// Common questions every user tends to ask. Tapping one sends it to the AI,
// which answers strictly from the saved chart data (category auto-detected).
const COMMON_QUESTIONS = [
  "When will my career grow?",
  "Should I take a job or start a business?",
  "When will I get married?",
  "What will my life partner be like?",
  "What do my money and wealth prospects look like?",
  "How will my health be?",
  "Is there a chance of foreign travel or settlement?",
  "When will I own property or a house?",
  "How will my studies and higher education go?",
  "Which mahadasha-antardasha is running now?",
  "How will the next 5-7 years be?",
  "What are my lucky things?",
  "Will my love relationship succeed?",
  "Which is my strongest planet?",
];

/** Three-dot "AI is thinking" indicator — reads better than a spinner in a chat. */
function Typing() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-accent animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

export default function AskQuestionPage() {
  const { chartId } = useParams();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<{role: 'user'|'ai', text: string}[]>([]);
  const [loading, setLoading] = useState(false);
  // Chat replies are in English by default; the user can switch any time.
  const [lang, setLang] = useState("en");
  const endRef = useRef<HTMLDivElement>(null);

  // --- Voice input (browser Web Speech API) ---
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");
  const SpeechRecognition =
    typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Stop listening when leaving the page.
  useEffect(() => {
    return () => { try { recognitionRef.current?.stop(); } catch {} };
  }, []);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [history, loading]);

  const toggleVoice = () => {
    if (!SpeechRecognition) return;
    // Voice needs a secure context (https) or localhost.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setHistory(prev => [...prev, {
        role: "ai",
        text: "Voice input needs a secure connection. Please open the app at http://localhost:3000 (not an IP address), or run it with HTTPS. You can still type your question.",
      }]);
      return;
    }
    if (listening) {
      try { recognitionRef.current?.stop(); } catch {}
      setListening(false);
      return;
    }
    const recog = new SpeechRecognition();
    recognitionRef.current = recog;
    recog.lang = SPEECH_LANG[lang] || "en-IN";
    recog.continuous = true;
    recog.interimResults = true;
    baseTextRef.current = question ? question.trim() + " " : "";

    recog.onresult = (e: any) => {
      let transcript = "";
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setQuestion((baseTextRef.current + transcript).trimStart());
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);

    try {
      recog.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  // Load any previous conversation for this chart from the backend.
  useEffect(() => {
    if (!chartId) return;
    fetch(`/api/chat-history/${chartId}?context=ask`)
      .then(res => (res.ok ? res.json() : []))
      .then((rows: any[]) => {
        if (!Array.isArray(rows)) return;
        setHistory(
          rows
            .filter(r => r.message)
            .map(r => ({ role: r.role === "user" ? "user" : "ai", text: r.message }))
        );
      })
      .catch(() => {});
  }, [chartId]);

  const ask = async (rawQ: string) => {
    const currentQ = rawQ.trim();
    if (!currentQ || loading) return;

    // Stop voice capture once the question is sent.
    try { recognitionRef.current?.stop(); } catch {}
    setListening(false);

    setHistory(prev => [...prev, { role: 'user', text: currentQ }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chartId, question: currentQ, language: lang, context: "ask" })
      });
      const data = await res.json();
      const text = res.ok
        ? data.answer
        : data.error || "Could not generate an answer.";
      if (res.ok) haptic.success(); else haptic.error();
      setHistory(prev => [...prev, { role: 'ai', text }]);
    } catch (err) {
      haptic.error();
      setHistory(prev => [...prev, { role: 'ai', text: "Error fetching answer." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    ask(question);
  };

  return (
    <div className="flex min-h-[calc(100dvh-var(--sat)-var(--topbar-h)-var(--sab)-48px)] flex-col">
      {/* Reply language — a quiet pill, not a page header. */}
      <div className="flex justify-end pt-1">
        <select
          value={lang}
          onChange={(e) => { haptic.select(); setLang(e.target.value); }}
          aria-label="Reply language"
          className="h-9 rounded-full border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground outline-none"
        >
          {LANGS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div className="flex-1 space-y-4 pt-3">
        {history.length === 0 && (
          <div className="m-enter pt-4">
            <div className="mb-5 flex flex-col items-center text-center">
              <span className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-accent/15 text-accent">
                <Sparkles className="h-7 w-7" />
              </span>
              <p className="text-[16px] font-bold">Ask a Question</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Career, money, marriage — answers come straight from your kundli.
              </p>
            </div>

            <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
              Common questions
            </h3>
            <div className="flex flex-col gap-2.5">
              {COMMON_QUESTIONS.map((q, i) => (
                <Pressable
                  key={q}
                  subtle
                  disabled={loading}
                  onClick={() => ask(q)}
                  className="m-card m-enter flex min-h-[48px] w-full items-center px-4 py-3 text-left text-[14px] font-medium"
                  style={{ animationDelay: `${Math.min(i, 8) * 0.03}s` }}
                >
                  {q}
                </Pressable>
              ))}
            </div>
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && (
              <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                <Bot className="h-[17px] w-[17px]" />
              </span>
            )}
            {msg.role === 'ai' ? (
              <div className="m-card m-enter max-w-[85%] px-4 py-3">
                <div className="-mr-1 -mt-1 mb-1 flex justify-end">
                  <SpeakButton text={msg.text} lang={lang} />
                </div>
                <div className="selectable text-[14.5px] leading-relaxed">
                  <AnswerText text={msg.text} />
                </div>
              </div>
            ) : (
              <div className="m-enter max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-3 text-accent-foreground shadow-lg shadow-accent/20">
                <p className="selectable whitespace-pre-wrap text-[14.5px] leading-relaxed">{msg.text}</p>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start gap-2.5">
            <span className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
              <Bot className="h-[17px] w-[17px]" />
            </span>
            <div className="m-card flex items-center gap-2.5 px-4 py-3">
              <Typing />
              <span className="text-[13px] text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* ── Composer ───────────────────────────────────────────────────────
          Sticky to the bottom of the scroll area, lifted by --kb-height so the
          on-screen keyboard never covers it (the webview does not resize). */}
      <form
        onSubmit={handleAsk}
        className="sticky z-20 -mx-4 mt-3 border-t border-border bg-background px-4 pt-3"
        style={{ bottom: 'var(--kb-height)', paddingBottom: 'calc(var(--sab) + 10px)' }}
      >
        <div className="flex items-end gap-2">
          <input
            className="h-12 min-w-0 flex-1 rounded-2xl border border-input bg-card px-4 text-[15px] outline-none transition-colors focus:border-accent"
            placeholder={listening ? "Listening… go ahead" : "Type your question…"}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={loading}
          />
          {SpeechRecognition && (
            <Pressable
              onClick={toggleVoice}
              feedback="medium"
              aria-label={listening ? "Stop listening" : "Ask by voice"}
              className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-colors ${
                listening
                  ? "animate-pulse border-destructive bg-destructive text-destructive-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <Mic className="h-[19px] w-[19px]" />
            </Pressable>
          )}
          <Pressable
            onClick={() => ask(question)}
            feedback="medium"
            disabled={!question.trim() || loading}
            aria-label="Send"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-accent/25"
          >
            <Send className="h-[19px] w-[19px]" strokeWidth={2.3} />
          </Pressable>
        </div>
      </form>
    </div>
  );
}
