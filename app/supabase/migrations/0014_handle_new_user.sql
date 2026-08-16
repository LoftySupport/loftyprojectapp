-- 0003_handle_new_user.sql
--
-- Signing in creates a row in `auth.users`. It does not create one in `profiles`, and
-- nothing in 0001_core.sql does either — so a signed-in person has no permission, no
-- team, and every team-scoped policy matches nothing. The app has a user it knows
-- nothing about, and the person cannot be granted anything because there is no row to
-- grant it on. This closes that gap.
--
-- Deliberately a trigger rather than an insert from the client. The client cannot do it:
-- `profiles` has no insert policy, so RLS denies the write, and adding one would mean
-- letting a browser choose its own `permission` — the single value the whole
-- authorization model rests on. The trigger runs on the server, from claims the browser
-- never touches.

-- ------------------------------------------------------------------ claims
--
-- Entra hands Supabase the ID token claims and supabase-auth copies them into
-- `auth.users.raw_user_meta_data`. Which keys arrive depends on what the directory
-- holds: `given_name`/`family_name` for a properly populated org account, and only a
-- display `name` where nobody filled those fields in.
--
-- Both have to work. `first_name` and `last_name` are `not null`, a not-null violation
-- inside a trigger on `auth.users` aborts the insert, and an aborted insert on
-- `auth.users` is a **failed sign-in** — the person cannot get in at all. A missing
-- middle name must never be the reason someone is locked out of the app, so this reads
-- the specific claims, falls back to splitting the display name, and falls back again to
-- the local part of the email. Something is always produced.

create or replace function handle_new_user()
returns trigger
language plpgsql
-- `security definer` because the trigger inserts into `profiles`, and `profiles` has
-- RLS on with no insert policy. It runs as the function's owner, which owns the table
-- and is therefore not subject to its policies.
security definer
-- Pinned for the same reason as every function in 0001: a mutable search_path lets a
-- caller shadow an unqualified name inside this body with an object of their own. It
-- matters more here than anywhere else in the schema, because this body runs as owner.
set search_path = public, pg_temp
as $$
declare
  meta    jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_email text  := nullif(trim(coalesce(new.email, meta->>'email')), '');
  v_first text  := nullif(trim(coalesce(meta->>'given_name',  meta->>'first_name')), '');
  v_last  text  := nullif(trim(coalesce(meta->>'family_name', meta->>'last_name')), '');
  v_name  text  := nullif(trim(coalesce(meta->>'full_name',   meta->>'name')), '');
