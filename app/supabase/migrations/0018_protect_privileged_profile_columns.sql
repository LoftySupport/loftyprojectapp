-- 0018_protect_privileged_profile_columns.sql
--
-- Closes a privilege escalation.
--
-- 0009's "update own profile" policy grants UPDATE on a person's own row:
--
--     using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid())
--
-- An RLS policy decides *which rows* may be written, never which columns. `authenticated`
-- held the UPDATE privilege on every column of `profiles`, so the policy was satisfied by
-- any self-update — including this one:
--
--     update profiles set permission = 'superadmin' where auth_user_id = auth.uid();
--
-- Every gate in the app reads `profiles.permission`, and `current_permission()` reads it
-- for every RLS policy in the schema. So any signed-in person could promote themselves to
-- superadmin, and the check that was supposed to stop them was the one they had just
-- rewritten. `active` is the same shape of problem in reverse: a deactivated person could
-- reactivate themselves.
--
-- This is why the handoff insists `permission` never move into JWT `user_metadata` — the
-- exact reasoning, "an authorization check that the restricted person can edit", applied
-- to a column the whole time.
--
-- ------------------------------------------------------------------ the fix
-- A trigger rather than column grants. Grants are per *role*, and admins are
-- `authenticated` too — revoking UPDATE(permission) from the role would take it from the
-- people who are supposed to have it. The distinction being drawn here is between two
-- users of the same role, which is what a trigger can see and a grant cannot.

create or replace function guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No JWT means no end user: a migration, a seed, or the service role. Those are
  -- trusted by definition — the service role bypasses RLS entirely, so a trigger
  -- refusing it would only break admin tooling while stopping nobody.
  if auth.uid() is null then
    return new;
  end if;

  if current_permission() >= 'admin'::permission_level then
    return new;
  end if;

  -- Everything below is somebody else's to set. Listed explicitly rather than as
  -- "anything except preferred_name", so adding a column defaults to protected only if
  -- someone thinks about it — and a new column that should be self-editable has to be
  -- named here, which is the safer direction to be wrong in.
  if new.permission   is distinct from old.permission
     or new.active       is distinct from old.active
     or new.auth_user_id is distinct from old.auth_user_id
     or new.id           is distinct from old.id
     or new.email        is distinct from old.email
     or new.login_email  is distinct from old.login_email
     or new.first_name   is distinct from old.first_name
     or new.last_name    is distinct from old.last_name
     or new.job_title    is distinct from old.job_title
  then
    raise exception
      'Only an admin may change permission, status, identity or name on a profile'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on profiles;
create trigger profiles_guard_privileged_columns
  before update on profiles
  for each row execute function guard_privileged_profile_columns();

-- `preferred_name` is what is left, and it is the one field that is genuinely the
-- person's own: what they want to be called. Null means "use first_name" — the app
-- never stores a copy of the first name here, so clearing it restores the default
-- rather than blanking their name.
comment on column profiles.preferred_name is
  'What someone wants to be called, if not their first name. Null means use first_name. The only column a non-admin may change on their own row.';

-- `anon` has no UPDATE policy on profiles, so RLS already denies it. Revoked anyway:
-- a privilege nothing uses is one fewer thing depending on a policy staying correct.
revoke update on profiles from anon;
