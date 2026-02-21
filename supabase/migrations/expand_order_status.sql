-- Expand order status: draft | fulfilled | shipped | delivered
-- Add tracking columns and shopify_real_order_id to both tables

-- 1. Migrate existing 'placed' rows to 'draft'
UPDATE influencers SET shopify_order_status = 'draft' WHERE shopify_order_status = 'placed';
UPDATE campaign_influencers SET shopify_order_status = 'draft' WHERE shopify_order_status = 'placed';

-- 2. Drop old check constraints
ALTER TABLE influencers DROP CONSTRAINT IF EXISTS influencers_shopify_order_status_check;
ALTER TABLE campaign_influencers DROP CONSTRAINT IF EXISTS campaign_influencers_shopify_order_status_check;

-- 3. Add new check constraints
ALTER TABLE influencers
ADD CONSTRAINT influencers_shopify_order_status_check
CHECK (shopify_order_status IN ('draft', 'fulfilled', 'shipped', 'delivered'));

ALTER TABLE campaign_influencers
ADD CONSTRAINT campaign_influencers_shopify_order_status_check
CHECK (shopify_order_status IN ('draft', 'fulfilled', 'shipped', 'delivered'));

-- 4. Add new columns to influencers
ALTER TABLE influencers
ADD COLUMN IF NOT EXISTS tracking_number text,
ADD COLUMN IF NOT EXISTS tracking_url text,
ADD COLUMN IF NOT EXISTS order_status_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS shopify_real_order_id text;

-- 5. Add new columns to campaign_influencers
ALTER TABLE campaign_influencers
ADD COLUMN IF NOT EXISTS tracking_number text,
ADD COLUMN IF NOT EXISTS tracking_url text,
ADD COLUMN IF NOT EXISTS order_status_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS shopify_real_order_id text;
