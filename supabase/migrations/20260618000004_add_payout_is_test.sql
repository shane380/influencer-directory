-- Isolate test payments made on preview deployments from real payouts. A POST
-- from a non-production environment (VERCEL_ENV !== 'production') sets is_test=true;
-- production-facing reads exclude test rows, so clicking Record Payment on the
-- preview can never pollute the real payouts ledger. Test rows are trivially
-- purged before cutover.
ALTER TABLE creator_payouts ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_creator_payouts_is_test ON creator_payouts(is_test);
