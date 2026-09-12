/**
 * Publish an over-the-air web update — one command, then deploy.
 *
 *   npm run ota:publish -- [--min-native 1.17] [--notes "what changed"]
 *
 * 1. builds the web app with a fresh WEB_BUILD number (YYYYMMDDhhmm)
 * 2. prunes website-only files — the same list the APK uses
 * 3. zips dist → public/ota/web-<build>.zip and takes its sha256
 * 4. writes server/ota-manifest.ts (served in /api/config)
 * After the deploy, phones download it quietly and switch on their next launch.
 * `--min-native` is the oldest APK the bundle may run on: raise it when the web
 * code starts needing something only a newer APK has.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const build = process.env.WEB_BUILD || new Date().toISOString().replace(/[-:T]/g, "").slice(0, 12);
const prevMin = (() => { try { return /"min_native": "([^"]+)"/.exec(fs.readFileSync("server/ota-manifest.ts", "utf8"))?.[1]; } catch { return undefined; } })();
const minNative = arg("--min-native", prevMin || "1.17");
const notes = arg("--notes", "");

execSync("npm run build", { stdio: "inherit", env: { ...process.env, WEB_BUILD: build } });
execSync("node scripts/prune-app-dist.mjs", { stdio: "inherit" });

fs.mkdirSync("public/ota", { recursive: true });
const zip = path.resolve(`public/ota/web-${build}.zip`);
fs.rmSync(zip, { force: true });
execSync(`cd dist && zip -r -q -X "${zip}" .`, { stdio: "inherit", shell: "/bin/sh" });
const checksum = createHash("sha256").update(fs.readFileSync(zip)).digest("hex");

const manifest = { build, url: `/ota/web-${build}.zip`, checksum, min_native: minNative, notes };
const src = fs.readFileSync("server/ota-manifest.ts", "utf8");
const head = src.slice(0, src.indexOf("export const OTA_MANIFEST"));
fs.writeFileSync("server/ota-manifest.ts", `${head}export const OTA_MANIFEST: OtaManifest | null = ${JSON.stringify(manifest, null, 2)};\n`);

// Keep the three newest bundles on the site; older phones only ever need the latest.
const old = fs.readdirSync("public/ota").filter((f) => /^web-\d+\.zip$/.test(f)).sort().slice(0, -3);
for (const f of old) fs.rmSync(path.join("public/ota", f));

const kb = Math.round(fs.statSync(zip).size / 1024);
console.log(`\nOTA bundle ${build} ready: public/ota/web-${build}.zip (${kb} KB, sha256 ${checksum.slice(0, 12)}…), min APK ${minNative}.`);
console.log("Deploy the site to roll it out.");
