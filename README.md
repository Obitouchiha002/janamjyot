# Vedic Astra

A Vedic astrology web app. Real chart data is calculated by the **Prokerala
Astrology API**, normalized and stored by our backend, and interpreted by
**Gemini** (chat + life reports). The app never fabricates chart data.

## Architecture

```
Frontend (React + Vite + Tailwind + shadcn, PWA)
        │  fetch only our own /api/* routes
        ▼
Express backend (server.ts)            ← secrets live here ONLY
  ├─ server/prokerala.ts   OAuth2 token cache + Prokerala v2 calls
  ├─ server/normalize.ts   raw Prokerala → internal normalized JSON (+ D9/nakshatra)
  ├─ server/gemini.ts      system prompt, category packet builder, report/chat
  ├─ server/validate.ts    input validation + ISO datetime/offset helper
  └─ server/db.ts          Postgres/Supabase persistence (schema.sql)
        │
        ├─► Prokerala API   (chart calculation — the "calculation brain")
        ├─► Gemini API      (interpretation only — reads saved normalized data)
        └─► Postgres/Supabase
```

**Security:** `PROKERALA_CLIENT_ID`, `PROKERALA_CLIENT_SECRET`, `GEMINI_API_KEY`,
and `DATABASE_URL` are read from the environment by the backend only. They are
never bundled into the frontend, and the browser never calls Prokerala/Gemini
directly — it only calls our `/api/*` routes.

## Data flow

1. User submits birth details (incl. latitude, longitude, IANA timezone).
2. `POST /api/create-chart` validates input, gets a cached Prokerala token,
   and calls `planet-position`, `birth-details`, `dasha-periods`.
3. The backend normalizes the responses into our provider-agnostic format
   (D1 houses, D9 navamsa computed from real longitudes, dasha timeline,
   per-planet nakshatra) and saves it.
4. Frontend renders from the **normalized** data only.
5. Gemini receives only a relevant slice of the normalized data — never the raw
   Prokerala response — for reports and chat.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/create-chart` | Calculate + normalize + save; returns `chartId` |
| GET | `/api/chart/:chartId` | Full normalized chart |
| GET | `/api/chart/:chartId/d1` | D1 chart (houses) |
| GET | `/api/chart/:chartId/d9` | D9 navamsa (houses) |
| GET | `/api/chart/:chartId/dasha` | Dasha timeline |
| POST | `/api/generate-report` | AI life report (Health/Wealth/Career/Marriage/Relationships) |
| POST | `/api/chat` | Category-aware chart Q&A |
| GET | `/api/chat-history/:chartId` | Previous chat messages |
| GET | `/api/profiles` · DELETE `/api/profiles/:chartId` | List / delete charts |

## Run locally

**Prerequisites:** Node.js, a Postgres database (e.g. Supabase), Prokerala API
credentials, and a Gemini API key.

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `PROKERALA_CLIENT_ID`, `PROKERALA_CLIENT_SECRET`
   - `GEMINI_API_KEY`
   - `DATABASE_URL` (Supabase: Settings → Database → Connection string),
     and `DATABASE_SSL=true` for managed Postgres
   - optional: `PROKERALA_AYANAMSA` (1 = Lahiri, default)
3. Run the app: `npm run dev` (the schema is created automatically on boot;
   the equivalent SQL is in [server/schema.sql](server/schema.sql)).

Set `LOG_CHART_DEBUG=true` to log raw vs. normalized chart data when verifying
against a known birth chart.

## Secrets & configuration

All credentials live in environment variables — there are no secrets in the
source. Copy `.env.example` to `.env.local` and fill in real values.

**Server-only** (never sent to the browser or bundled into the APK):
`AUTH_SECRET`, `DATABASE_URL`, `SMTP_USER` / `SMTP_PASS`, `GEMINI_API_KEY`
(and the other AI provider keys), `PROKERALA_CLIENT_ID` / `PROKERALA_CLIENT_SECRET`,
`ELEVENLABS_API_KEY`, `GOOGLE_CLIENT_IDS`.

**Client-exposed** — anything prefixed `VITE_` is compiled into the shipped
JavaScript and is readable by anyone. Only public-safe values belong here:
`VITE_API_BASE` (a URL), `VITE_GOOGLE_CLIENT_ID` (an OAuth *web* client id, public
by design), `VITE_APP_DOWNLOAD_URL` (a URL). **Never** put an API key, database
URL, or signing secret behind a `VITE_` prefix.

Notes:
- `AUTH_SECRET` **must** be set in production. Without it the server derives a
  per-machine fallback, so sessions break across serverless instances.
- `.env*` is git-ignored (except `.env.example`).
- The database is reached only from the server with a full connection string —
  no database credentials or client SDK keys ship to the app.

### If you ever hardcode a secret

Anything committed to git stays in the history even after you delete it.
If a key was ever hardcoded or pasted into a commit, **rotate it immediately**
(issue a new key at the provider and revoke the old one) — removing the line is
not enough. The same applies to any secret shared in a screenshot or chat.
