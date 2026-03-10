-- Allow videos_per_month and content_type to be null for no-deal invites
ALTER TABLE creator_invites ALTER COLUMN videos_per_month DROP NOT NULL;
ALTER TABLE creator_invites ALTER COLUMN videos_per_month SET DEFAULT NULL;
ALTER TABLE creator_invites ALTER COLUMN content_type DROP NOT NULL;
ALTER TABLE creator_invites ALTER COLUMN content_type SET DEFAULT NULL;
