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
  "build": "202609160746",
  "url": "/ota/web-202609160746.zip",
  "checksum": "e9eb0fba42e43a9efb2884e3d63e9c9f817ed0ac18d17ad59c13403d4f80be43",
  "min_native": "1.17",
  "notes": "Life report ab 7 hisson mein — travel aur business bhi, aur har daur ki asli tareekhon ke saath."
};
