/**
 * Home, on a screen — the astrologer, waiting.
 *
 * A desktop window is not a tall phone: the rail and the top strip already
 * carry navigation, so this page is the product itself — one dark panel with
 * the chart's own facts and a box to ask in, the chart drawn beside what it
 * means, the six chart screens as a coloured set, and today's hours.
 *
 * The phone keeps its own screen (HomeMobile), untouched. Sharing one layout
 * is what put this design on people's phones, where it was never meant to go.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ChevronRight, MessageCircle, FileText, HeartHandshake, Compass, Clock,
  Grid2x2, Orbit, Sparkles, History, Leaf, CalendarDays, MapPin,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { NorthIndianChart } from '@/components/NorthIndianChart';
import YouCard from '@/components/YouCard';
import TodayCard from '@/components/TodayCard';
import PanchangToday from '@/components/PanchangToday';
import DayHours from '@/components/DayHours';
import ChartAvatar from '@/components/ChartAvatar';
import HomeHero from '@/components/HomeHero';
import { useAuth } from '@/auth';
import { pickPrimary } from '@/lib/primary';
import { useT, formatDate } from '@/lib/i18n';
import { cachedProfiles, setCachedProfiles } from './profiles';

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** What people actually open the app to ask, in their own words. */
const STARTERS = [
  'Meri naukri kab lagegi?',
  'Shaadi ka samay kab hai?',
  'Aaj ka din kaisa rahega?',
  'Paisa kab tak theek hoga?',
];

/**
 * The chart's own screens. Each keeps a colour of its own, the way a real
 * product's sections do — a grid where every tile is the same accent reads as
 * a menu; a grid with a palette reads as a place.
 *
 * None of these repeats the rail or the top strip: they are all about THIS
 * chart, and they live nowhere else.
 */
const EXPLORE = [
  { key: 'd1', label: 'Lagna chart', sub: 'D1 — the whole life', icon: Grid2x2, tint: '#4338ca', to: (id: string) => `/chart/${id}/d1` },
  { key: 'd9', label: 'Navamsa', sub: 'D9 — marriage, dharma', icon: Sparkles, tint: '#db2777', to: (id: string) => `/chart/${id}/d9` },
  { key: 'div', label: 'Divisional charts', sub: 'D10, D6, D11 and more', icon: Orbit, tint: '#2563eb', to: (id: string) => `/chart/${id}/divisional` },
  { key: 'dasha', label: 'Dasha timeline', sub: 'Which period, and when', icon: Clock, tint: '#0d9488', to: (id: string) => `/chart/${id}/dasha` },
  { key: 'past', label: 'Life timeline', sub: 'What the years did', icon: History, tint: '#7c3aed', to: (id: string) => `/timeline/${id}` },
  { key: 'rem', label: 'Remedies', sub: 'What actually helps', icon: Leaf, tint: '#059669', to: (id: string) => `/chart/${id}/remedies` },
];

/** For a visitor with no chart yet: what the conversation can cover. */
const CAN_ASK = [
  { icon: MessageCircle, text: 'Career, money, marriage, health — asked in plain words' },
  { icon: FileText, text: 'A full life report: seven areas, each with its years' },
  { icon: HeartHandshake, text: 'Kundli matching, with the doshas explained' },
  { icon: Compass, text: 'A real decision — should I, and when' },
];

