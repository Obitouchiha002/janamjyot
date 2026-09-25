/**
 * In-app update check.
 *
 * The APK is sideloaded from our own site, so there is no Play Store to tell
 * anyone a newer build exists — someone can happily sit on an old version
 * forever. On launch the app asks the server what the current version is and,
 * if it's behind, offers the download.
 *
 * The update then happens INSIDE the app: it downloads the APK itself, shows
 * the progress, and hands the finished file to Android's installer. The old
 * flow opened a browser, and an update that asks someone to find a file in
 * their notification shade is an update most people never finish.
 *
 * To be clear about the permission this needs: REQUEST_INSTALL_PACKAGES does
 * not install anything silently. Android still shows its own install screen
 * and the person still taps Install — that prompt is what makes a sideloaded
 * update trustworthy, and it stays. What we removed is the detour.
 */
import { isNative } from './native';

const SKIP_KEY = 'jj:update-skipped';

export interface UpdateInfo {
  current: string;   // version this build is
  latest: string;    // version the server says is out
  apkUrl: string;
  notes: string;
  mandatory: boolean;
}

/** Compare dotted versions: 1.10 is newer than 1.9. */
function isNewer(latest: string, current: string): boolean {
  const a = String(latest).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** The version of the running build, from the native package info. */
async function currentVersion(): Promise<string> {
  if (!isNative) return '';
  try {
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info?.version || '';
  } catch { return ''; }
}

/**
 * Returns update details when a newer version exists and the user hasn't
 * already dismissed that exact version, else null. Never throws.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isNative) return null; // the web app is always current
  try {
    const current = await currentVersion();
    if (!current) return null;

    const cfg = await (await fetch('/api/config')).json();
    const latest = String(cfg?.app?.version || '');
    if (!latest || !isNewer(latest, current)) return null;

    if (!cfg.app.mandatory) {
      try {
        if (localStorage.getItem(SKIP_KEY) === latest) return null; // already said "later"
      } catch { /* ignore */ }
    }

    return {
      current,
      latest,
      apkUrl: String(cfg.app.apk_url || ''),
      notes: String(cfg.app.notes || ''),
      mandatory: !!cfg.app.mandatory,
    };
  } catch {
    return null; // an update check must never block the app
  }
}

/** Remember that the user dismissed this version. */
export function skipVersion(version: string): void {
  try { localStorage.setItem(SKIP_KEY, version); } catch { /* ignore */ }
}

/** The native side (android/.../ApkUpdaterPlugin.java), when this build has it. */
async function plugin(): Promise<any | null> {
  if (!isNative) return null;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    const p: any = registerPlugin('ApkUpdater');
    // An older APK does not carry the plugin; calling it there would hang.
    await p.canInstall();
    return p;
  } catch {
    return null;
  }
}

export type UpdateStage =
  | { stage: 'downloading'; percent: number }
  | { stage: 'needs-permission' }
  | { stage: 'installing' }
  | { stage: 'failed'; message: string };

/**
 * Download the update and open Android's installer, reporting progress.
 *
 * Falls back to the browser when the plugin is missing (an APK older than this
 * feature) or when anything native refuses — an update must always have a way
 * through.
 */
export async function startUpdate(
  apkUrl: string,
  onStage?: (s: UpdateStage) => void,
): Promise<void> {
  if (!apkUrl) return;
  const p = await plugin();
  if (p) {
    let listener: any;
    try {
      const version = apkUrl.match(/JanamJyot-v?([\d.]+)\.apk/i)?.[1] || 'latest';
      listener = await p.addListener('apkProgress', (e: any) => {
        onStage?.({ stage: 'downloading', percent: Math.max(0, Math.min(100, Number(e?.percent) || 0)) });
      });
      onStage?.({ stage: 'downloading', percent: 0 });
      const { path, canInstall } = await p.download({ url: apkUrl, version });
      if (!canInstall) {
        // The one-time "allow this app to install apps" toggle. The file is
        // already here, so saying yes lands straight on the installer.
        onStage?.({ stage: 'needs-permission' });
        await p.openInstallSettings();
        pendingApk = path;
        return;
      }
      onStage?.({ stage: 'installing' });
      await p.install({ path });
      return;
    } catch (e: any) {
      onStage?.({ stage: 'failed', message: String(e?.message || 'The update could not be downloaded.') });
      return;
    } finally {
      listener?.remove?.();
    }
  }

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: apkUrl });
  } catch {
    window.open(apkUrl, '_blank');
  }
}

/** A file downloaded before the person granted the install permission. */
let pendingApk: string | null = null;

/**
 * Called when the app comes back from the permission screen: if the APK is
 * already downloaded and installing is now allowed, go straight to it.
 */
export async function resumePendingInstall(): Promise<boolean> {
  if (!pendingApk) return false;
  const p = await plugin();
  if (!p) return false;
  try {
    const { value } = await p.canInstall();
    if (!value) return false;
    const path = pendingApk;
    pendingApk = null;
    await p.install({ path });
    return true;
  } catch {
    return false;
  }
}
