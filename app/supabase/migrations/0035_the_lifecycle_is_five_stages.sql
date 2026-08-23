-- =============================================================================
-- 0035 — the lifecycle is five stages, and nobody owns one
-- =============================================================================
-- Two corrections from Amber, both to values I put here rather than to the shape.
--
-- 1. THE LIFECYCLE HAS FIVE STAGES, NOT NINE
--
--    "the only thing that is certain is that a job goes from acquisition and development
--     > pre-construction > construction > handover and maintenance > closed"
--
--    The nine came from the `stage` enum, which came from the prototype, which came from
--    a workshop. Four of them — Planning & Engineering, Working Drawings & Contracts,
--    Scheduling & Estimating, Post-construction & Closeout — are **processes that run
--    inside a phase**, not phases. And Handover and Maintenance are one stage, which
--    answers the question 0029 left in a comment for Amber.
--
--    That distinction is the whole nested-pipeline design, arriving from the business
--    rather than from the schema: the lifecycle is what everyone sees, and what a team
--    does inside a phase is their own pipeline hanging off it. Design wanting to run a
--    job through Working Drawings and watch it on a kanban is a nested pipeline under
--    Pre-construction, not a column on the board everyone shares.
--
-- 2. NO TEAM OWNS A PHASE
--
--    Every one of the nine carried an owning team. I seeded those, nobody confirmed them,
--    and the answer is that they are wrong in principle rather than in detail: several
--    teams work inside one phase, which is the same fact that makes `job_engaged_teams`
--    an array. Ownership belongs to the job and to the stages of a nested pipeline, not
--    to a phase of the lifecycle.
--
--    The column stays. A nested pipeline's stages very plausibly do have an owning team —
--    Design owns every column of its own board. Nulling the lifecycle's is the correction.
--
-- WHY NOW, AND WHY THIS IS CHEAP
--
--    Zero jobs. The stage vocabulary is a spine decision and this is the last moment it
--    costs nothing: after the import it is 200 rows whose position a person verified.
--
-- WHY job_stage STOPS BEING AN ENUM
--
--    An enum value can be added and never removed. Renaming the vocabulary means the old
--    nine would linger in the type forever, and `stage` would accumulate every name the
--    business ever tried — which is precisely the trap `schema-plan.md` argues against for
--    stages and the reason `job_status` is already text with a check.
--
--    So `jobs.job_stage` becomes text with a check constraint. The five values are
--    enforced, the vocabulary can change again with an ALTER rather than a type migration,
--    and the enum type is dropped once nothing references it.
-- =============================================================================

-- job_display reads job_stage, and Postgres refuses to alter a column a view depends on —
-- so the view goes first and is recreated below, verbatim apart from the retyped column.
drop view if exists job_display;

-- ------------------------------------------------------------------ job_stage
-- Nothing to migrate: 0 jobs. The USING clause is written anyway, because a migration
-- has to produce the same database whenever it runs, and it maps the old vocabulary onto
-- the new one rather than failing on a value it did not expect.
alter table jobs alter column job_stage drop default;

alter table jobs
  alter column job_stage type text
  using case job_stage::text
    when 'Sales & Acquisition'           then 'Acquisition & Development'
    when 'Planning & Engineering'        then 'Pre-construction'
    when 'Working Drawings & Contracts'  then 'Pre-construction'
    when 'Pre-construction'              then 'Pre-construction'
    when 'Scheduling & Estimating'       then 'Pre-construction'
    when 'Construction'                  then 'Construction'
    when 'Post-construction & Closeout'  then 'Construction'
    when 'Handover'                      then 'Handover & Maintenance'
    when 'Maintenance'                   then 'Handover & Maintenance'
    else 'Acquisition & Development'
  end;

alter table jobs alter column job_stage set default 'Acquisition & Development';

alter table jobs add constraint jobs_stage_is_a_lifecycle_stage
  check (job_stage in ('Acquisition & Development', 'Pre-construction',
                       'Construction', 'Handover & Maintenance', 'Closed'));

comment on column jobs.job_stage is
  'Where the job sits in the build lifecycle — the five phases everybody shares. Text with a check rather than an enum, because a vocabulary that changes must be able to lose a value and an enum cannot. What a team does *inside* a phase is a nested pipeline and a job_pipeline_positions row, not a value here.';

-- ------------------------------------------------------------- the stage enum
-- Dropped only once nothing references it. If something still does this raises, which is
-- the outcome to want: a silent CASCADE here would take a column with it.
drop type if exists stage;

create view job_display with (security_invoker = true) as
  select j.job_id,
         j.project_id,
         j.job_number_old,
         p.project_type,
         j.job_status,
         is_current(j.job_status) as job_is_current,
         j.job_stage,
         j.job_stage_entered_at,
         j.job_owning_team,
         j.job_engaged_teams,
         j.job_assignee_id,
         cur.address_consolidated  as job_current_address,
         orig.address_consolidated as job_original_address,
         cur.address_suburb        as job_suburb
  from jobs j
  join projects p using (project_id)
  join addresses cur  on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id;

comment on view job_display is
  'A job with the things a card needs joined on: its project type, both addresses and whether it is still live. security_invoker so RLS on jobs decides who sees what.';

