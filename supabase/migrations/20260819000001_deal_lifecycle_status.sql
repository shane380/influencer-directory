-- deal_status becomes a lifecycle rather than a commitment flag:
--   negotiating -> active -> closed, with cancelled as the off-ramp.
--
-- 'confirmed' retires into 'active'. The two meant the same thing, and having
-- both invited "which do I pick?" — a filter nobody trusts within a month.
-- 'closed' is the addition that matters: only a person can tell a deal that is
-- still running from one that was abandoned and never tidied up, and without
-- that, "who currently has a committed partnership" cannot be answered.
ALTER TABLE campaign_deals DROP CONSTRAINT IF EXISTS campaign_deals_deal_status_check;
ALTER TABLE campaign_deals ADD CONSTRAINT campaign_deals_deal_status_check
  CHECK (deal_status IN ('negotiating', 'confirmed', 'active', 'closed', 'cancelled'));

-- Every committed deal becomes active. Nothing is closed automatically: a query
-- can show that a deal LOOKS finished, but only a person knows whether it is,
-- and a wrongly closed deal quietly drops off the list of work being chased.
-- Closing is a deliberate act, done from the UI.
UPDATE campaign_deals SET deal_status = 'active' WHERE deal_status = 'confirmed';

-- With no rows left on the old value, drop it so it cannot come back.
ALTER TABLE campaign_deals DROP CONSTRAINT campaign_deals_deal_status_check;
ALTER TABLE campaign_deals ADD CONSTRAINT campaign_deals_deal_status_check
  CHECK (deal_status IN ('negotiating', 'active', 'closed', 'cancelled'));

ALTER TABLE campaign_deals ALTER COLUMN deal_status SET DEFAULT 'negotiating';

COMMENT ON COLUMN campaign_deals.deal_status IS
  'Lifecycle: negotiating (quoted) -> active (committed, running) -> closed (finished, no further action). cancelled = did not happen.';
