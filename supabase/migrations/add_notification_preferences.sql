ALTER TABLE creators ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email_campaigns": true, "email_content_status": true, "email_invites": true}'::jsonb;