begin
  -- ------------------------------------------------------- Entra accounts only
  --
  -- This check is the difference between a latent hole and a live one, so it is first.
  --
  -- 0009 made every read policy depend on `is_active_user()`, which is
  -- `exists (select 1 from profiles where id = auth.uid() and active)`. A profile row
  -- with `active` true — the column default — is therefore the thing that grants read
  -- access to every project, job, address and profile in the database.
  --
  -- Without this branch, that row would be created for *any* insert into `auth.users`,
  -- including a self-service email signup from any address on earth while the email
  -- provider is enabled. Before this trigger existed such an account got no profile and
  -- so could read nothing; a trigger that greets every new auth user equally would have
  -- handed it the whole database. Creating profiles and granting reads are the same act
  -- here, and this is where that is decided.
  --
  -- `raw_app_meta_data` and not `raw_user_meta_data`: app_metadata is written by the
  -- auth server and cannot be set by the person signing up, which is precisely why an
  -- authorization check may read it. user_metadata is user-editable and must never
  -- appear in one.
  --
  -- Fail closed and quietly: the account is still created, it simply has no profile and
  -- therefore no access, which is exactly where a non-Entra account stood before. It
  -- does not raise, because aborting an insert on `auth.users` is a sign-in failure and
  -- this trigger has no business deciding who Supabase Auth may admit — only who Lofty
  -- knows about.
  if coalesce(new.raw_app_meta_data ->> 'provider', '') <> 'azure' then
    return new;
  end if;

  -- No email means no row we can key to: `profiles.email` is not null and unique, and
  -- the app greets, searches and de-duplicates by it. Supabase Auth already refuses an
  -- Entra sign-in without one, so this only fires if a second provider is added later —
  -- and failing loudly then is the point. A silent profile-less user is the bug this
  -- whole migration exists to prevent.
  if v_email is null then
    raise exception 'handle_new_user: no email claim on auth.users %', new.id;
  end if;

  -- Split the display name on the *last* space: "Amber Beaumont" gives Amber / Beaumont,
  -- "Anna Maria Del Rio" gives "Anna Maria" / "Del Rio". That is wrong for a good number
  -- of names, and it is still the right trade: it only runs when the directory did not
  -- supply the fields, the person can correct it on Settings, and the alternative is
  -- refusing them entry over a formatting guess.
  if v_first is null and v_name is not null then
    if v_name ~ '\s' then
      v_first := nullif(trim(regexp_replace(v_name, '\s+\S+$', '')), '');
      v_last  := coalesce(v_last, nullif(trim(substring(v_name from '\S+$')), ''));
    else
      -- One word. It is the first name, and no last name is invented from it.
      v_first := v_name;
    end if;
  end if;

  insert into profiles (id, first_name, last_name, email)
  values (
    new.id,
    coalesce(v_first, split_part(v_email, '@', 1)),
    coalesce(v_last, ''),
    v_email
  )
  -- `permission` is deliberately absent from the column list. It defaults to 'viewer' on
  -- the table, and naming it here would be a second place for least-privilege to be
  -- decided — two places that must agree forever, which is how they stop agreeing.
  --
  -- This insert fires the audit trigger 0013 put back on `profiles`, which writes an
  -- INSERT row to `activity_audit`. That is fine and checked: `jwt_sub` defaults to
  -- `auth.uid()::text` and is nullable, and `auth.uid()` is null here because this runs
  -- inside a trigger on `auth.users` rather than under a request's JWT. A not-null
  -- column there would turn every first sign-in into a failed one.
  --
  -- `on conflict (id) do nothing` makes a replayed insert harmless. It deliberately does
  -- not catch a conflict on `email`: matching a new auth user to an existing profile by
  -- email address is account linking, and doing it automatically is the impersonation
  -- path that `xms_edov` was added to Entra to close. If that ever fires it should fail
  -- and be looked at, not resolve itself quietly.
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Insert only. A later sign-in with a changed surname does not update the row, because
-- `profiles` is the copy Lofty owns: the point of the table is that the app decides
-- these values, and an overwrite on every sign-in would silently undo an edit made on
-- Settings. Syncing changes back from Entra is a separate decision with its own rules
-- about which side wins.

-- ------------------------------------------------- a trigger we cannot take back
--
-- `auth.users` is owned by `supabase_auth_admin`, and `postgres` is not a member of
-- that role. Checked, not assumed:
--
--   has_table_privilege('postgres','auth.users','TRIGGER')      -> true
--   pg_has_role('postgres','supabase_auth_admin','MEMBER')      -> false
--
-- CREATE TRIGGER needs the TRIGGER privilege, which we have. DROP TRIGGER needs
-- ownership, which we do not. So this trigger can be created and then **never dropped
-- by us** — 0008 hit the same wall from the other side and had to neuter a function it
-- could not detach.
--
-- Two consequences, both deliberate:
--
--   1. No `drop trigger if exists` here. It would be a no-op the first time and an
--      ownership error every time after, making the migration un-rerunnable. The
--      existence check below is idempotent without needing the privilege we lack.
--   2. `create or replace function` above is the escape hatch. The trigger is
--      permanent, so the function body is the only part that can ever be changed —
--      which means changing behaviour later means replacing the function, never
--      recreating the trigger.
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
      for each row execute function handle_new_user();
  end if;
end $$;
