-- 0061 — one thumbs up each
--
-- Amber, 30 Aug: "All users can vote on ideas with thumbs up if they like it but only
-- vote once per idea."
--
-- ------------------------------------------------------------- the count is not a column
-- The obvious shape is `feedback_vote_count integer` and an increment. It is wrong for
-- one reason that matters and one that follows from it:
--
--   * "only vote once per idea" cannot be enforced by a counter. A counter can only be
--     told to go up; the rule lives in knowing WHO voted, which means a row per person.
--     With the row, the count is derivable and the column would be a second copy of it
--     that can drift — and the drift is invisible, because a wrong number still looks
--     like a number.
--   * Un-voting comes free. Somebody clicks the thumb, changes their mind, clicks again:
--     with rows that is a delete, with a counter it is a second thing to trust the client
--     about.
--
-- So: a table whose PRIMARY KEY IS THE RULE. `(feedback_id, profile_id)` cannot hold a
-- second vote from the same person, whatever the app does, and no policy or check has to
-- say it.

create table feedback_votes (
  feedback_id uuid not null references feedback(feedback_id) on delete cascade,

  -- NOT NULL and CASCADE here, unlike feedback.profile_id which is nullable and SET
  -- NULL. Different facts: a report outlives its reporter (it is about the app), but a
  -- vote IS the person — "somebody liked this" with nobody attached is not a fact worth
  -- keeping, and it would leave a count that can never be verified against who cast it.
  profile_id uuid not null references profiles(profile_id) on delete cascade,

  feedback_vote_at timestamptz not null default now(),

  primary key (feedback_id, profile_id)
);

comment on table feedback_votes is
  'One thumbs up per person per request (Amber, 30 Aug). The primary key is the rule — a second vote from the same person cannot be stored, whatever the app sends.';

-- The primary key indexes (feedback_id, profile_id), which serves both the count per
-- request and "have I voted on this one". No second index: the table is a set of pairs
-- and every query is one of those two shapes.
--
-- "Everything I have voted for" would want the columns the other way round. Nothing asks
-- that today, and an index nobody uses still costs every insert.

alter table feedback_votes enable row level security;

-- ------------------------------------------------------------------------- reading
-- Everybody active, because the count is the point: a request showing 11 votes to the
-- person who filed it and nothing to anybody else would be a leaderboard only one person
-- can read. Who voted is readable too — this is a staff app of 47 people deciding what
-- to build next, and an anonymous vote invites the same person's opinion arriving twice
-- under different names to feel possible. It is not: the primary key stops it.
create policy "anyone active reads votes" on feedback_votes
  for select to authenticated
  using ((select is_active_user()));

-- ------------------------------------------------------------------------- voting
-- Your own vote, never anybody else's. Without the profile_id clause a person could vote
-- forty times by stamping forty colleagues, and the count — the whole signal managers are
-- meant to plan the next phase from — would be worth nothing.
create policy "anyone active votes once" on feedback_votes
  for insert to authenticated
  with check (
    (select is_active_user())
    and profile_id = (select current_profile_id())
  );

-- Un-voting is deleting your own row. Deliberately allowed, and deliberately narrow: a
-- vote is an opinion somebody is entitled to withdraw, and nobody — admin included — is
-- entitled to withdraw it for them. There is no UPDATE policy at all; the table has
-- nothing to update, and a vote whose owner could change hands is not a vote.
create policy "you can take your vote back" on feedback_votes
  for delete to authenticated
  using (
    (select is_active_user())
    and profile_id = (select current_profile_id())
  );

-- ---------------------------------------------------------------- the board's read
-- One view so a board of six columns is one request, not six counts plus a membership
-- check per card. `security_invoker = on`, which is not optional: without it the view
-- executes as its owner and hands every reader rows the policies above would refuse —
-- 0001's comment on exactly this, and 0020's fault where a rewrite silently dropped it.
create view feedback_display with (security_invoker = on) as
  select
    f.feedback_id,
    f.feedback_kind,
    f.feedback_title,
    f.feedback_detail,
    f.feedback_page,
    f.feedback_error_text,
    f.feedback_stage,
    f.feedback_stage_entered_at,
    f.feedback_created_at,
    f.profile_id,
    -- The reporter's name resolved here rather than embedded per query: PostgREST would
    -- need the constraint named (feedback has one FK to profiles today, and the audit
    -- quartet is one migration away from making that ambiguous — the PGRST201 shape that
    -- took sign-in down in August).
    p.profile_full_name as feedback_from_name,
    (select count(*) from feedback_votes v where v.feedback_id = f.feedback_id)
      as feedback_vote_count,
    -- Whether YOU have voted, which is what decides whether the thumb is filled. Computed
    -- against the signed-in profile rather than returned as a list of voters the client
    -- then searches — that list is unbounded and the answer is a boolean.
    exists (
      select 1 from feedback_votes v
      where v.feedback_id = f.feedback_id
        and v.profile_id = (select current_profile_id())
    ) as feedback_voted_by_me
  from feedback f
  left join profiles p on p.profile_id = f.profile_id;

comment on view feedback_display is
  'The tracker as a board reads it: one row per request with its vote count and whether the signed-in person is one of the voters. security_invoker, so the policies on feedback and feedback_votes still decide every row.';

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * a person votes, then votes again — the second is refused by the primary key, not
--     by the app;
--   * a person stamping a colleague's profile_id is refused by the with-check;
--   * a person deletes their own vote and the count drops; the same delete aimed at
--     somebody else's row matches nothing;
--   * a demo account reads no votes and casts none (is_active_user() is false);
--   * feedback_display's security_invoker is asserted on pg_class.reloptions, not
--     assumed — a later `create or replace view` drops it silently.
