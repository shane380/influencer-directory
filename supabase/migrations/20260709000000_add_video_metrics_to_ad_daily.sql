-- Video engagement metrics for hook/hold rate on the creator leaderboard.
ALTER TABLE creator_ad_performance_daily
  ADD COLUMN IF NOT EXISTS video_3s_views integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_thruplays integer NOT NULL DEFAULT 0;

-- The creator top-ads endpoint scans by bare date range across all handles;
-- existing indexes are (handle, date) and (influencer_id, date).
CREATE INDEX IF NOT EXISTS idx_creator_ad_perf_daily_date
  ON creator_ad_performance_daily (date);
