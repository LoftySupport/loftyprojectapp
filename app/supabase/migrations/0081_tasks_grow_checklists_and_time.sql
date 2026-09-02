-- =============================================================================
-- 0081 — tasks grow checklists and time; a job learns its SiteBook id
-- =============================================================================
-- Amber, 1–2 September: *"Tasks and sub task and checklists are essential for users and
-- teams… Each process needs a column for at risk which calculates when to mark at risk if
-- not completed (eg if process should take 7 days and at 5 days it is marked as at
-- risk)… task and subtask need to be built… need to add a property on jobs for
-- sitebook_id."*
--
-- Tasks already nest one level (parent_task_id, 0030) and depend on each other. Two
-- things were missing.
--
-- A THIRD LEVEL, LIGHTER THAN A TASK
--
--   A checklist item is not a task: no assignee, no due date, no dependencies, no status
--   beyond ticked. A task with a twelve-line checklist must not become a task with twelve
--   children clogging "my work" — so `task_checklist_items` is its own table, and
--   `process_task_checklist_items` is the same shape on the template, copied when a run
--   is instantiated.
--
-- TIME, SO A TASK CAN BE AT RISK
--
--   A task had a due date and no duration, so it could be overdue and never at risk. It
--   gains the same two numbers a process has — expected days and an at-risk lead, CHECKed
--   so the lead cannot exceed the duration — plus a start stamped when work begins. Due
--   is what somebody typed, or start + expected when nobody did. `task_display` derives
--   due, at-risk date and health exactly the way `process_run_display` does, so a card,
--   a filter, a notification and a report never disagree about what "at risk" means.
--
--   Instantiating a process's checklist now copies each template line's expected days
--   onto the task, which is what finally gives instantiated tasks computed due dates — the
--   item 0078 left undone.
--
-- STAGE COMPLETION AS ONE QUERY
--
--   "Milestone processes are used to track project stage completion." The panel counted
--   milestones client-side; `stage_completion` counts them once per record and stage, for
--   the board column, the drawer header, the filters and the report. A stage is complete
--   when every active process of it has a latest run that is complete or not applicable;
--   the milestone count is shown beside it and is never turned into a percentage (24 Aug).
--
-- SITEBOOK
--
--   One property definition, `sitebook_id`: a job-level text field. The SiteBook connector
--   (schema-plan, *Sync*) will read it as the external id; until then it is the number
--   somebody types off the SiteBook screen.
-- =============================================================================

