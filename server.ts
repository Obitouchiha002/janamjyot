import "./server/env"; // must be first: loads .env.local before anything reads process.env
import { distressLevel, severeReply, lowNote } from "./server/distress";
import { isGreetingOnly, greetingReply } from "./server/greeting";
import { whatToAsk, clarifyReply } from "./server/clarify";
import { aiCostStats } from "./server/ai-log";
import express from "express";

/** Turn raw provider errors into a clean, user-facing message. */
function friendlyError(message: string | undefined): string {
  const m = message ?? "Something went wrong.";
  if (/429|quota|rate.?limit/i.test(m)) {
    return "AI is busy right now (quota/rate limit reached). Please wait a minute and try again.";
  }
  if (/503|overload|unavailable|high demand/i.test(m)) {
    return "The AI model is temporarily overloaded. Please try again in a few seconds.";
  }
  return m;
}
import path from "path";
import cors from "cors";
// NOTE: `vite` is imported dynamically inside startServer() (dev only) so it is
// NOT bundled into the Vercel serverless function (keeps the function small).

import {
  initDb,
  ensureSettings,
  insertBirthProfile,
  insertChartCalculation,
  getNormalizedChart,
  listProfiles,
  deleteChart,
  saveMatch,
  listMatches,
  getMatch,
  deleteMatch,
  updateChart,
  recordDownload,
  downloadStats,
  creditBalance,
  creditHistory,
  spendCredits,
  grantCredits,
  CREDIT_PACKS,
  CREDIT_PRICES,
  trialState,
  startTrial,
  accountsOnDevice,
  noteDeviceSignup,
  deviceUsedTrial,
  noteDeviceTrial,
  deviceUsedReferral,
  noteDeviceReferral,
  deviceOfUser,
  TRIAL,
  deliveryCountSince,
  createProviderOrder,
  settleOrder,
  markNeedsRefund,
  adminAdjustCredits,
  funnelStats,
  moneyStats,
  referralCode,
  attachReferral,
  settleReferral,
  referralStats,
  REFERRAL,
  pendingOrders,
  findReusableOrder,
  createMockOrder,
  settleMockOrder,
  paymentHistory,
  allPayments,
  paymentTotals,
  insertReport,
  getReport,
  insertChatMessage,
  getChatHistory,
  clearChatHistory,
  getChatMemory,
  saveChatMemory,
  getChartFacts,
  mergeChartFacts,
  clearChatMemory,
  createUser,
  getUserByEmail,
  getUserById,
  claimDeviceCharts,
  setUserPassword,
  setPasswordReset,
  getUserByResetToken,
  saveLoginCode,
  getLoginCode,
  bumpLoginCodeAttempts,
  clearLoginCode,
  listUsers,
  exportUsers,
  adminStats,
  getSetting,
  setSetting,
  setUserRole,
  setUserSuspended,
  deleteUserAndData,
  recentUsers,
  recentCharts,
  chartsByOwner,
  // accounts, quotas, ops
  getUserByGoogleSub,
  linkGoogleSub,
  touchUser,
  setUserPlan,
  setUserLimits,
  setUserStatus,
  quotasFor,
  usageCount,
  usageSeries,
  recordUsage,
  audit,
  listAudit,
  addApiKey,
  listApiKeys,
  getApiKeys,
  setApiKeyEnabled,
  deleteApiKey,
  PLANS,
  QUOTA_WINDOW,
  windowFor,
  insertFeedback,
  getTestimonials,
  getAllFeedback,
  setFeedbackApproved,
  deleteFeedback,
  type QuotaAction,
  type PlanId,
  type AccountStatus,
  removeChartFacts,
} from "./server/db";
import { followupFor } from "./server/followup";
import { OTA_MANIFEST } from "./server/ota-manifest";
import {
  hashPassword, verifyPassword, signToken, verifyToken, requireAuth, optionalAuth, requireAdmin, ADMIN_EMAIL,
  normalizeEmail,
} from "./server/auth";
import { validateBirthInput, buildIsoDatetime } from "./server/validate";
import {
  publicAstrologers, isAstrologerId, astrologerPrompt, ASTROLOGERS,
} from "./server/astrologers";
import {
  fetchPlanetPosition,
  fetchDashaPeriods,
  type ProkeralaQuery,
} from "./server/prokerala";
import { normalizeChart } from "./server/normalize";
import { computeChart } from "./server/engine";
import { buildTransit, compactTransitForAI } from "./server/transit";
import {
  detectCategory,
  answerQuestion,
  answerUniversal,
  APP_GUIDE,
  answerAsAstrologer,
  astrologerIntro,
  generateLifeReport,
  generatePastTimeline,
  tidyReport,
  generateMatchSummary,
  generateMatchVerdict,
  answerMatchQuestion,
  answerMatchYear,
  matchQuestionChips,
  generateMatchReport,
  updateChatNotes,
  generateFriendAdvice,
  generateDailyHoroscope,
  generateDailyTip,
  generateDailyGuidance,
  generateFocusedReport,
  REPORT_TYPES,
  generateLifeTimeline,
  TIMELINE_RANGES,
  generateRemediesNote,
  buildFullChartContext,
  isSupportedLanguage,
  normalizeLanguage,
} from "./server/gemini";
import { personMoon, matchKundli, nadiOf } from "./server/matching";
import {
  deepPerson, timingAlignment, doshaDetails, remediesFor, periodsInYear,
} from "./server/deep-match";
import { pastMilestones, recentPastPeriods } from "./server/past-timeline";
import { computeRemedies } from "./server/remedies";
import { buildPanchang } from "./server/panchang";
import { buildRightNow, ACTIVITIES } from "./server/right-now";
import { buildDaySignals, buildUpcomingDaySignals, buildDayPlan, buildUpcomingDayPlans } from "./server/day-signals";
import { hinduDay } from "./server/hindu-calendar";
import { buildMuhurat, scanMonth } from "./server/muhurat";
import { detectYogas } from "./server/yogas";
import { computeAshtakavarga } from "./server/ashtakavarga";
import { computeTransits } from "./server/engine";
import { getAiStatus, setKeyOverrides } from "./server/llm";
import { isMailConfigured, sendContactEmail, sendPasswordResetEmail, sendLoginCodeEmail } from "./server/mailer";
import crypto from "node:crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { runStartupChecks } from "./server/startup-checks";

// Runs at module load so BOTH the local server and the Vercel serverless
// bundle refuse to come up with a broken configuration.
runStartupChecks();

/**
 * Express 4 does not catch rejections from async route handlers, and Node
 * terminates the process on an unhandled rejection. A single transient DB blip
 * inside one un-try/caught handler would therefore take the whole server down
 * and 502 every user. Log it and stay up — the request that caused it will
 * still time out, but nobody else is affected.
 */
process.on("unhandledRejection", (reason) => {
  console.error("[fatal-guard] unhandled rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal-guard] uncaught exception:", err);
});

const app = express();

/**
 * Send a SAFE error to the client.
 *
 * The internal message (which can carry SQL text, file paths, provider URLs or
 * stack details) is logged server-side against a short correlation id; the
 * client only ever gets a human message plus that id, so a user can quote
 * "ref: a1b2c3d4" in a support mail and we can find the real cause in the logs.
 */
function fail(
  res: express.Response,
  status: number,
  publicMessage: string,
  err?: unknown,
  tag = "error",
) {
  const ref = crypto.randomBytes(4).toString("hex");
  const detail = err instanceof Error ? (err.stack || err.message) : String(err ?? "");
  console.error(`[${tag}] ref=${ref}`, detail);
  return res.status(status).json({ error: publicMessage, ref });
}
const PORT = Number(process.env.PORT) || 3000;
const AYANAMSA = Number(process.env.PROKERALA_AYANAMSA) || 1;

/*
 * "Today", in the timezone the caller actually lives in.
 *
 * `new Date().toISOString().slice(0,10)` is UTC. The server runs in UTC on
 * Vercel, so between midnight and 05:30 IST every Indian user asking for
 * today's panchang or muhurat was handed YESTERDAY's — the one window where
 * people check tomorrow's muhurat before going to bed. Most of this file
 * already does it correctly; this makes the remaining few say so by name.
 */
function todayIn(tz = "Asia/Kolkata"): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  }
}

// "local" (default, no API) or "prokerala" (uses the Prokerala API).
const CHART_ENGINE = (process.env.CHART_ENGINE || "local").trim().toLowerCase();

const IS_PROD = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

// Vercel (and most hosts) put a proxy in front of us; without this every
// request looks like it comes from the proxy and per-IP rate limiting is
// meaningless. `1` = trust exactly one hop, not an attacker-supplied chain.
app.set("trust proxy", 1);

/**
 * Every origin this backend may legitimately be reached at — the canonical one
 * plus any alternates the app is built to fall back to. Used by BOTH the CSP
 * and the CORS allowlist so the two can never disagree (a mismatch there is
 * invisible in testing and fatal in production).
 */
const API_ORIGINS: string[] = Array.from(new Set(
  [
    process.env.PUBLIC_APP_URL,
    "https://janamjyot.vercel.app",
    ...(process.env.API_FALLBACK_ORIGINS || "").split(",").map((s) => s.trim()),
  ].filter(Boolean) as string[],
));

// ── Security headers ───────────────────────────────────────────────────────
// NOTE on `'unsafe-inline'` for scripts: the landing page (public/download.html)
// and the boot loader in index.html both rely on inline <script>/<style>, so a
// nonce-less strict policy would break the site today. Everything else is
// locked down; removing those inline blocks later would let us drop it.
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // The landing page pulls its Cormorant / Manrope faces from Google Fonts;
      // without these two entries the site silently drops to system fonts.
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      // The Android app is served from localhost and calls this API directly.
      // Every host the app may fall back to has to be listed: CSP is evaluated
      // BEFORE the request leaves, so an unlisted alternate is blocked by the
      // browser and the failover silently cannot work. Driven by env so moving
      // hosts never needs a code change.
      connectSrc: ["'self'", ...API_ORIGINS],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],       // same intent as X-Frame-Options: DENY
      upgradeInsecureRequests: [],
    },
  } : false, // dev: Vite needs eval + its HMR websocket
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  frameguard: { action: "deny" },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  // The APK's webview loads media/assets from its own origin; keeping these
  // cross-origin isolation headers on would block them.
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ── CORS ───────────────────────────────────────────────────────────────────
// Not a public API — only our own website and our own app may call it.
// The Capacitor webview reports origins like `capacitor://localhost` /
// `https://localhost`, so those must be allowed or the APK breaks entirely.
const ALLOWED_ORIGINS = new Set(
  [
    ...API_ORIGINS,
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4001",
    "http://localhost:7890",   // local preview of a built dist against live API
    ...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()),
  ].filter(Boolean) as string[],
);

app.use(cors({
  origin(origin, cb) {
    // No Origin header at all = a native/server-side request (the Android app
    // and curl both do this). There is no browser to protect there, so allow.
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.has(origin)) return cb(null, true);
    // Any preview deployment of this same Vercel project.
    if (/^https:\/\/janamjyot-[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true);
    return cb(null, false); // reject without throwing a 500
  },
  credentials: false, // we use Bearer tokens, never cookies
}));

// Cap the body so a huge POST can't hog memory. `verify` keeps the RAW bytes
// on the request: a provider webhook signature is computed over the exact body
// that was sent, so re-serialising the parsed JSON would not match.
app.use(express.json({
  limit: "1mb",
  verify: (req: any, _res, buf) => { req.rawBody = buf; },
}));

// ── Rate limiting on the auth surface ──────────────────────────────────────
// In-memory store: on serverless each instance keeps its own counters, so this
// is a speed bump against credential stuffing rather than a hard guarantee.
const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,                       // 5 sign-in attempts per minute per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a minute and try again." },
});
const slowLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 3,                       // 3 reset / code requests per hour per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

const previewLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 12,                      // 12 free preview charts per hour per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "You have made a few charts already. Please download the app to keep going." },
});

app.use("/api/chart-preview", previewLimiter);
app.use("/api/billing/verify", rateLimit({
  windowMs: 60_000, limit: 6, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Please wait a moment before checking again." },
}));
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/google", authLimiter);
app.use("/api/auth/otp/verify", authLimiter);
app.use("/api/auth/forgot-password", slowLimiter);
app.use("/api/auth/reset-password", slowLimiter);
app.use("/api/auth/otp/request", slowLimiter);

/**
 * Everything under /api needs an account, except this allowlist.
 *
 * Enforced HERE rather than in the app, because a client-side gate is
 * decoration: the API is reachable with curl, so if the routes stay open the
 * "sign in first" screen protects nothing. Anything not listed below returns
 * 401 without a valid token, and the app turns that into a sign-in prompt.
 *
 * What stays public, and why:
 *   • /auth/*      — you cannot sign in through a sign-in wall.
 *   • /config      — the app reads maintenance/announcement/version before login.
 *   • /places      — the signup and chart forms need city lookup.
 *   • /panchang, /muhurat, /muhurat-month, /right-now, /horoscope, /astrologers,
 *     /testimonials, /download — not personal to anyone; they take a date or a
 *     place, never a chart, and the public website itself calls them.
 * Admin routes are omitted deliberately: they carry their own requireAdmin.
 */
const PUBLIC_API = [
  /^\/auth\//,
  /^\/config$/,
  /^\/places$/,
  /^\/panchang$/,
  /^\/panchang-today$/,
  /^\/billing\/packs$/,
  // The website's teaser: it computes from what the visitor just typed,
  // stores nothing and returns no chart id. See the route for why.
  /^\/chart-preview$/,
  // Razorpay calls this server-to-server with no session. It is not "open":
  // the HMAC signature check inside the route is its authentication.
  /^\/billing\/webhook$/,
  /^\/muhurat$/,
  /^\/muhurat-month$/,
  /^\/right-now$/,
  /^\/horoscope$/,
  /^\/astrologers$/,
  /^\/testimonials$/,
  /^\/downloads?$/,   // POST /download (record) and GET /downloads (public count)
  /^\/health$/,
];

/*
 * Keep this instance's view of the admin settings current.
 *
 * Cheap: a no-op while the copy is fresh, a single small SELECT at most twice a
 * minute, and only the very first request on a cold instance waits for it.
 * Without it a warm serverless instance serves whatever the settings were when
 * it started, for as long as it lives.
 */
app.use("/api", (_req, _res, next) => { ensureSettings().then(() => next(), () => next()); });

app.use("/api", (req, res, next) => {
  const isPublic = PUBLIC_API.some((re) => re.test(req.path));
  if (req.path.startsWith("/auth/")) return next();

  optionalAuth(req, res, () => {
    const m = getSetting("maintenance");
    if (m?.enabled && (req as any).user?.role !== "admin") {
      return res.status(503).json({ error: m.message || "The app is under maintenance. Please check back soon.", maintenance: true });
    }
    if (!isPublic && !(req as any).user) {
      // `auth_required` is the flag the app keys off to show the sign-in screen
      // instead of a generic error toast.
      return res.status(401).json({
        error: "Please sign in to use this.",
        auth_required: true,
      });
    }
    next();
  });
});

// ── Ownership guard for every /:chartId route (a user can only open their charts).
app.param("chartId", async (req: any, res, next, id) => {
  try {
    const chart = await getNormalizedChart(id);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    if (!canAccessChart(req, chart)) {
      return res.status(403).json({ error: "This chart is not available on this account/device." });
    }
    next();
  } catch (e: any) { next(e); }
});

// ── Auth routes ────────────────────────────────────────────────────────────

/**
 * After any successful sign-in, adopt the charts this device made as a guest.
 * Without it, a reinstall (which regenerates the device id) hides them forever.
 */
async function adoptGuestCharts(req: any, userId: string) {
  try {
    const dev = identityOf(req).deviceId;
    const n = await claimDeviceCharts(userId, dev);
    if (n) console.log(`[auth] adopted ${n} guest chart(s) into account`);
  } catch (e: any) {
    console.warn("[auth] chart adoption skipped:", e?.message);
  }
}

/**
 * How many accounts one install may create.
 *
 * A phone is shared — a couple, a parent and child, someone matching kundlis
 * for the family — so this is not one. It is low enough that "make another
 * account for another free trial" stops being worth the trouble, and the
 * refusal points at signing in rather than at a wall.
 *
 * Deliberately soft: a reinstall issues a new device id and starts the count
 * again. That is the right trade. A hard lock on a device id eventually locks
 * out a real person who changed phones, and no amount of saved trial money is
 * worth that support ticket.
 */
const MAX_ACCOUNTS_PER_DEVICE = 2;

/** True when this install may NOT create another account (response sent). */
async function deviceAtAccountLimit(req: any, res: any): Promise<boolean> {
  const dev = identityOf(req).deviceId;
  if (!dev) return false; // no device id (web, or an old build) — nothing to count
  const n = await accountsOnDevice(dev).catch(() => 0);
  if (n < MAX_ACCOUNTS_PER_DEVICE) return false;
  res.status(429).json({
    error:
      `This phone already has ${MAX_ACCOUNTS_PER_DEVICE} accounts. ` +
      `Please sign in to one of them instead.`,
    device_limit: true,
  });
  return true;
}

