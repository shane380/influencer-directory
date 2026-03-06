CREATE TABLE creator_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id),
  month TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('ad_spend_commission', 'retainer', 'affiliate_commission', 'paid_collab')),
  amount_owed NUMERIC(10,2),
  amount_paid NUMERIC(10,2),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'skipped')),
  payment_method TEXT,
  payment_detail TEXT,
  notes TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_by TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE creator_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on creator_payments"
  ON creator_payments FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_creator_payments_month ON creator_payments(month);
CREATE INDEX idx_creator_payments_influencer ON creator_payments(influencer_id);
CREATE UNIQUE INDEX idx_creator_payments_unique ON creator_payments(influencer_id, month, payment_type);
