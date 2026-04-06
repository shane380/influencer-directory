-- Add legacy_affiliate_id to creator_payments
ALTER TABLE creator_payments ADD COLUMN IF NOT EXISTS legacy_affiliate_id UUID REFERENCES legacy_affiliates(id);

-- Update payment_type CHECK to include legacy_affiliate_commission
-- (Drop existing if present, then add new one)
ALTER TABLE creator_payments DROP CONSTRAINT IF EXISTS creator_payments_payment_type_check;
ALTER TABLE creator_payments ADD CONSTRAINT creator_payments_payment_type_check
  CHECK (payment_type IN ('ad_spend_commission', 'retainer', 'affiliate_commission', 'paid_collab', 'refund_adjustment', 'legacy_affiliate_commission'));

-- Recreate unique index to include legacy_affiliate_id
DROP INDEX IF EXISTS idx_creator_payments_unique;
CREATE UNIQUE INDEX idx_creator_payments_unique ON creator_payments(
  COALESCE(influencer_id, '00000000-0000-0000-0000-000000000000'),
  month,
  payment_type,
  COALESCE(deal_id, '00000000-0000-0000-0000-000000000000'),
  COALESCE(legacy_affiliate_id, '00000000-0000-0000-0000-000000000000')
);

CREATE INDEX idx_creator_payments_legacy ON creator_payments(legacy_affiliate_id)
  WHERE legacy_affiliate_id IS NOT NULL;
