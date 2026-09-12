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
  "build": "202609121128",
  "url": "/ota/web-202609121128.zip",
  "checksum": "ba4016a1cfad2ee68523b7f2b01061c2f7ae1ff0f8d3b01e07c81de75ee912e7",
  "min_native": "1.17",
  "notes": "Hindi sign-in fields and sign-up tab"
};
