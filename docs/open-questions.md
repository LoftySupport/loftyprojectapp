# Open questions

**The queue of things only Amber can decide, asked one at a time.**

Amber, 7 September: *"ask me questions on what I should fix one at a time … if you want a
question, ask it here and then record updates"*. So this file is the queue and the record.
It is not a backlog of work — it is the list of places where Claude would otherwise have to
invent a value, and `CLAUDE.md` is explicit that an invented default is worse than a blank.

## How this works

1. **One question at a time.** Ask the top open question in the chat, not four at once.
2. **Ask, then record.** The answer goes in *Answered* below, with the date and Amber's own
   words where they are shorter than a paraphrase.
3. **Never guess ahead of an answer.** Do everything that does not depend on it first, then
   ask. If a question is blocking, say what is blocked.
4. **A question leaves this file only when it is answered or it stops mattering** — and if it
   stops mattering, say why rather than deleting the row.

---

## Open — next question first

### 1. "Dear [Owner Name]" — which party on the record is that? *(parked)*

**Parked by Amber, 10 September: _"that will be later when linking a contact or company to
project or job"_.** The decision waits until parties are actually being attached to records
rather than being made in the abstract — which is right, because the answer depends on what
a real job's Parties panel turns out to hold. Nothing is guessed in the meantime and no
token is built; a letter written today types the name by hand.

Kept in the file rather than removed, because it is unanswered rather than irrelevant, and
it will be the first thing to settle when the linking work starts.

Amber, 10 September, writing a letter: *"dear [Owner Name] your property [property address]
has just received planning approval on [planning approval date]"*.

Two of those three resolve today. `{{address}}` is a record fact, and
`{{planning_approval_received}}` is a real property definition. **The name has nowhere to
come from**, and this is the sentence it blocks.

What exists: `record_parties` attaches a contact or a company to a job or a project under a
role, with one marked primary — the Parties panel on every record. The roles are
**certifier, consultant, contractor, council, engineer, purchaser, real estate agent,
supplier, surveyor, other**. There is no *owner* and no *client*.

So the question is really two:

- **Is the person a letter is addressed to the `purchaser`**, or is "owner" a role Lofty
  needs that the list does not have? (A land owner who is not the purchaser is an ordinary
  thing in this business, which is why this is not obvious from the list.)
- **When there are several** — two purchasers on one house — does the letter take the one
  marked primary, or every one of them joined with "and"?

Nothing is guessed until this is answered. What it unblocks: a token per role, filled from
the record's own parties, so `Dear {{purchaser_name}}` (or `{{owner_name}}`) works the same
way `{{address}}` does. The mechanism is the small half — `record_parties` and the Parties
panel already exist, and `makeFillTextTokens`/`tokensFor` are where a role token would be
added. What is missing is only the decision about which role a letter opens to.

### 2. Does undo need a home on a phone?

The header bar is hidden below 600px because two more 32px targets left the search box 70px
wide, and Ctrl+Z does not exist on a phone — so a phone has no undo at all. Is that
acceptable for now, or does it need one (a long-press on the "saved" toast is the obvious
place)?

### 3. Should the person picker offer deactivated people?

`PersonSelect` lists active people only, and every assignee, owner and "who is doing this"
control uses it. A job already assigned to somebody who has since been deactivated still
shows their name read-only. Nobody asked for the other behaviour; this records that it was a
choice.

### 4. What is "undo" allowed to reach?

Today it reaches every field write that saves as you make it — team, assignee, dates, tasks,
process runs, property values, a request's stage. It deliberately does NOT reach lifecycle
moves (forwards-only by your rule), creating, deleting, votes, follows or comments. Is that
the right line, or should a lifecycle move be undoable within, say, a minute of making it?
(The database refuses the way back today; allowing it is a migration, not a UI change.)

### 5. Where does "clone a job" live now?

**Blocked:** nothing is broken, but the app currently has no way to clone a job at all.

Amber, 7 September: *"remove clone off the job sidepanel.. cloning jobs can only be done on
projects"*. Done — the button is off the job drawer. But **there is no clone control on the
Projects side yet**, and there never was: `CloneDialog.tsx` and `repository.cloneJob()` were
only ever reached from that one button. Both are kept on purpose and are now referenced by
no screen, so the capability is intact and only its entry point is missing.

What is not decided is what it should look like there:

- **A row action on each job listed inside a project** — closest to the old behaviour, and
  it keeps "which job am I copying" obvious.
- **One "add a job like…" control on the project**, which picks the job to copy from a list.
  Reads better as an act on the project, which is the reasoning for moving it.

Either way `cloneJob(id, copy)` is unchanged and manager+ still gates it. Do not delete
`CloneDialog.tsx` as dead code before this is answered.

### 6. Is the placeholder at 3.47:1 accepted, or does it get fixed?

The design system now labels it *"example text only, never a label"*, which narrows the
exposure but does not clear it — placeholder text is still text under WCAG 1.4.3. `#757478`
would clear it at 4.64:1 as a new `--lofty-black-70` step, leaving `--ui-border-color` at
the 3.47:1 it was deliberately chosen for.

### 7. What should five missing roadmap items say?

Five commits carry a `Roadmap:` trailer whose text matches no checkbox in `ROADMAP.md`, so
work that was finished has no line to tick:

- A readable change history on every record
- Companies, contacts and parties on records
- Maintenance
- Notifications, in-app first
- Tasks, sub-tasks and checklists

They are real and shipped. What is missing is which phase each belongs to and whether the
wording above is the wording you want, and inventing roadmap text is exactly the thing
`CLAUDE.md` forbids.

### 8. How is health status worked out? *(mostly answered — one half left)*

