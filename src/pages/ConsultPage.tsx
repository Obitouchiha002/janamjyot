import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Languages, ShieldCheck, Plus, Mic } from 'lucide-react';
import AnswerText from '@/components/AnswerText';
import SpeakButton from '@/components/SpeakButton';
import { NorthIndianChart } from '@/components/NorthIndianChart';
import AstrologerAvatar from '@/components/mobile/AstrologerAvatar';
import { Pressable } from '@/components/mobile/Pressable';
import { haptic } from '@/lib/native';
import { voiceAvailable, startVoice, stopVoice } from '@/lib/voice';

/** Persona display data from GET /api/astrologers. */
interface Astrologer {
  id: string;
  name: string;
  title: string;
  emoji: string;
  tint: string;
  expertise: string[];
  style: string;
  languages: string[];
  focusCategory: string;
  suggested: string[];
  disclaimer?: string;
}

/**
 * A rendered chat turn. Assistant replies arrive as multiple bubbles. `chart`
 * marks a standalone message that is just the D1 chart card (sent right after
 * the greeting, like a real astrologer sharing your kundli). `error` marks an
 * inline failure bubble. `time` is epoch ms for the small timestamp.
 */
interface Turn {
  role: 'user' | 'assistant';
  bubbles: string[];
  time: number;
  error?: boolean;
  chart?: boolean;
}

type Lang = 'en' | 'hi' | 'hinglish';
const LANGS: Array<{ v: Lang; short: string; label: string; native: string }> = [
  { v: 'hinglish', short: 'Hinglish', label: 'Hinglish', native: 'Hindi + English' },
  { v: 'hi', short: 'HI', label: 'Hindi', native: 'हिंदी' },
  { v: 'en', short: 'EN', label: 'English', native: 'English' },
];

type Phase = 'loading' | 'language' | 'connecting' | 'chat';

function fmtTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

/**
 * Turn whatever the model returns (often long, multi-sentence bubbles) into a
 * flow of SHORT WhatsApp-style messages: split on sentence ends and line breaks,
 * strip markdown emphasis, and merge only very short fragments. This is what
 * makes the astrologer feel like a real person texting, not a robot dumping a
 * paragraph.
 */
