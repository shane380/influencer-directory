-- Campaign email blasts: the partner blast log grows a campaign scope, an
-- audience, and a schedule so a blast can be queued for a future send.
--
-- Existing rows (partner blasts) keep campaign_id NULL and default to
-- status 'sent', which is what they are.

ALTER TABLE email_blasts
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS audience TEXT,
  ADD COLUMN IF NOT EXISTS recipient_ids UUID[],
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_blasts_status_check') THEN
    ALTER TABLE email_blasts
      ADD CONSTRAINT email_blasts_status_check
      CHECK (status IN ('scheduled', 'sending', 'sent', 'cancelled'));
  END IF;
END $$;

-- Campaign recipients are influencers, not creators.
ALTER TABLE email_blast_recipients
  ADD COLUMN IF NOT EXISTS influencer_id UUID;

CREATE INDEX IF NOT EXISTS email_blasts_campaign_id_idx ON email_blasts(campaign_id);
-- The cron looks up due blasts every few minutes.
CREATE INDEX IF NOT EXISTS email_blasts_due_idx ON email_blasts(scheduled_for)
  WHERE status IN ('scheduled', 'sending');
