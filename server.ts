import "./server/env"; // must be first: loads .env.local before anything reads process.env
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
  insertBirthProfile,
  insertChartCalculation,
  getNormalizedChart,
  listProfiles,
  deleteChart,
  insertReport,
  getReport,
  insertChatMessage,
  getChatHistory,
  clearChatHistory,
  getChatMemory,
  saveChatMemory,
  clearChatMemory,
  createUser,
  getUserByEmail,
  getUserById,
  setUserPassword,
  setPasswordReset,
  getUserByResetToken,
  saveLoginCode,
  getLoginCode,
  bumpLoginCodeAttempts,
  clearLoginCode,
  listUsers,
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
  insertFeedback,
  getTestimonials,
  getAllFeedback,
  setFeedbackApproved,
  deleteFeedback,
  type QuotaAction,
  type PlanId,
  type AccountStatus,
} from "./server/db";
import {
  hashPassword, verifyPassword, signToken, requireAuth, optionalAuth, requireAdmin, ADMIN_EMAIL,
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
  answerAsAstrologer,
  astrologerIntro,
  generateLifeReport,
  generateMatchSummary,
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
} from "./server/gemini";
import { personMoon, matchKundli } from "./server/matching";
import { computeRemedies } from "./server/remedies";
import { buildPanchang } from "./server/panchang";
import { buildRightNow, ACTIVITIES } from "./server/right-now";
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
// "local" (default, no API) or "prokerala" (uses the Prokerala API).
const CHART_ENGINE = (process.env.CHART_ENGINE || "local").trim().toLowerCase();

const IS_PROD = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

// Vercel (and most hosts) put a proxy in front of us; without this every
// request looks like it comes from the proxy and per-IP rate limiting is
// meaningless. `1` = trust exactly one hop, not an attacker-supplied chain.
app.set("trust proxy", 1);

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
      connectSrc: ["'self'", "https://janamjyot.vercel.app"],
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
    process.env.PUBLIC_APP_URL,
    "https://janamjyot.vercel.app",
    "capacitor://localhost",
    "ionic://localhost",
    "https://localhost",
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:4001",
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

app.use(express.json({ limit: "1mb" })); // cap the body so a huge POST can't hog memory

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

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/google", authLimiter);
app.use("/api/auth/otp/verify", authLimiter);
app.use("/api/auth/forgot-password", slowLimiter);
app.use("/api/auth/reset-password", slowLimiter);
app.use("/api/auth/otp/request", slowLimiter);

