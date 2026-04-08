-- Add encrypted columns for sensitive payment fields
ALTER TABLE creators
  ADD COLUMN IF NOT EXISTS bank_account_number_enc TEXT,
  ADD COLUMN IF NOT EXISTS bank_routing_number_enc TEXT;
