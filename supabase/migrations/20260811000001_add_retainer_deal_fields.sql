-- Retainers are recorded as campaign_deals, not as a separate table: a retainer
-- is a deal whose payment_terms milestones each earn when that period's content
-- is delivered. These columns are what separates one from a one-off deal.
--
-- ends_on is stored rather than derived from starts_on + term_months, because
-- real terms end on content, not on the calendar (e.g. "30 days after the final
-- post"). Leaving it NULL means the end is not yet determined.
ALTER TABLE campaign_deals
  ADD COLUMN IF NOT EXISTS deal_kind TEXT NOT NULL DEFAULT 'one_off',
  ADD COLUMN IF NOT EXISTS starts_on DATE,
  ADD COLUMN IF NOT EXISTS ends_on DATE,
  ADD COLUMN IF NOT EXISTS term_months INTEGER;

ALTER TABLE campaign_deals DROP CONSTRAINT IF EXISTS campaign_deals_deal_kind_check;
ALTER TABLE campaign_deals ADD CONSTRAINT campaign_deals_deal_kind_check
  CHECK (deal_kind IN ('one_off', 'retainer'));

CREATE INDEX IF NOT EXISTS idx_campaign_deals_kind ON campaign_deals(deal_kind);

-- Backfill the three existing retainer deals. Two have an agreed start date and
-- a three-month term; the third's terms were never recorded in writing, so its
-- dates are left NULL for the partnerships lead to enter rather than guessed
-- here. Deal ids only — no creator details in version control.
UPDATE campaign_deals SET deal_kind = 'retainer', term_months = 3, starts_on = '2026-06-19'
  WHERE id IN ('59cdc004-2b5f-4fba-b80c-1c55af9dc215', '230bde34-9608-494e-bc6f-8a0465da1355');

UPDATE campaign_deals SET deal_kind = 'retainer'
  WHERE id = '41f544e3-07db-48fc-a03a-73c1d30206cf';
