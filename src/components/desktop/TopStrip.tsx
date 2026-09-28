/**
 * The desktop's top strip: whose chart, what it costs, and everything the rail
 * does not have room for.
 *
 * The left rail answers "where can I go". This answers the other three things
 * a desktop app is expected to keep in view and a phone hides in menus:
 *   · WHO this screen is about — the kundli in play, switchable in one click
 *     (a phone hides this behind the Kundli tab, and people read a partner's
 *     chart for weeks without noticing);
 *   · what the account is — plan, trial, and the credit balance, with buying
 *     one click away instead of three;
 *   · the deeper tools — muhurat, yogas, ashtakavarga, transits — which are
 *     real features buried under "More" because a phone had five tabs.
 *
 * It is quiet by design: one line, glass, no colour until something needs
 * attention (a trial ending, a balance at zero). Everything opens in place.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown, Plus, Check, Coins, Crown, Sparkles, Wand2,
  CalendarClock, Gem, Grid3x3, Orbit, Bell, Settings, LogOut, User,
} from 'lucide-react';
import { useAuth } from '@/auth';
import { pickPrimary, setPrimary } from '@/lib/primary';
import { openCheckout } from '@/lib/checkout';
import { askSignIn } from '@/lib/gate';

interface Profile { id: string; name: string; date?: string }

/**
 * The tools a phone buries under "More" — here they ARE the navigation.
 *
 * They were a dropdown for one afternoon and that was the wrong call twice
 * over: the strip had half its width empty, and a feature behind a menu behind
 * a label called "Advanced" is a feature nobody opens.
 */
const TOOLS = [
  { to: '/panchang', label: 'Panchang', icon: Orbit },
  { to: '/muhurat', label: 'Muhurat', icon: CalendarClock },
  { to: '/yogas', label: 'Yogas', icon: Gem },
  { to: '/ashtakavarga', label: 'Ashtakavarga', icon: Grid3x3 },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/tools', label: 'More tools', icon: Wand2 },
];

const SPRING = { type: 'spring' as const, stiffness: 460, damping: 34 };

