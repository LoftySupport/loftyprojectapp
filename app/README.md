# Lofty Job Oversight Board — React app

The real build. React + [Vibe](https://vibe.monday.com) + Supabase.

Lives in its own repo and deploys to its own Netlify site (`loftyprojectapp`), so the
prototype at `loftyprojectboard.netlify.app` is never touched and nobody arrives here
by accident.

Structure first, data second. Every screen already renders its real chrome; tables come
online one at a time behind a data seam, and nothing above the seam changes when they do.

```bash
npm install
npm run dev
```

Runs with no backend. You get the shell, the navigation, the three themes and the board's
eight columns — with nothing in them. That is the intended starting state.

---

## The seam

This is the whole idea, and the reason the app can exist before the database does.

```
    screens  ──►  Repository (interface)  ──►  stub        (empty results)
                                           └─►  supabase    (real queries)
```

- `src/data/repository.ts` — the interface. Every read the app performs is a method here.
- `src/data/stubRepository.ts` — everything resolves empty.
- `src/data/supabaseRepository.ts` — each method starts by delegating to the stub. Replace
  one body with a query, add its name to `WIRED`, and that table is live.
- `src/data/DataProvider.tsx` — picks Supabase if it's configured, the stub otherwise.

**The rule that keeps it working: no component may import the Supabase client.** If a
screen needs data that isn't on the interface, add a method — don't reach around it.

The **Wiring** page in the app shows which methods are backed by real data. It reads the
same `WIRED` list, so it can't drift from reality.

## Bringing a table online

1. Add it in `supabase/migrations`, push.
2. Replace that one method's body in `supabaseRepository.ts` with a query.
3. Add the method name to `WIRED`.

No screen changes. They already read through the seam, so a table going live shows up as
data appearing rather than as a refactor.

## Connecting Supabase

Locally:

```bash
cp .env.example .env.local     # then fill in
```

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<...>
```

**Or let the Netlify Supabase extension supply them.** A site connected to Supabase with
the Vite framework selected gets `VITE_SUPABASE_DATABASE_URL` and `VITE_SUPABASE_ANON_KEY`
— the project URL and the legacy anon key, under the extension's names. The app reads
either pair and prefers the two above when both are set, so adding a publishable key later
supersedes the anon key without anyone deleting anything. `src/data/supabaseEnv.ts` is
where that is decided.

On Netlify these are project environment variables rather than a file, set on the
`loftyprojectapp` project for all deploy contexts and all scopes. Vite reads them at
build time and inlines them, so nothing needs them at runtime — but set them with all
scopes anyway: writing one scoped to `builds` alone through the Netlify API reports
success and silently fails to persist, which is a build that quietly produces an
unconfigured bundle. Read the variable back after writing it.

The `VITE_` prefix is what makes them visible to client code, and it is also what makes
them **public**: Vite writes the value straight into the JavaScript the browser
downloads. Only ever the publishable key here. The service role key bypasses RLS
entirely and must never be given a `VITE_` name — it is not in the Netlify environment at
all, deliberately; see HANDOFF.md.

For the same reason, never mark these two as secret in Netlify. It fails any build whose
output contains a secret value, and inlining them into the bundle is exactly what they
are for.

The migrations are already applied to the project (`gmekuqdjemrfuurxhuib`). Regenerate
types when the schema changes:

```bash
supabase gen types typescript --project-id <id> > src/data/database.types.ts
```

---

## The four starter tables

Keys and relationships only — `-- + fields` marks where the rest go.

| Table | Keys |
| --- | --- |
| `projects` | `id` uuid PK · `lofty_project_number` unique |
| `jobs` | `id` uuid PK · `project_id` FK · `job_number` · `combined_lofty_job_number` **generated**, unique |
| `job_stages` | one row per job per stage · composite FK to `(job_id, project_id)` · one current stage per job |
| `user_profiles` | `id` uuid PK → `auth.users.id` |

Three decisions in there worth knowing:

**`combined_lofty_job_number` is a generated column**, not something the app writes. It
can't drift from its parts. Generated columns can't reach across tables, so the parent's
project number is denormalised onto `jobs` and kept true by a trigger — including if a
project is ever renumbered.

**`job_stages` is one row per job per stage, not a `stage_id` on the job.** A single
column would only tell you where something is now — not when it got there, how long it
sat, or which stages it skipped. A partial unique index enforces exactly one current
stage per job.

**`project_id` is carried on `job_stages`** so project rollups don't need the extra join,
and a composite foreign key stops it disagreeing with the job's own project.

## Design system

Lofty's two hero colours sit in Vibe's `--primary-*` slots via `ThemeProvider`
(`src/theme/loftyTheme.ts`). `ThemeProvider` only themes 11 primary/brand tokens, so
everything else — the accessible orange sibling, the semantic inks — lives in
`src/theme/tokens.css`. Those are the values with contrast decisions behind them; the
numbers are in `../design-system-evaluation.md`.

Two rules that are easy to lose in a rewrite: **nothing below 12px**, and **`#f47e63`
never carries text** (2.6:1 — use `--lofty-orange-strong`).

## Downloads — Excel, Word and PDF

Every list and every report has an **Export** menu offering three formats, and all three
are written here rather than pulled from a library: `src/data/export/`.

```
    a screen  ──►  ExportDocument  ──►  xlsx.ts  ──►  zip.ts     (an OOXML package)
                   (tables, rows)   ├─►  docx.ts ──►  zip.ts     (an OOXML package)
                                    └─►  pdf.ts  ──►  helvetica.ts  (A4 landscape)
```

Each format is for a different reader: the **spreadsheet** for sorting and totalling, the
**Word document** for the table that goes out under a cover note and keeps being edited,
the **PDF** for the fixed copy that prints or forwards. Adding one is a line in
`index.ts` and a writer beside the others — the menu reads the format list.

**One rule decides what goes in a file: it is what is on screen.** The rows after the
search, the filters and the sort; the columns you have switched on, in the order you
dragged them. A download that quietly returned all two hundred jobs when the toolbar said
"Showing 11 of 200" would make that line a lie in the one direction nobody checks. Where
a board or a table is grouped, each group becomes a sheet, a Word section and a page.

**A column says what it exports.** `ColumnDef.text` is required, beside `cell`, because a
cell is a React node — `<StatusPill status="at_risk" />` has no text in it at all, and a
walk over its children would export an empty Status column that nobody notices until a
report has gone out. `null` means the record has no answer and becomes an **empty cell**,
not a dash; where the screen shows a `{{table.column}}` token the file carries the same
token, because unbound and empty are different facts.

**Why not a library.** The candidates each bring a general-purpose document model —
a reader, a formula engine, an embedded font stack, a paragraph/section builder — for a
job that is a handful of small XML parts and text at coordinates. What is actually hard is
the OOXML and the PDF cross-reference table, not the archive (`zip.ts`, shared by the
spreadsheet and the Word document), and all of it is checked:

```bash
npm run export-check
```

It re-parses each package from the bytes out, re-computes every entry's checksum with
Node's `zlib.crc32` rather than the app's own, walks the PDF's xref and the Word table's
tag balance, and asserts the things that make an export wrong rather than broken: a job
number typed as a date, a null written as a dash, an unbound column exporting as blank.
See `scripts/export-check.ts`.

## Not built yet

The prototype at `../index.html` is the reference for every screen. Ported so far: the
shell, navigation, themes and the board's structure. Still to come — in the order set out
in `../react-migration.md`: Table view, Board cards and drag-and-drop, the job panel,
Projects, Dashboard, Reports, Templates, Admin, Settings, then Gantt and Calendar.

Gantt, Calendar and drag-and-drop have no Vibe component; they are the only genuinely
novel build work.
