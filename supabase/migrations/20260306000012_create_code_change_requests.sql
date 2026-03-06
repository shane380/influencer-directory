CREATE TABLE creator_code_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID REFERENCES creators(id),
  influencer_id UUID REFERENCES influencers(id),
  current_code TEXT NOT NULL,
  requested_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE creator_code_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on creator_code_change_requests"
  ON creator_code_change_requests FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Creators can view own code change requests"
  ON creator_code_change_requests FOR SELECT
  USING (creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  ));

CREATE POLICY "Creators can insert own code change requests"
  ON creator_code_change_requests FOR INSERT
  WITH CHECK (creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  ));

CREATE INDEX idx_code_change_requests_creator ON creator_code_change_requests(creator_id);
CREATE INDEX idx_code_change_requests_status ON creator_code_change_requests(status);
