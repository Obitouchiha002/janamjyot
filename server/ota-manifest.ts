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
  "build": "202609121022",
  "url": "/ota/web-202609121022.zip",
  "checksum": "c19f7170f5eb49b01f591e6f520d58b070d28d6729d73795e7e7bbc3aa4fbe3f",
  "min_native": "1.17",
  "notes": "Deep kundli matching, your past period by period, Hindi across more screens"
};
