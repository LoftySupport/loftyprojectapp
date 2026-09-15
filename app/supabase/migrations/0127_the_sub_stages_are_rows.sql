-- 0127 — THE SUB-STAGES ARE ROWS
--
-- Stage 1 of the 15 September audit, the second of its two migrations. 0126 made the seven
-- lifecycle stages a table; this makes what sits inside each stage a table too, and gives
-- every process its place in one.
--
-- WHAT A SUB-STAGE IS, AND WHERE THE LIST CAME FROM
--
--   Amber, 15 September, on Working Drawings: *"in pre-construction (lifecycle) stage 2
--   (substage) a number of processes occur"*. A sub-stage is the block of a lifecycle stage
--   that a group of processes belongs to, and it is what a job is "at" inside a stage. Until
--   now it was `processes.process_stage_group`, free text the workbook load wrote and the
--   Setup → Processes page let a manager type: a heading, not a thing.
--
--   Asked whether the groups the data already held were the sub-stages, stage by stage,
--   Amber, 15 September: *"Yes, as the data reads."* So:
--
--     Acquisition & Development   Project Creation · Job Creation
--     Pre-construction            Stage 1 · Stage 2 · Stage 3
--     Construction                Footings · Frame · External Cladding · Roof Cover · 2nd Fix ·
--                                 Practical Completion · Handover
--     Maintenance                 1 Month · 2 Month · 3 Month   (Amber, 15 September; the one
--                                 process, 1 Month Checkin, sits in the first)
--     Cancelled                   PWA Cancellation · Contract Cancellation
--     Completed, Closed           none
--
--   Positions follow the workbook's process order, which puts External Cladding before Roof
--   Cover. (0124's header listed those two the other way round; that was an inference from
--   the property groups, and the workbook is the record.)
--
--   The Construction "Variation" group is not a sub-stage. Under decision 7 a variation is a
--   record of its own that processes run on, so the one Variation process is parked: retired
--   (`process_is_active = false`) with no sub-stage, until variations exist as records and
--   it has something to run on. It has never run. Parking is named in advance and anything
--   else raises rather than being retired quietly — see the block that does it.
--
-- WHAT THIS DOES
--
--   `lifecycle_substages`: a uuid key (renaming is data, so the key is not the name), the
--   stage it belongs to, the name (unique within the stage), a position, is_active, a
--   description, stamps. Managers write it: adding a sub-stage, renaming, reordering and
--   retiring one are the edits Amber wants done in the app without a migration.
--
--   `processes.lifecycle_substage_id`, backfilled from (stage, group); a CHECK that an
--   active process has one; a guard that a process's sub-stage belongs to the process's
--   stage. `processes.process_is_optional`, default false: the flag Stage 2's completion
--   gate will read, so a sub-stage can hold processes that do not have to finish.
--
--   `process_stage_group` goes. `process_run_display` is rebuilt to carry the sub-stage's
--   id and name in its place.
--
-- WHY THE VIEW IS DROPPED AND RE-CREATED
--
--   `create or replace view` cannot remove a column, and the view carried
--   `process_stage_group`. Nothing depends on the view (`notify_scan` reads it by name from
--   inside a function, which survives). security_invoker and the grants are restated.

-- A LIVE APPLY TAKES `processes` EXCLUSIVELY, FOUR TIMES. 0126's first attempt died of a
-- deadlock (40P01) against live traffic holding a read lock, and applied on the retry. This
-- one adds two columns, adds a constraint and drops a column, and rebuilds a view people are
-- reading. Rather than queue behind a reader and take the whole thing down with it, fail fast
-- and retry: five seconds is longer than any read here and shorter than anybody notices.
set lock_timeout = '5s';

