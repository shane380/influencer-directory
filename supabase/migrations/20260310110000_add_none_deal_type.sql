-- Add 'none' as a valid deal_type for account-only invites
ALTER TABLE creator_invites DROP CONSTRAINT creator_invites_deal_type_check;
ALTER TABLE creator_invites ADD CONSTRAINT creator_invites_deal_type_check
  CHECK (deal_type IN ('affiliate', 'ad_spend', 'retainer', 'none'));
