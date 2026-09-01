-- =============================================================================
-- 0077 — properties get their values, their options, and their locks
-- =============================================================================
-- 0043 built the definitions and said the answers would "come with their own
-- migration once the import's shape is settled". Amber settled it on 1 September with
-- the properties workbook: 285 fields, each naming its lifecycle stage, its process,
-- its format, its level (project or job) and the department that captures it. This is
-- that migration. The definitions are seeded in 0079; this is the shape they land in.
--
-- FOUR TABLES, ONE PURPOSE EACH
--
--   property_options        the choices a select-format property offers
--   property_access         which teams and which people may create / read / update /
--                           delete a property's values
--   property_values         the answers — one row per (property, record), sparse
--   property_value_history  every change to an answer, append-only, written by trigger
--
-- TYPED COLUMNS, NOT JSONB
--
--   jsonb has no date type, so every "received before X" becomes a string compare and
--   a wrong-typed write is undetectable. Each format owns one column; a CHECK says
--   which, and a composite foreign key pins the row's `property_def_format` to its
--   definition's, so the CHECK is always reading the definition's current word. Change
--   a definition from text to date with text values still in it and the cascade fails
--   the CHECK — which is the refusal you want, not a silent retype.
--
-- 'UNKNOWN' IS A FORMAT, ON PURPOSE
--
--   87 of the 175 property rows in the workbook say "unknown (no data)" in the type column.
--   Most of them are plainly dates — "Received (14 Days)", "Ordered" — and it is
--   tempting to say so on their behalf. The house rule is that a guess gets quoted
--   back as though it were agreed, so the definition carries `unknown`, the slot says
--   "format not set", and nothing can be recorded against it until a manager picks one
--   in Setup → Properties. The CHECK below makes `unknown` incapable of holding a value.
--
-- THE LOCKS — Amber, 1 September
--
--   "Each property will have security levels that allow CRUD access at a team level and
--    permissions level (eg admin, user, manager etc). Properties will also need to have
--    the option to be restricted so they are opt-in not opt-out and restricted to all
--    (except super admin) unless that user is given explicit access."
--
--   So a property carries four rungs (one per verb) and a restricted flag; access rows
--   name teams and people. Resolution for one verb, in order:
--
--     superadmin                                   -> allowed
--     below the verb's rung                        -> refused
--     restricted   -> a team I am in, or I, hold that verb in property_access
--     unrestricted -> manager and above; or nobody named at all (open at the rung);
--                     or a team I am in, or I, hold that verb
--
--   Manager does NOT bypass restricted — that is the whole meaning of the word. Admin
--   does not either: the exception is superadmin alone, as asked. The flag itself and
--   the access rows on a restricted property are superadmin's to change; the rungs on
--   an unrestricted one are admin's. Everything else about a definition is manager's,
--   because process design is the managers' work (Amber: "editable by managers, admin
--   and super admin").
--
--   The policy resolves "which keys may I read" ONCE per statement — `(select
--   private.property_keys('read'))` is an InitPlan — and compares the row's key against
--   the array. The plan's benchmark measured 2.3x on a full scan for exactly this shape.
--
-- WHY A JOB MAY HOLD A ROW FOR A PROJECT PROPERTY
--
--   0043's comment said a project property "cannot be overridden per job". Amber's ask
--   changes that: "if it is a project property, you should be able to push that
--   information from a project level to all jobs". A push is a copy, and a copy lives
--   on the job. So a project-scoped property has its true value on the project, read
--   through by every job, AND may hold a row on a job once pushed — which the drawer
--   labels as pushed, so a job that has since drifted from the project is visible rather
--   than silent. A job-scoped property still cannot hold a row on a project; the trigger
--   refuses it.
-- =============================================================================

-- ------------------------------------------------- the private schema, at last
-- Named in schema-plan.md since the permission model was written; created on the live
-- project by hand on 28 August and never by a migration, so a rebuild from empty had no
-- home for the helpers. PostgREST publishes `public` only, so nothing in here is an RPC.
create schema if not exists private;
grant usage on schema private to authenticated;
revoke all on schema private from public, anon;

-- ------------------------------------------------------- property_defs grows
alter table property_defs
  -- The workbook leaves the department blank on 130 rows. A blank is the truth there,
  -- and a NOT NULL would have forced a team onto every one of them.
  alter column property_def_owning_team drop not null;