function toMessages(bubbles: string[]): string[] {
  const out: string[] = [];
  for (const raw of bubbles) {
    if (!raw) continue;
    const cleaned = String(raw)
      .replace(/\*\*/g, '')        // drop bold markers
      .replace(/^#+\s*/gm, '')      // drop markdown headings
      .replace(/\s*\n+\s*/g, ' ')   // collapse newlines
      .trim();
    // Split after . ! ? or the Hindi danda ।, keeping the punctuation.
    const parts = cleaned
      .split(/(?<=[.!?।])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    let buf = '';
    for (const p of parts) {
      if (!buf) {
        buf = p;
      } else if ((buf + ' ' + p).length <= 55) {
        // merge a very short fragment into the previous message
        buf = buf + ' ' + p;
      } else {
        out.push(buf);
        buf = p;
      }
    }
    if (buf) out.push(buf);
  }
  return out.length ? out : bubbles.filter(Boolean);
}

/** WhatsApp-style three-dot typing bubble. */
function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-muted-foreground/60 animate-bounce"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

export default function ConsultPage() {
  const { chartId, astrologer } = useParams();
  const [persona, setPersona] = useState<Astrologer | null>(null);
  const [chart, setChart] = useState<any>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [lang, setLang] = useState<Lang>('hinglish');
  const [phase, setPhase] = useState<Phase>('loading');
  const [connectMsg, setConnectMsg] = useState('Connecting…');
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [listening, setListening] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const introRef = useRef(false);
  const langRef = useRef<Lang>('hinglish'); // read inside async closures without stale state

  const kundliName: string = chart?.birth_details?.name || '';
  const planetsMapped: any[] =
    chart?.planets?.map((p: any) => ({ ...p, short: p.planet.substring(0, 2) })) ?? [];

  // ── data loads ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/astrologers')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Astrologer[]) => {
        if (Array.isArray(rows)) setPersona(rows.find((p) => p.id === astrologer) ?? null);
      })
      .catch(() => {});
  }, [astrologer]);

  useEffect(() => {
    if (!chartId) return;
    fetch(`/api/chart/${chartId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setChart(d?.error ? null : d))
      .catch(() => {});
  }, [chartId]);

  // History: if this astrologer was already consulted, resume straight into the
  // chat. Otherwise start the "pick a language → connecting → greeting" flow.
  useEffect(() => {
    if (!chartId || !astrologer) return;
    let cancelled = false;
    fetch(`/api/chat-history/${chartId}?context=astro:${astrologer}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: any[]) => {
        if (cancelled) return;
        const mapped: Turn[] = [];
        for (const r of Array.isArray(rows) ? rows : []) {
          const t = r.created_at ? new Date(r.created_at).getTime() : Date.now();
          if (r.role === 'user') {
            const msg = (r.message ?? '').trim();
            if (msg) mapped.push({ role: 'user', bubbles: [msg], time: t });
          } else {
            const raw = Array.isArray(r.response_json?.bubbles)
              ? (r.response_json.bubbles as string[])
              : [r.message ?? ''];
            // Re-split stored replies into short bubbles so old chats read the
            // same clean WhatsApp way as new ones.
            for (const m of toMessages(raw)) mapped.push({ role: 'assistant', bubbles: [m], time: t });
          }
        }
        const clean = mapped.filter((t) => t.bubbles.length);
        if (clean.length) {
          // Returning to an existing consultation — show the D1 card once up top.
          setTurns([{ role: 'assistant', bubbles: [], time: clean[0].time, chart: true }, ...clean]);
          setPhase('chat');
        } else {
          setPhase('language');
        }
      })
      .catch(() => setPhase('language'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId, astrologer]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, typing]);

  // ── helpers ────────────────────────────────────────────────────────────────
  const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
  /**
   * Roughly how long a person would take to type this. A real person can't
   * produce four messages in two seconds, and when the app did, replies felt
   * copy-pasted instead of spoken. ~55 wpm with a floor so even "haan ji" takes
   * a believable beat, and a generous ceiling for longer thoughts.
   */
  const typeMs = (text: string) =>
    Math.min(700 + text.split(/\s+/).length * 120, 3000);

  /** Reveal bubbles one at a time, each preceded by a real typing pause. */
  const revealBubbles = async (all: string[]) => {
    for (let i = 0; i < all.length; i++) {
      setTyping(true);
      await delay(typeMs(all[i]));
      setTyping(false);
      setTurns((prev) => [...prev, { role: 'assistant', bubbles: [all[i]], time: Date.now() }]);
      haptic.tap();
      // Pause BETWEEN messages — the gap where a person collects the next
      // thought. Without it the bubbles still arrive as one burst.
      if (i < all.length - 1) await delay(600 + Math.random() * 400);
    }
  };

  /** Opening: Namaste → share the D1 chart → explain it → invite a question. */
  const runIntro = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/consult/intro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, astrologer, language: langRef.current }),
      });
      if (res.status === 429) return;
      const data = await res.json();
      const raw: string[] = Array.isArray(data?.bubbles) ? data.bubbles : [];
      if (data?.already || !raw.length) return;
      const msgs = toMessages(raw);

      // 1) greeting (first short line)
      await revealBubbles([msgs[0]]);
      // 2) share the birth chart, like a pandit turning the kundli toward you
      setTyping(true);
      await delay(1400);
      setTyping(false);
      setTurns((prev) => [...prev, { role: 'assistant', bubbles: [], time: Date.now(), chart: true }]);
      await delay(500);
      // 3) the rest — the plain-language reading + the invitation, one line at a time
      await revealBubbles(msgs.slice(1));
      haptic.success();
    } catch {
      /* composer stays open */
    } finally {
      setTyping(false);
      setBusy(false);
    }
  };

  /** Runs after the "connecting…" beat completes. */
  const beginConsultation = async () => {
    setPhase('chat');
    if (!introRef.current) {
      introRef.current = true;
      await runIntro();
    }
  };

  // The connecting beat: 5–10s of "astrologer is joining", with status text that
  // progresses so it feels like a real person coming online.
  const startConnecting = (chosen: Lang) => {
    setLang(chosen);
    langRef.current = chosen;
    haptic.medium();
    setPhase('connecting');
    const name = persona?.name || 'The astrologer';
    setConnectMsg('Connecting you to the astrologer…');
    const t1 = setTimeout(() => setConnectMsg(`${name} is joining the chat…`), 2200);
    const t2 = setTimeout(() => setConnectMsg(`${name} is reviewing your kundli…`), 4600);
    const total = 5200 + Math.floor(Math.random() * 4200); // 5.2–9.4s
    const t3 = setTimeout(() => {
      setConnectMsg(`${name} is online`);
      haptic.success();
      setTimeout(beginConsultation, 600);
    }, total);
    // Cleanup if the user leaves mid-connect.
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  };

  // "+ New chat": wipe this astrologer's thread and start a fresh consultation
  // (same language) — connecting beat → new greeting + D1 card.
  const newChat = () => {
    if (busy) return;
    haptic.tap();
    fetch(`/api/chat-history/${chartId}?context=astro:${astrologer}`, { method: 'DELETE' }).catch(() => {});
    setTurns([]);
    setQuestion('');
    introRef.current = false;
    startConnecting(langRef.current);
  };

  // Show the mic only where speech-to-text actually works.
  useEffect(() => {
    let alive = true;
    voiceAvailable().then((ok) => { if (alive) setVoiceOn(ok); });
    return () => { alive = false; stopVoice(); };
  }, []);

  const toggleVoice = async () => {
    if (busy) return;
    if (listening) { haptic.tap(); await stopVoice(); setListening(false); return; }
    haptic.medium();
    setListening(true);
    const started = await startVoice({
      lang: langRef.current,
      onPartial: (t) => setQuestion(t),
      onFinal: (t) => { setQuestion(t); haptic.success(); },
      onError: () => { haptic.error(); setListening(false); },
      onEnd: () => setListening(false),
    });
    if (!started) setListening(false);
  };

  const send = async (rawQ: string) => {
    const q = rawQ.trim();
    if (!q || busy) return;
    if (listening) { stopVoice(); setListening(false); }
    haptic.tap();
    setTurns((prev) => [...prev, { role: 'user', bubbles: [q], time: Date.now() }]);
    setQuestion('');
    setBusy(true);
    setTyping(true);
    try {
      const res = await fetch('/api/consult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, astrologer, question: q, language: langRef.current }),
      });
      if (res.status === 429) return;
      const data = await res.json();
      if (res.ok && Array.isArray(data.bubbles) && data.bubbles.length) {
        setTyping(false);
        await revealBubbles(toMessages(data.bubbles as string[]));
        haptic.success();
      } else {
        setTyping(false);
        haptic.error();
        setTurns((prev) => [
          ...prev,
          { role: 'assistant', bubbles: [data.error || 'Could not reach the astrologer. Please try again.'], time: Date.now(), error: true },
        ]);
      }
    } catch {
      setTyping(false);
      haptic.error();
      setTurns((prev) => [
        ...prev,
        { role: 'assistant', bubbles: ['Network error. Please try again.'], time: Date.now(), error: true },
      ]);
    } finally {
      setTyping(false);
      setBusy(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(question);
  };

  const cycleLang = () => {
    haptic.select();
    const idx = LANGS.findIndex((l) => l.v === lang);
    const next = LANGS[(idx + 1) % LANGS.length].v;
    setLang(next);
    langRef.current = next;
  };

  const tint = persona?.tint || 'var(--color-accent)';
  const langShort = LANGS.find((l) => l.v === lang)?.short ?? 'Hinglish';
  const hasUserAsked = turns.some((t) => t.role === 'user');

  const shellStyle: React.CSSProperties = {
    height: 'calc(100dvh - var(--sat) - var(--topbar-h) - 44px - var(--kb-inset))',
  };

  // ── Language picker ────────────────────────────────────────────────────────
  if (phase === 'language' || phase === 'loading') {
    return (
      <div className="-mx-4 -mb-6 flex flex-col overflow-hidden" style={shellStyle}>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          {phase === 'loading' ? (
            <div className="skeleton h-24 w-24 rounded-3xl" />
          ) : (
            <div className="m-enter flex w-full max-w-sm flex-col items-center">
              <span className="mb-4 overflow-hidden rounded-3xl shadow-lg" style={{ boxShadow: `0 14px 34px -18px ${tint}` }}>
                {astrologer ? <AstrologerAvatar id={astrologer} size={92} /> : null}
              </span>
              <h1 className="text-[20px] font-bold">{persona?.name ?? 'AI Astrologer'}</h1>
              <p className="mt-0.5 text-[13px] text-accent">{persona?.title}</p>
              <p className="mt-5 text-[15px] font-semibold">Namaste 🙏</p>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">
                Aap kis bhasha mein baat karna chahenge?
                <br />Which language would you like to talk in?
              </p>

              <div className="mt-6 w-full space-y-2.5">
                {LANGS.map((l) => (
                  <Pressable
                    key={l.v}
                    feedback="medium"
                    onClick={() => startConnecting(l.v)}
                    className="m-card flex w-full items-center justify-between px-5 py-3.5 text-left"
                  >
                    <span>
                      <span className="block text-[15px] font-bold">{l.label}</span>
                      <span className="block text-[12px] text-muted-foreground">{l.native}</span>
                    </span>
                    <span className="text-[18px]" style={{ color: tint }}>›</span>
                  </Pressable>
                ))}
              </div>
              <p className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> AI Astrologer · reads your real kundli
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Connecting beat ────────────────────────────────────────────────────────
  if (phase === 'connecting') {
    return (
      <div className="-mx-4 -mb-6 flex flex-col overflow-hidden" style={shellStyle}>
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="relative mb-6">
            <span className="absolute inset-0 -m-2 animate-ping rounded-full" style={{ background: `${tint}33` }} />
            <span className="relative block overflow-hidden rounded-full ring-4" style={{ ['--tw-ring-color' as any]: `${tint}55` }}>
              {astrologer ? <AstrologerAvatar id={astrologer} size={104} /> : null}
            </span>
            <span className="absolute bottom-1 right-1 h-5 w-5 rounded-full border-2 border-background bg-emerald-500" />
          </div>
          <h1 className="text-[19px] font-bold">{persona?.name ?? 'AI Astrologer'}</h1>
          <p className="mt-3 flex items-center gap-2 text-[13.5px] text-muted-foreground">
            <TypingDots />
            {connectMsg}
          </p>
        </div>
      </div>
    );
  }

  // ── Chat ───────────────────────────────────────────────────────────────────
  const subtitle = typing ? 'typing…' : 'online';

  return (
    <div className="-mx-4 -mb-6 flex flex-col overflow-hidden" style={shellStyle}>
      {/* header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background px-4 pb-3 pt-1">
        <div className="relative shrink-0">
          <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full ring-2" style={{ ['--tw-ring-color' as any]: `${tint}55` }}>
            {astrologer ? <AstrologerAvatar id={astrologer} size={44} /> : null}
          </span>
          <span className="absolute -bottom-0 -right-0 grid h-3.5 w-3.5 place-items-center rounded-full bg-background">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15.5px] font-bold leading-tight">{persona?.name ?? 'AI Astrologer'}</h1>
            <span className="inline-flex shrink-0 items-center rounded-full bg-accent/15 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-accent">
              AI Astrologer
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-emerald-600">{subtitle}</p>
        </div>
        <Pressable
          feedback="none"
          onClick={newChat}
          disabled={busy}
          aria-label="Start a new chat"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-accent"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </Pressable>
        <Pressable
          feedback="none"
          onClick={cycleLang}
          aria-label={`Language: ${langShort}. Tap to change.`}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-[11.5px] font-bold text-muted-foreground"
        >
          <Languages className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
          {langShort}
        </Pressable>
      </div>

      {/* messages */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-4 pt-4" style={{ background: `${tint}0A` }}>
        {turns.map((turn, ti) => {
          if (turn.role === 'assistant' && turn.chart) {
            return (
              <div key={ti} className="flex items-end gap-2">
                {astrologer ? (
                  <span className="shrink-0 self-end overflow-hidden rounded-full">
                    <AstrologerAvatar id={astrologer} size={30} />
                  </span>
                ) : null}
                <div className="m-card m-enter w-full max-w-[86%] p-3">
                  {chart?.planets ? (
                    <NorthIndianChart planets={planetsMapped} ascendantSign={chart.ascendant?.sign} shortNames />
                  ) : (
                    <div className="skeleton aspect-square w-full" />
                  )}
                  <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
                    Aapki Janma Kundli (D1)
                  </p>
                </div>
              </div>
            );
          }
          if (turn.role === 'user') {
            return (
              <div key={ti} className="flex flex-col items-end">
                <div className="m-enter max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-accent-foreground shadow-lg shadow-accent/20">
                  <p className="selectable whitespace-pre-wrap text-[14.5px] leading-relaxed">{turn.bubbles[0]}</p>
                </div>
                <span className="mt-1 px-1 text-[10.5px] text-muted-foreground">{fmtTime(turn.time)}</span>
              </div>
            );
          }
          return (
            <div key={ti} className="flex items-end gap-2">
              {astrologer ? (
                <span className="shrink-0 self-end overflow-hidden rounded-full">
                  <AstrologerAvatar id={astrologer} size={30} />
                </span>
              ) : null}
              <div className="flex min-w-0 max-w-[86%] flex-col items-start">
                <div
                  className={`m-enter rounded-2xl rounded-bl-md px-4 py-2.5 ${
                    turn.error ? 'border border-destructive/40 bg-destructive/10 text-destructive' : 'm-card'
                  }`}
                >
                  {turn.error ? (
                    <p className="selectable text-[14px] leading-relaxed">{turn.bubbles[0]}</p>
                  ) : (
                    <div className="selectable text-[14.5px] leading-relaxed">
                      <AnswerText text={turn.bubbles[0]} />
                    </div>
                  )}
                </div>
                <span className="mt-1 flex items-center gap-1.5 px-1 text-[10.5px] text-muted-foreground">
                  {fmtTime(turn.time)}
                  {!turn.error && <SpeakButton text={turn.bubbles.join(' ')} lang={lang} context="chat" />}
                </span>
              </div>
            </div>
          );
        })}

        {typing && (
          <div className="flex items-end gap-2">
            {astrologer ? (
              <span className="shrink-0 self-end overflow-hidden rounded-full">
                <AstrologerAvatar id={astrologer} size={30} />
              </span>
            ) : null}
            <div className="m-card flex items-center rounded-2xl rounded-bl-md px-4 py-3">
              <TypingDots />
            </div>
          </div>
        )}

        {!hasUserAsked && !busy && persona?.suggested && persona.suggested.length > 0 && (
          <div className="m-enter pt-1">
            <p className="mb-2 pl-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Try asking</p>
            <div className="flex flex-wrap gap-2">
              {persona.suggested.map((q) => (
                <Pressable
                  key={q}
                  subtle
                  disabled={busy}
                  onClick={() => send(q)}
                  className="m-card min-h-[44px] rounded-full px-3.5 py-2 text-left text-[12.5px] font-medium"
                >
                  {q}
                </Pressable>
              ))}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* composer */}
      <form onSubmit={onSubmit} className="shrink-0 border-t border-border bg-background px-4 pb-3 pt-3">
        {persona?.disclaimer && (
          <p className="mb-2 px-1 text-[11px] leading-snug text-muted-foreground">{persona.disclaimer}</p>
        )}
        <div className="flex items-end gap-2">
          <input
            className="h-12 min-w-0 flex-1 rounded-2xl border border-input bg-card px-4 text-[15px] outline-none transition-colors focus:border-accent"
            placeholder={listening ? 'Listening… speak now' : 'Type a message…'}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            disabled={busy}
          />
          {voiceOn && (
            <Pressable
              onClick={toggleVoice}
              feedback="medium"
              disabled={busy}
              aria-label={listening ? 'Stop voice input' : 'Speak your question'}
              className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full border transition-colors ${
                listening ? 'border-transparent bg-red-500 text-white' : 'border-input bg-card text-muted-foreground'
              }`}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />}
              <Mic className="relative h-[19px] w-[19px]" strokeWidth={2.2} />
            </Pressable>
          )}
          <Pressable
            onClick={() => send(question)}
            feedback="medium"
            disabled={!question.trim() || busy}
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
