-- Track fulfillment status of each gift order so the PR list can show an Order
-- column (Placed / Shipped / Delivered) like the campaign tables.
-- Derived from Shopify fulfillment data at sync time: 'placed' | 'shipped' | 'delivered'.
ALTER TABLE gift_orders ADD COLUMN IF NOT EXISTS order_status TEXT;
