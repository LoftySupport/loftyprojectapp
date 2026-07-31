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
| Stage, status, type, team, build stage, division, tag names | **Closed lookup sets.** These aren't dummy content — they're the business process, and they belong in Supabase as seeded lookup tables. They're listed below as the seed data. |
| Job numbers (`1201-01`), project numbers (`1201`) | **Join keys.** They wire the board, drill-downs, dependencies and the drawer together. Tokenising them would break navigation and hide nothing useful. |
| Dates, day counts, progress percentages | **Drive layout and arithmetic.** The Gantt, the calendar and the "days in stage" colouring all compute from them. Most are derived and shouldn't be stored at all — see *Derived, don't store* below. |
| Everything a human reads as content | **Tokenised.** Addresses, names, notes, comments, activity text, statuses of contract/deposit/drawings, source system. |

If you'd rather see tokens on the lookup fields too, say so — it's a one-line change to
the generator. The current split keeps the eight-column board and the colour system intact
so you can still check the formatting you're preserving.

---

## Tokens in the template → columns

| Token | Column | Type | Notes |
| --- | --- | --- | --- |
| `{{jobs.address}}` | `jobs.address` | `text not null` | Site address |
| `{{jobs.source_system}}` | `jobs.source_system` | `text` | Where the record originated — HubSpot, SharePoint, SiteBook, Trello |
| `{{jobs.contract_status}}` | `jobs.contract_status` | `text` | Free text today; a lookup if the states settle |
| `{{jobs.deposit_status}}` | `jobs.deposit_status` | `text` | " |
| `{{jobs.drawings_status}}` | `jobs.drawings_status` | `text` | " |
| `{{jobs.notes}}` | `jobs.notes` | `text` | |
| `{{jobs.requested_note}}` | `jobs.requested_note` | `text` | Nullable. Non-null is what makes a card show the amber "waiting" flag |
| `{{users.full_name}}` | `users.full_name` | `text not null` | Used for assignee, project manager and comment authors |
| `{{projects.name}}` | `projects.name` | `text not null` | |
| `{{projects.suburb}}` | `projects.suburb` | `text` | |
| `{{projects.client}}` | `projects.client` | `text` | |
| `{{projects.council_area}}` | `projects.council_area` | `text` | |
| `{{projects.notes}}` | `projects.notes` | `text` | |
| `{{activity.description}}` | `activity.description` | `text not null` | One feed for jobs and projects |
| `{{comments.author_name}}` | join to `users.full_name` | — | Store `author_id uuid`, not a name |
| `{{comments.body}}` | `comments.body` | `text not null` | |

---

## Tables

### Lookups — seed these first

```sql
create table divisions        (id uuid primary key default gen_random_uuid(), name text unique not null);
create table teams            (id uuid primary key default gen_random_uuid(),
                               name text unique not null,
                               parent_team_id uuid references teams(id),   -- team_hierarchy scope needs this
                               division_id uuid references divisions(id));
create table stages           (id smallint primary key, name text unique not null, position smallint not null);
create table build_stages     (id smallint primary key, name text unique not null, position smallint not null,
                               typical_days smallint);
create table job_types        (id smallint primary key, name text unique not null);
create table health_statuses  (id text primary key, label text not null);   -- 'on-track' | 'at-risk' | 'stale'
create table tags             (id uuid primary key default gen_random_uuid(), name text unique not null);
create table roles            (id text primary key, name text not null, description text);
```

**Seed data, taken from the prototype:**

- **divisions** — Residential, Commercial, Land
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
- **job_types** — Residential, Commercial, Development
- **health_statuses** — `on-track` "On track" · `at-risk` "At risk" · `stale` "Stalled"
- **tags** — IF, Council hold, Design variation, Insurance claim, Supply shortage
- **roles** — system_admin "System Admin" · division_manager "Division Manager" ·
  department_lead "Department Lead" · team_member "Team Member" · finance "Finance" ·
  read_only "Read-only Auditor"

