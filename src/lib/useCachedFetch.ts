import { useEffect, useRef, useState } from "react";

/**
 * Stale-while-revalidate fetch for GET /api — the single biggest "premium feel"
 * lever in this app.
 *
 * The old flow was: every screen mounts → blank/skeleton → wait for the network
 * (a Vercel serverless cold start can be 1-3s) → content. So every visit felt
 * slow, even to a screen you just saw.
 *
 * This returns the LAST known value INSTANTLY (from an in-memory cache, or from
 * localStorage on a cold app start) so the screen paints filled on the first
 * frame, then revalidates in the background and swaps in fresh data when it
 * arrives. Revisiting a screen is now 0ms; first-of-session shows last session's
 * data immediately instead of a spinner.
 *
 * Only for idempotent GETs whose momentary staleness is harmless (daily
 * guidance, right-now, profiles, a saved chart). Never for writes, auth, or
 * another person's data.
 */

type Entry = { data: any; at: number };
const mem = new Map<string, Entry>();
const PREFIX = "jj:swr:";
const MAX_AGE = 24 * 3600 * 1000; // a day — older than that, don't show stale first

function readPersisted(key: string): Entry | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry;
    return e && typeof e.at === "number" ? e : null;
  } catch {
    return null;
  }
}

function persist(key: string, e: Entry) {
  mem.set(key, e);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(e));
  } catch {
    /* quota — the in-memory copy still serves this session */
  }
}

/** Prime the initial value synchronously so the very first render is filled. */
function initial(key: string | null): any {
  if (!key) return undefined;
  const m = mem.get(key);
  if (m) return m.data;
  const p = readPersisted(key);
  if (p && Date.now() - p.at < MAX_AGE) {
    mem.set(key, p);
    return p.data;
  }
  return undefined;
}

export function useCachedFetch<T = any>(
  url: string | null,
  opts: { enabled?: boolean } = {},
): { data: T | undefined; loading: boolean; error: boolean; refresh: () => void } {
  const enabled = opts.enabled !== false && !!url;
  const key = url;
  const [data, setData] = useState<T | undefined>(() => initial(key));
  // Only "loading" when we have nothing to show — a revalidation over cached
  // data is invisible, which is the whole point.
  const [loading, setLoading] = useState<boolean>(() => enabled && initial(key) === undefined);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !key) return;
    const cached = initial(key);
    if (cached !== undefined) { setData(cached); setLoading(false); }
    else setLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(key);
        const j = await r.json().catch(() => null);
        if (cancelled || !alive.current) return;
        if (r.ok && j && !(j as any).error) {
          persist(key, { data: j, at: Date.now() });
          setData(j);
          setError(false);
        } else if (cached === undefined) {
          setError(true);
        }
      } catch {
        if (!cancelled && alive.current && cached === undefined) setError(true);
      } finally {
        if (!cancelled && alive.current) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [key, enabled, tick]);

  return { data, loading, error, refresh: () => setTick((n) => n + 1) };
}
