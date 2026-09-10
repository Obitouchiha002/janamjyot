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
export const USE_PG = connectionString.length > 0;

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
  // Dev-only mirrors of the credit tables. Production cannot reach these: the
  // startup checks refuse to boot without DATABASE_URL, so the file store only
  // ever runs locally. That is what makes a simpler, non-transactional
  // implementation acceptable here.
  payments: any[];
  credit_ledger: any[];
  deliveries: any[];
  trials: Record<string, { started_at: string; ends_at: string }>;
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
  payments: [],
  credit_ledger: [],
  deliveries: [],
  trials: {},
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
      fileData.payments ??= [];
      fileData.credit_ledger ??= [];
      fileData.deliveries ??= [];
      fileData.trials ??= {};
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
-- ₹1 / 3-day trial. Deliberately NOT modelled as expiring credits: mixing
-- expiring and permanent credits in one balance forces a spend-order rule and
-- produces "my credits vanished" disputes. A time window is its own thing,
-- with a date the user can see, and it keeps "credits never expire" literally
-- true. trial_started_at is set once and never cleared, so the trial cannot
-- be taken twice on one account.
-- Refer & earn. The code is this account's own; referred_by records who sent
-- them. referral_settled exists because the referrer's reward is NOT paid the
-- moment a row appears: anyone can type an email address, and paying on signup
-- alone would let one person mint credits from accounts they invented. It is
-- paid when the referred account proves it holds its inbox — an emailed code or
-- a Google sign-in — which is the same standard admin uses.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_code    TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referred_by      UUID REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS referral_settled BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON app_users(referral_code) WHERE referral_code IS NOT NULL;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ;

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

