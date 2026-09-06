# Design — Lofty Hub

**The single design file.** What binds every screen, where each value lives in code, and
which decisions are not cheap to reopen. If a value appears here and in a source file, the
source file wins and this page is the bug.

The design system is [**Vibe**](https://vibe.monday.com), monday.com's, adopted whole —
its type ramp, 4px spacing scale, radii, motion curves, elevation, neutrals, semantic
colours and its accessibility contract. Three things are Lofty's and override Vibe: the
logo, **Lofty green `#005058`** and **Lofty orange `#f47e63`**.

> The **record of how this was decided** — the July 2026 evaluation of the prototype
> against Vibe, with the before/after measurements — is
> [`docs/history/design-system-evaluation.md`](docs/history/design-system-evaluation.md),
> and the component-by-component audit is
> [`docs/history/vibe-catalog-status.md`](docs/history/vibe-catalog-status.md). Both
> describe the **prototype**, not the React app. They are kept for their reasoning and
> their numbers; this page is what binds now.

---

## Where the design lives in code

| File | What it owns |
| --- | --- |
| `app/src/theme/loftyTheme.ts` | The 8 primary/brand tokens Vibe's `ThemeProvider` can carry, per theme |
| `app/src/theme/tokens.css` | Everything `ThemeProvider` **cannot** carry — the accessible orange, the semantic inks, the header colours — plus the same brand tokens again at `body` level, for portals |
| `app/src/theme/accents.ts` | The board's colour rule: the seven-position lifecycle ramp and the cycle used by groupings with no fixed order |
| `app/src/theme/houseIcons.tsx` | The icons Vibe does not ship |
| `app/tailwind.config.js` | Utility layer. It does not define colour — the tokens above do |

There is no fourth place. A colour that is not in one of these files is a colour nobody
decided.

## The colours, and the contrast decision behind each

**Lofty orange `#f47e63` is 2.6:1 on white.** That is below the 3:1 a UI indicator needs
and well below the 4.5:1 text needs, so it is not diluted and it is not used for meaning.
It keeps the hero role — logo, decorative fills — and a darker sibling does the work that
has to be legible on its own.

| Token | Light | Dark / black | Role |
| --- | --- | --- | --- |
| `--primary-color` / `--brand-color` | `#005058` | `#4db3bd` | Lofty green in Vibe's primary slot: primary buttons, selection, focus rings, links |
| `--lofty-orange` | `#f47e63` | `#f47e63` | Logo and decorative fills **only**. 2.6:1 on white; 6.4:1 on Vibe's dark canvas |
| `--lofty-orange-strong` | `#b8482a` (5.3:1) | `#ff9478` | Anything carrying text or meaning |
| `--positive-ink` | `#005c35` | `#7ce8bd` | Text on Vibe's positive tint |
| `--negative-ink` | `#a32436` | `#ffb3bc` | Text on Vibe's negative tint |
| `--warning-ink` | `#6b5000` | `#ffdf80` | Text on Vibe's warning tint |
| `--lofty-header-bg` | `#00393f` | `#12141f` | The top bar |

**Why the three inks exist.** Vibe ships `-selected` tints but no ink to sit on them, and
its own pairings do not clear 4.5:1 — `--positive-color` on `--positive-color-selected` is
3.2:1, negative is 2.9:1. Vibe uses those pairs on Label, where the text is short and
colour is not the sole carrier of meaning. This app leans on status colour heavily, so each
ink is the darkest member of its Vibe family that clears 4.5:1 on its own tint.

**Dark needed two departures from Vibe**, both because Vibe's own value fails on Vibe's own
canvas: Lofty green is 1.3:1 there, so it lightens to `#4db3bd`; and Vibe's dark
`--secondary-text-color` `#9699a6` is 4.38:1 on its grey — just under AA — so it lifts to
`#a8abb8`.

### The board's colour rule

**Colour on containers encodes phase. Colour on records encodes health. Never both on one
element.** Columns get a 4px strip and an ink-on-tint count chip; cards stay uncoloured.

One hue family — Lofty's teal — with **lightness carrying progression**: the further
through the lifecycle, the deeper the colour. Position and lightness rather than hue is
what makes the ramp hold under colour-vision deficiency. Amber chose the single family over
the first cut's two (teal for office phases, rust for site) on the live board, 27 August.
What it gives up is Cancelled shouting in red; if it should, that is a one-line change in
`accents.ts`. Every ink/tint pair clears 4.5:1.

## The foundations, as they bind

| Foundation | The rule |
| --- | --- |
| **Type** | Vibe's six sizes with their paired line heights — 12/16, 14/20, 16/22, 18/24, 24/30, 32/40 — plus one 48px display step for the dashboard hero figure. **Figtree** body, **Poppins** headings. **No text below 12px.** |
| **Case** | **No all-caps text at any size.** Vibe has no all-caps style; caps at small sizes with positive tracking is the hardest combination to read at speed, and it was used on exactly the things people scan fastest. Sentence case, and Vibe's own heading tracking (`-0.5px` h1, `-0.1px` h2/h3) |
| **Spacing** | Vibe's scale: 2/4/8/12/16/20/24/32/40/48/64/80. Nothing off it |
| **Radius** | small 4 / medium 8 / big 16. **The full pill is reserved for Avatar and Counter**, as Vibe reserves it — not for buttons, chips, tags, filters, badges or progress tracks |
| **Elevation** | Vibe's four — xs, small, medium, large — and only on things that genuinely float: modal, drawer, assistant dock, menus. Panels and cards separate with a 1px `--layout-border-color` |
| **Motion** | Productive 70/100/150ms, expressive 250/400ms, Vibe's four cubic-béziers. `prefers-reduced-motion: reduce` is honoured |
| **Themes** | Light, dark and black, switchable in Settings, remembered in `localStorage`, defaulting from `prefers-color-scheme` |

## The accessibility contract

Not aspirations — each one is a thing that was broken and was fixed, and re-breaking it is
a regression rather than a preference:

- **Zero AA contrast failures across all three themes**, checked with a composited-alpha
  audit rather than by eye — semi-transparent overlays are measured against what is
  actually behind them.
- **Every clickable surface is keyboard-operable.** 126 controls on the board view alone
  were `div` and `tr` elements with click handlers and no `tabindex`, `role` or
  Enter/Space handling. A new clickable element that is not a `button` or a link needs all
  three, or it does not ship.
- **One global `:focus-visible` ring** — Vibe's 2px primary — switching to white inside the
  dark top bar and the assistant dock header. `outline: none` without a replacement is the
  defect that produced this rule.
- **Touch targets ≥24px** — the WCAG 2.2 AA floor (2.5.8) — most 32px. Asserted by
  `cd app && npm run responsive`, which also asserts **no page scrolls sideways** at five
  real device sizes.
- Skip link, `banner`/`nav`/`main`/`contentinfo` landmarks, an `aria-live` region
  announcing filter results, focus trap in the modal and drawer, every icon-only control
  labelled.

## The two interface must-haves

Given by Amber on 3 September as must-haves rather than preferences. They are written up in
full, with the mechanisms, in **Interface Must-Haves** in [`PRODUCT.md`](PRODUCT.md) —
which owns them. In short:

1. **Every table sorts and filters.** Every column carrying a comparable value sorts
   (`app/src/components/SortableTable.tsx`; blanks sort last in both directions). Every
   table about jobs, projects or processes carries at minimum team, team member, build
   lifecycle stage, search by job # / project #, and a date-range picker.
2. **Every record opens in the slideout.** One shell —
   `app/src/components/SidePanel.tsx` — down the right, over a list that stays readable. It
   expands to full width, is width-adjustable and remembers the width, closes on Escape,
   and the selection rides the URL. **A detail column beside the list is not this**: it
   halves the list, cannot expand and cannot be dragged. That shape (`.contacts-grid`) was
   deleted rather than left available to copy.

Where a screen does not meet these yet, it is listed in [`HANDOFF.md`](HANDOFF.md) rather
than left to be discovered.

## Empty is a design decision

**Never fill a gap with a plausible value.** A value whose table is not built yet renders
as a `{{table.column}}` token, so an unbound field is visible rather than silently blank.
An invented default is worse than a blank, because a blank invites configuring and a guess
gets quoted back as though it were agreed. Reports once showed "45% on track" computed from
a fixed array; the job template showed 36 checkpoints nobody at Lofty wrote.

Milestones are a **boolean and never a percentage** for the same reason: "68% complete"
implies a weighting that does not exist.

## Known limitations

- **`Dropdown` in the prototype is a native `<select>`** styled to Vibe's field geometry.
  Vibe's own Dropdown has search, multi-select and grouping. The React app uses the real
  component; the prototype does not.
- **The UX writing pass is partial.** New copy follows Vibe's handbook; the ~400 strings
  predating the evaluation have not been reviewed against it.
- **26 Vibe components are built to spec but unused** — Loader, Skeleton, Slider, Combobox
  and the rest. No surface needs them yet.
- **The fake SharePoint popup keeps its Microsoft-style styling on purpose.** It is
  imitating an external system, not part of the Lofty UI.
