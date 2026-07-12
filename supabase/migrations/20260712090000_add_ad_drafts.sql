-- Ad Launcher drafts: one row per ad built in /ads.
-- Non-admin submissions sit here (status 'pending') and are NOT sent to Meta
-- until an admin approves; admin self-publishes record as 'direct'.
create table if not exists ad_drafts (
  id uuid primary key default gen_random_uuid(),
  ad_name text not null,
  campaign_id text not null,
  campaign_name text,
  adset_id text not null,
  adset_name text,
  page_id text not null,
  instagram_user_id text,
  -- Partnership ad: creator sponsor identity (instagram_branded_content.sponsor_id)
  partnership_sponsor_id text,
  partnership_sponsor_label text,
  -- [{role: 'feed'|'vertical', kind: 'image'|'video', fileUrl, thumbnailUrl}]
  assets jsonb not null default '[]'::jsonb,
  -- {primaryText, headline, description, link, cta, urlTags}
  copy jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'changes_requested', 'direct', 'publishing', 'failed')),
  feedback text,
  meta_ad_id text,
  meta_creative_id text,
  publish_error text,
  created_by uuid references profiles(id),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ad_drafts_status_idx on ad_drafts (status, created_at desc);
create index if not exists ad_drafts_created_by_idx on ad_drafts (created_by, created_at desc);

-- All reads/writes go through server API routes using the service role;
-- no client-side policies on purpose.
alter table ad_drafts enable row level security;
