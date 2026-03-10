-- Allow content_type to be null for no-deal invites
ALTER TABLE creator_invites ALTER COLUMN content_type DROP NOT NULL;
ALTER TABLE creator_invites ALTER COLUMN content_type SET DEFAULT NULL;
