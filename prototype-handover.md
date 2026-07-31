# Lofty Job Oversight Board — Prototype Handover

Companion to `concept-spec.md`. Written for the person building the real platform on
Supabase, so the prototype's decisions carry forward rather than being re-derived.

Three parts:

1. **How the prototype is built** — every field, every derived structure, and what depends on what.
2. **Permissions** — what needs controlling, at which level, for which roles.
3. **Integrations and automations** — Entra, SharePoint/Teams, an MCP connector, notifications, email, and the automation catalogue.

A closing section lists what the prototype deliberately does *not* model.

---

## Part 1 — How the prototype is built

### Architecture

One file. `index.html` is ~4,700 lines: a `<style>` block, the markup skeleton, and a
`<script>` block holding both the data and every render function. No build step, no
framework, no dependencies except two Google Fonts requests. It runs by opening the file.

Nothing persists. Every edit — dragging a card, ticking a checklist item, posting a comment —
mutates the in-memory `jobs` array and re-renders. A refresh restores the seed data. This is
deliberate for a demo but it is the single biggest difference from the real build: there is no
write path, no concurrency, no audit, no auth.

Rendering is string-templating into `innerHTML`, driven by one router (`renderPage()`) that
hides every view container and reveals the ones the current page needs. Every mutation calls
`renderPage()` (or `refreshDrawerInPlace()` for panel edits, which preserves scroll position)
and the whole visible surface is rebuilt. That is fine at 50 jobs and will not survive real
volumes — the real build wants proper reactive rendering with keyed updates.

### The job record

50 seed jobs. Every job carries these fields:

| Field | Type | Purpose | Where it surfaces |
|---|---|---|---|
| `id` | uuid | Machine key. Never shown on a card. | Nowhere in the UI except the project detail's system-key row |
| `projectId` / `projectNo` | uuid / string | Parent project. Non-null — every job has exactly one. | Card, table, panel head, project grouping |
| `no` | string | Job number `1201-03`, composed from the project's. The business key. | Every card, table row, panel head, report |
| `address` | string | Site address — the label people actually recognise | Card title, table, dashboard, reports |
| `stage` | enum (8) | Which phase the job sits in. Drives board columns. | Board grouping, Gantt bands, template, dashboards |
| `owner` | enum (11) | Owning **department** — the "one team at a time" holder | Card foot, Departments tab, team load |
| `assignee` | enum (16) | The named person on it | Card foot, dashboard "your jobs", My tasks filter |
| `type` | enum (3) | Residential / Commercial / Development | Card, type filter, template switcher |
| `buildStage` | enum (6), nullable | Finer construction stage where one applies | Card "Stage" line, panel, table |
| `tags` | string[] | Free labels: `IF`, `Council hold`, `Design variation`, `Supply shortage`, `Insurance claim` | Card chips, panel, table, search |
| `days` | number | Days in the current stage | Card, overdue maths, dashboards |
| `status` | enum (3) | Health: `on-track` / `at-risk` / `stale` | Status pill everywhere, health grouping |
| `source` | enum (4) | Which legacy system the record came from — HubSpot, SharePoint, Trello, SiteBook | Card foot, table, report |
| `conflict` | boolean | Ownership conflict flagged (3 jobs) | Card tint + warning, dashboard count |
| `requested` | string, nullable | What the job is waiting on (10 jobs) | Amber card block, panel, dashboard |
| `contract` | string | Contract status — free text, 5 distinct values | Panel job details, Departments tab, report |
| `deposit` | string | Deposit status — 3 distinct values | Panel, Departments tab, report |
| `drawings` | string | Drawings status — 8 distinct values | Panel, Departments tab, report |
| `notes` | string | Free-text note | Panel, report |
| `activity` | `{date, text}[]` | Chronological log, 1–3 entries per job | Activity tab, Departments tab, report |
| `comments` | `{author, date, text}[]` | Threaded discussion | Comments section, dashboard mentions |
| `dependsOn` | string[] | Job numbers this job waits on (6 jobs) | Blocked flags, Gantt links, panel |

**Fields that should become enums/lookups rather than free text in the real schema:**
`contract`, `deposit` and `drawings` are strings holding what are really status enums, and
`tags` is an untyped array. `days` is a stored integer rather than being derived from a stage
entry timestamp — in the real build it should be computed from `job_stage_history`, not stored.

### Projects — the parent record

**Hierarchy is Projects → Jobs.** One project, many jobs; a job belongs to exactly one project.
Stages sit *beneath* the job — a job moves through stages — not between project and job.

```
1201              Andrews Farm land release          4 jobs
  ├── 1201-01     22 Ironbark Road, Andrews Farm
  ├── 1201-02     21 Melaleuca Court, Andrews Farm
  └── …
```

#### Two identifiers on every record

| | Machine key | Friendly key |
|---|---|---|
| Project | `id` uuid | `no` — `1201` |
| Job | `id` uuid | `no` — `1201-03`, composed from the parent's |

