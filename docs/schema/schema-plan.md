# Schema plan

**Status:** Phase A (structure) is **built and applied** — migrations `0024`–`0033`, live
on `gmekuqdjemrfuurxhuib` since 21 August 2026. **Phase C's property model and processes
are now built and applied too** — `0076`–`0079`, 1 September 2026: `property_values` with
typed columns and per-property locks, `property_options`, `property_access`,
`property_value_history`, the `private` schema and its helpers, `processes` with their
dependencies, properties and checklists, `process_runs`, and the workbook seed of 49
processes and 174 properties. See *1 September — the workbook lands* at the end of this
file.

**Phase B (the import) is closed and never ran** — the 9 projects and 66 jobs on the live
database were created in the app, and that is now the only way they will be. Amber,
7 September: *"i don't need any jobs imported from spreadsheets. all jobs that need to be
created from now on will be created from the projects in the app"*. The staging table, its
801 rows and `import_spine()` stay applied and inert, because *"if I need to import other
areas I will let you know"* — just not jobs or projects. `app/supabase/import/README.md`
carries the closure and its reasoning.

**What changed against this plan while building it**, each with its reasoning in the
migration header: teams became a lookup table before the rest rather than in Phase C, since
`profiles.teams` was being replaced anyway and every team-naming column could then be
created with its foreign key from the start; the stage enum needed reconciling (`0027`)
because the repo files produced eight values where the live database had nine, five spelled
differently; `job_owning_team` has no default, reversing a decision made here, because a
default means nobody ever chooses; and `companies` / `contacts` / `record_parties` were not
built, as decided below.

**Readable version:** https://claude.ai/code/artifact/188ca532-0cb0-4cf9-a6fb-d10db5bc7d0c
— the same design with diagrams and screen mockups. This file is the source of record;
the artifact is the version to show someone.

**How to read this.** It is a decision log, not a specification. Several decisions were
made, challenged and reversed, and the reversals are kept deliberately — a schema decision
without its reasoning gets "simplified" back into a bug by the next person. Where a section
is superseded it says so and points at what replaced it, rather than being deleted.

Supersedes `supabase-schema.md`, which was written before the migrations and never swept
forward.

---
## Context

The live database (`gmekuqdjemrfuurxhuib`, verified directly, not from the docs) is six
tables: `profiles` (47 rows), `activity_audit` (150), `login_activity` (17), and
`addresses` / `projects` / `jobs` — **all three empty**. That emptiness is the whole
opportunity: every structural change below is free today and expensive once Lofty's data
is in.

Two things needed settling before any more tables could be built, both parked in the docs
as "not mine to decide":

1. **How properties are stored.** `property_defs` / `property_values` are specified in
   `supabase-schema.md:597-624` but do not exist. The 11 seed properties live in a
   hardcoded TypeScript array.
2. **How field-level permissions work.** `HANDOFF.md:659-661`: *"Finance is not a rung. A
   ladder says how much you can do; Finance says what you own."* No policy in the database
   references teams at all.

### Drift found against the docs (the docs are wrong, the database is right)

- ~~**The pipeline is nine stages, not eight.**~~ **Superseded by `0035`: it is five.**
  The nine were the enum's, which came from the prototype, which came from a workshop.
  Lofty confirmed the lifecycle on 23 August:

      Acquisition & Development > Pre-construction > Construction
        > Handover & Maintenance > Closed

  Four of the nine — Planning & Engineering, Working Drawings & Contracts, Scheduling &
  Estimating, Post-construction & Closeout — are **processes that run inside a phase**,
  not phases, and belong in nested pipelines. Handover and Maintenance are one phase,
  which answers the question `0029` left in a comment. `jobs.job_stage` also stopped
  being an enum: a vocabulary that changes has to be able to lose a value, and an enum
  cannot.
- **A migration exists in the database with no file in the repo** —
  `0014_revoke_recreated_audit_function`. Migrations after `0013` also lost their numeric
  prefix in the ledger. A fresh `supabase db push` would not reproduce this database.
- **Table comments are stale** — `profiles` still claims its PK is `auth.users.id`
  (untrue since `0015`); `activity_audit` still lists `profile_teams` (dropped in `0022`).
- `pg_cron` 1.6.4 and `pg_net` 0.20.4 **are installed** — the substrate for the
  process automations already exists.

## Decisions locked

| Decision | Answer |
|---|---|
| Property authoring | Admins define properties in the UI. Write access: **superadmin only** |
| New property default | **Creator picks read + write scope, `none` pre-selected** so skipping fails closed |
| Grant granularity | **Per individual property**, with a per-property baseline and grant rows as overrides |
| Row × field | **Yes** — field access also depends on the record's owning team |
| Manager reach | **Sees all fields except those marked restricted**; admin/superadmin bypass |
| Primary keys | **Natural keys, no uuid duplication** |
| Naming | **Every column prefixed with its table's singular name** |
| Inheritance | Project properties are read by all its jobs and **cannot be overridden per job**; job properties exist only on jobs |
| Team hierarchy | **Dropped.** `team` is a flat enum; scopes are `none / own / team / all` |
| Team list | **Twelve teams, in a lookup table — the `team` enum goes.** The eleven from `0004` plus Lofty General. `Commercial`, `Executive` and `Admin` were added by `0014` and are not teams; they seed as inactive because an enum value can never be removed but a row can be retired. The process map's department names are workshop shorthand and get mapped onto this list |
| Membership vs management | **Separate.** A person is a member of several teams and manages a subset of them |
| Project numbers | Corrected **at import only**, stable thereafter |
| Project ↔ job | Project is the parent folder. **Job count is fluid** until the lot count is confirmed; job sequence gaps are permanent |
| Property scope | **Exclusive** — a property is project-level or job-level, never both. Project properties read through to every job with no override |
| Stages & processes | **Nested pipelines, as tables.** A stage is a position in a pipeline; pipelines nest, so Preconstruction elaborates a lifecycle stage and Working Drawings elaborates a preconstruction stage. Editable from the UI, permissioned per pipeline. The `stage` enum goes |
| Projects tab | Visible to **superadmin, admin, managers and Acquisition & Development** only. Everyone else lives on the Jobs tab |
| Process | Tables built, **the 57 steps not mapped** — that stays a business decision |

## What is structure, and what is data

The governing principle, because it decides everything else: **anything Lofty might argue
about in a meeting should be a row, not a table or a column.** Names, stages, fields,
grants, processes and automations all change as the business learns. Shape does not change
cheaply, so shape is the thing to spend care on now.

A thing earns its way into *structure* only if one of these is true:

1. it needs referential integrity — something else must point at it and not dangle;
2. it needs a constraint the database can enforce;
3. it is filtered, sorted or grouped at scale, where a join per row would hurt.

Everything else is data. That test is what puts stages in a table rather than an enum,
properties in rows rather than columns, and team processes in the same `pipelines` table
as everything else rather than in a parallel subsystem.

### The four axes — and why merging any two loses something permanently

A job's relationship to process is not one hierarchy. It is four independent things that
each attach to the job and answer a different question:

| Axis | Table | Answers |
|---|---|---|
| **Position** | `job_pipeline_positions` | where is it |
| **Work** | `tasks` | what is being done |
| **Change** | `variations` | why it deviated |
| **Facts** | `property_values` | what is known about it |

Merging any pair is the expensive mistake, and each merge destroys something that cannot be
recovered afterwards:

- **Position + Work** — deriving the stage from which tasks are complete is the tempting
  shortcut. It makes moving backwards wipe the completion history, and Lofty's "not snakes
  and ladders" requirement becomes unbuildable.
- **Work + Change** — variation effort stops being separable from build effort, so "what
  did rework cost us" can never be answered.
- **Position + Change** — a variation becomes a state of the job, so a job can only have
  one. Three teams raising conflicting changes is the original pain point.
- **Facts + anything** — a value stops being independently permissible, and per-property
  security goes with it.

### What is unrecoverable if it isn't built now

History cannot be backfilled. These tables must exist from the first migration even though
nothing reads them for months, because the alternative is a permanent hole:

- `job_stage_events` — time in stage. `job_stages` was dropped in `0006` and that history
  is already gone once.
- address history — which name a site had when.
- `property_value_history` — what a field used to say.
- the variation → reopened-task link — how much rework each change caused.

## The permission ladder, as defined

| Rung | Can |
|---|---|
| `viewer` | Read only |
| `user` | Works their own jobs — sees their team's work, edits what is assigned to them |
| `manager` | Full CRUD on the work of the teams **they manage**; adds and edits people in those teams; sets notifications and reports. Reads all fields **except those marked restricted**. Cannot touch app settings outside their teams |
| `admin` | All of the above across every team, plus automations and app settings. **Cannot create or change properties** |
| `superadmin` | Everything, including properties |

## Team membership — reinstate `profile_teams`

`0022` folded `profile_teams` into a `profiles.teams team[]` array, and its stated test was
*"does the membership row carry attributes of its own?"* — `is_primary` was constant, so the
array won. That test now gives the opposite answer: **whether someone manages a team is an
attribute of the membership**, and Deanna is a member of four teams while managing three.
Same rule, new fact, opposite conclusion.

```sql
teams (
  team_id       text primary key,        -- 'design', 'sales_admin', 'lofty_general'
  team_name     text not null,           -- renameable label
  team_position smallint,
  team_is_active boolean not null default true
);

profile_teams (
  profile_id uuid references profiles on delete cascade,
  team_id    text references teams(team_id),
  profile_team_role text check (profile_team_role in ('member','manager')),
  profile_team_is_primary boolean not null default false,
  primary key (profile_id, team_id)
)
```

**The enum-to-table conversion rides along on this migration.** `profiles.teams` is being
replaced by these rows anyway, and every other column that names a team — `job_owning_team`,
`pipeline_stage_owning_team`, `task_owning_team`, `variation_current_team`,
`property_def_owning_team` — sits on a table that does not exist yet, so each is created
with the foreign key from the start. Nothing is converted twice.

`job_engaged_teams` stays a `text[]` of team keys with the same GIN index and overlap
operator, so RLS performance is unchanged. An array cannot carry a foreign key, so a
validating trigger checks its values against `teams` — the same pattern already required for
multi-select property options.

Two parallel arrays (`teams` + `managed_teams`) would be the cheaper change but they can
disagree — someone managing a team they are not in. The table cannot express that.

`private.my_teams()` and a new `private.my_managed_teams()` read from here; both stay
`stable security definer` and both get wrapped in `(select …)` at every call site.

## Mapping the process map's departments onto the app's teams — resolved

**No new `team` enum value is needed.** Marketing sits inside the map's "Admin & Support",
and "Admin & Support" is not one app team — its steps split across several (Sales Admin,
Construction Admin, Admin, and Marketing-as-Admin). So the mapping is **per step at import
time, not a single rule**, and it belongs in the import script rather than the schema.

This matters more than it looks: enum values can be added but never removed, so every
department name that turns out to be shorthand rather than a real team is a value the
database would have carried forever. Three of the map's eleven departments are shorthand
of this kind — "Admin & Support", "Pre-Construction" and "Marketing" — and none of them
becomes a team.

The import script therefore needs a lookup table of its own, checked by someone who knows
the process, mapping each of the map's ~1,200 steps to one of the app's 15 teams. That is
a data task for the process batch, not a blocker on anything before it.

**The named people in the process map are stale** — Ryan on contract approval, Gavin on
civil and FCR checks, Jordan on timber and beams, Gary on CPC, Craig on HOW insurance and
the construction release. Lofty is refreshing them as part of updating the map. Nothing
structural depends on them; they matter only when the step-to-team mapping is built, which
is Phase C. **Do not seed team assignments from the current map.**

---

## Checked against Coronel & Morris (14th ed.), the COMP8711 text

Three of this plan's decisions are the textbook's own advice rather than Supabase-specific
workarounds, which is worth recording because it means they survive a change of platform.

**Naming (§2-4c).** *"It is also a good practice to prefix the name of an attribute with
the name or abbreviation of the entity in which it occurs… a proper naming convention can
go a long way toward making your model self-documenting."* Chapter 3 adds that it is how
you spot a foreign key by eye. The textbook abbreviates (`CUS_CREDIT_LIMIT`,
`VEND_CODE`); this plan spells the entity out (`project_id`, `project_name`), which is the
same rule with clearer names.

**Sparse columns (§3-2).** *"As a general rule, nulls should be avoided as much as
reasonably possible. In fact, an abundance of nulls is often a sign of a poor design."*
Hundreds of property columns on `jobs` — where any one job fills perhaps thirty — is
exactly that. The textbook also lists why: a null may mean *unknown*, *known but missing*,
or *not applicable*, and nothing distinguishes them. The property store separates all
three: no row means unset, and *not applicable* is the property simply not being attached
to that pipeline stage. It also notes nulls break `COUNT`, `AVERAGE` and `SUM`, which
matters for the reporting requirement.

**Referential integrity (§3-3).** *"Every foreign key entry must either be null or a valid
value in the primary key of the related table."* This is why `property_values`,
`record_parties`, `tasks` and `document_links` all use the exclusive-arc pattern — two real
FK columns with a `num_nonnulls(...) = 1` check — instead of the `subject_type` +
`subject_id` pair `supabase-schema.md:614` proposes. A polymorphic text discriminator has
no referential integrity at all and cannot cascade.

**Entity integrity (§3-2)** requires a primary key to be unique and never null. `project_id`
as a 4-digit identity column satisfies both.

**Where the textbook would push back.** Its evolution table describes key-value stores as
having *"less semantics in data model"* while being *"best suited for large sparse data
stores"*. That is the honest cost of the property store: it is formally normalised — the
value depends on the whole key — but it moves schema into data, so the database no longer
declares what a field means. The typed value columns, the composite FKs pinning format and
options, and `pipeline_stage_properties` all exist to buy that semantics back. Anything
that erodes them erodes the argument for the design.

**Not yet checked.** The Drive extraction truncated partway through Chapter 3, so
Chapters 4 (ER Modeling), 5 (Advanced Data Modeling — supertypes and subtypes) and 6
(Normalization, including §6-5 Surrogate Key Considerations, §6-8 Denormalization and the
§6-9 Data-Modeling Checklist) were not read. §6-9 in particular is worth running this
design against before the rename batch lands.

## Checked against the Supabase design reference

The reference agrees with this plan on constraints, data types, indexing, RLS-as-data-model
and migrations. Three points are worth recording because they either changed something or
because the plan deliberately departs.

**Adopted.** Booleans read as a question — `property_def_is_restricted`, not
`property_def_restricted`; `project_is_lot_count_confirmed` beside its timestamp. Every
foreign key gets an explicit `on delete` behaviour *and* an index, never the default. Text
plus a `check` constraint is preferred over a native enum because it extends without a type
migration — which is the same conclusion the stage enum forced on us from the other
direction.

**Deviation 1 — natural primary keys.** The reference says default to a uuid surrogate and
enforce the natural value with a separate `unique` constraint, on the grounds that natural
values change. Decision: **keep `project_id integer` and `job_id text` as the keys.** The
justification is that Lofty's numbers change *only during the import* and are then fixed,
which is precisely the "stable natural key" case the textbook allows; the cascade is
exercised once. The costs accepted are that every FK to `projects` needs
`on update cascade`, and that a post-go-live renumber is a genuinely expensive event rather
than a one-column update. **Do the import before go-live** — that condition is what makes
this safe, so if it slips, revisit this decision rather than the schedule.

**Deviation 2 — every column prefixed.** The reference applies the prefix rule to keys only
and leaves ordinary columns bare. Decision: **prefix every column**, as the textbook's
§2-4c describes it. Accepted cost: `project_created_at` on 25 tables, and unfamiliarity to
a Postgres native reading the schema for the first time.

**Disagreement — EAV.** The reference lists entity-attribute-value tables under *common
anti-patterns*: *"Tempting for 'flexibility', expensive in query complexity and lost type
safety. Reach for jsonb on a real column instead if you genuinely need this."*

That criticism is correct and this plan accepts it. What it does not resolve is the
requirement: **per-property permissions that vary per record, enforced by the database.**
Neither alternative can carry that.

- *Wide columns* fail because Postgres column grants are per database role, and every
  Supabase user arrives as `authenticated`.
- *A jsonb column* fails for the same reason one level down: RLS filters rows, and a jsonb
  blob is one column. There is no way to grant Finance `custom->>'margin'` while denying
  Sales.

So the property store is chosen with its costs known, and the mitigations are load-bearing
rather than decoration: **typed value columns** answer "lost type safety", and the
**composite foreign keys** pinning format and select options answer "no declarative
integrity". The remaining cost — query complexity — is real, unmitigated, and paid on every
report. If per-property permissions are ever dropped as a requirement, this decision should
be revisited immediately, because the anti-pattern warning becomes correct without it.

## Naming convention

Primary key is `<table>_id`. Every ordinary column carries the same prefix. A foreign key
keeps the parent's column name, so joins read `using (project_id)` with no aliasing.
Join tables prefix their own columns with the join table's name.

