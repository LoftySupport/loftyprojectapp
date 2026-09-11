# Icons — audit and SVG re-supply

The client supplied 15 PNG files. They were rendered in the mockups as CSS masks so they inherit
ink. This package replaces them with **14 traced SVGs** on the design system's 24×24 grid.

## Tracing

Approximations, not exact reproductions — the PNGs are raster and no vector originals were
supplied. Each glyph was redrawn at the same proportions and silhouette. Compare them side by side
in `icon-proof.html`.

| SVG | From | Note |
| --- | --- | --- |
| `AdminConsole` | `AdminConsole.png`, `Admin.png` | **Two PNGs, one glyph.** `Admin.png` (182×182) is the same terminal mark at a lighter weight; normalising stroke weight makes them identical. Ship one. |
| `Contacts` | `Contacts.png` | |
| `Dashboard` | `Dashboard.png` | |
| `Design` | `Design.png` | Imported but unused — no Drawings destination exists yet. |
| `Documents` | `Documents.png` | |
| `Job` | `Job.png` | |
| `JobMeasure` | `JobMeasure.png` | Imported but unused. |
| `Maintenance` | `Maintenance.png` | Crossed spanner and screwdriver; the loosest trace of the set. |
| `Projects` | `Projects.png` | |
| `Reports` | `Reports.png` | |
| `SettingsGear` | `SettingsGear.png` | The one filled glyph — gear ring knocked out, person solid. |
| `SettingsGearOutline` | `SettingsGearOutline.png` | |
| `SettingsUser` | `SettingsUser.png` | Stroked gear, filled person. |
| `Team` | `Team.png` | |

## Specification

- **Grid** 24×24 viewBox. Content sits inside 3–21, so the glyphs keep their internal padding —
  the reason a Lofty glyph renders at 28px where a design-system SVG renders at 24px to read at the
  same weight. Do not re-crop them.
- **Stroke** `currentColor`, `stroke-width: 1.7`, round caps and joins, `fill: none`. One weight
  across the set, which lands ink coverage in the 0.18–0.22 band measured at render size.
- **Colour** none baked in. Every glyph inherits its context, as the `Icon` component requires.
- **Naming** PascalCase stems, matching the existing set.

## Prefer a design-system glyph

These have been drawn in the Lofty set at some point and should **not** be used — the design system
already carries them: Settings, Person, Location, Bookmark, Search, Note, Group, the chevrons,
Warning, Calendar, Folder, ExternalPage, Edit, CloseSmall, Fullscreen, Add.

## Sizes

| Size | Use |
| --- | --- |
| 14 | xs controls |
| 16 | buttons, table cells, menu items |
| 18 | attention boxes |
| 20 | utility controls in the rail — search, expand, settings, admin |
| 24 | design-system destination glyphs |
| 28 | **Lofty construction glyphs** as destinations, compensating for their internal padding |

## Still open

The traces are good enough to build against and to keep the mockups consistent. If the client can
supply vector originals, replace these files rather than editing them — the point of the trace was
to unblock, not to become the master.
