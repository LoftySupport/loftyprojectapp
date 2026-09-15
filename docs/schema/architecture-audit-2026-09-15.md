# Schema and architecture audit, 15 September 2026

**The readable version, with the two diagrams, is published at
<https://claude.ai/artifact/LnuPZkB65SW8uKhxnaVjCP>. Show that one to people; edit this file.**
Revision 2, 15 September. Revision 1 was written the same morning before the interview; the
interview's answers are recorded in [`../open-questions.md`](../open-questions.md) and folded
back here in *Revision 2* at the end.

Amber, 15 September: *"I want to walk away with a clear picture on what needs to stay, what
needs updating and what needs to go and a staged plan to implement it."* This is that record.
It was read against the live project (`gmekuqdjemrfuurxhuib`), the 124 migration files, the
app at `main` commit `293c8ca`, both Supabase advisor reports and Amber's entity list of the
same day. Every count is a live query; every quotation is pasted from its source.

## The one-sentence version

Every table was built carefully, and the tables do not agree with each other about how a job
moves. Three generations of that answer coexist in the schema, and the newest one,
`processes`, cannot move anything: completing a run changes one column on its own row.

## Where this stands, in numbers

| | |
| --- | --- |
| Tables in `public` | 75, plus 21 views and about 110 functions |
| Tables with no rows | 26, of which 8 are read by nothing in the app |
| Projects, jobs | 119, 83. All 83 jobs are in Pre-construction; 67 have no title type |
| Processes | 51. Three carry an SLA. Eleven runs across five records |
| Property definitions | 266. Thirty-two values recorded, on 8 of them |
| Tasks | 1 (*Check this out*, on 1002-001). No task dependencies, no checklist items |
| Maintenance | 16 requests, 0 items. Four email notifications never sent |
| Migrations | 124 files; `0073`, `0119` and `0120` each used twice; 142 unindexed foreign keys |

The write counters in `pg_stat_user_tables` have been reset at some point (they show three
inserts on the 51-row `processes` table), so they are not used as evidence here. Row counts
and code references are.

## How a job moves today

Three mechanisms answer "where is 1002-002 in the build":

1. **`0029`, the nested pipelines (August):** `pipelines` (1 row), `pipeline_stages` (7),
   `job_pipeline_positions` (0), `job_stage_events` (0). Never written. The SLA typed into
   Setup → Automations lands on `pipeline_stages` and reaches only the Gantt bar.
2. **`0035` to `0046`, the `job_stage` column and its triggers:** a manager presses Move
   stage; `guard_job_stage_change` (manager+), `guard_lifecycle_is_linear` (forward only),
   `refresh_project_stage` (project follows its slowest job), `projects_cascade_stage_to_jobs`,
   `lifecycle_archive` (cron 03:17, twelve months to Closed). **The only path that moves it.**
3. **`0078`, processes (September):** `processes` (51), `process_runs` (11),
   `process_run_display` (health). `process_properties` (140) to `property_values` (32);
   `process_tasks` (107) to `tasks` (1), and only when somebody presses Add checklist.
   **No path to the stage, the team or a property.**

The SLA is fragmented the same way: three "expected days" columns of identical shape on
`pipeline_stages`, `processes` and `tasks`, edited on two Setup tabs, feeding two health
formulas and one Gantt bar, and none of them feeding the job's health pill, which reads a
typed `job_status`.

## Findings, most consequential first

1. **Three generations of "how a job moves" coexist, and the process layer has no path.**
   `0078`'s own header (lines 44 to 51) records that it was meant to delete the pipeline tables
   and did not. Ketan completes every Pre-construction process on 1002-002 and the board still
   shows Pre-construction, the owning team is still what was typed at creation, and nothing
   tells Design the job is theirs. Stages 1 and 3.
