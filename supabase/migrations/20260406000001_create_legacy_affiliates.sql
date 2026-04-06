-- Legacy affiliates from GoAffPro with Shopify discount codes
CREATE TABLE legacy_affiliates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  discount_code TEXT NOT NULL,
  commission_rate NUMERIC(5,2) NOT NULL DEFAULT 25.00,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  influencer_id UUID REFERENCES influencers(id),
  payment_method TEXT,
  payment_detail TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Case-insensitive unique on discount code
CREATE UNIQUE INDEX idx_legacy_affiliates_code ON legacy_affiliates(UPPER(discount_code));

-- RLS: service role only
ALTER TABLE legacy_affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on legacy_affiliates"
  ON legacy_affiliates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
