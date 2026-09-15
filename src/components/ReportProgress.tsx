/**
 * What is happening during the forty seconds a report takes.
 *
 * It was a spinning icon and one line of text for up to a minute. A wait that
 * says nothing reads as a hang, and people leave or tap back — and a report
 * abandoned half-way was still paid for.
 *
 * Every step shown here is a thing the server genuinely does, in this order:
 * read the chart, line up the dasha periods, write each area, then check every
 * placement it wrote against the chart. Nothing is invented to look busy, and
 * the last step deliberately waits there instead of claiming "almost done" on a
 * timer that knows nothing about the real request.
 */
import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n';

const STEPS = [
  { key: 'Reading your birth chart', after: 0 },
  { key: 'Lining up your dasha periods', after: 4 },
  { key: 'Writing each area of your life', after: 9 },
  { key: 'Checking every placement against your chart', after: 26 },
];

export function ReportProgress({ title }: { title?: string }) {
  const t = useT();
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const active = STEPS.reduce((i, s, n) => (secs >= s.after ? n : i), 0);

  return (
    <div className="mx-auto max-w-sm py-14">
      <p className="mb-6 text-center text-[15px] font-bold">{title ?? t('Preparing your report')}</p>
      <ol className="space-y-3.5">
        {STEPS.map((s, n) => {
          const done = n < active;
          const now = n === active;
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  done ? 'border-accent bg-accent text-accent-foreground'
                    : now ? 'border-accent text-accent'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {done ? <Check className="h-4 w-4" strokeWidth={3} />
                  : now ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <span className="text-[11px] font-bold">{n + 1}</span>}
              </span>
              <span className={`text-[14px] ${now ? 'font-bold text-foreground' : done ? 'text-foreground/80' : 'text-muted-foreground'}`}>
                {t(s.key)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-7 text-center text-[12px] text-muted-foreground">
        {t('This usually takes under a minute. You can keep this screen open.')}
      </p>
    </div>
  );
}
