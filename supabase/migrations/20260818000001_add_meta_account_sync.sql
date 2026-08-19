-- Account-wide Meta ad tables, backing the Ad Performance page.
--
-- These are SIBLINGS of creator_ad_performance / creator_ad_performance_daily,
-- not replacements. Those two are payment-critical (admin/payments/calculate and
-- cron/generate-payments read the `monthly` blob; commission-events-sync reads
-- the daily table) and keep their exact current shape. The sync now fetches the
-- whole account in one sweep and writes BOTH the new tables and the old ones.
--
-- Why a new fact table rather than widening the old one: creator_ad_performance_daily
-- is keyed (instagram_handle, ad_id, date) with instagram_handle NOT NULL, which
-- brand ads cannot satisfy.

-- ── Fact: one row per ad per day, whole account ──────────────────────────────
CREATE TABLE IF NOT EXISTS meta_ad_daily (
  ad_id text NOT NULL,
  date date NOT NULL,
  spend numeric(12,2) NOT NULL DEFAULT 0,
  impressions integer NOT NULL DEFAULT 0,
  outbound_clicks integer NOT NULL DEFAULT 0,
  -- Purchase COUNT. Absent from creator_ad_performance_daily, which only ever
  -- stored purchase_value — so CPA, AOV and the Purchases metric were previously
  -- uncomputable. Meta only restates ~28 days, so history before this table
  -- exists must come from the one-time backfill script.
  purchases integer NOT NULL DEFAULT 0,
  purchase_value numeric(12,2) NOT NULL DEFAULT 0,
  purchase_roas numeric(10,4),
  video_3s_views integer NOT NULL DEFAULT 0,
  video_thruplays integer NOT NULL DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  PRIMARY KEY (ad_id, date)
);

-- The performance page always scans a contiguous date range across all ads
-- (current window + the equivalent preceding window in one query).
CREATE INDEX IF NOT EXISTS idx_meta_ad_daily_date ON meta_ad_daily (date);

-- ── Dimension: one row per ad ────────────────────────────────────────────────
-- Split from the fact table because creative metadata is expensive to fetch
-- (it needs the creative{...} field expansion that trips Meta's "reduce the
-- amount of data" limit) but almost never changes. Fetched once per ad_id;
-- only status/name are refreshed each run, via a cheap unexpanded sweep.
CREATE TABLE IF NOT EXISTS meta_ads (
  ad_id text PRIMARY KEY,
  ad_name text,
  status text,
  effective_status text,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  created_time timestamptz,
  -- '1:1' | '9:16' | '1:1 + 9:16' | 'carousel' | null
  format text,
  -- Creative primary text, shown as the hook line on performance cards.
  hook_line text,
  -- R2-mirrored; Meta CDN URLs expire, so we never store those long-term.
  thumbnail_url text,
  video_id text,
  mux_playback_id text,
  ig_media_id text,
  ig_media_type text,
  carousel_urls jsonb,
  -- Partnership (whitelisting) ad: ad name matched a known creator handle.
  partnership boolean NOT NULL DEFAULT false,
  instagram_handle text,
  influencer_id uuid REFERENCES influencers(id) ON DELETE SET NULL,
  -- Null until the expensive creative expansion has run for this ad.
  creative_synced_at timestamptz,
  first_seen_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_partnership ON meta_ads (partnership, instagram_handle);
CREATE INDEX IF NOT EXISTS idx_meta_ads_campaign ON meta_ads (campaign_id);
-- Drives the "which ads still need the creative expansion?" query each run.
CREATE INDEX IF NOT EXISTS idx_meta_ads_creative_pending
  ON meta_ads (creative_synced_at) WHERE creative_synced_at IS NULL;

-- RLS on with NO policies, matching 20260709000001_tighten_daily_tables_rls.sql:
-- every legitimate reader uses the service-role client (which bypasses RLS), and
-- these tables carry whole-account spend and revenue that no logged-in creator
-- should be able to query directly with the anon key.
ALTER TABLE meta_ad_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;
