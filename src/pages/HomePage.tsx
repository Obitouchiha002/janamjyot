import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useVisibleInterval } from '@/lib/useVisibleInterval';
import {
  Sparkles, Plus, ChevronRight, HeartHandshake, CalendarDays,
  MessageCircleQuestion, Orbit, ScrollText, Gem, User, CheckCircle2, PauseCircle, XCircle,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import { useCachedFetch } from '@/lib/useCachedFetch';
import DayBanner from '@/components/DayBanner';
import TodayChip from '@/components/TodayChip';
import { useAuth } from '@/auth';

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

interface Action {
  label: string;
  sub: string;
  to: string;
  icon: any;
  tint: string;
}

const ACTIONS: Action[] = [
  { label: 'Matching', sub: 'Guna Milan', to: '/match', icon: HeartHandshake, tint: '#F26D9B' },
  { label: 'Panchang', sub: 'Today', to: '/panchang', icon: CalendarDays, tint: '#E8B44A' },
  { label: 'Yogas', sub: 'Chart yogas', to: '/yogas', icon: Gem, tint: '#7DD3C0' },
  { label: 'Muhurat', sub: 'Auspicious timing', to: '/muhurat', icon: Orbit, tint: '#A78BFA' },
];

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

/** Live "is now a good moment?" strip. Tapping it opens the full checker. */
function RightNowCard({ chartId }: { chartId: string }) {
  // Cached-first for both hops, so the strip is filled instantly on revisit.
  const { data: c } = useCachedFetch<any>(`/api/chart/${chartId}`);
  const b = c?.birth_details;
  const lat = b?.latitude ?? 28.6139, lon = b?.longitude ?? 77.209;
  const tz = b?.timezone || 'Asia/Kolkata';
  const { data: d, refresh } = useCachedFetch<any>(
    c ? `/api/right-now?lat=${lat}&lon=${lon}&tz=${encodeURIComponent(tz)}` : null,
  );

  // Windows roll over while you sit here — but only poll while on screen.
  useVisibleInterval(refresh, 5 * 60_000);

  if (!d) return null;
  // `tint` marks; `ink` is for text on the card. The tint that works as a rail
  // is too pale to read at 15px, so they are deliberately different values.
  const tint = d.verdict === 'go' ? '#22C55E' : d.verdict === 'wait' ? '#E8B44A' : '#F87171';
  const ink  = d.verdict === 'go' ? '#15803D' : d.verdict === 'wait' ? '#A16207' : '#B91C1C';
  const Icon = d.verdict === 'go' ? CheckCircle2 : d.verdict === 'wait' ? PauseCircle : XCircle;

  // Matches the day card above it: one clean surface, a tone rail down the
  // left, and colour only where it means something. The two used to sit
  // together looking like they came from different apps — one washed amber
  // with a big alarm icon, the other white.
  return (
    <Pressable
      to={`/right-now/${chartId}`}
      feedback="select"
      className="m-card m-enter relative flex items-center gap-3 overflow-hidden py-3.5 pl-[19px] pr-4"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: `linear-gradient(180deg, ${tint}, ${tint}22)` }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.11em]" style={{ color: ink }}>
          <Icon className="h-[13px] w-[13px]" strokeWidth={2.4} />
          Right now · {d.now}
        </span>
        <span className="mt-1.5 block text-[15px] font-semibold leading-tight text-foreground">{d.headline}</span>
        <span className="mt-1 block truncate text-[12px] text-muted-foreground">
          {d.next_good ? `Next good window ${d.next_good.start}` : d.current?.name}
        </span>
      </span>
      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-muted-foreground/70" />
    </Pressable>
  );
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

  const primary = profiles?.[0];

  return (
    // pb clears the fixed "Talk to Astrologer" FAB (bottom ≈ sab+76px) so the
    // last card — and the day's "all calculated" note — never sits trapped
    // behind it.
    <div className="space-y-7 pt-2 pb-32">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="m-card m-enter relative overflow-hidden px-5 pt-6 pb-5">
        <ZodiacRing />
        {primary ? (
          // Desktop: two columns — words + actions on the left, a "chart at a
          // glance" panel filling what used to be dead space on the right.
          <div className="hero-grid">
            <div className="hero-main relative z-10">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[13px] font-medium text-muted-foreground">
                  {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
                </p>
                {/* Calendar chip lives here on a phone; on desktop it moves into
                    the glance panel, so it's hidden here. */}
                <span className="chip-mobile"><TodayChip chartId={primary.id} /></span>
              </div>
              <h2 className="hero-title mt-1 text-[25px] font-bold leading-[1.2] tracking-tight max-w-[80%]">
                <span className="text-accent">{primary.name.split(' ')[0]}</span>&apos;s stars,<br />
                ready for today
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground max-w-[80%]">
                Your kundli is saved. Open today&apos;s personalised guidance.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <Pressable
                  to={`/daily/${primary.id}`}
                  feedback="medium"
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
                >
                  <Sparkles className="w-[17px] h-[17px]" /> Today&apos;s Guidance
                </Pressable>
                <Pressable
                  to={`/dashboard/${primary.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-3 text-[13.5px] font-bold"
                >
                  Open Kundli
                </Pressable>
              </div>
              {/* Redundant on desktop (the navbar owns "New Kundli") — phone only. */}
              <Pressable
                to="/create-chart"
                subtle
                className="hero-newkundli mt-3.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground"
              >
                <Plus className="w-[14px] h-[14px]" strokeWidth={2.6} /> New Kundli
              </Pressable>
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
      {primary && <DayBanner chartId={primary.id} />}
      {primary && <RightNowCard chartId={primary.id} />}

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <section className="m-enter" style={{ animationDelay: '0.1s' }}>
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h3>
        <div className="qa-grid grid grid-cols-2 gap-3">
          {ACTIONS.map((a) => {
            const Icon = a.icon;
            return (
              <Pressable key={a.to} to={a.to} className="m-card block p-4 text-left">
                <span
                  className="mb-3 grid h-11 w-11 place-items-center rounded-2xl"
                  style={{ background: `${a.tint}22`, color: a.tint }}
                >
                  <Icon className="h-[21px] w-[21px]" />
                </span>
                <p className="text-[15px] font-bold leading-tight">{a.label}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{a.sub}</p>
              </Pressable>
            );
          })}
        </div>
      </section>

      {/* ── Saved kundlis ────────────────────────────────────────────────── */}
      <section className="m-enter" style={{ animationDelay: '0.14s' }}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            My Kundlis
          </h3>
          {!!profiles?.length && (
            <Pressable to="/profiles" subtle className="flex items-center gap-0.5 text-[13px] font-semibold text-accent">
              View all <ChevronRight className="h-4 w-4" />
            </Pressable>
          )}
        </div>

        {profiles === null && (
          <div className="space-y-2.5">
            <div className="skeleton h-[68px]" />
            <div className="skeleton h-[68px] opacity-60" />
          </div>
        )}

        {profiles?.length === 0 && (
          <Pressable
            to="/create-chart"
            className="m-card flex w-full flex-col items-center gap-2 border-dashed px-5 py-8 text-center"
          >
            <Sparkles className="h-7 w-7 text-accent" />
            <p className="text-[14px] font-semibold">No kundlis yet</p>
            <p className="text-[12px] text-muted-foreground">Tap to create your first kundli</p>
          </Pressable>
        )}

        <div className="space-y-2.5">
          {profiles?.slice(0, 3).map((p, i) => (
            <Pressable
              key={p.id}
              to={`/dashboard/${p.id}`}
              subtle
              className={`m-card flex w-full items-center gap-3 px-4 py-3.5 text-left ${i === 0 ? 'ring-2 ring-accent/40' : ''}`}
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                <User className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[15px] font-bold">{p.name}</span>
                  {i === 0 && (
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">Active</span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">{p.date}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Pressable>
          ))}
        </div>
      </section>

      {/* ── Floating "Talk to Astrologer" ────────────────────────────────
          Rendered through a PORTAL to <body>. The screen it lives on sits
          inside a framer-motion element that animates `transform`, and a
          transformed ancestor becomes the containing block for
          `position: fixed` — so without the portal the button anchored to the
          page instead of the viewport and drifted over the cards. */}
      {primary && createPortal(
        <Pressable
          to={`/chat/${primary.id}`}
          feedback="medium"
          aria-label="Talk to an Astrologer"
          className="home-fab fixed right-4 z-40 flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-xl shadow-accent/35"
          style={{ bottom: 'calc(var(--sab) + 76px)' }}
        >
          <MessageCircleQuestion className="h-[19px] w-[19px]" strokeWidth={2.3} />
          Talk to Astrologer
        </Pressable>,
        document.body,
      )}

      {/* ── Deep links for the primary chart ─────────────────────────────── */}
      {primary && (
        <section className="m-enter grid grid-cols-2 gap-3" style={{ animationDelay: '0.18s' }}>
          {/* Was a second "Talk to Astrologer" — the floating button above
              already owns that route. Matching is otherwise unreachable
              from Home, so it earns the slot. */}
          <Pressable
            to="/match"
            className="m-card flex items-center gap-3 p-4 text-left"
          >
            <HeartHandshake className="h-5 w-5 shrink-0 text-accent" />
            <span className="text-[13.5px] font-bold leading-tight">Kundli Matching</span>
          </Pressable>
          <Pressable
            to={`/reports/${primary.id}`}
            className="m-card flex items-center gap-3 p-4 text-left"
          >
            <ScrollText className="h-5 w-5 shrink-0 text-accent" />
            <span className="text-[13.5px] font-bold leading-tight">Reports</span>
          </Pressable>
        </section>
      )}
    </div>
  );
}
