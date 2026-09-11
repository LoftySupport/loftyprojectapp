# Handoff: Lofty Hub sidebar navigation

## Overview

The left-hand navigation shell for the Lofty Hub work-management app. It is **one sidebar with four states**, not four alternatives:

| State | Id | What it is |
| --- | --- | --- |
| Expanded | 7a | 224px rail, labelled rows |
| Expanded + hover | 7b | 7a with a 240px flyout of the hovered destination's views |
| Collapsed + hover | 7c | 64px icon rail with the same flyout |
| Collapsed | 7d | 64px icon rail, resting state |

The rail is a persistent dark shell. Content scrolls beside it; the rail does not.

## About the design files

`Sidebar Navigation.dc.html` is a **design reference written in HTML** — a prototype showing the intended look and behaviour, not production code to lift. Recreate it in the target codebase's own environment (React, Vue, SwiftUI, native) using that codebase's established patterns and component library. If no environment exists yet, pick the framework that suits the product and build it there.

The file uses a small in-house template runtime (`support.js`, `<x-dc>`, `{{ }}` holes, `<sc-for>`, `<x-import>`). None of that should be carried across — read it for structure and values only. Open the file in a browser to see all four states side by side; the rails in 7a–7c respond to clicks and hovers.

## Fidelity

**High fidelity.** Colours, type, spacing, sizes and states below are final and measured. Match them.

## Design tokens

These come from the Lofty app design system. Use the equivalent tokens in the codebase rather than the raw hex where they exist.

**Colour**

| Token | Value | Use here |
| --- | --- | --- |
| `--lofty-foundation-black` | `#414042` | Rail background, page ink |
| `--lofty-finisher-white` | `#ffffff` | Rail text and icons, card backgrounds |
| `--lofty-crisp-orange` | `#f47e63` | Avatar fill, brand mark |
| `--negative-color` | `#d83a52` | Inbox notification badge |
| `--lofty-flint-100` | `#f4f3ee` | Content ground beside the rail |
| `--lofty-flint-200` | `#e1e1d9` | Dividers inside the flyout |
| `--lofty-flint-300` | `#c6c5ba` | Flyout border |

Rail-only alpha values, all white over Foundation Black:

- Divider / border: `rgba(255,255,255,.16)`
- Row hover: `rgba(255,255,255,.12)`
- Row selected: `rgba(255,255,255,.20)`
- Muted label (eyebrows, counts): `rgba(255,255,255,.72)`

Black never sits on Crisp Orange. Selection on the dark rail is a white wash, not the peach tint used on light surfaces.

**Type** — Figtree for body (`--font-family`), Montserrat for titles (`--title-font-family`).

| Role | Spec |
| --- | --- |
| Nav row label | 400 14px/20px |
| Selected nav row | 600 14px/20px |
| Counts, meta | 400 12px/16px |
| Flyout eyebrow (`VIEWS`, `VIEW BY STAGE`) | 600 12px/16px, letter-spacing .06em, `#67666a` |
| Flyout heading | 600 18px/24px Montserrat, letter-spacing -0.1px |

Nothing below 12px.

**Spacing / geometry** — 2 / 4 / 8 / 12 / 16 / 20 scale only.

| Value | Use |
| --- | --- |
| 224px | Expanded rail width |
| 64px | Collapsed rail width |
| 56px | Rail header height (logo row) |
| 40px | Nav row height, group header height |
| 32px | Pinned row height, flyout row height |
| 44px | Collapsed rail button (square) |
| 4px | Radius on rows, buttons |
| 8px | Radius on the flyout card |
| 100px | Radius on the count badge |

Flyout shadow: `0 6px 20px rgba(65,64,66,.16)`.

## Structure

### 7a — expanded rail (224px)

Vertical flex column on `--lofty-foundation-black`, 1px `rgba(255,255,255,.16)` right border.

1. **Header** — 56px, padding `0 12px 0 16px`, bottom border `rgba(255,255,255,.16)`. Lofty wordmark in Crisp Orange at 24px tall, left. Collapse control right: 32px button, 20px `NavigationDoubleChevronLeft` glyph in white, hover `rgba(255,255,255,.12)`.
2. **Search** — 32px field, padding `12px 8px 4px`. A light input on the dark rail (white fill, dark ink) — deliberate, it is a field not a nav row.
3. **Nav** — `flex:1`, `overflow:auto`, padding `4px 8px 8px`.
   - **My work** — collapsible group, collapsed by default. 40px header row: dashboard glyph 20px, label "My work" 400 14/20 white, spacer, chevron 14px (`NavigationChevronRight` closed / `NavigationChevronDown` open). Children: **Inbox** (with a count badge) and **Tasks** (plain count), both 40px rows.
   - 1px divider, `margin:12px 4px`.
   - **Pinned** — collapsible group, collapsed by default, bookmark glyph. Children: up to five 32px pinned-project rows, each with an 8px status dot (`--lofty-crisp-orange` / `#005058` / `#b6b6ac`) and an ellipsised name.
   - 1px divider.
   - **Destinations** — six 40px rows: Projects (9), Jobs (128), Maintenance (23), Reports, Contacts, Tools. Icon 20px + 12px gap + label; count right-aligned in `rgba(255,255,255,.72)`. Projects is the selected example: background `rgba(255,255,255,.20)`, label 600.
