-- =============================================================================
-- 0102 — a Tasks board that crosses every job and project
-- =============================================================================
-- Amber: tasks are either system generated — a process running on a job or project,
-- assigned by the workflow when a stage or process changes — or typed in by a user,
-- assigned to themselves or their team. Both kinds already lived in `tasks` (0030,
-- 0078); nothing read them except one job or project at a time, inside `TasksPanel`.
--
-- The new board reads across every record at once — "my tasks" by default, a
-- manager's team on top, then all/overdue/due today/due this week — filtered and
-- sorted the way the Jobs board is. Amber's column list: task, status, job, stage,
-- process, due date, scheduled date, created by, assigned to, description. Two of
-- those did not exist to read:
--
--   SCHEDULED DATE
--     A task had only a due date — when it must be done by. Amber's list asks for a
--     second date, when it is planned to be worked. A plain nullable date beside
--     `task_due_date`, the same shape, editable the same way. It does not feed
--     `task_health`: health stays anchored to the due date, exactly as 0081 left it,
--     because nothing has asked for a different rule and this is not the migration to
--     invent one.
--
--   JOB, STAGE AND PROCESS, RESOLVED
--     `task_display` carried `job_id` and `project_id` as bare keys and nothing to
--     put on a card: no address, no project name, no stage, no process. A task
--     instantiated from a process run (0078) carried `process_run_id` and nothing
--     resolving it to the name a person reads on the Jobs board's process chip.
--     Joined here from `job_display` (the job's own resolved address and stage),
--     `projects` (name and stage, for a project-level task) and `process_runs` →
--     `processes` (name, for a system-generated task) — the same three joins
--     `process_run_display` already makes for the same reason.
--
-- `task_created_by_name` is added alongside for the same reason `task_assignee_name`
-- and `task_completed_by_name` already exist: a board with "created by" as a column
-- must not join `profiles` for itself.
-- =============================================================================

-- ---------------------------------------------------------- tasks: scheduled date
alter table tasks
  add column if not exists task_scheduled_date date;

comment on column tasks.task_scheduled_date is
  'When the task is planned to be worked, as distinct from task_due_date (when it must be done by). Nullable — most tasks have no plan yet. Does not feed task_health.';

-- ---------------------------------------------------------- task_display
-- Rebuilt (0081 created it) to resolve the record it sits on and the process that made
-- it, so the Tasks board's Job, Stage and Process columns are a read, not a fetch per row.
drop view if exists task_display;
create view task_display with (security_invoker = true) as
  select t.task_id, t.job_id, t.project_id, t.task_name, t.task_description, t.parent_task_id,
         t.task_position, t.task_owning_team, t.task_assignee_id, t.task_status, t.task_due_date,
         t.task_scheduled_date,
         t.task_completed_at, t.task_completed_by, t.task_is_external, t.process_run_id, t.process_task_id,
         t.task_started_at, t.task_expected_days, t.task_at_risk_lead_days,
         t.task_created_at, t.task_created_by, t.task_updated_at, t.task_updated_by,
         a.profile_full_name as task_assignee_name,
         f.profile_full_name as task_completed_by_name,
         c.profile_full_name as task_created_by_name,
         pr.process_id as task_process_id,
         p.process_name as task_process_name,
         coalesce(jd.job_current_address, pj.project_name) as task_record_name,
         coalesce(jd.job_stage, pj.project_stage) as task_record_stage,
         coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))         as task_due_effective,
         coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))
           - t.task_at_risk_lead_days                                                        as task_at_risk_date,
         case
           when t.task_status = 'done'      then 'done'
           when t.task_status = 'cancelled' then 'cancelled'
           when coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days)) is null
                                            then 'no_due_date'
           when current_date > coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))
                                            then 'overdue'
           when t.task_at_risk_lead_days is not null
                and current_date >= coalesce(t.task_due_date, (t.task_started_at::date + t.task_expected_days))
                                    - t.task_at_risk_lead_days
                                            then 'at_risk'
           else 'on_track'
         end as task_health,
         (select count(*) from task_checklist_items c2 where c2.task_id = t.task_id)::integer as task_checklist_total,
         (select count(*) from task_checklist_items c2 where c2.task_id = t.task_id and c2.task_checklist_item_is_done)::integer as task_checklist_done,
         (select count(*) from tasks s where s.parent_task_id = t.task_id)::integer as task_subtask_total,
         (select count(*) from tasks s where s.parent_task_id = t.task_id and s.task_status = 'done')::integer as task_subtask_done
  from tasks t
  left join profiles a on a.profile_id = t.task_assignee_id
  left join profiles f on f.profile_id = t.task_completed_by
  left join profiles c on c.profile_id = t.task_created_by
  left join process_runs pr on pr.process_run_id = t.process_run_id
  left join processes p on p.process_id = pr.process_id
  left join job_display jd on jd.job_id = t.job_id
  left join projects pj on pj.project_id = t.project_id;

