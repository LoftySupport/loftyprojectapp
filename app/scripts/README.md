# `npm run responsive`

Loads every page at six real device sizes and asserts two things that were both
failing before this existed:

- **no page scrolls sideways** — `scrollWidth > clientWidth` means the layout slides
  under your thumb; it was 11px on an iPhone and 81px on a 320px phone, on every screen
- **nothing tappable is under 24×24** — the WCAG 2.2 AA floor (2.5.8)

```
npm run responsive
```

## It takes pictures

The sixth size is **1440×900** — Amber's MacBook Air, and every desk at Lofty. It was
missing until 11 September, which is why this sweep had never caught a fault at the width
the app is actually used at: 1024 is where a layout starts to have room, not where it
finally does.

The harness was already driving a real browser across every route and throwing the frame
away. `RESPONSIVE_SHOTS` keeps the frame:

```
RESPONSIVE_SHOTS=/tmp/shots \
RESPONSIVE_ROUTES=/jobs,/projects \
RESPONSIVE_SIZES=phone,desktop \
npm run responsive
```

| Variable | Default | What it does |
| --- | --- | --- |
| `RESPONSIVE_SHOTS` | off | Directory for `<size>__<route>.png`, one per page visited |
| `RESPONSIVE_ROUTES` | all 35 | Comma-separated routes to sweep instead |
| `RESPONSIVE_SIZES` | all 6 | Comma-separated device names: `phone`, `phone-s`, `phone-land`, `tablet`, `tablet-l`, `desktop` |

All three are off by default, so CI runs exactly the sweep it always did. The last two
exist because a picture run is for looking at one thing — 35 routes at 6 widths is 210
images nobody opens — and an unknown size name exits 2 rather than sweeping nothing, so a
typo cannot pass by not testing.

The directory is one you pass in, never a path inside `app/`: a screenshot is evidence for
one change, not an asset the repository carries.

Shots are **viewport**, not full-page. The rail is `position: sticky` and `100dvh` tall, so
a full-page capture of a long board draws it once at the top and leaves the rest of the
image railless.

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

# `npm run check:date-clear`

Can you take a date back? Amber, 12 September: *"when you are on a date field the reset
button isn't working — for example on a job if I hit the completion date by accident u
can't undo it. You should be able to x it out."*

Two faults wore the same coat, and this check guards both:

- **The job's completion date had no clear at all.** It was a bare `<input type="date">`,
  and the browser's own is not a promise: Chrome draws a small ✕, Safari draws nothing,
  and a phone gives you a wheel with no way back to empty. `DateField` draws its own.
- **Every property of format `date` had a clear that silently did nothing.** `onChange`
  read `if (e.target.value)`, so emptying the field told nobody and the old value stayed
  exactly where it was.

The second one is why the assertions read **what the caller was told**, not what the
input is showing — `window.saved` in the stub. A control that empties on screen and
reports nothing looks fixed in a screenshot and is not fixed at all.

## Why it does not go through the app

`stubRepository.updateJob` throws (*"Editing a job needs Supabase."*), so a date typed
into a job in the responsive harness reverts before the check can see it — which is
exactly what the first attempt at this measured. `scripts/date-clear-stub.jsx` mounts
`DateField` and `PropertyField` with local state instead: both are prop-driven, and the
question is about the control rather than the database behind it.

Both guards were watched failing before being trusted. Putting `if (e.target.value)`
back, and cutting the `onChange(null)` out of the ✕, turns four of the eleven red.
