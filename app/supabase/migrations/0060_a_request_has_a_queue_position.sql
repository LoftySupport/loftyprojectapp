-- 0060 — a request has a queue position
--
-- Amber, 30 Aug: "to have a feature request and bug tracker so users can see where their
-- requests are in the queue and so they can see product updates… This will help stop
-- people saying I want this to happen when it is already planned. Also when managers help
-- plan next phase it is clear and ordered… new ideas or requests populate a stage called
-- requested, then stages are in review, planned, in development. Only super admin can
-- move the requests between stages."
--
-- =============================================================================
-- THIS REVERSES THE READ POLICY 0052 ARGUED FOR, AND THE REVERSAL IS THE POINT
--
--   0052 made the SELECT policy admin-only and said so at length: *"the sender cannot
--   read back what they sent"*, and the app was built around that — `submitFeedback`
--   returns void precisely so an insert would not fail on a select nobody was allowed.
--   That was right for what the table was on 28 August: a private triage list for one
--   person, whose whole value was Amber knowing what to implement.
--
--   It is wrong for what Amber asked for two days later, and the sentence that decides
--   it is *"this will help stop people saying I want this to happen when it is already
--   planned"*. A queue nobody can see cannot answer that. The feature IS the visibility;
--   an admin-only tracker is the thing that already exists and did not solve it.
--
--   So the read widens to every active person, and it widens to BOTH kinds. Bugs are
--   deliberately not held back: "is that broken for everyone or just me" is the second
--   most common question after "is this planned", and a bug list somebody can read is
--   how a duplicate report stops being written.
--
--   What did NOT widen: writing. Anybody may report, only superadmin may move a request
--   between stages, and only admin+ may edit somebody else's words. Read and write stay
--   separate policies for the reason 0051 spelled out — one permissive `for all` would
--   have let anybody edit the queue they can now see.
--
--   THE DISCLOSURE THIS ACCEPTS, STATED PLAINLY. Everyone signed in can now read every
--   report anyone has filed, including the reporter's name. That is a real change and it
--   is the intended one: this is an internal staff app of ~47 people, a report is about
--   the app rather than about a record, and the form says who it is sent as. If a
--   report ever needs to be private, that is a `feedback_is_private` column and a
--   narrowed predicate — not a reason to keep the whole queue dark.
-- =============================================================================
--
-- ------------------------------------------------------------- status becomes a stage
-- 0052's four statuses were new/planned/done/declined. Amber named four stages —
-- requested, in review, planned, in development — and the tracker needs two more that
-- she named elsewhere in the same brief: shipped ("include new releases on change log")
-- and declined, which 0052 already argued for and nothing here reopens.
--
-- The column is renamed rather than reused with new values, because `feedback_status`
-- and `feedback_stage` are not the same fact: a status is how a report is going, a
-- stage is where it sits in a queue people can see. The rename makes every reader of
-- the old name fail loudly instead of silently reading a value that no longer means
-- what it did.

alter table feedback rename column feedback_status to feedback_stage;
alter table feedback rename constraint feedback_status_is_known to feedback_stage_is_known;

-- The mapping, chosen so nothing loses its place in the queue:
--   new      → requested       (it has been asked for and not yet looked at)
--   planned  → planned         (unchanged, and the reason the word is kept)
--   done     → shipped         (done means it went out, which is what shipped says)
--   declined → declined        (unchanged)
-- No existing row maps to in_review or in_development: nothing has ever been recorded
-- as being in either, and inventing a position for a row would be a claim about work
-- that may not have started.
alter table feedback alter column feedback_stage drop default;
alter table feedback drop constraint feedback_stage_is_known;

update feedback set feedback_stage = case feedback_stage
  when 'new'  then 'requested'
  when 'done' then 'shipped'
  else feedback_stage
end;

alter table feedback
  add constraint feedback_stage_is_known check (feedback_stage in (
    'requested',       -- Amber's word, and the default: it has been asked for
    'in_review',       -- somebody is weighing it
    'planned',         -- it is going to happen; a roadmap phase may be attached
    'in_development',  -- it is being built now
    'shipped',         -- it went out, and it appears in the changelog
    'declined'         -- considered and not going ahead. Never a delete — 0052's reason
  ));

alter table feedback alter column feedback_stage set default 'requested';

comment on column feedback.feedback_stage is
  'Where the request sits in the queue everybody can see. Only superadmin may change it (guard_feedback_stage_change). Renamed from feedback_status in 0060, when the list stopped being a private triage board and became the tracker.';

-- ------------------------------------------------------ when it got where it is
-- Without this the board can say what stage something is in and nothing about whether
-- it has been stuck there for four months, which is the question a person checking on
-- their own request is actually asking. Backfilled to the created time: for a row that
-- has never moved that is the truth, and for one that has it is the only date the
-- database holds. Not guessed forward from the audit log — a stamp that looks precise
-- and is reconstructed is worse than one that is honestly the creation date.
alter table feedback add column feedback_stage_entered_at timestamptz not null default now();
update feedback set feedback_stage_entered_at = feedback_created_at;

