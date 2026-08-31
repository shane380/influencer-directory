-- The creator-facing receipt for one payout, snapshotted at recording time by
-- the API (months covered, amounts, phrasing). Stored rather than recomputed:
-- editing payment history reshuffles the live FIFO allocation, and a receipt
-- the creator has already read must not rewrite itself. Null on rows recorded
-- before receipts existed — those get a reconstruction, labelled as such.
ALTER TABLE creator_payouts ADD COLUMN IF NOT EXISTS receipt jsonb;
