# Build the sidebar rail and the job record drawer

Build two elements of Lofty Hub from the approved Claude Design handoff: **the sidebar
navigation rail** and **the job record slideout drawer**. Read everything under *Read first*
before writing any code.

The design is settled and high fidelity. Your job is to reproduce it faithfully in this
codebase, not to redesign it. Where the spec and the app disagree, the decisions under
*Already decided* win — they were taken on 11 September and must not be re-litigated.

---

## Read first

**In this repo**

- `CLAUDE.md` at the root — its conventions bind, especially *never fill a gap with a
  plausible value*, the `Changelog:` trailer, and the checks before opening a PR.
- `PRODUCT.md` → **Interface Must-Haves** and *the checklist for a new screen*.
- `DESIGN.md` → the colour and contrast contract.
- `app/src/shell/AppShell.tsx` and `AppShell.css` — the rail and header you are replacing.
- `app/src/components/SidePanel.tsx`, `PanelExpand.tsx`, `useResizablePanel.ts`,
  `JobDrawer.tsx` — the drawer you are replacing. Read the comments; they carry the
  reasons for behaviour you must keep (Escape handling, focus-on-open, the shared
  remembered width).

**The handoff itself**, committed beside this file:

| Path | What it is |
| --- | --- |
| [`README.md`](README.md) | The index: the ten decisions, the four corrections, the contrast bar, what is open |
| [`sidebar-navigation/README.md`](sidebar-navigation/README.md) | The rail: four states, every measurement |
| `sidebar-navigation/screenshots/7a…7d.png` | What it looks like |
| [`job-record/README.md`](job-record/README.md) | The drawer (6a), full page (6b), column picker (6c) |
| `job-record/screenshots/6a…6c.png` | What they look like |

**In Claude Design**, for anything not copied here — project
`32860179-6011-4fb8-b214-ab6fa12cd759`, read with the `DesignSync` tool
(`method: get_file`). Its `HANDOFF - next chat brief.md` is the author's own summary of the
rules learned getting these two right, and is worth reading in full.

Both READMEs state **high fidelity**: colours, type, spacing, sizes and states are final and
measured. Match them. Use the codebase's own tokens where they exist rather than the raw hex
— `app/src/design-system/tokens/` mirrors the same design system.

**Do not port the prototype runtime.** The `.dc.html` files use an in-house template runtime
(`support.js`, `<x-dc>`, `{{ }}` holes, `<sc-for>`, `<sc-if>`, `<x-import>`). None of it comes
across. Read those files for structure and values only.

**Do not use `loftybrand`'s `.jsx` components.** They exist because that project renders
without a bundler. This app uses the real `@vibe/core`, which is the more complete
implementation of the same contract.

**But do build against the design system's names for these eight patterns.** `NavRail`,
`NavFlyout`, `RecordTabs`, `RecordBreadcrumb`, `RecordDrawer`, `FieldRow`, `ProcessSteps`,
`StageTrack` (which also exports `HealthChip`) are being added to the library from this same
work. Their props are in [`component-contracts/`](component-contracts/). Matching the names
is what stops the app and the library having to be reconciled later — it is the author's own
instruction, and it is the first real test of whether a fix can land in one place instead of
thirteen.

---

## Already decided — do not re-open

These answer gaps in the handoff READMEs. They are not in those files; they are here.

| # | Decision |
| --- | --- |
| 1 | **Inbox is the old homepage dashboard.** `/dashboard` becomes Inbox and moves inside *My work*. No new table, no new feed. |
| 2 | **Tasks under My work is the old Tasks page.** `/tasks` survives unchanged — four views, saved-view tabs, bulk bar. The rail entry points at it. |
| 3 | **Pinned bookmarks any page** — a URL with a name: a filtered board, a settings screen, a job, a report. One per-user table of `{label, url}` with RLS, max five. **No status dot** — a URL has no health. Use a small icon for the kind of thing instead. |
| 4 | **The stage strip is five segments, always.** Closed and Cancelled are not segments. When a job is closed or cancelled the pipeline is no longer open and the strip freezes as it last was — a job closed thirteen months after completion keeps its completion dates; a cancelled job keeps everything as at the cancellation date, so the record still shows what was done. |
| 5 | **The stage bar carries health, not position.** At risk is yellow. Per the job-record README: overdue takes `--negative-color` with white ink, on track `--positive-color` with white ink, never Crisp Orange behind small text. |
| 6 | **Key properties are the same fixed six on jobs and projects.** No `is_key` flag, no manager configuration. Current address, Council, Currently with, Next milestone, Completion date, SharePoint folder. |
| 7 | **"Handover date" is renamed "Completion date"**, and it lives on the **job** — each job has its own. A project's completion is *derived*: when all its jobs are completed. |
| 8 | **"Currently with" is the assigned user and their team.** Internal staff only: `assigneeId` + `owningTeam`, both of which already exist on jobs and projects. It is not an external party. |
| 9 | **Both the rail flyout and the screen's saved-view tab strip stay**, doing different jobs — the flyout jumps to a view from anywhere without loading the screen; the tab strip switches once you are there and shows which one you are in. |
| 10 | **A slim top bar survives**, holding only undo/redo, Ask Lofty and the notifications bell. Search, the user menu, Settings and Admin move into the rail and must be **removed** from the header, not left to duplicate it. |