Long-standing, from the schema plan's own risk list. *"Status is what someone sets. Health
is what the system works out"* — from inputs nobody had defined.

**Amber, 12 September, answered the input:** *"Job at risk is when the process is overdue
which is set by the days marked in the process which says it's at risk."*

So health is **read off the process runs**, and none of it needs a new column. A process
line already carries `expected_days` and `at_risk_lead_days`; a run of it already carries
the `due_date` and `at_risk_date` those produce, and a `health` the database computes —
`not_started`, `no_expectation`, `on_track`, `at_risk`, `overdue`. The job's health is a
roll-up of its runs' health rather than anything new. That settles the question the schema
plan's risk list actually asked: it is not an empty required field and not a blocked
dependency, it is the clock on the process.

**What is still open is the other half of the pill.** The record draws three states and
the answer names one. A job is *at risk* when a process on it is overdue — so what makes a
job **overdue**?

- **The job's own completion date has passed** (`job_target_completion`, `0113`), which is
  the reading that makes both words mean something: a process running late puts the job at
  risk, and the job missing the date it was working towards makes it overdue. **Recommended.**
- **A process is overdue by some further margin**, which needs a second number nobody has
  set.
- **Nothing does** — the job pill is only ever on track or at risk, and overdue is a
  process-level word. Defensible, but then `StageTrack`'s three colours are two.

Also unanswered, and smaller: does a run sitting at `at_risk` — inside its lead days, not
yet past its due date — make the JOB at risk, or does the job only turn when a run actually
goes overdue? The answer above says "overdue", so the build will take that literally unless
told otherwise: a run at `at_risk` leaves the job on track.

**Blocked meanwhile:** kanban-by-health, the dashboard's on-track tiles, and the record's
health pill, which still reads `job_status` (a column somebody sets) rather than a derived
health.

### 9. Does Acquisition & Development want a `project_stage` vocabulary?

`project_stage` is nullable and costs nothing empty. Do not seed a vocabulary until they
confirm they want one — a half-filled stage column that some projects use and others ignore
is worse for reporting than no column.

### 10. Do exported documents take Flint for their greys?

The design system retired the two cool greys on 7 September: `#f6f7f7` and `#e7e8e9` are
gone from the mirror, and in the app Flint 100 `#f4f3ee` is the page and Flint 300 `#c6c5ba`
draws the rules. The Word and PDF writers (`app/src/data/export/houseFormat.ts`) still use
the old two behind a table header and for the header hairline — deliberately decoupled from
the app's theme so a document does not change look when a screen does, and print is also
where the design system says Mid Grey still belongs. So: do exported documents follow the
app onto Flint, or is the house format its own record? Not changed on the sync, because the
export palette is written down as a decision (0026) and this file is where decisions change.

### 11. A Xero invoice with no purchase order — job or project?

Purchase orders belong to a job and a contractor (answered 8 September, question 16). A
contractor's bill reconciles against its purchase order, so it inherits the job. What is not
decided is the invoice that has **no** purchase order — a land purchase, a development cost, a
consultant on the whole site. Recommended: the `invoices` table carries a job **or** a project
(one of the two, checked), and the review queue holds anything Xero sends that matches neither.
The alternative — everything on a job — leaves project-level money with nowhere to go.

### 12. "Only managers can connect it to approved sources … this is done by superadmin"

Question 18's answer (8 September) says both. Read as: a **superadmin registers** each approved
source once, organisation-wide (the Copilot Studio agent, the Xero and SiteBook connections),
and **managers may use** what is registered, alongside everyone else who signs in. If instead
managers should be able to register a new source themselves, the Admin → Integrations page
opens to managers for that one act and the plan's §3 changes one word. Not blocking: Phase 1
has one source to register and a superadmin registers it either way.

### 13. Fieldwork in a printed PDF — is the licence settled?

Amber's rule for documents (9 September, answered below): Montserrat, *"unless it has fonts
embedded in it for print then it will be brand font"*. The PDF writer now embeds Montserrat,
so by that rule it could embed Fieldwork instead. It does not yet, for one reason: the brand
repository's own `NOTICE.md` says Fieldwork is a commercial face whose distribution beyond
the private repository is unconfirmed. Embedding it in a PDF puts a subset of the font
program in every file a client receives, and shipping it in the app puts the whole face on
`hub.lofty.au` for anyone to fetch. Montserrat is under the SIL Open Font License and has
neither problem. So: does Lofty's Fieldwork licence permit embedding in documents sent to
clients, and web-serving the face? If yes, the PDF's two faces become Fieldwork Geo Demibold
(600) for headings and Fieldwork Hum Light (300) for cells — the six `.woff` cuts are in the
brand repository — and the Word file stays Montserrat, since Word cannot embed without the
reader's cooperation.

### 14. When the SharePoint integration lands, does Lofty Hub ever hold the file?

`0103` lets a document be a URL, so a job's contract can be filed against it today by
pasting the link. The row that holds it (`documents`, from `0032`) has **both** a storage
path and a URL, and nothing stops both being set — deliberately, because the integration
might legitimately be the case for it.

What has not been decided is which of two things the integration is:

- **A link recorder.** It reads SharePoint and writes the URL, and the bytes never leave
  Microsoft. `document_storage_path` then stays empty for everything filed this way, and
  Lofty Hub never has a copy of a client's contract.
- **A two-way sync.** Uploading here puts the file in SharePoint, and a file in SharePoint
  is fetched here. Both columns get set, and Lofty Hub does hold copies.

It changes what has to be built and where the risk sits, so it is worth answering before
the integration is scoped rather than during. Nothing is blocked meanwhile: filing a link
by hand works either way.

### 15. Should removing a document from a record be a manager's job?

