-- Cached Meta ad performance data, populated by daily sync
CREATE TABLE IF NOT EXISTS creator_ad_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_handle text UNIQUE NOT NULL,
  influencer_id uuid REFERENCES influencers(id) ON DELETE SET NULL,
  ads jsonb DEFAULT '[]'::jsonb,
  totals jsonb DEFAULT '{"spend": 0, "impressions": 0}'::jsonb,
  monthly jsonb DEFAULT '[]'::jsonb,
  mtd jsonb DEFAULT '{"spend": 0, "impressions": 0}'::jsonb,
  last_mtd jsonb DEFAULT '{"spend": 0, "impressions": 0}'::jsonb,
  sync_error text,
  synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_ad_performance_handle ON creator_ad_performance(instagram_handle);
CREATE INDEX IF NOT EXISTS idx_creator_ad_performance_influencer ON creator_ad_performance(influencer_id);

ALTER TABLE creator_ad_performance ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Allow authenticated read" ON creator_ad_performance
  FOR SELECT TO authenticated USING (true);
