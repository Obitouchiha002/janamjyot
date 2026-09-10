import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
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
 * Home — an astrology app's front door.
 *
 * A warm page; the greeting beside their own kundli; the day as a night sky
 * with the sun's actual path — sunrise to sunset, the good window and Rahu
 * Kaal drawn where they really fall; then the astrologer, what is coming, and
 * the chart in one line. Data and endpoints are unchanged — this file only
 * decides how they look and move. Nothing on Home calls an AI.
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
  viewKundli: { en: 'View kundli', hi: 'कुंडली देखें', hinglish: 'Kundli dekhein' },
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


function toMin(s?: string): number | null {
  const c = /^(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(String(s ?? '').trim());
  if (!c) return null;
  let h = Number(c[1]);
  const p = (c[3] || '').toUpperCase();
  if (p) h = (h % 12) + (p === 'PM' ? 12 : 0);
  return h * 60 + Number(c[2]);
}

/**
 * The headline, never cut with "…": the first sentence, and if that is still
 * long, up to its first natural pause. The whole text lives in the info sheet.
 */
function shortHeadline(s: string, l: L3): string {
  const t = String(s || '').trim();
  const first = t.split(/(?<=[.!?।])\s+/)[0] || t;
  if (first.length <= 84) return first;
  for (const sep of [' — ', '; ', ', ']) {
    const i = first.lastIndexOf(sep, 84);
    if (i > 24) return first.slice(0, i) + (l === 'hi' ? '।' : '.');
  }
  return first;
}

/** Every card ends the same way: one link, right-aligned. */
function FooterLink({ to, children, color }: { to: string; children: React.ReactNode; color?: string }) {
  return (
    <div className="mt-1 flex justify-end">
      <Pressable to={to} subtle className="hm-link -mr-1 px-1" style={color ? { color } : undefined}>
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
  const tz: string = b?.timezone || 'Asia/Kolkata';
  return {
    chart: c,
    tz,
    q: c ? `lat=${b?.latitude ?? 28.6139}&lon=${b?.longitude ?? 77.209}&tz=${encodeURIComponent(tz)}` : null,
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

/* ── Mini kundli ─────────────────────────────────────────────────────────
   Their own D1, beside the greeting — the one thing that says "astrology"
   before a word is read. Gold lines, the Lagna house lit, planets in their
   houses. Tap for the full chart. */
const MINI_CENTER: Record<number, [number, number]> = {
  1: [100, 50], 2: [50, 24], 3: [24, 50], 4: [50, 100], 5: [24, 150], 6: [50, 176],
  7: [100, 150], 8: [150, 176], 9: [176, 150], 10: [150, 100], 11: [176, 50], 12: [150, 24],
};
const SHORT: Record<string, string> = { Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke' };

function MiniKundli({ chartId }: { chartId: string }) {
  const { data } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const byHouse: Record<number, string[]> = {};
  for (const p of data?.planets ?? []) {
    if (!SHORT[p.planet] || !p.house) continue;
    (byHouse[p.house] ||= []).push(SHORT[p.planet]);
  }
  return (
    <Pressable to={`/dashboard/${chartId}`} feedback="tap" aria-label={`Your birth chart${data?.ascendant?.sign ? `, Lagna ${data.ascendant.sign}` : ''} — open`}
      className="hm-press hm-lift hm-rise block shrink-0 rounded-[18px] p-1.5"
      style={{ background: 'var(--hm-card)', border: '1px solid rgba(120,90,40,.14)', boxShadow: '0 10px 30px rgba(60,40,10,.08)', animationDelay: '60ms' }}>
      <svg viewBox="0 0 200 200" className="block h-[104px] w-[104px] md:h-[150px] md:w-[150px]" aria-hidden>
        <polygon points="100,3 148,51 100,99 52,51" fill="rgba(201,146,60,.16)" />
        <g stroke="rgba(201,146,60,.7)" strokeWidth="1.6" fill="none" strokeLinejoin="round">
          <rect x="2" y="2" width="196" height="196" rx="10" />
          <line x1="2" y1="2" x2="198" y2="198" /><line x1="198" y1="2" x2="2" y2="198" />
          <polygon points="100,2 198,100 100,198 2,100" />
        </g>
        {data ? Object.entries(byHouse).map(([h, ps]) => {
          const [x, y] = MINI_CENTER[Number(h)] ?? [100, 100];
          return ps.slice(0, 3).map((s, i) => (
            <text key={h + s} x={x} y={y + 6 + (i - (Math.min(ps.length, 3) - 1) / 2) * 17} textAnchor="middle"
              fontSize="16" fontWeight="600" fill="#3A3326">{s}</text>
          ));
        }) : null}
      </svg>
    </Pressable>
  );
}

/** Tithi, the greeting in Fraunces, and today's festival — beside their chart. */
function HomeHeader({ chartId, name }: { chartId: string; name: string }) {
  const l = lang3();
  const { q } = usePlace(chartId);
  const { data: p } = useCachedFetch<any>(q ? `/api/panchang-today?${q}&lang=${l}` : null);
  return (
    <header className="flex items-start justify-between gap-3 px-1 pt-1">
      <div className="hm-rise min-w-0 flex-1">
        <p className="hm-eyebrow" style={{ color: 'var(--hm-eyebrow-warm)' }}>{p?.tithi ? [p.tithi, p.masa].filter(Boolean).join(' · ') : ' '}</p>
        <h1 className="hm-display hm-greeting mt-2" style={{ color: 'var(--hm-text)' }}>
          {tr(T.hello, l)}, {name}{l === 'en' ? '' : ' ji'}
        </h1>
        {p?.special && (
          <Pressable to="/panchang" feedback="tap" className="mt-2 inline-flex min-h-[44px] items-center">
            <span className="hm-pill-gold"><Flame className="h-3.5 w-3.5" /> {tr(T.today, l)} · {p.special.label}</span>
          </Pressable>
        )}
      </div>
      {/* Their kundli, one tap away — the chart and a plain "view" link. */}
      <div className="flex shrink-0 flex-col items-center">
        <MiniKundli chartId={chartId} />
        <Pressable to={`/dashboard/${chartId}`} subtle className="hm-link text-[12.5px]">
          {tr(T.viewKundli, l)} <ArrowRight className="h-3.5 w-3.5" />
        </Pressable>
      </div>
    </header>
  );
}

/* ── Night sky ────────────────────────────────────────────────────────── */
function seeded(a: number) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const STARS = (() => {
  const r = seeded(20260910);
  return Array.from({ length: 34 }, () => ({ x: r() * 100, y: r() * 100, s: r() < 0.72 ? 1 : 2, o: 0.2 + r() * 0.4, d: 3 + r() * 3, delay: r() * 5 }));
})();
function Stars() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {STARS.map((s, i) => (
        <span key={i} className="hm-star" style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, ['--o' as any]: s.o, ['--d' as any]: `${s.d}s`, ['--delay' as any]: `${s.delay}s` }} />
      ))}
    </div>
  );
}

/* ── Day arc: sunrise → sunset, with the real windows on it ─────────────── */
const ARC = { W: 320, H: 124, cx: 160, cy: 100, rx: 146, ry: 82 };
const arcPt = (f: number) => { const t = Math.PI * (1 - f); return { x: ARC.cx + ARC.rx * Math.cos(t), y: ARC.cy - ARC.ry * Math.sin(t) }; };
const arcPath = (f1: number, f2: number) => {
  const a = arcPt(f1), b = arcPt(f2);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${ARC.rx} ${ARC.ry} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

function DayArc({ rise, set, best, rahu, now, l }: { rise?: string; set?: string; best?: any; rahu?: any; now?: string; l: L3 }) {
  const id = useId().replace(/:/g, '');
  const reduce = useReducedMotion();
  const R = toMin(rise), S = toMin(set), N = toMin(now);
  const valid = R != null && S != null && S > R;
  const frac = (m: number | null) => (!valid || m == null ? null : Math.min(1, Math.max(0, (m - (R as number)) / ((S as number) - (R as number)))));
  const seg = (w: any) => { if (!w) return null; const a = frac(toMin(w.start)), b = frac(toMin(w.end)); return a == null || b == null || b <= a ? null : { a, b }; };
  const bs = seg(best), rk = seg(rahu);
  const isDay = valid && N != null && N >= (R as number) && N <= (S as number);
  const target = isDay ? (frac(N) as number) : 0;

  // The sun waits for the arc to draw, then glides; later minutes just move it.
  const fv = useMotionValue(reduce ? target : 0);
  const first = useRef(true);
  useEffect(() => {
    if (reduce) { fv.set(target); return; }
    const c = animate(fv, target, { duration: first.current ? 1.1 : 0.6, delay: first.current ? 0.9 : 0, ease: [0.2, 0.8, 0.2, 1] });
    first.current = false;
    return () => c.stop();
  }, [target, reduce, fv]);
  const sx = useTransform(fv, (f) => arcPt(f).x);
  const sy = useTransform(fv, (f) => arcPt(f).y);
  if (!valid) return null;
  const moonAt = arcPt(N != null && N < (R as number) ? 0 : 1);

  return (
    <svg viewBox={`0 0 ${ARC.W} ${ARC.H}`} className="mt-4 block h-auto w-full" role="img"
      aria-label={`${tr({ en: 'Sunrise', hi: 'सूर्योदय', hinglish: 'Sunrise' }, l)} ${fmtClock(rise)}, ${tr({ en: 'sunset', hi: 'सूर्यास्त', hinglish: 'sunset' }, l)} ${fmtClock(set)}`}
      data-rise={R} data-set={S}>
      <defs>
        <radialGradient id={`${id}g`}><stop offset="0%" stopColor="#E8B866" stopOpacity=".55" /><stop offset="100%" stopColor="#E8B866" stopOpacity="0" /></radialGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width={ARC.W} height={ARC.H}>
          <motion.path d={arcPath(0, 1)} stroke="#fff" strokeWidth="18" fill="none" strokeLinecap="round"
            initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduce ? 0 : 0.9, ease: [0.2, 0.8, 0.2, 1] }} />
        </mask>
      </defs>
      <g mask={`url(#${id}m)`}>
        <path d={arcPath(0, 1)} stroke="rgba(255,255,255,.18)" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round" fill="none" />
        {bs && <path d={arcPath(bs.a, bs.b)} data-seg="best" data-f1={bs.a.toFixed(4)} data-f2={bs.b.toFixed(4)} stroke="#5FD08E" strokeWidth="4" strokeLinecap="round" fill="none" />}
        {rk && <path d={arcPath(rk.a, rk.b)} data-seg="rahu" data-f1={rk.a.toFixed(4)} data-f2={rk.b.toFixed(4)} stroke="#FF7A6B" strokeWidth="4" strokeLinecap="round" fill="none" />}
      </g>
      {isDay ? (
        <g data-marker="sun" data-f={target.toFixed(4)}>
          <motion.circle cx={sx} cy={sy} r="16" fill={`url(#${id}g)`} />
          <motion.circle cx={sx} cy={sy} r="6" fill="#E8B866" />
        </g>
      ) : (
        <g data-marker="moon">
          <circle cx={moonAt.x} cy={moonAt.y} r="14" fill={`url(#${id}g)`} opacity=".6" />
          <circle cx={moonAt.x} cy={moonAt.y} r="6" fill="#F5EFE6" />
          <circle cx={moonAt.x + 2.6} cy={moonAt.y - 2} r="5" fill="#2B2160" />
        </g>
      )}
      <text x={arcPt(0).x} y={ARC.H - 3} textAnchor="start" fontSize="12" fill="rgba(245,239,230,.65)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtClock(rise)}</text>
      <text x={arcPt(1).x} y={ARC.H - 3} textAnchor="end" fontSize="12" fill="rgba(245,239,230,.65)" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtClock(set)}</text>
    </svg>
  );
}