The Documents panel's **Remove** takes a document off *this* job or project and leaves it
on any other record it is filed against, and leaves the file itself untouched in SharePoint.
That is `0032`'s existing rule — *"detaching is not deleting: the link goes, the file
stays"* — inherited rather than chosen for this, and any user can do it.

It has not been asked, and the argument for asking is that "remove" on a contract reads
heavier than it is. The screen already says what it does not do before it asks, so this is
recording a choice rather than reporting a problem — but if the answer is *manager*, it is
one policy line.

### 16. Should a draft be openable in Word, and edit back into the app?

Amber, 10 September: *"you can choose to open it in the app document builder or in the
document native file (eg word, pdf. viewer etc, but it still edits and saves it)"*.

Half of that is built and works. A **published** document opens at its SharePoint address,
where Word Online or the desktop app edits it and saves it back — Microsoft doing the round
trip, not Lofty Hub.

The other half cannot be built yet, and it is worth being plain about why. A **draft** has
no file anywhere: it is blocks in a database. The app can hand you a `.docx` of it, but
that download is a dead-end copy — edit it and nothing comes back, because a round trip
needs the integration (or a Word add-in) that has not been scoped. So the panel offers a
draft's builder and nothing else, rather than a second button that quietly loses work.

Two ways out, and this is the question: **(a)** leave it — a draft is edited in the builder,
and Word only enters the picture once it is published; or **(b)** the coming integration
creates the SharePoint file at *draft* time, watermark and all, so there is always something
to open. (b) is more of what you asked for and is a bigger integration — it means Lofty Hub
writing files into SharePoint rather than only recording where they are, which is also open
question 16.

Nothing is blocked meanwhile: drafts are editable in the builder and publishing works.

### 17. Do the four views and bulk edit go back onto the older screens?

The 10 September rules say *"all **new** pages that are tables"* get board, table, gantt
and calendar — and, separately, *"**always** allow selection and editing on a screen for
the ability to select multiple jobs **or properties** at once"*. The two sentences point
different ways for the screens that already exist: Maintenance, Contacts and Settings →
Properties are tables with none of it.

What is unambiguous is already built: Jobs and Tasks have all four views, drag-and-drop
and bulk edit. What is not is how far back to go, and it is not a small amount of work,
so it is a question rather than a guess:

- **Maintenance** is the one where all four views have something true to draw — a reported
  date, a next visit and an owner. Board, gantt and calendar, or leave it a table?
- **Settings → Properties** is named in the sentence ("or properties"), so **selection and
  bulk edit** there looks intended even if the four views are not. Confirm?
- **Contacts** and the other Settings tables are configuration and lookups. Claude's
  reading is that these are the "unless specified otherwise" case and stay tables with
  sorting, filters and bulk edit only. Agree?

Nothing is blocked on this — the rules are written down and the two boards meet them. It
decides how much retro-fitting to schedule, and in what order.

---

## Answered