alter table property_defs drop constraint if exists property_defs_format_is_known;
alter table property_defs add constraint property_defs_format_is_known
  check (property_def_format in ('text', 'number', 'currency', 'date', 'checkbox',
                                 'file', 'single select', 'multi select', 'person', 'link',
                                 'unknown'));

alter table property_defs
  add column if not exists property_def_restricted     boolean not null default false,
  add column if not exists property_def_create_level   permission_level not null default 'user',
  add column if not exists property_def_read_level     permission_level not null default 'viewer',
  add column if not exists property_def_update_level   permission_level not null default 'user',
  add column if not exists property_def_delete_level   permission_level not null default 'manager',
  -- The number the SLA sheet gives for this step, in days. Stored as given; what it is
  -- counted from is the process's business (0078), not inferred here.
  add column if not exists property_def_sla_days       smallint,
  add column if not exists property_def_is_active      boolean not null default true,
  add column if not exists property_def_description    text,
  -- The row number in Amber's workbook, so a question about a field can be taken back
  -- to the sheet it came from.
  add column if not exists property_def_import_ref     text;

alter table property_defs drop constraint if exists property_defs_sla_is_not_negative;
alter table property_defs add constraint property_defs_sla_is_not_negative
  check (property_def_sla_days is null or property_def_sla_days >= 0);

-- The target of the composite foreign key on property_values. Not redundant with the
-- primary key: it is what lets a value row carry the format and be held to it.
alter table property_defs drop constraint if exists property_defs_key_and_format;
alter table property_defs add constraint property_defs_key_and_format
  unique (property_def_key, property_def_format);

comment on column property_defs.property_def_owning_team is
  'Which team is answerable for capturing it — the workbook''s department, mapped to a team slug. Null when the workbook named nobody; a blank is the truth, not a gap to fill.';
comment on column property_defs.property_def_format is
  'What shape the value takes. `unknown` means the workbook had no data to say — the slot renders as "format not set" and can hold nothing until a manager picks one.';
comment on column property_defs.property_def_restricted is
  'Opt-in rather than opt-out: when true, nobody but superadmin sees or touches its values unless a property_access row names their team or them. Manager and admin do not bypass it. Only superadmin may flip this.';
comment on column property_defs.property_def_create_level is 'Lowest permission rung that may record a value for this property (subject to the team/person rules).';
comment on column property_defs.property_def_read_level   is 'Lowest permission rung that may read a value for this property (subject to the team/person rules).';
comment on column property_defs.property_def_update_level is 'Lowest permission rung that may change a recorded value (subject to the team/person rules). Setting a signed-off date and changing one are different questions, so this is separate from create.';
comment on column property_defs.property_def_delete_level is 'Lowest permission rung that may clear a recorded value (subject to the team/person rules).';
comment on column property_defs.property_def_sla_days is 'The days the SLA sheet gives for this step, stored as given. Which clock it is counted from is the process''s to say.';
comment on column property_defs.property_def_is_active is 'Retirement, not deletion: a retired property stops appearing on forms and keeps every value ever recorded in it.';
comment on column property_defs.property_def_import_ref is 'Where this came from — the workbook row ("Properties!12") — so a question about a field can be taken back to its source.';

-- ---------------------------------------------- the rungs and the flag are guarded
create or replace function guard_property_def_security()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  perm permission_level;
begin
  if auth.uid() is null then
    return new;
  end if;
  perm := current_permission();

  if tg_op = 'INSERT' then
    -- A new restricted property, or one born above the default rungs, is the same act
    -- as changing those on an existing one.
    if new.property_def_restricted and perm < 'superadmin' then
      raise exception 'Only a superadmin can create a restricted property.' using errcode = '42501';
    end if;
    if perm < 'admin' and (new.property_def_create_level <> 'user'
                           or new.property_def_read_level <> 'viewer'
                           or new.property_def_update_level <> 'user'
                           or new.property_def_delete_level <> 'manager') then
      raise exception 'Setting a property''s security levels needs admin permission or above.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.property_def_restricted is distinct from old.property_def_restricted and perm < 'superadmin' then
    raise exception 'Only a superadmin can restrict a property, or lift a restriction.' using errcode = '42501';
  end if;

  if perm < 'admin' and (
       new.property_def_create_level is distinct from old.property_def_create_level
    or new.property_def_read_level   is distinct from old.property_def_read_level
    or new.property_def_update_level is distinct from old.property_def_update_level
    or new.property_def_delete_level is distinct from old.property_def_delete_level) then
    raise exception 'Changing a property''s security levels needs admin permission or above.' using errcode = '42501';
  end if;

  return new;
