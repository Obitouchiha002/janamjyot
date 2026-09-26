/**
 * Home — the layout the app launched with, brought back on request.
 *
 * Three later redesigns (a night-sky Today card, a day arc, a kundli
 * thumbnail) added information and took away the calm: a cream hero with one
 * clear headline and one button, a dark "Today" bar, and four big tiles. That
 * first version is the one people pointed at as better, so it is the one here.
 *
 * What is NOT brought back is what was wrong with it:
 *  · it greeted you with whichever kundli was newest — often a partner's —
 *    instead of your own (pickPrimary);
 *  · every word was English, whatever language you chose;
 *  · a floating "Talk to Astrologer" button that now sits on top of the Chat
 *    tab doing the same thing.
 */
import { useEffect, useState } from 'react';
import {
  Sparkles, Plus, ChevronRight, HeartHandshake, CalendarDays,
  MessageCircle, Orbit, ScrollText, Gem, User, Compass,
} from 'lucide-react';
import { Pressable } from '@/components/mobile/Pressable';
import TodayCard from '@/components/TodayCard';
import { useAuth } from '@/auth';
import { pickPrimary } from '@/lib/primary';
import { useT, formatDate } from '@/lib/i18n';

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
    <div className="hero-ring pointer-events-none absolute -right-14 -top-10 h-56 w-56 opacity-[0.55]">
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
                x1={100 + cos * 68} y1={100 + sin * 68}
                x2={100 + cos * 86} y2={100 + sin * 86}
                stroke="currentColor" strokeWidth="0.5" className="text-accent/30"
              />
              <circle
                cx={100 + cos * 77} cy={100 + sin * 77}
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

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const ACTIONS = [
  // First, and deliberately: this is the thing people open the app at midnight
  // for. Everything else here is a reading; this one makes a decision with them.
  { label: 'What should I do?', sub: 'Decide together', to: '/decide', icon: Compass, tint: '#2F9E7E' },
  { label: 'Matching', sub: 'Guna Milan', to: '/match', icon: HeartHandshake, tint: '#F26D9B' },
  { label: 'Panchang', sub: 'Today', to: '/panchang', icon: CalendarDays, tint: '#E8B44A' },
  { label: 'Yogas', sub: 'Chart yogas', to: '/yogas', icon: Gem, tint: '#7DD3C0' },
  { label: 'Muhurat', sub: 'Auspicious timing', to: '/muhurat', icon: Orbit, tint: '#A78BFA' },
];

/**
 * Profiles survive tab switches in memory. Without this the Home tab refetched
 * on every visit, so the hero flashed back to "create your first kundli"
 * before the name reappeared. Render the cached list on the first frame,
 * refresh in the background.
 */
let profilesCache: any[] | null = null;

/**
 * Drop the cached list after a create or delete, so coming back to Home never
 * shows a deleted person's name in the hero for a frame.
 */
export function invalidateProfiles() {
  profilesCache = null;
}

