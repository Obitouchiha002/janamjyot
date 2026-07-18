import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles, Plus, ChevronRight, HeartHandshake, CalendarDays,
  MessageCircleQuestion, Orbit, ScrollText, Gem, User,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import TodayCard from '@/components/TodayCard';
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
    <div className="pointer-events-none absolute -right-14 -top-10 h-56 w-56 opacity-[0.55]">
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
    <div className="space-y-7 pt-2">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="m-card m-enter relative px-5 pt-6 pb-5">
        <ZodiacRing />
        <p className="text-[13px] font-medium text-muted-foreground">
          {greeting()}{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
        </p>
        {primary ? (
          <>
            <h2 className="mt-1 text-[25px] font-bold leading-[1.2] tracking-tight max-w-[80%]">
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
            <Pressable
              to="/create-chart"
              subtle
              className="mt-3.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground"
            >
              <Plus className="w-[14px] h-[14px]" strokeWidth={2.6} /> New Kundli
            </Pressable>
          </>
        ) : (
          <>
            <h2 className="mt-1 text-[26px] font-bold leading-[1.2] tracking-tight max-w-[75%]">
              Your stars,<br />
              <span className="text-accent">precisely read</span>
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground max-w-[78%]">
              Precise Vedic charts, dashas and AI guidance, calculated with the Swiss Ephemeris.
            </p>
            <Pressable
              to="/create-chart"
              feedback="medium"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
            >
              <Plus className="w-[18px] h-[18px]" strokeWidth={2.6} />
              Create Your First Kundli
            </Pressable>
          </>
        )}
      </section>

      {/* ── Today ────────────────────────────────────────────────────────── */}
      {primary && (
        <section className="m-enter" style={{ animationDelay: '0.06s' }}>
          <TodayCard chartId={primary.id} />
        </section>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <section className="m-enter" style={{ animationDelay: '0.1s' }}>
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h3>
        <div className="grid grid-cols-2 gap-3">
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
          to={`/ask/${primary.id}`}
          feedback="medium"
          aria-label="Talk to an Astrologer"
          className="fixed right-4 z-40 flex items-center gap-2 rounded-full bg-accent px-5 py-3.5 text-[14px] font-bold text-accent-foreground shadow-xl shadow-accent/35"
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
          <Pressable
            to={`/ask/${primary.id}`}
            className="m-card flex items-center gap-3 p-4 text-left"
          >
            <MessageCircleQuestion className="h-5 w-5 shrink-0 text-accent" />
            <span className="text-[13.5px] font-bold leading-tight">Talk to Astrologer</span>
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