-- ---------------------------------------------------------- tasks: time
alter table tasks
  add column if not exists task_started_at        timestamptz,
  add column if not exists task_expected_days     smallint,
  add column if not exists task_at_risk_lead_days smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_expected_days_are_not_negative') then
    alter table tasks add constraint tasks_expected_days_are_not_negative check (task_expected_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_at_risk_lead_is_not_negative') then
    alter table tasks add constraint tasks_at_risk_lead_is_not_negative check (task_at_risk_lead_days >= 0);
  end if;
  -- The lead is measured back from the due date; a lead longer than the whole duration
  -- would flag a task at risk before it started.
  if not exists (select 1 from pg_constraint where conname = 'tasks_at_risk_lead_within_duration') then
    alter table tasks add constraint tasks_at_risk_lead_within_duration
      check (task_at_risk_lead_days is null or task_expected_days is null or task_at_risk_lead_days <= task_expected_days);
  end if;
end $$;

comment on column tasks.task_started_at        is 'When work began — the anchor of the clock. Stamped when the status first moves to in_progress (or done from open), editable afterwards; never cleared by the database.';
comment on column tasks.task_expected_days     is 'How long it should take from its start. Null means no agreed duration, which is not zero: without it a task can be overdue (past a typed due date) but never at risk.';
comment on column tasks.task_at_risk_lead_days is 'How many days before the due date the task reads at risk — 7-day task, lead 2, at risk from day 5. CHECKed no longer than the duration.';

-- Start is stamped, not typed. The same rule process_runs has (guard_process_run): the
-- first move off "to do" is when the clock starts, and a person may correct it afterwards.
create or replace function stamp_task_start() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.task_started_at is null
     and new.task_status in ('in_progress', 'blocked', 'done')
     and (tg_op = 'INSERT' or old.task_status = 'open') then
    new.task_started_at := now();
  end if;
  return new;
end $$;

revoke execute on function stamp_task_start() from public, anon, authenticated;

drop trigger if exists tasks_stamp_start on tasks;
create trigger tasks_stamp_start before insert or update on tasks
  for each row execute function stamp_task_start();

-- ---------------------------------------------------------- the checklist on a task
create table if not exists task_checklist_items (
  task_checklist_item_id       uuid primary key default gen_random_uuid(),
  task_id                      uuid not null references tasks (task_id) on delete cascade,
  task_checklist_item_position smallint not null default 0,
  task_checklist_item_text     text not null
    constraint task_checklist_items_text_is_not_blank check (length(trim(task_checklist_item_text)) > 0),
  task_checklist_item_is_done  boolean not null default false,
  task_checklist_item_done_at  timestamptz,
  task_checklist_item_done_by  uuid references profiles (profile_id),

  task_checklist_item_created_at timestamptz not null default now(),
  task_checklist_item_created_by uuid references profiles (profile_id),
  task_checklist_item_updated_at timestamptz not null default now(),
  task_checklist_item_updated_by uuid references profiles (profile_id),

  -- Ticked and timed together, or neither — the same rule as tasks_done_has_a_time.
  constraint task_checklist_items_done_has_a_time
    check (task_checklist_item_is_done = (task_checklist_item_done_at is not null))
);

create index if not exists task_checklist_items_task_idx on task_checklist_items (task_id, task_checklist_item_position);
create index if not exists task_checklist_items_done_by_idx on task_checklist_items (task_checklist_item_done_by) where task_checklist_item_done_by is not null;

comment on table task_checklist_items is
  'Tick boxes under a task (0081): text, order, and who ticked it when. Deliberately not a task — no assignee, due date, status or dependencies — so a task with twelve lines is one task, not thirteen. Copied from process_task_checklist_items when a run is instantiated.';
comment on column task_checklist_items.task_checklist_item_is_done is 'Ticked. The trigger stamps done_at and done_by when it turns true and clears both when it turns false; the CHECK keeps the pair honest.';

create or replace function stamp_checklist_item_done() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.task_checklist_item_is_done and (tg_op = 'INSERT' or not old.task_checklist_item_is_done) then
    new.task_checklist_item_done_at := coalesce(new.task_checklist_item_done_at, now());
    new.task_checklist_item_done_by := coalesce(current_profile_id(), new.task_checklist_item_done_by);
  elsif not new.task_checklist_item_is_done then
    new.task_checklist_item_done_at := null;
    new.task_checklist_item_done_by := null;
  end if;
  return new;
end $$;

revoke execute on function stamp_checklist_item_done() from public, anon, authenticated;

drop trigger if exists task_checklist_items_stamp_done on task_checklist_items;
create trigger task_checklist_items_stamp_done before insert or update on task_checklist_items
  for each row execute function stamp_checklist_item_done();
drop trigger if exists task_checklist_items_touch on task_checklist_items;
create trigger task_checklist_items_touch before update on task_checklist_items
  for each row execute function extensions.moddatetime(task_checklist_item_updated_at);
drop trigger if exists task_checklist_items_stamp_created_by on task_checklist_items;
create trigger task_checklist_items_stamp_created_by before insert on task_checklist_items
  for each row execute function stamp_created_by('task_checklist_item_created_by');
drop trigger if exists trg_activity_audit_row on task_checklist_items;
create trigger trg_activity_audit_row after insert or update or delete on task_checklist_items
  for each row execute function log_activity_audit();

alter table task_checklist_items enable row level security;
drop policy if exists "read checklist items" on task_checklist_items;
drop policy if exists "users write checklist items" on task_checklist_items;
drop policy if exists "users update checklist items" on task_checklist_items;
drop policy if exists "users delete checklist items" on task_checklist_items;
create policy "read checklist items" on task_checklist_items
  for select to authenticated using ((select is_active_user()));
create policy "users write checklist items" on task_checklist_items
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update checklist items" on task_checklist_items
  for update to authenticated
  using ((select current_permission()) >= 'user') with check ((select current_permission()) >= 'user');
-- A checklist line is the one thing here a user may remove: it is theirs to keep, and a
-- deleted line is not a deleted task. Tasks stay admin-delete (0030).
create policy "users delete checklist items" on task_checklist_items
  for delete to authenticated using ((select current_permission()) >= 'user');

-- ---------------------------------------------------------- the checklist on a template line
create table if not exists process_task_checklist_items (
  process_task_checklist_item_id       uuid primary key default gen_random_uuid(),
  process_task_id                      uuid not null references process_tasks (process_task_id) on delete cascade,
  process_task_checklist_item_position smallint not null default 0,
  process_task_checklist_item_text     text not null
    constraint process_task_checklist_items_text_is_not_blank check (length(trim(process_task_checklist_item_text)) > 0),

  process_task_checklist_item_created_at timestamptz not null default now(),
  process_task_checklist_item_created_by uuid references profiles (profile_id),
  process_task_checklist_item_updated_at timestamptz not null default now(),
  process_task_checklist_item_updated_by uuid references profiles (profile_id)
);

create index if not exists process_task_checklist_items_task_idx
  on process_task_checklist_items (process_task_id, process_task_checklist_item_position);

comment on table process_task_checklist_items is
  'The tick boxes a template line hands a job (0081) — copied into task_checklist_items by instantiate_process_tasks(). Managers write them in Setup → Processes.';

drop trigger if exists process_task_checklist_items_touch on process_task_checklist_items;
create trigger process_task_checklist_items_touch before update on process_task_checklist_items
  for each row execute function extensions.moddatetime(process_task_checklist_item_updated_at);
drop trigger if exists process_task_checklist_items_stamp_created_by on process_task_checklist_items;
create trigger process_task_checklist_items_stamp_created_by before insert on process_task_checklist_items
  for each row execute function stamp_created_by('process_task_checklist_item_created_by');
drop trigger if exists trg_activity_audit_row on process_task_checklist_items;
create trigger trg_activity_audit_row after insert or update or delete on process_task_checklist_items
  for each row execute function log_activity_audit();

alter table process_task_checklist_items enable row level security;
drop policy if exists "read template checklist items" on process_task_checklist_items;
drop policy if exists "managers write template checklist items" on process_task_checklist_items;
create policy "read template checklist items" on process_task_checklist_items
  for select to authenticated using ((select is_active_user()));
create policy "managers write template checklist items" on process_task_checklist_items
  for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

-- ---------------------------------------------------------- instantiation copies time and lines
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
                       task_owning_team, task_is_external, task_expected_days,
                       process_run_id, process_task_id)
    values (run.job_id, run.project_id, t.process_task_name,
            case when t.parent_process_task_id is null then null
                 else (mapping ->> t.parent_process_task_id::text)::uuid end,
            t.process_task_position, t.process_task_owning_team, t.process_task_is_external,
            t.process_task_expected_days,
            p_process_run_id, t.process_task_id)
    returning task_id into new_task;
    mapping := mapping || jsonb_build_object(t.process_task_id::text, new_task::text);
    made := made + 1;

    insert into task_checklist_items (task_id, task_checklist_item_position, task_checklist_item_text)
    select new_task, c.process_task_checklist_item_position, c.process_task_checklist_item_text
      from process_task_checklist_items c
     where c.process_task_id = t.process_task_id
     order by c.process_task_checklist_item_position;
  end loop;

  insert into task_dependencies (task_id, depends_on_task_id, task_dependency_lag_days)
  select (mapping ->> d.process_task_id::text)::uuid,
         (mapping ->> d.depends_on_process_task_id::text)::uuid,
         d.process_task_dependency_lag_days
    from process_task_dependencies d
    join process_tasks pt on pt.process_task_id = d.process_task_id
   where pt.process_id = run.process_id
     and mapping ? d.process_task_id::text
     and mapping ? d.depends_on_process_task_id::text;

  return made;
