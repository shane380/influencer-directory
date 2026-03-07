-- Add deal_id column for paid collab payment rows
ALTER TABLE creator_payments ADD COLUMN IF NOT EXISTS deal_id UUID REFERENCES campaign_deals(id);

-- Drop old unique index (only allowed one payment_type per influencer per month)
DROP INDEX IF EXISTS idx_creator_payments_unique;

-- New unique index includes deal_id so multiple paid_collab rows per influencer per month are supported
CREATE UNIQUE INDEX idx_creator_payments_unique ON creator_payments(influencer_id, month, payment_type, COALESCE(deal_id, '00000000-0000-0000-0000-000000000000'));
