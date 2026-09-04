# Handoff

Everything a new session needs to pick this up. Read this first, then `schema-plan.md`.

<!-- generated:shipped -->
**No release has been published yet.** See [CHANGELOG.md](CHANGELOG.md) for what is waiting.

Unreleased: 119 changes since then —
- Added: Documents can be sent outside Lofty as a share link — a page a client opens with no login, with an optional password and a link that expires
- Added: A shared link shows the document as it was when it was sent, and says so, rather than re-reading Lofty every time it is opened
- Added: Real page-load timings are collected from Vercel deployments, grouped by page rather than by individual job or project
- Fixed: The version in the footer names the commit it was built from on Vercel as well as Netlify, instead of reading "local" on a real deployment
- Changed: Documents built in the Template Builder now carry Lofty's house document format — the same wordmark, colours, section rule and font as every other export
- …and 114 more.

<sub>Generated from commit trailers by `node scripts/changelog.mjs` — do not edit inside this block.</sub>
<!-- /generated:shipped -->

**Phase A is done and applied, and so is the property-and-process half of Phase C (`0076`–`0079`, 1 September).
Next job: [Phase B, the import](#next-phase-b-the-import)** — and before it, the spine review
described there, because that is the only category of change that gets expensive once 200 jobs
are in.

Last updated: 2026-09-04.

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
`schema-plan.md` → *4 September — Settings is the managers', Admin is the administrators'*.

### The cut is by who asks, not by subject

| Settings — `/setup`, manager+ | Admin — `/admin`, admin+ |
|---|---|
| Properties, Processes, Contacts, Maintenance, Automations | Users, Teams, Permissions, Dictionary, Wiring, Bugs, Ideas, Roadmap, Changelog |

Ten tabs became five and nine. Roadmap and Changelog on Admin are the **same components**
Updates renders, imported rather than copied — Updates stays in the footer for everybody,
because `0060`'s whole point is that the people who filed a request can read the queue.

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
`schema-plan.md` → *4 September*, quoted rather than paraphrased, because it is the
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
- **Every data block is in its empty state until Phase B lands.** Correct, not broken.

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

The Setup forms and the Wiring page: configuration, not records. The dashboard's hero tile
and workload figures, which are em dashes waiting on the health calculation — a spreadsheet
column of dashes claims a figure was computed. And screenshots on a bug report, which live
behind signed URLs; the file carries the count and says where to look.

### Still open

- **Nobody has opened one of these in Excel or Word on a real machine.** They are proved by
  a re-parse of the bytes (and the `.docx` is recognised by `file` as a Word 2007+ document
  with every XML part well-formed), which is a different claim from "Excel and Word on
  Amber's laptop are happy". First thing to do with a real machine.
- **The empty tables are the ones that will look wrong first.** With Phase B unimported,
  most screens have nothing to export and the button is disabled. The shapes to check after
  the import are the grouped exports on Jobs (a sheet per stage, empty groups dropped) and
  the job report's four sections.

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
| Jobs, Setup → Processes, Updates, Admin | already the slideout | unchanged |
| Contacts | a detail column beside the list | `SidePanel` |
| Maintenance | a detail column beside the list | `SidePanel` |
| Setup → Properties | a detail column beside the list | `SidePanel` |
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

**Meets it:** Jobs, Projects (both through `TableColumns`), Setup → Processes, Admin,
Updates.

**Does not yet — sortable headers to add:**

| screen | the columns that should sort | the filters it should carry |
| --- | --- | --- |
| Contacts | name, company, role, email, on-how-many | company, classification, team, awaiting sign-off |
| Maintenance | number, address, reported, trade, owner, health, next visit | trade, status, owner, job, warranty, **reported-date range** |
| Setup → Properties | label, stage, level, team, format, SLA | stage, level, team, format, restricted |
| Setup → Maintenance | category, SLA days | — |
| Setup → Notifications | type | — |
| Setup → Permissions | permission, capability | — |
| Setup → Dictionary | name, table, column, status | table, status |
| Setup → Wiring | method, table, wired | wired / not wired |
| Updates → Bugs / Ideas (`FeedbackList`) | title, stage, votes, comments, reported | stage, kind, reporter |
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
in full, in `schema-plan.md`, *Phase B — what the workbook forces* (the import branch,
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

## Session of 2026-09-01, later — the workbook lands: properties, processes, and the locks

Amber's one message, with `Import_process_and_properties.xlsx` attached: add the properties
and processes, link them, make them editable at job and project level, security levels per
property, restricted opt-in, push project properties to jobs, processes editable by managers,
rename the fourth phase to Maintenance, filter and report on it all, mobile first.

**`0076`–`0079` are applied to the live database.** `verify/check.sh` is green at 56
constraint checks, 27 new RLS probes (the property locks walked rung by rung, each watched
failing against a permissive policy first), embeds resolve across both repository modules,
seeds agree. The full decision record is in `schema-plan.md`, *1 September — the workbook
lands*; the short version:

- **Maintenance** replaces Handover & Maintenance (`0076`). Handover is Construction's
  last process. Only the name moved; `lifecycle_position()` retaught; six app files and
  two verify probes followed.
- **Property values exist** (`0077`): typed columns, composite FK to the definition's
  format, `unknown` as a format that can hold nothing, `property_options`,
  `property_access` (team or person, one verb per column), `property_value_history`
  (append-only, readable by whoever may read the value). Four rungs + `restricted` on
  the definition; `private.property_keys(verb)` is the whole permission model, evaluated
  once per statement inside every policy; `my_property_access()` gives the app the same
  answer so no control is drawn the database would refuse. **Manager and admin do not
  bypass restricted.** `push_project_properties()` copies a project's values onto its
  live jobs as the jobs' own rows — security invoker, so the locks decide.
- **Processes exist** (`0078`): `processes`, `process_dependencies` (cycle-guarded),
  `process_properties`, `process_tasks` + `process_task_dependencies`, `process_runs`
  (one process, one record, one attempt; not_applicable is a status), and
  `process_run_display` deriving due, at-risk and health from `started + expected_days`.
  `instantiate_process_tasks()` copies a checklist onto a run once. `tasks` gained
  `process_run_id` / `process_task_id`. The lifecycle `pipelines` row stays; nesting is
  gone as an idea.
- **The workbook is seeded** (`0079`, generated by
  `app/supabase/import/generate-processes-and-properties.py` from the checked-in copy of
  the sheet): 49 processes, 174 properties (87 with format `unknown`, 130 with no team),
  48 process dependencies, 107 template tasks, 99 task dependencies. Every decision the
  script made is listed at the end of the file and under `--report`; the rules are in
  `schema-plan.md`. It refused to guess a format, a team, a duration, a milestone or a
  restriction.

### In the app

- **Properties are editable on every record.** `PropertySlots` renders values, grouped by
  stage then process, through `PropertyField` — one control per format. A date is a tick
  box that records today beside a date for when it happened earlier. Every control is
  gated by `myPropertyAccess()`; an unreadable property is absent, not locked. A job sees
  its project's values read through ("from project", read-only) or its own pushed copy
  ("pushed", and "differs from project" when the two disagree).
- **Processes on every record** (`ProcessesPanel`): stage by stage, the record's own stage
  open, each process with its latest run — Start / N/A / status / waiting-on / note / New
  attempt — health as a word, the properties it collects inline, and "Create the checklist"
  where a process has one. The stage header counts milestones and says "ready to move on";
  nobody is moved automatically. Replaced the drawer's Milestones panel of disabled
  checkboxes.
- **Push to jobs is real** (`PushToJobs`): a preview of the project's recorded values, tick
  which, push, and the toast says how many job rows moved.
- **Setup → Properties** is the editor Amber asked for: label, level, team, format (the 87
  without one filter to the top), SLA days, required, active; and under More — description,
  the four security rungs (admin), the team/person grants with per-verb ticks (admin;
  superadmin on a restricted property), the restricted flag (superadmin), the choices of a
  select property, delete.
- **Setup → Processes**: a stage-grouped list beside an editor — name, stage, group, level,
  team, expected days, at-risk lead, milestone, external, position, description,
  automation, SharePoint subfolder, retire/restore; *Order* (what it waits on, with lag,
  and what waits on it); *Properties collected* (ordered, required-to-complete); *Checklist*
  (template tasks with team, days, parent and dependencies).
- **Filters**: Process + Process health, Property + Recorded — read as pairs
  (`filtering.ts`), in the URL as `process`, `health`, `property`, `recorded`. The absence
  filter is only offered for readable properties, and `recordedKeys` is built from rows RLS
  already let through.
- **Reports → Processes**: per process across the jobs in view (runs, open, waiting, at
  risk, overdue, complete, N/A, average days, repeats); the runs at risk or overdue, each a
  link; how many jobs have each property recorded.
- **Nav: Templates → Processes** (`/processes`; `/templates` redirects). The page lists the
  processes inside each phase with team, duration and field count.
- Dictionary: 104 new entries and 11 new table descriptions; `data-dictionary.md`
  regenerated.

### The Impeccable pass over the new screens

Amber asked for the Impeccable design skills (impeccable.style) on the UI, so the skill is
installed under `.claude/skills/impeccable/` (its subagents under `.claude/agents/`) and its
audit and polish playbooks were run over the eight new files. The detector found one thing
— the 4px coloured left border marking a record's current stage, the classic AI-UI tell — and
reading the code against the craft floor found the rest:

- **Colour.** Health chips, the "differs from project" chip and the restricted badge were
  mixing their own tints with `color-mix` and carrying hex fallbacks that disagreed with
  `tokens.css`. They now use the same Vibe `-selected` tints and contrast-checked inks as the
  status pills, so a process's health and a job's status are the same red.
- **The current stage** is a tinted header and a chip that says *current stage* — a word,
  not a stripe.
- **Keyboard.** The overdue-runs report navigated on a row click, which a keyboard cannot
  reach; the job number is now a link. Focus rings on the property inputs, the process
  list and the stage headers are the palette's ring, not the browser's.
- **Numbers** in the process report are right-aligned tabular figures (`.num`).
- **Read-only** dates and tick boxes render as text, like every other read-only format —
  no disabled controls beside a value.
- **Deleting a property definition** takes two clicks, the second one named *Delete for
  good*; retiring is the recommended path and stays one click.
- Drawn arrows from `@vibe/icons` replace the ↑↓ glyphs on the property-order buttons;
  the *N/A* button says *Not applicable*; a panel says *Loading…* rather than *0 of 0
  recorded* while its values arrive.

Re-verified after: `tsc -b`, lint, build, the detector (clean), and the responsive sweep —
95 page/size combinations green. `.claude/settings.local.json` (the Impeccable edit hook) and
the `.agents/` and `.codex/` copies for other tools are ignored, not committed; re-create the
hook with `npx -y impeccable install` if wanted. `/impeccable init` (a PRODUCT.md and
DESIGN.md) has not been run — that is an interview with Amber, not a guess.

### The platform layer — `0080`–`0084` built, the sync to go

Amber answered the nine questions on 2 September (recorded in `schema-plan.md`, *Amber's
answers, 2 September*) and sent the Phase B import data with them —
`Lofty_Jobs_Grouped_by_Project.xlsx`, 801 jobs across 121 projects — plus cost centres,
products, the SiteBook schedule and the 57-step pre-construction schedule with predecessor
IDs. **The import has not been run**; it is the next big job after the platform batches.

`0080`–`0083` are built and green: every table audited and the audit readable by everyone
except restricted fields; tasks with sub-tasks, checklists, start and expected days, at-risk
and a `task_display` / `stage_completion` pair of views; contacts, companies, classifications,
employment with job role, parties on records, and SiteBook's project roles; notifications end to end in the database with the in-app channel
live and the email/Teams worker written but **not deployed** (see
`app/supabase/functions/deliver-notifications/README.md` — it needs an Entra app registration
and secrets). `0084` maintenance is built and green too (`schema-plan.md`, *Built so far*):
the Maintenance tab, Setup → Maintenance, the warranty on every job drawer, and three Edge
Functions — `maintenance-accept`, `maintenance-inbound`, and the delivery worker extended to
the maintenance thread — all **written and not deployed** (steps in
`app/supabase/functions/deliver-notifications/README.md`). PR #2 was merged by Amber on
2 September at the design commit; `0080`–`0084` are on the same branch, rebased onto main,
in a new PR. `0085` is taken by a one-row data correction (Ben Johnson's address — see *Session of
2026-09-02* above); the sync is next and will be `0086`. Local verify:
`LOFTY_PG_PORT=5432 LOFTY_PG_HOST=/var/run/postgresql ./check.sh` from `app/supabase/verify`
(Postgres 16 started with `service postgresql start`). **`0080`–`0084` are not yet applied to the
live database** — the Supabase MCP server needs re-authorising in this session; apply
`0080`–`0084` in order through the dashboard SQL editor or a re-authorised session before the app that
reads the new column names is deployed, because the renamed columns and the app move
together.

### The platform layer, designed and not built

Amber's next brief, the same evening: audit of every change readable in the app, tasks with
checklists, notifications on every channel, a Maintenance tab, contacts and companies with
job roles, two-way sync by API and MCP, a hundred concurrent users — with normalisation and
`tablename_attribute` as binding rules. The design is `schema-plan.md`, *1 September,
evening — the platform layer*, and the artifact it links. Six batches, `0080`–`0085`, one
PR each; **none is written yet**, and nine decisions listed at the end of that section are
hers. Three answers she has already given are recorded there (staff-only logins designed
for a later portal; every maintenance intake channel; all four notification channels chosen
per person). The naming audit ran against a local replay of all 79 migrations: three old
tables off the convention, renamed in `0080`.

### Still open — Amber's, listed in `schema-plan.md` under *What this leaves for Amber*

87 formats to set; durations and at-risk leads on processes; the seven unmapped predecessor
names from the older schedule; which properties are restricted (nothing is yet); which
processes are milestones (none yet); whether Maintenance genuinely has no processes.

### Not done, and said so

- Documents attached to a process (SharePoint) — the process carries a subfolder name;
  attaching files waits on the documents batch. Automation — a note column, no hooks.
- Due dates on instantiated checklist tasks are not computed; nothing not yet started has a
  date, and a forecast needs a schedule (`schema-plan.md`, *Health, finally defined*).
- The `pipelines` / `pipeline_stages` tables remain as the lifecycle's home.

---

## Session of 2026-09-01 — the tracker gets a front door, and one date picker for the app

Amber, 1 Sep, in one message of eight numbered asks. What is worth carrying forward is
the two that changed a decision rather than adding a control.

### The gantt and the calendar are gone, one day after being built

*"remove the gantt chart and calendar"*. Built 31 Aug, removed 1 Sep, and the reason is
the argument against building them again — it is written at the top of `UpdatesViews.tsx`:

**A request has no dates of its own.** The only dates in reach were its phase's, so every
bar on that gantt was a phase's window borrowed by whatever sat in it: forty requests in
Phase 1 drew forty identical bars. It was an honest chart of a fact the roadmap already
showed once. The calendar had the opposite problem — its two real dates, reported and last
moved, are facts about administration, so a month grid of them answered "when did people
type things".

The lesson is not "no charts". It is that **a time view needs a duration belonging to the
thing being drawn**. If requests ever gain start and target dates, a gantt becomes worth
building, and it will be a different chart.

### One date picker, and it is now the app's

*"include date range that looks like the screenshot… this is the default way for every
date picker in the app"*. `components/DateRange.tsx`: today · yesterday · last 7 days ·
last 30 days · next 30 days · custom, with a start/end picker, Clear dates and Done.

**Both directions on purpose.** A tracker filters backwards, a roadmap forwards, and a
picker with only past presets makes the forward question a custom range every time.

**The end of a range is EXCLUSIVE**, and that is the whole correctness of it: "today" has
to include something stamped at 23:59, and an inclusive end at midnight silently drops the
last day of every range. That is the classic off-by-one in date filtering and it is
invisible, because the control still looks right. Twenty-two cases are checked, including
that one from both sides.

**The jobs board was swapped onto it too**, which is what makes the claim true rather than
aspirational — otherwise two screens keep two vocabularies. One thing had to be preserved
doing it: `saved_views` stores a query string **verbatim** (0048), so a saved board may
carry `?date=month`, which is not one of the new presets. A value that stops parsing does
not error — **it silently stops filtering**, which is the worst way for a saved view to
break — so `month` is still parsed in `filtering.ts` and says why.

### `/report` — a page you can send someone

*"a standalone page (as well as slide out) so that I can share it with people who are not
able to access the account (still signed into the app even in demo mode)"*.

**Checked first, because half the ask needed no work:** a **viewer** could always file a
request — `anyone active reports` (0052) asks only for an active profile. A **demo
account** could not: 0049 taught `is_active_user()` about `profile_is_demo`, so every
policy hanging off it refuses at once. Forty-two of forty-seven profiles carry the tick,
so "nobody being trained can send feedback" was the common case.

`0075` adds `is_signed_in_staff()` — `is_active_user()` **minus the demo clause and
nothing else** — and two narrow policies: send your own report (never on somebody's
behalf, which is 0070's admin path), and read back **only what you sent**. Reading back
follows 0049's own precedent, which widened the `profiles` SELECT so a held account may
read its own row.

**It is deliberately not an anonymous page.** That needs `anon` INSERT, which puts a
writable table on the public internet and loses the one fact that makes a request
actionable — who asked — to serve people who are already signed in. Screenshots are also
deliberately out: 0062's storage policies still hang off `is_active_user()`, and the form
hides the control rather than offering an upload that fails.

Watched on the live database, rolled back: a demo account sent a request, read back
**exactly its own one row**, read 0 jobs, 0 votes and 0 roadmap phases, was refused a
report under another profile and refused the on-behalf path — and a **deactivated** account
was still refused everything, which is the case separating the new function from "is
signed in".

`RequireSignedIn` in `App.tsx` is `RequireAuth` minus its last line. That hole is exactly
one page wide and must stay that way.

### The rest

- **The board and the detail view are Canny-shaped** (their screenshots attached): the
  vote box leads each card and the detail head, the column heading is a dot and a word,
  and one capitalised line under each title says which kind it is. The stage captions
  moved to the heading's `title` rather than being deleted.
- **"Report something" is now "+ New"** — the form takes an idea as readily as a bug, and
  a button that says "report" asks people with a suggestion whether they are in the right
  place.
- **Search, a phase filter and the date range** ride the query string like everything
  else. The filter is on **phase** rather than stage, because the board groups by stage
  and a stage filter would be a filter on the columns.
- **The table is the app's table** — `panel` + `data-table-wrap` + `data-table` +
  `SortHeader`, the same four things the jobs table is made of, rather than the bespoke
  `.updates-table` it carried. A second table style is a second set of paddings and hover
  colours to keep in step, and they do not stay in step.
- **`ReportForm` is one component in two places.** Two copies would have been the quick
  way to add a page; the first thing to drift is always the copy nobody uses daily. The
  slide-out drives it with `requestSubmit()` because the footer is rendered outside the
  form and Vibe's `Button` has no `form` prop.

---

## Session of 2026-08-31, second half — four views, drag and drop, and a CHECK that was wrong

Amber, 31 Aug, in a run of asks: drag ideas between phases · see it in table, gantt and
calendar · *"roadmap should be in these 4 default views as well"* · *"change log should
pull in latest Pull requests as well as when a request has been complete"* · *"requested
by if an admin or super admin is logged in as they may enter it on behalf of someone
else"* · *"the roadmap phase should default to the highest phase"* · *"change shipped to
Live in the app and have it as last column"*.

### The two decisions she made, and why they were asked

- **The phase default is "the phase we are in now"** — the one marked In progress, else the
  earliest not delivered. Asked rather than guessed because "highest" could equally have
  meant the last phase in the list, and a request landing in the wrong phase is a guess
  that gets quoted back as agreed.
- **The PR feed is `@changelog` in the description**, everything after it on that row being
  the entry. Her wording, and a good rule: the line reads as a sentence in the pull request
  as well as in the changelog, so nobody writes markup for a machine.

### Dates decide what a gantt and a calendar can honestly draw

A request carries no duration. What exists is `feedback_created_at`,
`feedback_stage_entered_at`, and the phase's nullable `starts_on`/`ends_on`. So:

| | |
| --- | --- |
| Requests gantt | each bar is its **phase's** window, borrowed and labelled as borrowed |
| No phase | **no bar** — listed by name underneath as unscheduled, never estimated |
| Requests calendar | the two real dates: reported, and moved |
| Roadmap gantt | the phase's own window — the one chart whose dates belong to what it draws |
| One date only | a **marker**, not a bar: a phase starting in March with no agreed end has no length to draw |

Month-scaled, not day-scaled like `JobsGantt` — a day grid over six months is four hundred
columns. That gantt is a different instrument for a different question and was left alone.

### Drag and drop, at two different rungs — because the database has two

- **Between stage columns** → superadmin, because 0060's trigger raises 42501 for anybody
  below it, admins included.
- **Between roadmap phases** → admin, because `roadmap_phase_id` rides the ordinary
  `admins triage feedback` UPDATE policy.

The attribute is only set when the rung is held, so the board never offers a gesture that
ends in a refusal. A **Not planned yet** bucket exists so the drag has somewhere to go
back to — a one-way gesture is one people are afraid to try.

**"Live in the app" is now the last column** (`shipped` stays the stored value: it is a
CHECK value and the changelog generator's vocabulary, so renaming it would be a migration
to fix a word on a screen). It left the pair under the board because it is the destination
everybody is trying to reach, and a queue whose end is printed below the queue does not
read as a queue. Declined stays underneath — nobody is moving towards it.

### `0072` — the CHECK that was right on one table and wrong on the next

`0070` copied `0067`'s predicate, `feedback_added_by is distinct from profile_id`. That is
exactly right on `feedback_votes`, where `profile_id` is NOT NULL. **`feedback.profile_id`
is nullable** — 0052 made it `ON DELETE SET NULL` so a report outlives its reporter — and
`is distinct from` answers *false* for two nulls. So the line said: *a report with no
reporter and no typist is refused.*

The consequence was worse than a rejected insert. `ON DELETE SET NULL` performs an UPDATE,
the CHECK is re-evaluated, and it fails — so **deleting a profile would have failed for
anybody who had ever filed a request**, with an error naming a column nobody touched.
Watched on the live database before the fix, and again after.

**`check.sh` found it, not review.** The constraint probes plant a fixture request with no
reporter; that insert began failing the moment 0070 applied, and four later probes act on
that fixture — so one cause reported as five failures. The harness extended in 0069 earned
its keep the same day.

The general shape: **a predicate is only as portable as the nullability of the columns it
names.** Copying a proven line to a neighbouring table is exactly when to re-check that.

### The sweep was passing by not looking

Two faults, found in that order, and the second only because the first was fixed.

**The view was component state, so the sweep could not reach it.** `responsive-check.mjs`
visits routes; three of the four views were behind a `useState`, so six new URLs would all
have rendered the board. The view now lives in the query string (`?view=gantt`) — which is
also the convention the jobs board already set, and the reason `saved_views` stores a query
string verbatim: **the URL is the app's serialisation of "what am I looking at"**, so a
gantt somebody is looking at can be linked to and saved.

**Then it was still passing, because `stubRepository` answers empty by design.** The six
routes each drew one line of "nothing to place yet" and reported green without ever laying
out a wide table, a multi-month timeline or a full month grid. `scripts/tracker-fixtures.ts`
now populates those three reads for the responsive build only, aliased the same way
`AuthProvider` already is. The fixtures are shaped to stress the layout rather than to look
real: a title longer than any column, phases spanning eight months, one phase with a start
and no end, one with no dates, several requests sharing a day, and half of them in no phase.

**It failed immediately: 21 of 95 combinations, three separate tap targets under the 24px
WCAG floor** — the calendar's month stepper at 21px wide, the request titles in a phase at
18px tall, and the gantt's labels at 16px. All three were mine, and all three had been
"green" ten minutes earlier. A fourth surfaced after the first fix: the *unscheduled* list
under the gantt is a different button from the bar label, and only the fixtures' deliberate
split between planned and unplanned requests drew both. Now 95 of 95.

**The lesson is the one this repo keeps relearning**: a check that cannot reach the thing it
names is worse than no check, because it reports confidence. Note the alias gotcha if this
is ever extended — `tracker-fixtures.ts` imports the real stub to wrap it, so the alias is
anchored on the exact specifier `./stubRepository` and not the `.*` shape used for
`AuthProvider`, which would rewrite that import to the fixtures file itself and produce an
import cycle rather than an error.

### Also worth knowing

- **`0071` closed a hole nobody had cause to notice.** The insert policy on `feedback`
  checks the reporter and `is_active_user()`, and **RLS cannot restrict which columns a row
  carries** — the lesson 0018 paid for on `profiles.permission`. So any signed-in person
  could have filed a request already planned into whichever phase they liked. Below admin
  the phase is now decided by the trigger and whatever the client sent is discarded.
- **The PR feed needs no token because the repo is public**, which is the constraint that
  decided the design rather than a happy accident. The price is GitHub's 60/hour per IP, so
  it is cached for ten minutes in sessionStorage and a rate-limit answer **says so** rather
  than rendering an empty changelog — an error drawn as an ordinary empty state is the
  "your account is not set up" fault again.
- **Nothing in the repo declares `@changelog` yet** (checked: 55 merged PRs, zero). The
  empty state says how to join the list rather than looking broken.
- Amber has created four real roadmap phases; Phase 1 is In progress. Probes that touched
  them ran in rolled-back transactions and the statuses were re-read afterwards to prove it.

---

## Session of 2026-08-31 — the tracker is live, and a view that had no policy

**`0060`–`0068` are applied to the live database.** PR #54 merged with them written and
unapplied, which meant `main` was deployed and reading `feedback_display` for columns
production did not have — `/updates` was broken in production, so this was repair rather
than a next step. Applied in order, then verified against the live database rather than
against the success messages: six new tables all with RLS on, six new `feedback` columns,
four new `comments` columns, the private `feedback-screenshots` bucket with its three
object policies, and `feedback_display` carrying `security_invoker=on`.

The `feedback` table was empty, so 0060's rename and backfill moved no rows.

Full `check.sh` is green on a clean replay of all sixty-nine migrations: 51 constraint
checks biting, RLS holding, embeds resolving, seeds agreeing.

### `job_display` had been executing as its owner since 28 August

**The security advisor reported one ERROR, and it was real.** `0055` rewrote the view as

```sql
create or replace view job_display as …
```

with no `with (security_invoker = true)`. Every earlier rewrite of that view carried it —
`0028`, `0035`, `0036`, `0040` — and `create or replace view` does not preserve
`reloptions`. It is the identical fault `0020` found on `profile_display` and that `0001`
warns about in its own comment.

**Measured on the live database, as a real account held at the demo gate, in a rolled-back
transaction** — not inferred from the advisor:

| | before `0069` | after |
| --- | --- | --- |
| `jobs` through RLS | 0 | 0 |
| `job_display` | **60** | 0 |
| `projects` / `project_display` | 0 / 0 | 0 / 0 |

`project_display` held because it kept its invoker. **Forty-two of the forty-seven
profiles carry `profile_is_demo` today**, so this was the common case, not the edge one:
an account Amber is deliberately holding at the door read the whole jobs board through
PostgREST. The gate screen does not close it — `RequireAuth` hides the UI, and hiding a
control is not security. An ordinary active account still reads 60 through both the table
and the view, checked after the fix so the repair is not a new outage.

`0069` is `alter view … set (security_invoker = true)` rather than another rewrite: it
changes exactly the option and cannot get the body wrong.

### The real fix is the check, not the line

The rule — *any migration touching a view must re-apply `security_invoker` and assert on
`pg_class.reloptions`* — has been written down since `0020` **and was never mechanised**.
Nothing in `verify/` mentioned `reloptions` at all, which is how `check.sh` stayed green
through `0055` and the thirteen migrations after it.

`behaviour.sql` now asserts it over **every** view in `public` in one statement, so a view
added next month is covered without anybody remembering. Watched failing first, against
the pre-`0069` replay: `FAIL: view(s) executing as owner, past every policy underneath:
job_display`. Then passing.

**The general shape, worth carrying: a rule that lives only in prose is not a rule.** This
one was stated clearly, in two places, by the session that had been bitten by it — and the
next rewrite of a view broke it anyway.

Security advisors are back to **0 errors**.

Still open: the five product questions PR #54 put to Amber (votable bugs, who may decline,
notification channels beyond the bell, product-area tags, the first roadmap phases and
their dates). Nothing is seeded on `roadmap_phases` or `releases`, on purpose.

---

## Session of 2026-08-31 — the new project form asks for four things

Amber, on the create-project form: the lot number hint reads *"as it appears on the plan of
division"* and nothing else; there is a **Total lots** box, *"which is the number of
community title plus torrens title lots but can also be manually entered"*; and *"the only
thing required is suburb, state, postcode and project type. the rest are optional."*

**`0069` is applied to the live database.** It was not, for the first part of this
session — the Supabase connector was down, and `0060`–`0068` were reported unapplied on
the same evidence when in fact they had landed. The gap was found the way these are:
Amber created a project with a street and no street number and got
`400` on `POST /rest/v1/addresses`, which is `addresses_street_needs_a_number` refusing
the shape the form had just stopped asking for. **A form relaxed ahead of its migration
does not degrade, it breaks** — the Create button greys out on the app's copy of the
rules, so when the two disagree the person meets a Postgres error instead.

Verified on production straight after, in a deliberately-aborted transaction: a street
with no number, a suburb with no council and a lot number with no street are all accepted;
a council outside SA and a three-digit postcode are still refused; a job still cannot take
a street with no number on it; and the migration's own proof block left nothing behind.

**The live database carries four migrations that are in no branch here** —
`the_view_that_lost_its_invoker`, `the_request_somebody_else_typed`,
`a_new_request_lands_in_the_phase_we_are_in`, `two_nulls_are_not_the_same_person`, all
applied 31 Aug. Another session applied them without merging. Nothing is broken by it,
but the repo cannot rebuild that database from its own migrations until they land, and
`replay.sh` is proving a schema production no longer has.

| | |
| --- | --- |
| `0069` | Drops `addresses_council_required_in_sa` (0025) and both halves of 0037's shape rule — `addresses_street_needs_a_number`, `addresses_numbers_need_a_street`. On a plan of division "Lot 7" **is** the address; the lots are numbered before the roads are named. `guard_job_address_is_a_street` takes over the whole of the old guarantee — a street **and** a number — because `address_precision` only looks at the street, so dropping the check alone would have halved it silently |

**Total lots** is `project_proposed_dwellings`, which the repository has been writing as the
sum since 0053 with nothing on screen admitting to it. The box follows the split until
somebody types over it, and clearing it hands it back — so "blank" can never mean "a known
split with no total". Two constraints are mirrored on the field rather than met as an error
after the insert: `project_lot_split_adds_up`, and the `> 0` on the column that 0 + 0 in
the two title boxes used to walk straight into.

### Still open

- **The inline "+ New project" row has a Project name box that goes nowhere.** `createProject`
  ignores `input.name` — it composes the name from the number and the address, which is what
  Amber asked for on 28 Aug — so whatever is typed there is silently dropped. Left alone
  because removing a visible field is a product decision, not a tidy-up. It should go.
- **`addresses.address_precision` has no data dictionary entry.** Added by 0037, never
  entered in `dictionary.ts`, so it is missing from `data-dictionary.md`.

---

## Session of 2026-08-30, second half — the Canny round

Amber, pointing at Canny: *"Like https://canny.io"*. What their portal does that the
tracker did not, read off their own feature pages rather than remembered: a discussion
under every post with a **pinned** answer and an **internal** lane, **status updates that
close the loop** with the people who voted, **merging duplicates**, and **voting on
behalf** of somebody whose request never reached the portal.

**`0064`–`0068` are written and replay cleanly. They are NOT applied to the live
database** — same reason as the first half: the Supabase connector needs a browser
sign-in. Apply `0060`–`0068` in order, then run `verify/check.sh`.

| | |
| --- | --- |
| `0064` | The discussion. A **fifth parent on `comments`** rather than a `feedback_comments` table — the reuse is the whole argument: @mentions (`comment_mentions` has a FK to `comments`), the edited-at trigger, the author stamp and CommentsPanel all already exist, and a new table re-grows every one of them. Plus `comment_is_pinned`, `comment_is_internal` (admin-only by the read policy) and `comment_feedback_stage`, the note that comes with a move |
| `0065` | `feedback_follows`. Voting and reporting follow you **by trigger**, not by the app — the same rows are written by an import, a merge and an on-behalf vote, and a follow created in the repository would exist for one of those and silently not for the others. Unread is **derived** (`feedback_stage_entered_at` vs a seen stamp), so no notification can outlive or contradict the move it describes |
| `0066` | Merging. `feedback_merged_into_id`, and a **SECURITY DEFINER** trigger moves the votes and followers: they belong to other people, and 0061 rightly refuses the app the right to write them. No chains — a duplicate always points at a live request |
| `0067` | Vote on behalf. `feedback_vote_added_by`, admin-only, **attributed and shown on screen** |
| `0068` | `feedback_display` rebuilt with the duplicate link, the comment count, and the two follow facts. `drop` + `create`, not `create or replace`, because that drops `security_invoker` — 0020's fault, and this is a view rewrite |

### The bell has a second real signal

A request you follow has moved. It passes the same test @mentions passed: no health model,
no SLA, nothing derived from a definition nobody has written. Voting subscribes you, so most
people get it without pressing anything — which is the behaviour that closes Canny's loop,
in-app rather than by email (Amber's Q4 order: in-app this phase, Teams and email later).

### Three probes that were lying, and what each taught

This round found more in the probes than in the code, which is the point of writing them.

1. **A policy clause that was OR'd away.** 0067's insert policy said `added_by` must differ
   from the voter. It did nothing: 0061's own-vote policy already admits a row whose
   `profile_id` is yours, so an admin could add their own vote stamped as their own adder
   and never meet the new policy at all. The probe reported
   `FAIL: an admin added their OWN vote through the on-behalf path`. Fixed with a **CHECK**,
   which is not OR'd with anything. **The general shape: a narrow policy beside a broad one
   does not narrow anything.**
2. **Two probes passing for the wrong reason.** "Voting follows you" asserted a follow on
   the prober's *own* report — which `follow_on_report()` had already created — so it passed
   with the vote trigger dropped. And "reporting follows you" was checked *after* a vote
   probe had run on the same request, so it passed with the report trigger dropped. Both now
   act on a request nobody has voted on, and the ordering is commented at the assertion.
3. **A plpgsql subtransaction eating the setup.** In `constraints.sql`, `BEGIN…EXCEPTION`
   opens a subtransaction: when a probe is refused — which is the *pass* — the rollback took
   the fixture row inserted in the same block with it, and every probe after it acted on
   nothing. The planted row now lives in a block of its own.

### `verify/check.sh` is green for the first time

The two demo-account probes that have been red on `main` are fixed, and the cause is the
same class as the above: **the probe's own setup was silently refused.** It ran
`update profiles set profile_is_demo = true` as `authenticated`, which cannot write
`profiles` — so the flag was never set, the reads that followed were ordinary reads, and the
failure it reported was true about the probe and false about the gate. 0049 was never wrong;
it was proved against the live database when it landed.

The flag is now flipped as the owner, outside the role, and **the probe asserts its own
setup** before testing anything. It was watched failing with 0049's clause removed from
`is_active_user()`. Note the second bite: leaving the session as `authenticated` afterwards
broke the manager probes further down, because setting a permission level is an admin write.

### In the app

- **"Someone may have asked this already"** — the report form searches the tracker from
  three characters, debounced, and offers `+1` on each hit. Voting there adds you to the
  count *and* follows you, instead of adding a second request to the queue. This is the
  feature Amber's brief actually asks for; merging is the tidy-up for when it does not work.
- The request panel grew: follow, who voted (with "added by" beside anybody entered on
  their behalf), add-a-voter, duplicate-of, a note beside the stage control, and the
  discussion.
- The board hides merged duplicates, and cards carry a comment count, a "+N merged" chip
  where a vote count grew by absorbing others, and a "Moved" chip only the follower sees.

### Still open, and now sharper

- **Labels / product areas.** Canny has tags and categories, and filtering by them is how a
  long list stays usable. Deliberately not built: the categories would have to be invented,
  and an invented taxonomy on a shared board is the house rule's worst case. Amber's list,
  when there is one.
- **Email or Teams delivery.** The loop closes in-app only. Canny emails; that stays behind
  Q4's ordering.
- **Prioritisation scoring** (Canny ranks by impact and by revenue). Nothing here computes a
  priority, and it should not until somebody says what it would be made of.

---

## Session of 2026-08-30 — the tracker: a queue people can see

**`0060`–`0063` are written and replay cleanly. They are NOT applied to the live
database** — the Supabase MCP connector needs a browser OAuth this session could not run.
Applying them is the first job next session, in file order, and `verify/check.sh` is what
proves it landed.

Amber, 30 Aug, and the sentence the whole design turns on: *"to have a feature request and
bug tracker so users can see where their requests are in the queue… **This will help stop
people saying I want this to happen when it is already planned.** Also when managers help
plan next phase it is clear and ordered."*

### The reversal, and why it is the feature

`0052` made the feedback SELECT policy **admin-only**, argued it at length, and the app was
built around it: `submitFeedback` returned void precisely because asking for the row back
would have failed for exactly the people the form is for.

`0060` reverses it. Every active person reads the whole tracker, bugs included. The
reasoning is in the migration and worth keeping here too, because "the sender cannot read
their own report back" reads like a security decision and was not: it was right for a
private triage list for one person, and it is wrong for the thing Amber asked for two days
later. A queue nobody can see cannot answer *"that is already planned"*.

**What it costs, stated plainly:** everyone signed in can now read every report anyone has
filed, with the reporter's name on it. That is the intended change — 47 people, an internal
app, and a report is about the app rather than about a record. If a report ever needs to be
private that is a `feedback_is_private` column and a narrowed predicate, not a reason to
darken the whole queue.

What did **not** widen: writing. Anyone reports; **only superadmin moves a request between
stages**; admin edits the words and plans a request into a phase.

### The four tables

| | |
| --- | --- |
| `0060` | `feedback` becomes the tracker. `feedback_status` → `feedback_stage`, with Amber's four (requested, in review, planned, in development) plus **shipped** and **declined**. Adds `feedback_stage_entered_at`, `feedback_error_text`, `feedback_user_agent`. The stage rule is a **trigger**, `guard_feedback_stage_change()`, because RLS decides rows and never columns — and it bites at *admin*, a rung the UPDATE policy has to keep letting through |
| `0061` | `feedback_votes`, whose **primary key is the rule**: `(feedback_id, profile_id)` cannot hold a second vote, whatever the app sends. No `vote_count` column — a counter can be told to go up but cannot know who voted, and un-voting comes free with rows. Plus `feedback_display`, `security_invoker`, carrying the count and whether *you* voted |
| `0062` | `feedback_attachments` and a **private** `feedback-screenshots` bucket. The object path starts with the uploader's profile id, because that is the only thing a storage policy can compare — `storage.objects` has no column saying which report a file belongs to, and giving it one would be a second link that can disagree with the table |
| `0063` | `roadmap_phases` (dates **nullable** — an unscheduled phase is real, and a guessed date gets quoted back as a commitment) and `releases` + `release_entries`. Deliberately **not** one table with a flag: a plan that slips must never rewrite what the changelog said happened |

`0062` guards its bucket insert on `to_regclass('storage.buckets')`, because the verify
harness replays into a plain Postgres with no storage schema. On a replayed database the
bucket does not exist and the upload fails visibly rather than writing nowhere.

### What was watched failing before it was trusted

Every new assertion, against the replay database, by breaking the thing it guards:

| Broken | Reported |
| --- | --- |
| read policy put back to admin-only | "an ordinary person could not read the tracker they just wrote to" |
| `feedback_votes` primary key dropped | "the same person voted twice" |
| stage trigger dropped | "an ADMIN moved a request between stages — the trigger did not bite" |
| trigger stamping unconditionally | "a no-op stage write restamped feedback_stage_entered_at" |
| phase FK switched to CASCADE | "deleting a roadmap phase took its requests with it" |
| six constraints dropped one by one | each named its own refusal |

**One of those needed a second attempt, and the reason is worth carrying forward.** The
no-op probe first compared the stamp before and after — and *passed* against a trigger that
stamped unconditionally, because `now()` is transaction time, so the "new" value was the
value already there. It parks the stamp in 2020 first now. A before/after comparison inside
one transaction cannot see a rewrite to the same instant.

### Not from this branch, and still red

`verify/rls.sql`'s two demo-account probes — *"a demo account read 2 job(s)"* and *"read 48
profile(s)"* — **fail on `main` in this harness too** (checked on a clean worktree). The
0049 gate was proved against the live database; something about the replay database's
`auth.uid()` path means the flag does not take there. It is not this branch's, and it is
worth an hour: a probe that has been red for a while is a probe nobody reads.

### In the app

- **One report form, not two footer buttons** (`components/Feedback.tsx`). Amber: *"it
  should just be one as bugs and Wishlist but have a radio select."* The split asked the
  wrong question at the wrong moment — whether something is a defect or a missing feature
  is a triage judgement, and the person who just hit it is the worst placed to make it.
- **The error is captured, not typed**: `error` and `unhandledrejection` listeners hold the
  last one for fifteen minutes. Older than that it is dropped — an error from an hour ago
  attached to an unrelated report sends whoever reads it somewhere wrong, confidently.
- **`/updates`, in the main nav**: Requests (the board, four columns and the two endings
  underneath), Roadmap (phases, dates, what is planned into each, ticks that are facts and
  never a percentage) and Changelog.
- **Setup → Bugs / Ideas stays** as the triage table it always was — the page, the error,
  the browser, the screenshots. Note that its `adminOnly` flag no longer mirrors a database
  rule; it is a routing choice now, and the file says so.

### The repository half

`scripts/changelog.mjs` reads `Changelog:`, `Roadmap:` and `Release:` trailers out of
`git log` and rewrites `CHANGELOG.md`, ticks `ROADMAP.md`, and refreshes a generated block
in this file and the README. `.githooks/post-commit` runs it; `scripts/install-hooks.sh`
points git at it (once per clone).

It **never stages, amends or pushes**. A hook that amends rewrites a commit somebody may
already have pushed.

`ROADMAP.md` owns the phase **names and order**; `roadmap_phases` owns the **dates and
status**, because a date is Amber's decision. `--seed` prints idempotent SQL so the
database follows the file instead of drifting from it.

### What needs Amber

1. **Voting on bugs.** She said *"all users can vote on ideas"*, so the thumb is offered on
   everything the board shows — the database permits a vote on either kind. If a "me too"
   on a bug is not wanted, it is a filter on one component.
2. **Who may decline.** Declining is a stage, so it is superadmin's, like every other move.
   If admins should be able to say no without being able to promise yes, that is a second
   clause in the trigger.
3. **Whether the tracker should notify.** Nothing tells a person their request reached
   Planned. `comment_mentions` is the only notification the app can honestly deliver today;
   a stage change is the obvious second one and it needs the delivery question answered.
4. **The first roadmap phases.** None are seeded, on purpose — an invented "Phase 2 —
   costings, October" would be read as the plan. `ROADMAP.md` carries the repo's own A/B/C
   with no dates on them; the app's roadmap is empty until she writes it.

---

## Session of 2026-08-26 — the lifecycle grows Completed, Closed and Cancelled

**`0045` and `0046` are applied to the live database** (verified: the seven-stage
pipeline, the `lifecycle_archive` cron entry and the cascade trigger all present).
The database also now holds real rows — 5 projects, 44 jobs — that Amber created;
treat writes accordingly.

- **Seven lifecycle positions** (Amber, 25 Aug): the four working phases, then
  **Completed** (what 0035 called Closed — done, won), **Closed** (the archive —
  reached 12 months after Completed or Cancelled by the `lifecycle_archive()` clock,
  scheduled daily where pg_cron exists; hidden by default, shown by the Closed saved
  view), and **Cancelled** (stopped without completing; fires no notifications,
  automations or health alerts while there). This reverses `schema-plan.md`'s
  "cancellation is a status, not a phase" — the reversal and its reasoning are logged
  there, next to the original.

  > **Superseded on 28 Aug by `0057`.** This entry said Cancelled was "the one backward
  > move the lifecycle allows — revival". It is not, any more. Amber: *"cancelled will
  > not be revived — if revived, it will need a new job number as a lot of the initial
  > info will be outdated."* What restarts is the work, not the record: by the time a
  > cancelled job comes back its dates, selections and costings are stale, and its
  > number is on contracts. Cancelled is now terminal like Closed, and coming back is a
  > **clone** with its own number. Left in place rather than rewritten, because
  > "cancelled can be revived" is the obvious-looking simplification somebody will
  > otherwise reintroduce.
- **The guards carry the carve-outs** (`guard_lifecycle_is_linear`): Closed is
  terminal for people; anything live may move to Cancelled; and — since `0057` —
  nothing leaves Cancelled either. `project_stage_from_jobs()` excludes cancelled jobs,
  so a project neither waits for nor follows them.
- **The drawer's stage control grew the verbs**: Move (forwards, linear run only) and
  **Cancel…** (working phases only — a completed job isn't cancellable). It had a third,
  **Revive to…**, which `0057` removed along with the backward move; at Cancelled the
  control now says so, the way it always has at Closed.
- **Assignee is bound** — `job_assignee_id` existed since 0028; `boardModel` now
  resolves it to a name and to the person's teams, so cards, the table, the drawer
  and Team-member grouping show real names, and an em dash when nobody is assigned.
- **The Team filter matches membership** (Amber, 26 Aug): one filter named Team; a
  job shows when the team owns it *or* its assignee sits in that team, however many
  teams the person is in. There is deliberately no separate person filter.
- **Panels cover the main area, not the app**: the header is sticky with a fixed
  height, the shell publishes `--shell-rail-w`/`--shell-header-h`, and the drawer,
  create panel and their scrims key off both — expand no longer hides the nav.
- **Modal padding fixed at its cause**: Vibe's padding lives in `ModalBasicLayout`,
  which neither modal used; both wrap it now. And Vibe portals modals and dropdown
  menus to `document.body`, *outside* ThemeProvider's wrapper — the move dialog's
  primary button was monday-blue. The brand tokens are now also declared at body
  level in `tokens.css` (as `body.light-app-theme` etc., because Vibe's own palette
  sits on those classes and out-specifies a bare `body`).
- The responsive sweep is green again — the `/setup/dictionary` "N values" toggles
  were failing the 24px tap-target check on `main` (93×16); the summary now carries
  a 24px min-height. Note for this container: run the sweep with
  `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'` — the
  pinned Playwright wants a browser build the image doesn't carry.

Added later the same day, on Amber's follow-ups:
- **A project move carries its jobs** (`0046`): moving a project forward brings every
  job behind the new phase up to it; jobs already at or past it, cancelled or archived
  stay put. With 0041 the pair is closed both ways and cannot loop — the cascade lands
  the minimum exactly on the project's stage, and 0041's clamp only fires on
  *strictly ahead*.
- **Bulk edit on the jobs table**: checkboxes + a bar with Move to… (manager+, one
  confirmation for the batch that says how many actually move), Set team… and Assign
  to… — the last two via the new patch-shaped `updateJob` (owning team, assignee;
  `user`+ by the existing policy). Writes go one at a time so a refusal names its job.
- **The projects list stopped hiding what it knew**: cards now show the project's
  stage, real suburb, and each job's own lot address (capped at 8 with an
  "open the project" line — project 1006 has 30); the table gained a Stage column.
  The data was resolved all along (G26's join); the components hadn't been updated
  to render it.

Later the same day: **every table in the dictionary now carries a purpose
description** (`TABLE_DESCRIPTIONS` in `dictionary.ts` — rendered at the top of each
card on the Tables tab and under each heading in `data-dictionary.md`). The generator
refuses to write the file if the map and `DICTIONARY_TABLES` differ in either
direction, and that refusal was watched firing before it was trusted.

A fourth batch, after PR #39 merged (the branch was restarted from `main`):
- **Checkpoints are milestones now** (Amber, 26 Aug: "change the name of checkpoints
  to milestones throughout"). Identifiers, UI copy, the dictionary (the proposed
  table is `template_milestones`, rename logged in its entry) and forward-looking
  docs all say milestones; genuinely historical text — the 36 invented ones the old
  seed showed — keeps the old word, because that is what they were called.
- **The drawer edits who holds the job**: Team and Assigned to selects in "Who it's
  with", through the same `updateJob` the bulk bar uses, at the same `user`+ rung.
  Below `user` it reads as before.
- **Projects say who holds them too**: `BoardProject` and `ProjectPatch` carry
  owning team and assignee; the detail page gained the same two selects
  (`WhoHoldsIt`), and `createProject` writes Acquisition & Development outright —
  Amber's Q2: every new record opens with A&D. Jobs already did (the dialogs'
  pre-selected `FIRST_TEAM`, now aliased to `OPENING_TEAM` in `types.ts`).
- **The SLA editor exists** (Setup → Automations; Amber's Q1). `0047` added
  `pipeline_stage_at_risk_lead_days` beside the expectation — CHECKed to need an
  expectation and be shorter than it, both proved biting in the migration — and the
  tab edits expected days + at-risk lead for the four working phases. Superadmin, by
  0029's policy: the SLA is part of what the stages are. Overdue is past the
  expected days; there is no third number. **Applied to the live database.**
  `pipeline_stages` thereby got its first two dictionary entries.

A fifth batch — the prototype-parity shells (Amber: match the prototype, placeholders
where the data is not real yet; every placeholder names itself):
- **Phase accents on the board** (`theme/accents.ts`): the prototype's two-family ramp
  re-cut for seven positions — teal office pair, rust site pair, Completed green,
  Closed grey, Cancelled negative — as per-column CSS vars with ink-on-tint count
  chips. Plus the drag-hint pill, shown only when dragging is actually enabled.
- **Drawer fullscreen tabs**: Main info · All properties · Activity & comments ·
  Departments, prototype-style, docked staying one scroll. All-properties and Activity
  carry the real components plus coming-soon notes; Departments is a labelled
  placeholder until handoffs write the activity feed.
- **Ask Lofty dock** (`AskDock.tsx`): FAB + 380px dock with scope line, preview
  questions and a disabled input, all saying coming soon; "Ask about this job" in the
  drawer opens it pre-scoped. One assistant, not two.
- **Notifications bell** (`NotificationsBell.tsx`): header bell, no badge (no real
  count exists), panel naming the seven signals and what each waits on.
- **Dashboard**: your actual assigned jobs as cards (it counted every job in the
  company as yours before), real Assigned count, em dashes for Need you/Overdue, and
  right-rail panels that say what will fill them. No invented numbers anywhere.
- Responsive sweep back to 50/50 (the bell had squeezed the avatar button to 16px at
  320; icons no longer shrink and the right cluster's gap tightened).

A sixth batch — the A-class polish:
- **Toasts** (`Toasts.tsx`), fired only where success is otherwise invisible: job
  removed, user saved/added/deactivated. Bottom-centre; note the gotcha — Vibe's Toast
  is already `position: fixed; top: 0`, so overriding `bottom` without `top: auto`
  stretches it the full height of the screen (watched happening).
- **Working preferences** (`data/preferences.ts`, G39): landing page and default jobs
  view are real, localStorage for now with the hint owning up to it; Amber's Q9
  roaming/saved-views layers still need their Phase C home.
- **Report rows open the job** (G38), and the report tables stopped rendering tokens
  for the address and assignee the board model already resolves.
- **New-project preview** (G32) states consequences without guessing the number; the
  header search widens on focus (G4).

A seventh batch:
- **The jobs table sorts** (G12) — the SortableTable idiom applied within each group,
  stage by pipeline position, no default sort so the natural order survives.
  `sortRows` extracted from `useTableSort` for the grouped case.
- **Teams are manageable** (G44): rename + retire/restore on Admin → Teams through a
  new `updateTeam` seam method (admin+, the 0026 policy), with the jobs-held guard
  and retired teams listed dimmed for restoring. **Create-team deferred**: the
  `TeamId` union is closed over the seeded slugs and `verify/seeds.sh` asserts stub
  and database agree — opening that is its own change, not a side effect.
- Tooltip sweep (G3) deferred: this Vibe build doesn't export `Tooltip` in the core
  type bundle. Native titles stand; revisit on the next Vibe upgrade.

An eighth batch — **the Gantt and the calendar are real** (G13/G14):
- `JobsGantt.tsx`: a day-grid over real facts only — each bar is the job's stay in its
  current stage (solid elapsed, tinted SLA window, rust past due), phase-tinted band
  rows, weekend shading, orange today line, sticky left column. The prototype's
  invented duration model was NOT ported. Dependencies wait on task wiring.
- `MonthCalendar.tsx`: Monday-start month grid with today ring, ‹/Today/› nav,
  "+N more" overflow, click-to-drawer, and the jump-to-nearest-month empty state.
  Entries are the two dates a job really has — stage entered, and SLA due where set.
- `BoardJob` gained `stageEnteredAt` so both can place time.

A ninth batch:
- **The Date filter is real** (G46): "moved stage in last 7/30 days / this month",
  matched on `job_stage_entered_at`, in the URL as `?date=7d`, riding the same filters
  array as the chips. The inert select is gone.
- **The drawer shows both folders** (G24): job subfolder + project folder, honest
  "no folder linked yet" when unset; `BoardJob` carries both URLs.
- **The job report prints** (G37): Print button + print CSS dropping the chrome, a
  print-only date/count line, rows kept whole across pages.
- **Filtering is audible** (G48): "Showing N of M" mirrored into a hidden
  `role=status` live region.

A tenth batch:
- **The Type filter is back** (G47) — the project's type rides every job, so it
  narrows for real on Jobs, Projects and Reports. The zero-result state also stopped
  blaming a search nobody typed ("no jobs match the current filters").
- **Report stage bars wear the board's ramp** (G35); **project cards carry real
  progress** — jobs completed over jobs total (G26).
- **Projects gained a Gantt view** (G28): start → target from the two real date
  columns, month ticks, today line, rust past target; undated projects listed, not
  estimated.
- **Esc is a two-step in the fullscreen drawer** (G20); **the notification matrix
  saves** (G40, device-local, quiet defaults, panel owns up to when delivery starts).
- **Variations entry points ship** (G30/G25): "Push to jobs…" on the project page and
  "Request changes" in the drawer, each answering with what is coming rather than
  doing nothing silently.

An eleventh batch:
- **Column drill-down as navigation** (G8): a stage column's heading filters to the
  phase and regroups by team, in one URL. This surfaced and fixed a real
  `useBoardParams` bug — two writes in one handler were two navigations, the second
  erasing the first (`setMany` composes them now; `write` also went functional).
- **In-drawer job search** (G19): find another job, jump without closing.
- **Reports declare their gaps** (G34/G36): the missing blocked/conflict counts and
  the overruns-and-bottlenecks panel each say what they wait for.

**Where the parity work now stands**: every one of the 48 comparison-doc gaps is
shipped, shipped-as-shell with a self-naming placeholder, or explicitly
parked with its reason recorded in the doc (G10 mirror
scrollbar until boards are wide · G22 scheduling checklists until the real process ·
G31 single-add until variations · G45 permissions matrix until permission_grants).
The artifact carries a shipped/shell badge per gap and six open questions for Amber.

A twelfth batch:
- **Styled tooltips unparked** (G3): `@vibe/tooltip` ships full types — pinned as a
  direct dependency at the exact version core already carries — and swept over the
  icon-only controls (collapsed rail, rail toggle, bell, Ask FAB, expand button).
  On focus as well as hover.
- **Session-persistent view state** (Amber's Q9, layer two): board/view/filter choices
  hold across page switches; a link naming its own state always wins; sessionStorage
  so a new day starts clean.
- **The dictionary covers every live table now** — the 0029 pipeline machinery
  (pipelines, pipeline_stages completed, job_pipeline_positions, job_stage_events)
  and dictionary_overrides joined with key-column entries and purpose descriptions:
  248 properties, 42 tables. The uncovered-tables note is retired.

**`0048` is applied to the live database** — `saved_views`, Q9's third and last layer:
a person saves the board they are looking at under a name and gets it back anywhere
they sign in. The row stores the **query string verbatim**, because the URL is already
the app's serialisation of "what am I looking at" and a second schema for the same fact
could only disagree with it. Private by RLS (owner-only, all four verbs). The three
built-in tabs stay in code and render first; a person's own follow after a rule, with
"Save this view…" at the end of the row — visible exactly when the current board is not
already saved, which makes its presence the answer to "is this kept?".
The RLS probe in `verify/rls.sql` was **watched failing**: with the policy swapped for
a permissive `using (true)` against the live database (rolled back), it reported another
person's view as readable and let one be written onto them.

**`0051` is applied to the live database** — `saved_view_shared_with_team`, the column
0048 promised ("a column, not a redesign"). Amber, 27 Aug: *"team views matter, plan for
them."* Private stays the default; sharing is a deliberate act on one view.

**The read and write policies are now separate, and that split is the whole safety.**
Read: your own, plus anything shared with a team you are in. Write: your own, always. A
widened `for all` would have let anybody in Construction delete Deanna's view. Watched
live, rolled back: a teammate sees the shared view, cannot see the private one, cannot
edit or delete the shared one, and the owner can still stop sharing.

The unique `(profile, board, name)` deliberately did **not** widen: two people may both
call a view "Site this week", which is two people using the same words rather than a
collision. The tab row carries whose it is instead.

**`0050` is applied to the live database** — `user_preferences`, Q9's last layer.
Landing page and default jobs view now follow the person to any machine they sign in on.

**Why a table and not a column on `profiles`, checked rather than assumed:**
`authenticated` holds UPDATE on *every* profiles column, `profile_permission` included —
what stops self-promotion is the RLS policy, which admits only admins. A preferences
column there would have needed a second policy saying "…or it's my own row", and
policies are OR'd: that one sentence would have handed everybody write access to their
own permission level. The separate table needs no such policy and profiles is untouched.

localStorage stays, and is not a leftover: the landing route is decided on the first
render, and waiting on a round trip there would flash the wrong page at somebody whose
default is Jobs. The device's copy answers immediately, the profile's is the true one,
`adoptPrefs` pulls it down on sign-in, and every change writes to both. RLS probe
watched failing against a permissive policy before passing (it saw 2 rows including
somebody else's).

**`0049` is applied to the live database** — `profile_is_demo`, the tick that holds an
account at the door (Amber, 27 Aug). A demo account signs in, reaches a gate screen and
reads nothing. The gate says one thing, in her words (27 Aug): **"You do not have
permission to access this page. Please contact admin for approval."** An earlier draft
softened it into "you're all set up — it just opens when somebody walks you through it",
which reads as a delay somebody else is already handling, so the person waits instead of
asking and the one action that opens the door never happens. Nobody is named on it: a
greeting on a refusal reads as sarcasm. Her reason, worth keeping because it explains why this is neither
deactivation nor a permission level: *"I don't want them in the app unless I am there
with them training them. That way they can't test and trial without me by logging in,
but I don't have to deactivate them."*

**It is enforced in one place, not on the screen.** Every read policy hangs off
`is_active_user()`; that function now also requires `not profile_is_demo`, so every
table refuses at once — including tables nobody has written yet. The one exception is
deliberate: the `profiles` SELECT policy is widened so a demo account may read **its own
row**, because `RequireAuth` has to read that row to know the account is held at all.
Without it the app cannot tell "held at the gate" from "not set up" and everybody lands on
"your account is not set up" — the exact wording this project already lost an hour to.

Watched live in a rolled-back transaction before any app code: the same account read
6 projects · 60 jobs · 15 teams · 47 people, then **0 · 0 · 0 and exactly 1 profile**
with the tick on, then 60 jobs again with it off. `verify/rls.sql` carries the standing
probe (it flips the flag on the test person mid-run and restores it, including on error).

**Amber's answers, second round (27 Aug)**, each binding:
- **The house icons swap**: Projects wears the *pair* (a project holds many houses),
  Jobs wears the *pin* (a job is one site). Shipped; the reasoning is at the icons.
- **Preferences get their own table, not a column on `profiles`** — and the reason is
  checked rather than assumed: `authenticated` holds UPDATE on *every* profiles column,
  including `profile_permission`, with only the RLS policy holding the line. A
  "…or it's your own row" policy for preferences would be OR'd with the admin one and
  hand everybody write access to their own permission level. Draft at
  `scratchpad/0049_preferences_draft.sql`; ships as its own PR once #44 merges.
- **Team-shared saved views are wanted** — not now, but designed for: a `shared_with_team`
  column on `saved_views` plus a widened policy, planned in the same draft file. Private
  stays the default; sharing is a deliberate act.

**Amber's answers to the open questions (27 Aug)**, each now binding:
- **One colour family, not two** — the board's ramp is Lofty's teal deepening across
  all seven lifecycle positions (`theme/accents.ts` re-cut, contrast re-verified).
  Trade-off flagged: Cancelled no longer reads red; one-line change if wanted.
- **The dashboard hero is a count** — "3 need your attention", not "67% on track" —
  when health lands. Recorded here; nothing computes health yet.
- **The bell stays visible** as a labelled coming-soon preview.
- **Creating a team from the app is wanted next** — the closed `TeamId` union opens
  up, `createTeam` joins the seam, and the seed-agreement check gets revisited.

A fifteenth batch, from Amber's next asks (27 Aug):
- **The old Lofty number is first-class** ("it is what everything is linked to and
  they will look it up"): `jobs.job_number_old` already existed; now the header
  search and the in-drawer find match it, the drawer subtitle shows "Lofty #12345",
  and a **Numbers & addresses** panel sits first in the drawer — job number, the
  Lofty number **editable** (`user`+, through `updateJob`; the unique refusal comes
  back as "already on another job — search it"), current address, and previous
  address (honest "never renamed" when there is none).
- **Lofty's own nav icons** — her three house drawings redrawn as strokes in
  `theme/houseIcons.tsx`: Projects = house in a map pin, Jobs = two houses,
  Reports = house with rising bars. Same size/currentColor contract as @vibe/icons.
- **An unknown URL says so now** — there was no catch-all route, so a typo or stale
  bookmark rendered a blank white page with no shell and no way back. `NotFound`
  renders inside the shell, names the path, and links home.
- **`npx tsc --noEmit` was a no-op all along** — the root tsconfig is solution-style
  (`files: []`), so it type-checked nothing and exited 0. `npx tsc -b` is the real
  check; this batch was the one that noticed, when a missing import sailed through.

A fourteenth batch, from those answers:
- **The board ramp is one family** — `theme/accents.ts` re-cut to teal deepening
  across the seven positions (verified ≥ 8.7:1 per chip).
- **Create-team shipped** (G44 closed): `TeamId` opened to `string` — the closed
  union could only name compile-time teams — with the reasoning kept at the type;
  `createTeam` on the seam cuts the slug once via `teamSlug()` (shared with the
  Admin preview) and slots after the last active position, under 0026's existing
  `admins add teams` policy; Admin → Teams grows name-in/slug-previewed/Add, with
  the taken-slug case disabled and explained. `verify/seeds.sh` now asserts the
  seeded slugs are an **ordered subset** of the live table (app-created extras
  allowed; missing or reordered seeds still fail — watched both ways).

A thirteenth batch:
- **The docked drawer head stacks** — four controls beside a full street address left
  the title reading "Lot 1, 28…" in a 460px panel. Docked, the actions get their own
  line under the title (`ui.css`, keyed off `.drawer:not(.is-expanded)`); expanded,
  one row fits and stays. Verified both ways with a seeded screenshot.

Still open from Q9, each a schema change for its own PR after this one merges:
**profile-roaming preferences** (a preferences home on the profile) and
**user-saved views** (a saved_views table + RLS + the tabs grow a user section).

Still open from this session: nothing yet *consumes* the SLA numbers — the
at-risk/overdue flags on boards wait on the health calculation (see the parked
`health_statuses`).

**A session note for PR #37 (25 Aug — stage moves, comments, property_defs, project
editing, address history) was never written**; `prototype-app-comparison.md` §1.5
carries the full delta ledger for it.

---

## Session of 2026-08-24 — forms, tables, and one invisible dropdown

### The bug worth carrying forward

**Every dropdown inside the create panel was painted behind it, and looked like a field
that did not work.** Amber reported it as "I can't add project type to the new project
form". The field was fine. Vibe renders a Dropdown's menu through a portal into `<body>`
in a wrapper whose whole ancestor chain computes `z-index: auto`, and an auto-stacked
positioned element paints *before* anything with a positive z-index — so the menu landed
under `.create-panel` (41). Measured rather than reasoned about: with the menu open its
`[role="option"]` elements sat at x 957–1380 while the panel covered 940–1400.

One line in `ui.css` fixes it, above Vibe's own Modal (10000) rather than merely above our
panels, because a popover has to clear whatever opened it. State, Council and Owning team
had it too. **Anything new that opens a layer over the page needs to check this**, and the
check is "open a dropdown inside it", not "read the CSS".

### What else changed

- **The user form was the one form never swept forward.** It rendered
  `.create-field / .create-label / .create-hint` — three class names `ui.css` has no rule
  for — inside a centred `Modal`. That is the whole explanation for "the edit user one is
  weird". `Field`, `Problem` and `Result` now live in `components/Form.tsx` and both files
  import them; New job and Split project moved onto `CreatePanel` alongside New project.
  Deactivate stays a modal on purpose — a confirmation is supposed to interrupt.
- **Sorting** — `components/SortableTable.tsx`, applied to Users and Teams. Blanks sort
  last in both directions; permission sorts by the ladder, not alphabetically.
- **Inline editing of a user row**, covering exactly the columns the table shows. Only
  changed fields are sent. `login_email` stays in the panel — an editor that reached
  further than the table displays would be invisible until it had changed something.
- **`profiles.teams` rendered as slugs** on the dashboard greeting, in Settings and in the
  Admin table. `boardModel` had resolved a job's owning team through `teamName()` for a
  while; nothing did the same for a person's memberships. `useTeamLabels()` now does.
- **The dictionary lists a constrained column's values**, and says where they live, which
  is what decides who can change them: rows in a lookup are an ordinary write, an enum or
  a CHECK is a migration. Checking the migrations to write that down turned up four
  entries recording enums Postgres no longer has — `projects.project_type`,
  `projects.project_status`, `jobs.job_status` (all `0028`) and `jobs.job_stage` (`0035`).
  Those are corrected.

### The team-name fix needed a second pass

The first one resolved `profiles.teams` through `teamName()` and stopped there, and Amber
reported the dashboard **still** showing `lofty_general`. It was not a stale deploy —
production had the merged bundle and it was calling the resolver.

`teamName(id, from)` falls back to the id when the lookup has no row for it. That fallback
is right where it was written: a job owned by a retired team must render *something*. It is
wrong as a loading state, and the dashboard is where that bites hardest — the page's
loading gate waits on `listJobs()`, so somebody with **no jobs** clears it instantly while
the teams read is still in flight, and the slug gets painted as though it were the name.
If the read fails outright, it stays there forever.

Reproduced both, against a build of the merge commit, before changing anything:

| teams read | before | after |
| --- | --- | --- |
| slow (3s) | `lofty_general`, then the name | blank, then the name |
| fails | `lofty_general` **permanently** | "Team names unavailable" |

`useTeamLabels().labels()` now returns **null** rather than a slug when the lookup cannot
answer, which forces every caller to say so. `boardModel` already had this right — it puts
the teams query in its own loading gate, *"without them every owning team renders as its
slug"* — and the three screens that read a person's memberships did not.

**The general rule, worth keeping:** a foreign key on screen is a stand-in, and the house
rule against inventing a value covers it. Anywhere a slug is resolved through a lookup, the
unresolved case needs its own answer — not the raw key.

### Still open

**Amber asked to be able to add and edit enum values from the app.** For `teams` that
already works — it is a table. For the rest it is DDL (`ALTER TYPE`, or dropping and
recreating a CHECK), which PostgREST cannot issue and no policy can grant. The page says
so per property rather than offering a control that would fail on save. Making it true
would mean either an edge function holding a service-role key that runs vetted DDL, or
converting the remaining enums to lookup tables the way `teams` and the stage vocabulary
already went. That is a decision, not an implementation detail.

---

## Session of 2026-08-21 — Phase A built, applied and proved

### Where it actually stands

Verified against `gmekuqdjemrfuurxhuib` on 21 August, not remembered:

| | |
| --- | --- |
| Tables | **24**, every one with RLS enabled |
| Policies | **70**, none missing a `WITH CHECK` on an UPDATE |
| Views | **10**, every one `security_invoker` |
| Security advisors | **0 errors** (72 warnings, all understood — 68 are pg_graphql discoverability, 3 are the `SECURITY DEFINER` helpers the policies need, 1 is leaked-password protection, irrelevant behind Entra) |
| Migrations | **35 applied**, 33 files |
| People | 47 profiles, 45 team memberships, 15 teams, 9 lifecycle stages |
| Records | **0 projects, 0 jobs** — Phase B has not run |
| Repository methods reading Supabase | **15 of 18** |

**The two migrations with no file are both accounted for**, which is worth recording
because "the repo cannot rebuild production" was a live worry:

- `0014_revoke_recreated_audit_function` — its content was folded into the repo's
  `0013`, which carries both revokes. Checked rather than assumed: replaying the repo
  files alone produces `log_activity_audit` with no EXECUTE for `anon`, `authenticated`
  or `PUBLIC`, which is what production has.
- `move_profiles_backup_out_of_the_api` — moved an ad-hoc backup table out of `public`.
  A rebuild from empty never creates that table, so there is nothing for a file to do.

### What was built

Migrations `0024`–`0033`. Teams became a lookup table; the stage enum was reconciled to
the nine live values; `projects` and `jobs` moved to natural keys under the
prefix-everything naming convention; then pipelines and position, tasks and dependencies,
variations, and documents/comments/tags.

The four axes are separate tables, deliberately, and merging any pair destroys something
that cannot be recovered afterwards — see `schema-plan.md`.

### The sign-in outage, and what it taught

Sign-in broke twice on the same day and both causes are worth carrying forward.

1. **PGRST201.** `profile_teams` has three foreign keys to `profiles` — `profile_id`
   plus `created_by`/`updated_by` from the audit quartet — so an unqualified
   `profile_teams(...)` embed is ambiguous and PostgREST refuses it. The query deciding
   whether you are signed in went through that embed. **Every table with the audit
   quartet has this shape**, so every future embed of one must name its constraint.
2. **A trigger on `auth.users`.** `log_login_activity_from_auth_users()` still wrote
   `profiles.last_login_at` and matched `auth_user_id`, both renamed in `0028`. It fires
   on every sign-in, so the trigger raised, the update rolled back, and there was no
   session at all.

The lesson from the second is in `0033`'s header: *"which functions reference this table"
is a question to ask the database, not one to answer from a function's name.* The rewrite
list for `0028` was built by reading names out of `pg_proc`; this one reads like a logging
helper and the write to `profiles` is four lines into the body.

Neither could have been caught by the harness as it stood — `0008` explains that no
migration here can create a trigger on `auth.users`, so the throwaway database differed
from production in exactly the place that broke. `replay.sh` now creates it afterwards,
where it is superuser and may, and `behaviour.sql` simulates a full sign-in.

Both outages presented as *"your account is not set up"* because two `catch` blocks
swallowed the error. `AuthProvider` now fails closed **and** reports.

### The placeholder sweep

Every page and form was audited against the live database. Four different things were
occupying the screen while their table was unavailable, and they all looked identical:

| | |
| --- | --- |
| `{{table.column}}` tokens | Working as designed — they announce themselves |
| Invented records | 5 projects and 11 jobs generated at render time. `PRJ-001-02` read as a decision the app had made, and every figure on Reports was arithmetic over a fixed array — "45% on track" counted positions in an 11-item status cycle |
| Correct but not live | Stages and teams, right but read from a TypeScript seed while real tables held the rows |
| Invented process | 36 checkpoints, 11 property definitions and a team-per-phase mapping that **disagreed with the database** — none of it from Lofty |

All four are resolved: the boards read real records, the lookups query, and the two that
have no table (`pipeline_stage_tasks`, `property_defs`) return empty with the screens
saying so. The eleven property definitions are preserved in `schema-plan.md` as the
Phase C starting point rather than deleted.

Two defects fixed along the way, both live at the time:

- **Creating a project lost it.** `createProject` wrote to Supabase; `listProjects` still
  answered from a stub that returns `[]`. The row was inserted, the number was issued,
  and neither the board nor the New job picker could see it.
- **Five property definitions never rendered.** They named a stage that does not exist
  (`"Sales & acquisition"` with a lowercase a), so Setup → Properties counted eleven in
  its heading above a table of six.

### `verify/seeds.sh` — the class of bug behind most of the above

Two lists that must agree, written in two places, with nothing noticing when they stop.
Three got past review in a week: the property definitions above, a commented-out query in
`listProjects` naming five pre-`0028` columns, and eight data-dictionary entries marked
`created` for view columns renamed by `0028`.

`seeds.sh` asserts all of it — seeded stages and teams against their tables, every column
in each `*_COLUMNS` select list, every `created` dictionary entry, and the six dropdown
lists in `import/build_template.py` against the lifecycle's stages, the `au_state` and
`sa_council` enums, the check constraints on `job_status` and `project_type`, and the
active teams. **Each assertion was watched failing before being trusted.** It also
reports, without failing, that 188 real columns have no dictionary entry: everything from
`0030`–`0032`.

The spreadsheet lists were added after the sheet was found still offering the nine
lifecycle stages `0035` had replaced with five — seven values the database would refuse on
insert, in a dropdown, which reads as the list of permitted answers. The script's own
docstring already said `seeds.sh` was what caught it drifting; it was not, until now.

---

## Session of 2026-08-16 — what changed, and what is still open

> **Superseded in places.** Kept for its reasoning. Anything it calls "next" was
> done in the 21 August session above, and the schema it describes predates `0024`–`0033`.

### Applied to the live database

`0020`–`0023` are **applied** to `gmekuqdjemrfuurxhuib`, not just written. `supabase
migration list` is the check if that ever looks doubtful.

| | |
| --- | --- |
| `0020` | Backfills `auth_user_id` for anyone whose auth user predates their profile. A no-op now; kept for the case below. |
| `0021` | Drops `profiles.preferred_name`. `profile_display.greeting_name` is `first_name`. |
| `0022` | Folds `profile_teams` into `profiles.teams team[]`, normalised on write, GIN indexed. |
| `0023` | Requires `original_address_id`, `created_by` and `job_number`; adds `jobs.old_job_number`; fixes project numbering. |

### Six faults found, all fixed — the shapes are worth knowing

1. **`create or replace view` does not preserve `reloptions`.** Rewriting `profile_display`
   silently dropped the `security_invoker = on` from `0001`, which would have left the view
   executing as its owner and returning every name in the company past the policies on
   `profiles`. Exactly what `0001`'s own comment warns about. **Any migration touching a
   view must re-apply `security_invoker` and assert on `pg_class.reloptions` afterwards.**
2. **`created_by` was never populated.** Not by the app, not by a trigger — every row ever
   written left it null. `stamp_created_by()` fills it now, falling back to a system
   account when there is no JWT.
3. **Project numbers were not sequential** — 1000, 1002, 1004. `bump_project_no_seq` asked
   its question with `nextval`, which consumes rather than reads. It uses
   `pg_sequence_last_value` now.
4. **The toolbar filters filtered nothing.** The chips rendered and were never applied to
   any row; only the header search narrowed results. `FILTERABLE` is now only the fields
   the data actually carries — "Team member", "Type" and "Tag" came off it and go back when
   their columns exist.
5. **A backfill that claimed to be re-runnable was not.** Caught by running it twice against
   fixtures, not by reading it.
6. **The team picker labelled the first chip "(primary)"** after `0022` had made
   `profiles.teams` a sorted set. The database reorders on write, so that label had stopped
   being able to be true.

### App changes

Records have URLs (`/jobs/:jobNumber`, `/projects/:projectNumber`, flat — a job number
already carries its project). Board state — view, grouping, filters, saved view — is in the
query string, defaults omitted, writes replacing rather than pushing. Saved views are the
phases of the build. Nav moved to a collapsible left rail that becomes a drawer below
900px. Dashboard, User settings and the Admin picker read the profile instead of showing
tokens.

**The binding template's rule got sharper and is worth keeping:** a `{{table.column}}` token
means *the app cannot answer yet*. An empty value from a wired column is a different answer
and gets a message — "No team assigned — ask an administrator to add you to one" — because
only one of those two is the reader's to act on.

**The yellow banner that explained that rule is gone**, at Lofty's request, 23 August — and
the "Unbound" chip in the header went with it. They were one thing: the chip was the badge
and the band was its caption, so keeping the badge without the caption would have left an
unexplained word in the header. The chip had also stopped being true — its text was the
hardcoded string `"Unbound"`, not `repo.name`, so it read the same on a build with eighteen
methods reading live Supabase as on one reading nothing.

The rule itself stands and the tokens still render. What no longer exists is a line on
screen explaining them, which is fine while the audience is Lofty rather than the public,
and worth remembering if that changes. **Setup → Wiring is where the honest answer lives**
now: it counts the methods actually reading from Supabase, per table, and it is generated
rather than typed.

### Open, in rough priority order

1. **The preconstruction pipeline.** Lofty tracks stage 4 through ~10 positions plus three
   terminal states (`Initial Documents` … `Build Commences [Closed Won]`, `Not Proceeding
   [Closed Lost]`, `In Doubt / On Hold`), and jobs should land there by default. Three
   things block building it, and guessing any of them is how the phase split got done twice:
   whether those values are a roll-up of the 57 steps in `preconstruction-process.md` or a
   separate list; whether "stage 4" means the app's stage 4 alone or 4 and 5 together, since
   Lofty's own numbering merges them; and where the three terminal states live, given
   `record_status` already has `on_hold` and `cancelled` and two places recording the same
   fact will drift.
2. **The 57 preconstruction steps have no home.** `template_milestones` (renamed from
   `template_checkpoints`, 26 Aug — Lofty's word is milestones) is the nearest
   structure and its seeded rows are **four invented placeholders per stage** — not Lofty's.
   Mapping the steps onto stages, deciding which are skippable, and deciding whether their
   SLA days should drive the board's "days in stage" are all business decisions.
3. **`0007` fails on a fresh database.** It comments on `activity_audit`, which `0008`
   creates. One `comment on` statement, so the cost is a missing comment — but a clean
   rebuild does not apply without reordering.
4. **"Not set up yet" misreports a dead session.** When the session's auth user has been
   deleted, `getUser()` fails, the catch treats it as "no profile", and the page says the
   account is not on the Lofty team list. It is neither true nor actionable, and it cost an
   hour of debugging. It should detect an invalid session and clear it.
5. **Linking is not self-healing.** `0015`'s trigger is `after insert on auth.users`, so it
   fires once per person. Anyone added to `profiles` *after* they have signed in never
   links, and `0020` has to be re-run. Fixing it properly means a trigger on `auth.users`,
   which per `0015` can be created and never dropped — so it is a decision, not a chore.
6. **"Post-construction" is an inferred name.** The business named preconstruction and
   construction. What stages 7–8 are called, and whether they are one phase or two, has not
   been said. `app/src/data/savedViews.ts` says so at the point of definition.
7. **A naming collision.** The *phase* Preconstruction contains a *stage* also called
   Preconstruction, so a saved-view tab and one of its five columns share a name. Lofty's
   own vocabulary, left alone.
8. **Two profiles have no team**, so they exercise the empty state rather than the value.
   The dashboard's three teammate avatars are still hardcoded — deriving them needs a query
   and a decision about what "your team" means when somebody is in several.

### What is actually wired

`profiles` (47 rows) is the only business table with data. `addresses`, `projects` and
`jobs` exist and are empty. `property_defs`, `property_values`, `comments`, `activity`,
`permission_grants`, `template_phases` and `template_milestones` **do not exist yet** — the
lookups fall back to the seed in `stubRepository.ts`, which is why boards render columns
with nothing in them. Every remaining token on screen is one of those two cases.

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
| **The Netlify build source** | **Resolved and deployed 2 September** — `loftyprojectapp.netlify.app` is a *new* Netlify site (new site id, new team) building from `LoftySupport/loftyprojectapp` on `main`; first deploy `0d84e59`. The sign-in page said *Not configured* on it, which read like missing environment variables and was not: the site is connected to Supabase and the extension sets `VITE_SUPABASE_DATABASE_URL` and `VITE_SUPABASE_ANON_KEY`, names the app did not read | **Closed** — `app/src/data/supabaseEnv.ts` reads either spelling, nothing was added in Netlify, and the deploy after merging put a configured bundle on the production URL. Reasoning in *Session of 2026-09-02, later* |
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
on the Netlify project for every deploy context, so `supabaseRepository.ts` builds a real
client instead of returning null. Locally they come from `app/.env.local`.

**Auth has landed, and the data path is open.** Reads are gated on `is_active_user()`,
so a signed-in person with an active `profiles` row reads real rows and everyone else
reads none. Where a table is not wired yet the repository still falls back to seed data
deliberately: a half-built database should degrade to the structure, not to a blank
screen.

### The Netlify environment, and what is deliberately not in it

The Supabase Netlify extension provisions four variables of its own —
`SUPABASE_DATABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` and
`SUPABASE_SERVICE_ROLE_KEY`. None of them reach the browser, because **Vite only exposes
variables prefixed `VITE_`**. That is the whole reason the app sat on mock data with a
fully populated environment: it was a prefix mismatch, not a missing value.

**And then it happened again, one layer up.** Told the site is a Vite site, the extension
also writes `VITE_SUPABASE_DATABASE_URL` and `VITE_SUPABASE_ANON_KEY` — correctly
prefixed, correctly public, and named nothing like the `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY` the app read. Same outage, same screen, different half of
the variable name. `app/src/data/supabaseEnv.ts` now accepts either pair and prefers this
app's own, so neither spelling is a trap; see *Session of 2026-09-02, later*.

**`SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` have been deleted from Netlify.
Do not put them back.** This is a static Vite build — no Netlify Functions, no edge
functions, nothing in this repo reads either one. The service role key bypasses RLS
entirely and the JWT secret mints tokens for any user, so an unused copy sitting in a
build environment is pure risk: the only thing separating it from the public bundle was
the convention that nobody types `VITE_` in front of it. If a Netlify Function ever
genuinely needs one, add it back scoped to functions only — never to builds.

Two gotchas worth knowing before touching that screen:

- **Set env vars with all scopes.** Writing one scoped to `builds` alone through the
  Netlify API reports success and then does not persist. Always read the variable back
  after writing it; the success message is not proof.
- **Never mark a `VITE_` variable as secret.** Netlify fails any build whose output
  contains a secret value, and Vite inlines these into the bundle by design — so the flag
  turns every build red. They are public keys, and that is correct: RLS is the boundary,
  not the key.


**The prototype it grew from is a different repo** — `amberbeaumont/loftyprojectboard`,
frozen, still deployed at `loftyprojectboard.netlify.app` for showing people. Nothing in
this work touches it. Its PR #11 was closed unmerged as superseded.

That one is **correctly** still under `amberbeaumont` and should stay there: it is a
frozen artefact, not the live build, and moving it would break the links in
`prototype-app-comparison.md` that cite it by line number. It is the app repository that
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
re-run the curl above and confirm `email` is gone — the same read-it-back rule as the
Netlify variables.

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
putting the Netlify URL here. It goes in the redirect allow list instead.

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

Supabase → **Authentication** → **URL Configuration**. **The app moved out of `/app/`,
so these changed.** Site URL `https://loftyprojectapp.netlify.app/`, and under *Redirect
URLs* the deploy previews too or every PR preview fails to complete sign-in:

```
https://loftyprojectapp.netlify.app/**
https://deploy-preview-*--loftyprojectapp.netlify.app/**
http://localhost:5173/**
```

A stale `/app/**` entry here is harmless but no longer matched; the old paths 301 to the
root at the CDN, and Supabase compares against the URL the browser was sent to.

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
scope model; the shape is in `supabase-schema.md`.

## Admin and Setup are different screens

Admin was Users, Teams, Properties, Permissions — two jobs on one screen. It is now:

| **Admin** — people | **Setup** — configuration |
| --- | --- |
| Users, Teams, Permissions | Properties, Dictionary, Wiring, Automations |

"Who works here and what may they do" and "how is this app configured" are asked by
different people at different times. Dictionary and Wiring were top-level nav items
sitting beside Projects and Jobs, which put configuration at the same rank as the work;
folding them in took the nav from nine destinations to eight, and moving Settings into a
menu under the user's own name took it to seven. Both old routes still resolve — they
were in the nav for weeks and are in bookmarks.

The Setup section is in the path (`/setup/dictionary`), not in component state, so a link
to a tab is a link somebody can send.

**Properties is deliberately read-only.** There is no create form: definitions are
superadmin's and arrive by migration, which is what Lofty asked for at this stage. Note
that **`property_defs` does not exist in the database yet** — that tab is still rendering
seed definitions, and the migration to create and populate it is the next schema job.

## The working rule: one branch and PR per table

Each schema decision touches four things that must move together:

1. `supabase-schema.md` — the doc
2. `app/supabase/migrations/0001_core.sql` — the migration
3. `app/src/data/types.ts` — the TypeScript
4. `app/src/data/dictionary.ts` — the dictionary (then `npm run dictionary`)

Landing those on `main` separately is how they drift. So: a branch per table, all four in
one PR, Netlify builds a deploy preview, merge when it looks right.

```bash
git checkout -b claude/<table>-schema
# … all four …
cd app && npm run dictionary && npx tsc -b && cd ..
./build.sh
git commit && git push -u origin claude/<table>-schema
```

## Where it is deployed

| URL | What |
| --- | --- |
| `loftyprojectapp.netlify.app` | The build — **the app is the site now**, not a subfolder |
| `…/dictionary` | The data dictionary, permission-gated |
| `…/signin` | The only route reachable without a session |
| `…/binding-template` | The tokenised prototype — **layout** reference only |
| `…/prototype.html` | The original, dummy data |
| `…/app/*` | 301 → the same path at the root, for old bookmarks |

The app moved out of `/app/`. Three things had to agree for that, and they still do:
`base` in `vite.config.ts`, the catch-all in `netlify.toml`, and where `build.sh` copies
the build. The router basename and the OAuth `redirectTo` both read
`import.meta.env.BASE_URL`, so they follow `base` on their own — that is the one value
to change if it ever moves again.

The catch-all is deliberately **not** `force`d. Without `force`, Netlify serves a real
file when one exists, which is what stops `/assets/*`, `/prototype.html` and the images
from being swallowed by the SPA fallback.

`app/netlify.toml` is **gone**. Netlify reads the `netlify.toml` at the site's base
directory and nothing else, and this site's base is the repo root — so that file had been
dead since the app stopped publishing from `app/`. Everything in it (the SPA catch-all,
the noindex and frame headers, `NODE_VERSION`) is in the root file already. It was kept
around as a second source of truth for a setting only one file decides, which is the
shape of a config that eventually contradicts the live one.

### The environment variables, and where the security actually comes from

> **Stale as of 2 September.** The site this was verified against is gone; the site now at
> `loftyprojectapp.netlify.app` is new and has **none** of these set — see *Session of
> 2026-09-02*. Kept because what belongs where, and why, has not changed.

Verified against the live site, 23 August:

| key | set | read by |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ✅ | the app |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ `sb_publishable_…` | the app |
| `SUPABASE_ANON_KEY` | ✅ | **nothing** — added by the Supabase Netlify extension |
| `SUPABASE_DATABASE_URL` | ✅ | **nothing** — same |

**There is no `service_role` key on the site**, which is the check that actually matters.

Keeping these in Netlify rather than in the repo is right and worth doing — a key in git
is a key in every clone, every fork and every screen share forever. But it is worth being
exact about what it does *not* do: **a `VITE_`-prefixed variable is inlined into the
JavaScript bundle at build time and shipped to every browser.** Built with a probe value,
the string appears verbatim in `dist/assets/*.js`. Anyone who opens the site can read the
publishable key out of it.

That is fine, and by design — the publishable key is meant to be public. **RLS is what
protects the data**, which is why `rls.sql` exists and why every `can()` in the app needs
a matching policy. The one thing that would be catastrophic is a `service_role` key behind
a `VITE_` prefix, because that key bypasses RLS entirely and would be published the same
way. Never add one.

Both `VITE_` variables are scoped to context `all`, so **deploy previews point at
production Supabase**. Fine while there are no jobs; scope them per context at Phase B,
when a preview branch can write to real records.

### `SUPABASE_ACCESS_TOKEN`, and the environment it has to be in

**Netlify is the wrong place for this one, and the distinction is not obvious.** Every
other variable on this page is read by a Netlify *build* — the app's two `VITE_` keys, and
the two the Supabase extension adds. `SUPABASE_ACCESS_TOKEN` is read by the **Supabase MCP
server**, which runs in the Claude Code session's own container. Netlify's environment
never reaches that container, so a token stored there authenticates nothing and is only a
credential sitting somewhere nothing reads — which is precisely why
`SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` were deleted from Netlify above.
It belongs in the **Claude Code remote environment's** variables instead.

Asserted once and then actually checked, because the two environments are easy to
conflate. Four variables that *are* set on the Netlify project, read from inside a
session container:

```
VITE_SUPABASE_URL              (absent)
VITE_SUPABASE_PUBLISHABLE_KEY  (absent)
SUPABASE_ANON_KEY              (absent)
SUPABASE_DATABASE_URL          (absent)

env vars matching /netlify|supabase/i:  0
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
> keys, naming, stages, teams and parties all changed. `schema-plan.md` and the migrations
> are the current record. Kept because a schema decision without its reasoning gets
> "simplified" back into a bug by the next person.

Three tables are designed and in the migration. Full detail in `data-dictionary.md`;
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

## Next: Phase B, the import

Phase A is structure. Phase B is the first real data, and it is also the **checkpoint** —
anything structurally wrong surfaces here, while changing it is still cheap.

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
| Properties | `property_defs` seeded from the eleven in `schema-plan.md`; `property_options`; `property_values`; `property_grants`; `property_value_history` |
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
