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
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'tasks'
                and column_name = 'process_task_id') then
    alter table tasks rename column process_task_id to process_step_id;
  end if;
end $$;
alter index if exists tasks_process_task_idx rename to tasks_process_step_idx;
alter table tasks
  add constraint tasks_process_step_id_fkey
  foreign key (process_step_id) references process_steps (process_step_id) on delete set null;

comment on column tasks.process_step_id is
  'The task step this task was made from (0131, renamed from process_task_id when process_tasks went). What answers "which jobs skipped the frame check". ON DELETE SET NULL: the task survives its step being removed.';

-- The view carried the old name through to the API, so it is renamed too rather than
-- rebuilt: a base-column rename follows into the view's body on its own, but not into the
-- name the view publishes.
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'task_display'
                and column_name = 'process_task_id') then
    alter view task_display rename column process_task_id to process_step_id;
  end if;
end $$;

-- ============================================== the run machinery, on the new column name
--
-- SECURITY INVOKER, which 0130 got wrong and this corrects before either reaches the live
-- project. `instantiate_process_tasks`, the function it replaces, was invoker from 0081;
-- 0130 wrote `definer` and granted execute to `authenticated`, which made the RPC a way
-- around RLS on `tasks`: a viewer who cannot insert one task could call it and insert
-- sixteen. Watched: as a profile with `is_active_user()` false, a direct insert into
-- `tasks` was refused by policy and the same session's call to this function wrote 16 rows.
--
-- Invoker is all it takes, because the two callers want different things and already have
-- them. `make_tasks_when_a_run_starts` is SECURITY DEFINER, so the call inside it still
-- runs as the owner and a run started by anyone still gets its tasks. A direct call over
-- the API runs as whoever made it, which is the whole point — and the function's own error
-- text, "no such process run, or you may not see it", becomes true rather than a lie a
-- definer could not have told.
create or replace function instantiate_process_steps(p_process_run_id uuid) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
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
--
-- Two comments first. A comment naming a table nobody has is the same lie as a column
-- naming one, and these two are the reason this migration renamed a column rather than
-- only repointing it — so they go in the same change rather than being left for the next
-- person to find in the database and not in the dictionary.
comment on table process_steps is
  'What a process is made of (0128): one ordered list of steps per process, each of one kind — a property to record, a task to do, a checklist line to tick, an automation to fire. It folded the three template lists into one; 0131 dropped them. A task step kept the id its template task had, so every instantiated task still points at the right row. A run completes when its required steps are done (Stage 2''s gate).';
comment on table task_checklist_items is
  'Tick boxes under a task (0081): text, order, who ticked it when. Not a task — no assignee, due date, status or dependencies — so a task with twelve lines is one task, not thirteen. Made from the checklist steps under a task step when a run starts, each carrying the step it came from so the tick counts towards the run.';

drop function if exists instantiate_process_tasks(uuid);

drop table if exists process_task_checklist_items;
drop table if exists process_task_dependencies;
drop table if exists process_tasks;
drop table if exists process_properties;

-- Their guards go with them: `process_steps` holds the same two rules with composite
-- foreign keys (parent) and its own recursive guard (dependency cycles).
drop function if exists guard_process_task_parent();
drop function if exists guard_process_task_dependency();

-- =================================================== a step is at most two deep
--
-- `instantiate_process_steps` walks the task steps in one pass, top-level first and then
-- everything with a parent, looking each parent up in a map it builds as it goes. That
-- supports exactly TWO levels: a task, and the tasks and tick boxes under it. At three, a
-- grandchild is looked up before its parent is in the map and lands with no parent at all
-- — silently, on live jobs. Setup → Processes could reach that state in two clicks, by
-- putting a task that already has tick boxes under another task, and the tick boxes then
-- rendered nowhere while instantiation went on copying them.
--
-- So the depth is the database's rule rather than the screen's, because the screen is not
-- the only writer. Two directions, because there are two ways in: a step cannot be given a
-- parent that has one, and a step that has children cannot be given a parent.
create or replace function guard_process_step_depth()
returns trigger
language plpgsql set search_path = public, pg_temp
as $$
begin
  if new.parent_process_step_id is null then
    return new;
  end if;
  if exists (select 1 from process_steps p
              where p.process_step_id = new.parent_process_step_id
                and p.parent_process_step_id is not null) then
    raise exception 'A step sits under a top-level step, not under one that is already nested. Move it under the parent instead.'
      using errcode = '23514';
  end if;
  if exists (select 1 from process_steps c where c.parent_process_step_id = new.process_step_id) then
    raise exception 'That step has steps of its own, so it cannot be nested under another. Move its children out first.'
      using errcode = '23514';
  end if;
  return new;
end $$;

revoke execute on function guard_process_step_depth() from public, anon, authenticated;

drop trigger if exists process_steps_guard_depth on process_steps;
create trigger process_steps_guard_depth
  before insert or update of parent_process_step_id on process_steps
  for each row execute function guard_process_step_depth();

-- Nothing live is three deep — there are no checklist steps at all on 15 September and the
-- 107 task steps are two levels — but the trigger only sees new writes, so the existing
-- rows are checked once here rather than assumed.
do $$
declare deep integer;
begin
  select count(*) into deep
    from process_steps c
    join process_steps p on p.process_step_id = c.parent_process_step_id
   where p.parent_process_step_id is not null;
  if deep > 0 then
    raise exception '0131: % steps are already three levels deep, which instantiation cannot carry. They need flattening before this rule can hold.', deep;
  end if;
end $$;

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
