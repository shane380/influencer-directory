ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('paypal', 'bank')),
  ADD COLUMN IF NOT EXISTS paypal_email TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_routing_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_institution TEXT,
  ADD COLUMN IF NOT EXISTS payment_updated_at TIMESTAMPTZ;
