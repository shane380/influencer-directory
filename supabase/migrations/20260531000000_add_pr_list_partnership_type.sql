-- Add 'pr_list' to the partnership_type_enum
-- PR list = influencers graduated to a recurring-gifting cadence (product every 30-45 days)
ALTER TYPE partnership_type_enum ADD VALUE IF NOT EXISTS 'pr_list';
