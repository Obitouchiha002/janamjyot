/**
 * Persistence layer.
 *
 * If DATABASE_URL is set, data is stored in Postgres / Supabase.
 * If it is NOT set, the app transparently falls back to a local JSON file
 * (.data/store.json) so it works fully with no database to configure. The
 * public API below is identical for both backends, so the rest of the server
 * never knows which one is active.
 */
import pg from "pg";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, copyFileSync } from "fs";
import path from "path";

const { Pool } = pg;

// Accept either DATABASE_URL (standard / Neon / Supabase) or POSTGRES_URL
// (the variable name Vercel's built-in Postgres integration injects).
const connectionString = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
const USE_PG = connectionString.length > 0;

if (USE_PG) {
  console.log("[db] using Postgres (DATABASE_URL set)");
} else {
  console.log("[db] DATABASE_URL not set — using local file store (.data/store.json)");
}

// ===========================================================================
// Public types
// ===========================================================================
export interface BirthProfileInput {
  name: string;
  date_of_birth: string;
  time_of_birth: string;
  place_of_birth: string;
  latitude: number;
  longitude: number;
  timezone: string;
  gender?: string | null;
  language: string;
}

// ===========================================================================
// Local file store (used when DATABASE_URL is absent)
// ===========================================================================
interface FileData {
  users: any[];
  birth_profiles: Record<string, any>;
  chart_calculations: Record<string, any>;
  ai_reports: any[];
  chat_messages: any[];
  feedback: any[];
  login_codes: any[];
  chat_memory: Record<string, string>;
  settings: Record<string, any>;
}

// Persistent location. Override with DATA_DIR env (e.g. a mounted volume in
// production). This data is NEVER deleted automatically — only by the user
// deleting a profile in the app, or removing the file by hand.
// On Vercel (and other serverless platforms) the app directory is READ-ONLY —
// only /tmp is writable. Default the file store there so writes never crash.
// (For real persistence on Vercel, set DATABASE_URL to use Postgres instead.)
const defaultDataDir = process.env.VERCEL
  ? "/tmp/.data"
  : path.join(process.cwd(), ".data");
const DATA_DIR = process.env.DATA_DIR?.trim()
  ? path.resolve(process.env.DATA_DIR.trim())
  : defaultDataDir;
const STORE_PATH = path.join(DATA_DIR, "store.json");
const TMP_PATH = path.join(DATA_DIR, "store.json.tmp");

let fileData: FileData = {
  users: [],
  birth_profiles: {},
  chart_calculations: {},
  ai_reports: [],
  chat_messages: [],
  feedback: [],
  login_codes: [],
  chat_memory: {},
  settings: {},
};
let fileLoaded = false;

function loadFile() {
  fileLoaded = false;
  try {
    if (existsSync(STORE_PATH)) {
      const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8"));
      fileData = parsed;
      fileData.users ??= [];
      fileData.birth_profiles ??= {};
      fileData.chart_calculations ??= {};
      fileData.ai_reports ??= [];
      fileData.chat_messages ??= [];
      fileData.feedback ??= [];
      fileData.login_codes ??= [];
      fileData.chat_memory ??= {};
      fileData.settings ??= {};
      const charts = Object.keys(fileData.chart_calculations).length;
      console.log(`[db] loaded ${charts} saved chart(s) from ${STORE_PATH}`);
    } else {
      console.log(`[db] no existing store yet — a new one will be created at ${STORE_PATH}`);
    }
    fileLoaded = true;
  } catch (err: any) {
    // The file exists but is unreadable/corrupt. Do NOT silently overwrite it —
    // back it up so nothing is lost, then start fresh.
    try {
      const backup = `${STORE_PATH}.corrupt-${Date.now()}.bak`;
      if (existsSync(STORE_PATH)) copyFileSync(STORE_PATH, backup);
      console.warn(`[db] store.json was unreadable (${err?.message}); backed up to ${backup}`);
    } catch {
      /* ignore backup failure */
    }
    // fileLoaded stays false -> saving is blocked until next successful load,
    // so we never clobber a corrupt-but-recoverable file with empty data.
  }
}

function saveFile() {
  // Guard: never write before a successful load, otherwise a transient read
  // failure could wipe good data.
  if (!fileLoaded) {
    console.warn("[db] skipping save — store not loaded cleanly (data left untouched)");
    return;
  }
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  // Atomic write: write to a temp file, then rename over the real one. A crash
  // mid-write can never corrupt the existing store.
  writeFileSync(TMP_PATH, JSON.stringify(fileData, null, 2));
  renameSync(TMP_PATH, STORE_PATH);
}

// ===========================================================================
// Postgres pool + schema
// ===========================================================================
// Cloud Postgres (Neon, Supabase, Vercel Postgres) requires SSL. Enable it by
// default for any non-local host; only a localhost connection runs without SSL.
const isLocalPg = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
const isProdEnv = process.env.NODE_ENV === "production" || !!process.env.VERCEL;

// TLS is REQUIRED for any remote database in production — credentials and user
// data would otherwise cross the internet in the clear. `DATABASE_SSL=false` is
// honoured only for a local database (or outside production), so a stray env
// var can never silently downgrade a live connection.
const sslDisabledByEnv = process.env.DATABASE_SSL === "false";
const mustUseSsl = !isLocalPg && (isProdEnv || !sslDisabledByEnv);
if (sslDisabledByEnv && !isLocalPg && isProdEnv) {
  console.warn("[db] DATABASE_SSL=false ignored — TLS is enforced for remote databases in production.");
}
const ssl = mustUseSsl || process.env.DATABASE_SSL === "true"
  ? { rejectUnauthorized: false } // managed providers commonly use their own CA
  : undefined;

export const pool = USE_PG ? new Pool({ connectionString, ssl }) : null;

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS birth_profiles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  date_of_birth  DATE        NOT NULL,
  time_of_birth  TEXT        NOT NULL,
  place_of_birth TEXT        NOT NULL,
  latitude       DOUBLE PRECISION NOT NULL,
  longitude      DOUBLE PRECISION NOT NULL,
  timezone       TEXT        NOT NULL,
  gender         TEXT,
  language       TEXT        NOT NULL DEFAULT 'en',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chart_calculations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  birth_profile_id      UUID NOT NULL REFERENCES birth_profiles(id) ON DELETE CASCADE,
  provider              TEXT NOT NULL DEFAULT 'prokerala',
  normalized_chart_json JSONB NOT NULL,
  raw_provider_json     JSONB,
  validation_status     TEXT NOT NULL DEFAULT 'unverified',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chart_calculations_profile ON chart_calculations(birth_profile_id);

