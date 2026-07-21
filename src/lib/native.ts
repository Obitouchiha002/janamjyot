/**
 * Native bridge — haptics, status bar, splash, share, downloads, clipboard.
 *
 * Every export is safe to call on the web: when the app runs in a browser the
 * calls degrade to a no-op (or the Web API equivalent) instead of throwing, so
 * the same components render in both places.
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { App as CapApp } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Keyboard } from '@capacitor/keyboard';

export const isNative = Capacitor.isNativePlatform();

/**
 * Rough "is this a weak device" check, from RAM and core count (both are just
 * hints the browser may withhold, so we default to assuming a capable device).
 * Used to trade animation richness for frame-rate on budget phones.
 */
export const isLowPowerDevice: boolean = (() => {
  try {
    const mem = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency;
    if (typeof mem === 'number' && mem <= 2) return true;
    if (typeof cores === 'number' && cores <= 4) return true;
  } catch { /* APIs unavailable — assume capable */ }
  return false;
})();

/* ── Haptics ───────────────────────────────────────────────────────────────
   `tap` is the one used on every interactive element. Keep it light: Android
   fires these synchronously and a heavy style on a list scroll feels broken. */

/**
 * Vibration strength, user-controlled.
 *
 * `full` is still deliberately gentle: Android's *notification* haptics
 * (Success/Warning/Error) are long buzzes that feel like an alarm when they
 * fire on an ordinary button, so we use short impacts everywhere instead and
 * keep the real notification pattern only for errors, where a distinct feel is
 * worth it.
 */
export type HapticLevel = 'off' | 'light' | 'full';
const HAPTIC_KEY = 'jj:haptics';

export function getHapticLevel(): HapticLevel {
  try {
    const v = localStorage.getItem(HAPTIC_KEY);
    if (v === 'off' || v === 'light' || v === 'full') return v;
  } catch { /* ignore */ }
  return 'light'; // gentle by default — the old behaviour felt too strong
}

export function setHapticLevel(level: HapticLevel): void {
  try { localStorage.setItem(HAPTIC_KEY, level); } catch { /* ignore */ }
}

const impact = (style: ImpactStyle) => {
  if (!isNative) return;
  if (getHapticLevel() === 'off') return;
  Haptics.impact({ style }).catch(() => {});
};

export const haptic = {
  /** Every interactive element. Must stay barely-there. */
  tap: () => impact(ImpactStyle.Light),
  /** Primary actions (send, generate, confirm). */
  medium: () => impact(getHapticLevel() === 'full' ? ImpactStyle.Medium : ImpactStyle.Light),
  heavy: () => impact(getHapticLevel() === 'full' ? ImpactStyle.Heavy : ImpactStyle.Medium),
  select: () => {
    if (!isNative || getHapticLevel() === 'off') return;
    Haptics.selectionChanged().catch(() => {});
  },
  /** Was a long notification buzz — now a single short pulse. */
  success: () => impact(getHapticLevel() === 'full' ? ImpactStyle.Medium : ImpactStyle.Light),
  warning: () => impact(ImpactStyle.Light),
  /** The one place a distinct notification pattern earns its keep. */
  error: () => {
    if (!isNative || getHapticLevel() === 'off') return;
    if (getHapticLevel() === 'light') { impact(ImpactStyle.Medium); return; }
    Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  },
};

/* ── Status bar ────────────────────────────────────────────────────────────
   The shell draws its own translucent header behind the status bar, so the bar
   overlays the webview and we only flip the icon tint with the theme. */

export async function setStatusBarForTheme(isDark: boolean) {
  if (!isNative) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    // Style.Dark = light icons (for a dark bar); Style.Light = dark icons.
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch { /* status bar is unavailable on some OEM builds */ }
}

export async function hideSplash() {
  if (!isNative) return;
  try { await SplashScreen.hide({ fadeOutDuration: 350 }); } catch {}
}

/* ── Clipboard ─────────────────────────────────────────────────────────────*/

export async function readClipboard(): Promise<string> {
  try {
    if (isNative) return (await Clipboard.read()).value ?? '';
    return await navigator.clipboard.readText();
  } catch { return ''; }
}

export async function writeClipboard(text: string) {
  try {
    if (isNative) await Clipboard.write({ string: text });
    else await navigator.clipboard.writeText(text);
    haptic.success();
  } catch {}
}

/* ── Share ─────────────────────────────────────────────────────────────────*/

export async function shareText(title: string, text: string, url?: string) {
  try {
    if (isNative) {
      await Share.share({ title, text, url, dialogTitle: title });
    } else if (navigator.share) {
      await navigator.share({ title, text, url });
    } else {
      await writeClipboard(`${text}${url ? ' ' + url : ''}`);
    }
    haptic.tap();
  } catch { /* user dismissed the sheet */ }
}

