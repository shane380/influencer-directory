-- Add is_manager column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_manager BOOLEAN DEFAULT FALSE;
