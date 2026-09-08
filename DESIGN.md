# Design — Lofty Hub

**The single design file.** What binds every screen, where each value lives in code, and
which decisions are not cheap to reopen.

**The source of truth is [Lofty's App Design System](https://claude.ai/design/p/491d6888-cf3b-4d56-bdaa-4ac8a6948e99),
a Claude Design project.** It is mirrored verbatim into
[`app/src/design-system/`](app/src/design-system/), and
[that directory's README](app/src/design-system/README.md) is how the mirror is kept in
step. If a value here disagrees with the mirror, the mirror is right and this page is the
bug.

The system is Lofty's brand kit applied to **[Vibe](https://vibe.monday.com)**,
monday.com's design system. The brand palette, the logo and the Fieldwork typeface are
Lofty's; layout, component behaviour, spacing, motion and the icon set are Vibe's — on the
explicit instruction that readability and familiar product patterns come first.

---

## Where the design lives in code

| File | What it owns |
| --- | --- |
| `app/src/design-system/tokens/` | **The values.** The mirror — every hex, size, radius, shadow and duration |
| `app/src/theme/tokens.css` | The application layer: imports the mirror, then re-declares the semantic tokens at the specificity Vibe requires |
| `app/src/theme/loftyTheme.ts` | The brand tokens Vibe's `ThemeProvider` carries, as literals it can read — 24 values across three themes, checked against the mirror |
| `app/src/theme/accents.ts` | The board's colour rule — the lifecycle ramp |
| `app/src/theme/loftyIcons.tsx` | The eight Lofty construction glyphs from the design system |
| `app/src/theme/houseIcons.tsx` | Three hand-drawn nav icons that predate the design system |

There is no fifth place. A colour that is not in one of these is a colour nobody decided.

**Why `tokens.css` repeats what the mirror already says:** the mirror declares its tokens on
`:root`; Vibe declares its own palette on the class it puts on `<body>`, and a class beats
an element selector. A bare `:root` declaration loses and every Vibe component paints
monday.com blue. The names repeat; the values do not — each re-declaration is a
`var(--lofty-*)` reference back into the mirror.

## The five brand colours, and the hierarchy between them

Nothing outside these except status.

| Token | Hex | Role |
| --- | --- | --- |
| **Crisp Orange** | `#f47e63` | **Primary.** The active tab underline, the selected nav item, focus rings, the first data series. A *filled button* uses the pressed step `#c2543c` — see below |
| **Eco Green** | `#005058` | **Minimal highlight only.** Small decorative accents and later data series. **Never a shell, a panel fill, or a link colour** |
| **Foundation Black** | `#414042` | Text, inverted surfaces, brand panels. The secondary |
| **Finisher White** | `#ffffff` | Pages, shells, cards |
| **Mid Grey** | `#d1d3d4` | **The logo, print and brand-led surfaces only.** A cool grey that fought Crisp Orange, so since 7 September it draws nothing in the UI — Flint does |

> **This inverted what the app did before 6 September**, when Eco Green sat in Vibe's
> primary slot and orange was decorative. Every primary button, focus ring, link and
> selected state changed. The design system is the newer, deliberate artefact and it wins.

**The contrast problem, and the brand rule that decides it.** White on Crisp Orange is
**2.62:1**. Three answers have been on the table, and the third is the one in force:

| | Answer | Cost |
| --- | --- | --- |
| Before 6 Sep | Darken the orange to `#b8482a`, keep white text | Loses the brand hue |
| 6 Sep | Keep the hue, move the text to `#191819` ink (**6.75:1**) | Black on orange |
| **7 Sep — in force** | **Keep the hue, keep white text** | **2.62:1** |

**Black is never placed on Crisp Orange — not text, not icons.** That is a brand rule, and
it outranks the arithmetic. It is also the expensive one, and the cost should be stated
plainly rather than buried: at 2.62:1, white on Crisp Orange clears **neither** the 4.5:1
normal-text floor **nor** the 3:1 large-text floor, so the design system's carve-out —
orange fills reserved for "large or semibold labels, never small body copy" — does not
reach AA either. Restricting the size reduces the exposure; it does not remove it.

**The remedy the design system names** is the pressed step `--lofty-orange-pressed`
`#c2543c`, which is **4.54:1** with white, wherever AA text on an orange field is required.
`check-contrast.mjs` asserts that step so the escape hatch cannot rot, and asserts the rule
itself as an identity — because a check optimising for the ratio alone would put the ink
back, and the rule outranks the ratio.

**Amber took that remedy for filled buttons, 7 September.** So:

| Surface | Fill | White on it |
| --- | --- | --- |
| **Filled primary button** | `--primary-action-color` `#c2543c` | **4.54:1** ✓ |
| …hovered | `--primary-action-hover-color` `#9a4330` | **6.52:1** ✓ |
| Focus rings, selected tints, accents, chart series | `--primary-color` `#f47e63` | *carries no text* |
| Toasts, tipseens, filled labels | `--primary-color` `#f47e63` | **2.62:1** ✗ |

`--primary-color` stays Crisp Orange, because everywhere else it is used it carries no text
and is doing its actual job — being the brand. **The last row is what is left of the
problem:** a filled orange label or toast with small text is the thing this palette still
cannot make accessible, and it is recorded as a shortfall rather than solved.

**How the override works, and why it is shaped that way.** Vibe is the layout system; the
brand system overrides it. Vibe's filled button is `.kindPrimary.colorPrimary { background:
var(--primary-color) }`, so `theme/tokens.css` **rebinds `--primary-color` on the button
element** rather than overriding `background`. Working with Vibe's cascade instead of
against it means hover, focus and active follow for free and there is no specificity race to
lose. The class hashes move between Vibe versions, so the selector matches the stable part
of the name.

`--primary-action-hover-color` `#9a4330` is **derived in this repo, not mirrored** — the
pressed step darkened by the same 10.2% lightness the existing crisp→hover step uses, which
keeps the ramp monotonic. It should go back into the design project as a real brand step.

**One brand-kit contradiction, resolved.** The kit prints `HEX #000000` next to
`RGB 65 64 66` for Foundation Black. The RGB is authoritative, so the token is `#414042`.

### Derived steps, and Flint — the one neutral family

Tints and shades of the five above — no new hues. Hover `#d9634a`, pressed `#c2543c`,
selected `#fae4d5`, and two lighter orange steps for charts, Orange 70 `#f8a48c` and
Orange 40 `#fbd8cd`. Selection is **tinted, not filled**, and the tints lean warm peach:
earlier magenta-leaning values were retired because a selected state read as a different
colour family.

**Flint is the neutral: one material, numbered steps** (design system, 7 September).

| Step | Hex | Draws |
| --- | --- | --- |
| Flint 50 | `#f9f9f6` | A softer page — dense tables, long forms |
| Flint 100 | `#f4f3ee` | **The page.** What the app shell paints behind everything |
| Flint 200 | `#e1e1d9` | Recessed fills, tracks, quiet chips, disabled fills |
| Flint 300 | `#c6c5ba` | **Every card, panel and table rule** |
| Flint 400 | `#b6b6ac` | Chart neutrals and disabled states — never a text ground |
| Flint 700 · 800 · 900 | `#3a3a33` · `#24241f` · `#1a1a18` | Dark mode's rule, surface and page |

One page tint per screen. Flint 300 is a layout rule: it carries no information, so it is
exempt from the 3:1 boundary floor (it is 1.74:1 on white), and a control boundary still
uses Black-60 `#8a898d`.

**What Flint retired.** The three warm tones — Paper `#fcfaee`, Mineral `#eae3df`, Stone
`#dbd0be` — and the two cool greys the shell used to be drawn in, `#f6f7f7` and `#e7e8e9`.
The cool greys fought Crisp Orange; the warm tones were a second neutral family. All five
are gone from the mirror, so a reference to `--lofty-gray-light` or `--lofty-gray-surface`
is a dangling `var()` now, not a fallback — `theme/tokens.css` moved to Flint 300 and Flint
100 in the same sync.

### Status

Positive `#00854d`, negative `#d83a52`, warning `#ffcb00` — **Vibe's values, kept**,
because the brand palette has no legible status greens or reds. Vibe ships `-selected`
tints but no ink to sit on them, so three inks are derived as the darkest member of each
family that clears 4.5:1 on its own tint: `--positive-ink`, `--negative-ink`,
`--warning-ink`.

### Charts

**One accent per view.** The data ramp `--data-1` to `--data-6` is Crisp Orange, Orange 70,
the orange hover step, Foundation Black, Flint 400, Flint 200 — orange carries the series,
the rest is value. Eco Green is not in it: the two accents never appear together, so a green
chart is green plus Flint with no orange in the view. On dark the third step flips to Orange
40 and the neutrals invert so nothing melts into the panel. No screen draws from the ramp
yet.

### The board's colour rule

**Colour on containers encodes phase. Colour on records encodes health. Never both on one
element.** Columns get a 4px strip and an ink-on-tint count chip; cards stay uncoloured.

One hue family — Lofty's teal — with **lightness carrying progression**: the further
through the lifecycle, the deeper the colour. Position and lightness rather than hue is
what makes the ramp hold under colour-vision deficiency. Amber chose the single family over
the first cut's two (teal for office phases, rust for site) on the live board, 27 August.
What it gives up is Cancelled shouting in red; if it should, that is a one-line change in
`accents.ts`. Every ink/tint pair clears 4.5:1.

## Dark mode

`data-theme="dark"` on `<html>`, which `App.tsx` stamps alongside the body classes Vibe
needs. Grounds are the dark Flint steps — page `#1a1a18`, surface `#24241f`, raised
`#2f2e28` — with Flint 700 `#3a3a33` as the rule and `#807f74` as a control boundary
(3.86:1 on the surface). Text lifts to `#f2f1f2` and muted `#b9b8bc`: 13.8:1 and 7.9:1 on
the surface, both above the 7:1 AAA floor. Crisp Orange keeps its hex **and its white ink** —
dark does not redefine `--primary-color`, so white on orange is the same 2.62:1 pairing in
both themes, not a separate one. Eco Green lifts to `#20707a` as a fill (white on it
**5.74:1**); green as text or an icon uses `--lofty-green-dark-ink` `#57c3cc` (7.48:1) and
is never a fill. Status fills lift too, so their ink flips to the dark page
(`--text-color-on-status`): 6.6:1 on positive, 5.8:1 on negative. **Elevation is shown by
the surface stepping lighter as much as by shadow.**

The app has three themes — light, dark and black — and the design system has one dark, which
both of the latter take.

## The foundations

| | The rule |
| --- | --- |
| **Type** | Vibe's screen scale: h1 32/40, h2 24/30, h3 18/24; text1 16/22, text2 14/20, text3 12/16. **Montserrat** titles, **Figtree** body, Helvetica the fallback for both. Tracking negative on headings only (−0.5px h1, −0.1px h2/h3). **No text below 12px** |
| **Brand type** | **Fieldwork Geo** display, **Fieldwork Hum** body, for brand-led surfaces only — decks, print, proposals. Product screens use Figtree and Montserrat, which is also the brand kit's own print substitute. Supplied in six cuts at 300 and 600 only, so the brand scale uses those two weights. Not shipped in the app bundle; the token chain falls back to Montserrat |
| **Case** | **Sentence case everywhere.** No Title Case, no ALL CAPS except the 12px navigation eyebrow |
| **Spacing** | 2/4/8/12/16/20/24/32/40/48/64/80. Nothing off it, ever — no 6, no 10, no 14. Controls on an 8px rhythm; cards pad 24, compact tiles 16; page gutters 32 |
| **Radius** | 2 checkbox · 4 buttons, inputs, chips, tabs · 8 cards, menus, dialogs · 12 panels · 16 the full-view modal only · pill toggles, tracks, counters · 50% avatars, radios, loaders. **Never a literal** |
| **Borders** | 1px solid, always. Black-60 `#8a898d` on controls (Mid Grey is 1.5:1 on white and fails the 3:1 a boundary needs); Flint 300 `#c6c5ba` on card, panel and table rules, Flint 200 on decorative rules inside a control. The border goes Foundation Black on input hover and Crisp Orange on focus. **No coloured left-border accent strips** |
| **Elevation** | xs row hover · small dropdowns · medium menus, toasts, tooltips · large modals. Neutral Foundation Black at 10–30%, **never tinted orange**. Cards have no shadow at rest |
| **Motion** | Productive 70/100/150ms for what the user drives; expressive 250/400ms for entrances. Vibe's easings. **Nothing bounces** except the chip pop. No parallax, no scroll-triggered animation |
| **Press** | Buttons `scale(0.95)`, icon buttons `scale(0.9)`, over 70ms. This is why the system feels physical rather than flat |
| **Hover** | A neutral wash, not a colour change: `rgba(65,64,66,.08)`. Filled elements darken to their `-hover` step instead |
| **Backgrounds** | Flat colour. **No gradients, no photographic hero imagery, no patterns, no grain, no illustration set** — none exist in the supplied material, and inventing one would be a guess |
| **Transparency** | Two places only: the hover wash and the modal backdrop. **No frosted glass, no backdrop blur** |
| **Z-index** | `--z-sticky` 10 · `--z-dropdown` 20 · `--z-tooltip` 30 · `--z-dialog` 40 · `--z-toast` 50. Never a literal |

## The accessibility contract

Each of these was a thing that was broken and was fixed. Re-breaking one is a regression,
not a preference.

- **Focus is a 3px orange-at-50% ring plus a 1px inset** (`--focus-ring`). Never removed,
  never replaced by a colour change alone. It is re-stated as an `outline` under
  `forced-colors: active`, where a `box-shadow` ring disappears entirely.
- **Zero AA contrast failures across all three themes**, checked with a composited-alpha
  audit rather than by eye — semi-transparent overlays measured against what is behind them.
- **Every clickable surface is keyboard-operable.** 126 controls on the board view alone
  were `div` and `tr` elements with click handlers and no `tabindex`, `role` or Enter/Space
  handling. A new clickable that is not a `button` or a link needs all three, or it does
  not ship.
- **Touch targets ≥24px** — the WCAG 2.2 AA floor (2.5.8) — most 32px. Asserted by
  `cd app && npm run responsive`, which also asserts **no page scrolls sideways** at five
  real device sizes.
- Skip link, `banner`/`nav`/`main`/`contentinfo` landmarks, an `aria-live` region announcing
  filter results, focus trap in the modal and drawer, every icon-only control labelled.
- `prefers-reduced-motion: reduce` is honoured.

### Where the palette falls short

Two pairings do **not** meet the floor. They are recorded in
`app/scripts/check-contrast.mjs` at their measured value, so the check fails if either
gets worse, and prints them on every run so they stay visible rather than becoming normal.
Neither is a value this repo chose.

| Pairing | Measured | Needs | |
| --- | --- | --- | --- |
| **White on filled Crisp Orange** (both themes) | **2.62:1** | 4.5:1 | The brand rule. Below the 3:1 large-text floor too. **Buttons no longer use this** — what is left is toasts, tipseens and filled labels |
| `--placeholder-color` `#8a898d` on white | **3.47:1** | 4.5:1 | The design system calls this "example text only, never a label", which narrows the exposure but does not clear it. `#757478` would, at 4.64:1. Open question 9 in `docs/open-questions.md` |

**The first one no longer covers buttons.** Amber took the pressed step for filled buttons
on 7 September, so a button label is now 4.54:1. What remains at 2.62:1 is every *other*
filled-orange surface that carries text — toasts, tipseens, filled labels. Those either take
the pressed step too, or the design project gives them a ground that white survives on.

**Two dark-mode shortfalls closed on 7 September, from the design side.** White on the
lifted Eco Green was 4.26:1 at `#1f8791`; the design project moved the fill to `#20707a`
(5.74:1) and added a separate ink step for green as text. The dark control boundary was
2.28:1 at `#5a595c`; it is `#807f74` now (3.86:1). Both were fixed where a palette changes —
in the design project, then synced into the mirror — which is the arrangement Amber chose
(*Answered*, 7 September, in `docs/open-questions.md`), and both are ordinary assertions in
`check-contrast.mjs` now rather than recorded shortfalls. The placeholder is the one of the
three still open.

**The design system's contrast card now agrees with measurement.** Its `a11y-contrast.html`
used to overstate six pairings, one of them in the unsafe direction. On this sync every
figure it prints — 10.3:1 for Foundation Black on white, 6.8:1 for black on warning, 5.7:1
for white on the dark green, 3.9:1 for the dark boundary, 7.9:1 for muted text on the dark
surface — matches what `check-contrast.mjs` measures, to one decimal place.

## Iconography

`@vibe/icons` for the 277 Vibe glyphs. `loftyIcons.tsx` for eight Lofty construction glyphs
Vibe does not ship — Approval, Company, Costs, Delivery, Drawings, Estimating, Materials,
Safety. Filled 20×20, painting from `currentColor`, so an icon always inherits its context.

**Sizes** 14 xs controls · 16 buttons, table cells, menu items · 18 nav, attention boxes ·
20 default · 24 empty states. **Colour** neutral by default; orange only when the icon *is*
the action; status colours only inside status contexts.

**No emoji, no icon font, no Unicode glyph standing in for an icon**, in UI copy or
anywhere else.

Seven further Lofty glyphs exist in the design project but are **not usable**: they are SVG
wrappers around a PNG rather than vectors — checked again on the 7 September sync, when
`Projects.svg` and `JobHouse.svg` were still a single `<image>` element, by then with no
`href` at all — so they render nothing and cannot take `currentColor`. They need
re-exporting. `houseIcons.tsx` covers the three the app actually uses in the meantime.

## Words are design material

Australian English — *organise*, *utilisation*, *kilometre*.

- **Buttons are verbs**, and name the object where it fits: "Create job", "Publish
  schedule". Not "Submit", "OK", "Yes".
- **Labels are nouns**, one to three words: "Job name", "Crew", "Due".
- **Second person, active voice.** "Assign a crew before publishing the schedule", not
  "The crew must be assigned". The product never says "I".
- **Empty and error states say what to do next.** "Enter a valid work email", not "Invalid
  input".
- **Numbers are concrete and unrounded** — "128 jobs", "91% on time". No vague intensifiers.
- **No exclamation marks**, and no exclamatory congratulation. A completed action gets a
  plain toast: "Schedule published".
- **Helper text is one sentence.** It explains the constraint, then stops.

## Empty is a design decision

**Never fill a gap with a plausible value.** A value whose table is not built yet renders as
a `{{table.column}}` token, so an unbound field is visible rather than silently blank. An
invented default is worse than a blank, because a blank invites configuring and a guess gets
quoted back as though it were agreed. Reports once showed "45% on track" computed from a
fixed array; the job template showed 36 checkpoints nobody at Lofty wrote.

Milestones are a **boolean and never a percentage** for the same reason: "68% complete"
implies a weighting that does not exist.

## The two interface must-haves

Given by Amber on 3 September as must-haves rather than preferences, and written up in full
in **Interface Must-Haves** in [`PRODUCT.md`](PRODUCT.md), which owns them.

1. **Every table sorts and filters.** Every column carrying a comparable value sorts
   (`app/src/components/SortableTable.tsx`; blanks sort last in both directions). Every
   table about jobs, projects or processes carries at minimum team, team member, build
   lifecycle stage, search by job # / project #, and a date-range picker.
2. **Every record opens in the slideout.** One shell — `app/src/components/SidePanel.tsx` —
   down the right, over a list that stays readable. It expands to full width, is
   width-adjustable and remembers the width, closes on Escape, and the selection rides the
   URL. **A detail column beside the list is not this**: it halves the list, cannot expand
   and cannot be dragged. That shape (`.contacts-grid`) was deleted rather than left
   available to copy.

Where a screen does not meet these yet, it is listed in [`HANDOFF.md`](HANDOFF.md) rather
than left to be discovered.

## Known limitations

- **The UX writing pass is partial.** New copy follows the rules above; the ~400 strings
  that predate them have not been reviewed.
- **The design system's ~50 JSX components are not used.** The app uses the real
  `@vibe/core`, which is the more complete implementation of the same contract. The design
  project ships its own because it renders without a bundler.
- **No photography exists**, and none was generated. Where a photo would sit, use a flat
  brand-colour panel or one of the brand silhouettes. If real photography arrives it should
  be warm-neutral and un-filtered to sit alongside Crisp Orange.
- **The brand silhouettes are not in the app.** Six organic shapes exist in the design
  project in three colourways; no screen has a surface for them yet.

The record of how these rules were arrived at — the July 2026 evaluation of the prototype
against Vibe, with the before/after measurements — is
[`docs/history/design-system-evaluation.md`](docs/history/design-system-evaluation.md), and
the component-by-component audit is
[`docs/history/vibe-catalog-status.md`](docs/history/vibe-catalog-status.md). Both describe
the prototype, not this app.
