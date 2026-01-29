-- Content Monitoring Migration
-- Stores scraped Instagram stories/posts/reels that tag @nama

-- Create content table
CREATE TABLE content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id UUID NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'story' CHECK (type IN ('story', 'post', 'reel')),
  media_url TEXT NOT NULL,
  original_url TEXT NOT NULL UNIQUE,
  thumbnail_url TEXT,
  caption TEXT,
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  platform TEXT NOT NULL DEFAULT 'instagram',
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::JSONB
);

-- Create indexes for efficient queries
CREATE INDEX idx_content_influencer ON content(influencer_id);
CREATE INDEX idx_content_posted_at ON content(posted_at DESC);

-- Enable Row Level Security
ALTER TABLE content ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view all content"
  ON content FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert content"
  ON content FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update content"
  ON content FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete content"
  ON content FOR DELETE TO authenticated USING (true);

-- Service role bypass (for API cron jobs)
CREATE POLICY "Service role full access"
  ON content FOR ALL TO service_role USING (true) WITH CHECK (true);
