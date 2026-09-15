-- =============================================================================
-- 0107 — 64 jobs were living at somebody else's house
-- =============================================================================
-- Amber, 10 September: *"check against Brodie ave project as that has lots and a
-- street number and street number wasn't showing."*
--
-- Project 1002 is **14 Brodie Road, Reynella**. Its three jobs read:
--
--     1002-001    1 Brodie Road, Reynella, SA, 5161
--     1002-002    2 Brodie Road, Reynella, SA, 5161
--     1002-003    3 Brodie Road, Reynella, SA, 5161
--
-- Those are lots 1, 2 and 3 OF 14 Brodie Road. As written they are three different
-- houses, and 1, 2 and 3 Brodie Road belong to other people. This is `0034`'s bug
-- exactly — its header opens with the same shape at Corner Street — except `0034`
-- fixed the RENDERING and this is the DATA: the lot number is sitting in
-- `address_street_number`, `address_lot_number` is null, and the project's own street
-- number was never carried down.
--
-- It is not three rows. It is **64 of 79 jobs**, and the fingerprint is unmistakable
-- once the projects are listed beside their jobs:
--
--     1002   14 Brodie Road          jobs at 1, 2, 3
--     1003   2A Launceston Ave       jobs at 1, 2, 3
--     1004   27 Howard Street        jobs at 1, 2, 3, 4
--     1005   9 Riders Street         jobs at 1, 2, 3, 4
--     1006   83a Awoonga Road        jobs at 1 … 30
--     1007   2007 St clair ave       jobs at 1 … 16
--     1009   3 Ross Street           jobs at 1, 2, 3
--     1010   30 Luprena Avenue       jobs at 1, 2, 3
--
-- Every project's jobs run 1..n from 1. Thirty consecutive houses on Awoonga Road,
-- when the project is at 83a, is not a street numbering — it is a plan of division.
--
-- WHAT THIS DOES, AND HOW NARROW IT IS
--
--   For a job address that matches ALL of:
--     * no lot number at all
--     * a street number that is digits only
--     * on the SAME street as its project
--     * whose project HAS a street number
--     * and whose street number DIFFERS from the project's
--   move the number into the lot column and inherit the project's street number.
--
--   Every clause is load-bearing. "Same street" keeps a job that genuinely moved
--   elsewhere out of it; "project has a street number" avoids writing null over
--   something; "differs from the project's" leaves alone the one job already sitting at
--   its project's number; "digits only" leaves alone anything like "83a" or "42-44",
--   which `0106` established are real street numbers. 13 jobs already carry a real lot
--   number and are untouched.
--
--   Reversing it is the same statement with the two columns swapped and the street
--   number set back to null — the mapping is not lossy.
--
-- WHAT IT DOES NOT CLAIM
--
--   That every one of the 64 is a subdivision. A genuine infill where three separate
--   houses at 1, 2 and 3 were grouped under a project at 14 would be caught by this
--   too, and would be wrong. Nothing in the data distinguishes the two, and the 1..n
--   run starting at 1 in every single project is the reason this is judged the safer
--   reading: three houses that happen to be numbered 1, 2, 3 is possible, and eight
--   projects all of whose jobs happen to run from 1 is not.
--
--   The CODE bug behind it is already fixed: `splitProject` hard-coded
--   `address_street_number: null` on every job it created, and now inherits the
--   project's (or takes the one typed per lot).
-- =============================================================================

-- A NOTE ON THE GUARD BELOW, AND WHY IT IS NOT `if moved = 0 then raise`
--
--   It was, on the first draft, and `verify/replay.sh` caught it: replay rebuilds the
--   schema from nothing, so there are no jobs when this file runs there, nothing
--   matches, and a migration that is CORRECT reported a failure. Watched, at
--   `FAILED: 0107 … nothing matched`.
--
--   The condition worth stopping for is not "moved nothing", it is "left something
--   behind" — and that is exactly what the post-condition further down asserts, on
--   every run including the empty one. So the count is reported and not judged, the
--   whole statement is skipped when there are no jobs to judge it on, and the proof
--   moved to the assertion that can tell the two apart.
do $$
declare
  moved integer;
  jobs_here integer;
begin
  select count(*) into jobs_here from jobs;
  if jobs_here = 0 then
    raise notice '0107: no jobs in this database — a replay from empty. Nothing to move.';
    return;
  end if;

  with candidate as (
    select ja.address_id,
           ja.address_street_number::integer as lot,
           pa.address_street_number          as project_street_no
    from jobs j
    join projects  p  on p.project_id  = j.project_id
    join addresses ja on ja.address_id = j.job_current_address_id
    join addresses pa on pa.address_id = p.project_current_address_id
    where ja.address_lot_number is null
      and ja.address_street_number ~ '^\d+$'
      and ja.address_street_1 is not distinct from pa.address_street_1
      and pa.address_street_number is not null
      and ja.address_street_number is distinct from pa.address_street_number
  )
  update addresses a
     set address_lot_number    = c.lot,
         address_street_number = c.project_street_no
    from candidate c
   where a.address_id = c.address_id;

  get diagnostics moved = row_count;
  -- 64 when this was written and applied. A different number is not a failure — jobs
  -- may have been created or corrected since — and neither is zero, which is what a
  -- second run reads. The assertion below is what would notice a real miss.
  raise notice '0107: % job addresses moved their number from the street column to the lot column.', moved;
end $$;

-- =============================================================================
-- Prove the one Amber named.
-- =============================================================================
do $$
declare
  reads text;
begin
  -- Only when that job exists. It does on the live database, which is where this was
  -- run and watched; it does not on a replay from empty, and a named job number is not
  -- a thing a schema rebuild can be asked to produce.
  select ca.address_consolidated into reads
    from jobs j
    join addresses ca on ca.address_id = j.job_current_address_id
   where j.job_id = '1002-001';

  if reads is not null and reads is distinct from 'Lot 1, 14 Brodie Road, Reynella, SA, 5161' then
    raise exception '0107: 1002-001 reads "%" — expected "Lot 1, 14 Brodie Road, Reynella, SA, 5161"', reads;
  end if;

  -- And that no job is still numbered as a house on its project's own street.
  if exists (
    select 1
      from jobs j
      join projects  p  on p.project_id  = j.project_id
      join addresses ja on ja.address_id = j.job_current_address_id
      join addresses pa on pa.address_id = p.project_current_address_id
     where ja.address_lot_number is null
       and ja.address_street_number ~ '^\d+$'
       and ja.address_street_1 is not distinct from pa.address_street_1
       and pa.address_street_number is not null
       and ja.address_street_number is distinct from pa.address_street_number
  ) then
    raise exception '0107: a job still carries a lot number in its street-number column.';
  end if;

  raise notice '0107: 1002-001 now reads Lot 1, 14 Brodie Road, and none are left.';
end $$;
