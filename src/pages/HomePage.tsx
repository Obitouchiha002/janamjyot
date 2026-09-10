import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Plus, ChevronRight, ArrowRight, Clock, MessageCircle, HeartHandshake, Sparkles, Info,
  Moon, Sun, Sunrise, Flame, CalendarDays,
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
 * One card system (the .hm-* tokens in index.css): white surface, hairline
 * border, one eyebrow style, dividers instead of boxes inside boxes, one
 * footer action per card, and colour only as dots, pills and icons. The data
 * is exactly what it was — same endpoints, same fields; only the presentation
 * changed. Everything here is calculated; nothing on Home calls an AI.
 */

type L3 = 'en' | 'hi' | 'hinglish';
type Tri = Record<L3, string>;
const lang3 = (): L3 => { const g = getLang(); return g === 'hi' || g === 'hinglish' ? g : 'en'; };
const tr = (x: Tri, l: L3) => x[l] ?? x.en;
const locale = (l: L3) => (l === 'hi' ? 'hi-IN' : 'en-US');

const T = {
  today: { en: 'Today', hi: 'आज', hinglish: 'Aaj' },
  best: { en: 'Best time', hi: 'सबसे अच्छा समय', hinglish: 'Sabse accha samay' },
  rightNow: { en: 'Right now', hi: 'अभी', hinglish: 'Abhi' },
  fullDay: { en: 'See full day', hi: 'पूरा दिन देखें', hinglish: 'Poora din dekhein' },
  why: { en: 'Why this reading?', hi: 'ऐसा क्यों?', hinglish: 'Aisa kyun?' },
  calc: {
    en: "From your birth chart's transits for today — all calculated, nothing guessed.",
    hi: 'आपकी जन्म कुंडली के आज के गोचर से — सब गणना से, कोई तुक्का नहीं।',
    hinglish: 'Aapki janam kundli ke aaj ke gochar se — sab calculated, koi tukka nahi.',
  },
  astro: { en: 'Your astrologer', hi: 'आपके ज्योतिषी', hinglish: 'Aapke jyotishi' },
  available: { en: 'Available now', hi: 'अभी उपलब्ध', hinglish: 'Abhi available' },
  astroLine: {
    en: "Something on your mind? Love, work, money — I'll read your kundli and tell you plainly.",
    hi: 'कुछ पूछना है? रिश्ता, नौकरी, पैसा — मैं आपकी कुंडली पढ़कर सीधा बताऊँगा।',
    hinglish: 'Kuch poochna hai? Rishta, naukri, paisa — main aapki kundli padh ke seedha bataunga.',
  },
  about: { en: 'Ask about someone in your life', hi: 'अपने किसी खास के बारे में पूछें', hinglish: 'Kisi apne ke baare mein poochein' },
  talk: { en: 'Talk now', hi: 'बात करें', hinglish: 'Baat karein' },
  coming: { en: 'Coming up', hi: 'आगे क्या', hinglish: 'Aage kya' },
  tomorrow: { en: 'Tomorrow', hi: 'कल', hinglish: 'Kal' },
  none: { en: 'No vrat or festival in the next two weeks.', hi: 'अगले दो हफ़्ते कोई व्रत या त्योहार नहीं।', hinglish: 'Agle do hafte koi vrat ya tyohar nahi.' },
  panchang: { en: 'Full panchang', hi: 'पूरा पंचांग', hinglish: 'Poora panchang' },
  hello: { en: 'Namaste', hi: 'नमस्ते', hinglish: 'Namaste' },
} satisfies Record<string, Tri>;

/* ── Time, the way people read it ─────────────────────────────────────────
   "01:51 PM" → "1:51 PM"; a range shares its AM/PM when both ends do
   ("12:17 – 1:51 PM"), with an en dash between thin spaces. Rendered inside
   .hm-num, so it never wraps. */
