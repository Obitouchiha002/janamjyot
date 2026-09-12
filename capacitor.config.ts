import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.vanshkashyap.vedicastra',
  appName: 'JanamJyot',
  webDir: 'dist',
  // Live-reload for fast testing: when CAP_LIVE_RELOAD=1 at `cap sync` time, the
  // app loads the frontend from the local dev server (10.0.2.2 = host from the
  // Android emulator) so code edits appear instantly, no APK rebuild. Production
  // builds omit this and use the bundled dist + hosted backend.
  ...(process.env.CAP_LIVE_RELOAD
    ? { server: { url: 'http://10.0.2.2:3000', cleartext: true } as any }
    : {}),
  android: {
    // Matches the app background (Classic Cream) so there is no colour flash
    // between the splash screen and the first painted frame.
    backgroundColor: '#F8F5EF',
    // The webview page is served from https://localhost. In production the API
    // is HTTPS too, so no mixed content ever occurs. This only matters when a
    // debug build points at a local http backend (http://10.0.2.2) — without it
    // the webview blocks every API call as mixed content.
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      // Auto-hide the static native splash quickly so the animated web loading
      // screen (planets orbiting the logo, in index.html) becomes visible while
      // the app finishes booting.
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: '#F8F5EF',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
      // LIGHT = dark icons, for the light cream chrome.
      style: 'LIGHT',
      backgroundColor: '#00000000',
    },
    Keyboard: {
      // 'Native' = let ANDROID resize the webview when the keyboard opens
      // (paired with android:windowSoftInputMode="adjustResize"). This is the
      // reliable path: the viewport itself shrinks, so a bottom-anchored chat
      // composer sits above the keyboard with no JS measuring at all.
      // The previous 'None' + manual --kb-height approach silently failed on
      // devices (e.g. MIUI) where neither the window nor visualViewport
      // resized, leaving the composer hidden behind the keyboard.
      resize: KeyboardResize.Native,
    },
    GoogleAuth: {
      // The OAuth **Web** client id (also in strings.xml as server_client_id and
      // verified by the server). Public value — safe to ship.
      serverClientId: '594636087513-0eq9pft3vtm7l9gd723db8sq1jmpc47h.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      forceCodeForRefreshToken: false,
    },
    CapacitorUpdater: {
      // Our own update check only (src/lib/ota.ts): never the vendor's cloud.
      autoUpdate: false,
      // "" turns stats reporting off — otherwise it posts to plugin.capgo.app.
      statsUrl: '',
      // A bundle must report a good boot within 10s or it is rolled back.
      appReadyTimeout: 10000,
      // Installing a new APK drops downloaded bundles, so the APK's own web
      // code always wins over an older over-the-air one.
      resetWhenUpdate: true,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
    },
  },
};

export default config;
