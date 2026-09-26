/**
 * "Faisla — ab kya karun?"
 *
 * This screen was a form once: a box for the decision, then three multiple-
 * choice questions, then a card. It worked and it felt like paperwork — which
 * is the one thing the chatbot people already open at one in the morning never
 * feels like. Nobody arrives with a well-formed question. They arrive with
 * "aaj bahut bura din tha, usne reply nahi kiya" and they want a reply to THAT
 * before anything else.
 *
 * So it is a conversation. They talk (or speak — the mic is here for the hour
 * this gets used), the app answers what they actually said, asks ONE thing at a
 * time with chips they can ignore, and only when there is a real decision on
 * the table does it offer the card. Someone who came only to say it out loud
 * gets heard and nothing is sold to them.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Clock, Copy, CopyCheck, History as HistoryIcon, Mic, MicOff,
  MessageSquareText, SendHorizontal, ShieldAlert, Sparkles, TriangleAlert,
} from 'lucide-react';
import { useSignInGate } from "@/lib/gate";
import { useT } from '@/lib/i18n';
import { getLang } from '@/lib/prefs';
import { haptic } from '@/lib/native';
import { voiceAvailable, startVoice, stopVoice, type VoiceLang } from '@/lib/voice';
import { Pressable } from '@/components/mobile/Pressable';

type Msg = {
  role: 'user' | 'assistant';
  text: string;
  /** Suggestions under an assistant message — tappable, never compulsory. */
  chips?: string[];
  card?: any;
  refusal?: string;
};

const VERDICT: Record<string, { label: string; tint: string }> = {
  yes: { label: 'Yes', tint: '#16A34A' },
  wait: { label: 'Wait', tint: '#B7791F' },
  no: { label: 'No', tint: '#DC2626' },
};

/** What the app says instead of answering, and who should answer instead. */
const REFUSALS: Record<string, { title: string; body: string }> = {
  self_harm: {
    title: 'Please talk to someone tonight',
    body: 'This is bigger than an app, and you deserve a real person on the other end. In India, Tele-MANAS is 14416 and KIRAN is 1800-599-0019 — free, 24 hours, in your own language. If you are in danger right now, call 112.',
  },
  harm_other: {
    title: "I can't help with that one",
    body: 'Anything meant to hurt someone is not something this app will plan. If you are angry at someone right now, the useful next step is talking to a person you trust before you do anything.',
  },
  medical: {
    title: 'This one belongs with a doctor',
    body: 'Medicines, doses and procedures are a doctor’s call, not an app’s — getting it wrong here costs too much. Ask your doctor or a pharmacist; they can answer this properly in two minutes.',
  },
  legal: {
    title: 'This one needs a lawyer',
    body: 'Cases, police matters and filings turn on details and deadlines that only a lawyer can weigh. Many places offer a free first consultation — that is the right next call.',
  },
};

