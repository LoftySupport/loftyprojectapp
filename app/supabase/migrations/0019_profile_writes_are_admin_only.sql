-- 0019_profile_writes_are_admin_only.sql
--
-- 0018 left `preferred_name` as the one column somebody could change on their own row.
-- Lofty's answer is that an admin sets that too, so there is now nothing on `profiles`
-- a non-admin may write.
--
-- Which makes "update own profile" a policy that permits nothing: the trigger refuses
-- every column it would have allowed through. Dropping it rather than leaving it is the
-- point of this migration — a policy that grants a right nothing can exercise reads, to
-- the next person, as evidence that self-service exists. They would go looking for the
-- screen, or worse, add a column and assume it is self-editable because the policy says
-- "own profile".
--
-- Admin writes are unaffected: "admins insert profiles" and "admins update any profile"
-- already cover an admin editing anyone, themselves included.

-- Add preferred_name to the protected set. Repeated in full rather than altered in
-- place, so the list of what only an admin may change can be read in one piece.
create or replace function guard_privileged_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No JWT means no end user: a migration, a seed, or the service role. Trusted by
  -- definition — the service role bypasses RLS entirely, so refusing it here would only
  -- break admin tooling while stopping nobody.
  if auth.uid() is null then
    return new;
  end if;

  if current_permission() >= 'admin'::permission_level then
    return new;
  end if;

  -- Everything. There is no self-service column left, which is why this reads as a flat
  -- refusal rather than a list of exceptions.
  raise exception
    'Only an admin may change a profile'
    using errcode = '42501';
end;
$$;

drop policy if exists "update own profile" on profiles;

comment on column profiles.preferred_name is
  'What someone wants to be called, if not their first name. Null means use first_name — never store a copy of it here. Set by an admin.';
