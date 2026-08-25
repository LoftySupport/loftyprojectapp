-- =============================================================================
-- 0043 — property definitions become a table
-- =============================================================================
-- The Setup › Properties screen has been reading `listPropertyDefs()` since the seam
-- existed, and the method has been answering with an empty list since the seeded
-- definitions were removed — they were written to show the shape of the model, not
-- taken from Lofty, and five of them named a stage that does not exist. This is the
-- table the screen was always waiting for.
--
-- ROWS, NOT COLUMNS
--
--   A property IS a field. "Fencing type" on a project, "pour date" on a job — the
--   things a team captures that are not schema. Making them rows is what lets a team
--   add one without a migration, which is the entire reason this table exists.
--
-- WHAT A DEFINITION SAYS
--
--   Where the value lives (project or job — `scope` is exclusive, a project property
--   cannot be overridden per job), which lifecycle stage captures it, which team is
--   answerable for capturing it, what shape the value takes, and whether it is
--   required to LEAVE that stage — required-to-exit, not required-to-create.
--
-- THE KEY IS THE IDENTITY
--
--   `property_def_key` is the primary key, same stance as `teams.team_id`: a slug the
--   app and any future import both address. Values tables will reference it, so it
--   cascades on update — renaming a key is legal and carries its values with it.
--
-- WHO EDITS
--
--   Superadmin, same as pipelines — Amber, 25 August: properties "should be editable
--   in superadmin". Defining what the company captures is process design, not daily
--   work. Everyone signed in can read them; the slots render on every record.
--
-- WHAT IS DELIBERATELY NOT HERE
--
--   Seed rows. Eleven invented definitions have already been deleted from this app
--   once; a table that ships pre-filled with guesses gets its guesses quoted back as
--   though they were agreed. It starts empty and Lofty fills it.
--
--   `property_values` — the answers themselves. A definition with no way to store
--   answers is still useful (the screens show the slots); the values table needs the
--   import's shape settled first and comes with its own migration.
-- =============================================================================

create table if not exists property_defs (
  property_def_key        text primary key,
  property_def_label      text not null,
  property_def_scope      text not null
    constraint property_defs_scope_is_project_or_job
    check (property_def_scope in ('project', 'job')),
  -- The same five words projects and jobs use, enforced the same way. Not a FK to
  -- pipeline_stages: the lifecycle is the shared vocabulary (0035), and a team's own
  -- pipeline stages are that team's business.
  property_def_stage      text not null
    constraint property_defs_stage_is_a_lifecycle_stage
    check (property_def_stage in ('Acquisition & Development', 'Pre-construction',
                                  'Construction', 'Handover & Maintenance', 'Closed')),
  property_def_owning_team text not null
    references teams (team_id) on update cascade,
  property_def_format     text not null
    constraint property_defs_format_is_known
    check (property_def_format in ('text', 'number', 'currency', 'date', 'checkbox',
                                   'file', 'single select', 'multi select', 'person', 'link')),
  property_def_required   boolean not null default false,
  property_def_automation text,
  -- Where it sits among its stage's slots. Data, not alphabet: the person defining
  -- the fields decides what order a form asks its questions in.
  property_def_position   smallint not null default 0,

  property_def_created_at timestamptz not null default now(),
  property_def_created_by uuid references profiles (profile_id),
  property_def_updated_at timestamptz not null default now(),
  property_def_updated_by uuid references profiles (profile_id),

  constraint property_defs_key_is_a_slug
    check (property_def_key ~ '^[a-z][a-z0-9_]*$')
);

create index if not exists property_defs_stage_idx
  on property_defs (property_def_stage, property_def_position);

comment on table property_defs is
  'What the company captures on a record beyond the schema — a property IS a field. Rows, not columns, so a team can add one without a migration. Each says where the value lives (project or job, exclusive), which lifecycle stage and team capture it, its format, and whether it is required to leave that stage. Starts empty on purpose: invented definitions get quoted back as though they were agreed. The values live in a future property_values table keyed on property_def_key.';

comment on column property_defs.property_def_required is
  'Required to LEAVE the stage that captures it — not required to create the record.';

create trigger property_defs_touch before update on property_defs
  for each row execute function extensions.moddatetime(property_def_updated_at);
create trigger property_defs_stamp_created_by before insert on property_defs
  for each row execute function stamp_created_by('property_def_created_by');

drop trigger if exists trg_activity_audit_row_property_defs on property_defs;
create trigger trg_activity_audit_row after insert or update or delete on property_defs
  for each row execute function log_activity_audit();

-- ------------------------------------------------------------------------- RLS
alter table property_defs enable row level security;

create policy "read property defs" on property_defs
  for select to authenticated
  using ((select is_active_user()));

-- One policy for all three writes, same as pipelines: process design is superadmin's.
create policy "superadmins write property defs" on property_defs
  for all to authenticated
  using ((select current_permission()) >= 'superadmin')
  with check ((select current_permission()) >= 'superadmin');
