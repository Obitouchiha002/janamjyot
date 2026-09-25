import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Must come first: it installs the fetch interceptor that points the app's
// relative `/api/...` calls at the hosted backend when running natively.
// auth.tsx layers its own interceptor on top of this one.
import './lib/api';
// Layers a fetch interceptor that broadcasts any /api 429 as a `va-quota`
// event (handled by <QuotaListener/>), without swallowing the response.
import './lib/quota';
// Imported LAST so its interceptor sits OUTERMOST: it caches successful
// GET /api responses and replays them when the network is down.
import './lib/offline';

import { isNative } from './lib/native';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorState';
import './index.css';

/*
 * Every old web link keeps working.
 *
 * The web app now lives under /app (see App.tsx), but the host rewrites ANY
 * extensionless path to it — so a bookmark from before, /chat or /reports/123,
 * would load the app with a path the router no longer knows and show nothing.
 * One redirect, before React starts, moves those onto the new home instead.
 */
if (!isNative && !/^\/app(\/|$)/.test(location.pathname)) {
  location.replace(`/app${location.pathname}${location.search}${location.hash}`);
}

// A rejected promise nobody handled shouldn't be invisible in a shipped APK,
// where there is no console to open.
window.addEventListener('unhandledrejection', (e) => {
  console.error('[JanamJyot] unhandled rejection', e.reason);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
