-- A promised payment: an invoice has been received (or a pay date agreed) and
-- the money is scheduled to go out on a date. Distinct from creator_payouts,
-- which records money that HAS moved — a schedule is an intention, and must
-- never count as paid. The payments page shows it beside the balance so a row
-- with a plan reads "scheduled 31 Aug" rather than a bare overdue flag.
CREATE TABLE IF NOT EXISTS payment_schedules (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id        uuid REFERENCES influencers(id) ON DELETE CASCADE,
  legacy_affiliate_id  uuid REFERENCES legacy_affiliates(id) ON DELETE CASCADE,
  amount               numeric,
  scheduled_for        date NOT NULL,
  note                 text,
  created_by           text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  -- Set when the payment is recorded (or the plan abandoned); an active
  -- schedule is one with cleared_at IS NULL.
  cleared_at           timestamptz,
  CONSTRAINT payment_schedules_one_subject CHECK (
    influencer_id IS NOT NULL OR legacy_affiliate_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_payment_schedules_active
  ON payment_schedules(influencer_id, legacy_affiliate_id)
  WHERE cleared_at IS NULL;

ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on payment_schedules" ON payment_schedules;
CREATE POLICY "Service role full access on payment_schedules"
  ON payment_schedules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
