-- ══════════════════════════════════════════════════════════════════
--  Migration 0002: Multi-location support
--  Run this in Supabase SQL Editor → "Run query"
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Create the new `locations` table ──────────────────────────
-- This replaces the single-row `businesses` table for multi-location.
-- `businesses` is kept as-is so existing data is not lost.
CREATE TABLE IF NOT EXISTS locations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Google Business Profile data
  biz_name         TEXT NOT NULL DEFAULT '',
  slug             TEXT NOT NULL UNIQUE,
  google_place_id  TEXT NOT NULL DEFAULT '',
  google_url       TEXT NOT NULL DEFAULT '',
  address          TEXT NOT NULL DEFAULT '',
  phone            TEXT NOT NULL DEFAULT '',
  website          TEXT NOT NULL DEFAULT '',
  google_rating    NUMERIC(3,1),
  google_review_count INTEGER,

  -- Stripe subscription for this location
  stripe_subscription_id TEXT NOT NULL DEFAULT '',
  stripe_price_id        TEXT NOT NULL DEFAULT '',
  subscription_status    TEXT NOT NULL DEFAULT 'pending',
  current_period_end     BIGINT,

  -- Feature flags (JSON)
  feature_flags    JSONB DEFAULT '{}',

  -- Incentive text for review funnel
  incentive        TEXT NOT NULL DEFAULT '',

  -- Soft-delete flag (we don't purge rows — just hide them)
  deleted_at       TIMESTAMPTZ,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Row-Level Security ─────────────────────────────────────────
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;

-- Users can read/write ONLY their own location rows
CREATE POLICY "locations_owner_all" ON locations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public read (unauthenticated) — needed for funnel.html / QR scans
CREATE POLICY "locations_public_read" ON locations
  FOR SELECT
  USING (deleted_at IS NULL);

-- ── 3. Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS locations_user_id_idx ON locations(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS locations_slug_idx ON locations(slug) WHERE deleted_at IS NULL;

-- ── 4. accounts table — add locations_count helper column ────────
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS locations_count INTEGER DEFAULT 0;

-- ── 5. Add location_id foreign key to leads ──────────────────────
-- (allows per-location lead reporting)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations(id);

-- ── 6. Trigger: auto-update updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS locations_updated_at ON locations;
CREATE TRIGGER locations_updated_at
  BEFORE UPDATE ON locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
