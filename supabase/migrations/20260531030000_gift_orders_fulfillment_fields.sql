-- Add fulfillment/tracking fields to gift_orders so it can fully replace
-- influencer_orders (the creator dashboard renders delivery status + tracking).
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS fulfillment_status TEXT;
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS delivery_status TEXT;
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS tracking_url TEXT;
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
