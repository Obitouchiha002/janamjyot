import { useLocation, useNavigate } from 'react-router-dom';
import { Sparkles, Settings, Plus } from 'lucide-react';
import { TABS } from '@/components/mobile/routes';

/**
 * The desktop / iPad top navigation bar.
 *
 * Phones use the bottom tab bar; a wide window gets a proper horizontal navbar
 * instead — logo left, the five destinations in the middle, a primary "New
 * Kundli" action and settings on the right. Shown only at >=768px (CSS
 * `.app-topnav`); the content below is widened and centred so the app fills a
 * window like a real desktop app rather than a stretched phone. Same premium
 * cream / gold theme.
 */
export default function TopNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  return (
    <header className="app-topnav">
      <div className="mx-auto flex h-full max-w-[1120px] items-center gap-5 px-6">
        {/* brand */}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex shrink-0 items-center gap-2.5"
          aria-label="Home"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/15 text-accent">
            <Sparkles className="h-[17px] w-[17px]" strokeWidth={2.2} />
          </span>
          <span className="text-[19px] font-bold leading-none tracking-tight">
            Janam<span className="font-light text-accent">Jyot</span>
          </span>
        </button>

        {/* primary nav */}
        <nav className="ml-2 flex items-center gap-1">
          {TABS.map(({ to, label }) => {
            const active = pathname === to;
            return (
              <button
                key={to}
                type="button"
                onClick={() => navigate(to)}
                className={`rounded-full px-3.5 py-2 text-[14px] font-bold transition-colors ${
                  active ? 'bg-accent/15 text-accent' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* actions */}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/create-chart')}
            className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13.5px] font-bold text-accent-foreground shadow-sm shadow-accent/25"
          >
            <Plus className="h-[16px] w-[16px]" strokeWidth={2.6} />
            New Kundli
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            aria-label="Settings"
            className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${
              pathname === '/settings' ? 'text-accent' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Settings className="h-[19px] w-[19px]" />
          </button>
        </div>
      </div>
    </header>
  );
}
