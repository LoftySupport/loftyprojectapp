# Lofty Hub

The V0 build of Lofty's job pipeline board: React, Vibe and Supabase.

**Connected, and carrying real data since 3 September.** Most repository methods read
Supabase — projects, jobs, profiles, teams, the pipeline stages, properties, processes
and the tracker are live queries. The database holds **117 projects, 66 jobs, 270
property definitions and 49 processes**; the 110 projects Amber sent on 3 September are in
with the number of sites each will hold, and their jobs are deliberately not created yet.
(Setup → Wiring counts the wiring rather than repeating it here: these numbers are a
snapshot and that screen is generated.)

Values whose table is not built yet still render as a `{{table.column}}` token, so an
unbound field is visible rather than silently blank. Two things are genuinely not built —
`property_defs` and `pipeline_stage_tasks` — and the screens that would show them say so
instead of showing a plausible guess.

<!-- generated:shipped -->
**No release has been published yet.** See [CHANGELOG.md](CHANGELOG.md) for what is waiting.

Unreleased: 116 changes since then —
- Fixed: The version in the footer names the commit it was built from on Vercel as well as Netlify, instead of reading "local" on a real deployment
- Changed: Documents built in the Template Builder now carry Lofty's house document format — the same wordmark, colours, section rule and font as every other export
- Fixed: The row hairline in an exported PDF was one shade off the same line in the Word document
- Added: Documents — make a progress report, a client letter or a maintenance report from a template, and change whatever that one needs without touching the template
- Added: A template library, with reusable sections that update everywhere when you edit them
- …and 111 more.

<sub>Generated from commit trailers by `node scripts/changelog.mjs` — do not edit inside this block.</sub>
<!-- /generated:shipped -->

Everything anyone has asked for, where it has got to and what has shipped is in the app
under **Updates**, reached from the footer — the queue, the roadmap and the changelog,
readable by everybody signed in. It sits in the footer rather than the sidebar (Amber,
3 September) because the sidebar is for the work. In this repository the same three live in [ROADMAP.md](ROADMAP.md) and
[CHANGELOG.md](CHANGELOG.md), both kept current from commit trailers by
`node scripts/changelog.mjs`.

