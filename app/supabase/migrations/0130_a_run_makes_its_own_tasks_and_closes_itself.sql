-- 0130 — A RUN MAKES ITS OWN TASKS, AND CLOSES ITSELF
--
-- Stage 2 of the 15 September audit, its third migration. `0128` made a process one list of
-- steps; `0129` made a run refuse to close over an open one. This makes the list DO something:
-- the tasks appear when the run starts, and the run closes itself when the last required step
-- does.
--
-- WHAT AMBER DESCRIBED, AND WHAT THE APP DID INSTEAD
--
--   Her walk-through of Working Drawings, 15 September, in her numbering:
--
--     (2)  "A task is created by the system and assigned to Design Team manager to begin
--          working drawings"
--     (6)  "Tasks for Design Teams internal processes are created and assigned to the Design
--          Team Manager"
--     (9)  "Automation/Rule fires that when all process steps are completed mark this process
--          complete"
--     (11) "Completion of this process moves the job to next process and triggers task for
--          that process to begin.. this repeats"
--
--   What the app does today: nothing at (2) and (6) until somebody finds the **Add checklist**
--   button inside a row's disclosure (`ProcessesPanel.tsx:310`), and nothing at all at (9). The
--   audit's finding 5 is that completing a process changes one column on its own row.
--
--   (11) is Stage 3 — moving the job is a derivation, and it needs the sub-stage roll-up this
--   migration does not build. What lands here is (2), (6) and (9).
--
-- WHAT THIS DOES
--
--   `instantiate_process_steps(run)`: makes the tasks of a run from its process's TASK STEPS,
--   with their checklist lines, their nesting and their dependencies, carrying `process_step_id`
--   onto every row so each one can be matched back to the step it came from. It replaces
--   `instantiate_process_tasks`, which read the old template table; that function stays,
--   unchanged and still callable, until the table it reads goes.
--
--   **On start, not on request.** A trigger makes them when a run first reaches a status that
--   means work has begun. Idempotent by construction: a run that already has tasks makes none.
--
--   `close_run_if_its_steps_are_done(run)`: marks a run complete when no required step is open.
--   Called after a property value is written, a task is finished and a checklist line is ticked
--   — the three places a step's state can change — so the rule Amber described as an automation
--   is the same rule `0129`'s gate reads, in the other direction.
--
-- WHAT IT DELIBERATELY WILL NOT DO
--
--   **It never reopens a run.** Clearing a property value does not un-complete a process, and
--   deleting a task does not either. A completed run is a record of what happened, and a second
--   pass at the work is a second attempt (`0078`), which is also what decision 7 says a
--   variation makes. Closing is automatic; reopening is a person's decision with a name on it.
--
--   **It closes nothing that has no required steps.** A process with no required step would
--   otherwise complete itself the moment it started, which is not a run, it is a no-op with a
--   timestamp. Those still close by hand, and the gate lets them.
--
--   **It does not touch the job's stage.** That is Stage 3, and doing it here would bury the
--   audit's biggest reversal inside a migration about tasks.

-- ================================================================== making the tasks
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
  -- than an error, because the trigger below calls this on every start.
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
                       process_run_id, process_task_id)
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
  'Make a run''s tasks from its process''s task steps (0130), with their checklist lines, nesting and dependencies, each carrying the step it came from. Returns how many were made; a run that already has tasks makes none. Replaces instantiate_process_tasks, which reads the template table 0128 superseded.';

-- On start, not on request. Amber's steps 2 and 6: the system makes the first tasks and assigns
-- them, rather than a person finding a button inside a row's disclosure.
create or replace function make_tasks_when_a_run_starts() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.process_run_status in ('in_progress', 'waiting', 'complete')
     and (tg_op = 'INSERT' or old.process_run_status = 'not_started') then
    perform instantiate_process_steps(new.process_run_id);
  end if;
  return new;
end $$;
revoke execute on function make_tasks_when_a_run_starts() from public, anon, authenticated;

drop trigger if exists process_runs_make_tasks_on_start on process_runs;
create trigger process_runs_make_tasks_on_start
  after insert or update of process_run_status on process_runs
  for each row execute function make_tasks_when_a_run_starts();

-- ================================================================== closing itself
create or replace function close_run_if_its_steps_are_done(p_process_run_id uuid) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  run      process_runs%rowtype;
  required integer;
  open_now integer;