-- What the PERSON has told us about their life, as opposed to what a chart
-- suggests. Separate from chat_memory (prose the model writes for itself)
-- because these are load-bearing: a confirmed fact outranks any astrological
-- inference, and something that outranks inference cannot live inside a
-- paragraph the model rewrites each turn.
--
-- Asked "meri shaadi kab hogi?" by someone who said last week they married in
-- 2021, the app answered with a future date. It was not missing intelligence,
-- it was missing a place to keep what it had already been told.
CREATE TABLE IF NOT EXISTS chart_facts (
  chart_id   UUID PRIMARY KEY REFERENCES chart_calculations(id) ON DELETE CASCADE,
  -- { marital_status: "married", marriage_year: 2021, children: 1, ... }
  facts      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- ── Credits ────────────────────────────────────────────────────────────────
-- 1 credit = ₹1. Three tables, and the split matters:
--
--   payments       what the user paid for      (money in)
--   credit_ledger  every movement of credits   (append-only, the truth)
--   deliveries     what a spend produced       (proof for disputes)
--
-- The balance is DERIVED from the ledger, never stored as a mutable column.
-- A stored balance can drift from its history, and once it drifts you cannot
-- tell whether the user or the code was wrong. Summing an append-only log
-- cannot drift, and it answers "where did my credits go?" exactly.
--
-- Nothing here is ever UPDATEd for business reasons and nothing is DELETEd. A
-- refund is a new negative row, not an erased positive one.
CREATE TABLE IF NOT EXISTS payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  provider            TEXT NOT NULL DEFAULT 'razorpay',
  -- The order we created. UNIQUE so one checkout can only ever grant once.
  provider_order_id   TEXT UNIQUE NOT NULL,
  -- Set when the payment is captured. UNIQUE makes a replayed webhook a no-op.
  provider_payment_id TEXT UNIQUE,
  amount_paise        INTEGER NOT NULL CHECK (amount_paise > 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  pack_id             TEXT NOT NULL,
  credits             INTEGER NOT NULL CHECK (credits >= 0),
  status              TEXT NOT NULL DEFAULT 'created',  -- created|paid|failed|refunded
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id, created_at DESC);
-- Set when money was taken but nothing could be given (e.g. a second trial
-- payment for an account that already used its trial). Surfaced in admin so
-- a person refunds it, rather than it being quietly kept.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS needs_refund BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS settled_at   TIMESTAMPTZ;
-- The ₹1 trial is a real payment that buys ACCESS for three days, not credits,
-- so its row is worth 0 credits. The original CHECK (credits > 0) rejected it
-- and the order failed with a 500 before Razorpay was ever opened.
-- Dropped by lookup rather than by guessing the auto-generated name: if the
-- original constraint were named anything else the DROP would silently no-op
-- and the ₹1 trial would keep failing.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'payments'
       AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) ILIKE '%credits%'
  LOOP
    EXECUTE format('ALTER TABLE payments DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE payments ADD CONSTRAINT payments_credits_check CHECK (credits >= 0);
END $$;

CREATE TABLE IF NOT EXISTS credit_ledger (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  delta         INTEGER NOT NULL,          -- + granted, − spent
  reason        TEXT NOT NULL,             -- purchase|spend|refund|bonus|signup|admin
  ref_type      TEXT,                      -- payment|delivery
  ref_id        TEXT,
  note          TEXT,
  -- Kept for auditing: recompute the sum and it must match, row for row.
  balance_after INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id, id DESC);
-- One ledger row per payment, enforced by the database rather than by trusting
-- the code path: a duplicated webhook cannot grant twice even if it slips past
-- the application check.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_payment_once
  ON credit_ledger(ref_id) WHERE ref_type = 'payment';

CREATE TABLE IF NOT EXISTS deliveries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
  kind       TEXT NOT NULL,                -- life_report|report|chat|matching|chart
  chart_id   UUID,
  credits    INTEGER NOT NULL,
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deliveries_user ON deliveries(user_id, created_at DESC);

-- One row per billable action. This is both the quota counter and the
-- analytics source, so quotas can never drift from what was actually served.
CREATE TABLE IF NOT EXISTS usage_events (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID,
  device_id  TEXT,
  action     TEXT NOT NULL,   -- 'chart' | 'report' | 'ask' | 'match' | 'daily'
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- What every AI generation would have cost at list price, whoever served it.
-- The chain runs on free tiers today; that is a discount, not a business model,
-- and a product priced against zero discovers its real margin on the day the
-- discount stops. Costed here so the answer exists before it is needed.
CREATE TABLE IF NOT EXISTS ai_calls (
  id         BIGSERIAL PRIMARY KEY,
  provider   TEXT NOT NULL,
  purpose    TEXT NOT NULL,
  in_tokens  INTEGER NOT NULL DEFAULT 0,
  out_tokens INTEGER NOT NULL DEFAULT 0,
  -- Paid-equivalent, in paise. Free calls are costed too, or the number lies.
  cost_paise INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  -- 1 = the first provider answered. Higher means the ones before it failed.
  attempt    SMALLINT NOT NULL DEFAULT 1,
  ok         BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- No prompt, no answer, no user id: costing needs none of them, and a table
-- that does not hold private text cannot leak it.
CREATE INDEX IF NOT EXISTS idx_ai_calls_time ON ai_calls(created_at DESC);
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
export type QuotaAction = "chart" | "report" | "ask" | "match" | "daily";

export interface Quotas {
  /** Total saved charts allowed. */
  chart: number;
  /** Life reports per rolling 30 days. */
  report: number;
  /** AI questions per day. */
  ask: number;
  /** Kundli matches per day. */
  match: number;
  /** Everyday readings (Today, daily guidance, today-plan, timeline) per day.
   *  A fair-use ceiling on AI spend, not a product limit — set high enough
   *  that ordinary use never sees it. */
  daily: number;
}

/** -1 means unlimited. Tuned for free AI provider quotas — accuracy over volume. */
export const PLANS: Record<PlanId, Quotas> = {
  // Free: questions and matches counted per WEEK (see PLAN_WINDOW) — enough to
  // judge the app, not enough to live in it. Daily readings stay per-day and
  // generous, because they are the habit worth building and cost us almost
  // nothing to serve.
  free: { chart: 2, report: 2, ask: 5, match: 3, daily: 40 },
  pro: { chart: 25, report: 20, ask: 100, match: 25, daily: 200 },
  unlimited: { chart: -1, report: -1, ask: -1, match: -1, daily: -1 },
};

/** A rolling window. `total` is a lifetime cap, not a rate. */
export type QuotaWindow = "day" | "week" | "month" | "total";

/**
 * How long a plan's allowance is counted over — which is a product decision,
 * not a technical one, and differs by plan.
 *
 * Free counts questions and matches per WEEK. Fifteen a DAY is more than almost
 * anyone asks, so the free plan answered every real need and nobody ever had a
 * reason to pay. Fifteen a MONTH went too far the other way — someone who tries
 * the app properly in week one is then locked out for three weeks, which reads
 * as broken rather than as a limit. A week refills often enough to keep the
 * habit alive and still runs out for anyone actually leaning on it.
 *
 * A paid plan is the opposite: it should feel unmetered day to day, so its
 * allowances stay per-day.
 */
export const PLAN_WINDOW: Record<PlanId, Partial<Record<QuotaAction, QuotaWindow>>> = {
  free: { ask: "week", match: "week" },
  pro: {},
  unlimited: {},
};

/** Window for an action on a given plan; the table below is the default. */
export function windowFor(action: QuotaAction, plan: PlanId = "free"): QuotaWindow {
  return PLAN_WINDOW[plan]?.[action] ?? QUOTA_WINDOW[action];
}

/** The window each quota is counted over. `chart` is a lifetime cap, not a rate. */
export const QUOTA_WINDOW: Record<QuotaAction, QuotaWindow> = {
  chart: "total",
  report: "month",
  ask: "day",
  match: "day",
  // The everyday surfaces (Today, daily guidance, today-plan, timeline) are a
  // separate, generous per-DAY bucket. They were briefly metered as "report",
  // which is 2 per MONTH on free — so simply opening the Home screen twice
  // exhausted the user's actual life-report allowance and then 429'd the Home
  // card itself. These need a ceiling against runaway AI spend, not a budget.
  daily: "day",
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

/**
 * Move a device's guest charts into a user account.
 *
 * Guest charts are bound to `device_id`, which lives in app storage — so
 * uninstalling the app (or clearing its data) generates a new id and the old
 * charts become invisible even though they're still here. Attaching them to an
 * account on sign-in makes them survive any reinstall, on any phone.
 *
 * Returns how many charts were adopted.
 */
export async function claimDeviceCharts(userId: string, deviceId?: string): Promise<number> {
  if (!userId || !deviceId) return 0;
  if (USE_PG) {
    const { rowCount } = await pool!.query(
      `UPDATE chart_calculations SET owner_id = $1
        WHERE device_id = $2 AND owner_id IS NULL`,
      [userId, deviceId],
    );
    await pool!.query(
      `UPDATE birth_profiles SET owner_id = $1
        WHERE owner_id IS NULL AND id IN (
          SELECT birth_profile_id FROM chart_calculations WHERE owner_id = $1
        )`,
      [userId],
    ).catch(() => {}); // birth_profiles may not carry owner_id in older schemas
    return rowCount ?? 0;
  }
  let n = 0;
  for (const c of Object.values(fileData.chart_calculations) as any[]) {
    if (c.device_id === deviceId && !c.owner_id) { c.owner_id = userId; n++; }
  }
  if (n) saveFile();
  return n;
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

/**
 * What this person has told us about their own life.
 *
 * Kept apart from chat_memory on purpose. Memory is prose the model writes for
 * itself and rewrites every turn; these are load-bearing claims made by the
 * person, and the whole point is that they OUTRANK anything the chart suggests.
 * Something that outranks inference cannot live inside a paragraph that
 * inference is free to edit.
 */
export type ChartFacts = Record<string, string | number | boolean>;

export async function getChartFacts(chartId: string): Promise<ChartFacts> {
  if (USE_PG) {
    const { rows } = await pool!.query(`SELECT facts FROM chart_facts WHERE chart_id = $1`, [chartId]);
    return (rows[0]?.facts ?? {}) as ChartFacts;
  }
  return ((fileData as any).chart_facts?.[chartId] ?? {}) as ChartFacts;
}

/**
 * Merge in what was just confirmed. Newer wins: someone who says today they
 * are married is married, whatever they or the chart implied last month —
 * "the newest confirmed fact overrides" is the rule that keeps a long
 * conversation from arguing with itself.
 */
export async function mergeChartFacts(chartId: string, patch: ChartFacts): Promise<ChartFacts> {
  const clean: ChartFacts = {};
  for (const [k, v] of Object.entries(patch ?? {})) {
    const key = String(k).trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40);
    if (!key || v === null || v === undefined || v === "") continue;
    clean[key] = typeof v === "string" ? v.slice(0, 120) : v;
  }
  if (!Object.keys(clean).length) return getChartFacts(chartId);

  if (USE_PG) {
    const { rows } = await pool!.query(
      `INSERT INTO chart_facts (chart_id, facts, updated_at) VALUES ($1, $2::jsonb, now())
       ON CONFLICT (chart_id) DO UPDATE
         SET facts = chart_facts.facts || $2::jsonb, updated_at = now()
       RETURNING facts`,
      [chartId, JSON.stringify(clean)],
    );
    return (rows[0]?.facts ?? {}) as ChartFacts;
  }
  (fileData as any).chart_facts ??= {};
  const merged = { ...((fileData as any).chart_facts[chartId] ?? {}), ...clean };
  (fileData as any).chart_facts[chartId] = merged;
  saveFile();
  return merged;
}

/** Forget facts by key — used when a linked person (Rishta) is unlinked. */
export async function removeChartFacts(chartId: string, keys: string[]): Promise<void> {
  if (USE_PG) {
    await pool!.query(
      `UPDATE chart_facts SET facts = facts - $2::text[], updated_at = now() WHERE chart_id = $1`,
      [chartId, keys],
    );
    return;
  }
  const cur = (fileData as any).chart_facts?.[chartId];
  if (!cur) return;
  for (const k of keys) delete cur[k];
  saveFile();
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
      // Aggregated once per table and joined, not three correlated subqueries
      // per row. At 500 rows that was 1,500 extra queries for one screen, which
      // is what made the admin users list crawl.
      `SELECT u.id, u.name, u.email, u.role, u.plan, u.status, u.status_reason,
              u.limits_json, u.created_at, u.last_seen_at,
              COALESCE(c.n, 0)::int AS charts,
              COALESCE(a.n, 0)::int AS asks_30d,
              -- Balance is always derived from the ledger, never a stored column,
              -- so the number the admin sees can never drift from the truth.
              COALESCE(l.n, 0)::int AS credits
         FROM app_users u
         LEFT JOIN (SELECT owner_id, count(*) AS n FROM chart_calculations GROUP BY owner_id) c
                ON c.owner_id = u.id
         LEFT JOIN (SELECT user_id, count(*) AS n FROM usage_events
                     WHERE action = 'ask' AND created_at > now() - interval '30 days'
                     GROUP BY user_id) a
                ON a.user_id = u.id
         LEFT JOIN (SELECT user_id, SUM(delta) AS n FROM credit_ledger GROUP BY user_id) l
                ON l.user_id = u.id
        WHERE ($1 = '%%' OR lower(u.email) LIKE $1 OR lower(u.name) LIKE $1)
        ORDER BY u.created_at DESC
        LIMIT 200`,
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
    // Usage rows are ANONYMISED, not deleted: the account link and the detail
    // go, and only "this phone did N of X at time T" stays. Deleting them made
    // "delete my account, sign up again" a way to reset every free limit.
    await pool!.query(`UPDATE usage_events SET user_id = NULL, meta = NULL WHERE user_id = $1`, [id]);
    // Feedback carries their name + free-text comment (and may be published as a
    // testimonial), so it must go too — otherwise "delete my account" would
    // leave their words and name on the public site.
    await pool!.query(`DELETE FROM feedback WHERE user_id = $1`, [id]);
    if (email) await pool!.query(`DELETE FROM login_codes WHERE email = $1`, [email]);

    // Money rows (payments, credit_ledger, deliveries) are FK'd ON DELETE
    // RESTRICT and must be KEPT: they are the tax/audit trail and the only way
    // to answer "where did my credits go?" in a dispute. So if this account ever
    // touched money we ANONYMISE it instead of deleting it — every personal
    // field is scrubbed, so the person is gone, while the financial history
    // stays attached to an id that no longer identifies anybody.
    //
    // Without this, "delete my account" fails with a foreign-key error for
    // every customer who has ever paid — i.e. exactly the promise the app and
    // the privacy policy make would break the moment payments went live.
    const { rows: fin } = await pool!.query(
      `SELECT (SELECT count(*) FROM payments      WHERE user_id = $1)
            + (SELECT count(*) FROM credit_ledger WHERE user_id = $1)
            + (SELECT count(*) FROM deliveries    WHERE user_id = $1) AS n`,
      [id],
    );
    if (Number(fin[0]?.n ?? 0) > 0) {
      await pool!.query(
        `UPDATE app_users
            SET email = 'deleted+' || id::text || '@deleted.invalid',
                name = 'Deleted user',
                password_hash = NULL, google_sub = NULL, avatar_url = NULL,
                limits_json = NULL, status = 'deleted',
                status_reason = 'deleted by user'
          WHERE id = $1`,
        [id],
      );
      return;
    }
    await pool!.query(`DELETE FROM app_users WHERE id = $1`, [id]);
    return;
  }
  const gone = fileData.users.find((u) => u.id === id);
  fileData.feedback = (fileData.feedback ?? []).filter((f: any) => f.user_id !== id);
  if (gone?.email) {
    fileData.login_codes = (fileData.login_codes ?? []).filter((c: any) => c.email !== gone.email);
  }
  // Same rule as Postgres: keep the money trail, remove the person.
  const hasMoney =
    (fileData.payments ?? []).some((r: any) => r.user_id === id) ||
    (fileData.credit_ledger ?? []).some((r: any) => r.user_id === id) ||
    (fileData.deliveries ?? []).some((r: any) => r.user_id === id);
  if (hasMoney && gone) {
    gone.email = `deleted+${id}@deleted.invalid`;
    gone.name = "Deleted user";
    gone.password_hash = null; gone.google_sub = null; gone.avatar_url = null;
    gone.limits_json = null; gone.status = "deleted"; gone.status_reason = "deleted by user";
  } else {
    fileData.users = fileData.users.filter((u) => u.id !== id);
  }
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

// ── Credits ────────────────────────────────────────────────────────────────

/**
 * What each paid action costs, in credits (1 credit = ₹1).
 *
 * Only AI-backed work is priced. Everything the engine computes locally —
 * panchang, choghadiya, hora, muhurat, the charts themselves, dashas, yogas —
 * costs us nothing to serve, so it stays free however often it is used. That
 * is also the better product: the free tier is genuinely useful every day,
 * which is what brings people back, and the paid tier is the deep reading.
 */
/**
 * Refer & earn. Both sides are paid in credits, never cash, so the whole thing
 * settles inside our own ledger and can be audited row by row.
 */
export const REFERRAL = {
  /** Paid to the person who shared the code, once their invitee is verified. */
  referrer: 30,
  /** Paid to the new account immediately for using a code. */
  invitee: 10,
  /**
   * Most referrals anyone can be paid for. Someone sharing with friends and
   * family will not reach this; someone farming addresses hits it on day one,
   * which turns an unbounded leak into a known, small maximum.
   */
  maxPaid: 20,
} as const;

export const CREDIT_PRICES: Record<string, number> = {
  chat: 1,          // one question and its answer
  life_report: 29,  // the long report + PDF
  report: 19,       // a focused report (career, wealth, marriage…)
  matching: 19,     // full Ashtakoot + PDF
  timeline: 15,
  chart: 10,        // a kundli beyond the free ones
};

/**
 * The ₹1 trial: three days of the paid features, once per account.
 *
 * Generous but bounded. "Unlimited for 3 days" reads better on the page, but a
 * life report is the most expensive call the app makes and somebody will run
 * fifty of them — for one rupee. These caps are far above what a real person
 * uses in three days and far below what an abuser needs to be worth it.
 *
 * It does NOT auto-renew. An auto-renewing ₹1 trial is the single biggest
 * source of chargebacks and "they charged me without asking" complaints in
 * India, and avoiding it also avoids the whole mandate/e-mandate apparatus.
 */
export const TRIAL = {
  paise: 100,
  days: 3,
  limits: { life_report: 5, chat: 100, matching: 5, report: 5, timeline: 5, chart: 5 },
} as const;

export interface TrialState {
  active: boolean;
  used: boolean;
  endsAt: string | null;
}

/** Unambiguous alphabet: no O/0, I/1/L — codes get read aloud and retyped. */
const CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXYZ2346789";

/** This account's code, created on first use and stable afterwards. */
/**
 * The launch funnel: signup → kundli → first chat → second chat → came back
 * the next day → paid.
 *
 * DERIVED from what already happened rather than counted by new tracking calls.
 * A separate events table would need every path to remember to write to it, and
 * the first one that forgot would quietly make the numbers wrong — the same
 * class of bug as a price nobody charged. Everything here is a consequence of
 * rows we already write for other reasons, so it is true by construction and it
 * works retroactively for people who signed up before anyone thought to measure.
 *
 * Counted over a signup cohort: "of the people who joined in this window, how
 * far did they get" — not "how many events happened", which flatters itself.
 */
export interface FunnelStep {
  key: string; label: string; users: number;
  /** A locked decision threshold: `pct` of the users at step `base`. */
  target?: { pct: number; base: string };
}

export async function funnelStats(days = 30): Promise<{ days: number; signups: number; steps: FunnelStep[] }> {
  if (!USE_PG) return { days, signups: 0, steps: [] };
  const { rows } = await pool!.query(
    `WITH cohort AS (
       SELECT id FROM app_users
        WHERE created_at > now() - ($1 || ' days')::interval
          AND status <> 'deleted'
     ),
     acts AS (
       SELECT e.user_id,
              count(*) FILTER (WHERE e.action = 'chart')            AS charts,
              count(*) FILTER (WHERE e.action = 'ask')              AS asks,
              count(DISTINCT date_trunc('day', e.created_at))       AS active_days
         FROM usage_events e
         JOIN cohort c ON c.id = e.user_id
        GROUP BY e.user_id
     ),
     pays AS (
       SELECT DISTINCT p.user_id FROM payments p
         JOIN cohort c ON c.id = p.user_id
        WHERE p.status = 'paid'
     )
     SELECT (SELECT count(*) FROM cohort)::int                                        AS signups,
            (SELECT count(*) FROM acts WHERE charts > 0)::int                         AS kundli_created,
            (SELECT count(*) FROM acts WHERE asks   > 0)::int                         AS first_chat,
            (SELECT count(*) FROM acts WHERE asks   > 1)::int                         AS second_chat,
            (SELECT count(*) FROM acts WHERE asks   > 2)::int                         AS third_chat,
            (SELECT count(*) FROM acts WHERE active_days > 1)::int                    AS returned,
            (SELECT count(*) FROM pays)::int                                          AS paid`,
    [days],
  );
  const r = rows[0] ?? {};
  return {
    days,
    signups: r.signups ?? 0,
    /*
     * Decision thresholds for the first hundred strangers, LOCKED here before
     * the data arrives. They are the founder's own numbers, not industry
     * benchmarks, and they live in code on purpose: once results come in there
     * is a strong pull to decide the targets were always whatever was hit.
     * Changing one now takes a commit with a reason attached — which is the
     * point.
     */
    steps: [
      { key: "signup",   label: "Signed up",        users: r.signups ?? 0 },
      { key: "kundli",   label: "Made a kundli",    users: r.kundli_created ?? 0, target: { pct: 60, base: "signup" } },
      { key: "chat1",    label: "Asked once",       users: r.first_chat ?? 0,     target: { pct: 40, base: "kundli" } },
      { key: "chat2",    label: "Asked again",      users: r.second_chat ?? 0 },
      { key: "chat3",    label: "Asked 3+ times",   users: r.third_chat ?? 0,     target: { pct: 25, base: "chat1" } },
      { key: "returned", label: "Came back",        users: r.returned ?? 0 },
      { key: "paid",     label: "Paid",             users: r.paid ?? 0,           target: { pct: 5,  base: "signup" } },
    ],
  };
}

/**
 * The rest of the scoreboard: retention, money per paying person, and — the one
 * that decides the product's direction — what people actually pay ABOUT.
 *
 * "Which pack sells best" is a pricing question and a small one. "Seventy per
 * cent of our revenue is marriage questions" is a different company: it says
 * what to build next, what to write on the landing page, and who to go and
 * find. That answer only exists if every spend records its subject at the time,
 * which is why settleCharge carries meta.category.
 *
 * `purchased vs consumed` is here because credits bought and never spent are
 * not a healthy sign. Someone who pays and then does not come back has told us
 * the purchase was hope, not habit — and that shows up here long before it
 * shows up in churn.
 */
export async function moneyStats(days = 60) {
  if (!USE_PG) return null;
  const [ret, rev, cat, flow] = await Promise.all([
    pool!.query(
      `WITH cohort AS (
         SELECT id, created_at FROM app_users
          WHERE created_at > now() - ($1 || ' days')::interval AND status <> 'deleted'
       )
       SELECT count(*)::int AS n,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM usage_events e WHERE e.user_id = c.id
                 AND e.created_at > c.created_at + interval '1 day'
                 AND e.created_at < c.created_at + interval '8 days'))::int  AS back_7d,
              count(*) FILTER (WHERE EXISTS (
                SELECT 1 FROM usage_events e WHERE e.user_id = c.id
                 AND e.created_at > c.created_at + interval '7 days'
                 AND e.created_at < c.created_at + interval '31 days'))::int AS back_30d
         FROM cohort c`, [days]),
    pool!.query(
      `SELECT count(DISTINCT user_id)::int                    AS payers,
              COALESCE(SUM(amount_paise),0)::int              AS paise,
              count(*)::int                                   AS purchases
         FROM payments
        WHERE status = 'paid' AND created_at > now() - ($1 || ' days')::interval`, [days]),
    // Only spends by people who have actually paid — what FREE users spend on
    // is interest, what PAYING users spend on is the business.
    pool!.query(
      `SELECT COALESCE(d.meta->>'category', d.kind) AS subject,
              count(*)::int                          AS uses,
              SUM(d.credits)::int                    AS credits
         FROM deliveries d
        WHERE d.created_at > now() - ($1 || ' days')::interval
          AND EXISTS (SELECT 1 FROM payments p WHERE p.user_id = d.user_id AND p.status = 'paid')
        GROUP BY 1 ORDER BY credits DESC NULLS LAST LIMIT 12`, [days]),
    pool!.query(
      `SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0 AND reason = 'purchase'),0)::int AS bought,
              COALESCE(-SUM(delta) FILTER (WHERE delta < 0),0)::int                        AS spent
         FROM credit_ledger WHERE created_at > now() - ($1 || ' days')::interval`, [days]),
  ]);
  const r = ret.rows[0] ?? {}, v = rev.rows[0] ?? {}, f = flow.rows[0] ?? {};
  return {
    days,
    cohort: r.n ?? 0,
    back_7d: r.back_7d ?? 0,
    back_30d: r.back_30d ?? 0,
    payers: v.payers ?? 0,
    purchases: v.purchases ?? 0,
    revenue_rupees: Math.round((v.paise ?? 0) / 100),
    revenue_per_payer: v.payers ? Math.round((v.paise ?? 0) / 100 / v.payers) : 0,
    credits_bought: f.bought ?? 0,
    credits_spent: f.spent ?? 0,
    // What paying people spend on, biggest first.
    subjects: cat.rows,
  };
}

export async function referralCode(userId: string): Promise<string> {
  if (!USE_PG) {
    const u: any = fileData.users.find((x: any) => x.id === userId);
    if (!u) return "";
    if (!u.referral_code) { u.referral_code = "JJ" + randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(); saveFile(); }
    return u.referral_code;
  }
  const { rows } = await pool!.query(`SELECT referral_code FROM app_users WHERE id = $1`, [userId]);
  if (rows[0]?.referral_code) return rows[0].referral_code;

  // Retry on collision rather than trusting one draw — the index is the real
  // guarantee, this loop just makes hitting it survivable.
  for (let i = 0; i < 8; i++) {
    let code = "JJ";
    for (let n = 0; n < 6; n++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    try {
      const { rows: done } = await pool!.query(
        `UPDATE app_users SET referral_code = $2
          WHERE id = $1 AND referral_code IS NULL
          RETURNING referral_code`,
        [userId, code],
      );
      if (done[0]?.referral_code) return done[0].referral_code;
      // Someone set it between our read and write — take theirs.
      const { rows: again } = await pool!.query(`SELECT referral_code FROM app_users WHERE id = $1`, [userId]);
      if (again[0]?.referral_code) return again[0].referral_code;
    } catch (e: any) {
      if (e?.code !== "23505") throw e;   // not a collision — a real failure
    }
  }
  throw new Error("Could not allocate a referral code.");
}

export async function userByReferralCode(code: string): Promise<{ id: string } | null> {
  const c = code.trim().toUpperCase();
  if (!c) return null;
  if (!USE_PG) {
    const u: any = fileData.users.find((x: any) => (x.referral_code ?? "").toUpperCase() === c);
    return u ? { id: u.id } : null;
  }
  const { rows } = await pool!.query(`SELECT id FROM app_users WHERE upper(referral_code) = $1`, [c]);
  return rows[0] ?? null;
}

/**
 * Record who referred this account. Refuses a second use, a self-referral, and
 * an unknown code. Pays the invitee immediately; the referrer is paid only once
 * the invitee is verified (see settleReferral).
 */
export async function attachReferral(
  newUserId: string, code: string,
): Promise<{ ok: true; referrerId: string } | { error: string }> {
  const ref = await userByReferralCode(code);
  if (!ref) return { error: "That referral code was not recognised." };
  if (ref.id === newUserId) return { error: "You cannot use your own referral code." };

  if (!USE_PG) {
    const u: any = fileData.users.find((x: any) => x.id === newUserId);
    if (!u) return { error: "Account not found." };
    if (u.referred_by) return { error: "A referral code has already been used on this account." };
    u.referred_by = ref.id; saveFile();
  } else {
    const { rowCount } = await pool!.query(
      `UPDATE app_users SET referred_by = $2 WHERE id = $1 AND referred_by IS NULL`,
      [newUserId, ref.id],
    );
    if (!rowCount) return { error: "A referral code has already been used on this account." };
  }
  await grantCredits({
    userId: newUserId, credits: REFERRAL.invitee, reason: "bonus",
    refType: "referral", refId: `joined:${newUserId}`, note: "Joined with a referral code",
  });
  return { ok: true, referrerId: ref.id };
}

/**
 * Pay the referrer, once. Called when the referred account proves it holds its
 * inbox, which is what stops one person minting credits from invented accounts.
 * The unique ledger ref makes a second call a no-op even if this races.
 */
export async function settleReferral(userId: string): Promise<number> {
  let referrerId: string | null = null;
  if (!USE_PG) {
    const u: any = fileData.users.find((x: any) => x.id === userId);
    if (!u?.referred_by || u.referral_settled) return 0;
    u.referral_settled = true; referrerId = u.referred_by; saveFile();
  } else {
    const { rows } = await pool!.query(
      `UPDATE app_users SET referral_settled = true
        WHERE id = $1 AND referred_by IS NOT NULL AND referral_settled = false
        RETURNING referred_by`,
      [userId],
    );
    referrerId = rows[0]?.referred_by ?? null;
  }
  if (!referrerId) return 0;

  // Beyond the cap the invite still counts, but it stops paying.
  const paid = await referralStats(referrerId);
  if (paid.joined > REFERRAL.maxPaid) {
    console.log("[referral] cap reached, not paying:", referrerId);
    return 0;
  }
  await grantCredits({
    userId: referrerId, credits: REFERRAL.referrer, reason: "bonus",
    refType: "referral", refId: `referred:${userId}`, note: "Someone joined with your code",
  });
  return REFERRAL.referrer;
}

/** How this account's referrals are going, for the Refer & Earn card. */
export async function referralStats(userId: string): Promise<{ joined: number; earned: number; pending: number }> {
  if (!USE_PG) {
    const rows = fileData.users.filter((x: any) => x.referred_by === userId);
    const settled = rows.filter((x: any) => x.referral_settled).length;
    return { joined: settled, earned: settled * REFERRAL.referrer, pending: rows.length - settled };
  }
  const { rows } = await pool!.query(
    `SELECT count(*) FILTER (WHERE referral_settled)::int      AS joined,
            count(*) FILTER (WHERE NOT referral_settled)::int  AS pending
       FROM app_users WHERE referred_by = $1`,
    [userId],
  );
  const joined = rows[0]?.joined ?? 0;
  return { joined, earned: joined * REFERRAL.referrer, pending: rows[0]?.pending ?? 0 };
}

export async function trialState(userId: string): Promise<TrialState> {
  if (!USE_PG) {
    const t = fileData.trials[userId];
    if (!t) return { active: false, used: false, endsAt: null };
    return { active: new Date(t.ends_at).getTime() > Date.now(), used: true, endsAt: t.ends_at };
  }
  const { rows } = await pool!.query(
    `SELECT trial_started_at, trial_ends_at FROM app_users WHERE id = $1`,
    [userId],
  );
  const r = rows[0];
  if (!r?.trial_started_at) return { active: false, used: false, endsAt: null };
  const endsAt = r.trial_ends_at ? new Date(r.trial_ends_at) : null;
  return {
    active: !!endsAt && endsAt.getTime() > Date.now(),
    used: true,
    endsAt: endsAt ? endsAt.toISOString() : null,
  };
}

/**
 * Start the trial. Returns false if this account already had one — the guard
 * is the `trial_started_at IS NULL` in the UPDATE, so two concurrent requests
 * cannot both succeed.
 */
export async function startTrial(userId: string): Promise<boolean> {
  if (!USE_PG) {
    if (fileData.trials[userId]) return false;
    fileData.trials[userId] = {
      started_at: nowIso(),
      ends_at: new Date(Date.now() + TRIAL.days * 86400_000).toISOString(),
    };
    saveFile();
    return true;
  }
  const { rowCount } = await pool!.query(
    `UPDATE app_users
        SET trial_started_at = now(),
            trial_ends_at    = now() + ($2 || ' days')::interval
      WHERE id = $1 AND trial_started_at IS NULL`,
    [userId, TRIAL.days],
  );
  return (rowCount ?? 0) > 0;
}

export const CREDIT_PACKS: Record<string, { paise: number; credits: number; label: string }> = {
  starter: { paise: 4900,  credits: 50,  label: "50 credits" },
  popular: { paise: 14900, credits: 165, label: "165 credits" },
  value:   { paise: 39900, credits: 460, label: "460 credits" },
};

/** Balance = the sum of the ledger. Never a stored column — see the schema. */
export async function creditBalance(userId: string): Promise<number> {
  if (!USE_PG) {
    return fileData.credit_ledger
      .filter((r) => r.user_id === userId)
      .reduce((n, r) => n + r.delta, 0);
  }
  const { rows } = await pool!.query(
    `SELECT COALESCE(SUM(delta), 0)::int AS n FROM credit_ledger WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

/**
 * Spend credits for something we are about to deliver.
 *
 * Serialised per user with a row lock, because two requests arriving together
 * would otherwise both read the same balance and both pass the check — the
 * classic double-spend. The lock is on the user row rather than a balance row
 * precisely because there is no balance row to lock.
 *
 * Returns null when the user cannot afford it; the caller must not deliver.
 */
export async function spendCredits(args: {
  userId: string;
  credits: number;
  kind: string;
  chartId?: string | null;
  meta?: any;
}): Promise<{ deliveryId: string; balance: number } | null> {
  if (!USE_PG) {
    const bal = await creditBalance(args.userId);
    if (bal < args.credits) return null;
    const deliveryId = randomUUID();
    fileData.deliveries.push({
      id: deliveryId, user_id: args.userId, kind: args.kind,
      chart_id: args.chartId ?? null, credits: args.credits, created_at: nowIso(),
    });
    fileData.credit_ledger.push({
      user_id: args.userId, delta: -args.credits, reason: "spend",
      ref_type: "delivery", ref_id: deliveryId, balance_after: bal - args.credits, created_at: nowIso(),
    });
    saveFile();
    return { deliveryId, balance: bal - args.credits };
  }
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM app_users WHERE id = $1 FOR UPDATE`, [args.userId]);

    const { rows: b } = await client.query(
      `SELECT COALESCE(SUM(delta), 0)::int AS n FROM credit_ledger WHERE user_id = $1`,
      [args.userId],
    );
    const balance = b[0]?.n ?? 0;
    if (balance < args.credits) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows: d } = await client.query(
      `INSERT INTO deliveries (user_id, kind, chart_id, credits, meta)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [args.userId, args.kind, args.chartId ?? null, args.credits, args.meta ? JSON.stringify(args.meta) : null],
    );
    const deliveryId = d[0].id;
    const after = balance - args.credits;

    await client.query(
      `INSERT INTO credit_ledger (user_id, delta, reason, ref_type, ref_id, balance_after)
       VALUES ($1,$2,'spend','delivery',$3,$4)`,
      [args.userId, -args.credits, deliveryId, after],
    );
    await client.query("COMMIT");
    return { deliveryId, balance: after };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Give credits back — a delivery that failed after being charged, or a refund.
 * A new positive row; the original spend stays in the history.
 */
export async function grantCredits(args: {
  userId: string;
  credits: number;
  reason: "purchase" | "refund" | "bonus" | "signup" | "admin";
  refType?: string | null;
  refId?: string | null;
  note?: string | null;
}): Promise<number> {
  if (!USE_PG) {
    // Mirrors the unique index in Postgres: one grant per payment, ever.
    if (args.refType === "payment" && args.refId &&
        fileData.credit_ledger.some((r) => r.ref_type === "payment" && r.ref_id === args.refId)) {
      return creditBalance(args.userId);
    }
    const after = (await creditBalance(args.userId)) + args.credits;
    fileData.credit_ledger.push({
      user_id: args.userId, delta: args.credits, reason: args.reason,
      ref_type: args.refType ?? null, ref_id: args.refId ?? null,
      note: args.note ?? null, balance_after: after, created_at: nowIso(),
    });
    saveFile();
    return after;
  }
  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM app_users WHERE id = $1 FOR UPDATE`, [args.userId]);
    const { rows: b } = await client.query(
      `SELECT COALESCE(SUM(delta), 0)::int AS n FROM credit_ledger WHERE user_id = $1`,
      [args.userId],
    );
    const after = (b[0]?.n ?? 0) + args.credits;
    await client.query(
      `INSERT INTO credit_ledger (user_id, delta, reason, ref_type, ref_id, note, balance_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [args.userId, args.credits, args.reason, args.refType ?? null, args.refId ?? null, args.note ?? null, after],
    );
    await client.query("COMMIT");
    return after;
  } catch (e: any) {
    await client.query("ROLLBACK").catch(() => {});
    // 23505 = the one-grant-per-payment unique index fired, i.e. this payment
    // has already been credited. That is the index doing its job, not a
    // failure: report the balance so a retried webhook settles quietly rather
    // than erroring and being retried forever.
    if (e?.code === "23505") return creditBalance(args.userId);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Admin adjustment — add or take back credits by hand (support, goodwill, a
 * correction). Goes through the SAME ledger as everything else, so the balance
 * still reconciles and "where did my credits go?" still answers exactly. A
 * negative adjustment is refused if it would take the balance below zero, and
 * it is row-locked like every other write so it cannot race a spend.
 */
export async function adminAdjustCredits(args: {
  userId: string;
  delta: number;              // + to give, − to take back
  note?: string | null;
}): Promise<{ balance: number } | { error: string }> {
  const delta = Math.trunc(args.delta);
  if (!Number.isFinite(delta) || delta === 0) return { error: "Adjustment must be a non-zero whole number." };

  if (!USE_PG) {
    const after = (await creditBalance(args.userId)) + delta;
    if (after < 0) return { error: "That would take the balance below zero." };
    fileData.credit_ledger.push({
      user_id: args.userId, delta, reason: "admin", ref_type: null, ref_id: null,
      note: args.note ?? null, balance_after: after, created_at: nowIso(),
    });
    saveFile();
    return { balance: after };
  }

  const client = await pool!.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM app_users WHERE id = $1 FOR UPDATE`, [args.userId]);
    const { rows: b } = await client.query(
      `SELECT COALESCE(SUM(delta), 0)::int AS n FROM credit_ledger WHERE user_id = $1`,
      [args.userId],
    );
    const after = (b[0]?.n ?? 0) + delta;
    if (after < 0) {
      await client.query("ROLLBACK");
      return { error: "That would take the balance below zero." };
    }
    await client.query(
      `INSERT INTO credit_ledger (user_id, delta, reason, ref_type, ref_id, note, balance_after)
       VALUES ($1,$2,'admin',NULL,NULL,$3,$4)`,
      [args.userId, delta, args.note ?? null, after],
    );
    await client.query("COMMIT");
    return { balance: after };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Create a pending order. Mirrors what a real provider's create-order call
 * will store, so switching to Razorpay only changes where the ids come from.
 */
export async function createMockOrder(args: {
  userId: string; packId: string; paise: number; credits: number;
}): Promise<{ orderId: string }> {
  const orderIdLocal = "mock_order_" + randomUUID().replace(/-/g, "").slice(0, 18);
  if (!USE_PG) {
    fileData.payments.push({
      id: randomUUID(), user_id: args.userId, provider: "mock",
      provider_order_id: orderIdLocal, provider_payment_id: null,
      amount_paise: args.paise, pack_id: args.packId,
      credits: Math.max(1, args.credits), status: "created", created_at: nowIso(),
    });
    saveFile();
    return { orderId: orderIdLocal };
  }
  const orderId = orderIdLocal;
  await pool!.query(
    `INSERT INTO payments (user_id, provider, provider_order_id, amount_paise, pack_id, credits, status)
     VALUES ($1,'mock',$2,$3,$4,$5,'created')`,
    // credits must be > 0 by the CHECK, and the trial grants none — record 1
    // so the row is valid; the trial path never reads this field.
    [args.userId, orderId, args.paise, args.packId, Math.max(1, args.credits)],
  );
  return { orderId };
}

/**
 * Settle an order the way a webhook would.
 *
 * Idempotent on purpose: providers retry, and a second delivery of the same
 * event must not grant twice. An order already marked paid returns its
 * original result with `alreadySettled`, so the caller can be safely re-run.
 */
export async function settleMockOrder(
  orderId: string,
  status: "paid" | "failed",
): Promise<{
  ok: boolean; error?: string; status?: string;
  userId?: string; credits?: number; packId?: string; paymentId?: string;
  alreadySettled?: boolean;
}> {
  if (!USE_PG) {
    const row = fileData.payments.find((p) => p.provider_order_id === orderId);
    if (!row) return { ok: false, error: "Unknown order." };
    if (row.status === "paid") {
      return { ok: true, status: "paid", userId: row.user_id, credits: row.credits,
               packId: row.pack_id, paymentId: row.provider_payment_id, alreadySettled: true };
    }
    const pid = "mock_pay_" + randomUUID().replace(/-/g, "").slice(0, 18);
    row.status = status;
    row.provider_payment_id = status === "paid" ? pid : null;
    saveFile();
    return { ok: true, status, userId: row.user_id, credits: row.credits, packId: row.pack_id, paymentId: pid };
  }
  const { rows } = await pool!.query(
    `SELECT id, user_id, credits, pack_id, status, provider_payment_id
       FROM payments WHERE provider_order_id = $1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return { ok: false, error: "Unknown order." };

  if (row.status === "paid") {
    return {
      ok: true, status: "paid", userId: row.user_id, credits: row.credits,
      packId: row.pack_id, paymentId: row.provider_payment_id, alreadySettled: true,
    };
  }

  const paymentId = "mock_pay_" + randomUUID().replace(/-/g, "").slice(0, 18);
  await pool!.query(
    `UPDATE payments SET status = $2, provider_payment_id = $3, updated_at = now()
      WHERE provider_order_id = $1`,
    [orderId, status, status === "paid" ? paymentId : null],
  );
  return {
    ok: true, status, userId: row.user_id, credits: row.credits,
    packId: row.pack_id, paymentId,
  };
}

/** A user's own purchase history — the receipt trail they can point at. */
export async function paymentHistory(userId: string, limit = 50) {
  if (!USE_PG) {
    return fileData.payments
      .filter((p) => p.user_id === userId)
      .slice(-limit).reverse()
      .map((p) => ({
        order_id: p.provider_order_id, payment_id: p.provider_payment_id,
        pack_id: p.pack_id, amount_paise: p.amount_paise, credits: p.credits,
        status: p.status, created_at: p.created_at,
      }));
  }
  const { rows } = await pool!.query(
    `SELECT provider_order_id AS order_id, provider_payment_id AS payment_id,
            pack_id, amount_paise, credits, status, created_at
       FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

/**
 * Every payment, for the admin. Joined to the account so a dispute can be
 * answered with "this email, this order, this amount, at this time" rather
 * than a bare id.
 */
export async function allPayments(limit = 100) {
  if (!USE_PG) {
    const byId = new Map(fileData.users.map((u: any) => [u.id, u]));
    return fileData.payments.slice(-limit).reverse().map((p) => ({
      order_id: p.provider_order_id, payment_id: p.provider_payment_id,
      pack_id: p.pack_id, amount_paise: p.amount_paise, credits: p.credits,
      status: p.status, created_at: p.created_at,
      email: byId.get(p.user_id)?.email ?? "—", name: byId.get(p.user_id)?.name ?? "—",
      user_id: p.user_id,
    }));
  }
  const { rows } = await pool!.query(
    `SELECT p.provider_order_id AS order_id, p.provider_payment_id AS payment_id,
            p.pack_id, p.amount_paise, p.credits, p.status, p.created_at,
            p.updated_at, p.failure_reason, p.needs_refund, p.currency, p.provider,
            u.email, u.name, p.user_id,
            -- Was the money actually honoured? Read from the ledger rather than
            -- assumed from the status, so a paid row that never granted shows up.
            EXISTS (SELECT 1 FROM credit_ledger l
                     WHERE l.ref_type = 'payment'
                       AND l.ref_id IN (p.provider_payment_id, p.provider_order_id)) AS credited,
            (u.trial_started_at IS NOT NULL)                                          AS trial_used,
            u.trial_ends_at,
            (SELECT COALESCE(SUM(l2.delta),0) FROM credit_ledger l2
              WHERE l2.user_id = p.user_id)::int                                      AS user_balance
       FROM payments p JOIN app_users u ON u.id = p.user_id
      ORDER BY p.created_at DESC LIMIT $1`,
    [limit],
  );
  return rows;
}

/** Money totals for the admin dashboard. */
export async function paymentTotals() {
  if (!USE_PG) {
    const paid = fileData.payments.filter((p) => p.status === "paid");
    return {
      paid_count: paid.length,
      paid_paise: paid.reduce((n, p) => n + p.amount_paise, 0),
      trials: paid.filter((p) => p.pack_id === "trial").length,
      failed: fileData.payments.filter((p) => p.status === "failed").length,
      pending: fileData.payments.filter((p) => p.status === "created").length,
      needs_refund: fileData.payments.filter((p: any) => p.needs_refund).length,
      unhonoured: paid.filter((p) =>
        p.pack_id !== "trial" && p.credits > 0 &&
        !fileData.credit_ledger.some((l) => l.ref_type === "payment" &&
          (l.ref_id === p.provider_payment_id || l.ref_id === p.provider_order_id))).length,
    };
  }
  const { rows } = await pool!.query(
    `SELECT count(*) FILTER (WHERE status='paid')::int                       AS paid_count,
            COALESCE(SUM(amount_paise) FILTER (WHERE status='paid'),0)::int  AS paid_paise,
            count(*) FILTER (WHERE status='paid' AND pack_id='trial')::int   AS trials,
            count(*) FILTER (WHERE status='failed')::int                     AS failed,
            count(*) FILTER (WHERE status='created')::int                    AS pending,
            count(*) FILTER (WHERE needs_refund)::int                        AS needs_refund,
            -- Paid, but no ledger row: money taken and nothing delivered. This
            -- is the number that must always be zero.
            count(*) FILTER (
              WHERE status='paid' AND pack_id <> 'trial' AND credits > 0
                AND NOT EXISTS (SELECT 1 FROM credit_ledger l
                                 WHERE l.ref_type='payment'
                                   AND l.ref_id IN (payments.provider_payment_id, payments.provider_order_id))
            )::int                                                            AS unhonoured
       FROM payments`,
  );
  return rows[0];
}

/** How many of `kind` this user has had during the current trial window. */
export async function deliveryCountSince(userId: string, kind: string, endsAtIso: string): Promise<number> {
  if (!USE_PG) {
    const from = new Date(endsAtIso).getTime() - TRIAL.days * 86400_000;
    return fileData.deliveries.filter(
      (d) => d.user_id === userId && d.kind === kind && new Date(d.created_at).getTime() > from,
    ).length;
  }
  const { rows } = await pool!.query(
    `SELECT count(*)::int AS n FROM deliveries
      WHERE user_id = $1 AND kind = $2
        AND created_at > ($3::timestamptz - ($4 || ' days')::interval)`,
    [userId, kind, endsAtIso, TRIAL.days],
  );
  return rows[0]?.n ?? 0;
}

/** The user's own statement — every credit in and out, newest first. */
export async function creditHistory(userId: string, limit = 50) {
  if (!USE_PG) {
    return fileData.credit_ledger.filter((r) => r.user_id === userId).slice(-limit).reverse();
  }
  const { rows } = await pool!.query(
    `SELECT delta, reason, ref_type, note, balance_after, created_at
       FROM credit_ledger WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

/**
 * APK download counter.
 *
 * Recorded as a usage_event rather than a settings counter so it is an atomic
 * INSERT with no read-modify-write race, and so "today" and "this week" come
 * for free from the existing (action, created_at) index.
 *
 * Deliberately stores no user id: the download page is public and someone
 * fetching an APK has not agreed to anything. `ipHash` is a short one-way
 * digest used only to collapse the double-fire some browsers do on a download
 * click — it is not an identifier we can reverse.
 */
export async function recordDownload(ipHash: string | null): Promise<void> {
  if (!USE_PG) return;
  try {
    await pool!.query(
      `INSERT INTO usage_events (user_id, device_id, action, meta)
       SELECT NULL, $1, 'download', NULL
        WHERE NOT EXISTS (
          SELECT 1 FROM usage_events
           WHERE action = 'download' AND device_id = $1
             AND created_at > now() - interval '10 minutes'
        )`,
      [ipHash],
    );
  } catch (e) {
    console.warn("[download] failed to record", (e as Error).message);
  }
}

/** Total / today / last-7-day APK downloads, for the admin panel and the site. */
export async function downloadStats(): Promise<{ total: number; today: number; week: number }> {
  if (!USE_PG) return { total: 0, today: 0, week: 0 };
  try {
    const { rows } = await pool!.query(
      `SELECT
         count(*)::int AS total,
         count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
         count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS week
       FROM usage_events WHERE action = 'download'`,
    );
    return { total: rows[0]?.total ?? 0, today: rows[0]?.today ?? 0, week: rows[0]?.week ?? 0 };
  } catch {
    return { total: 0, today: 0, week: 0 };
  }
}

/**
 * How many times an identity has performed an action inside its quota window.
 *
 * `chart` is a cap on kundlis CREATED, not kundlis held. It used to count the
 * saved rows, so deleting one handed the slot straight back: create, delete,
 * create again — an unlimited free plan in three taps. Creations are counted
 * from usage rows, which deleting a kundli never touches. The saved count is
 * kept as a floor for kundlis made before creations were recorded.
 *
 * A signed-in user is counted together with the phone they are using. Counted
 * by account alone, a second e-mail on the same phone started a fresh free
 * allowance, and so did deleting the account and signing up again. A shared
 * family phone now shares one free allowance — credits still work for anyone.
 */
export async function usageCount(
  who: { userId?: string | null; deviceId?: string | null; plan?: PlanId },
  action: QuotaAction,
): Promise<number> {
  if (!USE_PG) return 0;
  const window = windowFor(action, who.plan ?? "free");

  // Rows belonging to this account, or made from this phone.
  const mine = `(($1::uuid IS NOT NULL AND user_id = $1::uuid)
              OR ($2::text IS NOT NULL AND device_id = $2))`;

  if (action === "chart") {
    const { rows } = await pool!.query(
      `SELECT GREATEST(
          (SELECT count(*) FROM usage_events WHERE action = 'chart' AND ${mine}),
          (SELECT count(*) FROM chart_calculations
            WHERE ($1::uuid IS NOT NULL AND owner_id = $1::uuid)
               OR ($2::text IS NOT NULL AND device_id = $2))
        )::int AS n`,
      [who.userId ?? null, who.deviceId ?? null]
    );
    return rows[0]?.n ?? 0;
  }

  const interval = window === "month" ? "30 days" : window === "week" ? "7 days" : "1 day";
  const { rows } = await pool!.query(
    `SELECT count(*)::int AS n FROM usage_events
      WHERE action = $3
        AND created_at > now() - $4::interval
        AND ${mine}`,
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
  // Must mirror the Postgres branch above. Without `device_id`, canAccessChart
  // sees neither an owner nor a device on the chart and denies everyone — so
  // on the file-store fallback EVERY guest chart 403'd, even though the same
  // chart showed up in that device's profile list.
  chart.device_id = row.device_id ?? null;
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

/**
 * Overwrite a chart in place after its birth details were corrected.
 *
 * Keeps the same chart id — a kundli people have already opened, shared and
 * chatted about shouldn't change identity because they fixed an AM/PM. That
 * makes clearing the derived data essential: every cached reading (life
 * report, focused reports, timeline, daily) and the chat memory were computed
 * from the OLD birth moment, and silently serving them against corrected
 * details would be worse than not offering editing at all.
 */
export async function updateChart(args: {
  chartId: string;
  birth: BirthProfileInput;
  normalized: any;
  raw: any;
  validationStatus: string;
}): Promise<void> {
  const { chartId, birth, normalized, raw, validationStatus } = args;
  if (USE_PG) {
    const { rows } = await pool!.query(
      `SELECT birth_profile_id FROM chart_calculations WHERE id = $1`,
      [chartId]
    );
    const profileId = rows[0]?.birth_profile_id;
    if (!profileId) return;
    await pool!.query(
      `UPDATE birth_profiles
          SET name=$2, date_of_birth=$3, time_of_birth=$4, place_of_birth=$5,
              latitude=$6, longitude=$7, timezone=$8, gender=$9, language=$10
        WHERE id=$1`,
      [profileId, birth.name, birth.date_of_birth, birth.time_of_birth, birth.place_of_birth,
       birth.latitude, birth.longitude, birth.timezone, birth.gender ?? "", birth.language]
    );
    await pool!.query(
      `UPDATE chart_calculations
          SET normalized_chart_json=$2, raw_provider_json=$3, validation_status=$4
        WHERE id=$1`,
      [chartId, normalized, raw, validationStatus]
    );
    await pool!.query(`DELETE FROM ai_reports   WHERE chart_id = $1`, [chartId]);
    await pool!.query(`DELETE FROM chat_messages WHERE chart_id = $1`, [chartId]);
    await pool!.query(`DELETE FROM chat_memory   WHERE chart_id = $1`, [chartId]);
    return;
  }

  const chart = fileData.chart_calculations[chartId];
  if (!chart) return;
  const profile = fileData.birth_profiles[chart.birth_profile_id];
  if (profile) Object.assign(profile, birth);
  chart.normalized_chart_json = normalized;
  chart.raw_provider_json = raw;
  chart.validation_status = validationStatus;
  fileData.ai_reports = fileData.ai_reports.filter((r) => r.chart_id !== chartId);
  fileData.chat_messages = fileData.chat_messages.filter((m) => m.chart_id !== chartId);
  if (fileData.chat_memory) delete fileData.chat_memory[chartId];
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
): Promise<Array<{ role: string; message: string | null; created_at: string; response_json?: any }>> {
  if (USE_PG) {
    // response_json holds what was shown WITH a message — the chart card, the
    // suggestion chips, the action. It was written on every reply and then
    // never read back, so reopening a conversation lost every chart that had
    // been in it. The words survived a refresh; nothing around them did.
    const { rows } = context
      ? await pool!.query(
          `SELECT role, message, response_json, created_at FROM chat_messages WHERE chart_id = $1 AND context = $2 ORDER BY created_at ASC`,
          [chartId, context]
        )
      : await pool!.query(
          `SELECT role, message, response_json, created_at FROM chat_messages WHERE chart_id = $1 ORDER BY created_at ASC`,
          [chartId]
        );
    return rows.map((r) => ({
      role: r.role,
      message: r.message,
      response_json: r.response_json ?? null,
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }
  return fileData.chat_messages
    .filter((m) => m.chart_id === chartId)
    // Treat older rows with no context as "ask" so they stay in the Ask AI chat.
    .filter((m) => (context ? (m.context ?? "ask") === context : true))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
    .map((m) => ({ role: m.role, message: m.message, response_json: (m as any).response_json ?? null, created_at: m.created_at }));
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

/* ── Real payment provider (Razorpay) ──────────────────────────────────────
   The mock functions above stand in during development. These two are the
   live path; everything else — the ledger, the unique indexes, the idempotent
   grant — is shared, so going live changes only where the ids come from. */

/** Record an order we just created at the provider. The user id comes from the
 *  SESSION at the call site, never from the client, so a payment can never be
 *  credited to someone else's account. */
export async function createProviderOrder(args: {
  userId: string; packId: string; paise: number; credits: number;
  orderId: string; provider?: string;
}): Promise<{ orderId: string }> {
  const provider = args.provider ?? "razorpay";
  if (!USE_PG) {
    fileData.payments.push({
      id: randomUUID(), user_id: args.userId, provider,
      provider_order_id: args.orderId, provider_payment_id: null,
      amount_paise: args.paise, currency: "INR", pack_id: args.packId,
      credits: args.credits, status: "created", created_at: nowIso(),
    });
    saveFile();
    return { orderId: args.orderId };
  }
  await pool!.query(
    `INSERT INTO payments (user_id, provider, provider_order_id, amount_paise, pack_id, credits, status)
     VALUES ($1,$2,$3,$4,$5,$6,'created')`,
    [args.userId, provider, args.orderId, args.paise, args.packId, args.credits],
  );
  return { orderId: args.orderId };
}

/**
 * An unpaid order this person can be sent back to, instead of a fresh one.
 *
 * Two taps on Pay, or two open tabs, used to create two real Razorpay orders
 * for the same thing — and both could be paid, taking the money twice. Handing
 * back the existing order makes that impossible: Razorpay itself refuses a
 * second payment against an order that is already paid.
 *
 * Matched on the amount as well as the pack, so a price change never resurrects
 * an order at the old price.
 */
export async function findReusableOrder(
  userId: string, packId: string, paise: number, maxAgeMinutes = 10,
): Promise<{ orderId: string; credits: number } | null> {
  if (!USE_PG) {
    const cutoff = Date.now() - maxAgeMinutes * 60_000;
    const row = [...fileData.payments].reverse().find(
      (p) => p.user_id === userId && p.pack_id === packId && p.status === "created" &&
             p.amount_paise === paise && Date.parse(p.created_at) > cutoff);
    return row ? { orderId: row.provider_order_id, credits: row.credits } : null;
  }
  const { rows } = await pool!.query(
    `SELECT provider_order_id AS order_id, credits
       FROM payments
      WHERE user_id = $1 AND pack_id = $2 AND status = 'created' AND amount_paise = $3
        AND created_at > now() - ($4 || ' minutes')::interval
      ORDER BY created_at DESC LIMIT 1`,
    [userId, packId, paise, maxAgeMinutes],
  );
  return rows[0] ? { orderId: rows[0].order_id, credits: rows[0].credits } : null;
}

/** Flag a paid row that could not be honoured, so admin can refund it. */
export async function markNeedsRefund(orderId: string, why: string): Promise<void> {
  if (!USE_PG) {
    const row = fileData.payments.find((p) => p.provider_order_id === orderId);
    if (row) { (row as any).needs_refund = true; row.failure_reason = why; saveFile(); }
    return;
  }
  await pool!.query(
    `UPDATE payments SET needs_refund = true, failure_reason = $2, updated_at = now()
      WHERE provider_order_id = $1`,
    [orderId, why],
  );
}

/** Orders that were created but never reached a final state. Used by the
 *  reconciler and shown in admin: each one is someone who may have paid. */
export async function pendingOrders(userId?: string, maxAgeMinutes = 60 * 24 * 3) {
  if (!USE_PG) {
    return fileData.payments
      .filter((p) => p.status === "created" && (!userId || p.user_id === userId))
      .map((p) => ({ order_id: p.provider_order_id, user_id: p.user_id, pack_id: p.pack_id,
                     amount_paise: p.amount_paise, credits: p.credits, created_at: p.created_at }));
  }
  const { rows } = await pool!.query(
    `SELECT provider_order_id AS order_id, user_id, pack_id, amount_paise, credits, created_at
       FROM payments
      WHERE status = 'created'
        AND created_at > now() - ($1 || ' minutes')::interval
        AND ($2::uuid IS NULL OR user_id = $2)
      ORDER BY created_at DESC
      LIMIT 200`,
    [maxAgeMinutes, userId ?? null],
  );
  return rows;
}

/** Settle an order from a provider webhook, using the provider's REAL payment
 *  id. Returns `alreadySettled` when the webhook is a retry — Razorpay retries
 *  on any non-2xx, so this path is walked often and must be a no-op. */
export async function settleOrder(
  orderId: string,
  status: "paid" | "failed",
  providerPaymentId?: string | null,
  failureReason?: string | null,
): Promise<{
  ok: boolean; error?: string; status?: string;
  userId?: string; credits?: number; packId?: string; paymentId?: string;
  alreadySettled?: boolean;
}> {
  if (!USE_PG) {
    const row = fileData.payments.find((p) => p.provider_order_id === orderId);
    if (!row) return { ok: false, error: "Unknown order." };
    if (row.status === "paid") {
      return { ok: true, status: "paid", userId: row.user_id, credits: row.credits,
               packId: row.pack_id, paymentId: row.provider_payment_id, alreadySettled: true };
    }
    row.status = status;
    row.provider_payment_id = status === "paid" ? (providerPaymentId ?? null) : null;
    row.failure_reason = failureReason ?? null;
    saveFile();
    return { ok: true, status, userId: row.user_id, credits: row.credits,
             packId: row.pack_id, paymentId: providerPaymentId ?? undefined };
  }

  const { rows } = await pool!.query(
    `SELECT user_id, credits, pack_id, status, provider_payment_id
       FROM payments WHERE provider_order_id = $1`,
    [orderId],
  );
  const row = rows[0];
  if (!row) return { ok: false, error: "Unknown order." };
  if (row.status === "paid") {
    return { ok: true, status: "paid", userId: row.user_id, credits: row.credits,
             packId: row.pack_id, paymentId: row.provider_payment_id, alreadySettled: true };
  }

  await pool!.query(
    `UPDATE payments
        SET status = $2, provider_payment_id = $3, failure_reason = $4, updated_at = now()
      WHERE provider_order_id = $1`,
    [orderId, status, status === "paid" ? (providerPaymentId ?? null) : null, failureReason ?? null],
  );
  return { ok: true, status, userId: row.user_id, credits: row.credits,
           packId: row.pack_id, paymentId: providerPaymentId ?? undefined };
}
