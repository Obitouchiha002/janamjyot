import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Plus, ChevronRight, ChevronDown, Clock, MessageCircle, HeartHandshake, Sparkles,
  Sun, TriangleAlert, Info, CheckCircle2, PauseCircle, XCircle,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useCachedFetch } from '@/lib/useCachedFetch';
import { useVisibleInterval } from '@/lib/useVisibleInterval';
import { useAuth } from '@/auth';
import { pickPrimary } from '@/lib/primary';
import { getLang } from '@/lib/prefs';
import { haptic } from '@/lib/native';

/*
 * Home — calm, and useful every day.
 *
 * It used to be a card holding a form (greeting, headline, input, chips,
 * links) over a stack of equal-weight boxes. Now one thing leads: the day,
 * coloured by its mood, with the windows people act on and a live "right
 * now". Under it, the astrologer — a person to talk to, not an empty box —
 * then what is coming (tomorrow, the next vrat and festivals) and their chart
 * in one line. Everything here is calculated; nothing on Home calls an AI.
 */

type L3 = 'en' | 'hi' | 'hinglish';
type Tri = Record<L3, string>;
const lang3 = (): L3 => { const g = getLang(); return g === 'hi' || g === 'hinglish' ? g : 'en'; };
const tr = (x: Tri, l: L3) => x[l] ?? x.en;
const locale = (l: L3) => (l === 'hi' ? 'hi-IN' : 'en-IN');

/**
 * Rotating zodiac ring behind the hero. Pure SVG geometry — 12 house spokes and
 * a marker dot per sign.
 *
 * The signs are deliberately NOT drawn as ♈♉♊ glyphs: Android resolves those
 * codepoints through its emoji font and paints full-colour blobs, ignoring the
 * gold fill (a U+FE0E text-presentation selector doesn't override it inside
 * SVG <text> either).
 */
