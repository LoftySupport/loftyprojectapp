-- 0067 — the request that arrived by phone
--
-- Canny calls it **vote on behalf**: *"Manually add customers to posts for tracking"*,
-- *"Sales team ability to upvote requests on behalf of prospects"*. It exists because
-- most feedback never reaches the portal — it is said in a meeting, on a site visit, or
-- on a call — and a vote count that only counts the people who happened to log in ranks
-- the loudest keyboard rather than the strongest need.
--
-- At Lofty that is the normal case, not the edge one: the supervisor who says "this thing
-- drives me mad" on site is not going to open the app in the car.
--
-- ================================================================================
-- THIS REOPENS AN ARGUMENT 0061 MADE, AND ANSWERS IT RATHER THAN IGNORING IT
--
--   0061's insert policy says: your own vote, never anybody else's, and the reason given
--   was exact — *"without the profile_id clause a person could vote forty times by
--   stamping forty colleagues, and the count would be worth nothing"*.
--
--   That reasoning is still right, and this does not undo it. What made forty fake votes
--   possible was that the row could not say who put it there. So:
--
--     * the vote records WHO ADDED IT (`feedback_vote_added_by`, null when the person
--       voted for themselves — which is the ordinary case and stays exactly as it was);
--     * only admin and above may add one for somebody else, and only stamped as
--       themselves, so a fabricated vote is a fabrication with a name on it;
--     * the app SHOWS it — "added by Amber" beside the voter — so the count can be
--       audited by the people it is about, which is the check that actually bites.
--
--   Anonymous on-behalf voting would be the version worth refusing. Attributed
--   on-behalf voting is a record of a conversation that happened.
-- ================================================================================

alter table feedback_votes
  add column feedback_vote_added_by uuid references profiles(profile_id) on delete set null;

-- =============================================================================
-- A CHECK, NOT A POLICY CLAUSE — AND THE PROBE IS WHAT FOUND THAT OUT
--
--   The insert policy below says added_by must differ from the voter, and that clause
--   alone DOES NOT HOLD. Policies are OR'd: 0061's "anyone active votes once" already
--   admits a row whose profile_id is your own, whatever else is on it, so an admin could
--   insert their own vote stamped `added_by = themselves` and pass through the older
--   policy without the new one ever being consulted.
--
--   Watched happening. The probe asserting that refusal reported:
--     FAIL: an admin added their OWN vote through the on-behalf path
--   which is the whole reason for writing probes that assert a refusal rather than
--   reading the policy and believing it.
--
--   The damage was small — a vote correctly attributed to the person who cast it, wearing
--   a pointless "added by Amber" beside Amber's own name — but the shape is the one this
--   repo has been bitten by twice: a narrow rule sitting beside a broad one, where the
--   broad one wins and the narrow one reads like protection.
--
--   A CHECK is not OR'd with anything. It holds for every insert on this table, by every
--   role, through every policy, including the ones nobody has written yet.
-- =============================================================================
alter table feedback_votes
  add constraint feedback_vote_added_by_is_not_the_voter
    check (feedback_vote_added_by is distinct from profile_id);

comment on column feedback_votes.feedback_vote_added_by is
  'Who entered this vote, when it was not the voter themselves (0067, Canny''s vote-on-behalf). Null means they voted for themselves — the ordinary case. Never null-able away by the app: an on-behalf vote that cannot say who added it is the fabrication 0061 refused.';

-- ON DELETE SET NULL rather than cascade: deleting the admin's profile must not delete
-- somebody else's vote. The attribution is lost, the opinion is not.

-- "Who did Amber add" is not a query anybody has asked for, and an index nobody uses
-- still costs every insert. The column is read one row at a time, beside its voter.

-- ---------------------------------------------------------------- the second insert path
-- 0061's policy stays exactly as it is — untouched, so the ordinary case cannot regress —
-- and this is a second, narrower one beside it. Policies are OR'd, which is usually the
-- trap; here it is the mechanism, and the narrowing is in the clauses:
--
--   * admin and above, so most people still cannot reach it at all;
--   * added_by must be the person doing it, so the record cannot lie about who acted;
--   * added_by must NOT equal the voter, because "I added my own vote on behalf of
--     myself" is just a vote, and it must go through the 0061 policy where it belongs —
--     otherwise an admin's own votes would carry an attribution that means nothing.
create policy "admins add a vote on somebody's behalf" on feedback_votes
  for insert to authenticated
  with check (
    (select is_active_user())
    and (select current_permission()) >= 'admin'
    and feedback_vote_added_by = (select current_profile_id())
    and feedback_vote_added_by is distinct from profile_id
  );

-- Deleting stays "your own row only" (0061), which has a consequence worth stating: an
-- admin who adds a vote for somebody CANNOT take it back — only that person can. That is
-- deliberate. A vote somebody else can withdraw on your behalf is not a record of what
-- you said, and the mistake this protects against (an admin quietly tidying a count) is
-- worse than the inconvenience it causes (asking Ketan to click the thumb again).
--
-- The fix for a mis-entered vote is therefore the person's own click, or a superadmin at
-- the database. Named here so nobody discovers it as a bug.

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * an ADMIN adds a vote for a colleague and the count goes up by one;
--   * a `user` attempting the same is refused — watched against the policy without the
--     permission clause, where it succeeded;
--   * an admin stamping somebody ELSE as added_by is refused (the record cannot lie);
--   * an admin adding a vote for themselves stamped as their own adder is refused by the
--     CHECK — watched FAILING first, with only the policy clause in place, which is how
--     the OR'd-policy hole above was found;
--   * an on-behalf vote cannot be added twice — the primary key still holds;
--   * the admin cannot delete the vote they added; the voter can.
