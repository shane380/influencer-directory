-- App-wide settings (single-row table)
create table if not exists app_settings (
  id text primary key default 'default',
  email_triggers jsonb not null default '{
    "campaign_assigned": true,
    "content_approved": true,
    "revision_requested": true,
    "partner_invite": false
  }'::jsonb,
  updated_at timestamptz default now()
);

-- Seed the single settings row
insert into app_settings (id) values ('default') on conflict do nothing;

-- Allow authenticated users to read, only service role can write (via API)
alter table app_settings enable row level security;
create policy "Anyone can read app_settings" on app_settings for select using (true);