-- --------------------------------------------------------- the lifecycle itself
-- Replaced rather than edited. Five rows in, nine out, and the positions renumbered —
-- an UPDATE per row would leave whichever of the nine had no counterpart behind.
--
-- job_pipeline_positions references (pipeline_id, pipeline_stage_id), so deleting stages
-- would take positions with them. There are none, and the delete is written to fail
-- rather than cascade if that ever stops being true.
do $$
declare
  lifecycle uuid;
  parked    integer;
begin
  select pipeline_id into lifecycle from pipelines where pipeline_key = 'build_lifecycle';
  if lifecycle is null then
    raise exception 'no build_lifecycle pipeline to correct';
  end if;

  select count(*) into parked from job_pipeline_positions where pipeline_id = lifecycle;
  if parked > 0 then
    raise exception
      '% job(s) are parked in a lifecycle stage. Re-point them before changing the vocabulary.', parked;
  end if;

  delete from pipeline_stages where pipeline_id = lifecycle;

  insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position,
                               pipeline_stage_type, pipeline_stage_owning_team)
  select lifecycle, s.name, s.position, s.stage_type, null
  from (values
    ('Acquisition & Development', 1::smallint, 'open'),
    ('Pre-construction',          2,           'open'),
    ('Construction',              3,           'open'),
    ('Handover & Maintenance',    4,           'open'),
    -- The only terminal one. A job that stops for a bad reason is cancelled, which is a
    -- status: position says where it got to, status says how it is going, and collapsing
    -- them would make "cancelled during construction" unrepresentable.
    ('Closed',                    5,           'won')
  ) as s(name, position, stage_type);
end $$;

-- Belt and braces on point 2. Written as a statement rather than relying on the insert
-- above, so a later stage added by hand with an owner shows up here as a change of intent.
update pipeline_stages ps
   set pipeline_stage_owning_team = null
  from pipelines p
 where p.pipeline_id = ps.pipeline_id
   and p.pipeline_key = 'build_lifecycle'
   and ps.pipeline_stage_owning_team is not null;

comment on column pipeline_stages.pipeline_stage_owning_team is
  'Which team owns this stage — null on every lifecycle phase, because no team owns a phase: several work inside one, which is the same fact that makes job_engaged_teams an array. Meaningful on a nested pipeline, where a team does own every column of its own board.';

-- ---------------------------------------------------------------------- proof
do $$
declare
  names    text;
  owners   integer;
  bad_name text;
begin
  select string_agg(pipeline_stage_name, ' > ' order by pipeline_stage_position),
         count(*) filter (where pipeline_stage_owning_team is not null)
    into names, owners
  from pipeline_stages ps join pipelines p using (pipeline_id)
  where p.pipeline_key = 'build_lifecycle';

  if names is distinct from
     'Acquisition & Development > Pre-construction > Construction > Handover & Maintenance > Closed'
  then
    raise exception 'lifecycle is wrong: %', coalesce(names, '(none)');
  end if;

  if owners <> 0 then
    raise exception '% lifecycle stage(s) still name an owning team', owners;
  end if;

  -- The constraint as INSTALLED, not as I typed it above.
  --
  -- Three attempts at a probe that inserted a row taught the useful thing here: `jobs`
  -- has four columns a trigger fills in, and LIKE copies neither triggers nor foreign
  -- keys, so an isolated copy needs half the table supplied by hand before it can reject
  -- anything — at which point the probe is testing the scaffolding. Proving the check
  -- BITES needs fixtures, so it lives in constraints.sql, which has them and exists for
  -- exactly that. What belongs here is that the right constraint arrived.
  select pg_get_constraintdef(oid) into strict names
  from pg_constraint
  where conrelid = 'jobs'::regclass and conname = 'jobs_stage_is_a_lifecycle_stage';

  foreach bad_name in array array[
    'Sales & Acquisition', 'Planning & Engineering',
    'Working Drawings & Contracts', 'Scheduling & Estimating',
    'Post-construction & Closeout', 'Handover', 'Maintenance'
  ] loop
    -- The quoted literal, not the bare name. pg_get_constraintdef renders the list as
    -- ARRAY['Handover & Maintenance'::text, ...], and a substring match on "Handover"
    -- finds it inside "Handover & Maintenance" — so the first version of this assertion
    -- failed on a constraint that was entirely correct.
    if names like '%''' || bad_name || '''::text%' then
      raise exception 'the stage check still admits the retired stage %', bad_name;
    end if;
  end loop;

  foreach bad_name in array array[
    'Acquisition & Development', 'Pre-construction',
    'Construction', 'Handover & Maintenance', 'Closed'
  ] loop
    if names not like '%''' || bad_name || '''::text%' then
      raise exception 'the stage check does not admit %', bad_name;
    end if;
  end loop;

  select string_agg(pipeline_stage_name, ' > ' order by pipeline_stage_position) into names
  from pipeline_stages ps join pipelines p using (pipeline_id)
  where p.pipeline_key = 'build_lifecycle';

  raise notice 'ok  % — no owning teams', names;
end $$;
