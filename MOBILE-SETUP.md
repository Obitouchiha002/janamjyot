# VedicAstra — Mobile app setup & deployment

The Android app is built. To make it run on **any phone with real data**, the
backend (already Supabase-backed) needs to be deployed with a few env vars, and
you install the APK. No Firebase needed — the database *is* Supabase and auth is
already real (encrypted passwords + JWT, stored in Supabase).

---

## 1. Backend — deploy to the real server (Vercel)

The backend already lives at `vedicastra.vercel.app`. Redeploy it with the new
code:

```bash
cd "vedic-astra-mobile"
git add -A && git commit -m "accounts, quotas, admin panel, Google login"
git push          # if the repo is linked to Vercel, this auto-deploys
# or:  npx vercel --prod
```

### Env vars to set in Vercel (Project → Settings → Environment Variables)

| Variable            | Value                                             | Needed for |
|---------------------|---------------------------------------------------|------------|
| `DATABASE_URL`      | *(already set)* your Supabase connection string   | Real DB    |
| `AUTH_SECRET`       | the long value in `.env.local` (copy it verbatim) | Login + encrypting stored API keys — **must never change** |
| `ADMIN_EMAIL`       | `vk1234888i@gmail.com`                             | Which account becomes admin |
| `GEMINI_API_KEY` …  | *(already set)* your AI keys                       | AI features |
| `GOOGLE_CLIENT_IDS` | *(optional)* your Google Web client ID            | Google Sign-In |

> The first time the deployed server boots it auto-creates every new table in
> Supabase and migrates the old `owner_id` column. Your existing 55 charts are
> preserved.

After deploying, sign up **once** with `vk1234888i@gmail.com` — that account is
the admin (unlimited access, admin panel under **More → Admin Panel**).

---

## 2. The Android app

The production APK is already built and points at `https://vedicastra.vercel.app`:

```
android/app/build/outputs/apk/debug/app-debug.apk   (~4.9 MB)
```

- **Install on any phone:** copy this file to the phone and open it (enable
  “Install unknown apps” once). It works on any Android 6+ device.
- Rebuild anytime:
  ```bash
  export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
  npx vite build && npx cap sync android
  cd android && ./gradlew assembleDebug
  ```

### For the Play Store (later)

The debug APK installs directly but isn’t Play-Store-signed. When you’re ready:
`cd android && ./gradlew bundleRelease` with a signing key configured — I can
set that up when you want to publish.

---

## 3. Google Sign-In (optional, when you have the Client ID)

1. Google Cloud Console → **Create OAuth client → Web application**. Copy the
   **Web client ID**.
2. Put it in **two** places:
   - `.env.local` → `VITE_GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_IDS=` (same value)
   - Vercel env → `GOOGLE_CLIENT_IDS`
3. For native Google sign-in on Android, register the app’s **SHA-1** on that
   OAuth client, and install a Capacitor-8-compatible Google Auth plugin.
   Until then the button shows “coming soon” and email/password works fully.

---

## What’s already done

- **Supabase** database with: accounts, plans (free/pro/unlimited), per-user
  limits, block/ban with reason, usage metering, audit log, encrypted API keys.
- **Quotas** enforced (free = 3 kundlis, 2 reports/mo, 15 questions/day,
  3 matches/day). Admin = unlimited. Tested end-to-end.
- **Admin panel** in-app (admin-only): analytics, user search + management,
  plan/limit control, block/ban, and **add API keys without redeploying**.
- **Launch auth gate** — the app opens on Sign in / Sign up.
- Native app: bottom tabs, haptics, splash, icon, PDF-to-Downloads, share,
  low-end-device performance tuning. Full English UI, website palette.
- Privacy fix: each user only sees their own kundlis.