end $$;

revoke execute on function guard_property_def_security() from public, anon, authenticated;

drop trigger if exists property_defs_guard_security on property_defs;
create trigger property_defs_guard_security
  before insert or update on property_defs
  for each row execute function guard_property_def_security();

-- Managers define what the company captures (Amber, 1 Sep). Was superadmin since 0043.
drop policy if exists "superadmins write property defs" on property_defs;
drop policy if exists "managers write property defs" on property_defs;
create policy "managers write property defs" on property_defs
  for all to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');

-- ------------------------------------------------------------ property_options
create table if not exists property_options (
  property_def_key         text not null references property_defs (property_def_key)
                             on update cascade on delete cascade,
  property_option_key      text not null
    constraint property_options_key_is_a_slug check (property_option_key ~ '^[a-z0-9][a-z0-9_]*$'),
  property_option_label    text not null check (length(trim(property_option_label)) > 0),
  property_option_position smallint not null default 0,
  property_option_is_active boolean not null default true,

  property_option_created_at timestamptz not null default now(),
  property_option_created_by uuid references profiles (profile_id),
  property_option_updated_at timestamptz not null default now(),
  property_option_updated_by uuid references profiles (profile_id),

  primary key (property_def_key, property_option_key)
);

comment on table property_options is
  'The choices a single- or multi-select property offers, as rows so a team can add one without a migration. Starts empty: the workbook names "Agreement type" as an enum and lists no values, and a list nobody at Lofty wrote would be quoted back as though they had.';

create trigger property_options_touch before update on property_options
  for each row execute function extensions.moddatetime(property_option_updated_at);
create trigger property_options_stamp_created_by before insert on property_options
  for each row execute function stamp_created_by('property_option_created_by');

-- ------------------------------------------------------------- property_access
create table if not exists property_access (
  property_access_id   uuid primary key default gen_random_uuid(),
  property_def_key     text not null references property_defs (property_def_key)
                         on update cascade on delete cascade,
  -- Exactly one grantee. A team is the normal case (Amber: "restricted may be 100 —
  -- mainly finance", which is one grant repeated); a person is the exception on top.
  team_id              text references teams (team_id) on update cascade,
  profile_id           uuid references profiles (profile_id) on delete cascade,

  property_access_can_create boolean not null default true,
  property_access_can_read   boolean not null default true,
  property_access_can_update boolean not null default true,
  property_access_can_delete boolean not null default false,

  property_access_created_at timestamptz not null default now(),
  property_access_created_by uuid references profiles (profile_id),
  property_access_updated_at timestamptz not null default now(),
  property_access_updated_by uuid references profiles (profile_id),

  constraint property_access_one_grantee check (num_nonnulls(team_id, profile_id) = 1),
  -- A row granting nothing is a row that reads as a grant in the editor.
  constraint property_access_grants_something
    check (property_access_can_create or property_access_can_read
           or property_access_can_update or property_access_can_delete)
);

create unique index if not exists property_access_one_row_per_team
  on property_access (property_def_key, team_id) where team_id is not null;
create unique index if not exists property_access_one_row_per_person
  on property_access (property_def_key, profile_id) where profile_id is not null;
create index if not exists property_access_by_team on property_access (team_id) where team_id is not null;
create index if not exists property_access_by_person on property_access (profile_id) where profile_id is not null;

comment on table property_access is
  'Who may do what with a property''s values, by team or by person, one verb per column. On an unrestricted property these rows narrow access below manager (no rows at all means open at the rung); on a restricted one they are the only way in, and superadmin alone may write them.';

create trigger property_access_touch before update on property_access
  for each row execute function extensions.moddatetime(property_access_updated_at);
create trigger property_access_stamp_created_by before insert on property_access
  for each row execute function stamp_created_by('property_access_created_by');

create or replace function guard_property_access_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  key text := coalesce(new.property_def_key, old.property_def_key);
  restricted boolean;
  perm permission_level;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  perm := current_permission();
  select property_def_restricted into restricted from property_defs where property_def_key = key;

  if coalesce(restricted, false) and perm < 'superadmin' then
    raise exception 'Access to a restricted property is granted by a superadmin only.' using errcode = '42501';
  end if;
  if perm < 'admin' then
    raise exception 'Granting access to a property needs admin permission or above.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

revoke execute on function guard_property_access_writes() from public, anon, authenticated;

create trigger property_access_guard_writes
  before insert or update or delete on property_access
  for each row execute function guard_property_access_writes();

-- -------------------------------------------------------------- the helpers
create or replace function private.my_teams()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(pt.team_id), '{}'::text[])
  from profile_teams pt
  where pt.profile_id = current_profile_id()
