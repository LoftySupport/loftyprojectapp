-- =============================================================================
-- 0134 — the person on a job, and the day it ended, are read from the work
--
-- Two of the four derivations Amber asked for on 14 September. The other two — the owning
-- team and the status — are not here, and the header says why at the end.
--
-- THE PERSON
--
--   *"Is the assignee a job field?"* — **No.** *"'currently with' is the task's assignee, not
--   the job's"*, chosen over *derived from the active process*, *set by hand within the
--   derived team* and *a system field*. And, when several tasks are open at once:
--   *"Whoever holds tasks in the active process"*, chosen over *earliest unfinished task
--   anywhere on the job*, *everyone with an open task* and *nobody until assigned*. She said
--   why that one: it is the only reading that cannot name somebody from a team that is not
--   on the job.
--
--   The active process is the one `0132` already computes: the earliest unfinished
--   non-optional job-scoped process of the sub-stage the job is up to. So "who is this
--   with" is one question asked of one place, not a second opinion.
--
--   **`jobs.job_assignee_id` stays a column and becomes its output**, the same shape `0132`
--   gave the stage and for the same reason: the Team filter matches through it, the board
--   groups on it, and `notification_recipients` reads it. A trigger keeps it in step.
--
-- THE DAY IT ENDED
--
--   *"Target completion and end date: derived or entered?"* — **target entered, end date
--   derived.** *"A person commits to the target, so a contracted handover date is not
--   overwritten by process maths; the end date is stamped when the work is actually done
--   rather than relying on somebody remembering to record it."*
--
--   So `job_end_date` is stamped the day the job's LAST required process closes — nothing
--   open anywhere, which is exactly what `job_derived_stage()` returning null already means.
--   **It is never cleared by the derivation.** A job that reopens work keeps the date it
--   finished on, because that is a fact about a day rather than a status; clearing it is a
--   person's act, and the column stays writable.
--
-- WHAT IS NOT HERE, AND WHY
--
--   **The owning team.** The derivation is decided — *"it defaults to the earliest
--   unfinished process in a jobs stage"* — but the override is not: Amber asked for a
--   request-and-release handshake (*"Override Active Team"*, the active team's manager
--   releases it or does not) and parked it into Automations to be refined. Deriving the
--   column now would silently take away the drop-down people use today, and building the
--   handshake here would be building Stage 4 inside Stage 3. It is question 0l.
--
--   **The status.** *"Derived, but a person can override it"*, with On hold as the case no
--   date maths produces. The override half is clear; the derivation half is not — and it
--   overlapped with health, which `0133` has now taken out of `job_status` entirely. What is
--   left for status to be computed FROM is a smaller question than it was on 14 September,
--   and it is worth asking again rather than guessing at.
-- =============================================================================
set lock_timeout = '5s';

-- ============================================================ who the job is with
create or replace function job_active_process(a_job text) returns uuid
language sql stable
set search_path = public, pg_temp
as $$
  select p.process_id
    from processes p
   where p.lifecycle_substage_id = job_open_substage(a_job)
     and p.process_is_active
     and not p.process_is_optional
     and p.process_scope = 'job'
     and not exists (
       select 1 from process_runs r
        where r.process_id = p.process_id and r.job_id = a_job
          and r.process_run_status in ('complete', 'not_applicable')
          and r.process_run_attempt = (
                select max(r2.process_run_attempt) from process_runs r2
                 where r2.process_id = p.process_id and r2.job_id = a_job))
   order by p.process_position, p.process_key
   limit 1;
$$;

comment on function job_active_process(text) is
  'The process a job is with (0134): the earliest unfinished non-optional job-scoped process of the sub-stage job_open_substage() says it is up to. Null when that sub-stage is finished, or the job is between stages. One question asked of one place — the owning team derivation will read the same function when its override is decided (question 0l).';

create or replace function job_derived_assignee(a_job text) returns uuid
language sql stable
set search_path = public, pg_temp
as $$
  -- Whoever holds tasks in the active process. Earliest open task first, so a job with three
  -- people on it names the one at the front rather than an arbitrary one.
  select t.task_assignee_id
    from tasks t
    join process_runs r on r.process_run_id = t.process_run_id
   where t.job_id = a_job
     and r.process_id = job_active_process(a_job)
     and t.task_assignee_id is not null
     and t.task_status not in ('done', 'cancelled')
   order by t.task_position, t.task_created_at
   limit 1;
$$;

comment on function job_derived_assignee(text) is
  'Who a job is currently with (0134): the assignee of the earliest open task in its active process. Null when nobody holds one, which is a real state the boards draw as an em dash rather than as a stand-in name. Amber, 14 September: "currently with" is the task''s assignee, not the job''s, and it is whoever holds tasks in the active process.';

