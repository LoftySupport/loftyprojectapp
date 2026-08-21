-- =============================================================================
-- 0029 — where a job is: nested pipelines, positions, and time in stage
-- =============================================================================
-- Lofty's process is not one pipeline. It is a pipeline whose stages are themselves
-- pipelines, to whatever depth a team needs:
--
--   Build lifecycle                    (scope: job — everyone sees this)
--     Sales & Acquisition
--     Pre-construction  ───────┐
--     Construction             │
--     Handover                 │
--     Maintenance              │
--                              ▼
--     Pre-construction         (parent stage: Pre-construction)
--       Planning Approval
--       Working Drawings ────┐
--       Development Approval │
--                            ▼
--       Working Drawings     (parent stage: Working Drawings — Design's own steps)
--
-- One column does that: `pipeline_parent_stage_id`. A pipeline either hangs off a stage
-- of another pipeline or it is a root.
--
-- ------------------------------------------------- the four axes, and why they are four
-- A job's relationship to process is four independent things, and this migration builds
-- the first. Merging any pair destroys something that cannot be recovered afterwards:
--
--   Position  job_pipeline_positions   where is it        <- this migration
--   Work      tasks                    what is being done
--   Change    variations               why it deviated
--   Facts     property_values          what is known about it
--
-- The tempting shortcut is deriving position from which tasks are complete. It makes
-- moving backwards WIPE the completion history, and Lofty's "it's not snakes and
-- ladders" requirement becomes unbuildable. Keeping them apart is what makes that
-- requirement free: move the position back and the completed tasks stay completed,
-- because they were never the same fact.
--
-- ----------------------------------------------------------- a job is in several at once
-- One row per pipeline the job is engaged with. A job is simultaneously at
-- Pre-construction in the lifecycle, at Working Drawings in the pre-construction
-- pipeline, and at "Draft sent for check" in the working-drawings pipeline. Three rows,
-- no contradiction possible, and each team opens the pipeline that is theirs.
--
-- This is also what makes "one team at a time" survivable. It is an aspiration, not a
-- fact: a variation in construction can have Selections, Estimating and Scheduling all
-- holding the same job. Each has its own position row, so nothing has to lie.
--
-- ------------------------------------------------------------- the stage enum stays
-- `jobs.job_stage` is NOT dropped here. It is dropped last, once these tables have real
-- rows and every board reads from them — dropping it in the migration that creates its
-- replacement would leave nothing working in between. What this migration does add is
-- the history the enum never had.
-- =============================================================================

-- ============================================================================
-- 1. pipelines
-- ============================================================================
create table pipelines (
  pipeline_id uuid primary key default gen_random_uuid(),

  -- Stable, referenced by seed data and by the import. The name is the renameable half.
  pipeline_key text not null unique check (pipeline_key ~ '^[a-z][a-z0-9_]*$'),
  pipeline_name text not null,

  pipeline_scope text not null check (pipeline_scope in ('project', 'job')),

  -- The nesting, in one column. Null means this is a root pipeline; otherwise this
  -- pipeline elaborates that stage of its parent.
  --
  -- No cascade: deleting a stage that another pipeline hangs off should fail loudly
  -- rather than silently taking a whole team's process with it.
  pipeline_parent_stage_id uuid,

  pipeline_position smallint not null default 0,
  pipeline_is_active boolean not null default true,

  pipeline_created_at timestamptz not null default now(),
  pipeline_created_by uuid references profiles(profile_id),
  pipeline_updated_at timestamptz not null default now(),
  pipeline_updated_by uuid references profiles(profile_id)
);

comment on table pipelines is
  'A process, as rows. Pipelines nest: a pipeline can hang off a stage of another one, so Pre-construction elaborates a lifecycle stage and Working Drawings elaborates a pre-construction stage, to whatever depth a team needs. Editable from the UI by superadmin — adding a stage is an INSERT, reordering is an UPDATE, retiring one is a flag. That is the whole reason stages must not be an enum.';

-- ============================================================================
-- 2. pipeline_stages
-- ============================================================================
create table pipeline_stages (
  pipeline_stage_id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(pipeline_id) on delete cascade,

  pipeline_stage_name text not null,
  pipeline_stage_position smallint not null,

  -- open / won / lost, as a deal pipeline has. "won" and "lost" are what let a board
  -- know a job has left the process rather than stalled in it — Closed and Cancelled
  -- are not just two more columns on the right.
  pipeline_stage_type text not null default 'open'
    check (pipeline_stage_type in ('open', 'won', 'lost')),

  pipeline_stage_owning_team text references teams(team_id) on update cascade,

  -- What "on time" means for this stage. Nullable: most stages do not have an agreed
  -- number yet, and a made-up one would be worse than none.
  pipeline_stage_expected_days smallint check (pipeline_stage_expected_days > 0),

  -- Council, the EER consultant, SA Water. The process map calls these out in orange:
  -- nothing downstream moves until they are done, and they are not the owning team's
  -- fault when they run late. Without this flag Design looks permanently overdue for
  -- council's 28 days.
  pipeline_stage_is_external boolean not null default false,

  pipeline_stage_created_at timestamptz not null default now(),
  pipeline_stage_created_by uuid references profiles(profile_id),
  pipeline_stage_updated_at timestamptz not null default now(),
  pipeline_stage_updated_by uuid references profiles(profile_id),

  unique (pipeline_id, pipeline_stage_position),

  -- Not redundant with the primary key: this is the target of the composite foreign key
  -- on job_pipeline_positions, which is what makes it impossible to park a job in a
  -- stage belonging to a different pipeline.
  unique (pipeline_id, pipeline_stage_id)
);

comment on table pipeline_stages is
  'A position within a pipeline. Not a column on the job: a job sits in several pipelines at once at different levels of detail, and a single stage column can only hold one of those answers.';

-- The nesting FK, added after pipeline_stages exists because the two reference each
-- other. This is the whole mechanism: a pipeline hangs off a stage of its parent.
alter table pipelines add constraint pipelines_parent_stage_fkey
  foreign key (pipeline_parent_stage_id) references pipeline_stages(pipeline_stage_id);

-- A pipeline may elaborate a given stage only once — two pipelines both claiming to be
-- "what happens inside Working Drawings" is a contradiction, not a feature.
create unique index pipelines_one_child_per_stage
  on pipelines (pipeline_parent_stage_id) where pipeline_parent_stage_id is not null;

-- A pipeline cannot end up inside itself. A CHECK cannot hold a subquery, so this is a
-- trigger — the same reason job dependencies will need one.
create or replace function guard_pipeline_nesting() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  cursor_pipeline uuid;
  hops integer := 0;
begin
  if new.pipeline_parent_stage_id is null then
    return new;
  end if;

  select pipeline_id into cursor_pipeline
  from pipeline_stages where pipeline_stage_id = new.pipeline_parent_stage_id;

  while cursor_pipeline is not null loop
    if cursor_pipeline = new.pipeline_id then
      raise exception 'pipeline % would contain itself', new.pipeline_name
        using errcode = '23514';
    end if;

    -- A guard on the guard: a cycle that predates this row would spin forever.
    hops := hops + 1;
    if hops > 50 then
      raise exception 'pipeline nesting is deeper than 50, which means it is already a cycle'
        using errcode = '23514';
    end if;

    select ps.pipeline_id into cursor_pipeline
    from pipelines p
    left join pipeline_stages ps on ps.pipeline_stage_id = p.pipeline_parent_stage_id
    where p.pipeline_id = cursor_pipeline;
  end loop;

  return new;
end $$;

create trigger pipelines_guard_nesting before insert or update on pipelines
  for each row execute function guard_pipeline_nesting();

-- ============================================================================
-- 3. job_pipeline_positions — where the job is, per pipeline
-- ============================================================================
-- Column naming: the three foreign keys keep their parents' names, so a join reads
-- `using (job_id)`. Only this table's own columns take its prefix.
create table job_pipeline_positions (
  job_id text not null references jobs(job_id) on update cascade on delete cascade,
  pipeline_id uuid not null references pipelines(pipeline_id) on delete cascade,
  pipeline_stage_id uuid not null,

  -- Blocked is a STATE, not a stage.
  --
  -- The tempting alternative is a "Waiting on estimating" column on the board. It
  -- multiplies — waiting on estimating, on drafting, on council, on the client — and it
  -- lies: a job parked in "Waiting on estimating" has not actually left the Selections
  -- stage it was in. As a state, the card greys in place, keeps its real stage, and the
  -- board can gather blocked work into its own lane.
  job_pipeline_position_state text not null default 'active'
    check (job_pipeline_position_state in ('active', 'waiting', 'done')),

  -- Who it is waiting on, when it is waiting. A team rather than free text, so "what is
  -- Estimating holding up" is a query rather than a read-through.
  job_pipeline_position_waiting_on text references teams(team_id) on update cascade,

  job_pipeline_position_entered_at timestamptz not null default now(),

  job_pipeline_position_created_at timestamptz not null default now(),
  job_pipeline_position_created_by uuid references profiles(profile_id),
  job_pipeline_position_updated_at timestamptz not null default now(),
  job_pipeline_position_updated_by uuid references profiles(profile_id),

  -- One position per pipeline. Not one position per job: that is the point.
  primary key (job_id, pipeline_id),

  -- The guard. Without it a job could be parked at a stage belonging to some other
  -- team's pipeline, and every board would disagree about where it is.
  foreign key (pipeline_id, pipeline_stage_id)
    references pipeline_stages (pipeline_id, pipeline_stage_id),

  -- "Waiting" without saying on whom is the state that helps nobody.
  constraint job_pipeline_positions_waiting_names_someone
    check (job_pipeline_position_state <> 'waiting'
           or job_pipeline_position_waiting_on is not null)
);

comment on table job_pipeline_positions is
  'Where a job currently sits, once per pipeline it is engaged with. A job is at Pre-construction in the lifecycle, at Working Drawings in the pre-construction pipeline and at a Design step in the working-drawings pipeline, all at the same time — three rows, and no contradiction possible.';

create index job_pipeline_positions_stage_idx
  on job_pipeline_positions (pipeline_stage_id);
-- The board query: everything in this pipeline, grouped by stage.
create index job_pipeline_positions_pipeline_idx
  on job_pipeline_positions (pipeline_id, pipeline_stage_id);
-- "What is Estimating holding up."
create index job_pipeline_positions_waiting_idx
  on job_pipeline_positions (job_pipeline_position_waiting_on)
  where job_pipeline_position_state = 'waiting';

-- ============================================================================
-- 4. job_stage_events — the history, from day one
-- ============================================================================
-- This exists now, before anything reads it, because time in stage CANNOT be
-- reconstructed later. `job_stages` was dropped in 0006 and that history is already
-- gone once; this is the table that stops it happening twice.
--
-- Durations are a window function over this log, never a stored number.
create table job_stage_events (
  job_stage_event_id bigint generated always as identity primary key,

  job_id text not null references jobs(job_id) on update cascade on delete cascade,
  pipeline_id uuid not null references pipelines(pipeline_id) on delete cascade,

  -- Nullable on the way in: the first event for a pipeline has no previous stage. No FK
  -- on either, deliberately — this is a log, and it has to survive a stage being
  -- retired. It records where the job WAS, which stays true even if that stage is
  -- deleted afterwards.
  job_stage_event_from_stage_id uuid,
  job_stage_event_to_stage_id uuid not null,

  job_stage_event_at timestamptz not null default now(),
  job_stage_event_by uuid references profiles(profile_id),

  constraint job_stage_events_actually_moved
    check (job_stage_event_from_stage_id is distinct from job_stage_event_to_stage_id)
);

comment on table job_stage_events is
  'Every stage change, append-only. Exists before anything reads it because "how long did this sit in Working Drawings" cannot be answered retroactively — job_stages was dropped in 0006 and that history is already gone once. Durations are a window function over this, never stored.';

create index job_stage_events_job_idx
  on job_stage_events (job_id, job_stage_event_at desc);
create index job_stage_events_stage_idx
  on job_stage_events (job_stage_event_to_stage_id, job_stage_event_at desc);

-- Written by trigger, never by the app — the same posture as activity_audit. A log the
-- application can choose not to write is not a log.
create or replace function log_job_stage_event() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and new.pipeline_stage_id is not distinct from old.pipeline_stage_id then
    return new;
  end if;

  insert into job_stage_events (
    job_id, pipeline_id,
    job_stage_event_from_stage_id, job_stage_event_to_stage_id, job_stage_event_by
  ) values (
    new.job_id, new.pipeline_id,
    case when tg_op = 'UPDATE' then old.pipeline_stage_id else null end,
    new.pipeline_stage_id,
    current_profile_id()
  );

  return new;
end $$;

create trigger job_pipeline_positions_log_stage
  after insert or update on job_pipeline_positions
  for each row execute function log_job_stage_event();

-- Keeps entered_at honest about the stage, not about the row. Moving a job's state from
-- active to waiting is not entering a stage, and should not reset the clock.
create or replace function touch_position_entered_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.pipeline_stage_id is distinct from old.pipeline_stage_id then
    new.job_pipeline_position_entered_at := now();
  end if;
  return new;
end $$;

create trigger job_pipeline_positions_touch_entered_at
  before update on job_pipeline_positions
  for each row execute function touch_position_entered_at();

-- ============================================================================
-- 5. Audit and RLS
-- ============================================================================
create trigger pipelines_touch before update on pipelines
  for each row execute function extensions.moddatetime(pipeline_updated_at);
create trigger pipeline_stages_touch before update on pipeline_stages
  for each row execute function extensions.moddatetime(pipeline_stage_updated_at);
create trigger job_pipeline_positions_touch before update on job_pipeline_positions
  for each row execute function extensions.moddatetime(job_pipeline_position_updated_at);

create trigger pipelines_stamp_created_by before insert on pipelines
  for each row execute function stamp_created_by('pipeline_created_by');
create trigger pipeline_stages_stamp_created_by before insert on pipeline_stages
  for each row execute function stamp_created_by('pipeline_stage_created_by');
create trigger job_pipeline_positions_stamp_created_by before insert on job_pipeline_positions
  for each row execute function stamp_created_by('job_pipeline_position_created_by');

alter table pipelines              enable row level security;
alter table pipeline_stages        enable row level security;
alter table job_pipeline_positions enable row level security;
alter table job_stage_events       enable row level security;

-- Reading the process is not privileged — every board renders it, and a stage name is
-- not a secret. WHICH pipelines a person sees becomes an entity grant in Phase C; until
-- those exist, hiding pipelines here would be decoration rather than security, and
-- pretending otherwise is worse than saying so.
create policy "read pipelines" on pipelines
  for select to authenticated using ((select is_active_user()));
create policy "read pipeline stages" on pipeline_stages
  for select to authenticated using ((select is_active_user()));

-- Editing the process is superadmin's, per the decisions: admins run the app, but
-- changing what the stages ARE is a different act from moving a job between them.
create policy "superadmins write pipelines" on pipelines
  for all to authenticated
  using ((select current_permission()) >= 'superadmin')
  with check ((select current_permission()) >= 'superadmin');
create policy "superadmins write pipeline stages" on pipeline_stages
  for all to authenticated
  using ((select current_permission()) >= 'superadmin')
  with check ((select current_permission()) >= 'superadmin');

-- Moving a job through a pipeline is ordinary work.
create policy "read job positions" on job_pipeline_positions
  for select to authenticated using ((select is_active_user()));
create policy "users write job positions" on job_pipeline_positions
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users move job positions" on job_pipeline_positions
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
create policy "admins delete job positions" on job_pipeline_positions
  for delete to authenticated using ((select current_permission()) >= 'admin');

-- Read-only to everyone, and no INSERT policy at all: the trigger writes it, and the
-- trigger is SECURITY DEFINER so it does not need one. No UPDATE policy either — an
-- append-only log that can be edited is not append-only.
create policy "read stage events" on job_stage_events
  for select to authenticated using ((select is_active_user()));

-- ============================================================================
-- 6. The lifecycle pipeline, seeded from the enum it replaces
-- ============================================================================
-- The nine stages jobs already have, as rows, so there is something to move jobs into
-- the day the boards switch over. Nested pipelines below this are not seeded: what
-- happens inside Pre-construction is the 57-step process map, and mapping those to
-- teams is a business task rather than a schema one.
insert into pipelines (pipeline_key, pipeline_name, pipeline_scope, pipeline_position)
values ('build_lifecycle', 'Build lifecycle', 'job', 1);

insert into pipeline_stages (pipeline_id, pipeline_stage_name, pipeline_stage_position,
                             pipeline_stage_type, pipeline_stage_owning_team)
select p.pipeline_id, s.name, s.position, s.stage_type, s.owning_team
from pipelines p, (values
  ('Sales & Acquisition',          1::smallint, 'open', 'acquisition_development'),
  ('Planning & Engineering',       2,           'open', 'design'),
  ('Working Drawings & Contracts', 3,           'open', 'design'),
  ('Pre-construction',             4,           'open', 'pre_construction_admin'),
  ('Scheduling & Estimating',      5,           'open', 'estimating'),
  ('Construction',                 6,           'open', 'construction'),
  ('Post-construction & Closeout', 7,           'open', 'construction_admin'),
  ('Handover',                     8,           'won',  'construction_admin'),
  ('Maintenance',                  9,           'open', 'maintenance')
) as s(name, position, stage_type, owning_team)
where p.pipeline_key = 'build_lifecycle';

-- Handover is 'won' and Maintenance is 'open' after it, which reads oddly and is
-- deliberate: the job is won at handover — that is when Lofty has delivered — but the
-- maintenance period is real work that happens afterwards. AMBER: if maintenance should
-- instead be a state of a handed-over job rather than a stage following it, this is the
-- row to change, and changing it is an UPDATE rather than a migration.
--
-- There is no 'lost' stage. Cancelled is a job status, not a position, and the two are
-- different facts: a cancelled job still sits somewhere in the process, which is exactly
-- what you want to know when asking where cancellations happen.

-- ------------------------------------------------- keep the new functions off the API
-- Same reasoning as 0024 and 0028: a new function is granted EXECUTE to PUBLIC by
-- default, anon inherits it, and Supabase publishes anything callable in `public`.
-- log_job_stage_event() is SECURITY DEFINER, which makes it the one that actually
-- matters here.
revoke execute on function guard_pipeline_nesting()    from public, anon, authenticated;
revoke execute on function log_job_stage_event()       from public, anon, authenticated;
revoke execute on function touch_position_entered_at() from public, anon, authenticated;
