/**
 * Today's good and bad hours — computed, live, and free to everyone.
 *
 * The dashboard for someone with no kundli had two cards and a lot of cream.
 * This is the answer to that, and it is not filler: choghadiya, rahu kaal and
 * the hora are the things people actually check before making a call, sending
 * a message or leaving the house, they need no birth details at all, and they
 * come from the same engine as everything else here.
 *
 * The bar is the day from sunrise to sunset, coloured by what each stretch is
 * for, with a marker on the hour you are in — so the answer to "is now a good
 * time?" is the first thing the eye lands on.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Sunrise, Sunset, ShieldAlert, Star, ChevronRight } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useT } from '@/lib/i18n';

interface Slot { name: string; start: string; end: string; quality: 'good' | 'bad' | string; blocked?: string | null }
interface Hora { lord: string; start: string; end: string; quality: string; is_day: boolean }
interface Panchang {
  sunrise: string; sunset: string;
  day_choghadiya: Slot[];
  hora: Hora[];
  periods: Record<string, { start: string; end: string }>;
  nakshatra?: string;
}

/** "06:11 AM" → minutes since midnight. */
function mins(t: string): number {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(t || '');
  if (!m) return 0;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + Number(m[2]);
}

const TONE: Record<string, { bar: string; text: string }> = {
  good: { bar: 'bg-emerald-500', text: 'text-emerald-600' },
  bad: { bar: 'bg-rose-400', text: 'text-rose-600' },
  neutral: { bar: 'bg-amber-400', text: 'text-amber-600' },
};
const tone = (q: string) => TONE[q] ?? TONE.neutral;

export default function DayHours() {
  const t = useT();
  const [d, setD] = useState<Panchang | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    const date = new Date().toISOString().slice(0, 10);
    /*
     * Where they are decides sunrise, and everything here hangs off sunrise.
     * Asking the browser for a location on a first visit is a permission prompt
     * nobody expects on a dashboard, so this uses the capital of the timezone
     * it already knows — close enough for a day's segments, and correctable by
     * opening the full panchang, which does ask.
     */
    const at = tz.startsWith('Asia/Kolkata') ? { lat: 28.6139, lon: 77.209 } : { lat: 28.6139, lon: 77.209 };
    fetch(`/api/panchang?date=${date}&lat=${at.lat}&lon=${at.lon}&tz=${encodeURIComponent(tz)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((x) => x && !x.error && setD(x))
      .catch(() => {});
  }, []);

  // The marker moves on its own; a "right now" that is twenty minutes stale is
  // worse than none.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const nowMin = now.getHours() * 60 + now.getMinutes();

  const { slots, span, current, hora } = useMemo(() => {
    const list = (d?.day_choghadiya ?? []).filter((s) => s.start && s.end);
    const from = list.length ? mins(list[0].start) : 0;
    const to = list.length ? mins(list[list.length - 1].end) : 0;
    return {
      slots: list,
      span: { from, to: to > from ? to : from + 1 },
      current: list.find((s) => nowMin >= mins(s.start) && nowMin < mins(s.end)) ?? null,
      hora: (d?.hora ?? []).find((h) => nowMin >= mins(h.start) && nowMin < mins(h.end)) ?? null,
    };
  }, [d, nowMin]);

  if (!d) return <div className="skeleton h-[208px] rounded-[22px]" />;

  const rahu = d.periods?.rahu_kaal;
  const abhijit = d.periods?.abhijit;
  const daytime = nowMin >= span.from && nowMin < span.to;
  const pct = (m: number) => Math.max(0, Math.min(100, ((m - span.from) / (span.to - span.from)) * 100));

  return (
    <motion.section
      className="m-card relative overflow-hidden p-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15.5px] font-bold leading-tight">{t("Today's hours")}</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {t('Choghadiya, rahu kaal and the hora — no birth details needed')}
          </p>
        </div>
        {current && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
            current.quality === 'good' ? 'bg-emerald-500/15 text-emerald-600'
              : current.quality === 'bad' ? 'bg-rose-500/15 text-rose-600'
              : 'bg-amber-500/15 text-amber-600'
          }`}>
            {t('Now')}: {current.name}
          </span>
        )}
      </div>

      {/* The day as one bar. */}
      <div className="relative mt-4">
        <div className="flex h-[26px] w-full overflow-hidden rounded-full border border-border">
          {slots.map((s, i) => {
            const width = ((mins(s.end) - mins(s.start)) / (span.to - span.from)) * 100;
            return (
              <motion.span
                key={`${s.name}-${i}`}
                title={`${s.name} · ${s.start}–${s.end}`}
                className={`${tone(s.quality).bar} h-full`}
                style={{ width: `${width}%` }}
                initial={{ opacity: 0, scaleY: 0.4 }}
                animate={{ opacity: s.quality === 'good' ? 0.95 : 0.8, scaleY: 1 }}
                transition={{ delay: 0.05 + i * 0.03, duration: 0.3 }}
              />
            );
          })}
        </div>
        {daytime && (
          <motion.span
            className="absolute -top-1 h-[34px] w-[3px] rounded-full bg-foreground shadow"
            style={{ left: `${pct(nowMin)}%` }}
            initial={{ opacity: 0, scaleY: 0.5 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ delay: 0.25, duration: 0.3 }}
          />
        )}
        <div className="mt-2 flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
          <span className="flex items-center gap-1.5"><Sunrise className="h-[13px] w-[13px]" /> {d.sunrise}</span>
          <span className="flex items-center gap-1.5">{d.sunset} <Sunset className="h-[13px] w-[13px]" /></span>
        </div>
      </div>

      {/* The two windows people actually plan around, and the hour's lord. */}
      <div className="mt-3.5 grid grid-cols-3 gap-2">
        {abhijit && (
          <div className="rounded-xl bg-emerald-500/10 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
              <Star className="h-[11px] w-[11px]" /> {t('Best')}
            </p>
            <p className="mt-0.5 text-[12.5px] font-bold tabular-nums">{abhijit.start}–{abhijit.end}</p>
          </div>
        )}
        {rahu && (
          <div className="rounded-xl bg-rose-500/10 px-3 py-2">
            <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
              <ShieldAlert className="h-[11px] w-[11px]" /> {t('Avoid')}
            </p>
            <p className="mt-0.5 text-[12.5px] font-bold tabular-nums">{rahu.start}–{rahu.end}</p>
          </div>
        )}
        {hora && (
          <div className="rounded-xl bg-muted px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t('This hour')}</p>
            <p className="mt-0.5 truncate text-[12.5px] font-bold">{t(hora.lord)}</p>
          </div>
        )}
      </div>

      <Pressable to="/panchang" subtle className="mt-3 flex items-center gap-1 text-[13px] font-bold text-accent">
        {t('Full day, hour by hour')} <ChevronRight className="h-4 w-4" />
      </Pressable>
    </motion.section>
  );
}
