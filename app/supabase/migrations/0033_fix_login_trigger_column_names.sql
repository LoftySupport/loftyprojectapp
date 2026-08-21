-- =============================================================================
-- 0033 — the login trigger still spoke the old column names
-- =============================================================================
-- Sign-in was broken for about an hour after 0028 applied. Postgres logs, on every
-- attempt:
--
--     column "auth_user_id" does not exist
--
-- `log_login_activity_from_auth_users()` (from 0017) is a trigger on `auth.users`. It
-- fires on EVERY sign-in, because signing in updates `last_sign_in_at` — and it writes
-- back to `profiles` using `last_login_at` and `auth_user_id`, both renamed in 0028. The
-- trigger raises, the update to auth.users rolls back with it, and the sign-in fails
-- outright. Not a degraded read: no session at all.
--
-- ------------------------------------------------------------- why 0028 missed it
-- 0028 rewrote every function that touches `profiles`, and this was not on the list. I
-- built that list by reading function names out of pg_proc and fetching the bodies of the
-- ones that looked relevant. This one reads like a logging helper for `login_activity`,
-- and the write to `profiles` is four lines into the body.
--
-- The lesson, which is the reason this comment is long: "which functions reference this
-- table" is a question to ask the database, not one to answer from a function's name.
-- The query that WOULD have caught it, and which was run after the fact to confirm this
-- is the last one:
--
--   select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and pg_get_functiondef(p.oid) ~ '(^|[^_[:alnum:]])auth_user_id([^_[:alnum:]]|$)';
--
-- Word-boundary matched, so `profile_auth_user_id` does not mask a bare `auth_user_id`.
-- Run against every renamed column, it returns nothing now.
--
-- ----------------------------------------------------------------- how it was proved
-- Not by reasoning. The exact write a sign-in performs was fired inside a DO block and
-- rolled back by a sentinel raise, so the trigger ran for real against real data and
-- left nothing behind:
--
--   do $$ begin
--     update auth.users set last_sign_in_at = now() where email = '...';
--     raise exception 'SENTINEL: succeeded, rolled back';
--   end $$;
--
-- Before this migration that returns the column error. After it, the sentinel.
-- =============================================================================
create or replace function public.log_login_activity_from_auth_users()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into public.login_activity (user_id, email, event_type, occurred_at, metadata)
    values (new.id, new.email, 'SIGNUP', coalesce(new.created_at, now()),
            jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));

    update public.profiles
       set profile_last_login_at = coalesce(new.last_sign_in_at, new.created_at, now())
     where profile_auth_user_id = new.id;

    return new;

  elsif tg_op = 'UPDATE' then
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      insert into public.login_activity (user_id, email, event_type, occurred_at, metadata)
      values (new.id, new.email, 'LOGIN', new.last_sign_in_at,
              jsonb_build_object('provider', new.raw_app_meta_data ->> 'provider'));

      update public.profiles
         set profile_last_login_at = new.last_sign_in_at
       where profile_auth_user_id = new.id;
    end if;
    return new;
  end if;
  return null;
end $function$;