$$;

comment on function private.my_teams() is
  'The team slugs the signed-in person belongs to, for policies. SECURITY DEFINER so a policy on profile_teams could call it without recursing; STABLE so it runs once per statement.';

-- Which properties the signed-in person may act on, for one verb. The whole permission
-- model for property values is this one function; the policies compare a row's key
-- against its result, once per statement.
create or replace function private.property_keys(verb text)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select current_permission() as perm,
           current_profile_id() as pid,
           private.my_teams()   as teams
  ),
  granted as (
    select a.property_def_key
    from property_access a, me
    where (a.team_id = any (me.teams) or a.profile_id = me.pid)
      and case verb
            when 'create' then a.property_access_can_create
            when 'read'   then a.property_access_can_read
            when 'update' then a.property_access_can_update
            when 'delete' then a.property_access_can_delete
            else false
          end
  )
  select coalesce(array_agg(d.property_def_key), '{}'::text[])
  from property_defs d, me
  where me.perm = 'superadmin'
     or (
          me.perm >= case verb
                       when 'create' then d.property_def_create_level
                       when 'read'   then d.property_def_read_level
                       when 'update' then d.property_def_update_level
                       when 'delete' then d.property_def_delete_level
                     end
          and case
                when d.property_def_restricted then
                  d.property_def_key in (select property_def_key from granted)
                else
                  me.perm >= 'manager'
                  or not exists (select 1 from property_access a where a.property_def_key = d.property_def_key)
                  or d.property_def_key in (select property_def_key from granted)
              end
        )
$$;

comment on function private.property_keys(text) is
  'The property keys the signed-in person may create / read / update / delete values for. Superadmin: all. Otherwise: at or above the verb''s rung, and — restricted — named by team or person in property_access; unrestricted — manager and above, or nobody named, or named. Evaluated once per statement inside the policies.';

-- Policies run with the CALLER's function privileges (0011 proved that revoking this
-- broke every read), so authenticated must be able to execute them. They are not RPCs:
-- `private` is not published by PostgREST.
revoke execute on function private.my_teams() from public, anon;
revoke execute on function private.property_keys(text) from public, anon;
grant execute on function private.my_teams() to authenticated;
grant execute on function private.property_keys(text) to authenticated;

-- The one thing the app needs to know before it draws a control: what may this person
-- do with each property. Security invoker; it only re-uses the same helpers the
-- policies do, so the screen and the database cannot disagree.
create or replace function my_property_access()
returns table (property_def_key text, can_create boolean, can_read boolean,
               can_update boolean, can_delete boolean)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with keys as (
    select private.property_keys('create') as c,
           private.property_keys('read')   as r,
           private.property_keys('update') as u,
           private.property_keys('delete') as d
  )
  select d.property_def_key,
         d.property_def_key = any (k.c),
         d.property_def_key = any (k.r),
         d.property_def_key = any (k.u),
         d.property_def_key = any (k.d)
  from property_defs d, keys k
$$;

revoke execute on function my_property_access() from public, anon;
grant execute on function my_property_access() to authenticated;

comment on function my_property_access() is
  'Per property, what the signed-in person may do with its values — the same answer the policies give, so a control the screen offers is one the database will accept.';

