-- 0049 — the tick that holds an account at the door (demo mode)
--
-- Amber, 27 Aug: "just have a toggle that is a user level that when ticked selected as
-- demo mode they can't get passed a homescreen gate logging in".
--
-- Simpler than the sandbox I proposed, and better: a demo person signs in, reaches a
-- gate, and goes no further. No sample data anywhere, so the standing rule — never fill
-- a gap with a plausible value — is not bent at all.
--
-- Her reason, 27 Aug, and the thing to keep in mind before "simplifying" this into the
-- permission ladder or into profile_is_active: "demo sees nothing beyond the gate as I
-- don't want them in the app unless I am there with them training them. That way they
-- can't test and trial without me by logging in, but I don't have to deactivate them."
--
-- So this is deliberately NOT deactivation and NOT a permission level:
--   * deactivating says "this person is gone" — it is the wrong word for somebody who
--     starts on Monday, and it is what you would have to undo and redo around every
--     training session;
--   * a permission LEVEL says how far you reach once you are in, and this is about not
--     being in at all.
-- It is a third thing: a real, ready account, held at the door until somebody opens it.
--
-- ---------------------------------------------------------------------------------
-- THE PART THAT MATTERS: a screen gate is not a gate
-- ---------------------------------------------------------------------------------
-- Stopping them at a home screen is the UX. On its own it is decoration — the app's
-- own rule: "RLS is the security boundary. The app's can() checks hide controls; they
-- are not security." A demo account with a valid Microsoft session could still read
-- every job straight from the API while looking at the gate.
--
-- So demo is enforced where it counts, and in ONE place. Every read policy in this
-- database hangs off `is_active_user()`. Teaching that one function about demo blocks
-- every table at once — including tables nobody has written yet, which is the property
-- worth having.

alter table profiles
  add column profile_is_demo boolean not null default false;

comment on column profiles.profile_is_demo is
  'A demo account: signs in, reaches the gate screen, reads nothing. Enforced by is_active_user() returning false, so every policy that hangs off it refuses at once — including future ones. Not a permission LEVEL, because the ladder is about how far you reach once you are in, and this is about not being in.';

-- The one change that does the work.
create or replace function public.is_active_user() returns boolean
  language sql stable security definer set search_path to 'public', 'pg_temp'
as $$
  select exists (
    select 1 from profiles p
    where p.profile_auth_user_id = auth.uid()
      and p.profile_is_active
      and not p.profile_is_demo
  )
$$;

-- …with one deliberate exception. The gate has to know whose it is, and the app learns
-- that by reading the signed-in profile. With the change above and nothing else, a demo
-- user cannot read even their own row — so the app would show them "your account is not
-- set up", which is both wrong and the exact wording this project already lost an hour
-- to once. They may read their own row, and nothing else.
drop policy "read profiles" on profiles;
create policy "read profiles" on profiles
  for select to authenticated
  using ((select is_active_user()) or profile_auth_user_id = (select auth.uid()));

-- ---------------------------------------------------------------------- proof
-- Watched against the live database in a rolled-back transaction before a line of app
-- code was written. The same real account, three times:
--
--   1 · ordinary user     projects 6 · jobs 60 · teams 15 · profiles 47
--   2 · DEMO ticked       projects 0 · jobs 0  · teams 0  · profiles 1   <- their own
--   3 · demo unticked     jobs 60
--
-- One column, one function, one widened policy, and every table refuses at once —
-- including the ones nobody has written yet. Reversible in the same breath. The
-- transaction rolled back: the live database has no such column and reads 60 jobs.

-- ------------------------------------------------------------------- app side
-- - `Profile` gains `isDemo`; `NewProfile` gains it so the dialog can set it.
-- - RequireAuth: profile.isDemo → <DemoGate /> instead of the app. Says plainly that
--   the account is in demo mode and who to ask, and offers sign-out. No fake data,
--   no greyed-out menus pretending to be reachable.
-- - Admin → Users: a Demo toggle per row, beside the status toggle — the same
--   confirm-to-restrict / instant-to-release asymmetry, since switching demo ON is
--   what takes access away.
-- - The bulk bar gains "Mark as demo" / "Remove demo" for an intake of several people.