**Contrast bar — Amber, 11 September:** *"I don't care about the contrast failures with
accessibility so much. It needs to be readable but not meet full accessibility guidelines —
like Crisp Orange and white, or Flint together, are ok."* Readable is the bar, not WCAG AA.
The one measured boundary: Crisp Orange works on Flint 50 (2.49:1) and Flint 100 (2.36:1),
but **not on Flint 200 (1.99:1)**.

---

## Corrections to the handoff, found in review

1. **6a overflows at 460px.** The supplied screenshot shows a horizontal scrollbar, the
   "Currently with" control running past the card edge, and the SharePoint row clipped. A
   `120px | 1fr` grid minus 16px padding leaves ~308px for a control that must hold a name,
   a role and a chevron — and "Current address" also carries a 28px `+` button. Fix the
   geometry as you build; do not faithfully reproduce the clipping.
2. **The mockup's "Ben Sultana · Owner · Northline" is misleading example data.** Per
   decision 8 this field is staff plus team. Render it as *name · team*.
3. **Pinned rows in 7a are drawn as projects with status dots.** Per decision 3 they are
   bookmarked pages. The drawn row changes.
4. **The sidebar README claims all rail text clears 4.5:1.** Muted white on a selected row
   is 3.86:1. Inside the readable bar, so no action — do not "fix" it and do not repeat the
   claim.

**Icons are solved.** Use the 14 SVGs in
`sidebar-navigation/assets/icons-lofty-svg/`, not the PNG masks. They are traced pending the
client's vector originals, and should be replaced wholesale rather than edited when those
arrive. `sidebar-navigation/ICONS.md` is the audit.

**Keep the 24-versus-28px rule.** The SVGs deliberately hold the glyphs inside a 3–21 box on a
24 grid, so their internal padding survives and a Lofty glyph still needs 28px where a
design-system one needs 24px to read at the same weight. *"Do not re-crop them."*

---

## Build order

1. **The rail**, both widths and all four states — 224px expanded, 64px collapsed, the
   240px flyout at either width, hover and keyboard, collapse persisted per user. Every
   destination is a route that already exists.
2. **Pinned** — the table, its policy, and the rail section.
3. **The frame** — the slim top bar, and the removal of search, user, Settings and Admin
   from the header.
4. **The job drawer (6a)** and **full page (6b)**. They are the same record at two widths,
   not two designs: same properties, same order.
5. **The column picker (6c)** — new; nothing in the app corresponds to it.

Stop after each and show the result before moving on.

---

## Conventions that bind

- **No component imports the Supabase client.** Everything reads through
  `app/src/data/repository.ts`. Add a method rather than reaching around it.
- **RLS is the security boundary.** The `can()` checks hide controls; they are not security.
  The Pinned table needs a policy, and Settings (manager+) and Admin (admin+) in the rail
  need gates that match the database.
- **Every change carries a `Changelog:` trailer** — `Added:`, `Changed:`, `Fixed:`,
  `Removed:`, or `Changelog: skip`.
- **Never edit a generated file by hand** — `CHANGELOG.md`, the ticks in `ROADMAP.md`, the
  `<!-- generated:shipped -->` blocks, `docs/schema/data-dictionary.md`.
- Before opening a PR:
  ```bash
  cd app && npm run lint && npm run typecheck && npm run build
  cd app && npm run responsive      # a screen's layout changed
  app/supabase/verify/check.sh      # if a migration changed
  ```

---

## Verify what you build, with pictures

The repo has a browser harness that is never asked for an image. `app/scripts/responsive.mjs`
builds the app with a signed-in stub, serves it, and drives Chromium across 35 routes at 5
widths. It asserts two things and throws the page away.

**Add screenshots to it**, and a 1440 width, as the first thing you do. Every defect this
project has shipped — full-width filter rows, a raw `{{token}}` on a card, unreadable text —
was invisible in a diff and obvious in a picture. Then use it to show the rail and the drawer
at every width, before and after.

Chromium is at `/opt/pw-browsers/chromium`. Do not run `playwright install`.

---

## Two things still open

- **Is the job's completion date the one being aimed at, or the one it finished on?** That
  it lives on the job is settled — each job has its own, and a project's completion is
  derived from when all its jobs are completed. Which date it is decides the column:
  `projects` already separates `project_target_completion` (worked towards, drives the Gantt
  and the overdue calculation) from `project_end_date` (actually finished), and the handoff
  shows a job's date being set in advance and replaced by the actual. **The only schema
  change in the package.** Confirm before writing the migration.
- **How the rail gets its counts.** Projects 9, Jobs 128, Maintenance 23, plus a count on
  every flyout row. The repository has no aggregate method and the rail is on every screen.
  Default to one `rail_counts` view returning every number in one row; ask if unsure.

Ask about these one at a time, in the chat, and record the answers in
`docs/open-questions.md` the same session — a decision that exists only in a chat log has to
be made again.

---

## Context, if you want the background

Three pages explain how the app's design drifted and what the rules are now. None is required
reading to build, but the third is the one to skim:

- Why Lofty Hub Got Messy — https://claude.ai/code/artifact/5b0b5b44-0b52-48be-b234-098ed7b15726
- The Element Register — https://claude.ai/code/artifact/d46f48ba-8f0b-4409-b35f-235e8ce93dec
- Handoff Review — https://claude.ai/code/artifact/263b5b2b-75ba-4b85-8dfb-7a4a80bcd081

The one sentence worth carrying: **every rule so far has been written as a behaviour, which
each screen then satisfied its own way — 8 sort implementations, 37 header idioms, 13
hand-built filter rows.** Build these two as components with one implementation each, and
check them with the harness, or the next screen will invent a fourteenth.
