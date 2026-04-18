ALTER TABLE creator_invites
  ADD COLUMN IF NOT EXISTS one_off_fulfilled_at TIMESTAMPTZ;
