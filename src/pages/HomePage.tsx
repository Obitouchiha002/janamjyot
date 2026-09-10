import { useCallback, useEffect, useState } from 'react';
import { useVisibleInterval } from '@/lib/useVisibleInterval';
import {
  Plus, MessageCircleQuestion,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useCachedFetch } from '@/lib/useCachedFetch';
import DayBanner from '@/components/DayBanner';
import TodayChip from '@/components/TodayChip';
import { useAuth } from '@/auth';
import { pickPrimary } from '@/lib/primary';
import { useNavigate } from 'react-router-dom';
import { getLang } from '@/lib/prefs';
import { Send, Heart, Briefcase, Sun, MessageCircle } from 'lucide-react';

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

/**
 * Desktop-only "chart at a glance" panel that fills the hero's right half (which
 * was dead space on a wide screen). Reuses the already-cached chart, shows the
 * four numbers people recognise, the day's calendar chip, and the primary way
 * into the chat — so the floating button isn't needed on desktop.
 */
function HeroGlance({ chartId }: { chartId: string }) {
  const { data } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const moon = data?.planets?.find((p: any) => p.planet === 'Moon')?.sign;
  const stats: Array<[string, string]> = data
    ? [
        ['Lagna', data.ascendant?.sign ?? '—'],
        ['Moon Rashi', moon ?? '—'],
        ['Nakshatra', data.summary?.nakshatra || data.ascendant?.nakshatra || '—'],
        ['Dasha', data.dashas?.current_mahadasha ? `${data.dashas.current_mahadasha}–${data.dashas.current_antardasha}` : '—'],
      ]
    : [];

  return (
    <div className="hero-glance flex-col gap-3 rounded-2xl border border-border/70 bg-background/55 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Your chart at a glance</p>
        <TodayChip chartId={chartId} />
      </div>
      {data ? (
        <div className="grid grid-cols-2 gap-2.5">
          {stats.map(([k, v]) => (
            <div key={k} className="rounded-xl bg-muted/70 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</p>
              <p className="mt-0.5 truncate text-[14.5px] font-bold leading-tight">{v}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[54px]" />)}
        </div>
      )}
      <Pressable
        to={`/chat/${chartId}`}
        feedback="medium"
        className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-accent py-2.5 text-[13.5px] font-bold text-accent-foreground shadow-md shadow-accent/25"
      >
        <MessageCircleQuestion className="h-[17px] w-[17px]" strokeWidth={2.3} /> Talk to Astrologer
      </Pressable>
    </div>
  );
}

/**
 * The first thing on Home: "what's on your mind?"
 *
 * People open an astrology app when something is weighing on them — a
 * relationship, a job, money, today. Home used to lead with a tour of tools;
 * now it leads with the question, and whatever they type goes straight into
 * the chat. If they asked about their life before, it asks how that went.
 */
function ChatHero({ chartId }: { chartId: string }) {
  const navigate = useNavigate();
  const g = getLang();
  const L = (g === 'hi' || g === 'hinglish' ? g : 'en') as 'en' | 'hi' | 'hinglish';
  const [text, setText] = useState('');
  const [fu, setFu] = useState<{ line: string; chips: string[] } | null>(null);

  useEffect(() => {
    fetch(`/api/chat/followup/${chartId}?lang=${L}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.followup && setFu(d.followup))
      .catch(() => {});
  }, [chartId, L]);

  const ask = (q: string) => {
    const v = q.trim();
    if (v) navigate(`/chat/${chartId}?q=${encodeURIComponent(v)}`);
  };

  const T = {
    title: { en: "What's on your mind?", hi: 'मन में क्या चल रहा है?', hinglish: 'Man mein kya chal raha hai?' },
    ph: { en: 'Type your question…', hi: 'अपना सवाल लिखिए…', hinglish: 'Apna sawaal likhiye…' },
  };
  const chips: Record<string, Array<[any, string, string]>> = {
    en: [[Heart, 'My relationship', 'rishta'], [Briefcase, 'When will my career settle?', ''], [Sun, 'How is my day today?', '']],
    hinglish: [[Heart, 'Mera rishta', 'rishta'], [Briefcase, 'Meri career kab set hogi?', ''], [Sun, 'Aaj mera din kaisa rahega?', '']],
    hi: [[Heart, 'मेरा रिश्ता', 'rishta'], [Briefcase, 'मेरा करियर कब सेट होगा?', ''], [Sun, 'आज मेरा दिन कैसा रहेगा?', '']],
  };

  return (
    <div>
      <h2 className="hero-title mt-2 text-[27px] font-bold leading-[1.15] tracking-tight">
        {T.title[L]}
      </h2>

      {fu && (
        <button
          type="button"
          onClick={() => navigate(`/chat/${chartId}?from=followup`)}
          className="m-enter mt-3.5 block w-full rounded-2xl border border-accent/35 bg-accent/8 px-4 py-3 text-left text-[13.5px] font-semibold leading-snug"
        >
          <MessageCircle className="mr-1.5 inline h-[15px] w-[15px] text-accent" />{fu.line}
        </button>
      )}

      <form
        className="mt-5 flex items-center gap-2 rounded-full border border-border bg-background/90 py-2 pl-5 pr-2 shadow-md shadow-black/5 focus-within:border-accent"
        onSubmit={(e) => { e.preventDefault(); ask(text); }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={T.ph[L]}
          className="min-w-0 flex-1 bg-transparent text-[14.5px] outline-none"
          enterKeyHint="send"
        />
        <button
          type="submit"
          aria-label="Ask"
          disabled={!text.trim()}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full transition-colors ${
            text.trim() ? 'bg-accent text-accent-foreground shadow-md shadow-accent/30' : 'bg-muted text-muted-foreground'
          }`}
        >
          <Send className="h-[17px] w-[17px]" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {(chips[L] ?? chips.en).map(([Icon, label, kind]) => (
          <Pressable
            key={label}
            onClick={() => (kind === 'rishta' ? navigate(`/chat/${chartId}?from=rishta`) : ask(label))}
            feedback="tap"
            className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-3.5 py-2 text-[12.5px] font-semibold"
          >
            <Icon className="h-[14px] w-[14px] shrink-0 text-accent" /> {label}
          </Pressable>
        ))}
      </div>
    </div>
  );
}

/**
 * Their chart in one line — Lagna, Moon, running dasha.
 *
 * The most personal thing in the app was only on the desktop panel; a phone
 * showed nothing of it on Home. Taps through to the full kundli.
 */
function ChartStrip({ chartId }: { chartId: string }) {
  const { data } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const g = getLang();
  const K = (g === 'hi' ? ['लग्न', 'चंद्र', 'दशा'] : g === 'hinglish' ? ['Lagna', 'Chandra', 'Dasha'] : ['Lagna', 'Moon', 'Dasha']);
  const moon = data?.planets?.find((p: any) => p.planet === 'Moon')?.sign;
  const vals = data
    ? [data.ascendant?.sign ?? '—', moon ?? '—',
       data.dashas?.current_mahadasha ? `${data.dashas.current_mahadasha}–${data.dashas.current_antardasha}` : '—']
    : null;
  return (
    <Pressable to={`/dashboard/${chartId}`} className="chart-strip m-card m-enter flex w-full items-stretch divide-x divide-border overflow-hidden text-left">
      {K.map((k, i) => (
        <span key={k} className="min-w-0 flex-1 px-3 py-3 text-center">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{k}</span>
          {vals
            ? <span className="mt-0.5 block truncate text-[13.5px] font-bold">{vals[i]}</span>
            : <span className="skeleton mx-auto mt-1 block h-4 w-14" />}
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

  return (
    <div className="space-y-5 pt-2 pb-10">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="m-card m-enter relative overflow-hidden px-5 pt-6 pb-5">
        <ZodiacRing />
        {profiles === null ? (
          <div className="relative z-10 space-y-3 py-1" aria-hidden>
            <div className="skeleton h-4 w-40" />
            <div className="skeleton h-8 w-60" />
            <div className="skeleton h-12 w-full rounded-full" />
          </div>
        ) : primary ? (
          // Desktop: two columns — words + actions on the left, a "chart at a
          // glance" panel filling what used to be dead space on the right.
          <div className="hero-grid">
            <div className="hero-main relative z-10">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-muted-foreground">
                  {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
                </p>
                {/* Calendar chip lives here on a phone; on desktop it moves into
                    the glance panel, so it's hidden here. */}
                <span className="chip-mobile flex min-w-0 max-w-[62%] shrink-0 justify-end"><TodayChip chartId={primary.id} /></span>
              </div>
              <ChatHero chartId={primary.id} />
            </div>
            <HeroGlance chartId={primary.id} />
          </div>
        ) : (
          <div className="relative z-10">
            <p className="text-[13px] font-medium text-muted-foreground">
              {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </p>
            <h2 className="mt-1 text-[26px] font-bold leading-[1.2] tracking-tight max-w-[75%]">
              Your stars,<br />
              <span className="text-accent">precisely read</span>
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground max-w-[78%]">
              Sidereal Lahiri charts, dashas and AI guidance — calculated on your exact birth moment.
            </p>
            <Pressable
              to="/create-chart"
              feedback="medium"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={2.6} />
              Create Your First Kundli
            </Pressable>
          </div>
        )}
      </section>

      {/* ── Today, in one line ───────────────────────────────────────────
          The single "Today" on Home: a clear read on today with the real
          astrology one tap away under "Reason", and the full day (the AI
          narrative + per-area breakdown) one tap further via the hero's
          "Today's Guidance" button. The old screen stacked this deterministic
          glance ABOVE a second AI "Today" card — two boxes both titled Today,
          which read as duplication to a beginner. The detailed card now lives
          only where it isn't competing: the full daily page and the dashboard. */}
      {/* Today's glance, then the live "good moment?" strip — both full-width.
          RightNow is a horizontal strip, so it reads well at any width. */}
      {primary && <ChartStrip chartId={primary.id} />}
      {primary && <DayBanner chartId={primary.id} />}

    </div>
  );
}
