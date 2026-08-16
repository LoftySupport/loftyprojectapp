-- 0015_profiles_precreated_and_link.sql
--
-- Only people Lofty has created may use the app.
--
-- Authenticating and being allowed in stop being the same thing here. Anyone in the
-- Lofty Entra directory can complete a Microsoft sign-in — that is what a directory is
-- for — but a session on its own now grants nothing. Access comes from a `profiles` row
-- that somebody created first, and sign-in only *links* to one.
--
-- ------------------------------------------------------- why this needs a schema change
-- `profiles.id` was a foreign key to `auth.users(id)`, which made a profile impossible
-- to create before the person had signed in: the insert had nothing to point at. That
-- is exactly backwards for a staff list, where the list exists first and people arrive
-- against it.
--
-- So `profiles.id` becomes the app's own key, and the link to the login moves into a
-- nullable `auth_user_id`. Null means "created, has not signed in yet" — a real and
-- expected state, and the whole point of the change.

-- ------------------------------------------------------------------ new columns
alter table profiles
  -- The login. Null until first sign-in, unique so one Microsoft account cannot be two
  -- people. `on delete set null` rather than cascade: deleting the auth account must not
  -- delete the staff record — it unlinks it, leaving the person on the list to be linked
  -- again. Cascade here would mean removing someone's Microsoft account silently erased
  -- their team, title and permission.
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null,

  -- The address they sign in with. Deliberately separate from `email`, because at Lofty
  -- they differ: the Microsoft account is @loftybg.onmicrosoft.com while the address
  -- everyone actually uses is @lofty.com.au. `email` stays the real one — it is what the
  -- app shows, searches and mails — and this is only ever a matching key.
  add column if not exists login_email text,

  add column if not exists job_title text;

-- Case-insensitive, because nobody types an email address consistently and a duplicate
-- here would be two staff records fighting over one Microsoft account.
create unique index if not exists profiles_login_email_key on profiles (lower(login_email));

-- --------------------------------------------------------- id becomes our own key
-- Backfill before dropping the constraint: on a database where people had already
-- signed in under the old shape, `id` *was* the auth user id, so it is the correct
-- value for the new column and must not be lost.
update profiles set auth_user_id = id where auth_user_id is null;

alter table profiles drop constraint if exists profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

-- ------------------------------------------------------- the helpers RLS reads through
-- Both of these decided access by `profiles.id = auth.uid()`. That identity no longer
-- holds: `id` is Lofty's key and `auth.uid()` is Microsoft's. Repointing them is what
-- makes an unlinked sign-in read nothing — the row exists, but nothing joins it to the
-- session, so `exists (...)` is false and every read policy fails closed.
create or replace function is_active_user() returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles p where p.auth_user_id = auth.uid() and p.active
  )
$$;

create or replace function current_permission() returns permission_level
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.permission from profiles p where p.auth_user_id = auth.uid() and p.active),
    'viewer'::permission_level
  )
$$;

-- "update own profile" carried the same assumption in its own predicate.
drop policy if exists "update own profile" on profiles;
create policy "update own profile" on profiles
  for update to authenticated
  using (auth_user_id = auth.uid() and is_active_user())
  with check (auth_user_id = auth.uid());

-- ------------------------------------------------------------------- the link
-- Replaces the insert trigger that was written before pre-created profiles existed.
-- Inserting is now wrong in a way that would have been quiet and nasty: signing in as
-- amber@loftybg.onmicrosoft.com would have created a *second* Amber keyed to the
-- onmicrosoft address, beside the real record — one person, two rows, and the wrong one
-- holding the permission.
create or replace function link_profile_to_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email      text := lower(nullif(trim(new.email), ''));
  v_profile_id uuid;
begin
  if v_email is null then
    return new;
  end if;

  -- `login_email` first. It is the field maintained for exactly this, and matching it
  -- before `email` matters when one person's login address is another's contact address
  -- — rare, but the consequence is signing someone in as somebody else.
  select id into v_profile_id
  from profiles
  where auth_user_id is null and lower(login_email) = v_email
  limit 1;

  -- Then the normal address, which covers everyone whose Microsoft account simply is
  -- their everyday email.
  if v_profile_id is null then
    select id into v_profile_id
    from profiles
    where auth_user_id is null and lower(email) = v_email
    limit 1;
  end if;

  -- No match: somebody in the directory who is not on Lofty's list. Nothing is created
  -- and nothing is raised — they hold a valid session that reads nothing, which is the
  -- requirement. Raising would abort the insert into `auth.users` and turn "not invited"
  -- into a broken sign-in, and this trigger has no business deciding who Supabase Auth
  -- admits — only who Lofty knows about.
  if v_profile_id is null then
    return new;
  end if;

  update profiles
     set auth_user_id = new.id,
         updated_at   = now()
   where id = v_profile_id;

  return new;
end;
$$;

-- `auth.users` is owned by `supabase_auth_admin` and `postgres` is not a member of that
-- role, so we may create a trigger here and may never drop one. Verified rather than
-- assumed:
--
--   has_table_privilege('postgres','auth.users','TRIGGER')  -> true
--   pg_has_role('postgres','supabase_auth_admin','MEMBER')  -> false
--
-- Hence the existence check instead of `drop trigger if exists`, which would be a no-op
-- once and an ownership error every run after. `create or replace` on the function above
-- is the only route to changing this behaviour later — the trigger itself is permanent.
do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c     on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname  = 'on_auth_user_created'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function link_profile_to_auth_user();
  end if;
end $$;

comment on column profiles.auth_user_id is
  'The linked Microsoft account. Null until first sign-in — created, not yet arrived.';
comment on column profiles.login_email is
  'The address they sign in with, when it differs from email. Matching key only.';