export default function HomeDesktop() {
  const t = useT();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[] | null>(cachedProfiles());
  const [chart, setChart] = useState<any>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        setCachedProfiles(list);
        setProfiles(list);
      })
      .catch(() => setProfiles((prev) => prev ?? []));
  }, []);

  // Your own kundli, not the newest one — the newest is very often a partner's.
  const primary = useMemo(() => pickPrimary(profiles, user?.name), [profiles, user?.name]);
  const firstName = (user?.name || '').trim().split(/\s+/)[0];

  // The chart's own facts, for the panel beside the conversation.
  useEffect(() => {
    if (!primary?.id) { setChart(null); return; }
    let alive = true;
    fetch(`/api/chart/${primary.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setChart(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [primary?.id]);

  /** Send them into the chat with the question already on its way. */
  const ask = (text: string) => {
    const q = text.trim();
    if (!primary) { navigate('/create-chart'); return; }
    navigate(q ? `/chat/${primary.id}?q=${encodeURIComponent(q)}` : `/chat/${primary.id}`);
  };

  // Their own chart, drawn on their own dashboard. A page about someone that
  // never shows their chart is a page about nobody.
  const [d1, setD1] = useState<any>(null);
  useEffect(() => {
    if (!primary?.id) { setD1(null); return; }
    let alive = true;
    fetch(`/api/chart/${primary.id}/d1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && !d.error) setD1(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [primary?.id]);

  const lagna = chart?.summary?.lagna || chart?.ascendant?.sign;
  const moon = chart?.summary?.rashi || chart?.summary?.moon_sign;
  const nakshatra = chart?.summary?.nakshatra || chart?.ascendant?.nakshatra;
  const maha = chart?.dashas?.current_mahadasha || chart?.summary?.current_mahadasha;
  const antar = chart?.dashas?.current_antardasha;

  return (
    <div className="home-grid pt-2">
      <div className="home-main">
        {/* ── The astrologer ──────────────────────────────────────────────
            One card, and it is a conversation: who is here, what they can be
            asked, and the box to ask in. */}
        <HomeHero
          primary={primary}
          chart={chart}
          firstName={firstName}
          greeting={t(greetingKey())}
          onAsk={ask}
        />

        {/* Four things people actually ask, one tap from an answer. */}
        {primary && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((q, i) => (
              <motion.button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="rounded-full border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-foreground/80 shadow-sm transition-colors hover:border-accent hover:text-accent"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 + i * 0.05, duration: 0.3 }}
              >
                {q}
              </motion.button>
            ))}
          </div>
        )}

        {/* ── Their chart, and what it says about them ──────────────────
            The dashboard should be recognisably THEIRS: the birth details they
            gave, the chart those details produced, and a few honest lines about
            what it means — not a menu. */}
        {primary && d1?.planets?.length && (
          <motion.section
            className="home-chart m-card p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15.5px] font-bold leading-tight">
                  {t('Your birth chart')}
                </h3>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
                  {chart?.birth_details?.date_of_birth && (
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-[13px] w-[13px] shrink-0" />
                      {formatDate(chart.birth_details.date_of_birth, undefined, { weekday: false })}
                      {chart.birth_details.time_of_birth ? ` · ${chart.birth_details.time_of_birth}` : ''}
                    </span>
                  )}
                  {chart?.birth_details?.place_of_birth && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-[13px] w-[13px] shrink-0" />
                      {chart.birth_details.place_of_birth}
                    </span>
                  )}
                </p>
              </div>
              <Pressable
                to={`/chart/${primary.id}/d1`}
                subtle
                className="flex shrink-0 items-center gap-1 text-[13px] font-bold text-accent"
              >
                {t('Full chart')} <ChevronRight className="h-4 w-4" />
              </Pressable>
            </div>

            <div className="chart-split grid gap-5">
              <div className="mx-auto w-full max-w-[340px]">
                <NorthIndianChart
                  planets={(d1.planets ?? []).map((p: any) => ({ ...p, short: String(p.planet).slice(0, 2) }))}
                  ascendantSign={d1.ascendant?.sign || lagna}
                  shortNames
                />
              </div>
              {/* Plain language, from the same computed facts — this is the
                  part people read first and the only part they quote back. */}
              <div className="min-w-0">
                <YouCard chartId={primary.id} name={primary.name} moonSign={moon} dashaLord={maha} />
              </div>
            </div>
          </motion.section>
        )}

        {/* ── Their chart's own screens ─────────────────────────────── */}
        {primary && (
          <section>
            <h3 className="mb-3 px-1 text-[12px] font-bold uppercase tracking-widest text-muted-foreground">
              {t('Explore your chart')}
            </h3>
            <div className="explore-grid grid grid-cols-2 gap-3">
              {EXPLORE.map(({ key, label, sub, icon: Icon, tint, to }, i) => (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * i, duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Pressable to={to(primary.id)} className="m-card va-card-hover group block h-full p-4 text-left">
                    <span
                      className="mb-3 grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm"
                      style={{ background: tint }}
                    >
                      <Icon className="h-[19px] w-[19px]" />
                    </span>
                    <p className="text-[14.5px] font-bold leading-tight">{t(label)}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{t(sub)}</p>
                  </Pressable>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* ── Today's hours ─────────────────────────────────────────────
            Real, computed, and free of any account — the answer to "is now a
            good time" that people check before they do anything. */}
        <DayHours />

        {/* ── Where the conversation continues ──────────────────────────── */}
        {primary && (
          <motion.section
            className="home-jump grid grid-cols-2 gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <Pressable to={`/chat/${primary.id}`} className="m-card flex items-center gap-3 p-4 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                <MessageCircle className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold leading-tight">{t('Open the chat')}</span>
                <span className="block text-[12px] text-muted-foreground">{t('Everything you have asked')}</span>
              </span>
            </Pressable>
            <Pressable to={`/reports/${primary.id}`} className="m-card flex items-center gap-3 p-4 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
                <FileText className="h-[19px] w-[19px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-bold leading-tight">{t('Life report')}</span>
                <span className="block text-[12px] text-muted-foreground">{t('Seven areas, with dates')}</span>
              </span>
            </Pressable>
          </motion.section>
        )}
      </div>

      <div className="home-side">
        {/* ── Who is being read ─────────────────────────────────────────── */}
        {primary && (
          <motion.section
            className="home-profile m-card p-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <ChartAvatar name={primary.name} size={46} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-bold leading-tight">{primary.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {primary.date ? formatDate(primary.date, undefined, { weekday: false }) : ''}
                </p>
              </div>
            </div>

            {(lagna || moon || nakshatra) && (
              <div className="mt-3.5 grid grid-cols-3 gap-2">
                {[[t('Lagna'), lagna], [t('Moon'), moon], [t('Nakshatra'), nakshatra]].map(([label, value]) => (
                  <div key={String(label)} className="rounded-xl bg-muted px-2.5 py-2">
                    <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                    <p className="mt-0.5 truncate text-[13px] font-bold">{value ? t(String(value)) : '—'}</p>
                  </div>
                ))}
              </div>
            )}

            {maha && (
              <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Clock className="h-[14px] w-[14px] shrink-0 text-accent" />
                {t('Running now')}:{' '}
                <span className="font-bold text-foreground">{antar ? `${maha}–${antar}` : maha}</span>
              </p>
            )}

            <Pressable
              to={`/dashboard/${primary.id}`}
              subtle
              className="mt-3 flex items-center gap-1 text-[13px] font-bold text-accent"
            >
              {t('Open kundli')} <ChevronRight className="h-4 w-4" />
            </Pressable>
          </motion.section>
        )}

        {/* ── The day ───────────────────────────────────────────────────── */}
        <section className="home-today">
          {primary ? <TodayCard chartId={primary.id} variant="dark" /> : <PanchangToday />}
        </section>

        {/* ── What the conversation covers, for someone deciding whether to
            give their birth details at all. */}
        {!primary && (
          <motion.section
            className="m-card p-5"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45 }}
          >
            <h3 className="text-[15.5px] font-bold leading-tight">{t('What you can ask')}</h3>
            <ul className="mt-3 space-y-2.5">
              {CAN_ASK.map(({ icon: Icon, text }, i) => (
                <motion.li
                  key={text}
                  className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted-foreground"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.16 + i * 0.06, duration: 0.32 }}
                >
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent">
                    <Icon className="h-[15px] w-[15px]" />
                  </span>
                  {t(text)}
                </motion.li>
              ))}
            </ul>
          </motion.section>
        )}
      </div>
    </div>
  );
}
