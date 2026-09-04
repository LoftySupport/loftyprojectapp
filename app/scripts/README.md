# `npm run responsive`

Loads every page at five real device sizes and asserts two things that were both
failing before this existed:

- **no page scrolls sideways** — `scrollWidth > clientWidth` means the layout slides
  under your thumb; it was 11px on an iPhone and 81px on a 320px phone, on every screen
- **nothing tappable is under 24×24** — the WCAG 2.2 AA floor (2.5.8)

```
npm run responsive
```

It starts its own Vite server, runs the check, and stops the server again. On a machine
that has never run Playwright, install the browser once first:

```
npx playwright install chromium
```

## Why it needs its own server

Every route is behind `RequireAuth`, so a headless browser sees the sign-in page and
nothing else. `scripts/vite.responsive.ts` is the ordinary config with one alias —
`AuthProvider` resolves to `scripts/signed-in-stub.tsx` — which stands in a signed-in
superadmin so the check can reach the board, the dictionary and the create dialogs.

**That stub never ships.** It lives outside `src/`, nothing in the app imports it, and
`npm run build` does not load the config that aliases it.

## What it deliberately does not check

An element wider than the viewport *inside a scroll container*. The data tables and the
kanban board are supposed to be wider than the screen — that is what the container is
for. Only the page itself must not move.

It also cannot check what needs data. The stub repository returns no projects and no
jobs, so the board columns and the job drawer are measured by their CSS rather than by
being looked at. Re-run this against a database with the Phase B import loaded and the
board becomes a real assertion rather than an arithmetic one.

## `npm run typecheck`, and the one that looked like it

`tsc -b`. Use this, not `npx tsc --noEmit`.

The root `tsconfig.json` is a solution file — `"files": []` with references to
`tsconfig.app.json` and `tsconfig.node.json` — so a bare `tsc --noEmit` resolves it,
finds nothing to check, and exits 0. It reports a clean typecheck on a file with
undefined identifiers in it. `tsc -b` follows the references and checks the app, which is
why `build` has always run it and why this script exists: so "run the typecheck" cannot
land on the version that checks nothing.

Found on 3 September, by a change that referenced three functions it had not imported and
sailed through `tsc --noEmit`. `npm run build` caught it, as it had been doing all along.

---

# `npm run export-check`

The files the Export menu hands people — an .xlsx, a .docx and a PDF — asserted to be
real files. Roughly ninety checks, each watched failing before it was kept.

```
npm run export-check
```

Needs no browser and no server: it calls the same writers the app calls
(`src/data/export/`) and reads their output back.

## Why it exists

Every writer produces a container whose correctness is invisible. An .xlsx or a .docx with
one bad byte offset in its ZIP directory, or a PDF whose cross-reference table was counted
in characters instead of bytes, opens perfectly in one reader and reports "the file is
corrupt" in another — and neither failure can be seen by opening the download on the
machine that made it, which is the only way anybody would otherwise test this.

## What makes it independent

Each archive is re-parsed from the bytes: end of central directory, then each entry, with
every checksum re-computed using `zlib.crc32` — Node's, not the app's. A check that
verified the writer's CRC with the writer's own CRC would agree with itself about a wrong
answer. The spreadsheet and the Word document share the one `zip.ts`, so the same parse
re-checks both.

The PDF is walked the same way: every offset in the xref has to land exactly on its
`N 0 obj`, and every content stream's declared length has to reach its `endstream`. The
Word document's table markup is checked for balance — every `<w:tbl>`, `<w:tr>` and
`<w:tc>` closed — because an unbalanced table is exactly what makes Word call a file
corrupt.

## Where it needs a person

It cannot tell you the PDF is *readable* — that it is not a page of ellipses, or that the
column bands line up — nor that the Word document opens where Word actually runs. Those
were checked by opening the files: `app/scripts/ts-extensions.mjs` lets a scratch script
import the writers directly, and the data dictionary (298 rows, 13 columns) is the hardest
case the app has.

## Node loading the app's own TypeScript

`src/` is written for a bundler, so its imports carry no extension. `--import
./scripts/register-ts.mjs` adds a resolve hook that tries `.ts` on the second attempt,
which is the difference between a check that runs the shipping code and a check that runs
a copy of it kept in step by hand. Node strips the types itself (22.18+); nothing here
compiles anything.
