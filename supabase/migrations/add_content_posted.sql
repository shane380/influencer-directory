-- Add content_posted field to campaign_influencers table
-- Options: none, stories, in_feed_post, reel, tiktok

CREATE TYPE content_posted_type AS ENUM ('none', 'stories', 'in_feed_post', 'reel', 'tiktok');

ALTER TABLE campaign_influencers
ADD COLUMN content_posted content_posted_type NOT NULL DEFAULT 'none';
