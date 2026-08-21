-- =============================================================================
-- 0027 — natural keys, the prefix convention, and the columns permissions will read
-- =============================================================================
-- The largest migration in the plan, and the last one that is cheap. `projects`, `jobs`,
-- `addresses` and `address_history` are all empty (checked immediately before writing
-- this); `profiles` has 47 rows and is renamed in place, which preserves them.
--
-- Three changes that only look like one:
--
--   1. NATURAL KEYS. The 4-digit number becomes `projects.project_id`, and '1042-01'
--      becomes `jobs.job_id`. The uuid `id` on both tables is dropped — "natural keys,
--      no uuid duplication".
--   2. THE PREFIX CONVENTION. Every column carries its table's name. A foreign key
--      keeps the parent's column name, so a join reads `using (project_id)`.
--   3. THE OWNERSHIP COLUMNS. `job_owning_team`, `job_engaged_teams`, `job_assignee_id`
--      and the project equivalents. Nothing team-scoped can be enforced until these
--      exist, and every later permission reads them.
--
-- They are one migration because they cannot be separated: the key change forces
-- `address_history`'s two foreign keys to change type, the rename forces every policy,
-- trigger, function and view to be rewritten, and doing those in two passes would mean
-- writing each of them twice. The house rule of one PR per table is set aside here
-- deliberately, and this is the reason.
--
-- --------------------------------------------- what natural keys DELETE, not just rename
-- This is the part that is easy to miss. Three mechanisms exist only because the foreign
-- key points at a uuid instead of at the number:
--
--   * `jobs.project_no` — a copy of the parent's number, kept in step by a trigger.
--     With `project_id` BEING the number, the foreign key is the project number. Gone.
--   * `sync_job_project_number()` — the trigger maintaining that copy. Gone.
--   * `cascade_project_renumber()` — a hand-rolled loop doing what `on update cascade`
--     does for free once the number is the key. Gone.
--
-- And `jobs.job_number`, a generated column, becomes `job_id` itself. So this migration
-- removes more machinery than it adds, which is not what "rename every column" sounds
-- like.
--
-- ------------------------------------------------ the condition this all rests on
-- Natural keys are safe here because Lofty's numbers are corrected AT IMPORT ONLY and
-- fixed thereafter, so `on update cascade` is exercised once and then dormant. DO THE
-- IMPORT BEFORE GO-LIVE. If that slips, revisit this decision rather than the schedule —
-- a renumber after people are working in the app moves live job numbers under them.
--
-- ------------------------------------------------------- what is NOT here, and why
--   * `project_is_lot_count_confirmed` is NOT added. The plan kept it as a "candidate
--     for removal later, if the confirmation always coincides with a pipeline stage".
--     It does — normally Planning Approval, finally Development Approval — so the
--     position answers it and a boolean somebody has to remember to tick would be a
--     second, worse answer. The confirmed dwelling count is likewise derived: it is a
--     count of jobs that are not cancelled.
--   * The `stage` enum stays. It is dropped last, once the pipeline tables replace it.
--     `jobs.stage` is still renamed to `job_stage` — leaving one unprefixed column
--     behind is worse than renaming something due for deletion, and its trigger is
--     being rewritten regardless.
--   * `permission_level` stays an enum. Every policy compares it with `>=`, and that
--     ordering is the ladder. Text with a check would silently turn those into
--     alphabetical comparisons, which is a security bug, not a style change.
--   * `activity_audit` and `login_activity` keep their bare column names for now. They
--     have no foreign key into any of this, so nothing forces them into this migration,
--     and they are the two tables with rows that are never rewritten. Worth doing, but
--     as its own migration — see the note on the audit index below, which is the part
--     that could not wait.
-- =============================================================================

-- moddatetime is a contrib module, already installed on the live project. It replaces
-- touch_updated_at(): it takes the column name as a trigger argument, which the prefix
-- convention now requires, since `updated_at` has a different name on every table.
create extension if not exists moddatetime with schema extensions;

-- ============================================================================
-- 1. Out of the way first: views reference old column names
-- ============================================================================
drop view if exists job_display cascade;
drop view if exists project_display cascade;
drop view if exists job_address_search cascade;
drop view if exists project_address_search cascade;
drop view if exists profile_display cascade;

