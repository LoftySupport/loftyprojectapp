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


-- ---------------------------------------------------- address enums + lookup
-- Eight states and territories — the whole list, so a genuine enum.
create type au_state as enum ('SA', 'NSW', 'VIC', 'QLD', 'WA', 'NT', 'TAS', 'ACT');

-- One value today. An enum rather than text so adding a second country later is
-- `alter type … add value`, not a data-cleaning exercise.
create type country_code as enum ('AU');
-- One type, set on the project. Jobs inherit it rather than carrying their own — a
-- commercial project does not contain residential jobs, so a second column would only
-- ever be a chance to disagree with the first.
create type project_type as enum ('residential', 'commercial', 'development');

-- One status, used on both projects and jobs. A record is in exactly one of these at
-- a time, which is what makes it an enum rather than a set of flags.
--
-- This is NOT health. Health is a separate, calculated thing — on schedule? over
-- budget? an issue raised? — assembled from several inputs still to be decided, and
-- it is deliberately left out of the schema until those inputs are known. Status is
-- what someone sets; health is what the system works out.
--
-- Labels are snake_case because they are codes, not copy — the app maps them to
-- "On track", "Behind schedule" for display, so a rename is not a data migration.
create type record_status as enum (
  'on_track', 'at_risk', 'behind_schedule', 'on_hold',
  'completed', 'cancelled', 'archived'
);

-- "Current" means not finished and not abandoned. Derived from status wherever it is
-- needed, never stored — a stored copy is one more thing to keep true.
create or replace function is_current(s record_status) returns boolean
language sql immutable as $$
  select s not in ('completed', 'cancelled', 'archived');
$$;


-- Councils are a table, not an enum. SA alone has 68 and Australia about 537; they
-- amalgamate, split and get renamed, and enum values cannot be renamed or removed
-- without rebuilding the type. A table also carries the state, so a picker can filter
-- to the state already chosen on the address.
create table council_regions (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  state   au_state not null,
  active  boolean not null default true,
  unique (name, state)
);
create index on council_regions (state);

