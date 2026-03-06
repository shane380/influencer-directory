-- Drop old table if it exists (was a simple URL-based form)
DROP TABLE IF EXISTS creator_content_submissions;

CREATE TABLE creator_content_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES creators(id),
  influencer_id UUID REFERENCES influencers(id),
  month TEXT NOT NULL,
  drive_folder_id TEXT,
  drive_folder_url TEXT,
  files JSONB DEFAULT '[]',
  notes TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'revision_requested')),
  admin_feedback TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE creator_content_submissions ENABLE ROW LEVEL SECURITY;

-- Creators can view their own submissions
CREATE POLICY "Creators can view own submissions"
  ON creator_content_submissions FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- Creators can insert their own submissions
CREATE POLICY "Creators can insert own submissions"
  ON creator_content_submissions FOR INSERT
  WITH CHECK (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

-- Service role has full access (implicit via supabase service key)
