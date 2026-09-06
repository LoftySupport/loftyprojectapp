# Moving to the real build — React, Vibe and Supabase

> ## ⚠️ Historical — superseded
>
> Written **before** the schema decisions of 1 August 2026. Its table shapes, role model
> and field names are out of date: `users` became `profiles`, roles became the
> `permission_level` enum, `1201`-style numbers became `PRJ-`/sequential, divisions and
> job types are gone, and addresses became their own table.
>
> **Current sources of truth:** `HANDOFF.md`, `docs/schema/data-dictionary.md`, `docs/schema/supabase-schema.md`.
>
> Kept because the reasoning about *approach* — the seam, the build order, the Vibe
> component mapping — still holds, and because it records what was thought at the time.


The prototype applied Vibe's *system* to a single static HTML file with fifty hard-coded
jobs. The real build is a React application using Vibe's actual components, with Supabase
as the backend.

Read `design-system-evaluation.md` for why the design decisions are what they are, and
`vibe-catalog-status.md` for the component-by-component state of the prototype.

---

## Step one

**Rebuild as React with Supabase connected — before porting any UI.**

The temptation is to port the views first, because that is the visible part. Don't. The
prototype's fifty jobs are a JavaScript array, and every derivation, filter and permission
check in it assumes synchronous access to the whole dataset. Standing up React and Supabase
first means the components are written against the real data shape once, rather than
written against the array and then rewritten.

Concretely, step one is done when:

- A Vite + React + TypeScript app renders in Lofty's colours with the three themes working.
- A Supabase project exists with the schema below, seeded from the prototype's data.
- Auth works, and the signed-in user resolves to a row in `users` with a team and a role.
- Row Level Security is on, with policies matching the scope model — and a test proving a
  team member cannot read another team's jobs.
- One trivial screen reads live from Supabase. Not a view from the prototype — just a list
  that proves the connection, the types and the policies work end to end.

Everything after that is porting, which is predictable. This part is not.

---

## What you already have

The prototype is not throwaway. Roughly half the design work of a React build is done,
and the half that's done is the half that's easy to get wrong:

| Already settled | Where it lives now | How it carries over |
| --- | --- | --- |
| Brand mapping — Lofty green and orange in Vibe's `--primary-*` slots | `:root` in `index.html` | Becomes a `ThemeProvider` config (see below) |
| The accessible orange sibling `#b8482a` | token block | Stays an app CSS variable |
| Semantic inks (`--positive-ink`, `--negative-ink`, `--warning-ink`) | token block | Stays an app CSS variable |
| The 8-step phase ramp, all steps ≥4.5:1 | `ACCENTS` in JS | Port as a TS constant |
| Dark and black themes, contrast-verified | `.dark-app-theme` / `.black-app-theme` | ThemeProvider handles the system themes; keep the 4 custom overrides |
| Toolbar vocabulary — View / Group / Date / Filter by | toolbar markup | Port as component props |
| Every contrast decision, verified across 7 pages × 3 themes | — | Don't re-derive it. The numbers are in the evaluation doc |
| 67 icons chosen and mapped to their call sites | `VIBE_ICON_PATHS` | Replace with `@vibe/icons` imports — the names match |

**What you should throw away**, because Vibe gives it to you properly:

- The `MutationObserver` keyboard retrofit → `Clickable` / `useClickableProps`
- The 125 `.vibe-*` CSS classes → the real components
- The compatibility alias layer (`--brand`, `--coral`, `--accent`…) → use Vibe tokens directly
- The inlined icon path map → `@vibe/icons`
- The hand-built Toast, Tooltip and focus trap → `Toast`, `Tooltip`, `Modal`

---

## Supabase

### Schema, from the prototype's model

The prototype's data already has the right shape — it was written against the concept spec.
It just lives in JavaScript arrays. The tables fall out of it directly:

