-- Global cache of Shopify orders tagged "influencer".
-- Populated by the /api/cron/sync-influencer-orders cron (not per-influencer
-- on-demand like influencer_orders), so gifting metrics stay complete + fresh.
-- Only real (placed) orders land here — draft orders that were never completed
-- are excluded by the sync. is_gift = true when the order total is $0.
CREATE TABLE IF NOT EXISTS gift_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  shopify_order_id TEXT NOT NULL UNIQUE,
  shopify_customer_id TEXT,
  -- Nullable: a tagged order may not map to a known influencer; it still counts
  -- toward aggregate gift totals, it just won't attach to a PR-list row.
  influencer_id UUID REFERENCES influencers(id) ON DELETE SET NULL,
  order_number TEXT,
  order_date TIMESTAMPTZ NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  is_gift BOOLEAN NOT NULL DEFAULT false,
  line_items JSONB NOT NULL DEFAULT '[]'::JSONB,
  tags TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gift_orders_order_date ON gift_orders(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_gift_orders_influencer ON gift_orders(influencer_id);
CREATE INDEX IF NOT EXISTS idx_gift_orders_is_gift ON gift_orders(is_gift);

ALTER TABLE gift_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view gift orders"
  ON gift_orders FOR SELECT TO authenticated USING (true);
