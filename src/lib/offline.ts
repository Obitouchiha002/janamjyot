/**
 * Offline mode.
 *
 * Two jobs:
 *  1. Track connectivity (Capacitor Network natively, browser events on web).
 *  2. Cache successful GET /api responses and REPLAY them when a later request
 *     fails or the device is offline — so saved kundlis, charts, panchang and
 *     already-generated reports keep opening on a train, in a lift, or on a
 *     dead 4G bar instead of showing a network error.
 *
 * This module installs a fetch interceptor and must be imported LAST (after
 * lib/api and auth), so it sits OUTERMOST and can catch the final failure.
 * Writes (POST/DELETE) are never cached or replayed — replaying them would
 * silently duplicate charts or re-spend AI quota.
 */

const PREFIX = 'jj:cache:';
const MAX_ENTRIES = 120;
const MAX_AGE = 30 * 24 * 3600 * 1000; // a month — stale beats blank offline

/**
 * Endpoints we deliberately NEVER write to localStorage.
 *
 * Offline mode necessarily keeps the user's own chart data on their own device
 * (that's the whole feature), but anything that is either a credential surface
 * or somebody else's data stays out of it — localStorage is readable by any
 * script on the page, so the less that sits there the better.
 */
const NEVER_CACHE = [
  '/api/auth/',      // sessions, codes, account state
  '/api/admin/',     // other people's accounts and analytics
  '/api/chat-history', // private conversations
  '/api/config',     // trivial + changes server-side
];

function cacheable(url: string): boolean {
  return !NEVER_CACHE.some((p) => url.includes(p));
}

let online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
const listeners = new Set<(on: boolean) => void>();

/** Current connectivity, as last reported by the platform. */
export function isOnline(): boolean {
  return online;
}

/** Subscribe to connectivity changes. Returns an unsubscribe function. */
export function onConnectivityChange(cb: (on: boolean) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  listeners.forEach((cb) => { try { cb(next); } catch { /* ignore */ } });
}

// ── cache helpers ──────────────────────────────────────────────────────────

function keyFor(url: string): string {
  // Strip the origin so the same path caches identically on web and native.
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  return PREFIX + path;
}

/** Keep the cache bounded — drop the oldest entries once we exceed the cap. */
function prune() {
  try {
    const entries: Array<{ k: string; at: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      try {
        const at = JSON.parse(localStorage.getItem(k) || '{}')?.at ?? 0;
        entries.push({ k, at });
      } catch { entries.push({ k, at: 0 }); }
    }
    const stale = Date.now() - MAX_AGE;
    for (const e of entries) if (e.at < stale) localStorage.removeItem(e.k);
    const left = entries.filter((e) => e.at >= stale).sort((a, b) => a.at - b.at);
    for (let i = 0; i < left.length - MAX_ENTRIES; i++) localStorage.removeItem(left[i].k);
  } catch { /* quota/permission issues are not worth crashing over */ }
}

function readCache(url: string): { body: string; at: number } | null {
  try {
    const raw = localStorage.getItem(keyFor(url));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.body !== 'string') return null;
    return parsed;
  } catch { return null; }
}

function writeCache(url: string, body: string) {
  try {
    localStorage.setItem(keyFor(url), JSON.stringify({ body, at: Date.now() }));
  } catch {
    // Most likely the storage quota — free some room and try once more.
    prune();
    try { localStorage.setItem(keyFor(url), JSON.stringify({ body, at: Date.now() })); } catch { /* give up */ }
  }
}

/** Build a Response that looks like the original, flagged as served from cache. */
function cachedResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'X-JJ-Cache': 'hit' },
  });
}

/** Wipe every cached API response (used by "clear offline data"). */
export function clearOfflineCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

/** Roughly how much is cached — shown in Settings. */
export function offlineCacheInfo(): { entries: number; kb: number } {
  let entries = 0, bytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      entries++;
      bytes += (localStorage.getItem(k) || '').length;
    }
  } catch { /* ignore */ }
  return { entries, kb: Math.round(bytes / 1024) };
}

// ── install ────────────────────────────────────────────────────────────────

let installed = false;

export function installOffline() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Connectivity: browser events always, Capacitor Network when native.
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
  import('@capacitor/network')
    .then(({ Network }) => {
      Network.getStatus().then((s) => setOnline(s.connected)).catch(() => {});
      Network.addListener('networkStatusChange', (s) => setOnline(s.connected));
    })
    .catch(() => { /* web without the plugin — the DOM events are enough */ });

  prune();

  const orig = window.fetch.bind(window);
  window.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input?.url ?? '';
    const method = String(init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const isApiGet = method === 'GET' && typeof url === 'string' && url.includes('/api/');

    if (!isApiGet || !cacheable(url)) return orig(input, init);

    // Offline and we have a copy → serve it immediately, don't wait for a
    // request that is going to fail anyway.
    if (!online) {
      const hit = readCache(url);
      if (hit) return cachedResponse(hit.body);
    }

    try {
      const res = await orig(input, init);
      if (res.ok) {
        // Clone before reading — the caller still needs an unconsumed body.
        res.clone().text().then((body) => { if (body) writeCache(url, body); }).catch(() => {});
      }
      return res;
    } catch (err) {
      const hit = readCache(url);
      if (hit) return cachedResponse(hit.body);
      throw err;
    }
  };
}

installOffline();
