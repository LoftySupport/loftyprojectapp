-- 0126 — THE LIFECYCLE IS A TABLE
--
-- Stage 1 of the 15 September audit, first of two migrations. The seven lifecycle stages
-- have lived in three places at once: as rows of `pipeline_stages` under the one `pipelines`
-- row (0029), which the app reads for the board's columns and the SLA editor; as a CHECK
-- constraint repeated on four tables (jobs, projects, processes, property_defs), which is
-- what actually refuses a wrong value; and as a CASE statement in `lifecycle_position()`,
-- which is what orders them. Adding a stage meant a migration touching all three, and the
-- audit's finding 1 (three generations of "how a job moves") starts here.
--
-- Amber, 15 September, on why the lists are tables: *"the reason for having a property list
-- and process list is so that anything that can be changed or updated by the team and
-- reordered e.g. SLA, definitions, new steps in a process, a new property added to a process
-- can be done by managers in the app without a migration"*. The lifecycle is the list above
-- those lists.
--
-- WHAT THIS DOES
--
--   `lifecycle_stages`: one row per stage, keyed by a slug, with the display name every
--   stage column holds today, the position, the kind (open / won / archived / lost, from
--   `pipeline_stage_type`), the two SLA columns 0047 gave `pipeline_stages`, and is_active.
--   Seeded from the seven `pipeline_stages` rows, so replay and live agree by construction.
--
--   The four CHECKs become FOREIGN KEYS to `lifecycle_stages(lifecycle_stage_name)`. Same
--   constraint names, so a probe that knew the old name still finds the rule. The columns
--   keep holding the name: every screen, every saved view and every trigger compares on it,
--   and the dictionary called it the shared vocabulary for a reason.
--
--   `lifecycle_position(stage)` reads the table instead of a CASE. It is what the linear
--   guard, the project clamp and the cascade all order by, so a stage added as a row is
--   ordered the moment it exists. STABLE now, not IMMUTABLE; nothing indexes on it.
--
--   Policies as `pipeline_stages` had them: everyone active reads; superadmin changes what a
--   stage is; a manager may set the two SLA columns and nothing else (0096's rule, guarded
--   by a trigger the same way).
--
-- WHY THE FOREIGN KEY DOES NOT CASCADE A RENAME
--
--   `on update cascade` was the obvious choice and it is wrong here. A cascaded rename writes
--   `job_stage` on every job in that stage, and every job's stage triggers fire: "in stage
--   since" is restamped to today, the project clamp runs, and `notify_stage_changed` tells
--   everyone the job moved. Renaming a stage is not a move. So the key is `on update
--   restrict` and `on delete restrict`: adding, reordering, retiring and re-timing a stage
--   are data; renaming one that has rows is still a migration, which is also true of the
--   three end-state names the functions above spell out. Retire with `is_active = false`.
--
-- WHAT STAYS, FOR NOW
--
--   `pipelines`, `pipeline_stages`, `job_pipeline_positions` and `job_stage_events` stay
--   until Stage 5 drops them. Nothing in the app reads them after this; `verify/seeds.sh`
--   proves the app's stage list against `lifecycle_stages` from here. Their SLA columns are
--   dead: the values (all null on 15 September) were carried across.
--
-- CORRECTIONS TO THE AUDIT
--
--   It counted "six CHECKs"; there are four. It also left the permissions matrix saying the
--   SLA needs superadmin; 0096 made it a manager's, and the app's `updateStageSla` said
--   "needs superadmin" in its error. Both fixed in this branch.

