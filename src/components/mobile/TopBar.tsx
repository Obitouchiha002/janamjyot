import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings, Share2 } from 'lucide-react';
import { Pressable } from './Pressable';
import { titleFor, isRootTab } from './routes';
import { shareText } from '@/lib/native';

/**
 * Contextual app bar: a back chevron on pushed screens, the screen title, and a
 * trailing action. It sits *over* the content (translucent) and only grows its
 * divider once the content has scrolled underneath — which is what stops the
 * app from reading like a web page with a sticky header.
 */
export default function TopBar({ scrolled }: { scrolled: boolean }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const root = isRootTab(pathname);
  const title = titleFor(pathname);
  const atTop = root && !scrolled;

  return (
    <header className={`app-topbar ${scrolled ? 'scrolled' : ''} ${atTop ? 'at-top' : ''}`}>
      {!root ? (
        <Pressable
          onClick={() => navigate(-1)}
          feedback="tap"
          aria-label="Back"
          className="w-10 h-10 grid place-items-center rounded-full text-foreground"
        >
          <ChevronLeft className="w-6 h-6" />
        </Pressable>
      ) : (
        <span className="w-2" />
      )}

      <h1
        className={`flex-1 truncate font-bold tracking-tight ${
          root ? 'text-[19px] pl-2' : 'text-[17px] text-center pr-10'
        }`}
      >
        {pathname === '/' ? (
          <span>
            Janam<span className="text-accent font-light">Jyot</span>
          </span>
        ) : (
          title
        )}
      </h1>

      {root && (
        <div className="flex items-center gap-1 pr-1">
          <Pressable
            onClick={() => shareText('JanamJyot', 'Check out JanamJyot — accurate Vedic astrology.', (import.meta as any).env?.VITE_APP_DOWNLOAD_URL || undefined)}
            aria-label="Share app"
            className="w-10 h-10 grid place-items-center rounded-full text-muted-foreground"
          >
            <Share2 className="w-[19px] h-[19px]" />
          </Pressable>
          <Pressable
            to="/settings"
            aria-label="Settings"
            className="w-10 h-10 grid place-items-center rounded-full text-muted-foreground"
          >
            <Settings className="w-[19px] h-[19px]" />
          </Pressable>
        </div>
      )}
    </header>
  );
}