comment on view task_display is
  'A task with its names, its counts and its derived dates (0081): due (typed, or start + expected days), at-risk (due − lead) and health — no_due_date · on_track · at_risk · overdue · done · cancelled — computed from today the way process_run_display does. Nothing here is stored. 0102 adds the scheduled date and resolves the record (name, stage) and the process (name) a task sits on, for the Tasks board.';

-- ---------------------------------------------------------------------- proof
do $$
declare
  probe_address uuid; probe_project integer; probe_job text; probe_task uuid; probe_run_task uuid;
  probe_process uuid; probe_run uuid;
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
  got_name text; got_stage text; got_process text; got_scheduled date;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0102', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type, project_name)
  values (probe_address, probe_address, 'residential', 'Probe project 0102') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'design') returning job_id into probe_job;

  -- A typed-in task: scheduled date round-trips, and the job's own address and stage
  -- are what the board should read — not the project's.
  insert into tasks (job_id, task_name, task_scheduled_date) values (probe_job, 'probe 0102', current_date + 3)
  returning task_id into probe_task;
  select task_record_name, task_record_stage, task_scheduled_date, task_process_name
    into got_name, got_stage, got_scheduled, got_process
    from task_display where task_id = probe_task;
  if got_name is distinct from (select job_current_address from job_display where job_id = probe_job) then
    raise exception '0102 proof: task_display resolved the wrong record name for a job task, got %', got_name;
  end if;
  if got_stage <> (select job_stage from jobs where job_id = probe_job) then
    raise exception '0102 proof: task_display resolved the wrong stage for a job task, got %', got_stage;
  end if;
  if got_scheduled <> current_date + 3 then
    raise exception '0102 proof: task_scheduled_date did not round-trip, got %', got_scheduled;
  end if;
  if got_process is not null then
    raise exception '0102 proof: a typed-in task resolved a process name, got %', got_process;
  end if;

  -- A system-generated task: process_run_id resolves to the process template's name.
  select process_id into probe_process from processes where process_scope = 'job' and process_is_active limit 1;
  if probe_process is not null then
    insert into process_runs (process_id, job_id) values (probe_process, probe_job) returning process_run_id into probe_run;
    insert into tasks (job_id, task_name, process_run_id) values (probe_job, 'probe run task 0102', probe_run)
    returning task_id into probe_run_task;
    if (select task_process_name from task_display where task_id = probe_run_task)
       <> (select process_name from processes where process_id = probe_process) then
      raise exception '0102 proof: task_display did not resolve the run''s process name';
    end if;
  end if;

  -- A project-level task reads the project's own name and stage, not a job's.
  delete from jobs where job_id = probe_job;
  insert into tasks (project_id, task_name) values (probe_project, 'probe project task 0102')
  returning task_id into probe_task;
  select task_record_name, task_record_stage into got_name, got_stage
    from task_display where task_id = probe_task;
  if got_name <> 'Probe project 0102' or got_stage <> (select project_stage from projects where project_id = probe_project) then
    raise exception '0102 proof: task_display did not resolve a project task to the project''s own name and stage, got % / %', got_name, got_stage;
  end if;

  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  delete from activity_audit where activity_audit_project_id = probe_project
     or (activity_audit_table = 'addresses' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_id' = probe_address::text);
  perform setval(seq, seq_last, seq_called);
end $$;
