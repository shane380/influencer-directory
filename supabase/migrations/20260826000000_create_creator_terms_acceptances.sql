-- Clickwrap record of who accepted which version of which terms document.
--
-- Until now the only trace of agreement was creator_invites.accepted_at, which
-- proves a signup finished, not that a specific document was agreed to -- the
-- invite checkbox was local browser state and never reached the server. Rows
-- land here from two places: /api/creators/signup at the moment a partner
-- accepts their invite, and /api/creators/accept-terms when an existing
-- affiliate clears the dashboard gate after new terms are published.
--
-- document_key is 'creator-terms' (everyone) or 'affiliate-terms' (partners
-- with an affiliate component); document_version names a version in
-- src/lib/terms/versions.ts, each of which stays readable at its own
-- /terms/<doc>/<version> URL forever. A row is worthless if the text it points
-- at can change, so versions are never reworded in place.
CREATE TABLE IF NOT EXISTS creator_terms_acceptances (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nulled rather than cascaded on purpose: /api/creators/delete hard-deletes
  -- the creators row, and cascading would destroy the very evidence this table
  -- exists to hold. user_id and creator_email keep an orphaned row meaningful.
  creator_id        uuid REFERENCES creators(id) ON DELETE SET NULL,
  user_id           uuid,
  creator_email     text,
  document_key      text NOT NULL,
  document_version  text NOT NULL,
  accepted_at       timestamptz NOT NULL DEFAULT now(),
  -- Captured server-side from x-forwarded-for / user-agent headers, never from
  -- the request body, so the client cannot dictate its own audit trail.
  ip_address        text,
  user_agent        text,
  source            text NOT NULL CHECK (source IN ('invite_signup', 'portal_gate')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- One acceptance per creator per document version: makes a double-submit or a
-- reload mid-request idempotent rather than duplicating the record.
CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_terms_acceptances_unique
  ON creator_terms_acceptances(creator_id, document_key, document_version);

CREATE INDEX IF NOT EXISTS idx_creator_terms_acceptances_creator
  ON creator_terms_acceptances(creator_id);

ALTER TABLE creator_terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on creator_terms_acceptances" ON creator_terms_acceptances;
CREATE POLICY "Service role full access on creator_terms_acceptances"
  ON creator_terms_acceptances FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Deliberately no INSERT policy for creators: acceptances are written only by
-- the service-role API routes, so a browser cannot forge or backdate one.
DROP POLICY IF EXISTS "Creators can view own terms acceptances" ON creator_terms_acceptances;
CREATE POLICY "Creators can view own terms acceptances"
  ON creator_terms_acceptances FOR SELECT
  USING (creator_id IN (
    SELECT id FROM creators WHERE user_id = auth.uid()
  ));

COMMENT ON COLUMN creator_terms_acceptances.source IS
  'invite_signup = accepted the checkbox during invite signup; portal_gate = accepted the re-acceptance modal on the creator dashboard.';
