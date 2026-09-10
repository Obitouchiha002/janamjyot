import { useLocation, useNavigate } from 'react-router-dom';
import { TABS } from './routes';
import { haptic } from '@/lib/native';

/**
 * The five-destination bottom bar. Re-tapping the active tab scrolls its screen
 * back to the top — the behaviour people expect from a native tab bar.
 */
export default function TabBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

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
            aria-label={label}
            aria-current={active ? 'page' : undefined}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse') haptic.select(); }}
            onClick={() => go(to, active)}
          >
            <Icon className="tab-ico w-[21px] h-[21px]" strokeWidth={active ? 2.4 : 1.9} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
