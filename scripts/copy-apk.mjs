/**
 * Copy the freshly built RELEASE apk to public/, named for its own version.
 *
 * Release, never debug. A debug build of this app is 12MB across fifteen dex
 * files; the release build is 9.5MB across two — and Android has to compile
 * every one of those dex files while the user watches the install spinner, so
 * the debug build takes far longer to install for no benefit. It also carries
 * android:debuggable, which in an app that handles payments means anyone with
 * USB access can attach a debugger and read the session token.
 *
 * The version comes from build.gradle, which is the only place it is set, so
 * the file name and the version can never disagree.
 */
import fs from "node:fs";

const gradle = fs.readFileSync("android/app/build.gradle", "utf8");
const version = /versionName\s+"([^"]+)"/.exec(gradle)?.[1];
if (!version) { console.error("Could not read versionName from android/app/build.gradle"); process.exit(1); }

const src = "android/app/build/outputs/apk/release/app-release.apk";
if (!fs.existsSync(src)) { console.error(`Not found: ${src} — run gradlew assembleRelease first.`); process.exit(1); }

const dest = `public/JanamJyot-v${version}.apk`;
fs.copyFileSync(src, dest);
const mb = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`APK ${version} ready: ${dest} (${mb} MB)`);
