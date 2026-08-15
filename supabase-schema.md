# Supabase schema — derived from the binding template

`supabase-template.html` is the prototype with every data value replaced by a
`{{table.column}}` token. This file is the other half: the tables and columns those tokens
point at, plus the seed data the app assumes exists.

Build this schema, seed the lookup tables, then bind the template's tokens to it.

---

## The rule the template follows

Not everything on screen is a placeholder, and the distinction is deliberate:

| Left as real values | Why |
| --- | --- |
| Stage, status, type, team, build stage, tag names | **Closed lookup sets.** These aren't dummy content — they're the business process, and they belong in Supabase as seeded lookup tables. They're listed below as the seed data. |
| Job numbers (`1000-01`), project numbers (`1000`) | **Join keys.** They wire the board, drill-downs, dependencies and the drawer together. Tokenising them would break navigation and hide nothing useful. |
| Dates, day counts, progress percentages | **Drive layout and arithmetic.** The Gantt, the calendar and the "days in stage" colouring all compute from them. Most are derived and shouldn't be stored at all — see *Derived, don't store* below. |
| Everything a human reads as content | **Tokenised.** Addresses, names, notes, comments, activity text, statuses of contract/deposit/drawings, source system. |

If you'd rather see tokens on the lookup fields too, say so — it's a one-line change to
the generator. The current split keeps the eight-column board and the colour system intact
so you can still check the formatting you're preserving.

---

## Tokens in the template → columns

| Token | Column | Type | Notes |
| --- | --- | --- | --- |
| `{{addresses.consolidated_address}}` | `addresses.consolidated_address` | trigger-maintained `text` | Site address. Assembled in the database, so every card, export and search reads the same string |
| `{{addresses.suburb}}` | `addresses.suburb` | `text not null` | |
| `{{council_regions.name}}` | join from `addresses.council_id` | — | |
| `{{project_display.current_address}}` | view over `projects` + `addresses` | — | What project cards show. A generated column cannot reach another table, so it is a view |
| `{{jobs.source_system}}` | `jobs.source_system` | `text` | Where the record originated — HubSpot, SharePoint, SiteBook, Trello |
| `{{jobs.contract_status}}` | `jobs.contract_status` | `text` | Free text today; a lookup if the states settle |
| `{{jobs.deposit_status}}` | `jobs.deposit_status` | `text` | " |
| `{{jobs.drawings_status}}` | `jobs.drawings_status` | `text` | " |
| `{{jobs.notes}}` | `jobs.notes` | `text` | |
| `{{jobs.requested_note}}` | `jobs.requested_note` | `text` | Nullable. Non-null is what makes a card show the amber "waiting" flag |
| `{{profiles.full_name}}` | `profiles.full_name` | `text not null` | Used for assignee, project manager and comment authors |
| `{{property_values.value}}` | `property_values.value` | `jsonb` | Client, notes and anything else not on the simplified `projects` — they are property definitions now, not columns |
| `{{activity.description}}` | `activity.description` | `text not null` | One feed for jobs and projects |
| `{{comments.author_name}}` | join to `profiles.full_name` | — | Store `author_id uuid`, not a name |
| `{{comments.body}}` | `comments.body` | `text not null` | |

---

## Tables

### Lookups — seed these first

