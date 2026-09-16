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
  "build": "202609161223",
  "url": "/ota/web-202609161223.zip",
  "checksum": "5ac421a99922e3c8e40fb2039092174fe9292b9496fd79de9c278808f5643664",
  "min_native": "1.17",
  "notes": "Faisla — ab kya karun (baat karke faisla + ready message), kundli screen naya look, aur admin se kisi bhi platform ki AI key."
};
