-- Security lockdown, part 1. Safe to run immediately: every reader of these
-- tables is server code using the service-role key (which bypasses RLS), except
-- influencer_contracts, which staff read through their own session.

-- Staff = admin or manager on profiles. SECURITY DEFINER so policies that use
-- it do not depend on the caller being able to read profiles.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and (is_admin = true or is_manager = true)
  );
$$;

revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated, service_role;

-- app_settings holds the Shopify admin token. It was readable by anyone,
-- logged out included. No browser code reads this table, so no policy replaces
-- the old one: only the service role can read it now.
alter table app_settings enable row level security;
drop policy if exists "Anyone can read app_settings" on app_settings;

-- Written and read only by server routes.
alter table payment_audit_log enable row level security;
alter table excluded_affiliate_orders enable row level security;

-- Contracts: staff only.
alter table influencer_contracts enable row level security;
drop policy if exists "Staff manage contracts" on influencer_contracts;
create policy "Staff manage contracts" on influencer_contracts
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());
