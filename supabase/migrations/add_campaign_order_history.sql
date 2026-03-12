-- Campaign Order History Migration
-- Stores a snapshot each time an order is cleared via "Complete & Clear"
-- so there's a record of past orders within a campaign context.

CREATE TABLE campaign_order_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_influencer_id UUID NOT NULL REFERENCES campaign_influencers(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  shopify_order_id TEXT,
  shopify_real_order_id TEXT,
  shopify_order_status TEXT,
  product_selections JSONB,
  tracking_number TEXT,
  tracking_url TEXT,
  order_status_updated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX idx_campaign_order_history_ci ON campaign_order_history(campaign_influencer_id);
CREATE INDEX idx_campaign_order_history_completed ON campaign_order_history(completed_at DESC);

-- Enable Row Level Security
ALTER TABLE campaign_order_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (append-only: SELECT + INSERT only)
CREATE POLICY "Authenticated users can view campaign order history"
  ON campaign_order_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert campaign order history"
  ON campaign_order_history FOR INSERT TO authenticated WITH CHECK (true);