4. **Footer** — `flex:none`, top border, padding 8px. Settings row, Admin row, then the user row (24px avatar in Crisp Orange + "Gary Patel"). Settings is manager-and-above; Admin is admin/super-admin only — gate both.

Inbox badge: 12px/16px 600 white on `--negative-color`, radius 100px, padding `2px 7px`.

Scrollbar is restyled for the dark ground — 8px wide, track Foundation Black, thumb `rgba(255,255,255,.32)` with a 2px track-coloured border, `.48` on hover. `scrollbar-width: thin` and `scrollbar-color` for Firefox.

### 7b — expanded rail + hover flyout

7a exactly, plus: the hovered destination row sits at `rgba(255,255,255,.28)` and a **240px flyout** opens to its right (`left: 232px`, top aligned to the row).

Flyout contents, in order:
1. Heading row — destination name (600 18/24 Montserrat) with a small `+ New` button on the same line.
2. 1px `#e1e1d9` divider.
3. `VIEWS` eyebrow, then the saved views as 32px rows with right-aligned counts.
4. 1px divider.
5. `VIEW BY STAGE` eyebrow, then the groupings as 32px rows with counts.

Card: white, 1px `#c6c5ba`, radius 8px, padding 8px, the shadow above.

### 7c — collapsed rail + hover flyout

64px rail, same flyout component anchored to the hovered icon (`left: 72px`).

### 7d — collapsed rail (resting)

64px rail alone. Contents top to bottom:

1. Twin-triangle mark, 26px, Crisp Orange, `margin-bottom: 6px`.
2. Search — 44px button, 20px glyph.
3. My work, Pinned — 44px buttons, 24px glyphs.
4. 32px divider, `margin: 10px 0`.
5. Six destinations — 44px buttons. Icon 24px for design-system glyphs, 28px for the Lofty PNG glyphs (they carry internal padding, so they need the extra size to read at the same weight).
6. Spacer.
7. Expand — 44×40 button, 20px double-chevron mirrored with `transform: scaleX(-1)` so it reads `»`.
8. 32px divider.
9. Settings, Admin — 44×40 buttons, 20px glyphs.
10. User avatar, 32px, Crisp Orange.

Utility controls (search, expand, settings, admin) are deliberately 20px against the destinations' 24–28px: navigation reads heavier than tooling.

Every collapsed button carries a `title` — that string is the tooltip and the accessible name.

## Interactions

- **Group headers** (My work, Pinned) toggle their section. Both start collapsed. The chevron rotates right → down.
- **Collapse / expand** swaps between the 224px and 64px rails. 7a's `«` and 7d's `»` are the same control in its two states.
- **Hover on a destination** (either width) opens the flyout for that destination after a short delay; it closes on mouse-out of both the row and the panel. Keyboard focus should open it too.
- **Click on a destination** navigates and marks it selected (`rgba(255,255,255,.20)`, label 600).
- **Row hover** is a `rgba(255,255,255,.12)` wash — never a colour change.
- Press feedback follows the design system: `scale(0.95)` over 70ms on buttons.
- Focus ring is the system's 3px orange at 50% plus a 1px inset. Do not remove it.

## State

| State | Type | Notes |
| --- | --- | --- |
| `railCollapsed` | boolean | 224px vs 64px; persist per user |
| `openGroups` | set of ids | `myWork`, `pinned`; both closed by default |
| `activeDestination` | id | Drives the selected wash |
| `flyoutFor` | id or null | Which destination's panel is showing |
| `counts` | map | Per-destination badge numbers, fetched |
| `pinned` | array, max 5 | User's pinned projects, each with a status colour |

Per-destination panel data (title, new-item label, views, group label, groups) is a single shape:

```js
{
  title: "Projects",
  newLabel: "New project",
  views:  [{ label: "All projects", count: "9" }, …],
  groupLabel: "STAGE",                       // rendered as "VIEW BY STAGE"
  groups: [{ label: "Pre-construction", count: "3" }, …]
}
```

Destinations covered in the prototype: My work, Pinned, Projects, Jobs, Maintenance, Reports, Contacts, Tools, Settings.

## Assets

- `assets/icons-lofty/*.png` — Lofty construction glyphs supplied by the client (Dashboard, Projects, Job, Maintenance, Reports, Contacts, Documents, Team, JobMeasure, Design) plus `AdminConsole.png` traced from a supplied reference. All are black-on-transparent and are rendered as **CSS masks** (`mask-image` + `background: currentColor`) so they inherit the rail's ink. Ship them as SVG in production — ask the client for vector originals.
- `assets/brand/lofty-logo-orange.png` — wordmark for the expanded header.
- `assets/brand/lofty-mark-transparent.png` — twin-triangle mark for the collapsed rail.
- Everything else (Search, Settings, Person, Location, Bookmark, Note, chevrons, Group) is a design-system icon — use the codebase's icon component, not these files.

## Files

- `Sidebar Navigation.dc.html` — the four states. Open in a browser.
- `support.js` — the prototype runtime. Needed only to view the file; do not port it.
- `assets/` — as above.

## Accessibility

- `<nav aria-label="Main">` around the rail.
- Group headers are `<button>` with `aria-expanded`.
- Collapsed buttons need an accessible name (`title` or `aria-label`) since they have no visible label.
- Contrast: all rail text is white or `rgba(255,255,255,.72)` on `#414042` — 4.5:1 and above. The Inbox badge is white on `--negative-color` at 4.5:1. Keep those pairings if you re-colour anything.
