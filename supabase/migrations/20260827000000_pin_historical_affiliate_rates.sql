-- Pin today's commission rates as a floor, so history cannot be repriced.
--
-- affiliate_commission_rates made rates effective-dated, but months earlier than
-- any scheduled row still fall back to the scalar column on legacy_affiliates /
-- creators. That leaves one hazard: the obvious admin action on 1 September --
-- "set the rate to 10 so the page matches" -- would, at the next sync, rewrite
-- every pre-September event through the fallback and cut eight months of
-- recorded earnings by 60%, with no audit trail.
--
-- Writing the current scalar as a row effective from 2000-01-01 makes the
-- fallback unreachable: every month now resolves to a row, so editing the scalar
-- changes nothing that has already been earned.
--
-- The trade-off, deliberately accepted: the scalar becomes cosmetic. From here,
-- a rate change is a new row with an effective_from date, not an edit.
INSERT INTO affiliate_commission_rates (legacy_affiliate_id, commission_rate, effective_from, note)
SELECT id, commission_rate, DATE '2000-01-01', 'Historical scalar pinned; earlier months price from here'
FROM legacy_affiliates
WHERE commission_rate IS NOT NULL AND commission_rate > 0
ON CONFLICT DO NOTHING;

INSERT INTO affiliate_commission_rates (creator_id, commission_rate, effective_from, note)
SELECT id, commission_rate, DATE '2000-01-01', 'Historical scalar pinned; earlier months price from here'
FROM creators
WHERE affiliate_code IS NOT NULL AND commission_rate IS NOT NULL AND commission_rate > 0
ON CONFLICT DO NOTHING;
