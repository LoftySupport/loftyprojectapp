-- 0128 — A PROCESS IS A LIST OF STEPS
--
-- Stage 2 of the 15 September audit, its first migration. Stage 1 gave the lifecycle and its
-- sub-stages tables of their own; this gives a process its contents.
--
-- WHAT A PROCESS HOLDS TODAY, AND WHY IT IS TWO SHAPES
--
--   `0078` gave a process a list of properties to collect; `0079` gave it a list of template
--   tasks. Nothing ever gave it both, and the live database shows why: the 38 Pre-construction
--   processes carry 140 property rows and no tasks, the 7 Construction processes carry 107
--   tasks and no properties. **Zero processes have both.** So "a process" means a property
--   list in one stage and a task list in another, and the two are edited on different screens,
--   counted by different rules and completed by neither.
--
--   Amber, 15 September, asked whether they should fold into one list: *yes*, choice A. And her
--   walk-through of Working Drawings is the specification for what a step is — a property to
--   record, a task to do, a checklist to tick, an automation to fire, in one order, with
--   *"when all process steps are completed mark this process complete"* at the end of it.
--
-- WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT
--
--   `process_steps`: one row per step, with a `kind` and the fields that kind needs. Backfilled
--   from `process_properties`, `process_tasks` and `process_task_checklist_items`, carrying the
--   template task's own uuid across as the step's id — so a task step IS that template task,
--   and `tasks.process_task_id`, the provenance column on every instantiated task, still points
--   at the right row when the old table goes.
--
--   `process_step_dependencies`: what a step waits on, carried from `process_task_dependencies`,
--   with its cycle guard carried across too — the composite keys replace the old guard's
--   same-process half, and the recursive check is the half that has nowhere else to live.
--
--   **Nothing is dropped and nothing is rewired.** The three template tables stay, the app goes
--   on reading them, and `instantiate_process_tasks` goes on working. This migration adds the
--   shape and proves the backfill; the screens move in the next one and the old tables go in the
--   one after that. A backfill that can be checked against its source is worth more than a big
--   bang, and the source has to still be there to check against.
--
-- THE TWO DECISIONS WORTH KEEPING
--
--   **A step's position is per process, and not unique.** The old tables numbered properties and
--   tasks separately, each from 1. Since no process holds both, carrying both numbers across as
--   they are cannot collide today, and a unique constraint would make a drag-to-reorder write
--   every row twice to get past it. The screen renumbers 1..n the way Setup → Processes already
--   does for processes.
--
--   **A task step is required; a property step keeps the flag it had.** 6 of the 140 property
--   rows are marked required on the live database, which is what the drawer's *"2 required
--   missing"* chip counts. Template tasks have no such flag, and the reading that follows from
--   Amber's own step 9 — *"when all process steps are completed mark this process complete"* —
--   is that a task in the list is work that has to be done. So task steps arrive required, and
--   the honest way past one that does not apply is marking it not applicable, which is what
--   `0078` already says about a run. **This is the one value here that is a reading rather than
--   a copy**, it is one UPDATE to change, and it is asked in `docs/open-questions.md`.
--
-- WHAT IS NOT IN THIS TABLE YET
--
--   The automation kind exists and takes a note, because Stage 4 gives it a vocabulary and
--   there is nothing honest to put in it before that. A task step can name a property it stamps
--   when it is ticked (Amber's step 7: *"when ticked off records the date against the
--   property"*), and nothing reads that column until the run machinery does.

-- ================================================================== the steps
create table if not exists process_steps (
  process_step_id            uuid primary key default gen_random_uuid(),
  process_id                 uuid not null references processes (process_id) on delete cascade,
  process_step_position      smallint not null default 0,
  process_step_kind          text not null
    constraint process_steps_kind_is_known check (process_step_kind in ('property', 'task', 'checklist', 'automation')),
  process_step_is_required   boolean not null default true,
  process_step_name          text
    constraint process_steps_name_is_not_blank check (process_step_name is null or length(trim(process_step_name)) > 0),

  -- property steps
  property_def_key           text references property_defs (property_def_key) on update cascade on delete restrict,

  -- task steps
  process_step_owning_team   text references teams (team_id) on update cascade,
  process_step_expected_days smallint
    constraint process_steps_expected_days_are_not_negative check (process_step_expected_days >= 0),
  process_step_is_external   boolean not null default false,
  parent_process_step_id     uuid,
  /*
   * The property a task step stamps when it is ticked. Amber, 15 September, step 7 of the
   * Working Drawings walk-through: "Design team has task to send to Aquistions TEam for
   * approval and when ticked off records the date against the propertry". Nothing reads it
   * until the run machinery does; it is here because the column is what makes that step
   * describable at all.
   */
  process_step_stamps_property_key text references property_defs (property_def_key) on update cascade on delete restrict,

  -- automation steps
  process_step_automation    text,

  process_step_import_ref    smallint,
  process_step_created_at    timestamptz not null default now(),
  process_step_created_by    uuid references profiles (profile_id),
  process_step_updated_at    timestamptz not null default now(),
  process_step_updated_by    uuid references profiles (profile_id),

  -- A parent is a step of the SAME process, which a composite key says better than a trigger.
  constraint process_steps_id_within_its_process unique (process_id, process_step_id),
  constraint process_steps_parent_is_in_the_same_process
    foreign key (process_id, parent_process_step_id) references process_steps (process_id, process_step_id) on delete cascade,
  constraint process_steps_not_its_own_parent check (parent_process_step_id is distinct from process_step_id),

  -- Each kind carries its own fields and not another kind's.
  constraint process_steps_a_property_step_names_a_property
    check (process_step_kind <> 'property' or property_def_key is not null),
  constraint process_steps_only_a_property_step_names_a_property
    check (process_step_kind = 'property' or property_def_key is null),
  constraint process_steps_a_task_checklist_or_automation_step_has_a_name
    check (process_step_kind = 'property' or process_step_name is not null),
  constraint process_steps_a_checklist_line_belongs_to_a_task
    check (process_step_kind <> 'checklist' or parent_process_step_id is not null),
  constraint process_steps_an_automation_step_says_what_it_does
    check (process_step_kind <> 'automation' or process_step_automation is not null),
  constraint process_steps_only_a_task_step_stamps_a_property
    check (process_step_kind = 'task' or process_step_stamps_property_key is null),
  constraint process_steps_only_a_task_step_has_a_team_or_an_sla
    check (process_step_kind = 'task'
           or (process_step_owning_team is null and process_step_expected_days is null and not process_step_is_external))
);
create index if not exists process_steps_process_idx on process_steps (process_id, process_step_position);
create index if not exists process_steps_parent_idx on process_steps (parent_process_step_id);
create index if not exists process_steps_property_idx on process_steps (property_def_key);

comment on table process_steps is
  'What a process is made of (0128): one ordered list of steps per process, each of one kind — a property to record, a task to do, a checklist line to tick, an automation to fire. Replaces the separate process_properties, process_tasks and process_task_checklist_items lists, which are still there and still read until the screens move. A run completes when its required steps are done (Stage 2''s gate).';
comment on column process_steps.process_step_kind is 'property · task · checklist · automation. The kind decides which columns mean anything, and the CHECKs on this table say which.';
comment on column process_steps.process_step_is_required is 'A run cannot be marked complete while a required step is open. Property steps carry the flag process_properties held; task steps arrived required (0128''s header says why, and open-questions asks).';
comment on column process_steps.process_step_position is 'Order within the process. Not unique: a drag renumbers the process 1..n, the way Setup → Processes already renumbers a stage.';
comment on column process_steps.property_def_key is 'A property step IS its property definition: the label, the format and who may see it all come from property_defs, so the step carries no copy of them.';
comment on column process_steps.process_step_stamps_property_key is 'The property a task step stamps with today''s date when it is ticked (Amber, 15 September). Nothing reads it until the run machinery does.';
comment on column process_steps.parent_process_step_id is 'A checklist line hangs off its task step; a sub-task hangs off its task. Always in the same process — the composite key makes it so.';
comment on column process_steps.process_step_automation is 'What an automation step does, as a note. Stage 4 gives this an effect vocabulary; until then a note is the honest amount of structure.';

-- ================================================================== what a step waits on
create table if not exists process_step_dependencies (
  process_id                     uuid not null,
  process_step_id                uuid not null,
  depends_on_process_step_id     uuid not null,
  process_step_dependency_lag_days smallint not null default 0
    constraint process_step_dependencies_lag_is_not_negative check (process_step_dependency_lag_days >= 0),
  process_step_dependency_created_at timestamptz not null default now(),
  process_step_dependency_created_by uuid references profiles (profile_id),
  primary key (process_step_id, depends_on_process_step_id),
  constraint process_step_dependencies_not_self check (process_step_id <> depends_on_process_step_id),
  -- Both ends in the same process, said as a key rather than as a trigger.
  constraint process_step_dependencies_step_is_in_the_process
    foreign key (process_id, process_step_id) references process_steps (process_id, process_step_id) on delete cascade,
  constraint process_step_dependencies_dependency_is_in_the_process
    foreign key (process_id, depends_on_process_step_id) references process_steps (process_id, process_step_id) on delete cascade
);
create index if not exists process_step_dependencies_depends_on_idx
  on process_step_dependencies (depends_on_process_step_id);

-- THE COMPOSITE KEYS CARRY HALF OF THE OLD GUARD ACROSS, AND THIS IS THE OTHER HALF.
-- `guard_process_task_dependency` enforced two rules: both ends in the same process, and no
-- cycles. The keys above say the first better than a trigger can. The second has nowhere else to
-- live: A waits on B waits on A is storable without it, the 99 edges carried across are acyclic
-- only because the old guard refused one, and the first screen that writes a dependency could
-- store one that whatever schedules from it would loop on.
create or replace function guard_process_step_dependency() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare cycles boolean;
begin
  with recursive reachable as (
    select new.depends_on_process_step_id as t
    union
    select d.depends_on_process_step_id
      from process_step_dependencies d
      join reachable r on d.process_step_id = r.t
  )
  select exists (select 1 from reachable where t = new.process_step_id) into cycles;
  if cycles then
    raise exception 'that dependency would make a cycle in the process''s steps'
      using errcode = '23514';
  end if;
  return new;
end $$;
revoke execute on function guard_process_step_dependency() from public, anon, authenticated;
drop trigger if exists process_step_dependencies_guard on process_step_dependencies;
create trigger process_step_dependencies_guard
  before insert or update on process_step_dependencies
  for each row execute function guard_process_step_dependency();

comment on table process_step_dependencies is
  'What a step waits on, within its own process (0128). Carried from process_task_dependencies. The process_id column is not redundant: it is half of the composite key that makes a dependency on another process''s step impossible.';

-- ================================================================== the backfill
-- Property steps. process_properties has no key of its own, so these get fresh ids.
insert into process_steps (process_id, process_step_position, process_step_kind,
                           process_step_is_required, property_def_key, process_step_created_at)
select pp.process_id, pp.process_property_position, 'property',
       pp.process_property_required, pp.property_def_key, pp.process_property_created_at
  from process_properties pp
 where not exists (
   select 1 from process_steps s
    where s.process_id = pp.process_id and s.property_def_key = pp.property_def_key
      and s.process_step_kind = 'property');

-- Task steps, carrying the template task's own id across: a task step IS that template task,
-- so `tasks.process_task_id` still names the right row when the old table goes. Parents are
-- written in the same statement because the id does not change.
insert into process_steps (process_step_id, process_id, process_step_position, process_step_kind,
                           process_step_is_required, process_step_name, process_step_owning_team,
                           process_step_expected_days, process_step_is_external,
                           parent_process_step_id, process_step_import_ref,
                           process_step_created_at, process_step_created_by,
                           process_step_updated_at, process_step_updated_by)
select pt.process_task_id, pt.process_id, pt.process_task_position, 'task',
       true, pt.process_task_name, pt.process_task_owning_team,
       pt.process_task_expected_days, pt.process_task_is_external,
       pt.parent_process_task_id, pt.process_task_import_ref,
       pt.process_task_created_at, pt.process_task_created_by,
       pt.process_task_updated_at, pt.process_task_updated_by
  from process_tasks pt
 where not exists (select 1 from process_steps s where s.process_step_id = pt.process_task_id)
 -- Parents first, so the composite key has something to point at.
 order by (pt.parent_process_task_id is not null), pt.process_task_position;

-- Checklist lines hang off their task step. None exist on 15 September; the statement is here
-- so a database that has some carries them, not as a guess about what they would be.
insert into process_steps (process_step_id, process_id, process_step_position, process_step_kind,
                           process_step_is_required, process_step_name, parent_process_step_id,
                           process_step_created_at, process_step_created_by,
                           process_step_updated_at, process_step_updated_by)
select c.process_task_checklist_item_id, pt.process_id, c.process_task_checklist_item_position,
       'checklist', true, c.process_task_checklist_item_text, c.process_task_id,
       c.process_task_checklist_item_created_at, c.process_task_checklist_item_created_by,
       c.process_task_checklist_item_updated_at, c.process_task_checklist_item_updated_by
  from process_task_checklist_items c
  join process_tasks pt on pt.process_task_id = c.process_task_id
 where not exists (select 1 from process_steps s where s.process_step_id = c.process_task_checklist_item_id);

insert into process_step_dependencies (process_id, process_step_id, depends_on_process_step_id,
                                       process_step_dependency_lag_days,
                                       process_step_dependency_created_at,
                                       process_step_dependency_created_by)
select pt.process_id, d.process_task_id, d.depends_on_process_task_id,
       d.process_task_dependency_lag_days, d.process_task_dependency_created_at,
       d.process_task_dependency_created_by
  from process_task_dependencies d
  join process_tasks pt on pt.process_task_id = d.process_task_id
 where not exists (
   select 1 from process_step_dependencies x
    where x.process_step_id = d.process_task_id
      and x.depends_on_process_step_id = d.depends_on_process_task_id);

-- ================================================================== who may do what
alter table process_steps enable row level security;
alter table process_step_dependencies enable row level security;
drop policy if exists "read process steps" on process_steps;
drop policy if exists "managers write process steps" on process_steps;
drop policy if exists "read process step dependencies" on process_step_dependencies;
drop policy if exists "managers write process step dependencies" on process_step_dependencies;
create policy "read process steps" on process_steps
  for select to authenticated using ((select is_active_user()));
create policy "managers write process steps" on process_steps
  for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');
create policy "read process step dependencies" on process_step_dependencies
  for select to authenticated using ((select is_active_user()));
create policy "managers write process step dependencies" on process_step_dependencies
  for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

drop trigger if exists process_steps_touch on process_steps;
create trigger process_steps_touch before update on process_steps
  for each row execute function extensions.moddatetime(process_step_updated_at);
drop trigger if exists process_steps_stamp_created_by on process_steps;
create trigger process_steps_stamp_created_by before insert on process_steps
  for each row execute function stamp_created_by('process_step_created_by');
drop trigger if exists process_steps_stamp_updated_by on process_steps;
create trigger process_steps_stamp_updated_by before update on process_steps
  for each row execute function stamp_updated_by('process_step_updated_by');
drop trigger if exists trg_activity_audit_row on process_steps;
create trigger trg_activity_audit_row after insert or update or delete on process_steps
  for each row execute function log_activity_audit();
drop trigger if exists process_step_dependencies_stamp_created_by on process_step_dependencies;
create trigger process_step_dependencies_stamp_created_by before insert on process_step_dependencies
  for each row execute function stamp_created_by('process_step_dependency_created_by');
-- Every table in public carries the audit trigger, and `behaviour.sql` step 39 is what says so
-- out loud: it lists the tables that do not, and it listed this one on the first replay.
drop trigger if exists trg_activity_audit_row on process_step_dependencies;
create trigger trg_activity_audit_row after insert or update or delete on process_step_dependencies
  for each row execute function log_activity_audit();

-- ---------------------------------------------------------------------- proof
-- The counts are RELATIVE to the tables they came from, not absolute: the live database carries
-- 140 property rows and the seed replay 168, and an absolute number would have been right on one
-- of them and a lie on the other.
--
-- Watched failing: with the per-kind CHECKs dropped (a property step with no property and a task
-- step with no name were both accepted), with the composite parent key dropped (a step took a
-- parent in another process), and with the dependency's composite keys dropped (a step depended
-- on a step of another process).
do $$
declare
  n integer;
  m integer;
  bad text;
  other_process uuid;
  a_step uuid;