-- ================================================================== the table
create table if not exists lifecycle_stages (
  lifecycle_stage_id                text primary key
    constraint lifecycle_stages_key_is_a_slug check (lifecycle_stage_id ~ '^[a-z][a-z0-9_]*$'),
  lifecycle_stage_name              text not null
    constraint lifecycle_stages_name_is_unique unique
    constraint lifecycle_stages_name_is_not_blank check (length(trim(lifecycle_stage_name)) > 0),
  lifecycle_stage_position          smallint not null
    constraint lifecycle_stages_position_is_unique unique,
  lifecycle_stage_kind              text not null default 'open'
    constraint lifecycle_stages_kind_is_known check (lifecycle_stage_kind in ('open', 'won', 'archived', 'lost')),
  lifecycle_stage_expected_days     smallint
    constraint lifecycle_stages_expected_days_positive check (lifecycle_stage_expected_days > 0),
  lifecycle_stage_at_risk_lead_days smallint
    constraint lifecycle_stages_at_risk_lead_is_positive check (lifecycle_stage_at_risk_lead_days > 0),
  constraint lifecycle_stages_at_risk_lead_fits_the_expectation
    check (lifecycle_stage_at_risk_lead_days is null
           or (lifecycle_stage_expected_days is not null
               and lifecycle_stage_at_risk_lead_days < lifecycle_stage_expected_days)),
  lifecycle_stage_is_active         boolean not null default true,
  lifecycle_stage_created_at        timestamptz not null default now(),
  lifecycle_stage_created_by        uuid references profiles (profile_id),
  lifecycle_stage_updated_at        timestamptz not null default now(),
  lifecycle_stage_updated_by        uuid references profiles (profile_id)
);

comment on table lifecycle_stages is
  'The lifecycle, as rows (0126): the seven stages a job and a project move through, in position order. Every stage column (jobs.job_stage, projects.project_stage, processes.process_stage, property_defs.property_def_stage) is a foreign key to lifecycle_stage_name. Adding, reordering, retiring and re-timing a stage is data; renaming one that has rows is a migration, because the key does not cascade (a cascaded rename would fire every job''s stage triggers). Superadmin changes what a stage is; a manager sets its SLA. Replaces the pipeline_stages rows the app read until 0126.';
comment on column lifecycle_stages.lifecycle_stage_id is 'The slug code keys on: acquisition_development, pre_construction, construction, maintenance, completed, closed, cancelled. Sub-stages (Stage 1, second migration) hang off it.';
comment on column lifecycle_stages.lifecycle_stage_name is 'The display name, and the value every stage column holds. Unique; the foreign keys point here.';
comment on column lifecycle_stages.lifecycle_stage_kind is 'open (work is on), won (Completed), archived (Closed), lost (Cancelled). From pipeline_stage_type. What the ends of the lifecycle are, for code that should not spell the names out.';
comment on column lifecycle_stages.lifecycle_stage_expected_days is 'How long a record should sit in this stage (0047, moved here from pipeline_stages). Null means no SLA is set, which is a real state and not zero.';
comment on column lifecycle_stages.lifecycle_stage_at_risk_lead_days is 'How many days before the expected-days deadline a record starts flagging at risk (0047). Needs an expectation and must be shorter than it.';
comment on column lifecycle_stages.lifecycle_stage_is_active is 'False retires a stage from pickers and new records; rows already in it keep the value. The foreign key refuses a delete while anything references the stage.';

-- The seven, from the rows the app has been reading. Joined on the name rather than slugged
-- by a regex, so the slug each stage gets is written here and nowhere else.
insert into lifecycle_stages (lifecycle_stage_id, lifecycle_stage_name, lifecycle_stage_position, lifecycle_stage_kind,
                              lifecycle_stage_expected_days, lifecycle_stage_at_risk_lead_days)
select k.slug, ps.pipeline_stage_name, ps.pipeline_stage_position, ps.pipeline_stage_type,
       ps.pipeline_stage_expected_days, ps.pipeline_stage_at_risk_lead_days
  from pipeline_stages ps
  join pipelines p using (pipeline_id)
  join (values ('acquisition_development', 'Acquisition & Development'),
               ('pre_construction',        'Pre-construction'),
               ('construction',            'Construction'),
               ('maintenance',             'Maintenance'),
               ('completed',               'Completed'),
               ('closed',                  'Closed'),
               ('cancelled',               'Cancelled')) as k(slug, name)
    on k.name = ps.pipeline_stage_name
 where p.pipeline_key = 'build_lifecycle'