| Table | From | Notes |
| --- | --- | --- |
| `divisions` | `division` on projects | Residential / Commercial / Land |
| `teams` | `owner` on jobs, `assigneeDeptMap` | **Self-referencing** — `parent_team_id`. The `team_hierarchy` scope depends on it |
| `users` | `adminUsers` | `team_id`, `role`, `active`, `source`. Keyed to `auth.users.id` |
| `projects` | `projects` | `no`, `name`, `suburb`, `type`, `division_id`, `manager_id`, `client`, `start_date`, `target_completion` |
| `jobs` | `jobs` | `no`, `project_id`, `address`, `stage`, `build_stage`, `owning_team_id`, `assignee_id`, `type`, `status`, `contract`, `deposit`, `drawings`, `notes` |
| `job_tags` | `tags[]` | Or a `text[]` column — a join table only if tags need their own metadata |
| `job_dependencies` | `dependsOn` | `job_id` → `depends_on_job_id` |
| `activity` | `activity[]` on jobs and projects | One feed table, polymorphic on `subject_type` / `subject_id`. PR #8 already merged comments and activity into one feed in the UI — match that in the schema |
| `templates`, `template_phases`, `template_checkpoints` | the Templates page | Per project type |
| `job_checkpoints` | the per-job checklist | Instantiated from the template on job creation |
| `notification_prefs` | Settings' 21-cell matrix | `user_id` × `event_type` × `channel` |
| `permission_grants` | `DEFAULT_GRANTS` | `role` × `object` × `action` → `scope` |

Two fields to drop rather than store: `days` (days in stage) and `conflict` are **derived**.
They are computed in the prototype and should be computed in Postgres — a view or a
generated column — not written by the app. Storing them guarantees they go stale.

### Auth

Supabase Auth with the Microsoft / Azure provider, so the prototype's Entra ID assumption
becomes real rather than being replaced. Keep the prototype's rule that identity comes from
the IdP but **role and team are owned by this app, not by Entra** — that is already what the
Admin page says, and it is the right call. It means `users` is your table, joined to
`auth.users` by id, and role changes don't require an IdP round trip.

### Row Level Security — the part worth getting right first

The prototype's permission model is **6 roles × 5 objects × 4 actions × 6 scopes**, and it
maps almost one-to-one onto RLS policies. This is the single strongest argument for doing
Supabase before the UI: the model already exists, and expressing it as policies means the
database enforces it rather than the React app pretending to.

The six scopes, as policy predicates:

| Scope | Predicate |
| --- | --- |
| `none` | `false` |
| `own` | `assignee_id = auth.uid()` |
| `team` | `owning_team_id = (select team_id from users where id = auth.uid())` |
| `team_hierarchy` | the user's team **and every team beneath it** — a recursive CTE over `teams.parent_team_id` |
| `division` | `project.division_id = the user's division` |
| `all` | `true` |

**`team_hierarchy` is the one that will bite.** It needs a recursive CTE, and a recursive
CTE inside an RLS policy runs per row unless you wrap it. Put it in a
`security definer` function that returns the set of visible team ids for the current user,
mark it `stable`, and call that from the policy. Get this right in step one — retrofitting
it after the views exist means re-testing every screen.

Also: the prototype's `can()` capability checks (`editJob`, `pushToJobs`, `canDelete`,
`manageTeams`) are UI affordances, not security. They still belong in the React app for
hiding controls — but every one of them needs a matching policy, or they are decoration.

### Things the prototype fakes that become real

- **Push to jobs** writes to many rows at once. As a Postgres function, transactional,
  rather than a loop in the client.
- **Notifications** are derived on read in the prototype. In the real build they are rows
  written by triggers and automation rules, with per-user read state — which is what the
  code comment there already says.
- **Job numbers** (`1201-01`) are derived from the project number. That is a sequence per
  project, generated in the database, not in the client.
- **The AI assistant** currently keyword-matches over the local array. Against Supabase it
  becomes a query layer, or it does not survive. Decide before phase 7.

---

## Stack

```bash
npm i @vibe/core @vibe/icons @supabase/supabase-js
```

- **`@vibe/core` 4.5.3** — peer deps `react >=16.9`, `react-dom >=16.9`. Use React 18 or 19.
- Vibe 4 is current. If you scaffold from an older template, `npx @vibe/codemod --migration v4`
  handles the v3→v4 breaking changes.
- The Vibe MCP server is already wired up in `.mcp.json`, so your editor can answer
  component-API questions during the port without leaving the file.

**Two global setup steps Vibe requires** (both easy to miss):

```css
/* Vibe components assume border-box globally */
*, *::before, *::after { box-sizing: border-box; }
```