/** The reasons behind the day — the full sentence and every factor. */
function WhySheet({ open, onClose, headline, factors, l }: { open: boolean; onClose: () => void; headline: string; factors: any[]; l: L3 }) {
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
            <p className="hm-body mt-2 font-medium">{headline}</p>
            <div className="mt-4">
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

const NIGHT_PILL = {
  good: { bg: 'rgba(120,220,160,.14)', ink: '#9BE3B8', dot: '#5FD08E' },
  warn: { bg: 'rgba(255,120,110,.14)', ink: '#FFB1A8', dot: '#FF7A6B' },
  advice: { bg: 'rgba(232,184,102,.14)', ink: '#F1D29A', dot: '#E8B866' },
} as const;

function TodaySkeleton() {
  return (
    <section className="hm-night p-5 md:p-6" aria-hidden>
      <div className="flex items-center justify-between"><div className="skeleton h-3 w-28" /><div className="skeleton h-6 w-24 rounded-full" /></div>
      <div className="skeleton mt-4 h-6 w-full" /><div className="skeleton mt-2 h-6 w-2/3" />
      <div className="skeleton mt-5 h-24 w-full rounded-2xl" />
      <div className="mt-5 grid grid-cols-2 gap-4"><div className="skeleton h-12" /><div className="skeleton h-12" /></div>
    </section>
  );
}

/** The day, as a night sky — the one big thing on Home. */
function TodayCard({ chartId }: { chartId: string }) {
  const l = lang3();
  const [why, setWhy] = useState(false);
  const { data: d } = useCachedFetch<any>(`/api/chart/${chartId}/day-signals?lang=${l}`);
  const { q, tz } = usePlace(chartId);
  const { data: now, refresh } = useCachedFetch<any>(q ? `/api/right-now?${q}` : null);
  // The sun and "right now" follow the clock — a minute at a time, no replay.
  useVisibleInterval(refresh, 60_000);
  const localDate = useMemo(() => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); } catch { return ''; } }, [tz]);
  const { data: pc } = useCachedFetch<any>(q && localDate ? `/api/panchang?${q}&date=${localDate}` : null);
  if (!d) return <TodaySkeleton />;
  const pill = NIGHT_PILL[d.tone as keyof typeof NIGHT_PILL] ?? NIGHT_PILL.advice;
  const nowDot = now?.verdict === 'go' ? '#5FD08E' : now?.verdict === 'wait' ? '#E8B866' : '#FF7A6B';

  return (
    <section className="hm-night hm-rise p-5 md:p-6" style={{ animationDelay: '60ms' }}>
      <Stars />
      <div className="flex items-center justify-between gap-3">
        <p className="hm-eyebrow hm-num hm-sub">{todayEyebrow(l)}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: pill.bg, color: pill.ink }}>
          <span className="hm-dot" style={{ background: pill.dot }} /> {d.label}
        </span>
      </div>

      <div className="mt-3 flex items-start gap-1">
        <p className="hm-display hm-headline min-w-0 flex-1">{shortHeadline(d.headline, l)}</p>
        <button type="button" onClick={() => { haptic.tap(); setWhy(true); }} aria-label={tr(T.why, l)}
          className="hm-sub -mr-2.5 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full">
          <Info className="h-[18px] w-[18px]" />
        </button>
      </div>

      <DayArc rise={pc?.sunrise} set={pc?.sunset} best={d.best_time} rahu={d.caution_time} now={now?.now} l={l} />

      {(d.best_time || d.caution_time) && (
        <div className="mt-3 grid grid-cols-2">
          {d.best_time && (
            <div className="min-w-0 pr-3">
              <p className="hm-caption hm-sub flex items-center gap-1.5"><span className="hm-dot" style={{ background: '#5FD08E' }} /> {tr(T.best, l)}</p>
              <p className="hm-num hm-fit mt-1 font-semibold" style={{ color: '#F5EFE6' }}>{fmtRange(d.best_time.start, d.best_time.end)}</p>
            </div>
          )}
          {d.caution_time && (
            <div className={`min-w-0 ${d.best_time ? 'border-l pl-3' : ''}`} style={{ borderColor: 'rgba(255,255,255,.12)' }}>
              <p className="hm-caption hm-sub flex items-center gap-1.5"><span className="hm-dot" style={{ background: '#FF7A6B' }} /> {d.caution_time.name}</p>
              <p className="hm-num hm-fit mt-1 font-semibold" style={{ color: '#F5EFE6' }}>{fmtRange(d.caution_time.start, d.caution_time.end)}</p>
            </div>
          )}
        </div>
      )}

      {now?.verdict && (
        <>
          <div className="hm-rule mt-4" />
          <Pressable to={`/right-now/${chartId}`} feedback="select" className="hm-press -mx-2 mt-1 flex min-h-[56px] w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-2 text-left">
            <span className="hm-live-dot" style={{ ['--c' as any]: nowDot }} />
            <span className="min-w-0 flex-1">
              <span className="hm-caption hm-sub hm-num block">{tr(T.rightNow, l)}{now.now ? ` · ${fmtClock(now.now)}` : ''}</span>
              <span className="mt-0.5 block text-[15px] leading-[21px]" style={{ color: '#F5EFE6' }}>{nowLine(now, l)}</span>
            </span>
            <ChevronRight className="hm-sub h-[18px] w-[18px] shrink-0" />
          </Pressable>
        </>
      )}

      <FooterLink to={`/daily/${chartId}`} color="#E8B866">{tr(T.fullDay, l)}</FooterLink>
      <WhySheet open={why} onClose={() => setWhy(false)} headline={d.headline} factors={d.factors ?? []} l={l} />
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
    <section className="hm-card hm-rise" style={{ animationDelay: '120ms' }}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white" style={{ background: 'var(--hm-accent)' }}>
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="hm-title">{tr(T.astro, l)}</p>
          <p className="hm-caption mt-0.5 flex items-center gap-1.5"><span className="hm-dot" style={{ background: 'var(--hm-good)' }} /> {tr(T.available, l)}</p>
        </div>
      </div>
      <p className="hm-body mt-3">{fu ? fu.line : tr(T.astroLine, l)}</p>
      <div className="hm-divider mt-4" />
      <Pressable to={`/chat/${chartId}?from=rishta`} feedback="tap" className="hm-press -mx-2 mt-1 flex min-h-[48px] w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 text-left">
        <HeartHandshake className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--hm-accent)' }} />
        <span className="hm-body min-w-0 flex-1 font-medium">{tr(T.about, l)}</span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0" style={{ color: 'var(--hm-text-3)' }} />
      </Pressable>
      <Pressable to={fu ? `/chat/${chartId}?from=followup` : `/chat/${chartId}`} feedback="medium"
        className="hm-press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-[14px] text-[15px] font-semibold text-white"
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
    <section className="hm-card hm-rise" style={{ animationDelay: '180ms' }}>
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
                    <span className="text-[11px] font-semibold uppercase leading-none" style={{ color: 'var(--hm-text-2)' }}>{dt.toLocaleDateString(locale(l), { weekday: 'short' })}</span>
                    <span className="hm-num mt-1 text-[18px] font-semibold leading-none" style={{ color: 'var(--hm-text)' }}>{dt.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold leading-snug" style={{ color: 'var(--hm-text)' }}>{r.special.label}</span>
                      {r.date === tomorrow && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: 'var(--hm-neutral-bg)', color: 'var(--hm-neutral-ink)' }}>{tr(T.tomorrow, l)}</span>
                      )}
                    </span>
                    {r.best_time && (
                      <span className="hm-caption mt-0.5 flex items-center gap-1" aria-label={`${tr(T.best, l)} ${fmtRange(r.best_time.start, r.best_time.end)}`}>
                        <Clock className="h-[12px] w-[12px] shrink-0" /><span className="hm-num">{fmtRange(r.best_time.start, r.best_time.end)}</span>
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
    <Pressable to={`/dashboard/${chartId}`} className="hm-card hm-press hm-lift hm-rise relative block w-full text-left" style={{ animationDelay: '240ms', padding: 0 }}>
      <span className="grid grid-cols-3">
        {cols.map((c, i) => (
          <span key={c.k} className={`min-w-0 px-3.5 py-4 ${i ? 'border-l' : ''}`} style={{ borderColor: 'var(--hm-border)' }}>
            <c.Icon className="h-4 w-4" style={{ color: 'var(--hm-accent)' }} aria-hidden />
            <span className="mt-2 block text-[12px] font-medium" style={{ color: 'var(--hm-text-2)' }}>{c.k}</span>
            {data
              ? <span className="hm-fit-sm mt-0.5 block break-words font-semibold" style={{ color: 'var(--hm-text)' }}>{c.v ?? '—'}</span>
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

  if (profiles === null) {
    return (
      <div className="hm relative isolate mx-auto w-full max-w-[720px] space-y-4 pt-2 pb-10" aria-hidden>
        <div className="hm-page-bg" />
        <div className="flex items-start justify-between gap-3 px-1"><div className="flex-1 space-y-2"><div className="skeleton h-3 w-40" /><div className="skeleton h-9 w-52" /></div><div className="skeleton h-[112px] w-[112px] rounded-[18px]" /></div>
        <TodaySkeleton />
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="hm relative isolate mx-auto w-full max-w-[720px] space-y-5 pt-2 pb-10">
        <div className="hm-page-bg" />
        <section className="hm-card hm-rise relative overflow-hidden">
          <ZodiacRing />
          <div className="relative z-10">
            <p className="hm-eyebrow">{greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</p>
            <h2 className="mt-2 max-w-[75%] text-[26px] font-semibold leading-[1.2]" style={{ color: 'var(--hm-text)' }}>Your stars, precisely read</h2>
            <p className="hm-body mt-2 max-w-[80%]" style={{ color: 'var(--hm-text-2)' }}>Sidereal Lahiri charts, dashas and guidance — calculated on your exact birth moment.</p>
            <Pressable to="/create-chart" feedback="medium"
              className="hm-press mt-5 inline-flex h-12 items-center gap-2 rounded-[14px] px-5 text-[15px] font-semibold text-white" style={{ background: 'var(--hm-accent-strong)' }}>
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} /> Create Your First Kundli
            </Pressable>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="hm relative isolate mx-auto w-full max-w-[720px] space-y-4 pt-1 pb-10">
      <div className="hm-page-bg" />
      <HomeHeader chartId={primary.id} name={primary.name.split(' ')[0]} />
      <TodayCard chartId={primary.id} />
      <AstroCard chartId={primary.id} />
      <ComingUpCard chartId={primary.id} />
      <ChartStrip chartId={primary.id} />
    </div>
  );
}
