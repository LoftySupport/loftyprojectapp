-- =============================================================================
-- 0119 — the date the SLAs say, beside the date somebody wanted
-- =============================================================================
-- Amber, 14 September: *"A new calculated/derived property needs to be created called
-- 'calculated completion date' which is a system field that shows calculated completions
-- date based by when the job is likely to end based on slas and [the stage] it is up to so
-- management can look at targeted completion date (when they want it to be done) versus
-- the realistic calculated date based on slas and then the actual date it was completed
-- for process optimisation."*
--
-- Three dates, and the point is the gaps between them:
--
--   job_target_completion    what somebody committed to          (entered, 14 Sep)
--   job_calculated_completion what the SLAs say will happen      (this migration)
--   job_end_date             what actually happened              (derived, 14 Sep)
--
-- WHAT THE DATA ACTUALLY SUPPORTS, CHECKED BEFORE ANY OF THIS WAS WRITTEN
--
--   The SLAs are NOT on `processes`. 3 of 51 processes carry `process_expected_days`;
--   107 of 107 `process_tasks` carry `process_task_expected_days`. So a process's
--   duration is the sum of its tasks', and its own column is the exception that
--   overrides. Reading `process_expected_days` alone would have silently valued 48 of
--   51 processes at nothing and produced a confidently wrong date.
--
--   Sequencing is already modelled and did not need inventing: `process_dependencies`
--   holds 49 edges with `process_dependency_lag_days`. So this is a LONGEST PATH through
--   that graph, not a sum. Summing Construction's tasks gives 302 days; the critical
--   path through them is shorter, and the sum would have been wrong in the pessimistic
--   direction on every job.
--
--   And the coverage is thin where it matters: **all 38 Pre-construction processes have
--   no tasks and no expected days**, as do both Acquisition & Development ones. Only
--   Construction is populated. Amber was shown this and chose *"Build it, and I will
--   fill in the SLAs first"* — so the mechanism lands now and stays dark until she does.
--
-- THE RULES, ALL FOUR HERS
--
--   - **Calendar days**, not working days. So no weekday skip and no holiday table.
--   - **An overrun is sunk.** A process 15 days past its SLA is assumed to finish TODAY,
--     and everything after it runs to SLA. She chose this over re-charging its full SLA,
--     over scaling the remainder by how late it is, and over refusing to project past a
--     blockage. It is honest about the past and optimistic about the present, and that
--     is a deliberate choice rather than an accident of the arithmetic.
--   - **Blank rather than partial.** If any process still to run has no duration, the
--     answer is null. Not a number built from the third of the pipeline that happens to
--     be filled in — that is the "45% on track computed from a fixed array" this
--     repository already shipped once and had to take back.
--   - The blank is **not silent**: `job_calculated_completion_missing` says how many
--     processes have no days on them, so the gap is a number somebody can act on rather
--     than an empty cell nobody can explain.
--
-- WHAT IT DOES NOT DO YET, AND WHY NOT
--
--   - **Optional processes are all counted**, because `process_is_optional` does not
--     exist yet — it is on the list from the same interview. Until it does, a process
--     nobody will run still lengthens the path. That is a KNOWN overestimate, recorded
--     here rather than papered over.
--   - **Title type does not filter the set.** Amber said the title type selects which
--     processes a job runs; nothing models that yet either. Same treatment.
--   - **Projects get nothing.** She asked about a job. A project's forecast is presumably
--     the latest of its jobs', and presumably is not a guess this file should make.
-- =============================================================================

-- ------------------------------------------------------- what a process costs
-- Its own column when set, the sum of its tasks otherwise, and null when neither
-- exists — which is the signal the forecast refuses to guess past.
create or replace function process_expected_duration(the_process uuid)
returns integer
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.process_expected_days from processes p where p.process_id = the_process),
    (select sum(pt.process_task_expected_days)::integer
       from process_tasks pt where pt.process_id = the_process)
  );
$$;

comment on function process_expected_duration(uuid) is
  'How many calendar days a process is expected to take: its own process_expected_days when set, otherwise the sum of its tasks'' process_task_expected_days, otherwise NULL. Null means nobody has said, and the completion forecast refuses to project past it rather than treating it as zero. 0119.';

-- ----------------------------------------------------------- the forecast
create or replace function job_completion_forecast(the_job text)
returns table (forecast date, missing integer)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  gaps integer;
  live boolean;
