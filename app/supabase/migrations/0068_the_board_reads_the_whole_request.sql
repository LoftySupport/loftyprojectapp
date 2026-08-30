-- 0068 — the board reads the whole request
--
-- `feedback_display` (0061) predates comments, follows and merging. Four things the board
-- and the bell now need are not on it, and a screen that fetches each of them per card
-- turns a forty-card board into a hundred and sixty round trips.
--
-- ================================================================================
-- `create or replace view` DROPS `reloptions`, AND THAT IS HOW A VIEW LOSES ITS RLS
--
--   0020 hit exactly this: rewriting `profile_display` silently dropped the
--   `security_invoker = on` set in 0001, which would have left the view executing as its
--   owner and returning every row past the policies on the underlying tables. 0001's own
--   comment warns about it.
--
--   So this DROPS and recreates with the option in the create statement, and then asserts
--   on pg_class.reloptions rather than trusting that it worked. `drop view` is safe here
--   because nothing in the database depends on it — the app reads it through PostgREST.
-- ================================================================================
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

    (select count(*) from feedback_votes v where v.feedback_id = f.feedback_id)
      as feedback_vote_count,
    exists (
      select 1 from feedback_votes v
      where v.feedback_id = f.feedback_id
        and v.profile_id = (select current_profile_id())
    ) as feedback_voted_by_me,

    -- The duplicate link, resolved to the title. A card saying "merged into
    -- 9f3c…-a1" is a card nobody can act on; one saying "merged into 'Filter jobs by
    -- council'" is the answer to where their request went.
    f.feedback_merged_into_id,
    m.feedback_title as feedback_merged_into_title,
    -- How many duplicates point AT this one, so a vote count that grew by absorbing four
    -- other requests can say so instead of looking inflated.
    (select count(*) from feedback d where d.feedback_merged_into_id = f.feedback_id)
      as feedback_duplicate_count,

    -- Comments, excluding the internal ones — and excluding them HERE rather than in the
    -- app, because a count is a disclosure: "3 comments" on a thread where two are the
    -- team's private triage tells everybody those two exist. The subquery reads through
    -- 0064's read policy, so the number each person sees is the number they can open.
    (select count(*) from comments c
      where c.feedback_id = f.feedback_id) as feedback_comment_count,

    -- The bell's two facts. Following is private (0065), so both are already scoped to
    -- the reader by the policy on feedback_follows — no profile filter is written here,
    -- for the same reason listMyMentions writes none.
    exists (
      select 1 from feedback_follows fl
      where fl.feedback_id = f.feedback_id
        and fl.profile_id = (select current_profile_id())
    ) as feedback_followed_by_me,
    -- Unread, derived rather than stored: the request has moved since you last looked.
    -- Null seen-stamp counts as unseen, which is what makes following something already
    -- in flight tell you where it is.
    exists (
      select 1 from feedback_follows fl
      where fl.feedback_id = f.feedback_id
        and fl.profile_id = (select current_profile_id())
        and (fl.feedback_follow_seen_stage_at is null
             or f.feedback_stage_entered_at > fl.feedback_follow_seen_stage_at)
    ) as feedback_move_unseen

  from feedback f
  left join profiles p on p.profile_id = f.profile_id
  left join feedback m on m.feedback_id = f.feedback_merged_into_id;

comment on view feedback_display is
  'The tracker as a board and a bell read it: one row per request with its votes, its duplicates, its comment count and whether the signed-in person follows it and has seen its last move. security_invoker, so every policy underneath still decides what comes back — asserted on reloptions in verify/, because create-or-replace drops it silently (0020).';

-- The comment count and the two follow columns are correlated subqueries, which is the
-- shape a per-row fact takes in a view. They are not joins-with-group-by on purpose: at
-- this size the planner turns them into the same thing, and a group-by would drop every
-- request with no comments unless the join were outer — the classic way a board quietly
-- stops showing anything nobody has replied to.

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * `select reloptions from pg_class where relname = 'feedback_display'` contains
--     security_invoker=on — asserted, never assumed, because that is the exact fault 0020
--     found and this migration is a rewrite of a view;
--   * a request with no comments and no votes still appears, with zeroes;
--   * an internal comment is NOT counted for an ordinary person and IS for an admin —
--     watched by adding one and reading the count as both;
--   * feedback_move_unseen is true after a superadmin moves a followed request and false
--     once the seen stamp is written.
