ALTER TABLE campaign_deals
ADD COLUMN IF NOT EXISTS whitelisting_expiry_date TIMESTAMPTZ;

UPDATE campaign_deals
SET whitelisting_expiry_date = whitelisting_live_date + INTERVAL '90 days'
WHERE whitelisting_live_date IS NOT NULL AND whitelisting_expiry_date IS NULL;
