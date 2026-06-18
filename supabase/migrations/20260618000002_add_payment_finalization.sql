-- Earnings finalization. `creator_payments.amount_owed` is computed from Shopify
-- but used to freeze the moment a row went non-pending (status approved/paid/
-- skipped), so a buggy first computation never self-corrected. We replace that
-- status-based lock with an explicit finalization timestamp:
--   * finalized_at IS NULL  -> earnings are still refreshable (recompute from Shopify)
--   * finalized_at IS NOT NULL -> locked (refund window closed); later refunds clawed back
-- and an `excluded` flag to carry the old status='skipped' meaning.
--
-- finalized_at is intentionally left NULL for existing rows so past months can be
-- trued up (re-run the now-fixed calc) before the auto-finalize cron locks them.
ALTER TABLE creator_payments ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ;
ALTER TABLE creator_payments ADD COLUMN IF NOT EXISTS excluded BOOLEAN DEFAULT false;

-- Preserve the existing "skipped" intent under the new flag.
UPDATE creator_payments SET excluded = true WHERE status = 'skipped';

CREATE INDEX IF NOT EXISTS idx_creator_payments_finalized_at ON creator_payments(finalized_at);
