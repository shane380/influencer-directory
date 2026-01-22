-- Approval Workflow Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Create approval status enum
CREATE TYPE approval_status_type AS ENUM ('pending', 'approved', 'declined');

-- Add approval fields to campaign_influencers table
ALTER TABLE campaign_influencers
  ADD COLUMN approval_status approval_status_type DEFAULT NULL,
  ADD COLUMN approval_note TEXT DEFAULT NULL,
  ADD COLUMN approved_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN approved_by UUID REFERENCES auth.users(id) DEFAULT NULL;

-- Create index for filtering by approval status
CREATE INDEX idx_campaign_influencers_approval_status ON campaign_influencers(approval_status)
  WHERE approval_status IS NOT NULL;

-- Comment on columns for documentation
COMMENT ON COLUMN campaign_influencers.approval_status IS 'NULL means no approval needed, pending/approved/declined for approval workflow';
COMMENT ON COLUMN campaign_influencers.approval_note IS 'Optional note from approver';
COMMENT ON COLUMN campaign_influencers.approved_at IS 'Timestamp when approval decision was made';
COMMENT ON COLUMN campaign_influencers.approved_by IS 'User ID who made the approval decision';
