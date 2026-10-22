-- Per-campaign switch: let creators pick any size on the selects page,
-- regardless of Shopify stock (gifts ship from PR stock / incoming drops).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS gift_ignore_stock boolean NOT NULL DEFAULT false;