begin
  select * into run from process_runs where process_run_id = p_process_run_id;
  if run.process_run_id is null then return false; end if;
  -- Never reopen, and never close what is not running.
  if run.process_run_status not in ('in_progress', 'waiting') then return false; end if;

  select count(*) filter (where st.process_step_is_required),
         count(*) filter (where st.process_step_is_required and st.process_run_step_state = 'open')
    into required, open_now
    from process_run_step_state st
   where st.process_run_id = p_process_run_id;

  -- A process with no required step does not complete itself: that would be a no-op with a
  -- timestamp rather than a run. It closes by hand, and 0129's gate lets it.
  if required = 0 or open_now > 0 then return false; end if;

  update process_runs
     set process_run_status = 'complete'
   where process_run_id = p_process_run_id;
  return true;
end $$;
revoke execute on function close_run_if_its_steps_are_done(uuid) from public, anon, authenticated;

comment on function close_run_if_its_steps_are_done(uuid) is
  'Amber''s step 9, as a rule (0130): when no required step of a run is open, the run marks itself complete. The same reading of 0129''s gate, forwards. It never reopens a completed run and never closes a process that has no required steps.';

-- The three places a step's state can change. Each is an AFTER trigger that asks the question
-- rather than answering it: the state view is the one place that knows what a step's state is.
create or replace function close_runs_touched_by_a_value() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record;
begin
  for r in
    select distinct run.process_run_id
      from process_runs run
      join process_steps s on s.process_id = run.process_id
     where s.process_step_kind = 'property'
       and s.property_def_key = coalesce(new.property_def_key, old.property_def_key)
       and run.job_id is not distinct from coalesce(new.job_id, old.job_id)
       and run.project_id is not distinct from coalesce(new.project_id, old.project_id)
       and run.process_run_status in ('in_progress', 'waiting')
  loop
    perform close_run_if_its_steps_are_done(r.process_run_id);
  end loop;
  return null;
end $$;
revoke execute on function close_runs_touched_by_a_value() from public, anon, authenticated;
drop trigger if exists property_values_close_runs on property_values;
create trigger property_values_close_runs
  after insert or update on property_values
  for each row execute function close_runs_touched_by_a_value();

create or replace function close_the_run_this_task_belongs_to() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.process_run_id is not null and new.task_status = 'done'
     and (tg_op = 'INSERT' or old.task_status is distinct from 'done') then
    perform close_run_if_its_steps_are_done(new.process_run_id);
  end if;
  return null;
end $$;
revoke execute on function close_the_run_this_task_belongs_to() from public, anon, authenticated;
drop trigger if exists tasks_close_their_run on tasks;
create trigger tasks_close_their_run
  after insert or update of task_status on tasks
  for each row execute function close_the_run_this_task_belongs_to();

create or replace function close_the_run_this_tick_belongs_to() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare run_id uuid;
begin
  if new.task_checklist_item_is_done then
    select t.process_run_id into run_id from tasks t where t.task_id = new.task_id;
    if run_id is not null then
      perform close_run_if_its_steps_are_done(run_id);
    end if;
  end if;
  return null;
end $$;
revoke execute on function close_the_run_this_tick_belongs_to() from public, anon, authenticated;
drop trigger if exists task_checklist_items_close_their_run on task_checklist_items;
create trigger task_checklist_items_close_their_run
  after insert or update of task_checklist_item_is_done on task_checklist_items
  for each row execute function close_the_run_this_tick_belongs_to();

-- An exemption can be the last thing a run was waiting on, so it asks too.
create or replace function close_the_run_this_exemption_belongs_to() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform close_run_if_its_steps_are_done(new.process_run_id);
  return null;
end $$;
revoke execute on function close_the_run_this_exemption_belongs_to() from public, anon, authenticated;
drop trigger if exists process_run_step_exemptions_close_their_run on process_run_step_exemptions;
create trigger process_run_step_exemptions_close_their_run
  after insert on process_run_step_exemptions
  for each row execute function close_the_run_this_exemption_belongs_to();

