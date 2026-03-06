DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'influencer_orders' AND column_name = 'fulfillment_status') THEN
    ALTER TABLE influencer_orders ADD COLUMN fulfillment_status text DEFAULT 'unfulfilled';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'influencer_orders' AND column_name = 'tracking_url') THEN
    ALTER TABLE influencer_orders ADD COLUMN tracking_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'influencer_orders' AND column_name = 'delivery_status') THEN
    ALTER TABLE influencer_orders ADD COLUMN delivery_status text;
  END IF;
END $$;