```html
<!-- Vibe does not ship fonts -->
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@300;400;500;600;700&family=Poppins:wght@300;500;600;700&display=swap" rel="stylesheet">
```

---

## Brand colours: use ThemeProvider, but know its limit

Vibe's `ThemeProvider` takes a **product theme** — per-system-theme overrides of specific
colour tokens. That is the correct home for Lofty's green and orange:

```tsx
import { ThemeProvider } from "@vibe/core";

const loftyTheme = {
  name: "lofty",
  colors: {
    light: {
      "primary-color": "#005058",
      "primary-hover-color": "#00393f",
      "primary-selected-color": "#d3e3e4",
      "primary-selected-hover-color": "#bcd4d6",
      "text-color-on-primary": "#ffffff",
      "brand-color": "#005058",
      "brand-hover-color": "#00393f"
    },
    dark: {
      // Lofty green is 1.3:1 on Vibe's dark canvas, so dark lightens it
      "primary-color": "#4db3bd",
      "primary-hover-color": "#59c2cc",
      "primary-selected-color": "#173c41",
      "primary-selected-hover-color": "#1d4a50",
      "text-color-on-primary": "#12141f",
      "brand-color": "#4db3bd",
      "brand-hover-color": "#59c2cc"
    },
    black: { /* inherits dark unless overridden */ }
  }
};

<ThemeProvider themeConfig={loftyTheme} systemTheme={systemTheme}>
  <App />
</ThemeProvider>
```

**The limit worth knowing before you plan around it:** `ThemeProvider` only themes
**11 tokens**, all primary/brand —

`primary-color` · `primary-hover-color` · `primary-selected-color` ·
`primary-selected-hover-color` · `primary-selected-on-secondary-color` ·
`text-color-on-primary` · `brand-color` · `brand-hover-color` ·
`brand-selected-color` · `brand-selected-hover-color` · `text-color-on-brand`

Everything else Lofty needs stays an app-level CSS variable in your root stylesheet:

```css
:root {
  --lofty-orange: #f47e63;          /* logo, decorative fills — 2.6:1, never text */
  --lofty-orange-strong: #b8482a;   /* indicators and text — 5.3:1 */
  --lofty-orange-tint: #fdeee9;
  --positive-ink: #005c35;          /* Vibe's -selected tints don't clear 4.5:1 */
  --negative-ink: #a32436;          /* against their own base colour */
  --warning-ink: #6b5000;
}
.dark-app-theme {
  --lofty-orange-strong: #ff9478;
  --lofty-orange-tint: #3d2a24;
  --positive-ink: #7ce8bd;
  --negative-ink: #ffb3bc;
  --warning-ink: #ffdf80;
  --secondary-text-color: #a8abb8;  /* Vibe's #9699a6 is 4.38:1 on its own dark grey */
}
```

---

## Component mapping

The port is mechanical for most of the UI — the prototype was built to these components'
measurements, so the visual result should be near-identical.

| Prototype | Vibe React |
| --- | --- |
| `.new-job-btn` `.modal-create` `.ai-send` … | `<Button kind="primary" size="small">` |
| `.modal-cancel` `.ai-clear` `.request-access-btn` | `<Button kind="secondary">` |
| `.tmpl-add` `.push-link` `.clear-btn` | `<Button kind="tertiary">` |
| `.admin-delete` | `<Button kind="secondary" color="negative">` |
| `.drawer-icon-btn` `.expand-btn` `.modal-close` | `<IconButton size="small" ariaLabel=…>` |
| `.status-pill` `.pd-chip` `.feed-tag` | `<Label kind="fill" color=…>` |
| `.filter-chip` `.notif-filter` `.tmpl-type` | `<Chips onDelete=… >` |
| `.notif-count` `.column-head .count` | `<Counter>` |
| `.avatar` `.pd-avatar` / `.pd-avatars` | `<Avatar>` / `<AvatarGroup>` |
| `.prop-input` `.header-search` | `<TextField>` / `<Search>` |
| `.prop-textarea` | `<TextArea>` |
| `.vibe-toggle` (Settings) | `<Toggle>` |
| `.drawer-select` `.toolbar select` `.filter-chip-select` | `<Dropdown>` — **an upgrade**, see below |
| `.job-table` `.lead-table` `.admin-table` | `<Table>` + `TableHeader` / `TableRow` / `TableCell` |
| `.sub-nav-item` `.drawer-tab` | `<TabList>` / `<Tab>` / `<TabPanels>` |
| `.modal-card` and parts | `<Modal>` + `ModalHeader` / `ModalContent` / `ModalFooter` |
| `.filter-menu` | `<Menu>` / `<MenuItem>` |
| `.ask-callout` `.requested-flag` | `<AttentionBox>` |
| `#prototypeBanner` | `<AlertBanner>` |
| `vibeToast()` | `<Toast>` |
| `[data-tooltip]` | `<Tooltip>` |
| `.prop-collapse` | `<ExpandCollapse>` |
| `.daterange-*` | `<DatePicker mode="range" endDate=… >` — **native, see below** |
| `.vibe-text` / `.vibe-heading` | `<Text>` / `<Heading>` |
| `highlightMatch()` | `<TextWithHighlight>` |
| `.vibe-box` / `.vibe-flex` | `<Box>` / `<Flex>` |
| `.vibe-button-group` (theme switcher) | `<ButtonGroup>` |
| every clickable `div` / `tr` | `<Clickable>` or `useClickableProps` |
| `vibeIcon("Close")` | `import { Close } from "@vibe/icons"` — names match |