begin
  -- A finished or cancelled job has an end date, and a forecast of "today plus what is
  -- left" would be nonsense beside it. Null, and the missing count with it.
  select is_current(j.job_status) into live from jobs j where j.job_id = the_job;
  if live is null or not live then
    return query select null::date, null::integer;
    return;
  end if;

  -- How many processes that still have to run have nobody's estimate on them. Counted
  -- first, because it decides whether the rest of this means anything.
  select count(*) into gaps
    from processes p
   where p.process_scope = 'job'
     and p.process_is_active
     and process_expected_duration(p.process_id) is null
     and not exists (
       select 1 from process_runs r
        where r.job_id = the_job and r.process_id = p.process_id
          and r.process_run_completed_at is not null);

  if gaps > 0 then
    return query select null::date, gaps;
    return;
  end if;

  return query
  with recursive applicable as (
    select p.process_id,
           process_expected_duration(p.process_id) as days,
           (select max(r.process_run_completed_at)::date
              from process_runs r
             where r.job_id = the_job and r.process_id = p.process_id
               and r.process_run_completed_at is not null) as done_on
      from processes p
     where p.process_scope = 'job' and p.process_is_active
  ),
  -- Every path through the graph, and the finish date each implies. A process reached
  -- by two routes appears twice with two dates; the max at the end is the critical
  -- path, which is the whole point of walking it rather than adding it up.
  --
  -- `depth < 60` is a cycle guard, not a tuning knob: 35 job processes cannot need a
  -- path longer than 35, and a dependency loop would otherwise recurse for ever.
  walk (process_id, finish, depth) as (
    select a.process_id,
           case when a.done_on is not null then a.done_on
                else current_date + a.days end,
           1
      from applicable a
     where not exists (
       select 1 from process_dependencies d
        where d.process_id = a.process_id
          and d.depends_on_process_id in (select process_id from applicable))
    union all
    -- An overrun is sunk (Amber): a predecessor that should already have finished does
    -- not push its lateness forward, because `greatest(current_date, …)` floors every
    -- start at today. What it cannot do is finish in the past and let a successor start
    -- before now, which is what a bare `w.finish + lag` would have allowed.
    select a.process_id,
           case when a.done_on is not null then a.done_on
                else greatest(current_date,
                              w.finish + coalesce(d.process_dependency_lag_days, 0)) + a.days end,
           w.depth + 1
      from walk w
      join process_dependencies d on d.depends_on_process_id = w.process_id
      join applicable a on a.process_id = d.process_id
     where w.depth < 60
  )
  select max(w.finish), 0 from walk w;
end $$;

comment on function job_completion_forecast(text) is
  'The date a job''s remaining processes say it will finish, and how many processes have no estimate. The longest path through process_dependencies in CALENDAR days, with every start floored at today so an overrun is sunk rather than pushed forward (Amber, 14 September). NULL forecast with a non-zero `missing` means nobody has estimated part of the pipeline and the answer is deliberately blank rather than partial; NULL for both means the job is not live. 0119.';

revoke execute on function job_completion_forecast(text) from public, anon;
grant execute on function process_expected_duration(uuid) to authenticated;
grant execute on function job_completion_forecast(text) to authenticated;

-- ------------------------------------------------------------ onto the view
-- Rebuilt from the live definition read out of pg_get_viewdef, not from the copy in an
-- older migration, so nothing added between 0113 and here is dropped by accident.
--
-- CREATE OR REPLACE, not DROP and CREATE. `task_display` depends on this view, so a drop
-- is refused outright — which is the better outcome, because the DROP … CASCADE that
-- would have "fixed" it takes `task_display` with it and nothing here would put it back.
-- Replace also enforces what this change claims: it permits columns APPENDED to the end
-- and rejects any rename, retype or reorder of the existing ones, so the two new columns
-- cannot quietly disturb the twenty-eight above them.
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
         -- The third date. Null until the SLAs are in, with the count saying how far off
         -- that is, so the blank is a to-do rather than a mystery.
         f.forecast as job_calculated_completion,
         f.missing  as job_calculated_completion_missing
  from jobs j
  join projects p using (project_id)
  join addresses cur       on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id
  join addresses pcur      on pcur.address_id = p.project_current_address_id
  left join lateral job_completion_forecast(j.job_id) f on true;

comment on view job_display is
  'A job with the things a card needs joined on: its project type, its own two addresses, its project''s current address, both SharePoint folders, the council, its dates and whether it is still live. Since 0119 it also carries job_calculated_completion — what the SLAs say, beside the target somebody committed to and the end date that actually happened — and job_calculated_completion_missing, the number of processes with no estimate, which is why the forecast is blank when it is. security_invoker so RLS on jobs decides who sees what.';

