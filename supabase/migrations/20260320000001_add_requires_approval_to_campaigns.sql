-- Add requires_approval flag to campaigns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
