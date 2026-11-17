-- Event mode for the gift Selects page: outfits are collected at an event
-- instead of shipped. Swaps the launch/shipping copy, drops the address
-- requirement, and shows the campaign start date as the event date with an
-- optional arrival time (24h "HH:MM") and venue address. Set per campaign in
-- the Selects Page dialog.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS gift_event_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_event_time text,
  ADD COLUMN IF NOT EXISTS gift_event_location text;