end $$;

-- ---------------------------------------------------------- task_display
-- The task as a screen reads it: names resolved, checklist counted, and health derived
-- from today against the two dates — never stored, so re-timing re-dates.
drop view if exists task_display;
create view task_display with (security_invoker = true) as
  select t.task_id, t.job_id, t.project_id, t.task_name, t.task_description, t.parent_task_id,
         t.task_position, t.task_owning_team, t.task_assignee_id, t.task_status, t.task_due_date,
         t.task_completed_at, t.task_completed_by, t.task_is_external, t.process_run_id, t.process_task_id,
         t.task_started_at, t.task_expected_days, t.task_at_risk_lead_days,
         t.task_created_at, t.task_created_by, t.task_updated_at, t.task_updated_by,
         a.profile_full_name as task_assignee_name,
         f.profile_full_name as task_completed_by_name,
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
         (select count(*) from task_checklist_items c where c.task_id = t.task_id)::integer as task_checklist_total,
         (select count(*) from task_checklist_items c where c.task_id = t.task_id and c.task_checklist_item_is_done)::integer as task_checklist_done,
         (select count(*) from tasks s where s.parent_task_id = t.task_id)::integer as task_subtask_total,
         (select count(*) from tasks s where s.parent_task_id = t.task_id and s.task_status = 'done')::integer as task_subtask_done
  from tasks t
  left join profiles a on a.profile_id = t.task_assignee_id
  left join profiles f on f.profile_id = t.task_completed_by;

