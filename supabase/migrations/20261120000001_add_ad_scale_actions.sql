-- One row per "Scale to CBO" action from the Ads performance page: which live
-- ad was re-run on its existing post, into which ad set, as which new ad.
-- Drives the "Scaled" badge so actioned ads are told apart from untouched ones.
CREATE TABLE IF NOT EXISTS ad_scale_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ad_id text NOT NULL,
  new_ad_id text NOT NULL,
  adset_id text NOT NULL,
  adset_name text,
  campaign_id text,
  campaign_name text,
  -- ACTIVE | PAUSED, as the new ad was started
  status text NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_scale_actions_source
  ON ad_scale_actions (source_ad_id, created_at DESC);

-- RLS on with NO policies, matching meta_ads: every reader and writer is a
-- service-role route (/api/ads/*), which bypasses RLS.
ALTER TABLE ad_scale_actions ENABLE ROW LEVEL SECURITY;
