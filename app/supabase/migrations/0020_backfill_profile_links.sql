-- 0020_backfill_profile_links.sql
--
-- Link the people who signed in before their profile existed.
--
-- 0015's trigger is `after insert on auth.users`. It fires exactly once per person — on
-- the sign-in that first creates their auth user — and never again.
--
-- The trap is that a *failed* sign-in still creates the auth user. Supabase completes the
-- OAuth exchange with Microsoft and inserts into `auth.users`; redirecting the browser
-- back to the app is the last step, and the step that was broken while the redirect allow
-- list was wrong. So every sign-in attempted during that period created an auth user, the
-- trigger ran against a `profiles` table that 0016 had not yet seeded, found no match,
-- and correctly did nothing.
--
-- Those people are now permanently unlinked. Signing in again does not help: their auth
-- user already exists, so the insert trigger has nothing left to fire on. They hold a
-- valid session that reads nothing and see "Not set up yet" forever.
--
-- This backfills them. It is a one-off correction of a timing problem, not a change of
-- behaviour — the matching rules below are 0015's rules, applied to rows that already
-- exist instead of to a row being inserted.
--
-- Re-runnable: it only ever fills a null, so a second run over already-linked rows is a
-- no-op rather than a reshuffle.

-- ------------------------------------------------------------------ before, for the log
-- Who is stuck, and who this will link. Read it before and after — a row that appears
-- here and then does not is the whole of what this migration did.
--
--   select p.first_name, p.last_name, p.email, p.login_email, p.auth_user_id, u.id, u.email
--     from profiles p
--     left join auth.users u
--       on lower(u.email) in (lower(p.login_email), lower(p.email))
--    where p.auth_user_id is null
--    order by p.last_name;

with candidate as (
  -- `distinct on (u.id)` because `profiles.auth_user_id` is UNIQUE: two profiles matching
  -- one auth user would raise a unique violation and abort the whole migration rather
  -- than link the forty-four people who are fine. One auth user, one profile, decided
  -- here rather than by whichever row the planner reached first.
  select distinct on (u.id)
         u.id as auth_user_id,
         p.id as profile_id
    from auth.users u
    join profiles p
      on p.auth_user_id is null
     and lower(u.email) in (lower(p.login_email), lower(p.email))
   where nullif(trim(u.email), '') is not null
     -- An auth user already claimed by somebody is not a candidate for anybody. Without
     -- this the second run raises a unique violation rather than doing nothing: the
     -- profile that *lost* the precedence sort below is still null, still matches the
     -- same auth user, and is now the only candidate for it. Caught by re-running the
     -- migration against fixtures, which is the only reason this line exists.
     and not exists (select 1 from profiles q where q.auth_user_id = u.id)
   order by u.id,
            -- `login_email` before `email`, the same precedence as the trigger: it is the
            -- field maintained for this, and matching it first matters when one person's
            -- login address is another's contact address. `coalesce` because a null
            -- login_email compares to null, and null sorts first under `desc` — which
            -- would prefer exactly the row we want to lose.
            coalesce(lower(u.email) = lower(p.login_email), false) desc,
            p.id
)
update profiles p
   set auth_user_id = c.auth_user_id,
       updated_at   = now()
  from candidate c
 where p.id = c.profile_id;

-- ------------------------------------------------------------------------ what remains
-- Anyone still null after this has no auth user yet — they have genuinely never signed
-- in, which is the normal state and what the trigger is for. Nothing to do for them.
--
-- What this does NOT fix: somebody added to `profiles` *after* they have already signed
-- in. The insert trigger has fired for them too, so they will land in the same place, and
-- this migration will need running again — or the linking needs to stop depending on an
-- insert that happens once. That is a separate decision, and it is not free: `auth.users`
-- is owned by `supabase_auth_admin`, so a trigger added there can be created and never
-- dropped (see the note in 0015).
