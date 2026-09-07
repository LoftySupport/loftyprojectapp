# Roadmap

The phases this build is planned in, and what is in each. **Partly generated**: the
phases and items are written by hand, and the ticks are put there by
`node scripts/changelog.mjs` when a commit says it finished one —

```
Roadmap: Screenshots on a bug report
```

matched on the item's text, so reordering or rewording the roadmap is safe as long as the
trailer says what the item says. **Nothing here is ever un-ticked by the script.** It
knows what the commits said, which is a subset of what has been done; un-ticking on that
basis would quietly delete somebody's record of finished work.

## What this file is, and what it is not

**No dates are written here, and that is deliberate.** Amber sets the dates on the
roadmap **in the app** (Setup is configuration; Updates → Roadmap is the plan people
read), because a date is a decision she makes with the business in front of her and not
something a repository should assert. `roadmap_phases` holds them, along with each
phase's status.

To stop the file and the database drifting into two disagreeing plans, the file owns the
**names and the order** and the database owns the **dates and the status**:

```
node scripts/changelog.mjs --seed        # prints idempotent SQL — names and order only
```

Run it against the database when a phase is added or reordered here. It never runs
automatically: writing to the live database is not a side effect of a commit.

---

## Phase A — the structure

Built and applied. The schema the app reads: teams, natural keys, the lifecycle,
pipelines, tasks, variations, documents, comments and tags. `HANDOFF.md` has the record.

- [x] Teams as a lookup table, and the lifecycle reconciled to what the database holds
- [x] Natural keys and the prefix-everything naming convention
- [x] The seven-position lifecycle, with Completed, Closed and Cancelled
- [x] RLS on every table, with `verify/` proving each rule by watching it bite
- [x] Entra sign-in, and the staff list that decides who may actually get in

## Phase B — the import

**Closed 7 September, without running.** Amber: *"i don't need any jobs imported from
spreadsheets. all jobs that need to be created from now on will be created from the projects
in the app"*. Jobs and projects are created in the app, by the people who own them.

The three items below are **not ticked, because they were not done — they were retired.**
Ticking them would claim an import happened. The spine review it forced *was* done and
applied (Amber, 4 September), which is the part of this phase that still matters.

The phase name is kept so `roadmap_phases` in the database does not drift from this file;
only the description changed, so no `--seed` run is needed.

- [ ] ~~The spine review — what must change before 200 jobs make it expensive~~ — done 4 Sep, outside this phase's tooling
- [ ] ~~The import template, checked against the database's own vocabularies~~ — retired
- [ ] ~~The projects and jobs themselves, with their addresses and history~~ — retired; created in the app instead

## Phase C — the property model

Decided in full and not built. `docs/history/next-session-2026-08-28.md` carries the
decisions and the four open questions; the migrations are the next job after the import.

- [ ] Record types, and the properties catalogue
- [x] `property_values`, with one nullable parent column per record type
- [x] Restricted properties, their viewers, and `private.my_teams()`
- [x] Processes and their dependencies, replacing nested pipelines

## The tracker

Shipped with this branch. Bugs, feature requests, votes, the roadmap and the changelog —
the feature this file is part of.

- [x] One form for bugs and feature requests, with a radio rather than two footer buttons
- [x] Screenshots on a bug report
- [x] The page, the error and the browser captured rather than typed
- [x] A queue everybody can see, with the stages Amber named
- [x] One thumbs up per person per request
- [x] A roadmap of phases and dates, and what is planned into each
- [x] A changelog, in the app and in this repository
- [x] Commits that update the changelog, the roadmap, the README and the handoff
- [x] A discussion under every request, with a pinned answer and an internal lane
- [x] "Someone may have asked this already", searched while the title is being typed
- [x] Merging duplicates, with the votes and followers moving across
- [x] Being told when a request you follow moves
- [x] Adding a vote for somebody whose request arrived on a call

## Not scheduled

Real, wanted, and with nobody's date on them. Kept here rather than in somebody's head —
that is the whole reason the tracker exists.

- [ ] Health: at-risk and overdue flags on the boards, from the SLA numbers that already exist
- [ ] Notifications that actually deliver, beyond @mentions
- [x] The 57 pre-construction steps, once it is settled which are processes and which are properties
- [ ] Variations: pushing a change from a project down to its jobs
