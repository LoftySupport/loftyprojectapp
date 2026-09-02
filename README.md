# Lofty Job Oversight Board

The V0 build of Lofty's job pipeline board: React, Vibe and Supabase.

**Connected, and mostly empty.** 57 of the 67 repository methods read Supabase — projects,
jobs, profiles, teams, the pipeline stages and the tracker are live queries. There are
**no projects and no jobs yet**; the import is Phase B, so those boards show a designed
empty state rather than data. (Setup → Wiring counts this rather than repeating it: the
numbers here are a snapshot and that screen is generated.)

Values whose table is not built yet still render as a `{{table.column}}` token, so an
unbound field is visible rather than silently blank. Two things are genuinely not built —
`property_defs` and `pipeline_stage_tasks` — and the screens that would show them say so
instead of showing a plausible guess.

<!-- generated:shipped -->
**No release has been published yet.** See [CHANGELOG.md](CHANGELOG.md) for what is waiting.

Unreleased: 63 changes since then —
- Changed: Updates → Merged from the build reads merged pull requests from LoftySupport/loftyprojectapp, where the repository lives now
- Added: Maintenance — a tab for what homeowners report after handover: requests numbered on the job, items per trade, offers to contractors with an accept link, the thread, SLA health and warranty
- Added: Setup → Maintenance — the warranty period, offer and reminder clocks, and the trades with their SLAs
- Added: Notifications — assigned, mentioned, at risk, overdue, stage moved, working drawings changed — in the bell, by email and Teams, immediate or in a daily digest, chosen per person in Settings
- Added: Setup → Notifications — who hears what, with escalation after days late
- …and 58 more.

<sub>Generated from commit trailers by `node scripts/changelog.mjs` — do not edit inside this block.</sub>
<!-- /generated:shipped -->

Everything anyone has asked for, where it has got to and what has shipped is in the app
under **Updates** — the queue, the roadmap and the changelog, readable by everybody
signed in. In this repository the same three live in [ROADMAP.md](ROADMAP.md) and
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
| **`schema-plan.md`** | The current design and the record of how it was decided. Phase A is built; Phase C waits on the business decisions at its end |
| `data-dictionary.md` | Every property: Lofty name, definition, type, rules, relationships, status. Generated — see below |
| `app/supabase/migrations/` | 33 files, `0001`–`0033`. The database is the authority; these rebuild it |
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
template and the prototype — into `dist/`. That is what Netlify runs.

### One branch and PR per table

Each schema decision touches the migration, the types, the app and the dictionary
together, so it is reviewed as a unit rather than landing on `main` already done.

```bash
git checkout -b claude/<table>-schema
# … change all four …
cd app && npm run dictionary && npx tsc -b
git commit && git push -u origin claude/<table>-schema
```

Netlify builds a deploy preview per PR. Merge when the preview looks right.

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

## Views

Board, Table, Gantt and Calendar — the same four names on Jobs, Board and Table on
Projects. Grouping by Stage, Project, Team, Team member or Status. One date control
holding the whole range, and filters you add and remove, each arriving unset.

A job drawer with breadcrumbs, milestones, the definition-driven field slots and the
activity feed. Cards are keyboard-operable; the drawer takes focus on open and closes on
Escape.