-- -------------------------------------------------------------- property_values
create table if not exists property_values (
  property_value_id     uuid primary key default gen_random_uuid(),

  property_def_key      text not null,
  -- Pinned to the definition's format by the composite foreign key below, so the CHECK
  -- reads the definition's current word and a plain CHECK never has to see another row.
  property_def_format   text not null,

  job_id                text references jobs (job_id) on update cascade on delete cascade,
  project_id            integer references projects (project_id) on update cascade on delete cascade,

  -- One column per format. Exactly one is filled, and which one is the format's call.
  property_value_text        text,          -- text, link, file
  property_value_number      numeric,       -- number, currency
  property_value_date        date,          -- date
  property_value_bool        boolean,       -- checkbox
  property_value_profile_id  uuid references profiles (profile_id),   -- person
  property_value_option_key  text,          -- single select
  property_value_option_keys text[],        -- multi select

  -- When the CURRENT value was recorded and by whom. Distinct from updated_at, which a
  -- later push or a no-op save would move; this only moves when the answer does.
  property_value_set_at timestamptz not null default now(),
  property_value_set_by uuid references profiles (profile_id),

  property_value_created_at timestamptz not null default now(),
  property_value_created_by uuid references profiles (profile_id),
  property_value_updated_at timestamptz not null default now(),
  property_value_updated_by uuid references profiles (profile_id),

  constraint property_values_one_parent check (num_nonnulls(job_id, project_id) = 1),

  constraint property_values_carry_one_value check (
    num_nonnulls(property_value_text, property_value_number, property_value_date,
                 property_value_bool, property_value_profile_id,
                 property_value_option_key, property_value_option_keys) = 1
  ),

  constraint property_values_match_their_format check (
    case property_def_format
      when 'text'          then property_value_text        is not null
      when 'link'          then property_value_text        is not null
      when 'file'          then property_value_text        is not null
      when 'number'        then property_value_number      is not null
      when 'currency'      then property_value_number      is not null
      when 'date'          then property_value_date        is not null
      when 'checkbox'      then property_value_bool        is not null
      when 'person'        then property_value_profile_id  is not null
      when 'single select' then property_value_option_key  is not null
      when 'multi select'  then property_value_option_keys is not null
      else false   -- 'unknown' holds nothing, by design
    end
  ),

  -- Same posture as the SharePoint columns (0040): a scheme, not a bare path.
  constraint property_values_link_is_a_url check (
    property_def_format <> 'link' or property_value_text ~ '^https?://\S+$'
  ),

  constraint property_values_pinned_to_their_definition
    foreign key (property_def_key, property_def_format)
    references property_defs (property_def_key, property_def_format)
    on update cascade on delete cascade,

  -- A chosen option must belong to THIS property, not to some other property's list.
  constraint property_values_option_belongs_to_the_property
    foreign key (property_def_key, property_value_option_key)
    references property_options (property_def_key, property_option_key)
    on update cascade
);

-- One answer per property per record — the two partial indexes are the primary key a
-- nullable pair of parents cannot express (null never equals null).
create unique index if not exists property_values_one_per_job
  on property_values (property_def_key, job_id) where job_id is not null;
create unique index if not exists property_values_one_per_project
  on property_values (property_def_key, project_id) where project_id is not null;
-- The drawer: everything on this record.
create index if not exists property_values_job_idx on property_values (job_id) where job_id is not null;
create index if not exists property_values_project_idx on property_values (project_id) where project_id is not null;
-- The report: this property across records, and the policy's key comparison.
create index if not exists property_values_key_idx on property_values (property_def_key);
create index if not exists property_values_date_idx
  on property_values (property_def_key, property_value_date) where property_value_date is not null;

comment on table property_values is
  'The answers. One row per (property, record), sparse — no row means not recorded, and clearing a field deletes the row. Typed columns, not jsonb, so a date is a date; the composite foreign key pins each row to its definition''s format and the CHECK says which column that format fills. A project property''s true value is on the project and read through by its jobs; a row on a job for a project property is a pushed copy (push_project_properties).';
comment on column property_values.property_value_set_at is
  'When the current answer was recorded. Moves only when the answer changes — not on a no-op save and not on a push that carried the same value.';

create trigger property_values_touch before update on property_values
  for each row execute function extensions.moddatetime(property_value_updated_at);
create trigger property_values_stamp_created_by before insert on property_values
  for each row execute function stamp_created_by('property_value_created_by');

-- The value as one jsonb, whichever column holds it — for the history and for anything
-- that wants an answer without seven columns.
create or replace function property_value_payload(v property_values)
returns jsonb
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select coalesce(
    to_jsonb(v.property_value_text),
    to_jsonb(v.property_value_number),
    to_jsonb(v.property_value_date),
    to_jsonb(v.property_value_bool),
    to_jsonb(v.property_value_profile_id),
    to_jsonb(v.property_value_option_key),
    to_jsonb(v.property_value_option_keys)
  )
$$;

revoke execute on function property_value_payload(property_values) from public, anon;
grant execute on function property_value_payload(property_values) to authenticated;

