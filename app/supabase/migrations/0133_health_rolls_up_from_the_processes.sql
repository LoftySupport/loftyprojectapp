-- =============================================================================
-- 0133 — health rolls up: process → sub-stage → stage → job
--
-- `process_run_display.process_run_health` has answered "is this process in trouble" since
-- `0047`. Nothing above it had an answer at all: a sub-stage had none, a stage had none, and
-- a job's card showed `job_status`, which is what somebody typed rather than what the work
-- says. Amber, 15 September, answering question 8's second half:
--
--   *"The job's target completion date has passed"* — chosen over *any process on it is
--   overdue* and *nothing does* — and, for the roll-up: a process is at risk or overdue
--   against its own SLA (unchanged); **a sub-stage and a stage take the worst health of their
--   open required processes**; the **job** is at risk when any open required process is at
--   risk or overdue, and **overdue** when `job_target_completion` is in the past and the job
--   is not complete. A job with no target is never overdue, only at risk.
--
-- WHAT "WORST" MEANS, AND WHAT IT DELIBERATELY DOES NOT
--
--   Overdue beats at risk beats on track — her three words, in her order. The other things
--   `process_run_health` can say are **not** ranked above on track, and that is the
--   conservative reading rather than an omission: `not_started` and `no_expectation` mean
--   nobody has measured this yet, and a stage is not in trouble because somebody has not
--   filled in an SLA. They contribute nothing, so a sub-stage whose only open process has no
--   expectation reads `no_expectation` rather than `on_track` — the difference between "fine"
--   and "nobody has said", which this repository refuses to collapse.
--
-- WHAT COUNTS AS OPEN, AND AS REQUIRED
--
--   The same test `0132` uses, and for the same reason: one definition, read by everything,
--   so the board and the record cannot disagree. Open is "the latest attempt is neither
--   complete nor not applicable, or there is no attempt". Required is `not
--   process_is_optional`. A process with no attempt has no `process_run_display` row and so
--   no health at all; it is open, and it contributes nothing to the worst.
--
-- WHAT THIS MIGRATION DOES NOT DO
--
--   **The record's pill still reads `job_status`.** Amber's answer says it stops, and it
--   will — in the migration that makes `job_status` the pinnable *On hold* override. Doing
--   half of that split here would leave a screen showing health in one place and a typed
--   status in another, both labelled the same. `job_health` is exposed and read; nothing is
--   rewired to it yet.
--
--   **A project has no health here.** It follows its slowest job for its stage (`0041`), and
--   whether it follows the worst for health is a question nobody has been asked.
-- =============================================================================
set lock_timeout = '5s';

-- ============================================================ the order of badness
create or replace function private.health_rank(a_health text) returns integer
language sql immutable
set search_path = public, pg_temp
as $$
  select case a_health
           when 'overdue' then 3
           when 'at_risk' then 2
           when 'on_track' then 1
           else 0                     -- not_started, no_expectation, complete, not_applicable
         end;
$$;

comment on function private.health_rank(text) is
  'How bad one health value is (0133): overdue 3, at risk 2, on track 1, everything else 0. The rest are not ranked above on track on purpose — not_started and no_expectation mean nobody has measured this, and a stage is not in trouble because somebody has not filled in an SLA.';

revoke execute on function private.health_rank(text) from public, anon, authenticated;

create or replace function private.worst_health(a_ranks integer[]) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select case (select max(r) from unnest(a_ranks) r)
           when 3 then 'overdue'
           when 2 then 'at_risk'
           when 1 then 'on_track'
           else null                  -- nothing open, or nothing measurable
         end;
$$;

comment on function private.worst_health(integer[]) is
  'The worst of a set of health ranks, back as a word (0133). Null when nothing open is measurable, which the views render as no_expectation rather than as on_track: "nobody has said" is not "fine".';

revoke execute on function private.worst_health(integer[]) from public, anon, authenticated;

-- =================================================== a sub-stage's health, per job
create or replace view job_substage_health with (security_invoker = true) as
  with open_required as (
    select j.job_id,
           s.lifecycle_substage_id,
           s.lifecycle_substage_name,
           st.lifecycle_stage_name,
           st.lifecycle_stage_position,
           s.lifecycle_substage_position,
           p.process_id,
           -- The latest attempt's health, or null where there is no attempt.
           (select d.process_run_health
              from process_run_display d
             where d.process_id = p.process_id and d.job_id = j.job_id
             order by d.process_run_attempt desc limit 1) as health
      from jobs j
      cross join lifecycle_substages s
      join lifecycle_stages st on st.lifecycle_stage_id = s.lifecycle_stage_id
      join processes p on p.lifecycle_substage_id = s.lifecycle_substage_id
     where s.lifecycle_substage_is_active
       and p.process_is_active
       and not p.process_is_optional
       and p.process_scope = 'job'
       and private.substage_is_open(s.lifecycle_substage_id, j.job_id)
       and not exists (
         select 1 from process_runs r
          where r.process_id = p.process_id and r.job_id = j.job_id
            and r.process_run_status in ('complete', 'not_applicable')
            and r.process_run_attempt = (
                  select max(r2.process_run_attempt) from process_runs r2
                   where r2.process_id = p.process_id and r2.job_id = j.job_id))
  )
  select job_id,
         lifecycle_substage_id                                as substage_id,
         lifecycle_substage_name                              as substage_name,
         lifecycle_stage_name                                 as stage,
         lifecycle_stage_position                             as stage_position,
         lifecycle_substage_position                          as substage_position,
         count(*)::integer                                    as processes_open,
         coalesce(private.worst_health(array_agg(private.health_rank(health))), 'no_expectation')
                                                              as substage_health
    from open_required
   group by job_id, lifecycle_substage_id, lifecycle_substage_name,
            lifecycle_stage_name, lifecycle_stage_position, lifecycle_substage_position;

comment on view job_substage_health is
  'The health of every sub-stage that still holds work for a job (0133): the worst of its open required processes. A sub-stage with nothing open is not a row here — it is finished, and finished is not a health.';

-- ======================================================= a stage's health, per job
create or replace view job_stage_health with (security_invoker = true) as
  select job_id,
         stage,
         stage_position,
         sum(processes_open)::integer as processes_open,
         coalesce(private.worst_health(array_agg(private.health_rank(substage_health))), 'no_expectation')
           as stage_health
    from job_substage_health
   group by job_id, stage, stage_position;

comment on view job_stage_health is
  'The health of every stage that still holds work for a job (0133): the worst of its sub-stages. Reads job_substage_health rather than the processes again, so the two levels cannot drift apart.';

-- ========================================================== and the job's own health
create or replace function job_health(a_job text) returns text
language sql stable
set search_path = public, pg_temp
as $$
  select case
    -- A job that has stopped has no health. Amber, 26 August, on cancelled: nothing fires
    -- while cancelled. Completed and Closed are the same case for the opposite reason.
    when (select j.job_stage from jobs j where j.job_id = a_job)
         in ('Completed', 'Closed', 'Cancelled') then 'not_tracked'
    -- Overdue first, because it is the one about the promise rather than the work: the
    -- target completion date has passed. A job with no target is never overdue.
    when (select j.job_target_completion from jobs j where j.job_id = a_job) < current_date
      then 'overdue'
    -- Then at risk, when any open required process is at risk or overdue. A process merely
    -- inside its lead days does turn the job: that is what at risk means on the process, and
    -- the 12 September reading that only an overdue run turns the job was about OVERDUE.
    when exists (
      select 1 from job_stage_health h
       where h.job_id = a_job and h.stage_health in ('at_risk', 'overdue')) then 'at_risk'
    when exists (select 1 from job_stage_health h where h.job_id = a_job) then 'on_track'
    else 'no_expectation'
  end;
$$;

comment on function job_health(text) is
  'A job''s health (0133): not_tracked once it has stopped; overdue when its target completion date has passed; at risk when any open required process is at risk or overdue; on track otherwise. A job with no target is never overdue, only at risk — Amber, 15 September. no_expectation means nothing is open anywhere, which is not the same as being finished.';

-- job_display gains it, appended, for the reason 0119 wrote down: replace permits columns
-- added to the end and rejects a rename, a retype or a reorder of the ones above.
create or replace view job_display with (security_invoker = true) as
  select j.job_id,
         j.project_id,
         j.job_sequence,
         j.job_number_old,
         j.job_original_address_id,
         j.job_current_address_id,
         j.job_created_at,
         j.job_created_by,
         j.job_updated_at,
         j.job_updated_by,
         p.project_type,
         j.job_status,
         is_current(j.job_status) as job_is_current,
         j.job_stage,
         j.job_stage_entered_at,
         j.job_owning_team,
         j.job_engaged_teams,
         j.job_assignee_id,
         j.job_sharepoint_url,
         cur.address_consolidated  as job_current_address,
         orig.address_consolidated as job_original_address,
         cur.address_suburb        as job_suburb,
         pcur.address_consolidated as project_current_address,
         p.project_sharepoint_url,
         j.job_title_type,
         cur.address_council       as job_council,
         j.job_target_completion,
         j.job_end_date,
         f.forecast as job_calculated_completion,
         f.missing  as job_calculated_completion_missing,
         sub.lifecycle_substage_id   as job_substage_id,
         sub.lifecycle_substage_name as job_substage_name,
         j.job_stage_pinned_at,
         j.job_stage_pinned_by,
         j.job_stage_pin_reason,
         -- 0133. Derived on read, like the sub-stage above it. The record's pill does not
         -- read this yet: that happens when job_status becomes the On hold pin.
         job_health(j.job_id) as job_health
  from jobs j
  join projects p using (project_id)
  join addresses cur       on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id
  join addresses pcur      on pcur.address_id = p.project_current_address_id
  left join lateral job_completion_forecast(j.job_id) f(forecast, missing) on true
  left join lifecycle_substages sub on sub.lifecycle_substage_id = job_open_substage(j.job_id);

-- ========================================================================= the proof
do $$
declare a_job text; h text; n integer; was_target date;
begin
  select job_id, job_target_completion into a_job, was_target
    from jobs where job_stage not in ('Completed', 'Closed', 'Cancelled')
   order by job_id limit 1;
  if a_job is null then
    raise notice '0133: no live job to prove against; the shape is checked and the behaviour is not.';
  else
    -- The view and the function agree. Two readings of one rule that can drift is the thing
    -- this repository keeps finding, so they are compared rather than assumed.
    select job_health into h from job_display where job_id = a_job;
    if h is distinct from job_health(a_job) then
      raise exception '0133 proof: job_display and job_health() disagree about %', a_job;
    end if;

    -- A stage is never healthier than its worst sub-stage.
    select count(*) into n
      from job_stage_health g
      join job_substage_health s on s.job_id = g.job_id and s.stage = g.stage
     where private.health_rank(g.stage_health) < private.health_rank(s.substage_health);
    if n > 0 then
      raise exception '0133 proof: % stages read healthier than a sub-stage inside them', n;
    end if;

    -- And a job with a target completion date in the past is overdue, whatever its processes
    -- say. Proved on a real job rather than asserted, and put back to the value it had —
    -- `was_target` was read above, because restoring to null would quietly clear a date
    -- somebody committed to. Nothing else in this migration writes to a table.
    update jobs set job_target_completion = current_date - 1 where job_id = a_job;
    if job_health(a_job) <> 'overdue' then
      raise exception '0133 proof: a job past its target completion reads % rather than overdue', job_health(a_job);
    end if;
    update jobs set job_target_completion = null where job_id = a_job;
    if job_health(a_job) = 'overdue' then
      raise exception '0133 proof: a job with no target completion reads overdue';
    end if;
    update jobs set job_target_completion = was_target where job_id = a_job;
    if (select job_target_completion from jobs where job_id = a_job) is distinct from was_target then
      raise exception '0133 proof: the probe did not put the target completion date back';
    end if;

    raise notice '0133: health rolls up from the processes.';
  end if;
end $$;