**Two places where the React build gets something the prototype couldn't have:**

- **Dropdown.** The prototype uses native `<select>`. Vibe's `Dropdown` adds search,
  multi-select, grouping and custom option rendering — worth using immediately on the
  Team, Assignee and Filter selects, which have enough options to need it.
- **DatePicker.** The hand-built range popover becomes `<DatePicker mode="range">`,
  which Vibe supports natively (`mode`, `date`, `endDate`, `onDateChange`).

---

## What has to be rebuilt rather than ported

The view layer is a rewrite. The rest is not.

| | Size | Verdict |
| --- | --- | --- |
| 31 `render*` functions building HTML strings | ~4,000 lines | **Rewrite as components.** This is the bulk of the work |
| 43 `innerHTML` assignments | — | Gone — React owns the DOM |
| 93 inline `onclick` attributes | — | Become props |
| 22 mutable module-level variables | — | **Rewrite as state.** See below |
| 4,700 lines of CSS | — | Mostly deleted; keep the ~40 app-specific rules (Gantt, board columns, calendar grid) |
| Data model (`jobs`, `projects`, `stages`, templates, permissions) | ~1,500 lines | **Ports nearly as-is.** Move to TypeScript types + a data module |
| Derivations (`projectStatus`, `projectProgress`, `estimatedDurationDays`, `columnAccent`, `jobMatchesQuery`, notification building) | ~600 lines | **Ports as-is.** Pure functions, no DOM. Unit-test them on the way in |
| Permission model (`can()`, capabilities, scopes) | ~200 lines | **Ports as-is** |

### The 22 state variables, grouped

They fall into four clean buckets, which is your state architecture:

- **Route** — `currentPage`, `currentReport`, `currentProjectNo`, `currentDrilldown`,
  `currentDrawerJobNo`, `adminTab`, `drawerTab`, `templateType` → **URL / router state.**
  Making these routable is a real UX win: today nothing in this app is linkable.
- **View preferences** — view mode, group mode, `calendarMonth`, `headerCollapsed`,
  `drawerFullscreen`, `currentTheme` → **persisted UI state** (context + `localStorage`).
- **Filters** — `activeFilters`, `dateRange`, search query → **one filter context**, and
  worth putting in the URL too so a filtered board can be shared.
- **Drafts** — `newJobDraft`, `pushDraft`, `newProjectDraft`, `aiDockMessages`,
  `drawerSearchQuery` → **local component state**, discarded on close.

---

## Three things Vibe does not give you

Plan for these — they are the only genuinely novel build work.

1. **Gantt.** No Vibe component. The prototype's is hand-drawn (day columns, absolutely
   positioned bars, an SVG dependency layer). Either port that code as a component or
   adopt a library. It is the most complex view in the app.
2. **Calendar.** No Vibe component. The month grid is ~120 lines and ports easily, but
   it is yours to maintain.
3. **Drag and drop.** No Vibe component. The board's card-between-columns drag uses the
   native HTML5 API. In React, use `dnd-kit` (keyboard-accessible out of the box, which
   the current native implementation is not).

