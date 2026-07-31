-- =============================================================================
-- 0001 — the four starter tables
-- =============================================================================
-- Deliberately minimal: keys, relationships and constraints only. Every table has
-- an "-- + fields" marker where the rest of the columns go as they are decided.
--
-- Relational, so identity is a uuid primary key and everything joins on it. The
-- Lofty numbers are business keys — unique, human-quotable, what people say out
-- loud — but never the join key. Renumbering a project must not orphan its jobs.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------- stages
-- A seeded lookup, ordered. This order is the board's column order.
create table stages (
  id        smallint primary key,
  name      text not null unique,
  position  smallint not null unique
);

insert into stages (id, name, position) values
  (1, 'Sales & acquisition',           1),
  (2, 'Planning & Engineering',        2),
  (3, 'Working Drawings & Contracts',  3),
  (4, 'Preconstruction',               4),
  (5, 'Scheduling & Estimating',       5),
  (6, 'Construction & execution',      6),
  (7, 'Post-construction & closeout',  7),
  (8, 'Handover & maintenance',        8);

-- ------------------------------------------------------ permission_level
-- An enum, not a lookup table: a fixed ladder rather than data anyone maintains.
-- Postgres orders enum values by declaration, so `permission >= 'manager'` is a valid
-- comparison — which is how the RLS policies want to read. Adding a rung later is
-- `alter type … add value`, which does not lock the table. Intended to map onto
-- Microsoft Teams permission levels when that sync lands.
create type permission_level as enum ('viewer', 'user', 'manager', 'admin', 'superadmin');

-- ---------------------------------------------------------- profiles
-- `profiles`, not `users` — `auth.users` is Supabase's table, populated by Microsoft
-- Entra. This is the row Lofty owns beside it: same person, but the parts the app
-- decides rather than the IdP. Role and team are owned here, not in Entra.
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,

  -- Two fields, not one. People change names, and a single `full_name` makes that a
  -- string edit that has to be got exactly right. It is also the only way to greet
  -- someone by first name, which is most of where a name appears.
  first_name     text not null,
  last_name      text not null,
  -- Generated, so it cannot drift from its parts.
  full_name      text generated always as (first_name || ' ' || last_name) stored,
  -- Null means "use first_name". Never store a copy of it here.
  preferred_name text,

  email          text not null unique,
  -- Least privilege by default: read and nothing else until an admin promotes them.
  permission     permission_level not null default 'viewer',
  -- + fields (job_title, phone, source, …)
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- People sit in more than one team, so membership is its own table, not a column.
-- `is_primary` exists because some screens need a single answer — which team the
-- dashboard watches, what the board filters to by default. The partial unique index
-- stops two primaries; nothing forces one, because a new joiner has none yet.
create table profile_teams (
  profile_id uuid references profiles(id) on delete cascade,
  team_id    uuid not null,                 -- fk added with the teams table
  is_primary boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (profile_id, team_id)
);
create unique index profile_one_primary_team
  on profile_teams (profile_id) where is_primary;
create index on profile_teams (team_id);

-- What the app greets you with, in one place so "Hi, …" is never assembled ad hoc.
create view profile_display as
  select id, coalesce(preferred_name, first_name) as greeting_name, full_name
  from profiles;

-- --------------------------------------------------------------- projects
create table projects (
  id                    uuid primary key default gen_random_uuid(),
  lofty_project_number  text not null unique,     -- '1201'
  name                  text,
  -- + fields (suburb, council_area, client, type, division, manager_id, dates, …)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ------------------------------------------------------------------- jobs
create table jobs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,

  -- Denormalised from the parent so the combined number can be generated. A
  -- generated column cannot reach across tables, so this is kept in sync by the
  -- trigger below rather than written by the app.
  lofty_project_number  text not null,

  job_number            text not null,            -- '01', within the project

  -- The number people actually quote. Generated, so it can never drift from its parts.
  combined_lofty_job_number text
    generated always as (lofty_project_number || '-' || job_number) stored,

  address               text,
  -- + fields (type, owning_team_id, assignee_id, status, contract/deposit/drawings, …)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (project_id, job_number),
  unique (combined_lofty_job_number)
);

create index jobs_project_id_idx on jobs (project_id);

-- Keep the denormalised project number true, on insert and if a project is ever
-- renumbered. Without this the combined number silently goes stale.
create or replace function sync_job_project_number() returns trigger
language plpgsql as $$
begin
  select p.lofty_project_number into new.lofty_project_number
  from projects p where p.id = new.project_id;
  return new;
end $$;

create trigger jobs_sync_project_number
  before insert or update of project_id on jobs
  for each row execute function sync_job_project_number();

create or replace function cascade_project_renumber() returns trigger
language plpgsql as $$
begin
  if new.lofty_project_number is distinct from old.lofty_project_number then
    update jobs set lofty_project_number = new.lofty_project_number
    where project_id = new.id;
  end if;
  return new;
end $$;

create trigger projects_cascade_renumber
  after update of lofty_project_number on projects
  for each row execute function cascade_project_renumber();

-- ------------------------------------------------- job_stages (composite)
-- One row per job per stage. A single stage_id on the job would only say where
-- something is now — not when it got there, how long it sat, or what it skipped.
-- project_id rides along so project rollups don't need the extra join; the
-- composite foreign key below stops it disagreeing with the job's own project.
create table job_stages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null,
  job_id      uuid not null,
  stage_id    smallint not null references stages(id),

  entered_at  timestamptz,       -- null until the job reaches this stage
  exited_at   timestamptz,       -- null while it is still here
  is_current  boolean not null default false,
  -- + fields (owning_team_id, assignee_id, sla_days, notes, …)

  unique (job_id, stage_id),
  foreign key (job_id, project_id) references jobs (id, project_id) on delete cascade,
  check (exited_at is null or entered_at is not null),
  check (exited_at is null or exited_at >= entered_at)
);

-- the composite FK above needs this on the parent
alter table jobs add constraint jobs_id_project_id_key unique (id, project_id);

create index job_stages_job_idx     on job_stages (job_id);
create index job_stages_project_idx on job_stages (project_id);

-- Exactly one current stage per job.
create unique index job_stages_one_current
  on job_stages (job_id) where is_current;

-- ------------------------------------------------------------------- RLS
-- On from the start, so nothing is ever built against an open table. These are
-- permissive placeholders for signed-in users; replace them with the scope model
-- in supabase-schema.md as roles and teams land.
alter table projects      enable row level security;
alter table jobs          enable row level security;
alter table job_stages    enable row level security;
alter table profiles enable row level security;
alter table stages        enable row level security;

create policy "read stages"        on stages        for select to authenticated using (true);
create policy "read projects"      on projects      for select to authenticated using (true);
create policy "read jobs"          on jobs          for select to authenticated using (true);
create policy "read job_stages"    on job_stages    for select to authenticated using (true);
create policy "read own profile"   on profiles for select to authenticated using (id = auth.uid());
create policy "update own profile" on profiles for update to authenticated using (id = auth.uid());