-- ================================================================== the table
create table if not exists lifecycle_substages (
  lifecycle_substage_id          uuid primary key default gen_random_uuid(),
  lifecycle_stage_id             text not null
    references lifecycle_stages (lifecycle_stage_id) on update cascade on delete restrict,
  lifecycle_substage_name        text not null
    constraint lifecycle_substages_name_is_not_blank check (length(trim(lifecycle_substage_name)) > 0),
  lifecycle_substage_position    smallint not null default 0,
  lifecycle_substage_is_active   boolean not null default true,
  lifecycle_substage_description text,
  lifecycle_substage_created_at  timestamptz not null default now(),
  lifecycle_substage_created_by  uuid references profiles (profile_id),
  lifecycle_substage_updated_at  timestamptz not null default now(),
  lifecycle_substage_updated_by  uuid references profiles (profile_id),
  constraint lifecycle_substages_name_is_unique_in_its_stage unique (lifecycle_stage_id, lifecycle_substage_name)
);
create index if not exists lifecycle_substages_stage_idx
  on lifecycle_substages (lifecycle_stage_id, lifecycle_substage_position);

comment on table lifecycle_substages is
  'The blocks inside a lifecycle stage, as rows (0127): what a group of processes belongs to, and what a job is at inside a stage. Seeded from the process stage groups the workbook carried, on Amber''s yes of 15 September. Managers add, rename, reorder and retire them in the app; a sub-stage with processes cannot be deleted. Replaces processes.process_stage_group.';
comment on column lifecycle_substages.lifecycle_substage_id is 'A uuid, not the name: renaming a sub-stage is data, and nothing has to follow.';
comment on column lifecycle_substages.lifecycle_stage_id is 'The lifecycle stage this block sits in (0126''s slug).';
comment on column lifecycle_substages.lifecycle_substage_name is 'What the block is called: Stage 1, Footings, 1 Month. Unique within its stage.';
comment on column lifecycle_substages.lifecycle_substage_position is 'Order within the stage: the flow a job moves through. Setup → Processes reorders it.';
comment on column lifecycle_substages.lifecycle_substage_is_active is 'False retires a block from pickers; processes already in it keep their place.';

insert into lifecycle_substages (lifecycle_stage_id, lifecycle_substage_name, lifecycle_substage_position)
values
  ('acquisition_development', 'Project Creation',      1),
  ('acquisition_development', 'Job Creation',          2),
  ('pre_construction',        'Stage 1',               1),
  ('pre_construction',        'Stage 2',               2),
  ('pre_construction',        'Stage 3',               3),
  ('construction',            'Footings',              1),
  ('construction',            'Frame',                 2),
  ('construction',            'External Cladding',     3),
  ('construction',            'Roof Cover',            4),
  ('construction',            '2nd Fix',               5),
  ('construction',            'Practical Completion',  6),
  ('construction',            'Handover',              7),
  ('maintenance',             '1 Month',               1),
  ('maintenance',             '2 Month',               2),
  ('maintenance',             '3 Month',               3),
  ('cancelled',               'PWA Cancellation',      1),
  ('cancelled',               'Contract Cancellation', 2)
on conflict (lifecycle_stage_id, lifecycle_substage_name) do nothing;

-- ================================================================== the process's place
alter table processes add column if not exists lifecycle_substage_id uuid
  references lifecycle_substages (lifecycle_substage_id) on update cascade on delete restrict;
alter table processes add column if not exists process_is_optional boolean not null default false;
create index if not exists processes_substage_idx on processes (lifecycle_substage_id);

comment on column processes.lifecycle_substage_id is
  'The sub-stage this process belongs to (0127). Required while the process is active; must be a sub-stage of the process''s own stage. Replaces process_stage_group.';
comment on column processes.process_is_optional is
  'True when a sub-stage can complete without this process finishing (0127). Read by Stage 2''s completion gate; false for every process on the day.';

-- Backfill by (stage, group). The names came FROM this column, so the join is the same
-- words -- but the column is free text a person typed, which is the whole reason it is being
-- replaced: "stage 1", "Stage 1 " and "Stage 1" are three strings and one block. So the join
-- is on the trimmed, case-folded name, which cannot misplace a row (the seeded names differ
-- by more than case and space) and absorbs exactly those twins.
update processes p
   set lifecycle_substage_id = s.lifecycle_substage_id
  from lifecycle_substages s
  join lifecycle_stages ls on ls.lifecycle_stage_id = s.lifecycle_stage_id
 where p.lifecycle_substage_id is null
   and ls.lifecycle_stage_name = p.process_stage
   and lower(trim(s.lifecycle_substage_name)) = lower(trim(p.process_stage_group));

