# Handoff: Lofty Hub job record

## Overview

The job record — the screen a project manager lives in. Three views:

| View | Id | What it is |
| --- | --- | --- |
| Drawer | 6a | 460px panel over the board; the record without leaving the list |
| Full page | 6b | 1180px two-column page; the same record with room to breathe |
| Column picker | 6c | 470px panel for choosing and filling board columns |

6a and 6b are the **same record at two widths**, not two designs. They show the same properties in the same order; the page has room to keep the conversation docked beside the record and to show every field expanded, while the drawer collapses the tail and tabs the conversation at the foot.

## About the design files

`Job Record.dc.html` is a **design reference written in HTML** — a prototype of the intended look and behaviour, not production code to lift. Recreate it in the target codebase's environment (React, Vue, SwiftUI, native) using that codebase's patterns and component library. If no environment exists yet, choose the framework that suits the product.

The file uses a small in-house template runtime (`support.js`, `<x-dc>`, `{{ }}` holes, `<sc-for>`, `<sc-if>`, `<x-import>`). Do not port any of it. Open the file in a browser: the process checkboxes, the step disclosures, the section collapses and the address form are all live.

## Fidelity

**High fidelity.** Colours, type, spacing and sizes below are measured and final.

## Design tokens

From the Lofty app design system — use the codebase's equivalents where they exist.

| Token | Value | Use |
| --- | --- | --- |
| `--lofty-foundation-black` / `--primary-text-color` | `#414042` | Body ink, completed stage fill |
| `--secondary-text-color` | `#67666a` | Property labels, meta |
| `--placeholder-color` | `#8a898d` | Empty values |
| `--lofty-finisher-white` | `#ffffff` | Cards, page |
| `--lofty-crisp-orange` | `#f47e63` | Active tab underline, progress fill, avatar |
| `--warning-color-selected` | pale yellow | At-risk pill and current stage bar |
| `--negative-color` | `#d83a52` | Blocked-by icon |
| `--lofty-flint-50` | `#f9f9f6` | Process card ground |
| `--lofty-flint-100` | `#f4f3ee` | Tab strip, banners, composer footer |
| `--lofty-flint-200` | `#e1e1d9` | Row dividers, progress track |
| `--lofty-flint-300` | `#c6c5ba` | Card and section borders |
| `--ui-border-color` | `#8a898d` | Input boundaries needing 3:1 |

**Type** — Figtree body, Montserrat titles.

| Role | Spec |
| --- | --- |
| Job title (drawer / page) | 600 16px/22px / 600 20px/26px Montserrat, -0.1px |
| Section heading | 600 14px/20px |
| Property label | 400 14px/20px, `--secondary-text-color` |
| Property value | 400 14px/20px, `--primary-text-color` |
| Meta, counts, stage readouts | 400 12px/16px |
| Tab label | 400 14px/20px (active 600) |

Nothing below 12px.

**Geometry** — 32px property row, 36px process step row, 36px tab, 28–32px field controls, 4px radius on controls, 8px on cards, 100px on pills.

## Screens

### 6a — drawer (460×860)

Flex column, three siblings: header (48px), scrolling body, docked footer. The body must scroll; the footer must not.

**Header** — breadcrumb `Jobs › 1209 › 1209-002` (12px, current crumb 600), expand-to-page and close icon buttons.

**Body** (padding 16px, 16px gap):
1. **Title row** — `1209-002 - EVANSTON PARK, 14/24 Wandoo Road`. The leading `1209` is a link to the project, marked only by a light Flint underline. Right: health pill — At risk, warning icon, `--warning-color-selected`, dark ink, 100px radius.
2. **Blocked-by banner** — 32px, 1px Flint 300 border, Flint 100 fill, negative-coloured warning icon, `Blocked by` label, reason.
3. **Job Stage** — collapsible. Header button (chevron + "Job Stage" + `Stage 2 of 5 · 22 days`). Body: five columns, each stage name above a 4px line above its date. Completed = Foundation Black; current = `--warning-color-selected` (the health colour); not started = Flint 200, with name and dash centred.
4. **Key properties** — collapsible, Flint 300 rule above, 16px padding. Rows are a `120px | 1fr` grid at 32px. Order: Current address (dropdown of current + previous addresses, with a Crisp Orange 28px `+` button that opens the add-address form beneath), Council (dropdown), Currently with (dropdown — reassigns), Next milestone, Handover date (empty date field, calendar glyph, `dd/mm/yyyy`), SharePoint folder (link + external glyph). Then **Show all** — discloses 7 more fields, empties included.
5. **Process** — collapsible, rule above. Flint 50 card, Flint 300 border, 8px radius, containing a 4px Crisp Orange progress bar and one row per step (36px): disclosure chevron, checkbox, step name, date, owner avatar. Ticking stamps today's date and opens the next step; unticking clears it. Clicking the chevron or the name expands the step's own fields as typed controls — date box with calendar glyph, dropdown for Supplier / Approval / Signed by, text box with edit glyph otherwise. Completed steps strike through in secondary ink. Foot: **Show all 9 steps**.
6. **Properties** and **Contacts & Companies** — collapsed rows with counts.

