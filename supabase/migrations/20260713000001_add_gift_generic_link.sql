-- Generic (open) gift link: one reusable campaign-level Selects link for
-- creators with no influencer record yet. Submissions auto-match to existing
-- influencers (by IG handle, then email) or create new records server-side.
-- gift_generic_enabled is a pause switch — disabling keeps the token so
-- re-enabling revives the same URL.
-- Run statements individually in the Supabase SQL editor.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS gift_generic_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_generic_token text,
  ADD COLUMN IF NOT EXISTS gift_generic_max_selects integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaigns_gift_generic_token
  ON campaigns (gift_generic_token) WHERE gift_generic_token IS NOT NULL;
