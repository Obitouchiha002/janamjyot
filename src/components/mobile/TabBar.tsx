import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { TABS, tabLabel } from './routes';
import { haptic } from '@/lib/native';

/**
 * The five-destination bottom bar. Re-tapping the active tab scrolls its screen
 * back to the top — the behaviour people expect from a native tab bar.
 */
export default function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Re-render when the language changes in Settings.
  const [, bump] = useState(0);
  useEffect(() => { const f = () => bump((n) => n + 1); window.addEventListener('jj:lang', f); return () => window.removeEventListener('jj:lang', f); }, []);

  const go = (to: string, active: boolean) => {
    if (active) {
      document.querySelector('.app-scroll')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    navigate(to);
  };

  return (
    <nav className="app-tabbar">
      {TABS.map(({ to, label, icon: Icon, center }) => {
        const active = pathname === to;
        return (
          <button
            key={to}
            className={`tab-item ${active ? 'active' : ''} ${center ? 'tab-center' : ''}`}
            aria-label={tabLabel(to, label)}
            aria-current={active ? 'page' : undefined}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') haptic.select(); }}
            onClick={() => go(to, active)}
          >
            <Icon className="tab-ico w-[21px] h-[21px]" strokeWidth={active ? 2.4 : 1.9} />
            <span>{tabLabel(to, label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