function ZodiacRing() {
  const spokes = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div className="zodiac-ring pointer-events-none absolute -right-14 -top-10 h-56 w-56 opacity-[0.55]">
      <div className="absolute inset-0 rounded-full bg-accent/20 blur-3xl pulse-glow" />
      <svg viewBox="0 0 200 200" className="spin-slow h-full w-full">
        <circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" strokeWidth="0.6" className="text-accent/40" />
        <circle cx="100" cy="100" r="68" fill="none" stroke="currentColor" strokeWidth="0.4" className="text-accent/25" strokeDasharray="3 5" />
        <circle cx="100" cy="100" r="44" fill="none" stroke="currentColor" strokeWidth="0.4" className="text-accent/20" />
        {spokes.map((i) => {
          const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
          const cos = Math.cos(a);
          const sin = Math.sin(a);
          return (
            <g key={i}>
              <line
                x1={100 + cos * 68}
                y1={100 + sin * 68}
                x2={100 + cos * 86}
                y2={100 + sin * 86}
                stroke="currentColor"
                strokeWidth="0.5"
                className="text-accent/30"
              />
              <circle
                cx={100 + cos * 77}
                cy={100 + sin * 77}
                r={i % 3 === 0 ? 2.6 : 1.5}
                className="fill-accent"
                opacity={i % 3 === 0 ? 0.85 : 0.5}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Profiles survive tab switches in memory. Without this the Home tab refetched
 * on every visit, so the hero flashed back to "Create Your First Kundli" before
 * the user's name reappeared and the kundli list re-rolled its skeletons — the
 * "delay" users noticed. Render the cached list on the first frame, refresh in
 * the background.
 */
let profilesCache: any[] | null = null;

/**
 * Drop the cached list after a create or delete.
 *
 * Without this, coming back to Home after deleting a kundli renders the
 * deleted person's name in the hero for a frame before the refetch corrects
 * it — and if they deleted their only chart, the whole hero is wrong.
 */
export function invalidateProfiles() {
  profilesCache = null;
}

/** Where the chart was cast — the day's windows are for that place and zone. */
function usePlace(chartId: string) {
  const { data: c } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const b = c?.birth_details;
  return {
    chart: c,
    q: c ? `lat=${b?.latitude ?? 28.6139}&lon=${b?.longitude ?? 77.209}&tz=${encodeURIComponent(b?.timezone || 'Asia/Kolkata')}` : null,
  };
}

/** Date, tithi and the greeting — type on the page, not another box. */
function HomeHeader({ chartId, name }: { chartId: string; name: string }) {
  const l = lang3();
  const { q } = usePlace(chartId);
  const { data: p } = useCachedFetch<any>(q ? `/api/panchang-today?${q}&lang=${l}` : null);
  const date = new Date().toLocaleDateString(locale(l), { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <header className="m-enter px-1 pt-1">
      <p className="text-[12.5px] font-semibold text-muted-foreground">
        {date}{p?.tithi ? ` · ${p.tithi}` : ''}
      </p>
      <h1 className="mt-1 text-[28px] font-bold leading-[1.1] tracking-tight">
        {tr({ en: 'Namaste', hi: 'नमस्ते', hinglish: 'Namaste' }, l)},{' '}
        <span className="text-accent">{name}{l === 'en' ? '' : ' ji'}</span>
      </h1>
      {p?.special && (
        <Pressable to="/panchang" feedback="tap"
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-[12.5px] font-bold text-accent">
          <Sparkles className="h-[14px] w-[14px]" />
          {tr({ en: 'Today', hi: 'आज', hinglish: 'Aaj' }, l)}: {p.special.label}
        </Pressable>
      )}
    </header>
  );
}

const TONE = {
  good: { tint: '#22C55E', ink: '#15803D', Icon: Sun },
  advice: { tint: '#C9A24B', ink: '#8A6D1F', Icon: Info },
  warn: { tint: '#F0A93B', ink: '#A16207', Icon: TriangleAlert },
} as const;

/**
 * The "right now" verdict in the reader's language. The endpoint's own line is
 * English-only, and it sat in the middle of a Hinglish card.
 */
function nowLine(n: any, l: L3): string {
  const next = n?.next_good?.start as string | undefined;
  if (n?.verdict === 'go') return tr({ en: 'Good time right now — go ahead', hi: 'अभी अच्छा समय है — आगे बढ़िए', hinglish: 'Abhi accha samay hai — aage badhiye' }, l);
  if (n?.verdict === 'wait') {
    return next
      ? tr({ en: `Better to wait — next good window ${next}`, hi: `थोड़ा रुकिए — अगला अच्छा समय ${next}`, hinglish: `Thoda ruk jaiye — agla accha samay ${next}` }, l)
      : tr({ en: 'Better to wait a little', hi: 'थोड़ा रुकिए', hinglish: 'Thoda ruk jaiye' }, l);
  }
  return next
    ? tr({ en: `Don't start anything new now — next good window ${next}`, hi: `अभी नया काम शुरू न करें — अगला अच्छा समय ${next}`, hinglish: `Abhi naya kaam shuru mat kariye — agla accha samay ${next}` }, l)
    : tr({ en: "Don't start anything new now", hi: 'अभी नया काम शुरू न करें', hinglish: 'Abhi naya kaam shuru mat kariye' }, l);
}

/** The day — the one big thing on Home. */
function TodayHero({ chartId }: { chartId: string }) {
  const l = lang3();
  const [open, setOpen] = useState(false);
  const { data: d } = useCachedFetch<any>(`/api/chart/${chartId}/day-signals?lang=${l}`);
  const { q } = usePlace(chartId);
  const { data: now, refresh } = useCachedFetch<any>(q ? `/api/right-now?${q}` : null);
  // Windows roll over while the screen is open — poll only while it is visible.
  useVisibleInterval(refresh, 5 * 60_000);

  if (!d) {
    return (
      <section className="rounded-[26px] border border-border bg-card p-5">
        <div className="space-y-3"><div className="skeleton h-3 w-24" /><div className="skeleton h-6 w-full" /><div className="skeleton h-6 w-2/3" /><div className="skeleton h-14 w-full rounded-2xl" /></div>
      </section>
    );
  }
  const t = TONE[d.tone as keyof typeof TONE] ?? TONE.advice;
  const verdict = now?.verdict === 'go'
    ? { Icon: CheckCircle2, ink: '#15803D' }
    : now?.verdict === 'wait' ? { Icon: PauseCircle, ink: '#A16207' } : { Icon: XCircle, ink: '#B91C1C' };

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[26px] p-5 shadow-sm"
      style={{ background: `linear-gradient(160deg, ${t.tint}2e 0%, var(--color-card) 58%)`, border: `1px solid ${t.tint}45` }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: t.ink }}>
        <t.Icon className="h-[14px] w-[14px]" strokeWidth={2.4} /> {d.label}
      </p>
      <p className="mt-2 text-[19px] font-bold leading-[1.35] text-foreground">{d.headline}</p>

      {(d.best_time || d.caution_time) && (
        <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-2xl bg-card/75">
          {d.best_time && (
            <div className="px-3.5 py-2.5">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <Clock className="h-[11px] w-[11px]" /> {tr({ en: 'Best time', hi: 'सबसे अच्छा समय', hinglish: 'Sabse accha samay' }, l)}
              </p>
              <p className="mt-1 text-[14px] font-bold tabular-nums" style={{ color: '#15803D' }}>{d.best_time.start}–{d.best_time.end}</p>
            </div>
          )}
          {d.caution_time && (
            <div className={`px-3.5 py-2.5 ${d.best_time ? 'border-l border-border/60' : ''}`}>
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{d.caution_time.name}</p>
              <p className="mt-1 text-[14px] font-bold tabular-nums" style={{ color: '#A16207' }}>{d.caution_time.start}–{d.caution_time.end}</p>
            </div>
          )}
        </div>
      )}

      {/* Right now — live, from the same windows. */}
      {now?.headline && (
        <Pressable to={`/right-now/${chartId}`} feedback="select"
          className="mt-2.5 flex w-full items-center gap-2.5 rounded-2xl bg-card/75 px-3.5 py-2.5 text-left">
          <verdict.Icon className="h-[18px] w-[18px] shrink-0" style={{ color: verdict.ink }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {tr({ en: 'Right now', hi: 'अभी', hinglish: 'Abhi' }, l)}{now.now ? ` · ${now.now}` : ''}
            </span>
            <span className="mt-0.5 block text-[13.5px] font-semibold leading-snug">{nowLine(now, l)}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Pressable>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => { haptic.tap(); setOpen((o) => !o); }}
          className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground">
          {tr({ en: 'Why this?', hi: 'ऐसा क्यों?', hinglish: 'Aisa kyun?' }, l)}
          <ChevronDown className={`h-[13px] w-[13px] transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </button>
        <Pressable to={`/daily/${chartId}`} subtle className="flex items-center gap-0.5 text-[12.5px] font-bold" style={{ color: t.ink }}>
          {tr({ en: 'Full day', hi: 'पूरा दिन', hinglish: 'Poora din' }, l)} <ChevronRight className="h-4 w-4" />
        </Pressable>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="why" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="mt-3 space-y-2.5 border-t border-border/60 pt-3">
              {(d.factors ?? []).map((f: any) => (
                <div key={f.code}>
                  <p className="text-[12.5px] font-bold leading-tight">{f.title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{f.detail}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

/** Someone to talk to — not an empty box. */
function AstroCard({ chartId }: { chartId: string }) {
  const l = lang3();
  const [fu, setFu] = useState<{ line: string } | null>(null);
  useEffect(() => {
    fetch(`/api/chat/followup/${chartId}?lang=${l}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.followup && setFu(d.followup))
      .catch(() => {});
  }, [chartId, l]);
  return (
    <section className="m-card m-enter p-4" style={{ animationDelay: '0.05s' }}>
      <div className="flex items-center gap-3">
        <span className="relative grid h-12 w-12 shrink-0 place-items-center rounded-full text-white shadow-md"
          style={{ background: 'linear-gradient(145deg, var(--color-accent), #B45309)' }}>
          <Sparkles className="h-[22px] w-[22px]" />
          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card bg-emerald-500" />
        </span>
        <div className="min-w-0">
          <p className="text-[15.5px] font-bold leading-tight">{tr({ en: 'Your astrologer', hi: 'आपके ज्योतिषी', hinglish: 'Aapke jyotishi' }, l)}</p>
          <p className="mt-0.5 text-[12px] font-semibold text-emerald-600">{tr({ en: 'Available now', hi: 'अभी उपलब्ध', hinglish: 'Abhi available' }, l)}</p>
        </div>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed">
        {fu ? fu.line : tr({
          en: "Something on your mind? Love, work, money — I'll read your kundli and tell you plainly.",
          hi: 'कुछ पूछना है? रिश्ता, नौकरी, पैसा — मैं आपकी कुंडली पढ़कर सीधा बताऊँगा।',
          hinglish: 'Kuch poochna hai? Rishta, naukri, paisa — main aapki kundli padh ke seedha bataunga.',
        }, l)}
      </p>
      <div className="mt-3.5 grid grid-cols-[1fr_auto] gap-2">
        <Pressable to={fu ? `/chat/${chartId}?from=followup` : `/chat/${chartId}`} feedback="medium"
          className="flex items-center justify-center gap-1.5 rounded-full bg-accent py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25">
          <MessageCircle className="h-[17px] w-[17px]" strokeWidth={2.4} />
          {tr({ en: 'Talk now', hi: 'बात करें', hinglish: 'Baat karein' }, l)}
        </Pressable>
        <Pressable to={`/chat/${chartId}?from=rishta`} feedback="tap"
          className="flex items-center gap-1.5 rounded-full border border-border px-4 text-[13px] font-bold">
          <HeartHandshake className="h-[16px] w-[16px] text-accent" />
          {tr({ en: 'About someone', hi: 'किसी के बारे में', hinglish: 'Kisi ke baare mein' }, l)}
        </Pressable>
      </div>
    </section>
  );
}

/** What is coming — tomorrow, and the next vrat and festivals. */
function AheadCard({ chartId }: { chartId: string }) {
  const l = lang3();
  const { data } = useCachedFetch<any>(`/api/chart/${chartId}/day-signals/upcoming?days=14&lang=${l}`);
  if (!data) return <section className="m-card p-4"><div className="space-y-2.5"><div className="skeleton h-3 w-20" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-2/3" /></div></section>;
  const days: any[] = Array.isArray(data.days) ? data.days : [];
  const tomorrow = days[1];
  const fests = days.slice(1).filter((d) => d?.special).slice(0, 3);
  const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale(l), { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <section className="m-card m-enter overflow-hidden" style={{ animationDelay: '0.1s' }}>
      <h3 className="px-4 pt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {tr({ en: 'Coming up', hi: 'आगे क्या', hinglish: 'Aage kya' }, l)}
      </h3>
      {/* Tomorrow's mood, its vrat if any, and its best window. Not the day's
          sentence — the engine writes every day as "aaj", which under a
          "Tomorrow" heading read as a mistake. */}
      {tomorrow && (
        <div className="px-4 pb-3.5 pt-2">
          <p className="text-[12px] font-bold text-muted-foreground">{tr({ en: 'Tomorrow', hi: 'कल', hinglish: 'Kal' }, l)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full px-2.5 py-1 text-[12px] font-bold"
              style={{ background: `${(TONE[tomorrow.tone as keyof typeof TONE] ?? TONE.advice).tint}22`, color: (TONE[tomorrow.tone as keyof typeof TONE] ?? TONE.advice).ink }}>
              {tomorrow.label}
            </span>
            {tomorrow.special && tomorrow.special.label !== tomorrow.label && (
              <span className="rounded-full bg-accent/12 px-2.5 py-1 text-[12px] font-bold text-accent">{tomorrow.special.label}</span>
            )}
          </div>
          {tomorrow.best_time && (
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
              {tr({ en: 'Best time', hi: 'सबसे अच्छा समय', hinglish: 'Sabse accha samay' }, l)}:{' '}
              <span className="font-bold tabular-nums text-foreground">{tomorrow.best_time.start}–{tomorrow.best_time.end}</span>
            </p>
          )}
        </div>
      )}
      {fests.length > 0 && (
        <div className="border-t border-border/70 px-4 py-3.5">
          <p className="text-[12px] font-bold text-muted-foreground">
            {tr({ en: 'Vrat & festivals ahead', hi: 'आने वाले व्रत और त्योहार', hinglish: 'Aane wale vrat aur tyohar' }, l)}
          </p>
          <ul className="mt-2 space-y-2">
            {fests.map((f) => (
              <li key={f.date} className="flex items-center justify-between gap-3 text-[13.5px]">
                <span className="min-w-0 truncate font-semibold">{f.special.label}</span>
                <span className="shrink-0 text-[12.5px] text-muted-foreground">{fmt(f.date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pressable to="/panchang" subtle className="flex items-center justify-between border-t border-border/70 px-4 py-3 text-[13px] font-bold text-accent">
        {tr({ en: 'Full panchang', hi: 'पूरा पंचांग', hinglish: 'Poora panchang' }, l)} <ChevronRight className="h-4 w-4" />
      </Pressable>
    </section>
  );
}

/** Their chart in one line, and how long the running dasha lasts. */
function ChartStrip({ chartId }: { chartId: string }) {
  const l = lang3();
  const { data } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const K = l === 'hi' ? ['लग्न', 'चंद्र', 'दशा'] : l === 'hinglish' ? ['Lagna', 'Chandra', 'Dasha'] : ['Lagna', 'Moon', 'Dasha'];
  const moon = data?.planets?.find((p: any) => p.planet === 'Moon')?.sign;
  const till = data?.dashas?.current_period?.to
    ? new Date(`${String(data.dashas.current_period.to).slice(0, 10)}T00:00:00`).toLocaleDateString(locale(l), { month: 'short', year: 'numeric' })
    : '';
  const vals = data
    ? [data.ascendant?.sign ?? '—', moon ?? '—',
       data.dashas?.current_mahadasha ? `${data.dashas.current_mahadasha}–${data.dashas.current_antardasha}` : '—']
    : null;
  return (
    <Pressable to={`/dashboard/${chartId}`} className="m-card m-enter flex w-full items-stretch divide-x divide-border overflow-hidden text-left" style={{ animationDelay: '0.14s' }}>
      {K.map((k, i) => (
        <span key={k} className="min-w-0 flex-1 px-3 py-3 text-center">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</span>
          {vals
            ? <span className="mt-0.5 block truncate text-[13.5px] font-bold">{vals[i]}</span>
            : <span className="skeleton mx-auto mt-1 block h-4 w-14" />}
          {i === 2 && till && (
            <span className="mt-0.5 block text-[10.5px] text-muted-foreground">
              {tr({ en: `till ${till}`, hi: `${till} तक`, hinglish: `${till} tak` }, l)}
            </span>
          )}
        </span>
      ))}
    </Pressable>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<any[] | null>(profilesCache);

  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : [];
        profilesCache = list;
        setProfiles(list);
      })
      .catch(() => setProfiles((prev) => prev ?? []));
  }, []);

  const primary = pickPrimary(profiles, user?.name);

  // Loading: the shape of the page, not a flash of "create your first kundli".
  if (profiles === null) {
    return (
      <div className="space-y-4 pt-2 pb-10" aria-hidden>
        <div className="space-y-2 px-1"><div className="skeleton h-3 w-44" /><div className="skeleton h-8 w-56" /></div>
        <div className="skeleton h-56 w-full rounded-[26px]" />
        <div className="skeleton h-36 w-full" />
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="space-y-5 pt-2 pb-10">
        <section className="m-card m-enter relative overflow-hidden px-5 pt-6 pb-5">
          <ZodiacRing />
          <div className="relative z-10">
            <p className="text-[13px] font-medium text-muted-foreground">
              {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </p>
            <h2 className="mt-1 max-w-[75%] text-[26px] font-bold leading-[1.2] tracking-tight">
              Your stars,<br /><span className="text-accent">precisely read</span>
            </h2>
            <p className="mt-2 max-w-[78%] text-[13px] leading-relaxed text-muted-foreground">
              Sidereal Lahiri charts, dashas and guidance — calculated on your exact birth moment.
            </p>
            <Pressable to="/create-chart" feedback="medium"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25">
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> Create Your First Kundli
            </Pressable>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-1 pb-10">
      <HomeHeader chartId={primary.id} name={primary.name.split(' ')[0]} />
      <TodayHero chartId={primary.id} />
      <AstroCard chartId={primary.id} />
      <AheadCard chartId={primary.id} />
      <ChartStrip chartId={primary.id} />
    </div>
  );
}
