/**
 * Ask about this report — the small chat that lives beside it.
 *
 * A friend's reply, not a reading: one or two lines, no astrology words, drawn
 * from the report on screen so the two can never disagree. And it steers the
 * page — ask about money and the Wealth section opens — which is what makes it
 * feel like part of the report rather than a chat box parked next to one.
 */
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, SendHorizontal, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { haptic } from '@/lib/native';

type Msg = { role: 'user' | 'assistant'; text: string };

export default function ReportChat({
  chartId, reportId, lang, onSection,
}: { chartId: string; reportId?: string; lang: string; onSection?: (id: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    haptic.tap();
    setDraft(''); setErr(null);
    const next: Msg[] = [...msgs, { role: 'user', text: q }];
    setMsgs(next);
    setBusy(true);
    try {
      const r = await fetch('/api/report-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, reportId, question: q, language: lang, history: msgs }),
      });
      const d = await r.json();
      if (d.error) { setErr(d.error); return; }
      setMsgs((m) => [...m, { role: 'assistant', text: d.answer }]);
      if (d.section) onSection?.(d.section);
    } catch {
      setErr(t('Network error.'));
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => { haptic.tap(); setOpen(true); }}
        className="fixed right-4 z-40 flex items-center gap-2 rounded-full bg-accent px-4 py-3 text-[14px] font-bold text-accent-foreground shadow-xl shadow-accent/30"
        style={{ bottom: 'calc(var(--sab, 0px) + 84px)' }}
      >
        <MessageCircle className="h-[18px] w-[18px]" /> {t('Ask about this report')}
      </button>
    );
  }

  return (
    <div
      className="fixed inset-x-3 z-40 flex max-h-[62vh] flex-col overflow-hidden rounded-3xl border-2 border-border bg-card shadow-2xl sm:left-auto sm:right-4 sm:w-[380px]"
      style={{ bottom: 'calc(var(--sab, 0px) + 80px)' }}
    >
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <MessageCircle className="h-[18px] w-[18px] text-accent" />
        <p className="flex-1 text-[14px] font-bold">{t('Ask about this report')}</p>
        <button onClick={() => setOpen(false)} aria-label={t('Close')} className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground">
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-4 py-3">
        {!msgs.length && (
          <div className="space-y-2">
            <p className="text-[13px] text-muted-foreground">{t('Short answers, straight from your report.')}</p>
            {['Is saal job badlun?', 'Paise ke liye kaunsa saal achha hai?', 'Sehat ka sabse zyada dhyan kab rakhun?'].map((s) => (
              <button key={s} onClick={() => void send(t(s))} className="block w-full rounded-2xl border-2 border-border px-3 py-2 text-left text-[13px] font-semibold text-foreground/80">
                {t(s)}
              </button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            <p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
              m.role === 'user' ? 'rounded-br-md bg-accent text-accent-foreground' : 'rounded-bl-md bg-muted text-foreground'
            }`}>
              {m.text}
            </p>
          </div>
        ))}
        {busy && (
          <div className="flex w-14 items-center justify-center gap-1 rounded-2xl rounded-bl-md bg-muted px-3 py-3">
            {[0, 1, 2].map((d) => <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${d * 0.15}s` }} />)}
          </div>
        )}
        {err && <p className="text-[12.5px] font-medium text-destructive">{err}</p>}
        <div ref={endRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-border p-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
          rows={1}
          maxLength={400}
          placeholder={t('Ask anything about your report…')}
          className="max-h-24 min-h-[42px] flex-1 resize-none rounded-2xl border-2 border-border bg-card px-3 py-2 text-[14px] outline-none focus:border-accent"
        />
        <button
          onClick={() => void send(draft)}
          disabled={!draft.trim() || busy}
          aria-label={t('Send')}
          className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full bg-accent text-accent-foreground disabled:opacity-40"
        >
          <SendHorizontal className="h-[18px] w-[18px]" />
        </button>
      </div>
    </div>
  );
}
