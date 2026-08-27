-- Effective-dated commission rates for affiliates.
--
-- commission_rate on creators / legacy_affiliates is a single scalar with no
-- history, and /api/admin/payments/generate reads it at the moment it builds a
-- month's payment rows. So changing a rate silently repriced any month that had
-- not been generated yet -- run August's payments late, after a rate change,
-- and August got paid at the new rate. This table pins a rate to the date it
-- takes effect so a month is always priced at the rate that was in force then.
--
-- A row applies from effective_from onward until a later row supersedes it.
-- Months earlier than the first row fall back to the scalar on the subject
-- row, so no historical backfill is needed. Rates take effect on month
-- boundaries: a mid-month effective_from applies from the following month.
CREATE TABLE IF NOT EXISTS affiliate_commission_rates (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Exactly one of these is set: partners with a portal login live in
  -- creators, code-only affiliates in legacy_affiliates.
  creator_id           uuid REFERENCES creators(id) ON DELETE CASCADE,
  legacy_affiliate_id  uuid REFERENCES legacy_affiliates(id) ON DELETE CASCADE,
  commission_rate      numeric NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 100),
  effective_from       date NOT NULL,
  note                 text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_commission_rates_one_subject CHECK (
    (creator_id IS NOT NULL AND legacy_affiliate_id IS NULL) OR
    (creator_id IS NULL AND legacy_affiliate_id IS NOT NULL)
  )
);

-- One rate per subject per start date, so re-running a scheduling script is
-- idempotent rather than stacking duplicate rows on the same day.
CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_rates_creator_date
  ON affiliate_commission_rates(creator_id, effective_from)
  WHERE creator_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_rates_legacy_date
  ON affiliate_commission_rates(legacy_affiliate_id, effective_from)
  WHERE legacy_affiliate_id IS NOT NULL;

ALTER TABLE affiliate_commission_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on affiliate_commission_rates" ON affiliate_commission_rates;
CREATE POLICY "Service role full access on affiliate_commission_rates"
  ON affiliate_commission_rates FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Move every legacy affiliate onto the program standard from 1 September 2026.
-- Selected by query rather than listed by id, to keep partner details out of
-- version control. Months before September still resolve to the 25% scalar on
-- legacy_affiliates, so August is unaffected however late it is generated.
INSERT INTO affiliate_commission_rates (legacy_affiliate_id, commission_rate, effective_from, note)
SELECT id, 10, DATE '2026-09-01', 'Program standard: 15% audience discount / 10% commission'
FROM legacy_affiliates
ON CONFLICT DO NOTHING;

COMMENT ON COLUMN affiliate_commission_rates.effective_from IS
  'First day the rate applies. Resolved against the first of the payment month, so mid-month dates take effect the following month.';
