/**
 * API base resolution.
 *
 * The web app calls the backend with relative paths (`/api/...`). Inside the
 * Capacitor webview the page is served from `https://localhost`, so a relative
 * path would hit the bundled assets instead of the server. We install a fetch
 * interceptor that rewrites `/api/*` to the hosted backend.
 *
 * This module must be imported BEFORE `auth.tsx` so that its interceptor sits
 * *under* the auth one: auth still sees the relative `/api/...` URL (and so
 * still attaches the token + device id), and we rewrite the URL last, right
 * before the real network call.
 */
import { Capacitor } from '@capacitor/core';

export const IS_NATIVE = Capacitor.isNativePlatform();

/**
 * This app's OWN backend. It is a standalone project — it does NOT call any
 * other site. Set `VITE_API_BASE` (in .env.local) to this app's deployed
 * backend URL before building the APK, e.g. https://your-app.vercel.app.
 */
/**
 * Where an installed APK looks for the backend, and how it survives that
 * backend moving.
 *
 * This is the app's single hardest-to-fix dependency: the URL is baked in at
 * build time, so if the host it names disappears, every phone that already has
 * the app is stranded and the only remedy is a new APK the user must find and
 * install themselves. For an app people have paid money into, that is not an
 * acceptable failure mode.
 *
 * Three defences, in order:
 *   1. VITE_API_BASE should be a domain YOU own, not a platform subdomain.
 *      Then moving hosts is a DNS change and no phone notices.
 *   2. VITE_API_FALLBACKS — comma-separated alternates. If the primary cannot
 *      be reached at all, the app tries these and keeps the one that answers.
 *   3. The working base is remembered, so the recovery happens once rather
 *      than on every launch.
 *
 * Note this only rescues a host that is GONE. It cannot rescue a domain you
 * do not control — which is exactly why (1) matters most.
 */
const BASE_KEY = 'jj:api-base';

const configuredBase = (() => {
  const fromEnv = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // On the web the app is served by the same origin as the API.
  if (!IS_NATIVE) return '';
  console.error('[api] VITE_API_BASE is not set — the native app has no backend to call.');
  return '';
})();

/** Alternates to try if the primary host is unreachable. */
export const API_FALLBACKS: string[] = (() => {
  const raw = (import.meta as any).env?.VITE_API_FALLBACKS as string | undefined;
  return (raw ?? '')
    .split(',')
    .map((u) => u.trim().replace(/\/$/, ''))
    .filter(Boolean);
})();

/** A previously discovered working base wins, but only if we still list it. */
let activeBase: string = (() => {
  if (!IS_NATIVE) return configuredBase;
  try {
    const saved = localStorage.getItem(BASE_KEY);
    if (saved && (saved === configuredBase || API_FALLBACKS.includes(saved))) return saved;
  } catch { /* storage unavailable */ }
  return configuredBase;
})();

export const API_BASE: string = activeBase;

/**
 * Called when the active base looks dead (network error, not an HTTP error —
 * a 500 means the server is alive and failing, which switching won't fix).
 * Returns true if it found a different base that answers.
 */
export async function tryFailover(): Promise<boolean> {
  if (!IS_NATIVE) return false;
  const candidates = [configuredBase, ...API_FALLBACKS].filter((b) => b && b !== activeBase);
  for (const base of candidates) {
    if (await isUsable(base)) {
      activeBase = base;
      try { localStorage.setItem(BASE_KEY, base); } catch { /* ignore */ }
      console.warn('[api] switched backend to', base);
      return true;
    }
  }
  return false;
}

/**
 * Is this base one we can actually TALK to — not merely one that answers?
 *
 * The distinction is the whole point of this function, and it cost us a live
 * outage. A host that 3xx-redirects to another origin still serves a plain GET
 * perfectly: the browser follows the hop and hands back 200. But a POST with a
 * JSON body is not a simple request — it is preflighted, and per the Fetch
 * spec a redirect in response to a CORS preflight is a NETWORK ERROR that the
 * browser refuses to follow. So reads look healthy while every write dies as
 * `TypeError: Failed to fetch`.
 *
 * That is exactly what happened: the Vercel project got a new primary domain,
 * every other domain began redirecting to it, and the baked-in base in shipped
 * APKs started bouncing. The old probe here was a bare GET, so it cheerfully
 * declared the broken host healthy and refused to fail over.
 *
 * A base that sends us to a different origin is therefore DEAD to us, however
 * cleanly it answers.
 */
export async function isUsable(base: string): Promise<boolean> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(base + '/api/config', { signal: ctl.signal });
    if (r.redirected) {
      try {
        if (new URL(r.url).origin !== new URL(base, location.href).origin) {
          console.warn('[api] rejecting', base, '— it redirects to', new URL(r.url).origin);
          return false;
        }
      } catch { return false; }
    }
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Absolute URL for an API path. */
export function apiUrl(path: string): string {
  if (!path.startsWith('/api')) return path;
  return API_BASE + path;
}

let installed = false;
export function installApiBase() {
  if (installed || typeof window === 'undefined' || !activeBase) return;
  installed = true;
  const orig = window.fetch.bind(window);

  // Reads `activeBase` at call time, not the frozen API_BASE const, so a
  // failover takes effect immediately for every request after it.
  const send = async (path: string, input: any, init?: any) => {
    const build = (base: string) =>
      typeof input === 'string' ? orig(base + path, init) : orig(new Request(base + path, input), init);
    try {
      return await build(activeBase);
    } catch (err) {
      // A thrown fetch is a transport failure — DNS gone, host unreachable.
      // An HTTP error would have resolved normally, and switching hosts
      // wouldn't help there anyway.
      if (await tryFailover()) return build(activeBase);
      throw err;
    }
  };

  window.fetch = (input: any, init?: any) => {
    if (typeof input === 'string' && input.startsWith('/api')) {
      return send(input, input, init);
    }
    // A Request built from "/api/x" has already been resolved against the
    // document origin, so match on the origin-relative form.
    if (input instanceof Request && input.url.startsWith(window.location.origin + '/api')) {
      return send(input.url.slice(window.location.origin.length), input, init);
    }
    return orig(input, init);
  };
}

installApiBase();
