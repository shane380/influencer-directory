ALTER TABLE creator_invites
  ADD COLUMN IF NOT EXISTS minimum_commitment INTEGER DEFAULT NULL;
-- NULL means pure month-to-month, integer value means minimum months e.g. 3
