-- Archive flag for the whitelisting list: archived influencers stay in the
-- database (and keep whitelisting_enabled + history) but are hidden from the
-- active whitelisting view until restored.
ALTER TABLE influencers
ADD COLUMN IF NOT EXISTS whitelisting_archived_at timestamptz;