const THIN = ' ';
function clock(s?: string) {
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(String(s ?? '').trim());
  return m ? { t: `${Number(m[1])}:${m[2]}`, p: (m[3] || '').toUpperCase() } : null;
}
function fmtClock(s?: string) { const c = clock(s); return c ? `${c.t}${c.p ? ` ${c.p}` : ''}` : String(s ?? ''); }
function fmtRange(a?: string, b?: string) {
  const x = clock(a), y = clock(b);
  if (!x || !y) return [a, b].filter(Boolean).join(' – ');
  const dash = `${THIN}–${THIN}`;
  return x.p === y.p ? `${x.t}${dash}${y.t} ${y.p}`.trim() : `${x.t} ${x.p}${dash}${y.t} ${y.p}`;
}
function todayEyebrow(l: L3, d = new Date()) {
  const wd = d.toLocaleDateString(locale(l), { weekday: 'short' });
  const mo = d.toLocaleDateString(locale(l), { month: 'short' });
  return `${tr(T.today, l)} · ${wd} ${d.getDate()} ${mo}`;
}

/** Status is always a dot AND a word — never colour alone. */
const VARIANT = {
  good: { dot: 'var(--hm-good)', bg: 'var(--hm-good-bg)', ink: 'var(--hm-good-ink)' },
  caution: { dot: 'var(--hm-caution)', bg: 'var(--hm-caution-bg)', ink: 'var(--hm-caution-ink)' },
  neutral: { dot: 'var(--hm-neutral)', bg: 'var(--hm-neutral-bg)', ink: 'var(--hm-neutral-ink)' },
} as const;
const toneVariant = (tone?: string) => (tone === 'good' ? VARIANT.good : tone === 'warn' ? VARIANT.caution : VARIANT.neutral);

function StatusPill({ tone, label }: { tone?: string; label: string }) {
  const v = toneVariant(tone);
  return (
    <span className="inline-flex max-w-[55%] shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: v.bg, color: v.ink }}>
      <span className="hm-dot" style={{ background: v.dot }} />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** Every card ends the same way: one link, right-aligned. */
function FooterLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <div className="mt-1 flex justify-end">
      <Pressable to={to} subtle className="hm-link -mr-1 px-1">
        {children} <ArrowRight className="h-4 w-4" />
      </Pressable>
    </div>
  );
}

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

/** Tithi and the greeting — type on the page, not another box. */
function HomeHeader({ chartId, name }: { chartId: string; name: string }) {
  const l = lang3();
  const { q } = usePlace(chartId);
  const { data: p } = useCachedFetch<any>(q ? `/api/panchang-today?${q}&lang=${l}` : null);
  return (
    <header className="m-enter px-1 pt-1">
      <p className="hm-eyebrow truncate">{p?.tithi ? [p.tithi, p.masa].filter(Boolean).join(' · ') : ' '}</p>
      <h1 className="hm-serif mt-1.5 text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]" style={{ color: 'var(--hm-text)' }}>
        {tr(T.hello, l)}, {name}{l === 'en' ? '' : ' ji'}
      </h1>
      {p?.special && (
        <Pressable to="/panchang" feedback="tap" className="mt-0.5 inline-flex min-h-[44px] items-center gap-1.5 text-[14px] font-semibold"
          style={{ color: 'var(--hm-accent-ink)' }}>
          <Sparkles className="h-4 w-4" style={{ color: 'var(--hm-accent)' }} />
          {tr(T.today, l)}: {p.special.label}
        </Pressable>
      )}
    </header>
  );
}

