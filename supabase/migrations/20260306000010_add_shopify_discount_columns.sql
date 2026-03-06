ALTER TABLE creator_invites
  ADD COLUMN IF NOT EXISTS shopify_price_rule_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_discount_code_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_code_status TEXT DEFAULT 'pending';