**Footer** — 12px top margin, Flint 300 top border, Flint 100 fill. Tab strip (Tasks with a count pill, Comments, Activity Log; 36px tabs, 16px padding, Flint dividers between, active tab lifted as a white card with a Crisp Orange underline), then the thread and a comment composer.

### 6b — full page (1180×860)

Same header pattern at 56px (breadcrumb, Search in this job, minimise, close), then a `1fr | 400px` grid.

**Left column** (white, padding 24/32): identical content to 6a with three differences — the property label column is 136px and every value control is a **300px box**, the tail fields are already expanded (no Show all), and the stage strip is a **connected track**: five butted segments with white hairlines, radius only on the outer ends, stage names centred inside, each with a two-line readout beneath (label dark semibold, value secondary):

| Stage | Readout |
| --- | --- |
| Acquisition & Development | Job started · Days in stage |
| Pre-construction | Started on · Days in stage |
| Construction | Target completion (or Started on once begun) · Days in stage |
| Maintenance | Open jobs · Completed jobs |
| Complete | Job completed (or Target completion) · Total days |

**Right column** (400px, white, Flint 300 left border) — the conversation docked: the same tab strip, thread and composer, always visible.

### 6c — column picker (470×700)

Header, search, a "Show only columns with values" toggle and a count line. Body groups columns (Identity, Programme, People). Each row: checkbox, column name, and **its value control on the right** — 150px, typed to the field: text box, dropdown, date box with calendar glyph, person picker. Computed and locked fields (Job number, Days in stage) show right-aligned plain text with no control. Footer: "Saved to this view only", Reset, Apply.

## Interactions

- **Section collapse** — Job Stage, Key properties, Process. All open by default; chevron rotates.
- **Process step tick** — stamps today's date, clears on untick, advances the open step. Dates remain editable afterwards.
- **Step disclosure** — chevron or step name toggles the step's fields.
- **Update / add address** — the `+` opens an inline form (Res #, Lot #, street number, street, suburb, state, postcode) plus a dropdown to reinstate a previous address. The old address is retained and stays selectable.
- **Reassign** — the Currently with dropdown.
- Row hover is a `rgba(65,64,66,.04)` wash; button press is `scale(0.95)` over 70ms; focus is the system's 3px orange ring at 50%.

## State

| State | Type | Notes |
| --- | --- | --- |
| `sections` | `{stage, key, process}` booleans | All true initially |
| `steps` | array | `{name, done, date, owner, fields[]}`; `fields` are `{label, value, type}` |
| `openStep` | index | One step open at a time |
| `addressEditing` | boolean | Shows the inline form |
| `currentAddress`, `previousAddresses` | string / array | Previous list is append-only |
| `assignee` | id | Drives Currently with |
| `activeTab` | `tasks` / `comments` / `activity` | |

Derived: progress percentage and the "N of 9 steps" summary come from the tick state, not stored separately.

## Copy rules

Sentence case throughout. Labels are nouns; buttons are verbs naming the object. Dates are dd/mm/yyyy. Empty date fields show `dd/mm/yyyy`, empty pick fields show `Select`, empty text fields show `Enter text` — never the bare word "Empty" on a field that has a type.

## Assets

Everything here is a design-system icon — use the codebase's icon component rather than these files. Copied for the prototype only: Warning, Calendar, Person, Location, Board, Folder, DueDate, ExternalPage, Doc, Edit, Item, Dependency, Activity, Collapse, CloseSmall, Fullscreen, Add, MoreBelow, Search, Settings, Checkbox and the chevrons. (`Dollar` is referenced by a removed row and is absent from the set — ignore it.)

## Files

- `Job Record.dc.html` — 6a, 6b and 6c. Open in a browser.
- `support.js` — prototype runtime, for viewing only.
- `_ds/…` — design-system tokens, stylesheet, bundle and the icons above.

## Accessibility

- Section headers are `<button>` with `aria-expanded`.
- Checkboxes need a label association to the step name.
- The tab strip needs `role="tablist"` / `role="tab"` with `aria-selected`.
- Contrast: all body ink is 4.5:1 or better. The at-risk pill uses dark ink on pale yellow; if a stage flips to overdue use `--negative-color` with white ink, and on track `--positive-color` with white ink — never Crisp Orange behind small text.
