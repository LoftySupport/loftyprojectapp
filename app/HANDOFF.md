# Handoff — picking this up in a new session

Everything needed to continue the V0 build. Written when the work moved from the
prototype repo to `amberbeaumont/loftyprojectapp`.

## Where things are

| | Where | State |
| --- | --- | --- |
| Prototype (reference) | `amberbeaumont/loftyprojectboard` → https://loftyprojectboard.netlify.app | Frozen. Do not edit `index.html` |
| V0 app | `amberbeaumont/loftyprojectapp` | This repo |
| V0 site | https://loftyprojectapp.netlify.app | Live, but a **manual deploy** — not yet linked to a repo |
| Supabase | — | Not created yet |

## Two things still outstanding

**1. Link the Netlify site to this repo.** It currently serves a hand-uploaded build, so
pushes don't redeploy.

Netlify → `loftyprojectapp` → Site configuration → Build & deploy → Link repository →
`amberbeaumont/loftyprojectapp`, **base directory `app`**, build command and publish
directory **blank** so `app/netlify.toml` drives them. The Netlify GitHub App may need
org-owner approval for `LoftyGroup`.

**2. Close PR #11 on the prototype repo**, unmerged, once this repo is confirmed good.
It was only ever the transport for `app/`; the prototype repo should stay prototype-only.

## What is built

A React + Vibe app that runs with no backend: shell, routing, three themes, and the
board's eight columns rendered from the stages lookup, empty.

The important part is the **data seam** — see `README.md`. Every screen reads through one
`Repository` interface. Tables come online one at a time by replacing a single method
body; no screen changes. The **Wiring** page in the app shows which are live.

Four starter tables in `supabase/migrations/0001_core.sql`: `projects`, `jobs`,
`job_stages` (composite), `user_profiles`. Keys and relationships only — `-- + fields`
marks where the rest go once decided. Amber has the field lists.

## Design decisions not to re-litigate

All documented with the numbers behind them in `design-system-evaluation.md`:

- **Nothing below 12px.** Vibe's smallest text style.
- **`#f47e63` never carries text** — 2.6:1 on white. Use `--lofty-orange-strong` (5.3:1).
- **Sentence case, never all-caps.** Vibe has no caps style at any size.
- **Pills only on Avatar and Counter.** Everything else radius 4/8/16.
- **Cards max 300px.**
- **Every clickable thing keyboard-operable** — use Vibe's `Clickable`, not `onClick` on a div.
- Dark mode lightens the brand green to `#4db3bd`; `#005058` is 1.3:1 on Vibe's dark canvas.

`ThemeProvider` only themes 11 primary/brand tokens — everything else Lofty needs is in
`src/theme/tokens.css`.

## Next step

Phase 1 in `../react-migration.md`: stand up Supabase — schema, auth via the Microsoft
provider, RLS with the scope model — before porting any more UI. The trap to get right
first is `team_hierarchy`: a recursive CTE inside an RLS policy runs per row unless it is
wrapped in a `stable security definer` function.

Then Table view before Board — simplest view, exercises the most machinery.

## Worth doing early

Put the contrast sweep in CI. The design decisions above are documented but nothing
enforces them; in a fresh codebase someone will reach for the brand orange as a text
colour. The script pattern is in `design-system-evaluation.md` — it composites
semi-transparent layers, which is what caught the last two failures.
