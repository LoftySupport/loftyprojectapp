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

- Properties that showed only the tail of their name — three different rows all called "Ordered" — now read in full, with the team that owns them and a date field instead of "format not set"
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

- Processes is no longer a destination in the main navigation — it is part of Setup; /processes and /templates forward there
- The tracker's gantt and calendar
