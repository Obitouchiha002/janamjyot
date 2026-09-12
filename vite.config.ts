import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// No PWA/service worker here: the assets ship inside the APK, and a Workbox
// precache in the webview only ever serves a *stale* copy of them after an
// app update. The hosted web build keeps its service worker.
export default defineConfig(() => {
  return {
    // Every build carries its own number; over-the-air updates only ever move
    // a phone forward to a larger one (src/lib/ota.ts).
    define: {
      __WEB_BUILD__: JSON.stringify(process.env.WEB_BUILD || new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)),
    },
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
