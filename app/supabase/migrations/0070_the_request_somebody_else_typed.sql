-- 0070 — the request somebody else typed
--
-- Amber, 31 Aug: *"it needs to have the option to have requested by if an admin or super
-- admin is logged in as they may enter it on behalf of someone else."*
--
-- The same gap `0067` closed for votes, one step earlier in the loop. `0067` let an admin
-- record that Ketan wanted a thing that already existed; this lets them record that Ketan
-- asked for a thing nobody had written down. Both exist because most feedback at Lofty is
-- said out loud — on site, on a call, in a meeting — and a tracker that only holds what
-- people typed themselves is a tracker of who likes typing.
--
-- ================================================================================
-- `profile_id` STAYS THE PERSON IT IS FROM. THE TYPIST GETS THEIR OWN COLUMN.
--
--   The tempting shortcut is to widen the insert policy so an admin may stamp any
--   profile_id and leave it there. That loses the fact that matters: with one column,
--   "Deanna asked for this" and "Amber says Deanna asked for this" are the same row, and
--   nobody can tell them apart afterwards — including Deanna.
--
--   So the shape is 0067's exactly, and deliberately so:
--
--     * `profile_id`        — who it is FROM. Unchanged, and what the board shows.
--     * `feedback_added_by` — who TYPED it, null when they are the same person, which is
--                             the ordinary case and stays exactly as it was.
--
--   Null is the normal state. A column that had to be filled in on every report would be
--   a column that gets filled in wrongly on every report.
-- ================================================================================

alter table feedback
  add column feedback_added_by uuid references profiles(profile_id) on delete set null;

-- ON DELETE SET NULL, not cascade: deleting the admin who typed it must not delete
-- somebody else's request. The attribution is lost; the request is not. Same call as
-- 0067 made on the vote, for the same reason.

-- =============================================================================
-- A CHECK, BECAUSE 0067 ALREADY LEARNED THAT THE POLICY CLAUSE IS NOT ENOUGH
--
--   The policy below says added_by must differ from the reporter. That clause ALONE does
--   not hold, and this is not a guess — 0067 watched the identical hole happen on
--   `feedback_votes`. Policies are OR'd: `anyone active reports` already admits any row
--   whose profile_id is your own, whatever else is on it, so an admin could file their
--   own request stamped `added_by = themselves` and pass through the older policy
--   without the new one ever being consulted.
--
--   A CHECK is not OR'd with anything. It holds for every insert on this table, by every
--   role, through every policy, including the ones nobody has written yet.
-- =============================================================================
alter table feedback
  add constraint feedback_added_by_is_not_the_reporter
    check (feedback_added_by is distinct from profile_id);

comment on column feedback.feedback_added_by is
  'Who typed this request, when it was not the person it is from (0070, Amber 31 Aug). Null means they filed it themselves — the ordinary case. profile_id stays the person it is FROM, so "Deanna asked for this" and "Amber says Deanna asked for this" are different rows rather than the same one.';

-- ---------------------------------------------------------------- the second insert path
-- `anyone active reports` (0052) stays exactly as it is — untouched, so the ordinary case
-- cannot regress — and this is a second, narrower policy beside it. Policies being OR'd
-- is usually the trap; here it is the mechanism, and the narrowing is in the clauses:
--
--   * admin and above, so most people cannot reach it at all;
--   * added_by must be the person doing it, so the record cannot lie about who typed it;
--   * added_by must NOT equal the reporter — "I filed my own request on behalf of myself"
--     is just a report, and it belongs in the 0052 policy where it already works.
create policy "admins file a request for somebody else" on feedback
  for insert to authenticated
  with check (
    (select is_active_user())
    and (select current_permission()) >= 'admin'
    and feedback_added_by = (select current_profile_id())
    and feedback_added_by is distinct from profile_id
  );

-- ------------------------------------------------------- who ends up following it
-- 0065's `follow_on_report` follows `new.profile_id`, and that is already right here: the
-- person it is FROM is the person who must hear what became of it, whoever typed it.
--
-- The typist is deliberately NOT followed as well, and this is a decision rather than an
-- omission. An admin entering thirty requests from a site visit would follow all thirty,
-- and — being the person who also MOVES them — would light their own bell on every move
-- they made themselves. A notification you generate by acting is noise, and a bell that
-- is mostly noise stops being read. They can follow one deliberately, which is the
-- gesture that means something.

-- ---------------------------------------------------------- the board has to show it
-- An on-behalf report that does not SAY it is on behalf is indistinguishable from a
-- forgery, which is the whole argument 0067 made for showing "added by" beside a vote.
-- The view carries the name so the card can render it without a second query.
--
-- Dropped and recreated rather than `create or replace`, because that drops
-- `security_invoker` silently — 0020's fault, 0055's repeat of it, and 0069's fix. The
-- assertion added to verify/behaviour.sql in 0069 now catches this for every view, so
-- this is the first view rewrite in the repo that is checked rather than merely careful.
drop view if exists feedback_display;

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
    f.roadmap_phase_id,
    p.profile_full_name as feedback_from_name,

    -- New in 0070: who typed it, resolved to a name. Null on an ordinary report.
    f.feedback_added_by,
    ab.profile_full_name as feedback_added_by_name,

    (select count(*) from feedback_votes v where v.feedback_id = f.feedback_id)
      as feedback_vote_count,
    exists (
      select 1 from feedback_votes v
      where v.feedback_id = f.feedback_id
        and v.profile_id = (select current_profile_id())
    ) as feedback_voted_by_me,

    f.feedback_merged_into_id,
    m.feedback_title as feedback_merged_into_title,
    (select count(*) from feedback d where d.feedback_merged_into_id = f.feedback_id)
      as feedback_duplicate_count,

    (select count(*) from comments c
      where c.feedback_id = f.feedback_id) as feedback_comment_count,

    exists (
      select 1 from feedback_follows fl
      where fl.feedback_id = f.feedback_id
        and fl.profile_id = (select current_profile_id())
    ) as feedback_followed_by_me,
    exists (
      select 1 from feedback_follows fl
      where fl.feedback_id = f.feedback_id
        and fl.profile_id = (select current_profile_id())
        and (fl.feedback_follow_seen_stage_at is null
             or f.feedback_stage_entered_at > fl.feedback_follow_seen_stage_at)
    ) as feedback_move_unseen

  from feedback f
  left join profiles p  on p.profile_id  = f.profile_id
  left join profiles ab on ab.profile_id = f.feedback_added_by
  left join feedback m  on m.feedback_id = f.feedback_merged_into_id;

comment on view feedback_display is
  'The tracker as a board and a bell read it: one row per request with its votes, its duplicates, its comment count, who typed it when that was not the person it is from (0070), and whether the signed-in person follows it and has seen its last move. security_invoker, asserted for every view in verify/behaviour.sql since 0069.';

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * an ADMIN files a request from a colleague and it appears under that colleague's
--     name with "added by" beside it;
--   * a `user` attempting the same is refused — the on-behalf policy is admin+, and the
--     0052 policy refuses a profile_id that is not their own;
--   * an admin stamping somebody ELSE as added_by is refused (the record cannot lie);
--   * an admin filing their own request stamped as their own adder is refused by the
--     CHECK, not by the policy — the exact hole 0067 watched happen on votes;
--   * the person it is FROM is followed, and the typist is not;
--   * feedback_display still reports security_invoker=on afterwards, which behaviour.sql
--     now asserts for every view rather than this one.