-- Maintenance's one process carried no group; Amber put it in 1 Month.
update processes p
   set lifecycle_substage_id = (select s.lifecycle_substage_id from lifecycle_substages s
                                 where s.lifecycle_stage_id = 'maintenance' and s.lifecycle_substage_name = '1 Month')
 where p.lifecycle_substage_id is null and p.process_stage = 'Maintenance';

-- 0079 seeded the Acquisition & Development and Construction processes with NO group, and
-- the groups they carry on the live database were typed in the app afterwards. So a
-- database replayed from the migrations alone (the verify harness) has nine active
-- processes the name join cannot place. Each is the one process of its block and is named
-- for it, and the live database of 15 September carried exactly these pairs, so the same
-- words are written here by key. On the live database every row below already has its
-- sub-stage and this changes nothing.
update processes p
   set lifecycle_substage_id = s.lifecycle_substage_id
  from (values
          ('project_creation',     'acquisition_development', 'Project Creation'),
          ('job_creation',         'acquisition_development', 'Job Creation'),
          ('footings',             'construction',            'Footings'),
          ('frame',                'construction',            'Frame'),
          ('external_cladding',    'construction',            'External Cladding'),
          ('roof_cover',           'construction',            'Roof Cover'),
          ('second_fix',           'construction',            '2nd Fix'),
          ('practical_completion', 'construction',            'Practical Completion'),
          ('handover',             'construction',            'Handover')
       ) as k (process_key, lifecycle_stage_id, lifecycle_substage_name)
  join lifecycle_substages s
    on s.lifecycle_stage_id = k.lifecycle_stage_id and s.lifecycle_substage_name = k.lifecycle_substage_name
  join lifecycle_stages ls on ls.lifecycle_stage_id = s.lifecycle_stage_id
 where p.lifecycle_substage_id is null
   and p.process_key = k.process_key
   and p.process_stage = ls.lifecycle_stage_name;

