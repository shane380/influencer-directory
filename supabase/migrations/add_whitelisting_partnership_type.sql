-- Add 'whitelisting' to the partnership_type_enum
ALTER TYPE partnership_type_enum ADD VALUE IF NOT EXISTS 'whitelisting';