```sql
projects (project_id, project_name, project_type, project_status, project_stage,
          project_start_date, project_created_at, project_created_by, ...)
jobs     (job_id, project_id, job_sequence, job_stage, job_status, job_created_at, ...)
```

Tables stay **plural and snake_case** (`projects`, `jobs`, `property_values`); junction
tables are named as the combination (`project_addresses`, `pipeline_stage_properties`).
Booleans read as a question — `job_is_active`, `property_def_is_restricted` — never a bare
adjective or a `_flag` suffix. Unquoted identifiers fold to lowercase in Postgres, so
camelCase is never used at the database layer; the TypeScript layer keeps camelCase and the
repository maps between them, as it already does.

Renaming the existing six tables' columns is cheap: only `profiles` has rows, and a rename
preserves them.

## Keys

```sql
projects (project_id integer primary key generated by default as identity)   -- 1000+
jobs     (job_id text primary key)                                           -- '1042-01'
```

`generated by default` (not `always`) keeps the hand-override that
`bump_project_no_seq` exists to support, and is what lets numbers be reconciled during the
import from the old system. `job_id` is stamped by trigger at insert from
`project_id || '-' || job_sequence` — assigned, not generated, so a job number printed on a
contract never silently changes.

Every FK to `projects` carries `on update cascade`. Because numbers are corrected **at
import only**, that cascade is exercised once and then effectively dormant — which is what
makes the natural key safe here. Tables with no human-facing number (`contacts`, `tasks`,
`comments`, `documents`, `property_defs`) get a single uuid PK; there is no duplication
there to remove.

**Do the import before going live.** A number correction after Lofty is working in the app
means live job numbers moving under people, which is a different and much worse problem
than the same correction during a migration.

### The import assigns numbers, it does not correct them

The old system has **no project key at all**, and its job numbers are a flat five-digit
sequence (`12345`, `12346`, `12356`, `12367`) unrelated to Lofty's `project-sequence`
format. So the import does not renumber anything — it numbers projects and jobs **for the
first time**, taking the next available project number and assigning job sequences beneath
it.

That materially de-risks the natural-key decision: `on update cascade` exists as a
safety net but should never actually fire, because no number is ever reassigned.

```
old system                     imported as
12345  Lot 1 Streetsville St → 1106-01   job_number_old = '12345'
12346  Lot 2 Streetsville St → 1106-02   job_number_old = '12346'
12367  Lot 3 Streetsville St → 1106-03   job_number_old = '12367'
12356  Lot 4 Streetsville St → 1106-04   job_number_old = '12356'
```

`job_number_old` is a **nullable unique** alternate key, searchable for the life of the
system — old paperwork, SharePoint folders, invoices and emails will carry it for years.
Nullable and unique compose correctly in Postgres: nulls do not collide, so jobs created in
the app simply have none. The column already exists as `old_job_number` (`0023`) with a
partial index; the rename batch renames it and adds the unique constraint.

**Two things the example exposes that the renumbering scheme does not solve:**

1. **The old numbers do not group.** `12345`, `12346`, `12356`, `12367` are one site, and
   nothing in the numbers says so — they are not even contiguous. Projects have to be
   reconstructed from somewhere else, almost certainly the address, with a human checking
   the result. This is the expensive part of the import, not the renumbering, and getting it
   wrong is not cosmetic: project properties read through to every job, so a job filed under
   the wrong project silently inherits the wrong council, the wrong developer and the wrong
   site facts.
2. **Job sequence must follow lot order, not old-number order.** In the example the old
   numbers are scrambled relative to the lots — Lot 3 is `12367`, Lot 4 is `12356`. Sorting
   by old number would produce `1106-03 = Lot 4`, and lot-versus-sequence confusion is
   forever.

**Two tiers of import.** Closed and cancelled jobs come across too, but Lofty is explicit
that their project and job numbers need not be right — only the **~200 live jobs** must be
correct, and a human checks those in a spreadsheet. So:

- **Live jobs** — grouped into projects by hand, sequenced by lot, checked before load.
- **Closed and cancelled jobs** — best effort. Where a grouping is not confidently known,
  **each becomes a single-job project.** That is honest: it asserts nothing that isn't
  known, rather than inventing a site grouping nobody verified. Project numbers are cheap
  integers; a wrong grouping is a lie that lives forever.

Imported records need no extra flag — `job_number_old is not null` already identifies them.

### Loading jobs before properties exist

Properties are Phase C; the import is Phase B. That is deliberate, and it works, because a
job needs **no property value to exist**. Its spine — project, sequence, old number,
addresses, owning and engaged teams, assignee, status, pipeline positions, tasks,
variations, parties, documents — is all real columns and real foreign keys. Nothing in
`jobs` is null-blocked on a field that has not been defined yet, and `required_to_create`
is a Phase C concept with nothing configured against it.

**The spreadsheet lands in a staging table, not in a script.** The old system's field data
(contract values, dates, statuses) has nowhere to go until `property_defs` exists, so:

```sql
create table import_staging_jobs (
  import_staging_job_id      bigint generated always as identity primary key,
  import_staging_job_source  text not null,        -- which old system
  import_staging_job_number_old text not null,
  import_staging_job_row     jsonb not null,       -- the spreadsheet row, verbatim
  import_staging_job_loaded_at timestamptz,        -- when the spine was created
  import_staging_job_job_id  text references jobs(job_id)
);
```

Phase B reads it to create the spine and stamps `job_id` back. Phase C reads the *same*
rows to create property values, now that fields exist to put them in. Nobody re-exports
anything, and the raw source stays in the database as evidence of what was imported.

**One wrinkle to fix before the import.** `supabaseRepository` deliberately falls back to
the hardcoded seed when a lookup query returns empty — sensible for a half-built database,
wrong once `property_defs` is a real table that is legitimately empty. That fallback has to
become "empty means empty" for `property_defs` specifically, or the first imported job will
render eleven seed fields that do not exist.

## Projects and jobs — parent folder, subfolders

The problem being solved: **there is no project id today**, so several jobs on one site
have nothing holding them together and anything true of the whole site has to be typed onto
every job by hand.

- A project is the **parent folder**; jobs are subfolders. Editing a job never touches the
  project. The one exception is properties, which travel downward — see below.
- **The number of jobs is fluid.** Jobs are added and removed as the site layout changes,
  until the point in the process where the lot count is confirmed. So jobs must be cheap to
  create and safe to delete: every child of `jobs` — properties, addresses, tasks,
  comments, documents, parties — carries `on delete cascade`, and none of them is
  referenced from outside the job.
- **The number of jobs on a project is derived, never stored.** `count(*)` over an indexed
  foreign key is trivial at Lofty's scale, and a stored counter needs a trigger and can
  drift — the classic case of a number people trust that is quietly wrong.
- `project_proposed_dwellings` **is** stored, because it is a different fact: what was
  *intended* at creation. Intended-versus-actual is a real question ("we planned four lots
  and got three"), and a derived count cannot answer it.
- `project_is_lot_count_confirmed` is a third, separate fact — a count of four does not say
  whether four is *final*. Only a person knows that. **Candidate for removal later:** if the
  confirmation always coincides with a pipeline stage (Development Approval, or titles
  issued), it should be derived from the position instead of being a flag someone has to
  remember to tick. Keep the flag until that stage is identified.
- **Job sequence gaps are permanent and correct.** If `1042-02` is deleted, `1042-03` keeps
  its number rather than sliding up. A job number appears on contracts and folders; sliding
  it silently is the same class of problem as renumbering a project after go-live.

### Properties travel down, never up

Every property is **either** a project property **or** a job property, never both. That is
the existing `property_def_scope` column and it is exclusive.

- **Project properties are read by every job on that project and cannot be overridden per
  job** — fencing and pegging are done across the whole site, so there is one answer and
  all jobs show it. This is a **live read-through, not a copy**: the value lives once on the
  project, and a job displays it. Copying would let 20 jobs quietly disagree about a fact
  that is true of the site.
- **Job properties exist only on jobs** — selections, pricing, design, pour dates. Twenty
  jobs, twenty answers.

Because it is read-through rather than copy, "pushing a project property down to all jobs"
needs no push at all. It is a join, and it cannot drift.

### The lifecycle is five phases, and nobody owns one

Confirmed by Lofty, 23 August 2026, and applied in `0035`:

| # | Phase | Terminal? |
|---|---|---|
| 1 | Acquisition & Development | |
| 2 | Pre-construction | |
| 3 | Construction | |
| 4 | Handover & Maintenance — **renamed Maintenance, 1 Sep (`0076`)**: handover is the last process of Construction | |
| 5 | Closed | won |

**No lifecycle phase has an owning team.** Every one of the previous nine carried one; I
seeded those and nobody confirmed them, and the answer is that they are wrong in principle
rather than in detail — several teams work inside one phase, which is the same fact that
makes `job_engaged_teams` an array. `pipeline_stage_owning_team` stays on the column,
because a *nested* pipeline's stages do have an owner: Design owns every column of its own
board.

**Cancellation is not a phase.** Closed is the one terminal position; a job that stops for
a bad reason is `cancelled`, which is a status. Position says where a job got to, status
says how it went, and collapsing them makes "cancelled during construction"
unrepresentable.

> **Reversed, 26 August 2026 (`0045`), on Amber's rule — kept above for its reasoning,
> which shaped the reversal.** Cancelled becomes a position after all, because it needs
> position *behaviour* a status cannot carry: a 12-month clock that moves it to the
> archive, an exemption from every notification, automation and health alert, and a
> revival path — **the one backward move the lifecycle allows**. The lifecycle is now
> seven positions: the four working phases, then **Completed** (what this section's
> "Closed" meant — done, won), **Closed** (the archive: reached 12 months after
> Completed *or* Cancelled by the `lifecycle_archive()` clock, hidden by default and
> shown by the Closed saved view), and **Cancelled**. What the original decision
> protected is not lost: "cancelled during Construction" stays representable, because
> `job_stage_entered_at` keeps when it was cancelled and the audit trail keeps where it
> was cancelled from. `record_status` still carries `cancelled` as how it went;
> `project_stage_from_jobs()` excludes cancelled jobs so a project neither waits for
> nor follows them.

**Everything else is still moving.** Lofty's words: *"the process map will always be an
evolving process"*. So the nested pipelines are deliberately not seeded — the mechanism
exists, the content waits. The first one to build is Design's, because it is the one
named: a job goes through Working Drawings, Design want to watch it on a kanban and know
how long it took.

### Stages are positions in a pipeline

A stage is not a column on the job — it is **where the job currently sits in a given
pipeline**, and a job sits in several pipelines at once at different levels of detail. See
**Pipelines** below. The `stage` enum goes; nothing that changes as often as a process
should be a type that cannot have values removed or reordered.

## Addresses — corrected from Lofty's notes

Supersedes the derived-from-history model below. **Original and current are two explicit
things, not two ends of a timeline**, because original is protected and current is not.

- `..._original_address_id` — set at creation, **copied from the current address at that
  moment**, and immutable thereafter. Only admin/superadmin may change it, enforced by a
  trigger, not by a policy (RLS cannot protect a column — the `0018` lesson).
- `..._current_address_id` — starts equal to the original, changes freely.
- **Both projects and jobs carry both.** A job's address is not the project's address.
- Every change is still logged, because the UI shows the original above the current and
  offers the full history on hover.

**`address_history` holds superseded assignments only — it never duplicates an address.**
The address text lives once, in `addresses`. History carries the link and the period and
nothing else: which record, which address, which role, from when to when. So a project
renamed twice has one row in `addresses` per name, two columns pointing at the original and
the current, and one history row for the middle name that neither column points at any more.
No fact is stored twice.

Why the columns alone are not enough, which is the natural question: when
`project_current_address_id` repoints from "20 Corner Street" to "20A Corner Street", the
"20 Corner Street" row is **orphaned** — nothing links it to project 1042 any more. It still
exists in `addresses` and search would find the text, but nothing could say whose it was.

And why `activity_audit` cannot cover it, though it does record the change: its read policy
is admin-only, so nobody else could see the tooltip; the old value sits inside a jsonb blob,
so "which project was ever at 20 Corner Street" is an unindexed scan; and it is a forensic
log, not a queryable relationship. Three different reasons, any one of them decisive.

> **Revised twice since — see `0037` and `0073`.** The required set is now **suburb, state,
> postcode, country** and nothing else. `0037` made the street optional, because Lofty buys
> land before it has a frontage and a project may be "the Mt Gambier division". `0073`
> dropped the rest: the pair of checks that made a street and a number arrive together, and
> the council. Amber, 31 August, on the create form: *"the only thing required is suburb,
> state, postcode and project type. the rest are optional."* The paragraph below is kept
> because the reasoning for the lot number — that the street number is often unknown or
> later changed — is the reasoning that eventually removed the constraint rather than
> loosened it: on a plan of division, "Lot 7" is not half an address, it is the address.
> The guarantee that survives belongs to jobs, and lives in
> `guard_job_address_is_a_street`: a dwelling needs a street **and** a number.

Required on every address, never null: **street, suburb, state, postcode, country**.
`address_postcode` **does not exist today and must be added.** Lot number is required in
practice — when land is subdivided the street number is often unknown or later changed — so
the constraint is that **at least one of lot number or street number is present**, not that
both are.

> **Also revised by `0073`: council is optional.** The conditional check below was right
> about the shape of the rule and wrong about who pays for it. The form fills the council
> in from the suburb off the LGA list and gets it right everywhere the list is
> unambiguous; for the four suburbs that sit in two councils it clears the field and says
> so, on the reasoning that a council on a lodged application is not worth being
> confidently wrong about — and then the constraint made a guess the price of creating the
> project at all. `addresses_council_is_sa` stays: the enum is SA-only, so an interstate
> address still may not carry one.

**Council is required, conditionally.** Lofty builds only in South Australia at present, and
`address_council` is an enum of the 68 SA councils with an existing check that it must be
null outside SA. Rather than a flat `not null` — which would make an interstate address
impossible to enter without a migration — express the rule as it actually is:

```sql
constraint addresses_council_required_in_sa
  check (address_state <> 'SA' or address_council is not null)
```

Every address is SA today, so every address has a council, which is what was asked for.
And the day Lofty builds in Victoria, that row simply has no SA council — honest, and no
schema change. The `au_state` enum already carries all eight states, so nothing else blocks
it either.

### Creating jobs from proposed dwellings

`project_proposed_dwellings integer` is captured at project creation. A **Create Jobs**
action splits the project into that many jobs in one go:

```
project 1001  ·  4 proposed dwellings  →  [ Create Jobs ]

  1001-01   Lot 1, <project current address>   ← original, immutable
  1001-02   Lot 2, <project current address>
  1001-03   Lot 3, <project current address>
  1001-04   Lot 4, <project current address>
```

Each job's original address is a **copy taken at the moment of the split**, carrying its lot
number, and is immutable from then on. So a later change to the project's address does not
rewrite what the jobs were originally called — which is the whole point of holding an
original at all.

## Addresses — SUPERSEDED: the join-table design

> **Superseded by "Addresses — corrected from Lofty's notes" above.** This proposed
> `project_addresses` / `job_addresses` join tables with original and current *derived*
> from validity periods. Lofty overrode it: original and current are explicit columns,
> original is immutable except by admin, and history holds superseded assignments only.
>
> Kept because the scenario and the search-view approach below still hold, and because the
> reasoning for deriving rather than storing is worth having on record if the question
> comes back.

The scenario is Lofty's own:

```
project 1042   "12 Test Street"        →  renamed  "20 Corner Street"   (corner block)
  job 1042-01  "Lot 1, Corner Street"  →  renamed  "28 Corner Street"
  job 1042-02  "Lot 2, Corner Street"  →  renamed  "20B Corner Street"
  job 1042-03  "Lot 3, Test Street"    →  renamed  "12A Test Street"
```

Someone will search all of these — the lot designation, the interim name and the final
street number — and expect to find the job. So every address a record has ever had stays
attached to it, with the period it applied.

```sql
addresses (address_id uuid pk, address_lot_number, address_street_number,
           address_street_1, address_street_2, address_suburb, address_state,
           address_council, address_consolidated, ...)

project_addresses (project_id, address_id, project_address_role,
                   project_address_valid_from, project_address_valid_to, ...)
job_addresses     (job_id, address_id, job_address_role,
                   job_address_valid_from, job_address_valid_to, ...)
```

`role ∈ (site, postal, billing)`. **There is no `original` role** — original is the
earliest row and current is the row with `valid_to is null`, both derived rather than
stored, so they cannot disagree with the history sitting next to them. A partial unique
index enforces one current address per role.

Search runs over **every** row, not just the current one, which is what the existing
`job_address_search` / `project_address_search` views become. `pg_trgm` is already
installed and `address_consolidated` already carries a GIN trigram index, so fuzzy search
across the full history is close to free:

```sql
create view job_address_search with (security_invoker = true) as
select ja.job_id, a.address_consolidated, a.address_suburb,
       ja.job_address_valid_to is null as is_current,
       ja.job_address_valid_from = min(ja.job_address_valid_from)
         over (partition by ja.job_id, ja.job_address_role) as is_original
from job_addresses ja join addresses a using (address_id);
```

**"A project must always have an address"** is a deferred constraint trigger firing at
commit, since the address row cannot exist before the project it attaches to.

## Entity model

**External parties — out of scope, decided.** `companies`, `contacts` and `record_parties`
are **not built**. This app is project and process management; Lofty does not run a CRM and
does not want one. There is no lead pipeline, no relationship to nurture, no correspondence
to log, and only staff sign in. A purchaser's name is a *fact about a job* — like its
council — so it is an ordinary property.

**Closed, not deferred.** The strongest argument for a parties table was grouping records by
the same external party — which a text property answers only as a fuzzy string match. But
**Lofty is the developer**: they own the land and build on it, so the one party that would
need grouping is the company itself, and every project belongs to it by definition. What
remains is purchasers, one per house and rarely repeating. A text property is the right
amount of structure for that.

Worth carrying into the property definitions: `project_type = 'development'` means Lofty's
own land development, and the "client" on a job is the purchaser of the finished house —
two different relationships that a single generic *client* field would blur.

**PM** — one `tasks` table, not two. A template-instantiated checklist item and an ad-hoc
task differ only by `template_step_id` being non-null; two tables would make every "my
work" query a `union all` forever. Child tasks handle the 57-steps-vs-40-checklist-groups
mismatch without resolving it. Plus `task_dependencies`, `job_dependencies` (cycle check by
trigger — `check` cannot hold a subquery), `comments` + `comment_mentions`, `documents` +
`document_links`, `tags` + `taggings`.

**Stage history** — `job_stage_events`, append-only, written by a `security definer`
trigger with no insert policy. Stage being "just a property" does not remove the need for
this: it is a *column* rather than an EAV row, so it gets no `property_value_history`, and
"how long did this sit in Working Drawings" is a reporting question that **cannot be
answered retroactively**. `job_stages` was dropped in `0006` and that history is already
gone once. Durations are a window function over the log, never stored.

**Process** — see **Pipelines** below. Tasks are instantiated from
`pipeline_stage_tasks` when a job enters a stage.

Three things in the uploaded process map change the shape of the task templates:

- **SLAs sit on the arrows, not the steps** — "Within 14 Days", "7 DAYS" label the
  transition between two steps. In a linear chain that is the same as
  `template_step_sla_days` meaning *"due N days after the previous step completes"*, and
  that is how it should be stored. Where the chain branches it is not the same, hence:
- **There are 11 approval gates with YES/NO branches** (Concept Plan Approved, PA Approved,
  FCR Approved, EER Approved, Framing Approved, Beams Approved…). Position alone cannot
  express a branch, so steps need explicit transitions:
  `template_step_transitions (from_step_id, to_step_id, condition, sla_days)`.
  A NO branch usually loops back to an "Amendment Ordered" step — the map shows that
  pattern repeatedly.
- **Some steps are external blocking gates** — council planning approval, the EER
  consultant, SA Water. The map calls these out in orange: nothing downstream moves until
  they are done, and they are not the owning team's fault when they run late. A
  `template_step_is_external` flag keeps them out of team SLA reporting, which otherwise
  makes Design look permanently overdue for council's 28 days.

The map also carries 142 steps with notes and a set of workshop pain points. Those are
documentation, not schema — import them into `template_step_help_text` so the context
reaches the person doing the step rather than dying in a canvas file.

## Prerequisite

`jobs` has **no `owning_team` and no `assignee_id`** — confirmed against the live column
list. Nothing team-scoped can be enforced until they exist. That is the first migration.

## Property store

```sql
property_defs (
  property_def_id uuid pk,
  property_def_key text unique not null,        -- immutable after creation, by trigger
  property_def_label text not null,             -- renameable freely
  property_def_scope record_scope not null,     -- 'project' | 'job'
  property_def_owning_team team not null,       -- who captures it
  -- NO stage column: which stage captures a property is a pipeline_stage_properties row,
  -- because the same property is captured at different stages in different pipelines
  property_def_format property_format not null,
  property_def_restricted boolean not null default false,   -- managers do NOT bypass
  property_def_required_to_exit boolean not null default false,
  property_def_required_to_create boolean not null default false,
  property_def_default_read_scope grant_scope not null default 'none',
  property_def_default_write_scope grant_scope not null default 'none',
  unique (property_def_id, property_def_format)  -- FK target, see below
)
```

Values use **typed columns**, not jsonb: jsonb has no date type, so every date comparison
becomes a lexical string compare, and a wrong-typed write is undetectable. Sparse — no row
means unset, clearing a field deletes the row.

Three integrity tricks worth keeping:
- A **composite FK** `(property_def_id, format)` against the unique key above pins each
  value row to its definition's format — a plain `CHECK` cannot see another row.
- The same trick pins a chosen select option to its own property.
- `property_value_owning_team` and `..._assignee_id` are **denormalised from the parent by
  trigger** so the RLS policy needs no join. The trigger must overwrite, never accept,
  what the client sent — otherwise a user writes themselves into a grant.

History goes to a dedicated `property_value_history`, **not** into `activity_audit`:
that table's read policy is `>= 'admin'`, and the entire premise here is that admin is not
the same right as reading commercial data.

## Pipelines — nested, editable, permissioned

Lofty's process is not one pipeline. It is a pipeline whose stages are **themselves
pipelines**, to whatever depth the team needs:

```
Build lifecycle              (scope: job — everyone sees this)
  Sales & Acquisition
  Preconstruction    ─────┐
  Construction            │
  Handover                │
  Maintenance             │
  Closed        (won)     │
  Cancelled     (lost)    │
                          ▼
  Preconstruction         (parent stage: Preconstruction — most teams see this)
    Stage 1
    Stage 2
    Planning Approval
    Working Drawings ───┐
    Development Approval│
    Engineering         │
                        ▼
    Working Drawings    (parent stage: Working Drawings — Design, A&D/Support, managers)
      …the Design team's own steps
```

```sql
pipelines (
  pipeline_id uuid pk,
  pipeline_key text unique not null,
  pipeline_name text not null,
  pipeline_scope record_scope not null,          -- runs on a project or a job
  pipeline_parent_stage_id uuid references pipeline_stages,  -- ← the nesting
  pipeline_position smallint,
  pipeline_is_active boolean not null default true
)

pipeline_stages (
  pipeline_stage_id uuid pk,
  pipeline_id uuid not null references pipelines on delete cascade,
  pipeline_stage_name text not null,
  pipeline_stage_position smallint not null,
  pipeline_stage_type text not null default 'open'
    check (pipeline_stage_type in ('open','won','lost')),
  pipeline_stage_owning_team team,
  pipeline_stage_expected_days smallint,
  unique (pipeline_id, pipeline_stage_id)        -- FK target
)

job_pipeline_positions (
  job_id text references jobs on delete cascade,
  pipeline_id uuid references pipelines on delete cascade,
  pipeline_stage_id uuid not null,
  entered_at timestamptz not null default now(),
  primary key (job_id, pipeline_id),
  foreign key (pipeline_id, pipeline_stage_id)
    references pipeline_stages (pipeline_id, pipeline_stage_id)
)
```

The composite FK is the guard that a job cannot be parked in a stage belonging to a
different pipeline — the same trick used on `property_values`.

**One row per pipeline the job is engaged with.** A job is simultaneously at
*Preconstruction* in the lifecycle, at *Working Drawings* in the preconstruction pipeline,
and at *Draft sent for check* in the working-drawings pipeline. Three rows, no
contradiction possible, and each team opens the pipeline that is theirs. The board is
`… join job_pipeline_positions using (job_id) where pipeline_id = $1` — one indexed join,
so no denormalised stage column on `jobs` is needed.

### "One team at a time" is an aspiration, not a fact — and the model already allows for it

Lofty's note: in practice a job in construction can take a variation (tiles unavailable,
say) that sends it back to Selections, then Estimating, then quoting. Selections, Estimating
and Scheduling are then all working the same job. The one-team-at-a-time rule exists
*because* this causes problems today, not because it is true.