The UUID is the primary key and every foreign key: globally unique, generable client-side, safe
to merge across environments, non-enumerable. **It is never shown on a card and never typed by a
person** — the prototype surfaces it only on the project detail page, labelled as a system key,
to make the distinction visible.

The friendly key is what people quote on a PO, an invoice or a site board. A job's is composed
from its project's plus a zero-padded sequence, so the parent reads straight off the child
without a lookup.

Both friendly keys are **immutable once assigned**. In Supabase:

```sql
projects: id uuid PK default gen_random_uuid()
          project_no text UNIQUE NOT NULL
jobs:     id uuid PK default gen_random_uuid()
          project_id uuid NOT NULL REFERENCES projects(id)
          job_seq int NOT NULL
          job_no text UNIQUE NOT NULL      -- '1201-03', allocated from a per-project sequence
          UNIQUE (project_id, job_seq)

REVOKE UPDATE (project_no) ON projects FROM authenticated;
REVOKE UPDATE (job_no, project_id) ON jobs FROM authenticated;
-- plus BEFORE UPDATE triggers, because a column revoke is bypassed by the service role
```

Use **UUIDv7** rather than v4 for the PKs — time-ordered, so B-tree locality holds up on the
high-volume tables (activity, documents, property values).

#### Project-level properties

Deliberately a different set from job-level ones. A project describes the *land and the
commercial arrangement*; a job describes *one dwelling's journey*.

| Property | Notes |
|---|---|
| `name` | Suburb + release, or the address for a single-dwelling project |
| `division` | Residential / Commercial / Land |
| `type` | Residential / Commercial / Development, or Mixed where jobs differ |
| `manager` | Project manager |
| `client` | Who it is being built for |
| `suburb`, `councilArea` | Locality and consent authority |
| `startDate`, `targetCompletion` | Project window |
| `notes`, `comments`, `activity` | Project-level discussion and log |

Two things are **derived, never stored**: project health is the worst health of any job on it (a
release with one stalled lot is not "on track"), and progress is the average stage index across
its jobs. Storing either guarantees they go stale.

#### Three project views

Cards, List and Gantt over the same filtered set, switched from the toolbar. The Gantt is a
month timeline driven by the project's explicit `startDate` and `targetCompletion` — unlike the
job Gantt, which derives its durations. The bar is the planned window; the fill inside it is how
far through their stages the project's jobs actually are, so **a short fill on a bar that is
mostly behind the today line is the thing worth looking at**. Bar colour follows project health.

#### Projects and jobs are separate pages

Project cards and job cards are never mixed. They are different records with different
properties, and interleaving them makes both harder to scan. What they share is the **filter
model** — the same property filters apply on either page, so "Residential" means the same thing
in both places.

#### Pushing properties down

Properties that exist at both levels can be pushed from the project to its jobs. In the prototype
that is type → `job.type`, manager → `job.assignee`; division is project-only and the UI says so
rather than silently doing nothing.

The push flow deliberately shows a **preview before applying**: per job, the current value, the
new value, and whether that job already matches. Jobs that already agree are marked rather than
counted as changes. You choose all jobs or a subset.

The unresolved question — worth watching a real user before deciding — is whether a push is a
**one-off write** or a **sticky inherit**. The prototype implements one-off: it writes the value
and logs it on each job, and a job can then diverge freely. Sticky inheritance (job follows the
project until explicitly overridden) is a different data model — it needs an "overridden" flag
per property per job — and it is much harder to reason about when someone asks why a value
changed by itself. Start with one-off.

### Structures derived at startup

These are computed once from the seed data rather than hand-listed, so the two cannot drift.
Where the real build has explicit tables, these are the shapes those tables need.

| Structure | Derived from | Real equivalent |
|---|---|---|
| `PHASE_DEPARTMENTS` | `jobs` grouped by `stage` → distinct `owner` | A `stage_owners` table: which department owns which phase |
| `teamMembers` | distinct `assignee` | `users` |
| `allDepartments` | distinct `owner` | `teams` / `divisions` |
| `assigneeDeptMap` | `assignee` → `owner` | `team_memberships` |
| `PHASE_COLORS` | `STAGE_ACCENTS` | Presentation only — keep out of the schema |

Captured **before any edit can run**, because dragging a job changes `stage` and would skew
the mapping. In the real build this is reference data, not a derivation.

### Hand-authored reference data

These have no equivalent in the seed jobs and are the prototype's own invention. Each maps
onto a real table:

