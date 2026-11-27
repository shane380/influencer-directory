-- People who receive product through a campaign but are not influencers
-- (event staff, studio instructors, etc). They have no Instagram handle
-- (stored as '') and are kept out of the main influencer directory.
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS is_non_influencer boolean NOT NULL DEFAULT false;
