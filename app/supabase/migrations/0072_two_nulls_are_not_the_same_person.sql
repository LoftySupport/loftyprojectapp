-- 0072 — two nulls are not the same person
--
-- =============================================================================
-- 0070'S CHECK IS WRONG, AND `verify/check.sh` IS WHAT SAID SO
--
--   0070 copied 0067's predicate:
--
--       check (feedback_added_by is distinct from profile_id)
--
--   `is distinct from` answers FALSE for two nulls — that is its whole purpose, and it is
--   exactly right on `feedback_votes`, where 0067 put it, because `feedback_votes.
--   profile_id` is NOT NULL and the two-null case cannot arise.
--
--   `feedback.profile_id` IS nullable, and deliberately so: 0052 made it
--   `ON DELETE SET NULL` because a report outlives its reporter — it is about the app,
--   not about the person who noticed. So on `feedback` the copied line says:
--
--       a report with no reporter and no typist is REFUSED.
--
--   Which is every ordinary report the moment its author's profile is deleted. The
--   consequence is worse than a rejected insert: `ON DELETE SET NULL` performs an UPDATE,
--   the CHECK is re-evaluated on that updated row, and it fails — so **deleting a profile
--   would fail for anybody who had ever filed a request**, with a check-constraint error
--   naming a column nobody was touching.
--
--   Watched happening on the live database before this was written, in a rolled-back
--   transaction: inserting an ordinary report and then setting `profile_id = null` — the
--   exact statement the foreign key issues — raised
--   `feedback_added_by_is_not_the_reporter`.
--
--   THE HARNESS FOUND IT, NOT REVIEW. The constraint probes plant a fixture request with
--   no reporter; that insert started failing the moment 0070 applied, and because the
--   fixture is what the next four probes act on, `check.sh` reported five failures from
--   one cause. That is the check-that-was-watched-failing rule paying for itself on the
--   same day it was extended.
-- =============================================================================
--
-- ---------------------------------------------------------------------- the predicate
-- `added_by is null OR added_by <> profile_id`, which says the rule in the order a person
-- would: an ordinary report has no typist and is fine, and a report that names one must
-- not name the person it is from.
--
-- The remaining case is deliberate rather than overlooked: an ON-BEHALF report whose
-- subject has since been deleted leaves `added_by` set and `profile_id` null, so the
-- comparison is unknown and the CHECK passes. That is correct — the row is a true record
-- that somebody entered a request for a person who has since left, and refusing it would
-- block the same profile deletion all over again.
alter table feedback drop constraint feedback_added_by_is_not_the_reporter;

alter table feedback
  add constraint feedback_added_by_is_not_the_reporter
    check (feedback_added_by is null or feedback_added_by <> profile_id);

comment on constraint feedback_added_by_is_not_the_reporter on feedback is
  'An on-behalf report may not name its own typist as the person it is from. Written as "is null or <>" rather than "is distinct from" (0072): profile_id is nullable here, unlike on feedback_votes, and "is distinct from" refuses two nulls — which is every report whose reporter has been deleted, and which blocked ON DELETE SET NULL entirely.';

-- ---------------------------------------------------------------------------- proof
-- Watched, in this order:
--   * before: an ordinary report, then `profile_id = null` — refused, which is the
--     production defect;
--   * after: the same sequence succeeds;
--   * after: an admin filing on behalf of themselves is still refused, so the rule this
--     constraint exists for did not go out with the bug;
--   * after: `check.sh` is green again, including the four probes that were failing on
--     the fixture this broke rather than on anything of their own.