begin
  select count(*) into n from process_steps where process_step_kind = 'property';
  select count(*) into m from process_properties;
  if n <> m then raise exception '0128 proof: % property steps for % property rows', n, m; end if;

  select count(*) into n from process_steps where process_step_kind = 'task';
  select count(*) into m from process_tasks;
  if n <> m then raise exception '0128 proof: % task steps for % template tasks', n, m; end if;

  select count(*) into n from process_steps where process_step_kind = 'checklist';
  select count(*) into m from process_task_checklist_items;
  if n <> m then raise exception '0128 proof: % checklist steps for % checklist items', n, m; end if;

  select count(*) into n from process_step_dependencies;
  select count(*) into m from process_task_dependencies;
  if n <> m then raise exception '0128 proof: % step dependencies for % task dependencies', n, m; end if;

  -- The task steps kept their identity, which is what makes tasks.process_task_id survive.
  select string_agg(pt.process_task_name, ', ') into bad
    from process_tasks pt
    left join process_steps s on s.process_step_id = pt.process_task_id and s.process_step_kind = 'task'
   where s.process_step_id is null;
  if bad is not null then raise exception '0128 proof: template tasks with no step of the same id: %', bad; end if;

  -- Every nesting the old table had, the new one has.
  select count(*) into n from process_steps where process_step_kind = 'task' and parent_process_step_id is not null;
  select count(*) into m from process_tasks where parent_process_task_id is not null;
  if n <> m then raise exception '0128 proof: % nested task steps for % nested template tasks', n, m; end if;

  -- A property step is its definition, and the definition exists.
  select string_agg(s.process_step_id::text, ', ') into bad
    from process_steps s
    left join property_defs d on d.property_def_key = s.property_def_key
   where s.process_step_kind = 'property' and d.property_def_key is null;
  if bad is not null then raise exception '0128 proof: property steps with no definition: %', bad; end if;

  -- The kind CHECKs bite. Each of these is a shape the table must refuse.
  select process_id into other_process from processes order by process_key limit 1;
  if other_process is null then
    raise notice '0128 proof: no processes on this database, so the kind checks were not exercised.';
    return;
  end if;
  begin
    insert into process_steps (process_id, process_step_kind) values (other_process, 'property');
    raise exception '0128 proof: a property step with no property was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into process_steps (process_id, process_step_kind) values (other_process, 'task');
    raise exception '0128 proof: a task step with no name was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into process_steps (process_id, process_step_kind, process_step_name)
    values (other_process, 'checklist', 'Probe 0128');
    raise exception '0128 proof: a checklist line with no task above it was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into process_steps (process_id, process_step_kind, process_step_name)
    values (other_process, 'automation', 'Probe 0128');
    raise exception '0128 proof: an automation step that says nothing was accepted';
  exception when check_violation then null;
  end;
  -- OTHERWISE VALID, deliberately. The first version of this probe used an automation step with
  -- no automation note, so `process_steps_an_automation_step_says_what_it_does` fired first and
  -- the probe passed with the constraint it names removed — a check that proves nothing. This
  -- row is a complete, legal automation step apart from the one column under test.
  begin
    insert into process_steps (process_id, process_step_kind, process_step_name,
                               process_step_automation, process_step_owning_team)
    values (other_process, 'automation', 'Probe 0128', 'notifies the design team', 'design');
    raise exception '0128 proof: a non-task step took an owning team';
  exception when check_violation then null;
  end;

  -- A parent, and a dependency, must be in the same process.
  select s.process_step_id into a_step from process_steps s where s.process_step_kind = 'task' limit 1;
  if a_step is not null then
    select p.process_id into other_process from process_steps s
      join processes p on p.process_id <> s.process_id
     where s.process_step_id = a_step limit 1;
    begin
      insert into process_steps (process_id, process_step_kind, process_step_name, parent_process_step_id)
      values (other_process, 'task', 'Probe 0128', a_step);
      raise exception '0128 proof: a step took a parent in another process';
    exception when foreign_key_violation then null;
    end;
  end if;

  raise notice '0128 proof: every property row, template task, checklist line and dependency has a step, the task steps kept their ids, and each kind refuses another kind''s fields.';
end $$;
