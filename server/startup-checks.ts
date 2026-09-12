/**
 * Fail-fast configuration checks.
 *
 * In production a missing secret is not something to warn about and carry on —
 * it silently breaks sessions, loses user data, or disables the product's core
 * feature. So we refuse to start instead of serving a half-broken app.
 *
 * Local development stays forgiving: the same problems are printed as warnings
 * so you can run the app with nothing configured.
 */

const IS_PROD =
  process.env.NODE_ENV === "production" || !!process.env.VERCEL;

/** Any one of these is enough to power the AI features. */
const AI_KEYS = [
  "GEMINI_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
  "GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY", "OLLAMA_MODEL",
];

const has = (k: string) => !!(process.env[k] || "").trim();

export function runStartupChecks(): void {
  const fatal: string[] = [];
  const warn: string[] = [];

  // ── Session signing key ──────────────────────────────────────────────────
  // Without it, server/auth.ts derives a per-process fallback: sessions break
  // across serverless instances and the value is guessable.
  if (!has("AUTH_SECRET")) {
    (IS_PROD ? fatal : warn).push(
      "AUTH_SECRET is not set. Sessions cannot be signed safely. Generate one with: openssl rand -hex 32",
    );
  } else if ((process.env.AUTH_SECRET || "").trim().length < 32) {
    (IS_PROD ? fatal : warn).push(
      "AUTH_SECRET is shorter than 32 characters — use a long random value (openssl rand -hex 32).",
    );
  }

  // ── Database ─────────────────────────────────────────────────────────────
  // The file-store fallback writes to /tmp on serverless, which is wiped
  // between invocations — i.e. silent data loss for real users.
  if (!has("DATABASE_URL") && !has("POSTGRES_URL")) {
    (IS_PROD ? fatal : warn).push(
      "DATABASE_URL is not set. In production the local file store is ephemeral and user data WILL be lost.",
    );
  }

  // ── AI provider ──────────────────────────────────────────────────────────
  if (!AI_KEYS.some(has)) {
    (IS_PROD ? fatal : warn).push(
      `No AI provider configured. Set at least one of: ${AI_KEYS.join(", ")}`,
    );
  }

  // ── Payments ─────────────────────────────────────────────────────────────
  /*
   * A live key with no webhook secret is the worst of the three states.
   *
   * Payments advertise themselves as enabled off KEY_ID + KEY_SECRET alone, so
   * the checkout opens and the card is charged — and then every webhook is
   * rejected with 503 because there is nothing to verify the signature
   * against, and the credits are never granted. The buyer sees a debit and an
   * unchanged balance. (`/api/billing/verify` can still recover it by asking
   * Razorpay directly, but that is a safety net, not the design.)
   *
   * Fatal in production ONLY when a live key is present: a test key with no
   * webhook secret is an ordinary development setup and must still boot.
   */
  const rzpKey = (process.env.RAZORPAY_KEY_ID || "").trim();
  if (rzpKey && !has("RAZORPAY_KEY_SECRET")) {
    (IS_PROD ? fatal : warn).push(
      "RAZORPAY_KEY_ID is set but RAZORPAY_KEY_SECRET is not — no order can be created.",
    );
  }
  if (rzpKey && !has("RAZORPAY_WEBHOOK_SECRET")) {
    const live = rzpKey.startsWith("rzp_live_");
    (IS_PROD && live ? fatal : warn).push(
      "RAZORPAY_WEBHOOK_SECRET is not set. Payments will be taken and the webhook that grants " +
      "credits will be rejected — buyers get charged and credited nothing. Set it from the " +
      "Razorpay dashboard (Settings → Webhooks) before enabling live payments.",
    );
  }
  if (IS_PROD && rzpKey.startsWith("rzp_test_")) {
    warn.push("Razorpay is in TEST mode in production — real cards will not be charged.");
  }

  // ── Non-fatal but worth flagging ─────────────────────────────────────────
  if (!has("ADMIN_EMAIL")) warn.push("ADMIN_EMAIL is not set — nobody will get the admin panel.");
  if (!has("SMTP_USER") || !has("SMTP_PASS")) {
    warn.push("SMTP_USER / SMTP_PASS are not set — password reset and email sign-in codes will not work.");
  }
  if (IS_PROD && !has("PUBLIC_APP_URL")) {
    warn.push("PUBLIC_APP_URL is not set — password-reset links fall back to the default domain.");
  }

  for (const w of warn) console.warn(`[config] WARNING: ${w}`);

  if (fatal.length) {
    console.error("\n[config] FATAL — refusing to start:\n" + fatal.map((f) => `  • ${f}`).join("\n") + "\n");
    throw new Error(`Missing required configuration: ${fatal.length} problem(s). See the log above.`);
  }

  console.log(
    `[config] checks passed (${IS_PROD ? "production" : "development"} mode)`,
  );
}
