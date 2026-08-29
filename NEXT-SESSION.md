# Start here — the schema thread, as at 28 August 2026

Paste the block below into a fresh session. Everything above the fence is context for a
human; the fence is the prompt.

The long reasoning lives in `HANDOFF.md` under **"Settled 24 August"**, **"Record types"**,
**"What the benchmark settled"** and the sections after them. This file is the short version
and the starting instruction.

---

## The state in one paragraph

The property model is decided and **nothing is built**. `properties`, `property_values`,
`processes` and `job_processes` do not exist; `property_defs` exists but empty and in its
old shape. The live database is at migration `0057` and moving — a second session is
building UI against it. The design was settled by argument and then checked by benchmark,
and three of the benchmark's answers reversed things this file previously asserted.

## The decisions, in the order they matter

| # | Decision | Why it is not reopenable cheaply |
|---|---|---|
| 1 | **Everything is a property unless the database must enforce it.** Columns only for identity, foreign keys and RLS predicates | Postgres caps a table at 1,600 columns; at 2,000 fields there is no wide-column schema. Measured |
| 2 | **Record types, not flattened fields.** A plan is a thing a job has several of, not 700 fields on the job | Collapses the catalogue from ~2,000 definitions to ~308. Measured at 4.7M values |
| 3 | **One catalogue, two storage modes.** `property_storage = column \| value`, `property_is_system` for locked. Job number and address appear in the same list as the rest | Codd's rule four. Assert it both ways against `information_schema` or it becomes fiction |
| 4 | **Permissions on the property row.** Manager+ sees all unless restricted; restricted grants to a **team** with named exceptions; manager does not bypass | ~100 restricted, mainly finance — one grant repeated, not 100 lists |
| 5 | **Processes replace nested pipelines.** Flat list pinned to a lifecycle stage, plus dependency edges | Deletes `pipelines`, `pipeline_stages`, `pipeline_parent_stage_id`, `job_pipeline_positions` |
| 6 | **Processes never store data. Properties do.** A process says when, by whom, how long — never the value | Keeps the export shape `(job, property, value)` untouched by the process layer |
| 7 | **No auto-advance** of the lifecycle stage; derive "ready", a person clicks | An amendment would drag a job backwards then forwards |
| 8 | **No integration ever uses the service key** | That key bypasses RLS entirely; one integration voids every permission decision above |
| 9 | **Health = `started_at + expected_days`, at-risk `− flag_days`** | The first definition of health anyone has given that is computable and not invented |
| 10 | **Milestones are a boolean and never a percentage** | "68% complete" implies a weighting that does not exist |

## The four things that are open

1. **Which of the 37 pre-construction rows are processes, and which are the properties
   inside them.** Test: a **process** has a duration and an owner; a **property** is only a
   fact that gets recorded. Amber is filling this into a workbook.
2. **Does `finance` have a team manager?** Four teams have none, and finance owns the ~100
   restricted properties — with no manager, every restricted finance field escalates to two
   admins and four superadmins.
3. **A process nobody started is never late.** The agreed anchor makes the forgotten step
   invisible. Needs either an unstarted-overdue rule or auto-start on predecessor completion.
4. **The Gantt needs projected dates.** `started + expected` answers *is this at risk now*;
   it cannot forecast unstarted work.

---

```
Read HANDOFF.md, starting at "Settled 24 August: the properties table, and processes
instead of pipelines" and reading everything after it. Also read NEXT-SESSION.md.

Context you need and will not otherwise have:

- The property model is fully decided and NOTHING is built. property_defs exists but is
  empty and carries the OLD shape (it still has property_def_stage, which the design
  removes, and none of the permission columns). property_values, processes and
  job_processes do not exist at all.
- A separate session is building UI against the same database. Do not touch app/src
  unless explicitly asked. Migrations and docs only.
- The Supabase MCP connector authenticates by browser OAuth and drops in remote
  sessions. Do NOT add an Authorization header to .mcp.json to fix it — that suppresses
  the OAuth challenge and breaks interactive sessions too. This was tried and reverted;
  HANDOFF explains it.
- private.my_teams() does not exist. current_permission() and is_active_user() are the
  only permission helpers in the database, so the team half of the permission model has
  no infrastructure yet.

Your first job is to write migrations for the property layer, in this order, one branch
and PR per table per the house rule:

  1. record_types + the properties catalogue (property_storage, property_is_system,
     property_scope as a record type, property_format, the restricted flag and its team)
  2. property_values with one nullable parent column per record type and a
     num_nonnulls(...) = 1 check
  3. property_restricted_viewers, property_options
  4. private schema + my_teams(), and the RLS policies, every helper call wrapped in
     (select ...)
  5. processes, process_dependencies, process_properties, job_processes

Before writing any of it:

- Load the supabase-postgres-best-practices skill.
- Read migration 0053-0055 ("Community title and Torrens title are different lots") —
  it landed while this design was being written and may already model something the
  record types would duplicate.
- Confirm property_defs is still empty. If somebody has started defining properties
  through the app, the migration becomes a data migration and that changes the plan.

Two things must be built as assertions in app/supabase/verify/, each watched failing
before it is trusted:

- A filter on a property the signed-in person cannot view is REFUSED, not answered.
  Proved on 28 August: a user not on the allow-list is told all 3,000 jobs are missing a
  restricted value, with no error. Assert the refusal, never an empty result — an empty
  board passes on the broken version too.
- The catalogue agrees with information_schema in both directions: every entry with
  storage='column' resolves to a real column, and every real column on a record type is
  registered.

And one performance rule that is invisible in the SQL: "everything for this job" must be
a UNION ALL across the record types, never an OR. Measured at 439 ms versus 2.1 ms on
4.7M rows for the identical 1,572 rows.

Do not seed any property definition, process or team assignment. Amber is producing that
list in a workbook. Never invent one — an invented default gets quoted back as though it
were agreed.
```
