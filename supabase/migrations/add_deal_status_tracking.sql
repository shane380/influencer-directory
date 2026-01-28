-- Add status tracking columns to campaign_deals table
-- Content status tracking
ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS content_status TEXT DEFAULT 'not_started' CHECK (content_status IN ('not_started', 'content_approved', 'content_live'));

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS content_live_date DATE;

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS content_status_updated_by UUID REFERENCES auth.users(id);

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS content_status_updated_at TIMESTAMPTZ;

-- Whitelisting status tracking
ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS whitelisting_status TEXT DEFAULT 'not_applicable' CHECK (whitelisting_status IN ('not_applicable', 'pending', 'live', 'ended'));

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS whitelisting_live_date DATE;

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS whitelisting_status_updated_by UUID REFERENCES auth.users(id);

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS whitelisting_status_updated_at TIMESTAMPTZ;

-- Audit fields
ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- Add comments for documentation
COMMENT ON COLUMN campaign_deals.content_status IS 'Content status: not_started, content_approved, content_live';
COMMENT ON COLUMN campaign_deals.content_live_date IS 'Date when content went live';
COMMENT ON COLUMN campaign_deals.content_status_updated_by IS 'User who last updated the content status';
COMMENT ON COLUMN campaign_deals.content_status_updated_at IS 'Timestamp of last content status update';
COMMENT ON COLUMN campaign_deals.whitelisting_status IS 'Whitelisting status: not_applicable, pending, live, ended';
COMMENT ON COLUMN campaign_deals.whitelisting_live_date IS 'Date when whitelisting went live';
COMMENT ON COLUMN campaign_deals.whitelisting_status_updated_by IS 'User who last updated the whitelisting status';
COMMENT ON COLUMN campaign_deals.whitelisting_status_updated_at IS 'Timestamp of last whitelisting status update';
COMMENT ON COLUMN campaign_deals.created_by IS 'User who created the deal';
COMMENT ON COLUMN campaign_deals.updated_by IS 'User who last updated the deal';
