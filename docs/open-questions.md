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

### 0g. Do `0120` and `0122` get applied to the live project, and in that order?

**Verified against the live project on 15 September, not assumed:** neither of #88's two
migrations is applied there. The ledger reports NEITHER IS APPLIED for
`a_community_title_job_shows_a_c` and `the_date_the_slas_say`, `job_number()` does not exist
live, and no job carries a `c`.

That changes what each of them means today:

| | State live, 15 September |
| --- | --- |
| `0120` — a community title job carries a `c` | Not applied. So live jobs are all plain `1004-003`, and the rename-carries-its-children machinery is not there |
| `0122` — the importer reads the job id back | Not applied, and **the bug it fixes does not exist live yet**, because it only appears once `0120` gives a job a suffix |
| `report_documents_job_id_fkey` | Live reads plain `ON DELETE CASCADE` with **no `ON UPDATE CASCADE`**. So `0122`'s delete-rule half is a no-op live, and the update half is genuinely missing |

**Why the order matters.** Applying `0120` alone puts the live database in exactly the broken
state `main` was in: community-title jobs get a `c`, and the next workbook load stops at the
first one. Applying `0122` alone does nothing useful. They go together, `0120` first.

**Recommendation: apply both, together, before Phase B.** The import is what they block, and
the import is the next thing. Nothing depends on holding them back.

**Blocked on this:** Phase B, the workbook load. Also `check.sh` against live, which cannot
tell the truth about a rename rule that is only in the repository.

**Also needed before either can be applied:** the Supabase connector needs re-authorising in
this session — it is asking for it again, so nothing can be applied from here until it is.