/** The reasons behind the day — kept off the card, one tap away. */
function WhySheet({ open, onClose, factors, l }: { open: boolean; onClose: () => void; factors: any[]; l: L3 }) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div className="hm fixed inset-0 z-[90] flex items-end justify-center" role="dialog" aria-modal="true" aria-label={tr(T.why, l)}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          <button aria-label="Close" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/40" />
          <motion.div className="relative max-h-[80vh] w-full max-w-[560px] overflow-y-auto rounded-t-[24px] px-5 pt-3"
            style={{ background: 'var(--hm-card)', paddingBottom: 'calc(var(--sab, 0px) + 24px)' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 420, damping: 40 }}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ background: 'var(--hm-border)' }} />
            <p className="hm-eyebrow">{tr(T.why, l)}</p>
            <div className="mt-3">
              {factors.map((f: any, i: number) => (
                <div key={f.code ?? i}>
                  {i > 0 && <div className="hm-divider my-3" />}
                  <p className="text-[15px] font-semibold" style={{ color: 'var(--hm-text)' }}>{f.title}</p>
                  <p className="hm-caption mt-1 leading-relaxed">{f.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'var(--hm-text-2)' }}>{tr(T.calc, l)}</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function TodaySkeleton() {
  return (
    <section className="hm-card" aria-hidden>
      <div className="flex items-center justify-between"><div className="skeleton h-3 w-28" /><div className="skeleton h-6 w-24 rounded-full" /></div>
      <div className="skeleton mt-4 h-5 w-full" /><div className="skeleton mt-2 h-5 w-2/3" />
      <div className="mt-5 grid grid-cols-2 gap-4"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
      <div className="skeleton mt-5 h-10 w-full" />
    </section>
  );
}

/** The day — the one big thing on Home. */
function TodayCard({ chartId }: { chartId: string }) {
  const l = lang3();
  const [why, setWhy] = useState(false);
  const { data: d } = useCachedFetch<any>(`/api/chart/${chartId}/day-signals?lang=${l}`);
  const { q } = usePlace(chartId);
  const { data: now, refresh } = useCachedFetch<any>(q ? `/api/right-now?${q}` : null);
  // Windows roll over while the screen is open — poll only while it is visible.
  useVisibleInterval(refresh, 5 * 60_000);
  if (!d) return <TodaySkeleton />;
  const nowV = now?.verdict === 'go' ? VARIANT.good : now?.verdict === 'wait' ? VARIANT.neutral : VARIANT.caution;

  return (
    <section className="hm-card m-enter">
      <div className="flex items-center justify-between gap-3">
        <p className="hm-eyebrow hm-num">{todayEyebrow(l)}</p>
        <StatusPill tone={d.tone} label={d.label} />
      </div>

      <div className="mt-3 flex items-start gap-1">
        <p className="line-clamp-2 min-w-0 flex-1 text-[18px] font-semibold leading-[26px]" style={{ color: 'var(--hm-text)' }}>{d.headline}</p>
        <button type="button" onClick={() => { haptic.tap(); setWhy(true); }} aria-label={tr(T.why, l)}
          className="-mr-2.5 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ color: 'var(--hm-text-2)' }}>
          <Info className="h-[18px] w-[18px]" />
        </button>
      </div>

      {(d.best_time || d.caution_time) && (
        <div className="mt-4 grid grid-cols-2">
          {d.best_time && (
            <div className="min-w-0 pr-3">
              <p className="hm-caption flex items-center gap-1.5">
                <span className="hm-dot" style={{ background: 'var(--hm-good)' }} />
                <Clock className="h-[13px] w-[13px]" /> <span className="truncate">{tr(T.best, l)}</span>
              </p>
              <p className="hm-num hm-fit mt-1 font-semibold" style={{ color: 'var(--hm-text)' }}>{fmtRange(d.best_time.start, d.best_time.end)}</p>
            </div>
          )}
          {d.caution_time && (
            <div className={`min-w-0 ${d.best_time ? 'border-l pl-3' : ''}`} style={{ borderColor: 'var(--hm-border)' }}>
              <p className="hm-caption flex items-center gap-1.5">
                <span className="hm-dot" style={{ background: 'var(--hm-caution)' }} />
                <span className="truncate">{d.caution_time.name}</span>
              </p>
              <p className="hm-num hm-fit mt-1 font-semibold" style={{ color: 'var(--hm-text)' }}>{fmtRange(d.caution_time.start, d.caution_time.end)}</p>
            </div>
          )}
        </div>
      )}

      {now?.verdict && (
        <>
          <div className="hm-divider mt-4" />
          <Pressable to={`/right-now/${chartId}`} feedback="select" className="hm-press -mx-2 mt-1 flex min-h-[56px] w-[calc(100%+16px)] items-center gap-3 px-2 py-2 text-left">
            <span className="hm-dot hm-live" style={{ background: nowV.dot, ['--hm-pulse' as any]: nowV.dot }} />
            <span className="min-w-0 flex-1">
              <span className="hm-caption hm-num block">{tr(T.rightNow, l)}{now.now ? ` · ${fmtClock(now.now)}` : ''}</span>
              <span className="mt-0.5 line-clamp-2 block text-[15px] font-medium leading-[21px]" style={{ color: 'var(--hm-text)' }}>{nowLine(now, l)}</span>
            </span>
            <ChevronRight className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--hm-text-3)' }} />
          </Pressable>
        </>
      )}

      <FooterLink to={`/daily/${chartId}`}>{tr(T.fullDay, l)}</FooterLink>
      <WhySheet open={why} onClose={() => setWhy(false)} factors={d.factors ?? []} l={l} />
    </section>
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
    <section className="hm-card m-enter" style={{ animationDelay: '0.04s' }}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white" style={{ background: 'var(--hm-accent)' }}>
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="hm-title">{tr(T.astro, l)}</p>
          <p className="hm-caption mt-0.5 flex items-center gap-1.5">
            <span className="hm-dot" style={{ background: 'var(--hm-good)' }} /> {tr(T.available, l)}
          </p>
        </div>
      </div>
      <p className="hm-body mt-3">{fu ? fu.line : tr(T.astroLine, l)}</p>
      <div className="hm-divider mt-4" />
      <Pressable to={`/chat/${chartId}?from=rishta`} feedback="tap" className="hm-press -mx-2 mt-1 flex min-h-[48px] w-[calc(100%+16px)] items-center gap-3 px-2 text-left">
        <HeartHandshake className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--hm-accent)' }} />
        <span className="hm-body min-w-0 flex-1 font-medium">{tr(T.about, l)}</span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--hm-text-3)' }} />
      </Pressable>
      <Pressable to={fu ? `/chat/${chartId}?from=followup` : `/chat/${chartId}`} feedback="medium"
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold text-white"
        style={{ background: 'var(--hm-accent-strong)' }}>
        <MessageCircle className="h-[18px] w-[18px]" /> {tr(T.talk, l)}
      </Pressable>
    </section>
  );
}