export default function DecidePage() {
  const t = useT();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const lang = getLang();

  const [chartId, setChartId] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [ready, setReady] = useState(false);
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [micOk, setMicOk] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const sentFromUrl = useRef(false);

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d) => setChartId(Array.isArray(d) && d[0]?.id ? d[0].id : ''))
      .catch(() => {});
    voiceAvailable().then(setMicOk).catch(() => setMicOk(false));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, thinking]);

  // Arrived from the chat with the question already asked — don't make them
  // type it a second time.
  useEffect(() => {
    const q = params.get('q');
    if (q && !sentFromUrl.current) { sentFromUrl.current = true; void send(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const talk = async (history: Msg[]) => {
    setThinking(true); setErr(null);
    try {
      const r = await fetch('/api/decide/talk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartId, language: lang,
          history: history.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const d = await r.json();
      if (d.refusal) { setMsgs((m) => [...m, { role: 'assistant', text: '', refusal: d.refusal }]); return; }
      if (d.error) { setErr(d.error); return; }
      setMsgs((m) => [...m, { role: 'assistant', text: [d.reply, d.ask?.question].filter(Boolean).join('\n\n'), chips: d.ask?.options ?? [] }]);
      setReady(!!d.ready);
      if (d.summary) setSummary(d.summary);
    } catch {
      setErr(t('Network error.'));
    } finally {
      setThinking(false);
    }
  };

  const needsSignIn = useSignInGate();

  const send = async (text: string) => {
    if (needsSignIn("decide", () => void send(text))) return;
    const clean = text.trim();
    if (!clean || thinking) return;
    haptic.tap();
    setDraft('');
    const next: Msg[] = [...msgs, { role: 'user', text: clean }];
    setMsgs(next);
    await talk(next);
  };

  /** The card — asked for, never forced, because it costs them something. */
  const getCard = async () => {
    haptic.tap();
    setBusy(true); setErr(null);
    try {
      const question = summary || msgs.find((m) => m.role === 'user')?.text || '';
      const conversation = msgs.map((m) => `${m.role === 'user' ? 'Them' : 'You'}: ${m.text}`).join('\n');
      const r = await fetch('/api/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, question, language: lang, answers: { conversation } }),
      });
      const d = await r.json();
      if (d.refusal) { setMsgs((m) => [...m, { role: 'assistant', text: '', refusal: d.refusal }]); return; }
      if (d.error) { setErr(d.error); return; }
      setMsgs((m) => [...m, { role: 'assistant', text: '', card: d }]);
      setReady(false);
      haptic.success();
    } catch {
      setErr(t('Network error.'));
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    haptic.tap();
    if (micOn) { await stopVoice(); setMicOn(false); return; }
    const started = await startVoice({
      lang: (lang === 'hi' ? 'hi' : lang === 'hinglish' ? 'hinglish' : 'en') as VoiceLang,
      onPartial: (txt) => setDraft(txt),
      onFinal: (txt) => { setDraft(txt); setMicOn(false); },
      onError: (m) => { setErr(m); setMicOn(false); },
      onEnd: () => setMicOn(false),
    });
    setMicOn(started);
  };

  const copy = async (which: string, text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* clipboard blocked */ }
    haptic.success();
    setCopied(which);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 pb-2 pt-1">
        <Pressable onClick={() => nav(-1)} subtle className="tap-44 -ml-2 grid h-10 w-10 place-items-center rounded-full">
          <ArrowLeft className="h-5 w-5" />
        </Pressable>
        <h1 className="text-[19px] font-bold tracking-tight">{t('What should I do?')}</h1>
        <Pressable to="/decide/history" subtle className="ml-auto flex items-center gap-1 text-[13px] font-semibold text-muted-foreground">
          <HistoryIcon className="h-4 w-4" /> {t('Past decisions')}
        </Pressable>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-3">
        {/* An empty screen that says what this is for, in one line, with three
            openers — because "what should I do" is hard to start typing. */}
        {!msgs.length && (
          <section className="m-card space-y-3 p-4">
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <Sparkles className="h-[18px] w-[18px] text-accent" />
              {t('Tell me what is going on')}
            </p>
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              {t('Jaise kisi dost se kehte ho, waise hi likho ya bolo. Koi sawaal banane ki zaroorat nahi — jo chal raha hai wahi bata do.')}
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                'Usse 3 din se baat nahi hui',
                'Job offer aaya hai, samajh nahi aa raha',
                'Aaj din bahut kharab tha',
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => void send(t(s))}
                  className="rounded-full border-2 border-border bg-card px-3.5 py-2 text-[13px] font-semibold text-foreground/80"
                >
                  {t(s)}
                </button>
              ))}
            </div>
          </section>
        )}

        {msgs.map((m, i) => (
          <div key={i}>
            {m.role === 'user' && (
              <div className="flex justify-end">
                <p className="selectable max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[14.5px] leading-relaxed text-accent-foreground">
                  {m.text}
                </p>
              </div>
            )}

            {m.role === 'assistant' && m.text && (
              <div className="max-w-[92%]">
                <p className="selectable whitespace-pre-wrap rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5 text-[14.5px] leading-relaxed text-foreground">
                  {m.text}
                </p>
                {!!m.chips?.length && i === msgs.length - 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.chips.map((c) => (
                      <button
                        key={c}
                        onClick={() => void send(c)}
                        className="rounded-full border-2 border-accent/40 bg-accent/10 px-3.5 py-2 text-[13px] font-semibold text-accent"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {m.refusal && (
              <div className="m-card space-y-2 border-l-4 border-l-rose-400 p-4">
                <p className="flex items-center gap-2 text-[15px] font-bold">
                  <ShieldAlert className="h-[18px] w-[18px] text-rose-500" />
                  {t(REFUSALS[m.refusal]?.title ?? "I can't help with that one")}
                </p>
                <p className="text-[14px] leading-relaxed text-foreground/85">{t(REFUSALS[m.refusal]?.body ?? '')}</p>
              </div>
            )}

            {m.card && <DecisionCard card={m.card} t={t} copied={copied} copy={copy} />}
          </div>
        ))}

        {thinking && (
          <div className="flex w-16 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3.5 py-3">
            {[0, 1, 2].map((d) => (
              <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d * 0.15}s` }} />
            ))}
          </div>
        )}

        {err && <p className="px-1 text-[13px] font-medium text-destructive">{err}</p>}

        {/* The offer, once there is actually something to decide. */}
        {ready && !busy && (
          <button
            onClick={getCard}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[15px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
          >
            <Sparkles className="h-[18px] w-[18px]" />
            {t('Ab faisla batao')}
          </button>
        )}
        {busy && (
          <div className="m-card space-y-2.5 p-4">
            <div className="skeleton h-[22px] w-2/3" />
            <div className="skeleton h-[15px]" />
            <div className="skeleton h-[15px] w-1/2" />
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Say it — typed or spoken. */}
      <div className="sticky bottom-0 flex items-end gap-2 border-t border-border bg-background pb-2 pt-2">
        <textarea
          ref={boxRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
          rows={1}
          maxLength={800}
          placeholder={micOn ? t('Listening…') : t('Jo chal raha hai, likho…')}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border-2 border-border bg-card px-3.5 py-2.5 text-[15px] leading-relaxed outline-none focus:border-accent"
        />
        {micOk && (
          <button
            onClick={toggleMic}
            aria-label={t('Speak')}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 ${micOn ? 'border-rose-400 bg-rose-50 text-rose-500' : 'border-border text-muted-foreground'}`}
          >
            {micOn ? <MicOff className="h-[19px] w-[19px]" /> : <Mic className="h-[19px] w-[19px]" />}
          </button>
        )}
        <button
          onClick={() => void send(draft)}
          disabled={!draft.trim() || thinking}
          aria-label={t('Send')}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
        >
          <SendHorizontal className="h-[19px] w-[19px]" />
        </button>
      </div>
    </div>
  );
}

/** The answer itself — a word, a line, a clock, and the thing to send. */
function DecisionCard({
  card, t, copied, copy,
}: { card: any; t: (s: string) => string; copied: string | null; copy: (k: string, v: string) => void }) {
  return (
    <div className="mt-1 space-y-2.5">
      <div className="m-card border-l-4 p-4" style={{ borderLeftColor: VERDICT[card.verdict]?.tint ?? '#B7791F' }}>
        <span
          className="inline-block rounded-full px-3 py-1 text-[11.5px] font-bold uppercase tracking-wide text-white"
          style={{ background: VERDICT[card.verdict]?.tint ?? '#B7791F' }}
        >
          {t(VERDICT[card.verdict]?.label ?? 'Wait')}
        </span>
        <p className="mt-2 text-[18px] font-bold leading-snug">{card.headline}</p>
        <p className="selectable mt-1.5 whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground/85">{card.why}</p>
      </div>

      {card.window?.window && (
        <div className="m-card flex items-start gap-3 p-4">
          <Clock className="mt-0.5 h-[18px] w-[18px] shrink-0 text-accent" />
          <div className="min-w-0">
            {/* Labelled "when to do it", never "do it now": the verdict above
                may be a no, and a clock that argues with it reads as a bug. */}
            <p className="text-[14.5px] font-bold">
              {card.window.when === 'tomorrow' ? t('Best time tomorrow') : t('Best time today')}
              {': '}{card.window.window}
            </p>
            {card.window.avoid && (
              <p className="mt-0.5 text-[12.5px] text-muted-foreground">{t('Stay out of')}: {card.window.avoid}</p>
            )}
          </div>
        </div>
      )}

      {card.draft?.direct && (
        <div className="m-card space-y-2.5 p-4">
          <p className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
            <MessageSquareText className="h-4 w-4" /> {t('What to send')}
          </p>
          {([['direct', t('Straight')], ['soft', t('Gentler')]] as const).map(([k, label]) =>
            card.draft[k] ? (
              <div key={k} className="rounded-2xl border-2 border-border bg-muted/40 p-3">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="selectable mt-1 text-[14.5px] leading-relaxed">{card.draft[k]}</p>
                <button
                  onClick={() => copy(k, card.draft[k])}
                  className="mt-2 flex items-center gap-1.5 rounded-full border-2 border-border px-3 py-1.5 text-[12.5px] font-bold"
                >
                  {copied === k ? <CopyCheck className="h-[14px] w-[14px]" /> : <Copy className="h-[14px] w-[14px]" />}
                  {copied === k ? t('Copied') : t('Copy')}
                </button>
              </div>
            ) : null,
          )}
        </div>
      )}

      {card.if_it_goes_wrong && (
        <div className="m-card p-4">
          <p className="text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">{t('If it goes the other way')}</p>
          <p className="selectable mt-1 whitespace-pre-wrap text-[14.5px] leading-relaxed text-foreground/85">{card.if_it_goes_wrong}</p>
        </div>
      )}

      {!!card.avoid?.length && (
        <div className="m-card p-4">
          <p className="flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">
            <TriangleAlert className="h-4 w-4" /> {t("Don't do this")}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {card.avoid.map((a: string, i: number) => (
              <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed text-foreground/85">
                <span className="mt-[9px] h-[5px] w-[5px] shrink-0 rounded-full bg-accent" />
                <span className="min-w-0">{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.id && <OutcomeRow id={card.id} t={t} />}
    </div>
  );
}

/**
 * "Did it work?" — one tap, free, and the only thing here that makes the next
 * decision better than the last one.
 */
function OutcomeRow({ id, t }: { id: string; t: (s: string) => string }) {
  const [saved, setSaved] = useState<string | null>(null);
  const options: Array<[string, string]> = [
    ['went_well', 'It went well'],
    ['no_reply', 'No reply yet'],
    ['went_badly', "It didn't go well"],
    ['did_not_do', "I didn't do it"],
  ];
  const send = async (o: string) => {
    haptic.tap();
    setSaved(o);
    await fetch(`/api/decide/${id}/outcome`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outcome: o }),
    }).catch(() => {});
  };
  return (
    <div className="m-card p-4">
      <p className="text-[12.5px] font-bold uppercase tracking-wider text-muted-foreground">{t('Later: what happened?')}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([key, label]) => (
          <button
            key={key}
            onClick={() => send(key)}
            className={`rounded-full border-2 px-3.5 py-2 text-[13px] font-semibold ${
              saved === key ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-card text-foreground/80'
            }`}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {saved && <p className="mt-2 text-[12.5px] text-muted-foreground">{t('Saved — this makes your next decision sharper.')}</p>}
    </div>
  );
}
