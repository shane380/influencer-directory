-- Track creator dashboard activity
ALTER TABLE creators ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;
ALTER TABLE creators ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0;
