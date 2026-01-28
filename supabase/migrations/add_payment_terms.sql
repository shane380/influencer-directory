-- Add payment_terms column to campaign_deals table
-- This stores payment milestones as JSONB array

ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS payment_terms JSONB DEFAULT '[]'::JSONB;

-- Add comment for documentation
COMMENT ON COLUMN campaign_deals.payment_terms IS 'Array of payment milestones with id, description, percentage, amount, is_paid, paid_date';
