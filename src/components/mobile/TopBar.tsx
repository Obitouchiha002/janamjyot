import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, Settings, Share2, Coins, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getLang } from '@/lib/prefs';
import { Pressable } from './Pressable';
import { titleFor, isRootTab, parentOf } from './routes';
import { shareText } from '@/lib/native';

/**
 * Contextual app bar: a back chevron on pushed screens, the screen title, and a
 * trailing action. It sits *over* the content (translucent) and only grows its
 * divider once the content has scrolled underneath — which is what stops the
 * app from reading like a web page with a sticky header.
 */
export default function TopBar({ scrolled }: { scrolled: boolean }) {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const root = isRootTab(pathname);
  const title = titleFor(pathname);
  const atTop = root && !scrolled;

  /*
   * A refresh throws the history stack away, so on a reloaded screen there is
   * no previous entry and `navigate(-1)` silently did nothing — the chevron
   * looked broken because it was. React Router marks the first entry of a
   * session with the key "default"; when that is where we are, go to the
   * screen this one sits under instead of nowhere.
   */
  const goBack = () => {
    if (location.key && location.key !== 'default') navigate(-1);
    else navigate(parentOf(pathname), { replace: true });
  };

  return (
    <header className={`app-topbar ${scrolled ? 'scrolled' : ''} ${atTop ? 'at-top' : ''}`}>
      {!root ? (
        <Pressable
          onClick={goBack}
          feedback="tap"
          aria-label="Back"
          className="w-11 h-11 grid place-items-center rounded-full text-foreground"
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
          <WalletChip />
          <Pressable
            onClick={() => shareText('JanamJyot', 'Check out JanamJyot — accurate Vedic astrology.', (import.meta as any).env?.VITE_APP_DOWNLOAD_URL || undefined)}
            aria-label="Share app"
            className="w-11 h-11 grid place-items-center rounded-full text-muted-foreground"
          >
            <Share2 className="w-[19px] h-[19px]" />
          </Pressable>
          <Pressable
            to="/settings"
            aria-label="Settings"
            className="w-11 h-11 grid place-items-center rounded-full text-muted-foreground"
          >
            <Settings className="w-[19px] h-[19px]" />
          </Pressable>
        </div>
      )}
    </header>
  );
}

/**
 * The balance, in the bar, on every root screen.
 *
 * Credits were invisible unless you went looking under More, which is the
 * wrong place for the one number that decides whether the next thing you tap
 * will work. It refreshes when a screen changes and after any spend, so it
 * never shows a figure the server has already moved past.
 */
function WalletChip() {
  const [balance, setBalance] = useState<number | null>(null);
  const [trialEnds, setTrialEnds] = useState<string | null>(null);
  // Re-render once a minute so "2d left" becomes "1d left" while the app is open.
  const [, tick] = useState(0);

  useEffect(() => {
    let alive = true;
    const read = () =>
      fetch('/api/credits')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!alive || !d || typeof d.balance !== 'number') return;
          setBalance(d.balance);
          setTrialEnds(d.trial?.active && d.trial?.ends_at ? d.trial.ends_at : null);
        })
        .catch(() => {});
    read();
    // Any charge dispatches this, so the number moves the moment it is spent.
    window.addEventListener('jj:credits', read);
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => { alive = false; window.removeEventListener('jj:credits', read); clearInterval(t); };
  }, []);

  if (balance === null) return null;

  /*
   * While the ₹1 trial runs, the chip shows how long is left instead of the
   * balance. Someone who has just paid needs to see that it worked and when it
   * ends without going looking under More — a purchase whose effect you cannot
   * see from the home screen feels like a purchase that did not happen.
   */
  if (trialEnds) {
    const ms = Date.parse(trialEnds) - Date.now();
    if (ms > 0) {
      const hours = Math.floor(ms / 3_600_000);
      // "2d 18h" alone read as a mystery number; say it is the trial.
      const days = Math.floor(hours / 24);
      const lg = getLang();
      const left = days >= 1
        ? (lg === 'hi' ? `ट्रायल · ${days} दिन` : lg === 'hinglish' ? `Trial · ${days} din` : `Trial · ${days}d left`)
        : (lg === 'hi' ? `ट्रायल · ${Math.max(1, hours)} घंटे` : lg === 'hinglish' ? `Trial · ${Math.max(1, hours)} ghante` : `Trial · ${Math.max(1, hours)}h left`);
      return (
        <Pressable
          to="/plan"
          aria-label={`Full access active, ${left} left — open your plan`}
          className="flex h-9 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 text-[12.5px] font-bold text-accent"
        >
          <Sparkles className="h-[14px] w-[14px]" />
          <span className="tabular-nums">{left}</span>
        </Pressable>
      );
    }
  }

  return (
    <Pressable
      to="/plan"
      aria-label={`${balance} credits — open your plan`}
      className="flex h-9 items-center gap-1.5 rounded-full border border-border px-2.5 text-[13px] font-bold"
    >
      <Coins className="h-[15px] w-[15px] text-accent" />
      <span className="tabular-nums">{balance}</span>
    </Pressable>
  );
}
