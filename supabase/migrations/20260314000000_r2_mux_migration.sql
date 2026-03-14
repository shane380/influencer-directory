-- Add R2/Mux fields to creator_content_submissions
ALTER TABLE creator_content_submissions
  ADD COLUMN IF NOT EXISTS original_video_url TEXT,
  ADD COLUMN IF NOT EXISTS mux_playback_id TEXT,
  ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE;

-- Add r2_key to content table for tracking R2 object keys
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS r2_key TEXT;

-- Create index on approved submissions for the approved endpoint
CREATE INDEX IF NOT EXISTS idx_submissions_approved
  ON creator_content_submissions (status)
  WHERE status = 'approved';
