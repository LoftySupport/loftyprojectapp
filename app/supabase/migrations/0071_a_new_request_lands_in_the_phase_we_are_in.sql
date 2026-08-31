-- 0071 — a new request lands in the phase we are in
--
-- Amber, 31 Aug: *"the roadmap phase should default to the highest phase (e.g. now is
-- phase 1)"*, and, asked which phase that means: **the phase we are in now**.
--
-- ================================================================================
-- "NOW" IS ASSERTED, NEVER READ OFF THE CALENDAR
--
--   The obvious implementation is `where current_date between starts_on and ends_on`.
--   It is wrong here, and 0063 already explains why in the column it created:
--   `roadmap_phase_status` is asserted precisely so that a phase whose end date has
--   passed does NOT silently become delivered. Deriving "now" from the dates would
--   reintroduce the exact inference that column exists to prevent — and it would break
--   the day a phase runs late, which is the day it matters.
--
--   So, in order:
--     1. the phase somebody has marked `in_progress` — the direct answer;
--     2. failing that, the earliest phase not yet `delivered` — what "now" means before
--        anybody has marked one, which is the state the roadmap starts in;
--     3. failing that, null — every phase is delivered, or there are none at all, and
--        the request stays unplanned rather than joining a phase that has finished.
--
--   Ordered by `roadmap_phase_position`, never by name: "Phase 10" sorts before
--   "Phase 2" as text, and the order is a column somebody set.
-- ================================================================================
--
-- ---------------------------------------------------------- why a trigger, not the app
-- The same argument 0065 makes for `follow_on_vote`. `feedback` is inserted by the report
-- form today; by an import, and by an admin filing on somebody's behalf (0070), tomorrow.
-- A default applied in the repository would hold for the first and silently not for the
-- others, and the failure would look like "some requests are unplanned for no reason".
--
-- It also closes a hole that has been open since 0052 and that nobody had cause to notice
-- while nothing read the column: the INSERT policy checks `is_active_user()` and the
-- reporter, and **an RLS policy cannot restrict which COLUMNS a row carries** — the
-- lesson 0018 paid for on `profiles.permission` and 0060 restated for `feedback_stage`.
-- So any signed-in person could have filed a request already planned into whichever phase
-- they liked. Below admin the phase is now decided here and whatever was sent is
-- discarded, which is the only place that rule can actually be enforced.
create or replace function default_feedback_phase()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_phase uuid;
begin
  select p.roadmap_phase_id into current_phase
    from roadmap_phases p
   where p.roadmap_phase_status = 'in_progress'
   order by p.roadmap_phase_position
   limit 1;

  if current_phase is null then
    select p.roadmap_phase_id into current_phase
      from roadmap_phases p
     where p.roadmap_phase_status <> 'delivered'
     order by p.roadmap_phase_position
     limit 1;
  end if;

  -- No JWT — a migration, a seed, the service role — takes the default and nothing else.
  -- Same stance as 0018, 0038 and 0060: a load must not be second-guessed about intent.
  if auth.uid() is null then
    if new.roadmap_phase_id is null then
      new.roadmap_phase_id := current_phase;
    end if;
    return new;
  end if;

  if current_permission() >= 'admin'::permission_level then
    -- Admin+ may aim a request at a phase as they file it: that is planning, and 0063
    -- already trusts them with `roadmap_phase_id` on UPDATE. Only fill in the blank.
    if new.roadmap_phase_id is null then
      new.roadmap_phase_id := current_phase;
    end if;
  else
    -- Below admin the answer is not theirs to give. Overwritten rather than rejected:
    -- a person filing a bug has done nothing wrong, and raising here would turn a
    -- crafted request into a broken form for everybody.
    new.roadmap_phase_id := current_phase;
  end if;

  return new;
end;
$$;

revoke execute on function default_feedback_phase() from public;
revoke execute on function default_feedback_phase() from anon;
revoke execute on function default_feedback_phase() from authenticated;

drop trigger if exists feedback_default_phase on feedback;
create trigger feedback_default_phase
  before insert on feedback
  for each row
  execute function default_feedback_phase();

comment on function default_feedback_phase() is
  'Lands a new request in the phase the build is in now (Amber, 31 Aug) — the phase marked in_progress, else the earliest not delivered, else none. "Now" is read from the asserted status and never from today''s date, because 0063 made that column asserted so a late phase does not read as delivered. Below admin the phase is decided here and whatever the client sent is discarded: RLS decides rows, never columns.';

-- ---------------------------------------------------------------------------- proof
-- To be watched failing before it is trusted:
--   * with a phase marked in_progress, a new request arrives carrying it;
--   * with none marked, it arrives carrying the earliest phase that is not delivered —
--     watched by marking the first delivered and seeing the default move to the second;
--   * with every phase delivered, it arrives unplanned rather than joining a finished
--     phase;
--   * with no phases at all, it arrives unplanned and nothing raises;
--   * a `user` sending a phase of their own choosing has it REPLACED by the current one,
--     which is the hole this closes — watched against a version without the else branch,
--     where the crafted value survived;
--   * an ADMIN sending a phase deliberately keeps it, because planning is their job.
