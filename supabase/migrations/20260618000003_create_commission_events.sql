-- Append-only commission/earnings ledger. The old model stored a mutable
-- amount_owed per (creator, month, type) and fought to keep it correct (it froze
-- at buggy values, refunds needed a fragile clawback table, etc.). This table
-- stores immutable FACTS instead; a creator's earnings are DERIVED by summing
-- events, and balance = SUM(commission_events.amount) − SUM(creator_payouts.amount).
--
-- Idempotent: the sync UPSERTs on (creator_key, event_type, source_id), so a
-- re-run (or a rate-limited partial scan that completes next time) can never
-- double-count or freeze a wrong total. Refunds are negative events keyed by the
-- Shopify refund id — no separate clawback machinery.
CREATE TABLE commission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owner: 'inf:<influencer_id>' for partners, 'legacy:<legacy_affiliate_id>' for legacy.
  creator_key TEXT NOT NULL,
  influencer_id UUID REFERENCES influencers(id),
  legacy_affiliate_id UUID REFERENCES legacy_affiliates(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('affiliate', 'ad_spend', 'retainer', 'paid_collab', 'refund')),
  source_type TEXT NOT NULL,        -- shopify_order | shopify_refund | meta_monthly | retainer | campaign_deal | manual
  source_id TEXT NOT NULL,          -- order_id | refund_id | 'YYYY-MM' | deal_id
  period TEXT NOT NULL,             -- 'YYYY-MM' the earning is attributed to
  occurred_at TIMESTAMPTZ,          -- the real event time (order/refund date)
  amount NUMERIC(12,2) NOT NULL,    -- + earned, − refund
  rate NUMERIC,                     -- e.g. 0.25 (for audit)
  basis NUMERIC,                    -- the net/spend the rate applied to (for audit)
  detail JSONB,                     -- order #, gross, etc. for the verify-the-math breakdown
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency key: one row per (owner, type, source). Re-syncs upsert.
CREATE UNIQUE INDEX idx_commission_events_unique ON commission_events(creator_key, event_type, source_id);
CREATE INDEX idx_commission_events_owner_period ON commission_events(creator_key, period);
CREATE INDEX idx_commission_events_influencer ON commission_events(influencer_id);
CREATE INDEX idx_commission_events_legacy ON commission_events(legacy_affiliate_id);

ALTER TABLE commission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on commission_events"
  ON commission_events FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Authenticated read on commission_events"
  ON commission_events FOR SELECT
  USING (auth.role() = 'authenticated');

-- Payouts: tag the month a transfer covers (optional). Unallocated payments
-- auto-apply oldest-unpaid-first for the per-month "is March paid?" display.
ALTER TABLE creator_payouts ADD COLUMN IF NOT EXISTS covers_period TEXT;
