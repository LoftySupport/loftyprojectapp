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

- The changelog generator no longer reports "Changelog: skip" as a mistake, so its check can pass again
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

- Notifications is no longer a Setup tab; your own channels stay in User settings and the audience rules moved under Automations
- Processes is no longer a destination in the main navigation — it is part of Setup; /processes and /templates forward there
- The tracker's gantt and calendar