/** Share a generated file (e.g. the Life Report PDF) through the system sheet. */
export async function shareFile(fileUri: string, title: string) {
  if (!isNative) return;
  try { await Share.share({ title, url: fileUri, dialogTitle: title }); } catch {}
}

/* ── Downloads ─────────────────────────────────────────────────────────────
   Saves a base64 payload (what jsPDF's `output('datauristring')` gives us) into
   the phone's shared Documents folder and posts a notification so the user can
   find it, the way a real download would behave. */

export async function saveToDownloads(
  fileName: string,
  base64Data: string,
  opts: { notifyTitle?: string; notifyBody?: string } = {},
): Promise<string | null> {
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

  if (!isNative) {
    // Browser: fall back to a normal anchor download.
    const a = document.createElement('a');
    a.href = base64Data.startsWith('data:') ? base64Data : `data:application/pdf;base64,${raw}`;
    a.download = fileName;
    a.click();
    return null;
  }

  // Android 11+ scoped storage makes the public Documents folder unwritable
  // without special permission → the old "storage error". Try the shared
  // Documents first (works on older devices), then fall back to app-specific
  // external, then internal cache — one of these ALWAYS succeeds so the PDF is
  // never lost. The caller then offers Share so the user can place it anywhere.
  const dirs: Directory[] = [Directory.Documents, Directory.External, Directory.Cache];
  let lastErr: unknown = null;
  for (const directory of dirs) {
    try {
      const res = await Filesystem.writeFile({ path: fileName, data: raw, directory, recursive: true });
      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== 'granted') await LocalNotifications.requestPermissions();
        await LocalNotifications.schedule({
          notifications: [{
            id: Math.floor(Math.random() * 100000),
            title: opts.notifyTitle ?? 'Download complete',
            body: opts.notifyBody ?? `${fileName} saved`,
          }],
        });
      } catch { /* notifications denied — the file is still saved */ }
      haptic.success();
      return res.uri;
    } catch (e) {
      lastErr = e; // try the next directory
    }
  }
  haptic.error();
  throw lastErr;
}

/* ── Init ──────────────────────────────────────────────────────────────────
   Wires the hardware back button and keyboard behaviour. `onBack` gets a chance
   to handle the press (close a sheet, pop a route); if it returns false we exit
   the app, which is what Android users expect from the root screen. */

export function initNative(opts: { onBack: () => boolean; isDark: boolean }) {
  if (!isNative) return () => {};

  setStatusBarForTheme(opts.isDark);

  const backHandle = CapApp.addListener('backButton', () => {
    haptic.tap();
    const handled = opts.onBack();
    if (!handled) CapApp.exitApp();
  });

  // Let the layout know how tall the keyboard is, so inputs (chat composer etc.)
  // sit ABOVE the keyboard. Primary source = the visualViewport API, which
  // reliably reports the covered area on Android WebView (Chromium) and iOS even
  // when the window itself doesn't resize (our Keyboard.resize = "none" mode).
  // The Capacitor keyboard events are kept only as a fallback where visualViewport
  // is unavailable — this is what fixes the "composer hidden behind keyboard" bug.
  // Android now resizes the webview itself (KeyboardResize.Native +
  // adjustResize), so the viewport ALREADY excludes the keyboard and layouts
  // built on 100dvh/flex are correct with no help from us.
  //
  // `--kb-height` therefore comes from visualViewport ONLY, which is
  // self-correcting: it reports ~0 when the window resized (nothing left to
  // subtract) and the real overlap when it didn't. We must NOT also add
  // Capacitor's keyboardHeight here — with a resizing window that would
  // subtract the keyboard twice and float the composer far above it.
  const setKb = (h: number) => {
    const kb = Math.max(0, Math.round(h));
    document.documentElement.style.setProperty('--kb-height', `${kb}px`);
  };
  const vv = window.visualViewport;
  const onVV = () => { if (vv) setKb(window.innerHeight - vv.height - vv.offsetTop); };
  if (vv) { vv.addEventListener('resize', onVV); vv.addEventListener('scroll', onVV); onVV(); }

  // The events still drive the `kb-open` styling hook (never the height).
  const showHandle = Keyboard.addListener('keyboardWillShow', () => {
    document.documentElement.classList.add('kb-open');
  });
  const hideHandle = Keyboard.addListener('keyboardWillHide', () => {
    document.documentElement.classList.remove('kb-open');
    setKb(0);
  });

  return () => {
    backHandle.then((h) => h.remove());
    showHandle.then((h) => h.remove());
    hideHandle.then((h) => h.remove());
    if (vv) { vv.removeEventListener('resize', onVV); vv.removeEventListener('scroll', onVV); }
  };
}
