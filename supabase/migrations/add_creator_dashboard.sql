-- Link invites to influencer profiles
ALTER TABLE creator_invites ADD COLUMN IF NOT EXISTS influencer_id UUID REFERENCES influencers(id);

-- Sample request tracking
CREATE TABLE IF NOT EXISTS creator_sample_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  influencer_id UUID REFERENCES influencers(id),
  selections JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT
);

CREATE INDEX ON creator_sample_requests(creator_id);
CREATE INDEX ON creator_sample_requests(status);

ALTER TABLE creator_sample_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator views own requests" ON creator_sample_requests FOR SELECT USING (
  creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
);
CREATE POLICY "Creator creates own requests" ON creator_sample_requests FOR INSERT WITH CHECK (
  creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
);
CREATE POLICY "Service role full access on sample requests" ON creator_sample_requests FOR ALL USING (auth.role() = 'service_role');

-- Content submissions
CREATE TABLE IF NOT EXISTS creator_content_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES creators(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  video_url TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','revision_requested')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT
);

CREATE INDEX ON creator_content_submissions(creator_id);
CREATE INDEX ON creator_content_submissions(month);

ALTER TABLE creator_content_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Creator views own submissions" ON creator_content_submissions FOR SELECT USING (
  creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
);
CREATE POLICY "Creator creates own submissions" ON creator_content_submissions FOR INSERT WITH CHECK (
  creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid())
);
CREATE POLICY "Service role full access on content submissions" ON creator_content_submissions FOR ALL USING (auth.role() = 'service_role');