export default function HomePage() {
  const t = useT();
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

  // Your own kundli, not the newest one — the newest is very often a partner's.
  const primary = pickPrimary(profiles, user?.name);
  const firstName = (user?.name || '').trim().split(/\s+/)[0];
  // The list with the primary first, so "Active" always marks the right person.
  const ordered = primary
    ? [primary, ...(profiles ?? []).filter((p) => p.id !== primary.id)]
    : profiles ?? [];

  return (
    /* On a phone this is one column, top to bottom. From 1024px the same
       sections become a two-column dashboard (see .home-grid in index.css) —
       a desktop window should not be a phone with wallpaper either side. */
    <div className="home-grid space-y-7 pt-2">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="home-hero m-card m-enter relative overflow-hidden px-5 pt-6 pb-5">
        <ZodiacRing />
        <p className="relative text-[13px] font-medium text-muted-foreground">
          {t(greetingKey())}{firstName ? `, ${firstName}` : ''}
        </p>
        {primary ? (
          <div className="relative">
            <h2 className="mt-1 max-w-[80%] text-[25px] font-bold leading-[1.2] tracking-tight">
              <span className="text-accent">{String(primary.name).split(' ')[0]}</span>{t("'s stars,")}<br />
              {t("ready for today")}
            </h2>
            <p className="mt-2 max-w-[80%] text-[13px] leading-relaxed text-muted-foreground">
              {t("Your kundli is saved. Open today's personalised guidance.")}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Pressable
                to={`/daily/${primary.id}`}
                feedback="medium"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
              >
                <Sparkles className="h-[17px] w-[17px]" /> {t("Today's Guidance")}
              </Pressable>
              <Pressable
                to={`/dashboard/${primary.id}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-3 text-[13.5px] font-bold"
              >
                {t("Open Kundli")}
              </Pressable>
            </div>
            <Pressable
              to="/create-chart"
              subtle
              className="mt-3.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground"
            >
              <Plus className="h-[14px] w-[14px]" strokeWidth={2.6} /> {t("New Kundli")}
            </Pressable>
          </div>
        ) : (
          <div className="relative">
            <h2 className="mt-1 max-w-[75%] text-[26px] font-bold leading-[1.2] tracking-tight">
              {t("Your stars,")}<br />
              <span className="text-accent">{t("precisely read")}</span>
            </h2>
            <p className="mt-2 max-w-[78%] text-[13px] leading-relaxed text-muted-foreground">
              {t("Precise Vedic charts, dashas and AI guidance, checked against the Swiss Ephemeris.")}
            </p>
            <Pressable
              to="/create-chart"
              feedback="medium"
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-[14px] font-bold text-accent-foreground shadow-lg shadow-accent/25"
            >
              <Plus className="h-[18px] w-[18px]" strokeWidth={2.6} />
              {t("Create New Kundli")}
            </Pressable>
          </div>
        )}
      </section>

      {/* ── Today ─────────────────────────────────────────────────────────
          Only with a kundli: the bar reads the day FROM a chart, and without
          one it would open onto nothing. */}
      {primary && (
        <section className="home-today m-enter" style={{ animationDelay: '0.06s' }}>
          <TodayCard chartId={primary.id} variant="dark" />
        </section>
      )}

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <section className="home-actions m-enter" style={{ animationDelay: '0.1s' }}>
        <h3 className="mb-3 px-1 text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("Quick actions")}
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
                <p className="text-[15px] font-bold leading-tight">{t(a.label)}</p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">{t(a.sub)}</p>
              </Pressable>
            );
          })}
        </div>
      </section>

      {/* ── Saved kundlis ─────────────────────────────────────────────────── */}
      <section className="home-kundlis m-enter" style={{ animationDelay: '0.14s' }}>
        <div className="mb-3 flex items-center justify-between px-1">
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-muted-foreground">
            {t("My Kundlis")}
          </h3>
          {!!profiles?.length && (
            <Pressable to="/profiles" subtle className="flex items-center gap-0.5 text-[13px] font-semibold text-accent">
              {t("View all")} <ChevronRight className="h-4 w-4" />
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
            <p className="text-[14px] font-semibold">{t("No kundlis yet")}</p>
            <p className="text-[12px] text-muted-foreground">{t("Tap to create your first kundli")}</p>
          </Pressable>
        )}

        <div className="space-y-2.5">
          {ordered.slice(0, 3).map((p, i) => (
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
                    <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent">
                      {t("Active")}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[12px] text-muted-foreground">
                  {p.date ? formatDate(p.date, undefined, { weekday: false }) : ''}
                </span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Pressable>
          ))}
        </div>
      </section>

      {/* ── Chat and reports for your own kundli ──────────────────────────
          The floating "Talk to Astrologer" button is gone on purpose: the
          raised Chat tab below does the same thing, and the button sat on
          top of it. */}
      {primary && (
        <section className="home-jump m-enter grid grid-cols-2 gap-3" style={{ animationDelay: '0.18s' }}>
          <Pressable to={`/chat/${primary.id}`} className="m-card flex items-center gap-3 p-4 text-left">
            <MessageCircle className="h-5 w-5 shrink-0 text-accent" />
            <span className="text-[13.5px] font-bold leading-tight">{t("Talk to Astrologer")}</span>
          </Pressable>
          <Pressable to={`/reports/${primary.id}`} className="m-card flex items-center gap-3 p-4 text-left">
            <ScrollText className="h-5 w-5 shrink-0 text-accent" />
            <span className="text-[13.5px] font-bold leading-tight">{t("Reports")}</span>
          </Pressable>
        </section>
      )}
    </div>
  );
}
