# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: Lofty's project managers, on site, on a phone.** Amber, 2 September: *"project
management for jobs and constructions will need to be able to see information about a job
out on the site while on a ladder from a mobile phone."* The job they are doing is finding
one fact about one job — its stage, who holds it, the latest comment, a property value, a
task's due date — while standing somewhere awkward, one-handed, in daylight. They do not
browse; they look something up and put the phone away.

**Also confirmed:** the office teams the lifecycle stages name — Acquisition & Development,
Pre-construction Admin, Design, Estimating, Sales Admin, Construction, Maintenance — who
work at a desk, move jobs between stages, and read the boards and reports. **Their
managers hold Settings** — properties, processes, contacts, maintenance, the stage SLAs
and the notification rules — which stopped being everybody's on 4 September. Admins
configure users, teams, permissions, the dictionary and the wiring, behind the header cog.
Homeowners and contractors are parties on records and receive email from the app
(maintenance offers, accept links) but do not sign in.

## Product Purpose

**Lofty Hub** (Amber, 3 September: *"call it lofty hub"*): one place that holds every project and every job Lofty
Building Group has, where each job is in its seven-position lifecycle, who owns it, what
has happened to it and what is due. It replaces a spreadsheet-and-memory system (the old
job numbers the import carries) with a record that is the same on every screen and
auditable to the row.

Success is a person on site or in the office finding the answer about a job without
asking anyone, and the record they read being true — never a plausible stand-in.

## Positioning

The mechanism: **the database is the product and the screens read it.** Every value a
screen shows either binds to a real column or renders as a token naming the column it is
waiting for; nothing is invented to fill a gap. Row-level security, not the interface,
decides who may see or change what, and every write is audited with its origin (app,
import, accept link). A neighbouring tool could copy the board; it could not truthfully
claim that every number on it traces to a row somebody can open.

## Operating Context

- **Lifecycle:** seven stages — Acquisition & Development, Pre-construction, Construction,
  Maintenance, Completed, Closed, Cancelled. A project follows its slowest live job.
- **Records:** projects (`1042`) hold jobs (`1042-001`, three-digit sequence); jobs carry
  processes, tasks, checklists, properties, parties, comments, documents, variations and
  maintenance requests (`1042-001-M3`).
- **Where it is used:** the deployed LoftySupport web app, in a desktop browser at a desk
  and in a phone browser on site; Microsoft Entra sign-in; SharePoint folders per job;
  email via Microsoft Graph for maintenance.
- **Rituals:** Settings → Processes and Properties are edited by managers; the Updates page
  carries the request queue, roadmap and changelog for everyone signed in; the import of
  the old system's 801 jobs is Phase B and has not run.
- **Adelaide.** Dates are Adelaide calendar days (the server runs in UTC).

## Capabilities and Constraints

- **Binding visual constraint (Amber, 2 September):** the app is built from
  monday.com's **Vibe** components (`@vibe/core`, `@vibe/icons`), with Lofty's colours in
  Vibe's primary and brand slots. Vibe's tokens for spacing, radius, type and motion are
  the system; Lofty supplies the two hero colours and the accessible siblings and inks
  Vibe does not ship. Recorded here as a constraint; the visual record is `DESIGN.md`, which Amber is
  producing herself in Claude Design (3 September) — it is not generated from this file.
- **Mobile is a width, not a separate app.** Amber: *"for job information and readability
  it should look good from the slideout sidebar and be easy to read and scan. if a job
  details can be seen on that sidebar level which is similar to mobile phone width or found
  in 3 clicks, it is an issue."* The job drawer at its slide-out width is the phone
  layout. A fact about a job that needs more than three taps from the board, or is not
  legible at that width, is a defect.
- **No component reads the database directly.** Everything goes through
  `app/src/data/repository.ts`. The app's `can()` checks hide controls; RLS is the
  security boundary.
- **Never fill a gap with a plausible value.** Empty, or a token naming its column.
- **Health is hidden, not removed.** Status pills are off on cards until there is a plan
  for calculated health.
- **Themes:** light, dark and black, following Vibe's body classes; Figtree is the face.
- **Undecided:** which Vibe accessibility rules, beyond contrast, the app commits to (see
  Accessibility); how the import maps a named person to an owning team.

## Interface Must-Haves

Amber gave these as **must-haves** rather than preferences — the first three on 3
September, the rest on 10 September. They are here because a rule that lives only in a
pull request gets re-litigated on the next screen; `DESIGN.md` is Amber's visual record
and does not repeat them.

Every one is checkable by looking at a screen. None is satisfied by "most pages do this".