-- ---------------------------------------------------------------------- proof
-- Watched failing: with the start trigger dropped, a run began with no tasks (the state the app
-- has been in since 0079); with the close triggers dropped, a run whose last required step was
-- answered stayed in progress for ever.
do $$
declare
  a_job     text;
  a_process uuid;
  a_step    uuid;
  a_run     uuid;
  made      integer;
  status    text;
  -- WHAT THIS PROOF BORROWS, IT PUTS BACK. The flags below are template data on the live
  -- database — 6 of the 140 property rows are marked required by somebody at Lofty — and the
  -- first version of this block set the whole process to false when it had finished, which on
  -- a replay of an empty seed changed nothing and on the live database would have silently
  -- flattened them. Caught before it was applied, by reading the migration against the live
  -- counts rather than against the replay.
  flags     jsonb;
begin
  select job_id into a_job from jobs order by job_id limit 1;
  if a_job is null then
    raise notice '0130 proof: no jobs on this database, so the run machinery could not be exercised.';
    return;
  end if;

  -- A Construction process: task steps, so instantiation has something to make.
  select p.process_id into a_process
    from processes p
   where p.process_scope = 'job'
     and exists (select 1 from process_steps s where s.process_id = p.process_id and s.process_step_kind = 'task')
   order by p.process_key limit 1;

  if a_process is not null then
    insert into process_runs (process_id, job_id, process_run_status)
    values (a_process, a_job, 'in_progress') returning process_run_id into a_run;

    select count(*) into made from tasks where process_run_id = a_run;
    if made = 0 then
      raise exception '0130 proof: a run started and made no tasks from % task steps',
        (select count(*) from process_steps where process_id = a_process and process_step_kind = 'task');
    end if;
    if made <> (select count(*) from process_steps where process_id = a_process and process_step_kind = 'task') then
      raise exception '0130 proof: % tasks for % task steps', made,
        (select count(*) from process_steps where process_id = a_process and process_step_kind = 'task');
    end if;
    -- Every task names the step it came from, which is what lets a tick count.
    if exists (select 1 from tasks where process_run_id = a_run and process_task_id is null) then
      raise exception '0130 proof: a task was made with no step behind it';
    end if;
    -- And the nesting came across.
    if (select count(*) from tasks where process_run_id = a_run and parent_task_id is not null)
       <> (select count(*) from process_steps where process_id = a_process
            and process_step_kind = 'task' and parent_process_step_id is not null) then
      raise exception '0130 proof: the nesting did not survive instantiation';
    end if;
    -- Starting it again makes nothing more.
    if instantiate_process_steps(a_run) <> 0 then
      raise exception '0130 proof: a second instantiation made more tasks';
    end if;

    delete from process_runs where process_run_id = a_run;
  end if;

  -- The forward rule, on a process with one required property step.
  select s.process_id, s.process_step_id into a_process, a_step
    from process_steps s join processes p using (process_id)
   where s.process_step_kind = 'property' and p.process_scope = 'job'
   order by p.process_key, s.process_step_position limit 1;

  if a_step is not null then
    select jsonb_object_agg(process_step_id::text, process_step_is_required) into flags
      from process_steps where process_id = a_process;

    update process_steps set process_step_is_required = (process_step_id = a_step)
     where process_id = a_process;

    insert into process_runs (process_id, job_id, process_run_status)
    values (a_process, a_job, 'in_progress') returning process_run_id into a_run;

    select process_run_status into status from process_runs where process_run_id = a_run;
    if status <> 'in_progress' then
      raise exception '0130 proof: a run with an open required step closed itself (%)', status;
    end if;

    -- Answering the last required step closes it, without anybody pressing anything.
    insert into process_run_step_exemptions (process_run_id, process_step_id, process_id,
                                             process_run_step_exemption_reason)
    values (a_run, a_step, a_process, '0130 proof');

    select process_run_status into status from process_runs where process_run_id = a_run;
    if status <> 'complete' then
      raise exception '0130 proof: the last required step was answered and the run stayed %', status;
    end if;

    delete from process_runs where process_run_id = a_run;

    update process_steps s
       set process_step_is_required = (flags ->> s.process_step_id::text)::boolean
     where s.process_id = a_process and flags ? s.process_step_id::text;

    if exists (
      select 1 from process_steps s
       where s.process_id = a_process
         and s.process_step_is_required is distinct from (flags ->> s.process_step_id::text)::boolean
    ) then
      raise exception '0130 proof: the required flags were not put back as they were found';
    end if;
  end if;

  raise notice '0130 proof: a run makes its tasks once when it starts, each naming its step, and closes itself when its last required step is answered.';
end $$;
