-- Add is_admin column to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Set shane@namaclo.com as admin
UPDATE profiles SET is_admin = TRUE WHERE email = 'shane@namaclo.com';
