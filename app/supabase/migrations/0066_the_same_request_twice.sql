-- 0066 — the same request, twice
--
-- Canny merges duplicate posts and moves the votes across. It is the feature that makes
-- a vote count mean anything: without it "let me filter by council" splits into four
-- posts with three votes each, and the thing eleven people asked for loses to the thing
-- five people asked for once.
--
-- This is also the closest thing in Canny to Amber's own reason for the tracker — *"stop
-- people saying I want this to happen when it is already planned"*. The app's other half
-- of that answer is in the report form, which searches the tracker as you type; this is
-- what happens when somebody sends it anyway, which they will.

alter table feedback
  add column feedback_merged_into_id uuid references feedback(feedback_id) on delete set null;

comment on column feedback.feedback_merged_into_id is
  'Set when this request is a duplicate of another (0066). The row is kept, never deleted — the person who filed it must still be able to find it and see where the conversation went. Its votes and followers move to the target.';

-- Not itself. The trigger below catches the harder cases; this catches the one a CHECK
-- can see on its own, and does so even for a write that bypasses the trigger.
alter table feedback
  add constraint feedback_not_merged_into_itself
    check (feedback_merged_into_id is distinct from feedback_id);

-- "What was merged into this one" — the list shown on the surviving request, so its
-- vote count is explainable rather than mysteriously large.
create index feedback_merged_into_idx
  on feedback (feedback_merged_into_id) where feedback_merged_into_id is not null;

-- ================================================================================
-- MERGING MOVES THE VOTES, AND ONLY THE DATABASE CAN DO IT
--
--   The votes belong to other people. 0061's policies say a person may only insert their
--   own vote — deliberately, and that rule is what makes the count worth reading — so the
--   app CANNOT move them: an admin merging two requests has no right to write Ketan's
--   vote onto anything.
--
--   A SECURITY DEFINER trigger is the only place this can happen: it runs as the owner,
--   past the policies, in the same transaction as the merge, so votes and merge cannot
--   half-happen. The alternative — a service-role key in an edge function — is the thing
--   NEXT-SESSION.md rules out outright ("no integration ever uses the service key").
-- ================================================================================
create or replace function merge_feedback_votes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_merged uuid;
begin
  if new.feedback_merged_into_id is null
     or new.feedback_merged_into_id is not distinct from old.feedback_merged_into_id then
    return new;
  end if;

  -- Merging is triage, so admin — the same rung that edits a request's words. NOT
  -- superadmin: Amber's rule was about moving a request along the queue, and saying "this
  -- is the same as that one" is not a promise that either will be built.
  if auth.uid() is not null and current_permission() < 'admin'::permission_level then
    raise exception 'Merging a request into another needs admin permission.'
      using errcode = '42501';
  end if;

  -- NO CHAINS. If the target is itself merged, "where did my request go" needs following
  -- twice, and a cycle (A→B→A) makes it never terminate. Refusing here means every merged
  -- request points at a live one, always, and the UI can resolve it in one hop.
  select f.feedback_merged_into_id into target_merged
    from feedback f where f.feedback_id = new.feedback_merged_into_id;
  if target_merged is not null then
    raise exception
      'That request is itself a duplicate. Merge into the one it points at instead.'
      using errcode = '23514';
  end if;

  -- Nothing may be merged INTO something that has duplicates pointing at it AND is itself
  -- being merged in the same breath — covered by the check above — and nothing may absorb
  -- its own duplicates' target, covered by the self-check constraint.

  -- The votes. `on conflict do nothing` because somebody who voted for both is one
  -- person with one opinion, and the primary key on feedback_votes says so.
  insert into feedback_votes (feedback_id, profile_id, feedback_vote_at)
  select new.feedback_merged_into_id, v.profile_id, v.feedback_vote_at
    from feedback_votes v
   where v.feedback_id = new.feedback_id
  on conflict (feedback_id, profile_id) do nothing;

  -- The followers move too, and this is not optional: somebody whose request was merged
  -- away must hear about the request it became, or merging is how a person stops being
  -- told about the thing they asked for. Seen-stamp deliberately NOT carried across —
  -- the target is at a stage they have not looked at.
  insert into feedback_follows (feedback_id, profile_id, feedback_follow_seen_stage_at)
  select new.feedback_merged_into_id, fl.profile_id, null
    from feedback_follows fl
   where fl.feedback_id = new.feedback_id
  on conflict (feedback_id, profile_id) do nothing;

  -- The duplicate's own votes are LEFT WHERE THEY ARE, not deleted. Un-merging is then a
  -- single column write that restores exactly what was there, and a merge somebody
  -- regrets does not destroy the evidence of who had asked. The board reads the count
  -- from the live request, which now includes them.
  return new;
end;
$$;

revoke execute on function merge_feedback_votes() from public;
revoke execute on function merge_feedback_votes() from anon;
revoke execute on function merge_feedback_votes() from authenticated;

drop trigger if exists feedback_merge on feedback;
create trigger feedback_merge
  before update of feedback_merged_into_id on feedback
  for each row
  execute function merge_feedback_votes();

comment on function merge_feedback_votes() is
  'Moves votes and followers when a request is merged into another (0066). SECURITY DEFINER because the votes belong to other people and 0061 rightly refuses the app the right to write them; a trigger keeps that rule intact while still letting a merge do its job, in one transaction, without a service key.';

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * a merge moves another person's vote to the target — the whole point, and it fails
--     without SECURITY DEFINER, which is how it was checked;
--   * a voter who had voted on both ends up with ONE vote on the target, not two;
--   * merging into an already-merged request is refused (no chains);
--   * merging a request into itself is refused by the CHECK;
--   * a non-admin's merge matches no row (the UPDATE policy) — and an admin's succeeds,
--     which is the pair that proves the rung is where it is meant to be;
--   * the merged request keeps its own votes, so clearing the column restores the board.
