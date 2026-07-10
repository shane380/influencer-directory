-- Gift selection links for gifted/PR campaigns.
-- Purely additive: no existing rows are modified. gift_enabled defaults to
-- false, so every existing campaign is unaffected until explicitly toggled.

-- Campaign-level gift page configuration
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS gift_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gift_hero_image jsonb,            -- { url, r2_key }
  ADD COLUMN IF NOT EXISTS gift_blurb text,
  ADD COLUMN IF NOT EXISTS gift_products jsonb,              -- [{ product_id, product_title, image_url }]
  ADD COLUMN IF NOT EXISTS gift_max_selects integer NOT NULL DEFAULT 3;

-- Per-assignment gift state
ALTER TABLE campaign_influencers
  ADD COLUMN IF NOT EXISTS gift_token text,
  ADD COLUMN IF NOT EXISTS gift_products_override jsonb,     -- null = inherit campaign pool
  ADD COLUMN IF NOT EXISTS gift_max_selects_override integer,
  ADD COLUMN IF NOT EXISTS gift_invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS gift_email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS gift_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS gift_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS gift_shipping jsonb;              -- { name, email, phone, address1, address2, city, province, zip, country_code }

-- Token lookup; partial so the many NULL rows cost nothing
CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_influencers_gift_token
  ON campaign_influencers (gift_token) WHERE gift_token IS NOT NULL;

-- Deliberately NO anon RLS policies here: campaign_influencers carries
-- sensitive fields (notes, compensation, approvals). All public gift access
-- goes through service-role API routes that return allowlisted payloads.
