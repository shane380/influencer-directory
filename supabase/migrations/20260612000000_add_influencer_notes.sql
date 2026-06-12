-- Notes feature for the Daisy -> Vic handoff.
-- Notes attach to the influencer (not a single campaign), so relationship
-- context travels with the person across every campaign they appear in.

-- Pinned "about this person" summary, freeform and team-editable.
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS notes_summary text;

-- Dated activity log of notes / summary edits, newest first when read.
CREATE TABLE IF NOT EXISTS influencer_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid NOT NULL REFERENCES influencers(id) ON DELETE CASCADE,
  author_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  body text NOT NULL,
  type text NOT NULL DEFAULT 'note' CHECK (type IN ('note', 'summary_edit')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS influencer_notes_influencer_id_created_at_idx
  ON influencer_notes (influencer_id, created_at DESC);

-- Enable Row Level Security (append-only: SELECT + INSERT only)
ALTER TABLE influencer_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view influencer notes"
  ON influencer_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert influencer notes"
  ON influencer_notes FOR INSERT TO authenticated WITH CHECK (true);