// ── Login is OPTIONAL (open app). We read the token if present (so admins/owners
//    are recognised) but never block. Maintenance still pauses the app for
//    non-admins when an admin enables it.
app.use("/api", (req, res, next) => {
  if (req.path.startsWith("/auth/")) return next();
  optionalAuth(req, res, () => {
    const m = getSetting("maintenance");
    if (m?.enabled && (req as any).user?.role !== "admin") {
      return res.status(503).json({ error: m.message || "The app is under maintenance. Please check back soon.", maintenance: true });
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
app.post("/api/auth/signup", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6) {
    return res.status(400).json({ error: "Enter your name, a valid email, and a 6+ character password." });
  }
  if (await getUserByEmail(email)) return res.status(409).json({ error: "This email is already registered — please sign in." });
  // Password signup proves NOTHING about owning the address — there is no
  // verification step. Granting admin here meant that on a fresh database
  // anyone who typed the (publicly visible) admin address became admin
  // instantly. Admin is only granted via a path that proves inbox ownership:
  // the emailed sign-in code, or Google Sign-In.
  const user = await createUser({ name, email, passwordHash: hashPassword(password), role: "user" });
  res.json({ token: signToken({ sub: user.id }), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
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
  const email = String(req.body?.email ?? "").trim().toLowerCase();
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
  const email = String(req.body?.email ?? "").trim().toLowerCase();
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
      user = await createUser({
        name: name || email.split("@")[0],
        email,
        passwordHash: null,
        role: email === ADMIN_EMAIL ? "admin" : "user",
      });
    }
    if (user.status && user.status !== "active") {
      return res.status(403).json({ error: (user as any).status_reason || "This account has been suspended." });
    }
    touchUser(user.id).catch(() => {});
    res.json({
      token: signToken({ sub: user.id }),
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err: any) {
    console.error("[auth/otp/verify] ", err?.message);
    res.status(500).json({ error: "Could not verify the code. Please try again." });
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
  const email = String(req.body?.email ?? "").trim().toLowerCase();
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

  const email = String(claims.email).toLowerCase();
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
      user = await createUser({
        name, email,
        passwordHash: null,
        googleSub: sub,
        avatarUrl: picture,
        role: email === ADMIN_EMAIL ? "admin" : "user",
      });
    }
  }

  if (user.status && user.status !== "active") {
    return res.status(403).json({ error: user.status_reason || "This account has been suspended." });
  }

  touchUser(user.id).catch(() => {});
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
    usage[a] = { used: await usageCount({ userId: user.id }, a), limit: limits[a], window: QUOTA_WINDOW[a] };
  }
  res.json({
    user: {
      id: user.id, name: user.name, email: user.email, role: user.role, plan: user.plan,
      status: user.status, status_reason: user.status_reason, limits_json: user.limits_json,
      created_at: user.created_at, google: !!user.google_sub,
    },
    usage,
    charts: await chartsByOwner(user.id),
  });
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
  for (const a of ["chart", "report", "ask", "match"] as QuotaAction[]) {
    out[a] = {
      used: await usageCount({ userId: me.userId, deviceId: me.deviceId }, a),
      limit: limits[a],
      window: QUOTA_WINDOW[a],
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
    app: {
      version: String(getSetting("app_version") || process.env.APP_VERSION || "1.0"),
      apk_url: process.env.APK_URL
        || `${(process.env.PUBLIC_APP_URL || "https://janamjyot.vercel.app").replace(/\/$/, "")}/JanamJyot-v1.0.0.apk`,
      notes: String(getSetting("app_update_notes") || ""),
      // When true the prompt reappears every launch instead of once per version.
      mandatory: !!getSetting("app_update_mandatory"),
    },
  });
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

  const me = identityOf(req);
  const used = await usageCount({ userId: me.userId, deviceId: me.deviceId }, action);
  if (used < limit) return null;

  const window = QUOTA_WINDOW[action];
  const when =
    window === "day" ? "Your limit resets tomorrow."
    : window === "month" ? "Your limit resets 30 days after each use."
    : "Delete a saved kundli to free up a slot.";

  const what: Record<QuotaAction, string> = {
    chart: `You can keep ${limit} saved kundli${limit === 1 ? "" : "s"} on this plan.`,
    report: `You can generate ${limit} life report${limit === 1 ? "" : "s"} per month on this plan.`,
    ask: `You can ask ${limit} question${limit === 1 ? "" : "s"} per day on this plan.`,
    match: `You can run ${limit} kundli match${limit === 1 ? "" : "es"} per day on this plan.`,
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
app.post("/api/create-chart", async (req, res) => {
  // Check the quota before doing any work — computing a chart the user is not
  // allowed to keep would burn a provider call for nothing.
  const over = await checkQuota(req, "chart");
  if (over) return res.status(429).json(over);

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
app.post("/api/match", async (req, res) => {
  const overMatch = await checkQuota(req as any, "match");
  if (overMatch) return res.status(429).json(overMatch);

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
    res.json({ ...result, summary });
  } catch (err: any) {
    console.error("[match] error:", err?.message);
    res.status(500).json({ error: "Matching failed" });
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
  const date = String(req.query.date || "").trim() || new Date().toISOString().slice(0, 10);
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const timezone = String(req.query.tz || "Asia/Kolkata").trim();
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
    const nowIso = new Date().toISOString();
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
  const date = String(req.query.date || "").trim() || new Date().toISOString().slice(0, 10);
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const timezone = String(req.query.tz || "Asia/Kolkata").trim();
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
    const lang = typeof req.query.lang === "string" && req.query.lang.trim()
      ? req.query.lang.trim() : (b.language || "en");
    const cacheKey = `today:${todayLocal}:${lang}`;
    const cached = await getReport(req.params.chartId, cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

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

    const cacheKey = `guidance:${todayLocal}`;
    const cached = await getReport(req.params.chartId, cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

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

    let guidance: any = null;
    try {
      const language = b.language || "en";
      guidance = await generateDailyGuidance({
        name: b.name,
        dasha: chart.dasha?.current,
        moon_transit: moonT ? { sign: moonT.sign, house_from_lagna: moonT.house_from_lagna, house_from_moon: moonT.house_from_moon } : null,
        transit_highlights: tr.highlights,
        panchang: panchang ? { weekday: panchang.weekday, tithi: panchang.tithi, nakshatra: panchang.nakshatra } : null,
      }, language);
    } catch (e: any) { console.warn("[guidance] AI skipped:", e?.message); }

    const payload = {
      date: todayLocal,
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

    const language =
      (typeof req.body?.language === "string" && req.body.language.trim()) ||
      chart.birth_details?.language ||
      "en";
    const regenerate = req.body?.regenerate === true;

    // Cache: reuse an existing report for this chart + language so repeat views
    // (or the same person again) are instant and don't re-call the AI.
    if (!regenerate) {
      const cached = await getReport(chartId, language);
      if (cached) return res.json({ ...cached, cached: true });
    }

    // Only a report we actually have to GENERATE counts against the quota — a
    // cached one costs nothing, so re-reading your own report is always free.
    const over = await checkQuota(req as any, "report");
    if (over) return res.status(429).json(over);
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

    await insertReport({ chartId, report, language });
    res.json(report);
  } catch (err: any) {
    console.error("[generate-report] error:", err?.message);
    const quota = /429|quota|rate limit/i.test(err?.message ?? "");
    res.status(quota ? 429 : 500).json({ error: friendlyError(err?.message) });
  }
}
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

    const language = chart.birth_details?.language || "en";
    const cacheKey = `report:${type}`;
    if (req.query.regenerate !== "1") {
      const cached = await getReport(chartId, cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    let transit: any = null;
    try { transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString())); }
    catch (e: any) { console.warn("[report] transit skipped:", e?.message); }

    const report = await generateFocusedReport(chart, type, language, transit);
    if (report?.error) return res.status(502).json(report);

    const payload = { type, ...report, birth_details: chart.birth_details, generated_at: new Date().toISOString() };
    try { await insertReport({ chartId, report: payload, language: cacheKey }); } catch {}
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

    const panchang = buildPanchang({ date, latitude, longitude, timezone, ayanamsa: AYANAMSA });
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
    const language = typeof req.query.lang === "string" && req.query.lang.trim()
      ? req.query.lang.trim() : (b.language || "en");

    const cacheKey = `plan:${today}:${language}`;
    if (req.query.regenerate !== "1") {
      const cached = await getReport(chartId, cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    // Same timing signal the Right Now card uses, so the two never disagree.
    let window = { verdict: "go", current: "", nextGood: null as string | null };
    try {
      if (Number.isFinite(b.latitude) && Number.isFinite(b.longitude)) {
        const nowHHMM = new Intl.DateTimeFormat("en-GB", {
          timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
        }).format(new Date());
        const p = buildPanchang({ date: today, latitude: b.latitude, longitude: b.longitude, timezone: tz, ayanamsa: AYANAMSA });
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

    const language = chart.birth_details?.language || "en";
    const today = new Date().toISOString().slice(0, 10);
    const cacheKey = `timeline:${range}:${today}`;
    if (req.query.regenerate !== "1") {
      const cached = await getReport(chartId, cacheKey);
      if (cached) return res.json({ ...cached, cached: true });
    }

    let transit: any = null;
    try { transit = compactTransitForAI(buildTransit(chart, AYANAMSA, new Date().toISOString())); }
    catch (e: any) { console.warn("[timeline] transit skipped:", e?.message); }

    const timeline = await generateLifeTimeline(chart, range, language, transit);
    if (timeline?.error) return res.status(502).json(timeline);

    const payload = { ...timeline, birth_details: chart.birth_details, generated_at: new Date().toISOString() };
    try { await insertReport({ chartId, report: payload, language: cacheKey }); } catch {}
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

    const overAsk = await checkQuota(req as any, "ask");
    if (overAsk) return res.status(429).json(overAsk);
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

    res.json({ answer, category });
  } catch (err: any) {
    console.error("[chat] error:", err?.message);
    const quota = /429|quota|rate limit/i.test(err?.message ?? "");
    res.status(quota ? 429 : 500).json({ error: friendlyError(err?.message) });
  }
}
app.post("/api/chat", handleChat);
app.post("/api/ask-question", handleChat);

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

    const over = await checkQuota(req as any, "ask");
    if (over) return res.status(429).json(over);
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
