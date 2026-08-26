-- =============================================================================
-- 0046 — a project move carries its jobs forward with it
-- =============================================================================
-- Amber, 26 August:
--
--   "moving a stage in a project isn't moving the jobs... for example if the project
--    is moved to preconstruction then all the jobs should move to preconstruction.
--    also if all jobs have completed a stage then the project should move."
--
-- The second sentence is already built — 0041's jobs_keep_project_stage_in_step
-- moves the project up when its slowest live job passes it. This migration is the
-- first sentence: the OTHER direction. Moving a project forward now brings every job
-- that is BEHIND the new phase up to it.
--
-- WHO MOVES, WHO STAYS
--
--   - A job behind the project's new phase moves to it. That is the meaning of moving
--     the project: "this whole site is now in Pre-construction."
--   - A job already at or past the phase stays. The project catching up to its
--     forward jobs must not drag them backwards — forwards-only holds.
--   - Cancelled and Closed jobs stay. A cancelled job is exempt from everything but
--     revival and the archive clock (0045), and the archive is terminal.
--
-- WHY THE TWO DIRECTIONS DO NOT LOOP
--
--   Project moves forward → this trigger lifts the lagging jobs → each job update
--   fires 0041's refresh → the minimum of the live jobs now equals the project's
--   stage → 0041's clamp ("strictly ahead or nothing") writes nothing. One pass,
--   settled.
--
-- 0039 left inheritance un-triggered because Lofty's two rules could contradict each
-- other (a new job added behind an advanced project). That case is still resolved the
-- same way — the project does NOT fall back (0041 clamps upward only) — so this
-- trigger adds no third rule; it completes the pair Amber has now confirmed:
-- jobs pull the project up, the project pushes its jobs up. Nothing ever goes
-- backwards except a revival.
-- =============================================================================

create or replace function projects_cascade_stage_to_jobs()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.project_stage is distinct from old.project_stage
     -- A revival or an archive move on the project is its own affair; only a move
     -- onto the linear run pushes jobs. (Cancelled is position 7 and would otherwise
     -- read as "ahead of everything".)
     and new.project_stage not in ('Cancelled', 'Closed')
  then
    update jobs j
       set job_stage = new.project_stage
     where j.project_id = new.project_id
       and j.job_stage not in ('Cancelled', 'Closed')
       and lifecycle_position(j.job_stage) < lifecycle_position(new.project_stage);
  end if;

  return null;  -- AFTER trigger; the project row is already written.
end;
$$;

revoke execute on function projects_cascade_stage_to_jobs() from public;
revoke execute on function projects_cascade_stage_to_jobs() from anon;
revoke execute on function projects_cascade_stage_to_jobs() from authenticated;

comment on function projects_cascade_stage_to_jobs() is
  'Moving a project forward brings every job behind the new phase up to it — jobs already at or past it, cancelled or archived stay put. The other direction is 0041: the slowest live job pulls the project up. The pair cannot loop: after the cascade the minimum equals the project stage and 0041''s clamp writes nothing.';

drop trigger if exists projects_cascade_stage_to_jobs on projects;
create trigger projects_cascade_stage_to_jobs
  after update of project_stage on projects
  for each row execute function projects_cascade_stage_to_jobs();

-- ---------------------------------------------------------------------- proof
do $$
declare
  def text;
begin
  select pg_get_functiondef(oid) into strict def
  from pg_proc where proname = 'projects_cascade_stage_to_jobs';

  if def not like '%lifecycle_position(j.job_stage) < lifecycle_position(new.project_stage)%' then
    raise exception 'the cascade does not respect the forwards-only comparison';
  end if;
  if def not like '%not in (''Cancelled'', ''Closed'')%' then
    raise exception 'the cascade does not exempt cancelled and archived jobs';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'projects_cascade_stage_to_jobs' and tgrelid = 'projects'::regclass
  ) then
    raise exception 'the cascade trigger is not installed on projects';
  end if;

  raise notice 'ok  a project move carries its lagging jobs with it';
end $$;