CREATE TABLE IF NOT EXISTS ai_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id    UUID NOT NULL REFERENCES chart_calculations(id) ON DELETE CASCADE,
  report_json JSONB NOT NULL,
  language    TEXT NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_reports_chart ON ai_reports(chart_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id      UUID NOT NULL REFERENCES chart_calculations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  message       TEXT,
  context       TEXT NOT NULL DEFAULT 'ask',
  response_json JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Keep older databases working: add the column if it's missing.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS context TEXT NOT NULL DEFAULT 'ask';
CREATE INDEX IF NOT EXISTS idx_chat_messages_chart ON chat_messages(chart_id, context, created_at);

-- User feedback / ratings. Positive, approved ones become website testimonials.
CREATE TABLE IF NOT EXISTS feedback (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT,
  device_id   TEXT,
  name        TEXT,
  rating      INT NOT NULL,
  comment     TEXT,
  context     TEXT,
  approved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

-- ---------------------------------------------------------------------------
-- Accounts, quotas and operations.
--
-- Everything below used to live only in the JSON file store, which meant that
-- with DATABASE_URL set (i.e. in production) accounts were written to a file
-- that a serverless deploy throws away. These tables make Postgres the real
-- home for users, settings, usage and audit history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  -- NULL for accounts that only ever signed in with Google.
  password_hash TEXT,
  google_sub    TEXT UNIQUE,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'user',    -- 'user' | 'admin'
  plan          TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'pro' | 'unlimited'
  status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'blocked' | 'banned'
  status_reason TEXT,
  -- Per-user overrides of the plan's quotas, e.g. {"ask_per_day": 100}.
  limits_json   JSONB,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Forgot-password support (added later; safe on existing databases).
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS reset_token   TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ;

-- Long-term memory for the astrologer chat: a short, rolling set of notes about
-- the person, kept PER CHART (not per astrologer) so every astrologer knows what
-- they have already been told. The raw transcript stays in chat_messages; this
-- is the distilled version that gets injected into prompts.
CREATE TABLE IF NOT EXISTS chat_memory (
  chart_id    UUID PRIMARY KEY REFERENCES chart_calculations(id) ON DELETE CASCADE,
  notes       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Passwordless e-mail sign-in codes. Kept in their OWN table (not on app_users)
-- because a first-time user has no account row yet when the code is sent.
-- Only the HASH of the code is stored.
CREATE TABLE IF NOT EXISTS login_codes (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_users_created ON app_users(created_at DESC);

-- Ownership. Without these, every signed-in user could read every chart.
ALTER TABLE birth_profiles     ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE chart_calculations ADD COLUMN IF NOT EXISTS owner_id UUID;
-- Anonymous users are identified by a stable per-install id instead of an account.
ALTER TABLE birth_profiles     ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE chart_calculations ADD COLUMN IF NOT EXISTS device_id TEXT;
-- Migration: an earlier version packed anonymous ownership into owner_id as the
-- string 'device:<id>', so the column exists as TEXT on live databases and
-- ADD COLUMN IF NOT EXISTS above silently leaves it that way — every
-- owner_id = $1::uuid comparison would then fail with "text = uuid".
-- Split the two identities apart and give owner_id its real type. Idempotent:
-- the block is skipped once the column is already UUID.
DO $migrate$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'chart_calculations' AND column_name = 'owner_id' AND data_type = 'text'
  ) THEN
    UPDATE chart_calculations
       SET device_id = COALESCE(device_id, substring(owner_id from 8)), owner_id = NULL
     WHERE owner_id LIKE 'device:%';
    UPDATE birth_profiles
       SET device_id = COALESCE(device_id, substring(owner_id from 8)), owner_id = NULL
     WHERE owner_id LIKE 'device:%';

    -- Anything left that is not a UUID cannot be matched to an account; the row
    -- is kept, only its unusable owner reference is cleared.
    UPDATE chart_calculations SET owner_id = NULL
     WHERE owner_id IS NOT NULL
       AND owner_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    UPDATE birth_profiles SET owner_id = NULL
     WHERE owner_id IS NOT NULL
       AND owner_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

    ALTER TABLE chart_calculations ALTER COLUMN owner_id TYPE uuid USING owner_id::uuid;
    ALTER TABLE birth_profiles     ALTER COLUMN owner_id TYPE uuid USING owner_id::uuid;
    RAISE NOTICE 'migrated owner_id from text to uuid';
  END IF;
END
$migrate$;

CREATE INDEX IF NOT EXISTS idx_charts_owner  ON chart_calculations(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_charts_device ON chart_calculations(device_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per billable action. This is both the quota counter and the
-- analytics source, so quotas can never drift from what was actually served.
CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID,
  device_id  TEXT,
  action     TEXT NOT NULL,   -- 'chart' | 'report' | 'ask' | 'match'
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_user   ON usage_events(user_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_device ON usage_events(device_id, action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_time   ON usage_events(created_at DESC);

-- Every admin action, so a ban or a key rotation can always be traced.
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID,
  actor_email TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

-- Provider API keys, managed from the admin panel. The secret column is
-- AES-256-GCM encrypted with a key derived from AUTH_SECRET, never plaintext.
CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  label        TEXT,
  secret       TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL DEFAULT true,
  priority     INT NOT NULL DEFAULT 100,
  last_used_at TIMESTAMPTZ,
  fail_count   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider, enabled, priority);
`;

let initPromise: Promise<void> | null = null;

/** Initialize the active backend. Safe to call on every boot. */
export function initDb(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (USE_PG) {
      await pool!.query(SCHEMA_SQL);
      await loadSettings();
      console.log("[db] Postgres schema ready");
    } else {
      loadFile();
      console.log("[db] file store ready");
    }
  })();
  return initPromise;
}

// ===========================================================================
// Public API (dispatches to Postgres or file store)
// ===========================================================================

// ===========================================================================
// Users (file store) + app settings
// ===========================================================================
export interface AppUser {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  google_sub?: string | null;
  avatar_url?: string | null;
  role: "admin" | "user";
  plan: PlanId;
  status: AccountStatus;
  status_reason?: string | null;
  limits_json?: Partial<Quotas> | null;
  created_at: string;
  /** Legacy file-store flag, still honoured as "blocked". */
  suspended?: boolean;
}

export type PlanId = "free" | "pro" | "unlimited";
export type AccountStatus = "active" | "blocked" | "banned";

/** The metered actions. Everything else is free to call. */
export type QuotaAction = "chart" | "report" | "ask" | "match";

export interface Quotas {
  /** Total saved charts allowed. */
  chart: number;
  /** Life reports per rolling 30 days. */
  report: number;
  /** AI questions per day. */
  ask: number;
  /** Kundli matches per day. */
  match: number;
}

/** -1 means unlimited. Tuned for free AI provider quotas — accuracy over volume. */
export const PLANS: Record<PlanId, Quotas> = {
  free: { chart: 3, report: 2, ask: 15, match: 3 },
  pro: { chart: 25, report: 20, ask: 100, match: 25 },
  unlimited: { chart: -1, report: -1, ask: -1, match: -1 },
};

/** The window each quota is counted over. `chart` is a lifetime cap, not a rate. */
export const QUOTA_WINDOW: Record<QuotaAction, "day" | "month" | "total"> = {
  chart: "total",
  report: "month",
  ask: "day",
  match: "day",
};

/**
 * Effective quotas for a user: plan defaults, overridden per-user by
 * `limits_json`. Admins are always unlimited, whatever their plan says.
 */
export function quotasFor(user: Pick<AppUser, "role" | "plan" | "limits_json"> | null): Quotas {
  if (!user) return PLANS.free;
  if (user.role === "admin") return PLANS.unlimited;
  const base = PLANS[user.plan] ?? PLANS.free;
  return { ...base, ...(user.limits_json ?? {}) };
}

const rowToUser = (r: any): AppUser => ({
  id: r.id,
  email: r.email,
  name: r.name,
  password_hash: r.password_hash ?? null,
  google_sub: r.google_sub ?? null,
  avatar_url: r.avatar_url ?? null,
  role: r.role,
  plan: (r.plan ?? "free") as PlanId,
  status: (r.status ?? "active") as AccountStatus,
  status_reason: r.status_reason ?? null,
  limits_json: r.limits_json ?? null,
  created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  suspended: (r.status ?? "active") !== "active",
});

export async function createUser(u: {
  email: string;
  name: string;
  passwordHash?: string | null;
  role: "admin" | "user";
  googleSub?: string | null;
  avatarUrl?: string | null;
}): Promise<AppUser> {
  const email = u.email.toLowerCase();
  if (USE_PG) {
    const { rows } = await pool!.query(
      `INSERT INTO app_users (email, name, password_hash, google_sub, avatar_url, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [email, u.name, u.passwordHash ?? null, u.googleSub ?? null, u.avatarUrl ?? null, u.role]
    );
    return rowToUser(rows[0]);
  }
  const user: AppUser = {
    id: randomUUID(), email, name: u.name,
    password_hash: u.passwordHash ?? null,
    google_sub: u.googleSub ?? null,
    avatar_url: u.avatarUrl ?? null,
    role: u.role, plan: "free", status: "active", limits_json: null,
    created_at: nowIso(),
  };
  fileData.users.push(user);
  saveFile();
  return user;
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  if (USE_PG) {
    const { rows } = await pool!.query(`SELECT * FROM app_users WHERE email = $1`, [email.toLowerCase()]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return fileData.users.find((u) => u.email === email.toLowerCase()) ?? null;
}

export async function getUserById(id: string): Promise<AppUser | null> {
  if (USE_PG) {
    const { rows } = await pool!.query(`SELECT * FROM app_users WHERE id = $1`, [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return fileData.users.find((u) => u.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Password change + forgot-password reset tokens.
// Only the HASH of a reset token is stored, so a database leak can't be used to
// take over accounts — the raw token lives only in the emailed link.
// ---------------------------------------------------------------------------
export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  if (USE_PG) {
    await pool!.query(
      `UPDATE app_users SET password_hash = $2, reset_token = NULL, reset_expires = NULL WHERE id = $1`,
      [userId, passwordHash],
    );
    return;
  }
  const u = fileData.users.find((x) => x.id === userId);
  if (!u) return;
  u.password_hash = passwordHash;
  u.reset_token = null;
  u.reset_expires = null;
  saveFile();
}

export async function setPasswordReset(userId: string, tokenHash: string, expiresAtIso: string): Promise<void> {
  if (USE_PG) {
    await pool!.query(
      `UPDATE app_users SET reset_token = $2, reset_expires = $3 WHERE id = $1`,
      [userId, tokenHash, expiresAtIso],
    );
    return;
  }
  const u = fileData.users.find((x) => x.id === userId);
  if (!u) return;
  u.reset_token = tokenHash;
  u.reset_expires = expiresAtIso;
  saveFile();
}

// ── Astrologer chat: long-term memory ──────────────────────────────────────

/** The rolling notes about this person, or "" if nothing is remembered yet. */
export async function getChatMemory(chartId: string): Promise<string> {
  if (USE_PG) {
    const { rows } = await pool!.query(`SELECT notes FROM chat_memory WHERE chart_id = $1`, [chartId]);
    return rows[0]?.notes ?? "";
  }
  return (fileData.chat_memory ?? {})[chartId] ?? "";
}

export async function saveChatMemory(chartId: string, notes: string): Promise<void> {
  const trimmed = String(notes || "").trim().slice(0, 1200); // keep prompts lean
  if (!trimmed) return;
  if (USE_PG) {
    await pool!.query(
      `INSERT INTO chat_memory (chart_id, notes, updated_at) VALUES ($1,$2,now())
       ON CONFLICT (chart_id) DO UPDATE SET notes = $2, updated_at = now()`,
      [chartId, trimmed],
    );
    return;
  }
  fileData.chat_memory ??= {};
  fileData.chat_memory[chartId] = trimmed;
  saveFile();
}

/** Forget everything remembered about a chart (used by "New chat"). */
export async function clearChatMemory(chartId: string): Promise<void> {
  if (USE_PG) {
    await pool!.query(`DELETE FROM chat_memory WHERE chart_id = $1`, [chartId]);
    return;
  }
  if (fileData.chat_memory) { delete fileData.chat_memory[chartId]; saveFile(); }
}

// ── Passwordless e-mail login codes ────────────────────────────────────────

export async function saveLoginCode(email: string, codeHash: string, expiresAtIso: string): Promise<void> {
  const key = email.toLowerCase();
  if (USE_PG) {
    await pool!.query(
      `INSERT INTO login_codes (email, code_hash, expires_at, attempts)
       VALUES ($1,$2,$3,0)
       ON CONFLICT (email) DO UPDATE SET code_hash = $2, expires_at = $3, attempts = 0, created_at = now()`,
      [key, codeHash, expiresAtIso],
    );
    return;
  }
  fileData.login_codes = (fileData.login_codes ?? []).filter((c: any) => c.email !== key);
  fileData.login_codes.push({ email: key, code_hash: codeHash, expires_at: expiresAtIso, attempts: 0 });
  saveFile();
}

export async function getLoginCode(email: string): Promise<{ code_hash: string; expires_at: string; attempts: number } | null> {
  const key = email.toLowerCase();
  if (USE_PG) {
    const { rows } = await pool!.query(`SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = $1`, [key]);
    return rows[0] ?? null;
  }
  return (fileData.login_codes ?? []).find((c: any) => c.email === key) ?? null;
}

/** Count a wrong guess so a code can't be brute-forced. */
export async function bumpLoginCodeAttempts(email: string): Promise<number> {
  const key = email.toLowerCase();
  if (USE_PG) {
    const { rows } = await pool!.query(
      `UPDATE login_codes SET attempts = attempts + 1 WHERE email = $1 RETURNING attempts`, [key],
    );
    return rows[0]?.attempts ?? 0;
  }
  const row = (fileData.login_codes ?? []).find((c: any) => c.email === key);
  if (!row) return 0;
  row.attempts = (row.attempts ?? 0) + 1;
  saveFile();
  return row.attempts;
}

export async function clearLoginCode(email: string): Promise<void> {
  const key = email.toLowerCase();
  if (USE_PG) {
    await pool!.query(`DELETE FROM login_codes WHERE email = $1`, [key]);
    return;
  }
  fileData.login_codes = (fileData.login_codes ?? []).filter((c: any) => c.email !== key);
  saveFile();
}

/** The user holding this (unexpired) reset-token hash, if any. */
export async function getUserByResetToken(tokenHash: string): Promise<AppUser | null> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT * FROM app_users WHERE reset_token = $1 AND reset_expires > now()`,
      [tokenHash],
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const now = Date.now();
  const u = fileData.users.find(
    (x) => x.reset_token === tokenHash && x.reset_expires && new Date(x.reset_expires).getTime() > now,
  );
  return u ?? null;
}

export async function getUserByGoogleSub(sub: string): Promise<AppUser | null> {
  if (USE_PG) {
    const { rows } = await pool!.query(`SELECT * FROM app_users WHERE google_sub = $1`, [sub]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return fileData.users.find((u) => u.google_sub === sub) ?? null;
}

/** Links a Google account to an existing email account on first Google sign-in. */
export async function linkGoogleSub(id: string, sub: string, avatarUrl?: string | null) {
  if (USE_PG) {
    await pool!.query(
      `UPDATE app_users SET google_sub = $2, avatar_url = COALESCE($3, avatar_url) WHERE id = $1`,
      [id, sub, avatarUrl ?? null]
    );
    return;
  }
  const u = fileData.users.find((x) => x.id === id);
  if (u) { u.google_sub = sub; if (avatarUrl) u.avatar_url = avatarUrl; saveFile(); }
}

export async function touchUser(id: string) {
  if (!USE_PG) return;
  await pool!.query(`UPDATE app_users SET last_seen_at = now() WHERE id = $1`, [id]);
}
export async function listUsers(search = ""): Promise<any[]> {
  if (USE_PG) {
    const like = `%${search.trim().toLowerCase()}%`;
    const { rows } = await pool!.query(
      `SELECT u.id, u.name, u.email, u.role, u.plan, u.status, u.status_reason,
              u.limits_json, u.created_at, u.last_seen_at,
              (SELECT count(*) FROM chart_calculations c WHERE c.owner_id = u.id)::int AS charts,
              (SELECT count(*) FROM usage_events e
                WHERE e.user_id = u.id AND e.action = 'ask'
                  AND e.created_at > now() - interval '30 days')::int AS asks_30d
         FROM app_users u
        WHERE ($1 = '%%' OR lower(u.email) LIKE $1 OR lower(u.name) LIKE $1)
        ORDER BY u.created_at DESC
        LIMIT 500`,
      [like]
    );
    return rows.map((r) => ({ ...r, suspended: r.status !== "active" }));
  }
  return fileData.users
    .slice()
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      plan: u.plan ?? "free", status: u.status ?? (u.suspended ? "blocked" : "active"),
      status_reason: u.status_reason ?? null, limits_json: u.limits_json ?? null,
      suspended: !!u.suspended, created_at: u.created_at,
      charts: Object.values(fileData.chart_calculations).filter((c: any) => c.owner_id === u.id).length,
    }));
}

export async function adminStats() {
  if (USE_PG) {
    const { rows } = await pool!.query(`
      SELECT
        (SELECT count(*) FROM app_users)::int AS users,
        (SELECT count(*) FROM app_users WHERE role = 'admin')::int AS admins,
        (SELECT count(*) FROM app_users WHERE status <> 'active')::int AS suspended,
        (SELECT count(*) FROM app_users WHERE created_at::date = current_date)::int AS signups_today,
        (SELECT count(*) FROM app_users WHERE last_seen_at > now() - interval '7 days')::int AS active_7d,
        (SELECT count(*) FROM chart_calculations)::int AS charts,
        (SELECT count(*) FROM chart_calculations WHERE created_at::date = current_date)::int AS charts_today,
        (SELECT count(*) FROM ai_reports)::int AS reports,
        (SELECT count(*) FROM chat_messages)::int AS chats,
        (SELECT count(*) FROM usage_events WHERE created_at::date = current_date)::int AS actions_today
    `);
    return rows[0];
  }
  const today = nowIso().slice(0, 10);
  return {
    users: fileData.users.length,
    admins: fileData.users.filter((u) => u.role === "admin").length,
    suspended: fileData.users.filter((u) => u.suspended).length,
    signups_today: fileData.users.filter((u) => String(u.created_at).slice(0, 10) === today).length,
    active_7d: 0,
    charts: Object.keys(fileData.chart_calculations).length,
    charts_today: Object.values(fileData.chart_calculations).filter((c: any) => String(c.created_at).slice(0, 10) === today).length,
    reports: fileData.ai_reports.length,
    chats: fileData.chat_messages.length,
    actions_today: 0,
  };
}

/** Daily counts for the admin analytics chart. */
export async function usageSeries(days = 14) {
  if (!USE_PG) return [];
  const { rows } = await pool!.query(
    `SELECT d::date AS day,
            count(*) FILTER (WHERE e.action = 'chart')::int  AS charts,
            count(*) FILTER (WHERE e.action = 'ask')::int     AS asks,
            count(*) FILTER (WHERE e.action = 'report')::int  AS reports,
            count(*) FILTER (WHERE e.action = 'match')::int   AS matches
       FROM generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
       LEFT JOIN usage_events e ON e.created_at::date = d::date
      GROUP BY d ORDER BY d`,
    [days]
  );
  return rows.map((r) => ({
    day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
    charts: r.charts, asks: r.asks, reports: r.reports, matches: r.matches,
  }));
}

export async function setUserRole(id: string, role: "admin" | "user") {
  if (USE_PG) {
    const { rows } = await pool!.query(`UPDATE app_users SET role = $2 WHERE id = $1 RETURNING *`, [id, role]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const u = fileData.users.find((x) => x.id === id);
  if (u) { u.role = role; saveFile(); }
  return u;
}

export async function setUserPlan(id: string, plan: PlanId) {
  if (USE_PG) {
    const { rows } = await pool!.query(`UPDATE app_users SET plan = $2 WHERE id = $1 RETURNING *`, [id, plan]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const u = fileData.users.find((x) => x.id === id);
  if (u) { u.plan = plan; saveFile(); }
  return u;
}

/** Per-user quota overrides. Pass null to fall back to the plan's defaults. */
export async function setUserLimits(id: string, limits: Partial<Quotas> | null) {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `UPDATE app_users SET limits_json = $2 WHERE id = $1 RETURNING *`,
      [id, limits ? JSON.stringify(limits) : null]
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const u = fileData.users.find((x) => x.id === id);
  if (u) { u.limits_json = limits; saveFile(); }
  return u;
}

/**
 * Block (temporary) or ban (permanent) an account. Both stop every request at
 * requireAuth; the distinction is intent, and it is recorded for the audit log.
 */
export async function setUserStatus(id: string, status: AccountStatus, reason?: string | null) {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `UPDATE app_users SET status = $2, status_reason = $3 WHERE id = $1 RETURNING *`,
      [id, status, reason ?? null]
    );
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const u = fileData.users.find((x) => x.id === id);
  if (u) { u.status = status; u.status_reason = reason ?? null; u.suspended = status !== "active"; saveFile(); }
  return u;
}

/** Kept for the existing suspend endpoint. */
export async function setUserSuspended(id: string, suspended: boolean) {
  return setUserStatus(id, suspended ? "blocked" : "active", suspended ? "Suspended by admin" : null);
}
export async function deleteUserAndData(id: string) {
  if (USE_PG) {
    // Their e-mail, so we can also clear any pending sign-in code for it.
    const { rows } = await pool!.query(`SELECT email FROM app_users WHERE id = $1`, [id]);
    const email = rows[0]?.email ?? null;
    // birth_profiles cascades to chart_calculations, which cascades to reports
    // and chat, so removing the profiles removes everything downstream.
    await pool!.query(`DELETE FROM birth_profiles WHERE owner_id = $1`, [id]);
    await pool!.query(`DELETE FROM usage_events WHERE user_id = $1`, [id]);
    // Feedback carries their name + free-text comment (and may be published as a
    // testimonial), so it must go too — otherwise "delete my account" would
    // leave their words and name on the public site.
    await pool!.query(`DELETE FROM feedback WHERE user_id = $1`, [id]);
    if (email) await pool!.query(`DELETE FROM login_codes WHERE email = $1`, [email]);
    await pool!.query(`DELETE FROM app_users WHERE id = $1`, [id]);
    return;
  }
  const gone = fileData.users.find((u) => u.id === id);
  fileData.feedback = (fileData.feedback ?? []).filter((f: any) => f.user_id !== id);
  if (gone?.email) {
    fileData.login_codes = (fileData.login_codes ?? []).filter((c: any) => c.email !== gone.email);
  }
  fileData.users = fileData.users.filter((u) => u.id !== id);
  const chartIds = Object.values(fileData.chart_calculations).filter((c: any) => c.owner_id === id).map((c: any) => c.id);
  const profileIds = new Set<string>();
  for (const cid of chartIds) {
    const c = fileData.chart_calculations[cid];
    if (c) profileIds.add(c.birth_profile_id);
    delete fileData.chart_calculations[cid];
  }
  for (const pid of profileIds) delete fileData.birth_profiles[pid];
  fileData.ai_reports = fileData.ai_reports.filter((r) => !chartIds.includes(r.chart_id));
  fileData.chat_messages = fileData.chat_messages.filter((m) => !chartIds.includes(m.chart_id));
  saveFile();
}
export async function recentUsers(n = 8) {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT id, name, email, role, plan, status, created_at FROM app_users ORDER BY created_at DESC LIMIT $1`, [n]
    );
    return rows;
  }
  return fileData.users.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, created_at: u.created_at }));
}

export async function recentCharts(n = 8) {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT c.id, b.name AS person, COALESCE(u.name, '(guest)') AS owner, c.created_at
         FROM chart_calculations c
         JOIN birth_profiles b ON b.id = c.birth_profile_id
         LEFT JOIN app_users u ON u.id = c.owner_id
        ORDER BY c.created_at DESC LIMIT $1`, [n]
    );
    return rows;
  }
  return Object.values(fileData.chart_calculations).slice().sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n)
    .map((c: any) => {
      const owner = fileData.users.find((u) => u.id === c.owner_id);
      const prof = fileData.birth_profiles[c.birth_profile_id] || {};
      return { id: c.id, person: prof.name || "", owner: owner ? owner.name : "(legacy)", created_at: c.created_at };
    });
}

export async function chartsByOwner(id: string) {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT c.id, b.name, b.date_of_birth AS date, c.created_at
         FROM chart_calculations c JOIN birth_profiles b ON b.id = c.birth_profile_id
        WHERE c.owner_id = $1 ORDER BY c.created_at DESC`, [id]
    );
    return rows.map((r) => ({
      ...r,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    }));
  }
  return Object.values(fileData.chart_calculations).filter((c: any) => c.owner_id === id)
    .map((c: any) => { const p = fileData.birth_profiles[c.birth_profile_id] || {}; return { id: c.id, name: p.name || "", date: p.date_of_birth || "", created_at: c.created_at }; });
}

// ===========================================================================
// App settings
//
// Settings are read on nearly every request (maintenance flag, announcement,
// feature toggles), so the Postgres table is mirrored into memory at boot and
// kept in sync on write. getSetting() therefore stays synchronous, as its
// existing callers expect.
// ===========================================================================
const settingsCache: Record<string, any> = {};

export async function loadSettings() {
  if (!USE_PG) return;
  const { rows } = await pool!.query(`SELECT key, value FROM app_settings`);
  for (const r of rows) settingsCache[r.key] = r.value;
}

export function getSetting(key: string): any {
  return USE_PG ? settingsCache[key] : fileData.settings?.[key];
}

export async function setSetting(key: string, value: any): Promise<void> {
  if (USE_PG) {
    settingsCache[key] = value;
    await pool!.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
    return;
  }
  fileData.settings[key] = value;
  saveFile();
}

// ===========================================================================
// Usage metering
// ===========================================================================

/** Records one metered action. Fire-and-forget: never block the response on it. */
export async function recordUsage(args: {
  userId?: string | null;
  deviceId?: string | null;
  action: QuotaAction;
  meta?: any;
}) {
  if (!USE_PG) return;
  try {
    await pool!.query(
      `INSERT INTO usage_events (user_id, device_id, action, meta) VALUES ($1,$2,$3,$4)`,
      [args.userId ?? null, args.deviceId ?? null, args.action, args.meta ? JSON.stringify(args.meta) : null]
    );
  } catch (e) {
    console.warn("[usage] failed to record", (e as Error).message);
  }
}

/**
 * How many times an identity has performed an action inside its quota window.
 *
 * `chart` counts saved charts rather than usage rows: a chart the user deleted
 * should free up their slot, otherwise the lifetime cap would be a cap on
 * creations, not on what they actually hold.
 */
export async function usageCount(
  who: { userId?: string | null; deviceId?: string | null },
  action: QuotaAction,
): Promise<number> {
  if (!USE_PG) return 0;
  const window = QUOTA_WINDOW[action];

  if (action === "chart") {
    const { rows } = await pool!.query(
      `SELECT count(*)::int AS n FROM chart_calculations
        WHERE ($1::uuid IS NOT NULL AND owner_id = $1::uuid)
           OR ($1::uuid IS NULL AND device_id = $2)`,
      [who.userId ?? null, who.deviceId ?? null]
    );
    return rows[0]?.n ?? 0;
  }

  const interval = window === "month" ? "30 days" : "1 day";
  const { rows } = await pool!.query(
    `SELECT count(*)::int AS n FROM usage_events
      WHERE action = $3
        AND created_at > now() - $4::interval
        AND (($1::uuid IS NOT NULL AND user_id = $1::uuid)
          OR ($1::uuid IS NULL AND device_id = $2))`,
    [who.userId ?? null, who.deviceId ?? null, action, interval]
  );
  return rows[0]?.n ?? 0;
}

// ===========================================================================
// Audit log
// ===========================================================================
export async function audit(args: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  target?: string | null;
  detail?: any;
}) {
  if (!USE_PG) return;
  try {
    await pool!.query(
      `INSERT INTO audit_log (actor_id, actor_email, action, target, detail) VALUES ($1,$2,$3,$4,$5)`,
      [args.actorId ?? null, args.actorEmail ?? null, args.action, args.target ?? null, args.detail ? JSON.stringify(args.detail) : null]
    );
  } catch (e) {
    console.warn("[audit] failed to record", (e as Error).message);
  }
}

export async function listAudit(limit = 100) {
  if (!USE_PG) return [];
  const { rows } = await pool!.query(
    `SELECT id, actor_email, action, target, detail, created_at
       FROM audit_log ORDER BY created_at DESC LIMIT $1`, [limit]
  );
  return rows;
}

// ===========================================================================
// Provider API keys (encrypted at rest)
// ===========================================================================
import crypto from "crypto";

/** AES-256-GCM with a key derived from AUTH_SECRET. */
function keyMaterial(): Buffer {
  const secret = (process.env.AUTH_SECRET || "vedicastra-dev-secret").trim();
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

function decryptSecret(stored: string): string {
  const [iv, tag, data] = stored.split(".");
  const d = crypto.createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

/** Only ever show the last 4 characters of a key in the admin UI. */
const maskKey = (s: string) => (s.length <= 4 ? "••••" : `••••${s.slice(-4)}`);

export async function addApiKey(a: { provider: string; label?: string; secret: string; priority?: number }) {
  if (!USE_PG) throw new Error("API key storage needs DATABASE_URL");
  const { rows } = await pool!.query(
    `INSERT INTO api_keys (provider, label, secret, priority) VALUES ($1,$2,$3,$4) RETURNING id`,
    [a.provider, a.label ?? null, encryptSecret(a.secret), a.priority ?? 100]
  );
  return rows[0].id;
}

/** Admin listing — masked, never the plaintext secret. */
export async function listApiKeys() {
  if (!USE_PG) return [];
  const { rows } = await pool!.query(
    `SELECT id, provider, label, secret, enabled, priority, last_used_at, fail_count, created_at
       FROM api_keys ORDER BY provider, priority`
  );
  return rows.map((r) => {
    let masked = "••••";
    try { masked = maskKey(decryptSecret(r.secret)); } catch { masked = "(unreadable — AUTH_SECRET changed?)"; }
    return { ...r, secret: undefined, masked };
  });
}

/** Plaintext keys for a provider, best-priority first. Used by the LLM router. */
export async function getApiKeys(provider: string): Promise<string[]> {
  if (!USE_PG) return [];
  const { rows } = await pool!.query(
    `SELECT secret FROM api_keys WHERE provider = $1 AND enabled = true ORDER BY priority, created_at`,
    [provider]
  );
  const out: string[] = [];
  for (const r of rows) {
    try { out.push(decryptSecret(r.secret)); } catch { /* key predates the current AUTH_SECRET */ }
  }
  return out;
}

export async function setApiKeyEnabled(id: string, enabled: boolean) {
  if (!USE_PG) return;
  await pool!.query(`UPDATE api_keys SET enabled = $2 WHERE id = $1`, [id, enabled]);
}

export async function deleteApiKey(id: string) {
  if (!USE_PG) return;
  await pool!.query(`DELETE FROM api_keys WHERE id = $1`, [id]);
}

export async function insertBirthProfile(p: BirthProfileInput, ownerId?: string, deviceId?: string): Promise<string> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `INSERT INTO birth_profiles
         (name, date_of_birth, time_of_birth, place_of_birth, latitude, longitude, timezone, gender, language, owner_id, device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [p.name, p.date_of_birth, p.time_of_birth, p.place_of_birth, p.latitude, p.longitude, p.timezone, p.gender ?? null, p.language, ownerId ?? null, deviceId ?? null]
    );
    return rows[0].id;
  }
  const id = randomUUID();
  fileData.birth_profiles[id] = { id, owner_id: ownerId ?? null, device_id: deviceId ?? null, ...p, created_at: nowIso() };
  saveFile();
  return id;
}

export async function insertChartCalculation(args: {
  birthProfileId: string;
  provider: string;
  normalized: any;
  raw: unknown;
  validationStatus: string;
  ownerId?: string;
  deviceId?: string;
}): Promise<string> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `INSERT INTO chart_calculations
         (birth_profile_id, provider, normalized_chart_json, raw_provider_json, validation_status, owner_id, device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [args.birthProfileId, args.provider, JSON.stringify(args.normalized), JSON.stringify(args.raw), args.validationStatus, args.ownerId ?? null, args.deviceId ?? null]
    );
    return rows[0].id;
  }
  const id = randomUUID();
  fileData.chart_calculations[id] = {
    id,
    owner_id: args.ownerId ?? null,
    device_id: args.deviceId ?? null,
    birth_profile_id: args.birthProfileId,
    provider: args.provider,
    normalized_chart_json: args.normalized,
    raw_provider_json: args.raw,
    validation_status: args.validationStatus,
    created_at: nowIso(),
  };
  saveFile();
  return id;
}

export async function getNormalizedChart(chartId: string): Promise<any | null> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT normalized_chart_json, validation_status, owner_id, device_id
         FROM chart_calculations WHERE id = $1`,
      [chartId]
    );
    if (!rows[0]) return null;
    const chart = rows[0].normalized_chart_json;
    chart.chart_id = chartId;
    chart.validation_status = rows[0].validation_status;
    // Carried so callers can authorize access to this chart.
    chart.owner_id = rows[0].owner_id ?? null;
    chart.device_id = rows[0].device_id ?? null;
    return chart;
  }
  const row = fileData.chart_calculations[chartId];
  if (!row) return null;
  const chart = row.normalized_chart_json;
  chart.chart_id = chartId;
  chart.validation_status = row.validation_status;
  chart.owner_id = row.owner_id ?? null;
  return chart;
}

/**
 * Charts visible to one identity.
 *
 * The Postgres path used to ignore `ownerId` entirely and return every chart in
 * the table, so any signed-in user saw everyone else's kundlis. It now filters
 * by account, falling back to the anonymous install id when there is no
 * account, and only returns everything when neither is given (admin).
 */
/**
 * Charts belonging to a user or device.
 *
 * `all` must be passed explicitly (admin only). Without it, a caller with no
 * identity gets an EMPTY list — previously it fell through to a query with no
 * WHERE clause, so an unauthenticated `GET /api/profiles` returned every
 * chart in the database (each person's name, date of birth and chart id).
 */
export async function listProfiles(
  ownerId?: string,
  deviceId?: string,
  all = false,
): Promise<Array<{ id: string; name: string; date: string }>> {
  if (!all && !ownerId && !deviceId) return [];
  if (USE_PG) {
    const where = ownerId
      ? { sql: `WHERE c.owner_id = $1`, args: [ownerId] }
      : deviceId
      ? { sql: `WHERE c.owner_id IS NULL AND c.device_id = $1`, args: [deviceId] }
      : { sql: ``, args: [] as any[] };
    const { rows } = await pool!.query(
      `SELECT c.id AS id, b.name AS name, b.date_of_birth AS date
         FROM chart_calculations c JOIN birth_profiles b ON b.id = c.birth_profile_id
         ${where.sql}
        ORDER BY c.created_at DESC`,
      where.args
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date),
    }));
  }
  return Object.values(fileData.chart_calculations)
    // Each user sees only their own charts (admin passes no ownerId → all).
    .filter((c) => (ownerId ? c.owner_id === ownerId : deviceId ? !c.owner_id && c.device_id === deviceId : true))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((c) => {
      const profile = fileData.birth_profiles[c.birth_profile_id] || {};
      return { id: c.id, name: profile.name ?? "", date: profile.date_of_birth ?? "" };
    });
}

export async function deleteChart(chartId: string): Promise<void> {
  if (USE_PG) {
    await pool!.query(
      `DELETE FROM birth_profiles
        WHERE id = (SELECT birth_profile_id FROM chart_calculations WHERE id = $1)`,
      [chartId]
    );
    return;
  }
  const chart = fileData.chart_calculations[chartId];
  if (!chart) return;
  const profileId = chart.birth_profile_id;
  // Remove the profile, its charts, and dependent reports/messages.
  delete fileData.birth_profiles[profileId];
  const removedChartIds = new Set<string>();
  for (const [id, c] of Object.entries(fileData.chart_calculations)) {
    if ((c as any).birth_profile_id === profileId) {
      removedChartIds.add(id);
      delete fileData.chart_calculations[id];
    }
  }
  fileData.ai_reports = fileData.ai_reports.filter((r) => !removedChartIds.has(r.chart_id));
  fileData.chat_messages = fileData.chat_messages.filter((m) => !removedChartIds.has(m.chart_id));
  if (fileData.chat_memory) for (const id of removedChartIds) delete fileData.chat_memory[id];
  saveFile();
}

export async function insertReport(args: {
  chartId: string;
  report: unknown;
  language: string;
}): Promise<string> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `INSERT INTO ai_reports (chart_id, report_json, language) VALUES ($1,$2,$3) RETURNING id`,
      [args.chartId, JSON.stringify(args.report), args.language]
    );
    return rows[0].id;
  }
  const id = randomUUID();
  fileData.ai_reports.push({
    id,
    chart_id: args.chartId,
    report_json: args.report,
    language: args.language,
    created_at: nowIso(),
  });
  saveFile();
  return id;
}

export async function getLatestReport(chartId: string): Promise<any | null> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT report_json FROM ai_reports WHERE chart_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [chartId]
    );
    return rows[0] ? rows[0].report_json : null;
  }
  const reports = fileData.ai_reports.filter((r) => r.chart_id === chartId);
  return reports.length ? reports[reports.length - 1].report_json : null;
}

/** Most recent cached report for a chart in a specific language (for caching). */
export async function getReport(chartId: string, language: string): Promise<any | null> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT report_json FROM ai_reports WHERE chart_id = $1 AND language = $2 ORDER BY created_at DESC LIMIT 1`,
      [chartId, language]
    );
    return rows[0] ? rows[0].report_json : null;
  }
  const reports = fileData.ai_reports.filter(
    (r) => r.chart_id === chartId && r.language === language
  );
  return reports.length ? reports[reports.length - 1].report_json : null;
}

