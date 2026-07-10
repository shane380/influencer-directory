-- Email blast log: one row per blast, one row per recipient attempt.
-- The app works without these tables (logging is best-effort), but history
-- on the Email Blast admin page only appears once they exist.

CREATE TABLE IF NOT EXISTS email_blasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  heading TEXT NOT NULL,
  body TEXT NOT NULL,
  cta_text TEXT,
  cta_url TEXT,
  sent_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_blast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_id UUID REFERENCES email_blasts(id) ON DELETE CASCADE,
  creator_id UUID,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','skipped')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_blast_recipients_blast_id_idx ON email_blast_recipients(blast_id);

-- Only the service role (used by the admin API) touches these tables.
ALTER TABLE email_blasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_blast_recipients ENABLE ROW LEVEL SECURITY;