-- ============================================================================
-- 2. profiles — renamed in place, because it has the 47 rows
-- ============================================================================
alter table profiles rename column id            to profile_id;
alter table profiles rename column first_name    to profile_first_name;
alter table profiles rename column last_name     to profile_last_name;
alter table profiles rename column full_name     to profile_full_name;
alter table profiles rename column email         to profile_email;
alter table profiles rename column login_email   to profile_login_email;
alter table profiles rename column permission    to profile_permission;
-- Booleans read as a question.
alter table profiles rename column active        to profile_is_active;
alter table profiles rename column auth_user_id  to profile_auth_user_id;
alter table profiles rename column job_title     to profile_job_title;
alter table profiles rename column last_login_at to profile_last_login_at;
alter table profiles rename column created_at    to profile_created_at;
alter table profiles rename column created_by    to profile_created_by;
alter table profiles rename column updated_at    to profile_updated_at;
alter table profiles rename column updated_by    to profile_updated_by;

-- `profile_full_name` is generated; Postgres rewrites the expression on rename, so the
-- definition still reads first || ' ' || last and no data moves.

-- ============================================================================
-- 3. addresses — renamed in place too. Empty, but a rename keeps the trigram
--    indexes and the constraints 0025 just added rather than rebuilding them.
-- ============================================================================
alter table addresses rename column id                   to address_id;
alter table addresses rename column lot_number           to address_lot_number;
alter table addresses rename column street_number        to address_street_number;
alter table addresses rename column street_1             to address_street_1;
alter table addresses rename column street_2             to address_street_2;
alter table addresses rename column suburb               to address_suburb;
alter table addresses rename column state                to address_state;
alter table addresses rename column postcode             to address_postcode;
alter table addresses rename column country              to address_country;
alter table addresses rename column council              to address_council;
-- Not address_consolidated_address. Mechanical prefixing gives the wrong answer on this
-- one column; the words reorder.
alter table addresses rename column consolidated_address to address_consolidated;
alter table addresses rename column created_at           to address_created_at;
alter table addresses rename column created_by           to address_created_by;
alter table addresses rename column updated_at           to address_updated_at;
alter table addresses rename column updated_by           to address_updated_by;

-- ============================================================================
-- 4. projects and jobs — rebuilt, because the primary key changes type
-- ============================================================================
-- address_history goes first: its foreign keys point at both, and both of those columns
-- change type (uuid -> integer, uuid -> text). Empty, so it is recreated rather than
-- altered column by column.
drop table if exists address_history;
drop table if exists jobs;
drop table if exists projects;
drop sequence if exists project_no_seq;

-- ---------------------------------------------- statuses and types become text
-- The design reference and the textbook agree: text with a check extends without a type
-- migration, and both of these lists have already changed once. Free to do now, while
-- both tables are empty; a data migration later.
--
-- Dropped after the tables that used them, and is_current() with them, since its
-- signature names the type.
drop function if exists is_current(record_status);
drop type if exists record_status;
drop type if exists project_type;

