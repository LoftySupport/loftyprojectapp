# Lofty Hub

The V0 build of Lofty's job pipeline board: React, Vibe and Supabase.

**Connected, and carrying real data since 3 September.** Most repository methods read
Supabase — projects, jobs, profiles, teams, the pipeline stages, properties, processes
and the tracker are live queries. The database holds **117 projects, 66 jobs, 270
property definitions and 49 processes**; the 110 projects Amber sent on 3 September are in
with the number of sites each will hold, and their jobs are deliberately not created yet.
(Admin → Wiring counts the wiring rather than repeating it here: these numbers are a
snapshot and that screen is generated.)

Values whose table is not built yet still render as a `{{table.column}}` token, so an
unbound field is visible rather than silently blank. Two things are genuinely not built —
`property_defs` and `pipeline_stage_tasks` — and the screens that would show them say so
instead of showing a plausible guess.

<!-- generated:shipped -->
**No release has been published yet.** See [CHANGELOG.md](CHANGELOG.md) for what is waiting.

Unreleased: 240 changes since then —
- Added: Clone a job from its line on the project, as an icon beside Remove — the control that went missing when cloning moved off the job drawer
- Fixed: The phone's navigation button is a hamburger in the top right and the Lofty mark is in the top left, instead of an ellipsis on the left and no mark at all
- Changed: The full screen job record sits inside the app frame, so the sidebar, the top bar and the footer are all still there while you read it
- Removed: The unread and open-task numbers beside Inbox and Tasks, until what each one counts is settled and checked
- Added: Inbox and Tasks in the navigation rail carry a badge — unread items on Inbox, your open tasks on Tasks, with a dot on My work when the rail is collapsed
- …and 235 more.

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
so. One thing still needs doing outside this repository: it is private where the old one
was public, which is what the changelog's live pull-request feed depends on. It is written
up, with the exact steps, in [HANDOFF.md](HANDOFF.md) under *This is the repository now*.

---

## Where things are

