# Handoff

Everything a new session needs to pick this up. Read this first, then `schema-plan.md`.

**Phase A is done and applied. Next job: [Phase B, the import](#next-phase-b-the-import)** —
and before it, the spine review described there, because that is the only category of
change that gets expensive once 200 jobs are in.

Last updated: 2026-08-26.

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
  view), and **Cancelled** (stopped without completing; **the one backward move the
  lifecycle allows** — revival; fires no notifications, automations or health alerts
  while there). This reverses `schema-plan.md`'s "cancellation is a status, not a
  phase" — the reversal and its reasoning are logged there, next to the original.
- **The guards carry the carve-outs** (`guard_lifecycle_is_linear`): Closed is
  terminal for people; anything live may move to Cancelled; anything may leave
  Cancelled. `project_stage_from_jobs()` excludes cancelled jobs, so a project
  neither waits for nor follows them.
- **The drawer's stage control grew the verbs**: Move (forwards, linear run only),
  **Cancel…** (working phases only — a completed job isn't cancellable), and
  **Revive to…** on a cancelled record. One confirmation dialog, three sets of copy.
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

Still open from this session: **four live tables still have no dictionary entries**
— `pipelines`, `job_pipeline_positions`, `job_stage_events` (0029) and
`dictionary_overrides` (0044) — and `pipeline_stages` is only covered for its two
SLA columns. Nothing yet *consumes* the SLA numbers: the at-risk/overdue flags on
boards wait on the health calculation (see the parked `health_statuses`).

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

`amberbeaumont/loftyprojectapp` — the V0 build of Lofty's job pipeline board. React,
Vibe (monday.com's design system) and Supabase.

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
a warning rather than failing — so the file is safe to commit before the token exists, and
safe to keep if it is ever revoked.

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