**This does not break the pipeline model — it is the case the model was already built for.**
`job_pipeline_positions` holds one row per pipeline, so a job can sit at *Waiting on
estimating* in the Selections pipeline and at *Pricing variation* in the Estimating pipeline
simultaneously. Each team opens its own board and sees its own position. Nothing
contradicts anything.

Two things follow, and both should be settled **after** the variations discussion, since
variations are the mechanism driving them:

1. **Blocked is a state, not a stage.** Lofty's idea is a *Waiting on estimating* column so
   Selections does not lose sight of the job. Recommend a state on the position —
   `active | waiting | done`, plus what it is waiting on — rather than a stage per thing one
   might wait on. A stage per blocker multiplies (waiting on estimating, on drafting, on
   council, on the client), and a job parked in *Waiting on estimating* has not actually
   left the Selections stage it was in. As a state, the card greys in place, keeps its real
   stage, and the board can gather blocked work into its own lane.
2. **`job_owning_team` probably becomes plural.** Every row-level permission scope currently
   reads "the team that owns this job". If several teams legitimately hold a job at once,
   the predicate must become "any team currently engaged" — a `job_engaged_teams team[]`
   maintained by trigger from the positions and GIN-indexed, keeping the RLS check a single
   indexed array overlap rather than a join. `job_owning_team` can survive beside it as
   "who is primarily accountable", for board grouping and reporting.

## Variations

**A variation is a record, not a state of the job.** Three teams raising conflicting changes
to one job is the pain point, and a flag cannot represent three of anything. So:
`variations`, one row per change, numbered `1042-01-V3`, each with its own owner, cost,
approval and position.

**Always against a job, never a project.** Confirmed by Lofty. A project-level property
change is an ordinary edit, not a variation — and because project properties are read
through rather than copied, "push it to all jobs" needs no push at all. The jobs already
show it.

```
variation_status ∈ new → with_us → waiting_on_external → waiting_on_client
                    → on_hold → completed | cancelled
variation_current_team   team      -- the board reads "With us — Estimating"
variation_cancelled_reason text     -- see below
```

The job's badge is **derived** from its open variations ("3 open · 1 with client"), never
stored, so it cannot go stale.

### Going backwards is not snakes and ladders — and that falls out for free

Lofty's requirement: a variation may send the job back to Working Drawings, but the steps
already completed must not have to be redone.

This needs no special mechanism, because **position and completion are already separate
things**. `job_pipeline_positions` records where the job is; `tasks` record what has been
done. Move the position back and the completed tasks stay completed. Had position been
derived from task completion — the obvious shortcut — moving back would have wiped the
history, and the requirement would have been unbuildable.

What *does* need redoing is chosen explicitly by whoever handles the variation, and the
reopened tasks are recorded against it. That gives Lofty the number that justifies process
change: **how much rework each variation caused.**

### Rewinding is only coherent inside the current phase

- **Variation while the job is still in the phase that owns the work** — e.g. at
  Development Approval, needing drawings redone, still inside Preconstruction. The build
  position may move back within that pipeline.
- **Variation after that phase has passed** — the tiles case, job in Construction. The job
  does **not** rewind to a Preconstruction stage. Nobody at Lofty would say "the job is back
  at working drawings"; they would say "it's in construction with an open variation and
  Design is updating the drawings". The work lives on the **variation**, which carries its
  own tasks and its own team.

This is what keeps the lifecycle honestly forward-only, and it is the common case.

### The preconstruction schedule is a dependency graph, not a pipeline

**Source status: a draft.** `Project_Schedule_1.xlsx` was shared for information while Lofty
is still revising both it and the process map. The *shape* finding below is structural and
holds regardless; the *content* findings — the dangling branches, the durations, the team
names — describe a document in flux and should be re-checked against the final version
rather than quoted back at anyone.

Lofty's Gantt export (57 steps with team, days, predecessors and successors) settles what
the preconstruction process actually is. The data is clean — predecessors and successors
agree on **every** edge, and there are no cycles.

| | |
|---|---|
| Steps | 57, one root (*PWA Issued*) |
| Predecessors | 35 steps have one; **21 have two or more**, one has five |
| Fan-out | *Contract Deposit Paid* releases **9** steps; *Working Drawings Signed* releases **8** |
| Sum of all step durations | 434 days |
| **Critical path** | **180 days** — so ~59% of the work runs in parallel |
| Longest single step | *Finance Approval*, 49 days — **27% of the critical path** |