create or replace function is_current(record_status text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select record_status not in ('completed', 'cancelled', 'archived');
$$;

-- ------------------------------------------------------------------- projects
create table projects (
  -- The 4-digit number IS the key. `by default`, not `always`, for two reasons that
  -- both matter: the import sets numbers explicitly, and a number can be corrected by
  -- hand while the sequence still advances behind it.
  project_id integer primary key generated by default as identity (start with 1000),

  -- Optional. Most projects are known by their address, not by a name.
  project_name text,

  project_type text
    check (project_type in ('residential', 'commercial', 'development')),

  -- What someone sets. Not health — health is what the system works out, and nobody has
  -- defined its inputs yet.
  project_status text not null default 'on_track'
    check (project_status in ('on_track', 'at_risk', 'behind_schedule',
                              'on_hold', 'completed', 'cancelled', 'archived')),

  -- What was INTENDED at creation, which is a different fact from how many jobs exist.
  -- "We planned four lots and got three" is a real question, and a count cannot answer
  -- it. The actual count stays derived — count(*) over an indexed foreign key.
  project_proposed_dwellings smallint check (project_proposed_dwellings > 0),

  -- Set at creation and immutable thereafter; current changes freely. Two explicit
  -- things rather than two ends of a timeline, because original is protected and
  -- current is not.
  project_original_address_id uuid not null references addresses(address_id),
  project_current_address_id  uuid not null references addresses(address_id),

  -- Nullable: not every project has a single accountable team, and inventing one would
  -- be worse than leaving it unset.
  project_owning_team text references teams(team_id) on update cascade,
  project_assignee_id uuid references profiles(profile_id),

  project_start_date        date,
  project_target_completion date,
  project_end_date          date,   -- actual, as opposed to target

  project_created_at timestamptz not null default now(),
  project_created_by uuid not null references profiles(profile_id),
  project_updated_at timestamptz not null default now(),
  project_updated_by uuid references profiles(profile_id),

  constraint projects_number_floor check (project_id >= 1000)
);

comment on table projects is
  'The parent folder. A site, with the jobs on it as subfolders. The 4-digit number is the primary key rather than a uuid sitting beside it, because the number is what people say out loud and write on contracts, and it is corrected only during the import.';

-- ----------------------------------------------------------------------- jobs
create table jobs (
  -- Assigned by trigger at insert from project_id and job_sequence, then never
  -- regenerated. Not a generated column, which is what it was: a generated column would
  -- silently rewrite a number already printed on a contract.
  job_id text primary key,

  -- The foreign key IS the project number. No denormalised copy, and no trigger to keep
  -- one in step.
  project_id integer not null
    references projects(project_id) on update cascade on delete cascade,

  -- '01'. Assigned under a lock on the parent so two people creating jobs at once
  -- cannot collide. Gaps are permanent: if 1042-02 is deleted, 1042-03 keeps its number
  -- rather than sliding up, because a job number appears on contracts and folders.
  job_sequence text not null
    check (job_sequence ~ '^[0-9]+$' and job_sequence::integer >= 1),

  -- The old Lofty number. SiteBook and Trello use the same one, so a single column is
  -- right. Nullable and unique compose correctly — nulls do not collide — so jobs
  -- created in the app simply have none.
  job_number_old text unique,

  job_original_address_id uuid not null references addresses(address_id),
  job_current_address_id  uuid not null references addresses(address_id),

  job_status text not null default 'on_track'
    check (job_status in ('on_track', 'at_risk', 'behind_schedule',
                          'on_hold', 'completed', 'cancelled', 'archived')),

  -- Still the enum, still due for deletion once pipelines replace it.
  job_stage stage not null default 'Sales & Acquisition',
  job_stage_entered_at timestamptz not null default now(),

  -- Who is primarily accountable. Drives board grouping and reporting.
  --
  -- The default is derived from the stage default, not invented: a new job starts at
  -- Sales & Acquisition, so Acquisition & Development owns it. AMBER — worth confirming;
  -- it is a one-line change and it is the only business rule in this migration that was
  -- not stated anywhere.
  job_owning_team text not null default 'acquisition_development'
    references teams(team_id) on update cascade,

  -- Every team currently holding the job. "One team at a time" is an aspiration rather
  -- than a fact — a variation in construction can have Selections, Estimating and
  -- Scheduling all working the same job — so the row-level permission check has to be
  -- "any team engaged", not "the team that owns it".
  --
  -- An array rather than a join table so that check stays a single indexed overlap
  -- rather than a join. An array cannot carry a foreign key, hence the trigger below.
  job_engaged_teams text[] not null default '{}',

  job_assignee_id uuid references profiles(profile_id),

  job_created_at timestamptz not null default now(),
  job_created_by uuid not null references profiles(profile_id),
  job_updated_at timestamptz not null default now(),
  job_updated_by uuid references profiles(profile_id),

  unique (project_id, job_sequence)
);

comment on table jobs is
  'A dwelling on a site. Its number, 1042-01, is the primary key: assigned at insert from the project number and the sequence, and never regenerated afterwards, because it goes on contracts. Jobs are cheap to create and safe to delete until the lot count settles, so every child of this table cascades.';

-- --------------------------------------------------------- address_history
create table address_history (
  address_history_id bigint generated always as identity primary key,

  -- Exactly one parent. Both follow their parent's key type, which is why this table
  -- had to be rebuilt in this migration rather than left alone after 0025.
  address_history_project_id integer
    references projects(project_id) on update cascade on delete cascade,
  address_history_job_id text
    references jobs(job_id) on update cascade on delete cascade,

  address_history_address_id uuid not null references addresses(address_id),
  address_history_role text not null
    check (address_history_role in ('original', 'current')),

  address_history_valid_from timestamptz not null,
  address_history_valid_to   timestamptz not null,   -- only exists once superseded
  address_history_changed_by uuid references profiles(profile_id),
  address_history_created_at timestamptz not null default now(),

  constraint address_history_one_parent
    check (num_nonnulls(address_history_project_id, address_history_job_id) = 1),
  constraint address_history_period
    check (address_history_valid_to >= address_history_valid_from)
);

comment on table address_history is
  'Addresses a project or job used to have, with the period each applied. Superseded assignments only — the current and original addresses live in columns on the record itself, so no fact is stored twice. This is what makes "12 Test Street" still find project 1042 years after it became "20 Corner Street".';

-- ============================================================================
-- 5. Indexes
-- ============================================================================
create index projects_current_address_idx  on projects (project_current_address_id);
create index projects_original_address_idx on projects (project_original_address_id);
create index projects_owning_team_idx      on projects (project_owning_team);
create index projects_assignee_idx         on projects (project_assignee_id);

create index jobs_project_idx          on jobs (project_id);
create index jobs_current_address_idx  on jobs (job_current_address_id);
create index jobs_original_address_idx on jobs (job_original_address_id);
create index jobs_stage_idx            on jobs (job_stage);
create index jobs_assignee_idx         on jobs (job_assignee_id);

-- The board groups by owning team within a project, so the pair is the access path.
create index jobs_owning_team_idx on jobs (job_owning_team, project_id);

-- The overlap operator (&&) is what every row-level permission check will use.
create index jobs_engaged_teams_idx on jobs using gin (job_engaged_teams);

-- job_number_old's unique constraint above already builds an index, and nulls do not
-- occupy it meaningfully — so 0023's separate partial index is not recreated. One
-- index, not two, for the same lookup.

create index address_history_project_idx
  on address_history (address_history_project_id, address_history_valid_to desc)
  where address_history_project_id is not null;
create index address_history_job_idx
  on address_history (address_history_job_id, address_history_valid_to desc)
  where address_history_job_id is not null;
create index address_history_address_idx
  on address_history (address_history_address_id);

-- ------------------------------------------ the audit index the rename would break
-- activity_audit stores whole rows as jsonb and indexes the record's key out of them.
-- That expression was `->> 'id'`, which every one of these tables has just stopped
-- having: a project row now carries project_id, a job job_id, an address address_id and
-- a profile profile_id.
--
-- Left alone, nothing would error. "Show me the history of this record" would simply
-- stop using the index and start scanning the table — the worst way for it to fail,
-- because it gets slower rather than louder. Rebuilt here to coalesce the four keys.
drop index if exists activity_audit_record_idx;
create index activity_audit_record_idx on activity_audit (
  (coalesce(
     coalesce(new_row, old_row) ->> 'project_id',
     coalesce(new_row, old_row) ->> 'job_id',
     coalesce(new_row, old_row) ->> 'address_id',
     coalesce(new_row, old_row) ->> 'profile_id'
   )),
  changed_at desc
);

-- The 154 rows written before today still carry the OLD keys inside their jsonb, so
-- they will not be found by the new expression. That discontinuity is unavoidable —
-- rewriting an append-only forensic log to match a rename would be worse than the gap —
-- and it is recorded here so the next person does not read it as a bug.

-- While we are here: 0008 created two byte-identical indexes on (jwt_sub, changed_at
-- desc) under different names. One is dead weight on every audit write.
drop index if exists activity_audit_jwt_sub_idx;

-- ============================================================================
-- 6. Functions
-- ============================================================================
-- `addresses` and `profiles` were renamed rather than rebuilt, so their triggers are
-- still attached and still pointing at the old function bodies. They have to come off
-- before those functions can be replaced or dropped.
--
-- The two profile guards are NOT dropped: their triggers stay attached while the
-- functions underneath are replaced in place, so the window in which a profile could be
-- written without them never opens. `trg_activity_audit_row` stays for the same reason —
-- log_activity_audit() names its tables, and those names did not change.
drop trigger if exists addresses_build_consolidated on addresses;
drop trigger if exists addresses_touch on addresses;
drop trigger if exists profiles_touch on profiles;


-- ------------------------------------------------- the generic trigger helpers
-- The prefix convention makes a shared trigger function impossible the naive way:
-- `new.updated_at := now()` cannot work when the column is called job_updated_at on one
-- table and address_updated_at on the next.
--
-- The answer is to pass the column name as a trigger argument. `moddatetime` already
-- does this for updated_at, in C, and is used below. For the two custom helpers,
-- jsonb_populate_record does the same job: it takes the record as its base and replaces
-- ONLY the named key, so no other column round-trips through jsonb.

create or replace function stamp_created_by() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_column text := tg_argv[0];
begin
  if (to_jsonb(new) ->> target_column) is null then
    new := jsonb_populate_record(new, jsonb_build_object(
      target_column, coalesce(current_profile_id(), support_profile_id())
    ));
  end if;
  return new;
end $$;

create or replace function default_current_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  original_column text  := tg_argv[0];
  current_column  text  := tg_argv[1];
  row_json        jsonb := to_jsonb(new);
  original_value  text  := row_json ->> original_column;
  current_value   text  := row_json ->> current_column;
begin
  -- Either one fills in for the other, so "it has not moved yet" needs no second entry.
  if current_value is null and original_value is not null then
    new := jsonb_populate_record(new, jsonb_build_object(current_column, original_value));
  elsif original_value is null and current_value is not null then
    new := jsonb_populate_record(new, jsonb_build_object(original_column, current_value));
  end if;
  return new;
end $$;

-- ------------------------------------------------------- profiles and identity
create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from profiles p
    where p.profile_auth_user_id = auth.uid() and p.profile_is_active
  )