```sql
create table teams            (id uuid primary key default gen_random_uuid(),
                               name text unique not null,
                               parent_team_id uuid references teams(id));  -- team_hierarchy scope needs this
create table stages           (id smallint primary key, name text unique not null, position smallint not null);
create table build_stages     (id smallint primary key, name text unique not null, position smallint not null,
                               typical_days smallint);
create table tags             (id uuid primary key default gen_random_uuid(), name text unique not null);
-- Permission is an enum, not a lookup table. It is a fixed ladder rather than data
-- anyone maintains, and Postgres orders enum values by declaration — so `permission >=
-- 'manager'` is a valid comparison, which is exactly how the policies want to read.
-- Adding a rung later is `alter type … add value`, which does not lock the table.
-- Intended to map onto Microsoft Teams permission levels when that sync lands.
create type permission_level as enum ('viewer', 'user', 'manager', 'admin', 'superadmin');

-- Eight states and territories, and that is the whole list — a genuine enum.
create type au_state as enum ('SA', 'NSW', 'VIC', 'QLD', 'WA', 'NT', 'TAS', 'ACT');

-- One value today. An enum rather than a text column so the day a second country
-- appears it is `alter type … add value`, not a data-cleaning exercise.
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


-- Councils are a TABLE, not an enum, and this is the one place I have not done what
-- was asked — worth two lines on why.
--
-- SA alone has 68 councils and Australia has about 537. Enum values cannot be renamed
-- or removed without rebuilding the type, and councils amalgamate, split and rename
-- (SA's own boundaries have moved twice in living memory). That is data with a
-- lifecycle, which is a table. A table also carries the state, so the picker can
-- filter to the state already chosen on the address — an enum cannot.
--
-- Say the word if you want the enum anyway and I will swap it.
create table council_regions (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  state     au_state not null,
  active    boolean not null default true,
  unique (name, state)
);
create index on council_regions (state);
```

**Seed data, taken from the prototype:**

- **teams** — Acquisition & Development, Sales Admin, Design, Pre-Construction Admin,
  Scheduling, Selections, Estimating, Construction, Construction Admin, Finance,
  Maintenance *(set `parent_team_id` where a lead owns more than one — that hierarchy is
  what the `team_hierarchy` scope walks)*
