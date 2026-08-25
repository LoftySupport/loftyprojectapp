-- =============================================================================
-- 0041 — a project follows its slowest job, and only forwards
-- =============================================================================
-- 0039 left one thing open on purpose. Lofty had given two rules that can point in
-- opposite directions:
--
--   "the project inherits the lowest job phase"
--   "a project cannot move backwards"
--
-- and the note at the end of that migration said the tie-break was a business
-- decision, not a schema one, so `project_stage_from_jobs()` computed the answer and
-- stopped there.
--
-- Lofty, 25 August, asked which rule wins:
--
--   "never move backwards ... a project only moves stages when all its jobs have
--    moved up a lifecycle stage"
--
-- That is not a compromise between the two rules — it is the same rule stated from the
-- other side. "All its jobs have moved up" is exactly "the lowest job is now ahead of
-- the project". So the project's stage is the minimum of its jobs' stages, clamped so
-- it can only ever increase. Adding a job at Acquisition & Development to a project at
-- Construction lowers the minimum, the clamp refuses it, and the project stays put —
-- which is what the second rule always wanted.
--
-- With the tie-break decided, this CAN be a trigger, and it is.
--
-- WHO IS ALLOWED TO CAUSE THIS
--
--   0039 put `guard_project_stage_change()` on projects: manager or above. This writes
--   through that guard rather than around it, and it does not need a bypass, because
--   every path that can actually move a project already clears the same bar:
--
--     a job moved up      manager+, by 0038's guard on jobs.job_stage
--     a job added         cannot raise a minimum, so the clamp writes nothing at all
--     a job deleted       deleting a job is admin+ under RLS
--     a job re-parented   both projects are recomputed, both clamped
--
--   A `user` who somehow reached a forward-moving path is refused by the project guard,
--   with the message about manager permission — which is the correct answer, not a
--   surprise from a trigger.
-- =============================================================================

-- ------------------------------------------------ bring one project into step
create or replace function refresh_project_stage(p_project_id integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  lowest  text;
  current text;
begin
  if p_project_id is null then
    return;
  end if;

  lowest := project_stage_from_jobs(p_project_id);

  -- No jobs: there is nothing to inherit from, and that is different from being at the
  -- first phase. Leave whatever a person set.
  if lowest is null then
    return;
  end if;

  select p.project_stage into current from projects p where p.project_id = p_project_id;
  if current is null then
    return;
  end if;

  -- The clamp. Strictly ahead, or nothing happens — this single comparison is the whole
  -- of "a project only moves when all its jobs have moved up", and the whole of "never
  -- backwards".
  if lifecycle_position(lowest) > lifecycle_position(current) then
    update projects set project_stage = lowest where project_id = p_project_id;
  end if;
end;
$$;

revoke execute on function refresh_project_stage(integer) from public;
revoke execute on function refresh_project_stage(integer) from anon;
revoke execute on function refresh_project_stage(integer) from authenticated;

comment on function refresh_project_stage(integer) is
  'Moves a project up to its lowest job''s phase, and only up. Called by the trigger on jobs whenever a job''s stage or project changes. Writes nothing when the lowest job is level with or behind the project, which is how "a project only moves when all its jobs have moved up" and "never backwards" turn out to be the same sentence.';

-- ------------------------------------------------------------- the trigger
create or replace function jobs_refresh_project_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    -- Re-parented. The project it left may now have a higher minimum, and the one it
    -- joined may not — both get asked, both get clamped.
    perform refresh_project_stage(old.project_id);
    perform refresh_project_stage(new.project_id);
  elsif tg_op = 'DELETE' then
    perform refresh_project_stage(old.project_id);
  else
    perform refresh_project_stage(new.project_id);
  end if;

  return null;  -- AFTER trigger; the return value is not used.
end;
$$;

revoke execute on function jobs_refresh_project_stage() from public;
revoke execute on function jobs_refresh_project_stage() from anon;
revoke execute on function jobs_refresh_project_stage() from authenticated;

drop trigger if exists jobs_keep_project_stage_in_step on jobs;
create trigger jobs_keep_project_stage_in_step
  after insert or delete or update of job_stage, project_id on jobs
  for each row execute function jobs_refresh_project_stage();

-- --------------------------------------------------------- the note it replaces
-- 0039's comment said the tie-break was undecided. It is decided now, and a comment
-- that describes a question nobody is still asking is worse than no comment.
comment on function project_stage_from_jobs(integer) is
  'The lowest phase any of the project''s jobs is at. The trigger in 0041 moves the project up to it when it is ahead, and leaves the project alone when it is not — see refresh_project_stage().';