**A job cannot hold 57 positions one at a time.** These are `tasks` with
`task_dependencies`, not `pipeline_stages`, and the many-to-many dependency table is
required — a single `depends_on` column cannot express five predecessors. The
preconstruction *pipeline* (the board's columns) is something coarser sitting above this,
and the two chokepoints above are the natural places to draw those column boundaries.

The file is directly loadable as seed for `tasks` + `task_dependencies` once teams are
mapped, which gives the 57 steps a home for the first time.

**Two problems in the schedule itself, worth raising with Lofty:**

1. **Thirteen branches dangle.** Only *Released to Construction* should be terminal, but 13
   other steps have no successor, so they gate nothing: Soil (Bore Logs), Prelim FCR
   Ordered, Stormwater/Crossover Permits, SA Water Invoice, Fencing Notices Issued, Build on
   Boundary Notifications, Electrical/NBN Undergrounds, 1st Site Inspection Actioned and
   five more. *Released to Construction* lists only five predecessors — Finance Approval,
   2nd Site Inspection Actioned, Final Construction Check, Footing Quotes Release,
   Development Approval — so **as written, a job can be released to construction with no
   soil test and no permits.** In a Gantt these merely float; in an app that gates stage
   exit they would be genuinely skippable.
2. **A third team vocabulary, mixing teams with job titles.** *Sales Administration* (19
   steps — a third of the process), *Contracts Administrator* (11), *Preconstruction
   Manager* (3), *Production Estimator* (1), *Accounts* (2). Three of those are roles, not
   teams, and the app assigns work to teams. The step-to-team mapping has to resolve the
   granularity, not just the spelling.

Two join tables hang off a stage, and they are what make a stage more than a label:

```sql
pipeline_stage_properties (pipeline_stage_id, property_def_id,
                           is_required_to_exit, position)
pipeline_stage_tasks      (pipeline_stage_id, template_task_id, position)
```

`pipeline_stage_properties` is why `property_defs` has no stage column: the same property
is captured at different stages in different pipelines, and HubSpot's "conditional
properties per stage" is exactly this row.

**Pipeline visibility uses the entity grants**, object `pipeline` — so the Working Drawings
pipeline is granted to the Design team set, the A&D/Support set and the manager level set,
and is simply absent for everyone else. That is your requirement stated directly as data.

Everything here is editable from the UI by superadmin: adding a stage is an `INSERT`,
reordering is an `UPDATE` to `position`, retiring a pipeline is
`pipeline_is_active = false`. No migration, no deploy — which is the whole reason stages
must not be an enum.

## Permission model

Grants are keyed by **permission set**, not by team directly. Fifteen team-mirror sets and
five level-mirror sets are seeded, so day one there is nothing to administer — but when the
Director needs margin access, that is a custom set with one member rather than adding them
to Finance, which would corrupt `job_owning_team` and the one-job-one-team model.

Resolution, in order: **admin/superadmin bypass → manager reads everything not
`restricted` → per-property grant → per-property baseline → deny.** Managers get full CRUD
on their own teams' records; a user reads their team's work and edits their own.
Team managers can write grants for their own team's properties.

**Entity-level grants use the same permission-set vocabulary**, in one table beside the
field-level ones. The Projects tab is the first real use: `project / read` goes to the
admin and superadmin level sets, the manager level set and the Acquisition & Development
team set, and to nobody else. Everyone else reaches project data only through a job —
`/jobs?project=1042` is a filter on the Jobs board, not the Projects tab, so it needs no
project grant. That distinction is what lets every user filter the board by project while
the Projects tab stays closed.

Filtering the board by project, health, team, stage or type are all the same operation on
the same columns — none of them needs its own permission, because RLS has already removed
the jobs the person cannot see before any filter runs.

The policy resolves the field axis into arrays **once per statement** and lets the cheap
row axis run per row:

```sql
create policy "read property values" on property_values for select to authenticated
using (
  (select public.is_active_user())
  and (
       (select public.current_permission()) >= 'admin'
    or ((select public.current_permission()) >= 'manager' and not property_value_restricted)
    or property_def_id = any ((select private.def_ids('read','all')))
    or (property_def_id = any ((select private.def_ids('read','team')))
        and property_value_owning_team = any ((select private.my_teams())))
    or (property_def_id = any ((select private.def_ids('read','own')))
        and property_value_assignee_id = (select private.profile_id()))
  )
);
```

Every function call is wrapped in `(select …)` — that is what makes each an InitPlan
evaluated once rather than once per row, and it is the single difference between
milliseconds and seconds on a 200-property drawer. Helpers live in a `private` schema so
they are not RPC-callable, but they still need `grant execute to authenticated`: `0011`
proved that revoking it breaks every query, because a policy is evaluated with the
caller's function privileges.

`UPDATE` needs both `using` and `with check` — `using` alone is the `0018` escalation bug.

## Migration order

Numbering restarts at `0024` and runs in the order below, one migration per table per the
house rule. Numbers are deliberately **not** pinned to batches here — this ordering has
already shifted three times as decisions landed, and a table of fixed numbers goes stale
faster than it helps. The order is what matters.

Re-sequenced around the principle above: **every structural decision lands before any soft
layer is built on top of it**, and the structure is proved with real data before properties
or permissions exist. If the shape is wrong, that is when to find out — not after 300
property definitions and a grant matrix have been built on it.

### Phase A — structure (expensive to change, so do it first)

| # | Batch | Contains |
|---|---|---|
| 1 | **Repair** | Reconcile the ledger, commit the missing `revoke_recreated_audit_function`, fix `0007` so it applies to a fresh database, refresh stale table comments. Unblocks verifying anything on a branch |
| 2 | **Keys and names** | Naming convention; `projects`/`jobs` on natural keys; `job_number_old` unique; `project_proposed_dwellings`. Empty tables — free now, never again |
| 3 | **Addresses** | `addresses` with postcode and the not-null set; original and current on both projects and jobs; the immutability trigger on original; address history; search over the full history |
| 4 | **Records** | `job_owning_team`, `job_engaged_teams`, `job_assignee_id`, project equivalents, `project_is_lot_count_confirmed` + indexes |
| 5 | **Position** | `pipelines`, `pipeline_stages`, `job_pipeline_positions`; `job_stage_events` from day one. Drop the `stage` enum **last**, once nothing references it |
| 6 | **Work** | `tasks`, `task_dependencies` |
| 7 | **Change** | `variations`, their positions and their reopened-task links |
| 8 | **Parties** | `companies`, `contacts`, `record_parties` |
| 9 | **Attachments** | `documents`, `document_links`, `comments`, `comment_mentions`, `activity_events`, `tags`, `taggings` |

### Phase B — prove it

Import the ~200 live jobs into the structure above, grouped and checked by hand. Walk the
hard scenarios end to end: the corner-block rename, a project split into four lots, a
variation raised in construction, a job held by three teams at once. **This is the
checkpoint.** Anything structurally wrong surfaces here, while changing it is still cheap.

### Phase C — the soft layers

| # | Batch | Contains |
|---|---|---|
| 10 | **Permissions** | Permission sets; `profile_teams` with its role column; the `private` schema and its helpers; entity grants |
| 11 | **Property types** | The property enums **alone** — never used in the migration that creates them (the `0014` lesson) |
| 12 | **Properties** | `property_defs` seeded from the eleven below; `property_options`; `property_values` with baseline-only RLS; `property_grants` and the final policies; `property_value_history` |
| 13 | **Wiring** | `pipeline_stage_properties`, `pipeline_stage_tasks`, required-to-exit and required-to-create triggers |
| 14 | **Process import** | Team processes as pipelines; the process map's steps mapped to teams by hand |
| 15 | **Automations** | `pg_cron` and `pg_net` are already installed |

House rule holds: one branch and PR per table, moving `supabase-schema.md`, the migration,
`types.ts` and `dictionary.ts` together, then `npm run dictionary`.

### The eleven property definitions, kept here rather than in code

They lived in `stubRepository.ts` and the app served them as though `property_defs`
existed. That was the fallback this document already warned about at "Loading jobs before
properties exist" — *"the first imported job will render eleven seed fields that do not
exist"* — and it went further than a wrong render: five of the eleven named a stage that
does not exist (`"Sales & acquisition"` with a lowercase a, `"Preconstruction"` without the
hyphen, `"Construction & execution"`), matched nothing, and never appeared at all. Setup →
Properties counted eleven above a table of six.

They are **a starting point, not a specification** — written to show the shape of the model,
not taken from Lofty. Every row below needs confirming with the team that captures it before
it becomes a `property_defs` insert, and the list is certainly incomplete: eleven fields is
not what a builder captures on a house.

| Key | Label | Scope | Captured at | By | Format | Required to exit | Automation |
|---|---|---|---|---|---|---|---|
| `address` | Site address | job | Sales & Acquisition | Sales Admin | text | yes | — |
| `type` | Project type | project | Sales & Acquisition | Acquisition & Development | single select | yes | Recalculate dependent dates |
| `deposit` | Deposit status | job | Sales & Acquisition | Sales Admin | single select | yes | Notify owning team on change |
| `drawings` | Drawings status | job | Planning & Engineering | Design | single select | yes | Block stage exit until set |
| `final_eer` | Final EER | job | Planning & Engineering | Design | file | yes | Block stage exit until set |
| `contract` | Contract status | job | Working Drawings & Contracts | Pre-Construction Admin | single select | yes | Block stage exit until set |
| `contract_val` | Contract value | project | Working Drawings & Contracts | Pre-Construction Admin | currency | no | — |
| `council_hold` | Council hold | job | Pre-construction | Scheduling | checkbox | no | Notify owning team on change |
| `temp_fence` | Temp fence supplier | job | Scheduling & Estimating | Estimating | text | no | Start SLA clock when set |
| `pour_date` | Pour date | job | Scheduling & Estimating | Estimating | date | yes | Recalculate dependent dates |
| `pc_date` | Practical completion | job | Construction | Construction | date | yes | Notify assignee when set |

Two of them — `address` and `type` — are **already real columns**, on `addresses` and
`projects`. They are listed because the app grouped them with the properties, which is worth
noticing before Phase C creates a second home for a fact that already has one.

The stage each is captured at is a `pipeline_stage_properties` row, not a column on the
definition — the same property is captured at different stages in different pipelines.


## 1 September — the workbook lands: properties get values, processes get built

Amber's workbook (`app/supabase/import/lofty-processes-and-properties-2026-09-01.xlsx`) —
three sheets: the seven lifecycle stages, 175 property rows, 49 processes with the
Construction schedule's 107 task lines beneath seven of them. With it, one instruction:
*"add in the attached properties and processes … update the database schema and app
interface … linked appropriately."* This is the record of how that was built. Migrations
`0076`–`0079`; the generator that read the workbook is beside it in `import/`.

### Handover is part of construction (`0076`)

The fourth phase is **Maintenance**. Amber: *"the handover and maintenance life cycle stage
has just been changed to maintenance as handover is part of construction phase"* — and the
workbook agrees in data: "7 - Handover" is the last of the seven Construction processes.
Only the name moved; position 4 is still position 4 and `lifecycle_position()` is retaught.
The workbook's "Aquistion & Development" and "Pre-Constructions" are typos and were not
adopted.

### The property model, as built (`0077`)

The *Property store* section above proposed typed columns, a composite FK pinning a value
to its definition's format, and a dedicated history. All three are built as written.
Three things differ from the earlier text, each on purpose:

- **`unknown` is a format.** 87 of the 175 rows said "unknown (no data)". Most are plainly
  dates, and it was not the import's place to say so. The definition carries `unknown`, the
  slot says *format not set*, and the CHECK makes the format incapable of holding a value.
  Setup → Properties filters to them with one tick; a manager picks the real format.
- **Locks are on the property row, not in permission sets.** Settled 24 and 28 August,
  now built: four rungs (create / read / update / delete), a `restricted` flag, and
  `property_access` rows naming teams and people. Resolution, in order: superadmin;
  below the verb's rung, refused; restricted → only a named team or person; unrestricted →
  manager and above, or nobody named at all, or named. **Manager and admin do not bypass
  restricted.** Superadmin alone flips the flag or grants on a restricted property; admin
  sets rungs and grants elsewhere; manager edits everything else. Proved rung by rung in
  `verify/rls.sql` — 27 probes, each watched failing against a permissive policy first.
- **A job may hold a row for a project property — as a pushed copy.** 0043 said a project
  property cannot be overridden per job, and *Variations* above said "push needs no push".
  Amber asked for a push (*"push that information from a project level to all jobs"*), and
  a push is a copy, so the job holds one after it. Read-through is still the default; the
  drawer marks a pushed copy and says when it has drifted from the project. A job property
  still cannot land on a project; the trigger refuses it. `push_project_properties()` is
  SECURITY INVOKER — the locks decide what moves.

The date control is Amber's: a tick box that records today, beside a date for when it
happened earlier. Unticking clears. The history line per change is the property's, readable
by whoever may read the value — not `activity_audit`, which is admin's.

### Processes, as built (`0078`)

*Processes replace the nested pipelines* above is now a schema, with one correction to its
table names and one to its scope of deletion:

- **`process_runs`, not `job_processes`.** Twenty of the 49 processes run on the *project*
  (Concept Plan, Site Survey, Planning Approval…), so the instance table has one nullable
  parent per record type with a `num_nonnulls = 1` CHECK — the same shape as `tasks` and
  `property_values` — and a name that does not say "job". The attempt number is there: an
  amendment is attempt 2, not an overwrite.
- **`pipelines` and `pipeline_stages` stay.** The lifecycle itself is a `pipelines` row,
  the SLA editor reads `pipeline_stages`, and `seeds.sh` proves the stage list against it.
  What is gone is the *idea* of nesting; processes take that role, and no child pipeline is
  seeded. Removing the two tables is its own change once the lifecycle has another home.

What was agreed on 24 August holds: no auto-advance (the stage header on a record says
"ready to move on" and a person moves it); `not_applicable` is a status; dependencies are
the single source of ordering, cycle-guarded by trigger; milestones are a boolean and a
count, never a percentage. Due and health are derived in `process_run_display` from
`started_at + expected_days`, never stored — the *Health, finally defined* section, built.
No process has an expected duration yet: the workbook gave none, and the app says "no
duration set" rather than "on track against nothing".

Three joins hang off a process: `process_dependencies` (with lag), `process_properties`
(which properties it collects, and which are required to complete — read by the app, not
enforced by the database, because "complete with a gap" is sometimes the truth), and
`process_tasks` with `process_task_dependencies` — the checklist a run instantiates via
`instantiate_process_tasks()`, parents first, dependencies and lags copied. `tasks` gained
`process_run_id` and `process_task_id`, the columns 0030 promised "in the migration that
creates the thing it references".

### What the seed decided, and what it refused to (`0079`)

The generator translates cells; it does not guess at them. Everything it *did* decide is
listed at the end of `0079` and in `--report`:

| Decision | Why |
|---|---|
| "unknown (no data)" → format `unknown` (87 rows); blank department → null team (130 rows); no durations, milestones, required flags or restrictions | The sheet did not say. The columns exist for a person to fill. |
| Block → process where the words differ (17 mappings, e.g. "FCR" → Footings Construction Report; "Lodged for Planning Approval" → Planning Approval); "PWA & Invoice" split by row | Two sheets, two vocabularies for one thing. |
| Six properties belong to no process (the stage gates, the contract value, "Trello") | Their block is a heading, not a process. They sit under their stage alone. |
| Predecessor/successor names mapped to processes through 37 aliases; 7 names left unmapped and listed | Those cells speak the older 57-step schedule's vocabulary; a match not in doubt is wired, the rest is reported. |
| Four "Issued" rows carry the same successor list; credited to PWA, the copies skipped | A variation does not precede the concept plan. The text is byte-identical. |
| A dependency running backwards through the lifecycle or stage groups is refused | The sheet's own order is its statement of what comes first. |
| The schedule's date-mangled cells decoded (`"6, 8"` had become 6 August); both columns read as one edge set; summary lines become parent tasks | Documented at `decode_ids()`; 3 edges were declared on one side only. |
| Seven spelling fixes (Ordererd, Receieved, Construciton, depost, PRACTICLE, RAINWATWATER, CLOTHSLINE) | Labels are renameable in the app; these were fixed on the way in and listed. |
| "3 - External Cladding" read as Construction; BRC given Pre-construction/Job from the Properties sheet | Its six siblings, its tasks and its properties all say so. |

Counts, for the record: 49 processes, 174 properties (one duplicate row skipped), 48
process dependencies, 107 template tasks, 99 task dependencies.

### What this leaves for Amber

- **87 formats to set.** Setup → Properties, "Only without a format". Most are dates.
- **Durations.** No process has an expected number of days; the per-property SLA days from
  the sheet are stored on the property as given. Setup → Processes takes both the duration
  and the at-risk lead.
- **The unmapped predecessor names** at the end of `0079` — Framing Supporting Docs,
  Contract Check, Footing Quotes Release, Final Construction Check, Quote Steel Framing,
  Estimating Check of Contract/Selections, Selections Drafting Amendments — are steps the
  older schedule had and the workbook does not. Either they become processes or the
  dependencies naming them are prose.
- **Which properties are restricted.** Nothing is, yet. The mechanism is proved; the list is
  Lofty's — "mainly finance", 28 August.
- **Milestones.** No process is flagged. The stage header counts them once some are.
- **"Handover is part of construction" and "7 - Handover" is a process** — consistent. But
  the Maintenance phase now has no processes at all in the workbook, which may be right.

## 1 September, evening — the platform layer: parties, maintenance, notifications, audit, sync

Amber, after the workbook landed: *"think of everything a world class project management
system and CRM would have… 100 people using it at the same time… every change to a job or
project is audited and recorded… 2 way sync to external platforms via api and mcp… tasks
and sub task and checklists… milestone processes… at risk… notifications on incomplete
tasks and who they go to… a separate tab for maintenance… a list of contacts that are
classified as clients, companies and/or contractors."* And, via `/supabase-postgres-best-
practices`: normalisation matters, and every attribute is `tablename_attribute`.

Readable version, with the diagrams and the worked examples (1042-01, Priya Nair, Wandi
Plumbing, request 1042-01-M3): https://claude.ai/code/artifact/ef5d9221-9715-4e69-a90f-787eb4b4a725 — show
that one; edit this. **Nothing in this section is built yet.** It is the design and its
reasoning, ahead of six migration batches (`0080`–`0085`), one pull request each.

### Answers Amber gave, which the design is built on

- **Who signs in:** staff only for now, *designed* so contractors can be given logins later
  without a rebuild — `contact_profile_id`, nullable, unique, is the whole provision.
- **Maintenance intake:** every channel — email to a mailbox, a web form, phone calls keyed
  in by staff, later a portal and the API — landing in one table with a recorded source.
- **Notification channels:** in-app, email via Microsoft 365, Teams and SMS, each person
  choosing in their own settings.
- **Not yet answered** (asked, dismissed): which external platforms first. The design
  assumes SharePoint and Outlook/Teams and says so.

### Amber's answers, 2 September — and what arrived with them

1. **Sync order:** SharePoint and Outlook/Teams first, **then Xero, then SiteBook.**
2. **Warranty:** 3 months after handover is standard; a job moves Completed → Closed at 12
   months (the archive rule 0045 already runs).
3. **Maintenance categories and SLAs:** SLAs editable in the app. The categories are not a
   hand-typed list — they **pull from the contractors assigned during construction**, so
   the app knows who did what on site and therefore who repairs it. Each job carries
   **purchase orders**, referenced there too. A contractor is on many jobs at once; a job has
   many contractors. → `record_parties` on construction process runs is the source of
   "who did the plumbing on 1042-01"; a maintenance item's default assignee is that party.
   Cost centres (Amber's 438-row `Cost_Centre.xlsx`, codes like 200.01 *Plumber - Underfloor*)
   are the trade vocabulary; products (`Products.xlsx`, 50 rows keyed cost-centre.item with a
   supplier, unit, GST and price valid-from) are the price book behind a purchase order.
   Both become tables in the Xero batch; the maintenance category references a cost centre.
4. **History readable by everyone**, for everything, except restricted fields. Built in
   `0080`; the only other rows withheld are internal comments and the two personal tables.
5. **Contacts created by users and above, with manager sign-off** → a contact or company
   carries `_approved_at` / `_approved_by`; unapproved ones are usable but flagged, and the
   manager's queue is a notification.
6. **Notification defaults:** assignments, mentions and maintenance arrivals immediate;
   overdue and at-risk in a 07:30 digest; **and any change to working drawings immediate.**
7. **SMS:** later. Nothing else waits on it.
8. **Contractor accept links without a login: yes, and logged** — the acceptance is an
   audited write with `activity_audit_origin = 'accept_link'` and the assignment id.
9. **Request number** `1042-01-M3`: yes. Job sequences are three digits (`1106-002`), so the
   number reads `1106-002-M3`.

Also asked: email, phone, address and ABN on contacts and companies (→ `contact_methods`,
`company_address_id`, `company_abn`); a `sitebook_id` property on jobs (a job-level text
property, and the value the SiteBook connector will treat as its external id); the audit
visible read-only to everyone (`0080`); tasks and sub-tasks built (`0081`).

**What arrived with the answers.** `Lofty_Jobs_Grouped_by_Project.xlsx` — 801 job rows
across 121 projects with old job numbers, agreement type, stage, address, client type,
client names, CMA, sales consultant, site manager: **this is the Phase B import data.**
`Project_Schedule_1.xlsx` — the 57 pre-construction steps with team, days and predecessors
by ID, which settles the seven predecessor names the workbook could not and gives the
durations Amber was asked for. `Sitebook_Schedule_09.07.xlsx` — per-job trade bookings and
per-trade supplier quotes: the contractor list, and the shape of purchase orders. SiteBook
screenshots — **project roles** (SS Site Supervisor, CM, CA, CMA, SET, AC, SEL, DFT, SCH, WM,
SA; personnel per project; a "show in contractor portal" flag) → `staff_roles` and
`record_staff_roles` join the parties batch; the **contract** step (start date, amount ex
and inc GST, build days, claim payment terms, delays) → the Xero batch. And a reading rule:
**"retail" as a job type means residential with an external client; "development" is
still residential.**

### Built so far

- **`0080` — the audit tables join the convention, and every table joins the audit.**
  The three renames; the allowlist gone from `log_activity_audit()`; the trigger on every
  non-log table (39 of 45) with behaviour.sql §39 asserting the set stays complete and
  every column stays `tablename_attribute`; four columns extracted at write time
  (`activity_audit_profile_id`, `_job_id`, `_project_id`, `_origin`, backfilled); the read
  policy Amber asked for; the login trigger rewritten for the names (behaviour §35 proves
  sign-in end to end). The Activity panel on a job or project now reads one indexed query
  across every table and names tasks, process runs, property values and comments. Proved:
  the RLS probes were watched failing against a permissive policy (3 locked-property rows
  and 7 preference rows visible) before they passed.

- **`0081` — tasks grow checklists and time; a job learns its SiteBook id.** `task_started_at`,
  `task_expected_days`, `task_at_risk_lead_days` (lead ≤ duration, CHECKed); `task_checklist_items`
  and `process_task_checklist_items`, copied by `instantiate_process_tasks()` along with expected
  days — the item 0078 left undone; `task_display` deriving due, at-risk and health the way
  `process_run_display` does; `stage_completion` counting milestones and open processes per
  record and stage; `sitebook_id` seeded as a job-level text property. The tasks panel shows
  sub-tasks, checklists, health as a word and the two numbers per task; the Setup → Processes
  list shows each process's duration and at-risk lead as a column.
- **`0082` — parties.** `classifications`, `party_roles`, `staff_roles` (SiteBook's eleven,
  seeded), `companies` (ABN eleven digits, address row), `contacts` (`contact_profile_id` for the
  future login), `contact_methods` (one primary per kind per party), the two classification
  junctions, `company_contacts` (job role lives here), `record_parties` (project / job / process
  run; contact and/or company; role; `engaged_by`; ended, never deleted), `record_staff_roles`;
  three display views; `guard_party_approval()` — users create unapproved, managers sign off
  and are stamped, a manager's own creation approves by existing. The Contacts screen (people
  with their company beside them, companies, detail with methods, classifications, employment,
  the records they are on, sign-off), parties on the job drawer and project page and inside
  each process run, SiteBook project roles on the project, and a Setup → Contacts section for
  the three lookups. The 21 August decision is superseded, with the reason kept.

- **`0083` — notifications: who hears what, on which channel, when.** `notification_types`
  (ten, seeded with Amber's defaults: assignments, mentions, working drawings and sign-off
  arrivals immediate; overdue and at-risk in the 07:30 digest), `notification_rules` (the
  "who": assignee, owning team, engaged teams, watchers, managers, the mentioned person, a
  named team or person, with `after_days` so overdue-5-days reaches the managers),
  `notification_preferences` (a table, not 0050's jsonb bag: one row per person, type and
  channel), `record_watchers`, `notifications` (the inbox, deduped per person and key),
  `notification_deliveries` (the outbox: in_app sent as written, email and Teams queued or
  held for the digest time, SMS written and waiting for a provider). `private.notify()` writes;
  `private.notification_recipients()` resolves audiences; `notify_scan()` runs every 15
  minutes by pg_cron over `task_display` and `process_run_display`; triggers fire on
  assignment, mention, stage move, a working-drawings run or property, and a party awaiting
  sign-off. The worker is `supabase/functions/deliver-notifications` (Microsoft Graph; claims
  with skip locked, groups per person, backs off, fails after five) with its deploy steps in
  its README — **not deployed from here**: it needs the Entra app registration and secrets.
  The bell reads the inbox; Settings has the per-type, per-channel matrix with digest time;
  Setup → Notifications edits types and rules and shows the outbox; Watch on jobs and projects.

- **`0084` — maintenance: one table for every way a request arrives.** `maintenance_settings`
  (one row, CHECKed to one: warranty months 3, hours to answer an offer 48, reminder the day
  before, accept link 14 days, the intake mailbox — null until Amber names it),
  `maintenance_categories` (a trade and its clock: the party role that did the work on site,
  SLA days, at-risk lead ≤ SLA, the Lofty team; **empty on purpose**), `maintenance_requests`
  (numbered `<job>-M<n>` by trigger from a high-water mark on the job; source email / phone /
  form / portal / api / staff; due from the category's SLA unless typed; closing refused while
  an item is open; a reply reopens), `maintenance_items` (one defect, one trade; done stamped),
  `maintenance_assignments` (an offer to a contractor: one open per item; the accept link's
  token stored only as a sha256, expiring, spent on use, and the use audited with origin
  `accept_link`), `maintenance_messages` (the thread: in, out, note; the outgoing rows are an
  outbox the same worker drains), `maintenance_message_secrets` (the token parked for the
  worker, service-role only, deleted on send — the RLS probe found the first version, where
  the caller-run offer could not write it, and a one-insert definer in `private` fixed it).
  `record_parties` and `document_links` gain `maintenance_request_id` in their arcs. Views:
  `job_warranty` (handover = the completed 7 - Handover run, end = handover + settings' months;
  nobody types it), `maintenance_request_display` (address, reporter and how to reach them,
  owner, category clock, warranty flag, counts, next visit, health no_sla · on_track · at_risk
  · overdue · complete · closed), `maintenance_item_display` (the current offer and, from the
  job's parties in the category's role, who did that trade originally — the default repairer).
  Automation: a new request notifies the Maintenance team; `offer_maintenance_item()` queues the
  email with the link and returns the token once; `maintenance_scan()` every 15 minutes —
  unanswered offers, at-risk and over-SLA requests (escalating to the managers after 3 days),
  visits tomorrow with the homeowner's reminder; `receive_maintenance_email()` matches inbound
  mail by number, then sender, else opens a request on the purchaser's job, and refuses the
  rest for a person. Three Edge Functions: `maintenance-accept` (the contractor's page, no
  login), `maintenance-inbound` (the mailbox's POST), and the delivery worker extended to the
  thread — **written, not deployed**. The app: a Maintenance tab (queue worst-first, the
  request with its items, offers, thread and close), Setup → Maintenance (settings, trades,
  the thread's outbox), a maintenance panel with the warranty line on every job drawer.
  Proved: behaviour §43 (warranty from the run; M1/M2 numbering; due, at-risk and health from
  the category; the scan does not repeat and does escalate; mail matched by sender; a
  stranger's mail refused), four constraint probes, eleven RLS probes — each watched failing.

### Naming, measured rather than asserted

All 79 migrations replayed into a local Postgres; every column in `public` checked against
`tablename_attribute` with foreign keys allowed to keep the parent's name. **Three tables
fail, all older than the convention:** `activity_audit` (10 columns: `id`, `changed_at`,
`old_row`…), `login_activity` (6), and `user_preferences`, whose prefix is the plural
(`user_preferences_payload`). Every other table conforms. `0080` renames them — cheap now,
because two repository methods read them and the audit function is being rebuilt anyway.

Redundancy kept on purpose, each maintained by a trigger and marked derived in the
dictionary: `profile_full_name` (generated), `address_consolidated`, the project stage read
from its jobs, `project_id` carried on a job's dependents. Redundancy removed: the
notification matrix that `0050` anticipated as a jsonb bag in `user_preferences` becomes a
`notification_preferences` table, because a preference the database cannot see is one it
cannot enforce or report on.

### External parties — the 21 August decision reversed, and why

*Entity model* above says `companies` / `contacts` / `record_parties` are "closed, not
deferred": Lofty is the developer, a purchaser is one name per house, a text property is
enough. That held for building and stops holding at handover. Maintenance has homeowners
who ring three times, a plumber who works through two companies, a fencing contractor who
is also the purchaser of another lot, and the question "who has Wandi Plumbing been sent to
this month" — none answerable from a text field. **Maintenance makes external parties
first-class.** The earlier section stays, superseded, so the next person sees both the
reason it was closed and the reason it reopened.

The model, all `tablename_attribute`:

| Table | The point |
|---|---|
| `classifications` | client, contractor, supplier, consultant, authority… a lookup, editable |
| `contacts` | a person; names, notes, `contact_profile_id`, `contact_source`; **no email or phone columns** |
| `companies` | an organisation; `company_abn` checked to 11 digits; `company_address_id` |
| `contact_methods` | email / phone / mobile rows, exclusive arc to contact or company; one primary per kind |
| `contact_classifications`, `company_classifications` | multi-valued: Sam Okafor is a client on 1042-03 and a contractor at Okafor Electrical |
| `company_contacts` | employment over time; **`company_contact_job_role` lives here**, because Bob Marsh's role at Wandi Plumbing differed from his role at Bob's Fencing |
| `party_roles` | purchaser, site supervisor, plumber, electrician, certifier, council… a lookup |
| `record_parties` | arc to project / job / process_run / maintenance_request; contact and/or company; `party_role_id`; `record_party_engaged_by_company_id` records a sub-contract as a fact about the engagement, not the company; started/ended; partial unique on (record, role, party) |

Read by every active user; create and edit at `user`; delete at `admin`, refused when
history exists in favour of `_ended_on`.

### Maintenance

One table for every way a request arrives (`maintenance_request_source`: email, form,
phone, portal, api). A **request** is the ticket; **items** are the defects inside it (one
email, three trades); **assignments** are offers to a contractor, one row each so a decline
keeps its history; **messages** are the thread (in/out, channel, Graph message id unique).
`maintenance_categories` carry the SLA days and the at-risk lead that the clock reads.
`maintenance_request_number` is `<job_id>-M<n>`, trigger-assigned like variation numbers
(Amber to confirm). The contractor answers a signed link (token hash stored, 14-day expiry),
not a login. Every automation — acknowledgement, SLA start, offer nudges at 48 h, day-before
reminders, SLA breach to the team's Teams channel, closing mail — is a `notification_delivery`
written by cron or trigger and sent by the worker; **nothing inside a trigger makes an HTTP
call.** The warranty flag needs the handover date, which is the completion of the
`7 - Handover` run, so `job_warranty_ends_on` is a view, not a column to remember.

### Tasks: a third level and time

`task_checklist_items` (and `process_task_checklist_items` on the template): tick boxes with
no assignee, due date or dependencies, because a task with a twelve-line checklist must not
be a task with twelve children in "my work". `tasks` gain `task_started_at`,
`task_expected_days`, `task_at_risk_lead_days` — the same two numbers a process has — so
instantiated checklist tasks finally get computed due dates and a task can be *at risk*, not
only overdue. `task_display` derives health the way `process_run_display` does;
`stage_completion` counts milestones per record and stage once, for the board, the drawer
and the report.

**0102 gives tasks a board of their own** — every task, across every job and project,
filtered and sorted the way the Jobs board is, opening on "my tasks" with a manager's team
on top and three slices of the due-date question (overdue, due today, due this week). Two
things `task_display` did not carry: `task_scheduled_date`, a plain nullable date beside
`task_due_date` for when the task is *planned* to be worked rather than when it is due —
it does not feed `task_health`, which stays anchored to the due date; and the record and
process a task sits on, resolved rather than left as bare keys — `job_display`'s own
address and stage for a job task, `projects`' name and stage for a project task, and
`process_runs` → `processes`' name for a task instantiated from a run, null for one somebody
typed in. The last of those is also how the board reads Amber's distinction between the two
kinds of task without a separate column: a resolved process name is a system-generated task,
and its absence is a person's own.

### Notifications: five tables, one outbox

`notification_types` (defaults per type) · `notification_rules` (audience: assignee, owning
team, engaged teams, watchers, managers, specific; `_after_days` for escalation; admins
edit) · `notification_preferences` (one row per person, type, channel; timing and digest
time) · `notifications` (one row per recipient; `notification_dedupe_key` unique with the
person so a daily scan writes a new row, never a repeat; `_read_at` is the bell) ·
`notification_deliveries` (per channel; queued → sending → sent | failed; attempts and
backoff; claimed with `for update skip locked`). Plus `record_watchers`. The scan is pg_cron
every 15 minutes over `task_display` and `process_run_display`; the worker is an Edge
Function woken by pg_net and by a database webhook for the immediate ones; email and Teams
go through Microsoft Graph from a Lofty mailbox; SMS waits on a provider (Amber's call).

### Audit: from a forensic log to a history anyone can read

Two problems with `activity_audit` today: the trigger fires on 12 tables and the function
ignores any table not in a hard-coded allowlist (a trap that has bitten twice), and it is
admin-only jsonb nobody can read on a job. `0080`: no allowlist — the function logs whatever
fires it, and a verify check asserts every `public` table but the audit tables carries the
trigger; four extracted columns (`activity_audit_profile_id`, `_job_id`, `_project_id`,
`_origin`) so a record's history is an index lookup; `record_changes(job_id)` /
`record_changes(project_id)` as security-definer functions in `private`, granted to
`authenticated` (`0011`), that check the caller may read the record and return one row per
changed column, labelled from the dictionary, redaction intact; an Activity tab merging
those with `activity_events` and `property_value_history`; a people-activity report for
admins from `login_activity`. Growth: perhaps fifty thousand rows a month at a hundred
users — indexed for that, with `activity_audit_at` left as the partition key for the month
when partitioning becomes worth it.

### Sync: the audit log is the change feed

`external_systems` · `external_links` (which SharePoint folder is 1042-01; unique per
system and external id; etag; last synced) · `sync_cursors` (one per system: the last
`activity_audit_id` sent — nothing copied into a second queue) · `sync_inbox` (idempotency
key unique, so a webhook delivered twice is processed once) · `sync_conflicts` (both sides
changed; a person picks). Loop guard: a worker's writes run with
`set local app.sync_origin = '<system>'`, the audit row records it, and that system's cursor
skips its own changes. A stable `api_v1` schema of views for outsiders; each integration is a
profile of kind *integration* with a permission level, so its writes are audited by name;
an MCP Edge Function whose tools call the repository with the caller's token. Realtime on
`jobs`, `tasks`, `process_runs`, `maintenance_requests`, `notifications`.

### A hundred people at once

Enforced by new verify checks: every policy wraps its function in `(select …)`; every
foreign key column is indexed; every `public` table has RLS and the audit trigger. New:
transaction-mode pooling; optimistic concurrency through the seam (every update carries the
`_updated_at` it saw; a mismatch is a 409 and "Ketan changed this 13 seconds ago", never a
silent overwrite); `statement_timeout` 10 s for `authenticated`; queues by `skip locked`;
`pg_stat_statements` reviewed monthly.

### Build order

`0080` naming sweep, audit everything, `record_changes`, Activity tab · `0081` checklists
and task time, `task_display`, `stage_completion` · `0082` parties and the Contacts screen ·
`0083` notifications with in-app and Graph email first · `0084` maintenance, staff entry
first, then mailbox, then form · `0085` sync, `api_v1`, MCP, SharePoint.

### What this leaves for Amber

1. Sync targets and order (assumed SharePoint, Outlook/Teams). 2. Warranty months after
handover. 3. Maintenance categories, SLA days and at-risk leads. 4. Who reads a record's
history — everyone who can read the record (recommended) or managers+. 5. Who creates
contacts — users+ (recommended) or managers+. 6. Which notification types are immediate and
which digest, and the digest time. 7. SMS provider. 8. Contractor accept links without a
login (recommended yes). 9. Request numbering, `1042-01-M3` or company-wide. With 1, 4 and 5
answered, `0080`–`0082` can be built at once.

## 2 September — Phase B: what the workbook forces

Amber, the morning the app went live: *"the jobs and projects that were attached earlier
have not been added."* The attachment is `Lofty_Jobs_Grouped_by_Project.xlsx`, found in her
Drive and checked in as `app/supabase/import/lofty-jobs-grouped-by-project-2026-08-31.xlsx`.
Its Method tab says how it was built: the old system's CERTIFICATION tab, 801 job rows,
grouped into 121 projects by site address (normalised, then a 90 % match only when the
street numbers agree), numbered 1001–1121 in order of first appearance, sequences `01, 02…`
inside each project in row order, and the old job number kept beside every row. Five rows
with no address became single-job projects; a Review tab lists them and eight near-misses
for a person to check.

So the two hard parts *Loading jobs before properties exist* named — reconstructing
projects, and sequencing by lot — have been done by Amber in the sheet. What is left is
staging the rows so nothing is lost, building the spine from them through the ordinary
tables and triggers, and being able to take it back out. `0086` is that, and `0087` is the
generated staging load. The design decisions, in the order they were forced:

- **Two jsonb layers on the staging row, not one.** The sheet row verbatim (194 columns,
  keyed by column letter because the headers repeat), and beside it what the generator read
  into it for the spine, with the original next to anything it changed. Phase C reads the
  first for property values; the load reads the second. A single "cleaned" document would
  have been the seed file that says one thing while the sheet says another.
- **The load goes through `jobs` and `projects` like any other insert.** `assign_job_sequence`
  pads the sheet's `02` to `002`, `bump_project_no_seq` follows an explicit project number,
  the audit logs every row with `activity_audit_origin = 'import'`, the stage guard and the
  address guard bite exactly as they would on a hand-made job. The import earns no exemptions
  from the rules that make the rest of the schema trustworthy.
- **The way back is an audited fact, not a heuristic.** `unimport_spine()` deletes the jobs
  its stamps name, the addresses it recorded, and only those projects whose INSERT the audit
  shows as origin `import` and that have no jobs left. A project somebody made by hand under
  a colliding number survives — proved in the migration by planting one.
- **Job sequence follows the sheet's sequence, not the row order.** The proof block loads
  two rows out of order and checks Lot 1 became `-001`.
- **The lot is read wherever the sheet put it.** `Lot 12` in the lot column is the
  address's lot number; `Res 3` is the address's second line (a residence is not a lot);
  project 1024's twenty rows carry the lot only in the site cell — `Res 1 , Lot 311 (portion
  of lot 232) Dankie Rd` — so it is read from there, with the bracketed parent lot removed
  first. Before that fix the generator skipped all twenty as "no number, no lot", which is
  the honest failure and the reason the report is printed before anything is written.
- **Postcode and council are lookups, never typed.** The postcode from the SA list (every
  workbook suburb has exactly one); the council from the same `saSuburbs.ts` the create form
  uses, none for Dernancourt because the app treats it as ambiguous. A suburb the list does
  not know is a skip, not a nearest match — one spelling, `Mitchel Park`, is an explicit alias
  recorded on the row.
- **`project_type` is `residential` throughout.** Amber's rule: *retail* means residential
  with an external client, *development* is residential. The client type (Retail 101,
  Developer 396, blank 304) is kept for Phase C — it is a party or a property, not the kind
  of project.
- **`OTR - Community Title = Yes` → `title_type community`; `No` → nothing.** Not community
  is not the same statement as torrens.

### What the load will not decide

Four parameters with no defaults; `import_spine()` refuses to run without them.

| | The sheet says | The decision |
| --- | --- | --- |
| **Project numbers** | 1001–1121 | The live database already holds 1002–1010 with 66 jobs, made by hand 25–31 Aug — and 1010 *is* the workbook's 1005 (30 Luprena Avenue, old numbers `1216 - D1…D3`). Keep the sheet's numbers and remove the nine, or shift the import to start at 1011? `p_project_base` takes either; the verify probe exercises the shift |
| **Owning team** | people — CMA Marie/Masha/Amy, sales consultants, site managers | `jobs.job_owning_team` is not null. Which team holds an imported job? `p_owning_team` |
| **Lifecycle stage** | nothing; the rows are the pre-construction sheet | `p_stage` — Pre-construction, presumably, but presumed is not decided |
| **Status words** | `Cancelling` 39 · `On Hold` 20 · `In Doubt` 5 · `-` or blank the rest | `p_status_map`, e.g. `{"cancelling": "cancelled", "on hold": "on_hold"}`; null leaves every job `on_track` and keeps the word in the row |

And one rule to agree: **seven old numbers are shared by several rows** (1288 ×3, 1382 ×3,
1399 ×3, 1516 ×2, 1528 ×3, 1597 ×9, 1920 ×2) and `jobs.job_number_old` is unique. The load
refuses them until `p_disambiguate_old_numbers => true`, which appends the sheet's lot label
— `1288 · Lot 1` — the way Amber's own hand-entered `1216 - D1` already reads. Two of the
seven (1516, 1920) are shared *across* projects, which reads like a data error in the source
rather than a shared site; they are flagged in the generator's report. And project 1025
labels two of its nine rows `Res 8` (1025-08 and 1025-09), so the lot label alone still
collided — found by the load refusing it, not by reading the sheet — and the rule falls back
to the job's own sequence (`1597 · job 009`) for that one row. Both are Amber's to look at in
the source; the staging row keeps what the sheet said either way.

### 3 September — the decisions, and what the load does with them

Amber, in two messages: *"project numbers can start at whatever you recommend. job numbers
number be three digits. people are users and users are in teams. if in doubt ask a question.
cancelling moves to lifecycle stage cancelled and onhold or in doubt leave in aqueiosint and
development. ignore the seven old job numbers"* — and, asked which named person's team owns
a job and what to do for the rows naming nobody: *"all jobs imported should just be
aquistion and development if in doubt. ignore ben.. if he isn't in the app assign to
aquisitions and development."*

| | Decided | In the load (`0088`) |
| --- | --- | --- |
| **Project numbers** | start where recommended, keep the nine hand-made projects | `p_project_base => 1011`; workbook 1001 → 1011, 1121 → 1131 |
| **Job numbers** | three digits | already the schema's rule (0075); the sheet's `02` becomes `002` |
| **Owning team** | *people are users and users are in teams; if in doubt A&D* | `private.import_team_for_person()`: the sales consultant the row names, matched by first name and surname initial to one active user in exactly one team → that team; anyone else, anyone in several teams, and the 209 rows naming nobody → Acquisition & Development. On the real rows: Paul (12) → Pre-construction Admin, Gary P (3) → Lofty General, 781 → A&D |
| **Stage** | everything in A&D; *cancelling* → Cancelled; on hold and in doubt stay | `p_stage_map => {"cancelling": "Cancelled"}`, else `p_stage`. 39 jobs land in Cancelled, 757 in A&D. The status word still becomes the job status through `p_status_map` (cancelled, on_hold); "in doubt" stays on_track with the word on its row |
| **Shared old numbers** | *ignore the seven* | `p_shared_old_numbers => 'omit'`: those jobs carry no old number; the staging row keeps it, so nothing is lost and a later decision can still label them |

The rule about people needed the lookup to be its own function so the verify suite could
ask it questions by name: `"Paul"` → Paul's team, `"paul ferka"` → the same, `"Michael B"`
→ the fallback, blank → the fallback. Olivia is in one team on the replay and three on the
live database; both answer Acquisition & Development, because that is her one team and also
the fallback — the one case where being in doubt costs nothing.

**Not decided by this, on purpose:** the CMAs (Marie, Masha, Amy) and the site managers
the sheet also names. They are not users of the app, so under Amber's rule they cannot own
a job; they are Phase C parties, read from the verbatim row when parties are imported.

### Proved, on the replay

`verify/behaviour.sql` §44 loads the real 801 rows with placeholder decisions and the base
shifted to 2001 (the replay already has a project 1106 from §6 — the collision the base is
for): 116 projects, 796 jobs, 5 skipped; every spine row has its job and the job carries the
row's old number; the workbook's `1004-02` (Lot 2) is `2004-002` with old number
`1288 · Lot 2`; 116 project inserts logged as `import`; 39 cancelled and 20 on hold as the
words say; then `unimport_spine()` removes 116 and 796 and clears every stamp. Rolled back —
the replay does not keep the workbook loaded.

### 3 September — the workbook holds seven of the nine hand-made projects

The staged rows went to the live database and match the replay exactly (801 rows,
md5 `851f4495f40477395daf0f9d8a536a7d`); `0088` applied there and its proof passed against
the real people table — Paul Ferka is in one team, so "Paul" resolves to it, and Olivia
Sinderberry is in three, so she falls to the fallback, which is the rule working, not
failing. Then the load stopped on its first insert and rolled back whole:

```
duplicate key value violates unique constraint "jobs_job_number_old_key"
DETAIL: Key (job_number_old)=(1216 - D3) already exists.
```

Base 1011 was chosen so the nine hand-made projects keep their numbers. What nobody
checked is whether the workbook *also* contains those sites. It contains seven of them —
1002, 1003, 1004, 1005, 1006, 1009 and 1010 are the same addresses as workbook projects
1120, 1121, 1119, 1118, 1117, 1112 and 1005. Two collide on the old job number
(`1216 - D1/D2/D3` and `2347/2348/2349`), which is the only reason the load stopped rather
than quietly making a second copy of all seven.

The unique key on `job_number_old` earned its place here: it is the one constraint that
noticed. Five of the seven carry no old number the app already holds, and nothing else in
the schema would have objected to the same house existing twice.

**Decided, 7 September — by closing the import rather than by choosing.** The app is the
record, for those seven and for everything else: no jobs or projects will ever be loaded
from a spreadsheet, so there is no second copy to reconcile. The three ways are still set
out in `app/supabase/import/README.md` → *What stopped the live load*, because they are the
clearest statement of what the collision was, and the same hazard now belongs to whoever
creates those jobs by hand. Worth knowing while
deciding: between them the seven hold two comments ("Job cancelled", "here is a test
update") and nothing else — no tasks, parties, documents, property values or process runs.

## 4 September — Tools: the template library, and the documents made from it

Amber asked for the report builder from `amberbeaumont/modules` as a **Tools** section
with a **Template Builder** tab, then set out what it actually has to do. The
requirements are the design, so they are worth quoting before the schema:

- any user and above creates a **report from an existing template**
- any user and above creates a **reusable section**; a manager approves it into the library
- any user and above creates a **template**; a manager approves it before it is in the library
- a user may **take a template and change it for one instance** — reword a letter, add or
  remove blocks — without that touching the template
- the builder brings in **properties from the job/project**
- the library holds templates and sections at **global, team and manager** level
- documents go **outside Lofty** by export or by a share link
- it is for **reports, internal documents and client documents** alike

### Two tables, because a template and a document are not the same thing

`report_templates` is the library: whole templates and reusable sections, one table with
a `kind` discriminator because they have the same shape, the same sign-off and the same
scope rules, and two tables would need every policy, trigger and constraint written twice.

`report_documents` is what somebody made. **This is the table the fourth requirement
forces.** If "change the wording for this letter" wrote back to the template, the next
person to use it would inherit one letter's wording — and inherit it silently, because
the template would still be called what it was called. One row per thing sent is the only
shape where "change it for this one" and "change it for everyone" are different acts.

A document names the template it came from (`SET NULL` on delete — a letter that has gone
to a client does not vanish because somebody retired its template) and, optionally, the
job or project it is about (`CASCADE` — a document about a job that no longer exists is
about nothing).

### The sign-off is the gate, not the permission floor

The write floor is `user` throughout, exactly as asked. What decides whether something is
in the library is `report_template_approved_at`, stamped by
`guard_report_template_approval()` from the session — modelled on `guard_party_approval()`
(0082) down to the error code, so this schema has one approval idiom rather than two that
drift. A manager writing a template approves it by existing; everybody else's waits.

Until it is approved it is the author's own draft and **literally nobody else can see it**
— that is the SELECT policy, not the screen. Three things the policies enforce that a
floor cannot:

| | |
|---|---|
| an unapproved draft | visible only to its author |
| an **approved** entry | no longer its author's to edit — it belongs to the library |
| a manager-scoped entry | not readable below manager |

Worth recording because it was found by experiment rather than designed: **two independent
mechanisms** stop a user approving their own template. Disabling the trigger's refusal
alone did not do it, because the UPDATE policy's `WITH CHECK` then rejects the new row —
`approved_at` is no longer null and they are not a manager. Both had to be widened before
`verify/rls.sql` reported it. Neither is redundant: the trigger also governs what a
*manager's* write may say, which a row-level policy cannot see.

### Properties reach a document through the record it is about

`report_documents.job_id` / `project_id` is what the **Record properties** block resolves
against when it is set to "the record this document is about" — which is what lets one
template render 1042-001's properties on 1042-001 and 1043-002's on 1043-002 with nobody
editing it.

Which properties come back is RLS's answer, not the block's: a restricted property the
reader may not see never arrives in the context, so it cannot be put into a document by
choosing it in a settings panel. That is the reason the block reads the already-loaded
`property_values` rather than asking for a record's values by id.

### Sections are resolved, not pasted

A section is inserted by a **block** that names it and expands it at render time, rather
than by copying its widgets into the layout. So correcting a section corrects every
template using it — which is what "reusable" has to mean, or the second requirement buys
nothing over copy and paste. The cost is a recursion risk: a section containing a section
block pointing at itself is two clicks to build, so the expander carries a depth counter.
Without it the stack blows and the reader gets "this block failed to render".

### 7 September — snippets are a third kind, and the reason is *when*, not *what* (`0098`)

Amber: *"i also want to be able to save text snippets and reusue them"*, in the same
breath as asking for property placeholders in prose. The two go together — once a letter
can carry `{{site_start_date}}`, the paragraph around it is worth keeping too.

**The tempting answer is "that is what a section is", and it is wrong.** A section and a
snippet differ in *when* they are read, and the section above is the reason that matters:

| | read | so editing it later |
|---|---|---|
| **section** | every time the document is opened | changes every template using it |
| **snippet** | once, at the caret, when you insert it | changes nothing already written |

"Please find attached our progress report for" is wording somebody adjusts per client. If
that edit rewrote it in forty other letters nobody would dare touch it. Storing snippets as
sections and copying them anyway would work right up until the first person opened one
expecting the behaviour the kind promises.

So it is a third value on `report_template_kind` — which is the discriminator earning its
keep. The whole migration is one CHECK: the `(kind, scope)` index already covers it, the
per-kind uniqueness already lets a template, a section and a snippet share a name, and the
audit trigger is on the table rather than the kind.

**The part that had to be checked rather than assumed:** none of the four policies on
`report_templates` look at `kind`. That is what makes a one-line migration safe — a snippet
inherits the visibility bands, the sign-off and the delete rules already proved, rather
than arriving unguarded. The assumption is invisible in the diff that depends on it, so
`verify/rls.sql` now asserts it directly: add a policy that branches on kind and the check
reports. Watched both ways.

The wording itself lives in `report_template_layout` as a single `text` widget, so the same
`layout_has_widgets` CHECK guards it and the same builder edits it. `snippetHtml` /
`snippetLayout` in `types.ts` are the only code that knows that, because every way of
reaching into `widgets[0].options.html` by hand returns `undefined` rather than throwing —
a snippet saved through a typo'd path would be a menu entry that inserts nothing, silently.

A **Snippet Library** lane sits beside the template and section lanes. Not decoration: a
user's snippet needs a manager to sign it off, and without a screen for that the feature
would save a snippet and then hide it forever.

### Share links: the columns exist and nothing writes them

`report_document_share_token`, its **mandatory** expiry (a link that never ends is one
nobody revokes, and the pair check makes "forever" unwritable) and a password hash.

They are inert. Reading by token cannot go through RLS — serving a share link from the
browser would mean granting `anon` SELECT on `report_documents`, which exposes every
other document in it to anybody holding any link. It needs a server endpoint with the
service role, and `app/supabase/functions/report-share/` is that endpoint, written and
**not deployed**, with its allowed-origin list and its viewer context deliberately empty
so an accidental deploy achieves nothing.

**This is the one requirement not delivered live**, and the two questions it waits on are
Lofty's: which origins may open a link, and what a person outside Lofty may see of a job.

### 4 September, later — the second question answers itself (0095)

Amber's screenshots arrived and named the audience: *"Create a shareable link so clients
or teammates can view this report without logging in."* A client. Somebody with no account
at all.

The question above — *what may a person outside Lofty see of a job* — turns out to be the
wrong question, and answering it as asked is what produces the dangerous endpoint. To
answer it you build `loadViewerContext()`: a function holding the service role, re-querying
jobs and properties and people with RLS switched off, filtering each one to the record the
document is about. Every query in it is one forgotten `.eq()` from returning the whole book
of work to anybody with a link. The endpoint's own comment said as much before it was
written.

**So the link does not resolve anything.** When the author clicks Share, the document is
compiled once — in their browser, under their session, through their RLS — and the
compiled model is stored in `report_document_share_snapshot`. The endpoint returns it.

| | live resolution | snapshot |
| --- | --- | --- |
| What the endpoint queries | jobs, properties, people, teams, with RLS off | one row, by token |
| Where a leak could come from | any query that forgets its filter | nowhere: there is no query |
| What strips restricted data | a second copy of the permission rules, in TypeScript | the author's own RLS, already applied |
| What the client sees in March | whatever is true in March | what was sent in September |
| What the author saw when sending | approximately this | exactly this |

The cost is real and is stated in three places — the Share panel, the shared page, and
here: **a shared link does not update.** Re-share to send newer numbers. That is what
sending a document has always meant, and it is precisely the behaviour of the PDF that
would otherwise have been attached to the same email.

Three things fell out of it that were not the point but are worth keeping:

- **Column privileges are not row privileges.** RLS chooses rows and says nothing about
  columns, so any signed-in session could read the password hash and the snapshot off a
  row it could already see. `0095` revokes `select` on the table and re-grants an explicit
  column list — an inversion, because a column-level `revoke` does not subtract from a
  table-level `grant`, and the first version of it was a silent no-op. A column added later
  is now invisible until somebody grants it, which is the failure worth having.
- **The verify harness was more permissive than production.** It stood in for Supabase's
  grants with `grant … on all tables` in `rls.sql`, running *after* the migrations — so it
  re-granted what `0095` had just revoked, and the probe read both columns straight back.
  It now uses `alter default privileges` in the shim, the way Supabase does, so the grant
  lands as each table is created. A harness looser than production does not merely miss a
  bug; it manufactures a passing result for one.
- **Where a password is hashed changes what it protects.** The dictionary previously said
  hashing in the browser protects nothing. That is true at *verification* time, where the
  hash becomes the password. At *creation* time it is the opposite: the plaintext never
  leaves the tab that typed it. So the browser derives (PBKDF2-SHA256, 210k rounds) and the
  endpoint verifies from the plaintext the viewer sends. `npm run check:share-password`
  imports both real implementations and asserts they agree.

What was left was not a decision: the endpoint had to be **deployed** and given
`SHARE_ALLOWED_ORIGINS`. **Both are done** — deployed 4 September, and the secret set some
PRs later. Confirmed against the live endpoint on 10 September: `hub.lofty.au` is allowed and
`example.com` is refused with 403. This paragraph said the work was outstanding for longer
than it was, because a secret set outside the repository is invisible to it.

## 4 September — Settings is the managers', Admin is the administrators'

Amber, in two sentences that move one line:

> Change the sidebar "Setup" to "settings" and grant permissions for managers and above to
> view this page. The purpose of "settings" is to allow managers and above update
> properties, processes, contact settings, maintenance tabs, SLAs and automations.

> Move "Admin" to the top navigation bar and replace with a cog icon. This appears when an
> admin or super admin login and allows them to manage users, teams, roadmap/updates
> pages, data dictionary, wiring, changelog/bugs and everything else in setup that isn't in
> the manager settings.

### The cut is by who asks, and it is the third one

Admin and Setup have been split twice before, both times **by subject**: Admin was people,
Setup was configuration. That is why the permission matrix moved from Admin to Setup
(a permission model is configuration) and the dictionary and wiring moved from the top-level
nav into Setup (they were configuration sitting at the rank of the work).

Read by subject, both cuts were right. Read by **who opens the screen**, both were wrong:

| | Settings — manager and above | Admin — admin and above |
|---|---|---|
| Properties | ✅ | |
| Processes | ✅ | |
| Contacts (classifications, roles) | ✅ | |
| Maintenance (settings, categories) | ✅ | |
| Automations (stage SLAs, notification rules) | ✅ | |
| Users, Teams | | ✅ |
| Permissions | | ✅ |
| Dictionary, Wiring | | ✅ |
| Bugs, Ideas | | ✅ |
| Roadmap, Changelog | | ✅ |

A ten-tab strip became five and nine, and neither strip is a place two different jobs meet
any more. The manager configuring a maintenance category and the admin deactivating a
person were sharing a tab bar because both were "setup".

Roadmap and Changelog on Admin are the **same components** Updates renders, imported rather
than copied. Updates stays in the footer for everybody — the whole point of `0060` was that
the queue is readable by the people who filed it — and the planning and publishing controls
inside it were already `admin` and `superadmin`. What the cog adds is one door, not a second
implementation that can disagree about what phase 2 contains.

### `0096` — the two policies that would have made the rename a lie

Properties, processes, contacts and maintenance already took a manager's write (`0077`,
`0078`, `0082`, `0084`). Two things on Amber's list did not, and shipping the rename without
them would have been the worst kind of half-change: a screen a manager may open, with
controls a manager may use, over tables that refuse them.

**The SLAs. This reverses half of `0047`, on purpose.** `0047` said outright: *"Editing stays
superadmin's, per 0029's policy on pipeline_stages: the SLA is part of what the stages
ARE."* That reasoning still holds for what a stage **is** — its name, its position, whether
it is external, which team owns it. It does not hold for how long the stage should take,
which is the number Amber has just handed to managers.

RLS cannot express a column rule, so the split takes `0060`'s shape — a policy that lets a
manager UPDATE the row, and a trigger that refuses every column but the SLA pair below
superadmin:

```sql
create policy "managers set stage slas" on pipeline_stages
  for update to authenticated
  using ((select current_permission()) >= 'manager')
  with check ((select current_permission()) >= 'manager');
```

`guard_stage_shape_change()` is the other half. Insert and delete are untouched: a manager
still cannot add or remove a stage, which is the line `0029` drew and the part of `0047`
that survives.

**The notification rules.** `notification_types` and `notification_rules` were admin's
(`0083`) and are now manager's. They sit on Settings → Automations because *"overdue 5 days
→ the managers"* is an automation, and a manager who can set the SLA that decides when
overdue starts but not who hears about it has half a feature.

Nothing moved the other way. The permission model, the dictionary's status ladder, the
wiring, users and teams were already at the level Admin needs.

### The check that asserted the opposite

`verify/rls.sql` probe 4 in the manager block read **"expected days is editable, but not
below superadmin"** and passed. That probe is now the reverse claim, and two more sit beside
it: a manager renaming a stage must still be refused (the trigger, which only shows at
manager — exactly as `0060`'s stage guard only shows at admin), and a manager writing a
notification rule must go through. All three were watched failing before they were kept:
the trigger dropped lets the rename through, the policy dropped stops the SLA, and the
notification policy dropped stops the rule.

### What the name costs

The app now has **Settings** in the sidebar (`/setup`) and **User settings** in the menu
under your own name (`/settings`), and the second label is the only thing holding them
apart. `AppShell` used to argue the other way — *"the app has a Setup screen now, and
'Settings' beside it was two words for two unrelated things"* — and that comment is now a
record of a reversed decision rather than a rule.

The paths did not swap. `/settings` is the personal screen and has been for weeks; swapping
them would break every bookmark and Teams link in the company to save a word in a URL
nobody reads. So the rename is a label and a permission, not an address.

### Answered by Amber, 7 September — all three

1. **Should a manager see the Bugs and Ideas triage tabs?** **No.** *"Only admins and super
   admin get to see the bug manager."* Already how it behaved, so no code changed — but the
   half that is easy to get backwards is now written down beside the tabs: **filing is not
   triage.** `ReportForm` carries no permission gate, so anybody with app access, viewers
   included, can send one.
2. **Roadmap and Changelog appear in two places.** **Removed from Admin.** *"there is
   duplication on footer and other page."* The cog links to `/updates`, and
   `/admin/roadmap` and `/admin/changelog` forward there rather than falling through to the
   section guard — those URLs were shareable, so some are in bookmarks. Being one component
   underneath was a fact about the code, not about the experience.
3. **Notification *types* went down to manager with the *rules*.** **Types come back to
   admin; the rules stay a manager's** — `0097`.

#### `0097` — and why it is three policies, not one

The obvious change is to swap `0096`'s `for all … >= 'manager'` on `notification_types` for
`for all … >= 'admin'`. **That would have broken Settings → Automations for every manager**,
and the reason is worth keeping: `for all` covers UPDATE, and a manager's only type write
today *is* an update — `saveNotificationType()` sets default channels, default timing and
the active flag on an existing row. Amber was asked about **creating** a type and answered
about creating a type, so the policy splits by command:

| Command | Who | Why |
| --- | --- | --- |
| `insert` | **admin** | Inventing a kind of notification is defining the vocabulary |
| `delete` | **admin** | Gating creation while leaving destruction open makes no sense |
| `update` | manager | Changing an existing type's defaults is configuring it |
| `select` | every active user | `0083`, untouched — what will happen to you is not a secret |

A type is a row that `notification_rules`, `notification_preferences`, `notifications` and
`notification_deliveries` all point at by foreign key, which is what puts it on the "what
the app IS" side of the line Admin and Settings were split on. `0096` is not wrong and is
not being corrected: it bundled two tables under one argument, and only one of them was
load-bearing for that argument. **The bundling is what `0097` undoes.**

**One edge deliberately not assumed.** Deactivating a type through that UPDATE stays a
manager's, even though `notification_type_is_active` is close to "does this exist". Making
it admin's needs a column guard like `0096`'s `guard_stage_shape_change()`, not a policy,
and nobody asked for it.

**No app change accompanies it.** There is no create-a-type or delete-a-type control and no
repository method for either — today a type is only ever created by a migration. `0097`
tightens the database boundary so that stays true when somebody builds the screen.

Proved in `verify/rls.sql`, manager block, probes 6–8, each watched failing first: a manager
writes a rule (6), is refused a new type (7), and still sets an existing type's defaults
(8). Probe 8 is the one that catches the `for all` mistake. The migration's own structural
block additionally refuses to apply if a superseded policy is still attached — permissive
policies OR together, so leaving `0096`'s in place would have made `0097` look applied while
changing nothing.

### 7 September — images a document carries (`0100`)

Amber: *"upload to public bucket that stores in the document only"*. The Image block took
a URL and nothing else, so putting a site photo in a report meant hosting it first.

**Public, and asked for after the trade was put.** The alternative offered was a signed URL
written into the share snapshot with the same expiry as the link, so revoking a shared
document revoked its pictures; Claude recommended it, because `0095` had already decided a
shared document is a snapshot with an end date. Amber chose the public bucket, and the
consequence is recorded rather than buried: **an image in a shared document stays fetchable
at its URL after the link expires.** What that costs is bounded by what goes in — a logo, a
site photo, a diagram, things somebody is deliberately putting in front of a client. It is
not a hole in RLS; nothing derived from a job, a property or a person lives in the bucket.
The way back, if it is revisited, is two moves: flip `public` to false, and sign each image
URL in `compileForShare` with the link's expiry. The layout stores a URL either way.

**No attachments table, which is what "stores in the document only" means.** `0062` needed
`feedback_attachments` because storage.objects has no column saying which report a
screenshot belongs to. A report image does not have that problem: the block holds the URL
and the block is in `report_document_layout`. A row here as well would be a second record
of the same fact, disagreeing the first time somebody deleted the block. The cost accepted
is that an image whose block was deleted is orphaned in the bucket — housekeeping, not
correctness.

The object path (`documents/<id>/…`, `library/<id>/…`) is a convenience for auditing and
prefix-listing, **not** a source of truth. Nothing reads it to decide anything. Uploading is
floored at `user` rather than at the specific document's editability: every user can create
a document anyway, so the cross-table lookup would buy a slower upload and a policy to
rewrite whenever the document rules move. The path *shape* is enforced, so the bucket cannot
become a flat dumping ground — matched with a regex and not a cast, because `'x'::uuid`
raises inside a policy and an error is not a refusal.

### 7 September — what the security advisor still says, and why most of it stays (`0099`)

`get_advisors` was run against the live project after `0098`. Five findings; **one was
fixed, and the rest are recorded here so nobody re-investigates them next month.**

`0099` — **fixed.** `function_search_path_mutable` on `private.audit_exempt_tables()` and
`public.stage_sla_columns()`. Both are now pinned to `pg_catalog, pg_temp`. Worth being
honest about the size of it: the danger this warning usually names is a SECURITY DEFINER
function resolving an unqualified table name against a caller-controlled path, and neither
of these is that — neither is DEFINER, and each is one `select array[…]` of string
literals. It is hygiene. The reason to do it anyway is that an advisor carrying permanent
warnings is an advisor nobody reads, and the next real finding lands in the same list.

`pg_graphql_anon_table_exposed` (93) and `pg_graphql_authenticated_table_exposed` (94) —
**left, and checked rather than assumed.** These say the tables are visible in the GraphQL
schema because those roles hold `SELECT`. Visible is not readable: every one of the 93 has
RLS on with no policy reaching `anon`, and `set role anon; select count(*)` returns **0**
from `profiles`, `teams`, `addresses` and `activity_audit`. `report_documents` is stronger
still — `0095` revoked the grant outright, so anon cannot even reach it to be refused. What
IS exposed is the shape: table and column names are discoverable by introspection. Whether
that matters is a decision, and it is in `docs/open-questions.md` rather than guessed at.
*(Decided the same evening — `0101`, below.)*

`authenticated_security_definer_function_executable` (4) — **left, and correct as it is.**
`current_permission()`, `current_profile_id()`, `is_active_user()` and `is_signed_in_staff()`
are the RLS helpers. They are SECURITY DEFINER on purpose: they read `profiles`, which RLS
on `profiles` would otherwise block, and that would deadlock the policies that call them.
Reachable over `/rest/v1/rpc/`, each tells a caller a fact about *themselves* — their own
permission, their own id. There is nothing there to leak.

`rls_enabled_no_policy` on `maintenance_message_secrets` (INFO) — **left, and deliberate.**
RLS on with no policy is deny-all, which is exactly what a parked reply token should be.
`verify/rls.sql` already proves it: *"the parked token is invisible to a user"*.

`auth_leaked_password_protection` — **not decided.** Turning it on is a dashboard setting
that changes what happens to a real person choosing a password, so it is a question rather
than a change Claude makes on its own.

### 7 September, evening — anon sees no shape (`0101`)

Amber, asked the question the section above left open: **"yes"**. `0101` revokes every
table privilege from `anon` across `public` — `all tables` covers the 21 views as well as the
74 tables — and revokes the default privilege too, so the next `create table` does not
quietly put one object back on the map. Sequences are left alone: the advisor does not name
them, and `USAGE` on a sequence `anon` cannot insert into is not a capability.

Two things are worth keeping straight about it:

- **It closes discoverability, not a read.** RLS was already refusing `anon` everywhere,
  and the proof had watched it refuse. What changes is the *kind* of refusal — a query as
  `anon` now fails on privilege before RLS gets a say — and that is what removes the table
  from the schema pg_graphql builds for that role. `verify/rls.sql` probes exactly that
  difference: a table that answers `anon` with zero rows is now a FAIL, because zero rows
  means it is back in the GraphQL schema.
- **Nothing runs as `anon`.** Every app read and write is a signed-in session; the one thing
  a person with no account reaches (`/shared/:token`) is an edge function holding the
  service role, as are the other three functions. The `postgres` role is what creates every
  table here, so revoking *its* default is the one that matters; Supabase's parallel default
  under `supabase_admin` applies only to tables that role creates, and no migration is one.

`pg_graphql_anon_table_exposed` should read 0 on the next `get_advisors` run;
`pg_graphql_authenticated_table_exposed` (94) is unchanged and correct — signed-in staff are
meant to see the schema they query.

### 10 September — a document can be a URL (`0103`)

*A readable version with diagrams is published at
<https://claude.ai/code/artifact/fe4d0004-6c9d-4fe7-96ee-41b9f773c066> — show that one to
people; edit this file.*

Amber: *"when adding a document I need to be able to save it as a url in sharepoint
(integration coming) but for now I need to be able to add and delete them"*.

**This is one column, and the first draft of it was a whole table.** That draft —
`document_links`, with a title, a URL and a job or project to hang it off — got as far as
being written before somebody read `0032`, which had already built exactly that table under
exactly that name, three months earlier, and for a better reason. The near-miss is recorded
rather than tidied away, because the mistake was cheap to make and would have been expensive
to keep: two tables called `document_links`, one of them a subset of the other.

`0032`'s pair is the right shape:

| | |
| --- | --- |
| `documents` | **The file, held once.** Named once, categorised once, versioned once. |
| `document_links` | **Where it is attached.** One row per record it hangs off. |

The exclusive arc is on the LINK rather than on the document, because the same soil report
genuinely belongs to a project *and* to every job on it. That property is stronger for a
SharePoint link than for an upload: the contract for project 1042 is one document in one
place, and it is relevant to the project and to the one job it governs. A per-record table
would have made those two rows two documents.

So `0103` adds `documents.document_url`, and everything `0032` already built — the links,
the nine categories, the supersedes chain, the RLS, the audit triggers — works on it
unchanged.

**`documents` now means one of three things, and the third was already there.**

| `storage_path` | `url` | What it is |
| --- | --- | --- |
| set | null | An upload. Lofty holds the bytes. (`0032`) |
| null | set | A pointer. The bytes are in SharePoint. (`0103`) |
| null | null | Expected, not arrived — *"the signed contract"* as an outstanding item. (`0032`) |

Both set is allowed and deliberately not constrained against: the coming integration is the
case for it, and a check refusing it would have to be dropped the week that lands.

**The URL is unique, and the check on it is loose.** `^https://\S+$` and nothing tighter,
the same shape as `0040`'s folder check — SharePoint URLs come in at least three forms
(tenant paths, personal sites, shortened `:b:/s/` share links) and a pattern strict enough
to be useful about one of them refuses the other two. What it catches is what people
actually paste by accident: a Windows path off the file server. The uniqueness is the half
that carries a rule rather than a validation — **one SharePoint address is one document** —
which is what makes filing the same contract against a project and against its job a second
*attachment* rather than a second copy, and it is the premise the whole "held once" design
rests on.

**A pointer with no links is reaped, and an upload is not.** `0032` made detaching ordinary
work and deleting a document admin-only, which is right for a file: the link goes, the file
stays. A pointer is different — it has no bytes, it is only ever reachable through its
links, and once the last one goes it is a row nobody below admin can see or remove. So an
`after delete` trigger on `document_links` deletes the document when nothing points at it
*and* `document_storage_path is null`.

Three things about that are worth having written down:

- **The guard is the storage path, not the URL.** Both would cover the SharePoint case; the
  storage test also covers the third state above, which is exactly as unreachable once
  detached. And it is the safe half of the pair — it is the presence of a stored object,
  not the absence of a URL, that makes deleting the row lose something.
- **It is a trigger because the app cannot do it.** `admins delete documents` means an
  ordinary user's cleanup is refused *silently* — RLS returns "no rows" rather than an
  error — so the app would report a success it had not achieved. Widening that policy was
  the alternative and it is worse: it would let a user delete an uploaded file's row and
  orphan the object in the bucket.
- **It is `after delete`, and it was watched failing as `before`.** As a BEFORE trigger the
  link being deleted is still visible to the `not exists`, so it deletes nothing, ever —
  a trigger that fires, succeeds and does nothing.

**Nothing about who may open the file changed, and the app does not pretend otherwise.**
This schema stores an address; SharePoint governs the bytes, under Microsoft's own
permissions. Somebody who opens a link they should not have gets SharePoint's refusal, not
the document. RLS here protects the knowledge that the document exists and where it is —
which is worth protecting, and is not the same thing. Filing a link is not a way of sharing
a file, and the panel says so above the field.

**What the integration will need, and why none of it is here.** A sync will want a drive id,
an item id, an eTag, a synced-at, probably a webhook subscription. None of that has been
scoped, and guessing at it now gives either a row of nulls nothing writes or a shape the
integration has to work around. Adding those columns later is `alter table add column`.
Removing invented ones after something reads them is not.

### 10 September — a document is a draft until it is published (`0104`)

Amber: *"they need to be able to edit it in the app and pull in information, but it should
be linked in sharepoint.. until it is published… have a DRAFT watermark across it while
editable and saved to the job. and as soon as it is ready to share or publish it, you
choose the sharepoint location to save it to (which should default to job file) … if
editing it in the app it reverts to draft"*.

Three columns on `report_documents` — `published_at`, `published_by`, `published_url` —
and a trigger.

**There is no `status` column, and that is the decision.** `check (status in ('draft',
'published'))` was the obvious shape and it records the conclusion rather than the fact.
"Published" would then be a word somebody sets, and the first write that forgot to set it
back would leave a draft wearing a published label — which is precisely what the watermark
exists to prevent, and it would be invisible. `published_at is not null` cannot drift,
because the trigger that sets it is the trigger that clears it.

**Editing reverts it, and the database does that rather than the screen.** Four places
write a layout today — the builder's autosave, the record panel, the importer, the share
compile — and an unknown number tomorrow. `0052`'s undo already taught this repo what a
per-caller opt-in is worth: *"a per-screen opt-in is a promise every future screen has to
remember to keep, and the first one did not"*. So `guard_report_document_publication()`
watches `report_document_layout` and `report_document_title`, and clears the publication in
the same statement, with no cooperation from the caller.

What deliberately does **not** count as an edit: sharing, moving the document to another
record, and the audit quartet. Nothing a reader would see has changed, and reverting on a
share would take the publication back at the moment it is most needed.

**The URL survives the revert.** Amber: *"to download it again you need to add the link
again"* — so `published_at` goes and re-publishing is an act somebody performs. The address
stays, because a document re-published after an edit almost always goes back to the same
place, and sending somebody into SharePoint to find that address again is how a document
ends up filed somewhere new. That gives a third readable state, which the app shows as its
own chip: **a URL with no `published_at` means what is in SharePoint is out of date.**

Written as an implication rather than an equivalence for exactly that reason — published
requires a URL, a URL does not require a publication.

**`0095`'s column grant bit, on schedule.** That migration took the table-level SELECT off
`report_documents` so the share snapshot and password hash could not be read back, and said
what it would cost: *"a column added later is NOT readable until somebody adds it here.
That is the failure mode worth having — a visible one, on the day the column is added."*
This was that day. `verify/rls.sql` stopped with `permission denied for table
report_documents` the first time it read the new columns as `authenticated`; without the
three-line grant in `0104` the app's own document query fails for every user on the first
page load. The prediction was accurate and the check was where it said it would be.

**The watermark is not schema, but it is the reason for the schema.** It reaches four
renderers — screen, Print/Save PDF, the `.html` download and the `.docx` — because a
document watermarked in three of them is worse than one watermarked in none, since somebody
will send the fourth. `npm run check:watermark` asserts all four, and asserts the negative:
a published document comes out clean.

Two limits are worth writing down rather than discovering. The screen and print mark is a
fixed tiled layer, which Chromium repeats on every printed page and **Firefox paints on the
first page only**. And Word gets a spaced stamp in the page header rather than the diagonal
ghost behind the text, because the `docx` package exposes no VML shape and hand-writing XML
into somebody else's document part breaks on their next release.

### 10 September — a document can be published to the job (`0106`)

*Numbered `0105` first, and renumbered — PR #69 had already claimed that number and applied
it to the live database. **The second number collision in two days**, both caught by
looking at `supabase_migrations.schema_migrations` rather than at the repository: a branch
cannot see a number another open branch has taken, and the live table is the only place
both are visible. Worth checking there before naming a migration, not after writing one.*

Amber, once `0104` had shipped: *"until Documents are integrated to Sharepoint, please
allow the option of saving to Job in the system and/or downloading it and adding a link to
that document file"*.

`0104` made publishing require a SharePoint address, which was right for the case it was
built for and wrong as the only case. SharePoint is not integrated, so "publish" meant *go
and save this somewhere else first, then come back and paste where you put it* — and for
any job whose folder has not been set up yet, that is a door with no handle.

So there are now **two ways to be published, and "and/or" is literal**:

| `published_url` | `published_document_id` | What it means |
| --- | --- | --- |
| set | null | It went to SharePoint. Somebody put it there and wrote down where. |
| null | set | It is saved on the job, in Lofty's own storage. |
| set | set | Both, and neither makes the other a lie: the copy on the job is what was sent, the address is where the version people edit lives. |
| null | null | Refused whenever `published_at` is set. That is the half of `0104`'s rule that had to keep biting. |

The constraint `report_documents_published_names_where` is **dropped and recreated** rather
than added beside, because as `0104` wrote it, it refuses the new case outright and two
checks would be unsatisfiable together.

**The file goes in `documents`, which is where files already go.** A pointer from
`report_documents` into `0032`'s table, not a second place to keep files — and that choice
is what puts the published copy in the record's own Documents list beside the contract and
the survey, rather than somewhere only this table knows about. The bytes go in a new
private `job-documents` bucket, read by signed URL. The opposite call to `0100`'s public
`report-images`, and deliberately: a picture inside a report is decoration a client is
being sent anyway, and a published document is the work product.

**`on delete set null` was written first, and it does not work.** This is worth keeping
rather than tidying away, because it looked right and reviewed clean. The FK reads as *the
pointer goes, the publication survives*; what actually happens is that the nulling is an
UPDATE, the UPDATE leaves a published row naming neither a file nor a link, and the check
refuses it — so the DELETE fails. Watched on the replay database:

```
DELETE REFUSED: 23514 / new row for relation "report_documents"
violates check constraint "report_documents_published_names_where"
```

An admin reaping a file got a message about a constraint they have never heard of and no
way to act on it. The fix is not to weaken the check but to answer the question the FK was
ducking: **what is a published document whose published file has been deleted?** It is a
draft. That is `0104`'s own rule applied honestly — the state is derived from a fact
precisely so it cannot say "published" about something that is not.
`reap_publication_of_deleted_document()` clears the publication when the file it names goes
and no URL is left, and leaves it alone when a URL is, because then the document really did
go somewhere and still is there.

**What was watched failing**, all six, before any of it was trusted:

| Broken on purpose | What reported |
| --- | --- |
| The widened check replaced with `check (true)` | the migration's own probe: *a published document was allowed to name neither a file nor a link* |
| `0104`'s narrow check left in place | the new case refused — `published_names_where` on the file-only publish |
| The reap trigger's `published_url is null` carve-out removed | *deleting the stored copy un-published a document that also went to SharePoint* |
| The reap trigger not created at all | the original bug, reproduced through the app's real path: `verify/rls.sql` reporting *an admin could not delete a published file — 23514* |
| `0104`'s guard made to clear the file pointer on a revert | *the revert threw away the file the document was published as* |

**What is not proved here.** The bucket and its three object policies do not exist on the
replay database — Supabase Storage is not part of it — so the path shape, the 25MB limit
and the six allowed types are checked by hand against the live project, exactly as `0062`
and `0100` record for their own buckets. The policy and the app agree on the object path
(`jobs/<job key>/…` or `projects/<number>/…`) because both were written from this
paragraph; a policy the app does not match is a refusal nobody can read.

### 10 September — one published copy per document (`0107`)

Amber, asked whether the copies a document leaves on a job are a version history or
clutter: *"only onver version of the document. if they want another copy they can download
it"*.

`0106` let a document be published by saving the file against the record. Publish, edit,
publish again, and the job held **two** files — both under the document's title, one out of
date, nothing on either row saying which was current.

**The version chain is deliberately not used.** `documents.supersedes_id` exists for exactly
this shape, and `0032` argues for it well: *"a version integer cannot say WHICH document a
revision revises"*. It is the right tool for a drawing at revision C whose revision B
somebody still needs, and the wrong one here — Amber's answer is not "show the old one
behind the new one", it is that the old one is not wanted. The second half of her sentence
says what to do instead.

**One carve-out, and it is not a hedge.** A copy somebody has since filed on ANOTHER record
is unpointed, not deleted: `documents` holds a file once and `document_links` says where it
is attached, so deleting it would take a document off a job nobody was publishing to.

**`SECURITY DEFINER` is load-bearing here rather than habitual.** `0032` makes deleting a
`documents` row admin-only, while re-publishing is ordinary `user` work. Without the definer
the delete matches no rows, silently, for everybody except an admin — the worst of the three
possible failures, because it looks like it worked. `verify/rls.sql` proves it as a real
signed-in user for that reason.

**The bytes outlive the row, and the LIVE database is what said so.** The trigger first
deleted the storage object beside the row. It replayed perfectly — the harness rebuilds into
a plain Postgres with no storage schema, so the whole branch was guarded away — and
production refused it on the first apply:

```
42501: Direct deletion from storage tables is not allowed. Use the Storage API instead.
CONTEXT: PL/pgSQL function storage.protect_delete()
```

So a superseded copy stays in the `job-documents` bucket, unreachable from the app because
nothing points at it, costing storage and nothing else — the same shape `0062` already lives
with. Sweeping them needs the Storage API and is an admin or scheduled job, not a trigger's.
Left undone deliberately: the alternative was widening the bucket's admin-only delete policy
to every member of staff, which buys tidiness with the rule that stops somebody removing a
published contract. **Worth keeping for its own sake** — a replay proves the DDL applies, and
this is a rule no replay could catch, because the thing it guards does not exist there.

**Three things were written the obvious way first and all three were wrong.**

*The trigger as `BEFORE`.* It does not merely misbehave, it does not terminate:

```
ERROR:  stack depth limit exceeded
```

BEFORE, the row still holds the old pointer, so deleting the superseded file fires `0106`'s
reap — which finds a document still naming that file and clears the pointer, which fires
this trigger again, which deletes again, all the way down. AFTER, the new pointer is already
in the row, `0106`'s reap matches nothing, and the two never see each other.

*No guard on a pointer being CLEARED.* An admin deleting a published file fires `0106`'s
reap, the reap clears the pointer, and this trigger then tried to delete the row the outer
command was already deleting:

```
27000 / tuple to be deleted was already modified by an operation triggered by the current
command
```

Found by `verify/rls.sql`, not by the migration — and the reason the migration missed it is
worth keeping: its first probe left a SharePoint URL set, so `0106`'s reap declined, the
pointer was cleared by the foreign key *after* the delete finished, and nothing collided.
Only a **file-only** publication reproduces it. Clearing a pointer is never this trigger's
business; only replacing one is.

**Watched failing**, six:

| Broken on purpose | What reported |
| --- | --- |
| The delete removed from the trigger | *publishing again left the previous copy on the record* |
| The moved-pointer test written as `is not null` | *writing the pointer back unchanged deleted the copy it names* |
| The filed-elsewhere carve-out removed | *a copy filed on another record was deleted by a re-publish* |
| The trigger made `BEFORE` | *stack depth limit exceeded* |
| The cleared-pointer guard removed | *27000 / tuple to be deleted was already modified…* |
| `SECURITY DEFINER` dropped | `verify/rls.sql`: *a user publishing again left the previous copy on the record* |

The seventh was not a sabotage and could not have been one: the storage delete, refused by
the live database on apply.

**And one probe that passed against a broken trigger**, which is worth more than the six.
The first version of the delete-the-file probe left a SharePoint URL set, so `0106`'s reap
declined, the pointer was cleared by the foreign key *after* the delete had finished, and
nothing collided. Only a **file-only** publication reproduces the deadlock. `verify/rls.sql`
caught it because its admin deletes exactly that; the probe was then rewritten to clear the
URL first, and only then did it report.

## Verification

1. `supabase db reset` against a branch — every migration applies to an empty database in
   order (`0007` currently fails on a fresh database; that gets fixed in the repair batch).
2. `EXPLAIN (analyze, buffers)` on a 200-property job drawer as a real `authenticated`
   JWT. **The plan must show InitPlans above the scan and no `SubPlan` under the filter** —
   a `SubPlan` means per-row evaluation and a 200× regression.
3. An RLS test matrix: for each of viewer / user / manager / admin and each of
   unrestricted / restricted / team-granted properties, assert the visible field set.
   This is the artefact that proves the model, and it should be written before the grants
   migration lands, not after.
4. `get_advisors` for security and performance warnings after each batch.
5. **A job sits in three pipelines at once** — put one job at *Preconstruction* in the
   lifecycle, *Working Drawings* in the preconstruction pipeline and a Design step in the
   working-drawings pipeline, then confirm each board shows it in the right column and that
   a user without the Working Drawings grant cannot see the third row at all.
6. **The address scenario, end to end.** Create project 1042 at "12 Test Street", rename it
   "20 Corner Street", add three jobs as Lot 1/2/3, rename them to their street numbers,
   then search for "12 Test", "Lot 2" and "20B Corner" and confirm each finds the right
   record. That single walkthrough exercises the join tables, the validity periods, the
   search views and the trigram indexes at once.

## Risks

- **The board cannot filter or sort on EAV.** Sorting 500 jobs by pour date means a join,
  a pivot and a sort. Keep the spine (`stage`, `status`, `owning_team`, `assignee`, dates,
  numbers) as real columns and mark board-visible properties explicitly. Never promote a
  restricted field to a column "for performance" — the moment it is a column, everyone can
  read it, because RLS filters rows and never columns.
- **Any denormalised reporting copy of `property_values` is a hole straight through
  field-level security.** Power BI must go through a `security_invoker` view or its own
  auth, not a flattened table.
- **Per-property administration will not be sustained by a 45-person builder.** The
  baseline-plus-override design keeps the row count in the tens rather than the thousands,
  but build the "who can see this field" read-back screen — an ACL nobody can inspect is an
  ACL nobody trusts.
- **Health status is undefined, and the board is meant to be grouped by it.** "All jobs in
  project 1001 in a kanban by health status" needs health to exist, and
  `supabase-schema.md:605-616` deliberately left it out: *"Status is what someone sets.
  Health is what the system works out"* — from inputs nobody has decided. Kanban-by-status
  and kanban-by-team work today; kanban-by-health does not, and it is a business decision
  (is a job at risk because it is past `expected_days`, because a required field is empty,
  because a dependency is blocked, or some combination?) rather than a schema one.
- **`project_stage` may never be used.** It is nullable and costs nothing empty, but do not
  seed a vocabulary for it until Acquisition & Development confirm they want one — a half-
  filled stage column that some projects use and others ignore is worse for reporting than
  no column.
