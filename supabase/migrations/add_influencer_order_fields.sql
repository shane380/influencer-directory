-- Add order-related fields to influencers table for whitelisting orders
-- These allow saving product selections and order status for influencers outside of campaigns

ALTER TABLE influencers
ADD COLUMN IF NOT EXISTS product_selections jsonb,
ADD COLUMN IF NOT EXISTS shopify_order_id text,
ADD COLUMN IF NOT EXISTS shopify_order_status text CHECK (shopify_order_status IN ('draft', 'placed', 'fulfilled'));