-- ================================================================ the day it ended
create or replace function job_derived_end_date(a_job text) returns date
language sql stable
set search_path = public, pg_temp
as $$
  -- Nothing open anywhere is what job_derived_stage() returning null already means, so this
  -- asks the same question rather than a second one that could answer differently.
  select case when job_derived_stage(a_job) is null then current_date else null end;
$$;

comment on function job_derived_end_date(text) is
  'The day a job''s work finished (0134): today, when nothing required is open anywhere. Null otherwise, which the trigger reads as "not yet" rather than as "clear it" — a job that reopens work keeps the date it finished on, because that is a fact about a day.';

-- ========================================================= keeping the columns in step
create or replace function refresh_job_derivations(a_job text) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
declare who uuid; ended date; have_who uuid; have_end date; stage text;
begin
  select job_assignee_id, job_end_date, job_stage into have_who, have_end, stage
    from jobs where job_id = a_job;
  if stage is null then
    return;
  end if;

  who := job_derived_assignee(a_job);
  if who is distinct from have_who then
    update jobs set job_assignee_id = who where job_id = a_job;
  end if;

  -- Stamped once and never taken back. A cancelled job does not get one: it did not end,
  -- it stopped, and the two are different facts.
  if have_end is null and stage <> 'Cancelled' then
    ended := job_derived_end_date(a_job);
    if ended is not null then
      update jobs set job_end_date = ended where job_id = a_job;
    end if;
  end if;
end $$;

revoke execute on function refresh_job_derivations(text) from public, anon, authenticated;

comment on function refresh_job_derivations(text) is
  'Bring one job''s derived columns back in step (0134): who it is with, and the day it ended. Called after any change to a run or a task on that job. The end date is stamped once and never cleared here — clearing it is a person''s act.';

create or replace function process_runs_refresh_job()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare a_job text;
begin
  a_job := coalesce(new.job_id, old.job_id);
  if a_job is not null then
    perform refresh_job_derivations(a_job);
  end if;
  return coalesce(new, old);
end $$;

revoke execute on function process_runs_refresh_job() from public, anon, authenticated;

drop trigger if exists process_runs_refresh_job on process_runs;
create trigger process_runs_refresh_job
  after insert or update of process_run_status or delete on process_runs
  for each row execute function process_runs_refresh_job();

create or replace function tasks_refresh_job()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare a_job text;
begin
  a_job := coalesce(new.job_id, old.job_id);
  if a_job is not null then
    perform refresh_job_derivations(a_job);
  end if;
  return coalesce(new, old);
end $$;

revoke execute on function tasks_refresh_job() from public, anon, authenticated;

drop trigger if exists tasks_refresh_job on tasks;
create trigger tasks_refresh_job
  after insert or update of task_assignee_id, task_status or delete on tasks
  for each row execute function tasks_refresh_job();

comment on column jobs.job_assignee_id is
  'Who the job is currently with. Derived since 0134 from the earliest open task in its active process, and kept in step by triggers on tasks and process_runs. Null means nobody holds one — a real state the boards draw as an em dash, never as a stand-in name.';
comment on column jobs.job_end_date is
  'The day the job''s work finished. Derived since 0134: stamped the day nothing required is open anywhere, and never cleared by the derivation — a job that reopens work keeps the date it finished on. Clearing it is a person''s act, and the column stays writable.';

-- ========================================================================= the proof
do $$
declare a_job text; n integer;
begin
  select job_id into a_job from jobs
   where job_stage not in ('Completed', 'Closed', 'Cancelled') order by job_id limit 1;
  if a_job is null then
    raise notice '0134: no live job to prove against; the shape is checked and the behaviour is not.';
  else
    -- The active process is one of the job's own, and in the sub-stage it is up to.
    if job_active_process(a_job) is not null
       and (select p.lifecycle_substage_id from processes p where p.process_id = job_active_process(a_job))
           is distinct from job_open_substage(a_job) then
      raise exception '0134 proof: the active process is not in the sub-stage the job is up to';
    end if;

    -- The assignee the function computes is somebody who actually holds an open task on it.
    if job_derived_assignee(a_job) is not null
       and not exists (select 1 from tasks t where t.job_id = a_job
                        and t.task_assignee_id = job_derived_assignee(a_job)
                        and t.task_status not in ('done', 'cancelled')) then
      raise exception '0134 proof: the derived assignee holds no open task on the job';
    end if;

    -- And no job has been given an end date it did not earn.
    select count(*) into n from jobs j
     where j.job_end_date is not null
       and j.job_stage not in ('Completed', 'Closed', 'Cancelled')
       and job_derived_stage(j.job_id) is not null;
    if n > 0 then
      raise notice '0134: % live jobs carry an end date while work is still open. Those were entered by hand before this migration and are left alone — the derivation only ever stamps, never clears.', n;
    end if;

    raise notice '0134: the person and the end date are read from the work.';
  end if;
end $$;
