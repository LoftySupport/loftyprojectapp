> ## Superseded as the design reference — kept as the record
>
> The single design file is now [`DESIGN.md`](../../DESIGN.md) at the repository root.
> **This page describes the prototype** (`prototypes/prototype.html`, a single static HTML
> file), evaluated in July 2026, before the React build existed. Its measurements and its
> reasoning are why the rules in `DESIGN.md` are what they are — that is what it is kept
> for. Where the two disagree about what the app does today, `DESIGN.md` and the code in
> `app/src/theme/` are right and this is history.

# Lofty Job Oversight Board — UX evaluation against Vibe

**Standard:** [Vibe](https://vibe.monday.com), monday.com's design system
**Subject:** `index.html`, the Job Oversight Board prototype
**Date:** July 2026
**Scope:** UI and UX only. No functionality, data model or interaction logic was changed.

---

## How Vibe was consulted

Vibe publishes an MCP server. It is now wired into this repo:

```json
// .mcp.json
{ "mcpServers": { "vibe": { "command": "npx", "args": ["-y", "@vibe/mcp"] } } }
```

Any MCP-capable editor (Cursor, VS Code, Claude Code) picks this up from the repo root. The
server exposes seven tools; the ones that mattered here were:

| Tool | Used for |
| --- | --- |
| `list-vibe-tokens` | The colour, spacing, radius, motion and typography tokens |
| `list-vibe-public-components` | The 105 components Vibe ships, to know what each surface *should* be |
| `get-vibe-component-metadata` | Component APIs and prop-level behaviour |
| `get-vibe-component-accessibility` | Per-component a11y requirements |
| `list-vibe-icons` | The 270-icon library |

Token values were also cross-checked directly against `@vibe/style`
(`typography.scss`, `spacing.scss`, `border-radius.scss`, `motion.scss`, `borders.scss`,
`themes/light-theme.scss`) and component geometry against `@vibe/core`, so every number in
the rebuilt stylesheet traces to a real Vibe source file rather than an approximation.

---

## What was kept

Per the brief, three things are Lofty's and stayed:

- the logo (`lofty_logo_orange.png`)
- **Lofty orange** `#f47e63`
- **Lofty green** `#005058`

Everything else now comes from Vibe. The two hero colours occupy Vibe's `--primary-*` slots
in place of Vibe's blue `#0073ea`, so they drive primary buttons, selection states, focus
rings, links, the phase ramp and the top bar — they carry *more* of the interface than
before, not less.

One correction was needed. `#f47e63` is **2.6:1 on white**, below the 3:1 a UI indicator
needs and well below the 4.5:1 text needs. Rather than dilute it, it keeps its hero role
(logo, top-bar rule, decorative fills, the "Dummy data" badge) and a darker sibling —
`--lofty-orange-strong #b8482a`, **5.3:1** — does the work that has to be legible on its
own: the Gantt "today" line, mention markers, the current-department rule.

---

## The evaluation

### 1. Type — 26 sizes where Vibe has 6 · **fixed**

The sheet used 26 distinct font sizes, including half-pixel steps (`9.5px`, `10.5px`,
`11.5px`, `12.5px`, `13.5px`, `15.5px`) that no system defines and no reader can
distinguish. Vibe's ramp is six sizes with a fixed line height for each: 12/16, 14/20,
16/22, 18/24, 24/30, 32/40.

Worse, **the app's most common text sizes were 9.5–11.5px** — the column eyebrow, the
status chips, the phase numbers, the activity lines, the table headers, the tags. Vibe's
smallest text style is 12px. Everything below that was rounded up.

Line height was equally loose: 13 different ratios, several unpaired with their size.

| | Before | After |
| --- | --- | --- |
| Font sizes | 26 | **7** (Vibe's 6 + one 48px display step for the dashboard hero figure) |
| Line heights | 13 | **5** |
| Text below 12px | pervasive | **none** — verified across all 7 pages in the browser |

Typeface changed from Onest to Vibe's own pairing: **Figtree** for body, **Poppins** for
headings.

### 2. All-caps micro-labels · **fixed**

25 rules set `text-transform: uppercase` with letter-spacing, at 9.5–11px. That is the
single most damaging pattern in the old sheet: caps at 9.5px with positive tracking is the
hardest combination to read at speed, and it was used on exactly the things people scan
fastest — status ("ON TRACK"), phase eyebrows, table headers, the tag chips.

**Vibe has no all-caps text style at any size.** Its Label and Text components are sentence
case. All 25 rules were removed; the underlying strings were already sentence case
("On track", "At risk", "Stalled"), so the labels read correctly with no copy changes.

Arbitrary letter-spacing (`-0.055em` … `0.08em`) was removed too, in favour of Vibe's own
heading tracking (`-0.5px` h1, `-0.1px` h2/h3).

### 3. Spacing — 23 values, no scale · **fixed**

Padding, margin and gap used 23 values including 1, 3, 5, 7, 9, 11, 13 — arbitrary numbers
that make vertical rhythm impossible to hold. Vibe's scale is 2/4/8/12/16/20/24/32/40/48/64/80.

Every spacing value was rounded to the nearest step: **23 → 10 values, all on Vibe's scale.**

### 4. Radius — 14 values where Vibe has 3 · **fixed**

`3, 4, 5, 6, 7, 8, 9, 10, 12, 16, 18, 20, 26, 999`. Vibe has three: small 4, medium 8,
big 16 — plus a full pill, which it uses on **Avatar and Counter only**.

The prototype used pills for buttons, status chips, tags, filters, hints, badges, progress
tracks and the notification count — nine different component families all wearing the one
shape Vibe reserves for two. **14 → 4 values**, and the pills were squared off to match
Vibe's Chips (4px) and Label (4px).

### 5. Motion — off-curve · **fixed**

Four durations (`0.15s`, `0.16s`, `0.2s`, `0.25s`), all with the browser default `ease`.
Vibe defines productive motion (70/100/150ms) and expressive motion (250/400ms) with four
named cubic-béziers. Every transition now uses a Vibe duration and a Vibe curve.

`prefers-reduced-motion: reduce` was not honoured anywhere. It is now.

### 6. Elevation — 16 bespoke shadows · **fixed**

Sixteen hand-mixed `rgba` shadows, several tinted teal (`rgba(0,40,44,…)`) and one tinted
coral. Vibe has four: xs, small, medium, large. All sixteen were mapped onto those, and
elevation is now reserved for things that genuinely float — modal, drawer, assistant dock,
menus. Panels and cards separate with a 1px `--layout-border-color`, as Vibe does.

### 7. Focus and keyboard access — **the most serious finding** · **fixed**

Two compounding problems:

**a. No visible focus on most controls.** `outline: none` appeared in 8 rules. Most
substituted a `0 0 0 3px` glow in a pale tint too faint to see against the field it sat on;
the top navigation, sub-navigation tabs, drawer tabs, cards and every list row had no focus
style at all. A keyboard user could not tell where they were.

**b. 126 controls on the board view alone could not be reached by keyboard.** Job cards, project cards,
dashboard cards, notification items, push-to-jobs rows, Gantt rows, table rows and
drill-down rows are `div` and `tr` elements with click handlers. No `tabindex`, no `role`,
no Enter/Space handling. Vibe routes every clickable element through
`Clickable`/`useClickableProps`, which supplies exactly those three things.

Both are fixed:

- One global `:focus-visible` rule gives every control Vibe's 2px primary-colour ring,
  switching to white inside the dark top bar and the assistant dock header.
- A small script at the end of the file finds every clickable surface — inline `onclick`
  plus the eleven classes that bind with `addEventListener` — and retrofits `tabindex="0"`,
  a `role` (rows keep row semantics) and Enter/Space activation. It runs on a
  `MutationObserver`, so it survives every re-render. **Verified in the browser: the count
  of enhanced controls matches the count of clickable surfaces exactly, page for page —
  126 on the board, 134 with every page rendered, 76 on Projects. Pressing Enter on a
  focused job card opens the job drawer.**

  This deliberately does not touch the ~40 render functions or any handler. Nothing about
  what a click *does* changed — only what can trigger it.

### 8. Colour contrast · **fixed**

Every foreground/background pair in the file was measured. Findings:

| Pair | Was | Now |
| --- | --- | --- |
| Muted body text on soft surface | `#6d7b7e` on `#f7fafa` = **4.2:1** ✗ | Vibe `#676879` on `#f6f7fb` = **5.1:1** ✓ |
| "On track" chip | `#2c6e42` on `#eaf4ed` = 5.9:1 ✓ | `#005c35` on `#bbdbc9` = **5.5:1** ✓ |
| Phase strip, site side | white on `#e8a184` = **2.1:1** ✗ | white on `#b0563a` = **5.0:1** ✓ |
| Phase strip, site side | white on `#ee8f72` = **2.4:1** ✗ | white on `#a04a2e` = **6.0:1** ✓ |
| Team mark glyph | `#f47e63` on `#fef2ef` = **2.3:1** ✗ | `#b8482a` on `#fdeee9` = **4.7:1** ✓ |
| Gantt "today" line | `#f47e63`, **2.6:1** ✗ (below the 3:1 for UI) | `#b8482a`, **4.9:1** ✓ |

Note that Vibe's own `-selected` tints paired with their base colour do **not** clear 4.5:1
(`--positive-color` on `--positive-color-selected` is 3.2:1; negative is 2.9:1). Vibe uses
those pairs on Label, where the text is short and the component is not the sole carrier of
meaning. Because this app leans on status colour heavily, three darker inks were derived —
`--positive-ink`, `--negative-ink`, `--warning-ink` — as the darkest member of each Vibe
family that clears 4.5:1 on its own tint.

**Result: an automated sweep across all seven pages in a real browser reports zero
contrast failures and zero text below 12px.** (Two flagged items are false positives from
semi-transparent overlays on the dark header, both above 4.9:1 when composited.)

### 9. The phase colour ramp · **rebuilt, concept kept**

The eight-phase ramp — green for the four office phases, orange for the four site phases,
with the green→orange crossing marking the handover to site — is a genuinely good idea and
it is built from the two hero colours. It was kept.

It was, however, unusable on the site side: white labels sat on `#e8a184` (2.1:1) and
`#ee8f72` (2.4:1). All eight steps were rebuilt as Vibe-shaped colour triples
(strip / ink / tint). Every step now clears 4.5:1 both for white-on-strip and ink-on-tint,
and the green→orange progression is more legible than before, not less.

Health status now uses Vibe's semantic colours directly — positive, warning, negative — so
a column strip and the chips inside it are the same colour.

### 10. Component inconsistency · **fixed**

The prototype had grown roughly **20 bespoke button shapes, 18 chip shapes and 9 input
shapes**, at sizes Vibe does not have. Each was mapped onto its Vibe counterpart using that
component's real measurements:

The job-panel rework merged from `main` (#8) brought its own new surfaces — the project
chip, the "Ask about this job" callout, the unified activity feed and the collapsible
property groups. Those were mapped too: the chip onto Chips, the callout onto AttentionBox
with a Button small, the feed tags onto Label, and the `<details>` disclosure onto
ExpandCollapse.

| Vibe component | Spec applied |
| --- | --- |
| Button | radius-small; xs 24 / small 32 / medium 40 / large 48; kinds primary, secondary, tertiary; negative colour variant |
| IconButton | 32px square, radius-small, hover on `--primary-background-hover-color` |
| Chips | 24px tall, 4px radius, `0 8px` |
| Label | `2px 8px`, 4px radius, text3-medium, sentence case |
| Counter | pill — the one badge shape Vibe rounds fully |
| TextField / Dropdown / TextArea | 32px tall, 4px radius, `--ui-border-color`, hover darkens the border, focus swaps it to primary |
| Checkbox | 16px, primary accent |
| Table | 40px header row, 12px cell padding, `--primary-background-hover-color` on row hover |
| Tabs | 40px tall, 2px bottom rule in primary when selected |

Touch targets were the practical casualty of the old sizing: the column expand button was
22px, drawer icon buttons 28px, checkboxes 13–14px. All are now ≥24px, most 32px.

### 11. Two visual languages in one app · **fixed**

The personal dashboard ran a deliberately different language from the working pages — 20px
radii against 12, radial gradient washes, drop shadows instead of borders, and one
saturated gold gradient card. The working pages were crisp and bordered.

Vibe is one system across a product. The dashboard now uses the same surface treatment as
every other page, and the one saturated block is now Lofty green (`--primary-color`), which
makes it a hero colour rather than an unexplained gold.

---

## Follow-up: the rest of the catalog

The evaluation above covered the foundations and the components the app already had a
surface for. A second pass completed the catalog — all 8 foundations and all 63
components. See `vibe-catalog-status.md` for the component-by-component status. In
summary:

- **Icons.** 67 real Vibe icons inlined from `@vibe/icons` (MIT), replacing every emoji
  and text glyph across 37 call sites. This was an accessibility fix as much as a
  cosmetic one — the glyphs could not be named by a screen reader.
- **Text, Heading, TextWithHighlight, Box, Flex.** The tokens were already applied; these
  add the component layer, so new UI no longer needs a bespoke rule. Search results now
  mark the substring they matched.
- **Toggle, Tooltip, Toast, AlertBanner.** Toggle replaced the checkboxes in Settings'
  notification matrix. Tooltip replaced all 15 native `title` attributes. Toast confirms
  the four actions that used to happen silently. AlertBanner carries the prototype notice.
- **ThemeProvider.** Light, dark and black, switchable in Settings, remembered in
  `localStorage`, defaulting from `prefers-color-scheme`. Dark needed two departures from
  Vibe's own values, both documented in the stylesheet: Lofty green is 1.3:1 on Vibe's
  dark canvas so it lightens to `#4db3bd`, and Vibe's dark `--secondary-text-color` is
  4.38:1 on its own grey so it lifts to `#a8abb8`.
- **Accessibility, completed.** Skip link, `banner`/`nav`/`main`/`contentinfo` landmarks,
  an `aria-live` region announcing filter results, and a focus trap in the modal and
  drawer — the four items this evaluation originally listed as missing.

Building dark mode surfaced two real bugs in the light theme that no amount of looking
would have found: the compatibility aliases were declared on `:root`, so they resolved
against the light theme once and could never see a theme class on `<body>`; and 79
hardcoded `#fff` values were pinning surfaces to white regardless of theme.

## Still not addressed

- **React components.** This is a single static HTML file. Vibe's actual components are
  React, and adopting them means rebuilding the app. What was done instead is to apply
  Vibe's *system* — its tokens, ramps, geometry, themes and accessibility contract — to
  the existing markup. Every value traces to a Vibe source file. **The React build is the
  next step** — `react-migration.md` has the plan.
- **Dropdown** is still a native `<select>` styled to Vibe's field geometry. Vibe's
  Dropdown has search, multi-select and grouping. A native select is the more accessible
  choice for a prototype, but it is not the component.
- **26 components are available but unused** — Loader, Skeleton, Slider, Combobox and the
  rest. They are built to spec; the prototype simply has no surface that needs them.
- **The UX writing pass is partial.** New copy follows the handbook; the ~400 strings that
  predate this work have not been reviewed against it.
- **The fake SharePoint popup** keeps its Microsoft-style styling on purpose; it is
  imitating an external system, not part of the Lofty UI.

## One bug fixed along the way

`renderTable` emitted 11 `<td>` cells against a 12-column header — the "Project" column had
no cell — so every column in the table view was shifted one to the left and mislabelled
(the "Team" heading showed people, "Assignee" showed types). This predates the branch. The
missing cell was added. It is a display defect, not a behaviour change.

---

## Summary

| | Before | After |
| --- | --- | --- |
| Font sizes | 26 | 7 |
| Line heights | 13 | 5 |
| Spacing values | 23 | 10 |
| Border radii | 14 | 4 |
| Distinct shadows | 16 | Vibe's 4 (+ focus rings) |
| Motion durations | 4 ad-hoc, `ease` | Vibe's 5, Vibe's curves |
| All-caps rules | 25 | 0 |
| Text below 12px | pervasive | 0 |
| Contrast failures | several, incl. 2.1:1 | 0, across all 3 themes |
| Keyboard-unreachable controls | 126 on the board view | 0 |
| `prefers-reduced-motion` | ignored | honoured |
| Emoji / glyph icons | 37 call sites | 0 — 67 real Vibe icons |
| Native `title` tooltips | 15 | 0 — Vibe Tooltip |
| Themes | light only | light, dark, black |
| Landmarks, skip link, live region, focus trap | none | all four |
| Vibe foundations implemented | 0 of 8 | 8 of 8 |
| Vibe components implemented | 0 of 63 | 63 of 63 |