export async function insertChatMessage(args: {
  chartId: string;
  role: "user" | "assistant";
  message: string | null;
  context?: string; // which chat surface: "ask" | "sector" | "transit"
  responseJson?: unknown;
}): Promise<void> {
  const context = args.context ?? "ask";
  if (USE_PG) {
    await pool!.query(
      `INSERT INTO chat_messages (chart_id, role, message, context, response_json) VALUES ($1,$2,$3,$4,$5)`,
      [args.chartId, args.role, args.message, context, args.responseJson === undefined ? null : JSON.stringify(args.responseJson)]
    );
    return;
  }
  fileData.chat_messages.push({
    id: randomUUID(),
    chart_id: args.chartId,
    role: args.role,
    message: args.message,
    context,
    response_json: args.responseJson ?? null,
    created_at: nowIso(),
  });
  saveFile();
}

export async function getChatHistory(
  chartId: string,
  context?: string
): Promise<Array<{ role: string; message: string | null; created_at: string }>> {
  if (USE_PG) {
    const { rows } = context
      ? await pool!.query(
          `SELECT role, message, created_at FROM chat_messages WHERE chart_id = $1 AND context = $2 ORDER BY created_at ASC`,
          [chartId, context]
        )
      : await pool!.query(
          `SELECT role, message, created_at FROM chat_messages WHERE chart_id = $1 ORDER BY created_at ASC`,
          [chartId]
        );
    return rows.map((r) => ({
      role: r.role,
      message: r.message,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }
  return fileData.chat_messages
    .filter((m) => m.chart_id === chartId)
    // Treat older rows with no context as "ask" so they stay in the Ask AI chat.
    .filter((m) => (context ? (m.context ?? "ask") === context : true))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .map((m) => ({ role: m.role, message: m.message, created_at: m.created_at }));
}

/** Clear a chat thread (one context, or all contexts for the chart) — "New chat". */
export async function clearChatHistory(chartId: string, context?: string): Promise<void> {
  if (USE_PG) {
    if (context) await pool!.query(`DELETE FROM chat_messages WHERE chart_id = $1 AND context = $2`, [chartId, context]);
    else await pool!.query(`DELETE FROM chat_messages WHERE chart_id = $1`, [chartId]);
    return;
  }
  fileData.chat_messages = fileData.chat_messages.filter(
    (m) => m.chart_id !== chartId || (context ? (m.context ?? "ask") !== context : false),
  );
  saveFile();
}

// ---------------------------------------------------------------------------
// Feedback / ratings. Positive + approved ones surface as website testimonials.
// ---------------------------------------------------------------------------
export async function insertFeedback(args: {
  userId?: string | null;
  deviceId?: string | null;
  name?: string | null;
  rating: number;
  comment?: string | null;
  context?: string | null;
  // A 5★/4★ comment with real words is auto-approved so it shows on the site
  // without waiting for the admin; the admin can still reject it later.
  approved?: boolean;
}): Promise<string> {
  const rating = Math.max(1, Math.min(5, Math.round(args.rating)));
  const approved = args.approved ?? false;
  if (USE_PG) {
    const { rows } = await pool!.query(
      `INSERT INTO feedback (user_id, device_id, name, rating, comment, context, approved)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [args.userId ?? null, args.deviceId ?? null, args.name ?? null, rating,
       args.comment ?? null, args.context ?? null, approved],
    );
    return rows[0].id;
  }
  const id = randomUUID();
  fileData.feedback.push({
    id, user_id: args.userId ?? null, device_id: args.deviceId ?? null,
    name: args.name ?? null, rating, comment: args.comment ?? null,
    context: args.context ?? null, approved, created_at: nowIso(),
  });
  saveFile();
  return id;
}

/** Approved, positive feedback with a real comment — the public testimonial wall. */
export async function getTestimonials(limit = 24): Promise<any[]> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT id, name, rating, comment, context, created_at FROM feedback
        -- A 4-5 star rating counts as a testimonial even with no words: plenty
        -- of people tap the stars and never type. The wall shows their rating
        -- and name; the card just renders without a quote.
        WHERE approved = true AND rating >= 4
        ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }
  return fileData.feedback
    .filter((f) => f.approved && f.rating >= 4)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit)
    .map(({ id, name, rating, comment, context, created_at }) => ({ id, name, rating, comment, context, created_at }));
}

/** All feedback, newest first — admin moderation view. */
export async function getAllFeedback(limit = 200): Promise<any[]> {
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT id, user_id, device_id, name, rating, comment, context, approved, created_at
         FROM feedback ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return rows;
  }
  return [...fileData.feedback]
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);
}

/** Approve or reject a single feedback row (admin). Returns false if not found. */
export async function setFeedbackApproved(id: string, approved: boolean): Promise<boolean> {
  if (USE_PG) {
    const { rowCount } = await pool!.query(
      `UPDATE feedback SET approved = $2 WHERE id = $1`, [id, approved],
    );
    return (rowCount ?? 0) > 0;
  }
  const row = fileData.feedback.find((f) => f.id === id);
  if (!row) return false;
  row.approved = approved;
  saveFile();
  return true;
}

export async function deleteFeedback(id: string): Promise<boolean> {
  if (USE_PG) {
    const { rowCount } = await pool!.query(`DELETE FROM feedback WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  }
  const before = fileData.feedback.length;
  fileData.feedback = fileData.feedback.filter((f) => f.id !== id);
  if (fileData.feedback.length === before) return false;
  saveFile();
  return true;
}

// new Date() is fine here (server runtime, not a workflow script).
function nowIso(): string {
  return new Date().toISOString();
}
