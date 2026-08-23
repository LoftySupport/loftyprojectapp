# Handoff

Everything a new session needs to pick this up. Read this first, then `schema-plan.md`.

**Phase A is done and applied. Next job: [Phase B, the import](#next-phase-b-the-import)** —
and before it, the spine review described there, because that is the only category of
change that gets expensive once 200 jobs are in.

Last updated: 2026-08-21.

---

## Session of 2026-08-21 — Phase A built, applied and proved

### Where it actually stands

Verified against `gmekuqdjemrfuurxhuib` on 21 August, not remembered:

| | |
| --- | --- |
| Tables | **24**, every one with RLS enabled |
| Policies | **70**, none missing a `WITH CHECK` on an UPDATE |
| Views | **10**, every one `security_invoker` |
| Security advisors | **0 errors** (72 warnings, all understood — 68 are pg_graphql discoverability, 3 are the `SECURITY DEFINER` helpers the policies need, 1 is leaked-password protection, irrelevant behind Entra) |
| Migrations | **35 applied**, 33 files |
| People | 47 profiles, 45 team memberships, 15 teams, 9 lifecycle stages |
| Records | **0 projects, 0 jobs** — Phase B has not run |
| Repository methods reading Supabase | **15 of 18** |

**The two migrations with no file are both accounted for**, which is worth recording
because "the repo cannot rebuild production" was a live worry:

- `0014_revoke_recreated_audit_function` — its content was folded into the repo's
  `0013`, which carries both revokes. Checked rather than assumed: replaying the repo
  files alone produces `log_activity_audit` with no EXECUTE for `anon`, `authenticated`
  or `PUBLIC`, which is what production has.
- `move_profiles_backup_out_of_the_api` — moved an ad-hoc backup table out of `public`.
  A rebuild from empty never creates that table, so there is nothing for a file to do.

### What was built

Migrations `0024`–`0033`. Teams became a lookup table; the stage enum was reconciled to
the nine live values; `projects` and `jobs` moved to natural keys under the
prefix-everything naming convention; then pipelines and position, tasks and dependencies,
variations, and documents/comments/tags.

The four axes are separate tables, deliberately, and merging any pair destroys something
that cannot be recovered afterwards — see `schema-plan.md`.

### The sign-in outage, and what it taught

Sign-in broke twice on the same day and both causes are worth carrying forward.

1. **PGRST201.** `profile_teams` has three foreign keys to `profiles` — `profile_id`
   plus `created_by`/`updated_by` from the audit quartet — so an unqualified
   `profile_teams(...)` embed is ambiguous and PostgREST refuses it. The query deciding
   whether you are signed in went through that embed. **Every table with the audit
   quartet has this shape**, so every future embed of one must name its constraint.
2. **A trigger on `auth.users`.** `log_login_activity_from_auth_users()` still wrote
   `profiles.last_login_at` and matched `auth_user_id`, both renamed in `0028`. It fires
   on every sign-in, so the trigger raised, the update rolled back, and there was no
   session at all.

The lesson from the second is in `0033`'s header: *"which functions reference this table"
is a question to ask the database, not one to answer from a function's name.* The rewrite
list for `0028` was built by reading names out of `pg_proc`; this one reads like a logging
helper and the write to `profiles` is four lines into the body.

Neither could have been caught by the harness as it stood — `0008` explains that no
migration here can create a trigger on `auth.users`, so the throwaway database differed
from production in exactly the place that broke. `replay.sh` now creates it afterwards,
where it is superuser and may, and `behaviour.sql` simulates a full sign-in.

Both outages presented as *"your account is not set up"* because two `catch` blocks
swallowed the error. `AuthProvider` now fails closed **and** reports.

### The placeholder sweep

Every page and form was audited against the live database. Four different things were
occupying the screen while their table was unavailable, and they all looked identical:

| | |
| --- | --- |
| `{{table.column}}` tokens | Working as designed — they announce themselves |
| Invented records | 5 projects and 11 jobs generated at render time. `PRJ-001-02` read as a decision the app had made, and every figure on Reports was arithmetic over a fixed array — "45% on track" counted positions in an 11-item status cycle |
| Correct but not live | Stages and teams, right but read from a TypeScript seed while real tables held the rows |
| Invented process | 36 checkpoints, 11 property definitions and a team-per-phase mapping that **disagreed with the database** — none of it from Lofty |

All four are resolved: the boards read real records, the lookups query, and the two that
have no table (`pipeline_stage_tasks`, `property_defs`) return empty with the screens
saying so. The eleven property definitions are preserved in `schema-plan.md` as the
Phase C starting point rather than deleted.

Two defects fixed along the way, both live at the time:

- **Creating a project lost it.** `createProject` wrote to Supabase; `listProjects` still
  answered from a stub that returns `[]`. The row was inserted, the number was issued,
  and neither the board nor the New job picker could see it.
- **Five property definitions never rendered.** They named a stage that does not exist
  (`"Sales & acquisition"` with a lowercase a), so Setup → Properties counted eleven in
  its heading above a table of six.

### `verify/seeds.sh` — the class of bug behind most of the above

Two lists that must agree, written in two places, with nothing noticing when they stop.
Three got past review in a week: the property definitions above, a commented-out query in
`listProjects` naming five pre-`0028` columns, and eight data-dictionary entries marked
`created` for view columns renamed by `0028`.

`seeds.sh` asserts all of it — seeded stages and teams against their tables, every column
in each `*_COLUMNS` select list, and every `created` dictionary entry. **Each assertion
was watched failing before being trusted.** It also reports, without failing, that 188
real columns have no dictionary entry: everything from `0030`–`0032`.

---

## Session of 2026-08-16 — what changed, and what is still open

> **Superseded in places.** Kept for its reasoning. Anything it calls "next" was
> done in the 21 August session above, and the schema it describes predates `0024`–`0033`.

### Applied to the live database

`0020`–`0023` are **applied** to `gmekuqdjemrfuurxhuib`, not just written. `supabase
migration list` is the check if that ever looks doubtful.

| | |
| --- | --- |
| `0020` | Backfills `auth_user_id` for anyone whose auth user predates their profile. A no-op now; kept for the case below. |
| `0021` | Drops `profiles.preferred_name`. `profile_display.greeting_name` is `first_name`. |
| `0022` | Folds `profile_teams` into `profiles.teams team[]`, normalised on write, GIN indexed. |
| `0023` | Requires `original_address_id`, `created_by` and `job_number`; adds `jobs.old_job_number`; fixes project numbering. |

### Six faults found, all fixed — the shapes are worth knowing

1. **`create or replace view` does not preserve `reloptions`.** Rewriting `profile_display`
   silently dropped the `security_invoker = on` from `0001`, which would have left the view
   executing as its owner and returning every name in the company past the policies on
   `profiles`. Exactly what `0001`'s own comment warns about. **Any migration touching a
   view must re-apply `security_invoker` and assert on `pg_class.reloptions` afterwards.**
2. **`created_by` was never populated.** Not by the app, not by a trigger — every row ever
   written left it null. `stamp_created_by()` fills it now, falling back to a system
   account when there is no JWT.
3. **Project numbers were not sequential** — 1000, 1002, 1004. `bump_project_no_seq` asked
   its question with `nextval`, which consumes rather than reads. It uses
   `pg_sequence_last_value` now.
4. **The toolbar filters filtered nothing.** The chips rendered and were never applied to
   any row; only the header search narrowed results. `FILTERABLE` is now only the fields
   the data actually carries — "Team member", "Type" and "Tag" came off it and go back when
   their columns exist.
5. **A backfill that claimed to be re-runnable was not.** Caught by running it twice against
   fixtures, not by reading it.
6. **The team picker labelled the first chip "(primary)"** after `0022` had made
   `profiles.teams` a sorted set. The database reorders on write, so that label had stopped
   being able to be true.

### App changes

Records have URLs (`/jobs/:jobNumber`, `/projects/:projectNumber`, flat — a job number
already carries its project). Board state — view, grouping, filters, saved view — is in the
query string, defaults omitted, writes replacing rather than pushing. Saved views are the
phases of the build. Nav moved to a collapsible left rail that becomes a drawer below
900px. Dashboard, User settings and the Admin picker read the profile instead of showing
tokens.

**The binding template's rule got sharper and is worth keeping:** a `{{table.column}}` token
means *the app cannot answer yet*. An empty value from a wired column is a different answer
and gets a message — "No team assigned — ask an administrator to add you to one" — because
only one of those two is the reader's to act on.

### Open, in rough priority order

1. **The preconstruction pipeline.** Lofty tracks stage 4 through ~10 positions plus three
   terminal states (`Initial Documents` … `Build Commences [Closed Won]`, `Not Proceeding
   [Closed Lost]`, `In Doubt / On Hold`), and jobs should land there by default. Three
   things block building it, and guessing any of them is how the phase split got done twice:
   whether those values are a roll-up of the 57 steps in `preconstruction-process.md` or a
   separate list; whether "stage 4" means the app's stage 4 alone or 4 and 5 together, since
   Lofty's own numbering merges them; and where the three terminal states live, given
   `record_status` already has `on_hold` and `cancelled` and two places recording the same
   fact will drift.
2. **The 57 preconstruction steps have no home.** `template_checkpoints` is the nearest
   structure and its seeded rows are **four invented placeholders per stage** — not Lofty's.
   Mapping the steps onto stages, deciding which are skippable, and deciding whether their
   SLA days should drive the board's "days in stage" are all business decisions.
3. **`0007` fails on a fresh database.** It comments on `activity_audit`, which `0008`
   creates. One `comment on` statement, so the cost is a missing comment — but a clean
   rebuild does not apply without reordering.
4. **"Not set up yet" misreports a dead session.** When the session's auth user has been
   deleted, `getUser()` fails, the catch treats it as "no profile", and the page says the
   account is not on the Lofty team list. It is neither true nor actionable, and it cost an
   hour of debugging. It should detect an invalid session and clear it.
5. **Linking is not self-healing.** `0015`'s trigger is `after insert on auth.users`, so it
   fires once per person. Anyone added to `profiles` *after* they have signed in never
   links, and `0020` has to be re-run. Fixing it properly means a trigger on `auth.users`,
   which per `0015` can be created and never dropped — so it is a decision, not a chore.
6. **"Post-construction" is an inferred name.** The business named preconstruction and
   construction. What stages 7–8 are called, and whether they are one phase or two, has not
   been said. `app/src/data/savedViews.ts` says so at the point of definition.
7. **A naming collision.** The *phase* Preconstruction contains a *stage* also called
   Preconstruction, so a saved-view tab and one of its five columns share a name. Lofty's
   own vocabulary, left alone.
8. **Two profiles have no team**, so they exercise the empty state rather than the value.
   The dashboard's three teammate avatars are still hardcoded — deriving them needs a query
   and a decision about what "your team" means when somebody is in several.

### What is actually wired

`profiles` (47 rows) is the only business table with data. `addresses`, `projects` and
`jobs` exist and are empty. `property_defs`, `property_values`, `comments`, `activity`,
`permission_grants`, `template_phases` and `template_checkpoints` **do not exist yet** — the
lookups fall back to the seed in `stubRepository.ts`, which is why boards render columns
with nothing in them. Every remaining token on screen is one of those two cases.

---

## What this is

`amberbeaumont/loftyprojectapp` — the V0 build of Lofty's job pipeline board. React,
Vibe (monday.com's design system) and Supabase.

The schema is being designed one table at a time and the app is built ahead of it, so
every value that will come from a table renders as a `{{table.column}}` token — an
unbound field is visible rather than silently blank.

The migrations **are** applied, through `0023`, to the `loftyprojectapp` project
(`gmekuqdjemrfuurxhuib`, ap-southeast-2). A schema change means re-running the migration
against that project; `supabase migration list` is the check for whether the two have
drifted.

**`profiles` is no longer empty: the forty-five seeded staff are there, people have signed
in, and linking works.**
`auth.users` is no longer empty. Several rows there have been created and deleted during
setup, so `login_activity` holds entries pointing at ids that no longer exist — that is
audit history and is meant to stay. Note the consequence, because it bit once: deleting an
auth user sets its profile's `auth_user_id` back to null via `on delete set null`, and the
browser holding a token for the deleted user keeps presenting it until somebody signs out.

The link was proved against the live database rather than reasoned about: inserting an
`auth.users` row for `amber@loftybg.onmicrosoft.com` linked it to Amber Beaumont as
`superadmin`, an insert for `nobody@example.com` created nothing, and the profile count
stayed at 45. Run inside a transaction and rolled back.

The client is wired too: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set
on the Netlify project for every deploy context, so `supabaseRepository.ts` builds a real
client instead of returning null. Locally they come from `app/.env.local`.

**Auth has landed, and the data path is open.** Reads are gated on `is_active_user()`,
so a signed-in person with an active `profiles` row reads real rows and everyone else
reads none. Where a table is not wired yet the repository still falls back to seed data
deliberately: a half-built database should degrade to the structure, not to a blank
screen.

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

`"external": {"azure": true, "email": true}` is the problem: the email provider hands a
session to any address on earth that can receive a confirmation link. Single-tenant
Entra, `xms_edov`, the tenant URL — all of it is the lock on the front door, and this is
the window next to it.

Fix: **Authentication → Sign In / Providers → Email → off.** Lofty has no
email-and-password users and never will; the directory is the source of truth. Then
re-run the curl above and confirm `email` is gone — the same read-it-back rule as the
Netlify variables.

**What actually stops it today, and why that is not luck.** 0009 moved every read policy
off `using (true)` and onto `is_active_user()`:

```sql
select exists (select 1 from profiles p where p.id = auth.uid() and p.active)
```

So holding a session is not enough — reading needs an **active `profiles` row**. A
self-service email signup has no profile, so it reads nothing. The profile row *is* the
grant.

Since `0015` the profile row is never created by signing in — it is created by hand and
only *linked* at sign-in, and the link is matched on `login_email`. So an email signup
from an unknown address matches nothing, gets no profile, and reads nothing. The staff
list is what closes this, not a provider check.

That is defence in depth, **not a substitute for turning the provider off.** Leaving an
open signup form pointed at the same database is a standing invitation to find the next
gap in that reasoning.

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

### How it was set up — the record, for a rebuild

Everything below is **done**. It is kept because a directory can be rebuilt, a secret
rotated, or the whole registration recreated in a new tenant, and re-deriving these
choices from scratch is how they come back subtly different.

#### 1. Register the application in Entra

At [portal.azure.com](https://portal.azure.com) → **Microsoft Entra ID** → **App
registrations** → **New registration**:

| Field | Value |
| --- | --- |
| Name | `Lofty Project App` |
| Supported account types | **Accounts in this organizational directory only** |
| Redirect URI | **Web** → `https://gmekuqdjemrfuurxhuib.supabase.co/auth/v1/callback` |

Single-tenant is the point: it is what stops any Microsoft account on earth signing in.
The redirect URI is Supabase's callback, not the app's — a common early mistake is
putting the Netlify URL here. It goes in the redirect allow list instead.

#### 2. Client ID and secret

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

#### 3. Add the `xms_edov` claim — not optional for us

Entra can emit **unverified** email domains, which lets someone impersonate an existing
account. Microsoft's own guidance is that this applies to single-tenant apps — which is
exactly what step 1 registered. Do not skip it on a rebuild.

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
the 0014 trigger has only a display name to split, and splitting is a guess.

`redirectTo` reads `import.meta.env.BASE_URL` rather than hard-coding a path, so the base
in `vite.config.ts` is the single place the app's location is decided.

### Who may sign in: the staff list, not the directory

**Authenticating and being allowed in are different things.** Anyone in the Lofty Entra
directory can complete a Microsoft sign-in — that is what a directory is for — and a
session on its own now grants nothing at all.

Access comes from a row in `profiles` that somebody created first. Signing in only
**links** to one.

That forced a schema change, because `profiles.id` used to *be* the FK to
`auth.users(id)`: a profile could not exist before the login did, which is backwards for
a staff list that exists first and has people arrive against it. So, in `0015`:

| | |
| --- | --- |
| `profiles.id` | Lofty's own key, `default gen_random_uuid()`. No longer FK to auth.users |
| `profiles.auth_user_id` | nullable FK → `auth.users(id)` **on delete set null**. Null = created, not yet arrived |
| `profiles.login_email` | the `@loftybg.onmicrosoft.com` address — the matching key |
| `profiles.email` | unchanged in meaning: their real `@lofty.com.au` address, which is what the app shows |
| `is_active_user()`, `current_permission()` | re-pointed from `p.id = auth.uid()` to `p.auth_user_id = auth.uid()` |

`on delete set null` and not cascade, deliberately: deleting somebody's Microsoft account
must unlink the staff record, never erase it. Cascade there would mean an IT offboarding
step silently destroyed their team, title and permission.

**The two emails are two columns because at Lofty they are two addresses.** The login is
`@loftybg.onmicrosoft.com`; the address everyone actually uses is `@lofty.com.au`. The
trigger matches `login_email` first and falls back to `email`, which covers the one
person whose Microsoft account simply is their everyday address.

**No match means nothing happens.** No row is created and nothing is raised — the person
holds a valid session that reads nothing, which is exactly the requirement. Raising would
abort the insert into `auth.users` and turn "not invited" into a broken sign-in.

`0016` seeds the forty-five people from the August 2026 staff list. One correction was
applied and is called out in the file: `amber@lofty.com.auy` had a trailing `y`.

Keep `permission` in `profiles` and read it from there. It must never move into JWT
`user_metadata`: that field is user-editable, so an authorization check against it can be
edited by the person it is meant to restrict.

### The escalation that was live for about an hour

Worth reading even though it is fixed, because the shape of it will recur.

`0009` gave people an "update own profile" policy. **An RLS policy decides which *rows*
may be written, never which *columns*** — and `authenticated` held `UPDATE` on every
column of `profiles`. So this was permitted, and it satisfied the policy:

```sql
update profiles set permission = 'superadmin' where auth_user_id = auth.uid();
```

Every gate in the app reads `profiles.permission`, and `current_permission()` reads it
for every policy in the schema. The check meant to stop them was the one they had just
rewritten. `active` was the same fault in reverse: a deactivated person could switch
themselves back on.

The handoff already contained the reasoning — *"that field is user-editable, so an
authorization check against it can be edited by the person it is meant to restrict"* —
written about JWT `user_metadata`. It applied to a column the whole time, and nobody
noticed because the sentence had "JWT" in it.

**`0018` fixes it with a trigger, not column grants.** Grants are per *role*, and admins
are `authenticated` too, so revoking `UPDATE(permission)` from the role takes it from the
people who are supposed to have it. The distinction being drawn is between two users of
the *same* role — which a trigger can see and a grant cannot. `auth.uid() is null` passes
through so migrations, seeds and the service role still work.

**`0019`** then protects `preferred_name` as well, per Lofty: an admin sets that too. That
leaves nothing on `profiles` a non-admin may write, so "update own profile" is **dropped**
rather than left in place. A policy granting a right nothing can exercise reads as
evidence that self-service exists, and the next person adding a column would assume it is
self-editable because the policy says "own profile".

The general lesson: **when a policy lets someone write their own row, ask which columns
that row contains.** RLS will not ask for you.

### Teams, and why four enum values were added

`team` was built from the pipeline — the teams that hand work to each other through the
stages. The staff list is departments, a different taxonomy, and ten of forty-five people
had nowhere to sit. `0014` adds `Commercial`, `Executive`, `Lofty General` and `Admin`.

`Admin` reads close to the `admin` value of `permission_level` and is unrelated: one is
which team someone is in, the other is what they may do. Different types on different
columns, so nothing is ambiguous to Postgres — worth knowing before writing a sentence
containing both.

Enum values can be added and **never removed** without rebuilding the type, so the four
pipeline teams nobody is currently in — `Sales Admin`, `Scheduling`, `Pre-Construction
Admin`, `Construction Admin` — stay. Two of them did turn out to have members once job
titles were read rather than the department column.

**Multi-team already worked and needed no change:** `profile_teams` is
`primary key (profile_id, team)` with a partial unique index allowing only one
`is_primary` per person. A second team is another row.

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

## Admin and Setup are different screens

Admin was Users, Teams, Properties, Permissions — two jobs on one screen. It is now:

| **Admin** — people | **Setup** — configuration |
| --- | --- |
| Users, Teams, Permissions | Properties, Dictionary, Wiring, Automations |

"Who works here and what may they do" and "how is this app configured" are asked by
different people at different times. Dictionary and Wiring were top-level nav items
sitting beside Projects and Jobs, which put configuration at the same rank as the work;
folding them in took the nav from nine destinations to eight, and moving Settings into a
menu under the user's own name took it to seven. Both old routes still resolve — they
were in the nav for weeks and are in bookmarks.

The Setup section is in the path (`/setup/dictionary`), not in component state, so a link
to a tab is a link somebody can send.

**Properties is deliberately read-only.** There is no create form: definitions are
superadmin's and arrive by migration, which is what Lofty asked for at this stage. Note
that **`property_defs` does not exist in the database yet** — that tab is still rendering
seed definitions, and the migration to create and populate it is the next schema job.

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

> **Written before `0024`–`0033`.** The reasoning holds; several of the shapes do not —
> keys, naming, stages, teams and parties all changed. `schema-plan.md` and the migrations
> are the current record. Kept because a schema decision without its reasoning gets
> "simplified" back into a bug by the next person.

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

> **Moved.** This list is now [Still needs a decision](#still-needs-a-decision-loftys-not-mine)
> below, updated: health status and phase ownership have become the two that block real
> screens, and the property questions are unchanged.

---

## Next: Phase B, the import

Phase A is structure. Phase B is the first real data, and it is also the **checkpoint** —
anything structurally wrong surfaces here, while changing it is still cheap.

### What the import actually is

Roughly **200 live jobs** out of the old system, plus closed and cancelled ones on a
best-effort basis. The renumbering is not the hard part; two other things are.

1. **The old system has no project key.** Its job numbers are a flat five-digit sequence
   with nothing linking the jobs on one site — they are not even contiguous. Projects have
   to be **reconstructed from the address, by hand, with a person checking each grouping**.
   Getting it wrong is not cosmetic: project properties read through to every job, so a job
   filed under the wrong project silently inherits the wrong council, the wrong developer
   and the wrong site facts.
2. **Job sequence must follow lot order, not old-number order.** In Lofty's own example the
   old numbers are scrambled relative to the lots, so sorting by old number produces
   "1106-03 = Lot 4". Lot-versus-sequence confusion is forever.

Closed and cancelled jobs whose grouping is not confidently known each become a
**single-job project**. That asserts nothing nobody verified, and project numbers are cheap
integers.

`job_number_old` is a nullable unique alternate key, searchable for the life of the system —
old paperwork, SharePoint folders and invoices will carry it for years.

### The order of work

| | |
| --- | --- |
| 1 | **The spine review below** — before anything is loaded |
| 2 | Spreadsheet of the ~200 live jobs, grouped into projects and sequenced by lot, checked by a person |
| 3 | Load into `import_staging_jobs` verbatim, then create the spine from it |
| 4 | Walk the hard scenarios end to end: the corner-block rename, a project split into four lots, a variation raised in construction, a job held by three teams at once |

**Do the import before go-live.** The natural-key decision is safe *because* numbers are
assigned once and never reassigned. A number correction after Lofty is working in the app
means live job numbers moving under people, which is a different and much worse problem.
If the schedule slips past go-live, revisit that decision rather than the schedule.

---

## When to change the UI: before the import, or after?

Asked directly, and worth recording because the answer is not "one or the other". Three
categories, and **only one is time-critical**.

### 1. The spine — do it now, before Phase B

What a project *is*, what a job *is*, the number format, what a project groups, what lives
on `addresses`. These are real columns on tables the import writes into, and the groupings
are checked by hand.

Changing them afterwards means a data migration over 200 rows whose relationships a person
verified — and `job_id` goes on contracts, so it cannot quietly move.

**This is the only category that gets meaningfully more expensive after the import**, and
it is a small one. A focused half-day is enough: create a project, add its jobs, rename an
address, open the job drawer, and write down anything that makes you say *"that is not how
we work"*.

### 2. Anything that becomes a property — any time

*"I want to track X on a job"* is usually **not a schema change at all**. Properties are
rows in `property_values`, which is the entire reason that design was chosen over adding
columns. Adding one is an insert, before or after the import, before or after go-live.

New tables are the same: nothing exists to backfill, so a table added later costs no more
than one added now.

The expensive operation is **changing or removing a column that already holds data** —
not adding.

### 3. Presentation — after Phase B, and better for the wait

Layout, which columns show, how the board groups, wording, colours. Cheap to change
forever, so there is no deadline — and **designing them now means designing blind.** Every
board currently has zero rows on it. Whether grouping by team works, whether the card
carries the right four facts, whether the table needs to scroll, whether 200 jobs need
virtualising: none of those questions can be answered against an empty screen, and all of
them answer themselves the day real jobs land.

### So, concretely

```
spine review  →  import  →  UI and features  →  go-live
   (now)          (B)          (after B)
```

The one thing to watch: if a feature idea turns out to need a new column on `projects` or
`jobs` rather than a property, it belongs in step 1 with the spine, not in step 3. The test
is *"does this change what a job is, or just what we know about one?"*

---

## Still needs a decision (Lofty's, not mine)

Carried forward and still open. The first two block real screens.

1. **What makes a job "at risk"?** *Status* is what a person sets; *health* is what the
   system works out — from what? Past the phase's expected days, a required field still
   empty, a blocked dependency, some combination? Reports can no longer show a fabricated
   percentage, but it has nothing to compute a real one from either. Kanban-by-health is
   specified and unbuildable until this is answered.
2. **Who owns each phase, and how long should it take?** `pipeline_stages` now carries an
   owning team and the app reads it — but **those values were seeded by me, not by Lofty**,
   and they need confirming. `pipeline_stage_expected_days` is null for all nine; there is
   no SLA anywhere until somebody sets one.
   Three vocabularies disagree here, and one of them mixes teams with job titles: the
   preconstruction schedule names *Sales Administration*, *Contracts Administrator*,
   *Preconstruction Manager*, *Production Estimator* and *Accounts*.
3. **The real checkpoints and the real field list.** The 57-step preconstruction schedule
   and the ~1,200-step process map are the source, both still being revised, and both
   needing each step mapped to a team by hand. **Do not seed from the current map** — its
   named people are known to be stale.
4. **The `permission_grants` matrix.** Two genuine judgement calls: should a `viewer` see
   their own team's tree or the whole portfolio, and should a `manager` move a job between
   stages?
5. **Property questions** — related properties, select options, whether `required` means
   "cannot leave this stage" or "cannot create the record", and whether any field needs
   history.
6. **Finance is not a rung.** A ladder says *how much* you can do; Finance says *what you
   own*. Recommendation stands: property-level grants, since properties are already rows
   and Selections and Estimating will want the same.

---

## Phase C, after the import

| | |
| --- | --- |
| Permissions | Permission sets, the `private` schema and its helpers, entity grants |
| Property types | The property enums **alone** — never used in the migration that creates them (the `0014` lesson) |
| Properties | `property_defs` seeded from the eleven in `schema-plan.md`; `property_options`; `property_values`; `property_grants`; `property_value_history` |
| Wiring | `pipeline_stage_properties`, `pipeline_stage_tasks`, required-to-exit and required-to-create triggers |
| Process import | Team processes as pipelines; the map's steps mapped to teams by hand |
| Automations | `pg_cron` 1.6.4 and `pg_net` 0.20.4 are already installed |

One thing to carry into Phase C: **two of the eleven property definitions are already real
columns** — site address on `addresses`, project type on `projects`. They were grouped with
the properties by the app, which is worth noticing before Phase C gives a fact a second
home.

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

That last state is not dead code: a session with no profile means the `0014` trigger did
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
