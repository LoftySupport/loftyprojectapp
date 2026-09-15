# Lofty Hub — brief for the next chat

Start here. This is the state of the work, the rules we settled by getting the job record (6) and the sidebar (7) right, and what to do next.

## Where to start

**Build the frame first.** The shell — sidebar, top bar, content region, and how a record opens inside it — then refine the screens inside that frame. Everything below is already decided; don't re-litigate it.

## Files

| File | What it holds |
| --- | --- |
| `Lofty Hub Mockups.dc.html` | Turn 3 — sidebar 7a–7d. Turn 2 — job record 6a–6c. The live working file. |
| `screens/` | One file per round-one screen: 2a, 2b new job; 3a, 3b projects; 4a reports; 5a, 5b settings |
| `Archive - Round one 1a-1c.dc.html` | Superseded drawer explorations |
| `design_handoff_sidebar_navigation/` | Sidebar package — HTML, tokens, icons, screenshots, README |
| `design_handoff_job_record/` | Job record package — same shape |
| `Design Check.dc.html` | Earlier audit of measured values |

Design system: **Lofty's App Design System**, bound at `_ds/lofty-s-app-design-system-…/`. Load the bundle in every file; compose from its components rather than restyling raw HTML.

## The shell, as settled

One sidebar, four states — not four options.

- **Expanded** 224px. Header (56px) with the orange wordmark and a `«` collapse. Search. Then My work (collapsed group: Inbox, Tasks), rule, Pinned (collapsed group, up to 5), rule, then the destinations: Projects, Jobs, Maintenance, Reports, Contacts, Tools. Footer: Settings, Admin, user.
- **Collapsed** 64px. Mark, search, the same destinations as 44px icon buttons, `»` expand, Settings, Admin, avatar.
- **Hover, either width** opens that destination's views as a 240px flyout — heading + `+ New`, rule, `VIEWS`, rule, `VIEW BY <GROUP>`. Same component both widths.

Rail is Foundation Black with white ink. Selection is a 20% white wash; hover 12%; rules 16%. Settings is manager-and-above, Admin is admin-only — gate them.

## Rules we learned the hard way

**Colour**
- Crisp Orange is a **fill**, never ink on light and never behind 12px text. When a small element needed emphasis we used Foundation Black fill + white ink, or `--negative-color` for the inbox badge.
- Selection on dark ≠ selection on light. The peach tint is for light surfaces; dark uses a white wash.
- Status carries the health colour: the current pipeline stage takes the same yellow as the At risk pill, so the two read as one signal.
- Every colour comes from a token. The only hardcoded values left are the rail's white alphas.

**Type**
- The scale is 12 / 14 / 16 / 18 / 24 / 32. We twice drifted to 10px and 11px and had to pull it back — there is no step below 12px.
- Labels are `--secondary-text-color` regular; values are `--primary-text-color`. On the pipeline readouts the user wanted this inverted — label dark semibold, value light — because the label is the thing you scan for.

**Fields**
- One row system: label column (120px drawer / 136px page), value inline, 32px row.
- A field with a type shows its control, not the word "Empty" — empty date is a date box reading `dd/mm/yyyy`, empty pick is `Select`, empty text is `Enter text`.
- In a column of controls, every control is the same width and height. Mixed 300px / 318px / 376px boxes read as broken; `box-sizing: border-box` and one width fixes it.
- Values live in one place. Anything that belongs to the project (division, site manager, OTR…) does not repeat on the job.

**Process**
- A step is a checkbox row with a disclosure chevron. Ticking stamps today's date and opens the next step; the date stays editable.
- The step's own fields open beneath it as typed controls.
- Progress and the "N of 9" summary derive from the ticks — never stored twice.
- The card header carries "Started on … · N days ago" and a health chip. We had that twice on the page once; one instance only.

**Icons**
- The client's PNG glyphs are rendered as CSS masks so they inherit ink. They carry internal padding, so they need 28px where a design-system SVG needs 24px to look the same weight.
- Stroke weight must match across the set. Measured as ink coverage at render size, the set sits at 0.18–0.22; anything outside reads wrong. Two hand-traced glyphs had to be redrawn to land in that band.
- Prefer a design-system glyph over a custom one whenever one exists (Settings, Person, Location, Bookmark, Search).
- Utility controls (search, expand, settings, admin) sit at 20px against the destinations' 24–28px, so navigation reads heavier than tooling.

**Structure**
- Sections (Job Stage, Key properties, Process) are collapsible, open by default, separated by a 1px Flint 300 rule with 16px of air.
- A drawer is header / scrolling body / docked footer — three flex siblings. If the footer ends up inside the scroll region the tabs scroll away, which defeats the pattern.
- Tabs need delineation: 36px, 16px padding, dividers between, the active one lifted as a white card with a Crisp Orange underline on a Flint 100 strip.

**Copy**
- Sentence case. Labels are nouns, buttons are verbs. Dates dd/mm/yyyy.
- Job title format: `1209-002 - SUBURB, Res/StreetNo Street` — e.g. `1209-002 - EVANSTON PARK, 14/24 Wandoo Road`. The first four digits are the project and link to it, marked only by a light underline.
- Breadcrumb is three levels: Jobs › project › job.

## Working notes

- Verify after every change; the background verifier has caught real defects every few rounds — clipped controls, dead links, contrast failures, half-applied replacements.
- Blanket string replacements across the file are the main source of regressions. Scope them to a section.
- Screenshots of mask-based icons need the masks swapped to `<img>` first; the capture pipeline doesn't render `mask-image`.

## Open

- The sidebar has not been fitted to 3a, 4a and 5a yet — those screens still carry the old eight-destination rail.
- No top bar has been designed as a component; 6b's 56px bar is the only version and it assumes an app header sits above it.
- `assets/icons-lofty/Design.png` and `JobMeasure.png` are imported but unused — no Drawings destination exists yet.
- Icon set should be re-supplied as SVG before build.
