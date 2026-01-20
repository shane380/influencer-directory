-- Influencer Directory Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Create custom enum types
CREATE TYPE partnership_type_enum AS ENUM ('gifted_no_ask', 'gifted_soft_ask', 'gifted_deliverable_ask', 'gifted_recurring', 'paid');
CREATE TYPE tier_type AS ENUM ('S', 'A', 'B', 'C');
CREATE TYPE relationship_status_type AS ENUM ('prospect', 'gifted', 'active_partner', 'ambassador', 'inactive');
CREATE TYPE source_type AS ENUM ('dm', 'agency', 'organic', 'referral', 'other');

-- Create influencers table
CREATE TABLE influencers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  instagram_handle TEXT NOT NULL,
  profile_photo_url TEXT,
  follower_count INTEGER NOT NULL DEFAULT 0,
  engagement_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
  email TEXT,
  phone TEXT,
  mailing_address TEXT,
  agent_name TEXT,
  agent_email TEXT,
  agent_phone TEXT,
  partnership_type partnership_type_enum NOT NULL DEFAULT 'gifted_no_ask',
  tier tier_type NOT NULL DEFAULT 'C',
  relationship_status relationship_status_type NOT NULL DEFAULT 'prospect',
  source source_type NOT NULL DEFAULT 'other',
  notes TEXT,
  last_contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create indexes for common queries
CREATE INDEX idx_influencers_partnership_type ON influencers(partnership_type);
CREATE INDEX idx_influencers_tier ON influencers(tier);
CREATE INDEX idx_influencers_status ON influencers(relationship_status);
CREATE INDEX idx_influencers_name ON influencers(name);
CREATE INDEX idx_influencers_followers ON influencers(follower_count DESC);
CREATE INDEX idx_influencers_last_contacted ON influencers(last_contacted_at DESC NULLS LAST);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to auto-update updated_at
CREATE TRIGGER update_influencers_updated_at
  BEFORE UPDATE ON influencers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE influencers ENABLE ROW LEVEL SECURITY;

-- Create policy to allow authenticated users to view all influencers
CREATE POLICY "Authenticated users can view all influencers"
  ON influencers
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy to allow authenticated users to insert influencers
CREATE POLICY "Authenticated users can insert influencers"
  ON influencers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policy to allow authenticated users to update influencers
CREATE POLICY "Authenticated users can update influencers"
  ON influencers
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy to allow authenticated users to delete influencers
CREATE POLICY "Authenticated users can delete influencers"
  ON influencers
  FOR DELETE
  TO authenticated
  USING (true);

-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policy for authenticated users to upload
CREATE POLICY "Authenticated users can upload profile photos"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'profile-photos');

-- Create storage policy for public viewing
CREATE POLICY "Public can view profile photos"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'profile-photos');

-- Create storage policy for authenticated users to update
CREATE POLICY "Authenticated users can update profile photos"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'profile-photos');

-- Create storage policy for authenticated users to delete
CREATE POLICY "Authenticated users can delete profile photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'profile-photos');
