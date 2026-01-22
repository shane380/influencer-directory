-- Add 'creator_wants_paid' to relationship_status_type enum
ALTER TYPE relationship_status_type ADD VALUE IF NOT EXISTS 'creator_wants_paid';
