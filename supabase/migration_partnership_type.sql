-- Migration: Change category to partnership_type
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Step 1: Create the new partnership_type enum
CREATE TYPE partnership_type_enum AS ENUM ('gifted_no_ask', 'gifted_soft_ask', 'gifted_deliverable_ask', 'gifted_recurring', 'paid');

-- Step 2: Add the new partnership_type column with a default value
ALTER TABLE influencers ADD COLUMN partnership_type partnership_type_enum NOT NULL DEFAULT 'gifted_no_ask';

-- Step 3: Drop the old category column and its index
DROP INDEX IF EXISTS idx_influencers_category;
ALTER TABLE influencers DROP COLUMN category;

-- Step 4: Drop the old category_type enum
DROP TYPE IF EXISTS category_type;

-- Step 5: Create index for the new column
CREATE INDEX idx_influencers_partnership_type ON influencers(partnership_type);
