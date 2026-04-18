-- Add gift_card and flat_fee one-off deal types to creator_invites
ALTER TABLE creator_invites DROP CONSTRAINT IF EXISTS creator_invites_deal_type_check;
ALTER TABLE creator_invites ADD CONSTRAINT creator_invites_deal_type_check
  CHECK (deal_type IN ('affiliate', 'ad_spend', 'retainer', 'none', 'gift_card', 'flat_fee'));

ALTER TABLE creator_invites
  ADD COLUMN IF NOT EXISTS gift_card_amount INTEGER,
  ADD COLUMN IF NOT EXISTS flat_fee_amount INTEGER,
  ADD COLUMN IF NOT EXISTS whitelisting_duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS content_source TEXT CHECK (content_source IN ('new', 'existing')),
  ADD COLUMN IF NOT EXISTS existing_content_url TEXT,
  ADD COLUMN IF NOT EXISTS has_gift_card BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_flat_fee BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL;