-- Scope, and the stamps. A job-scoped property cannot land on a project; a project-
-- scoped one may land on a job only as a pushed copy, which is still a job row and is
-- allowed. set_at / set_by move only when the payload does.
create or replace function guard_property_value()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  def_scope text;
begin
  select property_def_scope into def_scope from property_defs where property_def_key = new.property_def_key;
  if def_scope = 'job' and new.project_id is not null then
    raise exception 'Property % is a job property and cannot be recorded on a project.', new.property_def_key
      using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or property_value_payload(new) is distinct from property_value_payload(old) then
    new.property_value_set_at := now();
    new.property_value_set_by := coalesce(current_profile_id(), new.property_value_set_by);
  else
    new.property_value_set_at := old.property_value_set_at;
    new.property_value_set_by := old.property_value_set_by;
  end if;
  return new;
end $$;

revoke execute on function guard_property_value() from public, anon, authenticated;

create trigger property_values_guard before insert or update on property_values
  for each row execute function guard_property_value();

-- ------------------------------------------------------- property_value_history
-- Not activity_audit: that table's read policy is admin-only, and the whole premise of
-- the locks above is that admin is not the same right as reading commercial data. This
-- history is readable by exactly the people who may read the value.
create table if not exists property_value_history (
  property_value_history_id bigint generated always as identity primary key,
  property_def_key  text not null,
  job_id            text,
  project_id        integer,
  property_value_history_old jsonb,
  property_value_history_new jsonb,
  property_value_history_at timestamptz not null default now(),
  property_value_history_by uuid references profiles (profile_id),
  constraint property_value_history_actually_changed
    check (property_value_history_old is distinct from property_value_history_new)
);

create index if not exists property_value_history_job_idx
  on property_value_history (job_id, property_value_history_at desc) where job_id is not null;
create index if not exists property_value_history_project_idx
  on property_value_history (project_id, property_value_history_at desc) where project_id is not null;
create index if not exists property_value_history_key_idx on property_value_history (property_def_key);

comment on table property_value_history is
  'Every change to an answer, append-only, written by trigger. No foreign keys on the record or the property, deliberately: it records what WAS, which stays true after the row it describes is gone. Readable by whoever may read the value — not admin-only like activity_audit, because admin is not the same right as reading commercial data.';

create or replace function log_property_value_history()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_v jsonb := case when tg_op = 'INSERT' then null else property_value_payload(old) end;
  after_v  jsonb := case when tg_op = 'DELETE' then null else property_value_payload(new) end;
begin
  if before_v is not distinct from after_v then
    return coalesce(new, old);
  end if;
  insert into property_value_history (property_def_key, job_id, project_id,
                                      property_value_history_old, property_value_history_new,
                                      property_value_history_by)
  values (coalesce(new.property_def_key, old.property_def_key),
          coalesce(new.job_id, old.job_id),
          coalesce(new.project_id, old.project_id),
          before_v, after_v, current_profile_id());
  return coalesce(new, old);
end $$;

revoke execute on function log_property_value_history() from public, anon, authenticated;

create trigger property_values_log_history after insert or update or delete on property_values
  for each row execute function log_property_value_history();

-- ------------------------------------------------------------- the push
-- Amber: "push that information from a project level to all jobs". Copies the project's
-- recorded values for its project-scoped properties onto every live job on the project.
-- SECURITY INVOKER, so the policies decide: a person who may not read a project value
-- does not see it to copy, and one who may not create it on a job is refused.
-- Closed and Cancelled jobs are left alone — their data does not change (0045, 0057).
create or replace function push_project_properties(p_project_id integer, p_keys text[] default null)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  pushed integer;
begin
  insert into property_values (property_def_key, property_def_format, job_id,
                               property_value_text, property_value_number, property_value_date,
                               property_value_bool, property_value_profile_id,
                               property_value_option_key, property_value_option_keys)
  select v.property_def_key, v.property_def_format, j.job_id,
         v.property_value_text, v.property_value_number, v.property_value_date,
         v.property_value_bool, v.property_value_profile_id,
         v.property_value_option_key, v.property_value_option_keys
  from property_values v
  join property_defs d on d.property_def_key = v.property_def_key
  join jobs j on j.project_id = v.project_id
  where v.project_id = p_project_id
    and d.property_def_scope = 'project'
    and (p_keys is null or v.property_def_key = any (p_keys))
    and j.job_stage not in ('Closed', 'Cancelled')
  on conflict (property_def_key, job_id) where job_id is not null do update
    set property_value_text        = excluded.property_value_text,
        property_value_number      = excluded.property_value_number,
        property_value_date        = excluded.property_value_date,
        property_value_bool        = excluded.property_value_bool,
        property_value_profile_id  = excluded.property_value_profile_id,
        property_value_option_key  = excluded.property_value_option_key,
        property_value_option_keys = excluded.property_value_option_keys;
  get diagnostics pushed = row_count;
  return pushed;