-- Whatever is still active with nowhere to go is PARKED: inactive, no sub-stage, kept.
-- Not guessed into a block, because a guess would be read back as a decision.
--
-- PARKING IS NAMED IN ADVANCE, AND ANYTHING ELSE STOPS THE MIGRATION. Retiring a process is
-- not a small thing: it leaves Setup's list, the board's columns and anything that would
-- start a run. Silently retiring one because somebody typed a block name this migration
-- does not know about would be the "plausible value" failure in reverse, so the expected
-- set is written out and an unexpected member raises.
--
--   `variation`   — live and replay. Under decision 7 a variation is a record of its own
--                   that processes run on; this process waits for that. It has never run.
--   `pwa`, `kbs`  — THE SEED REPLAY ONLY. `0079` seeded both without a group, and on the
--                   live database of 15 September both carry one somebody typed in the app
--                   (`pwa` in Pre-construction's Stage 1, `kbs` in Stage 3), so live places
--                   them by the join above and never reaches this statement for them.
--
-- And the evidence survives: the group each parked process held is written into its
-- description before the column goes, so a wrong park can be undone by reading the row
-- rather than by restoring a backup.
do $$
declare
  parked    text;
  unexpected text;
begin
  select string_agg(process_key, ', ' order by process_stage, process_position) into parked
    from processes where process_is_active and lifecycle_substage_id is null;

  select string_agg(process_key || ' (group ' || coalesce(quote_literal(process_stage_group), 'null')
                    || ', stage ' || process_stage || ')', '; ' order by process_key)
    into unexpected
    from processes
   where process_is_active and lifecycle_substage_id is null
     and process_key not in ('variation', 'pwa', 'kbs');
  if unexpected is not null then
    raise exception '0127: % would be retired for want of a sub-stage, and that is not one of the three this migration expects. Add the sub-stage, or fix the group, and re-run.', unexpected;
  end if;

  update processes
     set process_is_active = false,
         process_description = trim(both from coalesce(process_description || ' ', '')
           || '(Retired by 0127: it had no sub-stage to move into. Its group was '
           || coalesce(quote_literal(process_stage_group), 'blank') || '.)')
   where process_is_active and lifecycle_substage_id is null;
  raise notice '0127: parked with no sub-stage: %', coalesce(parked, '(none)');
end $$;

alter table processes drop constraint if exists processes_active_has_substage;
alter table processes add constraint processes_active_has_substage
  check (not process_is_active or lifecycle_substage_id is not null);

-- A process's sub-stage belongs to the process's stage. errcode 23514 so the harness reads
-- it as the check it is.
create or replace function guard_process_substage_in_stage() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  stage_of_substage text;
begin
  if new.lifecycle_substage_id is null then
    return new;
  end if;
  select ls.lifecycle_stage_name into stage_of_substage
    from lifecycle_substages s
    join lifecycle_stages ls on ls.lifecycle_stage_id = s.lifecycle_stage_id
   where s.lifecycle_substage_id = new.lifecycle_substage_id;
  if stage_of_substage is distinct from new.process_stage then
    raise exception 'That sub-stage belongs to %, and this process is in %. Pick a sub-stage of %.',
      coalesce(stage_of_substage, 'no stage'), new.process_stage, new.process_stage
      using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists processes_guard_substage_in_stage on processes;
create trigger processes_guard_substage_in_stage
  before insert or update of lifecycle_substage_id, process_stage on processes
  for each row execute function guard_process_substage_in_stage();

-- Nobody calls a trigger function. `0010` and `0011` set the convention and every
-- migration since has followed it: a SECURITY DEFINER function gets its EXECUTE revoked
-- from public, anon and authenticated, because PostgREST publishes a zero-argument
-- function at /rest/v1/rpc/<name> whether or not it makes sense to call.
--
-- The second revoke here is `0126`'s, not this migration's. Supabase's advisor flagged it
-- the moment 0126 reached the live database ("Public Can Execute SECURITY DEFINER
-- Function"), and 0126 is applied, so it cannot be edited. Calling either one over the API
-- fails with "trigger functions can only be called as triggers" — watched, as the
-- authenticated role — so this is the advisor's line rather than an open door; it rides
-- here because it is one statement and a third migration for it would be churn.
revoke execute on function guard_process_substage_in_stage() from public, anon, authenticated;
revoke execute on function guard_lifecycle_stage_shape_change() from public, anon, authenticated;

-- ================================================================== the view, then the column
drop view if exists process_run_display;
create view process_run_display with (security_invoker = true) as
 select r.process_run_id,
    r.process_id,
    p.process_key,
    p.process_name,
    p.process_stage,
    p.lifecycle_substage_id as process_substage_id,
    s.lifecycle_substage_name as process_substage_name,
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
    r.process_run_started_at::date + p.process_expected_days::integer as process_run_due_date,
    r.process_run_started_at::date + p.process_expected_days::integer - p.process_at_risk_lead_days::integer as process_run_at_risk_date,
        case
            when r.process_run_status = 'complete' then 'complete'
            when r.process_run_status = 'not_applicable' then 'not_applicable'
            when r.process_run_status = 'not_started' then 'not_started'
            when p.process_expected_days is null then 'no_expectation'
            when current_date > (r.process_run_started_at::date + p.process_expected_days::integer) then 'overdue'
            when p.process_at_risk_lead_days is not null and current_date >= (r.process_run_started_at::date + p.process_expected_days::integer - p.process_at_risk_lead_days::integer) then 'at_risk'
            else 'on_track'
        end as process_run_health,
    r.process_run_completed_at::date - r.process_run_started_at::date as process_run_days_taken
   from process_runs r
     join processes p on p.process_id = r.process_id
     left join lifecycle_substages s on s.lifecycle_substage_id = p.lifecycle_substage_id
     left join jobs j on j.job_id = r.job_id;
comment on view process_run_display is
  'One process, on one record, one attempt (0078), with the dates and health the view derives from the process''s SLA. Since 0127 it carries the sub-stage''s id and name where it carried the free-text group. security_invoker: the process_runs policy decides who sees what.';
grant select on process_run_display to authenticated, service_role;

alter table processes drop column if exists process_stage_group;

-- ================================================================== who may do what
alter table lifecycle_substages enable row level security;
drop policy if exists "read lifecycle substages" on lifecycle_substages;
drop policy if exists "managers write lifecycle substages" on lifecycle_substages;
create policy "read lifecycle substages" on lifecycle_substages
  for select to authenticated using ((select is_active_user()));
create policy "managers write lifecycle substages" on lifecycle_substages
  for all to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

drop trigger if exists lifecycle_substages_touch on lifecycle_substages;
create trigger lifecycle_substages_touch before update on lifecycle_substages
  for each row execute function extensions.moddatetime(lifecycle_substage_updated_at);
drop trigger if exists lifecycle_substages_stamp_created_by on lifecycle_substages;
create trigger lifecycle_substages_stamp_created_by before insert on lifecycle_substages
  for each row execute function stamp_created_by('lifecycle_substage_created_by');
drop trigger if exists lifecycle_substages_stamp_updated_by on lifecycle_substages;
create trigger lifecycle_substages_stamp_updated_by before update on lifecycle_substages
  for each row execute function stamp_updated_by('lifecycle_substage_updated_by');
drop trigger if exists trg_activity_audit_row on lifecycle_substages;
create trigger trg_activity_audit_row after insert or update or delete on lifecycle_substages
  for each row execute function log_activity_audit();

-- ---------------------------------------------------------------------- proof
-- Watched failing in the verify database with the guard trigger dropped (a Construction
-- process accepted a Pre-construction sub-stage) and with the CHECK dropped (an active
-- process with no sub-stage was accepted).
do $$
declare
  n integer;
  bad text;
begin
  select count(*) into n from lifecycle_substages;
  if n <> 17 then raise exception '0127 proof: % sub-stages, expected 17', n; end if;

  select string_agg(process_name, ', ') into bad from processes
   where process_is_active and lifecycle_substage_id is null;
  if bad is not null then raise exception '0127 proof: active with no sub-stage: %', bad; end if;

  select string_agg(p.process_name, ', ') into bad
    from processes p
    join lifecycle_substages s on s.lifecycle_substage_id = p.lifecycle_substage_id
    join lifecycle_stages ls on ls.lifecycle_stage_id = s.lifecycle_stage_id
   where ls.lifecycle_stage_name <> p.process_stage;
  if bad is not null then raise exception '0127 proof: sub-stage in another stage: %', bad; end if;

  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'processes' and column_name = 'process_stage_group') then
    raise exception '0127 proof: process_stage_group is still there';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'process_run_display' and column_name = 'process_substage_name') then
    raise exception '0127 proof: process_run_display does not carry the sub-stage name';
  end if;
  select count(*) into n from process_run_display;
  if n <> (select count(*) from process_runs) then raise exception '0127 proof: the rebuilt view lost rows'; end if;

  -- The guard, and the CHECK.
  begin
    insert into processes (process_key, process_name, process_stage, process_scope, lifecycle_substage_id)
    select 'probe_0127_wrong_stage', 'Probe 0127', 'Construction', 'job', lifecycle_substage_id
      from lifecycle_substages where lifecycle_stage_id = 'pre_construction' and lifecycle_substage_name = 'Stage 1';
    raise exception '0127 proof: a Construction process took a Pre-construction sub-stage';
  exception when check_violation then null;
  end;
  begin
    insert into processes (process_key, process_name, process_stage, process_scope)
    values ('probe_0127_no_substage', 'Probe 0127', 'Construction', 'job');
    raise exception '0127 proof: an active process with no sub-stage was accepted';
  exception when check_violation then null;
  end;
  begin
    delete from lifecycle_substages where lifecycle_stage_id = 'pre_construction' and lifecycle_substage_name = 'Stage 1';
    raise exception '0127 proof: a sub-stage with processes was deleted';
  exception when foreign_key_violation then null;
  end;

  -- Neither guard is callable over the API. Watched failing by granting execute back.
  if has_function_privilege('authenticated', 'guard_process_substage_in_stage()', 'execute')
     or has_function_privilege('anon', 'guard_process_substage_in_stage()', 'execute')
     or has_function_privilege('authenticated', 'guard_lifecycle_stage_shape_change()', 'execute')
     or has_function_privilege('anon', 'guard_lifecycle_stage_shape_change()', 'execute') then
    raise exception '0127 proof: a guard trigger function is still callable over the API';
  end if;

  raise notice '0127 proof: 17 sub-stages, every active process in one of its own stage, the group column gone, the view rebuilt, the guard and the check biting, and neither guard callable over the API.';
end $$;