comment on view task_display is
  'A task with its names, its counts and its derived dates (0081): due (typed, or start + expected days), at-risk (due − lead) and health — no_due_date · on_track · at_risk · overdue · done · cancelled — computed from today the way process_run_display does. Nothing here is stored.';

-- ---------------------------------------------------------- stage_completion
drop view if exists stage_completion;
create view stage_completion with (security_invoker = true) as
  with rec as (
    select j.job_id, null::integer as project_id, 'job'::text as record_scope, j.job_stage as record_stage from jobs j
    union all
    select null::text, p.project_id, 'project', p.project_stage from projects p
  ),
  latest as (
    select distinct on (r.job_id, r.project_id, r.process_id)
           r.job_id, r.project_id, r.process_id, r.process_run_status
      from process_runs r
     order by r.job_id, r.project_id, r.process_id, r.process_run_attempt desc
  )
  select rec.job_id, rec.project_id, p.process_stage as stage,
         (p.process_stage = rec.record_stage) as stage_is_current,
         count(*)::integer as processes_total,
         count(*) filter (where l.process_run_status is null
                             or l.process_run_status not in ('complete', 'not_applicable'))::integer as processes_open,
         count(*) filter (where p.process_is_milestone)::integer as milestones_total,
         count(*) filter (where p.process_is_milestone
                            and l.process_run_status in ('complete', 'not_applicable'))::integer as milestones_passed,
         (count(*) filter (where l.process_run_status is null
                              or l.process_run_status not in ('complete', 'not_applicable')) = 0) as stage_is_complete
    from rec
    join processes p on p.process_scope = rec.record_scope and p.process_is_active
    left join latest l on l.process_id = p.process_id
                      and l.job_id is not distinct from rec.job_id
                      and l.project_id is not distinct from rec.project_id
   group by rec.job_id, rec.project_id, rec.record_stage, p.process_stage;

comment on view stage_completion is
  'Per record and lifecycle stage (0081): how many active processes there are, how many are still open, how many are milestones and how many of those have passed. A stage is complete when nothing in it is open. Counts, never a percentage (24 Aug). Read by the board, the drawer and the report so they agree.';

-- ---------------------------------------------------------- sitebook_id
insert into property_defs (property_def_key, property_def_label, property_def_scope, property_def_stage, property_def_owning_team,
                           property_def_format, property_def_position, property_def_description)
values ('sitebook_id', 'SiteBook ID', 'job', 'Acquisition & Development', null, 'text', 0,
        'The job''s id in SiteBook, which this app replaces. Typed for now; the SiteBook connector will read it as the external id.')
