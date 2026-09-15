# Handoff instructions — Lofty Hub

Three packages, two audiences, one order. Read this page, then hand out the two prompts at the
bottom verbatim.

## What exists

| Package | Goes to | What it is |
| --- | --- | --- |
| `ds-update/` | Design system owner | Eight new components, token additions, 14 traced SVG icons, changelog entry. A merge into the Lofty design system repo. |
| `design_handoff_sidebar_navigation/` | App development | The rail: four states, measured values, interactions, accessibility, state shape. |
| `design_handoff_job_record/` | App development | The job record: drawer, full page, column picker. Same shape. |

The two development packages are complete and self-contained. `ds-update/` is library maintenance —
nobody builds product from it.

## Order of operations

1. **Merge the design system first.** Otherwise development builds eight components into the app
   that later have to be reconciled with the library versions.
2. If the merge cannot happen first, tell development the components are coming and have them build
   against the names and props in `ds-update/README.md`. The names are the contract.
3. Start development on the rail before the job record — the record renders inside the shell.

## Resolve before development starts

- **Icons.** Ask the client for vector originals. The 14 SVGs in `ds-update/assets/icons-lofty/` are
  traced from PNGs to unblock; they are good enough to build against and should be replaced, not
  edited, when originals arrive.
- **Unfitted screens.** The rail has not been fitted to projects, reports or settings — those
  screens still carry the old eight-destination rail.
- **No top bar.** The job record's 56px bar is the only version and it assumes an app header above
  it. It was deliberately not promoted to a component. Development will hit this in week one.
- **Two unused glyphs.** `Design` and `JobMeasure` are imported but have no destination.

## Reference

- `Lofty DS Update — 6 & 7.dc.html` — the eight patterns, light and dark, with the rules for each.
- `Lofty Hub Mockups.dc.html` — the live working file (sidebar 7a–7d, job record 6a–6c).
- `HANDOFF - next chat brief.md` — how the decisions were reached and what was learned getting there.

---

## Prompt A — design system merge

> Merge the `ds-update/` package into Lofty's App Design System.
>
> It contains eight new components from the Lofty Hub work: `NavRail`, `NavFlyout`, `RecordTabs` and
> `RecordBreadcrumb` for `components/navigation/`, and a new `components/records/` family holding
> `RecordDrawer`, `FieldRow`, `ProcessSteps` and `StageTrack`. Also token additions
> (`tokens/dark-surface.css`), 14 traced SVG icons for `assets/icons/`, and a changelog entry.
>
> `ds-update/README.md` has the file-by-file merge map. Follow the repo's existing conventions:
> flat files per family (`Tabs.jsx` beside `Tabs.d.ts`), inline styles referencing `var(--*)` tokens,
> no stylesheets, `Icon` for every glyph, one `.jsx` / `.d.ts` / `.prompt.md` per component.
>
> Three things the package does not do, which you need to:
> 1. Flatten the per-component folders into the family folders.
> 2. Write `components/records/records.card.html` and extend `components/navigation/navigation.card.html`
>    with the four new components. The specimens in `Lofty DS Update — 6 & 7.dc.html` can be lifted —
>    it shows every pattern light and dark.
> 3. Fold `tokens/dark-surface.css` into `tokens/colors.css`, or `@import` it from `styles.css`.
>
> Do not restyle anything that already exists. Every file in the package is an addition. `RecordTabs`
> sits beside `Tabs` and does not replace it; `RecordBreadcrumb` sits beside `Breadcrumbs`;
> `HealthChip` sits beside dataviz's `StatusChip`.
>
> The icon audit in `ds-update/ICONS.md` records that `Admin.png` and `AdminConsole.png` were the
> same mark at two weights and are now one file, and lists the glyphs that should use an existing
> design-system icon rather than a Lofty one.

## Prompt B — application development

> Build the Lofty Hub shell and job record from the two handoff packages:
> `design_handoff_sidebar_navigation/` and `design_handoff_job_record/`.
>
> Each package has a README carrying measured colours, type, spacing, geometry, interactions, state
> shape and accessibility requirements. Those values are final — match them. The `.dc.html` files are
> design references written in HTML, not production code: read them for structure and behaviour, then
> recreate in the codebase's own framework and component library. The template runtime in them
> (`support.js`, `<x-dc>`, `{{ }}`, `<sc-for>`) must not be ported.
>
> Build the frame before the screens: rail, top bar, content region, and how a record opens inside
> it. The record renders inside the shell, so the shell comes first.
>
> Components for these patterns are being added to Lofty's App Design System — `NavRail`,
> `NavFlyout`, `RecordTabs`, `RecordBreadcrumb`, `RecordDrawer`, `FieldRow`, `ProcessSteps`,
> `StageTrack`, `HealthChip`. Build against those names so the two converge. Their props are in
> `ds-update/components/*/*.d.ts`.
>
> Rules that were settled the hard way and should not be re-litigated:
> - Crisp Orange is a fill, never ink on light, never behind 12px text.
> - Selection on the dark rail is a white wash; the peach tint is for light surfaces only.
> - The current pipeline stage takes the record's health colour, so stage and health read as one signal.
> - There is no type step below 12px. The scale is 12 / 14 / 16 / 18 / 24 / 32.
> - A field with a type shows its control, not the word "Empty".
> - In a column of controls, every control is the same width and height.
> - Progress and step counts derive from the tick state; never store them twice.
> - Settings is manager-and-above, Admin is admin-only. Gate both.
>
> Three known gaps: the rail has not been fitted to the projects, reports and settings screens; no
> top-bar component exists; and the Lofty icons are traced SVGs pending vector originals from the
> client.
