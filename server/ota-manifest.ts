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
  "build": "202609160841",
  "url": "/ota/web-202609160841.zip",
  "checksum": "a2a27c836a4cf249130d1f2ac61fec41775cd1d1d5b6b8dcf3ebce7bec1692ca",
  "min_native": "1.17",
  "notes": "Life report ab 7 hisson mein (travel, business bhi) asli tareekhon ke saath, aur matching mein naya Marriage Outlook."
};