-- ------------------------------------------------------------------ what broke, exactly
-- Amber: "…and any screenshots and what page it was on and errors request." The page was
-- already captured (0052). These two are the rest of it, and both are captured rather
-- than typed: nobody reporting a bug in a hurry retypes an error message accurately, and
-- nobody at all knows their browser version.
--
-- Nullable and empty-allowed: an idea has no error and no bug report is refused for not
-- having caught one.
alter table feedback add column feedback_error_text text;
alter table feedback add column feedback_user_agent text;

comment on column feedback.feedback_error_text is
  'The error the app was showing, captured at send — never typed. Null on an idea, and on a bug nobody hit an error on.';

-- ---------------------------------------------------------------- reading, widened
drop policy "admins read feedback" on feedback;

create policy "anyone active reads the tracker" on feedback
  for select to authenticated
  using ((select is_active_user()));

-- ---------------------------------------------------------------- writing, unchanged
-- "anyone active reports" (0052) still stands: every active person may insert, and only
-- stamped as themselves. Left alone deliberately — widening the read did not widen this.
--
-- Amber also asked for the other direction: *"I need to be able to update the bug tracker
-- with improvements I am doing"* — an admin filing an item nobody reported. That needs no
-- new policy: an admin is an active person, so the existing insert covers it, and the row
-- is stamped with the admin as the reporter, which is true. The app labels those items by
-- who filed them rather than by a flag, because "filed by Amber" already says it.

-- ------------------------------------------------------- the stage is superadmin's
-- "Only super admin can move the requests between stages."
--
-- A trigger and not a policy, for the reason 0038 gives: RLS decides which ROWS may be
-- written, never which COLUMNS. The UPDATE policy has to stay at admin so that admins can
-- fix a title or attach a roadmap phase; without this trigger that same policy would let
-- an admin move things through the queue, which is the one thing she named a level for.
create or replace function guard_feedback_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- No JWT: a migration, a seed or the service role. Same stance as 0018 and 0038.
  if auth.uid() is null then
    return new;
  end if;

  if new.feedback_stage is distinct from old.feedback_stage then
    if current_permission() < 'superadmin'::permission_level then
      raise exception
        'Moving a request between stages needs superadmin permission.'
        using errcode = '42501';
    end if;
    -- Stamped here rather than trusted from the client: the app could send it, and then
    -- "when did this reach planned" would be a number the sender chose.
    new.feedback_stage_entered_at := now();
  end if;

  return new;
end;
$$;

revoke execute on function guard_feedback_stage_change() from public;
revoke execute on function guard_feedback_stage_change() from anon;
revoke execute on function guard_feedback_stage_change() from authenticated;

drop trigger if exists feedback_guard_stage_change on feedback;

-- `before update of feedback_stage` narrows this to statements that mention the column;
-- the `is distinct from` narrows it to ones that change it. Setting a stage to the stage
-- it is already in is not a move and needs no permission.
create trigger feedback_guard_stage_change
  before update of feedback_stage on feedback
  for each row
  execute function guard_feedback_stage_change();

comment on function guard_feedback_stage_change() is
  'Refuses a change to feedback.feedback_stage below superadmin (Amber, 30 Aug) and stamps feedback_stage_entered_at when one goes through. A trigger because RLS cannot express a column rule, and admins must keep the UPDATE policy to fix titles and attach roadmap phases.';

comment on table feedback is
  'The bug and feature-request tracker (0052, opened up in 0060). Anyone active reports and reads; only superadmin moves a request between stages. The queue is deliberately visible to everybody — a queue nobody can see cannot stop the duplicate request that is the reason it exists.';

-- The list index still matches the query it was built for; the board reads a stage at a
-- time now as well, and that ordering is what a column of cards is.
create index if not exists feedback_stage_recent_idx
  on feedback (feedback_stage, feedback_created_at desc);

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted (verify/rls.sql carries the standing
-- probes; run against the live database in a rolled-back transaction):
--   * a viewer reads the tracker — rows, not zero — and reads a bug filed by somebody
--     else, which is the change this migration makes;
--   * a demo account still reads NONE of it, because is_active_user() is false;
--   * a viewer's stage update matches no row (the UPDATE policy), and an ADMIN's stage
--     update raises 42501 from the trigger — the two refusals are different mechanisms
--     and both have to be seen, because an admin passing the policy is exactly the case
--     the trigger exists for;
--   * a superadmin moves a request and feedback_stage_entered_at changes with it;
--   * a superadmin setting the stage to the value it already holds does NOT restamp
--     feedback_stage_entered_at.