The stakeholder prototype this grew out of lives in a separate repo,
[`loftyprojectboard`](https://github.com/amberbeaumont/loftyprojectboard), and is
deliberately frozen. That one stays under `amberbeaumont` on purpose — it is an artefact,
not the live build.

**This repository is `LoftySupport/loftyprojectapp`, and it is the only one the app is
built from.** It started in `amberbeaumont/loftyprojectapp`, moved to
`LoftyGroup/loftyprojectapp` on 1 September, and now lives here under the `LoftySupport`
account. The personal one is public and still holds the history up to 1 September, so it
answers when something reads it — with an answer that stopped that day and does not say
so. Two things need doing outside this repository: the Netlify site was recreated on
2 September and builds from here, but its Supabase environment variables have not been
set yet, so the sign-in page says *Not configured*; and this repository is private where
the old one was public, which is what the changelog's live pull-request feed depends on.
Both are written up, with the exact steps, in [HANDOFF.md](HANDOFF.md) under *This is the
repository now*.

---

## Where things are

| URL | What |
| --- | --- |
| [`LoftySupport/loftyprojectapp`](https://github.com/LoftySupport/loftyprojectapp) | **This repository.** Where the code, the branches and the pull requests live |
| [`loftyprojectapp.netlify.app`](https://loftyprojectapp.netlify.app) | **The build.** Every screen, on Vibe — *built from this repository since 2 September; its environment variables still need setting* |
| `…/signin` | Microsoft Entra sign-in — the only route open without a session |
| `…/dictionary` | The data dictionary |
| `…/binding-template` | The tokenised prototype — **layout** reference only |
| `…/prototype.html` | The original, with its dummy data |

`binding-template` is kept for layout, not for fields: its field set predates the schema
decisions and it still shows the old project shape and the old six roles. The React app is
the accurate one.

## Read these first

| File | What it is |
| --- | --- |
| **`HANDOFF.md`** | **Start here.** State of play, what is next, and when to change what |
| **`PRODUCT.md`** | Who the app is for, what binds it, and the **interface must-haves** every screen has to meet |
| **`schema-plan.md`** | The current design and the record of how it was decided. Phase A is built; Phase C waits on the business decisions at its end |
| `data-dictionary.md` | Every property: Lofty name, definition, type, rules, relationships, status. Generated — see below |
| `app/supabase/migrations/` | `0001`–`0093`. The database is the authority; these rebuild it |
| `app/supabase/verify/check.sh` | Replays every migration into a throwaway database and proves the schema *behaves* — constraints bite, RLS holds, embeds resolve, seeds agree |
| `supabase-schema.md` | **Superseded** — carries a banner saying so. Kept for its reasoning, not its schema |
| `concept-spec.md` | The original data-architecture write-up |

Design-system records, still accurate:

- `design-system-evaluation.md` — the evaluation against Vibe and what changed
- `vibe-catalog-status.md` — component-by-component status against the Vibe catalog
- `react-migration.md` — the original migration plan *(historical: written before the
  schema decisions, so its table shapes are out of date)*

## The data dictionary is generated

`app/src/data/dictionary.ts` is the only place properties are written down.
`data-dictionary.md` is generated from it and the Dictionary page renders the same array,
so the file, the page and the code cannot disagree.

```bash
cd app && npm run dictionary
```

Edit the array, regenerate, commit both. Never edit `data-dictionary.md` by hand.

## Working on it

```bash
cd app
npm install
npm run dev          # http://localhost:5173/
npm run build        # tsc -b && vite build
npm run dictionary   # regenerate data-dictionary.md
```

`./build.sh` from the repo root assembles the whole deploy — the app, the binding
template and the prototype — into `dist/`. That is what both hosts run.

### Deploying: moving from Netlify to Vercel

The site is mid-migration and both hosts are connected, so both configurations are in the
repository and neither has been removed. `netlify.toml` is the one that has been building
the site; `vercel.json` is the one being brought up.

`vercel.json` exists because Vercel's zero-config cannot work this repository out: the
build is `./build.sh` (not a framework preset), the output is `dist/` at the root, and
there is a stray root `package-lock.json` with **no `package.json` beside it** — enough
for Vercel to try an install that cannot succeed. So the file names the build command and
the output directory, sets an empty install command (the real `npm ci` happens inside
`app/`, in `build.sh`), and ports the three routing rules and four headers from
`netlify.toml`. JSON takes no comments, which is why the reasoning is here.

**Two things have to be done in the Vercel project itself and cannot be done from the
repository:**

1. **`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.** Without them the app builds
   and serves, and every screen runs on the stub repository — real structure, no data —
   with the sign-in page saying *Not configured*. Note that the Netlify **Supabase
   extension** wrote a second pair of spellings (`VITE_SUPABASE_DATABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`) that the app also reads; there is no such extension on
   Vercel, so the two names above are the ones to set.
2. **The Node version.** `netlify.toml` pins 22. Vercel takes its version from a root
   `package.json`'s `engines`, and this repository has none, so it uses the project
   default — worth setting to 22 explicitly rather than inheriting whatever the default
   becomes.

The build identity reads both hosts' variables (`COMMIT_REF`/`CONTEXT` on Netlify,
`VERCEL_GIT_COMMIT_SHA`/`VERCEL_ENV` on Vercel), so the version in the footer says which
commit it is on either. See the note in `app/vite.config.ts` for the trap in that: the
first draft used `??`, which falls through on null and not on an empty string, so a
variable set to nothing would have won and the footer would have read "local" on a real
deployment.

### One branch and PR per table

Each schema decision touches the migration, the types, the app and the dictionary
together, so it is reviewed as a unit rather than landing on `main` already done.

```bash
git checkout -b claude/<table>-schema
# … change all four …
cd app && npm run dictionary && npx tsc -b
git commit && git push -u origin claude/<table>-schema
```

Both hosts build a preview per PR. Merge when the preview looks right — and while the
migration is on, check the one you are moving to.

## Design system

Built on [Vibe](https://vibe.monday.com), monday.com's design system — its type ramp, 4px
spacing scale, radii, motion curves, elevation, neutrals and semantic colours, plus its
accessibility contract. Lofty's logo orange `#f47e63` and deep green `#005058` sit in
Vibe's primary slots in place of Vibe's blue.

Light, dark and black themes, switchable in Settings. **Zero AA contrast failures across
all three**, checked with a composited-alpha audit rather than by eye — including two
places where Vibe's own defaults fail (see `HANDOFF.md`).

`.mcp.json` wires the [Vibe MCP server](https://vibe.monday.com/?path=/docs/mcp--docs)
into the repo, so an MCP-capable editor can query component APIs, tokens and
accessibility requirements while working on the UI.

## Interface must-haves

Two rules bind every screen, given by Amber on 3 September as must-haves rather than
preferences. Both are written up in full, with the mechanisms and the reasoning, under
**Interface Must-Haves** in [PRODUCT.md](PRODUCT.md).

**1. Every table sorts and filters.** Every column carrying a comparable value sorts
(`app/src/components/SortableTable.tsx`; blanks sort last in both directions). Every table
about jobs, projects or processes carries at minimum: **team**, **team member**, **build
lifecycle stage**, **search by job # / project #**, and a **date-range picker**.
Elsewhere, the equivalents for the columns that screen actually has — "similar options"
means the same job done with that table's own fields, not fewer of them.

**2. Every record opens in the slideout.** One shell —
`app/src/components/SidePanel.tsx` — down the right, over a list that stays readable.
It **expands to full width** (`PanelExpand`), it is **width adjustable and remembers the
width** (`useResizablePanel`), Escape closes it, and the selection rides the URL so a
record can be linked to. A detail column beside the list is not this: it halves
the list, cannot expand and cannot be dragged. That shape (`.contacts-grid`) has been
deleted rather than left available to copy.

Where a screen does not meet these yet, it is listed in [HANDOFF.md](HANDOFF.md) rather
than left to be discovered.

## Views

Board, Table, Gantt and Calendar — the same four names on Jobs, Board and Table on
Projects. Grouping by Stage, Project, Team, Team member or Status. One date control
holding the whole range, and filters you add and remove, each arriving unset.

A job drawer with breadcrumbs, milestones, the definition-driven field slots and the
activity feed. Cards are keyboard-operable; the drawer takes focus on open and closes on
Escape.
