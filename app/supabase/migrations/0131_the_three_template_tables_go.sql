-- =============================================================================
-- 0131 — the three template lists go, and the steps are the only list
--
-- 0128 built `process_steps` and filled it from `process_properties`, `process_tasks` and
-- `process_task_checklist_items`, then left all three in place. 0129 put the completion
-- gate on the steps, 0130 made a run instantiate its tasks from them. The screens moved
-- in the same change as this migration: Setup → Processes now edits one list, the drawer
-- reads the run's step states, and `useProcessProperties` derives its answer from the
-- property steps. Nothing in the app reads the three tables any more.
--
-- So they go, and with them the last of the three-lists shape:
--
--   - `process_properties`, `process_tasks`, `process_task_dependencies` and
--     `process_task_checklist_items` are dropped, along with the two guards that only
--     existed to hold the old parent and dependency rules — `process_steps` holds both
--     with composite foreign keys instead.
--   - `instantiate_process_tasks(uuid)` goes; `instantiate_process_steps(uuid)` replaces
--     it and 0130 already made it the one a run calls.
--   - `tasks.process_task_id` becomes `tasks.process_step_id` and points at
--     `process_steps`. The values do not move: 0128 gave every task step the id its
--     `process_tasks` row had, exactly so this rename would be a rename.
--
-- WHY THE COLUMN IS RENAMED AND NOT JUST REPOINTED
--
--   A column called `process_task_id` in a database with no process tasks is a lie that
--   reads as a fact. The FK repoint alone would work; the name would go on telling the
--   next person there is a template-task table to go and look at.
--
-- WHAT THIS MIGRATION IS CAREFUL ABOUT
--
--   **It refuses rather than nulls.** Before the foreign key moves, a check counts the
--   tasks whose `process_task_id` has no matching step. If there are any, this migration
--   raises and changes nothing — a silent `set null` would throw away the provenance of
--   every task on the board, which is the one thing the column is for.
--
--   **Two functions are rewritten, not left to break.** `process_expected_duration` summed
--   `process_tasks`; it now sums TASK STEPS. `notify_working_drawings_value` asked
--   `process_properties` whether a value belongs to a Working Drawings process; it now
--   asks the property steps. Neither changes what it answers — the rows are the same rows.
--
--   **`instantiate_process_steps` is re-emitted** because its body names the renamed
--   column. A function body is text: a column rename does not reach inside it.
-- =============================================================================
set lock_timeout = '5s';

-- ============================================== the two functions that read the old tables

-- Its own column when set, the sum of its TASK STEPS otherwise, and null when neither
-- exists — which is the signal the forecast refuses to guess past (0119, now on 0128's list).
create or replace function process_expected_duration(the_process uuid)
returns integer
language sql stable
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.process_expected_days from processes p where p.process_id = the_process),
    (select sum(s.process_step_expected_days)::integer
       from process_steps s
      where s.process_id = the_process and s.process_step_kind = 'task')
  );
$$;

comment on function process_expected_duration(uuid) is
  'How many calendar days a process is expected to take: its own process_expected_days when set, otherwise the sum of its task steps'' process_step_expected_days, otherwise NULL. Null means nobody has said, and the completion forecast refuses to project past it rather than treating it as zero. 0119, moved onto process_steps by 0131.';

-- Same question, same rows, asked of the steps: does any Working Drawings process collect
-- this property? (0083, moved onto process_steps by 0131.)
create or replace function notify_working_drawings_value()
returns trigger
language plpgsql security definer set search_path = public, pg_temp
as $$
declare who uuid[]; label text; j jobs%rowtype; snap property_values%rowtype;
begin
  snap := case when tg_op = 'DELETE' then old else new end;
  if not exists (
    select 1 from process_steps s join processes p using (process_id)
     where s.process_step_kind = 'property'
       and s.property_def_key = snap.property_def_key
       and p.process_key like 'working_drawings%') then
    return coalesce(new, old);
  end if;
  select property_def_label into label from property_defs where property_def_key = snap.property_def_key;
  if snap.job_id is not null then select * into j from jobs where job_id = snap.job_id; end if;
  who := private.notification_recipients('working_drawings_changed', snap.job_id, coalesce(snap.project_id, j.project_id), null, j.job_owning_team, null, 0);
  who := array(select u from unnest(who) u where u is distinct from current_profile_id());
  perform private.notify('working_drawings_changed', who,
    format('Working drawings: %s %s', label, case tg_op when 'INSERT' then 'recorded' when 'DELETE' then 'cleared' else 'changed' end),
    format('%s on %s was %s.', label, coalesce(snap.job_id, 'project ' || snap.project_id),
           case tg_op when 'INSERT' then 'recorded' when 'DELETE' then 'cleared' else 'changed' end),
    case when snap.job_id is not null then '/jobs/' || snap.job_id else '/projects/' || snap.project_id end,
    format('working_drawings_changed:value:%s:%s', snap.property_value_id, to_char(now(), 'YYYY-MM-DD"T"HH24:MI')),
    snap.job_id, coalesce(snap.project_id, j.project_id), null, null, null);
  return coalesce(new, old);
end $$;

revoke execute on function notify_working_drawings_value() from public, anon, authenticated;

-- ========================================== tasks point at the step they were made from

-- Refuse rather than null. Every task step kept the id its process_tasks row had (0128), so
-- a task whose template has no step means the backfill did not do what it said it did.
do $$
declare stray integer;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tasks'
                and column_name = 'process_task_id') then
    select count(*) into stray
      from tasks t
     where t.process_task_id is not null
       and not exists (select 1 from process_steps s where s.process_step_id = t.process_task_id);
    if stray > 0 then
      raise exception '0131: % tasks name a template line with no step behind it — 0128''s backfill did not carry them, and repointing now would erase the provenance of every one', stray;
    end if;
  end if;
