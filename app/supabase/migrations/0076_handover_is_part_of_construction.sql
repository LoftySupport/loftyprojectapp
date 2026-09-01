-- =============================================================================
-- 0076 — handover is part of construction; the fourth phase is Maintenance
-- =============================================================================
-- Amber, 1 September, with the lifecycle sheet of the properties-and-processes
-- workbook:
--
--   "the handover and maintenance life cycle stage has just been changed to
--    maintenance as handover is part of construction phase."
--
-- The workbook's own process list says the same thing in data: "7 - Handover" is the
-- last of the seven Construction processes, after Practical Completion. A stage named
-- for something that happens in the stage before it was always going to confuse the
-- board, and this is the last cheap moment to fix it — 66 jobs, none imported, none on
-- a contract that names a phase.
--
-- WHAT CHANGES, AND WHAT DOES NOT
--
--   The name. Position 4 is still position 4; the seven-position order, the direction
--   guard, the archive clock and the project cascade are untouched. `lifecycle_position`
--   is redefined only because it spells the names out, and it is the single source of
--   the order (0039), so it has to be told.
--
--   The workbook spells the first two "Aquistion & Development" and "Pre-Constructions".
--   Those are not adopted: they are typos, the database's spellings are the ones the app
--   and every saved view already carry, and correcting a name is an UPDATE any day.
--
-- WHY THE CHECKS ARE DROPPED FIRST
--
--   The rows have to move before the constraint that refuses the old word can be added,
--   and the constraint that refuses the new word has to go before the rows can move.
--   Same shape as 0045's Closed -> Completed rename, and for the same reason.
-- =============================================================================

-- ---------------------------------------------------------------- the CHECKs
alter table jobs          drop constraint if exists jobs_stage_is_a_lifecycle_stage;
alter table projects      drop constraint if exists projects_stage_is_a_lifecycle_stage;
alter table property_defs drop constraint if exists property_defs_stage_is_a_lifecycle_stage;

-- The direction guards stand aside when auth.uid() is null (a migration is not a
-- person), so the rename is not read as a backward move. Touch triggers still fire and
-- would restamp job_stage_entered_at — which would lie about how long these jobs have
-- been in the phase — so the stamp is carried across explicitly.
update jobs
   set job_stage = 'Maintenance',
       job_stage_entered_at = job_stage_entered_at
 where job_stage = 'Handover & Maintenance';

update projects
   set project_stage = 'Maintenance',
       project_stage_entered_at = project_stage_entered_at
 where project_stage = 'Handover & Maintenance';

update property_defs
   set property_def_stage = 'Maintenance'
 where property_def_stage = 'Handover & Maintenance';

alter table jobs add constraint jobs_stage_is_a_lifecycle_stage
  check (job_stage in ('Acquisition & Development', 'Pre-construction', 'Construction',
                       'Maintenance', 'Completed', 'Closed', 'Cancelled'));

alter table projects add constraint projects_stage_is_a_lifecycle_stage
  check (project_stage in ('Acquisition & Development', 'Pre-construction', 'Construction',
                           'Maintenance', 'Completed', 'Closed', 'Cancelled'));

-- 0043 listed the five names of its day and was never told about Completed and
-- Cancelled — a property captured at Completed (a handover survey, say) could not be
-- defined. All seven now, matching the two record tables exactly.
alter table property_defs add constraint property_defs_stage_is_a_lifecycle_stage
  check (property_def_stage in ('Acquisition & Development', 'Pre-construction', 'Construction',
                                'Maintenance', 'Completed', 'Closed', 'Cancelled'));

-- ------------------------------------------------------------------ the order
create or replace function lifecycle_position(stage text)
returns integer
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case stage
    when 'Acquisition & Development' then 1
    when 'Pre-construction'          then 2
    when 'Construction'              then 3
    when 'Maintenance'               then 4
    when 'Completed'                 then 5
    when 'Closed'                    then 6
    when 'Cancelled'                 then 7
  end
$$;

-- ------------------------------------------------------------- the stage row
update pipeline_stages ps
   set pipeline_stage_name = 'Maintenance'
  from pipelines p
 where p.pipeline_id = ps.pipeline_id
   and p.pipeline_key = 'build_lifecycle'
   and ps.pipeline_stage_name = 'Handover & Maintenance';

comment on column jobs.job_stage is
  'Where the job sits in the lifecycle everybody shares: four working phases — Acquisition & Development, Pre-construction, Construction (handover is its last process), Maintenance — then Completed (done), Closed (the archive, 12 months after Completed or Cancelled, hidden by default) and Cancelled (stopped without completing; terminal since 0057, cloned rather than revived). Forwards-only. Text with a check rather than an enum — a vocabulary that changes must be able to lose a value, and 0076 renamed one.';

comment on column projects.project_stage is
  'Where the project sits in the lifecycle — the same seven positions and the same rules as jobs.job_stage. Follows its slowest non-cancelled job upwards (0041), carries its lagging jobs up when moved (0046), archives on its own 12-month clock, and fires nothing while Cancelled.';

-- ---------------------------------------------------------------------- proof
do $$
declare
  names text;
  leftovers integer;
begin
  select string_agg(pipeline_stage_name || '/' || pipeline_stage_type, ' > ' order by pipeline_stage_position)
    into names
  from pipeline_stages ps join pipelines p using (pipeline_id)
  where p.pipeline_key = 'build_lifecycle';

  if names is distinct from
     'Acquisition & Development/open > Pre-construction/open > Construction/open > '
     || 'Maintenance/open > Completed/won > Closed/archived > Cancelled/lost'
  then
    raise exception 'lifecycle is wrong after the rename: %', coalesce(names, '(none)');
  end if;

  select count(*) into leftovers
  from (select job_stage as s from jobs
        union all select project_stage from projects
        union all select property_def_stage from property_defs) t
  where t.s = 'Handover & Maintenance';
  if leftovers <> 0 then
    raise exception '% row(s) still say Handover & Maintenance', leftovers;
  end if;

  if lifecycle_position('Maintenance') <> 4 or lifecycle_position('Handover & Maintenance') is not null then
    raise exception 'lifecycle_position() was not retaught';
  end if;

  -- The constraint as installed, the way 0035 checks it: the quoted literal, so
  -- "Maintenance" is not found inside "Handover & Maintenance".
  select pg_get_constraintdef(oid) into strict names
  from pg_constraint
  where conrelid = 'jobs'::regclass and conname = 'jobs_stage_is_a_lifecycle_stage';
  if names like '%''Handover & Maintenance''::text%' or names not like '%''Maintenance''::text%' then
    raise exception 'the jobs stage check was not retaught: %', names;
  end if;

  raise notice 'ok  lifecycle: % ', names;
end $$;