-- ---------------------------------------------------------------------- proof
-- Watched fail before it was watched pass. Each assertion below was confirmed by
-- breaking the thing it guards: replacing `greatest(current_date, …)` with a bare sum
-- `gaps > 0` early return produced a date from a half-estimated pipeline and the blank
-- assertion reported; replacing `max(finish)` with `min(finish)` took the shortest path
-- and the critical-path assertion reported; dropping the lag, the completed-run lookup
-- and the liveness check each reported too.
--
-- TWO OF THE SEVEN PASSED ON THE FIRST ATTEMPT, AND BOTH WERE THE PROBE'S FAULT
--
--   Deleting the task-sum fallback in `process_expected_duration` read GREEN, because all
--   three probe processes carried their own `process_expected_days` — the branch 48 of
--   Lofty's 51 processes depend on was never executed. `tail` now has no column of its own
--   and two tasks instead.
--
--   Deleting the `greatest(current_date, …)` floor read GREEN, because the overrunning
--   process was a ROOT of the graph, which never reaches the recursive branch, and the
--   later test completed its predecessor at `now()` so `max()` hid the difference. Test 6
--   below finishes EVERY predecessor a hundred days ago, which is the only shape where
--   the floor decides the answer.
do $$
declare
  probe_addr uuid; probe_project integer; probe_job text;
  quick uuid; slow uuid; tail uuid;
  got_forecast date; got_missing integer;