$$;

create or replace function current_permission() returns permission_level
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select p.profile_permission from profiles p
      where p.profile_auth_user_id = auth.uid() and p.profile_is_active),
    'viewer'::permission_level
  )
$$;

create or replace function current_profile_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select profile_id from profiles where profile_auth_user_id = auth.uid() limit 1
$$;

create or replace function support_profile_id() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select profile_id from profiles
  where lower(profile_email) = 'support@lofty.com.au' limit 1
$$;

create or replace function guard_profile_privileges() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_permission() >= 'admin' then
    return new;
  end if;

  if new.profile_permission is distinct from old.profile_permission then
    raise exception 'Only an admin can change a permission level'
      using errcode = '42501';
  end if;

  if new.profile_is_active is distinct from old.profile_is_active then
    raise exception 'Only an admin can activate or deactivate a person'
      using errcode = '42501';
  end if;

  return new;
end $$;

create or replace function link_profile_to_auth_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email      text := lower(nullif(trim(new.email), ''));
  v_profile_id uuid;
begin
  if v_email is null then
    return new;
  end if;

  select profile_id into v_profile_id
  from profiles
  where profile_auth_user_id is null and lower(profile_login_email) = v_email
  limit 1;

  if v_profile_id is null then
    select profile_id into v_profile_id
    from profiles
    where profile_auth_user_id is null and lower(profile_email) = v_email
    limit 1;
  end if;

  if v_profile_id is null then
    return new;
  end if;

  update profiles
     set profile_auth_user_id = new.id,
         profile_updated_at   = now()
   where profile_id = v_profile_id;

  return new;
