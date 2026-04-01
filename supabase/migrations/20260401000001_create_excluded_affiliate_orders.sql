CREATE TABLE IF NOT EXISTS excluded_affiliate_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID REFERENCES influencers(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL,
  reason TEXT,
  excluded_by TEXT,
  excluded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(influencer_id, order_id)
);

CREATE INDEX ON excluded_affiliate_orders(influencer_id);
