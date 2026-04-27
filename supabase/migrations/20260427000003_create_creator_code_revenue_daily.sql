-- Per-day rollup of Shopify orders attributed to each creator's affiliate code.
-- Populated by /api/cron/sync-code-revenue so the creator profile trend chart
-- can read code revenue without hitting the Shopify Admin API on each load.
CREATE TABLE IF NOT EXISTS creator_code_revenue_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code text NOT NULL,
  date date NOT NULL,
  gross_amount numeric(12,2) NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  UNIQUE (affiliate_code, date)
);

CREATE INDEX IF NOT EXISTS idx_code_revenue_daily_code_date
  ON creator_code_revenue_daily (affiliate_code, date);

ALTER TABLE creator_code_revenue_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON creator_code_revenue_daily
  FOR SELECT TO authenticated USING (true);
