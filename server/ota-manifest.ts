/**
 * The web bundle phones should be running.
 *
 * Written by `npm run ota:publish`, shipped with the next deploy, and served
 * inside /api/config (the app already reads it on every launch, and it is
 * CORS-allowed for the app — a static JSON file on the site would not be).
 * null = no over-the-air update published.
 */
export interface OtaManifest {
  build: string;       // WEB_BUILD of the bundle — newer builds replace older ones
  url: string;         // zip, relative to the site
  checksum: string;    // sha256 of the zip, verified on the phone
  min_native: string;  // oldest APK version this bundle runs on
  notes?: string;
  disabled?: boolean;  // kill switch: stop rolling this out
}

export const OTA_MANIFEST: OtaManifest | null = {
  "build": "202609161143",
  "url": "/ota/web-202609161143.zip",
  "checksum": "b299bd87be10c332453746972b3f3f527614610455b3d741ab3769edfa6f1ac5",
  "min_native": "1.17",
  "notes": "Naya: Faisla — ab kya karun (baat karke faisla, ready message ke saath). Kundli screen naya look, aur har reading ki accuracy jaanchi gayi."
};
