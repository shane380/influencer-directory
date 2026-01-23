-- Influencer Orders Cache Migration
-- Caches Shopify order history for linked influencers

-- Create influencer_orders table
CREATE TABLE influencer_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  shopify_order_id TEXT NOT NULL UNIQUE,
  shopify_customer_id TEXT NOT NULL,
  order_number TEXT NOT NULL,
  order_date TIMESTAMPTZ NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_gift BOOLEAN NOT NULL DEFAULT false,
  line_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for efficient queries
CREATE INDEX idx_influencer_orders_influencer ON influencer_orders(influencer_id);
CREATE INDEX idx_influencer_orders_order_date ON influencer_orders(order_date DESC);
CREATE INDEX idx_influencer_orders_shopify_customer ON influencer_orders(shopify_customer_id);

-- Enable Row Level Security
ALTER TABLE influencer_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view all influencer orders"
  ON influencer_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert influencer orders"
  ON influencer_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update influencer orders"
  ON influencer_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete influencer orders"
  ON influencer_orders FOR DELETE TO authenticated USING (true);
