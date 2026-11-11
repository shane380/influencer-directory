-- gift_max_selects counts OUTFITS (an outfit = up to 3 pieces), but its
-- default of 3 dates from when it counted pieces. Every untouched campaign
-- therefore silently allowed 9 pieces. New campaigns now start at 1 outfit.
ALTER TABLE campaigns
  ALTER COLUMN gift_max_selects SET DEFAULT 1;

-- Campaigns that still carry the old default and have never had gifting
-- turned on were never deliberately set to 3 outfits — bring them to 1 so
-- enabling gifting later doesn't inherit the 9-piece cap. Campaigns with
-- gifting enabled are left exactly as they are.
UPDATE campaigns
SET gift_max_selects = 1
WHERE gift_enabled = false
  AND gift_max_selects = 3;
