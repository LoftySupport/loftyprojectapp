-- 0017_last_login_and_admin_reads.sql
--
-- Two things the Admin screen needs: when someone last signed in, and a way to read one
-- person's activity.

-- ------------------------------------------------------------- last_login_at
-- Denormalised onto `profiles` rather than derived from `login_activity` on every read.
-- The Admin table shows it for forty-five people at once, and `max(occurred_at) group by
-- user_id` per row is a sort of query that looks free at forty-five rows and stops being
-- free later. `login_activity` remains the history; this is the latest value.
alter table profiles add column if not exists last_login_at timestamptz;

comment on column profiles.last_login_at is
  'Most recent sign-in. Null means never — which, with auth_user_id null, is "pending".';

-- ------------------------------------------------- maintained by the existing trigger
-- `log_login_activity_from_auth_users` already fires on insert *and* update of
-- auth.users, so extending it costs nothing. That matters more than it looks: we hold
-- the TRIGGER privilege on auth.users but are not a member of supabase_auth_admin, so
-- every trigger created there is permanent. Reusing one we already own is the difference
-- between changing behaviour and committing to a second irreversible object.
--
-- Repeated in full rather than referenced, the same way 0013 did it: a migration that
-- depends on the reader remembering an earlier one rebuilds wrong.
create or replace function log_login_activity_from_auth_users() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.login_activity (user_id, email, event_type, occurred_at, metadata)
    values (new.id, new.email, 'SIGNUP', coalesce(new.created_at, now()),
            jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));

    -- The link trigger runs on the same insert, so by now the profile may already carry
    -- this auth_user_id. If it does not — someone not on the staff list — this updates
    -- nothing, which is correct.
    update public.profiles
       set last_login_at = coalesce(new.last_sign_in_at, new.created_at, now())
     where auth_user_id = new.id;

    return new;

  elsif tg_op = 'UPDATE' then
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      insert into public.login_activity (user_id, email, event_type, occurred_at, metadata)
      values (new.id, new.email, 'LOGIN', new.last_sign_in_at,
              jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));

      update public.profiles
         set last_login_at = new.last_sign_in_at
       where auth_user_id = new.id;
    end if;
    return new;
  end if;
  return null;
end $$;

-- Backfill from the history, so the column is right for anyone who signed in before it
-- existed rather than reading "never" until their next login.
update profiles p
   set last_login_at = l.max_at
  from (select user_id, max(occurred_at) as max_at
          from login_activity where event_type = 'LOGIN' group by user_id) l
 where p.auth_user_id = l.user_id
   and p.last_login_at is null;

-- ------------------------------------------------------------- reading activity
-- The Admin screen shows one person's history. `activity_audit` records the actor as
-- `jwt_sub` — the auth.uid() of whoever made the change, as text — so answering "what
-- has this person done" means matching that against their auth_user_id.
--
-- An index, because that lookup is by actor and the existing indexes are by table and by
-- record. Without it every profile drawer opened is a sequential scan of the audit log,
-- which is the table guaranteed to grow fastest.
create index if not exists activity_audit_jwt_sub_changed_idx
  on activity_audit (jwt_sub, changed_at desc);

-- `login_activity` is read by "read own login_activity", which already allows an admin
-- to read anyone's. `activity_audit` is admin-only for reads. Both are correct for a
-- screen that is itself admin-gated, so no policy changes here — noted so the next
-- person does not go looking for one.
