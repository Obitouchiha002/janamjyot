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
