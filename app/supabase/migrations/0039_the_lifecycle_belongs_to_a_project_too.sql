-- =============================================================================
-- 0039 — the lifecycle belongs to a project too, and it only goes forwards
-- =============================================================================
-- Lofty, 25 August:
--
--   "there are 5 lifecycles of a project and a job — Acquisition & Development,
--    Pre-Construction, Construction, Handover & Maintenance, Closed. These are linear
--    and a project and job cannot move backwards. these can be moved manually or by
--    calculating the stages based on project stages where the project inherits the
--    lowest job phased. jobs in same project can be different lifecycles."
--
-- Three facts, and each one is a separate piece of this migration.
--
-- 1. A PROJECT HAS A STAGE.
--
--    It did not. Only jobs did, and `0035` says why the vocabulary is what it is. The
--    same five words, the same CHECK, so the two can be compared without translating.
--
-- 2. THE LIFECYCLE IS LINEAR.
--
--    A new rule, and it applies to jobs as well — 0038 asked who may move a job and this
--    asks where to. Enforced by position rather than by listing the legal pairs: five
--    stages have twenty ordered pairs and a list of them is a thing that goes stale the
--    moment a sixth is added.
--
--    `lifecycle_position()` is the one place the order lives. It is IMMUTABLE and takes
--    the stage text, so the CHECK, the guard and any future report all sort the same way.
--
-- 3. A PROJECT CAN INHERIT THE LOWEST JOB'S STAGE.
--
--    `project_stage_from_jobs()` computes it. NOT a trigger and NOT a generated column,
--    deliberately — see the note at the end, because the two rules Lofty gave can
--    contradict each other and the resolution is a business decision rather than a
--    schema one.
--
-- WHAT THIS DOES NOT TOUCH
--
--    Nested pipelines. `job_pipeline_positions` is a team's own board and 0035 is
--    explicit that it is a different object; Lofty's rule draws the same line — the
--    confirmation and the direction rule are for the shared lifecycle only.
-- =============================================================================

-- ------------------------------------------------------------------ the order
-- One definition of "which stage comes first", so nothing can disagree about it.
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
    when 'Handover & Maintenance'    then 4
    when 'Closed'                    then 5
  end
$$;

comment on function lifecycle_position(text) is
  'Where a lifecycle stage sits in the five-stage order. The single source of that order — the direction guard and any report that sorts by phase both read it. Returns null for a value that is not a stage, which the CHECK constraints already refuse.';

-- ------------------------------------------------------- projects.project_stage
alter table projects
  add column if not exists project_stage text not null default 'Acquisition & Development';

alter table projects drop constraint if exists projects_stage_is_a_lifecycle_stage;
alter table projects add constraint projects_stage_is_a_lifecycle_stage
  check (project_stage in ('Acquisition & Development', 'Pre-construction',
                           'Construction', 'Handover & Maintenance', 'Closed'));

-- The pair `jobs` already has. Days-in-stage is derived from it on every read, so it is
-- never stored and cannot go stale.
alter table projects
  add column if not exists project_stage_entered_at timestamptz not null default now();

create index if not exists projects_stage_idx on projects (project_stage);

comment on column projects.project_stage is
  'Where the project sits in the five-phase lifecycle everybody shares. Set manually, or brought in line with its jobs — see project_stage_from_jobs(). Jobs on one project may legitimately be at different phases; this is the project''s own answer.';

-- --------------------------------------------------- moving only ever forwards
create or replace function guard_lifecycle_is_linear()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_stage text;
  new_stage text;
  label     text;
begin
  if tg_table_name = 'projects' then
    old_stage := old.project_stage; new_stage := new.project_stage; label := 'project';
  else
    old_stage := old.job_stage;     new_stage := new.job_stage;     label := 'job';
  end if;

  if new_stage is not distinct from old_stage then
    return new;
  end if;

  -- No JWT is a migration, a seed or the service role. The import will need to place
  -- records at whatever phase they are actually at, including behind where a previous
  -- row put them, so it is not held to a rule written for people clicking in the app.
  if auth.uid() is null then
    return new;
  end if;

  if lifecycle_position(new_stage) < lifecycle_position(old_stage) then
    raise exception
      'A % cannot go back to %. The lifecycle only moves forwards, and this one is at %.',
      label, new_stage, old_stage
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function guard_lifecycle_is_linear() from public;
revoke execute on function guard_lifecycle_is_linear() from anon;
revoke execute on function guard_lifecycle_is_linear() from authenticated;

drop trigger if exists jobs_guard_linear_stage on jobs;
create trigger jobs_guard_linear_stage
  before update of job_stage on jobs
  for each row execute function guard_lifecycle_is_linear();

drop trigger if exists projects_guard_linear_stage on projects;
create trigger projects_guard_linear_stage
  before update of project_stage on projects
  for each row execute function guard_lifecycle_is_linear();

-- ------------------------------------- and who may move one, same rule as 0038
create or replace function guard_project_stage_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.project_stage is distinct from old.project_stage
     and current_permission() < 'manager'::permission_level then
    raise exception
      'Moving a project between lifecycle stages needs manager permission or above.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function guard_project_stage_change() from public;
revoke execute on function guard_project_stage_change() from anon;
revoke execute on function guard_project_stage_change() from authenticated;

drop trigger if exists projects_guard_stage_change on projects;
create trigger projects_guard_stage_change
  before update of project_stage on projects
  for each row execute function guard_project_stage_change();

-- --------------------------------------------- stamping when a phase was entered
create or replace function touch_project_stage_entered_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.project_stage is distinct from old.project_stage then
    new.project_stage_entered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists projects_touch_stage_entered_at on projects;
create trigger projects_touch_stage_entered_at
  before update of project_stage on projects
  for each row execute function touch_project_stage_entered_at();

-- ------------------------------------------------ the lowest job's phase
/*
  What the project's stage WOULD be if it followed its jobs.

  A function rather than a trigger, and this is the interesting decision in the
  migration. Lofty gave two rules that can contradict each other:

    "the project inherits the lowest job phase"
    "a project cannot move backwards"

  Add a new job at Acquisition & Development to a project already at Construction — a
  perfectly ordinary thing, since a project is split more than once — and the lowest job
  phase is now behind where the project is. Inheriting it would move the project
  backwards, which the other rule forbids.

  A trigger would have to pick one silently on every insert. So it does not exist: this
  computes the answer and the app offers it, where a person can see both numbers and
  decide. Once Lofty says which rule wins, that decision becomes a trigger in one line.

  Null for a project with no jobs — it has nothing to inherit from, which is a different
  thing from being at the first phase.
*/
create or replace function project_stage_from_jobs(p_project_id integer)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select j.job_stage
  from jobs j
  where j.project_id = p_project_id
  order by lifecycle_position(j.job_stage)
  limit 1
$$;

comment on function project_stage_from_jobs(integer) is
  'The lowest phase any of the project''s jobs is at — what the project would inherit. Deliberately not a trigger: inheriting can point backwards when a new job is added to an advanced project, and which of Lofty''s two rules wins there is a business decision, not a schema one.';
