-- Daily snapshot of how many ads were active on a given day for each creator.
-- Written once per sync invocation (one row per creator per day) so we can
-- chart historical "ads live" once enough days accumulate.
CREATE TABLE IF NOT EXISTS creator_ads_live_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instagram_handle text NOT NULL,
  influencer_id uuid REFERENCES influencers(id) ON DELETE CASCADE,
  date date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE (instagram_handle, date)
);

CREATE INDEX IF NOT EXISTS idx_creator_ads_live_daily_handle_date
  ON creator_ads_live_daily (instagram_handle, date);
CREATE INDEX IF NOT EXISTS idx_creator_ads_live_daily_influencer_date
  ON creator_ads_live_daily (influencer_id, date);

ALTER TABLE creator_ads_live_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read" ON creator_ads_live_daily
  FOR SELECT TO authenticated USING (true);
