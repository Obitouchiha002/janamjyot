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
  "build": "202609251307",
  "url": "/ota/web-202609251307.zip",
  "checksum": "a0463a81bc2af1ae6bb34f22f9198ce8c14c3ecfbe9d3d608ae4de9e682c77fb",
  "min_native": "1.17",
  "notes": "Report ab aapki kundli ki khaas baatein upar dikhata hai. Chat khud ko dohrati nahi."
};
