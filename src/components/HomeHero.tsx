/**
 * The block that owns the top of the screen.
 *
 * Everything on this page was a white card on a cream page, which is calm and,
 * on a 1500px monitor, completely flat — nothing anchored the screen, so it
 * read as empty however much was on it. The sibling app solves it with one
 * dark panel at the top carrying the person's own name and their signs, and it
 * is the single biggest reason that app looks finished. Same idea here: one
 * deep panel, the chart's own facts in it, a slow zodiac wheel behind, and the
 * box to ask a question sitting right in it.
 *
 * With no kundli yet the same panel makes the one ask it needs, so a first-time
 * visitor gets a designed screen rather than a placeholder.
 */
import { useState } from 'react';
import { motion } from 'motion/react';
import { Sparkles, ArrowUp, Plus, CalendarDays, MapPin, ChevronRight } from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useT, formatDate } from '@/lib/i18n';

/** Twelve spokes and a ring of marks — drawn, not loaded, so it costs nothing. */
function ZodiacWheel({ className = '' }: { className?: string }) {
  const spokes = Array.from({ length: 12 }, (_, i) => i);
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <circle cx="100" cy="100" r="72" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 6" />
      <circle cx="100" cy="100" r="46" fill="none" stroke="currentColor" strokeWidth="0.5" />
      {spokes.map((i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        return (
          <g key={i}>
            <line
              x1={100 + cos * 46} y1={100 + sin * 46}
              x2={100 + cos * 92} y2={100 + sin * 92}
              stroke="currentColor" strokeWidth="0.6"
            />
            <circle cx={100 + cos * 82} cy={100 + sin * 82} r={i % 3 === 0 ? 3 : 1.8} fill="currentColor" />
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  /** The kundli being read, if there is one. */
  primary: { id: string; name: string; date?: string } | null | undefined;
  /** Its computed chart, when it has arrived. */
  chart: any;
  firstName: string;
  greeting: string;
  /** Send them into the chat with this question already on its way. */
  onAsk: (question: string) => void;
}

const tile = 'rounded-2xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5';
const label = 'text-[10px] font-bold uppercase tracking-wider text-white/55';

export default function HomeHero({ primary, chart, firstName, greeting, onAsk }: Props) {
  const t = useT();
  const [draft, setDraft] = useState('');

  const moon = chart?.summary?.rashi || chart?.summary?.moon_sign;
  const lagna = chart?.summary?.lagna || chart?.ascendant?.sign;
  const nakshatra = chart?.summary?.nakshatra || chart?.ascendant?.nakshatra;
  const maha = chart?.dashas?.current_mahadasha || chart?.summary?.current_mahadasha;
  const antar = chart?.dashas?.current_antardasha;
  const b = chart?.birth_details;

  return (
    <motion.section
      className="home-hero relative overflow-hidden rounded-[26px] text-white shadow-xl"
      style={{ background: 'linear-gradient(135deg, #1E293B 0%, #1e1b4b 58%, #2e2a74 100%)' }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* The watermark, clipped to the panel and turning once every few minutes. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]">
        <ZodiacWheel className="spin-slow absolute -right-16 -top-20 h-64 w-64 text-amber-200 opacity-[0.10] md:h-80 md:w-80" />
        <span className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-amber-400/10 blur-3xl" />
      </div>

      <div className="relative p-5 md:p-7">
        {/* Who is here, and for whom. */}
        <div className="flex items-center gap-3">
          <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg">
            <Sparkles className="h-[21px] w-[21px]" />
            <motion.span
              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#1e1b4b] bg-emerald-400"
              animate={{ scale: [1, 1.18, 1] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </span>
          <div className="min-w-0">
            <p className="text-[14.5px] font-bold leading-tight">{t('Your astrologer')}</p>
            <p className="text-[11.5px] font-medium text-white/60">
              {t('Online — reads your chart before answering')}
            </p>
          </div>
        </div>

        <h1 className="mt-4 text-[24px] font-bold leading-[1.2] tracking-tight md:text-[28px]">
          {greeting}{firstName ? `, ${firstName}` : ''}.{' '}
          <span className="text-amber-300">
            {primary ? t('What do you want to know?') : t("Let's start with your kundli.")}
          </span>
        </h1>

        {primary ? (
          <>
            {/* The chart's own facts, in the panel that carries their name. */}
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-2xl border border-amber-300/40 bg-amber-400/15 px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">{t('Moon sign')}</p>
                <p className="mt-0.5 truncate text-[19px] font-extrabold leading-tight">{moon ? t(String(moon)) : '—'}</p>
              </div>
              <div className={tile}>
                <p className={label}>{t('Lagna')}</p>
                <p className="mt-0.5 truncate text-[15px] font-bold leading-tight">{lagna ? t(String(lagna)) : '—'}</p>
              </div>
              <div className={tile}>
                <p className={label}>{t('Nakshatra')}</p>
                <p className="mt-0.5 truncate text-[15px] font-bold leading-tight">{nakshatra || '—'}</p>
              </div>
              <div className={tile}>
                <p className={label}>{t('Running now')}</p>
                <p className="mt-0.5 truncate text-[15px] font-bold leading-tight">
                  {maha ? (antar ? `${maha}–${antar}` : maha) : '—'}
                </p>
              </div>
            </div>

            {/* Ask from here. The chat opens with the question already sent. */}
            <form
              className="mt-4 flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); onAsk(draft); setDraft(''); }}
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('Ask anything about your life…')}
                className="h-[50px] flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 text-[14.5px] text-white outline-none transition-colors placeholder:text-white/45 focus:border-amber-300/70 focus:bg-white/[0.14]"
              />
              <button
                type="submit"
                aria-label={t('Ask')}
                className="grid h-[50px] w-[50px] shrink-0 place-items-center rounded-2xl bg-amber-500 text-white shadow-lg transition-transform hover:scale-[1.04]"
              >
                <ArrowUp className="h-[20px] w-[20px]" strokeWidth={2.6} />
              </button>
            </form>

            {b && (
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-white/55">
                <span className="font-bold text-white/75">{primary.name}</span>
                {b.date_of_birth && (
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="h-[12px] w-[12px]" />
                    {formatDate(b.date_of_birth, undefined, { weekday: false })}
                    {b.time_of_birth ? ` · ${b.time_of_birth}` : ''}
                  </span>
                )}
                {b.place_of_birth && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-[12px] w-[12px]" /> {b.place_of_birth}
                  </span>
                )}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mt-2.5 max-w-[54ch] text-[13.5px] leading-relaxed text-white/70">
              {t('Name, date, time and place of birth — about thirty seconds. After that every answer here is read from your own chart, not from your sun sign.')}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Pressable
                to="/create-chart"
                feedback="medium"
                className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-3 text-[14px] font-bold text-white shadow-lg"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> {t('Create my free kundli')}
              </Pressable>
              <Pressable
                to="/panchang"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-4 py-3 text-[13.5px] font-bold text-white"
              >
                {t("Today's Panchang")} <ChevronRight className="h-4 w-4" />
              </Pressable>
            </div>
          </>
        )}
      </div>
    </motion.section>
  );
}
