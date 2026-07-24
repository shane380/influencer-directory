-- Deadline shown on the gift Selects page ("make your picks by ...").
-- Set per campaign in the Selects Page dialog.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS gift_selects_deadline date;
