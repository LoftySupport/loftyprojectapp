# Changelog

What has changed in the Lofty project app, newest first.

**Generated — do not edit by hand.** Every line here comes from a `Changelog:` trailer
in a commit message, and `node scripts/changelog.mjs` rewrites the file from the log.
An edit made here is lost the next time somebody commits; put it in the commit instead.

The four kinds are [Keep a Changelog](https://keepachangelog.com)'s, and they are also
the CHECK on `release_entries.release_entry_kind` — one vocabulary, so what the repo
says shipped and what the app shows people cannot use different words for it.

## Unreleased

### Added

- a letter can open with the name of anybody on the record — a token for every party role, with two purchasers joined as "A and B"
- a job's address shows its council region, which could be set from the drawer and never read back
- a table's cells and headers take property placeholders, with the same Insert a field menu the text blocks have
- a document can be published by saving a copy to the job, not only by pasting a SharePoint link
- a document Lofty holds the file for opens from the record, through a signed link
- CI checks that every migration this code needs has been applied to the database
- a job's address can carry a Res number, and it leads the address once set — "Res 1, Lot 3, 13 Tester Street, Testville, SA, 5000"
- a job's address can be changed from the job, the way a project's already could — the original stays put and every previous address stays searchable
- each lot on the split-a-project dialog can be given its own street number — leave it blank and it takes the project's
- the Projects board has a calendar view — it places each project's start date, target completion and end date, so a month shows what is starting and what is due
- the Tasks board has four views — board, table, gantt and calendar — over the same set of tasks, so the grouping, filters, sort and search survive switching between them
- Tasks filters are inline across the top and all of them are there — status, assignee, team and process on the bar, with health, stage, job or project number, due date, scheduled date, who raised it, who it is waiting on and who created it under Advanced
- sort and group the Tasks board by any property, from the toolbar as well as by clicking a column heading — including properties whose column is switched off
- select several tasks at once, on the table or the board, and set their status, assignee, team or due date in one go
- drag a task card between columns on the Tasks board to set its status, team or assignee
- the Tasks table's columns can be shown, hidden and reordered, and the layout is remembered
- a document built in the app is a DRAFT until you publish it — every copy you preview, print or download carries a DRAFT watermark, and publishing means pasting the SharePoint address it was saved to
- editing a published document automatically takes it back to draft, and the watermark comes back with it
- a document can now be saved as a SharePoint link on a job or a project — add one from the record's Documents panel and take it off again
- the dashboard shows recent documents and recent changes across the company
- A Tasks board, in the main navigation, with every task across every job and project — filtered by team, status and process, and sliced into my tasks, my team's tasks, all tasks, overdue, due today and due this week
- `npm run build:montserrat` regenerates the embedded font subset and its width tables from Google Fonts
- Import an HTML page as well as a Word document or a PDF
- Import a Word document or a PDF and it becomes a template or a document — headings, prose and Word tables become blocks you can edit, and it tells you up front what it could not bring across
- Drop an image straight into a report, or pick one from your machine, instead of hosting it somewhere and pasting a link
- New document on a job or project starts with that record already chosen
- Text snippets — save wording once and drop it into any letter from the editor, as a copy you can then edit
- A Snippet Library under Tools, where a manager signs off, renames or retires saved wording
- A job's report reads the properties recorded on its project as well as its own, and the job's own value wins where both are set
- Team membership is edited from the team's own row, rather than one person at a time
- Property placeholders in text blocks, so a letter can carry a job's fields and fill them in when it is exported
- A job or project number can be typed straight into the filters
- Any property, including the project properties a job inherits, can be shown as a column on the Jobs and Projects tables
- Lists longer than five items show the first five and offer the rest
- A SiteBook number can be given to each job as it is created
- A request on Updates can be re-filed as a bug or as an idea
- Undo and redo in the header, for the edits that save as you make them
- A table of contents block, listing the document's section headings in order
- A block can be pointed at particular jobs, projects or teams instead of covering everything
- Long dropdowns in a block's settings narrow as you type
- The document theme can be chosen while you build, not only in Preview & Export
- Managers can set how long a stage should take and who hears when it is overdue, without being able to rename or reorder the stages themselves
- Typing the address of a page above your permission level now says which level it needs and what yours is, instead of showing an empty screen
- A document, template or section can be cloned from an existing one
- Documents can be sent outside Lofty as a share link — a page a client opens with no login, with an optional password and a link that expires
- A shared link shows the document as it was when it was sent, and says so, rather than re-reading Lofty every time it is opened
- Real page-load timings are collected from Vercel deployments, grouped by page rather than by individual job or project
- Documents — make a progress report, a client letter or a maintenance report from a template, and change whatever that one needs without touching the template
- A template library, with reusable sections that update everywhere when you edit them
- Anyone can propose a template or a section; a manager approves it into the library, and until then only its author can see it
- Templates and sections can be for everyone, for one team, or for managers and above
- A report block that pulls the properties recorded on a job or project into the document
- Tools — a new section in the sidebar for the things you use to make something
- Template Builder — build a report layout by dragging blocks, then print it, save it as a PDF, or download it as Word, Markdown or HTML
- A report template reads the app every time it is opened, so the same template is always current rather than a snapshot of the day it was written
- Report templates carry Lofty's colours and wordmark, with a quieter variant for long documents
- The exported PDF and Word document embed the real Lofty wordmark and set the brand's Helvetica
- Every list and report has an Export menu — download exactly what is on screen as an Excel workbook, a Word document or a PDF
- A grouped board or table exports one sheet, one Word section and one page per group
- Downloads name themselves for the screen and the day, so several exports in a folder can be told apart
- npm run export-check proves the Excel, Word and PDF writers are real files, re-parsed from the bytes out
- Group the projects board by where its jobs are — a project appears in every stage or process its jobs have reached, carrying just those jobs
- Drag a job between columns on the board — by lifecycle stage or by the processes inside a stage — and pick several to move at once from either view
- See what each job is up to — group the board by Process, or drill into a stage to get its processes as columns with every job in the one it has reached
- An "Up to" column on the jobs table, in pipeline order
- npm run check:pipeline proves the rule that decides where a job sits
- PRODUCT.md records the interface must-haves every screen has to meet, and HANDOFF.md lists the tables that do not meet the sorting one yet
- The 110 projects from Amber's workbook, each with the number of sites it will hold — no jobs yet
- Setup → Processes is a pipeline — groups and processes drag into order, each process numbered by its place in the flow through its build lifecycle stage
- Processes show when they were last updated, by whom, and which fields changed
- Processes filter and sort by team, build lifecycle stage and group, with edit and delete on the list and the milestone flag in a column of its own
- 121 new properties from Amber's workbook, including the whole Construction stage — Footings through Handover
- The jobs import takes Amber's decisions — every job in Acquisition & Development unless the sheet says cancelling, the owning team from the named person when they are a user in one team, shared old numbers carried by no job
- PRODUCT.md records who the app is for, the phone-width drawer as the primary reading surface, and Vibe-with-Lofty-colours as the binding visual constraint
- The live database is at 0085 — Maintenance, Contacts and notifications tables exist, and the Maintenance tab loads
- Phase B — the old system's 801 job rows are staged verbatim in the database, with a load that builds the projects and jobs from them and an unload that takes exactly that back out
- Setup → Processes edits the tick-box lines of a template task, and every task shows its team, days, parent and order at once
- Maintenance — a tab for what homeowners report after handover: requests numbered on the job, items per trade, offers to contractors with an accept link, the thread, SLA health and warranty
- Setup → Maintenance — the warranty period, offer and reminder clocks, and the trades with their SLAs
- Notifications — assigned, mentioned, at risk, overdue, stage moved, working drawings changed — in the bell, by email and Teams, immediate or in a daily digest, chosen per person in Settings
- Setup → Notifications — who hears what, with escalation after days late
- Contacts — people and companies outside Lofty, classified, with the company beside each person, how to reach them, and what they are doing on each job, project and process
- SiteBook's project roles on a project, held by Lofty people
- Tasks carry sub-tasks and checklists, start and expected days, and read at risk before they are overdue
- Stage completion counted once in the database — milestones passed and processes open per stage
- A SiteBook ID property on every job
- The platform-layer design — contacts and companies, maintenance, notifications, a readable change history, two-way sync — recorded in schema-plan.md ahead of the build
- The Impeccable design skill, installed for the repo
- Properties record values on jobs and projects, with per-property security levels, team and person access, and an opt-in restricted flag
- Processes inside every lifecycle stage — editable by managers, with dependencies, properties collected and checklists
- The properties-and-processes workbook of 1 September is seeded: 49 processes, 174 properties, the construction schedule
- Push a project's properties to all its jobs, with a preview
- Filter jobs by process and process health, and by whether a property is recorded
- A Processes report — where every process stands across the jobs in view
- A standalone /report page that works for accounts held at the demo gate
- One date range picker across the app — today, yesterday, last 7, last 30, next 30, custom
- Search, a phase filter and a date range on the tracker
- Drag requests between stages and roadmap phases, at the rung each move really needs
- Table, gantt and calendar views on both the tracker and the roadmap
- An admin can file a request on behalf of somebody who told them about it
- Total lots on the new project form, following the community and Torrens split or typed in on its own
- A discussion under every request, with a pinned answer and an internal lane for triage
- "Someone may have asked this already" — the report form searches while you type, and offers to vote instead
- Duplicates can be merged, and the votes and followers move with them
- The bell tells you when a request you follow moves, with the note whoever moved it left
- A vote can be added for somebody whose request arrived on a call, recorded against whoever entered it
- The responsive sweep covers the three Updates tabs
- One form for reporting a bug or requesting a feature, with a radio instead of two footer buttons
- Screenshots, the page, the error and the browser sent with a report — captured, never typed
- A tracker everybody can see, with the stages requested, in review, planned and in development
- One thumbs up per person per request, and the vote count the next phase is planned from
- A roadmap of phases and dates, and what is planned into each
- A changelog, in the app and in this repository

### Fixed

- 64 job addresses had their lot number in the street-number column, so a job at lot 1 of 14 Brodie Road read as 1 Brodie Road — somebody else's house
- the staged-workbook importer could not insert a row after the lot number became a number
- a placeholder on the canvas is marked again — an unfilled field and a mistyped one had been printing as ordinary text
- a missing migration now says the app is ahead of the database and names the column, instead of showing the database's own error
- a job created by splitting a project now keeps the street number — every one of them read "Lot 3, Corner Street" with no number in it, because the split threw the project's street number away
- a link naming a view a board does not have showed a blank page with an empty View control; it now opens the board's default view instead
- the app builds again — a dependency update took Tailwind to a major version the build is not set up for, and it is pinned back until that migration is done on its own
- entries and month arrows on the jobs and tasks calendars were too small to tap reliably, and a month grid pushed narrow screens sideways
- a document built in the app can now be deleted — there was no way to remove one from anywhere
- The bug-and-idea form at /report opens again for people held at the demo gate — it had been blank since it was added
- A link you were sent takes you there after signing in, instead of dropping you on the dashboard
- A document can be put on a project as easily as on a job — the choice is now asked before the list, instead of every project sorting below every job in one long picker
- Undo and redo take back every edit that saves as you make it — dates, tasks, maintenance, process runs and properties included, not only a job's team and assignee
- Cards on the board no longer touch each other
- The icons in the top bar no longer flash pink when you hover them
- Menu labels no longer lose their first letter when the sidebar is collapsed
- Creating jobs from a project opens over the project instead of behind it, and the jobs list sits at the top of the drawer
- Every dropdown lists its options alphabetically, including the multi-selects
- A half-written bug report is kept when the panel is closed or the page changes
- User settings shows notifications beside your details instead of cut off in a narrow column
- Editing a person in the Users table keeps Save in view, and the name opens their panel with settings and actions
- In dark mode, the fields in the document and report builder showed black text on a black background; they are readable again
- The privacy policy named Netlify as the host serving the app; Vercel serves it
- The changelog generator no longer reports "Changelog: skip" as a mistake, so its check can pass again
- Setting a document to landscape now shows a landscape page in the builder, not only in the export
- The version in the footer names the commit it was built from on Vercel as well as Netlify, instead of reading "local" on a real deployment
- The row hairline in an exported PDF was one shade off the same line in the Word document
- The jobs board offers only the processes of the stage you have filtered to, and says the right thing when a process belongs to a stage the job has already left
- The jobs board no longer scrolls sideways on a phone
- Setup → Processes no longer scrolls sideways on a tablet or a small phone
- The schema checks no longer assume the database is empty, so real data cannot make them fail for the wrong reason
- Properties that showed only the tail of their name — three different rows all called "Ordered" — now read in full, with the team that owns them and a date field instead of "format not set"
- A process can collect job and project properties together — 9 attachments that were configured but invisible now show
- Setup → Properties showed nothing at all; one missing database column had been stopping the whole page from loading
- Maintenance due dates, warranty, health and daily reminders all work on the Adelaide calendar day — a request no longer turns overdue at 09:30 in the morning
- A project with no target date reads "Not set" on its card, in the table and on its page — no column token
- Ben Johnson's email address is ben@lofty.com.au — it had been seeded at a domain Lofty does not use
- The changelog on Updates reads this repository's merged pull requests, not the old repository's
- The hundredth job on a project was refused with a duplicate-key error
- A project can now pass 99 jobs — the hundredth was refused with a duplicate-key error
- The projects board lays its stage columns out from the saved view it is in, like the jobs board
- Two migrations were both numbered 0069; the one that ran last is now 0073
- Clicking Dashboard opened Projects for anyone whose landing page was not Dashboard
- The tracker's month stepper, request titles and gantt labels were under the 24px tap-target floor
- The count on a projects view tab disagreed with the list it opened, for projects with no jobs
- Deleting a profile no longer fails when that person had filed a request
- Zero community and zero Torrens lots no longer reached the database as a constraint error
- The demo-account checks in verify/ were reporting a failure they did not have — their own setup was being refused

### Changed

- publishing a document again replaces the copy saved on the record instead of adding another — download the old one first if you need it
- a lot number and a res number are whole numbers; a street number stays text, so 12B and 100-105 are kept as typed
- the res number is offered on every address form, a project's included
- addresses now read "Testville, SA, 5000" rather than "Testville SA 5000, AU" — the country is no longer printed on the end of every one
- the number you can enter when creating a job or splitting a project is now called the old job number rather than the SiteBook number — SiteBook does not issue one until construction, and the field has always held the old system's number
- the footer drops "What's planned" — Updates in the same row is the same page — and the bug report link loses its icon
- the search box in the top bar now finds jobs, projects, people, companies, requests and documents from any page — matches appear as you type, and Enter opens a full results page. It still narrows the board or table you are on as well
- filled buttons are Crisp Orange again, and drop their fill on hover for a Crisp Orange text and line — the brand colour, chosen over the darker step that cleared the contrast floor
- a filled button now drops its fill on hover and focus — the pressed orange becomes the text and a thin line — instead of darkening
- exported Word and PDF documents are set in Montserrat, the brand's document face, in place of Helvetica — the PDF now carries the font, so it looks the same on every machine
- the design-system mirror is back in step with the brand repository — a sequential orange data scale for continuous values, and Arial is now the last font fallback on every screen (Helvetica before)
- The merged-pull-requests feed on Updates → Changelog shows every finalised pull request by default, using its title when it declared no @changelog line
- Somebody without a Lofty account can no longer discover the names of the tables and columns behind the app
- The app takes the design system's Flint neutrals for its page and rules, Montserrat for titles, and dark mode's green and control borders now clear their contrast floors
- The Jobs and Projects filters are the same fields as Group by, always on the bar, with everything else in one Advanced row instead of chips added one at a time
- On the Projects board, Stage now filters by the project's own phase and a separate Job stage filter finds projects with a job in that stage
- Sections in the job panel fold away, and Collapse all shuts the lot at once
- Activity and comments now sit at the bottom of the job panel instead of behind a tab
- Sections in the job panel now fold away, and stay folded how you leave them
- Only admins can create a new kind of notification; managers still decide who hears each one
- Choosing a person is a type-ahead — names with their team, the record's own team first, and a single match is taken as you tab away
- Bugs, ideas, the roadmap and the changelog live only on Updates; the copies under Admin are gone
- The roadmap and changelog now live in one place instead of two
- Buttons in Lofty orange are now a deeper shade, so their labels are easier to read
- Buttons and labels on Lofty orange now use white text, never black
- The app takes Lofty's brand colours from the design system — orange is now the primary action colour, with green kept for small accents
- The app is called Lofty Hub in the sidebar logo and in the browser tab of a shared document
- Sign-in and Wiring no longer mention a second pair of Supabase variable names that the app stopped reading
- Setup is now Settings, and managers and above can open it — properties, processes, contacts, maintenance, the stage SLAs and the notification rules
- Admin has moved off the sidebar to a cog in the top bar, and appears only for admins and super admins
- Users, teams, permissions, the dictionary, the wiring, the bug and idea queues, the roadmap and the changelog are all now under the cog
- Tools → Template Builder is Document Builder, Template Library and Section Library, each with its own buttons
- Tools → Template Builder is three tabs — Documents, Templates and Sections — instead of two stacked panels
- Documents built in the Template Builder now carry Lofty's house document format — the same wordmark, colours, section rule and font as every other export
- Excel, Word and PDF exports now carry Lofty's house document format — the wordmark, the orange section rule, the grey table header and the "Commercial in confidence" footer
- Every dropdown narrows as you type and lists its options alphabetically, except where the order is the information — and a process can be filed straight into a pipeline when it is created
- Setup → Processes is now a pipeline you drag, with the name editable in place and a process added straight into its stage
- Every record — a contact, a maintenance request, a property, a project — now opens in the same slide-out panel, which expands to full width and can be dragged wider
- Updates moved from the sidebar to the footer
- A process opens in the same slideout as every other record, and expands to full screen
- The app is Lofty Hub — in the browser tab, on sign-in and on the legal page
- Setup → Processes and Setup → Properties open the selected record in a panel beside the list, everything editable there — nothing behind a More or Order toggle
- Updates → Merged from the build reads merged pull requests from LoftySupport/loftyprojectapp, where the repository lives now
- The decision against external parties is reversed — maintenance makes them first-class
- Every table is audited now, and a record's history is readable by everyone except restricted fields
- The three oldest tables follow the tablename_attribute naming rule
- The properties and processes screens after a design pass — palette-consistent health colours, keyboard-reachable report links, a two-step delete
- The fourth lifecycle phase is Maintenance — handover is the last process of Construction
- Job numbers are three digits from 001 — existing jobs renumbered, and a project can now run past 99 lots
- The request board and detail view restyled, and the table now matches the rest of the app
- The tracker view rides the URL, so a gantt or calendar can be linked to and saved
- The projects board has its own views — All Projects, Current Projects, Archived, and New Projects for the ones nobody has split yet
- "Shipped" is now "Live in the app", and it is the last column on the board
- The new project form asks only for suburb, state, postcode and a project type — the street, its numbers and the council are all optional
- The handoff and the README say what the tracker changed, and what is still open
- Bugs and requests are readable by everyone, not just admins — a queue nobody can see cannot stop a duplicate request
- Only superadmin moves a request between stages

### Removed

- Clone is no longer on the job panel — cloning belongs to the project
- Notifications is no longer a Setup tab; your own channels stay in User settings and the audience rules moved under Automations
- Processes is no longer a destination in the main navigation — it is part of Setup; /processes and /templates forward there
- The tracker's gantt and calendar