end $$;

revoke execute on function push_project_properties(integer, text[]) from public, anon;
grant execute on function push_project_properties(integer, text[]) to authenticated;

comment on function push_project_properties(integer, text[]) is
  'Copies a project''s recorded project-level property values onto every live job on it (all of them, or the keys given). Security invoker: the property policies decide what the caller may read and write. Returns how many job rows were written.';

-- ------------------------------------------------------------------------- RLS
alter table property_options       enable row level security;
alter table property_access        enable row level security;
alter table property_values        enable row level security;
alter table property_value_history enable row level security;

create policy "read property options" on property_options
  for select to authenticated using ((select is_active_user()));
create policy "managers write property options" on property_options
  for all to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');

-- Everybody may see who has access to what — the grant is not the secret, the value is.
-- Writes are admin+ by policy and superadmin on restricted properties by the trigger.
create policy "read property access" on property_access
  for select to authenticated using ((select is_active_user()));
create policy "admins write property access" on property_access
  for all to authenticated
  using ((select current_permission()) >= 'admin')
  with check ((select current_permission()) >= 'admin');

create policy "read property values" on property_values
  for select to authenticated
  using ((select is_active_user())
         and property_def_key = any ((select private.property_keys('read'))::text[]));
create policy "create property values" on property_values
  for insert to authenticated
  with check ((select is_active_user())
              and property_def_key = any ((select private.property_keys('create'))::text[]));
create policy "update property values" on property_values
  for update to authenticated
  using ((select is_active_user())
         and property_def_key = any ((select private.property_keys('update'))::text[]))
  with check ((select is_active_user())
              and property_def_key = any ((select private.property_keys('update'))::text[]));
create policy "delete property values" on property_values
  for delete to authenticated
  using ((select is_active_user())
         and property_def_key = any ((select private.property_keys('delete'))::text[]));

-- Read-only, and only for values you may read. No write policies: the trigger writes it
-- as SECURITY DEFINER and needs none, and a history that can be edited is not one.
create policy "read property value history" on property_value_history
  for select to authenticated
  using ((select is_active_user())
         and property_def_key = any ((select private.property_keys('read'))::text[]));

-- ---------------------------------------------- property_defs joins the audit
-- 0043 attached the audit trigger to property_defs; the allowlist inside the function
-- never learned the name, so it fired and wrote nothing — coverage that was not there.
create or replace function log_activity_audit() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in ('profiles', 'addresses', 'projects', 'jobs',
                              'teams', 'profile_teams', 'tasks', 'variations',
                              'property_defs', 'property_access', 'processes') then
    return null;
  end if;

  if tg_op = 'INSERT' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, null, redact_audit_row(to_jsonb(new)));
    return new;
  elsif tg_op = 'UPDATE' then
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op,
            redact_audit_row(to_jsonb(old)), redact_audit_row(to_jsonb(new)));
    return new;
  else
    insert into public.activity_audit (schema_name, table_name, operation, old_row, new_row)
    values (tg_table_schema, tg_table_name, tg_op, redact_audit_row(to_jsonb(old)), null);
    return old;
  end if;
end;
$$;

drop trigger if exists trg_activity_audit_row on property_access;
create trigger trg_activity_audit_row after insert or update or delete on property_access
  for each row execute function log_activity_audit();

-- ---------------------------------------------------------------------- proof
-- Each CHECK watched biting as the owner, in sub-blocks whose rollback removes the
-- attempt. The RLS half — a manager refused a restricted value, a granted team reading
-- one — runs as a signed-in person in verify/rls.sql, where the fixtures are.
-- The probe brings its own record. On a replay from empty there are no jobs, and a probe
-- that inserts `select … from jobs limit 1` against an empty table inserts nothing,
-- raises nothing, and reads as a pass — the class of fault verify/check.sh exists for.
do $$
declare
  probe_key text := 'probe_0077';
  probe_address uuid;
  probe_project integer;
  probe_job text;
  -- The probe's project takes a number from the sequence and is then deleted, which
  -- would leave a permanent gap the next real project inherits (behaviour.sql expects
  -- the first project on a fresh database to be 1000). The sequence is put back exactly
  -- as it was found — the same last_value and is_called — never rewound past a real row.
  seq text := pg_get_serial_sequence('projects', 'project_id');
  seq_last bigint; seq_called boolean;