### Core records

```sql
create table users (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text unique not null,
  team_id       uuid references teams(id),
  role_id       text references roles(id) not null default 'team_member',
  job_title     text,
  phone         text,
  active        boolean not null default true,
  source        text,                      -- 'Entra ID' once SCIM is live
  created_at    timestamptz not null default now()
);

create table projects (
  id                 uuid primary key default gen_random_uuid(),
  project_no         text unique not null,          -- '1201'
  name               text not null,
  suburb             text,
  council_area       text,
  client             text,
  type_id            smallint references job_types(id),
  division_id        uuid references divisions(id),
  manager_id         uuid references users(id),
  start_date         date,
  target_completion  date,
  notes              text,
  created_at         timestamptz not null default now()
);

create table jobs (
  id                uuid primary key default gen_random_uuid(),
  job_no            text unique not null,           -- '1201-01', derived from project_no
  project_id        uuid references projects(id) on delete cascade not null,
  address           text not null,
  stage_id          smallint references stages(id) not null,
  build_stage_id    smallint references build_stages(id),
  type_id           smallint references job_types(id),
  owning_team_id    uuid references teams(id) not null,
  assignee_id       uuid references users(id),
  status            text references health_statuses(id) not null default 'on-track',
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
  author_id     uuid references users(id), -- null for system events
  department    text,
  occurred_at   timestamptz not null default now(),
  mentions      uuid[] default '{}'        -- @mentions, for the notification fan-out
);
create index on activity (subject_type, subject_id, occurred_at desc);
```

### Templates and checkpoints

```sql
create table templates             (id uuid primary key default gen_random_uuid(),
                                    type_id smallint references job_types(id) unique not null);
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
  set_by          uuid references users(id),
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
  role_id text references roles(id),
  object  text not null check (object in ('project','job','checklist','comment','report')),
  action  text not null check (action in ('read','update','transition','export')),
  scope   text not null check (scope in ('none','own','team','team_hierarchy','division','all')),
  primary key (role_id, object, action)
);

create table notification_prefs (
  user_id    uuid references users(id) on delete cascade,
  event_type text not null,   -- overdue | stalled | mention | blocked | requested | conflict | incoming
  channel    text not null check (channel in ('inApp','email','teams')),
  enabled    boolean not null default false,
  primary key (user_id, event_type, channel)
);

create table user_preferences (
  user_id             uuid primary key references users(id) on delete cascade,
  landing_page        text default 'dashboard',
  default_job_view    text default 'board',      -- board | table | gantt | calendar
  default_project_view text default 'board',
  density             text default 'comfortable',
  theme               text default 'light',      -- light | dark | black
  email_digest        text default 'daily',
  quiet_weekends      boolean default true
);
```

**Seed `permission_grants` from the prototype's matrix:**

| Role | read | update | transition | export |
| --- | --- | --- | --- | --- |
| system_admin | all | all | all | all |
| division_manager | division | division | division | division |
| department_lead | team_hierarchy | team_hierarchy | team_hierarchy | none |
| team_member | team | own | own | none |
| finance | all | none | none | all |
| read_only | all | none | none | all |

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
create or replace function visible_team_ids()
returns setof uuid language sql stable security definer as $$
  with recursive tree as (
    select t.id from teams t
      join users u on u.team_id = t.id and u.id = auth.uid()
    union all
    select c.id from teams c join tree on c.parent_team_id = tree.id
  ) select id from tree;
$$;
```

Then, per scope:

| Scope | Predicate |
| --- | --- |
| `none` | `false` |
| `own` | `assignee_id = auth.uid()` |
| `team` | `owning_team_id = (select team_id from users where id = auth.uid())` |
| `team_hierarchy` | `owning_team_id in (select visible_team_ids())` |
| `division` | `project_id in (select id from projects where division_id = (select t.division_id from users u join teams t on t.id = u.team_id where u.id = auth.uid()))` |
| `all` | `true` |

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