**Before any of them: a new screen is built on the brand guide and the design system, not
designed from scratch.** The design system is the `loftybrand` repository — tokens,
components, icons, the states and motion rules — and it inherits from
[Vibe](https://vibe.monday.com): *"everything defaults to Vibe unless a Lofty override is
specified"*. `DESIGN.md` carries the colour, contrast and accessibility contract that sits
over the top. Use the component that exists before styling a `div`; take the accents,
spacing and radii from tokens; never invent a Lofty control. A screen that looks like
nothing else in the app is a screen somebody has to learn separately.

### 1. Every table sorts and filters

> *"all pages with tables have sortable and filterable columns, with appropriate filters
> (e.g. for anything job/project/process related it must have team, team member, stage,
> search by job#/project #) date picker) and for other areas simialr options"*

A table of more than a handful of rows is a list somebody is looking for one thing in.
Forty-seven rows with no way to order or narrow them is a screen that answers "what
exists" and never "where is mine".

**Every column that carries a comparable value sorts, and every column a person would
narrow by filters.** `SortHeader` and `useTableSort` in
`app/src/components/SortableTable.tsx` are the implementation; blanks sort last in both
directions, because reversing a sort should not fill the top of the screen with the rows
carrying no answer. Sorting is not only the header click: `Toolbar`'s **Sort** control
takes any property, including one whose column is switched off in the picker, and works
on the board, the Gantt and the calendar where there is no header to click.

**The filters are the ones that match what the table holds.** For anything about jobs,
projects or processes that is at minimum:

| filter | why it is on the list |
| --- | --- |
| **Team** | the owning team is how work is divided, so it is how a list gets narrowed |
| **Team member** | "what is mine" is the most-asked question of any list |
| **Build lifecycle stage** | the stage is the phase of the work; a list across all seven is rarely the question |
| **Search by job # / project #** | the number is what people say out loud and write on contracts |
| **Date range** | a date picker, not two typed dates — due, started, completed, whichever the table carries |

Elsewhere the same rule with the columns that screen actually has: Contacts filters by
company, role and team; Maintenance by category, status and the job it sits on;
Properties by stage, scope and team. Tasks by status, assignee, team, process, health,
stage, number, due and scheduled. "Similar options" means the equivalents, not fewer.

**Every date filter is a date picker.** `app/src/components/DateRange.tsx` is the one
control — Amber, 1 September: *"this is the default way for every date picker in the
app"*. Today, yesterday, last 7, last 30, next 30 and a custom range. Not a dropdown of
three fixed spans, and never two boxes to type into.

**The filter bar is persistent, inline, and small.**

> *"the filters persistent at the top with standard filters used eg check job board … keep
> things compact and clean … never let filters take up the entire screen, they should be
> inline and intuitive"* — Amber, 10 September

`app/src/components/Toolbar.tsx` is the one implementation and the Jobs board is the
reference. What that means in practice:

- **On the bar from the start, not added one at a time.** The fields you group by are the
  fields you filter by, each reading "Any" until chosen. Amber, 7 September: *"not
  clicking a million times to get new filters up."*
- **One row of controls, wrapping — never a panel, a drawer or a sidebar.** Everything
  else is a single **Advanced** row that opens whole, with a count on the button so a
  filter narrowing the screen from behind a folded row still announces itself.
- **Everything set is in the URL, and nothing else is.** A default is absent, so a link
  carries the difference and a shared board is what the sender was looking at.
- **The count says what is being hidden** — "Showing 11 of 200" — and it is announced to a
  screen reader, not only drawn.

**A filter that hides rows must say so**, and a sort that reorders a grouped or nested
list must say what it did to the grouping — Settings → Processes turns dragging off and
says why when a column sort replaces its pipeline order.

### 2. Every record opens in the slideout

> *"ensure all pages open items in the slideout side bar (can expand to full width) and is
> width adjustable"*

One shell, everywhere: `app/src/components/SidePanel.tsx`. Clicking a row opens the
record down the right, over a list that stays readable behind it. Three things come with
it and none of them is optional:

- **Expands to full width.** `ExpandButton` / `usePanelExpand` — the same control in every
  panel, hidden below 560px where a panel and the window are the same size anyway.
- **Width adjustable.** `useResizablePanel` gives the grab edge, and the width is
  remembered, so the panel is the width that person chose and not the width it shipped as.
- **Escape closes it, and the selection rides the URL** so a record can be linked to and
  survives a refresh.

The pattern this replaces is a detail column sitting beside the list — it looks similar
and is not the same thing: it halves the list, it cannot expand, and it cannot be dragged
wider. That shape was `.contacts-grid` in `processes.css`; it has been **deleted** rather
than left available, so the older pattern cannot come back by being copied from the page
next door. A project used to be worse than a column — it replaced the whole board — and
now opens in the same panel as everything else.

This is the phone-width rule from *Capabilities and Constraints* said as a mechanism:
the drawer at its slide-out width IS the phone layout, so a record that is unreadable in
the panel is unreadable on a phone.

### 3. What has an order is dragged into it

> *"Preferably like how HubSpot allows you to drag and drop pipeline stages in a pipeline
> e as the ui"* … *"Note these are looking at the ui and ux reference not using deals"*
> — Amber, 3 September, with four screenshots

The screenshots are a **reference for the interaction**, and the second sentence says how
to read them: what is borrowed is the shape of the control, never another product's object
model. Lofty's lists hold Lofty's things.

Where rows carry an order that means something — the processes a job runs through, the
properties a process collects, a group's place inside a stage — that order is changed by
**dragging the row**, in a list shaped like the thing it describes: a handle, the name in
a box you type straight into, the row's own actions at the end of it, and an add row at
the foot that lands the new thing in the list you are looking at.

Three things travel with the pattern and none is optional:

- **A keyboard way to do the same move.** Up and down buttons on every draggable row.
  Drag-and-drop alone is a control some people cannot use.
- **The number on screen is the number in the column.** `process_position` is renumbered
  1..n across the whole stage on every move — never per visible row, or a filter plus a
  drag silently sends everything hidden to the end.
- **Sorting is a different question and gets a different answer.** A pipeline sorted by
  team is not a pipeline, so sorting switches to the flat table view, where dragging is
  off and every column sorts. Settings → Processes names both views rather than implying them.

One list is deliberately **not** given this treatment: the build lifecycle itself,
Acquisition & Development through Cancelled. Its order is a CHECK constraint on
`jobs.job_stage`, a `LINEAR_STAGES` constant and a forwards-only rule that Cancelled sits
outside of. Reordering it is a schema change with a business decision inside it, and it is
an open question with Amber rather than a handle nobody added.

### 4. A screen of records is four views, and the kanban always drags

> *"all new pages that are tables should have the kanban, table, gantt and calendar view
> unless specified otherwise"* … *"ensure kanban boards are always able to drag and
> drop"* — Amber, 10 September

**Board, Table, Gantt, Calendar.** One dataset, four arrangements, the same toolbar over
all of them — switching a view re-reads nothing, and the grouping, filters, sort and
search survive the switch because they belong to the screen rather than to the view.
`Toolbar`'s View control, `app/src/components/Board.tsx`, and a Gantt and a calendar
shaped to the records on that screen. Jobs and Tasks both have all four.

*"Unless specified otherwise"* is a real exception and it is spent on screens where a
view would have nothing to draw: Settings and Setup are configuration rather than
records, and a Gantt of a lookup table is a chart of nothing. Where a view is left out,
**say which and why on the screen or in the code** — a missing tab that nobody explained
reads as unfinished.

**Where a kanban column is a value somebody can set, a card is dragged into it.** On the
Jobs board a drop moves the job along the lifecycle or along its stage's processes,
through the same confirmation the drawer's picker uses. On Tasks a drop sets the status,
the team or the assignee — three ordinary edits, no confirmation, because none of them is
one-way the way a stage move is.

Two things travel with it and neither is optional:

- **A refusal explains itself where the card landed.** A column that will not take a card
  refuses the drop during the drag, so the cursor stays honest — and because a refused
  drop fires no `drop` event at all, the reason is printed on `dragenter`, while there is
  still time to put the card somewhere else.
- **A grouping a drop cannot write says so.** Grouped by something derived — a task's
  health, a job's status label — the cards do not drag, and the board says which grouping
  to switch to instead of sitting there inert.

### 5. Selection and bulk edit on every list

> *"always allow selection and editing on a screen for the ability to select multiple jobs
> or properties at once and reassign or edit"* — Amber, 10 September, restating 26 August:
> *"a select button in table view so you can select multiple jobs at once and edit — e.g.
> assign to team or person or stage"*

A tick box on every row **and on every card**, a select-all in the header, and one bulk
bar carrying the edits that screen supports — reassign, set the team, set the status, set
a date. The bar belongs to the selection and not to one view of it: a selection made on
the board has to be actionable without switching to the table, and the same set survives
the switch.

Three rules the Jobs and Tasks bars both follow:

- **Selection is page state, never the URL.** A half-made selection is a draft, and a
  link that arrives with eleven jobs pre-selected is a trap.
- **Writes go one at a time** so a single refusal — RLS, a CHECK — names its record
  instead of failing the batch with "something went wrong".
- **A mixed selection is normal, not an error.** What was skipped is counted and said
  before, not discovered after.

### 6. A screen ships with its stand-in

> *"have a standin showing what to do like on the document template"* — Amber, 10 September

The Lofty document template is a **worked example**: every element is in it, filled in,
so the person starting a report can see what goes where rather than reading a
specification. A screen owes the same thing at the moment it has nothing in it.

- **The empty state says what the screen is for and what to do next**, and offers the
  control to do it — `NothingYet` in `app/src/components/SearchNotices.tsx` takes an
  `action` precisely because the create control usually lives in a row that is not being
  drawn.
- **"Nothing here yet" and "nothing matches" are different sentences.** `NoResults` blames
  the search or the filters, whichever actually narrowed, and offers to clear that one.
  Saying the wrong one sends somebody looking for a bug.
- **An unbound value is a token that names its column, never a plausible stand-in** — see
  *Never fill a gap with a plausible value* in `CLAUDE.md`. `{{job_display.project_type}}`
  invites somebody to bind it; "Single storey" gets quoted back as though it were agreed.

### The checklist for a new screen

Every line is one of the rules above, in the order they get built.

| | |
| --- | --- |
| ☐ | Built from the design system — `loftybrand` tokens and components, Vibe underneath, `DESIGN.md` for colour and contrast. No invented control |
| ☐ | Four views if it lists records: Board, Table, Gantt, Calendar — or the omission is named and reasoned |
| ☐ | `Toolbar` at the top: persistent inline filters, one wrapping row, an Advanced row for the rest, never a panel |
| ☐ | The standard filters for what it holds — team, team member, stage, number, date — plus its own |
| ☐ | Every comparable column sorts; Group by and Sort by reach any property |
| ☐ | Every date filter is `DateRangeFilter`; every date field is a date picker |
| ☐ | Row and card tick boxes, select-all, and a bulk bar that reassigns and edits |
| ☐ | Kanban columns that are a settable value accept a drop; the rest say why not |
| ☐ | Column picker: show, hide, reorder, remembered per person |
| ☐ | Empty, no-match and error states each say the right thing and what to do |
| ☐ | Records open in the slideout, and the open one rides the URL |
| ☐ | Everything on screen is in the query string, and defaults are absent from it |
| ☐ | `cd app && npm run responsive` passes at 320px — and the screen is added to that sweep's routes, with a fixture if the stub has nothing to draw |

## Brand Commitments

- Name: **Lofty Building Group**; the app is **Lofty Hub**, "the hub" or "the board".
- Colours: Lofty green `#005058` and Lofty orange `#f47e63` are the identity. The orange is
  a logo and decorative colour only (2.6:1 on white); anything carrying text or meaning
  uses its darker sibling `#b8482a`.
- Logo: `lofty_logo_orange.png`.
- Voice: plain, specific, in Amber's own words where a rule came from her — comments and
  documents quote the request that caused a change and its date.

## Evidence on Hand

- The live database (Supabase project, migrations 0001–0085 applied), nine hand-made
  projects with 66 jobs; no imported data yet.
- `app/supabase/import/lofty-jobs-grouped-by-project-2026-08-31.xlsx` — the 801 old-system
  jobs, staged but not loaded.
- `docs/history/design-system-evaluation.md` — the July 2026 evaluation of the prototype against Vibe,
  with the contrast numbers behind every colour decision.
- `docs/schema/schema-plan.md`, `HANDOFF.md` — the design record and state of play.
- **Absent, not to be fabricated:** health inputs, SLA values (Amber sets them in the
  app), maintenance categories, testimonials or metrics of any kind.

## Product Principles

1. **The row is the truth; the screen is a reading of it.** Bind or name the column; never
   guess.
2. **Legible on a ladder.** The drawer at phone width is the primary reading surface; if
   it cannot be scanned there, the design is wrong, not the phone.
3. **Vibe first, Lofty colour.** Use the component that exists before styling a div; the
   brand lives in the two colours, the inks that make them accessible, and the type face.
4. **Colour on containers means phase; colour on records means health; never both on one
   element.** One teal family, lightness carrying progression.
5. **Every rule carries its reason.** A schema choice or a design choice without its
   reasoning gets simplified back into a bug.

## Accessibility & Inclusion

No formal standard was adopted (Amber, 2 September). What is committed in code: every
text-on-tint pair clears 4.5:1 and every indicator 3:1 (`docs/history/design-system-evaluation.md`),
dark theme inks are re-cut for the same, touch targets on the drawer are 40px minimum,
`prefers-reduced-motion` is honoured, and the responsive sweep runs 115 route-and-width
combinations. Bright-daylight legibility on a phone is a product need, not a standard.
