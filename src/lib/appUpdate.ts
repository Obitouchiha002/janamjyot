/**
 * In-app update check.
 *
 * The APK is sideloaded from our own site, so there is no Play Store to tell
 * anyone a newer build exists — someone can happily sit on an old version
 * forever. On launch the app asks the server what the current version is and,
 * if it's behind, offers the download.
 *
 * Android then hands the downloaded APK to the system installer. We
 * deliberately do NOT ask for REQUEST_INSTALL_PACKAGES to install silently:
 * that permission lets an app install software without the user seeing it, and
 * an astrology app has no business holding it. The user taps "Install" in the
 * OS dialog, which is also what makes the update trustworthy.
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

/** Open the APK so Android downloads it and offers to install. */
export async function startUpdate(apkUrl: string): Promise<void> {
  if (!apkUrl) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: apkUrl });
  } catch {
    window.open(apkUrl, '_blank');
  }
}
