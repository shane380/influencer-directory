-- Add boolean deal component columns to creator_invites
ALTER TABLE creator_invites
  ADD COLUMN IF NOT EXISTS has_ad_spend BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_affiliate BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_retainer BOOLEAN DEFAULT false;

-- Set charlee to ad_spend + affiliate
UPDATE creator_invites SET has_ad_spend = true, has_affiliate = true WHERE slug = 'charlee';