end $$;

-- --------------------------------------------------------------- addresses
create or replace function build_consolidated_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.address_consolidated :=
    coalesce(new.address_street_2 || ', ', '') ||
    coalesce(new.address_lot_number || ' ', '') ||
    coalesce(new.address_street_number || ' ', '') ||
    new.address_street_1 || ', ' ||
    new.address_suburb || ' ' || new.address_state::text || ' ' ||
    new.address_postcode || ', ' || new.address_country::text;
  return new;
end $$;

-- ------------------------------------------------------- projects and jobs
-- Keeps the identity sequence ahead of any number set by hand, so the import can assign
-- 1106 explicitly and the next generated number is still 1107. Reads the sequence
-- through pg_get_serial_sequence rather than by name — identity owns its own sequence,
-- and hardcoding the name is how it breaks next time.
create or replace function bump_project_no_seq() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  seq text := pg_get_serial_sequence('projects', 'project_id');
begin
  if pg_sequence_last_value(seq::regclass) is null
     or new.project_id >= pg_sequence_last_value(seq::regclass) then
    perform setval(seq, new.project_id);
  end if;
  return new;
end $$;

-- Assigns the sequence under a lock on the parent, then stamps the job number from it.
-- Both in one function because the number is derived from the sequence and doing them
-- apart would let a job exist for an instant without its own key.
create or replace function assign_job_sequence() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  next_no integer;
begin
  if new.job_sequence is null then
    -- The lock is what stops two people creating jobs on the same project at once from
    -- both reading the same max().
    perform 1 from projects where project_id = new.project_id for update;
    select coalesce(max(job_sequence::integer), 0) + 1
      into next_no
      from jobs
     where project_id = new.project_id;
    new.job_sequence := lpad(next_no::text, 2, '0');
  end if;

  new.job_id := new.project_id::text || '-' || new.job_sequence;
  return new;
