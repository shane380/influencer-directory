-- Creative Invitations are campaigns linked to a parent campaign
ALTER TABLE creator_campaigns ADD COLUMN IF NOT EXISTS parent_campaign_id uuid REFERENCES creator_campaigns(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_campaigns_parent ON creator_campaigns(parent_campaign_id);
