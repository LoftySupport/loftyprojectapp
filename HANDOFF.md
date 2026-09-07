# Handoff

Everything a new session needs to pick this up. Read this first, then `docs/schema/schema-plan.md`.

<!-- generated:shipped -->
**No release has been published yet.** See [CHANGELOG.md](CHANGELOG.md) for what is waiting.

Unreleased: 176 changes since then —
- Fixed: The bug-and-idea form at /report opens again for people held at the demo gate — it had been blank since it was added
- Fixed: A link you were sent takes you there after signing in, instead of dropping you on the dashboard
- Added: Import a Word document or a PDF and it becomes a template or a document — headings, prose and Word tables become blocks you can edit, and it tells you up front what it could not bring across
- Added: Drop an image straight into a report, or pick one from your machine, instead of hosting it somewhere and pasting a link
- Fixed: A document can be put on a project as easily as on a job — the choice is now asked before the list, instead of every project sorting below every job in one long picker
- …and 171 more.

<sub>Generated from commit trailers by `node scripts/changelog.mjs` — do not edit inside this block.</sub>
<!-- /generated:shipped -->

**Phase A is done and applied, and so is the property-and-process half of Phase C (`0076`–`0079`, 1 September).**

**Phase B — the import — is CLOSED, 7 September, without ever running.** Amber: *"i don't
need any jobs imported from spreadsheets. all jobs that need to be created from now on will
be created from the projects in the app"*, and *"everything that is in supabase now is
correct"*. Jobs and projects are created in the app, from the project, by the people who
own them. There is no spreadsheet load coming, so the seven colliding sites that stopped
the load on 3 September stopped mattering rather than getting resolved.

**Nothing was removed from the database, deliberately.** `import_staging_jobs` and its 801
rows, `import_spine()`, `unimport_spine()` and `private.import_team_for_person()` are all
still there, inert. Amber: *"if I need to import other areas I will let you know as
properties may change between now and then"* — so the machinery has a plausible future job
even though jobs and projects are not it. It never ran: the load rolled back whole on its
first write, so no project, job or address in the app came from it.

## Where it stands, and what is next — 7 September, evening

**Live on `hub.lofty.au`, all merged to `main` today with CI green on every merge (the
responsive sweep included, now that it runs there):**

- #48 — Roadmap and Changelog off Admin; Phase B closed.
- #49 — Amber's eight first-week fixes; the responsive sweep and the generated-files check in CI.
- #51 — undo at the repository seam; filters mirror Group by with one Advanced row; a job or
  project number box; any property as a table column.
- #50 — nine more from the same list, in a parallel session: the drawer collapses and is
  findable, the board's cards separate, the header loses its pink, the rail tooltip stops
  eating its first letter, and `0097` makes a notification *type* admin's again.

**Next, in order.** Nothing here needs a schema change.

1. **Amber clicks through what the harness could not.** Every check today ran against a
   fixture repository, never the live database. The four things to try on `hub.lofty.au`:
   change a project's target date and undo it; change a task's status and undo it; move a
   request's stage on Updates and undo it; turn on a property column with real values on the
   Jobs table. If any of them misbehaves, the seam (`undoableRepository.ts`) is where undo
   lives now — there is no longer a per-screen registration to look for.