end $$;

-- The job number embeds the project number, so a renumber has to carry it. This fires
-- only when project_id actually changed — which, because numbers are corrected at import
-- only, means once. It replaces cascade_project_renumber(): the FK's `on update cascade`
-- moves jobs.project_id, and this keeps job_id honest about it.
create or replace function resync_job_id() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.project_id is distinct from old.project_id
     or new.job_sequence is distinct from old.job_sequence then
    new.job_id := new.project_id::text || '-' || new.job_sequence;
  end if;
  return new;
end $$;

create or replace function touch_stage_entered_at() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.job_stage is distinct from old.job_stage then
    new.job_stage_entered_at := now();
  end if;
  return new;
end $$;

-- An array cannot carry a foreign key, so every value in job_engaged_teams is checked
-- against `teams` here. Same pattern the multi-select property options will need.
create or replace function validate_engaged_teams() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  unknown_team text;
begin
  select t into unknown_team
  from unnest(new.job_engaged_teams) as t
  where not exists (select 1 from teams where team_id = t)
  limit 1;

  if unknown_team is not null then
    raise exception 'job_engaged_teams contains %, which is not a team', unknown_team
      using errcode = '23503';
  end if;
  return new;
end $$;

-- --------------------------------------------------- functions that are now gone
drop function if exists sync_job_project_number();
drop function if exists cascade_project_renumber();
drop function if exists touch_updated_at();

-- ============================================================================
-- 7. Triggers
-- ============================================================================
create trigger addresses_build_consolidated before insert or update on addresses
  for each row execute function build_consolidated_address();
create trigger addresses_touch before update on addresses
  for each row execute function extensions.moddatetime(address_updated_at);

create trigger projects_stamp_created_by before insert on projects
  for each row execute function stamp_created_by('project_created_by');
create trigger projects_default_current_address before insert or update on projects
  for each row execute function default_current_address(
    'project_original_address_id', 'project_current_address_id');
create trigger projects_bump_no_seq after insert or update on projects
  for each row execute function bump_project_no_seq();
create trigger projects_touch before update on projects
  for each row execute function extensions.moddatetime(project_updated_at);

create trigger jobs_stamp_created_by before insert on jobs
  for each row execute function stamp_created_by('job_created_by');
create trigger jobs_default_current_address before insert or update on jobs
  for each row execute function default_current_address(
    'job_original_address_id', 'job_current_address_id');
-- Before the sequence is read, so job_id is stamped from a project_id that is settled.
create trigger jobs_assign_sequence before insert on jobs
  for each row execute function assign_job_sequence();
create trigger jobs_resync_job_id before update on jobs
  for each row execute function resync_job_id();
create trigger jobs_touch_stage_entered_at before update on jobs
  for each row execute function touch_stage_entered_at();
create trigger jobs_validate_engaged_teams before insert or update on jobs
  for each row execute function validate_engaged_teams();
create trigger jobs_touch before update on jobs
  for each row execute function extensions.moddatetime(job_updated_at);

create trigger profiles_touch before update on profiles
  for each row execute function extensions.moddatetime(profile_updated_at);

-- The audit trigger names its tables in the function body, and those names did not
-- change, so it is reattached unchanged.
create trigger trg_activity_audit_row after insert or update or delete on projects
  for each row execute function log_activity_audit();
create trigger trg_activity_audit_row after insert or update or delete on jobs
  for each row execute function log_activity_audit();

-- ============================================================================
-- 8. RLS
-- ============================================================================
alter table projects        enable row level security;
alter table jobs            enable row level security;
alter table address_history enable row level security;

-- Every helper call is wrapped in `(select ...)`, which the previous policies did not
-- do. That is what makes each an InitPlan — evaluated once per statement instead of once
-- per row — and it is the difference between milliseconds and seconds on a large board.
-- Recreating these was forced by the rename anyway, so the fix is free here.
create policy "read projects" on projects
  for select to authenticated using ((select is_active_user()));
