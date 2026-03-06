CREATE TABLE IF NOT EXISTS creator_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  brief_url TEXT,
  brief_images JSONB DEFAULT '[]',
  due_date DATE,
  available_products JSONB DEFAULT '[]',
  max_selects INTEGER DEFAULT 2,
  campaign_type TEXT DEFAULT 'mass' CHECK (campaign_type IN ('mass', 'individual')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'closed')),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES creator_campaigns(id) ON DELETE CASCADE,
  influencer_id UUID REFERENCES influencers(id),
  creator_id UUID REFERENCES creators(id),
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'confirmed', 'content_submitted', 'complete', 'declined')),
  selected_products JSONB DEFAULT '[]',
  creator_notes TEXT,
  admin_notes TEXT,
  order_id TEXT,
  content_submission_id UUID REFERENCES creator_content_submissions(id),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE creator_sample_requests
  ADD COLUMN IF NOT EXISTS campaign_assignment_id UUID REFERENCES campaign_assignments(id);

ALTER TABLE creator_content_submissions
  ADD COLUMN IF NOT EXISTS campaign_assignment_id UUID REFERENCES campaign_assignments(id);

-- RLS
ALTER TABLE creator_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active creator campaigns"
  ON creator_campaigns FOR SELECT
  USING (true);

CREATE POLICY "Creators can view own assignments"
  ON campaign_assignments FOR SELECT
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));

CREATE POLICY "Creators can update own assignments"
  ON campaign_assignments FOR UPDATE
  USING (creator_id IN (SELECT id FROM creators WHERE user_id = auth.uid()));
