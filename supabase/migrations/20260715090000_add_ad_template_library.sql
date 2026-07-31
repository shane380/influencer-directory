-- Ads template library: shared, collection-grouped copy snippets for /ads.
-- Collections group per-field templates (e.g. "Bluebell"); every admin/manager
-- shares the same library.
create table if not exists ad_template_collections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ad_template_collections_name_key
  on ad_template_collections (lower(name));

create table if not exists ad_templates (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references ad_template_collections(id) on delete cascade,
  -- Matches AdCopy keys so the client can apply a template with
  -- updateCopy({ [fieldType]: content }).
  field_type text not null
    check (field_type in ('primaryText', 'headline', 'description', 'link')),
  name text not null,
  content text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ad_templates_name_key
  on ad_templates (collection_id, field_type, lower(name));

create index if not exists ad_templates_collection_idx
  on ad_templates (collection_id, field_type, created_at);

-- All reads/writes go through server API routes using the service role;
-- no client-side policies on purpose.
alter table ad_template_collections enable row level security;
alter table ad_templates enable row level security;
