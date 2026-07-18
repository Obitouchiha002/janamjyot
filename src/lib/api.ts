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
export const API_BASE: string = (() => {
  const fromEnv = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // On the web the app is served by the same origin as the API.
  if (!IS_NATIVE) return '';
  // Native build with no VITE_API_BASE set — misconfiguration. Warn loudly
  // rather than silently pointing at some other project's server.
  console.error('[api] VITE_API_BASE is not set — the native app has no backend to call.');
  return '';
})();

/** Absolute URL for an API path. */
export function apiUrl(path: string): string {
  if (!path.startsWith('/api')) return path;
  return API_BASE + path;
}

let installed = false;
export function installApiBase() {
  if (installed || typeof window === 'undefined' || !API_BASE) return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: any, init?: any) => {
    if (typeof input === 'string' && input.startsWith('/api')) {
      return orig(API_BASE + input, init);
    }
    // A Request built from "/api/x" has already been resolved against the
    // document origin, so match on the origin-relative form.
    if (input instanceof Request && input.url.startsWith(window.location.origin + '/api')) {
      const path = input.url.slice(window.location.origin.length);
      return orig(new Request(API_BASE + path, input), init);
    }
    return orig(input, init);
  };
}

installApiBase();