2. **Work the open-questions queue**, top question first — `docs/open-questions.md`. Six
   questions were added today by this line of work; the first (Bugs and Ideas off Admin) was
   asked and answered the same evening, and #54 put three security-advisor questions at the
   top, so twelve remain. Numbers 4–7 are the cheap confirmations of decisions made under
   time pressure; asked once, they stop being risks. Number 8 is the one that BLOCKS
   something: cloning a job has no entry point since the button left the drawer (#50) and
   nothing on the Projects side has taken it yet.
3. **Small follow-ups that fell out of today, none blocking:**
   - The column picker will list every property — eighty-odd once the definitions are all
     active. It has no search box. Add one when it gets unwieldy, not before.
   - The undo bar is hidden below 600px to keep the phone header usable. Ctrl+Z has no phone
     equivalent, so a phone has no undo at all. A long-press on the toast is the obvious home.
   - `PersonSelect` offers active people only. A job already assigned to somebody deactivated
     still shows their name read-only; whether the picker should offer them was not asked.
   - The deep-link case: a write on a record the page has not listed (tasks, runs, property
     values, feedback) goes through unrecorded, because the seam has no "before" for it.
     Every screen today lists before it edits, so nothing hits this; the fallback is honest.
4. **Still queued from earlier sessions**, unchanged: `SHARE_ALLOWED_ORIGINS` (below), the
   sortable-header table further down this file, and the notification worker.

### Two standing decisions, so nobody spends an afternoon reopening them

**`amberbeaumont/modules` is out of scope. Ignore it.** Amber, 4 September: *"ignore the
amberbeaumont repositry now. it is not needed and done is prupose"*. The report-builder module
was installed here and the app's copy is now the only copy that matters — the QR code, the
table of contents and the record pickers live in `app/src/features/reports/` and are not going
upstream. Do not raise PRs against that repo, and do not treat the two copies as needing to
agree.

**`report-share` is deployed and inert until one secret is set.** Deployed 4 September to
`gmekuqdjemrfuurxhuib`, `verify_jwt` off, and answering — a POST returns
`503 "Sharing is not switched on."` because `SHARE_ALLOWED_ORIGINS` has no value yet. That is
the designed default, not a fault: the secret is a comma-separated origin allowlist with no
fallback, so a deploy made before somebody decides the domains answers nothing. Set it in
Project Settings → Edge Functions → Secrets and the Share button starts producing links that
open. Until then it produces links that do not, so it is worth doing before anybody is shown
the feature.

Last updated: 2026-09-07.

---

## Session of 2026-09-07 — eight bugs from Amber's first week on it

Amber's list, in her order, and what each turned out to be. None of it touched the schema —
every fix is in `app/src`, and the one repository method added (`setFeedbackKind`) writes a
column that already existed under a policy that already allowed it.

| she said | it was | now |
|---|---|---|
| "new job creation not working on project tab" | The split-into-jobs panel rendered BEFORE the project's panel in the tree; same z-index, so it opened behind the project. Escape also closed both. | Rendered after, so it stacks on top; `SidePanel` keeps a stack and only the topmost hears Escape. "Jobs on this project" is the first section of the drawer, **+ Create jobs** in its head. A SiteBook number can be typed per lot at creation (the column was already there as "old job number"; it is named for what people call it). |
| "all drop downs alphabetical … typing a name auto selects … team first, then people with their team" | `Select` sorted; `MultiSelect` did not. The people pickers were Vibe dropdowns — filter, but no auto-select, no team. | `MultiSelect` sorts. New `TypeaheadSelect` (the suburb field's shape for any closed list) and `PersonSelect` on it: every name with their team beside it; the record's own team first under its name, then "Other teams"; one unambiguous match is taken on Tab or on leaving the field. Used for every assignee/owner/person control. |
| "sidebar text not persisting" | The report panel closes on any click outside it — including the nav — and unmounted the form. | `FeedbackProvider` owns the draft (kind, title, detail, requested-by in `sessionStorage`; files in memory). Sending clears it. |
| "updates page is duplicated with the bugs/ideas/roadmap/changelog pages in admin" | Four Admin tabs rendering Updates' components and a second triage table. | Gone, with `FeedbackList.tsx`. `/admin/{bugs,ideas,roadmap,changelog}` redirect to the matching Updates view. Admin's head says where they went. |
| "user settings notifications cut off" | A six-column table in one third of an auto-fit grid. | Two-column page: details with "where you land" beneath on the left, notifications beside. The toggles lost their "Off"/"On" words, which were a third of the table's width. |
| "add the undo and redo bar to the top navigation" | There was no undo anywhere. | `UndoProvider` + two header arrows, Ctrl/⌘+Z and Shift+Z. A screen registers a step with its inverse at the moment it writes; the drawer's team/assignee/title/SiteBook number, a project's team/assignee, property values, inline user edits, restore/let-in, and a request's stage/phase/kind do. Lifecycle moves and deactivation do not — the first is forwards-only by rule, the second confirms. Hidden below 600px. |
| "users settings row cut off, can't edit or save; name should open the side panel" | Save sat in the last column of a row wider than the screen; the panel held a stale `Profile` object. | Save/Cancel in the spanning row beneath, sticky to the left edge. The name opens the edit panel, with View activity / Deactivate / Hold at gate under the form. The panel resolves the person by id from the latest read, so an inline save shows in it. |
| "can't change an idea to a bug in updates" | No control wrote `feedback_kind`. | "Filed as" in the request panel, admin+, under the existing UPDATE policy; undoable. |

**Seen rendered this time**, against a fixture build (the responsive harness's signed-in stub
with six people and three notification types added): Settings, Admin → Users reading and
editing, the person panel, the project drawer with the split panel over it, the assignee
typeahead grouped by team, the request panel with "Filed as", and the draft surviving a page
change. Not seen: a real write going through, since there is no database in the harness — the
undo steps were exercised only as far as the toast.

**Undo moved to the repository seam the same evening.** Amber, an hour after the bar shipped:
*"the undo and redo doesn't work when i made an update it didn't let me undo it"*. The first
version registered a step at six call sites; the app has fifty places that write, and her edit
was one of the forty-four that recorded nothing. `undoableRepository.ts` now wraps every
patch-shaped write — read the record, write the patch, record the inverse — and
`DataProvider` bumps a version every `useQuery` depends on, so the screen re-reads after an
undo without knowing which screen it is. Lifecycle moves, creates and deletes stay out on
purpose. Seen working in the fixture harness: assign → undo → redo → Ctrl+Z, with the writes
logged to prove the inverse carried the OLD value (the first cut built it after the write and
re-applied the new one; the harness caught it).

**The toolbar's filters are the Group-by fields, and the rest is one Advanced row.** Amber,
later the same day: *"filters on jobs and projects should be same as the group ones and then you
can add in the extra detail like an advanced not clicking a million times to get new filters up.
you also need to be able to enter a job number and columns should be able to add any property in
the job (including project properties as they are inherited by the job) to the column."* Three
changes, all in `Toolbar`, `filtering.ts`, `boardModel.ts` and the two pages:

- **Filters.** The chips and "+ Add filter" are gone. Jobs shows Stage, Team, Status and Process
  from the start; Projects shows Stage, Job stage, Type and Status. One **Advanced** button opens
  a second row with every other filter at once — number, project, type, moved date, process
  health, property, recorded — and carries a count when one of them is narrowing the board while
  folded. A filter reading "Any" is not in the URL.
- **Job stage is its own filter on Projects.** The projects board groups by the project's phase
  and by its jobs' stages, so it now filters by both: `?stage=` is the project's own
  (`project_stage`, 0039) and `?jobstage=` is "has a job in this stage", which is what `?stage=`
  used to mean there. A saved projects view carrying `?stage=` changes meaning accordingly.
- **A number box.** "Job or project number", prefix-matched against the job number, the old
  SiteBook number and the project number — `1042` is every job on the project, `1042-003` is one.
- **Property columns.** `BoardJob.properties` and `BoardProject.properties` carry every recorded
  value the reader may see (the job's own over its project's, exactly as the drawer reads
  through), and `propertyColumnDefs` turns every active readable definition into a column, off by
  default, labelled "(project)" on the jobs table where the two scopes mix. Cells are
  `formatValue`, the drawer's and the reports' sentence; figures and dates sort as what they are.

**Two checks CI now runs that it did not** (Amber, same day: *"should there be a check for
this"*): the responsive sweep, because it caught the 16px link and nobody but a person at a
terminal would have; and `changelog.mjs --check` on every PR's own head, because this PR's
first commit landed with the four generated files stale and only the post-commit hook —
which is opt-in — noticed. The check runs on pull requests only; see the comment in
`.github/workflows/ci.yml` for why a red `main` after a merge is the hook's to repair.

**Open, and hers to decide:**

- The undo bar is hidden below 600px to keep the phone header usable. If phone undo matters,
  it needs a home — a long-press on the toast is the obvious one.
- `PersonSelect` lists active people only. A job already assigned to somebody deactivated still
  shows their name read-only; whether the picker should offer them too was not asked.
- The old `Admin → Bugs/Ideas` export (page, error, screenshot count in one file) is now the
  Requests table's export, which carries the same columns except the screenshot count.

---

## Session of 2026-09-04 (later) — Settings is the managers', Admin is behind a cog

Amber, in two sentences that move one line: Setup becomes **Settings** and managers and above
may open it "to update properties, processes, contact settings, maintenance tabs, SLAs and
automations"; **Admin** leaves the sidebar for "a cog icon" in the header, for admins and
super admins, holding "users, teams, roadmap/updates pages, data dictionary, wiring,
changelog/bugs and everything else in setup that isn't in the manager settings".

**A readable version with the diagrams is published at
<https://claude.ai/code/artifact/5e2f1a3d-0cea-469b-aa53-5ff8323d8466>** — show that one to
people. It carries the before/after of the chrome, the full tab-by-tab table with each write
floor, the same rule seen as Deanna (manager) and as Ketan (admin), the SLA column-split
diagram, and the three questions still open at the end. The decision log entry is
`docs/schema/schema-plan.md` → *4 September — Settings is the managers', Admin is the administrators'*.

### The cut is by who asks, not by subject

| Settings — `/setup`, manager+ | Admin — `/admin`, admin+ |
|---|---|
| Properties, Processes, Contacts, Maintenance, Automations | Users, Teams, Permissions, Dictionary, Wiring, ~~Bugs, Ideas, Roadmap, Changelog~~ |

Ten tabs became five and nine, and on 7 September five and **five**. Roadmap and Changelog on
Admin were the **same components** Updates renders, imported rather than copied — Amber:
*"there is duplication on footer and other page"*, so they came out (#48). Bugs and Ideas
followed the same day, in a second session — *"the updates page is duplicated with the
bugs/ideas/roadmap/changelog pages in admin. this only needs to be one page"*. Being one
component underneath was a fact about the code, not about the experience: two doors to
identical rows is still a thing a person has to check. All four old addresses forward to the
matching view of Updates, because those URLs were shareable and somebody has shared them.
Asked that evening whether taking Bugs and Ideas off too was the intent, Amber confirmed it:
Updates only.
Updates itself stays in the footer for everybody, because `0060`'s whole point is that the
people who filed a request can read the queue.

**The bug manager is still admin's**, which is the other sentence from that day — *"only
admins and super admin get to see the bug manager"*. The manager is the controls: stage,
phase, kind, merge, planning, and those are `can("admin")` and superadmin inside Updates
exactly as they were on the Admin tabs. Filing is not triage — `ReportForm` has no permission
gate, so anybody with app access including a viewer can send one.

### 0096 is the half that stops the rename being decoration

Properties, processes, contacts and maintenance already took a manager's write. Two things
did not, so the migration moves them:

- **Stage SLAs.** `pipeline_stages` was superadmin's (`0029`), and `0047` said the SLA is
  part of what a stage IS. **That half is reversed on purpose.** A manager now holds an
  UPDATE policy on the row, and `guard_stage_shape_change()` refuses every column but
  `pipeline_stage_expected_days` and `pipeline_stage_at_risk_lead_days` below superadmin —
  `0060`'s shape, because RLS cannot express a column rule. Insert and delete are untouched:
  a manager still cannot add or rename a stage.
- **Notification types and rules.** Admin's since `0083`, now manager's. They sit on
  Settings → Automations because "overdue 5 days → the managers" is an automation.

`verify/rls.sql` probe 4 in the manager block **asserted the opposite and passed**; it is now
the reverse claim, with two new probes beside it (the rename must still be refused; a manager
must be able to write a rule). All three were watched failing before they were kept — trigger
dropped lets the rename through, policy dropped stops the SLA, rules policy dropped stops the
rule. `./check.sh` green: 75 constraints biting, RLS holds, embeds resolve, seeds agree.

### Two things to know before touching this again

- **`/setup` is still the path.** Only the label and the permission changed. `/settings` is
  the personal screen and stays. `/setup/{permissions,dictionary,wiring,bugs,ideas}` redirect
  to their Admin tabs, and the old top-level `/dictionary` and `/wiring` now land there too.
- **"Settings" and "User settings" now sit one menu apart.** `AppShell` used to argue against
  exactly that; the comment there is now a record of a reversed decision, not a rule.

### Not verified in a browser

The app is behind the Microsoft gate and a Lofty profile row, so nothing here was clicked:
`tsc`, lint and the build are clean, and the RLS half is proved in the harness. **The cog's
placement, the rail with eight items, and the two tab strips have not been seen rendered.**

---

## Session of 2026-09-04 — Tools: the template library and the documents made from it

Amber asked for the report builder from `amberbeaumont/modules` as a **Tools** section
with a **Template Builder** tab, then set out what it has to do. The spec is in
`docs/schema/schema-plan.md` → *4 September*, quoted rather than paraphrased, because it is the
design.

**One correction worth carrying forward: `amberbeaumont/modules` is a generic template
repo and nothing Lofty goes in it.** Every Lofty requirement lives here. The only change
that went to `modules` is two integration findings written app-agnostically
([modules#2](https://github.com/amberbeaumont/modules/pull/2)) — no brand, no jobs, no
projects, and the commit message and PR body were rewritten to strip the references I had
left in them the first time.

**A readable version with diagrams and screenshots is published at
<https://claude.ai/code/artifact/8e3edc34-16ff-4bd3-b41e-412778c47968>** — show that one
to people. It carries the two-table diagram, the permission ladder seen as Ketan and as
Deanna, the house-format palette, and the three questions still open at the end. It was
rewritten in place when the spec arrived; the earlier version described a single table
with a manager-only write floor and no longer exists.

### Three things, and the second table is the one the spec forces

| | |
|---|---|
| **Documents** | what somebody made and is sending. Theirs to edit. |
| **Templates** | the layouts a document starts from. |
| **Sections** | fragments dropped into a template and resolved live, so fixing one fixes every template using it. |

A document is a **copy**, not a view. Amber: *"a user may take an existing template and
modify it for a particular instance eg sending a letter and they need to change the
wording"*. If that edit wrote back to the template, the next person would inherit one
letter's wording, silently, because the template would still be called what it was called.

### The sign-off is the gate; the write floor is `user`

Anyone at `user` and above makes documents and proposes templates and sections. A manager
signs a proposal into the library. Until then it is the author's draft and **nobody else
can see it** — the SELECT policy, not the screen. An **approved** entry is no longer its
author's to edit, and a manager-scoped one is not readable below manager.

Two independent mechanisms stop a user approving their own template, and I only know that
because disabling one did not do it: the trigger, and the UPDATE policy's `WITH CHECK`.

### Properties, and sections

`recordProperties` reads `property_values` for the job or project the **document** is
about, so one template renders 1042-001's properties on 1042-001 and 1043-002's on
1043-002 with nobody editing it. It formats through `data/propertyFormat.ts` — lifted out
of `PropertyField.tsx` so there is still one implementation and a report cannot render a
pour date differently from the drawer.

`librarySection` expands a saved section at render time. Its expander carries a depth
counter: a section pointing at itself is two clicks to build, and without the counter the
stack blows and the reader gets "this block failed to render".

### The documents wear the house format, not a second one

Amber, on the design: the Template Builder should use the template established in
**PR #26**. It should, and it now does — the palette, the font rule and the section rule
all come from there rather than from the app's UI tokens.

The first pass built the theme by reading `theme/tokens.css` and produced a teal-inked
document. It looked like Lofty and was wrong: a document composed in the builder and a
table exported from Jobs land in the same email, and they were two different looks.

`src/data/export/houseFormat.ts` is now the one place the house palette lives, and it has
three consumers — `pdf.ts`, `docx.ts` and the builder's theme. Three things came out of
that:

- **The two writers had already drifted.** The PDF drew the row hairline as
  `0.925 0.929 0.933` — `#ECEDEE` — while its own comment and the Word writer both said
  `#ECECEE`. One channel, invisible, and exactly what two copies of a palette produce.
  Proved by hashing both files before and after: the `.docx` is byte-identical, and
  putting the drifted value back returns the PDF to its original hash, so that one
  channel is the whole of the change.
- **The brand face is Fieldwork Geo, with Helvetica as the template's only approved
  fallback — never Arial.** I had Figtree. `core/docx.js` writes the first family in the
  stack into the file, so Helvetica is first and Fieldwork Geo is documented behind it.
- **The Level 2 rule is 2pt Crisp Orange under a section heading.** The React view drew a
  grey hairline and the Word writer a half-point one; the HTML serialiser already had it
  right. A new `house` header style brings all three into line without changing how the
  module's own four themes look.

`npm run check:report-widgets` now asserts the theme role-for-role against the house
palette, so they cannot drift apart again.

### What was checked

- `npm run check:report-widgets` — **88 assertions**, plain Node, no browser. Every block
  resolves against a full and an empty context; empty data is a sentence; **every
  resolver reads `ctx` rather than a copy**; properties format the way the drawer formats
  them; a section inside itself terminates and says why. Each watched failing under a
  deliberate mutation.
- `app/supabase/verify/check.sh` — green, **75 constraint checks**. Nineteen RLS probes
  covering the whole sign-off model, each watched failing with the matching policy or
  trigger widened.
- `npm run responsive` 120/120 · `npm run export-check` (~90 assertions on the two
  document writers) still green after the palette was shared · build, typecheck, lint clean.
- Driven in Chromium: the two-panel screen, and the builder with a library section
  expanding into a properties block resolved against the document's own job.

### Still open

- **Share links are the one requirement not live.** The columns exist and nothing writes
  them; `app/supabase/functions/report-share/` is written and **not deployed**, with its
  allowed origins and its viewer context deliberately empty so an accidental deploy
  achieves nothing. It waits on two answers that are Lofty's: which origins may open a
  link, and what somebody outside Lofty may see of a job. Read that folder's README first.
- **Amber referred to screenshots for the share behaviour and they did not come through.**
  What is built assumes the module's own Share panel — a revocable link with a mandatory
  expiry and an optional password.
- **Nothing has been saved from a browser to the real database.** The stores are proved
  through the repository seam and the policies are proved in `verify/`; the round trip
  between them is not.
- **Every data block is in its empty state until real jobs exist.** Correct, not broken. They
  now arrive as people create them in the app, a project at a time, rather than all at once
  from an import — so the empty states matter for longer and are seen by more people.

---

## Session of 2026-09-04 — every view downloads, as Excel, Word or PDF

Amber, 3 Sep, in one line: *"can you add an export to excel, pdf download for all views
and reports"* — and Word alongside them, for the report that goes out under a cover note.
All three writers are in `app/src/data/export/`; the control is one component,
`ExportMenu`, and it is on Projects, Jobs, Reports (portfolio, leadership, job report **and
processes**), Updates (tracker, roadmap and changelog), Admin (people and teams), Bugs and
Ideas, the dashboard's own jobs, and the data dictionary.

### The export is what is on screen, and that had to be decided before anything was built

The rows after the search, the filters and the sort; the columns you have switched on, in
the order you dragged them. It is a one-line rule and it settles a dozen questions — but
the reason it is the rule is the failure mode of the other answer: the toolbar says
"Showing 11 of 200", and a file with 200 rows in it makes that line a lie in the one
direction nobody thinks to check. The menu says so in its own words.

**Grouping becomes sheets, Word sections and pages.** Grouped by stage, the workbook has a
sheet per stage, the Word document a section per stage and the PDF a page per stage — the
board's own shape. The projects *table* exports flat even when the board beside it is
grouped, because that table renders flat; an export that grouped something the screen had
not grouped would disagree with the thing it was taken from.

### `ColumnDef.text` is required, and that is the whole design

A cell is a React node. `<StatusPill status="at_risk" />` contains no text at all, so a
walk over a cell's children exports an empty Status column — and nobody notices until a
report has gone out. Making every column say what it exports turns that from a bug you find
later into a compile error you fix now.

`null` is an **empty cell**, not a dash: the screen writes "—" because a blank table cell
reads as a rendering fault, and a spreadsheet is the opposite, where a dash in a numeric
column is what stops `SUM` working. Where the screen shows a `{{table.column}}` token the
file carries the same token — unbound and empty are different facts, the rule the rest of
the app already follows.

### Written here rather than installed — all three

The libraries each bring a general-purpose document model — a reader, a formula engine, an
embedded font stack, a paragraph/section builder — for a handful of small XML parts and
text at coordinates. The Word document is an OOXML package like the spreadsheet, so it
reuses the same `zip.ts`; the two spreadsheet/Word writers and the PDF are all asserted by
`npm run export-check`, which re-parses each archive from the bytes, re-computes every
checksum with Node's `zlib.crc32` rather than the app's own, walks the PDF's xref and the
Word table's tag balance. Every assertion was watched failing; each carries the mutation
used.

Three decisions inside the writers are worth keeping:

- **The spreadsheet writes every value as an inline string or a number, never a formula.**
  A CSV would have got `1042-01` back as "1 Oct 2042", lost the frozen header, and executed
  any cell somebody had started with `=`. One of these columns is free text typed by
  forty-seven people. The Word document is the same: values are text in cells, never
  fields.
- **The PDF measures its text against the real Helvetica metrics** (`helvetica.ts`), read
  out of the AFM data rather than remembered. A width table that is close but wrong shows
  up as columns overlapping on somebody's third page.
- **A table too wide for A4 is split by column in the PDF, with the first column repeated;
  the Word document is landscape and lets Word wrap and auto-fit**, which is why the
  thirteen-column dictionary needs no banding of its own there.

### What is deliberately not exported

The Settings forms and the Wiring page: configuration, not records. The dashboard's hero tile
and workload figures, which are em dashes waiting on the health calculation — a spreadsheet
column of dashes claims a figure was computed. And screenshots on a bug report, which live
behind signed URLs; the file carries the count and says where to look.

### Still open

- **Nobody has opened one of these in Excel or Word on a real machine.** They are proved by
  a re-parse of the bytes (and the `.docx` is recognised by `file` as a Word 2007+ document
  with every XML part well-formed), which is a different claim from "Excel and Word on
  Amber's laptop are happy". First thing to do with a real machine.
- **The empty tables are the ones that will look wrong first.** With no jobs yet, most
  screens have nothing to export and the button is disabled. The shapes to check once real
  jobs exist are the grouped exports on Jobs (a sheet per stage, empty groups dropped) and
  the job report's four sections. There is no longer a single import moment to check them
  after, so check them as soon as the first project has a few jobs in it.

---

## One sweep failure left, and it is not this branch's

The board fixtures make `/jobs` drawable for the responsive sweep for the first time, and
it caught the drag hint running off a phone — fixed. They also make **`/setup/processes`**
drawable, and it scrolls sideways at every width: 856px at 320, 396px at 1024. That is the
**old eleven-column table**, untouched here; hiding the table in the DOM drops the document
back to 320, so it is the table and nothing else.

**PR #22 replaces that whole screen** with the pipeline editor, and that branch's sweep
passes 115 of 115 with its own process fixtures. So the fix exists, in the branch that owns
the screen. Porting it here would mean carrying an entire second PR and guaranteeing a
conflict, so this branch leaves it red and says so rather than papering over it. When #22
lands, that route is the pipeline editor and the failure goes with the table.

Two theories were tried and neither held: the Setup tab strip (Vibe's own wrapper already
scrolls) and `min-width: 0` on `.data-table-wrap` (no effect). Both were reverted rather
than left in place with a comment claiming a fix they did not make.

## Two rules Amber corrected on 3 September, and what they changed

**"a process might not be complete before moving onto the next stage."** `pipelinePosition.ts`
read a job's place as *the first process it has not finished*. That is wrong about how a
build runs: the frame goes up while the drawings are still being marked up. It now reads
*the furthest process anybody has recorded against*, so a job with Working Drawings under
way says Working Drawings even with Concept Plan still open. An unfinished process behind
it is a separate and real fact — outstanding, not a contradiction — and the drawer shows
each run's own status.

That correction also removed a field: `processMove.ts` had a "does the target need
starting?" flag, and under the new rule it is always true, because a process carrying a
run is by definition at or behind the job. A field that is always true is a field that
will one day be believed, so it is gone.

**"it can only go backwards if there is a Variation … an IAF is filled out and variation
raised (and reason listed)."** This is what `0031` was built for, and its header says the
same from the other side: rewinding is coherent INSIDE a phase, on a variation, and never
across phases. **`variations` is not wired into the app at all** — the table has existed
since 0031 and nothing reads or writes it. So a backwards drag is refused *in those words*,
naming the IAF and the variation as the route. Wiring the table is the next change, and it
is a PR of its own by the one-table rule.

## The interface must-haves, and where they are not met yet

Amber, 3 September, gave three rules as **must-haves**. All three are written up in full
in [PRODUCT.md](PRODUCT.md) under *Interface Must-Haves*; this is the state of play
against them, so a gap is a listed item rather than something the next person discovers.

### What has an order is dragged into it — DONE on Processes, and only there

Setup → Processes is now an ordered list you rearrange rather than a table you read down —
the shape of the four screenshots Amber sent as a *"ui and ux reference"*: a card per
lifecycle stage, its processes as rows with a drag handle, a name box you type into, and
Edit properties / Delete at the end of each. `+ Add a process to <stage>` opens
the drawer with that stage already chosen. The dense table is still one click away under
**Table**, which is where sorting lives.

The same treatment is not yet on the other ordered lists — the properties a process
collects, and process checklist templates. They reorder, but through arrows rather than a
drag, and their rows are table cells rather than editable boxes.

The rules behind a move now live in `app/src/data/pipelineOrder.ts` rather than inside the
page component, and `npm run check:pipeline-order` runs 24 cases through them. Four
breakages were watched reporting before the cases were trusted; a fifth breakage passed
and the case it should have caught was rewritten, which is recorded in the script's
header.

### Every record opens in the slideout — DONE

Every screen that opens a record now opens it in `SidePanel`: down the right, expandable
to full width, width adjustable and remembered, Escape to close.

| screen | was | now |
| --- | --- | --- |
| Jobs, Settings → Processes, Updates, Admin | already the slideout | unchanged |
| Contacts | a detail column beside the list | `SidePanel` |
| Maintenance | a detail column beside the list | `SidePanel` |
| Settings → Properties | a detail column beside the list | `SidePanel` |
| **Projects** | **replaced the whole board with a project page** | `SidePanel` over the board |

Projects was the odd one and the worst of them: a job at `/jobs/1042-01` slid out over its
board while a project at `/projects/1042` took the screen and grew a "← Projects" back
button. Same route, same URL, same deep links — the board now stays mounted behind the
panel, exactly as Jobs already worked.

`.contacts-grid`, the two-column shape all three detail columns used, is **deleted** from
`processes.css` rather than left available, so the pattern cannot come back by being
copied off the page next door.

### Every table sorts and filters — PART DONE

Sorting is shared code: `SortHeader` / `useTableSort` / `sortRows` in
`app/src/components/SortableTable.tsx`, with the column readers for the boards in
`TableColumns.tsx`. Blanks sort last in both directions.

**Meets it:** Jobs, Projects (both through `TableColumns`), Settings → Processes,
Admin → Users, Updates.

**Does not yet — sortable headers to add:**

| screen | the columns that should sort | the filters it should carry |
| --- | --- | --- |
| Contacts | name, company, role, email, on-how-many | company, classification, team, awaiting sign-off |
| Maintenance | number, address, reported, trade, owner, health, next visit | trade, status, owner, job, warranty, **reported-date range** |
| Settings → Properties | label, stage, level, team, format, SLA | stage, level, team, format, restricted |
| Settings → Maintenance | category, SLA days | — |
| Settings → Automations (was Setup → Notifications) | type | — |
| Admin → Permissions | permission, capability | — |
| Admin → Dictionary | name, table, column, status | table, status |
| Admin → Wiring | method, table, wired | wired / not wired |
| Updates → Requests, table view | title, kind, stage, phase, votes, from, moved — sorts already | stage, kind, reporter |
| Reports | whatever each report's table holds | the report's own controls |

The date-range picker is the one piece with no shared component yet: Jobs and Projects
have a range control in their filter bar, and the tables above would each need it wired
to their own date column. That is the next thing to build for this must-have, not a
per-page reinvention.

---

## Session of 2026-09-03 — Setup → Processes becomes a pipeline

Amber, in one message: Processes *"doesn't have an edit or delete button on there and if it
is a milestone / these coilumns also need to be filterable and sortable by teams, Build
Lifecycle Stage, Group/Pipeline / the Groups need to be able to be sorted and have processes
nested beneath them and be in ordered as this defines how the job moves through a build cycle
stage, so it is more like a pipeline as each process has an number and they should be able to
be dragged and dropped in order… processes will often include job and project properties, so
it isn't either/or and that needs to be removed. / clikc on a process should have hte same
sidebar slideout like all other records with ability to open it in full screen. / they also
need to show in processes when they were last updated and by who and what happened"* — and,
separately, *"notificatiosn are already under user settings so it is doubling up having it in
setup"*.

### What the page is now

A stage holds groups, a group holds numbered processes, and the number is the process's place
in the flow through that stage — one sequence 1..n across the whole stage, not restarting per
group. Groups and processes both drag, and both have up/down buttons beside the grip, because
a reorder that only works with a mouse is a reorder half the office cannot do.

**No schema change was needed for the ordering.** `process_position` already means "order
within the stage"; a group's place in the stage IS the position of its first process, and
every reorder renumbers the stage so the blocks stay contiguous. That was worth choosing over
a `stage_group_position` column: the number on screen and the number in the column can never
disagree.

A reorder is expressed against the stage's **full** list, not what is on screen. Filtering to
one team and dragging would otherwise shove every hidden process to the end of the stage.

Sorting by a column switches to a flat table with dragging off, and says so — a pipeline
sorted by team is not a pipeline.

### The one thing that did need a migration: `0091`

"Who last updated this" had no answer anywhere in the schema. Every table carries the audit
quartet, `0023` wrote a trigger for `created_by`, and **nothing had ever written an
`updated_by` on any table** — the column was null on all 49 processes on the live database,
checked before the trigger was written. `0091` adds `stamp_updated_by()` (parameterised on the
column name, like `stamp_created_by`, so any table can adopt it in one line) and puts it on
`processes`. It overwrites on every write, and writes NULL when the writer is a script rather
than a person: a machine write is not support editing a process.

Applied live on 3 September. Its four assertions were each watched failing first — trigger
dropped, overwrite weakened to fill-only-when-null, `moddatetime` removed, audit trigger
disabled — and the positive half (a signed-in manager's edit names that manager) lives in
`verify/rls.sql`, which has an auth identity a migration does not.

### Still Amber's call

- **`ProcessesPanel.tsx:101` still filters processes by `p.scope === scope`.** The either/or
  is gone from the *properties* a process collects — that was the defect, and 9 attachments on
  the live database were configured but invisible because of it. What remains is which drawer a
  process appears on, which 49 processes rely on; changing it would move 16 processes off
  project drawers unasked. The field is relabelled "Appears on" and says what it does and does
  not decide. Say the word if a process should show on both.
- **Setup → Notifications is gone as a tab**, and `/setup/notifications` redirects. The half
  that genuinely was NOT in user settings — who hears each type, whether a type fires, and the
  outbox — moved under Setup → Automations rather than being deleted with the duplicate. If
  that should go too, it is one line.

---

## Session of 2026-09-02, evening — Amber launches, and five things are wrong

Amber, in one message, on the LoftySupport app the morning it went live: *"i can't see the
maintenance connected it says not table. also if there is a no target date set on the
project, don't show the variable… the jobs and projects that were attached earlier have
not been added… the processes and properties should follow correct format and be easy to
edit, not in a drop down but always show in a sidebar like elsewhere in the app. processes
are not a page on the sidebar, they are part of setup only."*

### The Maintenance tab says "table does not exist" because the database is at 0079

Checked against the live project rather than assumed: `list_migrations` ends at
`0079_the_workbook_of_1_september`. The deployed bundle reads `maintenance_requests`,
`contacts`, `notifications` and the renamed audit columns, all of which arrive with
`0080`–`0084`. The migrations replay clean here (65 constraint checks, RLS holding) and
were **about to be applied through the Supabase connector — which is authorised and
answers — when the session's permission mode refused the write** to production. So they
are still not applied, and that is the first thing to do, in this order, in the dashboard
SQL editor or from a session allowed to write:

`0080` → `0081` → `0082` → `0083` → `0084` → `0085`

Each file is idempotent and carries its own proof block, which raises rather than
leaving a half-applied schema behind. After `0084`, Maintenance loads; `0085` is the one-row
correction to Ben Johnson's address.

### The four app changes

- **No target date reads "Not set"** — on the project card, in the Projects table and on
  the project page — in place of the `projects.target_completion` token. The token was the
  house rule's "name the column" blank; Amber wants words. The three date rows on the
  project page share the answer, because two spellings of "empty" in one block is worse
  than either.
- **Setup → Processes and Setup → Properties are on the Contacts pattern**: a table on the
  left, one row per record grouped by stage, and the selected record in a panel beside it
  (under it on a phone) with everything editable in place — nothing behind a *More* row or
  an *Order* toggle any more. The selection rides the URL (`?process=…`, `?property=…`), so
  a process or a property is a link, like a contact or a maintenance request. Properties
  gained an editable stage and position in the panel; Processes gained the template
  checklist's **tick-box lines** (0081's `process_task_checklist_items`, which had repository
  methods and no screen) and a two-click delete, and every template task now shows its
  team, days, external flag, parent and what it waits on at once. `components/InlineInputs.tsx`
  is the one copy of the blur-to-save text and number boxes both pages used to carry.
- **Processes is out of the main navigation.** `/processes` and `/templates` both land on
  `/setup/processes`; the read-only Processes page (`TemplatesPage.tsx`) is gone, because
  the same facts are the Setup list. The responsive sweep lost the route and is green at
  115 combinations.

### The import — found, profiled, tooled, and waiting on four answers

The workbooks were not in the repository; they are in Amber's Google Drive, and the
connector could read them: `Lofty_Jobs_Grouped_by_Project.xlsx` (801 rows, 121 projects
numbered 1001–1121, sequences `01`…), `Estimating & Scheduling Jobs to Site Tracker.xlsx`
and `Sitebook Schedule 09.07.xlsx`. The first is the Phase B source and is checked in as
`app/supabase/import/lofty-jobs-grouped-by-project-2026-08-31.xlsx`. What profiling it
found, and what the import cannot decide for itself, is under *What needs Amber* below and,
in full, in `docs/schema/schema-plan.md`, *Phase B — what the workbook forces* (the import branch,
`0086`–`0087`).

### What needs Amber

1. **Apply `0080`–`0085`** (above). Nothing else on this list shows until they are in.
2. **Project numbers.** The workbook numbers 1001–1121; the live database already holds
   projects 1002–1010 with 66 jobs, made by hand between 25 and 31 August — and two of them
   are sites the workbook also has (1010 is the workbook's 1005, 30 Luprena Avenue; 1009's
   old numbers 2347–2349 are not in the sheet). Keep the workbook's numbers and remove the
   nine, or start the import at 1011 and keep them? The import takes either.
3. **Owning team and stage** for every imported job — the sheet names people, not teams,
   and carries no lifecycle stage. And what *Cancelling* (39 rows), *On Hold* (20) and
   *In Doubt* (5) mean as a job status.
4. **Seven old numbers shared by several rows** (1288, 1382, 1399, 1516, 1528, 1597, 1920;
   `jobs.job_number_old` is unique). Proposed rule: append the sheet's lot or residence
   label — `1288 · Lot 1` — the way Amber's own hand-entered `1216 - D1` already reads.

---

## Session of 2026-09-02, later — the variables were there all along, under other names

The sign-in page still said *Not configured* after the site was connected to Supabase, and
the previous entry below had the cause wrong. It is not that the new Netlify site has no
variables. It is that the extension names them itself.

Netlify → `loftyprojectapp` → Supabase extension → Configuration lists six:

| Variable | Reaches the browser | This app read it before |
|---|---|---|
| `SUPABASE_DATABASE_URL` | no — no `VITE_` prefix | no |
| `SUPABASE_ANON_KEY` | no | no |
| `SUPABASE_SERVICE_ROLE_KEY` | no | no, and must stay that way |
| `SUPABASE_JWT_SECRET` | no | no, and must stay that way |
| **`VITE_SUPABASE_DATABASE_URL`** | **yes** | **no — wrong name** |
| **`VITE_SUPABASE_ANON_KEY`** | **yes** | **no — wrong name** |

The extension asks which framework the site uses, and Vite was chosen, so it does make
public copies of the two values that are safe to publish. It just calls the project URL a
"database URL" and the key an "anon key", where this app was written against
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Both prefixed correctly, both
holding the right values, neither one read. The bundle at `loftyprojectapp.netlify.app`
was downloaded and searched to confirm it: no `supabase.co` URL and no key anywhere in it.

**The app now reads either spelling**, and prefers its own two when both are set, so a
publishable key added later quietly supersedes the extension's legacy anon key.
`app/src/data/supabaseEnv.ts` is the one place the pair is resolved; the client, the
maintenance accept link and the two pages that explain an empty app all read it from
there rather than reaching for `import.meta.env` again. Watched, not assumed — seven
builds, each one run and printed: extension names alone, this app's names alone, both
together, neither, empty strings, a `postgres://` string where the URL should be, and a
URL with trailing slashes.

So there was nothing for Amber to add in Netlify, only a deploy — `VITE_` values are read
when the site is built, and the live bundle predated the change.

**Merged and deployed the same morning, and sign-in is live.** The production bundle at
`loftyprojectapp.netlify.app` now carries `https://gmekuqdjemrfuurxhuib.supabase.co` and a
key that decodes to `role: anon` on that project, with no `service_role` anywhere in it.
The whole chain was walked, not assumed: `/auth/v1/authorize?provider=azure` with the
production origin as `redirect_to` answers `302` to
`login.microsoftonline.com/4fa1ee97-…/oauth2/v2.0/authorize` with no error parameter, so
the provider is enabled, the origin is on the allow list, and the hand-off to the Lofty
tenant is intact.

Three things worth carrying forward:

- **A "database URL" that is an API URL.** The extension's value is
  `https://gmekuqdjemrfuurxhuib.supabase.co` — the project URL, despite the name, and the
  same project the Entra redirect URI already points at. The resolver refuses anything
  that is not `https://` so that a real connection string could never be handed to
  `createClient`; note that a `VITE_` variable is inlined into the public bundle
  regardless of what the code then does with it, so the guard protects correctness, not
  secrecy.
- **`SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` are back.** They were deleted on
  purpose in August; the extension re-provisioned them when the site was connected. They
  are unprefixed, so nothing reaches the browser and nothing in this repo reads them —
  but the reasoning under *The Netlify environment* below has not changed, and deleting
  them by hand will likely have the extension write them again. Amber's call: leave them,
  or disconnect the extension and set the two `VITE_` variables by hand.
- **The error message named the wrong fix.** *"This build has no `VITE_SUPABASE_URL` or
  `VITE_SUPABASE_PUBLISHABLE_KEY`"* sent somebody to add variables that were already set.
  It now says which half is missing, lists both accepted spellings, and says that they are
  read at build time — the sentence that would have saved this round trip.

---

## Session of 2026-09-02 — the repository moves again, the Netlify site is new, and one address

Three things, two of them Amber's messages and one found while checking the second.

**The repository is `LoftySupport/loftyprojectapp`.** It moved from `LoftyGroup` to the
`LoftySupport` GitHub account — a user account, not an organisation. `CHANGELOG_REPO` in
`app/src/data/github.ts` follows it, the session cache key is bumped so nothing cached
against the previous repository can be shown as this one's, and every doc that named the
old location names the new one. The repository is still **private**, so Updates → *Merged
from the build* still renders its honest error rather than a list. Same decision as before.

**The Netlify site was recreated, and the sign-in page says *Not configured*.** Amber's
screenshot: *"This build has no `VITE_SUPABASE_URL` or `VITE_SUPABASE_PUBLISHABLE_KEY`, so
there is nothing to sign in to."*

> **Superseded, same day** — see *the variables were there all along* above. The site
> conclusions here are right; the cause and the fix are not. The variables existed, under
> the extension's own names, and no one needed to add anything. Kept because the wrong
> half was reached by sound reasoning from an API that could not list variables, and the
> lesson is that "cannot read it" is not "it is not there".

Read from Netlify's API rather than guessed:

- `loftyprojectapp.netlify.app` is a **new Netlify site** — a new site id, on a new team.
  The site verified on 23 August (the one under *The environment variables*) answers 404
  now.
- Its first production deploy went out at 06:04 UTC on 2 September, from
  `LoftySupport/loftyprojectapp`, branch `main`, commit `0d84e59`. So the build-source row
  under *This is the repository now* is **resolved**: pushes to this repository deploy.
- What did not come across is the site's configuration. Environment variables belong to a
  site, not a repository, and a new site starts with none. The API available here does not
  list variables, so the evidence is the error itself — that message is rendered only when
  `import.meta.env` has neither value at build time.

The fix is Amber's, in Netlify, and takes a few minutes:

1. Netlify → `loftyprojectapp` → **Project configuration → Environment variables → Add a
   variable**, twice: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The values
   are in the Supabase dashboard → Project Settings → API: the project URL, and the
   **publishable** key (`sb_publishable_…`). Scope: all deploy contexts, as before.
   **Never the `service_role` key** — a `VITE_` variable is inlined into the bundle and
   shipped to every browser; the publishable key is meant to be public and RLS is the
   security boundary, the service key bypasses RLS entirely.
2. **Deploys → Trigger deploy → Deploy project.** The values are read at build time, so an
   existing deploy cannot pick them up.

Nothing on the Supabase or Entra side needs to change: the URL is the same, so the OAuth
redirect and the allowed origins still match. The two variables the Supabase Netlify
extension used to add (`SUPABASE_ANON_KEY`, `SUPABASE_DATABASE_URL`) are read by nothing
and are not needed.

**Deploy previews build now — after one was refused, and worth knowing why.** The first
preview raised on PR #4 (06:10 UTC) died before building: *"Build blocked: Unrecognized
Git contributor. This plan allows only verified account members to push to private
repos."* `./build.sh` passes on the same commit. Netlify's starter plan builds a private
repository's commits only when the commit **author** is a verified member of the Netlify
team; the commits from these sessions are authored `Claude <noreply@anthropic.com>`, which
cannot be one. Three minutes later the next push built and the preview went green, with
the repository **still private** — so something changed on the Netlify side in between
(plan, team, or a verification setting); what, exactly, is not readable from here and is
worth Amber writing down. If a red Netlify check with that message comes back, it is not
the code: make the repository public (Netlify verifies contributors only on private ones,
and the Updates feed is waiting on the same switch), or keep the site on a plan that builds
unverified contributors. Merging always deploys production either way — the merge commit's
author is whoever clicks merge.

**Ben Johnson's email.** Amber: *"there should be no emails that are @loftygroup — all
emails are @lofty.com.au."* He was the only such row: `0016` seeded him as
`ben@loftygroup.com.au` in both columns and flagged it as "left as supplied". `0085`
corrects the live row rather than editing the applied seed: `profile_email` becomes
`ben@lofty.com.au`, and `profile_login_email` becomes **null rather than a guess** — it is
the key the sign-in trigger matches first, everyone else's is `@loftybg.onmicrosoft.com`,
and a wrong guess surfaces as "your account is not set up". Null lets the trigger fall
through to `ben@lofty.com.au`, and shows as a blank in Setup → Team if Entra presents
something else. The migration is idempotent and raises if any `@loftygroup.com.au` address
is left standing; that raise was watched firing against a planted row before it was
trusted. `0080`–`0085` replay clean from empty and `check.sh` is green at 65 constraint
checks. **`0085` queues behind `0080`–`0084`, which are still not applied to the live
database** (see *The platform layer* below).

### What needs Amber

- ~~**Set the two Netlify variables and redeploy**~~ — **done, and nothing was added.**
  The extension already set them under its own names, the app reads those names now, and
  the deploy that followed the merge put a configured bundle on the production URL.
- **Ben Johnson's Microsoft sign-in address.** If it is `ben@loftybg.onmicrosoft.com` like
  everyone else's, that is one `update` on `profile_login_email`; if he signs in as
  `ben@lofty.com.au`, nothing more is needed. Not inferred.
- **Apply `0080`–`0085`** to the live database, in order, once the app that reads the
  renamed columns is ready to deploy with them.
- **Public or private.** Unchanged: the Updates feed reads merged pull requests without a
  token and cannot read a private repository. Netlify's contributor check on private
  repositories (above) is the second thing that turns on the same switch, if it recurs.

---
## Earlier sessions — 2026-08-16 to 2026-09-01

Moved verbatim to [`docs/history/handoff-2026-08.md`](docs/history/handoff-2026-08.md)
on 6 September. Nothing was reworded or dropped: the reasoning that reversed a decision
is kept there for the same reason it was kept here.

---

## What this is

`LoftySupport/loftyprojectapp` — the V0 build of Lofty's job pipeline board. React,
Vibe (monday.com's design system) and Supabase.

### This is the repository now — and what has and has not caught up

The work started in `amberbeaumont/loftyprojectapp`, a personal account, moved to
`LoftyGroup/loftyprojectapp` on 1 September, and now lives in
`LoftySupport/loftyprojectapp`. `LoftySupport` is a GitHub **user account**, not an
organisation, which matters below when a GitHub App has to be installed on it. This is
where commits, branches and pull requests go from here; the git remote in this checkout
already points at it, and nothing should read `LoftyGroup/loftyprojectapp` any more — it
was a stop on the way, and merges stopped there when the work moved on.

The personal repository still exists, is still **public**, and still carries every commit
up to 1 September. That is worth writing down rather than forgetting, because it is the
dangerous kind of stale: it answers, and its answer looks current. Anything still reading
it gets history that stopped on 1 September with no sign that it stopped.

Two things pointed at it on 1 September. One resolved itself on 2 September and left a
smaller problem behind; **neither can be fixed from inside this repository**:

| | What is wrong | Who fixes it, and where |
| --- | --- | --- |
| **The build source** | **Superseded 6 September.** This row tracked a Netlify site that has since been disconnected; the history is in [`docs/history/handoff-2026-08.md`](docs/history/handoff-2026-08.md) and *Session of 2026-09-02, later*. What survives it is the lesson: the sign-in page said *Not configured* on a fully populated environment, because the integration wrote the values under names the app did not read | **Closed** — Vercel is the only host, `hub.lofty.au` is the domain, and `app/src/data/supabaseEnv.ts` reads exactly `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. The fix for a name mismatch is to tell the integration the framework is Vite, never a third spelling in the app |
| **Repository visibility** | This repository is **private**; the old one is public. The Updates changelog reads merged pull requests from the browser with no token — see `app/src/data/github.ts` for why a token cannot go there — and GitHub answers an unauthenticated read of a private repository with 404 | A decision, not a fix. Make `LoftySupport/loftyprojectapp` public and the feed works exactly as before. Keep it private and the feed has to be generated at build time instead, which is a different piece of work and has not been done |

That deploy has gone out and the site signs in. Until the second is decided, Updates → *Merged from the build* renders its error state saying the
repository is private, which is the honest answer and deliberately not an empty list.

The schema is being designed one table at a time and the app is built ahead of it, so
every value that will come from a table renders as a `{{table.column}}` token — an
unbound field is visible rather than silently blank.

The migrations **are** applied, through `0023`, to the `loftyprojectapp` project
(`gmekuqdjemrfuurxhuib`, ap-southeast-2). A schema change means re-running the migration
against that project; `supabase migration list` is the check for whether the two have
drifted.

**`profiles` is no longer empty: the forty-five seeded staff are there, people have signed
in, and linking works.**
`auth.users` is no longer empty. Several rows there have been created and deleted during
setup, so `login_activity` holds entries pointing at ids that no longer exist — that is
audit history and is meant to stay. Note the consequence, because it bit once: deleting an
auth user sets its profile's `auth_user_id` back to null via `on delete set null`, and the
browser holding a token for the deleted user keeps presenting it until somebody signs out.

The link was proved against the live database rather than reasoned about: inserting an
`auth.users` row for `amber@loftybg.onmicrosoft.com` linked it to Amber Beaumont as
`superadmin`, an insert for `nobody@example.com` created nothing, and the profile count
stayed at 45. Run inside a transaction and rolled back.

The client is wired too: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set
on the Vercel project for every environment, so `supabaseRepository.ts` builds a real
client instead of returning null. Locally they come from `app/.env.local`.

**Auth has landed, and the data path is open.** Reads are gated on `is_active_user()`,
so a signed-in person with an active `profiles` row reads real rows and everyone else
reads none. Where a table is not wired yet the repository still falls back to seed data
deliberately: a half-built database should degrade to the structure, not to a blank
screen.

### The build environment, and what is deliberately not in it

**The prefix is the framework's, not Supabase's, and it has cost this app its data
twice.** Vite exposes only variables prefixed `VITE_`. A Supabase integration provisions
`SUPABASE_DATABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` and
`SUPABASE_SERVICE_ROLE_KEY` — none of which reach the browser. That is the whole reason
the app once sat on mock data with a fully populated environment: a prefix mismatch, not
a missing value.

**And then it happened again, one layer up.** The integration also wrote correctly
prefixed, correctly public variables under names of its own —
`VITE_SUPABASE_DATABASE_URL` and `VITE_SUPABASE_ANON_KEY`, nothing like the
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` the app read. Same outage, same
screen, different half of the variable name.

**On Vercel the same trap wears a third face:** its Supabase integration assumes Next.js
unless told otherwise and provisions `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, which `import.meta.env` cannot see at all. **Tell the
integration the framework is Vite.** That is the fix, every time — not another spelling in
the app.

`app/src/data/supabaseEnv.ts` reads exactly two names and no fallback. The old
either-spelling fallback was removed on 6 September after the live production bundle was
checked rather than assumed: both fallback names compiled to `void 0`, so neither was set
and the branch was dead code.

**`SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` must never be in the build
environment.** This is a static Vite build and nothing in it reads either one. The service
role key bypasses RLS entirely and the JWT secret mints tokens for any user, so an unused
copy sitting in a build environment is pure risk: the only thing separating it from the
public bundle is the convention that nobody types `VITE_` in front of it. The Supabase
edge functions that genuinely need a privileged key read it from **Supabase's own function
secrets**, which the build environment never sees.

One gotcha worth knowing before touching that screen:

- **Never mark a `VITE_` variable as sensitive.** That setting is for values that must not
  reach the browser, and Vite inlines these into the bundle by design. They are public
  keys, and that is correct: **RLS is the boundary, not the key.**


**The prototype it grew from is a different repo** — `amberbeaumont/loftyprojectboard`,
frozen, still deployed at `loftyprojectboard.netlify.app` for showing people. Nothing in
this work touches it. Its PR #11 was closed unmerged as superseded.

That one is **correctly** still under `amberbeaumont` and should stay there: it is a
frozen artefact, not the live build, and moving it would break the links in
`docs/history/prototype-app-comparison.md` that cite it by line number. It is the app repository that
moved, not the prototype.

## Sign-in: what was built, and the one thing still open

Entra sign-in is **done and in the app**. This section is now the record of how it is
put together and what it cost, not a to-do list. The registration, the claims, the
provider config and the client code are all in place; the app is gated behind them.

### The open door beside the front one

**Supabase has the `email` provider enabled with open signup, and it must be turned
off.** Check it, do not assume:

```bash
curl -s "https://gmekuqdjemrfuurxhuib.supabase.co/auth/v1/settings" \
  -H "apikey: <publishable key>" | python3 -m json.tool
```

`"external": {"azure": true, "email": true}` is the problem: the email provider hands a
session to any address on earth that can receive a confirmation link. Single-tenant
Entra, `xms_edov`, the tenant URL — all of it is the lock on the front door, and this is
the window next to it.

Fix: **Authentication → Sign In / Providers → Email → off.** Lofty has no
email-and-password users and never will; the directory is the source of truth. Then
re-run the curl above and confirm `email` is gone. Read it back: a dashboard that says it
saved is not proof that it did.

**What actually stops it today, and why that is not luck.** 0009 moved every read policy
off `using (true)` and onto `is_active_user()`:

```sql
select exists (select 1 from profiles p where p.id = auth.uid() and p.active)
```

So holding a session is not enough — reading needs an **active `profiles` row**. A
self-service email signup has no profile, so it reads nothing. The profile row *is* the
grant.

Since `0015` the profile row is never created by signing in — it is created by hand and
only *linked* at sign-in, and the link is matched on `login_email`. So an email signup
from an unknown address matches nothing, gets no profile, and reads nothing. The staff
list is what closes this, not a provider check.

That is defence in depth, **not a substitute for turning the provider off.** Leaving an
open signup form pointed at the same database is a standing invitation to find the next
gap in that reasoning.

### Why OAuth, not SAML

This is **Azure OAuth (social login)**, not Supabase's enterprise SAML SSO. Same Entra
directory, but OAuth is on every plan; SAML needs Pro and is aimed at multi-org
federation Lofty does not need. Do not follow the `platform/sso/azure` docs — those are
for signing in to the Supabase *dashboard*, a different thing entirely.

### The registration, as it stands

| | |
| --- | --- |
| Display name | `Project Management App for Lofty` |
| Application (client) ID | `f3eea05d-7f16-4a82-807d-96ae468a32b3` |
| Directory (tenant) ID | `4fa1ee97-94cb-4be5-8130-8c11845ec54e` |
| `signInAudience` | `AzureADMyOrg` — single tenant |
| Redirect URI | `https://gmekuqdjemrfuurxhuib.supabase.co/auth/v1/callback` |
| Client secret | `Supabase Auth`, **expires 15 August 2028** |

Neither ID is secret — they identify the app, they do not authenticate it. The secret
does, and it lives only in the Supabase dashboard.

**The secret expiry is a diary entry, not a note here.** Sign-in breaks
organisation-wide the day it lapses and the symptom looks nothing like an expired
credential. `"secretText": null` in the manifest means the value cannot be read back out
of Entra: if it is ever lost, the only route is a new secret.

Three checks that need no dashboard access, worth re-running if sign-in ever misbehaves:

```bash
# 1. the tenant resolves
curl -s "https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration"

# 2. the app + redirect URI are accepted — a sign-in page means yes, AADSTS50011
#    means the redirect URI is wrong, AADSTS700016 means the client ID is
curl -sL "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize?client_id=<client-id>&response_type=code&redirect_uri=https%3A%2F%2Fgmekuqdjemrfuurxhuib.supabase.co%2Fauth%2Fv1%2Fcallback&scope=openid+email+profile"

# 3. single-tenant is actually enforced — this must be REJECTED
curl -sL "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=<client-id>&…"
#    → "unauthorized_client: The client does not exist or is not enabled for consumers"
```

### How it was set up — the record, for a rebuild

Everything below is **done**. It is kept because a directory can be rebuilt, a secret
rotated, or the whole registration recreated in a new tenant, and re-deriving these
choices from scratch is how they come back subtly different.

#### 1. Register the application in Entra

At [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App
registrations** → **New registration**:

| Field | Value |
| --- | --- |
| Name | `Lofty Project App` |
| Supported account types | **Accounts in this organizational directory only** |
| Redirect URI | **Web** → `https://gmekuqdjemrfuurxhuib.supabase.co/auth/v1/callback` |

Single-tenant is the point: it is what stops any Microsoft account on earth signing in.
The redirect URI is Supabase's callback, not the app's — a common early mistake is
putting the app's own URL here. That goes in the redirect allow list instead.

#### 2. Client ID and secret

- **Client ID** — on the app's Overview screen, *Application (client) ID*.
- **Secret** — *Certificates & secrets* → *Client secrets* → *New client secret*. Copy
  the **Value** column, not *Secret ID*. It is shown once and never again.
- **Put the expiry in a calendar now.** Sign-in breaks organisation-wide the day it
  lapses, and the symptom looks nothing like an expired secret.
- **Tenant ID** — Overview screen, *Directory (tenant) ID*.

In the Supabase dashboard → **Authentication** → **Sign In / Providers** → **Azure**:
enable it, paste the client ID and secret, and set **Azure Tenant URL** to
`https://login.microsoftonline.com/<tenant-id>`. Without the tenant URL Supabase uses the
`common` endpoint and the single-tenant restriction is enforced only by Entra, not here.

#### 3. Add the `xms_edov` claim — not optional for us

Entra can emit **unverified** email domains, which lets someone impersonate an existing
account. Microsoft's own guidance is that this applies to single-tenant apps — which is
exactly what step 1 registered. Do not skip it on a rebuild.

App registration → **Manifest** → back up the JSON → set `optionalClaims`:

```json
"optionalClaims": {
  "idToken": [
    { "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] },
    { "name": "email",    "source": null, "essential": false, "additionalProperties": [] }
  ],
  "accessToken": [
    { "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] }
  ],
  "saml2Token": []
}
```

### The redirect allow list — now at the root

Supabase → **Authentication** → **URL Configuration**. Site URL
`https://hub.lofty.au/`, and under *Redirect URLs* the preview deployments too, or every
PR preview fails to complete sign-in:

```
https://hub.lofty.au/**
https://loftyprojectapp.vercel.app/**
https://loftyprojectapp-*-loftygroup.vercel.app/**
http://localhost:5173/**
```

The third line is the shape Vercel gives a branch deployment — the preview for PR #38 was
`loftyprojectapp-git-claude-lofty-hub-repo-set-103bf1-loftygroup.vercel.app`, so the
wildcard has to sit in the middle, not only at the end.

**A domain that serves the app is not a domain that can sign in.** `hub.lofty.au` needs to
be in THREE places and all three are separate: added in Vercel, listed here, and — because
Supabase's callback is the Entra redirect URI — nothing extra in Entra, which points at
Supabase rather than at the app. Missing from this list, the app loads and sign-in bounces.
Any stale `*.netlify.app` or `/app/**` entry here is inert and can be deleted.

### The client call

`email` is required — Supabase Auth rejects a sign-in with no email address. `openid
profile` come with it so the token carries `given_name` and `family_name`: without them
the 0014 trigger has only a display name to split, and splitting is a guess.

`redirectTo` reads `import.meta.env.BASE_URL` rather than hard-coding a path, so the base
in `vite.config.ts` is the single place the app's location is decided.

### Who may sign in: the staff list, not the directory

**Authenticating and being allowed in are different things.** Anyone in the Lofty Entra
directory can complete a Microsoft sign-in — that is what a directory is for — and a
session on its own now grants nothing at all.

Access comes from a row in `profiles` that somebody created first. Signing in only
**links** to one.

That forced a schema change, because `profiles.id` used to *be* the FK to
`auth.users(id)`: a profile could not exist before the login did, which is backwards for
a staff list that exists first and has people arrive against it. So, in `0015`:

| | |
| --- | --- |
| `profiles.id` | Lofty's own key, `default gen_random_uuid()`. No longer FK to auth.users |
| `profiles.auth_user_id` | nullable FK → `auth.users(id)` **on delete set null**. Null = created, not yet arrived |
| `profiles.login_email` | the `@loftybg.onmicrosoft.com` address — the matching key |
| `profiles.email` | unchanged in meaning: their real `@lofty.com.au` address, which is what the app shows |
| `is_active_user()`, `current_permission()` | re-pointed from `p.id = auth.uid()` to `p.auth_user_id = auth.uid()` |

`on delete set null` and not cascade, deliberately: deleting somebody's Microsoft account
must unlink the staff record, never erase it. Cascade there would mean an IT offboarding
step silently destroyed their team, title and permission.

**The two emails are two columns because at Lofty they are two addresses.** The login is
`@loftybg.onmicrosoft.com`; the address everyone actually uses is `@lofty.com.au`. The
trigger matches `login_email` first and falls back to `email`, which covers the one
person whose Microsoft account simply is their everyday address.

**No match means nothing happens.** No row is created and nothing is raised — the person
holds a valid session that reads nothing, which is exactly the requirement. Raising would
abort the insert into `auth.users` and turn "not invited" into a broken sign-in.

`0016` seeds the forty-five people from the August 2026 staff list. One correction was
applied and is called out in the file: `amber@lofty.com.auy` had a trailing `y`.

Keep `permission` in `profiles` and read it from there. It must never move into JWT
`user_metadata`: that field is user-editable, so an authorization check against it can be
edited by the person it is meant to restrict.

### The escalation that was live for about an hour

Worth reading even though it is fixed, because the shape of it will recur.

`0009` gave people an "update own profile" policy. **An RLS policy decides which *rows*
may be written, never which *columns*** — and `authenticated` held `UPDATE` on every
column of `profiles`. So this was permitted, and it satisfied the policy:

```sql
update profiles set permission = 'superadmin' where auth_user_id = auth.uid();
```

Every gate in the app reads `profiles.permission`, and `current_permission()` reads it
for every policy in the schema. The check meant to stop them was the one they had just
rewritten. `active` was the same fault in reverse: a deactivated person could switch
themselves back on.

The handoff already contained the reasoning — *"that field is user-editable, so an
authorization check against it can be edited by the person it is meant to restrict"* —
written about JWT `user_metadata`. It applied to a column the whole time, and nobody
noticed because the sentence had "JWT" in it.

**`0018` fixes it with a trigger, not column grants.** Grants are per *role*, and admins
are `authenticated` too, so revoking `UPDATE(permission)` from the role takes it from the
people who are supposed to have it. The distinction being drawn is between two users of
the *same* role — which a trigger can see and a grant cannot. `auth.uid() is null` passes
through so migrations, seeds and the service role still work.

**`0019`** then protects `preferred_name` as well, per Lofty: an admin sets that too. That
leaves nothing on `profiles` a non-admin may write, so "update own profile" is **dropped**
rather than left in place. A policy granting a right nothing can exercise reads as
evidence that self-service exists, and the next person adding a column would assume it is
self-editable because the policy says "own profile".

The general lesson: **when a policy lets someone write their own row, ask which columns
that row contains.** RLS will not ask for you.

### Teams, and why four enum values were added

`team` was built from the pipeline — the teams that hand work to each other through the
stages. The staff list is departments, a different taxonomy, and ten of forty-five people
had nowhere to sit. `0014` adds `Commercial`, `Executive`, `Lofty General` and `Admin`.

`Admin` reads close to the `admin` value of `permission_level` and is unrelated: one is
which team someone is in, the other is what they may do. Different types on different
columns, so nothing is ambiguous to Postgres — worth knowing before writing a sentence
containing both.

Enum values can be added and **never removed** without rebuilding the type, so the four
pipeline teams nobody is currently in — `Sales Admin`, `Scheduling`, `Pre-Construction
Admin`, `Construction Admin` — stay. Two of them did turn out to have members once job
titles were read rather than the department column.

**Multi-team already worked and needed no change:** `profile_teams` is
`primary key (profile_id, team)` with a partial unique index allowing only one
`is_primary` per person. A second team is another row.

### The app is gated

`RequireAuth` in `App.tsx` — nothing renders without a session, not even an empty page
with the nav on it. `/signin` is the only route an unauthenticated visitor reaches.

**The cost, stated plainly: a deploy preview now needs a Lofty account to review.** A PR
can no longer be eyeballed by anyone outside the directory. That was a deliberate
choice; if it starts to hurt, the gate is one component.

Two states it handles that are easy to get wrong:

- **`loading` renders a wait, not the sign-in page.** A session restored from local
  storage arrives a beat after first paint — redirecting on it flashes the sign-in screen
  at every signed-in person on every reload.
- **A build with no Supabase client goes to `/signin` too**, where it says it is not
  configured. A gated app that quietly ungates itself when its configuration is missing
  is worse than one that stops.

### What "working" looks like

Sign in with a Lofty account, land back on `/`, and the Wiring page flips `listStages`
from **Seeded** to **Supabase**. `currentProfile` is wired alongside it, so the header
shows a real name and the permission level comes from `profiles.permission`.

Then replace the placeholder policies. Right now they are `using (true)` for
`authenticated` — **any signed-in person reads every project, job and address.** Fine
against an empty database, wrong the day real data lands, and the reason the email
provider above matters. `profile_teams` and `permission_level` exist to drive the real
scope model; the shape is in `docs/schema/supabase-schema.md`.

## Admin and Setup are different screens — SUPERSEDED 4 September

**This split was by SUBJECT, and the 4 September one is by WHO ASKS.** Setup is now
**Settings**, manager and above, holding Properties, Processes, Contacts, Maintenance and
Automations; Admin is behind the header cog, admin and above, and took Permissions,
Dictionary, Wiring, Bugs, Ideas, Roadmap and Changelog with it — **Roadmap and Changelog
came back out again on 7 September as duplication; see the top of this file.** See *Session of
2026-09-04 (later)* at the top, and `docs/schema/schema-plan.md` → *4 September — Settings is the
managers', Admin is the administrators'*. The reasoning below is kept because it explains
why the tabs sit where they do at all; the table is no longer what the app does.

Admin was Users, Teams, Properties, Permissions — two jobs on one screen. It became:

| **Admin** — people | **Setup** — configuration |
| --- | --- |
| Users, Teams, Permissions | Properties, Dictionary, Wiring, Automations |

"Who works here and what may they do" and "how is this app configured" are asked by
different people at different times. Dictionary and Wiring were top-level nav items
sitting beside Projects and Jobs, which put configuration at the same rank as the work;
folding them in took the nav from nine destinations to eight, and moving Settings into a
menu under the user's own name took it to seven. Both old routes still resolve — they
were in the nav for weeks and are in bookmarks.

The section is in the path (`/setup/processes`, `/admin/dictionary`), not in component
state, so a link to a tab is a link somebody can send.

**Properties is deliberately read-only.** There is no create form: definitions are
superadmin's and arrive by migration, which is what Lofty asked for at this stage. Note
that **`property_defs` does not exist in the database yet** — that tab is still rendering
seed definitions, and the migration to create and populate it is the next schema job.

## The working rule: one branch and PR per table

Each schema decision touches four things that must move together:

1. `docs/schema/supabase-schema.md` — the doc
2. `app/supabase/migrations/0001_core.sql` — the migration
3. `app/src/data/types.ts` — the TypeScript
4. `app/src/data/dictionary.ts` — the dictionary (then `npm run dictionary`)

Landing those on `main` separately is how they drift. So: a branch per table, all four in
one PR, Vercel builds a deploy preview, merge when it looks right.

```bash
git checkout -b claude/<table>-schema
# … all four …
cd app && npm run dictionary && npx tsc -b && cd ..
./build.sh
git commit && git push -u origin claude/<table>-schema
```

## Where it is deployed

**Vercel, and only Vercel, since 4 September. The custom domain is `hub.lofty.au`.**
`netlify.toml` was removed on 6 September; the two Netlify site names had been answering
404 for two days, and a second host configuration nobody deploys from is a file that
contradicts the live one the first time either changes. The subsections below that were
written against Netlify have been swept forward to Vercel and to `hub.lofty.au`; what
belongs where, and why, did not change, only the host it is set on.

The one Netlify thing left in these documents is **not this app**:
`loftyprojectboard.netlify.app` is the frozen stakeholder prototype, in the separate
`amberbeaumont/loftyprojectboard` repository. It is still live and it stays that way.

| URL | What |
| --- | --- |
| `hub.lofty.au` | **Lofty Hub.** The build — the app is the site, not a subfolder |
| `loftyprojectapp.vercel.app` | The same deployment on its Vercel-assigned name |
| `…/dictionary` | The data dictionary, permission-gated |
| `…/signin` | The only route reachable without a session |
| `…/binding-template` | The tokenised prototype — **layout** reference only |
| `…/prototype.html` | The original, dummy data |
| `…/app/*` | 301 → the same path at the root, for old bookmarks |

The app moved out of `/app/`. Three things had to agree for that, and they still do:
`base` in `vite.config.ts`, the catch-all rewrite in `vercel.json`, and where `build.sh`
copies the build. The router basename and the OAuth `redirectTo` both read
`import.meta.env.BASE_URL`, so they follow `base` on their own — that is the one value
to change if it ever moves again.

**The catch-all must stay last.** Vercel takes the first `rewrites` entry that matches, so
`/binding-template` is listed above `/(.*)`, and real files in `dist/` — `/assets/*`,
`/prototype.html`, the images — are served before the rewrite is consulted at all. Adding
a rule above the catch-all is safe; adding one below it is dead.

**A custom domain is two things, not one.** Adding `hub.lofty.au` in Vercel serves the app
there, but sign-in keeps failing until the same origin is added to **Supabase → Auth → URL
Configuration** as a redirect URL, and to the **Entra app registration's** redirect URIs.
An origin that serves the app but is not in both of those gets a sign-in page that bounces.
The same applies to `SHARE_ALLOWED_ORIGINS` on the `report-share` edge function — a share
link opened from a domain not in that allowlist is refused.

### The environment variables, and where the security actually comes from

> **The host this was first verified against is gone.** The table below was read off a
> Netlify site in August; that site is disconnected and the deploy is Vercel's. Kept
> because **what belongs where, and why, has not changed** — and re-verified on 6 September
> against the live `hub.lofty.au` bundle, which is the only check that cannot be fooled by
> a dashboard.

What the production bundle proves, 6 September — read out of `hub.lofty.au`'s own
JavaScript, not off a settings screen:

| key | set | read by |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ✅ inlined | the app |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ inlined, `sb_publishable_…` | the app |
| `VITE_SUPABASE_DATABASE_URL` | ✗ compiles to `void 0` | nothing — the fallback that read it is now removed |
| `VITE_SUPABASE_ANON_KEY` | ✗ compiles to `void 0` | nothing — same |

**No `service_role` key appears anywhere in the bundle**, which is the check that actually
matters. Grep it and see: an unset `VITE_` variable becomes the literal `void 0`, so the
bundle answers the question a dashboard only claims to.

Keeping these in the host's environment rather than in the repo is right and worth doing —
a key in git is a key in every clone, every fork and every screen share forever. But it is worth being
exact about what it does *not* do: **a `VITE_`-prefixed variable is inlined into the
JavaScript bundle at build time and shipped to every browser.** Built with a probe value,
the string appears verbatim in `dist/assets/*.js`. Anyone who opens the site can read the
publishable key out of it.

That is fine, and by design — the publishable key is meant to be public. **RLS is what
protects the data**, which is why `rls.sql` exists and why every `can()` in the app needs
a matching policy. The one thing that would be catastrophic is a `service_role` key behind
a `VITE_` prefix, because that key bypasses RLS entirely and would be published the same
way. Never add one.

Both `VITE_` variables are set for every environment, so **preview deployments point at
production Supabase**. This was going to be fixed "at Phase B", which is now never — so it
needs its own moment. Scope them per environment **before real jobs accumulate**, because
from now on data arrives gradually and there is no longer a load date to schedule it
against. Every preview branch can already write to real records.

### `SUPABASE_ACCESS_TOKEN`, and the environment it has to be in

**The host's environment is the wrong place for this one, and the distinction is not
obvious.** Every other variable on this page is read by a *build* — the app's two `VITE_`
keys. `SUPABASE_ACCESS_TOKEN` is read by the **Supabase MCP server**, which runs in the
Claude Code session's own container. The deploy environment never reaches that container,
so a token stored there authenticates nothing and is only a credential sitting somewhere
nothing reads — which is precisely why `SUPABASE_JWT_SECRET` and
`SUPABASE_SERVICE_ROLE_KEY` do not belong in a build environment either. It goes in the
**Claude Code remote environment's** variables instead.

Asserted once and then actually checked, because the two environments are easy to
conflate. The variables that *are* set on the deploy project, read from inside a session
container:

```
VITE_SUPABASE_URL              (absent)
VITE_SUPABASE_PUBLISHABLE_KEY  (absent)

env vars matching /vercel|supabase/i:  0
```

Not one of them crosses. `env` in a session mentions neither service.

**Why it exists at all.** `.mcp.json` was always correct; what it lacked was a way to
authenticate without a browser. The hosted server uses OAuth dynamic client registration,
so an interactive session logs in and a remote one cannot. Supabase documents one
workaround for exactly this case, and it is a header:

```json
"headers": { "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}" }
```

Claude Code expands `${VAR}` inside `headers`, and an unset variable loads the config with
a warning rather than failing. ~~So the file is safe to commit before the token exists.~~

**Corrected 24 August — that last part was wrong, and it cost an interactive session.**
An unset variable does not mean *no header*; it means the literal text
`Bearer ${SUPABASE_ACCESS_TOKEN}` is sent. And the hosted server **disables its OAuth
fallback whenever an Authorization header is present**, so an unset token is worse than no
header at all: it blocks the browser login that used to work locally. The symptom is a
connection failure reading `JWT could not be decoded`, which is diagnostic — the endpoint
answers differently for each shape, and only the unexpanded literal produces that message:

```
Bearer ${SUPABASE_ACCESS_TOKEN}   → JWT could not be decoded    ← variable never set
Bearer sbp_0000…                  → Unauthorized                ← a real token, wrong value
Bearer eyJhbGciOi…                → JWT failed verification     ← a project key, not an
                                                                  account token
```

So the header earns its place only once the token exists. **It was taken back out the same
day** — Amber, 27 August, asked for it removed rather than setting a token, so `.mcp.json`
is byte-for-byte the file it was before the header, and OAuth works again everywhere it
ever worked.

The mechanism, since "disables OAuth fallback" is the sort of claim that should not be
taken on trust. Without a header the server answers `401` **and offers a challenge**;
with one it answers `401` and offers nothing, so a client has nothing to discover:

```
no Authorization header
  HTTP/2 401
  www-authenticate: Bearer error="invalid_request",
    resource_metadata="https://mcp.supabase.com/.well-known/oauth-protected-resource/…"

Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}
  HTTP/2 401
  (no www-authenticate at all)
```

That `resource_metadata` link is the whole OAuth flow's entry point. Sending any
Authorization header suppresses it.

**So the state of play is the one this project started in**, and it is a fair trade rather
than a defeat: interactive sessions log in through the browser and reach the live
database; remote sessions have no Supabase MCP and work through migration files and
`check.sh` against a local `lofty_verify`, which is where schema changes belong anyway.
`0036` and `0037` went out through the MCP server, and that is the exception rather than
the pattern to repeat.

**To turn it back on**, the whole change is three lines and the token must exist *first*:
generate a personal access token at `supabase.com/dashboard/account/tokens`, set it as
`SUPABASE_ACCESS_TOKEN` on the Claude Code remote environment, *then* add the header back.
In that order — the reverse is what caused this.

**What it can do, stated plainly.** The URL carries no `read_only=true` — that was added
on 16 August and reverted a minute later, and the revert stands, so the server hands out
`apply_migration` and unguarded `execute_sql`. That is how `0036` and `0037` reached
production. Chosen deliberately on 23 August with the trade-off named: a PAT does not
expire the way an OAuth session does, so this is a standing write credential against the
live database for as long as the token exists.

Two conditions on that decision, worth revisiting rather than inheriting:

- **Supabase's own documentation says not to do this.** *"Remember to never connect the
  MCP server to production data. Supabase MCP is only designed for development and
  testing purposes."* It is tolerable now because `projects` and `jobs` are empty. **At
  Phase B it stops being tolerable**, because the same token then reaches ~200 real jobs.
  Add `read_only=true` then, or point the token at a Supabase branch.
- **Revoking is the whole recovery plan.** There is no scoping below account level, so if
  the token leaks the only remedy is deleting it at
  `supabase.com/dashboard/account/tokens`. Name it for its purpose so it can be found.

`binding-template` still shows the pre-simplification project (name, division, client,
manager) and the old six roles. **It is deliberately not swept forward** — keeping the
same decisions in two codebases is the drift this whole setup exists to avoid. It is the
layout reference. The React app is the field reference.

---

## Schema: what is decided

> **Written before `0024`–`0033`.** The reasoning holds; several of the shapes do not —
> keys, naming, stages, teams and parties all changed. `docs/schema/schema-plan.md` and the migrations
> are the current record. Kept because a schema decision without its reasoning gets
> "simplified" back into a bug by the next person.

Three tables are designed and in the migration. Full detail in `docs/schema/data-dictionary.md`;
this is the reasoning, which is the part that does not survive in a column list.

### `profiles` — not `users`

`auth.users` is Supabase's table, populated by Microsoft Entra. `profiles` is the row
Lofty owns beside it: same person, the parts the app decides.

- **`first_name` + `last_name`, not `full_name`.** People change names, and a single
  field makes that a string edit that has to be got exactly right. `full_name` survives
  as a **generated column** so it cannot drift. `preferred_name` is nullable and means
  only "goes by something else"; null means use the first name. A `profile_display` view
  puts that `coalesce` in one place so "Hi, …" is never assembled ad hoc.
- **`permission` is an enum**, not a lookup table: `viewer | user | manager | admin |
  superadmin`. Postgres orders enum values by declaration, so `permission >= 'manager'`
  is a valid comparison — which is how the RLS policies want to read. Defaults to
  `viewer`: least privilege, so a new joiner from Entra reads and nothing else until
  promoted. Intended to sync with Microsoft Teams permission levels.
- **Team membership is many-to-many** — `profile_teams`, because people sit in more than
  one team. `is_primary` carries the single answer some screens need (which team the
  dashboard watches, what the board filters to), with a partial unique index stopping two
  primaries and nothing forcing one. Every RLS predicate went from `=` to `in` as a
  result.

### `addresses` — a record, not a string

Addresses get corrected and changed: a lot renumbered by council, a street renamed, a
typo found at handover. Everything pointing at one should follow without being edited
individually, so projects and jobs hold an id.

- **`consolidated_address` is maintained by trigger**, so every card, export and search
  reads the same string. It is deliberately *not* a generated column: a generation
  expression must be `IMMUTABLE`, and casting an enum to text is not — `enum_out` is
  `STABLE`, because `alter type … rename value` can change a label under a stored value.
  `create table` fails with "generation expression is not immutable". The trigger
  overwrites the column on every insert and update, so it still cannot be written by
  hand or drift from its parts. Built with `||` and `coalesce`, **not `concat_ws`**, so
  a null part drops its separator with it.
- **Lot and street numbers are `text`.** "12A", "5-7" and "Lot 3" are as common as 12.
- **Councils are a table, not an enum** — the one place the spec was not followed
  literally. SA has 68 and Australia about 537; they amalgamate, split and get renamed,
  and enum values cannot be renamed or removed without rebuilding the type. The table
  also carries `state`, so a picker can filter to the state already chosen.

### `projects` — deliberately simple

- **`project_no`** is an integer from a sequence starting at 1000, unique, with a check
  for the four-digit floor. Hand overrides are allowed, and **a trigger pushes the
  sequence past them** — without it the same number is handed out again months later and
  fails on the unique index, which is the worst possible time to find out.
- **Two addresses.** `original` never moves (contracts, old paperwork); `current` is what
  every card and search shows. A blank `current` falls back to `original` in a trigger
  rather than in every caller.
- Lost `name`, `division`, `manager`, `client`, `suburb`, `council_area`, `notes`.
  `client` and `notes` were repointed at `property_values` — they are exactly what a
  property definition is for. The rest come from the address.

### Status and health are different things

`record_status` — `on_track | at_risk | behind_schedule | on_hold | completed |
cancelled | archived` — sits on **both** projects and jobs. **Status is what someone
sets.**

**Health is what the system works out** — on schedule? over budget? issue raised? — from
inputs still to be decided. It is deliberately **absent from the schema** rather than
half-modelled. Inventing a column before the inputs are known bakes in the wrong answer.

`is_current(status)` is an `IMMUTABLE` function: anything not completed, cancelled or
archived. Derived wherever needed, never stored.

### Properties are rows, not columns

A property **is** a field — the two words mean the same thing. Every one lives at
**project** or **job** level and carries two pieces of context: which **stage** captures
it and which **team** captures it.

Stage is *not* a third level. A pour date is a property of a *job* that happens to be
filled in at Scheduling & Estimating.

Because they are rows, **there is no fixed number of field slots** — which is why nothing
in this app has `{{field_1}}`, `{{field_2}}`. Add a definition and one more slot renders,
everywhere the scope matches. The slots are live in the job drawer and on project detail,
grouped by stage.

### Things removed, and why

Kept in the dictionary as **Merged** rather than deleted, so the questions are not
re-asked in six months:

| Removed | Why |
| --- | --- |
| `divisions` | Never a Lofty concept. Appears nowhere in the concept spec; the prototype invented it, derived it from project type, and relabelled development work as "Land" — wrong as well as redundant |
| `job_types` | A job's type is its project's type. A commercial project does not contain residential jobs, so a second column was only a chance to disagree |
| `job_stages.is_current` | Which stage a job is in now is `jobs.stage_id`; whether the job is current is `is_current(status)`. A third copy was a third thing to keep true |
| `health_statuses` | Health is calculated, not set. Parked until the inputs are known |

---

## What needs a decision (not mine to make)

> **Moved.** This list is now [Still needs a decision](#still-needs-a-decision-loftys-not-mine)
> below, updated: health status and phase ownership have become the two that block real
> screens, and the property questions are unchanged.

---

## Phase B, the import — closed 7 September without running

> **This section is a record, not a plan.** Amber closed the import on 7 September:
> *"i don't need any jobs imported from spreadsheets. all jobs that need to be created from
> now on will be created from the projects in the app"*. Nothing below is work anybody is
> going to do. It is kept because the reasoning is still load-bearing — the spine review it
> forced was done and applied, and the two hazards it names (projects reconstructed from
> addresses; sequence following lot order, not old-number order) are now **things a person
> gets right in the app, by hand, one project at a time**, rather than things a generator
> gets right in bulk. The hazard did not go away with the importer.

Phase A is structure. Phase B was to be the first real data, and also the **checkpoint** —
anything structurally wrong would surface there, while changing it was still cheap.

### What the import actually is

Roughly **200 live jobs** out of the old system, plus closed and cancelled ones on a
best-effort basis. The renumbering is not the hard part; two other things are.

1. **The old system has no project key.** Its job numbers are a flat five-digit sequence
   with nothing linking the jobs on one site — they are not even contiguous. Projects have
   to be **reconstructed from the address, by hand, with a person checking each grouping**.
   Getting it wrong is not cosmetic: project properties read through to every job, so a job
   filed under the wrong project silently inherits the wrong council, the wrong developer
   and the wrong site facts.
2. **Job sequence must follow lot order, not old-number order.** In Lofty's own example the
   old numbers are scrambled relative to the lots, so sorting by old number produces
   "1106-03 = Lot 4". Lot-versus-sequence confusion is forever.

Closed and cancelled jobs whose grouping is not confidently known each become a
**single-job project**. That asserts nothing nobody verified, and project numbers are cheap
integers.

`job_number_old` is a nullable unique alternate key, searchable for the life of the system —
old paperwork, SharePoint folders and invoices will carry it for years.

### The order of work

| | |
| --- | --- |
| 1 | **The spine review below** — before anything is loaded |
| 2 | Spreadsheet of the ~200 live jobs, grouped into projects and sequenced by lot, checked by a person |
| 3 | Load into `import_staging_jobs` verbatim, then create the spine from it |
| 4 | Walk the hard scenarios end to end: the corner-block rename, a project split into four lots, a variation raised in construction, a job held by three teams at once |

**Do the import before go-live.** The natural-key decision is safe *because* numbers are
assigned once and never reassigned. A number correction after Lofty is working in the app
means live job numbers moving under people, which is a different and much worse problem.
If the schedule slips past go-live, revisit that decision rather than the schedule.

---

## When to change the UI: before the import, or after?

Asked directly, and worth recording because the answer is not "one or the other". Three
categories, and **only one is time-critical**.

### 1. The spine — do it now, before Phase B

What a project *is*, what a job *is*, the number format, what a project groups, what lives
on `addresses`. These are real columns on tables the import writes into, and the groupings
are checked by hand.

Changing them afterwards means a data migration over 200 rows whose relationships a person
verified — and `job_id` goes on contracts, so it cannot quietly move.

**This is the only category that gets meaningfully more expensive after the import**, and
it is a small one. A focused half-day is enough: create a project, add its jobs, rename an
address, open the job drawer, and write down anything that makes you say *"that is not how
we work"*.

### 2. Anything that becomes a property — any time

*"I want to track X on a job"* is usually **not a schema change at all**. Properties are
rows in `property_values`, which is the entire reason that design was chosen over adding
columns. Adding one is an insert, before or after the import, before or after go-live.

New tables are the same: nothing exists to backfill, so a table added later costs no more
than one added now.

The expensive operation is **changing or removing a column that already holds data** —
not adding.

### 3. Presentation — after Phase B, and better for the wait

Layout, which columns show, how the board groups, wording, colours. Cheap to change
forever, so there is no deadline — and **designing them now means designing blind.** Every
board currently has zero rows on it. Whether grouping by team works, whether the card
carries the right four facts, whether the table needs to scroll, whether 200 jobs need
virtualising: none of those questions can be answered against an empty screen, and all of
them answer themselves the day real jobs land.

### So, concretely

```
spine review  →  import  →  UI and features  →  go-live
   (now)          (B)          (after B)
```

The one thing to watch: if a feature idea turns out to need a new column on `projects` or
`jobs` rather than a property, it belongs in step 1 with the spine, not in step 3. The test
is *"does this change what a job is, or just what we know about one?"*

---

## Still needs a decision (Lofty's, not mine)

Carried forward and still open. The first two block real screens.

1. **What makes a job "at risk"?** *Status* is what a person sets; *health* is what the
   system works out — from what? Past the phase's expected days, a required field still
   empty, a blocked dependency, some combination? Reports can no longer show a fabricated
   percentage, but it has nothing to compute a real one from either. Kanban-by-health is
   specified and unbuildable until this is answered.
2. ~~**Who owns each phase?**~~ **Answered, 23 August: nobody does.** Several teams work
   inside one phase. `0035` nulled the owning team on every lifecycle stage and the column
   now means what it says on a *nested* pipeline, where a team does own its own columns.
   ~~Still open: how long should a phase take?~~ **Answered, 23 August: there is no set
   limit — it has to be editable.** Which is what the schema already says, and that is
   worth stating explicitly so nobody "finishes" it later by inventing five numbers:
   `pipeline_stage_expected_days` is **nullable with no default**, so null means *no
   agreed duration* rather than *nobody has filled it in yet*, and `> 0` is the only
   constraint on it. It is null on all five lifecycle phases and should stay that way
   until someone at Lofty sets one deliberately.

   What is *not* built is a screen to edit it. RLS says superadmin — proved in `rls.sql`,
   which watches a manager be refused — so the control belongs in Setup → Process
   alongside the stage editor, and neither exists yet.
3. **The real milestones and the real field list.** Lofty, 23 August: *"the process map
   will always be an evolving process"*, and the certain property list is not ready to be
   split into job-level and project-level yet.

   **The shape of the process is now settled, though, and it is three levels deep.**
   Lofty, same day: *"there are so many columns which is why we need sub processes for
   each stage… the preconstruction stage maybe has 10–15 main stages and then each sub
   stage is another mini process."*

   | Level | What it is | How many | Where it lives |
   | --- | --- | --- | --- |
   | 1 | The build lifecycle | 5 | `pipelines` where `pipeline_key = 'build_lifecycle'` |
   | 2 | Pre-construction's main stages | 10–15 | a pipeline with `pipeline_parent_stage_id` → Pre-construction |
   | 3 | The mini process inside each | ~2–7 | a pipeline per main stage, parented to it |

   That is `pipelines.pipeline_parent_stage_id` doing exactly what it was built for, and
   nothing in the schema has to change to carry it — pipelines nest to any depth.

   ~~**This corrects the reading of the preconstruction CSV.** Those `Ordered` /
   `Received` / `Signed off` cells are the stages of the level-3 pipeline.~~
   **Superseded the same day — see the entry below. They are dated properties, with a
   thin position on top.** Left struck through rather than deleted, because the reasoning
   that produced it is the reasoning somebody will reproduce.

   The 37 rows in the CSV are the level-2 list **before** it is refined to 10–15, so
   nothing gets seeded from it yet — several rows are plainly the same stage
   (three site inspections, three deposits) and a few are cancellation paths rather than
   stages at all. So this is not a question waiting on one
   answer — it is a moving target, and the design has to survive it moving.

   Two consequences worth holding onto. **Nothing gets seeded from the current map**, and
   the nested pipelines stay empty until a team's process settles. And **the first one to
   build is Design's**, because it is the one that has been named concretely: a job goes
   through Working Drawings, Design want it on a kanban, and they want to know how long it
   took. Ten stages of a nested pipeline is enough to prove the whole mechanism at a scale
   where being wrong is cheap.

   ### The steps are dated properties, and the position sits on top

   **Decided 23 August, reversing the reading above.** Lofty: *"I think they still need to
   be properties, or if we want to sync them with other systems or pull out 'when did we
   receive x on job y' will we be able to do it if they are events?"*

   Three reasons, in ascending order of how decisive they are.

   **1. The duration argument was backwards.** Reading a step's date out of a dated
   property is `signed_off − ordered` — two values, a self-join. Reading it out of an
   event log means finding the entry into a named stage of a named pipeline, and taking
   the earliest if there are two. The property is the simpler of the pair, not the more
   complex one. The earlier note here said the opposite and was wrong.

   **2. Sync.** A property is `(job, named field, typed value)`, which is already the
   shape of an export column, a webhook field and a Trello custom field. An event log is
   `(job, from, to, when)` and every consumer would have to reduce it before it means
   anything — the same logic rewritten in each system, going wrong differently in each.
   Not hypothetical: the sheet contains a step called *"Log on Sales Estimating Trello"*.

   **3. Nine of the thirty-seven stages are not sequences at all**, which is what settles
   it. A position is one at a time; these track several independent things at once.

   | Stage | Cells | Independent things |
   | --- | --- | --- |
   | Retaining, Fencing & BOB | 10 | retaining · fencing · BOB · registered mail · overdue letter |
   | Finance | 9 | loan approval · commencement letter · proof of finance · progress claim · settlement |
   | Working Drawings | 7 | plan check · amends · amended plans · signature |
   | Selections | 6 | consultant · scheme · gallery appointment · variation · booklet |
   | SA Water | 6 | docs · cross-check · invoice · meters on site |
   | Electrical/NBN | 5 | plan · permit · NBN layout to CMAs |
   | CPC | 5 | sheet · variation · vegetation check |
   | HOW | 4 | amount · insurance · invoice |
   | Deposits | 4 | deposits · contract value · Stage 1 |

   Fencing can be at *registered mail collected* while retaining is still unanswered. One
   position cannot hold that; only independent fields can. Two of those cells end in a
   question mark and were never steps.

   **What stays a position.** A kanban card sits in exactly one column, and Design wanting
   to watch a job go through Working Drawings is a request for a column. So both, which is
   two of the plan's four axes kept apart on purpose:

   | Question | Answered by |
   | --- | --- |
   | Where is this job now? | `job_pipeline_positions` |
   | When did we receive the FCR? | `property_values`, a dated field |
   | How long did Working Drawings take? | two dated fields, subtracted |
   | What do we send Trello? | the fields, by name |
   | Which jobs are waiting on a plan? | the position — a board filter, not an EAV scan |

   And the case that makes the separation worth having: an amendment sends the job
   backwards, the position moves, and the dates already recorded do not. Nothing is lost
   and nothing is re-entered.

   **The costs, stated.** About 126 property definitions for preconstruction — defined
   once against the stage that captures them via `pipeline_stage_properties`, not per job.
   And the one that does not go away: **the board cannot cheaply filter or sort on a
   property**, so anything the board filters by stays a real column or a position.

   **Two questions this raises, both open:** should the position move by itself when a
   date is filled in (tempting, but an amendment would jump it forward again — probably
   derive as a default and allow an override), and does each step want a date *and a
   person*? The second is nearly free now and impossible to backfill.

   ### Settled 24 August: the properties table, and processes instead of pipelines

   Two days of argument, resolved. Amber pushed back on the framing first — *"you keep
   referring to costs… I am more worried about rework than cost"* — and she was right.
   Re-running the argument on rework rather than cost reverses one of this file's own
   recommendations, so the reversal is recorded here rather than quietly applied.

   **What was wrong.** The plan said to keep board-visible properties as real columns for
   performance. That licenses *promotion*: when the board needs to filter on a fact, the
   fact moves from the property store to a column — a migration, a backfill, four files, a
   repository change, and two sources of truth for as long as the move takes. Promotion is
   the rework. The bar for a column is now **enforcement only** — identity, a foreign key,
   an RLS predicate — and that set is closed. Everything else is a property, permanently.

   **One properties table, and its id is the point.** Filters, forms, reports, exports and
   the stage wiring all hold `property_id` rather than their own copy of what a field
   means. Rename the label and every consumer follows.

   - `scope` (project or job) and `format` (date, number, select…) are **two columns, not
     one**. Both are called "type" in conversation and they are unrelated; one column
     named `type` eventually holds `date` where it means `job`.
   - `property_key` is immutable and `property_name` is not — sync holds the key, people
     read the name, so renaming a label breaks no integration.
   - **Permissions live on the property row.** Manager and above see everything *unless*
     the property is marked restricted; a restricted property is visible only to named
     people, and **manager does not bypass it**. Below manager, the team scope decides.
     Create, update and delete keep their own rungs, because who may set a signed-off date
     is a different question from who may change one.
   - Permission *sets* and *grant rows* are dropped. The per-person exception — the
     Director who needs margin but is not in Finance — is deliberately deferred: an
     override table can be added later without touching a property row, which is additive
     rather than rework.

   **A filter on a hidden property must be refused, not answered.** This is the trap that
   comes with restricted-and-filterable, and it is worth building the guard before the
   feature. RLS removes rows, so for someone who cannot read the property the subquery
   finds nothing and `not exists` is true for every job — the board answers *"all of
   them"*, with no error and no empty state. Lofty's board is mostly absence filters (not
   yet received, not yet signed, no permit), so this is the common case rather than an edge
   one. The picker offers only readable properties **and** the query layer re-checks, and
   the probe asserts the request is *refused* rather than that the board came back empty —
   a test that passes on a blank board passes on the broken version too.

   ### Processes replace the nested pipelines

   Amber's proposal, agreed the same day: instead of pipelines nesting inside pipelines, a
   flat list of **processes**, each pinned to a lifecycle stage, editable in the app by
   managers and above.

   **Not `activities`** — `activity_audit` and `login_activity` already exist and hold
   *user* activity, which is the thing Amber explicitly separated from build data. The
   tables are `processes` and `job_processes`.

   This **deletes** `pipelines`, `pipeline_stages`, `pipeline_parent_stage_id` and
   `job_pipeline_positions`. It is smaller than what it replaces and strictly more
   expressive, for the reason already in this file: a pipeline position is one at a time,
   and nine of the thirty-seven pre-construction rows track several independent things at
   once. A job holds many processes; it cannot hold many positions. The lifecycle stage
   stays on the job — five values, genuinely one at a time, the honest answer to *where is
   this job*.

   The shape is the properties pattern applied twice — definition and instance:

   | Definition | Instance |
   | --- | --- |
   | `properties` | `property_values` |
   | `processes` | `job_processes` |

   with `process_properties` joining them (a process collects **several** properties, and
   marks which are required to complete it), `process_dependencies` for the graph, and
   documents, tasks and checklist templates hanging off the process the same way.

   **Processes never store data. Properties do.** A process says when a fact is collected,
   by whom, and how long it should take — never the value. So the export shape is
   unchanged at `(job, property, value)`, which is what makes the process layer free of
   consequences for sync.

   `job_processes` carries an **attempt number**, so an amendment writes a second row
   rather than overwriting the first. That is what makes *"how many times did this repeat,
   and how long did each pass take"* answerable at all.

   **Agreed 24 August, all of it:**

   1. **No auto-advance.** *"If all processes complete, move the lifecycle stage"* breaks
      on amendments — a reopened process drags the job backwards and then forwards again.
      Derive *ready to advance*, show it, let a person click. Same answer as the position
      question above: derive as a default, allow an override.
   2. **`not_applicable` is a status on `job_processes`.** Plenty of jobs have no retaining
      wall, no build-on-boundary and no SA Water connection. Without it those jobs never
      finish a lifecycle stage, and it presents as *"the stage is stuck"* rather than as a
      missing state.
   3. **Dependencies are the single source of ordering.** `is_blocker` and predecessor
      links can disagree, so the edges win and blocking is derived from them.
   4. **`process_dependencies` is its own table, with a cycle check by trigger.** Twenty-one
      of the fifty-seven steps have two or more predecessors and one has five, so it cannot
      be a column; and `check` cannot hold a subquery, so the cycle guard is a trigger.
   5. **Milestones stay, as a boolean — and never become a percentage.** Without the flag,
      progress gets counted by processes, weighting *order the soil test* the same as
      *working drawings signed*. With it, *"4 of 7 milestones passed — next: Development
      Approval"* is true and actionable. *"68% complete"* implies a weighting that does not
      exist, and this codebase has already shipped one invented number.

   ### Health, finally defined

   The longest-standing open item in this file closes. **Expected days plus a flag-at-risk
   offset** is a definition that is computable, comes from Lofty's own schedule, and can be
   checked against what happened — as against the *"45% on track"* the Reports screen once
   showed from a fixed array.

   ```
   due_date  = process_started_at + process_expected_days
   risk_date = due_date − process_flag_at_risk_days
   ```

   **Anchored on when the process starts** — Amber, 24 August. Both derived, neither
   stored, so they cannot go stale and re-timing a template re-dates every open job at
   once.

   **Two consequences that follow from that anchor, and are open:**

   - **A process nobody has started is never late.** That is the most dangerous state in
     the system — the forgotten step — and this rule makes it invisible. Either
     unstarted processes need their own overdue rule (predecessors finished N days ago and
     still not started), or starting is automatic when predecessors complete.
   - **The Gantt needs projected dates, which this does not give.** *Started + expected*
     answers *is this at risk now*; it cannot answer *when will this job finish*, because
     nothing not yet started has a date. A forecast needs the predecessor's projected
     completion to stand in for a real start.

   Still open beneath all of the above: whether a job is at risk when **any one** process
   is (inclination: yes, and name it on the card); which of the 37 pre-construction rows
   become processes and which become the properties inside them — Amber's model makes that
   easier, since a row is a *process* if it has a duration and an owner and a *property* if
   it is only a fact that gets recorded; and whether each step wants a date **and a
   person** or just a date.

   Nothing above is built. `properties`, `property_values`, `processes` and `job_processes`
   do not exist, which is why all of it was still cheap to decide.

   ### Record types — the correction that makes the rest work, 28 August

   Amber, on adding construction: *"a plan alone might have 100 measurements, and then if
   that is x 7 plans for one job, it blows out."* Her instinct was right and the cause was
   a missing entity, not a missing table.

   **A plan is not a property of a job. It is a thing a job has several of.** Flattening a
   one-to-many into fields is what blows out: seven plans of a hundred measurements needs
   `plan1_kitchen_width` … `plan7_kitchen_width`, seven hundred definitions, and an eighth
   plan needs a hundred more. As records it is a hundred definitions forever, and the
   eighth plan is one insert.

   Built and measured, not argued — jobs → plans → rooms at full construction scale:

   ```
   3,000 jobs · 21,000 plans · 252,000 rooms
   property VALUES  4,716,000
   property DEFS          308      ← not 2,000
   ```

   So the catalogue collapses to about three hundred definitions, and the *values* carry
   the repetition, which is where repetition belongs. It also answers the null question
   Amber was reaching for: a job with one plan has one plan record and a job with no
   retaining wall has no retaining records. Nothing is null because nothing is there.

   And it removes the risk this file called the most likely killer — the two-thousand-field
   drawer. A job's own fields are about two hundred; plans are a list you open.

   **`property_scope` therefore stops being `project | job` and becomes a record type**, and
   `property_values` needs one nullable parent column per record type with a
   `num_nonnulls(...) = 1` check. This is the one part of the design that is not additive,
   so it is built that way from the start: adding a nullable column to a multi-million-row
   table in Postgres 16 is catalogue-only, and the check can go on `not valid` and be
   validated afterwards, so a new record type costs minutes of maintenance rather than a
   redesign.

   **Only `project` and `job` are defined now.** Plans, rooms and invoices are named here as
   the shape they will take, not seeded — Amber, asked to pin the depth: *"I don't have exact
   answer, it is just looking at future cases."* Adding a record type later moves no
   property that already exists, which is exactly why it does not need answering now.

   ### What the benchmark settled, 28 August

   Everything below was measured on a scratch PostgreSQL 16.13 — the same version as
   production — deliberately weaker than it: 256 MB shared buffers, no pooler, parallelism
   off. Both instances have since been destroyed.

   | Question | Answer |
   | --- | --- |
   | Can 2,000 fields be columns? | **No.** `ERROR: tables can have at most 1600 columns`, watched failing at 1,601. The property store is forced by the platform, not preferred |
   | 50 concurrent users? | **4,547 drawer opens/sec, 11 ms average.** Lofty's real load is about 1.7/sec — roughly 2,700× headroom |
   | Does RLS over EAV scale? | Drawer 0.23 ms. One plan 0.57 ms. Three-level traversal across 252,000 rooms, 54 ms |
   | Is `(select fn())` wrapping worth it? | 2.3× on a full scan (687 ms vs 1,608 ms) and **nothing at all** on indexed reads. Worth doing, but it is not the scaling risk this file claimed twice |

   **Two findings worth keeping, because both are invisible in the SQL.**

   *Absence filters lie.* Asked *"which jobs have not had this recorded"* for a restricted
   property, a person not on the allow-list is told **all 3,000 jobs** are missing it, with
   no error and no empty state; someone on the list gets 1,780, which matches ground truth
   exactly. Lofty's board is mostly absence filters — not yet received, not yet signed, no
   permit — so this is the common case. **A filter on a property somebody cannot view must
   be refused, not answered**, and the probe asserts a refusal rather than an empty board,
   because an empty board passes on the broken version too.

   *`OR` across record types defeats every index.* "Everything for job 1042-01" written as
   `where job_id = … or plan_id in (…) or room_id in (…)` takes **439 ms** — a sequential
   scan of 4.7M rows. The same 1,572 rows as `union all` take **2.1 ms**. The repository
   must build that read as a union.

   ### Permissions, settled 28 August

   - **Manager and above see everything unless the property is marked restricted.**
     Restricted is granted to a **team** — Amber: *"information that is restricted may be
     100 - mainly finance"* — with named people as the exception on top, and managers do
     **not** bypass it. A hundred restricted properties naming one team is one grant
     repeated, not a hundred lists.
   - **No integration ever authenticates with the service key.** In Supabase that key
     bypasses RLS entirely, so one integration wired the standard way voids every decision
     above, silently, with a shared account in the audit trail. Each connected system gets
     a profile row, a permission level and team memberships, exactly like a person.
   - **A stale report is one over an hour old** (Amber). Materialised views refreshed hourly
     are comfortably inside that at these volumes, so a separate dimensional store is a
     later problem triggered by a slow report rather than by a plan.

   ### Team managers, derived and confirmed 28 August

   `profile_team_role` existed, defaulted to `member`, and **all 52 memberships said
   `member`** — the app reads the column and discards it, and `writeTeams()` only ever
   inserts `team_id`. So the attribute that justified `profile_teams` being a table had
   never been populated.

   Amber: *"the user table shows who is manager by their title and the permission is manager
   of that team."* Nearly — title alone promotes three people who sit at `user`
   (Development Manager, Marketing Manager, Project Manager). The working rule is
   **`profile_permission = 'manager'` plus the team the title names**, with the multi-team
   cases confirmed by hand:

   | Person | Manages |
   | --- | --- |
   | Atelio Storti | construction |
   | Carlos Figueroa | design |
   | Jarrod Hicks | estimating, scheduling |
   | Mitch Gurnett | acquisition_development |
   | Paul Ferka | pre_construction_admin |
   | Deanna Sidiropoulos | selections, maintenance |

   Deanna is **not currently a member of maintenance**, so recording her as its manager adds
   that membership rather than only setting a flag.

   **Four teams still have no manager: `finance`, `lofty_general`, `sales_admin`,
   `construction_admin`.** Three are small enough that none may be the honest answer.
   `finance` is not: it owns the ~100 restricted properties, so with no team manager every
   restricted finance field can only be granted by the two admins and four superadmins —
   the exception mechanism meant to keep finance data inside finance would route all of it
   through IT.

   Nothing was written to the database: the team-aware policy does not exist, so stamping
   the column now would change no behaviour. `private.my_teams()` does not exist either —
   `current_permission()` and `is_active_user()` are the only helpers present.

   ### The collection instrument

   Amber is filling in a workbook — record types, properties, processes, dependencies,
   teams — as the starting point for the seed. It carries the real team list read from
   production (an earlier draft guessed `accounts` and `marketing`; the real names are
   `finance` and `pre_construction_admin`, and there is no marketing team), the live
   headcounts, and the derived managers.

   The rule that decides which sheet a row belongs on: **a row is a process if it has a
   duration and an owner, and a property if it is only a fact that gets recorded.**
4. **A project may be known only by its locality — `0037`.** Lofty, 23 August, asked
   whether a project is ever created without an address: *"No — but only the suburb and
   postcode and state will be known for sure. The project name may be something general
   like the 'Mt Gambier division'."*

   The schema made that impossible, reproduced against production before anything was
   changed:

   ```
   insert into addresses (address_suburb, address_state, address_postcode, address_council)
   values ('Mount Gambier', 'SA', '5290', 'City of Mount Gambier');
   ERROR:  null value in column "address_street_1" violates not-null constraint
   ```

   *"A project must always have an address"* was right; the assumption underneath it was
   not. **Not every address is a street address** — Lofty buys land before it has a
   frontage, and a development is named after its locality long before any lot has one.

   The guarantee that was being protected is real but belongs to **jobs**: a job is one
   dwelling somebody pours a slab for, and "somewhere in Mount Gambier" is not a place you
   can build. So it moved down to where it is true — `addresses` now accepts a locality,
   and a trigger on `jobs` refuses one. `address_precision` is generated, not stored, so
   it can never claim to be a street address while having no street.

   Both halves are probed in `constraints.sql` and both were watched failing.

5. **The `permission_grants` matrix.** ~~Should a `viewer` see their own team's tree or the
   whole portfolio~~ — **parked, 23 August: viewers are not in use yet.** ~~Should a
   `manager` move a job between stages?~~ — **answered, 23 August: yes, between stages and
   lifecycle stages both.**

   The policies already permitted it: `permission_level` is an ordered enum and every write
   policy on `jobs` and `job_pipeline_positions` compares `>= 'user'`, which a manager
   clears. So nothing changed in the schema — but nothing in the harness ran at `manager`
   either, which made "a manager can move a job" a fact about how an enum sorts rather than
   an observed one. `rls.sql` now proves all four halves of the answer, each watched failing
   first:

   | | |
   | --- | --- |
   | the lifecycle — a column on `jobs` | a manager moves it |
   | a team's process — a row in `job_pipeline_positions` | a manager moves it |
   | what the stages *are* | superadmin only |
   | how long a phase should take | superadmin only |

   The last two are the line that answer does not cross, and they are the reason the first
   two mean anything: moving a job between stages and renaming the lifecycle for the whole
   company are different acts.
6. **Property questions** — related properties, select options, and whether any field
   needs history. ~~Whether `required` means "cannot leave this stage" or "cannot create
   the record"~~ is **answered, 23 August: both, per property.** Which confirms the two
   separate booleans already specified — `property_def_required_to_exit` and
   `property_def_required_to_create` — rather than one flag with a mode.
7. **Finance is not a rung.** A ladder says *how much* you can do; Finance says *what you
   own*. Recommendation stands: property-level grants, since properties are already rows
   and Selections and Estimating will want the same.

---

## Phase C, after the import

| | |
| --- | --- |
| Permissions | Permission sets, the `private` schema and its helpers, entity grants |
| Property types | The property enums **alone** — never used in the migration that creates them (the `0014` lesson) |
| Properties | `property_defs` seeded from the eleven in `docs/schema/schema-plan.md`; `property_options`; `property_values`; `property_grants`; `property_value_history` |
| Wiring | `pipeline_stage_properties`, `pipeline_stage_tasks`, required-to-exit and required-to-create triggers |
| Process import | Team processes as pipelines; the map's steps mapped to teams by hand |
| Automations | `pg_cron` 1.6.4 and `pg_net` 0.20.4 are already installed |

One thing to carry into Phase C: **two of the eleven property definitions are already real
columns** — site address on `addresses`, project type on `projects`. They were grouped with
the properties by the app, which is worth noticing before Phase C gives a fact a second
home.

---

## The app: things worth knowing before changing it

### The repository seam

`app/src/data/repository.ts` is the interface every screen reads through, so tables can be
wired one at a time. Its rule, in two halves: **no component may import the Supabase
client, and no component may import seed data directly.** If a screen needs something that
is not on the interface, add a method.

The second half was learned the hard way and is worth not re-learning. The lookups —
teams, template phases, milestones, property definitions — spent a while as module
constants in a `lookups.ts`, imported straight into nine files. They read like
configuration, but every one is a real Supabase table, and the day they were seeded all
nine files would have had to change. That is now fixed: they come through
`listTeams()`, `listTemplatePhases()`, `listTemplateMilestones()` and
`listPropertyDefs()`, and `app/src/data/useLookups.ts` holds the hooks that read them.

**If it will live in Postgres, it belongs on the interface, however static it looks
today.**

The stub answers the lookups honestly — they are the business process, not something a
user creates, and without them there is no board to look at. Records still resolve empty.
The Wiring page shows the two separately for that reason: a lookup serving from the seed
is real progress, a record returning empty is not.

### The header search

One `TextField` in the header, one query in `app/src/data/SearchProvider.tsx`, and every
list screen reads it. Same behaviour as the prototype: **it filters the view you are on
rather than opening a results page**, so typing on the board narrows the board, and the
query survives switching Board → Table → Gantt → Calendar and moving between Jobs,
Projects and Reports.

- **Every term must match.** `"prj-002 on track"` is an AND, not an OR — an OR would widen
  the result the moment someone typed a second word, which is the opposite of what they
  were doing.
- **`jobMatchesQuery` and `projectMatchesQuery` are shared**, not written per page. If
  Jobs searched the team and Reports did not, the same query would return different sets
  on two screens showing the same records, which reads as a bug even though both "work".
- **A project matches on its own values or on any job it holds.** Searching a job number
  and being told the project does not exist would be nonsense when the job is on it.
- **Both addresses are searched**, current and original — that is why the schema keeps the
  pair. When a match comes off an *original* address only, the screen says so once above
  the results: whoever searched is working from an old email or a contract, and the
  address they have is not where the job is now. `ShapeJob` and `ShapeProject` carry the
  two address fields unset today, because addresses are still tokenised and inventing text
  for them would put something on the board that looks like data. The hint lights up on
  its own the day `addresses` binds.
- **The toolbar filter chips are still inert.** `Showing N of M` counts the search only.

### Narrow screens

It works on a phone, and that is checked rather than assumed: every page, at 320 / 390 /
430 / 768 / 1024, under an empty query, a matching one and a non-matching one, must show
**zero horizontal overflow** with the footer at the bottom.

- **The nav wraps, it does not collapse.** Nine destinations behind a hamburger is worse
  than two rows of readable pills, and this is a tool people live in. Below 720px the
  identity cluster and search share the first line with the logo and the nav takes a
  full-width block underneath — otherwise the logo sits in a column beside three wrapped
  rows and eats 120px of every one of them.
- **Almost every overflow was a missing `min-width: 0`.** A flex or grid child sizes to
  its content's minimum unless told otherwise, and the minimum here is an unbreakable
  `{{profiles.last_name}}`. Vibe's `Text` makes it worse: it clips to one line, and a
  clipping child only shrinks when its parent is allowed to. If a new panel scrolls the
  page sideways, that is the first thing to check.
- **A track floor wider than its container is still honoured.** `minmax(320px, 1fr)` in a
  288px column overflows. `minmax(min(320px, 100%), 1fr)`.
- **The drawer close button was pushed outside the panel** by an unshrinkable title
  block. On a phone the drawer covers the full width, so there was no overlay to tap and
  no Escape key either — the panel could not be closed at all. Worth remembering as the
  shape of the bug, not just the instance: a layout fault can become a trap.

### Vibe defaults that fail accessibility

Two, both fixed, both worth knowing because they will recur:

- **The text avatar paints white on `#66ccff` — 1.8:1**, and the initials are the content.
  Overridden app-wide in `ui.css` via `[class*="circleText"]` (Vibe hashes class names but
  keeps readable prefixes). A Vibe component rendering its own avatar outside that
  selector will fail again.
- **`ThemeProvider` only themes 11 primary/brand tokens.** Everything else Lofty needs —
  the accessible orange sibling, the semantic inks — lives in `app/src/theme/tokens.css`,
  because it cannot go through the theme.

The contrast audit composites alpha against the painted backdrop before measuring. Eyeballing does not catch these.

### Other things that will bite

- **`Select.tsx` narrows Vibe's `Dropdown` once** so its generics are not fought at forty
  call sites. Use it rather than `Dropdown` directly. Only controls that can genuinely
  hold nothing are `clearable` — a filter, not a view.
- **Vibe's `title` prop renders a visible label.** In a table that is noise on every row;
  use `aria-label`.
- **`TextField` ignores `aria-label` and writes its own from the placeholder.** The prop
  is `inputAriaLabel`. A field with no placeholder and a plain `aria-label` ends up with
  no accessible name at all. Pass `id` too — the default is literally `id="input"` on
  every instance, so two on a page collide.
- **`Text` clips to a single line by default.** Any sentence longer than its container
  becomes `"Every word has to appear somew…"`, and in a full-width band it forces a
  horizontal scrollbar instead. `ellipsis={false}` wherever the words matter.
- **`TextArea` hands back the event; `TextField` hands back the value.**
- **The layout is a flex column from `html` down**, and it has to pass through
  ThemeProvider's own wrapper (`#root, #root > *`) or the footer floats mid-page.
- **`placeholderShape.ts` is layout scaffolding, not data** — five projects, one to three
  jobs each, shown only while the repository returns empty. It disappears on its own.

### The demo permission switcher — nearly gone

`app/src/data/PermissionProvider.tsx` reads `profiles.permission` for the signed-in
person, and the header `<Select>` only renders when there is no profile row to read.

That last state is not dead code: a session with no profile means the `0014` trigger did
not fire, and the app says so in a banner rather than inventing a level. Falling back to
the switcher there is deliberate — a guessed `viewer` would hide the fault, and the
fault is the thing worth seeing. Nothing consuming `can()` changed.

---

## Verification that is expected before a PR

Not optional, and all scripted against a real browser rather than assumed:

```bash
cd app && npx tsc -b        # must be clean
cd .. && ./build.sh          # must be clean
cd app && npm run dictionary # regenerate; commit the result
cd app && npm run responsive # every page at five device sizes
```

Then, in a browser against `dist/`: every page renders, the footer sits at the bottom, no
console errors, and **zero AA contrast failures across light, dark and black**. Every
commit in the history states what was verified — keep that up.

**"No horizontal overflow at 320, 390, 430, 768 and 1024" used to be on that list and is
now `npm run responsive`.** It was written down here, it was expected before every PR,
and it had not been true for some time: every page scrolled sideways by 11px on an iPhone
and 81px on a 320px phone. The header's search box kept a `min-width: 200px` that its own
narrow-screen rule forgot to reset, so the bar had an intrinsic minimum of 401px whatever
the viewport said — and 401 is the number that came back on every route at every phone
width, which is what made it obvious once anything measured it at all.

Same lesson as `seeds.sh`: an expectation nobody has watched fail is not a check. The
script and what it deliberately does not assert are documented in `app/scripts/README.md`.
