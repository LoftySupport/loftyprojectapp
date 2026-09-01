-- =============================================================================
-- 0078 — processes: what happens inside a lifecycle stage, as rows
-- =============================================================================
-- Agreed with Amber on 24 August (schema-plan.md, "Processes replace the nested
-- pipelines") and given its content on 1 September with the processes workbook: fifty
-- processes across the lifecycle, each pinned to a stage, each Project or Job, and for
-- the seven Construction processes the task list beneath — 107 scheduled tasks with
-- team, days and predecessors.
--
-- THE SHAPE IS THE PROPERTIES PATTERN APPLIED TWICE — definition, then instance
--
--   processes            what a process IS: name, stage, level, team, how long
--   process_dependencies what has to finish before it can start (the graph)
--   process_properties   which properties it collects, and which must be recorded
--                        before it counts as complete
--   process_tasks        the checklist it instantiates (the Construction schedule)
--   process_task_dependencies   the order of those tasks, with lag
--   process_runs         one process, on one record, one attempt
--
-- PROCESSES NEVER STORE DATA. PROPERTIES DO.
--
--   A process says when a fact is collected, by whom and how long it should take —
--   never the value. So the export shape is unchanged at (record, property, value),
--   and the process layer has no consequences for sync.
--
-- A RUN, NOT A POSITION
--
--   A job holds many processes at once — Fencing can be at "registered mail collected"
--   while Retaining is unanswered — so a process is not a column a job sits in. It is a
--   row per (record, process, attempt). The attempt number is what makes "how many times
--   did this repeat, and how long did each pass take" answerable at all: an amendment
--   writes a second row rather than overwriting the first.
--
-- WHAT IS DERIVED, AND WHAT IS NOT
--
--   due       = started + expected days            (the SLA anchors on the start —
--   at-risk   = due − lead                          Amber, 24 August)
--   health    = not started | on track | at risk | overdue | complete | n/a
--
--   all in the view, none stored, so re-timing a process re-dates every open run at
--   once. "Ready to advance" is shown, never acted on: no auto-advance of the lifecycle
--   (agreed 24 August), because an amendment would drag the job backwards and forwards.
--
-- WHY THE LIFECYCLE PIPELINE STAYS
--
--   The 24 August note said this deletes `pipelines` and `pipeline_stages`. It does
--   not, yet: the lifecycle itself is a `pipelines` row, its SLA editor reads
--   `pipeline_stages`, and `verify/seeds.sh` proves the app's stage list against it.
--   What goes is the IDEA of nesting pipelines inside it — no child pipeline is ever
--   seeded, and processes take that role. Removing the two tables is its own change once
--   the lifecycle has another home.
--
-- WHO EDITS
--
--   Managers and above define processes (Amber, 1 Sep: "editable in the app by managers,
--   admin and super admin"). Running one — starting, completing, marking not applicable —
--   is ordinary work at `user`. Deleting a run is admin's.
-- =============================================================================

-- ==================================================================== processes
create table if not exists processes (
  process_id            uuid primary key default gen_random_uuid(),
  process_key           text not null unique
    constraint processes_key_is_a_slug check (process_key ~ '^[a-z][a-z0-9_]*$'),
  process_name          text not null check (length(trim(process_name)) > 0),

  -- The lifecycle stage this process belongs to. The same seven words as jobs and
  -- projects, enforced the same way — the lifecycle is the shared vocabulary.
  process_stage         text not null
    constraint processes_stage_is_a_lifecycle_stage
    check (process_stage in ('Acquisition & Development', 'Pre-construction', 'Construction',
                             'Maintenance', 'Completed', 'Closed', 'Cancelled')),
  -- The workbook groups pre-construction processes into "Stage 1", "Stage 2",
  -- "Stage 3" and "Variation". Free text: it is a heading on a board, not a rule.
  process_stage_group   text,

  -- Runs on a project or on a job — the workbook's "Type" column.
  process_scope         text not null
    constraint processes_scope_is_project_or_job check (process_scope in ('project', 'job')),

  process_owning_team   text references teams (team_id) on update cascade,

  -- What "on time" means. Nullable: the workbook gives no duration for any process,
  -- and a made-up one would be worse than none. The at-risk lead hangs off it the
  -- way 0047's does on a stage.
  process_expected_days      smallint
    constraint processes_expected_days_are_positive check (process_expected_days > 0),
  process_at_risk_lead_days  smallint
    constraint processes_at_risk_lead_is_positive check (process_at_risk_lead_days > 0),
  constraint processes_at_risk_lead_fits_the_expectation
    check (process_at_risk_lead_days is null
           or (process_expected_days is not null
               and process_at_risk_lead_days < process_expected_days)),

  -- A boolean, never a percentage (agreed 24 August): "4 of 7 milestones passed" is
  -- true; "68% complete" implies a weighting that does not exist.
  process_is_milestone  boolean not null default false,
  -- Council, SA Water, the EER consultant — late is not the owning team's fault.
  process_is_external   boolean not null default false,

  process_position      smallint not null default 0,
  process_is_active     boolean not null default true,
  process_description   text,
  -- How this process will run itself, when it does — a note today, a hook tomorrow.
  process_automation    text,
  -- The subfolder inside the record's SharePoint folder where this process's documents
  -- live. A name, not a URL: the record already holds the folder (0040).
  process_sharepoint_folder text,
  process_import_ref    text,

  process_created_at timestamptz not null default now(),
  process_created_by uuid references profiles (profile_id),
  process_updated_at timestamptz not null default now(),
  process_updated_by uuid references profiles (profile_id)
);

create index if not exists processes_stage_idx on processes (process_stage, process_position);

comment on table processes is
  'What happens inside a lifecycle stage, as rows: a named piece of work pinned to a stage, run on a project or a job, with a team, an expected duration and the properties it collects. Replaces the idea of nesting pipelines inside pipelines — a job holds many processes at once, which one position never could. Never stores a value: properties do that. Managers and above edit; the workbook of 1 September is the seed.';
comment on column processes.process_stage_group is 'The workbook''s grouping inside a stage — "Stage 1", "Stage 2", "Stage 3", "Variation". A heading, not a rule.';
comment on column processes.process_expected_days is 'How many days a run should take from its start. Null means no agreed duration, not zero.';
comment on column processes.process_at_risk_lead_days is 'How many days before the due date a run starts flagging at risk. Requires an expectation and must be shorter than it.';
comment on column processes.process_is_milestone is 'Whether passing this process is a milestone of the stage. A count of these is the only progress figure this app reports — never a percentage.';
comment on column processes.process_sharepoint_folder is 'The subfolder, inside the record''s SharePoint folder, where documents for this process are filed. A name; the record holds the folder URL.';

create trigger processes_touch before update on processes
  for each row execute function extensions.moddatetime(process_updated_at);
create trigger processes_stamp_created_by before insert on processes
  for each row execute function stamp_created_by('process_created_by');
create trigger trg_activity_audit_row after insert or update or delete on processes
  for each row execute function log_activity_audit();

-- =========================================================== process_dependencies
create table if not exists process_dependencies (
  process_id            uuid not null references processes (process_id) on delete cascade,
  depends_on_process_id uuid not null references processes (process_id) on delete cascade,
  -- Days after the predecessor completes before this one is expected to start. The
  -- workbook's SLAs sit on the arrows, so this is where they live.
  process_dependency_lag_days smallint not null default 0
    constraint process_dependencies_lag_is_not_negative check (process_dependency_lag_days >= 0),
  process_dependency_created_at timestamptz not null default now(),
  process_dependency_created_by uuid references profiles (profile_id),
  primary key (process_id, depends_on_process_id),
  constraint process_dependencies_not_self check (process_id <> depends_on_process_id)
);

create index if not exists process_dependencies_depends_on_idx on process_dependencies (depends_on_process_id);

comment on table process_dependencies is
  'What has to finish before a process can start. A table, not a column: twenty-one of the schedule''s steps have two or more predecessors. The single source of ordering — blocking is derived from these edges, never from a flag that could disagree with them.';

create trigger process_dependencies_stamp_created_by before insert on process_dependencies
  for each row execute function stamp_created_by('process_dependency_created_by');

-- A cycle makes "what is ready" non-terminating. Same shape as 0030's guard.
create or replace function guard_process_dependency_cycle() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  cycles boolean;
begin
  with recursive reachable as (
    select new.depends_on_process_id as process_id
    union
    select d.depends_on_process_id
    from process_dependencies d
    join reachable r on d.process_id = r.process_id
  )
  select exists (select 1 from reachable where process_id = new.process_id) into cycles;

  if cycles then
    raise exception 'that dependency would create a cycle between processes % and %',
      new.process_id, new.depends_on_process_id using errcode = '23514';
  end if;
  return new;
end $$;

revoke execute on function guard_process_dependency_cycle() from public, anon, authenticated;

create trigger process_dependencies_guard_cycle
  before insert or update on process_dependencies
  for each row execute function guard_process_dependency_cycle();

-- ============================================================= process_properties
create table if not exists process_properties (
  process_id           uuid not null references processes (process_id) on delete cascade,
  property_def_key     text not null references property_defs (property_def_key)
                         on update cascade on delete cascade,
  process_property_position smallint not null default 0,
  -- Must be recorded before the run may be marked complete. Read by the app; the
  -- database does not refuse the completion, because "complete with a gap" is
  -- sometimes the truth and a person should be able to say so.
  process_property_required boolean not null default false,
  process_property_created_at timestamptz not null default now(),
  process_property_created_by uuid references profiles (profile_id),
  primary key (process_id, property_def_key)
);

create index if not exists process_properties_by_property on process_properties (property_def_key);

comment on table process_properties is
  'Which properties a process collects, in what order, and which of them must be recorded before it counts as complete. The join is what lets one property be collected by more than one process; it is also why a property has no process column of its own.';

create trigger process_properties_stamp_created_by before insert on process_properties
  for each row execute function stamp_created_by('process_property_created_by');

-- ================================================================ process_tasks
-- The checklist a run instantiates. The Construction schedule is 107 of these under
-- seven processes; a summary line in the schedule ("FOOTINGS, 18 days") becomes a
-- parent with the tasks beneath it as children, which is what tasks.parent_task_id
-- already exists for.
create table if not exists process_tasks (
  process_task_id       uuid primary key default gen_random_uuid(),
  process_id            uuid not null references processes (process_id) on delete cascade,
  parent_process_task_id uuid references process_tasks (process_task_id) on delete cascade,
  process_task_name     text not null check (length(trim(process_task_name)) > 0),
  process_task_owning_team text references teams (team_id) on update cascade,
  process_task_expected_days smallint
    constraint process_tasks_expected_days_are_not_negative check (process_task_expected_days >= 0),
  process_task_is_external boolean not null default false,
  process_task_position smallint not null default 0,
  -- The schedule's own line number, so "task 93" in a conversation can be found.
  process_task_import_ref smallint,

  process_task_created_at timestamptz not null default now(),
  process_task_created_by uuid references profiles (profile_id),
  process_task_updated_at timestamptz not null default now(),
  process_task_updated_by uuid references profiles (profile_id),

  constraint process_tasks_not_its_own_parent check (parent_process_task_id is distinct from process_task_id)
);

create index if not exists process_tasks_process_idx on process_tasks (process_id, process_task_position);
create index if not exists process_tasks_parent_idx on process_tasks (parent_process_task_id) where parent_process_task_id is not null;

comment on table process_tasks is
  'The checklist a process instantiates on a record — a template task with a team and a duration. The Construction schedule''s 107 lines live here under their seven processes; its summary lines are parents. Copied into tasks when a run is instantiated, never read from at runtime.';

create trigger process_tasks_touch before update on process_tasks
  for each row execute function extensions.moddatetime(process_task_updated_at);
create trigger process_tasks_stamp_created_by before insert on process_tasks
  for each row execute function stamp_created_by('process_task_created_by');

-- A parent must be a template of the same process.
create or replace function guard_process_task_parent() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  parent_process uuid;
begin
  if new.parent_process_task_id is null then
    return new;
  end if;
  select process_id into parent_process from process_tasks where process_task_id = new.parent_process_task_id;
  if parent_process is distinct from new.process_id then
    raise exception 'a template task''s parent must belong to the same process' using errcode = '23514';
  end if;
  return new;
end $$;

revoke execute on function guard_process_task_parent() from public, anon, authenticated;

create trigger process_tasks_guard_parent before insert or update on process_tasks
  for each row execute function guard_process_task_parent();

-- ===================================================== process_task_dependencies
create table if not exists process_task_dependencies (
  process_task_id            uuid not null references process_tasks (process_task_id) on delete cascade,
  depends_on_process_task_id uuid not null references process_tasks (process_task_id) on delete cascade,
  process_task_dependency_lag_days smallint not null default 0
    constraint process_task_dependencies_lag_is_not_negative check (process_task_dependency_lag_days >= 0),
  process_task_dependency_created_at timestamptz not null default now(),
  process_task_dependency_created_by uuid references profiles (profile_id),
  primary key (process_task_id, depends_on_process_task_id),
  constraint process_task_dependencies_not_self check (process_task_id <> depends_on_process_task_id)
);

create index if not exists process_task_dependencies_depends_on_idx
  on process_task_dependencies (depends_on_process_task_id);

comment on table process_task_dependencies is
  'The order of a process''s template tasks, with lag — "Handover is 10 days after the PCI walkthrough" is a row here (93+10 in the schedule). Copied into task_dependencies when a run is instantiated.';

create trigger process_task_dependencies_stamp_created_by before insert on process_task_dependencies
  for each row execute function stamp_created_by('process_task_dependency_created_by');

create or replace function guard_process_task_dependency() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  a uuid; b uuid;
  cycles boolean;
begin
  select process_id into a from process_tasks where process_task_id = new.process_task_id;
  select process_id into b from process_tasks where process_task_id = new.depends_on_process_task_id;
  if a is distinct from b then
    raise exception 'a template task can only depend on another task of the same process' using errcode = '23514';
  end if;

  with recursive reachable as (
    select new.depends_on_process_task_id as t
    union
    select d.depends_on_process_task_id
    from process_task_dependencies d
    join reachable r on d.process_task_id = r.t
  )
  select exists (select 1 from reachable where t = new.process_task_id) into cycles;
  if cycles then
    raise exception 'that dependency would create a cycle in the process''s tasks' using errcode = '23514';
  end if;
  return new;
end $$;

revoke execute on function guard_process_task_dependency() from public, anon, authenticated;

create trigger process_task_dependencies_guard before insert or update on process_task_dependencies
  for each row execute function guard_process_task_dependency();

-- ================================================================= process_runs
create table if not exists process_runs (
  process_run_id   uuid primary key default gen_random_uuid(),
  -- No cascade: deleting a process that has been run should fail loudly. Retire it
  -- (process_is_active = false) instead; the runs are history.
  process_id       uuid not null references processes (process_id),

  job_id           text references jobs (job_id) on update cascade on delete cascade,
  project_id       integer references projects (project_id) on update cascade on delete cascade,

  process_run_attempt smallint not null default 1
    constraint process_runs_attempt_is_positive check (process_run_attempt > 0),

  -- not_applicable is a status, agreed 24 August: plenty of jobs have no retaining wall
  -- and no SA Water connection, and without it those jobs never finish a stage.
  process_run_status text not null default 'not_started'
    constraint process_runs_status_is_known
    check (process_run_status in ('not_started', 'in_progress', 'waiting', 'complete', 'not_applicable')),
  -- Blocked is a state, not a stage (0029). Who it waits on, when it waits.
  process_run_waiting_on text references teams (team_id) on update cascade,

  -- Stamped by the database as the status moves; the SLA clock anchors on the start.
  process_run_started_at   timestamptz,
  process_run_completed_at timestamptz,
  process_run_completed_by uuid references profiles (profile_id),
  process_run_note text,

  process_run_created_at timestamptz not null default now(),
  process_run_created_by uuid references profiles (profile_id),
  process_run_updated_at timestamptz not null default now(),
  process_run_updated_by uuid references profiles (profile_id),

  constraint process_runs_one_parent check (num_nonnulls(job_id, project_id) = 1),
  constraint process_runs_complete_has_a_time
    check ((process_run_status = 'complete') = (process_run_completed_at is not null)),
  constraint process_runs_waiting_names_someone
    check (process_run_status <> 'waiting' or process_run_waiting_on is not null),
  constraint process_runs_active_have_started
    check (process_run_status not in ('in_progress', 'waiting', 'complete') or process_run_started_at is not null)
);

create unique index if not exists process_runs_one_attempt_per_job
  on process_runs (process_id, job_id, process_run_attempt) where job_id is not null;
create unique index if not exists process_runs_one_attempt_per_project
  on process_runs (process_id, project_id, process_run_attempt) where project_id is not null;
create index if not exists process_runs_job_idx on process_runs (job_id) where job_id is not null;
create index if not exists process_runs_project_idx on process_runs (project_id) where project_id is not null;
-- The board filter and the report: this process, across records, by status.
create index if not exists process_runs_process_status_idx on process_runs (process_id, process_run_status);
create index if not exists process_runs_open_idx on process_runs (process_run_started_at)
  where process_run_status in ('in_progress', 'waiting');

comment on table process_runs is
  'One process, on one record, one attempt. A job holds many at once — that is the point — and an amendment is a second attempt rather than an overwrite, which is what makes "how often does this repeat" a query. Started and completed are stamped by the database; due and health are derived in process_run_display, never stored.';
comment on column process_runs.process_run_status is 'not_started · in_progress · waiting (names a team) · complete · not_applicable. Not applicable is a real answer: a job with no retaining wall has finished the retaining process by having none.';
comment on column process_runs.process_run_attempt is 'Which pass this is. An amendment starts attempt 2 rather than reopening attempt 1, so both durations survive.';

create trigger process_runs_touch before update on process_runs
  for each row execute function extensions.moddatetime(process_run_updated_at);
create trigger process_runs_stamp_created_by before insert on process_runs
  for each row execute function stamp_created_by('process_run_created_by');

-- The record must match the process's level, and the stamps follow the status.
create or replace function guard_process_run() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  scope text;
begin
  select process_scope into scope from processes where process_id = new.process_id;
  if scope = 'job' and new.job_id is null then
    raise exception 'this process runs on a job, not a project' using errcode = '23514';
  end if;
  if scope = 'project' and new.project_id is null then
    raise exception 'this process runs on a project, not a job' using errcode = '23514';
  end if;

  if new.process_run_status in ('in_progress', 'waiting', 'complete') then
    new.process_run_started_at := coalesce(new.process_run_started_at, now());
  end if;

  if new.process_run_status = 'complete'
     and (tg_op = 'INSERT' or old.process_run_status is distinct from 'complete') then
    new.process_run_completed_at := coalesce(new.process_run_completed_at, now());
    new.process_run_completed_by := coalesce(current_profile_id(), new.process_run_completed_by);
  elsif new.process_run_status <> 'complete' then
    -- Reopened: a completion time on an open run is a lie.
    new.process_run_completed_at := null;
    new.process_run_completed_by := null;
  end if;

  if new.process_run_status <> 'waiting' then
    new.process_run_waiting_on := null;
  end if;
  return new;
end $$;

revoke execute on function guard_process_run() from public, anon, authenticated;

create trigger process_runs_guard before insert or update on process_runs
  for each row execute function guard_process_run();

-- ---------------------------------------------- tasks learn where they came from
alter table tasks
  add column if not exists process_run_id uuid references process_runs (process_run_id) on delete cascade,
  add column if not exists process_task_id uuid references process_tasks (process_task_id) on delete set null;

create index if not exists tasks_process_run_idx on tasks (process_run_id) where process_run_id is not null;

comment on column tasks.process_run_id is 'The process run this task was instantiated for, when it was — a typed-in task has none. Deleting the run takes its checklist with it.';
comment on column tasks.process_task_id is 'The template line this task was copied from, for "which jobs skipped the frame check". Survives the template being deleted.';

-- 0030 promised this column would arrive "with its foreign key, in the migration that
-- creates the thing it references". This is that migration.

-- ------------------------------------------------ instantiate a run's checklist
-- Copies the process's template tasks onto the run's record, parents first, then the
-- template's dependencies between them. SECURITY INVOKER: the tasks policy decides.
-- Due dates are NOT computed — nothing not yet started has a date, and a forecast is
-- the Gantt's problem (schema-plan.md, "Health, finally defined").
create or replace function instantiate_process_tasks(p_process_run_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  run process_runs%rowtype;
  made integer := 0;
  mapping jsonb := '{}'::jsonb;
  t record;
  new_task uuid;
begin
  select * into run from process_runs where process_run_id = p_process_run_id;
  if run.process_run_id is null then
    raise exception 'no such process run, or you may not see it' using errcode = 'P0002';
  end if;
  if exists (select 1 from tasks where process_run_id = p_process_run_id) then
    raise exception 'this run already has its checklist' using errcode = '23505';
  end if;

  for t in
    select * from process_tasks
    where process_id = run.process_id
    order by (parent_process_task_id is not null), process_task_position
  loop
    insert into tasks (job_id, project_id, task_name, parent_task_id, task_position,
                       task_owning_team, task_is_external, process_run_id, process_task_id)
    values (run.job_id, run.project_id, t.process_task_name,
            case when t.parent_process_task_id is null then null
                 else (mapping ->> t.parent_process_task_id::text)::uuid end,
            t.process_task_position, t.process_task_owning_team, t.process_task_is_external,
            p_process_run_id, t.process_task_id)
    returning task_id into new_task;
    mapping := mapping || jsonb_build_object(t.process_task_id::text, new_task::text);
    made := made + 1;
  end loop;

  insert into task_dependencies (task_id, depends_on_task_id, task_dependency_lag_days)
  select (mapping ->> d.process_task_id::text)::uuid,
         (mapping ->> d.depends_on_process_task_id::text)::uuid,
         d.process_task_dependency_lag_days
  from process_task_dependencies d
  join process_tasks pt on pt.process_task_id = d.process_task_id
  where pt.process_id = run.process_id;

  return made;
end $$;

revoke execute on function instantiate_process_tasks(uuid) from public, anon;
grant execute on function instantiate_process_tasks(uuid) to authenticated;

comment on function instantiate_process_tasks(uuid) is
  'Copies a process''s template tasks and their dependencies onto the run''s record, once. Security invoker: the tasks policy decides. Returns how many tasks were made. Due dates are left unset — a forecast needs a schedule this does not have.';

-- ============================================================ process_run_display
-- The run with what a card needs: the process, the record, and the dates and health
-- that fall out of the SLA — computed, never stored.
create or replace view process_run_display with (security_invoker = true) as
  select r.process_run_id,
         r.process_id,
         p.process_key,
         p.process_name,
         p.process_stage,
         p.process_stage_group,
         p.process_scope,
         p.process_owning_team,
         p.process_is_milestone,
         p.process_is_external,
         p.process_expected_days,
         p.process_at_risk_lead_days,
         p.process_position,
         r.job_id,
         r.project_id,
         coalesce(r.project_id, j.project_id) as record_project_id,
         r.process_run_attempt,
         r.process_run_status,
         r.process_run_waiting_on,
         r.process_run_started_at,
         r.process_run_completed_at,
         r.process_run_completed_by,
         r.process_run_note,
         r.process_run_created_at,
         r.process_run_updated_at,
         (r.process_run_started_at::date + p.process_expected_days)               as process_run_due_date,
         (r.process_run_started_at::date + p.process_expected_days - p.process_at_risk_lead_days)
                                                                                   as process_run_at_risk_date,
         case
           when r.process_run_status = 'complete'       then 'complete'
           when r.process_run_status = 'not_applicable' then 'not_applicable'
           when r.process_run_status = 'not_started'    then 'not_started'
           when p.process_expected_days is null         then 'no_expectation'
           when current_date > r.process_run_started_at::date + p.process_expected_days then 'overdue'
           when p.process_at_risk_lead_days is not null
                and current_date >= r.process_run_started_at::date + p.process_expected_days
                                    - p.process_at_risk_lead_days then 'at_risk'
           else 'on_track'
         end as process_run_health,
         (r.process_run_completed_at::date - r.process_run_started_at::date) as process_run_days_taken
  from process_runs r
  join processes p on p.process_id = r.process_id
  left join jobs j on j.job_id = r.job_id;

comment on view process_run_display is
  'A run with its process and its derived dates: due (start + expected days), at-risk (due − lead) and health. Nothing here is stored — re-time a process and every open run re-dates. A run that has no expectation reads no_expectation rather than on_track, because "on track against nothing" is not a fact.';

-- ------------------------------------------------------------------------- RLS
alter table processes                 enable row level security;
alter table process_dependencies      enable row level security;
alter table process_properties        enable row level security;
alter table process_tasks             enable row level security;
alter table process_task_dependencies enable row level security;
alter table process_runs              enable row level security;

create policy "read processes" on processes for select to authenticated using ((select is_active_user()));
create policy "managers write processes" on processes for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

create policy "read process dependencies" on process_dependencies for select to authenticated using ((select is_active_user()));
create policy "managers write process dependencies" on process_dependencies for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

create policy "read process properties" on process_properties for select to authenticated using ((select is_active_user()));
create policy "managers write process properties" on process_properties for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

create policy "read process tasks" on process_tasks for select to authenticated using ((select is_active_user()));
create policy "managers write process tasks" on process_tasks for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

create policy "read process task dependencies" on process_task_dependencies for select to authenticated using ((select is_active_user()));
create policy "managers write process task dependencies" on process_task_dependencies for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

-- Running a process is ordinary work, the same rung as moving a task.
create policy "read process runs" on process_runs for select to authenticated using ((select is_active_user()));
create policy "users start process runs" on process_runs for insert to authenticated
  with check ((select current_permission()) >= 'user');
create policy "users update process runs" on process_runs for update to authenticated
  using ((select current_permission()) >= 'user') with check ((select current_permission()) >= 'user');
create policy "admins delete process runs" on process_runs for delete to authenticated
  using ((select current_permission()) >= 'admin');

-- ---------------------------------------------------------------------- proof
do $$
declare
  a uuid; b uuid; c uuid;
  ta uuid; tb uuid;
  probe_address uuid; probe_project integer; probe_job text;
  run uuid; made integer;
begin
  insert into processes (process_key, process_name, process_stage, process_scope) values
    ('__probe_a', 'Probe A', 'Pre-construction', 'job') returning process_id into a;
  insert into processes (process_key, process_name, process_stage, process_scope) values
    ('__probe_b', 'Probe B', 'Pre-construction', 'job') returning process_id into b;
  insert into processes (process_key, process_name, process_stage, process_scope) values
    ('__probe_c', 'Probe C', 'Pre-construction', 'project') returning process_id into c;
  -- The slug check refuses a leading underscore, so the keys above must have failed…
  raise exception 'processes_key_is_a_slug did not bite on __probe_a';
exception
  when check_violation then null;
end $$;

do $$
declare
  a uuid; b uuid; c uuid;
  ta uuid; tb uuid;
  probe_address uuid; probe_project integer; probe_job text;
  run uuid; made integer;
  -- The probe's project takes a number from the sequence and is then deleted, which
  -- would leave a permanent gap the next real project inherits (behaviour.sql expects
  -- the first project on a fresh database to be 1000). The sequence is put back exactly
  -- as it was found — the same last_value and is_called — never rewound past a real row.
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  insert into processes (process_key, process_name, process_stage, process_scope) values
    ('probe_a', 'Probe A', 'Pre-construction', 'job') returning process_id into a;
  insert into processes (process_key, process_name, process_stage, process_scope) values
    ('probe_b', 'Probe B', 'Pre-construction', 'job') returning process_id into b;
  insert into processes (process_key, process_name, process_stage, process_scope) values
    ('probe_c', 'Probe C', 'Pre-construction', 'project') returning process_id into c;

  insert into process_dependencies (process_id, depends_on_process_id) values (b, a);
  begin
    insert into process_dependencies (process_id, depends_on_process_id) values (a, b);
    raise exception 'a process dependency cycle was accepted';
  exception when check_violation then null; end;

  begin
    insert into processes (process_key, process_name, process_stage, process_scope,
                           process_expected_days, process_at_risk_lead_days)
    values ('probe_d', 'Probe D', 'Pre-construction', 'job', 10, 10);
    raise exception 'an at-risk lead as long as the expectation was accepted';
  exception when check_violation then null; end;

  insert into process_tasks (process_id, process_task_name, process_task_position) values (a, 'Parent', 1) returning process_task_id into ta;
  insert into process_tasks (process_id, parent_process_task_id, process_task_name, process_task_position) values (a, ta, 'Child', 2) returning process_task_id into tb;
  insert into process_task_dependencies (process_task_id, depends_on_process_task_id, process_task_dependency_lag_days) values (tb, ta, 3);
  begin
    insert into process_task_dependencies (process_task_id, depends_on_process_task_id) values (ta, tb);
    raise exception 'a task template cycle was accepted';
  exception when check_violation then null; end;
  begin
    insert into process_tasks (process_id, parent_process_task_id, process_task_name) values (b, ta, 'Wrong parent');
    raise exception 'a template task took a parent from another process';
  exception when check_violation then null; end;

  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0078', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'design') returning job_id into probe_job;

  -- A project process cannot run on a job, and a job one cannot run on a project.
  begin
    insert into process_runs (process_id, job_id) values (c, probe_job);
    raise exception 'a project process ran on a job';
  exception when check_violation then null; end;
  begin
    insert into process_runs (process_id, project_id) values (a, probe_project);
    raise exception 'a job process ran on a project';
  exception when check_violation then null; end;

  -- A run, started, gets a start stamp; completed, a completion; reopened, neither.
  insert into process_runs (process_id, job_id, process_run_status) values (a, probe_job, 'in_progress') returning process_run_id into run;
  if (select process_run_started_at from process_runs where process_run_id = run) is null then
    raise exception 'starting a run did not stamp its start';
  end if;
  update process_runs set process_run_status = 'complete' where process_run_id = run;
  if (select process_run_completed_at from process_runs where process_run_id = run) is null then
    raise exception 'completing a run did not stamp its completion';
  end if;
  update process_runs set process_run_status = 'in_progress' where process_run_id = run;
  if (select process_run_completed_at from process_runs where process_run_id = run) is not null then
    raise exception 'reopening a run kept its completion time';
  end if;

  -- Waiting must say on whom; the same attempt twice is refused.
  begin
    update process_runs set process_run_status = 'waiting' where process_run_id = run;
    raise exception 'waiting on nobody was accepted';
  exception when check_violation then null; end;
  begin
    insert into process_runs (process_id, job_id) values (a, probe_job);
    raise exception 'a second attempt 1 of the same process on the same job was accepted';
  exception when unique_violation then null; end;

  -- The checklist instantiates with its parent, its child and its lagged dependency.
  made := instantiate_process_tasks(run);
  if made <> 2 then raise exception 'expected 2 tasks from the template, got %', made; end if;
  if (select count(*) from tasks where process_run_id = run and parent_task_id is not null) <> 1 then
    raise exception 'the child task did not get its parent';
  end if;
  if (select task_dependency_lag_days from task_dependencies d join tasks t on t.task_id = d.task_id where t.process_run_id = run) <> 3 then
    raise exception 'the template dependency did not carry its lag';
  end if;
  begin
    perform instantiate_process_tasks(run);
    raise exception 'a run was given its checklist twice';
  exception when unique_violation then null; end;

  -- A process with runs cannot be deleted; retired instead.
  begin
    delete from processes where process_id = a;
    raise exception 'a process with a run was deleted';
  exception when foreign_key_violation then null; end;

  -- The view derives; nothing is stored.
  update processes set process_expected_days = 10, process_at_risk_lead_days = 3 where process_id = a;
  if (select process_run_due_date from process_run_display where process_run_id = run)
     is distinct from (current_date + 10) then
    raise exception 'process_run_display did not derive the due date';
  end if;

  delete from process_runs where process_run_id = run;   -- cascades its tasks
  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  delete from processes where process_key in ('probe_a', 'probe_b', 'probe_c');
  perform setval(seq, seq_last, seq_called);
  raise notice 'ok  processes: cycles, leads, parents, levels, stamps, attempts, checklist and the view all behave';
end $$;