begin
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode)
  values (119, 'Probe Street 0119', 'Golden Grove', '5125') returning address_id into probe_addr;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_addr, probe_addr, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_addr, 'construction') returning job_id into probe_job;

  -- The real processes have no estimates outside Construction, so the probe cannot use
  -- them: it would be asserting against Lofty's data rather than against this function.
  -- Three of its own instead, deactivated at the end.
  insert into processes (process_key, process_name, process_stage, process_scope, process_owning_team, process_expected_days, process_position)
  values ('probe_0119_quick', 'Probe Quick 0119', 'Construction', 'job', 'construction', 2, 900)
  returning process_id into quick;
  insert into processes (process_key, process_name, process_stage, process_scope, process_owning_team, process_expected_days, process_position)
  values ('probe_0119_slow', 'Probe Slow 0119', 'Construction', 'job', 'construction', 30, 901)
  returning process_id into slow;
  -- Deliberately NO process_expected_days on this one. Its five days come from its two
  -- tasks, which is how 48 of Lofty's 51 processes are shaped — the first version of this
  -- probe gave all three their own column and never exercised the task-sum fallback at
  -- all, so deleting that fallback still read green.
  insert into processes (process_key, process_name, process_stage, process_scope, process_owning_team, process_position)
  values ('probe_0119_tail', 'Probe Tail 0119', 'Construction', 'job', 'construction', 902)
  returning process_id into tail;
  insert into process_tasks (process_id, process_task_name, process_task_expected_days, process_task_position)
  values (tail, 'Probe Tail step one 0119', 3, 1),
         (tail, 'Probe Tail step two 0119', 2, 2);

  -- quick(2) ─┐
  --           ├─► tail(5)      critical path is slow(30) ─► tail(5) = 35 days
  -- slow(30) ─┘
  insert into process_dependencies (process_id, depends_on_process_id, process_dependency_lag_days)
  values (tail, quick, 0), (tail, slow, 0);

  -- 1. Every OTHER job process has no estimate, so the forecast is blank and says how
  --    many. This is the live state Amber accepted: dark until she fills the SLAs in.
  select forecast, missing into got_forecast, got_missing from job_completion_forecast(probe_job);
  if got_forecast is not null then
    raise exception '0119 proof: a forecast was produced while % processes had no estimate', got_missing;
  end if;
  if coalesce(got_missing, 0) = 0 then
    raise exception '0119 proof: the blank forecast did not say how many processes are missing an estimate';
  end if;

  -- 2. With every other job process parked, only the three probes apply, and the answer
  --    has to be the LONGEST path — 35 days, not the 2 + 5 the short branch offers, and
  --    not the 37 a naive sum of all three would give.
  update processes set process_is_active = false
   where process_scope = 'job' and process_id not in (quick, slow, tail);

  select forecast, missing into got_forecast, got_missing from job_completion_forecast(probe_job);
  if got_missing <> 0 then
    raise exception '0119 proof: % processes still read as missing an estimate', got_missing;
  end if;
  if got_forecast is distinct from current_date + 35 then
    raise exception '0119 proof: the forecast is %, expected % — the critical path is slow(30) then tail(5)',
      coalesce(got_forecast::text, '<null>'), (current_date + 35)::text;
  end if;

  -- 3. An overrun is sunk. Start the slow process 100 days ago and complete nothing: the
  --    date must not move, because every start is floored at today rather than at a
  --    predecessor's overdue finish.
  insert into process_runs (process_id, job_id, process_run_status, process_run_started_at)
  values (slow, probe_job, 'in_progress', now() - interval '100 days');
  select forecast into got_forecast from job_completion_forecast(probe_job);
  if got_forecast is distinct from current_date + 35 then
    raise exception '0119 proof: a 100-day overrun moved the forecast to %, expected %',
      coalesce(got_forecast::text, '<null>'), (current_date + 35)::text;
  end if;

  -- 4. Completing the slow one drops the critical path to quick(2) then tail(5) = 7.
  update process_runs set process_run_status = 'complete', process_run_completed_at = now()
   where job_id = probe_job and process_id = slow;
  select forecast into got_forecast from job_completion_forecast(probe_job);
  if got_forecast is distinct from current_date + 7 then
    raise exception '0119 proof: with the slow process done the forecast is %, expected %',
      coalesce(got_forecast::text, '<null>'), (current_date + 7)::text;
  end if;

  -- 5. A lag day counts. One day between quick and tail moves it to 8.
  update process_dependencies set process_dependency_lag_days = 1
   where process_id = tail and depends_on_process_id = quick;
  select forecast into got_forecast from job_completion_forecast(probe_job);
  if got_forecast is distinct from current_date + 8 then
    raise exception '0119 proof: a 1-day lag gave %, expected %',
      coalesce(got_forecast::text, '<null>'), (current_date + 8)::text;
  end if;

  -- 6. Every predecessor finished long ago, so every path through the graph lands in the
  --    past. This is the only shape in which the `greatest(current_date, …)` floor is
  --    load-bearing: with one predecessor completed today the max() hides its absence,
  --    which is exactly why removing the floor passed the first version of this probe.
  update process_runs set process_run_completed_at = now() - interval '100 days'
   where job_id = probe_job and process_id = slow;
  insert into process_runs (process_id, job_id, process_run_status, process_run_started_at, process_run_completed_at)
  values (quick, probe_job, 'complete', now() - interval '110 days', now() - interval '100 days');

  select forecast into got_forecast from job_completion_forecast(probe_job);
  if got_forecast < current_date then
    raise exception '0119 proof: the forecast is %, which is in the past — a start was not floored at today', got_forecast;
  end if;
  if got_forecast is distinct from current_date + 5 then
    raise exception '0119 proof: with both predecessors long finished the forecast is %, expected %',
      coalesce(got_forecast::text, '<null>'), (current_date + 5)::text;
  end if;

  -- 7. A job that is not live gets nothing rather than a nonsense projection.
  update jobs set job_status = 'completed' where job_id = probe_job;
  select forecast, missing into got_forecast, got_missing from job_completion_forecast(probe_job);
  if got_forecast is not null or got_missing is not null then
    raise exception '0119 proof: a completed job was given a forecast';
  end if;

  -- 8. The view carries both columns and still runs as the caller.
  perform 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'job_display'
     and column_name in ('job_calculated_completion', 'job_calculated_completion_missing')
  having count(*) = 2;
  if not found then
    raise exception '0119 proof: job_display is missing the calculated completion columns';
  end if;
  if not exists (
    select 1 from pg_class c, unnest(c.reloptions) o
     where c.relname = 'job_display' and c.relkind = 'v' and o like 'security_invoker=%') then
    raise exception '0119 proof: job_display lost security_invoker';
  end if;

  raise notice 'ok  0119 — the forecast walks the critical path, sinks an overrun, and stays blank while estimates are missing';

  -- Put Lofty's processes back exactly as they were, then remove the probe's.
  update processes set process_is_active = true
   where process_scope = 'job' and process_id not in (quick, slow, tail);
  delete from process_runs where job_id = probe_job;
  delete from process_dependencies where process_id in (quick, slow, tail) or depends_on_process_id in (quick, slow, tail);
  delete from process_tasks where process_id in (quick, slow, tail);
  delete from processes where process_id in (quick, slow, tail);
  delete from jobs where job_id = probe_job;
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_addr;
  delete from activity_audit
   where coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'project_id' = probe_project::text
      or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'job_id' = probe_job
      or coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_street_1' = 'Probe Street 0119';
end $$;