end $$;

alter table tasks drop constraint if exists tasks_process_task_id_fkey;
alter table tasks rename column process_task_id to process_step_id;
alter index if exists tasks_process_task_idx rename to tasks_process_step_idx;
alter table tasks
  add constraint tasks_process_step_id_fkey
  foreign key (process_step_id) references process_steps (process_step_id) on delete set null;

comment on column tasks.process_step_id is
  'The task step this task was made from (0131, renamed from process_task_id when process_tasks went). What answers "which jobs skipped the frame check". ON DELETE SET NULL: the task survives its step being removed.';

-- The view carried the old name through to the API, so it is renamed too rather than
-- rebuilt: a base-column rename follows into the view's body on its own, but not into the
-- name the view publishes.
alter view task_display rename column process_task_id to process_step_id;

-- ============================================== the run machinery, on the new column name
create or replace function instantiate_process_steps(p_process_run_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  run     process_runs%rowtype;
  made    integer := 0;
  mapping jsonb := '{}'::jsonb;
  s       record;
  new_task uuid;
begin
  select * into run from process_runs where process_run_id = p_process_run_id;
  if run.process_run_id is null then
    raise exception 'no such process run, or you may not see it' using errcode = 'P0002';
  end if;
  -- Idempotent: the run that already has its tasks makes none, and says so with a zero rather
  -- than an error, because the start trigger calls this on every start.
  if exists (select 1 from tasks where process_run_id = p_process_run_id) then
    return 0;
  end if;

  for s in
    select * from process_steps
     where process_id = run.process_id and process_step_kind = 'task'
     order by (parent_process_step_id is not null), process_step_position
  loop
    insert into tasks (job_id, project_id, task_name, parent_task_id, task_position,
                       task_owning_team, task_is_external, task_expected_days,
                       process_run_id, process_step_id)
    values (run.job_id, run.project_id, s.process_step_name,
            case when s.parent_process_step_id is null then null
                 else (mapping ->> s.parent_process_step_id::text)::uuid end,
            s.process_step_position, s.process_step_owning_team, s.process_step_is_external,
            s.process_step_expected_days,
            p_process_run_id, s.process_step_id)
    returning task_id into new_task;
    mapping := mapping || jsonb_build_object(s.process_step_id::text, new_task::text);
    made := made + 1;

    -- The checklist lines under that task step, carrying the step they came from so a tick
    -- counts towards the run (0129's state view reads this column).
    insert into task_checklist_items (task_id, task_checklist_item_position,
                                      task_checklist_item_text, process_step_id)
    select new_task, c.process_step_position, c.process_step_name, c.process_step_id
      from process_steps c
     where c.parent_process_step_id = s.process_step_id
       and c.process_step_kind = 'checklist'
     order by c.process_step_position;
  end loop;

  insert into task_dependencies (task_id, depends_on_task_id, task_dependency_lag_days)
  select (mapping ->> d.process_step_id::text)::uuid,
         (mapping ->> d.depends_on_process_step_id::text)::uuid,
         d.process_step_dependency_lag_days
    from process_step_dependencies d
   where d.process_id = run.process_id
     and mapping ? d.process_step_id::text
     and mapping ? d.depends_on_process_step_id::text;

  return made;
end $$;
revoke execute on function instantiate_process_steps(uuid) from public, anon;
grant execute on function instantiate_process_steps(uuid) to authenticated;

comment on function instantiate_process_steps(uuid) is
  'Make a run''s tasks from its process''s task steps (0130), with their checklist lines, nesting and dependencies, each carrying the step it came from. Returns how many were made; a run that already has tasks makes none. Writes tasks.process_step_id since 0131.';

-- ===================================================================== the tables go
drop function if exists instantiate_process_tasks(uuid);

drop table if exists process_task_checklist_items;
drop table if exists process_task_dependencies;
drop table if exists process_tasks;
drop table if exists process_properties;

-- Their guards go with them: `process_steps` holds the same two rules with composite
-- foreign keys (parent) and its own recursive guard (dependency cycles).
drop function if exists guard_process_task_parent();
drop function if exists guard_process_task_dependency();

-- ========================================================================= the proof
do $$
declare n integer;
begin
  select count(*) into n from information_schema.tables
   where table_schema = 'public'
     and table_name in ('process_properties', 'process_tasks',
                        'process_task_dependencies', 'process_task_checklist_items');
  if n <> 0 then
    raise exception '0131 proof: % of the four template tables are still there', n;
  end if;

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('instantiate_process_tasks', 'guard_process_task_parent', 'guard_process_task_dependency');
  if n <> 0 then
    raise exception '0131 proof: % of the three retired functions are still there', n;
  end if;

  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'tasks' and column_name = 'process_step_id';
  if n <> 1 then
    raise exception '0131 proof: tasks.process_step_id is not there';
  end if;

  select count(*) into n from pg_constraint
   where conname = 'tasks_process_step_id_fkey' and confrelid = 'process_steps'::regclass;
  if n <> 1 then
    raise exception '0131 proof: tasks.process_step_id does not point at process_steps';
  end if;

  -- Every task still names a step that exists. The rename moved no values; this says so.
  select count(*) into n from tasks t
   where t.process_step_id is not null
     and not exists (select 1 from process_steps s where s.process_step_id = t.process_step_id);
  if n <> 0 then
    raise exception '0131 proof: % tasks name a step that is not there', n;
  end if;

  -- And the view publishes the new name rather than the old one.
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'task_display' and column_name = 'process_task_id';
  if n <> 0 then
    raise exception '0131 proof: task_display still publishes process_task_id';
  end if;

  raise notice '0131: the three template lists are gone; tasks name their step.';
end $$;
