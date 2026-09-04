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
   and `adapters/memory/`. Public share links are not wired (see below) and the store
   goes through the app's repository, so all three were dead code that referenced ports
   nothing implements.

4. **One line of copy.** The empty document's hint named the entities of the app the
   module was extracted from ("tools tables, boards, team costs, pipelines and canvas
   sketches"). It names Lofty's now.

## What is not wired, and what that costs

- **Public share links.** The store implements neither `createShareLink` nor
  `fetchShared`, so the builder hides its Share panel. A share link is an anonymous read
  path around RLS served by an edge function with a service-role key; RLS is this app's
  security boundary, and nothing has asked for one. Wiring it later is a migration (two
  columns), an edge function and a public route — not a rewrite.
- **"Save as template."** The row already *is* the template, so the button would be two
  names for one thing. The builder hides it when `saveTemplate` is absent.

## Re-syncing from `modules`

```bash
rsync -a --delete <modules>/packages/report-builder/src/core/ core/
rsync -a --delete <modules>/packages/report-builder/src/components/ components/
rm components/SharedReportPage.jsx
```

Then re-apply changes 1, 2 and 4 above, run `npm run build`, and open a template. The
adapters are ours and are never overwritten.
