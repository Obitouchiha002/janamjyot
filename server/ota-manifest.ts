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
  "build": "202609280512",
  "url": "/ota/web-202609280512.zip",
  "checksum": "3f842c71887cb7f428e82974dc230e3f8018c3da4f9176d64e33dbb3740dd3a7",
  "min_native": "1.17",
  "notes": "Reminder ab sahi time par aate hain. Report upar aapki kundli ki khaas baatein dikhati hai."
};
