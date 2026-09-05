/**
 * Web-only root swap — run by Vercel AFTER `npm run build`.
 *
 * The marketing site must answer at `https://janamjyot.lzworth.in/` with a real
 * 200, not a redirect: payment gateways (Razorpay) verify the bare domain and
 * reject a URL that only redirects, and a redirecting root is a weak canonical
 * for SEO too.
 *
 * Vercel resolves the FILESYSTEM before rewrites, so whatever sits at
 * `dist/index.html` wins at `/`. Vite writes the SPA there. So for the web
 * deploy we swap:
 *     dist/index.html   (SPA)        -> dist/app.html
 *     dist/download.html (marketing) -> dist/index.html
 * and vercel.json rewrites every SPA route to /app.html.
 *
 * This runs ONLY through vercel.json's buildCommand. The Android build uses
 * plain `npm run build` (then prune-app-dist + cap sync), so the APK keeps the
 * real SPA as its index.html and is completely unaffected.
 */
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dist = join(process.cwd(), "dist");
const spa = join(dist, "index.html");
const marketing = join(dist, "download.html");
const appOut = join(dist, "app.html");

if (!existsSync(spa)) {
  console.error("[web-root] dist/index.html missing — did the build run?");
  process.exit(1);
}
if (!existsSync(marketing)) {
  console.error("[web-root] dist/download.html missing — marketing page not built?");
  process.exit(1);
}

// Guard against running twice: if index.html is already the marketing page,
// re-running would copy the marketing page over app.html and kill the SPA.
const already = readFileSync(spa, "utf8").includes("data-screen=");
if (already) {
  console.log("[web-root] root already swapped — nothing to do");
  process.exit(0);
}

copyFileSync(spa, appOut);        // SPA -> /app.html
copyFileSync(marketing, spa);     // marketing -> /  (200, no redirect)
console.log("[web-root] / now serves the marketing page; the app serves from /app.html");
