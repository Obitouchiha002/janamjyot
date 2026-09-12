/**
 * Strip website-only assets out of `dist/` BEFORE `cap sync`, so the Android APK
 * doesn't bundle the landing page, the APK file itself, the demo video and the
 * marketing screenshots (which would bloat the APK — and compound every build).
 *
 * The Vercel web deploy runs `npm run build` on its own servers and serves the
 * FULL dist, so the website still gets every file. This pruning only affects the
 * local dist used to assemble the APK.
 *
 * Usage (APK build): npm run build && node scripts/prune-app-dist.mjs && npx cap sync android
 */
import { rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dist = "dist";

// exact website-only files the mobile app never loads
const FILES = [
  "download.html", "privacy.html", "terms.html",
  "sitemap.xml", "robots.txt", "site.webmanifest",
  "janamjyot-og.png", "janamjyot-qr.png",
  // The bundled BACKEND. `npm run build` emits it into dist/ for the server
  // deploy; the Android app must never carry it — ~750 KB of dead weight, and
  // it would ship server-side code (plus its source map) to every device.
  "server.cjs", "server.cjs.map", "server.mjs", "server.mjs.map",
];
const DIRS = ["screens", "ota"]; // ota/: published web bundles — never inside another bundle or the APK
// anything matching these extensions at the dist root (the APK + demo video)
const EXT = [".apk", ".mp4"];

let removed = 0;
function drop(p) {
  const full = join(dist, p);
  if (existsSync(full)) { rmSync(full, { recursive: true, force: true }); removed++; console.log("pruned", p); }
}

if (!existsSync(dist)) { console.error("dist/ not found — run `npm run build` first."); process.exit(1); }

FILES.forEach(drop);
DIRS.forEach(drop);
for (const f of readdirSync(dist)) {
  if (EXT.some((e) => f.toLowerCase().endsWith(e))) drop(f);
}
console.log(`prune-app-dist: removed ${removed} website-only item(s) from dist/`);
