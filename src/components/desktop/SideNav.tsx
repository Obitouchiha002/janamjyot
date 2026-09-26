import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Sparkles, Plus, Settings, LogIn, Crown,
  Home, Users, MessageCircle, Compass, FileText, Wand2, LayoutGrid, Heart,
  type LucideIcon,
} from 'lucide-react';
import { tabLabel } from '@/components/mobile/routes';
import { useAuth } from '@/auth';

/**
 * The desktop sidebar — the web app's spine on a real screen.
 *
 * A phone app centred in a 1920px window is not a desktop product: the eye has
 * nowhere to rest, every destination is two taps deep behind a "More" tab, and
 * the window's whole left half is wallpaper. From 1024px the destinations move
 * into a permanent rail, so every part of the app is one click from anywhere
 * and the reading column keeps a sane width beside it.
 *
 * Phones and small tablets never see this (CSS `.app-sidenav`, min-width
 * 1024px); they keep the mobile top bar and bottom tabs, which is what the
 * same layout should be on a phone.
 */

interface NavItem { to: string; label: string; icon: LucideIcon }

/** Everything the app can do, grouped the way a person would look for it. */
const MAIN: NavItem[] = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/profiles', label: 'Kundli', icon: Users },
  { to: '/decide', label: 'Faisla', icon: Compass },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/match', label: 'Matching', icon: Heart },
];
const SECONDARY: NavItem[] = [
  { to: '/tools', label: 'Tools', icon: Wand2 },
  { to: '/more', label: 'More', icon: LayoutGrid },
];

export default function SideNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  /*
   * The balance lives in the phone's top bar, which a desktop window does not
   * have — so a paying person had no way to see what they had left. It sits on
   * the plan row here, refreshed whenever something spends credits.
   */
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!user) { setBalance(null); return; }
    let alive = true;
    const read = () => fetch('/api/credits')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && typeof d?.balance === 'number') setBalance(d.balance); })
      .catch(() => {});
    read();
    window.addEventListener('jj:credits', read);
    return () => { alive = false; window.removeEventListener('jj:credits', read); };
  }, [user?.id]);

  const Item = ({ to, label, icon: Icon }: NavItem) => {
    // "/" only matches itself; every other item also owns its sub-screens, so
    // reading a report keeps "Reports" lit rather than lighting nothing.
    const active = to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
    return (
      <button
        key={to}
        type="button"
        onClick={() => navigate(to)}
        data-active={active}
        className={`nav-item flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold transition-colors ${
          active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.4 : 2} />
        {tabLabel(to, label)}
      </button>
    );
  };

  return (
    <aside className="app-sidenav">
      <div className="flex h-full flex-col gap-1 px-3 py-4">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-3 flex shrink-0 items-center gap-2.5 px-2"
          aria-label="Home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
            <Sparkles className="h-[18px] w-[18px]" strokeWidth={2.2} />
          </span>
          <span className="text-[19px] font-bold leading-none tracking-tight">
            Janam<span className="font-light text-accent">Jyot</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => navigate('/create-chart')}
          className="mb-3 flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-[14px] font-bold text-accent-foreground shadow-sm shadow-accent/25 transition-transform hover:scale-[1.01]"
        >
          <Plus className="h-[16px] w-[16px]" strokeWidth={2.6} />
          New Kundli
        </button>

        <nav className="flex flex-col gap-0.5">{MAIN.map((i) => <Item key={i.to} {...i} />)}</nav>

        <div className="my-2 h-px bg-border" />

        <nav className="flex flex-col gap-0.5">{SECONDARY.map((i) => <Item key={i.to} {...i} />)}</nav>

        {/* Account sits at the bottom, where every desktop app keeps it. */}
        <div className="mt-auto flex flex-col gap-0.5 pt-3">
          {user ? (
            <>
              <button
                type="button"
                onClick={() => navigate('/plan')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Crown className="h-[18px] w-[18px] shrink-0" />
                My plan
                {balance !== null && (
                  <span className="ml-auto rounded-full bg-accent/15 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-accent">
                    {balance}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => navigate('/settings')}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-muted"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-bold text-accent-foreground">
                  {(user.name || user.email || '?').trim().charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold">
                  {user.name || user.email}
                </span>
                <Settings className="h-[16px] w-[16px] shrink-0 text-muted-foreground" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-[14px] font-bold transition-colors hover:bg-muted"
            >
              <LogIn className="h-[18px] w-[18px] shrink-0" />
              Sign in
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