begin
  execute format('select last_value, is_called from %s', seq) into seq_last, seq_called;
  insert into addresses (address_lot_number, address_street_1, address_suburb, address_postcode, address_council)
  values ('0077', 'Probe Street', 'Golden Grove', '5125', 'City of Tea Tree Gully')
  returning address_id into probe_address;
  insert into projects (project_original_address_id, project_current_address_id, project_type)
  values (probe_address, probe_address, 'residential')
  returning project_id into probe_project;
  insert into jobs (project_id, job_original_address_id, job_current_address_id, job_owning_team)
  values (probe_project, probe_address, probe_address, 'design')
  returning job_id into probe_job;

  insert into property_defs (property_def_key, property_def_label, property_def_scope,
                             property_def_stage, property_def_format)
  values (probe_key, '0077 probe', 'job', 'Pre-construction', 'date');

  -- No parent at all is refused.
  begin
    insert into property_values (property_def_key, property_def_format, property_value_date)
    values (probe_key, 'date', current_date);
    raise exception 'a value with no parent was accepted';
  exception when check_violation then null; end;

  -- The wrong typed column for the format is refused.
  begin
    insert into property_values (property_def_key, property_def_format, job_id, property_value_text)
    values (probe_key, 'date', probe_job, 'not a date');
    raise exception 'text was accepted into a date property';
  exception when check_violation then null; end;

  -- A row claiming a format its definition does not have is refused by the composite FK.
  begin
    insert into property_values (property_def_key, property_def_format, job_id, property_value_text)
    values (probe_key, 'text', probe_job, 'smuggled');
    raise exception 'a value lied about its definition''s format and was accepted';
  exception when foreign_key_violation then null; end;

  -- A sound date is accepted, and the history has one line for it.
  insert into property_values (property_def_key, property_def_format, job_id, property_value_date)
  values (probe_key, 'date', probe_job, date '2026-09-01');
  if (select count(*) from property_value_history where property_def_key = probe_key) <> 1 then
    raise exception 'recording a value did not write one history line';
  end if;

  -- Retyping a definition with values still in it is refused — the cascade carries the
  -- new format onto the row and the CHECK refuses it there.
  begin
    update property_defs set property_def_format = 'text' where property_def_key = probe_key;
    raise exception 'a definition was retyped over a live value';
  exception when check_violation then null; end;

  delete from property_values where property_def_key = probe_key;

  -- unknown can hold nothing.
  update property_defs set property_def_format = 'unknown' where property_def_key = probe_key;
  begin
    insert into property_values (property_def_key, property_def_format, job_id, property_value_text)
    values (probe_key, 'unknown', probe_job, 'anything');
    raise exception 'an unknown-format property accepted a value';
  exception when check_violation then null; end;

  -- A job property cannot land on a project.
  update property_defs set property_def_format = 'text' where property_def_key = probe_key;
  begin
    insert into property_values (property_def_key, property_def_format, project_id, property_value_text)
    values (probe_key, 'text', probe_project, 'wrong level');
    raise exception 'a job property was recorded on a project';
  exception when check_violation then null; end;

  -- A grant naming nobody is refused.
  begin
    insert into property_access (property_def_key) values (probe_key);
    raise exception 'a grant naming nobody was accepted';
  exception when check_violation then null; end;

  -- A grant granting nothing is refused.
  begin
    insert into property_access (property_def_key, team_id, property_access_can_create,
                                 property_access_can_read, property_access_can_update)
    values (probe_key, 'design', false, false, false);
    raise exception 'a grant of nothing was accepted';
  exception when check_violation then null; end;

  delete from property_defs where property_def_key = probe_key;
  delete from projects where project_id = probe_project;   -- cascades the job
  delete from addresses where address_id = probe_address;
  delete from property_value_history where property_def_key = probe_key;
  perform setval(seq, seq_last, seq_called);
  raise notice 'ok  property values: parent, format, definition pin, retype, unknown, scope and grants all bite';
end $$;