2. **The seven stage words live in six places:** CHECKs on `jobs`, `projects`, `processes` and
   `property_defs`; `lifecycle_position()`; the `pipeline_stages` rows; `STAGE_NAMES` in
   `types.ts`. The repository prose still says *"the first of the five lifecycle phases"*.
   Stage 1.
3. **The Construction schedule was loaded twice and connected to nothing.** 107
   `property_defs` at Construction, all dates with SLA days, labelled *External Cladding BRICK
   CLEAN* (`0090`); 107 `process_tasks` named *BRICK CLEAN* with expected days (`0079`). None
   of the 107 definitions is in `process_properties`. The seven Construction processes collect
   zero properties; the 38 Pre-construction processes carry zero tasks. In Construction a
   process is a task list; in Pre-construction it is a property list. Stage 2, decision 5.
4. **A sub-stage is free text and means something different in each stage.**
   `process_stage_group`: Pre-construction has three groups over 38 processes; Construction
   has eight groups for eight processes; Cancelled two of one; Maintenance none. Two orphaned
   checkboxes, *Stage 1 Complete* and *Stage 2 Complete*, are the sub-stage gate nobody
   collects. Nothing can say "1002-002 is in Frame". Stage 1.
5. **Completing a process changes nothing but its own row.** It sets no property (`0078:20`,
   *"PROCESSES NEVER STORE DATA. PROPERTIES DO."*), moves no stage (`0078:41`, *"no
   auto-advance of the lifecycle (agreed 24 August)"*), changes no team, creates no tasks
   unless Add checklist is pressed, does not refuse when required properties are missing
   (a chip reads *"2 required missing"*; 6 of 140 links are required at all), notifies only
   if `process_key LIKE 'working_drawings%'`. Stages 2 and 3. **Corrected 15 September:** the
   first version of this finding also said it writes no audit row because `process_runs` was
   not in the allowlist. Wrong: `0080` removed the allowlist, the trigger is on `process_runs`,
   and 12 audit rows exist for it live. The claim came from reading `0030` and `0077` without
   `0080`, and the Stage 0 item built on it is withdrawn.
6. **Twelve things change data without a person, and the Automations tab says "Not built
   yet".** The project-follows-slowest-job trigger, the cascade, the twelve-month archive,
   `notify_scan` (every 15 minutes), `maintenance_scan` (every 15 minutes, over an empty
   table), four notify triggers, the working-drawings prefix, the address move, the job-number
   resync, the forecast, the property push. None has a name in the app, an on/off, or a log.
   `processes.process_automation` is null on all 51 rows and read by nothing;
   `property_defs.property_def_automation` holds a block name on 139 rows. Stage 4.
   **Corrected 15 September:** the first version said the Properties screen renders that column
   under the label *Automation*; a search of the screen finds no such control. Misnamed and
   unread, not misnamed and shown; the Stage 0 rename stands.
7. **Four email notifications have waited since 12 September because the worker is not
   deployed.** The repo holds four edge functions; the live project has one, `report-share`.
   `notification_deliveries`: 4 in-app sent, 3 email held, 1 email queued. Eight of fifteen
   notification types default to email. Stage 0, decision 8.
8. **Twenty-six tables hold no rows; eight are read by nothing.** Dead: `job_pipeline_positions`,
   `job_stage_events`, `activity_events`, `tags`, `taggings`, `variations`,
   `variation_reopened_tasks`, `maintenance_message_secrets`; plus `import_staging_jobs` (801
   rows, inert). Built ahead of use and correctly empty: the contacts and parties tables, the
   checklists, `property_options`, `record_watchers`, `comment_mentions`,
   `feedback_attachments`, `releases`, `release_entries`, `dictionary_overrides`, the four
   maintenance offer tables. Eight views have no reader: `profile_display`,
   `job_address_search`, `project_address_search`, `tasks_ready`, `job_variation_summary`,
   `variation_rework`, `documents_current`, `job_timeline`. Stage 5.
9. **Maintenance was built as a contractor-offer workflow that "an issue becomes a task" makes
   redundant.** `maintenance_items`, `maintenance_assignments`, `maintenance_categories`,
   `maintenance_message_secrets`, `offer_maintenance_item()`, `answer_maintenance_offer()`, the
   `maintenance-accept` function, the `maintenance_scan` cron and two notification types. All
   four tables are empty; the guard still refuses to close a request while an item is open.
   Stage 5, decision 6.
10. **The seam and the documents carry parallel truths.** `dictionary.ts` (1,968 lines) is
    hand-written per column and is load-bearing for `orphanProperties.ts` and
    `auditNarrative.ts`; `dictionary_overrides` has never had a row. The Wiring page's list
    names 181 methods and omits `listTasks` (implemented since `0102`), so it reports the
    Tasks board as not wired. `releases` duplicates the trailer-generated changelog. Three
    migration numbers are used twice. `verify/constraints.sql` reports 26 `FAIL` lines on
    `main` (**corrected 15 September:** only when run on its own; the 26 are its fixtures
    missing, which `behaviour.sql` plants. `check.sh` on `main` is green, 79 probes, and the
    file now says so in one line). Two icon modules, one export and one script are dead.
    Stages 0 and 5.
11. **Advisors.** Critical: `private.profiles_backup_pre_batch3`, a 16 August copy of
    `profiles` with RLS off (not API-reachable, still a copy of every person's row). By design:
    `maintenance_message_secrets` no policy; four `SECURITY DEFINER` helpers callable by
    `authenticated`; leaked-password protection off (Amber, 10 September: *"Not yet"*).
    Performance: 142 unindexed foreign keys, 132 unused indexes, 39 tables with overlapping
    permissive policies, `login_activity` re-evaluating `auth.uid()` per row. Stage 0.

## Amber's rules against the schema

Holds: one primary team per person (`profile_team_is_primary`); a job has exactly one project;
tasks have exactly one parent (`tasks_one_parent`); files attach to many records
(`document_links`); one lifecycle stage per record, forward only; maintenance is not gated by
stage; checklists tick without touching a property; the activity trail is append-only.

Conflicts: *an address has one and only one project* (address rows are shared places and move
between records; the `0078` probe gives a job and its project the same row); *a task belongs to
one or many processes* (`tasks.process_run_id` is one run, and should stay one); *a process has
one or many tasks* (38 of 51 have none, rightly); *a process has one or many properties* (the
seven Construction ones have none).

Not modelled: sub-stage; automation; team-level permission (teams are ownership and routing; the
only team-scoped right is `property_access.team_id`); health above the run; notifications to a
contact or company.

Push back: a sub-stage should own processes only. Tasks, properties, checklists and automations
reach it through their process, or the same fact is filed twice. A variation, as Amber defines it
(*"return to a previously completed task or process and repeat it"*), is `process_run_attempt`,
not the `variations` table.

## The recommended model

Four layers of definition, four of instance, every instance arrow pointing up:

| Definition (Setup, managers edit) | Instance (the job reads, never types) |
| --- | --- |
| `lifecycle_stages`: the seven as rows, position, SLA. Replaces `pipeline_stages` and six CHECKs | `job.stage`: the stage of the current sub-stage, never backwards, a pin overrides it (On hold, an imported job) |
| `lifecycle_substages`: stage, name, position, gates the stage. Replaces `process_stage_group` | `job.substage`: the earliest sub-stage with a required process not complete or not applicable |
| `processes`: sub-stage, owning team, optional, SLA, milestone, external, dependencies | `process_runs`: complete only when required steps are done; health from SLA; owning team is the earliest unfinished process's team |
| `process_steps`: ordered, required, one of four kinds: property, task, checklist, automation. Folds `process_properties`, `process_tasks`, `process_task_dependencies` and the template checklist | property → `property_values` (set means done) · task → `tasks` (created when the run starts) · checklist → `task_checklist_items` · automation → `automation_runs` |

Four words changed in Amber's definition, with the reasons:

- **"update properties"**: the property stays the record and the step becomes the act of
  recording it. A property step is done when its value is set. Same outcome, one source.
- **"a group of tasks"**: a process is an ordered list of steps of any kind. *Planning
  Approval* is two dates and a wait on council and must not be given an invented task.
- **"move a job through the sub-stages and stages"**: yes, derived with a pin. This reverses
  24 August's *"no auto-advance"*; the risk that rule named (an amendment dragging the job
  back and forth) is answered by attempts: the derivation reads the latest attempt and never
  moves a stage backwards.
- **"a sub-stage groups several processes"**: agreed, and only processes.

Worked on 1002-002: today its stage and owning team are typed at creation and its one run,
*Contract Signing*, has no SLA. Under the model the same rows read sub-stage *Stage 1*, stage
Pre-construction (derived, agrees), owning team Sales Admin (the team on *Contract Signing*),
health still *no expectation* until somebody fills in the days. No data changes; three typed
columns become three answers the database can defend.

Three choices inside the model, with recommendations: **A, steps**: one `process_steps` table
(recommended) over two tables plus an interleaving view, over leaving them. **B, automations**:
a registry of what already runs, then step-kind automations with a fixed effect list (set a
property, create the tasks, notify, request a folder, request a team override); not a rule
builder. **C, Construction**: seven sub-stages, one process each (recommended), over one
sub-stage *Build*, over inventing claim-stage groupings.

## Stay, update, go

The full catalogue is on the published page. By verdict:

- **Stay:** `process_dependencies`, `process_runs`, the property store and its locks,
  `tasks` and the Tasks board, the request-and-note half of maintenance, contacts and parties,
  documents and the report builder, feedback and roadmap, `activity_audit`, `login_activity`,
  the stage guards and cascades, `stubRepository.ts`, the history and archive documents.
- **Update:** `jobs.job_stage` and `projects.project_stage` (FK, then derived with a pin);
  `pipeline_stages` (becomes `lifecycle_stages`); `processes` (sub-stage, optional; loses the
  group text and `process_automation`); the four process template tables (fold into steps);
  `instantiate_process_tasks` (on start); `stage_completion`; `ProcessesPanel` +
  `ProcessSteps` (one live card); `ProcessesSetupPage` and the pipeline helpers; `property_defs`
  (scope, the misused automation column, the 107 Construction dates); `orphanProperties.ts`;
  `MoveStageDialog` (becomes the pin); `dictionary.ts` (pruned); `verify/constraints.sql`;
  `check-migrations.mjs`.
- **Go:** `pipelines`, `job_pipeline_positions`, `job_stage_events` and their three functions;
  `activity_events`; `tasks_ready`, `documents_current`, `job_timeline`, `profile_display`,
  `job_address_search`, `project_address_search`; `tags`, `taggings`; the dead icon modules,
  export and script; `private.profiles_backup_pre_batch3`. On decision: the maintenance offer
  machinery; the four variation objects and five functions; `releases`, `release_entries`;
  `dictionary_overrides`; the Wiring page and `WIRED` list.
- **Archive (decision):** `import_staging_jobs` and the import functions into an `archive`
  schema; the generators stay in `app/supabase/import/`.
- **Decide:** `maintenance_categories` (a trades lookup, or gone), `receive_maintenance_email`
  and `maintenance-inbound` (deploy or remove), `deliver-notifications` (deploy or drop the
  email channel).

## The staged plan

One table per PR throughout. Sizes: small is a session, medium a few, large a week of sessions.

**Stage 0, housekeeping (small, now).** ~~Fix the 26 `FAIL` lines~~ (done 15 September, and
not what it seemed: see finding 10 and the *Stage 0* section below); ~~refuse a fourth
duplicated migration number~~ (done); ~~add `process_runs` to the audit allowlist~~ (withdrawn,
it already has one); ~~rename or clear `property_def_automation`~~ (renamed `property_def_group`,
`0124`, applied); ~~decide the email worker~~ (`0125`: a switch-on, nothing queued before it sent,
external channels off by default, in-app on); ~~drop the profiles backup~~ (`0123`, applied);
~~index the hot foreign keys~~ (`0123`); ~~fix the `login_activity` policy~~ (`0123`); delete the
dead code (asked before deleting, per Amber's rule); ~~correct *"five phases"*~~ (done).

**Stage 1, one lifecycle and real sub-stages (medium, two migrations).** `lifecycle_stages`
from `pipeline_stages`; `lifecycle_substages` backfilled from `process_stage_group`;
`processes.substage_id` not null and `process_is_optional`; CHECKs become FKs; Setup → Processes
gets sub-stages as objects; the board groups by sub-stage. Needs: decision 1, and names for the
Maintenance and Acquisition & Development sub-stages.

**Stage 2, steps (medium to large).** `process_steps` backfilled from the three template tables;
a completion gate (required steps done, *not applicable* as the honest way past); tasks created
on run start; the record's Process card goes live as the mockup drew it; finding 3 resolved per
decision 5; the orphan rule becomes "no step collects it". Needs: choice A, decision 5, and
whether the gate is the database's (recommended) or the screen's.

**Stage 3, derivations (medium).** Sub-stage and stage derived with `job_stage_pinned_at`;
owning team, assignee, status and end date derived (Amber's 14 September rules); health rolls up
process → sub-stage → stage → job; the confirm modal becomes the pin. Needs: decision 3 and
question 8.

**Stage 4, automations you can see (medium).** `automations` and `automation_runs`; the twelve
existing mechanisms registered and gated by `is_active`; Setup → Automations lists them; step
automations get their effect vocabulary; the working-drawings prefix becomes a registry row; the
Override Active Team handshake is the first user-facing one. Needs: choice B.

**Stage 5, remove and archive (small each, last).** Drop the dead objects; drop or archive the
decided ones; prune `dictionary.ts` and regenerate; `verify/seeds.sh` proves the stub against
`lifecycle_stages`. Needs: one yes per item.

## Decisions the plan turns on

Asked in the chat one at a time and recorded in `open-questions.md`. Numbered as on the page:

1. Construction's sub-stages (recommend seven, one process each).
2. Fold properties and tasks into one steps list (recommend yes, choice A).
3. Processes move the job, derived with a pin, reversing 24 August (recommend yes).
4. What "automation" means in the app (recommend registry, then step effects).
5. The 107 Construction date properties: retire, or become the steps (recommend retire).
6. Remove the maintenance offer machinery (recommend yes).
7. Variations: the table, or an attempt of the *Variation* process (recommend the attempt).
8. Email worker: deploy, or drop the channel until a mailbox exists (recommend drop).
9. Import staging into an `archive` schema (recommend yes).
10. Drop the August profiles backup (recommend yes).
11. Remove the Wiring page, dictionary overrides, releases and tags (recommend yes to all).
12. Trades: does `maintenance_categories` become a real lookup (recommend not yet).

## How this was checked

Live queries against `gmekuqdjemrfuurxhuib`: row counts for every table, the migration ledger,
every view, function and trigger, the process seed with per-process counts, property definitions
by scope and stage with orphan and value counts, the Construction definitions against the
template task names, notification types and rules, the delivery outbox, the `cron.job` rows,
the `pipeline_stages` rows, the eleven runs, the stage trigger and maintenance guard bodies, the
deployed edge functions, both advisor reports. In the repository: `0077` and `0078` in full; the
Setup, ProcessesPanel, ProcessSteps and ProcessesSetupPage sources; every `.from()` and `.rpc()`
against every `create table` and `create view`; the `WIRED` list against the implemented methods;
`HANDOFF.md`, `open-questions.md`, `schema-plan.md`, the job-record handoff.

Not done: no migration was written and nothing on the live project was changed. `check.sh` was
not run here; its 26 failures are `HANDOFF.md`'s report of 14 September. **Run 15 September
for Stage 0:** green on `main`, 79 probes. The 26 come only from running `constraints.sql`
alone; finding 10 carries the correction.

## Revision 2, 15 September: what was decided

Every decision above was put to Amber in the chat the same day, one at a time, with the
recommendation stated. Her answers are in `../open-questions.md` in her own words. The
published page carries the same table and marks each catalogue chip that moved.

**The specification that came out of it.** Asked what Construction's sub-stages were, Amber
answered with a walk-through of the Working Drawings process instead. A process is owned by
one team and may hold tasks for others; it starts when a property is recorded (*Planning
approval received*) or a predecessor completes; on start the system creates and assigns the
first task to the owning team's manager, sets the job's owner, stamps a property with today and
starts the SLA; inside it people do tasks, tick checklists, record properties and upload files,
and a task may record a date against a property when ticked; when every step is done the process
completes itself, a milestone process notifies, and completion starts the next process and its
first task. That is steps of four kinds with effects at three moments, which is the model above.

| # | Asked | Answered | What it moved |
| --- | --- | --- | --- |
| 1 | Construction's sub-stages | Construction is not mapped yet and runs in SiteBook; a process everywhere is the size of Working Drawings | Stage 1 crosses the seven groups over mechanically, one sub-stage each holding its existing process, awaiting the SiteBook mapping |
| 2 | Fold properties and tasks into one steps list | Yes | Stage 2 as written; a task step may name the property it stamps; every later edit stays a row a manager makes in Setup |
| 3 | Processes move the job | Yes, as long as it can be manually overridden | Stage 3 as written, with the pin. Reverses 24 August |
| 4 | What "automation" means | A registry of what runs, and later a HubSpot or Monday style builder; processes pick from either | Stage 4 gains 4c, the builder, recorded and not sized. One `automations` table with a kind column so there is one list |
| 5 | The two Construction loads | Keep both; a SiteBook feed will write into them, then SiteBook retires | Nothing retired. Finding 3's cost accepted. Which copy the feed writes to is for the integration |
| 6 | Maintenance | An issue is logged, stamped and assigned to a company or a person, and a process runs on it (report, send, follow up, check, confirm, invoice). Its own record, job only for now, no categories or trades | `process_runs` and `process_scope` gain *maintenance*. The offer machinery goes: items, assignments, categories, secrets, the offer and answer functions, the scan, the accept function, two notification types. Parties through `record_parties`. The project parent is added when a shared-property defect arrives |
| 7 | Variations | Their own process and number (V01, V02); reopening a process in Construction starts it again without moving the job back | `variations` stays (Go became Update) as the record a *Variation* process runs on, a fourth scope; its effect is a new attempt linked by `process_runs.variation_id`; `variation_reopened_tasks`, its views and triggers go |
| 8 | Email worker | Keep it; Teams, email and SharePoint are being connected; send nothing queued before switch-on; everyone off by default until testing | Stage 0: mark the four waiting rows as never to be sent, a switch-on date, default preferences off. The worker deploys with Amber's secrets |
| 9 | Import staging | Export to a spreadsheet in the repository and drop it | Stage 5 (Archive became Go). Supersedes 7 September's "leave it" |
| 10 | Profiles backup | Drop it | Stage 0 |
| 11 | Scaffolding | All four go, and the dictionary itself | Stage 5. The fixed-columns list on Setup → Properties reads a catalogue view; the activity feed falls back to column names and property labels; `CLAUDE.md`'s four files become three |
| 12 | Trades | No categories or trade types | Goes with 6. Question 0d closes |
| + | Where the completion rule lives | In the database | Stage 2: a run cannot be complete while a required step is open; not applicable on the step is the recorded way past |
| + | What makes a job overdue (question 8) | Its target completion date has passed | Stage 3's roll-up: at risk when an open required process is at risk or overdue; overdue when the target has passed; never overdue without a target |
| + | Maintenance's sub-stage | 1 Month, 2 Month and 3 Month | Stage 1: three rows; *1 Month Checkin* in the first, the other two empty |

**Three things this changes in the model, in words:** `process_runs` takes four parents (job,
project, maintenance request, variation) under the same one-of check; a task step carries an
optional property key it stamps on completion; the derivation of sub-stage and stage has a
floor, never lower than the highest reached, so a variation's new attempt does not pull a job
in Construction back to Stage 2.

**Found and fixed the same afternoon.** The live ledger never carried `0119`
`the_date_the_slas_say` or `0120` `a_community_title_job_shows_a_c` although PR #88 merged their
code, so the deployed app asked `job_display` for `job_calculated_completion` and the Jobs board
failed for everyone. `0119` was dry-run in a rolled-back transaction and applied. `0120` as
merged could not be applied: its new CHECK came before the backfill, and with that moved,
`0028`'s constraint of the same name refused the rename. The file was reordered (drop, rename,
add), watched passing live, and on Amber's yes `0120` and `0122` were applied too. Nine jobs
carry their `c` and the ledger matches `main`. The replay's blind spot, an empty `jobs` table,
is recorded under `0120` in `schema-plan.md`.

**Where this leaves the plan.** Nothing in Stage 0 waits on a decision any more, and Stages 1
to 5 each have theirs. Nothing is built yet; the next step is the Stage 0 pull requests, one
table each.

## Stage 0, 15 September: the first pull request

`claude/stage0-checks`. Three of the ten items, none a migration:

- **The 26 `FAIL` lines were not a broken harness.** `check.sh` on `main` replays, runs
  `behaviour.sql`, then `constraints.sql`, and is green: 79 probes, all biting. Replaying and
  then running `constraints.sql` on its own gives exactly 26 `FAIL` lines, every one of them
  *"the fixture it targets is gone"* or *"job 9106-002 does not exist"*, because project 9106
  and its job are planted by `behaviour.sql`. That is what 14 September saw and misread: the
  first address by heap order is 3 Deans Road, a street, so no locality was ever refused. The
  file now checks for its fixtures first and reports one line naming them (watched: replay,
  run it alone, one `FAIL`), and the three job probes take the fixture job's own address
  rather than whichever address row is physically first.
- **A fourth shared migration number is refused.** `scripts/check-migrations.mjs` does this
  with or without credentials, so CI refuses it on every push; `0073`, `0119` and `0120` are
  allowed by name because the live column comments cite those numbers. Watched: a planted
  second `0001` was refused and both files named.
- **"Five lifecycle phases" is seven** in `supabaseRepository.ts` and `dictionary.ts`, with the
  data dictionary regenerated. `StageTrack.tsx` still says five, correctly: it draws five of
  the seven on purpose. `savedViews.ts` narrates the 0035 cut as history.

**The next three branches, the same afternoon.** `claude/stage0-hygiene` is `0123`: the profiles
backup dropped, six foreign keys on the process tables indexed, `"read own login_activity"` in
the once-per-query form; merged as #96 and applied live minutes later. `claude/stage0-property-group`
is `0124`: `property_def_automation` becomes `property_def_group`, the workbook's own header, and
the words turn out to be Construction's sub-stages and Pre-construction's processes, so Stages 1
and 2 each take a half; merged as #97 and applied live. `claude/stage0-notifications` is `0125`:
a one-row switch-on, every external row written before it skipped, the worker's claim gated by
it, the four waiting rows skipped, and the defaults as Amber answered when asked: *"External off,
in-app stays on"*; PR #98. Each carries its `schema-plan.md` entry. Left of Stage 0: the dead
code, which is a question to Amber before any file goes.