on conflict (property_def_key) do nothing;

-- ---------------------------------------------------------------------- proof
do $$
declare
  probe_address uuid; probe_project integer; probe_job text; probe_task uuid; probe_item uuid;
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
  h text; d date; n integer; m integer;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0081', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully') returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential') returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'design') returning job_id into probe_job;

  -- A 7-day task with a 2-day lead, started 5 days ago: at risk today, not overdue.
  insert into tasks (job_id, task_name, task_expected_days, task_at_risk_lead_days)
  values (probe_job, 'probe 0081', 7, 2) returning task_id into probe_task;
  update tasks set task_status = 'in_progress' where task_id = probe_task;
  if (select task_started_at from tasks where task_id = probe_task) is null then
    raise exception '0081 proof: starting a task did not stamp task_started_at';
  end if;
  update tasks set task_started_at = now() - interval '5 days' where task_id = probe_task;
  select task_health, task_due_effective into h, d from task_display where task_id = probe_task;
  if h <> 'at_risk' or d <> current_date + 2 then
    raise exception '0081 proof: expected at_risk due in 2 days, got % due %', h, d;
  end if;
  update tasks set task_started_at = now() - interval '9 days' where task_id = probe_task;
  if (select task_health from task_display where task_id = probe_task) <> 'overdue' then
    raise exception '0081 proof: a task 9 days into 7 is not reading overdue';
  end if;

  -- A lead longer than the duration is refused.
  begin
    update tasks set task_at_risk_lead_days = 9 where task_id = probe_task;
    raise exception '0081 proof: a 9-day lead on a 7-day task was accepted';
  exception when check_violation then null; end;

  -- A checklist line is ticked with a time and a person-or-null, and unticked clean.
  insert into task_checklist_items (task_id, task_checklist_item_text) values (probe_task, 'probe line')
  returning task_checklist_item_id into probe_item;
  update task_checklist_items set task_checklist_item_is_done = true where task_checklist_item_id = probe_item;
  if (select task_checklist_item_done_at from task_checklist_items where task_checklist_item_id = probe_item) is null then
    raise exception '0081 proof: ticking a line did not stamp done_at';
  end if;
  select task_checklist_total, task_checklist_done into n, m from task_display where task_id = probe_task;
  if n <> 1 or m <> 1 then
    raise exception '0081 proof: task_display did not count the ticked line';
  end if;
  update task_checklist_items set task_checklist_item_is_done = false where task_checklist_item_id = probe_item;
  if (select task_checklist_item_done_at from task_checklist_items where task_checklist_item_id = probe_item) is not null then
    raise exception '0081 proof: unticking a line left done_at behind';
  end if;
  begin
    insert into task_checklist_items (task_id, task_checklist_item_text) values (probe_task, '   ');
    raise exception '0081 proof: a blank checklist line was accepted';
  exception when check_violation then null; end;

  -- stage_completion knows the probe job: every job process of its stage is open.
  select processes_open into n from stage_completion
   where job_id = probe_job and stage = (select job_stage from jobs where job_id = probe_job);
  if n is null then
    -- Legitimate on a database whose processes have no rows for that stage (a fresh
    -- replay before 0079's seed would); the seed runs earlier in this file order, so today
    -- it is an error.
    if exists (select 1 from processes where process_scope = 'job' and process_is_active
                  and process_stage = (select job_stage from jobs where job_id = probe_job)) then
      raise exception '0081 proof: stage_completion has no row for the probe job''s stage';
    end if;
  end if;

  if not exists (select 1 from property_defs where property_def_key = 'sitebook_id') then
    raise exception '0081 proof: sitebook_id was not seeded';
  end if;

  delete from projects where project_id = probe_project;
  delete from addresses where address_id = probe_address;
  delete from activity_audit where activity_audit_project_id = probe_project
     or (activity_audit_table = 'addresses' and coalesce(activity_audit_new_row, activity_audit_old_row) ->> 'address_id' = probe_address::text);
  perform setval(seq, seq_last, seq_called);
end $$;