| Constant | What it holds | Real table |
|---|---|---|
| `stages` | The 8 phases, in order | `stages` / phase reference |
| `PHASE_EXPECTED_DAYS` | Expected days per phase (10–90) | Phase SLA — drives every "overdue" calculation |
| `DEPARTMENT_FIELDS` | Which job fields each department cares about | Per-team field visibility (see Part 2) |
| `SELECTIONS_STEPS` | 9 selections milestones | `checklist_template_items` |
| `SCHEDULING_FIELDS` | 53 site-prep checklist fields | `checklist_template_items` |
| `JOB_TEMPLATE_CHECKPOINTS` | 4–6 checkpoints per phase | `checklist_templates` |
| `JOB_TEMPLATE_REQUIRED` | 6 fields required to create a job | Validation rules |
| `JOB_TEMPLATE_SKIPS` | Phases a project type skips | Template variants per `job_type` |
| `ACCENTS` / `STAGE_ACCENTS` | Brand colours per phase | Presentation only |

`PHASE_EXPECTED_DAYS` deserves attention: it is a starting assumption I invented, and it is
load-bearing. Every "past expected time in stage" count, the leadership dashboard's bottleneck
ranking, and the dashboard's overdue tile all key off it. Real numbers should be agreed with
each department before this drives anything anyone acts on.

### Attached only to Scheduling & Estimating jobs

Jobs in that phase get two extra structures generated at startup from a progress ratio derived
from `days`:

- `selectionsTracker` — `{step, done, date}[]` over the 9 `SELECTIONS_STEPS`
- `schedulingChecklist` — `{field, value, done}[]` over the 53 `SCHEDULING_FIELDS`

Both are editable in the job panel. Supplier-type fields (matched by `/supplier|contractor/i`)
get a supplier name; everything else gets `✓ Complete` / `Pending`.

**This is where the prototype comes closest to the real thing.** Ticking a selections step
re-computes which column the job's card sits in on the Scheduling drill-down — a genuine
data-driven dependency rather than a static mockup.

### Dependency map

What breaks what, if you change it:

```
stage ──┬─► board columns, Gantt phase bands, template page
        ├─► PHASE_DEPARTMENTS ──► Departments tab, "heading to your team"
        ├─► PHASE_EXPECTED_DAYS ──► overdue counts, bottlenecks, dashboard tiles
        └─► STAGE_ACCENTS ──► column strips, Gantt, dashboard bars, job cards

owner ──┬─► team grouping, team-load bars
        ├─► assigneeDeptMap ──► dashboard team, mentions, activity attribution
        └─► Departments tab state (current / handed on / not started)

assignee ──┬─► "My tasks" filter, dashboard "your jobs"
           └─► activity attribution fallback

days + stage ──► overdue everywhere (days > PHASE_EXPECTED_DAYS[stage])

dependsOn ──► getDependencyInfo() ──► blocked flags, Gantt dependency lines
              (a job is "blocked" only while its parent is still in Sales & acquisition)

status ──► pills, health grouping, leadership counts, dashboard on-track %

activity ──► getActivityAttribution() ──► per-department activity in Departments tab
```

The two most entangled fields are `stage` and `owner`. Changing either changes what appears on
five surfaces. That is the right shape — it reflects that phase and ownership *are* the model —
but it means the real build should treat stage transitions as a first-class operation with its
own audit record, not a column update.

### Pages and surfaces

| Page | Contains | Filters apply? |
|---|---|---|
| **Projects** | Three views of the same set — **Cards**, **List** and **Gantt** — with project-level properties, derived health and progress. Detail page lists the project's jobs and offers push-to-jobs | Shares the job filter model |
| **Dashboard** | Per-person landing: on-track %, workload, your jobs as cards, needs-attention, heading-to-your-team, mentions | No — always "your" jobs |
| **Jobs** | Board (Kanban) / Table / Gantt, with search, group-by, type, date range, My tasks | Yes |
| **Reports** | Portfolio overview, Leadership summary, Job report | Yes |
| **Templates** | Job template per project type, with editable checkpoints (Admin and above) | No |
| **Settings** | Per-user details and preferences: landing page, default views, density, and the per-event per-channel notification matrix. Available to every role — Admin is about other people, Settings is about you | No |
| **Admin** (demo) | Users, Teams, **Properties** and Permissions — role and team assignment, team membership and phase ownership, and the role × object × action × scope grid. Delete controls and grant editing are Super-admin only | No |

Plus overlays: the **job panel**, the **new-job modal**, and **drill-down pages** reached from a
column's expand button.

The full-screen job panel carries four tabs:

| Tab | Purpose |
|---|---|
| **Main info** | Curated view — team, phase, checklists, tags, dependencies |
| **All properties** | Every field on the job in one place, editable, grouped into Identity / Ownership / Commercial / Status & flags / Notes. Job number, project and source are locked |
| **Activity & comments** | One merged history, newest first — see below |
| **Departments** | Where each team stands on the job. Full screen only |

The panel head carries the job number, a **project chip** (the parent's name and friendly ID,
clickable through to the project) and a single **Ask** callout that hands the job to the docked
assistant. Docked, the panel is deliberately narrower in scope than full screen: Main info,
Activity & comments, and All properties folded away underneath. Departments is a full-screen
view — in a 420px column it read as a wall of repeated fields.

