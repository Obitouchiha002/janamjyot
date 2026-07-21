import { useEffect, useRef } from 'react';

/**
 * `setInterval` that only ticks while the app is actually on screen.
 *
 * Plain intervals kept polling after the user backgrounded the app — burning
 * battery and mobile data to refresh a screen nobody was looking at. This also
 * fires once immediately on return, so coming back shows fresh data rather
 * than whatever was on screen when they left.
 *
 * `fn` is held in a ref, so passing an inline closure won't restart the timer.
 */
export function useVisibleInterval(fn: () => void, ms: number) {
  const saved = useRef(fn);
  saved.current = fn;

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;

    const stop = () => { if (id) { clearInterval(id); id = null; } };
    const start = () => { if (!id) id = setInterval(() => saved.current(), ms); };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        saved.current(); // catch up on whatever changed while we were away
        start();
      } else {
        stop();
      }
    };

    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { stop(); document.removeEventListener('visibilitychange', onVisibility); };
  }, [ms]);
}
