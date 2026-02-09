ALTER TABLE influencers ADD COLUMN google_drive_folder_id TEXT;

ALTER TABLE content ADD COLUMN deal_id UUID REFERENCES campaign_deals(id) ON DELETE SET NULL;
ALTER TABLE content ADD COLUMN google_drive_file_id TEXT;
ALTER TABLE content ADD COLUMN file_name TEXT;
ALTER TABLE content ADD COLUMN file_size BIGINT;
ALTER TABLE content ADD COLUMN uploaded_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE content DROP CONSTRAINT IF EXISTS content_original_url_key;
ALTER TABLE content ALTER COLUMN original_url DROP NOT NULL;

UPDATE content SET uploaded_at = scraped_at WHERE uploaded_at IS NULL;

CREATE INDEX idx_content_deal ON content(deal_id);
CREATE INDEX idx_content_gdrive ON content(google_drive_file_id);
