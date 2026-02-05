-- Add influencer_contracts table for storing generated and signed contracts

CREATE TYPE contract_type_enum AS ENUM ('paid_collab', 'whitelisting');
CREATE TYPE contract_status_enum AS ENUM ('draft', 'sent', 'signed');

CREATE TABLE influencer_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  contract_type contract_type_enum NOT NULL,
  variables JSONB NOT NULL DEFAULT '{}',
  generated_pdf_url TEXT,
  signed_pdf_url TEXT,
  status contract_status_enum NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying contracts by influencer
CREATE INDEX idx_influencer_contracts_influencer ON influencer_contracts(influencer_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_influencer_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER influencer_contracts_updated_at
  BEFORE UPDATE ON influencer_contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_influencer_contracts_updated_at();