**Update, 15 September afternoon, from the audit session (which had a working connector):**
the third unapplied one, `0119` `the_date_the_slas_say`, was the one breaking the deployed app
(*"It asked for job_display.job_calculated_completion, which is not there yet"*, on every load
of the Jobs board since #88 merged). It changes no data, so it was dry-run in a rolled-back
transaction on the live project and then **applied and recorded in the ledger on 15
September**. `0120` and `0122` are not applied: `0120` renames nine live jobs and is a data
change, so it is Amber's yes, and `0122` goes with it. **And `0120` as merged could not have been applied live at all**: its dry run in a
rolled-back transaction was refused twice, first because the new `jobs_id_matches_its_parts`
CHECK was created before the backfill (a CHECK validates existing rows as it is made), then,
with the CHECK moved, because `0028`'s constraint of the same name and the old rule was still
standing and refused the rename. The file on the audit branch now reads drop, rename, add, and
that order was watched passing live: nine jobs renamed (`1109-001c` to `006c`, `1123-001c`,
`1991-001c`, `1991-002c`), every task, request, run, document link and report document still
attached, then rolled back. Applying `0120` and `0122` for real is the yes this question asks
for; nothing else stands in the way once the corrected file is on `main`.


### 0h. The twelve decisions the architecture audit turned on *(all answered 15 September)*

**From [`schema/architecture-audit-2026-09-15.md`](schema/architecture-audit-2026-09-15.md)
(published at <https://claude.ai/artifact/LnuPZkB65SW8uKhxnaVjCP>).** Asked in the chat one
at a time on 15 September and every one answered; each is a dated row in *Answered* below,
in Amber's words, together with four follow-ups asked the same day: the completion gate, what
makes a job overdue, the Maintenance sub-stage names, and the dictionary. Kept here as the
pointer so the audit's queue can be found; nothing in it is open.

### 0f. When a job number changes, should the old one stay findable?

`0120` made the job number move: mark a job community title and `1004-003` becomes
`1004-003c`, carrying every child row with it by cascade. Amber's own words for what she
wanted were *"like the address when updated"* — and the address half of that analogy has a
second part this does not yet have.

**An address that is superseded is kept.** `address_history` records the stint, and
`0042`'s note quotes her from 25 August: *"all addresses should be in the project history"*,
so searching an old address off an old contract still finds the record. A superseded job
number is currently kept nowhere. Type `1004-003` after the job became `1004-003c` and you
get nothing.

| Option | What it means |
| --- | --- |
| **A job number history, like the address's** | A row per superseded number, searchable, shown on the record. Matches the analogy she drew. A new table, and the only one of the three that makes an old email or contract findable |
| **Search falls back by stripping the suffix** | No new table: a search for `1004-003` also matches `1004-003c`. Cheap, and it covers the common case exactly — the suffix is the only part that ever changes. It records nothing, so it cannot tell you the number *did* change or when |
| **Nothing — the new number is the number** | The rename is the point, and the old one is meant to stop working. Honest, and it makes a bookmarked link and a quoted number simply wrong |

**Recommendation: the second.** The suffix is the only mutable part of the number, so a
search that ignores it covers every case a history table would, at the cost of one function
rather than a table and a trigger. If the audit trail turns out to matter — who changed it
and when — `activity_audit` already records every `jobs` update, so the history is
recoverable without a second home for it.

**Blocked on:** this answer. Nothing else waits on it; `0120` works either way.


### 0c. Which team and which stage does each remaining fixed column get?

**This is the walk-through Amber asked for**, and it is the live interview rather than a
decision waiting on her. *"Ask me property by property"* (14 September).

Settled so far:

| Field | Answer |
| --- | --- |
| The address fields | System. Listed and assignable, no process |
| Community and Torrens title lot counts | System. Listed and assignable, no process |
| Council | Not a job or project property. Belongs to `addresses`, shows on the card |
| Owning team | Not a property. Derived from the active process (see *Answered*) |
| Assignee | Not a job field. It is the task's assignee, read through the active process |
| Status | Derived from dates and open processes, with a pinnable override for On hold |
| Stage | Derived from the processes, still manually movable through the confirm modal |
| Target completion | Entered by a person |
| End date | Derived — stamped when the work is done |
| Old Lofty job number | Stays on the job. Entered by hand at job creation. Reference key only |
| SiteBook ID | **New.** A separate property, collected by a process still to be named |
| Project name | Composed from the current address, with a manual override |
| Project type | Create-form field, and a step inside the project creation process |
| SharePoint folder | Collected by a process |
| Title type | A **job** property. Collected at job creation, editable later, and it selects which processes the job runs |
| Notes | Does not exist on either table, and is not to be added. Comments covers it |

**The walk-through is complete.** Every field this file enumerated has an answer. What it
produced is not the list of thirty-three property definitions the question expected: five
of the fields turned out not to be job or project properties at all (the council belongs to
the address, the assignee to the task, the owning team and stage and status are derived,
the notes field does not exist), and one new property was added that has no column yet
(SiteBook ID).

**What is now blocked on a build rather than an answer**, in the order the dependencies run:

1. `property_def_scope` has to widen — question 0e above.
2. `processes` needs an **optional** flag, because the title type selects processes and an
   optional one nobody runs must not hold the job.
3. The **owning team, assignee, stage and status derivations**, which all read from process
   runs and tasks and all need the tie-break Amber gave: earliest unfinished process in the
   job's stage.
4. The **Override Active Team** handshake, which she parked into Automations to be refined.
5. A **SiteBook ID** column and the process that collects it.

**Blocked on:** nothing. This is Amber's time, not a missing fact.


### 0e. What scopes does a property definition need, now that a property can belong elsewhere and still show on a card?

`property_defs.property_def_scope` is NOT NULL with a check that admits **`project` and
`job` only**. Two of Amber's 14 September answers break that:

- *"Some properties will be task or maintainece or contact properties which aren't job or
  project properties but are shown on job or project cards"*
- The council, which she placed on the **address**.

So the scope vocabulary has to grow, and **where a property is shown becomes a second fact
from what it belongs to**. A `contact` property rendered on a job card is not a job
property that happens to live elsewhere; it is a contact property the job card displays.

| Option | What it means |
| --- | --- |
| **Widen `property_def_scope` only** | Add `address`, `task`, `maintenance`, `contact` to the check. Cheapest. But then nothing records that a contact property appears on a job card, so the card has to hard-code which foreign properties it shows |
| **Scope, plus a `shown_on` list** | `property_def_scope` says what it belongs to; a second column or table says which record types display it. Two facts, recorded separately, which is what Amber described |
| **Leave scope alone and treat these as card configuration** | Nothing changes in `property_defs`; which foreign fields a card shows is a screen decision. Keeps the schema still, and makes the card the third place field layout is decided |

**Recommendation: the second**, because it is the only one that can answer *"what shows on
a job card"* from the data rather than from a component. But it is a schema change on a
table the properties screen already reads, so it is worth settling before the walk-through
in 0c finishes and produces thirty-odd rows in the wrong shape.

**Blocked on:** this answer. The walk-through in 0c can continue meanwhile — which team and
stage a field takes does not change with the scope vocabulary.


### 0. Do the fixed columns on a job and a project get property definitions?

**This is what the orphan sweep turned up, and it is a decision rather than a build.**
Thirty-three fields on `jobs` and `projects` are collected by no process, and none of them
*can* be until it has a `property_defs` row — `process_properties.property_key` points at
that table. They are the address, the council, the owning team, the assignee, the status,
the stage, the SharePoint folder, both completion dates, the title type, the old job
number, the notes, the project name, the dwelling counts and the project type.

| Option | What it means |
| --- | --- |
| **A definition for each, and the column stays** | The column is still where the value lives; the definition exists so a process can require it. Two records of one field's shape — the column's type and the def's format — and they can disagree |
| **A definition for each, and the value moves to `property_values`** | One home per field, and the process model works on all of them. But the address is a foreign key to `addresses` with its own history table, and the stage drives the board's columns — neither survives being a text property |
| **Definitions only for the ones a process really gates** | Most of the thirty-three are set once at creation or changed from the record. The handful a process genuinely collects get defs; the rest are marked exempt with a reason, the way the system fields already are |

**Recommendation: the third.** The screen already shows all thirty-three with the reason
beside each, so nothing is hidden either way — and the first two both mean writing a
migration against a list nobody has read through yet. Reading the list is the next step,
not the schema.

**Blocked on:** which of the thirty-three a process should actually gate. Nothing is built
from the answer; the sweep reports and changes nothing.


### 0b. Does the maintenance SLA run from the day an issue was identified, or the day it was logged?

**Nothing is blocked on this today, and it will matter the moment a trade is set.**

`0114` gave a request a **Date identified** (the PCI walk, the 3 Month Inspection) alongside
the **Reported** timestamp it already had (the moment somebody typed it in). The two differ
whenever a walk on Thursday is logged on Monday.

`maintenance_request_due_on` is still computed from **Reported** plus the trade's SLA days.
The new drawer sets no trade, so today every request logged this way reads **No SLA** and
the question is moot. It stops being moot the first time a trade is attached.

| Option | What it means |
| --- | --- |
| **Keep Reported as the clock** | The SLA measures Lofty's response from when Lofty knew. A defect found on a Thursday walk and logged the following Monday has its full SLA from Monday |
| **Identified, falling back to Reported** | The SLA measures from when the defect was found, so a late entry eats its own delay. Needs a rule for a cleared Date identified, which is why the fallback is in the option |

**Recommendation: the second**, because the homeowner's clock started when the defect was
found and a request logged late should look late. But it makes an SLA breach possible on
the day a request is created, which is a real change to what the queue shows, so it is
yours rather than a default.

**Blocked on:** nothing. Both readings are one line in `guard_maintenance_request()`.


### 0d. Is a "trade" the same thing as a contractor? *(answered 15 September: yes, no separate Trade; see Answered)*

**Not blocking — the drawer works either way, and the reading it took is visible.**

Amber, on the external assignee: *"any companies in the system that are trades or
contractors"*. The `classifications` lookup holds **client, contractor, supplier,
consultant, authority, other**. There is no *Trade*, so the picker offers companies
classified `contractor`, plus any company already on the job whatever it is classified as —
being the plumber on 1042-01 is stronger evidence than a classification nobody set.

| Option | What it means |
| --- | --- |
| **Contractor is the trade** | Nothing changes. One classification, and a company that fixes things is a contractor |
| **Add a Trade classification** | Bricklayer, plumber and tiler are *trades*; a project manager and a surveyor are *contractors*. A one-row insert and the picker widens to both |

**Recommendation: leave it as one** until the imported company list shows the distinction
is real in Lofty's own data. Splitting a classification is easy; merging two back after
people have used both is not.


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

### 8. How is health status worked out? *(answered in full 15 September; see Answered. Kept for its reasoning)*

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
| 15 Sep | What is the Maintenance stage's sub-stage called? (Stage 1 of the audit's plan needs a row for it) | **Three sub-stages: 1 Month, 2 Month and 3 Month.** Amber: *"1 month, 2 Month and 3 Month"*, chosen over *Warranty*, *Maintenance* and *Checkins and Issues*. So the backfill puts the existing *1 Month Checkin* process (the only one with an SLA, 30 days with a 25-day lead) in *1 Month*, and *2 Month* and *3 Month* start with no processes until she defines them; the maintenance-issue process from decision 6 runs on an issue, not on a sub-stage, and can occur in any of the three. The `maintenance_request_identified_at` vocabulary already ends *1 Month Inspection, 2 Month Inspection, 3 Month Inspection*, so the words match. The other stages' sub-stages come straight from their groups: Project Creation and Job Creation; Stage 1, 2 and 3; the seven Construction names; PWA Cancellation and Contract Cancellation |
| 15 Sep | Question 8, second half: what makes a job **overdue** rather than at risk? | **The job's target completion date has passed.** Chosen over *any process on it is overdue* and *nothing does*. So, for Stage 3's roll-up: a process is at risk or overdue against its own SLA (`process_run_display`, unchanged); a sub-stage and a stage take the worst health of their open required processes; the **job** is at risk when any open required process is at risk or overdue, and **overdue** when `job_target_completion` is in the past and the job is not complete. A job with no target is never overdue, only at risk. The 12 September literal reading stands for the at-risk half: a run merely inside its lead days does not by itself turn the job, an overdue run does. The record's pill stops reading `job_status`, which becomes the pinnable status (On hold) from the 14 September answer |
| 15 Sep | Where does the process completion rule live? (Stage 2 of the audit's plan) | **In the database: a run cannot be complete while a required step is open.** Chosen over *screen only* and *database rule with a recorded manager override*. So a trigger on `process_runs` refuses `complete` while any required step of the run is neither done nor not applicable, the same shape as `process_runs_complete_has_a_time` today, and the same rule read forwards marks the run complete automatically when the last required step closes (her walk-through's step 9). The honest way past a step that does not apply is marking **that step** not applicable, a recorded fact, which is what `0078`'s *"complete with a gap is sometimes the truth"* becomes. `process_property_required` (6 of 140 rows today) carries over as the step's required flag |
| 15 Sep | Audit decision 11b: the dictionary itself | **Remove all of it.** Amber: *"I don't need the dictionary at all"*, then *"i am not using. do I need it to make anything work? Will the properties creation and updates without it?"*. Answer given before she chose: no; property creation and updates read and write `property_defs` and never consult it; its three readers are the fixed-columns list on Setup → Properties (`orphanProperties.ts`), one friendly-name lookup in the activity feed (`auditNarrative.ts:107`, already falling back to the column name) and the Admin page. Chosen over *remove it and drop the fixed-columns list too* and *not yet*. **So Stage 5 removes** `app/src/data/dictionary.ts`, `DictionaryPage.tsx`, the `dictionary_overrides` table and its two repository methods, `docs/schema/data-dictionary.md`, `npm run dictionary` (`scripts/generate-dictionary.mjs`) and the CI check on the generated file; **and in the same PR** the fixed-columns list on Setup → Properties reads a `security_invoker` view over the database catalogue (table, column, comment) through the seam, so it keeps working from the truth rather than a hand-kept file, and the activity feed reads property labels from `property_defs`. **`CLAUDE.md`'s four-files-per-schema-change convention becomes three** (migration, `types.ts`, `schema-plan.md`). The exemption reasons for the 16 system fields, which live in `orphanProperties.ts` rather than the dictionary, stay where they are |
| 15 Sep | Audit decision 11: which of the four pieces of scaffolding go? | **All four**, and she added a fifth: *"I don't need the dictionary at all"*. Ticked: the Wiring page and its `WIRED` list (181 of 211 methods, omitting `listTasks`); `dictionary_overrides` and in-app glossary editing (never a row); `releases` and `release_entries` (a second changelog, no rows; `CHANGELOG.md` and the Updates page come from commit trailers); `tags` and `taggings` (no rows, no screen). All go in Stage 5, one PR each. **The dictionary itself is the fifth and is being confirmed separately** (row above this one once answered), because `dictionary.ts` is read by `orphanProperties.ts` and `auditNarrative.ts` as well as by the Admin page, and the four-files-per-schema-change convention in `CLAUDE.md` names it |
| 15 Sep | Audit decision 10: drop `private.profiles_backup_pre_batch3`? | **Yes.** Chosen over *keep it with RLS enabled* and *leave it*. A 16 August copy of `profiles` (47 rows, names, emails, permission levels) with no row-level security, flagged critical by the advisor, unreachable through the API because `private` is not published, and read by nothing. One statement in a Stage 0 migration; the live `profiles` table is the record |
| 15 Sep | Audit decision 9: `import_staging_jobs` (801 rows), `import_spine()`, `unimport_spine()` and `private.import_team_for_person()` | **Export the rows to a spreadsheet in the repository and drop the lot.** Chosen over *move to an `archive` schema* (recommended) and *leave in `public`*. So Stage 5 writes the 801 rows to a workbook under `app/supabase/import/` beside the generators that produced `0087`, then one migration drops the table and the three functions; re-importing later means reloading from the file with a new generator. This supersedes the 7 September answer *"leave it"*, which is kept in this table for its reasoning |
| 15 Sep | Audit decision 8: the undeployed email worker and the four notifications waiting since 12 September | **Keep the functionality, deploy it when Microsoft is connected, send nothing that queued beforehand, and default everyone to off until testing.** Amber: *"i am connecting microsoft teams and email and sharepont now so keep it in but don't send any previous notifications until they are all switched on. All notificatoins should be turned off in users settings by default until app is ready for testing but the functionality should exist"*. Chosen over *drop email from the defaults* (recommended) and *deploy now*. **So Stage 0's email item becomes three small things:** (a) the 3 held and 1 queued `notification_deliveries` rows are marked as never to be sent, and the worker, when deployed, only claims rows created after a switch-on date recorded in `maintenance_settings` or a new `notification_settings` row, so nothing stale goes out; (b) a person's default is **off** for every channel until the app is ready for testing, which today means either a per-type default of no channels or a per-person `notification_preferences` row set to off on account creation, to be chosen when built, and the reason recorded; (c) `deliver-notifications` stays in the repository and is deployed with the Graph mailbox and Teams credentials as edge-function secrets when the Microsoft connections land, which is Amber's to paste in. The Setup → Automations rules stay as written |
| 15 Sep | Audit decision 7: is a variation the `0031` record, or an attempt of the *Variation* process? | **Both, in a specific way: a record with its own number that a process runs on, whose effect is a new attempt of the affected process, never a move backwards.** Amber: *"Variations are like maintainence in that they will have their own process and need a suffix added eg V01, V02 so when working drawings or selections or fencing needs to be reopened even if the job is under construction, it allows the process to start again, but doesn't move the job back to preconstruction or reset completed proceses/substages as once a building is in consturction it can't go back to being not build"*. **What this settles:** the `variations` table **stays** (the audit had it as Go; it is now Update): it is the record, numbered per job, that a *Variation* process runs on, so `process_runs` and `processes.process_scope` gain *variation* as a fourth kind beside job, project and maintenance. Its steps (reason, cost, days impact, approval) are steps in Setup like any other. Its effect is a new attempt of the process it reopens (Working Drawings attempt 2, Selections attempt 2), and `process_runs` gains a nullable `variation_id` saying which variation started the attempt, which is the rework measure `0031` wanted; `variation_reopened_tasks` and its two views go, because the re-instantiated tasks belong to the new attempt. **The derivation rule this fixes:** a job's stage and sub-stage never move backwards, so an open attempt started by a variation shows as an open variation on the job rather than pulling it out of Construction. **Two details for when it is built, not asked now:** the number format (she wrote V01, V02; `assign_variation_number` produces `1042-01-V3` today), and whether a variation can reopen more than one process at once |
| 15 Sep | Audit decision 6: what is a maintenance issue, and does the contractor-offer machinery from `0084` stay? | **An issue is its own record, a process runs on it, and the offer machinery goes.** Amber described the flow first: *"maintainece will work by having a new maintainence issue added (as per the app now) where an issue is logged, date stamped and assigned to a company or an internal users. A process will be created from this that includes creating a report with the issues, creating internal task for maintaence team to send report to the person (this may be automated) and then following up and checking the work (task) and confirming completition and possible invoicing (this is why as the app develops the processes need to be flexible and have ability to add steps or proeprties)"*, then asked which of two shapes was best: *"the issue created could become a task with the task type being \"Maintenance\" … or it could be an item by itself with a table with those fields.. however a maintainence task /issue needs to be related to a job or proejct and company or contacts as one project may have multiple issues assigned to multiple users and companies, and one companby may have multiple issues from multiple jobs"*. **Chosen: its own record, and a thing processes run on**, over *a task with type Maintenance* and *its own record with no process on it*. The reasoning put to her: `maintenance_requests` already carries the number, the source, the reporter, the dates and a person-or-company assignee, and since `0120` `comments`, `document_links`, `record_parties` and the activity trail all take an issue; a task has one assignee and it is a person, no company, no reporter, no source, no number, and the process's tasks would be tasks inside a task. **What changes:** `process_runs` and `processes.process_scope` gain *maintenance* as a third kind, so the report → send → follow up → check → confirm → invoice flow is a process defined in Setup with editable steps (the report and the send can be automation steps); one company on many issues across many jobs is `record_parties`, already there. **What goes (Stage 5):** `maintenance_items`, `maintenance_assignments`, `maintenance_categories` (*"i do not ned though the categories, or trade types"*), `maintenance_message_secrets`, `maintenance_item_display`, `offer_maintenance_item()`, `answer_maintenance_offer()`, `reflect_assignment_on_item`, `stamp_maintenance_item_done`, `park_maintenance_message_secret`, the `maintenance_scan` cron, the undeployed `maintenance-accept` function, the open-items rule in `guard_maintenance_request`, and the notification types `maintenance_no_answer` and `maintenance_visit_tomorrow`. **What stays:** `maintenance_requests` (job only, see the row above), `maintenance_settings`, `maintenance_messages`, `maintenance_request_display`, `job_warranty`, and the `tasks.maintenance_request_id` qualifier |
| 15 Sep | Can a maintenance issue belong to a project rather than a job? (asked inside audit decision 6) | **Not yet: job only, and the project case is added when one arrives.** Chosen over *job or project with job as the default* (recommended) and *job only, permanently*. The pros and cons were put to her first: job-only keeps the number (1042-01-M3), the warranty window and the homeowner obvious and is what the 16 live issues are; job-or-project gives shared-property defects (a common driveway, a boundary fence, a retaining wall serving three lots) a home but needs a project-level number, a warranty rule, a project twin of `tasks_maintenance_request_is_on_this_job` and a project fallback in the view. **So** `maintenance_requests.job_id` stays required; the first shared-property defect is logged against one nominated job and noted as such, and the parent is added then as its own small migration |
| 15 Sep | Audit decision 12, and question 0d: does `maintenance_categories` become a real trades lookup? | **No.** Amber, 15 September, closing her answer on maintenance: *"i do not ned though the categories, or trade types"*. So `maintenance_categories` goes with the offer machinery (decision 6), the repairer picker keeps offering companies classified `contractor` plus any company already on the job, and 0d is closed: contractor is the classification and there is no separate *Trade* |
| 15 Sep | Audit decision 4: what does "automation" mean in the app? | **Both a registry and, later, a rule builder; processes pick from either.** Amber: *"1 & 3 There needs to be a place where system generated automations are recorded that are set in the app e.g. cron jobs, basic automations. as per #1 but then the ability to create addiontal automations like hubspot monday style when needed. processes can pick from either list"*. **So the order is:** Stage 4a, an `automations` registry (name, trigger, effect, on/off, last run) plus a run log, with every existing cron job and trigger given a row and checking its flag, listed on Setup → Automations; Stage 4b, process steps of kind *automation* picking an effect; **Stage 4c, later and its own piece of work, a rule builder** (when X, if Y, do Z) whose rules are rows in the same table. **One design point, stated rather than asked:** one table with a `kind` column (system, step effect, custom rule) rather than two lists, so a process picker shows one list and a rule built by a manager is the same kind of thing as one shipped in a migration. The builder is recorded as wanted and not sized; it is a product of its own and comes after the derivations are proven |
| 15 Sep | Audit decision 3: do processes move the job, reversing 24 August's *"no auto-advance"*? | **Yes, derived with a pin.** Amber: *"1. as long as it can be manually overriddent"*. Chosen over *derived with no pin* and *keep 24 August*. So a job's sub-stage is the earliest sub-stage in its stage with a required, non-optional process whose latest attempt is neither complete nor not applicable; its stage is that sub-stage's stage and never moves backwards; the confirm modal becomes *pin this job's stage*, recording who and why, and a pinned job stops deriving until unpinned. **What 24 August feared** (an amendment dragging the job back and forth) **is answered by attempts**: the derivation reads the latest attempt of each process, so a second pass at Working Drawings does not move the job out of Stage 3. The project still follows its slowest job. Stage 3 of the plan |
| 15 Sep | Audit decision 2: fold `process_properties` and `process_tasks` into one ordered `process_steps` list? | **Yes, one ordered list of typed steps.** Chosen over *keep the two lists and add only the task-to-property link* and *not yet*. A step has a position, a required flag and a kind: property (the key it records), task (name, team, expected days, parent, dependencies, and optionally the property it stamps when ticked, which is her steps 7 and 8), checklist (the line), or automation (an effect from a fixed list). Backfilled from the 140 property links, 107 template tasks, 99 task dependencies and the (empty) template checklist; the old tables go after the backfill. Stage 2 of the audit's plan |
| 15 Sep | Audit decision 5: the two premature Construction loads (`0079`'s seven processes and 107 template tasks, `0090`'s 107 date properties) while Construction stays in SiteBook | **Keep both, as they are.** Amber: *"We are looking at using SiteBook API to feed into the app and record the information so keep it there and it will have additional detail added after preconstruction phase is done and working. SiteBook can then retire and the app will have sole record... but construction will work the same as preconstruction"*. Chosen over *retire both with the existing flags* (recommended) and *retire only the date properties*. **So:** nothing in Construction is retired or moved; the rows are the landing place for a SiteBook feed that is not yet scoped; the process shape Construction takes when it is mapped is the same as Pre-construction's. **The cost, stated and accepted:** the orphan sweep keeps reporting 107 Construction fields nobody can collect, the job record keeps listing seven Construction processes on every job, and the forecast and the sweep keep reading different copies. **Left for the SiteBook integration, not asked now:** which of the two copies the feed writes to, the 107 date properties or the 107 template tasks, because a feed that writes both is finding 3 automated |
| 15 Sep | Audit decision 1: what are Construction's sub-stages, and what is a process there? | **Construction is not mapped yet; it lives in SiteBook for now, and the Working Drawings example is the size of every process.** Amber, asked three times with the options narrowing each time: first *"Seven, and the schedule lines become processes"*, then the Working Drawings walk-through (row below), then: *"construction hasn't been mapped out as it is being done in another system at the moment but the size of the workind drawings example is consistent with all processes. Construction processes is being mapped later as we are using SiteBook for this at the moment."* **What this settles:** (a) a process everywhere is the size of Working Drawings, weeks of work owned by one team with tasks, properties and possibly a milestone inside it, so the seven-processes-of-107-tasks shape and the one-process-per-line shape are both wrong for the same reason; (b) the Construction rows in the database (`0079`'s seven processes and 107 template tasks, `0090`'s 107 date properties) are a placeholder from a system that still owns that stage, not a mapping to build on; (c) Stage 1 of the plan carries the seven Construction groups across as seven sub-stages holding their existing process row, mechanically, invents no regrouping, and marks them as awaiting the SiteBook mapping. **Not settled, and now decision 5:** what happens to the two premature loads meanwhile |
| 15 Sep | What does a process actually *do* when it runs? (asked while settling the architecture audit's decision 1) | **Amber answered with a worked example, and it is the specification.** In her words, lightly reflowed, on the Working Drawings process in Pre-construction sub-stage 2: *"in pre-construction (lifecycle) stage 2 (substage) a number of processes occur. These processes when completed complete stage 2. A team owns a process (for example working drawings), but may have users from multiple teams in it as pre-construction admin may need to do something in this process."* Then the run, numbered: (1) *"when the 'planning approval received' has a date recorded on that job, and automation 'milestone notification' is triggered"*; (2) *"A task is created by the system and assigned to Design Team manager to begin working drawings"*; (3) *"Job moves into the working drawings process stage"*; (4) *"Design team and Design Team manager is set as the Job Owner"*; (5) *"The Property for 'Working Drawings Ordered' date is set to as today and the SLA countdown starts"*; (6) *"Tasks for Design Teams internal processes (specifics TBC) are created and assigned to the Design Team Manager"*, then *"design team does tasks, checklists, fills in properties, uploads files etc"*; (7) *"Design team has task to send to Aquistions TEam for approval and when ticked off records the date against the propertry"*; (8) *"Aquistions team assigned a task to approve working drawings and when ticket it sets the date"*; (9) *"Automation/Rule fires that when all process steps are completed mark this process complete"*; (10) *"This process contains a milestone so it sends milestone nofication automation"*; (11) *"Completion of this process moves the job to next process and triggers task for that process to begin.. this repeats"*. **What this settles for the model:** a process is an ordered list of steps of mixed kinds (a property to record, a task to do, a checklist, an automation), with effects at three moments: **on start** (create the first tasks and assign them to the owning team's manager; set the owning team and assignee; stamp a property with today, which is what starts the SLA), **on a step** (ticking a task may record a date against a named property, so a task step can carry a property key it stamps), and **on completion** (all required steps done marks the run complete without a person; a milestone process fires a milestone notification; completion starts the dependent processes and their first task). Task steps may belong to a team other than the process's owner (the Acquisitions approval inside Design's process). The trigger in (1) is the dependency edge firing: recording *Planning approval received* is what completes the Planning Approval process, and Working Drawings depends on it. **What is still hers:** the Design team's internal steps (*"specifics TBC"*), and a *milestone notification* type, which does not exist yet (`stage_changed` is the nearest) |
| 14 Sep | `0120` let an issue carry both `maintenance_items` (the defect by trade, with cost and a done-stamp) and `tasks` (scheduled work on the board). Which is the truth when somebody records a repair as both? | **An issue becomes a task.** Amber, 14 September, in those words. So `tasks` is where the work lives: the issue's drawer shows its tasks, and the repair a person schedules, assigns and ticks off is a task like any other on the board — which is the whole reason she chose *"join the general tables"* an hour earlier. **`maintenance_items` is not deleted and nothing is migrated off it**, because she said in the same message that she is *"rethinking the process/properties/task alignment and how they work together"* and that it is *"a new car"*. Tearing out a table on the strength of a rule that is about to be reconsidered is how you do the same work twice. The drawer therefore reads tasks; `maintenance_items` keeps its rows and its meaning until that rethink lands, and is the first thing to look at when it does |
| 14 Sep | **Reversing the row below:** should a maintenance photo stay private, now that the sheet has to carry it and there may be videos too? | **No. Photos and videos are not private, and both get permanent links.** Amber, asked twice with the cost stated both times: *"Keep them forever and there may be videos as well. It is essential to keep these as a record"*, then *"No videos or photos are private accept video and photos with permanent links"*. This **supersedes the 0c answer in the row below**, which is kept because a schema choice without its reasoning gets simplified back into a bug. **What it means in plain terms, and it was put to her before she chose it:** a photograph of a defect inside somebody's house becomes fetchable by anyone who ever sees the URL, with no sign-in, for good — the same terms `report-images` has carried since 7 September. She weighed that against a sheet whose pictures break a few minutes after it is emailed, and against not being able to show a contractor the thing they are being asked to fix, and chose the permanent link. **Two consequences to carry:** video needs the bucket's 25 MB cap raised and its type allowlist widened, neither of which `0115` did; and the generated sheet can now simply point at the images rather than embedding their bytes, which is the simpler build and keeps the documents small. **The originals are unaffected** — they stay filed in `documents` against the job, and that record was never the thing in question |
| 14 Sep | Community title jobs need a `c` suffix — does it go in the job number itself? | **Yes, in the key, and the key moves when the title type is corrected.** Asked first whether a later correction should renumber the job, Amber chose a display-only suffix; shown the build, she reversed it: *"But the primary key can it be updated that is also linked so it show the c on the end (like the address when updated) but the project 4 digits and 3 digit job code always remains with job too"*. It can, and the machinery was already there — `resync_job_id` has rebuilt `job_id` from its parts since `0028` and 16 of 17 referencing tables were already `ON UPDATE CASCADE`. The concern that made the first answer is recorded in `schema-plan.md` rather than deleted, because it is still true: 67 of 83 live jobs have no title type, so most will be renumbered long after creation, and a job number in a contract or an email is beyond any cascade's reach. She has accepted that twice. Built as `0120`; the 4-digit project and 3-digit sequence never move, only the suffix |
| 14 Sep | What should the calculated completion date show while most processes have no SLA? | **Build it; she will fill the SLAs in.** Chosen over *blank naming what is missing*, *partial and marked as such*, and *fall back to a per-stage figure*. The finding that prompted the question: 3 of 51 processes carry `process_expected_days` while 107 of 107 `process_tasks` carry theirs, and **all 38 Pre-construction processes have neither**. So the mechanism is built and returns null until the estimates land, with `job_calculated_completion_missing` saying how many are outstanding. Built as `0119` |
| 14 Sep | Are the expected days working days or calendar days? | **Calendar days.** So no weekday skip and no South Australian holiday table, and a 10-day SLA is 10 days on the calendar |
| 14 Sep | What does the forecast assume about a process already past its SLA? | **It finishes today, and everything after runs to SLA.** Chosen over *re-charge its full SLA from today*, *scale the remaining work by how late it is running*, and *flag the blockage instead of projecting past it*. Honest about the past and deliberately optimistic about the present — which is a choice she made rather than an accident of the arithmetic, and worth remembering when the forecast turns out to run early |
| 14 Sep | Does a job or project keep a notes field? | **No — Comments already does it.** Chosen over *keep it as a system field* and *keep it as a handover note a process collects*. **And the question was built on a wrong premise, which the database corrected before anything was recorded:** there is no notes column on `jobs` or `projects` at all. This file's own enumeration of the thirty-three listed *"the notes"*, and that was loose. So nothing is retired; the answer stands as a **standing rule not to add one** — the record has a comment stream with mentions, an activity feed, and `job_latest_update` already reading the newest comment as the latest update, and a free-text column beside that is the second place nobody reads. The five `%note%` columns that do exist are all on other records — `companies`, `contacts`, `process_runs`, `record_parties`, `maintenance_assignments` — and none is in scope here |
| 14 Sep | How is the project name set? | **Composed, with a manual override.** The formula stays the default — `projectDisplayName` builds *number - SUBURB, street* from the CURRENT address, so the name follows a move — and somebody can pin a different name when a site is known by something else. Same override shape as the status answer above, which is now the third place this pattern appears (status, owning team, project name): **derive it, let a person pin it** |
| 14 Sep | Is the project type a create-form field or process-collected? | **A create-form field, and it is part of the project creation process.** Chosen over *gated at Acquisition & Development* and *derived from the job mix*. Both halves matter: the value is picked on the form as it is today, and the act of picking it is a step inside project creation rather than an untracked form field. Jobs keep reading it through `job_display` rather than storing their own |
| 14 Sep | Is the SharePoint folder system or collected? | **Collected by a process.** Chosen over *system, created with the record* and *system now, automated later*. So somebody making the folder and putting the link back is real work that a stage gates, and it stays that way until the SharePoint integration lands (question 14 below) |
| 14 Sep | Where does the title type belong? | **To the JOB, collected during job creation at the project stage, and editable afterwards.** Amber: *"Title type is a job property and collected at project stage during job creation but might be updated later during the build so it needs to be editable as assignable. Also this field is importantly as it might change which processes a job goes through. However how the project job creation split works now is correct but important to know that the title type belongs to a job."* Two things to carry: the split's current behaviour is **confirmed correct** and not to be changed, and **the title type selects processes**. That last part joins the optional-process flag answered above — together they mean which processes a job runs is a function of the job's own facts, not a fixed list, and the owning-team derivation sits on top of whatever that resolves to |
| 14 Sep | Where does the old Lofty job number live, and what about SiteBook? | **They are two different things. The old number stays on the JOB; SiteBook is a new property collected in a process.** Amber first said the old number *"belongs to project"*; the live data was checked before acting on it and disagrees. Sixteen jobs carry an old number across four projects, and **all four projects hold more than one distinct value**: 1109 has 2154, 2155, 2156, 2157, 2158, 2159 on six jobs, and 1009 and 1991 are the same flat shape. Only 1010 looks project-stemmed — `1216 - D1`, `1216 - D2`, `1216 - D3`. Moving the field to the project would have collapsed 16 recorded values to 4. Shown the rows, she chose **stay on the job, entered by hand during job creation**, so nothing is lost and `jobs.job_number_old` is unchanged. Her framing of *how* it is entered still stands: typed once while creating jobs from the project screen, used only as a reference key. **SiteBook ID is separate and does not exist yet** — *"a third party software primary key"* — and she wants it collected as a **process step (process TBA)**, not typed at creation. That is a new column and a new process, both unbuilt |
| 14 Sep | Is the assignee a job field? | **No — "currently with" is the task's assignee, not the job's.** Chosen over *derived from the active process*, *set by hand within the derived team*, and *a system field*. So `jobs.job_assignee_id` becomes derived or retired, in the same move that made the owning team derived. The pair is consistent: the process says which team, the tasks say which person |
| 14 Sep | With several open tasks on one job, which person shows? | **Whoever holds tasks in the active process.** Chosen over *earliest unfinished task anywhere on the job*, *everyone with an open task*, and *nobody until assigned*. It mirrors the team rule exactly, and it is the only one of the four that cannot name somebody from a team that is not on the job |
| 14 Sep | Who sets the status? | **Derived, but a person can override it.** Chosen over *set by hand*, *purely derived*, and *split status from health*. So the dates and open processes compute it, and somebody can pin a different value — which is where **On hold** lives, because no date maths produces it. Note this overlaps question 8 below, which asks how health is worked out; the override half is now answered and the derivation half still is not |
| 14 Sep | Is the stage derived? | **Yes, from the processes, and still manually movable.** Amber: *"Derived from processes like the tram but can be overridden and manually moved (as importing older jobs) with modal pop like now."* The existing confirm modal stays — importing an older job is the case that needs it. **And a correction from her in the same answer: there are SEVEN stages, not five** — *"closed and cancelled are still stages"*. Checked against the database rather than taken on either side's word: `jobs_stage_is_a_lifecycle_stage` and its projects twin both admit *Acquisition & Development, Pre-construction, Construction, Maintenance, Completed, Closed, Cancelled*. She is right and the repository's own prose is the loose part — `supabaseRepository.ts` calls Acquisition & Development *"the first of the five lifecycle phases"* |
| 14 Sep | Target completion and end date: derived or entered? | **Target entered, end date derived.** Chosen over *both entered*, *target derived*, and *both derived*. A person commits to the target, so a contracted handover date is not overwritten by process maths; the end date is stamped when the work is actually done rather than relying on somebody remembering to record it |
| 14 Sep | Do the fixed columns on a job and a project get property definitions? | **Yes, all of them, and ask her property by property.** Amber: *"Ask me property by property. Some things like address fields collections are part of creating a new job or project process but are not required to be really documented as a process as they are a system. Same as number of community titles etc but I still need them listed in the properties section so I can assign them to a team or stage. Some properties will be task or maintainece or contact properties which aren't job or project properties but are shown on job or project cards"*. This **reverses the recommendation**, which was definitions only for the handful a process gates. The reason it was wrong: a definition is not only a hook for a process, it is the row that carries `property_def_owning_team` and `property_def_stage`, so a field with no definition cannot be assigned to a team or a stage at all — which is the thing she actually wants from the screen. So a system field still gets a definition; what it does not get is a process. Two consequences: **`property_def_scope` has to widen** beyond `project` and `job` (question 0e below), and the walk-through of the remaining fields is now the work |
| 14 Sep | Is the council a job/project property? | **No — it belongs to the address, and shows on the job and project card.** Chosen over *system field on the job* and *process-collected*. It is already `addresses.address_council`, filled from the suburb off the LGA list, and `0108` is what made a job able to read its own. So it is the first confirmed case of the pattern in the answer above: a property owned by one record and displayed on another |
| 14 Sep | Is the owning team a property somebody sets? | **No — it is an assignment derived from the active process.** Amber: *"The owning team is an assignment that updates when a job starts that new process. For example when a job starts working drawings process which is owned by design team that job is now with design."* `processes.process_owning_team` already exists, so the input is there. What does not exist is the derivation: `jobs.job_owning_team` is set to `Acquisition & Development` at creation and changed by hand from the record. Tie-break and override are the answer below |
| 14 Sep | When two processes from different teams run at once, which owns the job? | **The earliest unfinished process in the job's stage, with a manual override that has to be granted.** Amber: *"It needs to be a drop down so it can assigned to a new team with a button next to it that requests control of job, eg 'Override Active Team' at which point the active team manager gets a notification that can either release the job to the new team or not. This is flagged on the job with a highlighted style update on the board that flags who has request job ownership. Note this process will need to be added as an automation in automations section to be refined. So it defaults to the earliest unfinished process in a jobs stage."* So: a default the database can compute, and a request-and-release handshake on top of it that is **not** a silent reassignment. The override is explicitly parked into Automations to be refined rather than built now |
| 14 Sep | Can a process be skipped? | **Yes — a process needs an optional flag.** Amber, in the same answer: *"processes will need a new property that is the ability to mark that process as optional as some processes eg PWA is not required on every job so it can be skipped and ignored. However some like planning approval or working drawings are mandatory."* A column on `processes`, not on the run: whether PWA applies is a fact about the process, not about one job's attempt at it. This also gives the owning-team derivation above something it needs — an optional process nobody will run should not hold the job |
| 14 Sep | When a project's current address changes, which of its jobs should take the new address? | **Only the jobs still standing at the project's address.** Amber asked for it in the first place: *"when a new address is added and updated to current project address this address needs to push to jobs so that the job address shown on the job drawer and project drawer is the current address"* — and, given three options, took the conservative one over *every live job* and over *ask each time with a preview*. So a job follows when its street number, street, street line 2, suburb, state and postcode all match the address the project is **leaving**, and it keeps any lot and res number of its own: "Lot 1, 14 Brodie Road" becomes "Lot 1, 28 Corner Street". A job given its own address since, once its title issued, is left exactly where it is; so are closed and cancelled jobs. Built as `0118`, a trigger rather than repository code, because the import and hand-written SQL write these tables too. Two consequences worth carrying: a job that has diverged **never comes back** on its own, which is correct but means a bulk re-address of a whole street is still a job-at-a-time edit; and a project moving to a locality takes nothing with it, because `guard_job_address_is_a_street` refuses a job with no street |
| 14 Sep | Where do a maintenance issue's photos live? | **`job-documents`, private.** Three options were put up — the private job bucket, a new private `maintenance-photos` bucket, or the public `report-images` one — and Amber took the first. So a defect photo is a document about the job: it is filed in `documents`, attached through `document_links.maintenance_request_id` (which `0084` already added for exactly this), and it appears in that job's Documents list beside the contract and the site plan. Every read is a short-lived signed URL, so nothing leaves Lofty without one. **The consequence to carry into the report (PR #79):** an emailed report cannot simply point at these images the way a shared document points at `report-images`, because a signed link expires and a private object has no permanent URL. The report will have to embed the bytes or sign at the moment of building. That is the cost of the choice, and it is the right one — a defect photo of somebody's house is not a thing to make permanently public to anyone who ever sees the URL |
| 14 Sep | An issue needs its own record id — is it a line inside one request, or a request of its own? | **Its own request.** Amber took the second of two options: *"each one of these issues have its own record id but you only enter the job number, reported by, identifies at, date once so you can then have a status, date booked, and followup for each"*. So three defects from one PCI walk are **1042-01-M3, -M4 and -M5**, created together from one drawer, each with its own status, date booked, follow-up and assignee. No new table: `maintenance_requests` grows the header fields it lacked plus a `maintenance_request_batch_id` recording that they were typed in one sitting, which same-job-same-day cannot — it is wrong the first time two people log a PCI on one house on one day, and it is what the report groups a section on (`0114`) |
| 12 Sep | Should every property belong to a process? | **Yes, for a job or a project, and the ones that do not are flagged.** Amber: *"all properties should belong to a process if it is job or project and if they don't they should be flagged as orphaned in the properties setting unless they are the primary key. This should have all properties including properties not on the properties table eg address"*, and clarifying: *"a system property such as a primary key, a user property or contact property or task or maintenance property don't need to belong to a process but may belong to an automation."* So the rule binds **jobs and projects only** — a contact, a task, a maintenance request and a person all hold fields no process collects, and that is correct. Two exemptions, both hers: the scope, and **system properties**. The last sentence of her first message is the hard half: a sweep of `property_defs` alone reports a clean board while the address, the council, the owning team, the assignee, the SharePoint folder and both completion dates are collected by nothing, because they are **columns on `jobs` and `projects`** rather than property rows. The second source is therefore the data dictionary. **Thirty-three fields are reported** and every one is real. They cannot simply be attached: `process_properties.property_key` points at `property_defs`, so a column has nowhere for the attachment to hang — which is why they read *Not a property* rather than *Orphaned*, and why **whether the fixed columns get property definitions is the open half** (question 1 below). *"May belong to an automation"* is not built: there is no automation model to attach one to, and inventing the attachment before the model is the plausible value this repository keeps warning about |
| 12 Sep | Does the record show a process that has not been started? | **All of them, every stage open, each with a tick box.** Amber: *"even if processes not started it should show them all so that way they can be marked off in order."* `ProcessesPanel` already listed every active process whether or not it had a run — what hid them was the stage disclosures, open only for the current stage. That is right for a panel you scan past and wrong for the record's Process section, where the whole ordered list IS the thing: a stage you have not reached holds the processes you are working towards. Open only in `bare` mode, so the standalone panel keeps the behaviour that suits it. And **marking one off is now one action**: a process with no run needed Start and then Complete, two presses for one fact, where the mockup draws a tick box. Ticking an unstarted process inserts its run already complete — which is what `startProcessRun`'s status argument is for. Unticking returns it to *In progress* rather than to *Not started*: the run exists and somebody worked on it, and "not started" would be a claim the record can disprove |
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
