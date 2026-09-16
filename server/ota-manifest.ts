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
  "build": "202609160504",
  "url": "/ota/web-202609160504.zip",
  "checksum": "71e70d6229f10eb2fd0a90c04f6c207b8499911616038ba2774ebe870738275f",
  "min_native": "1.17",
  "notes": "Pehli screen wali tour hata di — app seedha khulta hai. Chat tez aur zyada sahi jawab."
};
