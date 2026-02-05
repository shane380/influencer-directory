-- Add whitelisting fields to influencers table
-- Whitelisting is orthogonal to partnership_type - an influencer can be gifted/paid AND available for whitelisting

CREATE TYPE whitelisting_type_enum AS ENUM ('paid', 'gifted');

ALTER TABLE influencers
ADD COLUMN whitelisting_enabled BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN whitelisting_type whitelisting_type_enum;

-- Partial index for efficient queries of whitelisting-enabled influencers
CREATE INDEX idx_influencers_whitelisting ON influencers(whitelisting_enabled)
  WHERE whitelisting_enabled = TRUE;