Also worth planning: at real data volume the board and table will need
`VirtualizedList` / `VirtualizedGrid`. Fifty dummy jobs hides this; a live pipeline won't.

---

## Suggested sequence

Each phase should end somewhere you could stop.

**1. Shell + Supabase** — Vite + React + TypeScript, `ThemeProvider` with the Lofty config,
fonts, `box-sizing`, router, the three system themes switchable. Supabase project, schema,
seed from the prototype's data, Auth via the Microsoft provider, RLS on with the scope
policies. Done when: the five bullets under **Step one** above are all true, including the
test that a team member cannot read another team's jobs.

**2. Data layer** — generate types from the schema (`supabase gen types typescript`), then
port the derivations and capability checks into typed modules against those types. No UI.
Done when: unit tests cover `projectStatus`, `projectProgress`, `jobMatchesQuery`,
`columnAccent` and `can()` — and the RLS policies have their own tests, which matter more.

**3. Chrome** — top bar, nav, the unified toolbar (View / Group / Date / Filter by),
`AlertBanner`, `Toast` layer. Done when: filters change a count on screen and the URL.

**4. Table view first, not Board** — it is the simplest view and it exercises `Table`,
`Label`, `Avatar`, `Dropdown` and the filter wiring end to end. Done when: the table
matches the prototype and is sortable (`aria-sort` — something the prototype never had).

**5. Board** — columns, cards, the phase ramp, drag and drop via `dnd-kit`.

**6. Job panel** — `Modal`/drawer, tabs, the unified activity feed, comments, the Ask
callout. Focus trap comes free with `Modal`.

**7. Projects, Dashboard, Reports, Templates, Admin, Settings** — largely composition of
what phases 3–6 established.

**8. Gantt and Calendar** — deliberately last. Highest effort, least reuse.

---

## Carry these forward deliberately

Things the prototype got right that are easy to lose in a rewrite:

- **Nothing below 12px.** Vibe's smallest text style. The old UI ran at 9.5px in places.
- **Sentence case, never all-caps.** Vibe has no caps style at any size.
- **Pills only on Avatar and Counter.** Everything else is radius 4/8/16.
- **The orange is decorative.** `#f47e63` never carries text or acts as a lone indicator.
- **Elevation only for things that float.** Panels separate with a 1px border.
- **One card width** (300px max) so a card is the same object everywhere.
- **Every clickable thing is keyboard-operable.** With `Clickable` this is free — but only
  if you actually use it instead of putting `onClick` on a `div`.
- **Re-run the contrast sweep** after the port. The script pattern is in the evaluation
  doc; it composites semi-transparent layers, which is what caught the last two failures.

---

## Settled

- **Backend and data source — Supabase.** Postgres, Auth, RLS. Schema and policy mapping
  above.
- **Framework — React**, with `@vibe/core` for components.
- **Identity — Entra ID via Supabase Auth's Microsoft provider**, with role and team owned
  by this app rather than the IdP.

## Still open

- **Does the AI assistant survive?** It is currently a keyword matcher over a local array.
  Against Supabase it becomes a query layer, or it is cut. A product decision, not a build
  one — but decide before phase 7 rather than during it.
- **Gantt.** Port the prototype's hand-drawn implementation, or adopt a library. Phase 8,
  but it is the largest single unknown in the plan.
- **The UX writing pass.** ~400 strings predate the Vibe work and have not been reviewed
  against the handbook. Don't schedule it — make it part of the definition of done for each
  phase, since you are rewriting every string anyway.
- **Data volume.** Fifty dummy jobs hides whether the board and table need
  `VirtualizedList`. Answerable as soon as real data is in Supabase, which is another
  reason step one comes first.

## One thing to guard against

The biggest risk in this rewrite is not technical — it is re-litigating settled design
decisions. The contrast values, the phase ramp, the 12px floor, the rule that the logo
orange never carries text: all of it is documented with the numbers behind it. In a fresh
codebase it will be very easy for someone to reach for `#f47e63` as a text colour because
it is "the brand colour."

Put the contrast sweep in CI during phase 1, so the system enforces itself instead of
relying on anyone remembering. The script pattern is in `design-system-evaluation.md`; it
composites semi-transparent layers, which is what caught the last two failures.
