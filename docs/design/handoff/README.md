# Design handoff — the rail and the job record

**The approved design for Lofty Hub's frame and its job record, as handed over on
11 September 2026.** Two packages, both marked *high fidelity* by their author: colours,
type, spacing, sizes and states are final and measured.

Start at [`BUILD-BRIEF.md`](BUILD-BRIEF.md) — it carries everything needed to build these,
including the decisions below and the corrections found in review.

| Package | What it specifies |
| --- | --- |
| [`sidebar-navigation/`](sidebar-navigation/) | The left rail — one sidebar in four states: expanded 224px, collapsed 64px, and a 240px flyout at either width |
| [`job-record/`](job-record/) | The job record — the 460px drawer (6a), the 1180px full page (6b), and the column picker (6c) |

Each holds its own `README.md` (the specification), a `.dc.html` design reference, and the
screenshots. The design project these came from is
`32860179-6011-4fb8-b214-ab6fa12cd759`, readable with Claude's `DesignSync` tool; its
`HANDOFF - next chat brief.md` is the author's own summary of what was settled and why.

## Two things the `.dc.html` files are not

**They are not production code.** They use an in-house template runtime — `support.js`,
`<x-dc>`, `{{ }}` holes, `<sc-for>`, `<sc-if>`, `<x-import>`. None of it comes across. Read
them for structure and values; build in this codebase's own patterns with `@vibe/core`.

**They are not the design system.** That is
[Lofty's App Design System](https://claude.ai/design/p/491d6888-cf3b-4d56-bdaa-4ac8a6948e99),
mirrored into `app/src/design-system/tokens/`. Where a package names a raw hex, use the token.

## The decisions, 11 September

These answer gaps in the two READMEs. **They are not in those files; they are here**, and
they are also in [`../../open-questions.md`](../../open-questions.md) under *Answered*, which
is the authority.

| # | Decision |
| --- | --- |
| 1 | **Inbox is the old homepage dashboard.** `/dashboard` becomes Inbox and moves inside *My work*. No new table, no new feed |
| 2 | **Tasks under My work is the old Tasks page.** `/tasks` survives unchanged — four views, saved-view tabs, bulk bar |
| 3 | **Pinned bookmarks any page** — a URL with a name. One per-user table of `{label, url}` with RLS, max five. **No status dot**; a URL has no health |
| 4 | **The stage strip is five segments, always.** Closed and Cancelled are not segments — the strip freezes as it last was, so the record still shows what was done |
| 5 | **The stage bar carries health, not position.** At risk is yellow; overdue `--negative-color`, on track `--positive-color`, never Crisp Orange behind small text |
| 6 | **Key properties are the same fixed six on jobs and projects** — no `is_key` flag, no manager configuration |
| 7 | **"Handover date" is renamed "Target completion date"**, which is what 6b's own stage readouts already say |
| 8 | **"Currently with" is the assigned user and their team** — `assigneeId` + `owningTeam`, internal staff, not an external party |
| 9 | **Both the rail flyout and the screen's saved-view tab strip stay**, doing different jobs |
| 10 | **A slim top bar survives** for undo/redo, Ask and the bell. Search, user, Settings and Admin move into the rail and come *out* of the header |

## Corrections found in review

The packages are sound; these four are places where a faithful build would reproduce a fault
or a misreading.

1. **6a overflows at 460px.** The supplied screenshot shows a horizontal scrollbar, the
   "Currently with" control past the card edge and the SharePoint row clipped. Fix the
   geometry rather than reproducing it.
2. **"Ben Sultana · Owner · Northline" is misleading example data** — it reads as an
   external company. Per decision 8 the field is *name · team*.
3. **Pinned rows in 7a are drawn as projects with status dots.** Per decision 3 they are
   bookmarked pages, so the drawn row changes.
4. **The sidebar README claims all rail text clears 4.5:1.** Muted white on a selected row
   is 3.86:1 — inside the readable bar, so no action, but do not repeat the claim.

## The contrast bar

Amber, 11 September: *"I don't care about the contrast failures with accessibility so much.
It needs to be readable but not meet full accessibility guidelines — like Crisp Orange and
white, or Flint together, are ok."*

Readable is the bar, not WCAG AA. The measured boundary: Crisp Orange works on Flint 50
(2.49:1) and Flint 100 (2.36:1), **not on Flint 200 (1.99:1)**.

## What is still open

- **Does a job carry its own target completion date?** Projects have `targetCompletion`;
  jobs have no date column beyond `stageEnteredAt`, and 6b shows one on a job. The
  recommendation is a nullable `target_completion` on the job, displaying the project's
  until set. **The only schema change in the package.**
- **How the rail gets its counts.** The repository has no aggregate method and the rail is
  on every screen. One `rail_counts` view returning every number in one row is the default.

Both are in `open-questions.md`. Neither blocks starting.
