# features/reports — the vendored report builder

`core/` and `components/` are a copy of `packages/report-builder/src` from
[amberbeaumont/modules](https://github.com/amberbeaumont/modules), at version **1.0.0**.
`adapters/lofty/` and this file are ours.

The module's own documentation — the block contract, the store contract, the theming
guide — lives in that repository under `packages/report-builder/docs/`. Read it there
rather than duplicating it here, because a second copy is a copy that goes stale.

## The boundary

```
core/              the module, portable       — do not edit
components/        the module, portable       — edit only to restyle
adapters/lofty/    ours                       — edit freely
```

If a change needs `core/` to know about a job or a project, it is in the wrong file: the
thing missing is a widget, and widgets live in `adapters/lofty/widgets.js`.

## What was changed on the way in, and why

Everything below is a deviation from the module as published. Anyone re-syncing from
`modules` has to re-apply these four, so they are listed rather than remembered.

1. **The brand chrome was recoloured.** Six hexes across `components/`, a straight
   substitution:

   | Module | Lofty | What it paints |
   | --- | --- | --- |
   | `#021012` | `#00393f` | ink, the builder's header band, chart labels |
   | `#0B4650` | `#005058` | the hover state of that band |
   | `#E6FF2B` | `#f47e63` | the primary call to action |
   | `#C2D123` | `#e06a4d` | its hover |
   | `#FF9B54` | `#ffb59f` | destructive and error text ON the dark band |
   | `#F9F7F2` | `#f5f6f8` | the page behind the document |

   The chip and callout colours (`#dcfce7`, `#16a34a`, and the rest) are untouched. They
   are semantic rather than brand, they are inline so they survive printing, and
   repainting them in Lofty's colours would make "at risk" and "on track" the same
   colour.

2. **Word export is loaded on demand.** `ReportDocument.jsx` imported `core/docx.js` at
   the top of the file, which pulls the ~1.5 MB `docx` package into the main bundle for
   everybody who opens the app. It is now `await import('../core/docx.js')` inside the
   Word button's handler, so it arrives as its own chunk when somebody clicks. The button
   already renders an "Export failed" state, so a chunk that cannot be fetched reports
   itself. `index.js` does not re-export `reportToDocxBlob` for the same reason.

3. **`SharedReportPage.jsx` was removed**, along with the module's `adapters/supabase/`
   and `adapters/memory/`. Public share links are not wired (see below) and the stores go
   through the app's repository, so all three were dead code referencing ports nothing
   implements.

4. **One line of copy.** The empty document's hint named the entities of the app the
   module was extracted from ("tools tables, boards, team costs, pipelines and canvas
   sketches"). It names Lofty's now.

5. **A `house` header style**, in `themePresentation()` (`components/ReportDocument.jsx`)
   and `docxPresetFromTheme()` (`core/docx.js`). Lofty's document template puts a **2pt
   Crisp Orange rule under every section heading** — the brand kit's Level 2 — where the
   module's built-in styles draw a grey hairline. It is a new style rather than a change
   to the existing ones, so the module's own four themes still look the way the module
   intends. The docx preset is one of the two edits inside `core/` the module's own
   `AGENTS.md` sanctions ("change `DOCX_STYLE_PRESETS` in `core/docx.js`" to match a
   brand).

   Worth knowing while you are in there: the HTML serialiser already draws a 2px accent
   rule under `h2` for **every** theme, so it and the React view disagree for the
   module's built-ins. That is the module's own inconsistency and is left alone; under
   `house` all three renderers agree.

## The three adapter files

Everything Lofty-specific is here and nowhere else.

| File | What it decides |
| --- | --- |
| `adapters/lofty/widgets.js` | The twelve blocks: what is worth reporting on, and how each one renders when it has nothing |
| `adapters/lofty/theme.js` | The house document format, imported from `data/export/houseFormat.ts` rather than retyped |
| `adapters/lofty/store.js` | Two stores — the library and the documents — over the repository seam |

Two blocks are worth knowing about because neither is in the module:

- **`recordProperties`** reads `property_values` for the job or project a document is
  about, through the app's own `formatValue` (`data/propertyFormat.ts`). It is the same
  formatter the job drawer uses, deliberately — two implementations would eventually
  render the same pour date two ways.
- **`librarySection`** expands a saved section, resolved live. The expander lives in
  `TemplateBuilderPage` because it needs the engine, and it carries a depth counter: a
  section holding a Library-section block pointing at itself is two clicks to build and,
  without the counter, a frozen tab.

## The documents look like every other Lofty document, and that is enforced

`adapters/lofty/theme.js` builds the Lofty theme from **`src/data/export/houseFormat.ts`**
— the same palette the app's PDF and Word writers have used since 0026 (Foundation Black
ink, Eco Green headings, the Crisp Orange Level 2 rule, the `#f6f7f7` table header) and
the same font rule (Helvetica first; the brand face Fieldwork Geo cannot be embedded in a
`.docx`, and Arial is never the fallback).

The first version of this file read `theme/tokens.css` instead and produced a teal-inked
document. It looked like Lofty and was wrong: a document built here and a table exported
from Jobs land in the same email, and they were two different looks.

`npm run check:report-widgets` asserts the theme role-for-role against the house palette,
so the two cannot drift apart again.

**The builder's own chrome is a separate question** and still wears the app's UI teal from
`theme/tokens.css`. A document and the tool that made it may look different; a document
and another document may not.

## What is not wired, and what that costs

- **Public share links.** The store implements none of the three share methods, so the
  builder hides its Share panel. The columns exist (`0094`) and the endpoint is written
  (`app/supabase/functions/report-share/`) and **not deployed** — read that folder's
  README before switching it on, because two things in it are deliberately left empty so
  an accidental deploy achieves nothing. Sending a document out today means exporting it.
- **`SharedReportPage.jsx`** is not vendored, for the same reason — there is no public
  route to render it on yet.

## Re-syncing from `modules`

```bash
rsync -a --delete <modules>/packages/report-builder/src/core/ core/
rsync -a --delete <modules>/packages/report-builder/src/components/ components/
rm components/SharedReportPage.jsx
```

Then re-apply changes 1, 2 and 4 above, run `npm run build`, and open a template. The
adapters are ours and are never overwritten.
