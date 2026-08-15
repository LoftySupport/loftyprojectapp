-- =============================================================================
-- 0009 — write policies, and the hole in "update own profile"
-- =============================================================================
-- Every table has had RLS on since 0001 with SELECT policies only. Nothing could be
-- inserted or updated through the API at all: the board could be read and never
-- changed. This is the other half.
--
-- The one existing write policy was also the schema's worst security bug:
--
--   create policy "update own profile" on profiles for update to authenticated
--     using (id = auth.uid());
--
-- A policy with USING and no WITH CHECK applies USING to the new row too, so a user
-- cannot change *which* row they update — but nothing stopped them changing what is in
-- it. `update profiles set permission = 'superadmin' where id = auth.uid()` passed.
-- Harmless while the table is empty; a self-service admin button the day Entra sign-in
-- lands. Closed below.
-- =============================================================================

-- ------------------------------------------------------------ the helpers
-- SECURITY DEFINER is not decoration here. These read profiles, and they are called
-- from policies *on* profiles — as a plain function that is infinite recursion, because
-- reading profiles re-evaluates the policy that calls the function. Running as the
-- owner bypasses RLS on the inner read and breaks the cycle. It is the standard
-- Supabase shape for exactly this reason.
--
-- STABLE so the planner calls it once per statement rather than once per row.

create or replace function current_permission() returns permission_level
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.permission from profiles p where p.id = auth.uid() and p.active),
    'viewer'::permission_level
  )
$$;

comment on function current_permission() is
  'The signed-in user''s rung on the permission ladder, or viewer if they have no profile or are deactivated. SECURITY DEFINER so policies on profiles can call it without recursing through their own policy.';

-- Deactivating someone has to actually stop them, not just hide them from pickers.
create or replace function is_active_user() returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.active)
$$;

-- --------------------------------------------- profiles: close the escalation
-- permission and active are the two columns that decide what someone can do, so they
-- are the two nobody may set on themselves. A trigger rather than a WITH CHECK, because
-- a policy can only see the row, not what changed — expressing "these columns may not
-- change unless you are an admin" needs OLD and NEW side by side.
--
-- The admin path goes through the same table rather than a separate RPC: an admin
-- updating someone's permission is an ordinary UPDATE that this trigger permits.
create or replace function guard_profile_privileges() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_permission() >= 'admin' then
    return new;
  end if;

  if new.permission is distinct from old.permission then
    raise exception 'Only an admin can change a permission level'
      using errcode = '42501';
  end if;

  if new.active is distinct from old.active then
    raise exception 'Only an admin can activate or deactivate a person'
      using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_privileges on profiles;
create trigger profiles_guard_privileges
  before update on profiles
  for each row execute function guard_profile_privileges();

-- ------------------------------------------------------------------ profiles
-- Reading one's own profile was the only SELECT policy, which is too narrow now: the
-- board shows assignees, comments show authors, and every picker lists people. Anyone
-- signed in can see who exists; only admins can create or retire them.
drop policy if exists "read own profile" on profiles;
create policy "read profiles" on profiles for select to authenticated
  using (is_active_user());

drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles for update to authenticated
  using (id = auth.uid() and is_active_user())
  with check (id = auth.uid());

create policy "admins update any profile" on profiles for update to authenticated
  using (current_permission() >= 'admin')
  with check (current_permission() >= 'admin');

create policy "admins insert profiles" on profiles for insert to authenticated
  with check (current_permission() >= 'admin');

-- No DELETE policy, deliberately. profiles.active is the soft delete, and a name sits
-- on years of activity — see the column comment in 0001.

-- ------------------------------------------------------------- profile_teams
-- Who is in which team is an admin decision, not a self-service one: team membership
-- is what the team and team_hierarchy permission scopes will read.
drop policy if exists "read own teams" on profile_teams;
create policy "read profile_teams" on profile_teams for select to authenticated
  using (is_active_user());

create policy "admins write profile_teams" on profile_teams for all to authenticated
  using (current_permission() >= 'admin')
  with check (current_permission() >= 'admin');

-- ------------------------------------------------- the business tables
-- One shape for addresses, projects and jobs, because they are one workflow: a job is
-- created at an address inside a project, and someone who can do one can do all three.
--
--   user     creates and edits
--   manager  same (the ladder widens what you can *see* across teams, not what you can
--            do to a record you can already see)
--   admin    deletes
--
-- viewer is read-only, which is the whole point of the rung.

create policy "users write addresses" on addresses for insert to authenticated
  with check (current_permission() >= 'user');
create policy "users update addresses" on addresses for update to authenticated
  using (current_permission() >= 'user')
  with check (current_permission() >= 'user');
create policy "admins delete addresses" on addresses for delete to authenticated
  using (current_permission() >= 'admin');

create policy "users write projects" on projects for insert to authenticated
  with check (current_permission() >= 'user');
create policy "users update projects" on projects for update to authenticated
  using (current_permission() >= 'user')
  with check (current_permission() >= 'user');
create policy "admins delete projects" on projects for delete to authenticated
  using (current_permission() >= 'admin');

create policy "users write jobs" on jobs for insert to authenticated
  with check (current_permission() >= 'user');
create policy "users update jobs" on jobs for update to authenticated
  using (current_permission() >= 'user')
  with check (current_permission() >= 'user');
create policy "admins delete jobs" on jobs for delete to authenticated
  using (current_permission() >= 'admin');

-- --------------------------------------------------------- read, widened
-- The 0001 read policies were `using (true)`, which stops meaning "everyone" the moment
-- someone is deactivated. Same reach, but a retired account now reads nothing.
drop policy if exists "read addresses" on addresses;
create policy "read addresses" on addresses for select to authenticated using (is_active_user());

drop policy if exists "read projects" on projects;
create policy "read projects" on projects for select to authenticated using (is_active_user());

drop policy if exists "read jobs" on jobs;
create policy "read jobs" on jobs for select to authenticated using (is_active_user());

-- ------------------------------------------------------- audit, tightened
-- 0008 wrote these against profiles directly so it could stand alone. Now that
-- current_permission() exists they use it, which also means one definition of "admin"
-- rather than two that can drift.
drop policy if exists "read activity_audit" on activity_audit;
create policy "read activity_audit" on activity_audit for select to authenticated
  using (current_permission() >= 'admin');

drop policy if exists "read own login_activity" on login_activity;
create policy "read own login_activity" on login_activity for select to authenticated
  using (user_id = auth.uid() or current_permission() >= 'admin');