app.post("/api/auth/signup", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    return res.status(400).json({ error: "Enter your name, a valid email, and a 6+ character password." });
  }
  if (await getUserByEmail(email)) return res.status(409).json({ error: "This email is already registered — please sign in." });
  if (await deviceAtAccountLimit(req, res)) return;
  // Password signup proves NOTHING about owning the address — there is no
  // verification step. Granting admin here meant that on a fresh database
  // anyone who typed the (publicly visible) admin address became admin
  // instantly. Admin is only granted via a path that proves inbox ownership:
  // the emailed sign-in code, or Google Sign-In.
  const user = await createUser({ name, email, passwordHash: hashPassword(password), role: "user", deviceId: identityOf(req).deviceId });
  await noteDeviceSignup(identityOf(req).deviceId ?? "").catch(() => {});
  await adoptGuestCharts(req, user.id);
  // A password signup proves nothing about the address, so the invitee's own
  // bonus lands now and the referrer's waits for settleReferral.
  await useReferral(req, user.id);
  res.json({ token: signToken({ sub: user.id }), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password ?? "");
  const user = await getUserByEmail(email);
  if (!user) return res.status(401).json({ error: "Wrong email or password." });
  // An account created through Google has no password — tell them where to sign in.
  if (!user.password_hash) {
    return res.status(401).json({ error: "This account uses Google Sign-In. Continue with Google instead." });
  }
  if (!verifyPassword(password, user.password_hash)) return res.status(401).json({ error: "Wrong email or password." });
  if (user.status && user.status !== "active") {
    return res.status(403).json({ error: user.status_reason || "This account has been suspended." });
  }
  touchUser(user.id).catch(() => {});
  await adoptGuestCharts(req, user.id);
  res.json({ token: signToken({ sub: user.id }), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.get("/api/auth/me", requireAuth, (req: any, res) => res.json({ user: req.user }));

/**
 * DELETE /api/account — the user erases their OWN account and everything tied
 * to it: birth profiles, charts, reports, chat history, usage records and any
 * feedback they left. Irreversible by design, so the client confirms first.
 */
app.delete("/api/account", requireAuth, async (req: any, res) => {
  try {
    await deleteUserAndData(req.user.id);
    // Audit the event but deliberately WITHOUT the e-mail — recording it here
    // would keep the very identifier the user just asked us to erase. The
    // now-dangling user id is enough for an integrity trail.
    audit({ actorId: req.user.id, action: "account.self_delete" }).catch(() => {});
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[account/delete] ", err?.message);
    res.status(500).json({ error: "Could not delete the account. Please try again." });
  }
});

/* ── Passwordless sign-in: e-mail a 6-digit code ──────────────────────────
   Replaces Google Sign-In as the one-tap option. It's free (reuses the SMTP
   already configured), needs no SHA-1 / Play Services, and works on every
   device — unlike SMS OTP, which costs money per message.                    */

const OTP_TTL_MIN = 10;
const OTP_MAX_ATTEMPTS = 5;

app.post("/api/auth/otp/request", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!isMailConfigured()) {
    return res.status(503).json({ error: "Email sign-in isn't configured on the server yet." });
  }
  // Same throttle as password reset: 3 codes per address per 15 minutes.
  if (resetThrottled(`otp:${email}`)) {
    return res.json({ ok: true, message: "Code sent. Please check your email." });
  }
  try {
    const code = String(crypto.randomInt(100000, 1000000)); // always 6 digits
    const expires = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    await saveLoginCode(email, hashToken(code), expires);
    await sendLoginCodeEmail({ to: email, code, minutes: OTP_TTL_MIN });
    res.json({ ok: true, message: "Code sent. Please check your email." });
  } catch (err: any) {
    console.error("[auth/otp/request] ", err?.message);
    res.status(500).json({ error: "Could not send the code. Please try again." });
  }
});

app.post("/api/auth/otp/verify", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const code = String(req.body?.code ?? "").trim();
  const name = String(req.body?.name ?? "").trim();
  if (!email || !code) return res.status(400).json({ error: "Email and code are required." });

  try {
    const row = await getLoginCode(email);
    if (!row) return res.status(400).json({ error: "That code has expired. Please request a new one." });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await clearLoginCode(email);
      return res.status(400).json({ error: "That code has expired. Please request a new one." });
    }
    if ((row.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      await clearLoginCode(email);
      return res.status(429).json({ error: "Too many wrong tries. Please request a new code." });
    }
    if (hashToken(code) !== row.code_hash) {
      const attempts = await bumpLoginCodeAttempts(email);
      const left = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
      return res.status(401).json({ error: left ? `Wrong code — ${left} tries left.` : "Too many wrong tries. Request a new code." });
    }

    await clearLoginCode(email);

    // Verified — sign in, creating a passwordless account on first use.
    let user = await getUserByEmail(email);
    if (!user) {
      if (await deviceAtAccountLimit(req, res)) return;
      user = await createUser({
        name: name || email.split("@")[0],
        email,
        passwordHash: null,
        role: email === ADMIN_EMAIL ? "admin" : "user",
        deviceId: identityOf(req).deviceId,
      });
      await noteDeviceSignup(identityOf(req).deviceId ?? "").catch(() => {});
      await useReferral(req, user.id);
    }
    if (user.status && user.status !== "active") {
      return res.status(403).json({ error: (user as any).status_reason || "This account has been suspended." });
    }
    user = await grantAdminIfOwner(user);
    touchUser(user.id).catch(() => {});
    await adoptGuestCharts(req, user.id);
    res.json({
      token: signToken({ sub: user.id }),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err: any) {
    console.error("[auth/otp/verify] ", err?.message);
    res.status(500).json({ error: "Could not verify the code. Please try again." });
  }
});

/**
 * Admin follows the address, on every inbox-proving sign-in — not just the one
 * that happened to create the account.
 *
 * It used to be set only inside the `if (!user)` branch. Password signup
 * deliberately never grants admin (typing a publicly known address proves
 * nothing), so if the admin address had ever been registered with a password
 * first, signing in afterwards by emailed code or Google left it an ordinary
 * user — and there was then no path to admin at all.
 *
 * Safe to run here because both callers have already proved the person holds
 * that inbox: an emailed six-digit code, or a Google ID token Google verified.
 */
async function grantAdminIfOwner(user: any): Promise<any> {
  if (user.role === "admin") return user;
  if (normalizeEmail(user.email) !== ADMIN_EMAIL) return user;
  await setUserRole(user.id, "admin");
  console.log("[auth] admin granted to the configured admin address");
  return { ...user, role: "admin" };
}

/** Apply a referral code supplied at signup, if any. Never fatal. */
async function useReferral(req: any, newUserId: string): Promise<void> {
  const code = String(req.body?.referral_code ?? req.body?.ref ?? "").trim();
  if (!code) return;
  try {
    /*
     * One joining bonus per phone, not per account.
     *
     * The bonus lands the moment an account is created, and a free account can
     * be deleted — so "sign up with a code, take the credits, delete, repeat"
     * printed credits. The account limit does not stop it, because deleting
     * frees that slot on purpose. This does, and it never resets.
     */
    const dev = identityOf(req).deviceId;
    if (dev && (await deviceUsedReferral(dev).catch(() => false))) {
      console.log("[referral] joining bonus already taken on this device");
      return;
    }
    const out = await attachReferral(newUserId, code);
    if ("error" in out) console.log("[referral] rejected at signup:", out.error);
    else if (dev) await noteDeviceReferral(dev).catch(() => {});
  } catch (e: any) {
    // A bad code must never block someone from creating their account.
    console.warn("[referral] attach failed:", e?.message);
  }
}

/**
 * Carrying a signed-in session from the app into the checkout page.
 *
 * Payment happens on /checkout.html so there is ONE Razorpay flow to get right
 * rather than two. But the app is a WebView with its own storage, and the
 * browser it opens has none — so someone paying from inside the app was asked
 * to sign in again, by emailed code, in the middle of buying. Most people stop
 * there, and they are right to: being asked to log in again at the payment step
 * looks exactly like the thing you are told to be careful about.
 *
 * So the app asks for a handoff token and puts it in the checkout URL.
 *
 * It is deliberately weak on purpose:
 *   • five minutes, because it only has to survive opening a browser;
 *   • purpose-scoped — the exchange below refuses anything that is not a
 *     handoff, so this token cannot be used as a session by itself;
 *   • and it is only ever minted for a caller who is ALREADY signed in.
 * A token in a URL is normally a bad idea; a five-minute one that can do
 * nothing but become a session on the same person's own device is the smaller
 * risk compared with teaching people to re-enter credentials while paying.
 */
app.post("/api/billing/handoff", async (req: any, res) => {
  // 5 minutes, expressed in the days that signToken takes.
  res.json({ token: signToken({ sub: req.user.id, purpose: "handoff" }, 5 / 1440) });
});

/** POST /api/auth/handoff { token } — exchange a handoff for a real session. */
app.post("/api/auth/handoff", async (req: any, res) => {
  const payload = verifyToken(String(req.body?.token ?? ""));
  // A normal session token must NOT be accepted here, and a handoff must not be
  // usable anywhere else — hence the explicit purpose on both sides.
  if (!payload?.sub || payload.purpose !== "handoff") {
    return res.status(401).json({ error: "This link has expired. Please sign in." });
  }
  const user = await getUserById(String(payload.sub));
  if (!user) return res.status(401).json({ error: "Session invalid — sign in again." });
  if (user.status && user.status !== "active") {
    return res.status(403).json({ error: user.status_reason || "This account has been suspended." });
  }
  res.json({
    token: signToken({ sub: user.id }),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

/** GET /api/referral — my code, how it is going, and what each side gets. */
app.get("/api/referral", async (req: any, res) => {
  try {
    const [code, stats] = await Promise.all([referralCode(req.user.id), referralStats(req.user.id)]);
    res.json({
      code,
      link: `${(process.env.PUBLIC_APP_URL || "https://janamjyot.lzworth.in").replace(/\/$/, "")}/?ref=${code}`,
      joined: stats.joined,
      pending: stats.pending,
      capped: stats.joined >= REFERRAL.maxPaid,
      max: REFERRAL.maxPaid,
      earned: stats.earned,
      reward: REFERRAL.referrer,
      invitee_reward: REFERRAL.invitee,
    });
  } catch (err: any) {
    fail(res, 500, "Could not load your referral code.", err, "referral");
  }
});

/** POST /api/referral/apply { code } — for someone who signed up without one. */
app.post("/api/referral/apply", async (req: any, res) => {
  try {
    const out = await attachReferral(req.user.id, String(req.body?.code ?? ""));
    if ("error" in out) return res.status(400).json(out);
    // The caller is signed in but may never have proved their inbox, so the
    // referrer is paid on the same terms as at signup — not merely on a claim.
    await settleReferral(req.user.id).catch(() => 0);
    res.json({ ok: true, credited: REFERRAL.invitee, balance: await creditBalance(req.user.id) });
  } catch (err: any) {
    fail(res, 500, "Could not apply that code.", err, "referral-apply");
  }
});

/* ── Password: forgot → email link → reset, and change-while-signed-in ─────── */

const RESET_TTL_MIN = 15;
const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/**
 * Best-effort throttle so the reset endpoint can't be used to bomb someone's
 * inbox (or burn the SMTP quota): 3 requests per email per 15 minutes.
 */
const resetAttempts = new Map<string, number[]>();
const RESET_WINDOW = 15 * 60 * 1000;
const RESET_MAX = 3;
function resetThrottled(email: string): boolean {
  const now = Date.now();
  const hits = (resetAttempts.get(email) ?? []).filter((t) => now - t < RESET_WINDOW);
  if (hits.length >= RESET_MAX) { resetAttempts.set(email, hits); return true; }
  hits.push(now);
  resetAttempts.set(email, hits);
  if (resetAttempts.size > 5000) resetAttempts.clear();
  return false;
}

/**
 * POST /api/auth/forgot-password { email }
 * Always answers 200 so the endpoint can't be used to discover which emails
 * have accounts. The link carries a random token; only its hash is stored.
 */
app.post("/api/auth/forgot-password", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const ok = { ok: true, message: "If that email has an account, a reset link is on its way." };
  if (!email) return res.status(400).json({ error: "Please enter your email." });
  if (!isMailConfigured()) {
    return res.status(503).json({ error: "Email isn't configured on the server, so reset links can't be sent." });
  }
  // Answer with the same generic message so throttling can't be used to probe
  // which addresses exist either.
  if (resetThrottled(email)) return res.json(ok);
  try {
    const user = await getUserByEmail(email);
    if (!user) return res.json(ok);
    if (!user.password_hash) {
      // Google-only account — a password reset would be meaningless.
      return res.json(ok);
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + RESET_TTL_MIN * 60_000).toISOString();
    await setPasswordReset(user.id, hashToken(token), expires);

    const base = (process.env.PUBLIC_APP_URL || "https://janamjyot.vercel.app").replace(/\/$/, "");
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetUrl: `${base}/reset-password?token=${token}`,
      minutes: RESET_TTL_MIN,
    });
    res.json(ok);
  } catch (err: any) {
    console.error("[auth/forgot] ", err?.message);
    res.status(500).json({ error: "Could not send the reset email. Please try again." });
  }
});

/** POST /api/auth/reset-password { token, password } */
app.post("/api/auth/reset-password", async (req, res) => {
  const token = String(req.body?.token ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!token) return res.status(400).json({ error: "Missing reset token." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  try {
    const user = await getUserByResetToken(hashToken(token));
    if (!user) return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    await setUserPassword(user.id, hashPassword(password));
    res.json({ ok: true, token: signToken({ sub: user.id }), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err: any) {
    console.error("[auth/reset] ", err?.message);
    res.status(500).json({ error: "Could not reset the password. Please try again." });
  }
});

/** POST /api/auth/change-password { currentPassword, newPassword } — signed in. */
app.post("/api/auth/change-password", requireAuth, async (req: any, res) => {
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");
  if (newPassword.length < 6) return res.status(400).json({ error: "New password must be at least 6 characters." });
  try {
    const user = await getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: "Account not found." });
    // A Google-only account has no password yet — allow setting one without a
    // current password, since Google already proved who they are.
    if (user.password_hash && !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: "Your current password is incorrect." });
    }
    await setUserPassword(user.id, hashPassword(newPassword));
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[auth/change-password] ", err?.message);
    res.status(500).json({ error: "Could not change the password." });
  }
});

/**
 * POST /api/auth/google — sign in with a Google ID token.
 *
 * The client (Android or web) does the Google flow and sends us the resulting
 * ID token. We verify it against Google's tokeninfo endpoint rather than trust
 * it: that check is what proves the token was minted by Google, for OUR app,
 * and has not expired. Without it anyone could post a handcrafted JSON body and
 * become any user.
 */
app.post("/api/auth/google", async (req, res) => {
  const idToken = String(req.body?.id_token ?? "").trim();
  if (!idToken) return res.status(400).json({ error: "Missing Google token." });

  const allowedClientIds = (process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowedClientIds.length) {
    return res.status(503).json({ error: "Google Sign-In is not configured on the server yet." });
  }

  let claims: any;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!r.ok) throw new Error(`tokeninfo ${r.status}`);
    claims = await r.json();
  } catch (e) {
    console.error("[auth/google] token verification failed:", (e as Error).message);
    return res.status(401).json({ error: "Could not verify your Google sign-in. Please try again." });
  }

  // The token must be issued by Google, for one of our client IDs, and verified.
  const issOk = ["accounts.google.com", "https://accounts.google.com"].includes(String(claims.iss));
  const audOk = allowedClientIds.includes(String(claims.aud));
  const emailOk = String(claims.email_verified) === "true" && !!claims.email;
  if (!issOk || !audOk || !emailOk) {
    return res.status(401).json({ error: "This Google sign-in could not be accepted." });
  }

  const email = normalizeEmail(claims.email);
  const sub = String(claims.sub);
  const name = String(claims.name || email.split("@")[0]);
  const picture = claims.picture ? String(claims.picture) : null;

  let user = await getUserByGoogleSub(sub);
  if (!user) {
    const byEmail = await getUserByEmail(email);
    if (byEmail) {
      // Same person, first time through Google — link, don't duplicate.
      await linkGoogleSub(byEmail.id, sub, picture);
      user = { ...byEmail, google_sub: sub, avatar_url: picture };
    } else {
      if (await deviceAtAccountLimit(req, res)) return;
      user = await createUser({
        name, email,
        passwordHash: null,
        googleSub: sub,
        avatarUrl: picture,
        deviceId: identityOf(req).deviceId,
        role: email === ADMIN_EMAIL ? "admin" : "user",
      });
      await noteDeviceSignup(identityOf(req).deviceId ?? "").catch(() => {});
      await useReferral(req, user.id);
    }
  }

  if (user.status && user.status !== "active") {
    return res.status(403).json({ error: user.status_reason || "This account has been suspended." });
  }

  user = await grantAdminIfOwner(user);
  touchUser(user.id).catch(() => {});
  await adoptGuestCharts(req, user.id);
  res.json({
    token: signToken({ sub: user.id }),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// ── Admin routes (gate already ensured auth) ────────────────────────────────
app.get("/api/admin/stats", requireAdmin, async (_req, res) => res.json(await adminStats()));
app.get("/api/admin/users", requireAdmin, async (req, res) =>
  res.json(await listUsers(String(req.query.q ?? "")))
);

/**
 * GET /api/admin/funnel?days=30 — where people stop.
 *
 * Totals say how busy the app is; this says whether it works. A launch without
 * it means watching users arrive and never learning which step lost them.
 */
/**
 * GET /api/admin/users.csv — every user, as a spreadsheet.
 *
 * A CSV rather than an API the panel paginates: the question this answers is
 * "let me look at all of it in Excel", and that is not a thing a table on a
 * phone-sized admin screen does well.
 *
 * Two details that decide whether it opens cleanly:
 *  · a UTF-8 BOM, because Excel on Windows otherwise reads Hindi names as
 *    mojibake — and most of these names are Hindi;
 *  · a leading apostrophe is NOT used for long ids. They are quoted instead,
 *    which keeps them intact without polluting the value for anything that
 *    reads the file properly.
 */
function toCsv(rows: any[], columns: Array<[string, string]>): string {
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    // Quote when the value could otherwise break the row, and double any quote.
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map(([, label]) => esc(label)).join(",");
  const body = rows.map((r) => columns.map(([key]) => esc(r[key])).join(",")).join("\n");
  return `\ufeff${head}\n${body}\n`;
}

app.get("/api/admin/users.csv", requireAdmin, async (_req, res) => {
  try {
    const rows = (await exportUsers()).map((r: any) => ({
      ...r,
      // Rupees, not paise: the column is read by a person, not a machine.
      paid_rupees: ((Number(r.paid_paise) || 0) / 100).toFixed(2),
      trial_used: r.trial_started_at ? "yes" : "no",
    }));
    const csv = toCsv(rows, [
      ["name", "Name"],
      ["email", "Email"],
      ["plan", "Plan"],
      ["status", "Status"],
      ["created_at", "Joined"],
      ["last_seen_at", "Last seen"],
      ["kundlis", "Kundlis"],
      ["questions", "Questions asked"],
      ["reports", "Reports"],
      ["matches", "Matchings"],
      ["credits_balance", "Credits balance"],
      ["payments_count", "Payments"],
      ["paid_rupees", "Paid (Rs)"],
      ["last_paid_at", "Last payment"],
      ["trial_used", "Trial used"],
      ["trial_ends_at", "Trial ends"],
      ["referral_code", "Referral code"],
      ["role", "Role"],
      ["id", "User id"],
    ]);
    const day = todayIn();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="janamjyot-users-${day}.csv"`);
    res.send(csv);
  } catch (err: any) {
    console.error("[admin/users.csv]", err?.message);
    res.status(500).json({ error: "Could not build the export." });
  }
});

app.get("/api/admin/funnel", requireAdmin, async (req, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    // AI cost was being recorded on every call and shown nowhere. It sits here
    // beside revenue because the only question it answers is a ratio: does a
    // chat cost more than the thirty paise a ₹49 pack can afford?
    const [funnel, money, ai] = await Promise.all([
      funnelStats(days), moneyStats(days), aiCostStats(days).catch(() => null),
    ]);
    res.json({ ...funnel, money, ai });
  } catch (err: any) {
    fail(res, 500, "Could not load the funnel.", err, "admin-funnel");
  }
});

/** Daily action counts for the analytics chart. */
app.get("/api/admin/analytics", requireAdmin, async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  res.json({ days, series: await usageSeries(days), plans: PLANS });
});

/** Who did what, most recent first. */
app.get("/api/admin/audit", requireAdmin, async (req, res) =>
  res.json(await listAudit(Math.min(Number(req.query.limit) || 100, 500)))
);

/** Plan change. */
app.post("/api/admin/user/:id/plan", requireAdmin, async (req: any, res) => {
  const plan = String(req.body?.plan) as PlanId;
  if (!(plan in PLANS)) return res.status(400).json({ error: "Unknown plan." });
  const u = await setUserPlan(req.params.id, plan);
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: "user.plan", target: req.params.id, detail: { plan } });
  res.json({ ok: true, user: u });
});

/** Per-user quota overrides. Send {} or null to go back to the plan defaults. */
app.post("/api/admin/user/:id/limits", requireAdmin, async (req: any, res) => {
  const body = req.body?.limits;
  let limits: any = null;
  if (body && typeof body === "object") {
    limits = {};
    for (const k of ["chart", "report", "ask", "match"] as QuotaAction[]) {
      if (body[k] !== undefined && body[k] !== null && body[k] !== "") {
        const n = Number(body[k]);
        if (!Number.isFinite(n)) return res.status(400).json({ error: `Limit "${k}" must be a number (-1 = unlimited).` });
        limits[k] = Math.trunc(n);
      }
    }
    if (!Object.keys(limits).length) limits = null;
  }
  const u = await setUserLimits(req.params.id, limits);
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: "user.limits", target: req.params.id, detail: { limits } });
  res.json({ ok: true, user: u });
});

/** Block (reversible) or ban (permanent), with a reason the user will see. */
app.post("/api/admin/user/:id/status", requireAdmin, async (req: any, res) => {
  const status = String(req.body?.status) as AccountStatus;
  if (!["active", "blocked", "banned"].includes(status)) return res.status(400).json({ error: "Unknown status." });
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You cannot block your own account." });
  const reason = req.body?.reason ? String(req.body.reason) : null;
  const u = await setUserStatus(req.params.id, status, reason);
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: `user.${status}`, target: req.params.id, detail: { reason } });
  res.json({ ok: true, user: u });
});

/** One user, with their live quota usage. */
app.get("/api/admin/user/:id", requireAdmin, async (req, res) => {
  const user = await getUserById(req.params.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  const limits = quotasFor(user);
  const usage: Record<string, { used: number; limit: number; window: string }> = {};
  for (const a of ["chart", "report", "ask", "match"] as QuotaAction[]) {
    usage[a] = {
      used: await usageCount({ userId: user.id, plan: user.plan }, a),
      limit: limits[a],
      window: windowFor(a, user.plan),
    };
  }
  const [balance, trial, payments, ledger] = await Promise.all([
    creditBalance(user.id),
    trialState(user.id),
    paymentHistory(user.id, 20),
    creditHistory(user.id, 20),
  ]);
  res.json({
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan,
      status: user.status, status_reason: user.status_reason, limits_json: user.limits_json,
      created_at: user.created_at, google: !!user.google_sub,
    },
    usage,
    // The money side of the account. Without it an admin answering "why can I
    // not ask a question" had to guess whether it was the plan or the balance.
    credits: {
      balance,
      trial: { active: trial.active, used: trial.used, ends_at: trial.endsAt },
      payments,
      ledger,
    },
    charts: await chartsByOwner(user.id),
  });
});

/**
 * POST /api/admin/user/:id/credits { delta, note } — give or take back credits.
 *
 * The database already had adminAdjustCredits, but nothing reached it, so a
 * refund or a goodwill top-up was impossible from inside the product: the panel
 * could show that a payment needed refunding and then do nothing about it.
 *
 * It writes a ledger row like every other movement — same append-only trail,
 * same balance-never-stored rule — so an adjustment is as auditable as a
 * purchase, and is refused if it would push the balance below zero.
 */
app.post("/api/admin/user/:id/credits", requireAdmin, async (req: any, res) => {
  try {
    const target = await getUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User not found." });
    const delta = Number(req.body?.delta);
    const note = String(req.body?.note ?? "").slice(0, 200);
    const out = await adminAdjustCredits({ userId: target.id, delta, note: note || null });
    if ("error" in out) return res.status(400).json({ error: out.error });
    await audit({
      actorId: req.user.id, actorEmail: req.user.email, action: "credits.adjust",
      target: target.id, detail: { delta, note, balance: out.balance },
    });
    res.json({ ok: true, balance: out.balance });
  } catch (err: any) {
    fail(res, 500, "Could not adjust credits.", err, "admin-credits");
  }
});

// ── Provider API keys ──────────────────────────────────────────────────────
// Keys live in the database (AES-encrypted) so they can be rotated from the
// admin panel without a redeploy. The plaintext is never sent back to a client.

/** Which env var each provider's keys stand in for. */
const KEY_ENV: Record<string, string> = {
  gemini: "GEMINI_API_KEYS",       // comma-separated — the router already splits this
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  elevenlabs: "ELEVENLABS_API_KEY",
};

/**
 * Push the database's keys into the LLM router. Called at boot and after every
 * admin key change, so a newly added key is live on the next request.
 */
async function refreshProviderKeys() {
  const overrides: Record<string, string> = {};
  for (const [provider, envName] of Object.entries(KEY_ENV)) {
    const keys = await getApiKeys(provider);
    if (!keys.length) continue;
    // Gemini supports a pool of keys; the others take the highest-priority one.
    overrides[envName] = provider === "gemini" ? keys.join(",") : keys[0];
  }
  setKeyOverrides(overrides);
  const providers = Object.keys(overrides);
  if (providers.length) console.log(`[keys] loaded from DB for: ${providers.join(", ")}`);
}

app.get("/api/admin/keys", requireAdmin, async (_req, res) => res.json(await listApiKeys()));

app.post("/api/admin/keys", requireAdmin, async (req: any, res) => {
  const provider = String(req.body?.provider ?? "").trim().toLowerCase();
  const secret = String(req.body?.secret ?? "").trim();
  if (!provider || !secret) return res.status(400).json({ error: "Provider and key are required." });
  try {
    const id = await addApiKey({
      provider,
      secret,
      label: req.body?.label ? String(req.body.label) : undefined,
      priority: Number(req.body?.priority) || 100,
    });
    // Never log the secret itself — only that a key was added.
    await audit({ actorId: req.user.id, actorEmail: req.user.email, action: "key.add", target: provider, detail: { label: req.body?.label ?? null } });
    await refreshProviderKeys();
    res.json({ ok: true, id });
  } catch (e: any) {
    res.status(500).json({ error: "Could not save the key." });
  }
});

app.post("/api/admin/keys/:id/enabled", requireAdmin, async (req: any, res) => {
  await setApiKeyEnabled(req.params.id, !!req.body?.enabled);
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: "key.toggle", target: req.params.id, detail: { enabled: !!req.body?.enabled } });
  await refreshProviderKeys();
  res.json({ ok: true });
});

app.delete("/api/admin/keys/:id", requireAdmin, async (req: any, res) => {
  await deleteApiKey(req.params.id);
  await audit({ actorId: req.user.id, actorEmail: req.user.email, action: "key.delete", target: req.params.id });
  await refreshProviderKeys();
  res.json({ ok: true });
});

/** GET /api/me/usage — the caller's own plan and remaining quota. */
app.get("/api/me/usage", async (req: any, res) => {
  const me = identityOf(req);
  const limits = quotasFor(req.user ?? null);
  const out: Record<string, { used: number; limit: number; window: string }> = {};
  const myPlan = (req.user?.plan ?? "free") as PlanId;
  for (const a of ["chart", "report", "ask", "match"] as QuotaAction[]) {
    out[a] = {
      used: await usageCount({ userId: me.userId, deviceId: me.deviceId, plan: myPlan }, a),
      limit: limits[a],
      window: windowFor(a, myPlan),
    };
  }
  res.json({ plan: req.user?.role === "admin" ? "unlimited" : req.user?.plan ?? "free", usage: out });
});
app.get("/api/admin/maintenance", requireAdmin, (_req, res) => res.json(getSetting("maintenance") || { enabled: false, message: "" }));
app.post("/api/admin/maintenance", requireAdmin, async (req, res) => {
  await setSetting("maintenance", { enabled: !!req.body?.enabled, message: String(req.body?.message ?? "") });
  res.json({ ok: true });
});

// Full overview: stats + recent activity + AI health + system flags.
app.get("/api/admin/overview", requireAdmin, async (_req, res) => {
  try {
    res.json({
      stats: await adminStats(),
      recentUsers: await recentUsers(8),
      recentCharts: await recentCharts(8),
      ai: getAiStatus(),
      system: {
        engine: CHART_ENGINE,
        database: process.env.DATABASE_URL ? "postgres" : "file store",
        elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
        email_smtp: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
        ollama: Boolean(process.env.OLLAMA_MODEL),
        ayanamsa: AYANAMSA,
      },
    });
  } catch (err: any) { res.status(500).json({ error: "Something went wrong. Please try again." }); }
});

// User management.
app.get("/api/admin/user/:id/charts", requireAdmin, async (req, res) => res.json(await chartsByOwner(req.params.id)));
app.post("/api/admin/user/:id/role", requireAdmin, async (req: any, res) => {
  const role = req.body?.role === "admin" ? "admin" : "user";
  if (req.params.id === req.user.id && role !== "admin") return res.status(400).json({ error: "You can't remove your own admin access." });
  await setUserRole(req.params.id, role); res.json({ ok: true });
});
app.post("/api/admin/user/:id/suspend", requireAdmin, async (req: any, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't suspend yourself." });
  await setUserSuspended(req.params.id, !!req.body?.suspended); res.json({ ok: true });
});
app.delete("/api/admin/user/:id", requireAdmin, async (req: any, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't delete your own account here." });
  await deleteUserAndData(req.params.id); res.json({ ok: true });
});

// Announcement banner (shown to all signed-in users).
app.get("/api/admin/announcement", requireAdmin, (_req, res) => res.json(getSetting("announcement") || { enabled: false, message: "" }));
app.post("/api/admin/announcement", requireAdmin, async (req, res) => {
  await setSetting("announcement", { enabled: !!req.body?.enabled, message: String(req.body?.message ?? "") });
  res.json({ ok: true });
});

// Feature flags (cost control — turn AI features on/off).
const FEATURE_KEYS = ["chat", "reports", "tts", "horoscope", "match"];
app.get("/api/admin/features", requireAdmin, (_req, res) => res.json(getSetting("features") || {}));
app.post("/api/admin/features", requireAdmin, async (req, res) => {
  const cur = getSetting("features") || {};
  const next = { ...cur };
  for (const k of FEATURE_KEYS) if (k in (req.body || {})) next[k] = !!req.body[k];
  await setSetting("features", next);
  res.json({ ok: true, features: next });
});

// Public (signed-in) config — banner + which features are enabled.
app.get("/api/config", (_req, res) => {
  const ann = getSetting("announcement");
  res.json({
    announcement: ann?.enabled ? ann.message : null,
    features: getSetting("features") || {},
    // In-app update. The APK is sideloaded, so there is no store to tell anyone
    // a new build exists — the app compares its own version against this and
    // offers the download itself.
    app: (() => {
      const version = String(getSetting("app_version") || process.env.APP_VERSION || "1.0");
      const base = (process.env.PUBLIC_APP_URL || "https://janamjyot.lzworth.in").replace(/\/$/, "");
      return {
      version,
      // Derived from the published version, never hardcoded. It used to be a
      // fixed .../JanamJyot-v1.3.apk while the version said 1.8, so tapping
      // "update" installed a build five releases OLD. Version and file cannot
      // disagree now: publishing a version publishes its file.
      apk_url: process.env.APK_URL || `${base}/JanamJyot-v${version}.apk`,
      notes: String(getSetting("app_update_notes") || ""),
      // When true the prompt reappears every launch instead of once per version.
      mandatory: !!getSetting("app_update_mandatory"),
      /*
       * The web bundle phones should run — delivered over the air.
       *
       * The url is made ABSOLUTE here, against the same base as apk_url. The
       * manifest stores it relative, and inside the app the page origin is
       * "https://localhost" — so a relative url resolved on the phone became
       * https://localhost/ota/web-….zip, which 404s. Every over-the-air update
       * failed silently at exactly that line, because the download error is
       * caught and turned into "no update". The server knows its own domain;
       * the phone does not.
       */
      web: OTA_MANIFEST && {
        ...OTA_MANIFEST,
        url: /^https?:\/\//i.test(OTA_MANIFEST.url)
          ? OTA_MANIFEST.url
          : `${base}${OTA_MANIFEST.url.startsWith("/") ? "" : "/"}${OTA_MANIFEST.url}`,
      },
      };
    })(),
    // Lets the checkout say "test mode, use this card" while we are on test
    // keys, and say nothing at all once live keys are in — so the banner can
    // never be left on by accident in front of paying customers.
    payments: {
      enabled: RZP_READY,
      test_mode: RZP_KEY_ID.startsWith("rzp_test_"),
    },
  });
});

/**
 * The free-tier-then-credits gate.
 *
 * Order matters and is deliberate: the free allowance is spent FIRST, so a
 * user who has bought credits still gets their daily free usage rather than
 * silently paying for something they were entitled to.
 *
 * Nothing is charged here. The caller must deliver first and then call
 * `settleCharge` — an AI call that fails must never cost the user a credit,
 * which is the single biggest source of "you took my money" complaints.
 *
 * Returns `null` to proceed free, a charge handle to proceed and settle after,
 * or throws a 402-shaped object when they can neither use free nor pay.
 */
async function authoriseAction(
  req: any,
  action: QuotaAction,
  priceKey: keyof typeof CREDIT_PRICES,
): Promise<{ credits: number } | null> {
  const over = await checkQuota(req, action);
  if (!over) return null; // still inside the free allowance

  // Inside the ₹1 trial the paid features are open, up to the trial's own caps.
  // Checked after the free allowance so trial days are not burned on usage the
  // user was entitled to anyway.
  const trial = await trialState(req.user.id);
  if (trial.active) {
    const cap = (TRIAL.limits as Record<string, number>)[priceKey];
    if (cap != null) {
      const used = await deliveryCountSince(req.user.id, priceKey, trial.endsAt!);
      if (used < cap) return null;
    }
  }

  const credits = CREDIT_PRICES[priceKey];
  const balance = await creditBalance(req.user.id);
  if (balance < credits) {
    throw {
      __httpStatus: 402,
      error: `${over.error} You can continue with credits — this costs ${credits} credit${credits === 1 ? "" : "s"}.`,
      // `action` is what the sheet keys off to decide this is BUYABLE. Left out,
      // the app showed a limit notice with a single "OK" button and no way to
      // pay — on the exact screen where someone had just decided they wanted
      // to. The 429 path below already sends it; this one did not.
      action,
      needs_credits: credits,
      balance,
      free_limit: over.limit,
    };
  }
  return { credits };
}

/**
 * Free allowance first, then credits — the whole paid model, in one call.
 *
 * `authoriseAction` and `settleCharge` existed for a while with no call sites,
 * so credits could be bought and then never spent on anything: the wallet was
 * decorative and the features were gated purely by the free quota's 429. This
 * is what connects the two.
 *
 * Returns null when the caller should stop — the 402 has already been sent,
 * carrying the price and the balance so the app can offer to top up.
 */
async function charge(
  req: any, res: any, action: QuotaAction, priceKey: keyof typeof CREDIT_PRICES,
): Promise<{ charge: { credits: number } | null } | null> {
  try {
    return { charge: await authoriseAction(req, action, priceKey) };
  } catch (e: any) {
    if (e?.__httpStatus) { res.status(e.__httpStatus).json(e); return null; }
    throw e;
  }
}

/** Charge only once the thing actually exists. Never before. */
async function settleCharge(
  req: any,
  charge: { credits: number } | null,
  kind: string,
  chartId?: string | null,
  meta?: Record<string, any>,
): Promise<void> {
  if (!charge) return;
  await spendCredits({
    userId: req.user.id,
    credits: charge.credits,
    kind,
    chartId: chartId ?? null,
    // `kind` says which FEATURE was bought; `meta.category` says what it was
    // ABOUT. Without the second one the honest answer to "what do people
    // actually pay us for" is "chat", which is not an answer you can build a
    // business on. With it, "most of our revenue is marriage questions"
    // becomes a fact rather than a hunch.
    meta,
  });
}

// ── Credits ────────────────────────────────────────────────────────────────
// 1 credit = ₹1. Balances live in the ledger (see db.ts); nothing here ever
// trusts a number the client sent.

/** GET /api/credits — balance, the price list, and the packs on sale. */
app.get("/api/credits", async (req: any, res) => {
  try {
    const [balance, trial] = await Promise.all([
      creditBalance(req.user.id),
      trialState(req.user.id),
    ]);
    res.json({
      balance,
      trial: {
        active: trial.active,
        used: trial.used,
        ends_at: trial.endsAt,
        rupees: TRIAL.paise / 100,
        days: TRIAL.days,
        limits: TRIAL.limits,
      },
      prices: CREDIT_PRICES,
      packs: Object.entries(CREDIT_PACKS).map(([id, p]) => ({
        id, label: p.label, credits: p.credits, rupees: p.paise / 100,
      })),
      mock_billing: MOCK_BILLING,
    });
  } catch (err: any) {
    fail(res, 500, "Could not load your credits.", err, "credits");
  }
});

/** GET /api/billing/history — this account's own receipts. */
app.get("/api/billing/history", async (req: any, res) => {
  try {
    res.json({ email: req.user.email, payments: await paymentHistory(req.user.id, 50) });
  } catch (err: any) {
    fail(res, 500, "Could not load your purchase history.", err, "billing-history");
  }
});

/** GET /api/admin/payments — every payment, with the account it belongs to. */
app.get("/api/admin/payments", requireAdmin, async (_req, res) => {
  try {
    const [payments, totals] = await Promise.all([allPayments(200), paymentTotals()]);
    res.json({ totals, payments });
  } catch (err: any) {
    fail(res, 500, "Could not load payments.", err, "admin-payments");
  }
});

/**
 * Mock billing — the real purchase FLOW with a fake payment provider.
 *
 * Everything around the money is the shape it will ship as: the order is
 * created server-side against the session's user, the grant happens in a
 * "webhook" the client cannot forge the contents of, and the payment id is
 * unique so a replay is a no-op. Only the provider is fake. Swapping Razorpay
 * in later replaces one adapter, not the flow.
 *
 * HARD RULE: these routes do not exist in production. Not behind a flag, not
 * behind a header — an endpoint that mints credits must be unreachable on the
 * live site, because one misconfigured env var would otherwise hand out free
 * credits to anyone who found the URL.
 */
/* ── Razorpay (the live payment path) ──────────────────────────────────────
   Two routes and one rule: money is only ever granted by the WEBHOOK, after a
   signature check. The browser saying "payment done" is never trusted — anyone
   can send that. Granting is keyed on Razorpay's payment id and the ledger has
   a unique index on it, so Razorpay's retries (it retries on any non-2xx) can
   never credit an account twice. */
const RZP_KEY_ID = (process.env.RAZORPAY_KEY_ID || "").trim();
const RZP_KEY_SECRET = (process.env.RAZORPAY_KEY_SECRET || "").trim();
const RZP_WEBHOOK_SECRET = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
const RZP_READY = !!(RZP_KEY_ID && RZP_KEY_SECRET);

/** GET /api/billing/packs — the price list, PUBLIC so the checkout page can show
 *  exactly what is being bought before the person signs in. Nothing private
 *  here; it is the same list printed on the pricing page. */
app.get("/api/billing/packs", (_req, res) => {
  res.json({
    packs: Object.entries(CREDIT_PACKS).map(([id, p]) => ({
      id, rupees: p.paise / 100, credits: p.credits, label: p.label,
    })),
    trial: { rupees: TRIAL.paise / 100, days: TRIAL.days },
    prices: CREDIT_PRICES,
    test_mode: RZP_KEY_ID.startsWith("rzp_test_"),
    enabled: RZP_READY,
  });
});

/**
 * May this request start a ₹1 trial? Answers the request itself when not.
 *
 * Checked BEFORE the order is created, not at settlement. The per-account guard
 * downstream does catch a second trial — by taking the rupee and then flagging
 * it for a manual refund, which is the right safety net and a terrible
 * experience. Refusing up front means nobody is charged for something they
 * cannot receive.
 *
 * Two conditions, because either alone is trivially defeated: this ACCOUNT must
 * not have used a trial, and neither must any other account created on this
 * PHONE. Five accounts for five rupees was the loophole; this closes it without
 * touching anyone who simply owns one account.
 */
async function trialBlocked(req: any, res: any): Promise<boolean> {
  const t = await trialState(req.user.id);
  if (t.used) {
    res.status(409).json({ error: "This account has already used its trial." });
    return true;
  }
  const dev = identityOf(req).deviceId;
  if (dev && (await deviceUsedTrial(dev).catch(() => false))) {
    res.status(409).json({
      error: "The trial has already been used on this phone. Credit packs are still available.",
      device_limit: true,
    });
    return true;
  }
  return false;
}

/** POST /api/billing/order { pack } — create a Razorpay order for this user. */
app.post("/api/billing/order", async (req: any, res) => {
  if (!RZP_READY) return res.status(503).json({ error: "Payments are not enabled yet." });
  try {
    const packId = String(req.body?.pack ?? "");
    const isTrial = packId === "trial";
    const pack = isTrial
      ? { paise: TRIAL.paise, credits: 0, label: "3-day trial" }
      : CREDIT_PACKS[packId];
    if (!pack) return res.status(400).json({ error: "Unknown pack." });

    if (isTrial && await trialBlocked(req, res)) return;

    // Two taps, or two open tabs, must not become two payable orders — send
    // them back to the one they already have. Razorpay refuses a second payment
    // against an order it has already collected, so this is what makes a double
    // charge impossible rather than merely unlikely.
    const existing = await findReusableOrder(req.user.id, packId, pack.paise);
    if (existing) {
      return res.json({
        order_id: existing.orderId, amount: pack.paise, currency: "INR",
        pack: packId, key_id: RZP_KEY_ID, reused: true,
      });
    }

    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: pack.paise,
        currency: "INR",
        // The user id lives in the order NOTES only for support/tracing. The
        // account that gets credited is read from OUR payments row, which was
        // written from the session — never from anything the client can set.
        notes: { user_id: req.user.id, pack: packId },
        receipt: `jj_${Date.now()}_${String(req.user.id).slice(0, 8)}`,
      }),
    });
    const order: any = await r.json().catch(() => ({}));
    if (!r.ok || !order?.id) {
      console.error("[rzp-order] provider rejected:", r.status, order?.error?.description);
      return res.status(502).json({ error: "Could not start this purchase. Please try again." });
    }

    await createProviderOrder({
      userId: req.user.id, packId, paise: pack.paise, credits: pack.credits, orderId: order.id,
    });
    res.json({
      order_id: order.id, amount: pack.paise, currency: "INR",
      pack: packId, key_id: RZP_KEY_ID,
    });
  } catch (err: any) {
    fail(res, 500, "Could not start this purchase.", err, "rzp-order");
  }
});

/**
 * POST /api/billing/webhook — Razorpay calls this. PUBLIC (no session), so the
 * SIGNATURE is the only thing standing between a stranger and free credits.
 * Always answer 2xx once the event is understood, or Razorpay keeps retrying.
 */
/**
 * POST /api/billing/verify — "I paid but nothing happened."
 *
 * The webhook is the normal path and it is the only thing that may grant
 * credits from Razorpay's own word. But a webhook can be delayed, misrouted, or
 * dropped, and when that happens the buyer is left with a debit and nothing to
 * show for it — the single worst thing a payment system can do.
 *
 * So this asks Razorpay directly about THIS account's unfinished orders and, if
 * the provider says a payment was captured, settles it here. It never trusts
 * the client: the caller cannot name an order, the list comes from our own
 * table filtered to their user id, and the amount and pack come from the row we
 * wrote when the order was created.
 */
app.post("/api/billing/verify", async (req: any, res) => {
  if (!RZP_READY) return res.status(503).json({ error: "Payments are not enabled yet." });
  try {
    const pending = await pendingOrders(req.user.id);
    if (!pending.length) {
      const [balance, trial] = await Promise.all([creditBalance(req.user.id), trialState(req.user.id)]);
      return res.json({ checked: 0, recovered: 0, balance, trial_active: trial.active });
    }

    const auth = "Basic " + Buffer.from(`${RZP_KEY_ID}:${RZP_KEY_SECRET}`).toString("base64");
    let recovered = 0;
    const notes: string[] = [];

    // Only the few most recent: this runs while someone is waiting on a screen.
    for (const o of pending.slice(0, 5)) {
      const r = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(o.order_id)}/payments`, {
        headers: { Authorization: auth },
      });
      if (!r.ok) { notes.push(`${o.order_id}: provider ${r.status}`); continue; }
      const body: any = await r.json().catch(() => ({}));
      const captured = (body?.items ?? []).find((p: any) => p?.status === "captured");
      if (!captured) continue;

      const settled = await settleOrder(o.order_id, "paid", String(captured.id || ""));
      if (!settled.ok) continue;
      notes.push(await honourPayment(settled, String(captured.id || ""), o.order_id));
      recovered++;
    }

    const [balance, trial] = await Promise.all([creditBalance(req.user.id), trialState(req.user.id)]);
    res.json({ checked: pending.length, recovered, balance, trial_active: trial.active, notes });
  } catch (err: any) {
    fail(res, 500, "Could not check your payment. Please try again in a moment.", err, "billing-verify");
  }
});

/**
 * Give the buyer what they paid for. Safe to call again for the same payment.
 *
 * This deliberately does NOT skip when the row was already marked paid. It used
 * to: `settleOrder` flipped the row to `paid` first, and only a first-time
 * settlement ran the grant. So if the grant then threw — a dropped connection
 * to the database, say — the webhook 500'd, Razorpay retried, the retry saw an
 * already-settled row, and the credits were never given. Money taken, nothing
 * delivered, permanently, with no error anywhere afterwards.
 *
 * Running it every time is safe because the database, not this code, enforces
 * once-only: `idx_ledger_payment_once` allows a single ledger row per payment,
 * and `startTrial` only fires while `trial_started_at IS NULL`.
 */
async function honourPayment(
  result: { userId?: string; credits?: number; packId?: string; paymentId?: string },
  paymentId: string,
  orderId: string,
): Promise<string> {
  if (!result.userId) return "no user";
  if (result.packId === "trial") {
    const started = await startTrial(result.userId);
    if (started) {
      // Counted against the PHONE as well as the account, so the next account
      // made here cannot buy the same trial again.
      const dev = await deviceOfUser(result.userId).catch(() => null);
      if (dev) await noteDeviceTrial(dev).catch(() => {});
      return "trial started";
    }
    // Paid for a trial this account had already used. The money is real, so it
    // is flagged for a person to refund rather than quietly kept.
    await markNeedsRefund(orderId, "Trial already used by this account — refund due.");
    console.warn("[billing] trial paid twice, refund due:", orderId);
    return "trial already used — refund due";
  }
  if (result.credits) {
    await grantCredits({
      userId: result.userId, credits: result.credits, reason: "purchase",
      refType: "payment", refId: result.paymentId || paymentId || orderId, note: result.packId,
    });
    return "credits granted";
  }
  return "nothing to grant";
}

app.post("/api/billing/webhook", async (req: any, res) => {
  try {
    if (!RZP_WEBHOOK_SECRET) return res.status(503).json({ error: "Webhook not configured." });

    const sent = String(req.get("x-razorpay-signature") || "");
    const raw: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const expected = crypto.createHmac("sha256", RZP_WEBHOOK_SECRET).update(raw).digest("hex");
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(sent, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      console.warn("[rzp-webhook] bad signature — ignored");
      return res.status(400).json({ error: "Bad signature." });
    }

    const event = String(req.body?.event || "");
    const entity = req.body?.payload?.payment?.entity ?? {};
    // `order.paid` carries the order rather than the payment. Accepting both
    // means the account's event selection cannot silently break settlement.
    const orderEntity = req.body?.payload?.order?.entity ?? {};
    const orderId = String(entity.order_id || orderEntity.id || "");
    const paymentId = String(entity.id || "");

    if (!orderId) return res.json({ ok: true, ignored: "no order id" });

    if (event === "payment.captured" || event === "order.paid") {
      const result = await settleOrder(orderId, "paid", paymentId || null);
      if (!result.ok) {
        // Unknown order: nothing we can credit. 200 so Razorpay stops retrying.
        console.warn("[rzp-webhook] unknown order", orderId);
        return res.json({ ok: true, ignored: "unknown order" });
      }
      const granted = await honourPayment(result, paymentId, orderId);
      return res.json({ ok: true, settled: true, already: result.alreadySettled ?? false, granted });
    }

    if (event === "payment.failed") {
      await settleOrder(orderId, "failed", null, String(entity.error_description || "failed"));
      return res.json({ ok: true, settled: "failed" });
    }

    return res.json({ ok: true, ignored: event });
  } catch (err: any) {
    console.error("[rzp-webhook] error:", err?.message);
    // 500 makes Razorpay retry, which is what we want for a transient failure.
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

const MOCK_BILLING = !IS_PROD;

function requireMockBilling(res: any): boolean {
  if (MOCK_BILLING) return true;
  res.status(404).json({ error: "Not found." });
  return false;
}

/** POST /api/billing/mock/order { pack } — create a pending order. */
app.post("/api/billing/mock/order", async (req: any, res) => {
  if (!requireMockBilling(res)) return;
  try {
    const packId = String(req.body?.pack ?? "");
    const isTrial = packId === "trial";
    const pack = isTrial
      ? { paise: TRIAL.paise, credits: 0, label: "3-day trial" }
      : CREDIT_PACKS[packId];
    if (!pack) return res.status(400).json({ error: "Unknown pack." });

    if (isTrial && await trialBlocked(req, res)) return;

    // The order carries the user id from the SESSION. Nothing the client sends
    // can change whose account gets credited — this is what makes it
    // impossible for a payment to land on the wrong account.
    const order = await createMockOrder({
      userId: req.user.id,
      packId,
      paise: pack.paise,
      credits: pack.credits,
    });
    res.json({ order_id: order.orderId, amount: pack.paise, currency: "INR", pack: packId });
  } catch (err: any) {
    fail(res, 500, "Could not start this purchase.", err, "mock-order");
  }
});

/**
 * POST /api/billing/mock/pay { order_id, outcome } — stands in for the
 * provider's webhook. `outcome` lets the flow be tested when a payment fails
 * or arrives twice, which is where real money actually goes missing.
 */
app.post("/api/billing/mock/pay", async (req: any, res) => {
  if (!requireMockBilling(res)) return;
  try {
    const orderId = String(req.body?.order_id ?? "");
    const outcome = String(req.body?.outcome ?? "success");
    const result = await settleMockOrder(orderId, outcome === "fail" ? "failed" : "paid");
    if (!result.ok) return res.status(400).json({ error: result.error });

    let trialEndsAt: string | null = null;
    if (result.status === "paid") {
      if (result.packId === "trial") {
        // Same grant path as the real webhook, so the mock cannot drift away
        // from it — the last time it did, the device-level trial flag was set
        // in production and not in testing, which is the worst way round.
        await honourPayment(
          { userId: result.userId, credits: result.credits, packId: result.packId, paymentId: result.paymentId },
          result.paymentId ?? "", orderId,
        );
        trialEndsAt = (await trialState(result.userId!)).endsAt;
      } else if (result.credits) {
        // Granting is keyed on the payment id, and the ledger has a unique
        // index on it — so a replayed settlement cannot credit twice even if
        // this code runs again.
        await grantCredits({
          userId: result.userId!,
          credits: result.credits,
          reason: "purchase",
          refType: "payment",
          refId: result.paymentId!,
          note: result.packId,
        });
      }
    }
    res.json({
      status: result.status,
      balance: result.userId ? await creditBalance(result.userId) : 0,
      trial_ends_at: trialEndsAt,
      already_settled: result.alreadySettled ?? false,
    });
  } catch (err: any) {
    fail(res, 500, "Could not complete this purchase.", err, "mock-pay");
  }
});

/** GET /api/credits/history — the user's own statement, for disputes. */
app.get("/api/credits/history", async (req: any, res) => {
  try {
    res.json(await creditHistory(req.user.id, 100));
  } catch (err: any) {
    fail(res, 500, "Could not load your credit history.", err, "credits-history");
  }
});

/**
 * POST /api/download — the website pings this when someone taps Download.
 *
 * Public and unauthenticated by design: the download page is the top of the
 * funnel, before anyone has an account. Counted server-side rather than in the
 * page so an ad-blocker or a refresh can't skew it, and de-duplicated per IP
 * for 10 minutes because browsers fire a download click more than once.
 */
app.post("/api/download", async (req, res) => {
  try {
    const ip = String(
      (req.headers["x-forwarded-for"] as string || "").split(",")[0].trim() || req.ip || "",
    );
    // One-way and truncated — enough to de-duplicate, useless as an identifier.
    const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16) : null;
    await recordDownload(ipHash);
  } catch { /* never let counting break the download */ }
  res.json({ ok: true });
});

/** GET /api/downloads — the public count, shown on the site only if admin enabled it. */
app.get("/api/downloads", async (_req, res) => {
  try {
    const show = !!getSetting("downloads_public");
    if (!show) return res.json({ public: false });
    const { total } = await downloadStats();
    res.json({ public: true, total });
  } catch {
    res.json({ public: false });
  }
});

/** GET /api/admin/downloads — full breakdown for the admin panel. */
app.get("/api/admin/downloads", requireAdmin, async (_req, res) => {
  try {
    const stats = await downloadStats();
    res.json({ ...stats, public: !!getSetting("downloads_public") });
  } catch (err: any) {
    fail(res, 500, "Could not load download stats.", err, "admin-downloads");
  }
});

/** POST /api/admin/downloads/public { enabled } — show/hide the count on the site. */
app.post("/api/admin/downloads/public", requireAdmin, async (req: any, res) => {
  try {
    await setSetting("downloads_public", !!req.body?.enabled);
    res.json({ ok: true, public: !!req.body?.enabled });
  } catch (err: any) {
    fail(res, 500, "Could not update this setting.", err, "admin-downloads-public");
  }
});

/** POST /api/admin/app-version { version, notes, mandatory } — publish an update. */
app.post("/api/admin/app-version", requireAdmin, async (req: any, res) => {
  try {
    const version = String(req.body?.version ?? "").trim();
    if (!/^\d+(\.\d+){0,2}$/.test(version)) {
      return res.status(400).json({ error: "Version must look like 1.0 or 1.2.3" });
    }
    await setSetting("app_version", version);
    await setSetting("app_update_notes", String(req.body?.notes ?? "").slice(0, 300));
    await setSetting("app_update_mandatory", !!req.body?.mandatory);
    audit({ actorId: req.user.id, action: "app.version_published", target: version }).catch(() => {});
    res.json({ ok: true, version });
  } catch (err: any) {
    fail(res, 500, "Could not publish the version.", err, "app-version");
  }
});

// Helper: a feature is on unless an admin explicitly turned it off.
function featureOn(name: string): boolean {
  const f = getSetting("features");
  return !f || f[name] !== false;
}

/**
 * Who is making this request.
 *
 * A signed-in user is identified by their account id; an anonymous visitor by
 * the stable per-install id the client sends. These are kept in SEPARATE fields
 * because `owner_id` is a UUID column in Postgres — the old code packed the
 * device id into it as the string `device:<id>`, which cannot be stored there.
 */
interface Identity { userId?: string; deviceId?: string }

function identityOf(req: any): Identity {
  const dev = req.headers["x-device-id"];
  return {
    userId: req.user?.id,
    deviceId: typeof dev === "string" && dev ? dev : undefined,
  };
}

function canAccessChart(req: any, chart: any): boolean {
  // NOTE: there is deliberately NO admin bypass here.
  //
  // Being an admin is about running the service, not about reading the people
  // who use it. With a bypass, an admin could open ANY chart — and because the
  // private astrologer chat sits behind this same `:chartId` guard, any user's
  // conversation too. Admins get their own charts like everyone else; the admin
  // panel gets counts and names, never content.
  const me = identityOf(req);
  if (chart.owner_id) return chart.owner_id === me.userId;
  if (chart.device_id) return !!me.deviceId && chart.device_id === me.deviceId;
  // Ownerless chart (created before ownership existed, or by an anonymous
  // request that sent no device id). This used to `return true`, which made
  // every such chart world-readable to anyone holding the id — and the id
  // travels in URLs. We cannot prove the caller created it, so deny.
  return false;
}

/**
 * Quota gate for a metered action. Admins are always unlimited.
 *
 * Returns null when the request may proceed, or a ready-to-send error payload
 * describing what was hit and when it resets.
 */
async function checkQuota(
  req: any,
  action: QuotaAction,
): Promise<{ error: string; limit: number; used: number; action: QuotaAction; plan: string } | null> {
  const user = req.user ?? null;
  if (user?.role === "admin") return null;

  const limits = quotasFor(user);
  const limit = limits[action];
  if (limit < 0) return null; // -1 = unlimited

  const plan = (user?.plan ?? "free") as PlanId;
  const me = identityOf(req);
  const used = await usageCount({ userId: me.userId, deviceId: me.deviceId, plan }, action);
  if (used < limit) return null;

  const window = windowFor(action, plan);
  const per =
    window === "month" ? "per month"
    : window === "week" ? "per week"
    : window === "day" ? "per day" : "";
  const when =
    window === "day" ? "Your limit resets tomorrow."
    : window === "week" ? "Your limit resets 7 days after each use."
    : window === "month" ? "Your limit resets 30 days after each use."
    : "Deleting a kundli does not give the slot back.";

  const what: Record<QuotaAction, string> = {
    chart: `Your plan includes ${limit} kundli${limit === 1 ? "" : "s"}, and you have made ${used}.`,
    report: `You can generate ${limit} report${limit === 1 ? "" : "s"} per month on this plan.`,  // report stays monthly on every plan
    ask: `You can ask ${limit} question${limit === 1 ? "" : "s"} ${per} on this plan.`,
    match: `You can run ${limit} kundli match${limit === 1 ? "" : "es"} ${per} on this plan.`,
    daily: `You've opened your daily readings ${limit} times today — that's the fair-use limit.`,
  };

  return {
    error: `${what[action]} ${when}`,
    limit,
    used,
    action,
    plan: user?.plan ?? "free",
  };
}

/**
 * POST /api/contact — sends the Help-page message straight to the developer via
 * SMTP. Returns { sent:true } on success, or { configured:false } if SMTP isn't
 * set up yet (the frontend then falls back to opening the user's email app).
 */
app.post("/api/contact", async (req, res) => {
  const { name, email, message } = req.body ?? {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: "Message is required" });
  }
  if (!isMailConfigured()) {
    return res.status(200).json({ sent: false, configured: false });
  }
  try {
    await sendContactEmail({ name: String(name ?? ""), email: String(email ?? ""), message: String(message) });
    res.json({ sent: true });
  } catch (err: any) {
    console.error("[contact] send failed:", err?.message);
    res.status(502).json({ error: "Could not send email" });
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
 * TEXT-TO-SPEECH  (Google Gemini TTS)
 *
 * ┌── VOICE / KEY CONFIGURATION — change these in your .env file ──────────────┐
 * │  GEMINI_TTS_API_KEY   → key for TTS (optional; falls back to GEMINI_API_KEY)│
 * │  GEMINI_TTS_VOICE_MAIN → voice for the MAIN app        (default: Algieba)   │
 * │  GEMINI_TTS_VOICE_CHAT → voice for the ASTROLOGER chat  (default: Alnilam)  │
 * │  GEMINI_TTS_MODEL      → TTS model (default: gemini-2.5-flash-preview-tts)  │
 * └────────────────────────────────────────────────────────────────────────────┘
 * The API key NEVER leaves the server — the app only sends { text, context }.
 * ═══════════════════════════════════════════════════════════════════════════ */
const TTS_VOICE_MAIN = () => (process.env.GEMINI_TTS_VOICE_MAIN || "Algieba").trim();
const TTS_VOICE_CHAT = () => (process.env.GEMINI_TTS_VOICE_CHAT || "Alnilam").trim();
const TTS_MODEL = () => (process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts").trim();
const TTS_KEY = () => (process.env.GEMINI_TTS_API_KEY || process.env.GEMINI_API_KEY || "").trim();

/** Wrap raw signed-16-bit little-endian PCM into a playable WAV container. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bits = 16): Buffer {
  const blockAlign = (channels * bits) / 8;
  const byteRate = sampleRate * blockAlign;
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);            // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bits, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/**
 * POST /api/tts — natural voice via Google Gemini TTS (key stays server-side).
 * Body: { text, context?: "main" | "chat", voice? }.
 * Returns audio/wav bytes. If no key is set, returns { configured:false } so the
 * frontend falls back to the browser's built-in (free) voice.
 */
app.post("/api/tts", async (req, res) => {
  const key = TTS_KEY();
  if (!key || !featureOn("tts")) return res.status(200).json({ configured: false }); // off → frontend uses free browser voice
  const text = String(req.body?.text ?? "").replace(/\*\*/g, "").trim().slice(0, 1200);
  if (!text) return res.status(400).json({ error: "text is required" });

  // Pick the voice from the request's context (main app vs astrologer chat).
  // An explicit `voice` in the body always wins (handy for testing).
  const context = String(req.body?.context || "main").toLowerCase();
  const voice = String(req.body?.voice || (context === "chat" ? TTS_VOICE_CHAT() : TTS_VOICE_MAIN())).trim();
  const model = TTS_MODEL();

  // Natural-language style directive — Gemini speaks the text AFTER the colon,
  // and treats the lead-in as delivery style. We tailor the directive to the
  // language so Hindi, English and Hinglish all read with a natural human flow.
  // (Auto-detect Devanagari; otherwise trust the app's `lang` hint.)
  const hasDevanagari = /[ऀ-ॿ]/.test(text);
  const langHint = String(req.body?.lang || "").toLowerCase();
  const flavour = hasDevanagari ? "hi" : (langHint.startsWith("hi") ? (langHint === "hinglish" ? "hinglish" : "hi") : (langHint === "en" ? "en" : "hinglish"));
  const STYLE: Record<string, string> = {
    hi: "Read this aloud in natural, fluent, conversational Hindi with a warm, friendly human tone, at a calm medium pace, pronouncing every word clearly and pausing naturally at commas and full stops",
    en: "Read this aloud in natural, fluent, conversational English with a warm, friendly human tone, at a calm medium pace, pausing naturally at commas and full stops",
    hinglish: "Read this aloud as a natural Hindi-English (Hinglish) mix, exactly the way people speak in India — pronounce the Hindi words in an authentic native Hindi accent and the English words naturally — with a warm, friendly, human, conversational tone at a calm medium pace, pausing naturally at commas and full stops",
  };
  const prompt = `${STYLE[flavour] || STYLE.hinglish}: ${text}`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(502).json({ error: `Gemini TTS ${r.status}: ${t.slice(0, 200)}` });
    }
    const j: any = await r.json();
    const inline = j?.candidates?.[0]?.content?.parts?.find((p: any) => p?.inlineData)?.inlineData;
    const b64 = inline?.data as string | undefined;
    if (!b64) return res.status(502).json({ error: "Gemini TTS returned no audio" });
    const rate = parseInt(/rate=(\d+)/.exec(inline?.mimeType || "")?.[1] || "24000", 10);
    const wav = pcmToWav(Buffer.from(b64, "base64"), rate);
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    res.send(wav);
  } catch (err: any) {
    console.error("[tts] error:", err?.message);
    res.status(502).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/ai-status — live status of every configured AI provider.
 * ADMIN ONLY: this reveals which providers/keys are configured and their quota
 * state, so it must never be readable by a normal app user.
 */
app.get("/api/ai-status", requireAdmin, (_req, res) => {
  try {
    res.json(getAiStatus());
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/places?q=...
 * Place autocomplete. Proxies the free Open-Meteo geocoding API (no key needed)
 * and returns each match's coordinates + IANA timezone, so the user never has
 * to know latitude/longitude/timezone themselves.
 */
// In-memory cache for place lookups. Open-Meteo is the slow hop; the same
// prefixes are typed over and over (across users and as one user types), so a
// short-lived cache makes autocomplete feel instant after the first hit.
const placesCache = new Map<string, { at: number; data: any[] }>();
const PLACES_TTL = 6 * 60 * 60 * 1000; // 6 hours

app.get("/api/places", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) return res.json([]);
  const key = q.toLowerCase();

  const hit = placesCache.get(key);
  if (hit && Date.now() - hit.at < PLACES_TTL) {
    res.set("Cache-Control", "public, max-age=21600");
    return res.json(hit.data);
  }

  try {
    const url =
      "https://geocoding-api.open-meteo.com/v1/search?count=8&language=en&format=json&name=" +
      encodeURIComponent(q);
    const r = await fetch(url);
    const j: any = await r.json();
    const results = (j.results ?? []).map((p: any) => ({
      label: [p.name, p.admin1, p.country].filter(Boolean).join(", "),
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      timezone: p.timezone,
      country: p.country,
    }));
    // Cap the cache so it can't grow without bound.
    if (placesCache.size > 2000) placesCache.clear();
    placesCache.set(key, { at: Date.now(), data: results });
    res.set("Cache-Control", "public, max-age=21600");
    res.json(results);
  } catch (err: any) {
    console.error("[places] error:", err?.message);
    res.status(502).json({ error: "Place lookup failed" });
  }
});

/**
 * POST /api/create-chart
 * Validates birth details, fetches REAL chart data from Prokerala, normalizes
 * it, persists profile + calculation, and returns chartId + dashboard summary.
 */
/**
 * POST /api/chart-preview — the website's "free kundli" teaser.
 *
 * PUBLIC on purpose. The marketing page promises "Free · No account needed"
 * and shows a visitor their Lagna, Moon sign, Nakshatra and running Dasha
 * before they download anything; putting it behind the sign-in wall made the
 * page contradict itself with "Please sign in to use this."
 *
 * It is safe to leave open because it is not the chart API:
 *   • it writes NOTHING — no birth profile, no chart row, no usage record, so
 *     there is nothing for an anonymous caller to accumulate or read back;
 *   • it returns only `summary`, never a chart id, so none of the paid
 *     surfaces (reports, chat, timeline) can be reached from what it hands out;
 *   • it always uses the built-in local engine, so it can never spend a
 *     Prokerala credit however much traffic hits it;
 *   • it is rate-limited per IP on top of all that.
 * The visitor's birth details are used for the calculation and then dropped.
 */
app.post("/api/chart-preview", async (req, res) => {
  const v = validateBirthInput(req.body);
  if (!v.ok || !v.value) {
    return res.status(400).json({ error: "Invalid input", details: v.errors });
  }
  const input = v.value;
  const isoDatetime = buildIsoDatetime(input.date_of_birth, input.time_of_birth, input.timezone);

  try {
    const local = computeChart({
      datetime: isoDatetime,
      latitude: input.latitude,
      longitude: input.longitude,
      ayanamsa: AYANAMSA,
    });
    const raw = {
      request: { datetime: isoDatetime, latitude: input.latitude, longitude: input.longitude, ayanamsa: AYANAMSA },
      engine: "local",
      planet_position: local.planetPositionData,
      dasha_periods: local.dashaData,
    };
    const { normalized } = normalizeChart({
      birth: input,
      isoDatetime,
      ayanamsa: AYANAMSA,
      planetPositionData: local.planetPositionData,
      birthDetailsData: undefined,
      dashaData: local.dashaData,
      raw,
      provider: "local",
    });
    return res.json({ summary: normalized.summary, preview: true });
  } catch (err: any) {
    console.error("[chart-preview] error:", err?.message);
    return res.status(502).json({ error: "Could not calculate — please re-check the details." });
  }
});

app.post("/api/create-chart", async (req, res) => {
  // Check the quota before doing any work — computing a chart the user is not
  // allowed to keep would burn a provider call for nothing.
  const auth = await charge(req as any, res, "chart", "chart");
  if (!auth) return;

  const v = validateBirthInput(req.body);
  if (!v.ok || !v.value) {
    return res.status(400).json({ error: "Invalid input", details: v.errors });
  }
  const input = v.value;

  const isoDatetime = buildIsoDatetime(input.date_of_birth, input.time_of_birth, input.timezone);

  // Compute the chart. Default engine = "local" (our own astronomy engine, no API
  // needed). Set CHART_ENGINE=prokerala to use the Prokerala API instead.
  let planetPositionData: any, dashaData: any, provider: string;
  try {
    if (CHART_ENGINE === "prokerala") {
      provider = "prokerala";
      const query: ProkeralaQuery = {
        datetime: isoDatetime,
        coordinates: `${input.latitude},${input.longitude}`,
        ayanamsa: AYANAMSA,
        la: "en",
      };
      const [pp, dp] = await Promise.all([fetchPlanetPosition(query), fetchDashaPeriods(query)]);
      planetPositionData = pp?.data;
      dashaData = dp?.data;
    } else {
      provider = "local";
      const local = computeChart({
        datetime: isoDatetime,
        latitude: input.latitude,
        longitude: input.longitude,
        ayanamsa: AYANAMSA,
      });
      planetPositionData = local.planetPositionData;
      dashaData = local.dashaData;
    }
  } catch (err: any) {
    const msg = err?.message || "";
    console.error("[create-chart] engine error:", msg);
    if (/insufficient credit|credit balance|\(403\)/i.test(msg)) {
      return res.status(402).json({
        error:
          "Your Prokerala account has run out of credits. Switch to the built-in engine (default) by leaving CHART_ENGINE unset, or add credits at prokerala.com.",
        detail: msg,
      });
    }
    return res.status(502).json({ error: "Chart calculation failed", detail: msg });
  }

  const raw = {
    request: { datetime: isoDatetime, latitude: input.latitude, longitude: input.longitude, ayanamsa: AYANAMSA },
    engine: provider,
    planet_position: planetPositionData,
    dasha_periods: dashaData,
  };

  let normalized: any, validationStatus: string;
  try {
    ({ normalized, validationStatus } = normalizeChart({
      birth: input,
      isoDatetime,
      ayanamsa: AYANAMSA,
      planetPositionData,
      birthDetailsData: undefined, // Moon sign + nakshatra are derived from planet positions
      dashaData,
      raw,
      provider,
    }));
  } catch (err: any) {
    console.error("[create-chart] normalize error:", err?.message);
    return res.status(500).json({ error: "Failed to normalize chart data" });
  }

  // Debug aid for verifying the engine. Deliberately does NOT log the birth
  // datetime, coordinates or name — those are personal data and must never end
  // up in server logs (which are retained and readable by the platform).
  if (process.env.LOG_CHART_DEBUG === "true") {
    console.log("[create-chart] engine:", provider,
      "planets:", Array.isArray(planetPositionData?.planet_position) ? planetPositionData.planet_position.length : "n/a",
      "dashas:", Array.isArray(dashaData?.dasha_periods) ? dashaData.dasha_periods.length : "n/a",
      "validation:", validationStatus);
  }

  try {
    const me = identityOf(req as any);
    const profileId = await insertBirthProfile(input, me.userId, me.deviceId);
    const chartId = await insertChartCalculation({
      birthProfileId: profileId,
      provider,
      normalized,
      raw,
      validationStatus,
      ownerId: me.userId,
      deviceId: me.deviceId,
    });
    recordUsage({ userId: me.userId, deviceId: me.deviceId, action: "chart", meta: { chartId } }).catch(() => {});
    // A referral pays out here, not at signup and not at verification. A working
    // inbox is cheap — Gmail hands out unlimited addresses that all arrive in
    // one mailbox — but a saved kundli means a real person entered a real birth
    // date and got something back. It is the first thing anyone who actually
    // wants the app does, and the last thing someone farming codes bothers with.
    if (me.userId) settleReferral(me.userId).catch((e) => console.warn("[referral] settle failed:", e?.message));
    // Charged only now, with the kundli saved. A calculation that failed
    // returned above, so a failure never costs anyone a credit.
    await settleCharge(req, auth.charge, "chart", chartId);
    return res.json({
      id: chartId,
      chartId,
      validation_status: validationStatus,
      summary: normalized.summary,
      birth_details: normalized.birth_details,
    });
  } catch (err: any) {
    console.error("[create-chart] db error:", err?.message);
    return res.status(500).json({ error: "Failed to save chart" });
  }
});

/** GET /api/chart/:chartId — full normalized chart data. */
app.get("/api/chart/:chartId", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    res.json(chart);
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/d1 — D1 chart (normalized houses + legacy planets/ascendant). */
app.get("/api/chart/:chartId/d1", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    res.json({
      chart_type: "D1",
      chart_style: "north_indian",
      houses: chart.d1_chart?.houses ?? [],
      ascendant: chart.ascendant,
      planets: chart.planets,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/d9 — D9 navamsa (normalized houses + legacy shape). */
app.get("/api/chart/:chartId/d9", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const d9 = chart.d9_chart ?? {};
    res.json({
      chart_type: "D9",
      chart_style: "north_indian",
      houses: d9.houses ?? [],
      ascendant: { sign: d9.ascendant_sign ?? "", degree: 0, nakshatra: "", pada: 0 },
      planets: (d9.planet_positions ?? []).map((p: any) => ({
        planet: p.planet,
        sign: p.sign,
        house: p.house,
        retrograde: p.retrograde,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/divisional — D6, D10, D11 divisional charts. */
app.get("/api/chart/:chartId/divisional", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const dv = chart.divisional_charts ?? {};
    // Include D9 too for convenience; shape each for the chart renderer.
    const pack = (c: any) =>
      c
        ? {
            chart_type: c.chart_type,
            label: c.label ?? c.chart_type,
            ascendant_sign: c.ascendant_sign,
            houses: c.houses ?? [],
            planets: (c.planet_positions ?? []).map((p: any) => ({
              planet: p.planet,
              sign: p.sign,
              house: p.house,
              retrograde: p.retrograde,
            })),
          }
        : null;
    res.json({
      D6: pack(dv.D6),
      D10: pack(dv.D10),
      D11: pack(dv.D11),
      D9: pack({ ...chart.d9_chart, label: "Navamsa (Marriage/Dharma)" }),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/dasha — dasha timeline (legacy shape for UI). */
app.get("/api/chart/:chartId/dasha", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    res.json({
      ...chart.dashas,
      mahadasha: chart.dasha?.mahadasha ?? [],
      antardasha: chart.dasha?.antardasha ?? [],
      current: chart.dasha?.current ?? {},
    });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/transit/:chartId — LIVE planetary transits (gochar) read against the
 * saved natal chart. Returns each transiting planet's sign + house from the natal
 * lagna and natal moon, plus deterministic highlights (Sade Sati, key transits).
 */
app.get("/api/transit/:chartId", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const tr = buildTransit(chart, AYANAMSA, new Date().toISOString());
    res.json(tr);
  } catch (err: any) {
    console.error("[transit] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * POST /api/match — Kundli Matching (Ashtakoot Guna Milan, 36 points).
 * Body: { boy: <birthInput>, girl: <birthInput>, language?, ai? }
 * Returns the full koota breakdown + doshas, plus an optional AI summary.
 */
/**
 * POST /api/match/from-chart — matching started from inside a conversation.
 *
 * The chat already knows whose chart it is, so asking the person to retype
 * their own birth details is asking them to prove something the app is holding.
 * They give the OTHER person's details; theirs come from the saved chart.
 *
 * Same price, same authorise-then-settle path and the same access check as any
 * other matching — starting from chat changes where it is asked for, not what
 * it costs or who may ask.
 */
app.post("/api/match/from-chart", async (req: any, res) => {
  const chartId = String(req.body?.chartId ?? "");
  const chart = await getNormalizedChart(chartId);
  if (!chart) return res.status(404).json({ error: "Chart not found" });
  if (!canAccessChart(req, chart)) {
    return res.status(403).json({ error: "This chart is not available on this account/device." });
  }

  const mine = validateBirthInput(chart.birth_details);
  const theirs = validateBirthInput(req.body?.other);
  if (!mine.ok || !mine.value) return res.status(400).json({ error: "Your saved chart is incomplete." });
  if (!theirs.ok || !theirs.value) {
    return res.status(400).json({ error: "Please check their birth details.", details: theirs.errors });
  }

  const auth = await charge(req, res, "match", "matching");
  if (!auth) return;

  try {
    const who = identityOf(req as any);
    recordUsage({ userId: who.userId, deviceId: who.deviceId, action: "match", meta: { surface: "chat" } }).catch(() => {});
    const result = matchKundli(personMoon(mine.value, AYANAMSA), personMoon(theirs.value, AYANAMSA));

    let summary: string | null = null;
    if (featureOn("match")) {
      const language = typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "en";
      try { summary = await generateMatchSummary(result, language); }
      catch (e: any) { console.warn("[match-chat] AI summary skipped:", e?.message); }
    }
    await settleCharge(req, auth.charge, "matching", chartId, { category: "marriage", surface: "chat" });
    res.json({ ...result, summary });
  } catch (err: any) {
    console.error("[match-chat] error:", err?.message);
    res.status(500).json({ error: "Matching failed" });
  }
});

app.post("/api/match", async (req, res) => {
  const auth = await charge(req, res, "match", "matching");
  if (!auth) return;

  const vb = validateBirthInput(req.body?.boy);
  const vg = validateBirthInput(req.body?.girl);
  if (!vb.ok || !vb.value) return res.status(400).json({ error: "Invalid groom details", details: vb.errors });
  if (!vg.ok || !vg.value) return res.status(400).json({ error: "Invalid bride details", details: vg.errors });
  try {
    const matcher = identityOf(req as any);
    recordUsage({ userId: matcher.userId, deviceId: matcher.deviceId, action: "match" }).catch(() => {});
    const boy = personMoon(vb.value, AYANAMSA);
    const girl = personMoon(vg.value, AYANAMSA);
    const result = matchKundli(boy, girl);

    let summary: string | null = null;
    if (req.body?.ai !== false && featureOn("match")) {
      const language = typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "en";
      try {
        summary = await generateMatchSummary(result, language);
      } catch (e: any) {
        console.warn("[match] AI summary failed:", e?.message);
      }
    }
    // Charged only now, with the full koota result computed.
    await settleCharge(req, auth.charge, "matching", null, { category: "marriage" });
    res.json({ ...result, summary });
  } catch (err: any) {
    console.error("[match] error:", err?.message);
    res.status(500).json({ error: "Matching failed" });
  }
});

/**
 * POST /api/match/deep — matching past the 36 points.
 *
 * Everything deterministic is computed first and always returned, so the screen
 * has a full reading even when the AI is down, rate-limited or switched off by
 * an admin. The two model calls — the long-form summary and the structured
 * verdict — run TOGETHER rather than one after the other: they do not depend on
 * each other, and running them in series made this the slowest screen in the
 * app for no reason.
 */
app.post("/api/match/deep", async (req, res) => {
  const vb = validateBirthInput(req.body?.boy);
  const vg = validateBirthInput(req.body?.girl);
  if (!vb.ok || !vb.value) return res.status(400).json({ error: "Invalid groom details", details: vb.errors });
  if (!vg.ok || !vg.value) return res.status(400).json({ error: "Invalid bride details", details: vg.errors });

  const auth = await charge(req, res, "match", "matching");
  if (!auth) return;

  try {
    const me = identityOf(req as any);
    recordUsage({ userId: me.userId, deviceId: me.deviceId, action: "match" }).catch(() => {});
    const language = normalizeLanguage(req.body?.language, "en");

    // --- deterministic layers ------------------------------------------
    const boyMoon = personMoon(vb.value, AYANAMSA);
    const girlMoon = personMoon(vg.value, AYANAMSA);
    const base = matchKundli(boyMoon, girlMoon);
    const boy = deepPerson(vb.value, AYANAMSA);
    const girl = deepPerson(vg.value, AYANAMSA);
    const timing = timingAlignment(boy, girl);
    const doshas = doshaDetails(
      boyMoon.manglik, girlMoon.manglik,
      boyMoon.signIndex, girlMoon.signIndex,
      boyMoon.rasiLord, girlMoon.rasiLord,
      boyMoon.nakIndex, girlMoon.nakIndex,
      nadiOf(boyMoon.nakIndex), nadiOf(girlMoon.nakIndex),
    );
    const remedies = remediesFor(doshas);

    // --- the two AI layers, together ------------------------------------
    let summary: string | null = null;
    // Deliberately NOT called `verdict`: the Ashtakoot result already has a
    // `verdict` string ("Very good match") that the screen prints under the
    // score, and spreading this object over it replaced that line with
    // "[object Object]".
    let final_verdict: any = null;
    if (req.body?.ai !== false && featureOn("match")) {
      const [sum, ver] = await Promise.allSettled([
        generateMatchSummary(base, language),
        generateMatchVerdict({ base, boy, girl, timing, doshas, remedies, language }),
      ]);
      if (sum.status === "fulfilled") summary = sum.value;
      else console.warn("[match-deep] summary failed:", sum.reason?.message);
      if (ver.status === "fulfilled") final_verdict = ver.value;
      else console.warn("[match-deep] verdict failed:", ver.reason?.message);
    }

    await settleCharge(req, auth.charge, "matching", null, { category: "marriage" });
    res.json({ ...base, boy_deep: boy, girl_deep: girl, timing, dosha_details: doshas, remedies, final_verdict, summary });
  } catch (err: any) {
    console.error("[match-deep] error:", err?.message);
    res.status(500).json({ error: "Matching failed" });
  }
});

/*
 * The rest of the deep-matching screen.
 *
 * Each of these recomputes the deterministic layers from the two birth inputs
 * rather than trusting a result posted back by the browser. It costs a few
 * milliseconds and it means a client cannot hand us a 36/36 score and a
 * cancelled Nadi dosha that never existed.
 */
function deepLayersFrom(boyInput: any, girlInput: any) {
  const boyMoon = personMoon(boyInput, AYANAMSA);
  const girlMoon = personMoon(girlInput, AYANAMSA);
  const base = matchKundli(boyMoon, girlMoon);
  const boy = deepPerson(boyInput, AYANAMSA);
  const girl = deepPerson(girlInput, AYANAMSA);
  const timing = timingAlignment(boy, girl);
  const doshas = doshaDetails(
    boyMoon.manglik, girlMoon.manglik,
    boyMoon.signIndex, girlMoon.signIndex,
    boyMoon.rasiLord, girlMoon.rasiLord,
    boyMoon.nakIndex, girlMoon.nakIndex,
    nadiOf(boyMoon.nakIndex), nadiOf(girlMoon.nakIndex),
  );
  return { base, boy, girl, timing, doshas };
}

/**
 * Both birth inputs off a request body, validated.
 *
 * Answers the request itself and returns null when either side is bad — the
 * same shape as `charge()` above, so every match route reads
 * `const b = twoBirths(req, res); if (!b) return;`.
 */
function twoBirths(req: any, res: any): { boy: any; girl: any } | null {
  const vb = validateBirthInput(req.body?.boy);
  const vg = validateBirthInput(req.body?.girl);
  if (!vb.ok || !vb.value) { res.status(400).json({ error: "Invalid groom details", details: vb.errors }); return null; }
  if (!vg.ok || !vg.value) { res.status(400).json({ error: "Invalid bride details", details: vg.errors }); return null; }
  return { boy: vb.value, girl: vg.value };
}

/** GET /api/match/chips — questions worth tapping, in the chosen language. */
app.get("/api/match/chips", (req, res) => {
  res.json({ chips: matchQuestionChips(normalizeLanguage(req.query.lang, "en")) });
});

/** POST /api/match/ask — a free-form question about THIS couple, both charts. */
app.post("/api/match/ask", async (req, res) => {
  if (!featureOn("chat")) return res.status(503).json({ error: "AI chat is temporarily disabled by the admin." });
  const question = String(req.body?.question ?? "").trim();
  if (!question) return res.status(400).json({ error: "question is required" });
  if (question.length > 500) return res.status(400).json({ error: "That question is too long." });
  const b = twoBirths(req, res);
  if (!b) return;

  const auth = await charge(req, res, "ask", "match_chat");
  if (!auth) return;
  try {
    const language = normalizeLanguage(req.body?.language, "en");
    const { base, boy, girl, timing, doshas } = deepLayersFrom(b.boy, b.girl);
    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-6).map((m: any) => ({
          role: m?.role === "assistant" ? "assistant" : "user",
          text: String(m?.text ?? "").slice(0, 1200),
        }))
      : [];
    const out = await answerMatchQuestion({ base, boy, girl, timing, doshas, question, language, history });
    if (!out.answer.trim()) return res.status(502).json({ error: "Jawab poora nahi aaya. Dobara bhejein." });
    const me = identityOf(req as any);
    await recordUsage({ userId: me.userId, deviceId: me.deviceId, action: "ask", meta: { kind: "match" } }).catch(() => {});
    await settleCharge(req, auth.charge, "match_chat", null, { category: "marriage" });
    res.json(out);
  } catch (err: any) {
    console.error("[match-ask] error:", err?.message);
    res.status(500).json({ error: friendlyError(err?.message) });
  }
});

/** POST /api/match/year — "how will it be around <year>?", from both dashas. */
app.post("/api/match/year", async (req, res) => {
  if (!featureOn("match")) return res.status(503).json({ error: "Matching is temporarily disabled." });
  const b = twoBirths(req, res);
  if (!b) return;
  const thisYear = new Date().getFullYear();
  const year = Number(req.body?.year);
  // Bounded to the picker's own range: outside it the dasha data thins out and
  // the answer becomes invention rather than reading.
  if (!Number.isInteger(year) || year < thisYear || year > thisYear + 10) {
    return res.status(400).json({ error: `Pick a year between ${thisYear} and ${thisYear + 10}.` });
  }
  try {
    const language = normalizeLanguage(req.body?.language, "en");
    const { base, boy, girl } = deepLayersFrom(b.boy, b.girl);
    const boyPeriods = periodsInYear(boy, year);
    const girlPeriods = periodsInYear(girl, year);
    const out = await answerMatchYear({ base, boy, girl, year, language, boyPeriods, girlPeriods });
    res.json({ ...out, year, boy_periods: boyPeriods, girl_periods: girlPeriods });
  } catch (err: any) {
    console.error("[match-year] error:", err?.message);
    res.status(500).json({ error: friendlyError(err?.message) });
  }
});

/**
 * POST /api/match/muhurat — wedding dates for THIS couple.
 *
 * Two independent things have to agree. The panchang says whether the day
 * itself is fit for a marriage (Kharmas, Chaturmas, Vivah nakshatra, tithi);
 * the couple's charts say whether they are inside a period that supports one.
 * A date that is both is meaningfully better than a date that is merely
 * panchang-good, and that is the only claim this endpoint makes.
 */
app.post("/api/match/muhurat", async (req, res) => {
  const b = twoBirths(req, res);
  if (!b) return;
  try {
    const months = Math.min(12, Math.max(1, Number(req.body?.months) || 6));
    const latitude = Number(req.body?.latitude ?? 28.6139);
    const longitude = Number(req.body?.longitude ?? 77.209);
    const timezone = String(req.body?.timezone || "Asia/Kolkata");
    const { boy, girl, timing } = deepLayersFrom(b.boy, b.girl);

    const inWindow = (date: string) =>
      timing.overlaps.find((o) => date >= o.from && date <= o.to) ?? null;

    const today = todayIn(timezone);
    const start = new Date(`${today}T00:00:00`);
    const dates: any[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const scan = scanMonth({
        year: d.getFullYear(), month: d.getMonth() + 1,
        latitude, longitude, timezone, ayanamsa: AYANAMSA, activity: "marriage",
      });
      for (const day of scan.days) {
        if (!day.suitable || day.date < today) continue;
        const w = inWindow(day.date);
        dates.push({
          date: day.date, weekday: day.weekday, nakshatra: day.nakshatra,
          tithi: day.tithi, paksha: day.paksha, quality: day.quality,
          // The distinguishing badge: panchang-good AND chart-supported.
          chart_supported: !!w,
          window: w ? { from: w.from, to: w.to, boy_period: w.boy_period, girl_period: w.girl_period } : null,
        });
      }
    }
    // Chart-supported dates first, then the panchang's own ranking, then date.
    const rank = { best: 0, good: 1, ok: 2, avoid: 3 } as Record<string, number>;
    dates.sort((x, y) =>
      (Number(y.chart_supported) - Number(x.chart_supported))
      || ((rank[x.quality] ?? 3) - (rank[y.quality] ?? 3))
      || (x.date < y.date ? -1 : 1));

    res.json({
      months,
      total: dates.length,
      supported: dates.filter((d) => d.chart_supported).length,
      dates: dates.slice(0, 60),
      timing_note: timing.note,
      boy_windows: boy.marriage_windows, girl_windows: girl.marriage_windows,
    });
  } catch (err: any) {
    console.error("[match-muhurat] error:", err?.message);
    res.status(500).json({ error: "Could not scan the calendar." });
  }
});

/* ---- saved matches. Signing in is only needed to KEEP one. ---- */

app.get("/api/match/history", requireAuth, async (req: any, res) => {
  try {
    res.json({ matches: await listMatches(req.user.id) });
  } catch (err: any) {
    console.error("[match-history] list:", err?.message);
    res.status(500).json({ error: "Could not load your saved matches." });
  }
});

app.post("/api/match/history", requireAuth, async (req: any, res) => {
  const b = twoBirths(req, res);
  if (!b) return;
  const result = req.body?.result;
  if (!result || typeof result !== "object") return res.status(400).json({ error: "result is required" });
  try {
    const id = await saveMatch({
      ownerId: req.user.id,
      boyName: String(b.boy.name ?? ""), girlName: String(b.girl.name ?? ""),
      score: Number(result.total) || 0, maxScore: Number(result.max) || 36,
      boyInput: b.boy, girlInput: b.girl, result,
    });
    res.json({ id, saved: !!id });
  } catch (err: any) {
    console.error("[match-history] save:", err?.message);
    res.status(500).json({ error: "Could not save this match." });
  }
});

app.get("/api/match/history/:id", requireAuth, async (req: any, res) => {
  try {
    const row = await getMatch(req.user.id, req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (err: any) {
    console.error("[match-history] get:", err?.message);
    res.status(500).json({ error: "Could not open that match." });
  }
});

app.delete("/api/match/history/:id", requireAuth, async (req: any, res) => {
  try {
    const gone = await deleteMatch(req.user.id, req.params.id);
    if (!gone) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
  } catch (err: any) {
    console.error("[match-history] delete:", err?.message);
    res.status(500).json({ error: "Could not delete that match." });
  }
});

/**
 * POST /api/match/report — the long-form, PDF-able matching report.
 * Takes the same boy/girl birth details as /api/match, recomputes the Ashtakoot
 * (cheap, deterministic) and asks the AI to interpret it in depth.
 */
app.post("/api/match/report", async (req, res) => {
  if (!featureOn("match")) return res.status(503).json({ error: "Matching is temporarily disabled." });

  const vb = validateBirthInput(req.body?.boy);
  const vg = validateBirthInput(req.body?.girl);
  if (!vb.ok || !vb.value) return res.status(400).json({ error: "Invalid groom details", details: vb.errors });
  if (!vg.ok || !vg.value) return res.status(400).json({ error: "Invalid bride details", details: vg.errors });

  try {
    const boy = personMoon(vb.value, AYANAMSA);
    const girl = personMoon(vg.value, AYANAMSA);
    const result = matchKundli(boy, girl);

    const language = typeof req.body?.language === "string" && req.body.language.trim()
      ? req.body.language.trim() : "en";
    const report = await generateMatchReport(result, language);
    if (report?.error) return res.status(502).json(report);

    res.json({ ...report, match: result, generated_at: new Date().toISOString() });
  } catch (err: any) {
    console.error("[match/report] error:", err?.message);
    res.status(500).json({ error: "Could not build the match report" });
  }
});

/**
 * GET /api/panchang?date=YYYY-MM-DD&lat=&lon=&tz=
 * Daily Panchang for a place: tithi, nakshatra, yoga, karana, vara, sunrise/sunset,
 * Rahu Kaal, Yamaganda, Gulika, and day/night Choghadiya.
 */
app.get("/api/panchang", (req, res) => {
  const timezone = String(req.query.tz || "Asia/Kolkata").trim();
  const date = String(req.query.date || "").trim() || todayIn(timezone);
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "lat and lon are required" });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  try {
    res.json(buildPanchang({ date, latitude, longitude, timezone, ayanamsa: AYANAMSA }));
  } catch (err: any) {
    console.error("[panchang] error:", err?.message);
    res.status(500).json({ error: "Panchang failed" });
  }
});

/**
 * POST /api/horoscope { date?, language? }
 * Today's horoscope for all 12 moon signs (one AI call, based on the live sky).
 */
app.post("/api/horoscope", async (req, res) => {
  if (!featureOn("horoscope")) return res.status(503).json({ error: "Daily horoscope is temporarily disabled by the admin." });
  const language = typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "en";
  try {
    // Honour the date the client asked for. The Panchang page's picker sends
    // one, and hardcoding "now" meant picking any other date silently returned
    // today's sky — a horoscope for the wrong day with the right date on it.
    const asked = String(req.body?.date || "").trim();
    const nowIso = /^\d{4}-\d{2}-\d{2}$/.test(asked) && !Number.isNaN(Date.parse(asked))
      ? new Date(`${asked}T12:00:00Z`).toISOString() // midday: the sign-level read is stable across the day
      : new Date().toISOString();
    const tr = computeTransits(nowIso, AYANAMSA);
    const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
    const planets = tr.planet_position.map((p: any) => ({
      planet: p.name, sign: SIGNS[p.rasi.id], retrograde: p.is_retrograde,
    }));
    const context = { date: nowIso.slice(0, 10), transiting_planets: planets };
    const horoscope = await generateDailyHoroscope(context, language);
    if (horoscope?.error) return res.status(502).json(horoscope);
    res.json({ date: context.date, horoscope });
  } catch (err: any) {
    console.error("[horoscope] error:", err?.message);
    const quota = /429|quota|rate limit/i.test(err?.message ?? "");
    res.status(quota ? 429 : 500).json({ error: friendlyError(err?.message) });
  }
});

/** GET /api/muhurat — auspicious time windows for an activity on a date & place. */
app.get("/api/muhurat", (req, res) => {
  const timezone = String(req.query.tz || "Asia/Kolkata").trim();
  const date = String(req.query.date || "").trim() || todayIn(timezone);
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const activity = String(req.query.activity || "general").trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ error: "lat and lon are required" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  try {
    res.json(buildMuhurat({ date, latitude, longitude, timezone, ayanamsa: AYANAMSA, activity }));
  } catch (err: any) {
    console.error("[muhurat] error:", err?.message);
    res.status(500).json({ error: "Muhurat failed" });
  }
});

/** GET /api/muhurat-month?year=&month=&lat=&lon=&tz=&activity= — which dates suit the activity. */
app.get("/api/muhurat-month", (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const timezone = String(req.query.tz || "Asia/Kolkata").trim();
  const activity = String(req.query.activity || "general").trim();
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return res.status(400).json({ error: "valid year & month required" });
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return res.status(400).json({ error: "lat and lon are required" });
  try {
    res.json(scanMonth({ year, month, latitude, longitude, timezone, ayanamsa: AYANAMSA, activity }));
  } catch (err: any) {
    console.error("[muhurat-month] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/yogas — detected classical yogas. */
app.get("/api/chart/:chartId/yogas", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    res.json(detectYogas(chart));
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/ashtakavarga — SAV/BAV bindus. */
app.get("/api/chart/:chartId/ashtakavarga", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    res.json(computeAshtakavarga(chart));
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/alerts — upcoming dasha changes + live transit highlights. */
app.get("/api/chart/:chartId/alerts", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const tr = buildTransit(chart, AYANAMSA, new Date().toISOString());
    res.json({
      current: chart.dasha?.current ?? null,
      upcoming: (chart.dashas?.next_7_years ?? []).slice(0, 6),
      transit_highlights: tr.highlights,
      natal: tr.natal,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/chart/:chartId/today — "Aaj Ka Din": running dasha + today's transit
 * highlights + today's panchang (at the birth place) + a short AI tip.
 */
app.get("/api/chart/:chartId/today", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const b = chart.birth_details || {};
    const tz = b.timezone || "Asia/Kolkata";
    const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date()); // YYYY-MM-DD
    const nowIso = new Date().toISOString();

    // Generate once per day per chart, then serve the cached copy on every refresh
    // (saves AI quota — same "Aaj Ka Din" all day).
    // Language can be overridden per request (the Home card has a picker), so it
    // is part of the cache key — otherwise switching language would keep serving
    // yesterday's English copy.
    // Validated: this value becomes part of a reports cache key, so a
    // free-form string is an unbounded set of cache misses, each one an AI call.
    const lang = normalizeLanguage(req.query.lang, b.language || "en");
    const cacheKey = `today:${todayLocal}:${lang}`;
    const cached = await getReport(req.params.chartId, cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    // Gated AFTER the cache check, so re-reading a generated page is free and
    // only real AI work counts. Without this an authenticated device could
    // spend unbounded AI budget — and three of these honour ?regenerate=1,
    // which skips the cache entirely.
    {
      const over = await checkQuota(req as any, "daily");
      if (over) return res.status(429).json(over);
      const q = identityOf(req as any);
      recordUsage({ userId: q.userId, deviceId: q.deviceId, action: "daily", meta: { surface: "today" } }).catch(() => {});
    }

    const tr = buildTransit(chart, AYANAMSA, nowIso);
    const moonT = tr.planets.find((p: any) => p.planet === "Moon");
    let panchang: any = null;
    try {
      if (Number.isFinite(b.latitude) && Number.isFinite(b.longitude)) {
        const p = buildPanchang({ date: todayLocal, latitude: b.latitude, longitude: b.longitude, timezone: tz, ayanamsa: AYANAMSA });
        panchang = { weekday: p.weekday, tithi: p.tithi, nakshatra: p.nakshatra, sunrise: p.sunrise, sunset: p.sunset, rahu_kaal: p.periods?.rahu_kaal ?? null };
      }
    } catch (e: any) { console.warn("[today] panchang skipped:", e?.message); }

    let tip: string | null = null;
    try {
      const language = lang;
      tip = await generateDailyTip({
        name: b.name, dasha: chart.dasha?.current, moon_transit: moonT ? { sign: moonT.sign, house_from_lagna: moonT.house_from_lagna, house_from_moon: moonT.house_from_moon } : null,
        transit_highlights: tr.highlights, panchang,
      }, language);
    } catch (e: any) { console.warn("[today] tip skipped:", e?.message); }

    const payload = {
      date: todayLocal,
      dasha: chart.dasha?.current ?? null,
      moon_transit: moonT ? { sign: moonT.sign, house_from_lagna: moonT.house_from_lagna, house_from_moon: moonT.house_from_moon } : null,
      transit_highlights: tr.highlights,
      panchang,
      tip,
    };
    // Cache for the day only once the AI tip succeeded (so a failed tip retries later).
    if (tip) {
      try { await insertReport({ chartId: req.params.chartId, report: payload, language: cacheKey }); } catch {}
    }
    res.json(payload);
  } catch (err: any) {
    console.error("[today] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/chart/:chartId/daily-guidance — personalised daily guidance across
 * life areas (career/money/relationship/health/advice via AI) + today's best-time
 * windows (good choghadiya) and caution periods (Rahu Kaal etc). Cached per day.
 */
app.get("/api/chart/:chartId/daily-guidance", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const b = chart.birth_details || {};
    const tz = b.timezone || "Asia/Kolkata";
    const todayLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const nowIso = new Date().toISOString();

    // Honour ?lang and key the cache by it. Without this the page always
    // rendered in the language frozen at chart creation, while the same screen
    // handed the user's CURRENT language to the text-to-speech button — so a
    // Hindi voice read English text aloud.
    const guidanceLang = normalizeLanguage(req.query.lang, b.language || "en");
    const cacheKey = `guidance:${todayLocal}:${guidanceLang}`;
    const cached = await getReport(req.params.chartId, cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    // Gated AFTER the cache check, so re-reading a generated page is free and
    // only real AI work counts. Without this an authenticated device could
    // spend unbounded AI budget — and three of these honour ?regenerate=1,
    // which skips the cache entirely.
    {
      const over = await checkQuota(req as any, "daily");
      if (over) return res.status(429).json(over);
      const q = identityOf(req as any);
      recordUsage({ userId: q.userId, deviceId: q.deviceId, action: "daily", meta: { surface: "daily-guidance" } }).catch(() => {});
    }

    const tr = buildTransit(chart, AYANAMSA, nowIso);
    const moonT = tr.planets.find((p: any) => p.planet === "Moon");

    let panchang: any = null;
    const bestTimes: any[] = [];
    const caution: any[] = [];
    try {
      if (Number.isFinite(b.latitude) && Number.isFinite(b.longitude)) {
        const p = buildPanchang({ date: todayLocal, latitude: b.latitude, longitude: b.longitude, timezone: tz, ayanamsa: AYANAMSA });
        panchang = { weekday: p.weekday, tithi: p.tithi, nakshatra: p.nakshatra, moon_sign: p.moon_sign, sunrise: p.sunrise, sunset: p.sunset };
        for (const c of (p.day_choghadiya || [])) {
          if (c.quality === "good") bestTimes.push({ name: c.name, start: c.start, end: c.end });
        }
        if (p.periods?.rahu_kaal) caution.push({ name: "Rahu Kaal", ...p.periods.rahu_kaal });
        if (p.periods?.yamaganda) caution.push({ name: "Yamaganda", ...p.periods.yamaganda });
      }
    } catch (e: any) { console.warn("[guidance] panchang skipped:", e?.message); }

    // The deterministic day-signals (Tarabala-led, no AI) are the REAL core of
    // the page. They also anchor the AI so its area-by-area cards can't drift
    // from the actual day state.
    let day: any = null;
    try {
      day = buildDaySignals({
        chart, date: todayLocal, tz, lang: guidanceLang, ayanamsa: AYANAMSA, name: b.name,
        latitude: Number.isFinite(b.latitude) ? b.latitude : undefined,
        longitude: Number.isFinite(b.longitude) ? b.longitude : undefined,
      });
    } catch (e: any) { console.warn("[guidance] day-signals skipped:", e?.message); }

    let guidance: any = null;
    try {
      const language = guidanceLang; // the resolved ?lang, not the chart's frozen one
      guidance = await generateDailyGuidance({
        name: b.name,
        // The prompt tells the model to reference this person's exact
        // placements. Without the natal chart here it had none to reference
        // and simply invented them — and two users sharing a dasha lord and
        // Moon house got prompts differing only by their name.
        date: todayLocal,
        chart: buildFullChartContext(chart),
        dasha: chart.dasha?.current,
        moon_transit: moonT ? { sign: moonT.sign, house_from_lagna: moonT.house_from_lagna, house_from_moon: moonT.house_from_moon } : null,
        transit_highlights: tr.highlights,
        panchang: panchang ? { weekday: panchang.weekday, tithi: panchang.tithi, nakshatra: panchang.nakshatra } : null,
        // Anchor the AI to today's actual computed state so it elaborates on
        // the SAME real day, never a generic one.
        day_state: day ? { headline: day.headline, lean: day.lean, factors: day.factors.map((f: any) => f.detail) } : null,
      }, language);
    } catch (e: any) { console.warn("[guidance] AI skipped:", e?.message); }

    const payload = {
      date: todayLocal,
      day,
      dasha: chart.dasha?.current ?? null,
      moon_transit: moonT ? { sign: moonT.sign, house_from_lagna: moonT.house_from_lagna, house_from_moon: moonT.house_from_moon } : null,
      panchang,
      best_times: bestTimes,
      caution_periods: caution,
      guidance,
    };
    if (guidance && !guidance.error) {
      try { await insertReport({ chartId: req.params.chartId, report: payload, language: cacheKey }); } catch {}
    }
    res.json(payload);
  } catch (err: any) {
    console.error("[guidance] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/chart/:chartId/day-signals?date=&lang=&lat=&lon=&tz=
 *
 * The deterministic "how is today, and why" used by the home banner and the
 * chat. NO AI, so no quota and no cache — it is cheap, instant and identical
 * every time, which is the whole point (and lets the phone compute a week of
 * these offline for notifications via the /upcoming sibling).
 *
 * `lat/lon/tz` override the birth place so the best/caution WINDOWS follow where
 * the user is now; the natal signals (dasha, Moon-from-Moon, Sade Sati) are
 * location-independent and always use the chart.
 */
app.get("/api/chart/:chartId/day-signals", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const b = chart.birth_details || {};
    const tz = (typeof req.query.tz === "string" && req.query.tz) || b.timezone || "Asia/Kolkata";
    const lang = normalizeLanguage(req.query.lang, b.language || "en");
    const date =
      typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

    const lat = Number(req.query.lat ?? b.latitude);
    const lon = Number(req.query.lon ?? b.longitude);

    const signals = buildDaySignals({
      chart, date, tz, lang, ayanamsa: AYANAMSA, name: b.name,
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lon) ? lon : undefined,
    });
    res.json(signals);
  } catch (err: any) {
    console.error("[day-signals] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/chart/:chartId/day-plan?lang=&lat=&lon=&tz=&date=
 *
 * The whole-day reading (deterministic, no AI): a 3-4 line morning summary, the
 * full time-ordered timeline, the Rahu-Kaal real-time alert text, and a night
 * recap. Powers the morning/night notifications and the home day-timeline.
 */
app.get("/api/chart/:chartId/day-plan", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const b = chart.birth_details || {};
    const tz = (typeof req.query.tz === "string" && req.query.tz) || b.timezone || "Asia/Kolkata";
    const lang = normalizeLanguage(req.query.lang, b.language || "en");
    const date =
      typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const lat = Number(req.query.lat ?? b.latitude);
    const lon = Number(req.query.lon ?? b.longitude);
    const plan = buildDayPlan({
      chart, date, tz, lang, ayanamsa: AYANAMSA, name: b.name,
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lon) ? lon : undefined,
    });
    res.json(plan);
  } catch (err: any) {
    console.error("[day-plan] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/day-plan/upcoming?days=14&lang= — the app pre-schedules
 *  the morning / night / Rahu-Kaal notifications from this one batch. */
app.get("/api/chart/:chartId/day-plan/upcoming", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const b = chart.birth_details || {};
    const tz = (typeof req.query.tz === "string" && req.query.tz) || b.timezone || "Asia/Kolkata";
    const lang = normalizeLanguage(req.query.lang, b.language || "en");
    const days = Math.max(1, Math.min(21, Number(req.query.days) || 14));
    const lat = Number(req.query.lat ?? b.latitude);
    const lon = Number(req.query.lon ?? b.longitude);
    const plans = buildUpcomingDayPlans({
      chart, tz, lang, ayanamsa: AYANAMSA, name: b.name, days,
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lon) ? lon : undefined,
    });
    res.json(plans);
  } catch (err: any) {
    console.error("[day-plan/upcoming] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/panchang-today?lat=&lon=&tz=&lang=
 *
 * The tiny "aaj kya khaas hai" glance for the Home top-corner chip: today's
 * tithi + the single most notable thing (festival / vrat / Purnima / Sankranti /
 * Sawan Somwar), from the SAME verified hindu-calendar engine the day banner
 * uses. Needs NO chart — panchang is location+date, not birth-chart — so it is
 * public and defaults to Delhi when no coordinates are given (tithi/festival is
 * effectively identical across India for a glance). Deterministic, no AI.
 */
app.get("/api/panchang-today", (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    const latitude = Number.isFinite(lat) ? lat : 28.6139;   // Delhi fallback
    const longitude = Number.isFinite(lon) ? lon : 77.209;
    const tz = (typeof req.query.tz === "string" && req.query.tz) || "Asia/Kolkata";
    const lang = normalizeLanguage(req.query.lang, "en");
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

    const hd = hinduDay(date, latitude, longitude, tz, AYANAMSA);
    const pickTri = (t: any) => (t && (t[lang] ?? t.en)) || "";
    const top = hd.headline;
    res.json({
      date: hd.date,
      weekday: hd.weekday,
      masa: hd.masa,
      paksha: hd.paksha,
      tithi: hd.tithi,
      // the single most notable thing today, already localized — null on an
      // ordinary day (the chip then just shows the tithi).
      special: top ? { key: top.key, kind: top.kind, label: pickTri(top.label) } : null,
    });
  } catch (err: any) {
    console.error("[panchang-today] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/chart/:chartId/day-signals/upcoming?days=7&lang=&lat=&lon=&tz=
 *
 * today .. today+days-1 in one call. The app fetches this while online and then
 * schedules one local notification per day with the real predicted line, so the
 * 8 AM message fires with the app closed and no network. Capped so a bad query
 * can't turn into a month of AI-free-but-still-work computation.
 */
app.get("/api/chart/:chartId/day-signals/upcoming", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const b = chart.birth_details || {};
    const tz = (typeof req.query.tz === "string" && req.query.tz) || b.timezone || "Asia/Kolkata";
    const lang = normalizeLanguage(req.query.lang, b.language || "en");
    const days = Math.min(14, Math.max(1, Number(req.query.days) || 7));
    const startDate = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());

    const lat = Number(req.query.lat ?? b.latitude);
    const lon = Number(req.query.lon ?? b.longitude);

    const list = buildUpcomingDaySignals({
      chart, startDate, days, tz, lang, ayanamsa: AYANAMSA, name: b.name,
      latitude: Number.isFinite(lat) ? lat : undefined,
      longitude: Number.isFinite(lon) ? lon : undefined,
    });
    res.json({ days: list });
  } catch (err: any) {
    console.error("[day-signals/upcoming] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** GET /api/chart/:chartId/remedies — personalised remedies (+ optional AI note). */
app.get("/api/chart/:chartId/remedies", async (req, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const remedies = computeRemedies(chart);
    let note: string | null = null;
    if (req.query.ai !== "false") {
      try {
        note = await generateRemediesNote({ focus: remedies.focus, dasha_lord: remedies.dasha_lord }, chart.birth_details?.language || "en");
      } catch (e: any) { console.warn("[remedies] note skipped:", e?.message); }
    }
    res.json({ ...remedies, note });
  } catch (err: any) {
    console.error("[remedies] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/profiles — the caller's OWN saved charts.
 *
 * Admins used to receive every chart in the database here, which meant their
 * Home screen filled up with strangers' kundlis mixed in with their own. The
 * admin panel is where service-wide data belongs; this is the personal app.
 */
app.get("/api/profiles", async (req: any, res) => {
  try {
    const me = identityOf(req);
    res.json(await listProfiles(me.userId, me.deviceId));
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** DELETE /api/profiles/:chartId — delete a chart (and its profile/cascade). */
app.delete("/api/profiles/:chartId", async (req, res) => {
  try {
    await deleteChart(req.params.chartId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * PUT /api/profiles/:chartId — correct a chart's birth details in place.
 *
 * Exists because a wrong AM/PM moves the Lagna by half a zodiac and, without
 * this, the only remedy was delete-and-retype — while the create screen was
 * telling people they could "correct the time later from Profiles".
 *
 * The chart id is preserved (people have already opened and shared it), which
 * is exactly why `updateChart` clears every cached reading and the chat memory:
 * all of it was computed from the previous birth moment. Ownership is enforced
 * by the global :chartId guard. No quota is charged — fixing a typo is not a
 * new chart.
 */
app.put("/api/profiles/:chartId", async (req, res) => {
  try {
    const v = validateBirthInput(req.body);
    if (!v.ok || !v.value) {
      return res.status(400).json({ error: "Invalid input", details: v.errors });
    }
    const input = v.value;
    const isoDatetime = buildIsoDatetime(input.date_of_birth, input.time_of_birth, input.timezone);

    // Always the local engine: an edit must not depend on a paid provider or
    // spend a credit to fix a typo.
    const local = computeChart({
      datetime: isoDatetime,
      latitude: input.latitude,
      longitude: input.longitude,
      ayanamsa: AYANAMSA,
    });
    const raw = {
      request: { datetime: isoDatetime, latitude: input.latitude, longitude: input.longitude, ayanamsa: AYANAMSA },
      engine: "local",
      planet_position: local.planetPositionData,
      dasha_periods: local.dashaData,
    };
    const { normalized, validationStatus } = normalizeChart({
      birth: input,
      isoDatetime,
      ayanamsa: AYANAMSA,
      planetPositionData: local.planetPositionData,
      birthDetailsData: undefined,
      dashaData: local.dashaData,
      raw,
      provider: "local",
    });

    await updateChart({
      chartId: req.params.chartId,
      birth: input,
      normalized,
      raw,
      validationStatus,
    });
    res.json({ success: true, id: req.params.chartId });
  } catch (err: any) {
    fail(res, 500, "Could not update this kundli. Please try again.", err, "update-chart");
  }
});

/**
 * POST /api/generate-report  (alias: /api/generate-life-report)
 * Generates an AI life report from the SAVED normalized chart only.
 */
async function handleGenerateReport(req: express.Request, res: express.Response) {
  const chartId = req.body?.chartId;
  if (!chartId) return res.status(400).json({ error: "chartId is required" });
  if (!featureOn("reports")) return res.status(503).json({ error: "Life reports are temporarily disabled by the admin." });
  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    if (!canAccessChart(req as any, chart)) {
      return res.status(403).json({ error: "This chart is not available on this account/device." });
    }

    if (String(chart.validation_status || "").startsWith("partial")) {
      return res.status(409).json({
        error: "Chart data is not fully verified; report generation blocked.",
        validation_status: chart.validation_status,
      });
    }

    // Validated, not free-form: this value doubles as a cache key in the same
    // column the other surfaces namespace ("report:career:…"), so an arbitrary
    // string here could read or overwrite one of those slots.
    const requested = req.body?.language;
    const language = isSupportedLanguage(requested)
      ? requested
      : (chart.birth_details?.language || "en");
    const regenerate = req.body?.regenerate === true;
    // Namespaced like the other report kinds so no language value can ever
    // collide with them, and date-bound to the running antardasha so the text
    // refreshes when the astrology it describes actually changes.
    const lifeKey = `life:${language}:${chart.dasha?.current?.antardasha_to || "na"}`;

    // Cache: reuse an existing report for this chart + language so repeat views
    // (or the same person again) are instant and don't re-call the AI.
    if (!regenerate) {
      const cached = await getReport(chartId, lifeKey);
      // Tidied on the way OUT as well as in. Reports written before the
      // one-bold-per-paragraph rule existed are already in the database, and a
      // person re-opening the report they paid for should see the fixed page,
      // not the shouting one they saw last week.
      if (cached) return res.json({ ...tidyReport(cached), cached: true });
    }

    /*
     * "Make me a PDF" must never become "spend 29 credits generating a report".
     * The chat asks with cached_only, so if there is nothing to turn into a PDF
     * yet it is told so and can say "generate the report first" — rather than
     * quietly buying one on the person's behalf because they asked for a file.
     */
    if (req.body?.cached_only === true) {
      return res.status(404).json({ error: "No life report has been generated for this chart yet." });
    }

    // Only a report we actually have to GENERATE counts against the quota — a
    // cached one costs nothing, so re-reading your own report is always free.
    const auth = await charge(req, res, "report", "life_report");
    if (!auth) return;
    const me = identityOf(req as any);
    recordUsage({ userId: me.userId, deviceId: me.deviceId, action: "report", meta: { chartId, language } }).catch(() => {});

    // Live transit gives the report's present/future sections real timing.
    let transit: any = null;
    try {
      transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString()));
    } catch (e: any) {
      console.warn("[generate-report] transit skipped:", e?.message);
    }

    const report = await generateLifeReport(chart, language, transit);
    if (report?.error) return res.status(502).json(report);

    await insertReport({ chartId, report, language: lifeKey });
    // Charged only now, with the report written.
    await settleCharge(req, auth.charge, "life_report", chartId, { category: "life" });
    res.json(report);
  } catch (err: any) {
    console.error("[generate-report] error:", err?.message);
    const quota = /429|quota|rate limit/i.test(err?.message ?? "");
    res.status(quota ? 429 : 500).json({ error: friendlyError(err?.message) });
  }
}
/**
 * GET /api/chart/:chartId/past — the checkable half of a reading.
 *
 * Charged as a report, because it is one: the same AI cost, and it is the
 * section people say made them believe the rest. Cached on the chart so
 * reopening it is free and, more importantly, so it says the SAME thing twice —
 * a past that rewords itself between visits is not a past.
 */
app.get("/api/chart/:chartId/past", async (req: any, res) => {
  if (!featureOn("reports")) return res.status(503).json({ error: "Reports are temporarily disabled." });
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    const language = normalizeLanguage(req.query.lang, chart.birth_details?.language || "en");
    const periods = pastMilestones(chart);
    if (!periods.length) {
      return res.json({ timeline: [], note: "There is not enough lived history in this chart yet." });
    }

    const key = `past:${language}:${periods.length}:${periods[0]?.from ?? ""}`;
    if (req.query.regenerate !== "1") {
      const cached = await getReport(req.params.chartId, key);
      if (cached) return res.json({ ...tidyReport(cached), cached: true });
    }

    const auth = await charge(req, res, "report", "life_report");
    if (!auth) return;
    const me = identityOf(req as any);
    await recordUsage({ userId: me.userId, deviceId: me.deviceId, action: "report", meta: { kind: "past" } }).catch(() => {});

    const out = await generatePastTimeline({ chart, periods, language });
    if (!out.timeline.length) return res.status(502).json({ error: "Could not build the timeline. Please try again." });

    await insertReport({ chartId: req.params.chartId, report: out, language: key });
    await settleCharge(req, auth.charge, "life_report", req.params.chartId, { category: "past" });
    res.json(out);
  } catch (err: any) {
    console.error("[past-timeline] error:", err?.message);
    res.status(500).json({ error: friendlyError(err?.message) });
  }
});

app.post("/api/generate-report", handleGenerateReport);
app.post("/api/generate-life-report", handleGenerateReport);

/**
 * GET /api/chart/:chartId/report/:type — a focused premium report
 * (career | wealth | marriage | annual | mahadasha). Cached per chart+type.
 * ?regenerate=1 forces a fresh generation.
 */
app.get("/api/chart/:chartId/report/:type", async (req, res) => {
  const { chartId, type } = req.params;
  if (!REPORT_TYPES[type]) return res.status(400).json({ error: "Unknown report type" });
  if (!featureOn("reports")) return res.status(503).json({ error: "Reports are temporarily disabled." });
  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });

    const language = normalizeLanguage(req.query.lang, chart.birth_details?.language || "en");
    // Keyed on when the running antardasha ENDS, so the cache invalidates
    // itself exactly when the astrology changes. Without the date the report
    // was cached forever, and kept describing a "current phase" belonging to a
    // dasha that had finished months earlier.
    const cacheKey = `report:${type}:${language}:${chart.dasha?.current?.antardasha_to || "na"}`;
    if (req.query.regenerate !== "1") {
      const cached = await getReport(chartId, cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    // Gated after the cache check so re-reading a generated report is free and
    // only real AI work counts — but OUTSIDE the regenerate branch, because
    // ?regenerate=1 skips the cache entirely and is exactly the path that
    // needs a ceiling.
    const auth = await charge(req, res, "report", "report");
    if (!auth) return;
    {
      const q = identityOf(req as any);
      recordUsage({ userId: q.userId, deviceId: q.deviceId, action: "report", meta: { surface: "report" } }).catch(() => {});
    }

    let transit: any = null;
    try { transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString())); }
    catch (e: any) { console.warn("[report] transit skipped:", e?.message); }

    const report = await generateFocusedReport(chart, type, language, transit);
    if (report?.error) return res.status(502).json(report);

    const payload = { type, ...report, birth_details: chart.birth_details, generated_at: new Date().toISOString() };
    try { await insertReport({ chartId, report: payload, language: cacheKey }); } catch {}
    // Charged only now, with the report in hand. An AI call that failed above
    // returned before this line, so a failure never costs anyone a credit.
    await settleCharge(req, auth.charge, "report", chartId, { category: type });
    res.json(payload);
  } catch (err: any) {
    console.error("[report] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * GET /api/right-now?lat=&lon=&tz=&activity=
 * "Should I do this right now?" — instant, deterministic, no AI. Meant to be
 * opened many times a day, so it must answer immediately and never disagree
 * with itself between two checks a minute apart.
 */
app.get("/api/right-now", (req, res) => {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const timezone = String(req.query.tz || "Asia/Kolkata").trim();
  const activity = String(req.query.activity || "general").trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return res.status(400).json({ error: "lat and lon are required" });
  }
  try {
    const now = new Date();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
    const nowHHMM = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now);

    // atInstant: the vara runs sunrise-to-sunrise, so before sunrise this is
    // still yesterday's weekday — and Rahu Kaal / choghadiya key off it.
    const panchang = buildPanchang({ date, latitude, longitude, timezone, ayanamsa: AYANAMSA, atInstant: new Date() });
    const result = buildRightNow(panchang, nowHHMM, activity);
    res.json({
      ...result,
      activities: Object.entries(ACTIVITIES).map(([k, v]) => ({ key: k, label: v.label })),
      panchang: { tithi: panchang.tithi, nakshatra: panchang.nakshatra, weekday: panchang.weekday },
    });
  } catch (err: any) {
    fail(res, 500, "Could not read the current timing.", err, "right-now");
  }
});

/**
 * GET /api/chart/:chartId/today-plan
 * "What should I do today?" answered in a FRIEND's voice — chart + live sky +
 * the current timing window, with every astrology word stripped out. Cached per
 * chart per day so it doesn't change between two checks.
 */
app.get("/api/chart/:chartId/today-plan", async (req, res) => {
  const { chartId } = req.params;
  if (!featureOn("chat")) return res.status(503).json({ error: "Guidance is temporarily disabled." });
  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });

    const b = chart.birth_details || {};
    const tz = b.timezone || "Asia/Kolkata";
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
    const language = normalizeLanguage(req.query.lang, b.language || "en");

    const cacheKey = `plan:${today}:${language}`;
    if (req.query.regenerate !== "1") {
      const cached = await getReport(chartId, cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    // Gated after the cache check so re-reading a generated page is free and
    // only real AI work counts — but OUTSIDE the regenerate branch, because
    // ?regenerate=1 skips the cache entirely and is exactly the path that
    // needs a ceiling.
    {
      const over = await checkQuota(req as any, "daily");
      if (over) return res.status(429).json(over);
      const q = identityOf(req as any);
      recordUsage({ userId: q.userId, deviceId: q.deviceId, action: "daily", meta: { surface: "today-plan" } }).catch(() => {});
    }

    // Same timing signal the Right Now card uses, so the two never disagree.
    let window = { verdict: "go", current: "", nextGood: null as string | null };
    try {
      if (Number.isFinite(b.latitude) && Number.isFinite(b.longitude)) {
        const nowHHMM = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date());
        const p = buildPanchang({ date: today, latitude: b.latitude, longitude: b.longitude, timezone: tz, ayanamsa: AYANAMSA, atInstant: new Date() });
        const rn = buildRightNow(p, nowHHMM, "general");
        window = {
          verdict: rn.verdict,
          current: rn.current?.name ?? "",
          nextGood: rn.next_good ? `${rn.next_good.start}–${rn.next_good.end}` : null,
        };
      }
    } catch (e: any) { console.warn("[today-plan] window skipped:", e?.message); }

    let transit: any = null;
    try { transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString())); }
    catch (e: any) { console.warn("[today-plan] transit skipped:", e?.message); }

    const advice: any = await generateFriendAdvice({
      chart, transit, window, language,
      userName: b.name?.split(" ")?.[0] || "",
    });
    if (advice?.error) return res.status(502).json(advice);

    const payload = { ...advice, date: today, language, generated_at: new Date().toISOString() };
    try { await insertReport({ chartId, report: payload, language: cacheKey }); } catch {}
    res.json(payload);
  } catch (err: any) {
    fail(res, 500, "Could not build today's plan.", err, "today-plan");
  }
});

// GET /api/chart/:chartId/timeline?range=month|quarter|year|long
// Personal life-timeline / forecast, grounded on real dasha windows. Cached per
// range per day (a forecast shouldn't churn on every open).
app.get("/api/chart/:chartId/timeline", async (req, res) => {
  const { chartId } = req.params;
  const range = typeof req.query.range === "string" && TIMELINE_RANGES[req.query.range]
    ? req.query.range : "year";
  if (!featureOn("reports")) return res.status(503).json({ error: "Forecasts are temporarily disabled." });
  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });

    const language = normalizeLanguage(req.query.lang, chart.birth_details?.language || "en");
    const today = todayIn(chart.birth_details?.timezone);
    const cacheKey = `timeline:${range}:${today}:${language}`;
    if (req.query.regenerate !== "1") {
      const cached = await getReport(chartId, cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    // Gated after the cache check so re-reading a generated page is free and
    // only real AI work counts — but OUTSIDE the regenerate branch, because
    // ?regenerate=1 skips the cache entirely and is exactly the path that
    // needs a ceiling.
    // A five-year forecast is a deep reading, not a daily glance: the trial caps
    // it separately and CREDIT_PRICES has always carried a price for it. It sat
    // in the everyday bucket, so that price was never charged — the same
    // dead code the rest of the credit system was in. It shares the deep-reading
    // allowance with the reports, and costs credits after that.
    const auth = await charge(req, res, "report", "timeline");
    if (!auth) return;
    {
      const q = identityOf(req as any);
      recordUsage({ userId: q.userId, deviceId: q.deviceId, action: "report", meta: { surface: "timeline" } }).catch(() => {});
    }

    let transit: any = null;
    try { transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString())); }
    catch (e: any) { console.warn("[timeline] transit skipped:", e?.message); }

    const timeline = await generateLifeTimeline(chart, range, language, transit);
    if (timeline?.error) return res.status(502).json(timeline);

    const payload = { ...timeline, birth_details: chart.birth_details, generated_at: new Date().toISOString() };
    try { await insertReport({ chartId, report: payload, language: cacheKey }); } catch {}
    // Charged only now, with the forecast written.
    await settleCharge(req, auth.charge, "timeline", chartId, { category: "timeline" });
    res.json(payload);
  } catch (err: any) {
    console.error("[timeline] error:", err?.message);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * POST /api/chat  (alias: /api/ask-question)
 * Detects the question category, builds a relevant chart packet from the saved
 * normalized chart, asks Gemini, and persists the exchange.
 */
async function handleChat(req: express.Request, res: express.Response) {
  const chartId = req.body?.chartId;
  const question = req.body?.question;
  if (!chartId || !question) {
    return res.status(400).json({ error: "chartId and question are required" });
  }
  if (!featureOn("chat")) return res.status(503).json({ error: "AI chat is temporarily disabled by the admin." });
  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    if (!canAccessChart(req as any, chart)) {
      return res.status(403).json({ error: "This chart is not available on this account/device." });
    }

    if (String(chart.validation_status || "").startsWith("partial")) {
      return res.status(409).json({
        error: "Chart data is not fully verified; chat is blocked.",
        validation_status: chart.validation_status,
      });
    }

    const auth = await charge(req, res, "ask", "chat");
    if (!auth) return;
    const asker = identityOf(req as any);
    recordUsage({ userId: asker.userId, deviceId: asker.deviceId, action: "ask", meta: { chartId } }).catch(() => {});

    // Chat language is chosen in the chat UI per message (default English),
    // independent of the language the chart was created with.
    const language =
      typeof req.body?.language === "string" && req.body.language.trim()
        ? req.body.language.trim()
        : "en";
    const category = detectCategory(question);
    // Which chat surface this belongs to. Keeps Ask AI / Sectors / Transit chats
    // completely separate so messages never leak between them.
    const allowed = ["ask", "sector", "transit"];
    const context = allowed.includes(req.body?.context) ? req.body.context : "ask";

    // Live transit so the PRESENT and FUTURE phases of the answer use real gochar.
    let transit: any = null;
    try {
      transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString()));
    } catch (e: any) {
      console.warn("[chat] transit skipped:", e?.message);
    }

    await insertChatMessage({ chartId, role: "user", message: question, context });
    const answer = await answerQuestion({
      chart,
      question,
      language,
      category,
      transit,
      mode: context === "transit" ? "transit" : "general",
    });
    await insertChatMessage({
      chartId,
      role: "assistant",
      message: answer,
      context,
      responseJson: { category },
    });

    // Charged only now, with the answer in hand — an AI call that failed
    // returned above, so a failure never costs anyone a credit.
    await settleCharge(req, auth.charge, "chat", chartId);
    res.json({ answer, category });
  } catch (err: any) {
    console.error("[chat] error:", err?.message);
    const quota = /429|quota|rate limit/i.test(err?.message ?? "");
    res.status(quota ? 429 : 500).json({ error: friendlyError(err?.message) });
  }
}
app.post("/api/chat", handleChat);
app.post("/api/ask-question", handleChat);

/**
 * POST /api/chat/universal — the ONE chat.
 *
 * One entry point for everything the five old chats did: it auto-detects the
 * topic, grounds "today/tomorrow" questions in the deterministic day-signals,
 * can answer "how does this feature work" from the app guide, and returns a
 * CLEAR answer plus a separate REASON the UI hides behind a tap. No persona
 * picker, no four-phase essay — that structure was the friction users hit.
 */
const TODAY_RE = /\b(today|aaj|tonight|abhi)\b/i;
const TOMORROW_RE = /\b(tomorrow|kal|agle din)\b/i;
// "pichhle 5 saal", "past few years", "beete saal", "last 3 years" → the past.
const PAST_RE = /\b(pichh?le|pichh?li|beete|beeta|guzre|past|last|previous|ab tak)\b[^?]{0,25}\b(saal|sal|years?|varsh|mahine|months?)\b/i;
// "aap kya kya kar sakte ho" is the most common opening question and the one
// most likely to be answered vaguely, so it routes to the real feature list
// rather than to the model's imagination.
const APP_RE = /\b(app|feature|button|screen|kaise (use|kaam)|kaam kaise|how (do|to)|use kaise|option|setting|notif|kya kar sakte|kya kya kar|kya karte ho|what can you|who are you|tum kaun|aap kaun|kya kar sakta|kya bata sakte|help me with|madad)/i;

app.post("/api/chat/universal", async (req, res) => {
  const chartId = req.body?.chartId;
  const question = req.body?.question;
  if (!chartId || !question) return res.status(400).json({ error: "chartId and question are required" });
  if (!featureOn("chat")) return res.status(503).json({ error: "AI chat is temporarily disabled by the admin." });
  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    if (!canAccessChart(req as any, chart)) {
      return res.status(403).json({ error: "This chart is not available on this account/device." });
    }
    if (String(chart.validation_status || "").startsWith("partial")) {
      return res.status(409).json({ error: "Chart data is not fully verified; chat is blocked.", validation_status: chart.validation_status });
    }

    const auth = await charge(req, res, "ask", "chat");
    if (!auth) return;
    // Counted against the free allowance only once a real answer is delivered
    // (below, beside the charge). Recorded here, a "hi", a distress reply or a
    // one-tap clarifying question each used up one of five free questions
    // while costing nothing and answering nothing.
    const asker = identityOf(req as any);

    const language = typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "en";
    const category = detectCategory(question);

    // Live transit for present/future grounding.
    let transit: any = null;
    try { transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString())); }
    catch (e: any) { console.warn("[chat-u] transit skipped:", e?.message); }

    // If they asked about today/tomorrow, hand the model the SAME computed
    // day-signals the banner and notification use — so the chat can never
    // disagree with them.
    let dayContext: any = null;
    try {
      const b = chart.birth_details || {};
      const tz = b.timezone || "Asia/Kolkata";
      const wantTomorrow = TOMORROW_RE.test(question);
      if (wantTomorrow || TODAY_RE.test(question)) {
        const base = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
        const [yy, mm, dd] = base.split("-").map(Number);
        const date = wantTomorrow ? new Date(Date.UTC(yy, mm - 1, dd + 1)).toISOString().slice(0, 10) : base;
        const sig = buildDaySignals({
          chart, date, tz, lang: language, ayanamsa: AYANAMSA, name: b.name,
          latitude: Number.isFinite(b.latitude) ? b.latitude : undefined,
          longitude: Number.isFinite(b.longitude) ? b.longitude : undefined,
        });
        dayContext = { date: sig.date, when: wantTomorrow ? "tomorrow" : "today", lean: sig.lean, headline: sig.headline, factors: sig.factors.map((f) => f.detail) };
      }
    } catch (e: any) { console.warn("[chat-u] day-signals skipped:", e?.message); }

    // Recent turns, with the hidden REASON stripped back off before the model
    // sees them — the model should continue from the plain answers.
    const raw = await getChatHistory(chartId, "chat");
    const history = raw.slice(-8).map((m) => ({
      role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant",
      text: String(m.message || "").split("\n<<REASON>>\n")[0],
    }));
    // Follow-ups it has already offered. Without these the model cannot tell it
    // is repeating itself, and it did: two consecutive answers suggested the
    // same question with one word changed, which reads as a script rather than
    // a conversation.
    const suggested = Array.from(new Set(
      raw.slice(-6)
        .flatMap((m: any) => (Array.isArray(m.response_json?.next) ? m.response_json.next : []))
        .map((x: any) => String(x)),
    )).slice(-8);

    await insertChatMessage({ chartId, role: "user", message: question, context: "chat" });
    // First name only — enough for the astrologer to address them warmly and to
    // never ask "who are you?" (it already has their whole chart). Full names are
    // more personal data than the model needs.
    const userName = String(chart.birth_details?.name || "").trim().split(/\s+/)[0] || undefined;
    // Some questions are not astrology questions. A severe one never reaches a
    // model: a fixed reply with real numbers goes back, and it is not charged.
    const distress = distressLevel(question);
    if (distress === "severe") {
      const { answer, next } = severeReply(language, userName);
      await insertChatMessage({ chartId, role: "user", message: question, context: "chat" });
      await insertChatMessage({ chartId, role: "assistant", message: answer, context: "chat", responseJson: { category: "wellbeing", next } });
      console.log("[chat-u] severe distress — fixed reply, not charged");
      return res.json({ answer, reason: "", category: "wellbeing", next });
    }

    /*
     * "hi" is not a question, and it was being answered with six lines about
     * Shani in the lagna. Someone opening with a hello wants to be greeted and
     * shown where to start — a wall of interpretation before they have asked
     * anything reads as a machine emptying itself.
     *
     * Answered here rather than by a model: three short lines, their chart as
     * a card, and a few things they might actually want to know. No AI call, no
     * credit, no latency — and it cannot drift into an essay on a bad day.
     */
    if (isGreetingOnly(question)) {
      const g = greetingReply(language, userName);
      await insertChatMessage({ chartId, role: "user", message: question, context: "chat" });
      await insertChatMessage({
        chartId, role: "assistant", message: g.answer, context: "chat",
        responseJson: { category: "greeting", next: g.next, card: "chart" },
      });
      return res.json({ answer: g.answer, reason: "", category: "greeting", next: g.next, card: "chart" });
    }

    // What earlier conversations established. This was read only by the
    // astrologer personas, so the main chat forgot everything between visits
    // and made people repeat themselves — the single most "this thing doesn't
    // know me" thing an assistant can do.
    const memory = await getChatMemory(chartId).catch(() => "");
    // Their first question decides whether they come back, so the prompt is
    // told when it is one.
    const isFirst = history.filter((h) => h.role === "user").length === 0;
    // What they have told us about their own life. This outranks the chart in
    // the prompt, which is the difference between a reading and a contradiction.
    const knownFacts = await getChartFacts(chartId).catch(() => ({}));

    /*
     * Rishta: when the question is about the two of them, the linked person's
     * REAL chart and the computed match go in with it, so "kya wo mujhse shaadi
     * karega?" is read from both kundlis instead of guessed from one. Their
     * birth details never reach the model — only the calculated summary.
     * The link itself is bookkeeping, not a fact about their life, so it is
     * kept out of the fact list the model sees.
     */
    const { partner_chart_id: relId, partner_relation: relKind, partner_name: relName, ...lifeFacts } = knownFacts as any;
    let relation: any = undefined;
    const qLower = String(question).toLowerCase();
    const aboutThem = category === "marriage" || category === "relationship"
      || (relName && qLower.includes(String(relName).toLowerCase()))
      || /(partner|pati|patni|husband|wife|boyfriend|girlfriend|\bbf\b|\bgf\b|crush|\bex\b|shaadi|shadi|rishta|rishte|pyaar|pyar|love|marriage|relationship)/i.test(qLower);
    if (relId && aboutThem) {
      try {
        const other = await getNormalizedChart(String(relId));
        if (other && canAccessChart(req as any, other)) {
          const a = validateBirthInput(chart.birth_details);
          const b = validateBirthInput(other.birth_details);
          const match = a.ok && a.value && b.ok && b.value
            ? matchKundli(personMoon(a.value, AYANAMSA), personMoon(b.value, AYANAMSA))
            : null;
          const s = other.summary ?? {};
          relation = {
            relation: relKind || "partner",
            name: relName || String(other.birth_details?.name || "").trim().split(/\s+/)[0],
            their_chart: { lagna: s.lagna, moon_sign: s.rashi, nakshatra: s.nakshatra, mahadasha: s.current_mahadasha, antardasha: s.current_antardasha },
            match,
          };
        }
      } catch (e: any) { console.warn("[chat-u] relation skipped:", e?.message); }
    }

    /*
     * Some questions cannot be answered honestly without one more fact, and
     * whether to ask is decided HERE rather than by the model. Three separate
     * prompt instructions — a rule in the list, the age on its own line above
     * the question, an explicit NOT-KNOWN block beside the known facts — each
     * failed to stop a flat wedding date going to someone whose marital status
     * nobody had ever asked about. A constraint that has to hold every single
     * time does not belong in a prompt.
     *
     * Free: no model call, no credit, no waiting. Their tapped answer returns
     * through the ordinary path, is recorded as a fact, and is never asked for
     * again — so this costs one exchange, once, and improves every later
     * reading.
     */
    const need = whatToAsk(question, knownFacts);
    if (need) {
      const c = clarifyReply(need, language, userName);
      await insertChatMessage({ chartId, role: "user", message: question, context: "chat" });
      await insertChatMessage({
        chartId, role: "assistant", message: c.answer, context: "chat",
        responseJson: { category: "clarify", next: c.next },
      });
      console.log("[chat-u] asked for", need, "— not charged");
      return res.json({ answer: c.answer, reason: "", category: "clarify", next: c.next });
    }

    // A question about the past gets the periods actually lived through, the
    // way a question about today gets the day's computed signals.
    let pastContext: any = undefined;
    if (PAST_RE.test(question)) {
      const n = Number(question.match(/(\d{1,2})\s*(?:saal|sal|years?|varsh)/i)?.[1]) || 5;
      pastContext = recentPastPeriods(chart, Math.min(20, Math.max(1, n)));
    }

    const { answer, reason, next, action, facts } = await answerUniversal({
      chart, question, language, category, transit, dayContext, pastContext,
      appGuide: APP_RE.test(question) ? APP_GUIDE : undefined,
      history, userName, memory, isFirst, suggested, facts: lifeFacts, relation,
    });

    // A low-distress message still gets its real answer — it is their chart and
    // they asked about it — with one line saying help exists.
    const finalAnswer = distress === "low" ? answer + lowNote(language) : answer;

    if (!answer || !answer.trim()) {
      // An empty bubble is worse than an error: it looks like the app broke and
      // it would still have cost a credit below.
      return res.status(502).json({ error: "Jawab poora nahi aaya. Dobara bhejein." });
    }

    /*
     * Drop any suggestion it has already made. The prompt is told not to repeat
     * one and it repeated them anyway — after answering "main married hoon" it
     * still offered "Main married hoon" as the next thing to tap. Telling a
     * model not to repeat itself is not the same as it not repeating itself,
     * which is the lesson this file has now learned four times.
     */
    const seen = new Set(suggested.map((s) => s.trim().toLowerCase()));
    const fresh = (next ?? []).filter((n) => !seen.has(String(n).trim().toLowerCase()));

    // Store answer + reason together behind the same marker, so a reload can
    // split them exactly like a live reply (no schema change needed).
    const stored = reason ? `${finalAnswer}\n<<REASON>>\n${reason}` : finalAnswer;
    await insertChatMessage({ chartId, role: "assistant", message: stored, context: "chat", responseJson: { category, next: fresh, action } });

    // Charged only now, with the answer in hand — an AI call that failed
    // returned above, so a failure never costs anyone a credit.
    // Awaited, so the app's "N free questions left" re-read right after this
    // reply already sees it — fire-and-forget left the meter one behind.
    await recordUsage({ userId: asker.userId, deviceId: asker.deviceId, action: "ask", meta: { chartId, surface: "universal" } }).catch(() => {});
    await settleCharge(req, auth.charge, "chat", chartId, { category });
    res.json({ answer: finalAnswer, reason, category, next: fresh, action: action || undefined });

    // Bookkeeping AFTER responding — remembering this turn must never make the
    // person wait for their reply.
    // Anything they just confirmed about their life is written down, so it can
    // never be asked for again or argued with by a later reading. Newest wins.
    if (facts && Object.keys(facts).length) {
      mergeChartFacts(chartId, facts)
        .then(() => console.log("[chat-u] facts recorded:", Object.keys(facts).join(", ")))
        .catch((e) => console.warn("[chat-u] fact merge skipped:", e?.message));
    }

    updateChatNotes({ existingNotes: memory, question, reply: answer })
      .then((notes) => (notes && notes !== memory ? saveChatMemory(chartId, notes) : undefined))
      .catch((e) => console.warn("[chat-u] memory update skipped:", e?.message));
  } catch (err: any) {
    console.error("[chat-u] error:", err?.message);
    const quota = /429|quota|rate limit/i.test(err?.message ?? "");
    res.status(quota ? 429 : 500).json({ error: friendlyError(err?.message) });
  }
});

/*
 * Rishta — one other person linked to this chart, so the chat can answer about
 * the two of them from BOTH real charts. Stored as facts on the person's own
 * chart; the other kundli must be one of their own saved charts, so ownership
 * is checked on both (the :chartId guard covers the first).
 */
const RELATIONS = ["partner", "spouse", "crush", "ex", "friend", "family"];

app.get("/api/chat/relation/:chartId", async (req: any, res) => {
  const facts: any = await getChartFacts(req.params.chartId).catch(() => ({}));
  const otherId = String(facts.partner_chart_id || "");
  if (!otherId) return res.json({ linked: false });
  const other = await getNormalizedChart(otherId).catch(() => null);
  if (!other || !canAccessChart(req, other)) return res.json({ linked: false });
  res.json({
    linked: true, chartId: otherId, relation: facts.partner_relation || "partner",
    name: String(other.birth_details?.name || "").trim().split(/\s+/)[0] || "",
  });
});

app.post("/api/chat/relation", async (req: any, res) => {
  const chartId = String(req.body?.chartId ?? "");
  const otherId = String(req.body?.otherChartId ?? "");
  const relation = RELATIONS.includes(req.body?.relation) ? req.body.relation : "partner";
  if (!chartId || !otherId || chartId === otherId) return res.status(400).json({ error: "Choose someone other than yourself." });
  const [mine, other] = await Promise.all([getNormalizedChart(chartId), getNormalizedChart(otherId)]);
  if (!mine || !other) return res.status(404).json({ error: "Chart not found" });
  if (!canAccessChart(req, mine) || !canAccessChart(req, other)) {
    return res.status(403).json({ error: "This chart is not available on this account/device." });
  }
  const name = String(other.birth_details?.name || "").trim().split(/\s+/)[0] || "";
  await mergeChartFacts(chartId, { partner_chart_id: otherId, partner_relation: relation, partner_name: name });
  res.json({ linked: true, chartId: otherId, relation, name });
});

app.delete("/api/chat/relation/:chartId", async (req, res) => {
  await removeChartFacts(req.params.chartId, ["partner_chart_id", "partner_relation", "partner_name"]);
  res.json({ linked: false });
});

/** GET /api/chat/followup/:chartId — asks after their last topic. No AI, no credit. */
app.get("/api/chat/followup/:chartId", async (req: any, res) => {
  try {
    const chart = await getNormalizedChart(req.params.chartId);
    if (!chart) return res.json({ followup: null });
    const rows = await getChatHistory(req.params.chartId, "chat");
    const lang = typeof req.query.lang === "string" ? req.query.lang : "en";
    const name = String(chart.birth_details?.name || "").trim().split(/\s+/)[0] || undefined;
    res.json({ followup: followupFor(rows as any[], lang, name) });
  } catch {
    res.json({ followup: null });
  }
});

/** GET /api/astrologers — the 5 AI-astrologer personas (display data only). */
app.get("/api/astrologers", (_req, res) => res.json(publicAstrologers()));

/**
 * POST /api/consult — a WhatsApp-style reply from one AI astrologer persona.
 * Same kundli engine as /api/chat; the persona only changes voice + focus. Each
 * astrologer keeps its OWN history per chart (context = "astro:<id>").
 */
async function handleConsult(req: express.Request, res: express.Response) {
  const chartId = req.body?.chartId;
  const question = req.body?.question;
  const astrologer = req.body?.astrologer;
  if (!chartId || !question) return res.status(400).json({ error: "chartId and question are required" });
  if (!isAstrologerId(astrologer)) return res.status(400).json({ error: "Unknown astrologer." });
  if (!featureOn("chat")) return res.status(503).json({ error: "AI consultation is temporarily disabled by the admin." });

  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    if (!canAccessChart(req as any, chart)) {
      return res.status(403).json({ error: "This chart is not available on this account/device." });
    }
    if (String(chart.validation_status || "").startsWith("partial")) {
      return res.status(409).json({ error: "Chart data is not fully verified; consultation is blocked.", validation_status: chart.validation_status });
    }

    const auth = await charge(req, res, "ask", "chat");
    if (!auth) return;
    const me = identityOf(req as any);
    recordUsage({ userId: me.userId, deviceId: me.deviceId, action: "ask", meta: { chartId, astrologer } }).catch(() => {});

    const language = typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "en";
    const persona = ASTROLOGERS[astrologer];
    const context = `astro:${astrologer}`;

    let transit: any = null;
    try { transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString())); }
    catch (e: any) { console.warn("[consult] transit skipped:", e?.message); }

    // Recent turns of THIS consultation → persona memory (no repeated answers).
    const priorRaw = await getChatHistory(chartId, context).catch(() => []);
    const history = (priorRaw as any[]).slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      text: m.response_json?.bubbles ? (m.response_json.bubbles as string[]).join(" ") : (m.message ?? ""),
    }));

    // Long-term memory: what previous conversations established about them,
    // shared across ALL astrologers so they don't each start from zero.
    const memory = await getChatMemory(chartId).catch(() => "");

    await insertChatMessage({ chartId, role: "user", message: question, context });
    const bubbles = await answerAsAstrologer({
      chart, question, language, transit, memory,
      // First name only — enough for a warm address, and without it the model
      // was writing a literal "[Name]" placeholder into the reply.
      userName: chart.birth_details?.name?.split(" ")?.[0] || "",
      personaPrompt: astrologerPrompt(astrologer),
      focusCategory: persona.focusCategory === "general" ? detectCategory(question) : (persona.focusCategory as any),
      history,
    });
    await insertChatMessage({ chartId, role: "assistant", message: bubbles.join("\n"), context, responseJson: { bubbles, astrologer } });

    // Charged only now, with the answer in hand — an AI call that failed
    // returned above, so a failure never costs anyone a credit.
    await settleCharge(req, auth.charge, "chat", chartId);
    res.json({ bubbles, astrologer, disclaimer: persona.disclaimer ?? null });

    // Refresh the long-term notes AFTER responding — this is bookkeeping, so it
    // must never make the user wait for their reply.
    updateChatNotes({ existingNotes: memory, question, reply: bubbles.join(" ") })
      .then((notes) => (notes && notes !== memory ? saveChatMemory(chartId, notes) : undefined))
      .catch((e) => console.warn("[consult] memory update skipped:", e?.message));
  } catch (err: any) {
    console.error("[consult] error:", err?.message);
    const quota = /429|quota|rate limit/i.test(err?.message ?? "");
    res.status(quota ? 429 : 500).json({ error: friendlyError(err?.message) });
  }
}
app.post("/api/consult", handleConsult);

/**
 * POST /api/consult/intro — the astrologer's opening greeting for a fresh
 * consultation (Namaste + a plain-language read of the D1 + "what would you like
 * to know?"). Free (does not count against the ask quota). The client should
 * only call this when there is no prior history for this astrologer, and it also
 * renders the D1 chart alongside these bubbles.
 */
app.post("/api/consult/intro", async (req: any, res) => {
  const { chartId, astrologer } = req.body ?? {};
  if (!chartId || !isAstrologerId(astrologer)) return res.status(400).json({ error: "chartId and astrologer are required" });
  if (!featureOn("chat")) return res.status(503).json({ error: "AI consultation is temporarily disabled." });
  try {
    const chart = await getNormalizedChart(chartId);
    if (!chart) return res.status(404).json({ error: "Chart not found" });
    if (!canAccessChart(req, chart)) return res.status(403).json({ error: "This chart is not available on this account/device." });

    const context = `astro:${astrologer}`;
    // Never send two intros — if this astrologer already has history, skip.
    const prior = await getChatHistory(chartId, context).catch(() => []);
    if ((prior as any[]).length) return res.json({ bubbles: [], showChart: true, already: true });

    const language = typeof req.body?.language === "string" && req.body.language.trim() ? req.body.language.trim() : "en";
    const bubbles = await astrologerIntro({
      chart,
      personaPrompt: astrologerPrompt(astrologer),
      language,
      userName: chart.birth_details?.name?.split(" ")?.[0] || "",
    });
    await insertChatMessage({ chartId, role: "assistant", message: bubbles.join("\n"), context, responseJson: { bubbles, astrologer, intro: true, showChart: true } });
    res.json({ bubbles, showChart: true });
  } catch (err: any) {
    console.error("[consult/intro] error:", err?.message);
    res.status(500).json({ error: friendlyError(err?.message) });
  }
});

/** GET /api/chat-history/:chartId?context=ask|sector|transit — previous chat messages. */
app.get("/api/chat-history/:chartId", async (req, res) => {
  try {
    const context = typeof req.query.context === "string" ? req.query.context : undefined;
    const history = await getChatHistory(req.params.chartId, context);
    res.json(history);
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/** DELETE /api/chat-history/:chartId?context=... — "New chat": clear a thread. */
app.delete("/api/chat-history/:chartId", async (req, res) => {
  try {
    const context = typeof req.query.context === "string" ? req.query.context : undefined;
    await clearChatHistory(req.params.chartId, context);
    // "New chat" must feel genuinely new — drop the remembered notes too, or the
    // astrologer keeps referring to a conversation the user just deleted.
    await clearChatMemory(req.params.chartId).catch(() => {});
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// ---------------------------------------------------------------------------
// Feedback / ratings → website testimonials.
// ---------------------------------------------------------------------------

/** Devices that already auto-published today (best-effort abuse throttle). */
const recentlyPublished = new Map<string, number>();
const PUBLISH_COOLDOWN = 24 * 60 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - PUBLISH_COOLDOWN;
  for (const [k, t] of recentlyPublished) if (t < cutoff) recentlyPublished.delete(k);
}, 60 * 60 * 1000).unref?.();

// Submit feedback after a service (chart, report, chat…). A positive rating
// (4-5★) with a real comment is auto-approved so it can show on the site
// immediately; a low rating or empty comment is stored for the admin to see but
// never shown publicly. The admin can still reject any auto-approved one later.
app.post("/api/feedback", (req: any, res) =>
  optionalAuth(req, res, async () => {
    try {
      const rating = Number(req.body?.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "rating must be 1-5" });
      }
      const comment = typeof req.body?.comment === "string" ? req.body.comment.trim().slice(0, 600) : "";
      const bodyName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 60) : "";
      const name = bodyName || req.user?.name || null;
      const deviceId = typeof req.body?.deviceId === "string" ? req.body.deviceId.slice(0, 80) : null;
      const context = typeof req.body?.context === "string" ? req.body.context.slice(0, 40) : null;
      // Auto-publishing puts text straight onto the public website, so an open
      // endpoint must not be a defacement channel. Anything link-shaped, overly
      // long, or from a device that already published today goes to the admin
      // queue instead of going live. (Rendering is textContent-only, so this is
      // about spam/abuse, not XSS.)
      const looksSpammy =
        /https?:\/\/|www\.|<[a-z/]|\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(comment) ||
        comment.length > 300;
      const deviceKey = deviceId || `user:${req.user?.id ?? "anon"}`;
      const publishedRecently = deviceKey ? recentlyPublished.has(deviceKey) : false;
      // A silent 4-5 star rating is publishable too — only text has to clear the
      // spam checks, because only text can be abused.
      const autoApprove = rating >= 4 && !publishedRecently && (!comment || !looksSpammy);
      if (autoApprove && deviceKey) {
        recentlyPublished.set(deviceKey, Date.now());
        if (recentlyPublished.size > 5000) recentlyPublished.clear();
      }
      const id = await insertFeedback({
        userId: req.user?.id ?? null,
        deviceId,
        name,
        rating,
        comment: comment || null,
        context,
        approved: autoApprove,
      });
      res.json({ ok: true, id, published: autoApprove });
    } catch (err: any) {
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  }),
);

// Public testimonial wall for the website — approved positive feedback only.
app.get("/api/testimonials", async (_req, res) => {
  try {
    res.json(await getTestimonials(24));
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// Admin moderation: list everything, approve/reject, delete.
app.get("/api/admin/feedback", requireAdmin, async (_req, res) => {
  try {
    res.json(await getAllFeedback(200));
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.post("/api/admin/feedback/:id/approved", requireAdmin, async (req: any, res) => {
  try {
    const approved = req.body?.approved !== false;
    const ok = await setFeedbackApproved(req.params.id, approved);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.json({ ok: true, approved });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

app.delete("/api/admin/feedback/:id", requireAdmin, async (req, res) => {
  try {
    const ok = await deleteFeedback(req.params.id);
    if (!ok) return res.status(404).json({ error: "not found" });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

/**
 * Last-resort handler for anything a route throws without catching. Express's
 * built-in handler would send the stack trace straight to the client, so this
 * MUST stay registered after every route.
 */
app.use("/api", (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (res.headersSent) return;
  fail(res, 500, "Something went wrong. Please try again.", err, "unhandled");
});

// Setup Vite in Dev or serve Static in Production
async function startServer() {
  await initDb().catch((err) => {
    console.error("[db] init failed:", err?.message);
  });

  // Admin-managed keys override the .env ones. A failure here is not fatal —
  // the app still runs on whatever is configured in the environment.
  await refreshProviderKeys().catch((err) => {
    console.warn("[keys] could not load from DB:", err?.message);
  });

  if (process.env.NODE_ENV !== "production") {
    // The specifier is held in a variable so bundlers (Vercel's @vercel/nft)
    // do NOT pull vite/esbuild/rollup into the serverless function — they are
    // only needed for local dev and would otherwise crash the function on load.
    const viteSpecifier = "vite";
    const { createServer: createViteServer } = await import(/* @vite-ignore */ viteSpecifier);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Always serve plain HTTP on PORT (e.g. http://localhost:3000) — the normal URL.
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // ALSO serve HTTPS on a second port (self-signed) so the microphone / voice
  // input works even when the app is opened from another device via its IP
  // (browsers allow the mic only on a secure origin or localhost).
  const HTTPS_PORT = Number(process.env.HTTPS_PORT) || PORT + 443; // 3000 -> 3443
  try {
    const https = await import("https");
    const selfsigned: any = (await import("selfsigned")).default;
    const pems = await selfsigned.generate(
      [{ name: "commonName", value: "localhost" }],
      { days: 365, keySize: 2048, algorithm: "sha256" }
    );
    https
      .createServer({ key: pems.private, cert: pems.cert }, app)
      .listen(HTTPS_PORT, "0.0.0.0", () => {
        console.log(`Secure (for voice/mic): https://localhost:${HTTPS_PORT} (accept the one-time browser warning)`);
      });
  } catch (err: any) {
    console.warn("[https] could not start secure server:", err?.message);
  }
}

// On Vercel the app runs as a serverless function (see api/index.ts) — we must
// NOT open a listening socket there. Locally / on a VPS we start the server.
if (!process.env.VERCEL) {
  startServer();
}

// Exported so the Vercel serverless entry (api/index.ts) can mount the app.
export { app, initDb };
