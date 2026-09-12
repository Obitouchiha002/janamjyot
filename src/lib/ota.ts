/**
 * Over-the-air web updates.
 *
 * The APK is sideloaded, so a new build needs the user to tap Install. But
 * almost everything that changes — screens, copy, logic — is web code, and
 * that can be delivered silently: /api/config names the web bundle phones
 * should run; the app downloads it in the background, the plugin verifies its
 * sha256, and it takes over on the next launch. A bundle that fails to start
 * (never reaches notifyAppReady) is rolled back automatically. Changes to the
 * native shell still go through the APK update sheet.
 */
import { isNative } from './native';
import { API_BASE } from './api';

declare const __WEB_BUILD__: string;
/** Build number of the web bundle that is running right now. */
export const WEB_BUILD: string = typeof __WEB_BUILD__ !== 'undefined' ? __WEB_BUILD__ : 'dev';
try { (window as any).__JJ_WEB_BUILD__ = WEB_BUILD; } catch { /* no window */ }

/** 1.18 is newer than 1.9. */
function newerVersion(a: string, b: string): boolean {
  const x = a.split('.').map((n) => parseInt(n, 10) || 0), y = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0); }
  return false;
}

/*
 * Builds that failed on this phone are never fetched again.
 *
 * The updater rolls a bundle back when it never reports a good boot — but it
 * does that by deleting it, and the next check would find the same build in
 * the manifest and download it straight back: broken, rolled back, broken
 * again, for as long as the manifest pointed at it. So the build being tried
 * is written down before it is queued; the next good boot either finds it
 * running (it worked) or finds it gone (it failed) and remembers that.
 * localStorage is shared by every bundle on the phone, so the verdict
 * survives the switch.
 */
const TRY_KEY = 'jj:ota-trying';
const FAILED_KEY = 'jj:ota-failed';

function failedBuilds(): string[] {
  try { const v = JSON.parse(localStorage.getItem(FAILED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function markFailed(build: string) {
  try { const f = failedBuilds(); if (!f.includes(build)) localStorage.setItem(FAILED_KEY, JSON.stringify([...f, build].slice(-20))); } catch { /* ignore */ }
}

/**
 * Tell the updater this bundle booted (a bundle that never gets here is rolled
 * back), then settle what happened to the build we queued last time.
 */
export async function otaReady(): Promise<void> {
  if (!isNative) return;
  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await CapacitorUpdater.notifyAppReady();
    const trying = localStorage.getItem(TRY_KEY);
    if (!trying) return;
    if (trying === WEB_BUILD) { localStorage.removeItem(TRY_KEY); return; } // it took over: good
    // Still waiting to be applied (the app has not been backgrounded yet)?
    const { bundles } = await CapacitorUpdater.list();
    const pending = bundles.find((b) => b.version === trying && b.status !== 'error');
    if (!pending) { markFailed(trying); localStorage.removeItem(TRY_KEY); } // deleted as failing
  } catch { /* plugin absent in older builds */ }
}

let checking = false;
let lastCheck = 0;

/**
 * Look for a newer web bundle; download it and queue it for the next launch.
 * Returns the queued build, or null. Never throws, never blocks the app.
 */
export async function checkWebUpdate(force = false): Promise<string | null> {
  if (!isNative || checking) return null;
  if (!force && Date.now() - lastCheck < 30 * 60_000) return null;
  checking = true;
  lastCheck = Date.now();
  try {
    const cfg = await (await fetch('/api/config')).json();
    const m = cfg?.app?.web;
    // Build numbers are fixed-width timestamps, so string order is time order;
    // a local "dev" build never takes an update.
    if (!m?.build || m.disabled || !(String(m.build) > WEB_BUILD)) return null;
    if (failedBuilds().includes(String(m.build))) return null; // failed here before — wait for a newer one
    const { App } = await import('@capacitor/app');
    const native = (await App.getInfo()).version || '0';
    if (m.min_native && newerVersion(String(m.min_native), native)) return null; // needs a newer APK first

    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    const { bundles } = await CapacitorUpdater.list();
    let bundle = bundles.find((b) => b.version === String(m.build) && b.status !== 'error');
    if (!bundle) {
      bundle = await CapacitorUpdater.download({
        url: new URL(String(m.url), API_BASE || window.location.origin).toString(),
        version: String(m.build),
        checksum: m.checksum ? String(m.checksum) : undefined,
      });
    }
    try { localStorage.setItem(TRY_KEY, String(m.build)); } catch { /* ignore */ }
    await CapacitorUpdater.next({ id: bundle.id });
    return String(m.build);
  } catch {
    return null;
  } finally {
    checking = false;
  }
}