on conflict (lifecycle_stage_id) do nothing;

-- ================================================================== the four keys
alter table jobs          drop constraint if exists jobs_stage_is_a_lifecycle_stage;
alter table projects      drop constraint if exists projects_stage_is_a_lifecycle_stage;
alter table processes     drop constraint if exists processes_stage_is_a_lifecycle_stage;
alter table property_defs drop constraint if exists property_defs_stage_is_a_lifecycle_stage;

alter table jobs add constraint jobs_stage_is_a_lifecycle_stage
  foreign key (job_stage) references lifecycle_stages (lifecycle_stage_name)
  on update restrict on delete restrict;
alter table projects add constraint projects_stage_is_a_lifecycle_stage
  foreign key (project_stage) references lifecycle_stages (lifecycle_stage_name)
  on update restrict on delete restrict;
alter table processes add constraint processes_stage_is_a_lifecycle_stage
  foreign key (process_stage) references lifecycle_stages (lifecycle_stage_name)
  on update restrict on delete restrict;
alter table property_defs add constraint property_defs_stage_is_a_lifecycle_stage
  foreign key (property_def_stage) references lifecycle_stages (lifecycle_stage_name)
  on update restrict on delete restrict;

-- ================================================================== the order
-- Same name, same signature, same callers (the linear guard, the project clamp and the
-- cascade); the body reads the table. Null for a name that is not a stage, as the CASE was.
create or replace function lifecycle_position(stage text) returns integer
language sql stable parallel safe set search_path = public, pg_temp as $$
  select s.lifecycle_stage_position::integer
    from lifecycle_stages s
   where s.lifecycle_stage_name = stage
$$;

-- ================================================================== who may do what
alter table lifecycle_stages enable row level security;
drop policy if exists "read lifecycle stages" on lifecycle_stages;
drop policy if exists "superadmins write lifecycle stages" on lifecycle_stages;
drop policy if exists "managers set lifecycle stage slas" on lifecycle_stages;
create policy "read lifecycle stages" on lifecycle_stages
  for select to authenticated using ((select is_active_user()));
create policy "superadmins write lifecycle stages" on lifecycle_stages
  for all to authenticated
  using ((select current_permission()) >= 'superadmin') with check ((select current_permission()) >= 'superadmin');
create policy "managers set lifecycle stage slas" on lifecycle_stages
  for update to authenticated
  using ((select current_permission()) >= 'manager') with check ((select current_permission()) >= 'manager');

-- The policy lets a manager UPDATE the row; this decides which columns. 0096's rule, in
-- 0096's shape: everything that says what the stage IS needs superadmin.
create or replace function guard_lifecycle_stage_shape_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if current_permission() >= 'superadmin'::permission_level then
    return new;
  end if;
  if new.lifecycle_stage_id        is distinct from old.lifecycle_stage_id
     or new.lifecycle_stage_name      is distinct from old.lifecycle_stage_name
     or new.lifecycle_stage_position  is distinct from old.lifecycle_stage_position
     or new.lifecycle_stage_kind      is distinct from old.lifecycle_stage_kind
     or new.lifecycle_stage_is_active is distinct from old.lifecycle_stage_is_active
     or new.lifecycle_stage_created_at is distinct from old.lifecycle_stage_created_at
     or new.lifecycle_stage_created_by is distinct from old.lifecycle_stage_created_by
  then
    raise exception
      'Changing what a lifecycle stage is needs superadmin permission. A manager may set its SLA (expected days, at-risk lead).'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists lifecycle_stages_guard_shape on lifecycle_stages;
create trigger lifecycle_stages_guard_shape before update on lifecycle_stages
  for each row execute function guard_lifecycle_stage_shape_change();
