-- Allow videos_per_month to be null for no-deal invites
ALTER TABLE creator_invites ALTER COLUMN videos_per_month DROP NOT NULL;
ALTER TABLE creator_invites ALTER COLUMN videos_per_month SET DEFAULT NULL;