/** A dropdown that closes on outside click and on Escape. */
function Menu({
  open, onClose, children, align = 'left',
}: { open: boolean; onClose: () => void; children: React.ReactNode; align?: 'left' | 'right' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute top-[calc(100%+8px)] z-50 w-[288px] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-2xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const row = 'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-semibold transition-colors hover:bg-muted';

export default function TopStrip() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [credits, setCredits] = useState<{ balance: number; trial?: { active: boolean; ends_at: string | null } } | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [open, setOpen] = useState<null | 'who' | 'advanced' | 'account'>(null);

  const loadProfiles = () => {
    fetch('/api/profiles')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list: Profile[] = Array.isArray(d) ? d : [];
        setProfiles(list);
        setActiveId(pickPrimary(list, user?.name)?.id ?? null);
      })
      .catch(() => setProfiles([]));
  };

  useEffect(loadProfiles, [user?.id]);

  useEffect(() => {
    if (!user) { setCredits(null); setPlan(null); return; }
    let alive = true;
    const read = () => {
      fetch('/api/credits').then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setCredits(d); }).catch(() => {});
      fetch('/api/me/usage').then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d?.plan) setPlan(String(d.plan)); }).catch(() => {});
    };
    read();
    window.addEventListener('jj:credits', read);
    return () => { alive = false; window.removeEventListener('jj:credits', read); };
  }, [user?.id]);

  const active = profiles?.find((p) => p.id === activeId) ?? null;
  const initial = (s?: string | null) => (s || '?').trim().charAt(0).toUpperCase();

  const choose = (p: Profile) => {
    setPrimary(p.id);
    setActiveId(p.id);
    setOpen(null);
    navigate(`/dashboard/${p.id}`);
  };

  return (
    <motion.header
      className="top-strip"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ── Whose chart ─────────────────────────────────────────────────── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(open === 'who' ? null : 'who')}
          className="flex items-center gap-2.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
        >
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-foreground">
            {active ? initial(active.name) : <User className="h-[15px] w-[15px]" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">Reading for</span>
            <span className="mt-0.5 block max-w-[150px] truncate text-[13px] font-bold leading-none">
              {active ? active.name : 'No kundli yet'}
            </span>
          </span>
          <ChevronDown className="h-[15px] w-[15px] shrink-0 text-muted-foreground" />
        </button>

        <Menu open={open === 'who'} onClose={() => setOpen(null)}>
          <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
            Your kundlis
          </p>
          {profiles?.length ? profiles.map((p) => (
            <button key={p.id} type="button" onClick={() => choose(p)} className={row}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent/15 text-[12px] font-bold text-accent">
                {initial(p.name)}
              </span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.id === activeId && <Check className="h-[16px] w-[16px] shrink-0 text-accent" />}
            </button>
          )) : (
            <p className="px-2.5 py-2 text-[12.5px] text-muted-foreground">Nothing saved yet.</p>
          )}
          <div className="my-1 h-px bg-border" />
          <button type="button" onClick={() => { setOpen(null); navigate('/create-chart'); }} className={`${row} text-accent`}>
            <Plus className="h-[16px] w-[16px]" strokeWidth={2.6} /> New kundli
          </button>
        </Menu>
      </div>

      {/* ── The tools, in the open ──────────────────────────────────────── */}
      <nav className="top-tools flex items-center gap-0.5">
        {TOOLS.map(({ to, label, icon: Icon }) => {
          const on = pathname === to || pathname.startsWith(`${to}/`);
          return (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className={`relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                on ? 'text-accent' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {/* One pill, moved between the items — so the highlight travels
                  instead of blinking on somewhere else. */}
              {on && (
                <motion.span
                  layoutId="top-tool-pill"
                  className="absolute inset-0 rounded-full bg-accent/14"
                  transition={SPRING}
                />
              )}
              <Icon className="relative h-[15px] w-[15px]" />
              <span className="relative top-tool-label">{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* ── What the account has ─────────────────────────────────────── */}
        {user && (
          <>
            {credits?.trial?.active && (
              <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11.5px] font-bold text-accent">Trial</span>
            )}
            {plan && plan !== 'free' && (
              <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11.5px] font-bold uppercase text-accent">
                <Crown className="h-[13px] w-[13px]" /> {plan}
              </span>
            )}
            <button
              type="button"
              onClick={() => navigate('/plan')}
              title="Your credits"
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-muted"
            >
              <Coins className="h-[15px] w-[15px] text-accent" />
              <span className="tabular-nums">{credits?.balance ?? '—'}</span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => (user ? openCheckout('popular', user.email) : askSignIn({ reason: 'plan' }))}
          className="flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-[12.5px] font-bold text-accent-foreground shadow-sm shadow-accent/25 transition-transform hover:scale-[1.02]"
        >
          <Sparkles className="h-[14px] w-[14px]" /> {user ? 'Add credits' : 'See plans'}
        </button>

        {/* ── The account itself ───────────────────────────────────────── */}
        <div className="relative">
          {user ? (
            <button
              type="button"
              onClick={() => setOpen(open === 'account' ? null : 'account')}
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-[13px] font-bold text-accent-foreground"
              aria-label="Account"
            >
              {initial(user.name || user.email)}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="rounded-full border border-border px-3.5 py-1.5 text-[12.5px] font-bold transition-colors hover:bg-muted"
            >
              Sign in
            </button>
          )}

          <Menu open={open === 'account'} onClose={() => setOpen(null)} align="right">
            <div className="px-2.5 py-2">
              <p className="truncate text-[13.5px] font-bold">{user?.name || 'Account'}</p>
              <p className="truncate text-[12px] text-muted-foreground">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <button type="button" onClick={() => { setOpen(null); navigate('/plan'); }} className={row}>
              <Crown className="h-[16px] w-[16px] text-muted-foreground" /> Plan & credits
            </button>
            <button type="button" onClick={() => { setOpen(null); navigate('/profiles'); }} className={row}>
              <User className="h-[16px] w-[16px] text-muted-foreground" /> My kundlis
            </button>
            <button type="button" onClick={() => { setOpen(null); navigate('/settings'); }} className={row}>
              <Settings className="h-[16px] w-[16px] text-muted-foreground" /> Settings
            </button>
            <div className="my-1 h-px bg-border" />
            <button type="button" onClick={() => { setOpen(null); logout(); }} className={`${row} text-destructive`}>
              <LogOut className="h-[16px] w-[16px]" /> Sign out
            </button>
          </Menu>
        </div>
      </div>
    </motion.header>
  );
}