-- ------------------------------------------------------------- addresses
-- An address is a record, not a string on another record. Addresses get corrected and
-- changed — a lot renumbered by council, a street renamed, a typo found at handover —
-- and everything pointing at one should follow without being edited individually.
create table addresses (
  id             uuid primary key default gen_random_uuid(),

  -- Text, not numbers: lot and street numbers are "12A", "5-7", "Lot 3" as often as
  -- they are 12, and an integer column has to be migrated the first time one arrives.
  lot_number     text,
  street_number  text,
  street_1       text not null,        -- street name and type
  street_2       text,                 -- unit, level, building
  suburb         text not null,
  state          au_state not null default 'SA',
  country        country_code not null default 'AU',
  council_id     uuid references council_regions(id),

  -- Assembled once, in the database, so every card, export and search reads the same
  -- string. `||` with coalesce rather than concat_ws: concat_ws is only STABLE and a
  -- generated column needs IMMUTABLE. The enum-to-text casts are immutable.
  consolidated_address text generated always as (
    coalesce(street_2 || ', ', '') ||
    coalesce(street_number || ' ', '') ||
    street_1 || ', ' ||
    suburb || ' ' || state::text || ', ' || country::text
  ) stored,

  created_at     timestamptz not null default now(),
  created_by     uuid references profiles(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references profiles(id)
);
create index on addresses (suburb);
create index on addresses (council_id);

-- --------------------------------------------------------------- projects
-- Sequential from 1000, four digits minimum, overridable by hand.
create sequence if not exists project_no_seq start with 1000;

create table projects (
  id                  uuid primary key default gen_random_uuid(),

  -- The sequence supplies the default, the check enforces the four-digit floor, and
  -- the trigger below stops a hand-typed override colliding with the sequence later.
  project_no          integer not null unique default nextval('project_no_seq')
                        check (project_no >= 1000),

  -- Two addresses, not one. `original` is where the project started and never moves —
  -- it is what contracts and old paperwork refer to. `current` is what every card,
  -- board and search shows. Identical until something changes.
  original_address_id uuid references addresses(id),
  current_address_id  uuid not null references addresses(id),

  project_type        project_type,
  status              record_status not null default 'on_track',

  start_date          date,
  target_completion   date,
  end_date            date,           -- actual, as opposed to target

  created_at          timestamptz not null default now(),
  created_by          uuid references profiles(id),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references profiles(id)
);
create index on projects (current_address_id);

-- A blank current address falls back to the original, and vice versa, so a caller only
-- has to supply one. Without it, "current not null" means every insert must set both.
create or replace function default_current_address() returns trigger
language plpgsql as $$
begin
  if new.current_address_id is null then
    new.current_address_id := new.original_address_id;
  end if;
  if new.original_address_id is null then
    new.original_address_id := new.current_address_id;
  end if;
  return new;
end $$;

create trigger projects_default_current_address
  before insert or update on projects
  for each row execute function default_current_address();

-- A hand-typed project_no above the sequence would be handed out again later and fail
-- on the unique index — months after the override, which is the worst time to find
-- out. Push the sequence past it instead.
create or replace function bump_project_no_seq() returns trigger
language plpgsql as $$
begin
  if new.project_no >= nextval('project_no_seq') then
    perform setval('project_no_seq', new.project_no);
  end if;
  return new;
end $$;

create trigger projects_bump_no_seq
  after insert or update of project_no on projects
  for each row execute function bump_project_no_seq();

-- What the cards read. The consolidated address cannot be a generated column here —
-- generated columns cannot reach another table — so it is a view.
create view project_display as
  select p.id,
         p.project_no,
         p.project_type,
         p.status,
         cur.consolidated_address  as current_address,
         orig.consolidated_address as original_address,
         cur.suburb,
         cur.council_id
  from projects p
    join addresses cur       on cur.id  = p.current_address_id
    left join addresses orig on orig.id = p.original_address_id;

-- ------------------------------------------------------------------- jobs
create table jobs (
  id                    uuid primary key default gen_random_uuid(),
  project_id            uuid not null references projects(id) on delete cascade,

  -- Denormalised from the parent so the combined number can be generated. A
  -- generated column cannot reach across tables, so this is kept in sync by the
  -- trigger below rather than written by the app.
  project_no            integer not null,

  job_number            text not null,            -- '01', within the project

  -- The number people actually quote. Generated, so it can never drift from its parts.
  combined_job_number   text
    generated always as (project_no::text || '-' || job_number) stored,

  -- Same address pair as projects, for the same reason: a job's address is corrected
  -- and renumbered more often than a project's, and it is what people search on.
  original_address_id   uuid references addresses(id),
  current_address_id    uuid not null references addresses(id),

  -- The same status enum as projects. Not health — health is calculated from inputs
  -- still to be decided and is deliberately absent until they are.
  status                record_status not null default 'on_track',

  -- No type column: a job's type is its project's type, read through job_display.
  -- + fields (stage_id, owning_team_id, assignee_id, contract/deposit/drawings, …)
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (project_id, job_number),
  unique (combined_job_number)
);

create index jobs_project_id_idx on jobs (project_id);
create index on jobs (current_address_id);

-- Jobs inherit the same blank-current-address fallback as projects.
create trigger jobs_default_current_address
  before insert or update on jobs
  for each row execute function default_current_address();

-- Keep the denormalised project number true, on insert and if a project is ever
-- renumbered. Without this the combined number silently goes stale.
create or replace function sync_job_project_number() returns trigger
language plpgsql as $$
begin
  select p.project_no into new.project_no
  from projects p where p.id = new.project_id;
  return new;
end $$;

create trigger jobs_sync_project_number
  before insert or update of project_id on jobs
  for each row execute function sync_job_project_number();

create or replace function cascade_project_renumber() returns trigger
language plpgsql as $$
begin
  if new.project_no is distinct from old.project_no then
    update jobs set project_no = new.project_no
    where project_id = new.id;
  end if;
  return new;
end $$;

create trigger projects_cascade_renumber
  after update of project_no on projects
  for each row execute function cascade_project_renumber();

-- A job's type, address and parent number in one place. The type is the project's —
-- inherited, not copied — so there is nowhere for the two to disagree.
create view job_display as
  select j.id,
         j.combined_job_number,
         j.project_id,
         p.project_no,
         p.project_type,                     -- inherited from the project
         j.status,
         is_current(j.status) as is_current, -- derived, never stored
         cur.consolidated_address  as current_address,
         orig.consolidated_address as original_address,
         cur.suburb
  from jobs j
    join projects p           on p.id    = j.project_id
    join addresses cur        on cur.id  = j.current_address_id
    left join addresses orig  on orig.id = j.original_address_id;

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
  -- No is_current flag. Which stage a job is in now is jobs.stage_id, and whether the
  -- job itself is current is is_current(jobs.status) — anything not completed,
  -- cancelled or archived. A third copy of that fact is a third thing to keep true.
  -- The open stage row is simply the one with exited_at null.
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

-- At most one open stage row per job — the one it has entered and not yet left.
-- Replaces the old is_current flag: the same guarantee, without storing the fact.
create unique index job_stages_one_open
  on job_stages (job_id) where exited_at is null;

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
