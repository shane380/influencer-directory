-- Per-day, per-ad Meta insights, populated by daily sync.
-- The existing daily insights call in meta-sync was already paginating these
-- rows and discarding them after monthly aggregation. We persist them here.
CREATE TABLE IF NOT EXISTS creator_ad_performance_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_handle text NOT NULL,
  influencer_id uuid REFERENCES influencers(id) ON DELETE CASCADE,
  ad_id text NOT NULL,
  date date NOT NULL,
  spend numeric(12,2) NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  outbound_clicks integer NOT NULL DEFAULT 0,
  purchase_value numeric(12,2) NOT NULL DEFAULT 0,
  purchase_roas numeric(10,4),
  created_at timestamptz DEFAULT now(),
  UNIQUE (instagram_handle, ad_id, date)
);

CREATE INDEX IF NOT EXISTS idx_creator_ad_perf_daily_handle_date
  ON creator_ad_performance_daily (instagram_handle, date);
CREATE INDEX IF NOT EXISTS idx_creator_ad_perf_daily_influencer_date
  ON creator_ad_performance_daily (influencer_id, date);

ALTER TABLE creator_ad_performance_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON creator_ad_performance_daily
  FOR SELECT TO authenticated USING (true);