- **stages** (ordered — this order is the board's column order)
  1. Sales & acquisition
  2. Planning & Engineering
  3. Working Drawings & Contracts
  4. Preconstruction
  5. Scheduling & Estimating
  6. Construction & execution
  7. Post-construction & closeout
  8. Handover & maintenance
- **build_stages** (ordered, with the prototype's typical durations in days)
  Site preparation 10 · Slab stage 10 · Frame stage 28 · Lock-up stage 35 ·
  Fixing and fit-out 90 · Practical completion 7 · Handed over 30
- **tags** — IF, Council hold, Design variation, Insurance claim, Supply shortage
- **council_regions** — seed the 68 South Australian councils first, `state = 'SA'`.
  The list is published by the Local Government Association of SA; it wants importing
  rather than typing. Other states can be added as Lofty crosses borders — nothing in
  the schema assumes SA beyond the column default.
- **au_state / country_code** *(enums, no seed — the type is the data)* —
  `SA` (default) `NSW` `VIC` `QLD` `WA` `NT` `TAS` `ACT`, and `AU`
- **permission_level** *(enum, no seed needed — the type is the data)* — in order:
  `viewer` read-only · `user` works their own jobs · `manager` reads across teams and
  reports · `admin` edits projects, jobs and property definitions · `superadmin` also
  manages teams and can delete

  The prototype predates this decision and still shows its own six roles. They map on
  like this:

  | Prototype role | `permission_level` |
  | --- | --- |
  | Read-only Auditor | `viewer` |
  | Team Member | `user` |
  | Department Lead | `manager` |
  | Division Manager | `manager` |
  | System Admin | `superadmin` |
  | Finance | **does not map** |

  **Finance is the one that does not fit, and it is worth knowing why.** A ladder says
  *how much* you can do; Finance says *what* you own — commercial fields — while sitting
  at an ordinary level everywhere else. You cannot express that as a rung without giving
  Finance either too much (`admin` over everything) or too little (`user`, locked out of
  the fields that are their job).

  Two ways out, and this needs deciding before the policies are written:

  1. **A separate capability flag** — `permission_level` for how far you reach, plus
     something like `owns_commercial boolean` for what you own. Keeps the ladder clean.
  2. **Property-level grants** — since properties are already rows, a
     `property_grants(property_def_id, permission, can_edit)` table lets any team own
     any field. More machinery, but it generalises past Finance the moment a second
     team wants the same thing.

  My read: **(2)**, because Selections and Estimating will want it next, and (1) then
  becomes a column per team.

### The audit quartet — on every table

`created_at` · `created_by` · `updated_at` · `updated_by`. No exceptions: the one table
without them is the one someone asks about when a value turns out to be wrong.

The `_by` columns are **nullable**, because a row can legitimately have no author — a
seeded lookup, an import, the very first profile. Nullable and honest beats not-null
filled with a placeholder nobody can trace.

`updated_at` is maintained by a `touch_updated_at()` trigger on every table, not by the
application. A default of `now()` only fires on insert; without the trigger the column
reads the same as `created_at` for the rest of the row's life and quietly lies — which
is worse than not having it, because people trust it.

```sql
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
-- … then one `before update` trigger per table.
```

### Core records

```sql
-- `profiles`, not `users` — `auth.users` is Supabase's table, populated by Microsoft
-- Entra. This is the row Lofty owns beside it: the same person, but the parts the app
-- decides rather than the IdP. One row per login, keyed to it, gone when it is.
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,

  -- Two fields, not one. People change names — marriage, deed poll, a misspelling on
  -- day one — and a single `full_name` makes that a string edit that has to be got
  -- exactly right. It is also the only way to greet someone by first name, which is
  -- most of where a name appears.
  first_name    text not null,
  last_name     text not null,
  -- Generated, so it cannot drift from its parts. Update either half and every card,
  -- comment byline and report line follows on the next read.
  full_name     text generated always as (first_name || ' ' || last_name) stored,
  -- Only when someone goes by something other than their first name. Null means
  -- "use first_name" — never store a copy of it here.
  preferred_name text,

  email         text unique not null,
  -- Least privilege by default. Someone arriving from Entra can read and nothing else
  -- until an admin promotes them — the alternative is a new joiner with edit rights
  -- on every project on their first morning.
  permission    permission_level not null default 'viewer',
  job_title     text,
  phone         text,
  active        boolean not null default true,
  source        text,                      -- 'Entra ID' once SCIM is live
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- People sit in more than one team, so team membership is its own table rather than a
-- column. One row per person per team.
--
-- `is_primary` exists because several screens need a single answer: which team the
-- dashboard's "Heading to your team" panel watches, and what the board filters to by
-- default. Without it those screens have to guess. The partial unique index is what
-- stops someone having two primaries; nothing forces them to have one, because a new
-- joiner legitimately has none yet.
create table profile_teams (
  profile_id uuid references profiles(id) on delete cascade,
  team_id    uuid references teams(id)    on delete cascade,
  is_primary boolean not null default false,
  joined_at  timestamptz not null default now(),
  primary key (profile_id, team_id)
);
create unique index profile_one_primary_team
  on profile_teams (profile_id) where is_primary;
create index on profile_teams (team_id);

-- What the app greets you with. One place, so "Hi, …" is never assembled ad hoc.
create view profile_display as
  select id, coalesce(preferred_name, first_name) as greeting_name, full_name
  from profiles;

-- An address is a record, not a string on another record. Addresses get corrected and
-- they get changed — a lot renumbered by council, a street renamed, a typo found at
-- handover — and every project and job pointing at it should follow without anyone
-- editing them one at a time. So: one row here, referenced by id.
create table addresses (
  id             uuid primary key default gen_random_uuid(),

  -- Text, not a number. Lot numbers are "12A", "5-7", "Lot 3" as often as they are 12,
  -- and the moment one of those arrives an integer column has to be migrated.
  lot_number     text,
  street_number  text,                -- same reason: "12A", "12-14"
  street_1       text not null,       -- street name and type: "Ironbark Road"
  street_2       text,                -- unit, level, building — anything above the street
  suburb         text not null,
  state          au_state not null default 'SA',
  country        country_code not null default 'AU',
  council_id     uuid references council_regions(id),

  -- Assembled once, in the database, so every card, export and search hit reads the
  -- same string. On the row rather than in a view because nothing outside this row is
  -- needed to build it.
  --
  -- Maintained by trigger, not `generated always as`. A generation expression must be
  -- IMMUTABLE, and `state::text` / `country::text` are not: enum output goes through
  -- `enum_out`, which is declared STABLE because `alter type … rename value` can change
  -- a label under an already-stored value. Postgres rejects the table outright with
  -- "generation expression is not immutable". The trigger overwrites the column on
  -- every insert and update, so it still cannot be written by hand or drift from its
  -- parts — the same guarantee, in legal SQL.
  --
  -- Built with `||` and `coalesce` rather than `concat_ws`, so a null part drops its
  -- separator with it.
  consolidated_address text not null default '',

  created_at     timestamptz not null default now(),
  created_by     uuid references profiles(id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references profiles(id)
);
create index on addresses (suburb);
create index on addresses (council_id);

create or replace function build_consolidated_address() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.consolidated_address :=
    coalesce(new.street_2 || ', ', '') ||
    coalesce(new.street_number || ' ', '') ||
    new.street_1 || ', ' ||
    new.suburb || ' ' || new.state::text || ', ' || new.country::text;
  return new;
end $$;

create trigger addresses_build_consolidated
  before insert or update on addresses
  for each row execute function build_consolidated_address();

create table projects (
  id                 uuid primary key default gen_random_uuid(),

  -- Sequential from 1000, four digits minimum, and overridable by hand. The sequence
  -- supplies the default; the check enforces the floor; the trigger below is what
  -- stops a manual override from colliding with the sequence later.
  project_no         integer unique not null default nextval('project_no_seq'),

  -- Two addresses, not one. `original` is where the project started and never moves —
  -- it is what historical paperwork, contracts and old emails refer to. `current` is
  -- what every card, board and search shows. They are the same until something changes.
  original_address_id uuid references addresses(id),
  current_address_id  uuid not null references addresses(id),

  project_type       project_type,
  status             record_status not null default 'on_track',

  start_date         date,
  target_completion  date,
  end_date           date,            -- actual, as opposed to target

  created_at         timestamptz not null default now(),
  created_by         uuid references profiles(id),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references profiles(id)
);

create sequence if not exists project_no_seq start with 1000;
alter table projects add constraint project_no_min_four_digits check (project_no >= 1000);
create index on projects (current_address_id);

-- A blank current address falls back to the original, so a caller only has to supply
-- one. Without this, "current is not null" means every insert has to set both.
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
-- on the unique index — days or months after the override, which is the worst time to
-- find out. Push the sequence past it instead.
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

-- What the cards read. The consolidated address cannot be a generated column on
-- projects — a generated column cannot reach another table — so it is a view, the same
-- shape as profile_display.
--
-- Note: `supabase-template.html` still shows the pre-simplification project — name,
-- division, client, manager, notes — the same way it still shows the old six roles. It
-- is being kept as the *layout* reference, not the field reference; the React app under
-- /app/ is the accurate one. Say the word if you want the template swept forward too.
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
    join addresses cur  on cur.id  = p.current_address_id
    left join addresses orig on orig.id = p.original_address_id;

create table jobs (
  id                uuid primary key default gen_random_uuid(),
  -- The friendly project number, denormalised from the parent so job_number can be a
  -- generated column. Kept true by a trigger, never written by the app.
  project_no        integer not null,

  -- The counter within the project — 01, 02, 03. Assigned by trigger when null, under a
  -- lock on the parent project row: two concurrent inserts would otherwise read the
  -- same max and collide on the unique index. This is NOT "the job number" — Lofty
  -- means the combined value below by that phrase.
  -- Never '00'. The first job on a project is 01 — there is no zeroth job. The check
  -- is here rather than only in the trigger, because a hand-written insert can supply
  -- its own sequence and bypass the trigger's allocation.
  job_sequence      text not null
                      check (job_sequence ~ '^[0-9]+$' and job_sequence::integer >= 1),

  -- The job number, in Lofty's sense: '1001-01'. Generated, so it cannot drift.
  job_number        text unique
    generated always as (project_no::text || '-' || job_sequence) stored,
  project_id        uuid references projects(id) on delete cascade not null,

  -- Same pair as projects, for the same reason: a job's address is corrected and
  -- renumbered more often than a project's, and it is the field people search on.
  -- `original` is what the contract says; `current` is what the board shows.
  original_address_id uuid references addresses(id),
  current_address_id  uuid not null references addresses(id),

  stage_id          smallint references stages(id) not null,
  build_stage_id    smallint references build_stages(id),
  -- No type column. A job's type is its project's type — a commercial project does not
  -- contain residential jobs, so a second column would only ever be a chance to
  -- disagree with the first. Read it through job_display.
  owning_team_id    uuid references teams(id) not null,
  assignee_id       uuid references profiles(id),
  -- The same status as projects, from the same enum. Not health: health is calculated
  -- from inputs still to be decided and is deliberately absent until they are.
  status            record_status not null default 'on_track',
  source_system     text,
  contract_status   text,
  deposit_status    text,
  drawings_status   text,
  requested_note    text,
  notes             text,
  stage_entered_at  timestamptz not null default now(),   -- "days in stage" comes from this
  created_at        timestamptz not null default now()
);

create table job_tags (
  job_id uuid references jobs(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (job_id, tag_id)
);

create table job_dependencies (
  job_id            uuid references jobs(id) on delete cascade,
  depends_on_job_id uuid references jobs(id) on delete cascade,
  primary key (job_id, depends_on_job_id),
  check (job_id <> depends_on_job_id)
);
```

-- A job's type, address and parent number in one place. The type is the project's —
-- inherited, not copied — so there is nowhere for the two to disagree.
create view job_display as
  select j.id,
         j.job_number,
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

-- =============================================================================
-- Searching by address
-- =============================================================================
-- The rule: **the current address is what shows, both addresses are what match.**
--
-- A job renumbered by council is still the job someone has in an email from last year,
-- and searching that old address has to find it. So the display side reads
-- `current_address` from job_display / project_display and nothing else, while search
-- looks at both.
--
-- These views give one row per (record, address role), so a match on either finds the
-- record and says which address it matched — worth showing, because a hit on an
-- original address is a hint that the person searching has stale information.
create view job_address_search as
  select j.id                  as job_id,
         j.project_id,
         j.job_number,
         a.id                  as address_id,
         a.consolidated_address,
         a.suburb,
         a.council_id,
         case when a.id = j.current_address_id then 'current' else 'original' end as role
  from jobs j
    join addresses a
      on a.id = j.current_address_id
      or a.id = j.original_address_id;

create view project_address_search as
  select p.id                  as project_id,
         p.project_no,
         a.id                  as address_id,
         a.consolidated_address,
         a.suburb,
         a.council_id,
         case when a.id = p.current_address_id then 'current' else 'original' end as role
  from projects p
    join addresses a
      on a.id = p.current_address_id
      or a.id = p.original_address_id;

-- People search "Ironbark" or "22 Ironbark", not the whole string, so this needs
-- trigram matching rather than a b-tree — a plain index does nothing for a leading
-- wildcard. pg_trgm also survives typos, which a full-text index does not.
create extension if not exists pg_trgm;
create index addresses_consolidated_trgm
  on addresses using gin (consolidated_address gin_trgm_ops);
create index addresses_suburb_trgm
  on addresses using gin (suburb gin_trgm_ops);

-- The original address needs its own index or half the search is a sequential scan.
-- Easy to miss, because the current one gets added while writing the display path.
create index on projects (original_address_id);
create index on jobs (original_address_id);

### One activity feed

PR #8 merged comments and activity into a single feed in the UI. Match that in the schema
rather than keeping two tables the app has to interleave on every read.

```sql
create table activity (
  id            uuid primary key default gen_random_uuid(),
  subject_type  text not null check (subject_type in ('job','project')),
  subject_id    uuid not null,
  kind          text not null check (kind in ('event','comment')),
  description   text not null,             -- {{activity.description}} / {{comments.body}}
  author_id     uuid references profiles(id), -- null for system events
  department    text,
  occurred_at   timestamptz not null default now(),
  mentions      uuid[] default '{}'        -- @mentions, for the notification fan-out
);
create index on activity (subject_type, subject_id, occurred_at desc);
```

### Templates and checkpoints

```sql
create table templates             (id uuid primary key default gen_random_uuid(),
                                    project_type project_type unique not null);
create table template_phases       (id uuid primary key default gen_random_uuid(),
                                    template_id uuid references templates(id) on delete cascade,
                                    stage_id smallint references stages(id),
                                    owning_team_id uuid references teams(id),
                                    expected_days smallint, position smallint);
create table template_checkpoints  (id uuid primary key default gen_random_uuid(),
                                    template_phase_id uuid references template_phases(id) on delete cascade,
                                    label text not null, position smallint);

-- instantiated per job when it is created
create table job_checkpoints (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid references jobs(id) on delete cascade,
  label       text not null,
  stage_id    smallint references stages(id),
  done        boolean not null default false,
  done_at     date,
  position    smallint
);
```

### Properties (a.k.a. fields)

Property and field are the same thing. Every one lives at **project** or **job** level, and
carries two pieces of context: **which stage** captures it and **which team** captures it.

They are rows, not columns. That is the whole point — a team adds what it captures without a
migration, and "what does Design fill in at Planning & Engineering" is a `where` clause rather
than a schema question. It is also why the binding template has no `{{field_1}}`, `{{field_2}}`
placeholders: the count is data. Add a row, the UI renders one more slot.

```sql
create table property_defs (
  id             uuid primary key default gen_random_uuid(),
  key            text unique not null,           -- 'pour_date' — stable, referenced by automations
  label          text not null,                  -- 'Pour date' — what people see, renameable
  scope          text not null check (scope in ('project','job')),
  stage_id       smallint references stages(id) not null,   -- where it gets captured
  owning_team_id uuid references teams(id) not null,        -- who captures it
  format         text not null check (format in
                   ('text','number','currency','date','checkbox','file',
                    'single select','multi select','person','link')),
  required       boolean not null default false, -- required to LEAVE stage_id, not to create
  automation     text,                           -- what setting it triggers
  position       smallint,
  archived_at    timestamptz                     -- retire a field without losing its history
);

-- One row per (property, record). Sparse by design: an unset field has no row.
create table property_values (
  property_def_id uuid references property_defs(id) on delete cascade not null,
  subject_type    text not null check (subject_type in ('project','job')),
  subject_id      uuid not null,
  value           jsonb,                         -- shape is enforced against property_defs.format
  set_by          uuid references profiles(id),
  set_at          timestamptz not null default now(),
  primary key (property_def_id, subject_type, subject_id)
);
create index on property_values (subject_type, subject_id);
```

`subject_type` + `subject_id` rather than two nullable FKs keeps one table for both levels; the
check constraint on `property_defs.scope` is what stops a project field being set on a job.

**Still to settle** — these are the questions the field lists will answer:

- **Related properties.** A field whose value is another record (`person`, `link` above are the
  start of this). If those relationships get rich, some of them stop being properties and become
  their own tables — that is the call to make per field, not up front.
- **Select options.** `single select` / `multi select` need an options table
  (`property_options(property_def_id, value, label, colour, position)`), unless the options come
  from an existing lookup — in which case the def points at the lookup instead.
- **Required semantics.** `required` currently means "cannot leave this stage without it". Some
  fields will instead mean "cannot create the record without it". Those are different columns.
- **History.** `property_values` holds current values only. If any field needs an audit trail,
  it wants a `property_value_history` table rather than a version column.

### Permissions and preferences

```sql
create table permission_grants (
  permission permission_level,
  object  text not null check (object in ('project','job','checklist','comment','report')),
  action  text not null check (action in ('read','update','transition','export')),
  scope   text not null check (scope in ('none','own','team','team_hierarchy','all')),
  primary key (permission, object, action)
);

create table notification_prefs (
  user_id    uuid references profiles(id) on delete cascade,
  event_type text not null,   -- overdue | stalled | mention | blocked | requested | conflict | incoming
  channel    text not null check (channel in ('inApp','email','teams')),
  enabled    boolean not null default false,
  primary key (user_id, event_type, channel)
);

create table user_preferences (
  user_id             uuid primary key references profiles(id) on delete cascade,
  landing_page        text default 'dashboard',
  default_job_view    text default 'board',      -- board | table | gantt | calendar
  default_project_view text default 'board',
  density             text default 'comfortable',
  theme               text default 'light',      -- light | dark | black
  email_digest        text default 'daily',
  quiet_weekends      boolean default true
);
```

**Seed `permission_grants`.** Rewritten against the five-rung ladder — the prototype's
matrix was keyed off six roles that no longer exist, and one of its scopes (`division`)
referenced a table that turned out not to be a real concept.

| Permission | read | update | transition | export |
| --- | --- | --- | --- | --- |
| `viewer` | team_hierarchy | none | none | none |
| `user` | team_hierarchy | own | own | none |
| `manager` | all | team | team | all |
| `admin` | all | all | all | all |
| `superadmin` | all | all | all | all |

`superadmin` reads the same as `admin` here; what separates them is not in this table —
it is managing teams and deleting records, which the app gates directly on the rung.

**This matrix wants confirming rather than inheriting.** It is my reading of the five
definitions, not a decision anyone has made: whether a `viewer` should see their own
team's tree or the whole portfolio, and whether a `manager` should be able to move a job
between stages, are both judgement calls about how Lofty works.

---

## Derived, don't store

These are computed in the prototype and should stay computed. Store them and they go stale
the moment anything moves.

| Value | Derive from |
| --- | --- |
| Days in stage | `now() - jobs.stage_entered_at` |
| Job health beyond the stored status | days in stage vs the template's `expected_days` |
| "Multiple teams editing this job" (conflict) | concurrent open edits — a real lock or presence check, not a column |
| Project progress % | share of the project's jobs past a given stage |
| Project status | worst health across its jobs |
| Notification rows | triggers on `activity`, `jobs.stage_id` changes and SLA breaches |
| Job number `1201-01` | a per-project sequence, generated in the database |

A view per derivation keeps the React side simple:

```sql
create view jobs_enriched as
  select j.*,
         extract(day from now() - j.stage_entered_at)::int as days_in_stage,
         p.project_no, p.name as project_name
  from jobs j join projects p on p.id = j.project_id;
```

---

## Row Level Security

The scope model maps onto policies almost one-to-one. `team_hierarchy` is the one that
needs care — a recursive CTE inside a policy runs per row unless you wrap it:

```sql
-- Seeded from every team the signed-in person belongs to, not one — `profile_teams`
-- is the membership, and someone in two teams sees both trees.
create or replace function visible_team_ids()
returns setof uuid language sql stable security definer as $$
  with recursive tree as (
    select pt.team_id as id from profile_teams pt where pt.profile_id = auth.uid()
    union all
    select c.id from teams c join tree on c.parent_team_id = tree.id
  ) select distinct id from tree;
$$;

-- The person's own teams, without walking the hierarchy. Separate because `team` and
-- `team_hierarchy` are different scopes and conflating them widens `team` silently.
create or replace function my_team_ids()
returns setof uuid language sql stable security definer as $$
  select team_id from profile_teams where profile_id = auth.uid();
$$;
```

Then, per scope:

| Scope | Predicate |
| --- | --- |
| `none` | `false` |
| `own` | `assignee_id = auth.uid()` |
| `team` | `owning_team_id in (select my_team_ids())` |
| `team_hierarchy` | `owning_team_id in (select visible_team_ids())` |
| `all` | `true` |

Every one of these went from `=` to `in` when membership stopped being a column. That
is the whole cost of multi-team, and it is worth paying up front — retro-fitting it
means revisiting every policy at a point where real data is already behind them.

**There is no `division` scope.** Divisions were a prototype invention, not a Lofty
concept — the prototype derived them from the project type and relabelled one of them,
calling development work "Land". That label was wrong as well as redundant: the correct
term is **development**, and it is what `project_type` has always used. So divisions were
a second, less accurate word for something that already existed. The table, the column
and the scope are all gone; "everything of this type" is `project_type`, and "everything
in these teams" is `team_hierarchy`.

The app's `can()` checks — `editJob`, `pushToJobs`, `canDelete`, `manageTeams` — hide
controls. They are not security. Every one needs a matching policy or it is decoration.

---

## Binding the template

1. Build the schema, seed the lookups.
2. Generate types: `supabase gen types typescript --project-id <id> > src/types/db.ts`.
3. Replace the template's `jobs` and `projects` arrays with queries.
4. Search the file for `{{` — every remaining hit is an unbound field. The template tints
   them, so anything you miss is visible on screen rather than shipping as literal braces.

The token wrapper and the `.sb-token` styling are the last things to delete, once the
search comes back empty.
