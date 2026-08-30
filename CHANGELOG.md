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

- The responsive sweep covers the three Updates tabs
- One form for reporting a bug or requesting a feature, with a radio instead of two footer buttons
- Screenshots, the page, the error and the browser sent with a report — captured, never typed
- A tracker everybody can see, with the stages requested, in review, planned and in development
- One thumbs up per person per request, and the vote count the next phase is planned from
- A roadmap of phases and dates, and what is planned into each
- A changelog, in the app and in this repository

### Changed

- The handoff and the README say what the tracker changed, and what is still open
- Bugs and requests are readable by everyone, not just admins — a queue nobody can see cannot stop a duplicate request
- Only superadmin moves a request between stages
