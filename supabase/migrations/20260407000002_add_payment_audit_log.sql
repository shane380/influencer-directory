CREATE TABLE IF NOT EXISTS payment_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  target_influencer_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON payment_audit_log(user_id);
CREATE INDEX ON payment_audit_log(action);
CREATE INDEX ON payment_audit_log(target_influencer_id);
CREATE INDEX ON payment_audit_log(created_at);
