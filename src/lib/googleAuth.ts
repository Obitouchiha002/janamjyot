/**
 * Google Sign-In bridge.
 *
 * Native uses the `@codetrix-studio/capacitor-google-auth` plugin; the web uses
 * the Google Identity Services (GSI) script if it happens to be on the page.
 *
 * ── CONFIGURATION THE USER MUST DO ─────────────────────────────────────────
 *   1. Set `VITE_GOOGLE_CLIENT_ID` (in .env.local / your build env) to your
 *      Google Cloud OAuth **Web client ID**. Without it the Google button is
 *      rendered DISABLED and nothing here ever runs — the app never crashes.
 *   2. Android: use that SAME web client id in the native config, and register
 *      the app's **SHA-1** fingerprint on that OAuth client in Google Cloud.
 *   3. Server: set `GOOGLE_CLIENT_IDS` (or `GOOGLE_CLIENT_ID`) to the same
 *      value so `/api/auth/google` will accept the token.
 *
 * The plugin is loaded through a dynamic, variable specifier so that this app
 * still type-checks and boots even when the plugin isn't part of the bundle
 * (e.g. it hasn't been installed for the current Capacitor version yet).
 */
import { isNative } from './native';
// Static import so Vite BUNDLES the plugin. A dynamic `import(variable)` with
// @vite-ignore leaves a bare specifier the native webview can't resolve at
// runtime → "Google Sign-In isn't available in this build". The plugin is a
// real dependency now and ships a web stub, so importing it directly is safe on
// every platform.
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';

/** The OAuth **web** client id. Empty string when unconfigured. */
export const GOOGLE_CLIENT_ID: string =
  ((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || '';

/** True when a client id is present — the login button gates on this. */
export const googleConfigured = !!GOOGLE_CLIENT_ID;

/** Return the (statically bundled) native plugin. */
// Synchronous on purpose. Returning a Capacitor plugin from an async function
// (or awaiting it) makes the Promise probe its `.then` — which the native
// bridge answers with "GoogleAuth.then() is not implemented on android",
// an unhandled rejection on every launch.
function loadGoogleAuth(): any | null {
  return GoogleAuth ?? null;
}

let initPromise: Promise<void> | null = null;

/**
 * Initialise the native Google Auth plugin exactly once. No-op on the web, when
 * unconfigured, or when the plugin isn't present — so it's always safe to call.
 */
export function initGoogleAuth(): void {
  if (!isNative || !googleConfigured || initPromise) return;
  initPromise = (async () => {
    const GoogleAuth = loadGoogleAuth();
    if (!GoogleAuth) return;
    try {
      // On Android the plugin already has `serverClientId` from
      // capacitor.config.ts + strings.xml. Passing a runtime `clientId` here
      // overrides that native config with a value the Android GoogleSignIn
      // options don't expect, which can leave signIn() hanging with no account
      // picker. So initialise bare on native, and configure only on web.
      if (isNative) await GoogleAuth.initialize();
      else await GoogleAuth.initialize({
        clientId: GOOGLE_CLIENT_ID,
        scopes: ['profile', 'email'],
        grantOfflineAccess: false,
      });
    } catch {
      /* the button flow surfaces a friendly error if sign-in then fails */
    }
  })();
}

/**
 * Turn the plugin's cryptic native failure into an actionable message. The
 * Android Google Sign-In status codes are the usual culprits — especially 10
 * (DEVELOPER_ERROR): the app's SHA-1 + package aren't registered on an OAuth
 * client in the SAME Google Cloud project as the web client id.
 */
function describeGoogleError(err: any): string {
  const rawCode = err?.code ?? err?.errorCode ?? err?.status;
  const code = rawCode != null ? String(rawCode) : '';
  const msg = String(err?.message ?? err?.error ?? '').trim();
  const map: Record<string, string> = {
    '10': 'Google setup mismatch (code 10). In Google Cloud, add an Android OAuth client with package com.vanshkashyap.vedicastra + this app’s SHA-1, in the SAME project as the web client id.',
    '12500': 'Google Sign-In failed (code 12500) — a Play Services / config problem on the device.',
    '12501': 'Sign-in was cancelled.',
    '7': 'Network error — check your internet and try again.',
    '8': 'Google had an internal error. Please try again.',
  };
  if (code && map[code]) return map[code];
  if (/DEVELOPER_ERROR/i.test(msg)) return map['10'];
  if (/cancel/i.test(msg)) return 'Sign-in was cancelled.';
  return `Google sign-in failed${code ? ` (code ${code})` : ''}${msg ? `: ${msg}` : '.'}`;
}

/**
 * Never let a native promise hang the UI. `initialize()` in particular can sit
 * unresolved on Android (the button then just spins forever), so we cap every
 * await and carry on / fail loudly instead.
 */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T | never): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try { resolve(onTimeout()); } catch (e) { reject(e); }
    }, ms);
    p.then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } },
    );
  });
}

/** Native flow → returns a Google **ID token** to POST to `/api/auth/google`. */
async function nativeIdToken(): Promise<string> {
  const GoogleAuth = loadGoogleAuth();
  if (!GoogleAuth) throw new Error("Google Sign-In isn't available in this build.");
  // Don't block on init — if it stalls, proceed anyway (the native side reads
  // its config from capacitor.config / strings.xml regardless).
  if (initPromise) {
    try { await withTimeout(initPromise, 4000, () => undefined as any); } catch { /* ignore */ }
  }
  let result: any;
  try {
    // 25s: long enough to pick an account, short enough that a silent failure
    // surfaces as a real message instead of a spinner that never ends.
    result = await withTimeout(
      Promise.resolve(GoogleAuth.signIn()),
      25000,
      () => { throw new Error('Google sign-in did not open. This usually means the app is not registered correctly in Google Cloud (SHA-1 / package / test users). Use email sign-in for now.'); },
    );
  } catch (err: any) {
    // A timeout throw already carries a friendly message — don't remap it.
    if (err instanceof Error && /timed out/i.test(err.message)) throw err;
    throw new Error(describeGoogleError(err));
  }
  const idToken: string | undefined =
    result?.authentication?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('Google did not return a sign-in token.');
  return idToken;
}

/** Web flow via Google Identity Services, if the script is on the page. */
async function webIdToken(): Promise<string> {
  const g = (window as any).google;
  if (!googleConfigured || !g?.accounts?.id) {
    throw new Error("Google Sign-In isn't set up on web yet.");
  }
  return new Promise<string>((resolve, reject) => {
    try {
      g.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (resp: any) => {
          if (resp?.credential) resolve(resp.credential as string);
          else reject(new Error('Google Sign-In was cancelled.'));
        },
      });
      g.accounts.id.prompt();
    } catch {
      reject(new Error("Google Sign-In isn't set up on web yet."));
    }
  });
}

/** Get a Google ID token for the current platform. */
export function getGoogleIdToken(): Promise<string> {
  return isNative ? nativeIdToken() : webIdToken();
}