create policy "users write projects" on projects
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update projects" on projects
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
create policy "admins delete projects" on projects
  for delete to authenticated using ((select current_permission()) >= 'admin');

create policy "read jobs" on jobs
  for select to authenticated using ((select is_active_user()));
create policy "users write jobs" on jobs
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update jobs" on jobs
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
create policy "admins delete jobs" on jobs
  for delete to authenticated using ((select current_permission()) >= 'admin');

create policy "read address history" on address_history
  for select to authenticated using ((select is_active_user()));
create policy "admins correct address history" on address_history
  for update to authenticated
  using ((select current_permission()) >= 'admin')
  with check ((select current_permission()) >= 'admin');
create policy "admins delete address history" on address_history
  for delete to authenticated using ((select current_permission()) >= 'admin');

-- The same InitPlan fix on the tables that were only renamed, not rebuilt.
drop policy if exists "read addresses" on addresses;
drop policy if exists "users write addresses" on addresses;
drop policy if exists "users update addresses" on addresses;
drop policy if exists "admins delete addresses" on addresses;

create policy "read addresses" on addresses
  for select to authenticated using ((select is_active_user()));
create policy "users write addresses" on addresses
  for insert to authenticated with check ((select current_permission()) >= 'user');
create policy "users update addresses" on addresses
  for update to authenticated
  using ((select current_permission()) >= 'user')
  with check ((select current_permission()) >= 'user');
create policy "admins delete addresses" on addresses
  for delete to authenticated using ((select current_permission()) >= 'admin');

drop policy if exists "read profiles" on profiles;
drop policy if exists "admins insert profiles" on profiles;
drop policy if exists "admins update any profile" on profiles;

create policy "read profiles" on profiles
  for select to authenticated using ((select is_active_user()));
create policy "admins insert profiles" on profiles
  for insert to authenticated with check ((select current_permission()) >= 'admin');
create policy "admins update any profile" on profiles
  for update to authenticated
  using ((select current_permission()) >= 'admin')
  with check ((select current_permission()) >= 'admin');

-- ============================================================================
-- 9. Views
-- ============================================================================
-- security_invoker so RLS applies as the caller, not as the view's owner. Without it a
-- view is a hole straight through every policy above.
--
-- job_number and project_no are gone from these: job_id IS the job number and
-- project_id IS the project number, which is the whole point of the key change.
create view project_display with (security_invoker = true) as
  select p.project_id,
         p.project_name,
         p.project_type,
         p.project_status,
         is_current(p.project_status) as project_is_current,
         p.project_owning_team,
         cur.address_consolidated  as project_current_address,
         orig.address_consolidated as project_original_address,
         cur.address_suburb        as project_suburb,
         cur.address_council       as project_council
  from projects p
  join addresses cur       on cur.address_id  = p.project_current_address_id
  left join addresses orig on orig.address_id = p.project_original_address_id;

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
  join projects p          on p.project_id    = j.project_id
  join addresses cur       on cur.address_id  = j.job_current_address_id
  left join addresses orig on orig.address_id = j.job_original_address_id;

-- Search runs over every address a record has held, not just the current one — the lot
-- designation, the interim name and the final street number all have to find the job.
-- Today that is the two columns; once address_history has rows it is those too, and
-- these views are where that union lands.
create view project_address_search with (security_invoker = true) as
  select p.project_id,
         a.address_id,
         a.address_consolidated,
         a.address_suburb,
         a.address_council,
         case when a.address_id = p.project_current_address_id
              then 'current' else 'original' end as address_role
  from projects p
  join addresses a on a.address_id = p.project_current_address_id
                   or a.address_id = p.project_original_address_id;

create view job_address_search with (security_invoker = true) as
  select j.job_id,
         j.project_id,
         a.address_id,
         a.address_consolidated,
         a.address_suburb,
         a.address_council,
         case when a.address_id = j.job_current_address_id
              then 'current' else 'original' end as address_role
  from jobs j
  join addresses a on a.address_id = j.job_current_address_id
                   or a.address_id = j.job_original_address_id;

create view profile_display with (security_invoker = true) as
  select profile_id,
         profile_first_name as profile_greeting_name,
         profile_full_name
  from profiles;