**Activity and comments are one feed.** They are the same kind of fact — something that happened
to this job on a date — and splitting them meant reading the same week twice to work out the
story. Merged newest-first, comments marked with a tag and a tint. This is why posting a comment
no longer also writes a "Comment added" activity row, and why a comment pushed from a project
carries its provenance on the comment itself: one event, one row.

**Health and type are not editable on the panel.** Health is derived from movement and overdue
days and type is set once at project level, so both are admin-owned and live only on the All
properties tab. This is the first place the read/write split shows up in the UI rather than
just the role matrix.

**Creating a job** goes through the template: pick a parent project (or create one), pick a
project type, and the modal previews what will be created — the derived job number, the opening
phase, the first owning team, phase count, checkpoint count, and which phases that type skips.
The job is created in the first phase with the template's opening checkpoints logged to its
activity.

**Notifications** are built from seven distinct signals rather than one feed — overdue, stalled,
mentions, blocked dependencies, change requests, ownership conflicts, and work heading to your
team. The header bell shows a count for the signed-in user and the panel filters by type. They
are derived on read in the prototype; in the real build they are rows written by triggers and
automation rules, with read state and channel fan-out.

**Ask AI** is one surface, not two: the floating dock. The job panel used to carry its own chat
pane with its own history, which meant two assistants on screen disagreeing about what "this job"
meant. The panel's Ask button now opens the dock scoped to that job, seeded with its summary, and
the conversation survives closing the panel. It composes answers from the job's actual record — stage, owner, days against the phase
SLA, dependencies, checklist progress, activity and comments. There is no model behind it. It
routes on keywords (late / waiting / who / next / comments) and otherwise gives a general
summary. The point of the mockup is not the answers but proving **the context is there to
assemble** — a real implementation passes the same assembled facts to an LLM.

Board grouping supports phase, team, team member, project type and health status. Drag-and-drop
between columns only works when grouped by phase, because that is the only grouping where the
move has a meaning.

### What is fabricated

Being explicit, because a demo that looks real invites people to trust the numbers:

- All 50 jobs, names, addresses and dates are invented.
- `PHASE_EXPECTED_DAYS` are my assumptions, not Lofty's.
- Checklist and template contents follow the phase structure but are not Lofty's real process.
- Activity attribution is **inferred**, not recorded: seed entries carry no author, so they are
  spread across the departments a job has already passed through. It reads plausibly and it is
  not history.
- `deterministicTime()` hashes a seed string into a stable clock time so activity timestamps
  do not change between renders. There are no real timestamps anywhere.

---

### The property catalogue, made visible

Admin → Properties renders the `property_definitions` model as rows: label, key, level
(project / job / stage), which stage captures it, format, whether it is required to leave that
stage, and what automation it triggers. Adding a property there is the prototype's stand-in for
the three inserts described below — the point being that no schema change is involved.

Formats seeded: text, number, date, single/multi select, checkbox, currency, person, file.
Automations seeded: notify owning team on change, notify assignee when set, block stage exit
until set, start SLA clock when set, post to Teams, recalculate dependent dates. Those six cover
every automation the prototype's own behaviour implies.

### The decision that lets you start now

The open worry is that stages, per-stage property capture and automations need a lot of thought
with each department, and that starting Supabase before that work is done means re-architecting
later.

**It does not, provided one decision is made up front: stages, properties and automation rules
are rows, not columns.**

```sql
stage_definitions    (id, project_type, seq, name, owning_team_id, expected_days)
property_definitions (id, key, label, data_type, options jsonb,
                      scope: 'project' | 'job' | 'stage',
                      applies_to_stage_id uuid null, required bool, sort int)
property_values      (id, entity_type, entity_id, property_definition_id, value jsonb)
workflow_triggers    (id, on_event_type, condition jsonb, action, action_config jsonb, active)
```

With that shape, "Estimating captures a supplier name and a quote date at the Quotes Requested
stage" is **three inserts**, not a migration. Same for a new automation rule. The department
discovery can run in parallel with Phase 0/1 instead of blocking it.

The trap is the opposite: hard-coding `contract`, `deposit` and `drawings` as columns because the
prototype has them. Those three are exactly the fields that will multiply once each department is
asked what they actually track — they belong in `property_values` from day one, with only the
genuinely universal fields (project, address, stage, owner, assignee, health) as real columns.

Two costs to accept knowingly. Querying a property-value table is more work than querying a
column — mitigate with a `jsonb` cache column on the job for the handful of properties that get
filtered on constantly, refreshed by trigger. And nothing enforces a property's type but the
application, so validation rules live in `property_definitions` and must actually be applied.

**Sequencing recommendation:**

| Do now | Defer |
|---|---|
| Projects → Jobs, dual identifiers, immutability | Which properties each stage captures |
| The universal columns | The full property catalogue |
| `property_definitions` / `property_values` / `stage_definitions` shape | Their contents |
| RLS and the permission model | Automation rule contents |
| Users, teams, roles | — |

