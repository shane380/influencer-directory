-- Security lockdown, part 2. Run AFTER the app change that moves the public
-- invite pages onto /invite/<slug>/details is deployed; before that, those
-- pages read this table from a logged-out browser and would stop loading.
--
-- The table's existing policies were created in the dashboard and are not in
-- this repo, so they are all dropped and replaced with a known set.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'creator_invites'
  loop
    execute format('drop policy %I on public.creator_invites', p.policyname);
  end loop;
end $$;

alter table creator_invites enable row level security;

-- Staff build and edit invites from the app.
create policy "Staff manage invites" on creator_invites
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- A creator can read the one invite their account came from (dashboard).
create policy "Creators read own invite" on creator_invites
  for select to authenticated
  using (id in (select invite_id from public.creators where user_id = auth.uid()));
