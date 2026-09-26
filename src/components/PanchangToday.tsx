/**
 * Today's panchang, for someone who has no kundli yet.
 *
 * The web Home met a first-time visitor with an empty "No kundlis yet" box
 * where the app's own content should be — a product showing nothing on the one
 * screen it has to convince someone with. This needs no account and no chart:
 * the tithi, the paksha, the month and any festival are true for everyone
 * today, they come from a public endpoint, and they are the first proof that
 * the app is actually computing something.
 */
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CalendarDays, Sparkles, ChevronRight, Moon } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useT, formatDate } from '@/lib/i18n';

interface Today {
  date: string;
  weekday: string;
  masa: string;
  paksha: string;
  tithi: string;
  special?: { key: string; kind: string; label: string } | null;
}

export default function PanchangToday() {
  const t = useT();
  const [d, setD] = useState<Today | null>(null);

  useEffect(() => {
    fetch('/api/panchang-today')
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x && setD(x))
      .catch(() => {});
  }, []);

  if (!d) return <div className="skeleton h-[188px] rounded-[22px]" />;

  const rows: Array<[string, string]> = [
    [t('Tithi'), d.tithi],
    [t('Paksha'), d.paksha],
    [t('Month'), d.masa],
  ];

  return (
    <motion.section
      className="m-card relative overflow-hidden p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-accent/15 blur-2xl" />

      <div className="relative flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
          <CalendarDays className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{t('Today')}</p>
          <p className="truncate text-[15px] font-bold leading-tight">
            {formatDate(d.date, undefined, { weekday: true })}
          </p>
        </div>
      </div>

      {d.special && (
        <div className="relative mt-3 flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.07] px-3 py-2">
          <Sparkles className="h-[15px] w-[15px] shrink-0 text-accent" />
          <span className="truncate text-[13px] font-bold">{d.special.label}</span>
        </div>
      )}

      <dl className="relative mt-3.5 grid grid-cols-3 gap-2">
        {rows.map(([label, value], i) => (
          <motion.div
            key={label}
            className="rounded-xl bg-muted px-3 py-2.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.06, duration: 0.35 }}
          >
            <dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 truncate text-[14px] font-bold">{value}</dd>
          </motion.div>
        ))}
      </dl>

      <Pressable
        to="/panchang"
        subtle
        className="relative mt-3 flex items-center gap-1.5 text-[13px] font-bold text-accent"
      >
        <Moon className="h-[15px] w-[15px]" />
        {t('Full panchang, choghadiya and hora')}
        <ChevronRight className="h-4 w-4" />
      </Pressable>
    </motion.section>
  );
}
