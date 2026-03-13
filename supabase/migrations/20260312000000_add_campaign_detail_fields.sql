-- Add campaign detail fields for redesigned campaign experience
ALTER TABLE creator_campaigns ADD COLUMN IF NOT EXISTS banner_image JSONB;
ALTER TABLE creator_campaigns ADD COLUMN IF NOT EXISTS deliverables TEXT;
ALTER TABLE creator_campaigns ADD COLUMN IF NOT EXISTS go_live_date DATE;