Everything in the left column is a base layer that is expensive to retrofit. Everything in the
right is configuration that is cheap to add later — **if** the left column is built to hold it.

---

## Part 2 — Permissions

The prototype has none. Everyone sees everything and can edit everything. This section maps
the surfaces it actually exposes onto a permission model.

Part 2 of the technical spec already settles the architecture: **RBAC with scope modifiers,
enforced in Postgres RLS**, HubSpot-style `(role, object, action, scope)` grants, with narrow
ReBAC via `record_shares` for one-off sharing. What follows is that model applied to this app's
real surfaces rather than restated in the abstract.

### Four demo roles the prototype actually enforces

Unlike everything else in the prototype, these are enforced — nav items disappear, data narrows,
panel tabs vanish and fields lock. Switch account from the header chip to see each role's version
of the app. It is a UI-layer approximation of the model below; real enforcement belongs in RLS,
because hiding a nav item is convenience, not security.

| | Team member | Manager | Admin | Super admin |
|---|---|---|---|---|
| **Row scope** | Own team only | All | All | All |
| **Pages** | Dashboard, Projects, Jobs | + Reports, Templates | + Admin | + Admin |
| **Panel tabs** | Main info, Activity & comments | All four | All four | All four |
| **Read all properties** | ✗ | ✓ | ✓ | ✓ |
| **Edit job properties** | ✗ | ✗ | ✓ | ✓ |
| **Edit project properties** | ✗ | ✗ | ✓ | ✓ |
| **Drag between columns** | ✗ | ✗ | ✓ | ✓ |
| **Create jobs** | ✗ | ✗ | ✓ | ✓ |
| **Push to jobs** | ✗ | ✗ | ✓ | ✓ |
| **Manage teams / edit grants** | ✗ | ✗ | ✗ | ✓ |
| **Delete** | ✗ | ✗ | ✗ | ✓ |

Observed with the demo accounts: a Team member sees **4 jobs across 4 projects** where everyone
else sees 50 across 25; a Manager gets the full record with **0 editable fields**; an Admin gets
**24**; only Super admin sees delete controls.

Three details worth carrying into the real build:

- **A project is hidden unless at least one of its jobs is in scope.** Otherwise a team member
  sees project shells they cannot open anything inside — worse than not seeing them.
- **Read scope is wider than write scope for Manager.** They see every field and can change
  none. That split is the whole point of separating action from scope, and it is the case most
  often got wrong.
- **Every mutating function checks the capability itself**, not just the button that calls it.
  Hiding the button is presentation; the guard is what stops a console call. In Supabase the
  equivalent guard is the RLS policy, and the UI check becomes purely cosmetic.

Deleting a team is blocked while it still holds jobs, with a count in the message. Destructive
actions are the only place the prototype confirms before acting, because they are the only
irreversible ones.

### Five levels that need controlling

You named properties, views, cards, teams, and managers-vs-users. They are genuinely five
different mechanisms, and conflating them is the usual way permission models go wrong:

| Level | Question it answers | Mechanism |
|---|---|---|
| **1. Object** | Can this role touch jobs at all? | `permissions(role, object_type, action)` |
| **2. Record (cards)** | *Which* jobs? | `scope` enum + `owner_user_id` / `owning_team_id` on the row → RLS |
| **3. Property (fields)** | Which *fields* on those jobs? | Column GRANT/REVOKE + sensitive fields split into their own tables |
| **4. View** | Which pages, boards and reports? | App-level nav gating + per-view grants |
| **5. Ad-hoc** | This one job, this one person, temporarily | `record_shares` with `expires_at` |

Levels 1–3 belong in the database. Level 4 is app-level (a hidden nav item is convenience, not
security — the underlying data still has to be protected at levels 1–3). Level 5 is the escape
hatch that stops people asking for a scope upgrade they do not need.

### Scope — the managers-vs-users axis

This is the one that answers "managers vs users". Rather than separate manager roles, every
grant carries a scope, so the same action means different reach for different roles:

| Scope | Reach | Typical holder |
|---|---|---|
| `own` | Rows where `assignee` is me | Team member on their own jobs |
| `team` | Rows owned by my department | Anyone, for their team's work |
| `team_hierarchy` | My department and everything under it | Department lead |
| `division` | All departments in my division | Division manager |
| `all` | Everything | System admin, finance, auditor |
| `none` | Nothing | Explicit denial |

