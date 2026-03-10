-- ════════════════════════════════════════════════════════════════
-- Migration 001: Multi-location support
-- Run once in Supabase SQL Editor
-- ════════════════════════════════════════════════════════════════

-- ── 1. Drop the one-row-per-user constraint on businesses ─────────
--    The old UNIQUE(user_id) prevented multiple locations.
--    We keep the slug UNIQUE globally (cross-user) so QR URLs never clash.
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_user_id_key;

-- ── 2. Add per-location Stripe subscription fields ───────────────
--    accounts table keeps the customer-level stripe_customer_id.
--    Each business row now tracks its own subscription.
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS current_period_end      BIGINT,
  ADD COLUMN IF NOT EXISTS location_order          INTEGER DEFAULT 0;

-- ── 3. Add the new rich GBP columns (if not already added) ───────
ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS address             TEXT,
  ADD COLUMN IF NOT EXISTS google_phone        TEXT,
  ADD COLUMN IF NOT EXISTS google_website      TEXT,
  ADD COLUMN IF NOT EXISTS google_rating       NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS google_review_count INTEGER,
  ADD COLUMN IF NOT EXISTS google_menu_url     TEXT,
  ADD COLUMN IF NOT EXISTS website             TEXT,
  ADD COLUMN IF NOT EXISTS social_facebook     TEXT,
  ADD COLUMN IF NOT EXISTS social_instagram    TEXT,
  ADD COLUMN IF NOT EXISTS social_twitter      TEXT,
  ADD COLUMN IF NOT EXISTS social_youtube      TEXT,
  ADD COLUMN IF NOT EXISTS social_tiktok       TEXT;

-- ── 4. Add menus.menu_source if not exists ───────────────────────
ALTER TABLE menus
  ADD COLUMN IF NOT EXISTS menu_source TEXT DEFAULT 'custom';

-- ── 5. leads: add source + business_id foreign key ───────────────
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS source      TEXT DEFAULT 'funnel',
  ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- ── 6. Update RLS: businesses now needs INSERT policy too ─────────
--    (previously upsert worked on a single row; now we INSERT new rows)
DROP POLICY IF EXISTS "businesses: own rows" ON businesses;

CREATE POLICY "businesses: select own" ON businesses
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "businesses: insert own" ON businesses
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "businesses: update own" ON businesses
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "businesses: delete own" ON businesses
  FOR DELETE USING (auth.uid() = user_id);

-- Keep public read for QR funnel pages (unauthenticated customers)
DROP POLICY IF EXISTS "businesses_public_read" ON businesses;
CREATE POLICY "businesses_public_read" ON businesses
  FOR SELECT USING (true);

-- ── 7. accounts: move subscription fields to per-location ─────────
--    Keep stripe_customer_id on accounts (one customer per user).
--    subscription_status + stripe_subscription_id move to businesses.
--    Leave old columns in place for backwards compat — just stop writing them.
