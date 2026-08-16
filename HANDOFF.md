# Handoff

Everything a new session needs to pick this up. Read this first, then
`data-dictionary.md`.

**Next job: [turn off the email provider](#the-open-door-beside-the-front-one), then
`jobs`.** Entra sign-in is built and the app is gated behind it. The one thing left on
auth is a door standing open beside it.

Last updated: 2026-08-16.

---

## What this is

`amberbeaumont/loftyprojectapp` — the V0 build of Lofty's job pipeline board. React,
Vibe (monday.com's design system) and Supabase.

The schema is being designed one table at a time and the app is built ahead of it, so
every value that will come from a table renders as a `{{table.column}}` token — an
unbound field is visible rather than silently blank.

The migrations **are** applied now, to the `loftyprojectapp` project
(`gmekuqdjemrfuurxhuib`, ap-southeast-2) — the eight tables exist and are empty. A schema
change means re-running the migration against that project; `supabase migration list` is
the check for whether the two have drifted.

The client is wired too: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set
on the Netlify project for every deploy context, so `supabaseRepository.ts` builds a real
client instead of returning null. Locally they come from `app/.env.local`.

**That does not mean data appears yet.** Every RLS policy grants to `authenticated`, and
there is no auth — so an unauthenticated visitor reads zero rows from every table, and
the repository's deliberate fall back to seed data on an empty result means the board
still renders its structure from `SEED_STAGES`. Real rows need Supabase Auth, which is
still to land. The connection being live is what changed; the data path opens with auth.

### The Netlify environment, and what is deliberately not in it

The Supabase Netlify extension provisions four variables of its own —
`SUPABASE_DATABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` and
`SUPABASE_SERVICE_ROLE_KEY`. None of them reach the browser, because **Vite only exposes
variables prefixed `VITE_`**. That is the whole reason the app sat on mock data with a
fully populated environment: it was a prefix mismatch, not a missing value.

**`SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` have been deleted from Netlify.
Do not put them back.** This is a static Vite build — no Netlify Functions, no edge
functions, nothing in this repo reads either one. The service role key bypasses RLS
entirely and the JWT secret mints tokens for any user, so an unused copy sitting in a
build environment is pure risk: the only thing separating it from the public bundle was
the convention that nobody types `VITE_` in front of it. If a Netlify Function ever
genuinely needs one, add it back scoped to functions only — never to builds.

Two gotchas worth knowing before touching that screen:

- **Set env vars with all scopes.** Writing one scoped to `builds` alone through the
  Netlify API reports success and then does not persist. Always read the variable back
  after writing it; the success message is not proof.
- **Never mark a `VITE_` variable as secret.** Netlify fails any build whose output
  contains a secret value, and Vite inlines these into the bundle by design — so the flag
  turns every build red. They are public keys, and that is correct: RLS is the boundary,
  not the key.

**That does not mean data appears yet.** Every RLS policy grants to `authenticated`, and
there is no auth — so an unauthenticated visitor reads zero rows from every table, and
the repository's deliberate fall back to seed data on an empty result means the board
still renders its structure from `SEED_STAGES`. Real rows need Supabase Auth, which is
still to land. The connection being live is what changed; the data path opens with auth.

**The prototype it grew from is a different repo** — `amberbeaumont/loftyprojectboard`,
frozen, still deployed at `loftyprojectboard.netlify.app` for showing people. Nothing in
this work touches it. Its PR #11 was closed unmerged as superseded.

## Sign-in: what was built, and the one thing still open

Entra sign-in is **done and in the app**. This section is now the record of how it is
put together and what it cost, not a to-do list. The registration, the claims, the
provider config and the client code are all in place; the app is gated behind them.

### The open door beside the front one

**Supabase has the `email` provider enabled with open signup, and it must be turned
off.** Check it, do not assume:

```bash
curl -s "https://gmekuqdjemrfuurxhuib.supabase.co/auth/v1/settings" \
  -H "apikey: <publishable key>" | python3 -m json.tool
```

`"external": {"azure": true, "email": true}` is the problem. Every RLS policy grants to
`authenticated`, and four of them — `addresses`, `projects`, `jobs`, `job_stages` — are
`using (true)`. So `authenticated` is not "a Lofty person", it is **anyone holding any
session**, and the email provider hands one to any address on earth that can receive a
confirmation link. Single-tenant Entra, `xms_edov`, the tenant URL — all of it is the
lock on the front door, and this is the window next to it.

Fix: **Authentication → Sign In / Providers → Email → off.** Lofty has no
email-and-password users and never will; the directory is the source of truth. Then
re-run the curl above and confirm `email` is gone — the same read-it-back rule as the
Netlify variables.

Nothing is exposed today because the tables are empty. It stops being harmless the day
the first real project lands, which is why it is the next job and not a later one.

### Why OAuth, not SAML

This is **Azure OAuth (social login)**, not Supabase's enterprise SAML SSO. Same Entra
directory, but OAuth is on every plan; SAML needs Pro and is aimed at multi-org
federation Lofty does not need. Do not follow the `platform/sso/azure` docs — those are
for signing in to the Supabase *dashboard*, a different thing entirely.

### The registration, as it stands

| | |
| --- | --- |
| Display name | `Project Management App for Lofty` |
| Application (client) ID | `f3eea05d-7f16-4a82-807d-96ae468a32b3` |
| Directory (tenant) ID | `4fa1ee97-94cb-4be5-8130-8c11845ec54e` |
| `signInAudience` | `AzureADMyOrg` — single tenant |
| Redirect URI | `https://gmekuqdjemrfuurxhuib.supabase.co/auth/v1/callback` |
| Client secret | `Supabase Auth`, **expires 15 August 2028** |

Neither ID is secret — they identify the app, they do not authenticate it. The secret
does, and it lives only in the Supabase dashboard.

**The secret expiry is a diary entry, not a note here.** Sign-in breaks
organisation-wide the day it lapses and the symptom looks nothing like an expired
credential. `"secretText": null` in the manifest means the value cannot be read back out
of Entra: if it is ever lost, the only route is a new secret.

Three checks that need no dashboard access, worth re-running if sign-in ever misbehaves:

```bash
# 1. the tenant resolves
curl -s "https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration"

# 2. the app + redirect URI are accepted — a sign-in page means yes, AADSTS50011
#    means the redirect URI is wrong, AADSTS700016 means the client ID is
curl -sL "https://login.microsoftonline.com/<tenant-id>/oauth2/v2.0/authorize?client_id=<client-id>&response_type=code&redirect_uri=https%3A%2F%2Fgmekuqdjemrfuurxhuib.supabase.co%2Fauth%2Fv1%2Fcallback&scope=openid+email+profile"

# 3. single-tenant is actually enforced — this must be REJECTED
curl -sL "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?client_id=<client-id>&…"
#    → "unauthorized_client: The client does not exist or is not enabled for consumers"
```

### 1. Register the application in Entra

At [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App
registrations** → **New registration**:

| Field | Value |
| --- | --- |
| Name | `Lofty Project App` |
| Supported account types | **Accounts in this organizational directory only** |
| Redirect URI | **Web** → `https://gmekuqdjemrfuurxhuib.supabase.co/auth/v1/callback` |

Single-tenant is the point: it is what stops any Microsoft account on earth signing in.
The redirect URI is Supabase's callback, not the app's — a common early mistake is
putting the Netlify URL here. It goes in the allow list at step 4 instead.

### 2. Client ID and secret

- **Client ID** — on the app's Overview screen, *Application (client) ID*.
- **Secret** — *Certificates & secrets* → *Client secrets* → *New client secret*. Copy
  the **Value** column, not *Secret ID*. It is shown once and never again.
- **Put the expiry in a calendar now.** Sign-in breaks organisation-wide the day it
  lapses, and the symptom looks nothing like an expired secret.
- **Tenant ID** — Overview screen, *Directory (tenant) ID*.

In the Supabase dashboard → **Authentication** → **Sign In / Providers** → **Azure**:
enable it, paste the client ID and secret, and set **Azure Tenant URL** to
`https://login.microsoftonline.com/<tenant-id>`. Without the tenant URL Supabase uses the
`common` endpoint and the single-tenant restriction is enforced only by Entra, not here.

### 3. Add the `xms_edov` claim — not optional for us

Entra can emit **unverified** email domains, which lets someone impersonate an existing
account. Microsoft's own guidance is that this applies to single-tenant apps — which is
exactly what step 1 registered. Do not skip it.

App registration → **Manifest** → back up the JSON → set `optionalClaims`:

```json
"optionalClaims": {
  "idToken": [
    { "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] },
    { "name": "email",    "source": null, "essential": false, "additionalProperties": [] }
  ],
  "accessToken": [
    { "name": "xms_edov", "source": null, "essential": false, "additionalProperties": [] }
  ],
  "saml2Token": []
}
```

### The redirect allow list — now at the root

Supabase → **Authentication** → **URL Configuration**. **The app moved out of `/app/`,
so these changed.** Site URL `https://loftyprojectapp.netlify.app/`, and under *Redirect
URLs* the deploy previews too or every PR preview fails to complete sign-in:

```
https://loftyprojectapp.netlify.app/**
https://deploy-preview-*--loftyprojectapp.netlify.app/**
http://localhost:5173/**
```

A stale `/app/**` entry here is harmless but no longer matched; the old paths 301 to the
root at the CDN, and Supabase compares against the URL the browser was sent to.

### The client call

`email` is required — Supabase Auth rejects a sign-in with no email address. `openid
profile` come with it so the token carries `given_name` and `family_name`: without them
the 0003 trigger has only a display name to split, and splitting is a guess.

`redirectTo` reads `import.meta.env.BASE_URL` rather than hard-coding a path, so the base
in `vite.config.ts` is the single place the app's location is decided.

### The gap it exposed: no `profiles` row — closed by `0003`

Signing in creates a row in `auth.users`. **It does not create one in `profiles`**, and
nothing in `0001_core.sql` does either. `0003_handle_new_user.sql` closes it: a
`security definer` trigger on `auth.users` that inserts from the Entra claims.

Three decisions inside it worth not re-making:

- **It never fails a sign-in over a name.** `first_name`/`last_name` are `not null`, and
  a not-null violation in a trigger on `auth.users` aborts the insert — which is a person
  locked out of the app entirely. So it reads `given_name`/`family_name`, falls back to
  splitting the display name on the last space, and falls back again to the email's local
  part.
- **`permission` is not in the insert.** The column defaults to `viewer`; naming it in
  the trigger would be a second place for least-privilege to be decided.
- **It does not link by email.** `on conflict (id) do nothing` deliberately does not
  catch a conflict on `email` — matching a new auth user to an existing profile by
  address is exactly the impersonation path `xms_edov` was added to close.

Insert only: a later sign-in with a changed surname does not overwrite the row, because
`profiles` is the copy Lofty owns and an overwrite would silently undo an edit.

Keep `permission` in `profiles` and read it from there. It must never move into JWT
`user_metadata`: that field is user-editable, so an authorization check against it can be
edited by the person it is meant to restrict. `app_metadata` is the safe half if a claim
is ever genuinely needed.

### The app is gated

`RequireAuth` in `App.tsx` — nothing renders without a session, not even an empty page
with the nav on it. `/signin` is the only route an unauthenticated visitor reaches.

**The cost, stated plainly: a deploy preview now needs a Lofty account to review.** A PR
can no longer be eyeballed by anyone outside the directory. That was a deliberate
choice; if it starts to hurt, the gate is one component.

Two states it handles that are easy to get wrong:

- **`loading` renders a wait, not the sign-in page.** A session restored from local
  storage arrives a beat after first paint — redirecting on it flashes the sign-in screen
  at every signed-in person on every reload.
- **A build with no Supabase client goes to `/signin` too**, where it says it is not
  configured. A gated app that quietly ungates itself when its configuration is missing
  is worse than one that stops.

### What "working" looks like

Sign in with a Lofty account, land back on `/`, and the Wiring page flips `listStages`
from **Seeded** to **Supabase**. `currentProfile` is wired alongside it, so the header
shows a real name and the permission level comes from `profiles.permission`.

Then replace the placeholder policies. Right now they are `using (true)` for
`authenticated` — **any signed-in person reads every project, job and address.** Fine
against an empty database, wrong the day real data lands, and the reason the email
provider above matters. `profile_teams` and `permission_level` exist to drive the real
scope model; the shape is in `supabase-schema.md`.

## The working rule: one branch and PR per table

Each schema decision touches four things that must move together:

1. `supabase-schema.md` — the doc
2. `app/supabase/migrations/0001_core.sql` — the migration
3. `app/src/data/types.ts` — the TypeScript
4. `app/src/data/dictionary.ts` — the dictionary (then `npm run dictionary`)

Landing those on `main` separately is how they drift. So: a branch per table, all four in
one PR, Netlify builds a deploy preview, merge when it looks right.

```bash
git checkout -b claude/<table>-schema
# … all four …
cd app && npm run dictionary && npx tsc -b && cd ..
./build.sh
git commit && git push -u origin claude/<table>-schema
```

## Where it is deployed

| URL | What |
| --- | --- |
| `loftyprojectapp.netlify.app` | The build — **the app is the site now**, not a subfolder |
| `…/dictionary` | The data dictionary, permission-gated |
| `…/signin` | The only route reachable without a session |
| `…/binding-template` | The tokenised prototype — **layout** reference only |
| `…/prototype.html` | The original, dummy data |
| `…/app/*` | 301 → the same path at the root, for old bookmarks |

The app moved out of `/app/`. Three things had to agree for that, and they still do:
`base` in `vite.config.ts`, the catch-all in `netlify.toml`, and where `build.sh` copies
the build. The router basename and the OAuth `redirectTo` both read
`import.meta.env.BASE_URL`, so they follow `base` on their own — that is the one value
to change if it ever moves again.

The catch-all is deliberately **not** `force`d. Without `force`, Netlify serves a real
file when one exists, which is what stops `/assets/*`, `/prototype.html` and the images
from being swallowed by the SPA fallback.

`binding-template` still shows the pre-simplification project (name, division, client,
manager) and the old six roles. **It is deliberately not swept forward** — keeping the
same decisions in two codebases is the drift this whole setup exists to avoid. It is the
layout reference. The React app is the field reference.

---

## Schema: what is decided

Three tables are designed and in the migration. Full detail in `data-dictionary.md`;
this is the reasoning, which is the part that does not survive in a column list.

### `profiles` — not `users`

`auth.users` is Supabase's table, populated by Microsoft Entra. `profiles` is the row
Lofty owns beside it: same person, the parts the app decides.

- **`first_name` + `last_name`, not `full_name`.** People change names, and a single
  field makes that a string edit that has to be got exactly right. `full_name` survives
  as a **generated column** so it cannot drift. `preferred_name` is nullable and means
  only "goes by something else"; null means use the first name. A `profile_display` view
  puts that `coalesce` in one place so "Hi, …" is never assembled ad hoc.
- **`permission` is an enum**, not a lookup table: `viewer | user | manager | admin |
  superadmin`. Postgres orders enum values by declaration, so `permission >= 'manager'`
  is a valid comparison — which is how the RLS policies want to read. Defaults to
  `viewer`: least privilege, so a new joiner from Entra reads and nothing else until
  promoted. Intended to sync with Microsoft Teams permission levels.
- **Team membership is many-to-many** — `profile_teams`, because people sit in more than
  one team. `is_primary` carries the single answer some screens need (which team the
  dashboard watches, what the board filters to), with a partial unique index stopping two
  primaries and nothing forcing one. Every RLS predicate went from `=` to `in` as a
  result.

### `addresses` — a record, not a string

Addresses get corrected and changed: a lot renumbered by council, a street renamed, a
typo found at handover. Everything pointing at one should follow without being edited
individually, so projects and jobs hold an id.

- **`consolidated_address` is maintained by trigger**, so every card, export and search
  reads the same string. It is deliberately *not* a generated column: a generation
  expression must be `IMMUTABLE`, and casting an enum to text is not — `enum_out` is
  `STABLE`, because `alter type … rename value` can change a label under a stored value.
  `create table` fails with "generation expression is not immutable". The trigger
  overwrites the column on every insert and update, so it still cannot be written by
  hand or drift from its parts. Built with `||` and `coalesce`, **not `concat_ws`**, so
  a null part drops its separator with it.
- **Lot and street numbers are `text`.** "12A", "5-7" and "Lot 3" are as common as 12.
- **Councils are a table, not an enum** — the one place the spec was not followed
  literally. SA has 68 and Australia about 537; they amalgamate, split and get renamed,
  and enum values cannot be renamed or removed without rebuilding the type. The table
  also carries `state`, so a picker can filter to the state already chosen.

### `projects` — deliberately simple

- **`project_no`** is an integer from a sequence starting at 1000, unique, with a check
  for the four-digit floor. Hand overrides are allowed, and **a trigger pushes the
  sequence past them** — without it the same number is handed out again months later and
  fails on the unique index, which is the worst possible time to find out.
- **Two addresses.** `original` never moves (contracts, old paperwork); `current` is what
  every card and search shows. A blank `current` falls back to `original` in a trigger
  rather than in every caller.
- Lost `name`, `division`, `manager`, `client`, `suburb`, `council_area`, `notes`.
  `client` and `notes` were repointed at `property_values` — they are exactly what a
  property definition is for. The rest come from the address.

### Status and health are different things

`record_status` — `on_track | at_risk | behind_schedule | on_hold | completed |
cancelled | archived` — sits on **both** projects and jobs. **Status is what someone
sets.**

**Health is what the system works out** — on schedule? over budget? issue raised? — from
inputs still to be decided. It is deliberately **absent from the schema** rather than
half-modelled. Inventing a column before the inputs are known bakes in the wrong answer.

`is_current(status)` is an `IMMUTABLE` function: anything not completed, cancelled or
archived. Derived wherever needed, never stored.

### Properties are rows, not columns

A property **is** a field — the two words mean the same thing. Every one lives at
**project** or **job** level and carries two pieces of context: which **stage** captures
it and which **team** captures it.

Stage is *not* a third level. A pour date is a property of a *job* that happens to be
filled in at Scheduling & Estimating.

Because they are rows, **there is no fixed number of field slots** — which is why nothing
in this app has `{{field_1}}`, `{{field_2}}`. Add a definition and one more slot renders,
everywhere the scope matches. The slots are live in the job drawer and on project detail,
grouped by stage.

### Things removed, and why

Kept in the dictionary as **Merged** rather than deleted, so the questions are not
re-asked in six months:

| Removed | Why |
| --- | --- |
| `divisions` | Never a Lofty concept. Appears nowhere in the concept spec; the prototype invented it, derived it from project type, and relabelled development work as "Land" — wrong as well as redundant |
| `job_types` | A job's type is its project's type. A commercial project does not contain residential jobs, so a second column was only a chance to disagree |
| `job_stages.is_current` | Which stage a job is in now is `jobs.stage_id`; whether the job is current is `is_current(status)`. A third copy was a third thing to keep true |
| `health_statuses` | Health is calculated, not set. Parked until the inputs are known |

---

## What needs a decision (not mine to make)

1. **The `permission_grants` matrix.** I rewrote it against the five rungs, but it is my
   reading of the definitions, not a decision. Two genuine judgement calls: should a
   `viewer` see their own team's tree or the whole portfolio, and should a `manager` be
   able to move a job between stages? In `supabase-schema.md`.
2. **Health status inputs.** When known, it gets built as a calculation.
3. **Property questions**, in `supabase-schema.md` under Properties: related properties
   (a field whose value is another record — some stop being properties and become their
   own tables); select options (an options table, or point at an existing lookup);
   whether `required` means "cannot leave this stage" or "cannot create the record";
   and whether any field needs history.
4. **Finance is not a rung.** A ladder says *how much* you can do; Finance says *what you
   own* — commercial fields — at an ordinary level everywhere else. Recommendation is
   property-level grants (`property_grants(property_def_id, permission, can_edit)`),
   since properties are already rows and Selections and Estimating will want the same.

---

## Next: `jobs`

The table is sketched in `supabase-schema.md` and its columns are in the dictionary as
**To do**. What is already settled: `project_no` denormalised with a sync trigger,
`combined_job_number` generated, the two address ids, `status` from `record_status`, and
no type column (inherited via `job_display`).

What is not: `stage_id` vs `job_stages` authority, `owning_team_id`, `assignee_id`, the
contract/deposit/drawings fields (free text today, a lookup if the states settle), tags,
and dependencies.

After that: `teams`, `property_defs` / `property_values`, `activity`, templates,
permissions.

---

## The app: things worth knowing before changing it

### The repository seam

`app/src/data/repository.ts` is the interface every screen reads through, so tables can be
wired one at a time. Its rule, in two halves: **no component may import the Supabase
client, and no component may import seed data directly.** If a screen needs something that
is not on the interface, add a method.

The second half was learned the hard way and is worth not re-learning. The lookups —
teams, template phases, checkpoints, property definitions — spent a while as module
constants in a `lookups.ts`, imported straight into nine files. They read like
configuration, but every one is a real Supabase table, and the day they were seeded all
nine files would have had to change. That is now fixed: they come through
`listTeams()`, `listTemplatePhases()`, `listTemplateCheckpoints()` and
`listPropertyDefs()`, and `app/src/data/useLookups.ts` holds the hooks that read them.

**If it will live in Postgres, it belongs on the interface, however static it looks
today.**

The stub answers the lookups honestly — they are the business process, not something a
user creates, and without them there is no board to look at. Records still resolve empty.
The Wiring page shows the two separately for that reason: a lookup serving from the seed
is real progress, a record returning empty is not.

### The header search

One `TextField` in the header, one query in `app/src/data/SearchProvider.tsx`, and every
list screen reads it. Same behaviour as the prototype: **it filters the view you are on
rather than opening a results page**, so typing on the board narrows the board, and the
query survives switching Board → Table → Gantt → Calendar and moving between Jobs,
Projects and Reports.

- **Every term must match.** `"prj-002 on track"` is an AND, not an OR — an OR would widen
  the result the moment someone typed a second word, which is the opposite of what they
  were doing.
- **`jobMatchesQuery` and `projectMatchesQuery` are shared**, not written per page. If
  Jobs searched the team and Reports did not, the same query would return different sets
  on two screens showing the same records, which reads as a bug even though both "work".
- **A project matches on its own values or on any job it holds.** Searching a job number
  and being told the project does not exist would be nonsense when the job is on it.
- **Both addresses are searched**, current and original — that is why the schema keeps the
  pair. When a match comes off an *original* address only, the screen says so once above
  the results: whoever searched is working from an old email or a contract, and the
  address they have is not where the job is now. `ShapeJob` and `ShapeProject` carry the
  two address fields unset today, because addresses are still tokenised and inventing text
  for them would put something on the board that looks like data. The hint lights up on
  its own the day `addresses` binds.
- **The toolbar filter chips are still inert.** `Showing N of M` counts the search only.

### Narrow screens

It works on a phone, and that is checked rather than assumed: every page, at 320 / 390 /
430 / 768 / 1024, under an empty query, a matching one and a non-matching one, must show
**zero horizontal overflow** with the footer at the bottom.

- **The nav wraps, it does not collapse.** Nine destinations behind a hamburger is worse
  than two rows of readable pills, and this is a tool people live in. Below 720px the
  identity cluster and search share the first line with the logo and the nav takes a
  full-width block underneath — otherwise the logo sits in a column beside three wrapped
  rows and eats 120px of every one of them.
- **Almost every overflow was a missing `min-width: 0`.** A flex or grid child sizes to
  its content's minimum unless told otherwise, and the minimum here is an unbreakable
  `{{profiles.last_name}}`. Vibe's `Text` makes it worse: it clips to one line, and a
  clipping child only shrinks when its parent is allowed to. If a new panel scrolls the
  page sideways, that is the first thing to check.
- **A track floor wider than its container is still honoured.** `minmax(320px, 1fr)` in a
  288px column overflows. `minmax(min(320px, 100%), 1fr)`.
- **The drawer close button was pushed outside the panel** by an unshrinkable title
  block. On a phone the drawer covers the full width, so there was no overlay to tap and
  no Escape key either — the panel could not be closed at all. Worth remembering as the
  shape of the bug, not just the instance: a layout fault can become a trap.

### Vibe defaults that fail accessibility

Two, both fixed, both worth knowing because they will recur:

- **The text avatar paints white on `#66ccff` — 1.8:1**, and the initials are the content.
  Overridden app-wide in `ui.css` via `[class*="circleText"]` (Vibe hashes class names but
  keeps readable prefixes). A Vibe component rendering its own avatar outside that
  selector will fail again.
- **`ThemeProvider` only themes 11 primary/brand tokens.** Everything else Lofty needs —
  the accessible orange sibling, the semantic inks — lives in `app/src/theme/tokens.css`,
  because it cannot go through the theme.

The contrast audit composites alpha against the painted backdrop before measuring. Eyeballing does not catch these.

### Other things that will bite

- **`Select.tsx` narrows Vibe's `Dropdown` once** so its generics are not fought at forty
  call sites. Use it rather than `Dropdown` directly. Only controls that can genuinely
  hold nothing are `clearable` — a filter, not a view.
- **Vibe's `title` prop renders a visible label.** In a table that is noise on every row;
  use `aria-label`.
- **`TextField` ignores `aria-label` and writes its own from the placeholder.** The prop
  is `inputAriaLabel`. A field with no placeholder and a plain `aria-label` ends up with
  no accessible name at all. Pass `id` too — the default is literally `id="input"` on
  every instance, so two on a page collide.
- **`Text` clips to a single line by default.** Any sentence longer than its container
  becomes `"Every word has to appear somew…"`, and in a full-width band it forces a
  horizontal scrollbar instead. `ellipsis={false}` wherever the words matter.
- **`TextArea` hands back the event; `TextField` hands back the value.**
- **The layout is a flex column from `html` down**, and it has to pass through
  ThemeProvider's own wrapper (`#root, #root > *`) or the footer floats mid-page.
- **`placeholderShape.ts` is layout scaffolding, not data** — five projects, one to three
  jobs each, shown only while the repository returns empty. It disappears on its own.

### The demo permission switcher — nearly gone

`app/src/data/PermissionProvider.tsx` reads `profiles.permission` for the signed-in
person, and the header `<Select>` only renders when there is no profile row to read.

That last state is not dead code: a session with no profile means the `0003` trigger did
not fire, and the app says so in a banner rather than inventing a level. Falling back to
the switcher there is deliberate — a guessed `viewer` would hide the fault, and the
fault is the thing worth seeing. Nothing consuming `can()` changed.

---

## Verification that is expected before a PR

Not optional, and all scripted against a real browser rather than assumed:

```bash
cd app && npx tsc -b        # must be clean
cd .. && ./build.sh          # must be clean
cd app && npm run dictionary # regenerate; commit the result
```

Then, in a browser against `dist/`: every page renders, the footer sits at the bottom, no
horizontal overflow **at 320, 390, 430, 768 and 1024**, no console errors, and **zero AA
contrast failures across light, dark and black**. Every commit in the history states what
was verified — keep that up.
