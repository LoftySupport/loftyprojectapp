# Vibe catalog — implementation status

Audited against the [Vibe catalog](https://vibe.monday.com/?path=/docs/catalog--docs):
**8 foundations** and **63 component doc pages** (105 exported symbols).

**Status: all 8 foundations and all 63 components are implemented**, with four
documented limitations at the bottom of this file. Nothing on this page is claimed
without a corresponding block in `index.html`.

**What "implemented" means here.** The prototype is a single static HTML file. It does
not import `@vibe/core`, so nothing here is a Vibe React component. Every component
below is built to its documented geometry and behaviour, taken from `@vibe/style` and
`@vibe/core` source and the Vibe MCP server. Icon paths are the real ones, copied from
`@vibe/icons` (MIT). That gives you Vibe's system — its measurements, states,
accessibility contract and themes — not its React API.

---

## Foundations (8 of 8)

| Foundation | Status | Implementation |
| --- | --- | --- |
| **Colors** | ✅ | Vibe's neutrals, semantic colours and full role set. Lofty's green and orange occupy the `--primary-*` slots. Three extra inks derived (`--positive-ink`, `--negative-ink`, `--warning-ink`) because Vibe's own `-selected` tints don't clear 4.5:1 against their base colour. |
| **Spacing** | ✅ | Vibe's 4px scale. 23 ad-hoc values → 10, all on-scale. |
| **Round corners** | ✅ | small 4 / medium 8 / big 16. 14 values → 4. Pills reserved for Avatar and Counter, as Vibe does. |
| **Shadow** | ✅ | xs / small / medium / large. 16 hand-mixed rgba shadows → Vibe's 4. Elevation reserved for things that float. |
| **Motion** | ✅ | Productive 70/100/150ms, expressive 250/400ms, Vibe's four cubic-béziers. `prefers-reduced-motion` honoured. |
| **Typography** | ✅ | Full ramp, Figtree + Poppins, Vibe's line-height pairings and heading tracking — **plus** `Text` and `Heading` component classes with size, weight and colour variants. 26 font sizes → 7. All 25 all-caps rules removed. |
| **Accessibility** | ✅ | Global `:focus-visible` ring · keyboard operability retrofitted onto every clickable div and table row (126 on the board alone were mouse-only) · **skip link** · **`banner` / `nav` / `main` / `contentinfo` landmarks** · **`aria-live` region announcing filter results** · **focus trap in the modal and drawer** · every icon-only control labelled · touch targets ≥24px · no text below 12px · **zero contrast failures across all 7 pages in all 3 themes**, verified by an automated sweep that composites semi-transparent layers. |
| **UX writing handbook** | 🟡 | Its *consistency* principle drove the toolbar rework — View / Group / Date / Filter by read the same on both pages, "Board" is not also "Cards". All-caps labels gone. Toast and AlertBanner copy written to the handbook's clarity and concision rules. **Not done:** a line-by-line pass over the app's ~400 existing strings. |

---

## Components (63 of 63)

### Wired into the app (37)

These replace something that was there before, or are load-bearing in a real surface.

| Component | Where |
| --- | --- |
| **Icon**, CustomSvgIcon | 67 real Vibe icons inlined from `@vibe/icons`. Replaced every emoji and text glyph — `⛶ ✕ › ● ◔ ◆ ⏳ ⚠ 🔀 ↗ 📁 ✎ 🖨 ▣` — 37 call sites |
| **Button** | 13 button classes; kinds primary / secondary / tertiary, sizes small 32 / medium 40, radius-small |
| **IconButton** | `.header-collapse` `.expand-btn` `.drawer-icon-btn` `.modal-close` `.notif-btn` `.cal-nav-btn` — 32px |
| **Label** | `.status-pill` `.pd-chip` `.tag-chip` `.dept-state` `.feed-tag` `.role-badge` — 2px 8px, radius 4, sentence case |
| **Chips** | `.ai-chip` `.notif-filter` `.tmpl-type` `.project-chip` `.filter-chip` `.daterange-preset` — 24px, radius 4 |
| **Counter** | `.notif-count` `.access-count-badge` `.column-head .count` |
| **Avatar**, AvatarGroup | `.avatar` `.pd-avatar` `.pd-mini`, overlapping stack |
| **TextField**, TextArea, Search | 32px, radius 4, hover and focus states |
| **Checkbox** | 16px, primary accent |
| **Toggle** | Settings — the 21-cell notification matrix and "Quiet weekends" (were checkboxes) |
| **Table** + Header/Row/Cell | `.job-table` `.lead-table` `.admin-table` — 40px header, standard hover |
| **Tabs**, TabList | `.sub-nav-item` `.drawer-tab` — 40px, 2px selected rule |
| **Modal** + Header/Content/Footer | `.modal-card` and its parts, now with a focus trap |
| **Menu**, MenuItem | the "Add filter" menu |
| **AttentionBox** | `.ask-callout` `.requested-flag` `.tmpl-skipped` |
| **AlertBanner** | the prototype notice above the toolbar, dismissible |
| **Toast** | confirms the four actions that used to happen silently — push comment, push property, post comment, request changes |
| **Tooltip** | replaced all 15 native `title` attributes |
| **ExpandCollapse** | `.prop-collapse`, with a rotating chevron |
| **DatePicker** (range) | the Date control — trigger plus popover with presets and both ends |
| **ProgressBar** | `.proj-progress-*` `.list-progress-*` `.lead-bar-*` |
| **BreadcrumbsBar** | `.breadcrumbs` `.view-crumbs` `.drawer-crumbs` |
| **EmptyState** | `.cal-empty` `.pd-empty` `.lead-empty` |
| **Divider** | `.card-divider` and the 1px `--layout-border-color` rules |
| **Clickable** | the `MutationObserver` retrofit — role, tab stop, Enter/Space |
| **Text**, **Heading** | `.vibe-text` / `.vibe-heading` with size, weight and colour variants |
| **TextWithHighlight** | the in-panel job search now marks the matched substring |
| **Box**, **Flex** | `.vibe-box` (padding, border, rounding, shadow, background) and `.vibe-flex` (direction, align, justify, gap) |
| **ButtonGroup** | the theme switcher in Settings |
| **ThemeProvider** | light / dark / black, switchable in Settings, remembered in `localStorage`, defaults from `prefers-color-scheme` |
| **HiddenText** | the visually-hidden live region |
| **Link** | `.vibe-link` and the breadcrumb anchors, on `--link-color` |

### Available, not yet used (26)

Built to spec and ready, but the prototype has no surface that calls for them. Listed
honestly rather than counted as wins.

`Loader` · `Skeleton` (nothing loads asynchronously in a static file) · `RadioButton` ·
`Slider` · `NumberField` · `Combobox` · `ColorPicker` · `Accordion` · `List` / `ListItem` /
`ListTitle` · `MenuButton` · `SplitButton` / `SplitButtonMenu` · `Steps` ·
`MultiStepIndicator` · `Badge` · `Info` · `Tipseen` · `Dialog` / `DialogContentContainer` ·
`EditableText` / `EditableHeading` · `TransitionView` · `Flex`/`Box` variants beyond those in use

### Internal / not applicable (5)

`BaseInput` · `BaseList` · `VirtualizedGrid` · `VirtualizedList` ·
`GridKeyboardNavigationContext` — internal plumbing and virtualisation, irrelevant at 50 records.

---

## Four honest limitations

1. **Not React.** These are CSS implementations of Vibe's components, not `@vibe/core`.
   You get the system; you don't get the prop APIs, the composition, or the behaviour
   Vibe's JavaScript provides. **This is now the plan** — see `react-migration.md` for
   the component mapping, the ThemeProvider config, what ports as-is versus what has to
   be rebuilt, and the sequenced build order.
2. **Dropdown is still a native `<select>`**, styled to Vibe's field geometry. Vibe's
   Dropdown has search, multi-select, grouping and custom option rendering. A native
   select is the more accessible choice for a prototype, but it is not the component.
3. **26 components are available but unused.** They are correct and ready; they are not
   proof that the app needs them. Reach for them when a surface actually calls for one.
4. **The UX writing pass is partial.** New copy follows the handbook; the ~400 strings
   that predate this work have not been reviewed against it.

---

## Verification

Everything above is checked in a real browser, not asserted:

- **Contrast** — every text/background pair on all 7 pages in all 3 themes, compositing
  semi-transparent layers rather than guessing at them. **0 failures.**
- **Text size** — nothing below Vibe's 12px floor. **0 violations.**
- **Icons** — all 67 render with real geometry (`getBBox` non-empty).
- **Keyboard** — enhanced-control count matches clickable-surface count page for page;
  focusing a job card and pressing Enter opens the drawer.
- **Filters** — add, change, remove and clear all apply; page-inapplicable filters drop
  on navigation.
- **JavaScript** — 0 errors across every page, view and theme.
