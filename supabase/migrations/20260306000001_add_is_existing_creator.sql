ALTER TABLE creator_invites
  ADD COLUMN IF NOT EXISTS is_existing_creator BOOLEAN NOT NULL DEFAULT false;
