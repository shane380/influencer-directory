-- Actual payouts ledger: a record of money you really sent a creator, decoupled
-- from the monthly "owed" rows. The previous model copied the computed owed
-- figure into amount_paid on "Mark Paid", so the recorded "paid" amount never
-- reflected the real PayPal/bank transfer. This table is the source of truth for
-- what was actually paid; a creator's balance = total earned − sum(payouts).
CREATE TABLE creator_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id),
  legacy_affiliate_id UUID REFERENCES legacy_affiliates(id),
  amount NUMERIC(10,2) NOT NULL,        -- amount actually sent (what they received)
  sent_at DATE NOT NULL,                -- date the transfer was actually made
  method TEXT,                          -- paypal | bank | e_transfer | etc.
  reference TEXT,                       -- PayPal txn id / bank ref
  note TEXT,
  recorded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Each payout belongs to exactly one owner (a partner influencer OR a legacy affiliate).
  CONSTRAINT creator_payouts_one_owner CHECK (
    (influencer_id IS NOT NULL)::int + (legacy_affiliate_id IS NOT NULL)::int = 1
  )
);

ALTER TABLE creator_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on creator_payouts"
  ON creator_payouts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated read on creator_payouts"
  ON creator_payouts FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE INDEX idx_creator_payouts_influencer ON creator_payouts(influencer_id);
CREATE INDEX idx_creator_payouts_legacy ON creator_payouts(legacy_affiliate_id);
CREATE INDEX idx_creator_payouts_sent_at ON creator_payouts(sent_at DESC);
