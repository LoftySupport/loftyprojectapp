-- 0075 — a held account may still speak
--
-- Amber, 1 Sep: *"while in development, users need to be able to submit a form with an
-- idea or suggestion but not access the whole app (e.g. if they are linked out in demo
-- mode)"*, and *"allows all users (including viewers) to submit an idea"*.
--
-- ================================================================================
-- VIEWERS COULD ALREADY. DEMO ACCOUNTS COULD NOT, AND THAT IS THE WHOLE CHANGE
--
--   Checked before anything was written, because half the ask turned out to need no
--   work at all:
--
--     * a VIEWER is an ordinary active person. `anyone active reports` (0052) asks only
--       for `is_active_user()`, so the lowest rung on the ladder has always been able to
--       file a request. Nothing here touches that.
--
--     * a DEMO account cannot. `0049` taught `is_active_user()` about
--       `profile_is_demo`, so every policy hanging off it refuses at once — which is the
--       gate working exactly as designed, and also the reason somebody held at it has no
--       way to tell Amber anything. They sign in, read the gate screen, and that is the
--       end of the conversation.
--
--   Forty-two of the forty-seven profiles carry the tick today, so "nobody being trained
--   can send feedback" is the common case rather than an edge one.
-- ================================================================================
--
-- ------------------------------------------------------------ NOT an anonymous form
-- The alternative Amber raised was an external page anybody could open. It is the wrong
-- shape here and the reason is the rule the whole schema rests on: **a profile row is the
-- grant**. An anonymous form needs `anon` INSERT, which puts a writable table on the
-- public internet, loses the one fact that makes a request actionable — who asked — and
-- brings spam, rate limiting and a captcha with it.
--
-- None of that buys anything, because the people it is for ARE signed in. They have real
-- profiles, real names, and a session. What they lack is permission to write one table.

create or replace function public.is_signed_in_staff() returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from profiles p
    where p.profile_auth_user_id = auth.uid()
      and p.profile_is_active
  )
$$;

-- `is_active_user()` minus the demo clause, and nothing else — deliberately NOT a
-- loosening of that function, which every policy in the schema hangs off. A deactivated
-- person is still refused: `profile_is_active` is checked here exactly as it is there.
-- The difference between the two functions is one line, and that line is the gate.
comment on function public.is_signed_in_staff() is
  'Somebody with an active profile row, whether or not they are held at the demo gate (0049). Deliberately narrower in use than is_active_user(): it exists for the one thing a held account may do — send feedback (0075) — and must never be substituted for is_active_user() in a read policy, which is what the gate is.';

revoke execute on function public.is_signed_in_staff() from public;
revoke execute on function public.is_signed_in_staff() from anon;
grant execute on function public.is_signed_in_staff() to authenticated;

-- ---------------------------------------------------------------- sending
-- A second, narrower policy beside `anyone active reports`, the shape 0067 and 0070 both
-- settled on. Policies are OR'd, so the existing one is untouched and cannot regress.
--
-- `feedback_added_by is null` is the clause that matters: 0070 lets an ADMIN file on
-- somebody's behalf, and a held account must not be able to reach that path — a person
-- who cannot read the app has no business filing requests under other people's names.
create policy "a held account may send feedback" on feedback
  for insert to authenticated
  with check (
    (select is_signed_in_staff())
    and profile_id = (select current_profile_id())
    and feedback_added_by is null
  );

-- ---------------------------------------------------------------- reading it back
-- Narrow, and it follows 0049's own precedent rather than departing from it. That
-- migration widened the `profiles` SELECT so a demo account may read ITS OWN ROW,
-- because `RequireAuth` has to read that row to know the account is held at all —
-- without it the app cannot tell "held at the gate" from "not set up".
--
-- The same applies here for a smaller reason: `submitFeedback` reads the new row back to
-- get its id, and a person who sends something is owed the confirmation that it arrived.
-- So: your own reports, and nothing else. The queue stays dark — a held account still
-- sees no board, no votes, no comments, and nobody else's requests.
create policy "you can read the reports you sent" on feedback
  for select to authenticated
  using (
    (select is_signed_in_staff())
    and profile_id = (select current_profile_id())
  );

-- ------------------------------------------------------- what is deliberately NOT here
-- Screenshots. `0062`'s storage policies and `feedback_attachments` both hang off
-- `is_active_user()`, and they are left alone: widening object storage is a bigger
-- surface than widening one table, and a held account attaching files to a bucket they
-- cannot list is not worth it for a feature they mostly will not use. The form hides the
-- control for them rather than offering an upload that fails — the same rule the board
-- follows for a drag the rung does not allow.
--
-- Following, voting and commenting are also untouched. 0065's `follow_on_report` trigger
-- is SECURITY DEFINER, so it still writes their follow row; they simply cannot read it.

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * a demo account sends a request, and the row exists with their name on it;
--   * the same account reads back exactly that request and NOTHING else — not the other
--     requests, not the votes, not the comments, not a job;
--   * a demo account cannot file one under somebody else's profile_id;
--   * a demo account cannot file one carrying feedback_added_by — the admin path;
--   * a DEACTIVATED account (profile_is_active false) still cannot send anything, which
--     is the case that separates this function from a simple "is signed in";
--   * an ordinary active person is unaffected in both directions.