| Date | Question | Answer |
| --- | --- | --- |
| 12 Sep | Can a kanban column be got out of the way? | **Every column folds to a 48px strip, and four start folded.** Amber: *"on Kanban boards can you make them collapsible so they have a narrow view like the side navigation with completed closed cancelled and acquisitions and development closed by default."* Collapsed is a strip, not a hidden column: the name runs down it, the count stays on it, and a card still drops in — which is what "put Completed out of the way" means and what hiding it would not do. The four are matched **by name** rather than by a per-board list, so the rule holds on the Jobs board's stages, the Projects board's, and anywhere else those words are a column; a person's own choice is remembered per board and per column and beats the default. It needed one `BoardColumn` component first: Jobs, Projects and Tasks each wrote the same forty lines of column markup, which is how a fix lands on one board and not the other two |
| 12 Sep | Why can a task not be created from the Tasks board? | **Because nobody had built the button, and that is the whole answer.** Amber: *"on tasks you can't add a new task and assign it to a person or team or job and project. There is no button."* `createTask` has taken `jobId`, `projectId`, `owningTeam` and `assigneeId` since `0102`, and `TasksPanel` calls it from inside a job — so a task typed by hand could only be created from the record it hung off, and the board built to show every task across every job was a report rather than a place to work. **+ New task** now opens a `SidePanel` asking for all four plus a due date and a planned date. Only the name is required: a task with no assignee is a real state the board already draws as "Nobody", and one with no due date reads as `no_due_date` rather than as overdue. A job **or** a project, never both, in one list so nobody has to pick the kind first; and a task attached to neither is allowed, because *"ring the insurer"* is a real task that belongs to a person and no record. **Closed tasks** joins the six scopes that were already there, and the job-or-project-number filter moved onto the bar from behind Advanced |
| 12 Sep | Why does the job drawer not match the screen design? | **Two reasons, both fixed.** Amber: *"why is the job sideboard not matching the screen type? The process section should have the processes like the mockup then the contacts maintenance that that was in screen design."* First, the **Process** section drew a read-only five-step preview built from the runs, while the list you could start, complete, record against and attach a checklist to was a separate panel eight sections below — two renderings of one set of runs. `ProcessesPanel` has a `bare` mode now and IS that section's body, so there is one list of processes on the record. Second, the tail ran Documents, properties, Watch, Contacts, Maintenance; 6a's own list ends *"Properties and Contacts & Companies — collapsed rows with counts"*, and it now reads Contacts → Maintenance → Project properties → Job properties → Documents → Job details → Departments. **Still open:** the mockup draws Process as a Flint 50 card with a progress bar and one 36px row per step — chevron, tick box, name, date, owner avatar — expanding to that step's own typed fields. `ProcessSteps` is that card and is what the section used to draw; `ProcessesPanel` has the data and the actions but not that shape. Merging the two is its own piece of work and is not done |
| 12 Sep | What does the job drawer keep below the record? | **Only what the record does not already say.** Amber, on job 1002-001 on a phone: *"there is so much on there that isn't on the mockup. The bottom areas attached are all duplicates. The processes should just be in order like the mockup."* `JobRecord` had been built to the 11 September handoff — title and health, Job Stage, Key properties, Process — and the drawer went on rendering the tail it had before that existed, so four panels restated it: **Numbers & addresses** (the job number, the current address, the council, and a Change button doing what the `+` beside that address does), **Who it's with** (an assignee picker writing the same column as Currently with), **Folders** (the job folder Key properties links), and **Phase & stage** (the phase and the days in it, both on the stage strip). All four are gone. What was only in them is one **Job details** panel: the old Lofty number, the title type, the address the job was created as, the owning team, the project's folder. Moving the job to a later stage went up beside the strip it moves, and **Processes moved up** to sit directly under the record's Process section. Not taken: merging the two process lists. The record's is the mockup's read-only checklist and `ProcessesPanel` is where a run is actually started and completed, and collapsing them would have meant either losing the mockup's shape or making the record write |
| 12 Sep | Can the docked footer be got out of the way on a phone? | **Yes, and it starts out of the way.** Amber: *"the bottom section with task and actions also needs to be able to collapse on mobile so it isn't sticky."* Below 720px — `useOneLine()`, the toolbar's breakpoint, reused rather than a second one — the footer starts shut as a 37px tab strip, and a chevron in the strip's trailing slot opens it. Tapping a tab while it is shut opens it **on that tab**, because two presses to read the comments is how people stop using a panel. The panel is unmounted when shut rather than hidden: all three read from the database, and a shut drawer polling a comment thread nobody is looking at is a cost with no reader. At a desk it is unchanged and always open |
| 12 Sep | Can a date be taken back? | **It can now, in both places it could not.** Amber: *"when you are on a date field the reset button isn't working — for example on a job if I hit the completion date by accident u can't undo it. You should be able to x it out."* Two separate faults. The job's completion date was a bare `<input type="date">` and the browser's own clear is not a promise: Chrome draws a small ✕, Safari draws nothing, a phone gives a wheel with no way back to empty — so `DateField` draws its own, which clears and then puts focus back on the field, because the commonest reason to clear a date is to type a different one. And every property of format `date` had a clear that silently did nothing: `onChange` read `if (e.target.value)`, so somebody using Chrome's ✕ watched the field empty itself and the value stay where it was. Guarded by `npm run check:date-clear`, which asserts on what the caller was **told** rather than on what the input shows, and which CI runs |
| 11 Sep | 6c draws a value control beside every column name — whose value is it? | **Leave it out.** Four readings were put up — a preview plus an empty-column filter, an editor for the open job, a bulk fill across the board, or nothing — and Amber took the last. So the column picker chooses, searches and groups columns and does not edit values. The ambiguity was real rather than a failure to read the package: the drawn values are one job's (*24 Wandoo Road*, *Evanston Park*, *Pre-construction*) while the count line says *"17 of 41 columns have a value on this board"*, and no reading satisfies both. **"Saved to this view only" is left off the footer for a different reason**: it would be false. `useColumnLayout` stores the layout per person per surface and syncs it to the profile, so it follows somebody to another device and is not scoped to a saved view at all |
| 11 Sep | (asked as 20) Is a job's completion date the one being aimed at, or the one it finished on? | **Both, and the job's pair is separate from the project's** — *"project date and job dates are separate and [it] depends [on] each other. [Both] are needed and relevant"*, confirmed against the exact columns before anything was written. So `jobs` gains `job_target_completion` (the date being worked towards) and `job_end_date` (when it actually finished), mirroring the pair `projects` has carried since 0001. The drawer's **Completion date** shows the target while the job runs and the actual once it is done, which is exactly what 6b draws — *Target completion 14/11/26* under Construction, *"Job completed (or Target completion)"* under Complete. The project's own dates do not move and a project's completion goes on being **derived** from its jobs rather than typed (decision 7). The seeding variant was offered and not taken: a new job's target is not pre-filled from its project's, so a job with no target says so rather than inheriting a date nobody set for it |
| 12 Sep | Do Inbox and Tasks carry a count? | **Not yet — both badges were built on 11 September and taken out again on the 12th.** Amber first: *"Inbox and tasks should have a badge"*, with Inbox reading unread notifications from the same state as the bell so the two could not disagree. Then, seeing it: *"they ideally will be for new since last check on inbox and open tasks but if not correct then will just be ignored. So until counts are verified and tested remove."* So the rows are bare again, and what the two numbers have to be is now on the record: **Inbox = new since you last looked**, which nothing in the schema records — there is no per-person 'last seen the dashboard' mark, and unread notifications is a different fact that the bell already shows; **Tasks = open tasks**, which `task_display` can answer but which had not been checked against a real board. The plumbing stays where it costs nothing to keep: `InboxProvider` holds the bell's state so the rail can read the same number rather than a second one, and `.nav-row-badge`, `.nav-row-dot` and `NavRailGroup`'s `alert` keep their styles. The `myOpenTasks` count came OUT of `railCounts()` with the badge — a round trip on every navigation for a number nobody renders is a cost with no reader. **Blocked on:** a decision about what 'new since last check' counts, and where that mark is stored |
| 11 Sep | How does the rail get its counts? | **Destination counts only — the flyout carries none.** Three options were put up: one `rail_counts` view, live per-flyout fetches, or the rail's six numbers alone. Amber took the third. So `railCounts()` is one aggregate returning Projects, Jobs and Maintenance, read once per navigation, and the flyout lists its saved views and its stage groupings with **no number beside them**. This is a deliberate departure from the handoff, which draws right-aligned counts on every flyout row in 7b and 7c — it is the one place the build does not match the drawing, and the reason is cost: nine more queries per page visit, or a `rail_counts` view that has to be re-cut every time somebody saves a view. The flyout's job is to jump to a view from anywhere; the number was never what it was for |
| 11 Sep | What does the job drawer show, and in what order? | **Superseded by a design.** The question was asked with three options; the answer was a package — `docs/design/handoff/job-record/`. Title as the address with the project number linked, health pill, blocked-by banner, then Job Stage, Key properties and Process as the only three collapsible sections, with Tasks / Comments / Activity **docked in a footer** rather than scrolled to. The footer dock is the part no option had: a drawer is header / scrolling body / docked footer, three flex siblings, or the tabs scroll away and the pattern is pointless |
| 11 Sep | Inbox and Tasks in the new rail — what are they? | *"My Work has Inbox (This was previously the homepage dashboard) and task (was task pages)"*. **No new tables.** `/dashboard` becomes Inbox inside *My work*; `/tasks` survives unchanged and is reached from there. The rail's eight destinations become six plus My work |
| 11 Sep | What does Pinned pin? | *"pinned is new and allows people to save/bookmark a page"* — **any page**, a URL with a name: a filtered board, a settings screen, a job, a report. One per-user table of `{label, url}` with RLS, max five. **No status dot**, because a URL has no health; the mockup draws pinned rows as projects with a health dot and that is the thing which changes |
| 11 Sep | The stage strip has five segments; the database has seven stages | *"There are 7 stages but when a job is closed or cancelled the job pipeline is not open so that is fine and it will just stay as it last was… if closed then those dates don't change as it gets moved to closed 13 months after completed. If it is cancelled they stay as they were at cancelled date so information knows what is done."* **Five segments, always.** Closed and Cancelled are not segments — they freeze the strip, which becomes a record of what was done rather than a live indicator |
| 11 Sep | Does the current stage bar mean "you are here" or "this is slipping"? | *"the at risk stage is yellow"* — **the bar carries health, not position.** The job-record README already had the rest: overdue takes `--negative-color` with white ink, on track `--positive-color` with white ink, never Crisp Orange behind small text. So the apparent collision with `DESIGN.md`'s *colour on containers means phase* dissolves — the bar was never carrying phase |
| 11 Sep | Are "key properties" a fixed set, or a flag on property definitions? | *"key properties for jobs and projects will always be those key 6 which relate to every job and project"* — **fixed, and the same six on both records.** No `is_key` column, no manager configuration. Four are real columns today (current address, council, currently-with, SharePoint folder); Next milestone derives from the process; the sixth is the row below |
| 11 Sep | What is "Handover date"? It exists on neither a job nor a project | *"handover date should be Target Completion Date"* — **a rename**, and it makes the package self-consistent: 6b's own stage readouts already say *Target completion*. Projects carry `targetCompletion`; jobs carry no date column beyond `stage_entered_at`, which is question 20 below |
| 11 Sep | Can a job be "currently with" somebody outside Lofty? | *"Currently with should be the username who is currently assigned that job and their team"* — **no, internal staff only.** `assigneeId` + `owningTeam`, both of which already exist on jobs and projects. The mockup's "Ben Sultana · Owner · Northline" is misleading example data; the field renders as *name · team* |
| 11 Sep | The rail flyout lists saved views, and the screens already show them as tabs | **Both stay, doing different jobs** — the flyout jumps to a view from anywhere without loading the screen first; the tab strip switches once you are there and shows which one you are in. Deliberate duplication with a stated reason, which is what separates it from the duplication the design audit found |
| 11 Sep | What happens to the top bar when the rail takes search, user, Settings and Admin? | **A slim bar survives**, holding only undo/redo, Ask Lofty and the notifications bell — the rail owns navigation and identity, the bar owns "what I just did" and "what happened to me". Those four are **removed** from `AppShell`'s header rather than left to duplicate the rail |
| 11 Sep | Does the app have to meet WCAG AA? | **No — readable is the bar.** *"I don't care about the contrast failures with accessibility so much. It needs to be readable but not meet full accessibility guidelines — like Crisp Orange and white, or Flint together, are ok."* Re-counted against that bar, 252 sub-AA text nodes across 35 routes become **126 that genuinely cannot be read**, in five classes: text at 1:1, `.perm-no` at 1.74:1 (72 nodes — the permissions matrix is made of them), `.cal-dow`, `.updates-chip`, `.updates-phase-chip`. The measured boundary for the sanctioned pairing: Crisp Orange holds on Flint 50 (2.49:1) and Flint 100 (2.36:1), **not on Flint 200 (1.99:1)** |
| 11 Sep | Should the job drawer print a field's owning team, format and SLA? | **No — remove all three.** `PropertySlots.tsx` renders `[teamName, format, slaDays].join(" · ")` on every property row without condition: the three things a manager sets in Setup → Properties, shown to the person who just needs to type a date. A work surface shows the answer; a configuration surface shows the definition |
| 10 Sep | (asked as 2) Each publish saves another copy on the job — version history, or clutter? | **One version. Replace.** *"only onver version of the document. if they want another copy they can download it"* — so publishing again removes the copy the last publish saved, and the record holds one file per document rather than a pile of them under one title. The version chain (`documents.supersedes_id`) is deliberately NOT used here: it answers "show me the current drawing and what it replaced", and Amber's answer is that the replaced one is not wanted at all. **Anybody who needs the older wording downloads it before re-publishing** — that is the whole of the second sentence, and it is the reason this loses nothing that matters. Built in `0111` as a trigger rather than a rule the panel keeps, for the reason 0104 gives about per-caller promises; SECURITY DEFINER because deleting a `documents` row is admin-only by RLS and re-publishing is ordinary `user` work. **One carve-out**, and it is not a hedge: a copy that somebody has since filed on ANOTHER record is left alone and only unpointed, because deleting it would take a document off a job nobody was publishing |
| 10 Sep | (asked as 3) Saved projects views carrying `?stage=` — leave them, or rewrite them? | **Leave them.** *"[No preference]"* — so the recommendation stands, and this records that Claude made the call rather than Amber. The new meaning (the project's own phase) matches the Stage grouping, which was the point of #51. Anyone whose saved view shifted sees a different set once and re-saves it: one confusing moment, no lost work. The rewrite was rejected because `saved_views` stores the query string verbatim (0048) and nothing in it distinguishes a view saved BEFORE #51, where `stage=` meant "has a job in this stage", from one saved after, where the person meant the project's phase — so a blanket `UPDATE` would silently break the second kind to fix the first. **Revisit only if somebody reports a saved view behaving oddly**, at which point it is one person's view to correct rather than a migration |
| 10 Sep | (asked as 2) What belongs in `SHARE_ALLOWED_ORIGINS`? | **Three: `hub.lofty.au`, the Vercel name, and `app.lofty.au`.** *"keep vercel, lofty and app.lofty"*, then *"hub.lofty.au is where the app is at redirected from vercel"* — so "lofty" is `hub.lofty.au`. **Netlify goes**, removed entirely on 6 September. Set to `https://hub.lofty.au,https://loftyprojectapp.vercel.app,https://app.lofty.au` — comma-separated, no spaces, no trailing slashes; the function does an exact string match on the browser's `Origin` header, so a trailing slash or `http://` fails closed and silently. **Claude cannot set it**: it is a Supabase edge-function secret (Project Settings → Edge Functions → Secrets), so this one is Amber's to paste in. Two things worth knowing about the value. Because Vercel REDIRECTS to `hub.lofty.au`, a browser on the live app always sends `https://hub.lofty.au` — the vercel.app entry is belt-and-braces for anyone who lands on the bare Vercel name before the redirect, not the origin production actually uses. And it does **not** cover preview deployments: those answer on a per-branch host like `loftyprojectapp-git-<branch>-loftygroup.vercel.app`, which is a different origin from `loftyprojectapp.vercel.app`, so share links opened from a preview will still be refused. If testing shares on a preview is ever wanted, that is a separate decision — the allowlist is exact-match with no wildcards. **CORRECTED 10 Sep, later the same day: it was already set.** Amber: *"Supabase has the share allowed origins set in edge functions secrets several prs ago"*. Confirmed against the live endpoint rather than taken on trust — `Origin: https://hub.lofty.au` is allowed and echoed back (404 on a token that does not exist, which is the endpoint working), `Origin: https://example.com` is refused with 403 *"This link cannot be opened from here."* So sharing works today, and this row's own claim that it does not was wrong, as were `HANDOFF.md`, `docs/schema/schema-plan.md` and `app/src/features/reports/README.md`, all four now fixed. **The lesson is bigger than the row**: a secret set outside the repository is invisible to it — nothing in CI, in the migrations or in these documents can read an edge-function secret — so a claim about one goes stale silently and stays stale until somebody asks the endpoint. That probe is one curl, and it is what should have been run before writing any of this down |
| 10 Sep | (asked as 1) Turn on leaked-password protection? | **Not yet — leave it off for now.** Supabase's HaveIBeenPwned check stays off, so nothing changes for anyone setting a password. It is one dashboard toggle whenever that changes, and it only ever affects NEW and CHANGED passwords — no existing account is touched and nobody is forced to reset. **Worth putting back in front of Amber before the app opens to the wider team**, which is the point at which the friction is cheapest to absorb and the exposure largest. The security advisor will keep flagging it meanwhile, and that is expected rather than something to silence |
| 10 Sep | Does the council belong in the address line, and does it need moving? | **No, and no.** *"ok the council area still needs to be recorded, but just not in the full address line. it stays as a property field"*, then *"the council is in the lookup table in supabase and already connected and working."* Both halves were already the case — `addresses.address_council` is the `sa_council` value filled from the LGA list, and `build_consolidated_address()` has never composed it in — so nothing was rebuilt and **no `property_defs` row was added**: the council is an attribute of an address, and a `property_values` copy would be a second place for it to disagree with the column. What *was* wrong: a job's council could be set from the drawer's change-address form and never read back, because `job_display` did not select it. `0108` appends `job_council`, off the job's own address, and the drawer shows it beside the address |
| 10 Sep | (asked as 20) What is a Res #, and where does it live? | **A residence number on the plan, and it is one of the address details a JOB records** — *"A project needs to record … Lot # / Street Number / Street Name / Suburb / Postcode / State / Council. A Job needs to record all of that information PLUS Res #."* So it is `addresses.address_res_number` rather than a column on `jobs`, and the app offers the field on a job's address and not on a project's. Text, not an integer, for the same reason `address_lot_number` is text — she wrote "(number)" against Lot # too, and "2B" is a real lot number. It leads the consolidated address once set, and she gave the format as a worked example: *"Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000"* — which also settled two things nobody had asked about, the comma between suburb/state/postcode and the removal of the trailing `, AU`. Built and applied as `0105` — **and corrected the same day on both counts**: it is an INTEGER, not text (*"a lot number or res number is only a number not a number and digitl"*, `0106`), and it is **not** job-only (*"on a project you might update the res number there as well"*), so every address form offers it |
| 9 Sep | (asked as 15) Exported documents: Helvetica, or the brand's new Arial? | **Neither — Montserrat.** *"exported documents in monteserat unless it has fonts embedded in it for print then it will be brand font"*. The Word file names Montserrat; the PDF embeds a WinAnsi subset of Montserrat Regular and SemiBold (~41 kB each, `scripts/build-montserrat.mjs`) since it cannot name a face that is not one of the fourteen. The "brand font when embedded" half is question 15 above, held on the licence |
| 9 Sep | Which orange carries text — the mockups' split, or `Button.jsx`? | Amber first chose **`Button.jsx`**: *"The one filled orange action inverts on hover — fill drops out, orange becomes ink and line."* Applied as drawn that is white on `#f47e63` at 2.62:1, so the follow-up put two options in front of her and she took the Button's behaviour on the pressed step (fill `#c2543c`, inverting to `#c2543c` ink and line, 4.5:1 both states) — built, probed in both themes, pushed. Then, seeing it: *"Make sure buttons are crisp orange."* **Final: Crisp Orange, as `Button.jsx` draws it.** White on `#f47e63` at rest, `#f47e63` ink and line on hover, 2.62:1 in both light states (6.1:1 on dark hover); recorded as shortfalls in `check-contrast`, never allowed to get worse. The pressed step is one line away in `theme/tokens.css` if ever wanted. The 7 Sep pressed-orange decision is superseded |
| 9 Sep | Arial as the fallback, or the style guide's "never Arial"? | **Arial** — *"Fallback order is Montserrat first, then Arial. Do not substitute Helvetica, Calibri or Aptos."* The style guide's bad example in the brand repository is the one that is wrong |
| 9 Sep | Icon count 276 or 274? | **274** plus the 14 Lofty glyphs — readme and changelog are right, `SKILL.md` in the brand repository is stale |
| 9 Sep | Is Mid Grey still a colour? | **Yes** — it is in the design project's `guidelines/colors-brand.html`. Brand only; it draws no UI and no token file declares it, which is why the mirror has no `--lofty-mid-grey` |
| 9 Sep | Board phase colour — the mockups' orange strip, the guideline's none, or the app's teal? | *"happy to do whatever looks best.. green is fine to stay"* — **the teal ramp stays**. Off the palette by name, accepted by the owner |
| 9 Sep | Rail selection and the 56/224 shell from the mockups? | **Superseded 11 September** — the rail is now being built from the handoff at `docs/design/handoff/sidebar-navigation/`, at 224/64 with a white-wash selection. Kept because "concept only" was true when it was said, and a decision that reverses without its reasoning gets reversed back. Original answer: *"the mockups of sidebar and shell is mainly for concepts for slideout draw with the way it presents"* — **concept only**; the app's shell, white pill and 64/232 are not asked to change |
| 9 Sep | The eight PNG-wrapped domain icons? | *"The real vectors are uploaded in the repository as well"* — **not found**: as of brand `main` @ 447b873 and the design project on 9 Sep, Design, Drawings, FloorPlan, JobHouse, JobSite, Maintenance, Projects and Reports are each an SVG wrapping a PNG. Re-check on the next sync |
| 8 Sep | (asked as 14) Which AI vendors may receive Lofty's data through Ask and MCP? | **Anthropic only**, via the Claude API — chosen with Claude on Microsoft Foundry, "any vendor" and "none yet" in front of her. The Ask box ships in Phase 1; no ChatGPT connection; the vendor sits behind one config value so a later move is a setting, not a rebuild |
| 8 Sep | (asked as 15) "Microsoft cowork": which product? | **Microsoft 365 Copilot** — a Copilot Studio agent in Teams over the MCP server |
| 8 Sep | (asked as 16) Xero: one organisation, and what does an invoice belong to? | **One organisation** → a custom connection. And the shape is purchase orders before invoices: *"Each job has many purchase orders created in SiteBook belonging to contractors that need to be linked to jobs and pushed into xero for reconciling"*, then *"Right now I just want to pull info from SiteBook but going forward we want to eventually replace SiteBook so will need to push to xero"*. So SiteBook → Hub now, Hub → Xero later and designed for from the first migration. The invoice with no purchase order is question 13 (open, below) |
| 8 Sep | (asked as 17) SiteBook: API, export, or neither? | *"They have an mcp and api but don't know details yet. This is important to know."* What Hub needs from it: *"job details, purchase order documents, contact details"*. **SiteBook moves ahead of Xero** in the phase order, because the purchase orders Xero reconciles come from it. First task of that phase: the developer documentation and a test login |
| 8 Sep | (asked as 18) Who connects an AI client, and who creates a key? | *"Only managers can connect it to approved sources but I want people to be able to connect their own email. Can this be done with a single organisation wide key. I don't want users to connect their own. This is done by superadmin."* Read as: a **superadmin connects approved sources once, organisation-wide**; **nobody connects a personal AI client**; **each person connects their own mailbox**. The single-key question is answered in the plan §3 — yes to one organisation-wide *connection*, no to one organisation-wide *identity*: the person rides through on SSO so RLS still decides row by row and the Activity tab still says who. "Managers" versus "superadmin" is question 14 (open, below) |
| 8 Sep | (asked as 19) Is Ask read-only in its first version? | **Yes** — *"Read-only first"*. Adding a comment from the phone is Phase 2 |
| 7 Sep | Should the tables stop being visible to `anon` in the GraphQL schema? | **Yes.** `0101` revokes every table privilege from `anon` in `public`, present and future. Visible was never readable — RLS held, and the proof watched it hold — but the shape was discoverable; now a read as `anon` is refused at the privilege rather than answered with zero rows. Sequences left as they were. Nothing runs as `anon`: the share endpoint and the other three edge functions hold the service role |
| 7 Sep | Bugs and Ideas came off Admin as well — is that right? | **Yes — Updates only.** Asked in chat and answered the same evening: one page at `/updates`, the stage/phase/kind/merge controls admin-only inside it. Nothing to restore; `FeedbackList.tsx` stays deleted |
| 7 Sep | "Import a document as a template" — Word, or Markdown? | **Both Word and PDF** — *"Import template as word or pdf"*, which answered the question by rejecting its premise: Markdown was never the point, and PDF had not been offered. `.docx` goes through `mammoth` and is a translation between two structures. **PDF is not**: a PDF records glyphs at coordinates, so headings are inferred from text size and paragraphs from vertical gaps, and tables are deliberately not inferred at all — column detection from spacing gets a merged cell wrong silently, and a table one column out is worse than prose somebody can see is wrong. Every import returns notes saying what it could not carry, shown before the document is created |
| 7 Sep | How should an image get into a document? | **A public bucket** — *"upload to public bucket that stores in the document only"*, chosen with the alternative in front of her. The alternative was signed URLs written into the share snapshot with the link's own expiry, which Claude recommended; the trade accepted is that **an image in a shared document stays fetchable after the link expires**. "Stores in the document only" is why there is no attachments table: the block holds the URL and the layout is the record of what a document carries. `0100`, and the way back if it is ever revisited is one flag plus signing in `compileForShare` |
| 7 Sep | Does undo work after the seam rewrite (#51)? | **"undo redo works"** — confirmed on the live app after the first version (six hand-registered sites) had failed her: *"it didn't let me undo it"* |
| 7 Sep | How many digits is a job number? | **Three** — *"the job numbers are 3 digits"*. Migration 0073 had already made it so; the toolbar's example read `1042-03` and now reads `1042-003`. Older two-digit examples remain in earlier sessions' notes and in `dictionary.ts` |
| 7 Sep | Should there be a CI check for the generated files and the responsive sweep? | **Yes** — *"ok"*. Both are jobs now; the generated-files check caught two real faults on its first day |
| 7 Sep | Filters, a number box, property columns | *"filters on jobs and projects should be same as the group ones … an advanced … enter a job number … columns should be able to add any property in the job (including project properties …)"* — **done in #51** |
| 7 Sep | Should creating a notification *type* stay with admins? | **Yes** — `0097`. Insert and delete are admin's; a manager keeps every rule and may still change an existing type's default channels, timing and active flag, which is what Settings → Automations edits. Three policies by command, not one `for all`, because `for all` would have taken that screen off managers |
| 7 Sep | What does "mark as complete" mean for the seven import sites? | **The question dissolved.** *"i don't need any jobs imported from spreadsheets. all jobs that need to be created from now on will be created from the projects in the app"* — so there is no import, no second copy, and nothing to reconcile. Phase B is closed without ever running |
| 7 Sep | What happens to the import machinery on the live database? | **Nothing — leave it.** *"everything that is in supabase now is correct. If I need to import other areas I will let you know as properties may change between now and then. No new importing for job or projects"*. The staging table, its 801 rows and the three functions stay applied and inert |
| 7 Sep | Should filled primary buttons use the pressed orange? | **Yes.** Filled buttons paint `--primary-action-color` `#c2543c` (4.54:1 with white); `--primary-color` stays `#f47e63` for focus rings, tints, accents and chart series. Hover `#9a4330` is derived here and should go back into the design project |
| 7 Sep | Text colour on Crisp Orange | **Never black on orange.** Filled orange carries Finisher White. Reversed the previous day's ink decision; the design system was updated to match |
| 7 Sep | Where do the three contrast fixes live? | Amber fixes them in the Claude Design project; Claude supplies exact hexes and re-syncs. Sync stays one-way into this repository. *Two of the three arrived on the evening sync: the dark Eco Green fill is `#20707a` (5.74:1 with white) and the dark control boundary `#807f74` (3.86:1). The placeholder did not move — question 9 above* |
| 7 Sep | PR #47 — merge, or hold? | Held as a draft while Amber looked, then **merged** (`3d218d0`). She marked it ready for review and confirmed the merge; it deployed the rebrand to `hub.lofty.au` |
| 7 Sep | Who sees Bugs and Ideas triage? | *"Only admins and super admin get to see the bug manager."* The **form** is open to everyone with app access, viewers included. Both already behaved that way. *(Later the same day the Bugs and Ideas tabs left Admin too, and Amber confirmed that is right — see the top row)* |
| 7 Sep | Is Roadmap/Changelog duplicated? | Yes — *"there is duplication on footer and other page"*. **Done:** the Admin tabs came out, the cog links to `/updates`, and `/admin/roadmap` and `/admin/changelog` forward there |
| 7 Sep | The seven colliding import sites | The app is the record; ignore those workbook rows. *(Superseded the same day by closing the import altogether — see the two rows above)* |
| 6 Sep | Primary colour | Follow the design system: **Crisp Orange**, inverting the app's previous green primary |
| 6 Sep | How much of the design system to take? | Tokens, icons and brand assets only — not the ~50 JSX components, the 276 Vibe icons, the Fieldwork fonts or the brand silhouettes |
| 6 Sep | The domain | `hub.lofty.au`, on **Vercel** |
| 6 Sep | Netlify | Remove it entirely |
| 6 Sep | `HANDOFF.md` | Split: current state at the root, the session-by-session record into `history/` |
| 6 Sep | The loose prototypes | Move to `prototypes/` and archive the dead ones |
| 4 Sep | `amberbeaumont/modules` | Out of scope. *"ignore the amberbeaumont repositry now"* |
