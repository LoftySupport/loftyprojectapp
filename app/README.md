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

On Netlify these are project environment variables rather than a file, set on the
`loftyprojectapp` project for all deploy contexts and scoped to builds — Vite reads them
at build time and inlines them, so nothing needs them at runtime.

The `VITE_` prefix is what makes them visible to client code, and it is also what makes
them **public**: Vite writes the value straight into the JavaScript the browser
downloads. Only ever the publishable key here. The service role key bypasses RLS
entirely and must never be given a `VITE_` name.

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

## Not built yet

The prototype at `../index.html` is the reference for every screen. Ported so far: the
shell, navigation, themes and the board's structure. Still to come — in the order set out
in `../react-migration.md`: Table view, Board cards and drag-and-drop, the job panel,
Projects, Dashboard, Reports, Templates, Admin, Settings, then Gantt and Calendar.

Gantt, Calendar and drag-and-drop have no Vibe component; they are the only genuinely
novel build work.