const KIND_ICON: Record<string, any> = { moon: Moon, festival: Flame, sankranti: Sun, month: CalendarDays, vrat: Sparkles };

/** What is coming — the next vrat and festivals, tomorrow marked. */
function ComingUpCard({ chartId }: { chartId: string }) {
  const l = lang3();
  const { data } = useCachedFetch<any>(`/api/chart/${chartId}/day-signals/upcoming?days=14&lang=${l}`);
  if (!data) {
    return (
      <section className="hm-card" aria-hidden>
        <div className="skeleton h-3 w-24" />
        {[0, 1, 2].map((i) => <div key={i} className="mt-4 flex items-center gap-3"><div className="skeleton h-12 w-11 rounded-xl" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-2/3" /><div className="skeleton h-3 w-1/3" /></div></div>)}
      </section>
    );
  }
  const days: any[] = Array.isArray(data.days) ? data.days : [];
  const tomorrow = days[1]?.date;
  const rows = days.slice(1).filter((d) => d?.special).slice(0, 3);
  return (
    <section className="hm-card m-enter" style={{ animationDelay: '0.08s' }}>
      <p className="hm-eyebrow">{tr(T.coming, l)}</p>
      {rows.length === 0 ? (
        <p className="hm-caption mt-3">{tr(T.none, l)}</p>
      ) : (
        <ul className="mt-3">
          {rows.map((r, i) => {
            const dt = new Date(`${r.date}T00:00:00`);
            const Icon = KIND_ICON[r.special.kind] ?? Sparkles;
            return (
              <li key={r.date}>
                {i > 0 && <div className="hm-divider my-3" />}
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-11 shrink-0 flex-col items-center justify-center rounded-xl" style={{ background: 'var(--hm-chip)' }}>
                    <span className="text-[11px] font-semibold uppercase leading-none" style={{ color: 'var(--hm-text-2)' }}>
                      {dt.toLocaleDateString(locale(l), { weekday: 'short' })}
                    </span>
                    <span className="hm-num mt-1 text-[18px] font-semibold leading-none" style={{ color: 'var(--hm-text)' }}>{dt.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold" style={{ color: 'var(--hm-text)' }}>{r.special.label}</span>
                      {r.date === tomorrow && (
                        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--hm-neutral-bg)', color: 'var(--hm-neutral-ink)' }}>
                          {tr(T.tomorrow, l)}
                        </span>
                      )}
                    </span>
                    {r.best_time && (
                      <span className="hm-caption mt-0.5 flex items-center gap-1" aria-label={`${tr(T.best, l)} ${fmtRange(r.best_time.start, r.best_time.end)}`}>
                        <Clock className="h-[12px] w-[12px] shrink-0" />
                        <span className="hm-num">{fmtRange(r.best_time.start, r.best_time.end)}</span>
                      </span>
                    )}
                  </span>
                  <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--hm-text-3)' }} aria-hidden />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <FooterLink to="/panchang">{tr(T.panchang, l)}</FooterLink>
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
  const dasha = data?.dashas?.current_mahadasha ? `${data.dashas.current_mahadasha} – ${data.dashas.current_antardasha}` : undefined;
  const cols = [
    { Icon: Sunrise, k: K[0], v: data?.ascendant?.sign as string | undefined, sub: '' },
    { Icon: Moon, k: K[1], v: moon as string | undefined, sub: '' },
    { Icon: Clock, k: K[2], v: dasha, sub: till ? tr({ en: `till ${till}`, hi: `${till} तक`, hinglish: `${till} tak` }, l) : '' },
  ];
  return (
    <Pressable to={`/dashboard/${chartId}`} className="hm-card hm-press m-enter relative block w-full text-left" style={{ animationDelay: '0.12s', padding: 0 }}>
      <span className="grid grid-cols-3">
        {cols.map((c, i) => (
          <span key={c.k} className={`min-w-0 px-3.5 py-4 ${i ? 'border-l' : ''}`} style={{ borderColor: 'var(--hm-border)' }}>
            <c.Icon className="h-4 w-4" style={{ color: 'var(--hm-accent)' }} aria-hidden />
            <span className="mt-2 block text-[12px] font-medium" style={{ color: 'var(--hm-text-2)' }}>{c.k}</span>
            {data
              ? <span className={`hm-fit-sm mt-0.5 block font-semibold ${i === 2 ? 'break-words' : 'truncate'}`} style={{ color: 'var(--hm-text)' }}>{c.v ?? '—'}</span>
              : <span className="skeleton mt-1 block h-4 w-14" />}
            {c.sub && <span className="hm-num mt-0.5 block text-[12px]" style={{ color: 'var(--hm-text-2)' }}>{c.sub}</span>}
          </span>
        ))}
      </span>
      <ChevronRight className="absolute right-2.5 top-3 h-4 w-4" style={{ color: 'var(--hm-text-3)' }} aria-hidden />
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

  // Loading: the shape of the page, never a flash of an empty state.
  if (profiles === null) {
    return (
      <div className="hm mx-auto w-full max-w-[720px] space-y-4 pt-2 pb-10" aria-hidden>
        <div className="space-y-2 px-1"><div className="skeleton h-3 w-40" /><div className="skeleton h-8 w-56" /></div>
        <TodaySkeleton />
        <div className="hm-card"><div className="skeleton h-11 w-40" /><div className="skeleton mt-4 h-4 w-full" /><div className="skeleton mt-5 h-12 w-full" /></div>
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="hm mx-auto w-full max-w-[720px] space-y-5 pt-2 pb-10">
        <section className="hm-card m-enter relative overflow-hidden">
          <ZodiacRing />
          <div className="relative z-10">
            <p className="hm-eyebrow">{greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</p>
            <h2 className="hm-serif mt-2 max-w-[75%] text-[28px] font-semibold leading-[1.15]" style={{ color: 'var(--hm-text)' }}>
              Your stars, precisely read
            </h2>
            <p className="hm-body mt-2 max-w-[80%]" style={{ color: 'var(--hm-text-2)' }}>
              Sidereal Lahiri charts, dashas and guidance — calculated on your exact birth moment.
            </p>
            <Pressable to="/create-chart" feedback="medium"
              className="mt-5 inline-flex h-12 items-center gap-2 rounded-[14px] px-5 text-[15px] font-semibold text-white" style={{ background: 'var(--hm-accent-strong)' }}>
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> Create Your First Kundli
            </Pressable>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="hm mx-auto w-full max-w-[720px] space-y-4 pt-1 pb-10">
      <HomeHeader chartId={primary.id} name={primary.name.split(' ')[0]} />
      <TodayCard chartId={primary.id} />
      <AstroCard chartId={primary.id} />
      <ComingUpCard chartId={primary.id} />
      <ChartStrip chartId={primary.id} />
    </div>
  );
}
