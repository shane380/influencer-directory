-- Retainers now have a term (number of months) instead of billing every calendar
-- month forever. NULL = ongoing/month-to-month (the rare case). Each installment
-- only earns when its content is marked received (content-gated), so this is just
-- the contract length used to render installments 1..N for marking.
ALTER TABLE creator_invites ADD COLUMN IF NOT EXISTS retainer_months INTEGER;
