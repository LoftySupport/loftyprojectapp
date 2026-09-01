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

- A project can now pass 99 jobs — the hundredth was refused with a duplicate-key error
- The projects board lays its stage columns out from the saved view it is in, like the jobs board
- Clicking Dashboard opened Projects for anyone whose landing page was not Dashboard
- The tracker's month stepper, request titles and gantt labels were under the 24px tap-target floor
- The count on a projects view tab disagreed with the list it opened, for projects with no jobs
- Deleting a profile no longer fails when that person had filed a request
- Zero community and zero Torrens lots no longer reached the database as a constraint error
- The demo-account checks in verify/ were reporting a failure they did not have — their own setup was being refused

### Changed

- The tracker view rides the URL, so a gantt or calendar can be linked to and saved
- The projects board has its own views — All Projects, Current Projects, Archived, and New Projects for the ones nobody has split yet
- "Shipped" is now "Live in the app", and it is the last column on the board
- The new project form asks only for suburb, state, postcode and a project type — the street, its numbers and the council are all optional
- The handoff and the README say what the tracker changed, and what is still open
- Bugs and requests are readable by everyone, not just admins — a queue nobody can see cannot stop a duplicate request
- Only superadmin moves a request between stages