drop trigger if exists lifecycle_stages_touch on lifecycle_stages;
create trigger lifecycle_stages_touch before update on lifecycle_stages
  for each row execute function extensions.moddatetime(lifecycle_stage_updated_at);
drop trigger if exists lifecycle_stages_stamp_created_by on lifecycle_stages;
create trigger lifecycle_stages_stamp_created_by before insert on lifecycle_stages
  for each row execute function stamp_created_by('lifecycle_stage_created_by');
drop trigger if exists trg_activity_audit_row on lifecycle_stages;
create trigger trg_activity_audit_row after insert or update or delete on lifecycle_stages
  for each row execute function log_activity_audit();

-- ---------------------------------------------------------------------- proof
-- Watched failing in the verify database with the jobs key dropped (the constraint check)
-- and with the key made `on update cascade` (the rename check).
do $$
declare
  n integer;
  bad text;
begin
  select count(*) into n from lifecycle_stages;
  if n <> 7 then raise exception '0126 proof: % lifecycle stages, expected 7', n; end if;

  -- Same names, same order as the rows the app was reading.
  select string_agg(ps.pipeline_stage_name, ', ' order by ps.pipeline_stage_position) into bad
    from pipeline_stages ps join pipelines p using (pipeline_id)
    left join lifecycle_stages s on s.lifecycle_stage_name = ps.pipeline_stage_name
                                and s.lifecycle_stage_position = ps.pipeline_stage_position
   where p.pipeline_key = 'build_lifecycle' and s.lifecycle_stage_id is null;
  if bad is not null then raise exception '0126 proof: not carried across as they were: %', bad; end if;

  -- Four keys, all foreign now.
  select string_agg(conrelid::regclass::text, ', ') into bad
    from pg_constraint
   where conname in ('jobs_stage_is_a_lifecycle_stage', 'projects_stage_is_a_lifecycle_stage',
                     'processes_stage_is_a_lifecycle_stage', 'property_defs_stage_is_a_lifecycle_stage')
     and contype <> 'f';
  if bad is not null then raise exception '0126 proof: still a CHECK, not a key: %', bad; end if;
  select count(*) into n from pg_constraint
   where conname in ('jobs_stage_is_a_lifecycle_stage', 'projects_stage_is_a_lifecycle_stage',
                     'processes_stage_is_a_lifecycle_stage', 'property_defs_stage_is_a_lifecycle_stage')
     and contype = 'f';
  if n <> 4 then raise exception '0126 proof: % of 4 stage keys exist', n; end if;

  -- A name that is not a stage is refused, by the key.
  begin
    insert into property_defs (property_def_key, property_def_label, property_def_scope, property_def_stage, property_def_owning_team, property_def_format)
    values ('probe_0126', 'Probe 0126', 'job', 'Framing', 'design', 'text');
    raise exception '0126 proof: a property at stage "Framing" was accepted';
  exception when foreign_key_violation then null;
  end;

  -- A stage with rows can be neither deleted nor renamed underneath them.
  begin
    delete from lifecycle_stages where lifecycle_stage_name = 'Pre-construction';
    raise exception '0126 proof: a stage with rows was deleted';
  exception when foreign_key_violation then null;
  end;
  begin
    update lifecycle_stages set lifecycle_stage_name = 'Probe' where lifecycle_stage_name = 'Pre-construction';
    raise exception '0126 proof: a stage with rows was renamed, and every row in it would have "moved"';
  exception when foreign_key_violation then null;
  end;

  -- The order comes from the table.
  if lifecycle_position('Pre-construction') <> 2 or lifecycle_position('Cancelled') <> 7 then
    raise exception '0126 proof: lifecycle_position does not read the table';
  end if;
  if lifecycle_position('Framing') is not null then
    raise exception '0126 proof: lifecycle_position returned a position for a name that is not a stage';
  end if;

  raise notice '0126 proof: seven stages as rows, four foreign keys, the order from the table, and a stage with rows can be neither deleted nor renamed.';
end $$;
