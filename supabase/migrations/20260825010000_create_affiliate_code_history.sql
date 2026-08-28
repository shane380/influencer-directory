-- Affiliate codes an owner has ROTATED AWAY FROM, so retiring a leaked code
-- does not erase the earnings made under it.
--
-- Commission is calculated by matching an order's discount_codes against the
-- owner's code string. Rotating `creators.affiliate_code` in place would
-- silently drop every order placed on the previous code — the same shape as the
-- March-2026 underpayment. Payment calculation now matches against the current
-- code PLUS every code listed here for that owner.
--
-- Deliberately holds only retired/grace codes, never the current one. Current
-- codes stay authoritative in creators.affiliate_code and
-- legacy_affiliates.discount_code, which matters because three codes today
-- exist in BOTH those tables — mirroring them here would force an ownership
-- decision this table has no business making. A code only lands here once a
-- specific owner rotates away from it, so its owner is never ambiguous.
CREATE TABLE IF NOT EXISTS affiliate_code_history (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                text NOT NULL,
  creator_id          uuid REFERENCES creators(id) ON DELETE CASCADE,
  legacy_affiliate_id uuid REFERENCES legacy_affiliates(id) ON DELETE CASCADE,
  -- Denormalised so the payments path can resolve aliases without a second join.
  influencer_id       uuid REFERENCES influencers(id),
  -- grace   = rotated away from, still redeemable in Shopify, earns nothing new
  -- retired = no longer redeemable
  status              text NOT NULL DEFAULT 'grace'
                        CHECK (status IN ('grace', 'retired')),
  -- When the code stops being redeemable. Mirrors the Shopify price rule's
  -- ends_at, which is what actually enforces it — this column is a record, not
  -- the mechanism.
  grace_until         timestamptz,
  retired_at          timestamptz,
  replaced_by         text NOT NULL,
  reason              text,
  rotated_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_code_history_one_owner CHECK (
    (creator_id IS NOT NULL)::int + (legacy_affiliate_id IS NOT NULL)::int = 1
  )
);

-- Codes are globally unique and never reassigned, which is what makes
-- "every code this owner ever held" unambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_code_history_code_key
  ON affiliate_code_history (UPPER(code));

CREATE INDEX IF NOT EXISTS idx_affiliate_code_history_creator
  ON affiliate_code_history (creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_affiliate_code_history_legacy
  ON affiliate_code_history (legacy_affiliate_id) WHERE legacy_affiliate_id IS NOT NULL;

ALTER TABLE affiliate_code_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on affiliate_code_history"
  ON affiliate_code_history FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
