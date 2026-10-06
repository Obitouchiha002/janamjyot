# JanamJyot

A Vedic astrology app for Android and the web. Charts are computed by the app's
own calculation engine — lagna, rashi, nakshatra, divisional charts and the
running dasha — and a language model is used only to put those already-computed
results into plain words.

**Live:** [janamjyot.lzworth.in](https://janamjyot.lzworth.in)

## What it does

- **Free Janam Kundli** — lagna, moon sign, nakshatra and dasha from date, time
  and place of birth
- **Dasha periods** — which period is running, how long it lasts, what follows
- **Kundli matching** — Ashtakoot guna milan, all 36 points
- **Life Timeline** — 30 days to 5 years ahead
- **Ask by voice** — speak the question instead of typing it
- **PDF reports** — generated on the device, shareable
- **App lock** — fingerprint / biometric
- **Hindi, Hinglish and English**

## How it is built

React + TypeScript, wrapped for Android with **Capacitor**, with an Express API
deployed as a single Vercel serverless function.

```
React + Vite + Tailwind  (web + Capacitor Android shell)
        │  calls only our own /api/* routes
        ▼
Express API (bundled, deployed as one Vercel function)
        ├─► calculation engine   — the chart, computed
        ├─► LLM                  — interpretation only, over computed data
        └─► Postgres             — saved profiles and reports
```

The rule the app is built around: **the engine decides the facts, the model only
phrases them.** The language model never receives raw inputs to reason about
astrologically — it receives already-computed chart data and writes about that.
That is what keeps a reading from contradicting the chart it is supposedly based
on.

Native capabilities come through Capacitor: speech recognition for voice input,
local notifications for daily readings, biometric auth for the app lock,
filesystem for PDF export.

## Licence

Proprietary — All Rights Reserved. The source is published for portfolio and
demonstration purposes only. See [LICENSE](LICENSE).

---

Built by **Vansh Kashyap** — [vanshkashyap.lzworth.in](https://vanshkashyap.lzworth.in)