| URL | What |
| --- | --- |
| [`LoftySupport/loftyprojectapp`](https://github.com/LoftySupport/loftyprojectapp) | **This repository.** Where the code, the branches and the pull requests live |
| [`hub.lofty.au`](https://hub.lofty.au) | **Lofty Hub — the app.** Every screen, on Vibe. Vercel serves it (Amber, 4 September: *"it is using vercel now"*) |
| [`loftyprojectapp.vercel.app`](https://loftyprojectapp.vercel.app) | The same deployment on its Vercel-assigned name. Preview deployments get one of these per pull request |
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
| **`DESIGN.md`** | **The single design file.** Tokens, the contrast decisions behind each colour, the accessibility contract, the board's colour rule |
| `docs/README.md` | The map of everything under `docs/` — the schema reference, and the record of how decisions were made |
| **`docs/schema/schema-plan.md`** | The current design and the record of how it was decided. Phase A is built; Phase C waits on the business decisions at its end |
| `docs/schema/data-dictionary.md` | Every property: Lofty name, definition, type, rules, relationships, status. Generated — see below |
| `app/supabase/migrations/` | `0001` upwards, applied in order. The database is the authority; these rebuild it. (No end number here on purpose — it was written as `0093` and was `0096` within days) |
| `app/supabase/verify/check.sh` | Replays every migration into a throwaway database and proves the schema *behaves* — constraints bite, RLS holds, embeds resolve, seeds agree |
| `docs/schema/supabase-schema.md` | **Superseded** — carries a banner saying so. Kept for its reasoning, not its schema |
| `docs/schema/concept-spec.md` | The original data-architecture write-up |

Design-system records, still accurate:

- `docs/history/design-system-evaluation.md` — the evaluation against Vibe and what changed
- `docs/history/vibe-catalog-status.md` — component-by-component status against the Vibe catalog
- `docs/history/react-migration.md` — the original migration plan *(historical: written before the
  schema decisions, so its table shapes are out of date)*

## The data dictionary is generated

`app/src/data/dictionary.ts` is the only place properties are written down.
`docs/schema/data-dictionary.md` is generated from it and the Dictionary page renders the same array,
so the file, the page and the code cannot disagree.

```bash
cd app && npm run dictionary
```

Edit the array, regenerate, commit both. Never edit `docs/schema/data-dictionary.md` by hand.

## Working on it

```bash
cd app
npm install
npm run dev          # http://localhost:5173/
npm run build        # tsc -b && vite build
npm run dictionary   # regenerate docs/schema/data-dictionary.md
```

`./build.sh` from the repo root assembles the whole deploy — the app, the binding
template and the prototype — into `dist/`. That is what Vercel runs.

### Deploying: Vercel serves the app

**Vercel is the only host** (Amber, 4 September: *"it is using vercel now"*).
`netlify.toml` was removed on 6 September and the Netlify site was disconnected from this
repository the same day. Both Netlify site names had been answering 404 since 4 September,
and a second host configuration nobody deploys from is a file that contradicts the live one
the first time either changes. `vercel.json` is now the only deploy configuration.

(`loftyprojectboard.netlify.app` is still live and is **not** this app — it is the frozen
stakeholder prototype, in a separate repository.)

`vercel.json` exists because Vercel's zero-config cannot work this repository out: the
build is `./build.sh` (not a framework preset) and the output is `dist/` at the root. So
the file names the build command and the output directory, sets an empty install command
(the real `npm ci` happens inside `app/`, in `build.sh`), and carries the routing rules
and the headers. JSON takes no comments, which is why the reasoning is here.

It also sets caching, which the routing rules had not covered: Vite's `/assets/*` are
content-hashed, so they are `immutable` for a year, while `/index.html` is
`must-revalidate` — the pairing that lets a deploy reach people who already have the page
open. `X-Robots-Tag: noindex` stays: this is not for the public while it is V0, and that
header does not replace auth — Supabase Auth is what actually protects it.

**Three things have to be done in the Vercel project itself and cannot be done from the
repository.**

#### 1. The Root Directory must be empty

This is the one that has to be right before anything else can be, because **Vercel reads
`vercel.json` from the Root Directory** — not from the repository root. Point it at `app`
and the file above is never opened: no SPA rewrite, so every deep link 404s on refresh; no
`/binding-template` and no `/prototype.html`; no `/app/*` redirect for old bookmarks; and
none of the four headers.

**Output Directory is resolved relative to Root Directory too**, which makes the two
settings easy to get wrong together: Root Directory `app` with Output Directory `app/dist/`
resolves to `app/app/dist/`, and no build can produce that.

| Setting | Value | Why |
|---|---|---|
| Root Directory | *empty* | so `vercel.json` is read, and `build.sh` can reach `prototypes/`, which is outside `app/` |
| Framework Preset | Other | the root is not a Vite project — the Vite app is in `app/`, and `vercel.json` declares `"framework": null` to say so |
| Build Command | `./build.sh` | or leave the override off and let `vercel.json` supply it |
| Output Directory | `dist` | likewise |
| Install Command | *empty, override on* | an empty string skips install; the real `npm ci` runs inside `app/` in `build.sh` |
| Skip deployments when nothing in the root changed | off | with no Root Directory set, everything is the root, so this can only mislead |

The dashboard fields are redundant once Root Directory is empty — `vercel.json` takes
precedence over all of them. Setting both is not harmful while they agree; it is two
places to update when they stop agreeing.

#### 2. `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`

Without them the app builds and serves, every screen runs on the stub repository — real
structure, no data — and the sign-in page says *Not configured*.

**The prefix is the framework's, not Supabase's.** A bundler only exposes to browser code
the variables carrying its own prefix: Vite reads `VITE_`, Next.js reads `NEXT_PUBLIC_`,
Create React App read `REACT_APP_`. So the same Supabase integration provisions different
names depending on which framework it is told it is wiring up — and **on Vercel it assumes
Next.js**, which produces `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Neither is visible to `import.meta.env`. `app/vite.config.ts` sets no `envPrefix`, so
Vite's default of `VITE_` applies and a `NEXT_PUBLIC_*` variable is not merely wrong — it
is absent from the bundle entirely. The build goes green, the site serves, and sign-in
reports *Not configured* while the Vercel dashboard shows the variables sitting right
there. A previous host integration caused the same failure with a different pair of names
(`VITE_SUPABASE_DATABASE_URL`, `VITE_SUPABASE_ANON_KEY`), and `app/src/data/supabaseEnv.ts`
carried a fallback for them until 6 September — removed once the live production bundle
showed both compiling to `void 0`, so neither was set and the branch was dead code. **The
fix for a name mismatch is option 1 below, never another spelling in the app.**

Three ways to resolve it, best first:

1. Tell the integration the framework is **Vite**, and it provisions the `VITE_` names.
   Nothing in the repository changes and the integration keeps owning the values.
2. Set the two names by hand in the project's environment variables. Works, but it is a
   second copy of a value the integration owns, and stale after the next key rotation.
3. Widen the prefix — `envPrefix: ['VITE_', 'NEXT_PUBLIC_']` in `app/vite.config.ts` — so
   the integration's own names are read. Note what this means: **every** `NEXT_PUBLIC_*`
   variable would then be inlined into the JavaScript shipped to the browser. That is
   tolerable only because the integration prefixes exactly the two values that are safe to
   publish and never `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_JWT_SECRET`. Do not reach
   for it as a convenience.

#### 3. The Node version — now pinned in the repo

**Done, 6 September.** Vercel takes its Node version from a root `package.json`'s
`engines`, and this repository had none, so it inherited whatever the project default
happened to be. There is now a root `package.json` declaring `"node": "22.x"`, and a
`.nvmrc` beside it saying `22` so a local checkout and CI agree with the deploy.

That root `package.json` fixes a second thing: there used to be a stray root
`package-lock.json` with **no `package.json` beside it**, which was enough for Vercel to
attempt an install that could not succeed. The orphan lockfile is gone. The root
`package.json` declares no dependencies — the real `npm ci` still happens inside `app/`,
in `build.sh` — so `installCommand: ""` in `vercel.json` is still correct.

#### Speed Insights

`@vercel/speed-insights` is mounted in `App.tsx`, from the **`/react`** entry point — not
`/next`, which is what Vercel's own quickstart shows by default. Same trap as the
environment variables above: the dashboard assumes Next.js, and this is a Vite app.

It is gated on `__BUILD_HOST__`, which asks *does that endpoint exist* rather than *which
host is this*. Vercel serves `/_vercel/speed-insights/script.js`; `npm run dev` and
`npm run preview` do not, so an ungated component would put a 404 in the console and
collect nothing for it. The gate is a compile-time constant, so on a non-Vercel build
Rollup removes the component and the import with it — the string `_vercel/speed-insights`
does not appear in that bundle at all. Measured: **2,246,200 bytes with it against
2,243,807 without**, so it costs 2.4 kB where it is used and nothing where it is not.

The `route` prop groups by `/jobs/:jobNumber` and `/projects/:projectNumber` rather than by
the literal path, or the dashboard would hold one row per job number and be unable to say
anything about how the Jobs page performs. `/tools/:section` and `/setup/:section` are
deliberately left ungrouped — those are pages from a short fixed list, and telling them
apart is the point. This is about the dashboard being readable, not about withholding
anything: Speed Insights posts the full `href` regardless, and Vercel is the host, so its
access log already has every path.

The build identity reads `VERCEL_GIT_COMMIT_SHA` and `VERCEL_ENV`, so the version in the
footer says which commit it is on. See the note in `app/vite.config.ts` for the trap in that: the
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
places where Vibe's own defaults fail.

**[`DESIGN.md`](DESIGN.md) is the single design file** — every token with the contrast
decision behind it, where each value lives in `app/src/theme/`, the accessibility contract
and the board's colour rule. The July 2026 evaluation those rules came out of is kept in
[`docs/history/design-system-evaluation.md`](docs/history/design-system-evaluation.md).

`.mcp.json` wires the [Supabase MCP server](https://supabase.com/docs/guides/getting-started/mcp)
into the repo, so an MCP-capable editor can read the schema, the migrations and the advisors
against the live project. It authenticates by browser OAuth and drops in remote sessions;
do **not** add an `Authorization` header to fix that — it suppresses the OAuth challenge
and breaks interactive sessions too. This was tried and reverted.

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
