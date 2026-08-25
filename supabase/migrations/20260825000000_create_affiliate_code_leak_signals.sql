-- Findings from the bi-weekly affiliate-code leak scan (/api/cron/scan-code-leaks).
--
-- A leaked code keeps paying commission on orders the creator never drove. The
-- scan reads Shopify's referring_site on orders that redeemed a tracked code:
-- a healthy creator code arrives from Instagram, a leaked one arrives from
-- Google search, direct, or a coupon aggregator. Each finding lands here with
-- the evidence needed to justify rotating the code by hand.
CREATE TABLE IF NOT EXISTS affiliate_code_leak_signals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_code    text NOT NULL,
  signal_type       text NOT NULL CHECK (signal_type IN
                      ('coupon_referrer', 'referrer_mix', 'usage_spike')),
  severity          text NOT NULL CHECK (severity IN ('confirmed', 'high', 'medium')),
  -- Referrer breakdown, order totals, and up to 5 sample orders, so the admin
  -- page and the digest email can justify the finding without a second
  -- Shopify call.
  evidence          jsonb NOT NULL DEFAULT '{}'::jsonb,
  window_start      date NOT NULL,
  window_end        date NOT NULL,
  status            text NOT NULL DEFAULT 'open' CHECK (status IN
                      ('open', 'acknowledged', 'resolved', 'ignored')),
  first_detected_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Dedup key for the scan. Re-detecting the same leak bumps last_detected_at and
-- refreshes evidence instead of stacking a new row every fortnight. Scoped to
-- status='open' on purpose: once a finding is resolved or ignored it stops
-- blocking, so a genuine fresh leak on the same code still gets recorded.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_code_leak_signals_open_key
  ON affiliate_code_leak_signals (UPPER(affiliate_code), signal_type)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_affiliate_code_leak_signals_status
  ON affiliate_code_leak_signals (status, severity, last_detected_at DESC);

-- RLS: service role only. Every read path goes through an admin API route.
ALTER TABLE affiliate_code_leak_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on affiliate_code_leak_signals"
  ON affiliate_code_leak_signals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
