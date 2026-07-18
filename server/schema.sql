-- Vedic Astra database schema (PostgreSQL / Supabase).
-- This is applied automatically on server start by server/db.ts (initDb),
-- but is kept here for reference and for running manually in the Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Raw birth details entered by the user.
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

-- One calculated + normalized chart per profile (provider = 'prokerala').
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

-- AI-generated life reports for a chart.
CREATE TABLE IF NOT EXISTS ai_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id    UUID NOT NULL REFERENCES chart_calculations(id) ON DELETE CASCADE,
  report_json JSONB NOT NULL,
  language    TEXT NOT NULL DEFAULT 'en',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_reports_chart ON ai_reports(chart_id);

-- Chat transcript per chart (role = 'user' | 'assistant').
CREATE TABLE IF NOT EXISTS chat_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id      UUID NOT NULL REFERENCES chart_calculations(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  message       TEXT,
  response_json JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_chart ON chat_messages(chart_id, created_at);