Two things worth preserving from HubSpot's version: **edit scope can be narrower than view
scope** (see your whole team's jobs, edit only your own), and **unassigned records need an
explicit flag** — otherwise a new job with no assignee is invisible to everyone with `own`
scope and quietly goes missing.

### Property-level — the specific fields that need it

Not every field needs protecting. These do:

| Field | Rule | Why |
|---|---|---|
| `no` (job number) | Read: all. **Update: nobody.** | Immutable business key. `REVOKE UPDATE (job_number)` plus a `BEFORE UPDATE` trigger — belt and braces, because a column revoke alone is bypassed by a service-role connection |
| `contract`, `deposit` | Read: Finance, Sales, Contracts, managers. Edit: Finance + Contracts | Commercially sensitive; the prototype shows these to everyone |
| Cost / margin (not in the prototype) | Separate `job_financials` table with its own RLS | Cleanest and most performant — a column revoke breaks `SELECT *` and fails silently in most ORMs |
| `status` (health) | Edit: assignee, team lead, managers | It drives leadership reporting; if anyone can set it to on-track it stops meaning anything |
| `stage`, `owner` | Edit: current owning team + managers | This is the handoff. It should be a dedicated action, not a field update — see below |
| `assignee` | Edit: team lead and above | Reassignment is a management action |
| `notes`, `comments`, `tags` | Edit: anyone with team scope | Low-risk collaboration |
| `dependsOn` | Edit: team lead and above | Changing dependencies changes what is blocked elsewhere |

**Treat stage transitions as an action, not a field write.** Grant `job.transition` separately
from `job.update`, so someone can edit a job's notes without being able to hand it to another
team. It also gives the handoff log a natural place to be written from.

### View-level

| View | Who should see it |
|---|---|
| Dashboard (own) | Everyone — always scoped to the signed-in user |
| Jobs board / table | Everyone, filtered by record scope |
| Gantt | Everyone, filtered by record scope |
| Portfolio overview | Team lead and above |
| **Leadership summary** | Division manager and above — it ranks teams by overdue work and will be read as a performance league table |
| Job report / export | Restricted, and **`export` should be its own action.** Bulk export is the most common data-leak path; grant it to a handful of roles and log every use |
| Templates | Read: all. Edit: admin only — templates define everyone's process |
| Departments tab | Everyone, but each department block respects property permissions |

### Suggested role matrix

Scope legend: **A** all · **D** division · **H** team hierarchy · **T** team · **O** own · **–** none

| Role | Job read | Job edit | Transition | Assign | Financial fields | Reports | Export | Admin |
|---|---|---|---|---|---|---|---|---|
| System Admin | A | A | A | A | A | A | A | Yes |
| Division Manager | D | D | D | D | D read | D | D | – |
| Department Lead | H | H | H | H | – | H | – | – |
| Team Member | T | O | O | – | – | – | – | – |
| Finance | A read | – | – | – | **A full** | A | A | – |
| Scheduling / Estimating | T | O | O | – | – | T | – | – |
| Site Supervisor | share only | O | – | – | – | – | – | – |
| Read-only Auditor | A read | – | – | – | A read | A | A | – |
| External (purchaser/subbie) | share only | – | – | – | own invoices | – | – | – |

Financials are private by default and opened up deliberately — the "most restrictive first"
posture. Everything else follows from the department a person sits in.

### Implementation notes

- Index every column a policy references: `(tenant_id)`, `(tenant_id, owner_user_id)`,
  `(tenant_id, owning_team_id)`. Missing indexes are the top RLS performance problem.
- Read role and tenant from JWT claims via the custom access token hook, not per-row lookups.
  Wrap helpers as `(select has_permission(...))` so the planner caches per statement.
- Test with pgTAP, one persona per role, asserting each persona sees *exactly* the right rows
  and no others. Broken RLS fails silently — empty results, not errors — so it will not show up
  in manual testing.
- Materialised views and CSV exports **bypass RLS by construction**. Anything feeding the
  leadership dashboard from a matview needs the scope predicate re-applied in a wrapping view.

---

## Part 3 — Integrations and automations

### Microsoft Entra login

Two Entra applications, not one:

1. **SSO** — SAML 2.0 enterprise app into Supabase Auth. SAML rather than OAuth because it
   supports conditional access and MFA at the IdP, which is where they belong.
2. **SCIM provisioning** — a separate app pointing at a SCIM endpoint (Supabase Edge Function)
   so joiners, movers and leavers create, update and deactivate Lofty users automatically.

Drive **app roles**, not raw group claims. Entra drops the groups claim entirely past 200
entries for JWT apps (150 for SAML) and returns an overage indicator instead — app roles avoid
that cliff. Define `Lofty.SystemAdmin`, `Lofty.DivisionManager.Residential`, `Lofty.Estimator`
and so on, assign Entra groups to them, and map each to a Lofty role on login.

Entra owns identity and coarse role. **Lofty owns fine-grained permissions.** Do not try to
drive record-level access from Entra groups.

External parties (purchasers, subbies) are not in Entra — magic-link auth plus time-boxed
`portal_access_grants`.

One consequence worth planning around: role and scope carried in the JWT means **permission
changes only take effect on token refresh**. For immediate revocation, expire the relevant
`record_shares` rows too, since those are checked live against tables, and keep token lifetimes
short.

### SharePoint and Teams

**SharePoint** is where the job files already live, and the prototype's "Open job file" button
is a placeholder for exactly this.

- Map SharePoint **site → development**, **library/folder → job**, and mirror metadata into a
  `documents` table that references `storage.objects`.
- Migrate via Microsoft Graph, writing an `id_mapping` row (SharePoint item GUID → Lofty
  document id) per file so the cutover is reversible and cross-references survive.
- **Do not drive app permissions from SharePoint permissions.** Site and library permissions do
  not map onto record-level access, and trying to make them will produce a model nobody can
  reason about. SharePoint membership can *inform* which Lofty team someone lands in via the
  group sync; it is never the enforcement point.
- New documents go into Supabase Storage under
  `tenant/{tenant}/development/{dev}/job/{job}/{category}/`, private buckets, short-TTL signed
  URLs. Storage RLS joins the `documents` table to inherit the job's scope.

**Teams** is the notification surface. Two integration points, in order of value:

1. **Incoming webhook per channel** — cheapest by far. A handoff or SLA breach posts an
   Adaptive Card into the owning team's channel with a deep link back into Lofty. This alone
   covers most of the "nobody knows where jobs are" problem and can ship in the first
   integration phase.
2. **A Teams app / bot** — personal notifications, actionable cards ("Accept handoff" inline),
   and a tab embedding the job board. Meaningfully more work; worth it only once the webhook
   version has proven people read them.

### Notifications and email

Model notifications as a table, not as direct sends:

```
notifications(id, tenant_id, recipient_user_id, type, subject_type, subject_id,
              body, channels[], read_at, sent_at, created_at)
```

Write the row in the same transaction as the event that caused it, then let a worker fan out to
channels. That way a failed email never loses the in-app notification, and the whole thing is
replayable and auditable.

Channels: **in-app** (Realtime subscription — instant, no delivery risk), **Teams** (webhook or
bot), **email** (Resend or Graph `sendMail`; batch digests rather than per-event so people do
not mute it in week one).

Per-user preferences per notification type, and a daily digest option. The fastest way to kill
adoption is a notification firehose.

### MCP connector

An MCP (Model Context Protocol) server over Lofty is a first-class requirement, not an
afterthought — the concept spec already lists "able to connect to external data sources via MCP
or API" as one of the four confirmed platform requirements. It is what turns the Ask AI mockup
in the prototype into something real, and it is also how Claude, Copilot or any other assistant
gets at Lofty data without a bespoke integration each time.

**Shape.** A small server (Supabase Edge Function or a separate Deno/Node service) exposing
Lofty as MCP tools and resources:

| Kind | Examples |
|---|---|
| **Resources** | `job://{job_no}`, `project://{project_no}` — the assembled record: fields, stage history, checklist state, dependencies, recent activity |
| **Read tools** | `search_jobs(query, filters)`, `get_job(job_no)`, `get_project(project_no)`, `jobs_needing_attention(team)`, `phase_bottlenecks()` |
| **Write tools** | `add_comment(job_no, text)`, `request_change(job_no, note)`, `update_checklist_item(...)`, `transition_stage(job_no, to_stage, note)` |

The read tools are the same queries the dashboards already run. The write tools are the same
mutations the panel already performs. Nothing new is modelled — MCP is a second front door onto
the operations that exist.

**Three rules that matter more than the tool list:**

1. **The MCP server authenticates as the user, not as a service account.** Pass the caller's
   JWT through so every query runs under their RLS policies. An MCP server holding the
   service-role key is a permission bypass with a friendly interface — it is exactly the failure
   mode behind the Supabase breaches cited in the project plan.
2. **Writes are scoped and logged.** Every mutating tool goes through the same permission checks
   as the UI, and writes to `activity_log` with an actor that identifies both the human and the
   assistant. "The AI changed it" must always be answerable with *which* AI, *on whose behalf*.
3. **Start read-only.** Ship the read tools first, prove the answers are right against the real
   board, then add writes one at a time behind confirmation. An assistant that can silently
   advance a stage will destroy trust the first time it is wrong.

**Sequencing.** This belongs after the core data model and RLS are solid — it is worth nothing
before there is real data to read, and it is dangerous before RLS is tested. Slot it alongside
the other integrations, not in the POC.

### Automation engine

Generic, table-driven — not hard-coded rules:

```
workflow_events   (id, event_type, subject_type, subject_id, payload jsonb, occurred_at)
workflow_triggers (id, on_event_type, condition jsonb, action, action_config jsonb, is_active)
```

Events are written by database triggers and application code; a worker matches triggers and
executes actions. Actions: `send_notification`, `create_checklist`, `create_task`,
`order_item`, `advance_stage`, `post_to_teams`, `send_email`, `create_sharepoint_folder`.

**Automation catalogue — derived from what the prototype already implies:**

| Trigger | Action | Comes from |
|---|---|---|
| Job moves stage | Write immutable handoff record; notify new owning team (in-app + Teams) | The board's drag-and-drop, which currently just logs text |
| Job exceeds `PHASE_EXPECTED_DAYS` | Flag at-risk; notify assignee, then team lead at +50% | The overdue counts on both dashboards |
| Job unchanged for N days | Set health to stalled; notify lead | The `stale` status, currently hand-set |
| Selections step ticked | Recalculate position; notify if it unblocks a downstream item | Already live in the drill-down |
| All gate checklist items complete | Unlock stage transition | The template page's gate checkpoints |
| Prerequisite satisfied | Move dependent item `blocked` → `ready_to_order`; notify | `dependsOn` / blocked flags |
| Two teams edit within N hours | Raise ownership conflict; notify both leads | The `conflict` flag, currently static |
| `@mention` in a comment | Notify that person (in-app + email) | Already surfaced on the dashboard |
| Change requested on a job | Notify assignee | The Request changes button |
| Planning approval granted | Create SharePoint folder set, instantiate downstream checklists, order EER | Concept spec |
| Weekly, Monday 8am | Email leadership the portfolio summary | The Reports page, on a schedule |

Scheduling: `pg_cron` + `pg_net` for time-based checks (SLA breaches, digests, stale
detection). Edge Functions for anything talking outward (Teams, Graph, email) — short-lived and
**idempotent**, because webhooks retry and cron overlaps.

Two rules that will save pain later: every automated action writes to `activity_log` with a
system actor, so "why did this change?" is always answerable. And anything that changes state
rather than just notifying should be reversible or require confirmation — an automation that
silently advances a stage will destroy trust the first time it is wrong.

---

## What the prototype does not model

Carry these into the build as known gaps, not oversights:

| Gap | Note |
|---|---|
| **Recorded handoff log** | Currently inferred from activity. The real thing is immutable, with from/to team, timestamp and note — and it is the feature that actually attacks "where is job X?" |
| **Waiting-on** | `requested` is free text. Needs to be structured: waiting on whom, since when, for what |
| **Gates that block** | The template page shows checkpoints; nothing prevents anything |
| **Invoice register** | Promoted into MVP scope in plan v2; entirely absent here |
| **Real timestamps** | `days` is stored, not derived. No `created_at`, no stage entry time |
| **Tasks and sub-tasks** | Not modelled at all — the checklists are the closest thing |
| **Stages beneath the job** | `stage` is still a single field, not a child collection with its own dates, status and captured properties |
| **Property definitions as data** | The prototype hard-codes its fields; the real build should not (see above) |
| **Enforced permissions** | The four demo roles are enforced in the UI, but there is no auth behind them — anyone can switch role from the header. The permission grid in Admin is illustrative and drives nothing |
| **Multi-tenancy** | No `tenant_id` anywhere. Cheap to add now, expensive later |
| **Concurrency** | No optimistic locking. Two people editing one job silently overwrite |

### Colour — settled

The rule now applied: **colour on containers encodes phase; colour on records encodes health.
Never both on one element.**

Phase is structural — an attribute of *where a job sits* — so it lives on the column strip, the
Gantt band and the dashboard bar. Health is state requiring action, so it lives on the record,
and it is the only saturated amber or red in the system. Cards carry no phase colour at all.

The eight phase hues were replaced by a **two-family ramp**: teal for the four office-side
phases, coral for the four site-side phases, with lightness carrying progression inside each
half. Hue therefore tells you which side of the handover to site a job is on, and lightness how
far through. Fewer competing hues leaves amber and red free to mean something, and the ramp
varies in lightness as well as hue so it survives colour-vision deficiency.

One deliberate exception: the gold workload block on the dashboard. It is a single hero element
on the landing page, not a status. Neutralise it if the rule needs to be absolute.

---

## Suggested build order

1. **Schema and auth first.** Tenancy, `projects → jobs` with UUID PKs and immutable friendly
   keys, the property/stage definition tables, RLS with pgTAP personas, Entra SSO. Nothing else
   until cross-tenant leakage tests pass.
2. **Read-only board on real data.** Import the canonical job list; prove the concept with
   Lofty's actual jobs.
3. **Handoffs.** Stage transitions as a first-class action, the immutable log, and the first
   notification — in-app plus a Teams webhook.
4. **Gates and prerequisites.** Checklists that actually block.
5. **Automations.** The event/trigger tables, then the catalogue above, one rule at a time.
6. **SharePoint migration.** Document mapping with `id_mapping` for reversibility.
7. **MCP connector.** Read-only tools first, user-scoped auth, then writes behind confirmation.
8. **Harden.** Field-level permissions, export restrictions, audit partitioning, PITR.

Permissions belong in step 1, not step 7. Retrofitting RLS onto a populated schema is the
expensive path, and it is the one the research says most often goes wrong.
