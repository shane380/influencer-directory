-- Add deal_status column to campaign_deals table
-- Tracks whether a deal is being negotiated or confirmed

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS deal_status TEXT DEFAULT 'negotiating' CHECK (deal_status IN ('negotiating', 'confirmed', 'cancelled'));

COMMENT ON COLUMN campaign_deals.deal_status IS 'Deal status: negotiating, confirmed, cancelled';
