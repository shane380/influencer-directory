DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creator_invites_slug_key'
  ) THEN
    ALTER TABLE creator_invites ADD CONSTRAINT creator_invites_slug_key UNIQUE (slug);
  END IF;
END $$;
