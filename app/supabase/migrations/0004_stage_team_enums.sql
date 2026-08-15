-- =============================================================================
-- 0004 — stages and teams become enums; the job carries its own stage
-- =============================================================================
-- Two lookup tables go, and a column the spec has wanted since day one arrives.
--
-- `stages` -> `stage` enum. Eight values, seeded, never user-created: this is the
-- business process, not data anyone maintains. The table cost a trigger, a policy,
-- four audit columns and a `position` column to hold an order that an enum gives for
-- free — enums sort by declaration, so the type *is* the board's column order.
--
-- `teams` -> `team` enum. The table was never built; `profile_teams.team_id` has been
-- a bare uuid pointing at nothing since 0001, and the app has been calling
-- `.from("teams")` against a table that does not exist. The eleven values below come
-- from PHASES in stubRepository.ts, which is the only place they have ever been
-- written down. 0001 reserved `parent_team_id` for RLS scoping by team hierarchy;
-- every seeded team has a null parent, so nothing is lost collapsing it flat. If a
-- hierarchy is ever wanted it comes back as a table keyed by the enum, not as a
-- parent column an enum cannot hold.
--
-- Neither type can have values removed later — Postgres has no
-- ALTER TYPE ... DROP VALUE. Renaming works; retiring does not. For an eight-stage
-- pipeline and a department list that is what it is, that is a fair trade, and it is
-- the same trade 0003 made for councils.
--
-- Reordering is the sharper edge: a stage cannot be moved once declared. Reordering
-- the pipeline now means a new type and a rewrite of both columns. Renaming a stage
-- is one line; resequencing is not.
-- =============================================================================

create type stage as enum (
  'Sales & acquisition',
  'Planning & Engineering',
  'Working Drawings & Contracts',
  'Preconstruction',
  'Scheduling & Estimating',
  'Construction & execution',
  'Post-construction & closeout',
  'Handover & maintenance'
);

create type team as enum (
  'Acquisition & Development',
  'Sales Admin',
  'Design',
  'Pre-Construction Admin',
  'Scheduling',
  'Selections',
  'Estimating',
  'Construction',
  'Construction Admin',
  'Finance',
  'Maintenance'
);

-- ------------------------------------------------------------------ jobs.stage
-- The single answer to "what stage is this job in", which until now the schema could
-- only reach by finding the job_stages row with a null exited_at. The board's main
-- query is a filter on this column; making it walk a history table to draw eight
-- columns was always going to be the wrong shape.
--
-- data-dictionary.md has carried jobs.stage_id and jobs.stage_entered_at as "to do"
-- since 2026-08-01. This is that entry, with the enum in place of the FK.
alter table jobs add column stage stage not null default 'Sales & acquisition';

-- "Days in stage" is `now() - stage_entered_at`, computed, never stored — see the
-- "Derived, don't store" table in supabase-schema.md.
alter table jobs add column stage_entered_at timestamptz not null default now();

create index jobs_stage_idx on jobs (stage);

-- stage_entered_at is meaningless if it can drift from stage, and it drifts the first
-- time anyone writes `update jobs set stage = ...` without remembering the second
-- column. The database keeps them together instead of trusting every caller to.
create or replace function touch_stage_entered_at() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_entered_at := now();
  end if;
  return new;
end $$;

create trigger jobs_touch_stage_entered_at
  before update of stage on jobs
  for each row execute function touch_stage_entered_at();

comment on column jobs.stage is
  'Which of the eight pipeline phases the job is in now. job_stages carries the history; this is the current position.';
comment on column jobs.stage_entered_at is
  'When the job arrived in its current stage. Maintained by trigger. "Days in stage" derives from this and is never stored.';

-- ------------------------------------------------------------- job_stages.stage
-- Still the history table — one row per job per stage, with entered_at/exited_at and
-- the partial unique index guaranteeing one open row. Only the stage reference
-- changes: an enum value rather than an FK into a table that no longer exists.
--
-- Dropping the column takes its FK and the (job_id, stage_id) unique index with it;
-- the index is rebuilt below on the new column.
alter table job_stages drop column stage_id;
alter table job_stages add column stage stage not null default 'Sales & acquisition';
alter table job_stages alter column stage drop default;

alter table job_stages add constraint job_stages_job_id_stage_key unique (job_id, stage);

-- ---------------------------------------------------------- profile_teams.team
-- The primary key changes with the column, so the old one is dropped first. This also
-- retires the dangling team_id, which has referenced nothing since 0001.
alter table profile_teams drop constraint profile_teams_pkey;
alter table profile_teams drop column team_id;
alter table profile_teams add column team team not null default 'Sales Admin';
alter table profile_teams alter column team drop default;
alter table profile_teams add primary key (profile_id, team);

create index profile_teams_team_idx on profile_teams (team);

-- ---------------------------------------------------------------- stages, gone
-- Nothing references it now. The touch trigger, the RLS policy and the three unique
-- indexes go with the table.
drop table if exists stages;
