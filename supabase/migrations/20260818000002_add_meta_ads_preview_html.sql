-- meta_ads.preview_html was missed in 20260818000001.
--
-- It holds Meta's ad-preview iframe HTML, the playback fallback for whitelisted
-- Instagram videos that Mux cannot download (the `source` edge returns error
-- #10). api/creator/top-ads serves this straight to the creator dashboard, so
-- without the column those ads lose playback entirely.
--
-- Kept as its own migration rather than edited into the previous file, which has
-- already been applied — the history should stay replayable.
ALTER TABLE meta_ads ADD COLUMN IF NOT EXISTS preview_html text;
