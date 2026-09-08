# An API and an MCP server for Lofty Hub

**A plan, not a build.** Amber, 8 September: *"create a plan to create an MCP and or API for
this app so I can connect external sources to the app and transfer data to and from the app
and also connect ai to the app … so people can use AI in the app to ask questions and find
out information … Keep security top of mind but make it easy for people to use."* And the
test it has to pass: *"On a ladder with a phone" — the person needs to be able to get an
answer about any job or project and where it is up to, any recent changes, or where a file
lives while looking at the app from a phone up a ladder.*

A readable version with the diagrams is published at
<https://claude.ai/code/artifact/0a1cfce5-b719-426c-819f-4dd12352453d> — show that one to
people; edit this file. The six questions this plan could not answer were **asked and
answered on 8 September** — the *Answered* table in [`../open-questions.md`](../open-questions.md),
rows 14–19 — and this version of the plan takes those answers. Two narrower questions they left
behind are 20 and 21 there.

Nothing in this document is built. Where it says "exists", it means a migration that is
applied today; where it says "planned", it means the sync design in
[`../schema/schema-plan.md`](../schema/schema-plan.md) → *Sync: the audit log is the change
feed*, which this plan takes as its starting point rather than redrawing.

---

## 1. What already exists, and what this plan stands on

The app was designed for this. Half the work is already in the database.

| Exists today | Why it matters here |
| --- | --- |
| **RLS on every table**, proved by `verify/rls.sql`; `is_active_user()` gates every read | The API and the MCP server do not need their own permission model. They need to run *as the caller*, and Postgres decides |
| **The five-rung ladder** viewer · user · manager · admin · superadmin | An integration gets a rung like a person does — the sync design already says so |
| **`activity_audit` with `activity_audit_origin`** (0080), and the `app.sync_origin` loop guard | Every write through the API is audited by name and source; a sync worker skips its own changes |
| **Conclusions computed in SQL**: `task_display.task_overdue`, `task_at_risk`, `process_run_display.process_overdue`, `stage_completion`, `job_latest_update`, `job_timeline`, `maintenance_request_display` | "Which jobs are overdue" is a column, defined once. The AI reads it; it never recomputes a date |
| **`job_display` / `project_display`** — the card in one row, `security_invoker` | The shape of "tell me about 1042-001" already exists as a view |
| **`job_address_search` / `project_address_search`** with pg_trgm | "28 Corner Street", "Lot 2", "1042" — the find tool is a view away |
| **`job_sharepoint_url`, `project_sharepoint_url`** (0040) | "Where does the file live" has a column, today |
| **`company_abn`** (unique, eleven digits) and the `sitebook_id` property (0081) | The Xero match key and the SiteBook match key, waiting for their connectors — both comments say so |
| **Four Edge Functions**, Microsoft Graph already wired for mail and Teams | The worker pattern (service role, narrow RPC, pg_cron → pg_net) is established and proven |
| **Entra sign-in** through Supabase Auth | Every person already has an identity an OAuth flow can reuse |
| **The repository seam** and `auditNarrative.ts` | The TypeScript that turns an audit row into a sentence a person reads is written once and can be shared |

Planned in `schema-plan.md` and **not built**: `external_systems`, `external_links`,
`sync_cursors`, `sync_inbox`, `sync_conflicts`, an `api_v1` schema of views, integration
profiles, "an MCP Edge Function whose tools call the repository with the caller's token".
Amber's order, 2 September: **SharePoint and Outlook/Teams first, then Xero, then SiteBook.**
This plan keeps that order.

---

## 2. The recommendation in one paragraph

Build **one gateway with three doors**. The gateway is a small TypeScript service on Vercel,
at `hub.lofty.au`, that holds the only code allowed to answer an outside caller. Door one is
a **REST API** (`/api/v1/…`) for programs — Power Automate, Excel, a Xero webhook, a script.
Door two is an **MCP server** (`/mcp`) for the AI clients a superadmin approves and connects
once for the whole organisation — Microsoft 365 Copilot in Teams first (Amber, 8 September);
nobody connects a personal client of their own. Door three is **Ask**, a box in the app
itself, which sends the person's question and the same tools to Claude — Anthropic is the
one AI vendor Lofty's data may reach (Amber, 8 September) — and streams the answer back onto
the phone. All three doors call the same dozen **tools**, and every tool runs **as the
caller**: a person's token or an integration's key becomes a Postgres session with that
identity's claims, and row-level security does the rest. Conclusions — overdue, at risk, days
in stage — come from SQL views, so the model explains a fact rather than inventing one. And
every write, from any door, lands in `activity_audit` with who did it and through which door.

The rest of this document is the reasoning, the pieces, the order, and the review.

---

## 3. The gateway — one seam, three doors

```
   Claude · Copilot · ChatGPT        Power Automate · Excel        A person in the app,
   (any MCP client)                  Xero webhook · scripts        on a phone
          │ MCP over HTTPS                  │ REST + JSON                  │ Ask
          │ OAuth 2.1 (person)              │ API key (integration)        │ session JWT
          ▼                                 ▼                              ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  gateway  (Vercel Functions, TypeScript)   hub.lofty.au/mcp  /api/v1  /ask   │
   │                                                                              │
   │   who is calling?  ──►  claims { sub, role: authenticated }                  │
   │   which tool?      ──►  hub_find · hub_job · hub_whats_due · …               │
   │   log the call     ──►  api_requests (who, tool, ms, rows)                   │
   └───────────────────────────────────┬──────────────────────────────────────────┘
                                       │  one transaction per call:
                                       │  set local role authenticated;
                                       │  set local request.jwt.claims = '{…}'
                                       ▼
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  Postgres  — RLS decides every row. api_v1 views. activity_audit records it. │
   └──────────────────────────────────────────────────────────────────────────────┘
```

### Why one gateway rather than an API and, separately, an MCP server

Because the hard part is not the protocol. The hard part is *who is asking and what may
they see*, and that has to be answered identically whether the question arrives as a REST
call from Excel, a tool call from Claude, or a tap on a phone. Two implementations of
"who is asking" drift, and the one that drifts open is the one nobody was looking at. So
the protocol layers are thin skins over one set of tool functions, and the tool functions
are the only code that touches the database.

This is the repository seam's rule applied to the outside: *no component reads the database
directly; everything goes through one place.* The gateway is that place for callers that are
not the app.

### Why Vercel, and why TypeScript

- **Vercel is the only host** (`CLAUDE.md`), and `hub.lofty.au` is the origin the app already
  has. An MCP server at `hub.lofty.au/mcp` and an API at `hub.lofty.au/api/v1` are one
  domain, one certificate, one CORS story, one OAuth resource — which matters, because MCP
  clients discover their authorization server from the resource's own well-known URL.
- **The seam is TypeScript.** `types.ts`, `dictionary.ts` (270 property labels and their
  definitions), `auditNarrative.ts` (an audit row → "Deanna moved 1042-001 to Construction")
  and the permission ladder are all importable by a Node function in the same repository.
  A Deno Edge Function could import them too, with more friction; a Python service could
  not. Sharing the code is what stops the API describing a different app from the one on
  screen.
- **The workers stay where they are.** Outbox delivery, inbound mail, accept links and the
  future sync workers hold the service role and are woken by pg_cron → pg_net. That is a
  database-adjacent job and Supabase Edge Functions are the right home for it. The gateway
  never holds the service role for a person's request — see §4.

The alternative considered: build the MCP server as a fifth Edge Function, as the sync
design's one line suggested. It loses on the shared-code point above and on OAuth (the
resource would live on `*.supabase.co`, not `hub.lofty.au`). It would win if Vercel Functions
could not hold a streaming connection long enough for an Ask answer — they can (streaming
responses, a configurable duration), and that assumption is on the checklist in §10.

### How a caller becomes a Postgres identity

The gateway connects to Postgres directly (Supavisor, transaction mode — the pooling the
sync design already calls for) as a role of its own, `api_gateway`, that has **no grants on
any table** — it can do exactly one thing, `set local role authenticated`. Every tool call
is one transaction:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<auth uid>","role":"authenticated"}', true);
-- the tool's query, as the caller; auth.uid() and every policy read the claims above
commit;
```

This is exactly what PostgREST does on every request the app makes today, and exactly what
`verify/rls.sql` does to prove a policy. So the gateway's reads are governed by the same
policies, proven by the same harness, and a gateway bug cannot widen what a person sees —
only a policy can, and policies are already the thing the repository guards.

**Why not pass the person's JWT straight to PostgREST** with `supabase-js`, reusing
`supabaseRepository.ts` wholesale? It would work for people and it is zero-secret. It does
not work for integrations, which have an API key and no JWT — that path would need a
second mechanism, and two paths is the drift this design exists to avoid. The
repository's *types and narrative code* are shared; its query code is rewritten against
`api_v1` views, once, in the gateway.

### The three kinds of caller

| Caller | Proves identity with | Becomes | Rung |
| --- | --- | --- | --- |
| **A person, through an approved AI client** (Copilot in Teams; any other client a superadmin later approves) | **SSO through a connection a superadmin registered once, organisation-wide.** The person signs in with Entra as they do today; the token that reaches the gateway names *them*, not the connection | their own profile | their own |
| **A person, in the app** (Ask) | the session they already have | their own profile | their own |
| **A program** (Xero, SiteBook, Power Automate, Excel, a script) | an API key, `lh_live_…`, created by a **superadmin** and stored hashed | an **integration profile** — a `profiles` row of kind *integration*, named `Xero`, `SiteBook`, `Power BI` | set at creation, usually `viewer` or `user`; never `admin` |

**One connection, never one identity.** Amber, 8 September: *"I don't want users to connect
their own. This is done by superadmin"* — and *"Can this be done with a single organisation
wide key?"* The answer is yes to one **connection** and no to one **identity**, and the
difference is the whole security model:

- **One connection.** A superadmin registers the Copilot Studio agent once. Nobody configures a
  personal Claude Desktop or ChatGPT against `hub.lofty.au/mcp`: the gateway's authorization
  server accepts only the client ids the superadmin registered, so an unregistered client is
  refused before it can ask for a token. There is no per-user setup step, which is what
  "organisation wide" buys.
- **Never one identity.** If every question ran as a single "Copilot" profile, RLS would hand
  everyone what that profile sees, a restricted property would reach whoever asked, and the
  Activity tab would say "Copilot" where it should say "Deanna". So the person's own identity
  rides through: Copilot passes the signed-in Teams user to the connector, the gateway turns
  that into the person's claims, and Postgres decides exactly as it does when they open the
  app. Deanna asking Copilot about 1042-001 is Deanna, reads what Deanna reads, and is
  audited as Deanna. When she is deactivated, `is_active_user()` goes false and Copilot stops
  answering her the same minute her sign-in does.
- **Email is the one thing each person connects for themselves** — *"I want people to be able
  to connect their own email"*. That is delegated Microsoft Graph on their own mailbox,
  consented once by the tenant admin so nobody sees a prompt, and every send and read is as
  that person (§8).

The point of the third row: an integration is a person-shaped thing with a name on the
ladder. "SiteBook linked purchase order 4471 to 1042-001" appears in the Activity tab the
same way "Ketan changed the assignee" does, because it *is* the same mechanism.

**What the Phase 1 spike has to prove.** Because only registered clients connect, dynamic
client registration — the largest uncertainty in the first draft of this plan — is no longer
needed. What remains: that Copilot Studio's MCP connector carries the Teams user's Entra
identity through to the gateway (its OAuth 2.0 authentication mode against the tenant's own
Entra app registration), and that the gateway can turn that Entra token into Supabase
claims. Two ways, and the spike picks the shorter: Supabase Auth's OAuth 2.1 server issues a
token for the same person, or the gateway verifies the Entra token itself against the
tenant's keys and looks the person up by their Entra object id — which `profiles` already
links to `auth.users` (0015, 0020). Both end in the same claims; a day, not a phase.

---

## 4. Security — decided up front, not bolted on

**RLS is the boundary, and the gateway never reaches around it for a person.** The
`report-share` function's own header comment is the rule: an endpoint holding the service
role, with one forgotten filter, hands somebody the whole book of work. So:

1. **No service role in the gateway's request path.** The gateway holds `api_gateway`'s
   password, which can read nothing, and the JWKS URL to verify tokens. That is all.
2. **Scopes on top of RLS, never instead of it.** An API key carries `read` or
   `read,write`; the MCP server refuses a write tool on a read key *before* it reaches
   Postgres. RLS would refuse it anyway if the integration's rung is `viewer` — the scope is
   a second lock on the same door, so a rung set too generously is not one mistake from a
   write.
3. **Every call is logged** in `api_requests`: profile, door, tool, argument hash, rows
   returned, milliseconds, status. Admin → Integrations reads it. A key that suddenly reads
   ten thousand rows at 3 a.m. is visible the next morning, not the next audit.
4. **Every write is audited by origin.** `activity_audit_origin` gains `api`, `mcp`, `ask`,
   `xero`, `sharepoint`, `sitebook` alongside `app`, `import`, `accept_link`. The Activity
   tab shows the door.
5. **Tokens are short-lived** (Supabase's default one hour) and refresh through the
   authorization server; API keys expire (default one year), show their prefix and last
   use, and are revoked with one click. The full key is shown once, at creation.
6. **Rate limits per identity**, at the gateway, and `statement_timeout` 10 s for
   `authenticated` in Postgres (already in the design). Every list tool paginates and caps
   at 50 rows; nothing returns a table.
7. **Webhooks are verified before they are believed.** Xero signs with HMAC-SHA256 and
   requires an intent-to-receive handshake; Graph sends a `validationToken` and echoes a
   `clientState`. A payload that fails verification is dropped and counted, not parsed.
   Every inbound event has an idempotency key in `sync_inbox` — delivered twice, processed
   once.
8. **What the model reads is data, not instruction.** Comments, email bodies, Xero
   descriptions and SharePoint filenames all reach Claude through tools, and any of them
   could contain "ignore your instructions and…". The system prompt says so; **write tools
   are never reachable from a read result** — a write happens only when the *person* asked
   for it in their own turn, and the in-app Ask is **read-only in its first version** (Amber, 8 September:
   *"Read-only first"*). This is the prompt-injection defence, and it is a design rule rather
   than a filter.
9. **Restricted properties stay restricted.** RLS withholds the row; the tool answers "no
   value you can see" rather than a blank, so an empty field and a hidden field read the
   same to the model and it cannot infer the second from the first.
10. **Nothing is cached across people.** A tool result is computed for one identity and
    discarded. A shared cache of `hub_job` answers would be a shared cache of who may see
    what.
11. **Secrets have one home each** — see the table in §10. Nothing new is ever `VITE_`.
12. **Close the GraphQL shape leak first.** Open question 1 (93 tables visible to `anon` by
    introspection) is a curiosity while the only client is the app. It stops being one when
    an API is advertised. Revoking `SELECT` from `anon` on `public` is the first migration
    of this work, once Amber says yes to that question.
13. **Data leaving Lofty — decided.** Amber, 8 September: **Anthropic only**, chosen with
    Claude on Microsoft Foundry, "any vendor" and "none yet" in front of her. Ask sends the
    question and the tool results the person could already see, and nothing else, to
    Anthropic's API (no training on the data; 30-day retention). No ChatGPT connection. The
    vendor sits behind one configuration value, so if a client contract ever forbids offshore
    processing the move to Foundry is a setting and a re-test, not a rebuild.

---

## 5. The tools — what any door can ask

Twelve tools, named `hub_*`, each a thin function over one or two `api_v1` views. Fewer than
fifteen on purpose: a model with sixty tools picks the wrong one. Every read tool returns the
record's **link** (`https://hub.lofty.au/jobs/1042-001`) beside its facts, so an answer on a
phone is one tap from the screen that proves it.

### Read — Phase 1

| Tool | Answers | Reads |
| --- | --- | --- |
| `hub_find(query)` | "1042", "28 Corner", "Lot 2", "Priya", a SiteBook id — ranked hits with their type | `job_address_search`, `project_address_search`, number prefix, `profile_display`, the `sitebook_id` property |
| `hub_job(job_number)` | The drawer in one call: stage and since when, team, assignee, project, address, latest update, open and overdue task counts, both SharePoint folders, parties, every property the caller may read | `job_display`, `job_latest_update`, `task_display`, `record_party_display`, `property_values` |
| `hub_project(project_number)` | The same for a project, with its jobs and where each is | `project_display`, `job_display`, `stage_completion` |
| `hub_recent_changes(record, since)` | "What changed on 1042-001 this week" — one sentence per change, who and when, restricted values withheld | `activity_audit`, `activity_events`, `property_value_history`, `job_stage_events`, through `auditNarrative.ts` |
| `hub_where_is_file(job_number)` | The job's and project's SharePoint folders; **in Phase 3**, the files inside them | `job_display`; later Microsoft Graph as the person |
| `hub_whats_due(scope, window)` | Overdue and at-risk tasks, processes, stages and maintenance items for *me*, *my team*, *a job*, or *everything*, each with its due date and how far over | `task_display`, `process_run_display`, `stage_completion`, `maintenance_request_display` — the flags are columns |
| `hub_figures(measure, group_by, filter)` | A number with its definition: jobs per stage, average days in stage against `expected_days`, overdue tasks by team, maintenance over SLA, projects by type. **A fixed catalogue**, each measure a named view or function | `api_v1.measures_*` |
| `hub_property(record, property)` | One property value, matched on the dictionary label with pg_trgm so "pour date" finds `slab_pour_date` | `property_defs`, `property_values` |
| `hub_comments(record, limit)` | The latest comments on a job, project or request | `comments` |
| `hub_people(query)` | Who is who — team, role, active | `profile_display`, `teams` |

### Write — Phase 2, and only these

| Tool | Does | Guard |
| --- | --- | --- |
| `hub_add_comment(record, body)` | The note from the ladder. The most useful write and the safest | `comments` INSERT ≥ user; stamped as the caller; origin `mcp`/`ask`/`api` |
| `hub_set_property(record, property, value)` | Records a value; refuses a locked one and says why | the value policy; the lock (0077) |
| `hub_update_task(task, status \| due)` | Done, blocked, due moved | `tasks` UPDATE ≥ user |
| `hub_create_maintenance_request(job, description, category)` | A request from the phone, like the form does | the same RPC the form uses |

**Not exposed through any door, deliberately:** lifecycle moves (a manager's confirmed act
in the app — Amber's rule), creating or deleting jobs and projects, anything under Admin or
Settings, votes, follows, user management. The MCP server's description says so, so a
client does not spend a turn looking.

Every tool carries the protocol's annotations — `readOnlyHint`, `destructiveHint`,
`idempotentHint` — and returns both text and structured content, so a client that can
render a card does and one that cannot still reads a sentence.

---

## 6. The intelligence layer — three tiers, and where each conclusion is allowed to come from

The word "intelligence" hides three different jobs. Keeping them apart is what makes the
answers trustworthy.

**Tier 1 — facts computed in SQL, once.** Overdue, at risk, days in stage, slowest job,
percentage of stage complete, SLA breached. Every one is a column in a view today or a view
in the `api_v1` batch. The definition lives in one place, the dictionary labels it, and the
app's board and the AI's answer agree because they read the same column. *The model never
subtracts two dates.* When it says "1042-001 is nine days overdue", it is reading
`task_overdue` and `task_due_effective`, and the answer cites them.

**Tier 2 — the model as reader and explainer.** Claude, with the tools, a system prompt
that carries the vocabulary (the seven stages, what a process and a property are, that
dates are Adelaide days, that "retail" means residential with an external client), and
three rules it is held to: cite the record and link it; say "no value recorded" or "not
visible to you" rather than fill a gap; when a figure is asked for, call `hub_figures` and
report the measure's name with the number. Structured output for Ask — `answer`, `sources`,
`links`, `follow_ups` — so the phone renders an answer card rather than a paragraph.

**Tier 3 — linking across systems.** "Xero invoice INV-0412 is 1042-001's deposit." That is
an `external_links` row: system, external id, the record here, who or what made the link,
when. Rules, in order: **deterministic first** — a Xero contact whose ABN equals
`company_abn`; an invoice whose reference contains a job number the app knows; a SharePoint
folder whose path contains `1042-001`. **Suggested second** — where nothing matches exactly,
the worker asks Claude for candidates and writes them to a **review queue**, never to the
record. A person confirms a suggestion; the confirmed link is written with origin `xero` and
`_confirmed_by`. **Never guessed** — an unmatched invoice stays unmatched and visible in the
queue. This is *never fill a gap with a plausible value* applied to matching, and it is the
rule the maintenance mailbox already follows ("log it by hand").

What the layer is **not**: the model writing SQL. Free-form SQL from a model is an injection
surface and a source of confident wrong numbers. `hub_figures` has a catalogue; a measure
that is not in it is a request to add one, and adding one is a view with a definition
somebody can read.

**Model and settings.** `claude-opus-5`, adaptive thinking, effort `low` for Ask (one or two
tool calls, a short answer, a phone waiting) and `medium` for the review-queue suggestions.
The system prompt and the tool definitions are stable and cached; only the question varies.
Server-side refusal fallbacks on. The Anthropic key lives in the gateway's environment and
nowhere else.

---

## 7. The ladder test — what "easy to use" means on a phone

The test, as given: one hand, daylight, up a ladder, *any* job or project — where is it up
to, what changed recently, where does the file live.

**The Ask box** sits in the header search at phone width. Type or dictate (the phone's
keyboard already does dictation; nothing to build). The answer is a card, not a chat:

```
  1042-001 · 28 Corner Street, Lot 1
  Construction · since 21 Aug · Deanna, Construction

  ▸ Frame inspection was due Fri 5 Sep — 3 days overdue
  ▸ Latest: "Plumber booked for Tue" — Priya, yesterday
  ▸ Folder: SharePoint › 1042 Corner Street › 001

  Open the job ›      What changed this week?      Where is the plumbing quote?
```

Three lines of fact, each from a tool, each from a column; one tap to the record; two
follow-ups as chips so the next question is a tap and not a sentence. First token under two
seconds, whole answer under six — one or two tool round trips, no more, is the budget that
makes that true, and `hub_job` returning the drawer in one call is what keeps it to one.

**The honesty mechanism is the link.** Every answer opens the drawer that shows the same
facts. An answer that cannot be checked in one tap is not an answer this app gives.

**Without AI, the same tools still pass the test.** `hub_job` *is* the drawer. The Ask box
ships in Phase 1 because the vendor question is answered (Anthropic only), but if that answer
ever changes the gateway, the API and the Copilot connection stand on their own.

**Ten questions to try on a phone before calling Phase 1 done**, with the tool that answers
each — the acceptance test, written now so it cannot be softened later:

1. "Where is 1042-001 up to?" — `hub_job`
2. "What changed on 1042 this week?" — `hub_recent_changes`
3. "Where's the folder for 28 Corner Street?" — `hub_find`, `hub_where_is_file`
4. "What's overdue on my jobs?" — `hub_whats_due(mine)`
5. "Who's the site manager on 1042-001?" — `hub_job` (parties and staff roles)
6. "What did Priya say last?" — `hub_comments`
7. "When's the slab pour on 1042-002?" — `hub_property`
8. "How many jobs are in Construction?" — `hub_figures`
9. "Which projects have a job in Pre-construction more than 30 days?" — `hub_figures`
10. "Is 1042-001-M3 sorted?" — `hub_find`, then the maintenance request's display row

---

## 8. The external systems — one at a time, in Amber's order

### Microsoft 365 — first, and mostly reads

- **SharePoint.** Today a job holds a folder URL. Phase 3 adds: **create** the project
  folder and job subfolder when a job is created (worker, application permission — this is
  the write Amber described on 25 August); **list and search** inside a job's folder for
  `hub_where_is_file` (as the person, delegated permission, so SharePoint's own permissions
  hold and the app never sees a file the person could not open). A **change subscription**
  on the working-drawings folders fulfils the notification rule Amber set on 2 September —
  "any change to working drawings immediate" — without integrating AutoCAD at all: the
  drawings live in SharePoint, so that is where the change is seen.
- **Outlook and Teams.** Already the notification channels and the maintenance intake.
  Added: "email me this job's summary" as an Ask follow-up, through the existing outbox.
- **Each person's own mailbox** — Amber, 8 September: *"I want people to be able to connect
  their own email"*. Delegated Graph on the person's mailbox, **admin-consented once for the
  tenant** so nobody sees a prompt, every send and read as that person. First use: send a
  job's summary or a comment from the person's own address so replies land in their Outlook.
  Later: surface the person's own mail that mentions a job number on that job — their mail,
  their permissions, never a shared mailbox read. This is the one connection that is
  per-person by design, and it is a Graph permission, not a Lofty Hub key.
- **Excel and Power BI.** Read the API. An admin creates a read-only integration key; Power
  Query points at `/api/v1/jobs?format=csv` (and `tasks`, `projects`, `measures`). Every
  endpoint is a `security_invoker` view, so a spreadsheet sees what a `viewer` sees — the
  risk note in `schema-plan.md` about Power BI and `property_values` is honoured by
  construction, not by care.
- **Copilot — the approved AI client.** Amber, 8 September: "Microsoft cowork" is
  **Microsoft 365 Copilot**. A superadmin registers one Copilot Studio agent against `/mcp`;
  it is in Phase 1, beside Ask, because it is the client staff already have in Teams. The
  person's identity rides through (§3).
- **The delegated-token trap.** Supabase stores the Entra `provider_token` at sign-in and
  does not refresh it. `hub_where_is_file` listing files *as the person* needs a Graph token
  that outlives the hour — the `provider_refresh_token`, stored encrypted and refreshed by
  the gateway, or a one-time extra consent. Decided in Phase 3, flagged now.

### SiteBook — second now, because the purchase orders come from it

Amber, 8 September: SiteBook *"has an mcp and api but don't know details yet. This is
important to know"*; what Hub needs from it is *"job details, purchase order documents,
contact details"*; and *"right now I just want to pull info from SiteBook but going forward
we want to eventually replace SiteBook so will need to push to xero"*. That moves SiteBook
ahead of Xero in the order Amber gave on 2 September — the purchase orders Xero reconciles
are SiteBook's, so Xero has nothing to match until they are here.

- **Direction now: SiteBook → Hub, read-only.** A worker (service role, pg_cron, the
  established pattern) pulls per job: the trades and bookings onto process runs and parties;
  each **purchase order** into a `purchase_orders` table — SiteBook's id, the job, the
  contractor company (matched by ABN, else the review queue), amount ex and inc GST, status,
  raised and due dates; and contact details into `contacts` and `companies` through the
  approval queue Amber already set (contacts created with manager sign-off).
- **The PO document is a file, so it lives with the files**: the worker saves it into the
  job's SharePoint folder (0040) via Graph, and the row carries the link.
- **The join** is `sitebook_id` on the job (0081) and `external_links` for everything else.
- **Designed for the day Hub replaces SiteBook.** `purchase_order_source` (`sitebook` |
  `hub`) from the first migration, and the Xero push columns below, so replacing SiteBook is
  a new source of rows into a table that already exists, not a new table.
- **What gates the design, and is not known**: SiteBook's API authentication, rate limits,
  whether PO documents are downloadable by API, and whether its MCP server is the vendor's
  own or third-party. **First task of Phase 4: the developer documentation and a test
  login.** Nothing about SiteBook is guessed before then.
- **SiteBook's own MCP server** can be connected to Copilot by a superadmin beside Hub's, so
  one question spans both — useful, and not a substitute for the pull: Hub's own tables are
  what the ladder test and Xero need.

### Xero — third; read bills now, push purchase orders later

- **Connection.** One organisation (Amber, 8 September) → a Xero **custom connection**:
  client credentials, no 60-day refresh token that expires when nobody has used it over
  Christmas, a small monthly Xero fee.
- **Now: Xero → Hub, read-only.** Bills and contacts, matched to `purchase_orders` (Xero's
  bill reference against the PO number) and to `companies` by ABN; the review queue for the
  rest. Cost centres and products become tables here, as the earlier design assigned.
- **Later: Hub → Xero.** Amber: *"going forward we want to eventually replace SiteBook so will
  need to push to xero"*. Designed for now, built when Hub creates purchase orders:
  `purchase_order_xero_id`, `_xero_pushed_at`, `_xero_push_state` (`not_sent` | `sent` |
  `failed` | `superseded`), an idempotency key per push, `sync_conflicts` for a PO changed on
  both sides. **While SiteBook exists, Hub writes nothing to Xero** — two systems each
  allowed to write the same number is the conflict `sync_conflicts` exists to catch, and the
  switch is the PO's source, one row at a time.
- **The two invoice properties** — `invoice_deposit_1_paid` and `invoice_amount_paid` —
  become derived and **locked** (0077): Xero's figure, un-typeable.
- **An invoice with no purchase order** (land, development, a consultant on the whole site)
  needs a parent that is a job *or* a project — question 20.
- **Limits to design around.** 60 calls a minute, 5,000 a day; webhook signature and the
  intent-to-receive handshake; GST-inclusive and exclusive amounts, both stored.

### Asana, AutoCAD, and the next request

- **Asana** has an API and an MCP server of its own. Two-way task sync is the most
  conflict-prone integration there is; if Lofty uses Asana (not stated), start with links
  (`external_links` to an Asana task) and a one-way mirror, and let a person ask for more.
- **AutoCAD** drawings are files, and the files live in SharePoint. The change
  subscription above is the integration; the Autodesk Platform Services API is not needed
  for anything Amber has asked for.
- **The general answer** to "can it connect to X": if X has an API, a worker and a row in
  `external_systems`; if X has an MCP server, a person's AI client can already hold both and
  join them in conversation without Lofty building anything; if X has an export, the import
  endpoint. The design does not need to know X in advance — that is what `external_links`
  is for.

---

## 9. The phases — each one a thing Amber can try

Every phase ships behind the same rule as every other change here: one branch and PR per
table, four files moving together, a verify check watched failing, a `Changelog:` trailer.
Migration numbering starts at `0101`.

| Phase | Ships | Migrations | Amber can try |
| --- | --- | --- | --- |
| **0 — ground** | `anon` GraphQL closed (once question 1 is answered); `api_v1` schema; `activity_audit_origin` widened; `external_systems`, `external_links`, `sync_inbox`, `sync_cursors`, `sync_conflicts`; integration profiles; `api_keys`; `api_requests` | 0101–0105 | Nothing yet — but Admin → Integrations lists an empty table honestly |
| **1 — read, and the ladder test** | The gateway on Vercel; the ten read tools; the **Copilot Studio agent** registered by a superadmin against `/mcp`, the person's identity riding through; the **Ask** box, read-only, on Anthropic's API; the ten questions in §7 passing on a phone | none beyond 0 | Ask Copilot in Teams about 1042-001. Ask the same on the phone |
| **2 — writes and keys** | The four write tools, with the confirmation rule; API keys with scopes, created by a superadmin; `/api/v1` read endpoints with CSV; Admin → Integrations showing connections, keys, calls and last use; a Power Query workbook that reads the board | 0106 (keys, scopes) | Add a comment from the ladder; open the board in Excel |
| **3 — Microsoft 365 depth** | Folder creation on job creation; file listing and search in `hub_where_is_file`; each person's own mailbox (admin-consented); drawings change subscription → the existing notification rule | 0107 (folder ids on links) | "Where's the plumbing quote?" returns the file; "email me this" arrives from your own address |
| **4 — SiteBook** | Developer docs and a test login first; then the pull: job details, purchase orders and their documents into SharePoint, contacts through the approval queue; `purchase_orders` with its source and Xero push columns from day one | 0108–0109 | See 1042-001's purchase orders and contractors in the drawer, each linking to its document |
| **5 — Xero** | Custom connection; bills and contacts matched to purchase orders and companies; cost centres and products; webhook + nightly reconcile; the review queue; the two invoice properties derived and locked | 0110–0112 | See Xero's deposit figure on 1042-001, un-typeable; match an unmatched bill from the queue |
| **6 — the next systems** | Hub → Xero push, when Hub creates purchase orders; SiteBook's MCP beside Hub's in Copilot; Asana links if asked | as needed | Raise a PO in Hub and see it in Xero |

**What each phase proves before it is called done** — assertions for `verify/`, each to be
watched failing first:

- An `api_gateway` connection **with no claims set reads zero rows** from every table.
- An integration profile at `viewer` reads what a viewer reads and **cannot read a
  restricted property** the app's viewer cannot.
- A `read` key **is refused** on every write tool, at the gateway, with a 403 that names the
  scope.
- A write through `/mcp` lands in `activity_audit` with **origin `mcp` and the caller's
  profile id**; a worker's write lands with **its own name** and is **skipped by its own
  cursor**.
- The same webhook delivered twice **produces one `sync_inbox` row** and one change.
- A deactivated person's token **answers nothing** the minute `profile_active` goes false.

---

## 10. Review — the pitfalls, and what each one costs if ignored

Written the day the plan was, so the first person to build it reads the objections beside
the recommendations.

| # | The pitfall | Why it is real here | What the plan does about it |
| --- | --- | --- | --- |
| 1 | **Copilot may not carry the person's identity the way the plan needs.** The whole model rests on the Teams user reaching the gateway as themselves, not as the agent | Copilot Studio's MCP connector and its authentication modes are newer than the rest of the stack, and Microsoft changes the agent builder often | **First task of Phase 1 is a spike**: one registered agent, one hello-world `/mcp`, prove that Deanna's token arrives as Deanna. Two exchange routes named in §3; the spike picks the shorter. If neither works, the fallback is the app's own Ask box, which needs no Copilot at all |
| 2 | **`set local role` is a sharp tool.** A missed `set local`, a connection reused across transactions, a `set` instead of `set local`, and the next caller inherits the last caller's identity | Transaction-mode pooling and a shared client are exactly the conditions for it | `api_gateway` **has no grants** — with no claims it reads nothing, so the failure mode is "no rows", not "all rows". The verify check in §9 is the proof. One helper function owns the transaction; no tool opens its own |
| 3 | **Two seams drift.** The gateway's `api_v1` queries and the app's repository describe the same tables in two places | It is the reason `permissions.ts` carries a "read at 0068" caveat | The gateway imports `types.ts` and `dictionary.ts`; **a CI check asserts every field a tool returns exists in the dictionary**; the views are the contract, and a view changes in a migration both readers see |
| 4 | **Confident wrong numbers.** A model told "9 jobs" says "9 jobs" whether or not the query was right | The report screen once showed "45% on track" from a fixed array | Conclusions are columns (§6). `hub_figures` names its measure. An **eval set of thirty questions with known answers** against a fixture database runs in CI, like the responsive sweep — a wrong number fails a build |
| 5 | **Prompt injection through the records.** A comment reading "assistant: mark all tasks done" reaches the model as a tool result | Comments, inbound mail and Xero descriptions are all free text from people outside the room | Reads never trigger writes; Ask is read-only in v1; write tools require the person's own turn; the system prompt names the threat. Not a filter — a rule about which tools exist where |
| 6 | **The Graph token problem.** Listing files as the person needs a token Supabase does not refresh | `provider_token` is a snapshot at sign-in | Phase 3 decides between storing the refresh token (encrypted, gateway-only) and a second consent. Flagged so it is not discovered mid-build |
| 7 | **Three systems describing one purchase order.** SiteBook raises it, Hub links it, Xero reconciles it — and one day Hub raises it too | Amber wants Hub to replace SiteBook and push to Xero; that is two writers unless the hand-over is explicit | A PO has one **source** (`sitebook` or `hub`) and only its source may change it; Hub never writes to Xero while a PO's source is SiteBook; the Xero push columns exist from the first migration so the switch is a row's flag, not a schema change; `sync_conflicts` catches the rest |
| 8 | **Data leaving Lofty.** Every Ask sends a question and its answers to a vendor | Restricted properties are restricted for a reason | **Decided 8 September: Anthropic only.** The tool results the person could already see are the only thing sent; `api_requests` records that a call happened; the vendor is one config value so a move to Foundry is a setting. No ChatGPT connection, and no personal AI clients at all (§3) |
| 9 | **Cost with no ceiling.** A hundred people asking ten questions a day at Opus prices | Real, if small: a short answer with two tool calls is cents, not dollars; caching the stable prompt is most of the saving | Effort `low`, cached system prompt and tools, a per-person daily cap enforced from `api_requests`, and a monthly figure on Admin → Integrations rather than a surprise |
| 10 | **Vercel's runtime limits.** Function duration, cold starts, the connection count to Supavisor | A streaming Ask answer needs a live connection for several seconds | Streaming responses and a raised `maxDuration` are configuration; one connection per function instance, transaction mode. On the Phase 1 spike checklist with #1 |
| 11 | **Too many tools, or too clever ones.** Sixty endpoints wrapped as sixty tools; or one `hub_query` that takes anything | The first makes the model guess; the second is #4 and #5 with a friendlier name | Twelve, named for what a person asks, each over a view |
| 12 | **Secrets multiply.** Anthropic, Xero, Graph, the gateway's database password, API-key hashing salt | Five services, two runtimes | The table below. Nothing new is `VITE_`; the app bundle stays as it is |
| 13 | **The phone does not have signal.** No AI rescues a page that will not load on site | The drawer already has to pass at phone width | Answers are small (a card, not a table); the drawer remains the surface of record; Ask is a shortcut to it, not a replacement |
| 14 | **A public API is a public surface.** Scanning, credential stuffing against keys, enumeration | `hub.lofty.au/api/v1` will be found | Keys are long, prefixed (`lh_live_`) so secret-scanning tools recognise them, hashed at rest; rate limits per key and per IP at the edge; `anon` closed (open question 1); every 401 and 403 counted |
| 15 | **SiteBook is designed around before it is seen.** Its API and MCP server exist (Amber) but nothing about auth, limits or document access is known | Phase 5 (Xero) depends on Phase 4's purchase orders, so a wrong assumption about SiteBook delays both | Phase 4 opens with the developer documentation and a test login; the `purchase_orders` table is designed from what Xero and the drawer need, not from SiteBook's shape; the SiteBook worker is the adapter that translates |
| 16 | **Deactivation and keys.** A person leaves; the organisation-wide Copilot connection outlives them, and so do the keys they created | `is_active_user()` covers people. A key is the integration's, not its creator's | Copilot answers nobody whose `profile_active` is false, because the identity that reaches Postgres is the person's; keys belong to the integration profile and are listed with who created them, so a departure prompts a review rather than an outage. **A single organisation-wide identity would have failed this row** — the reason §3 refuses it |
| 17 | **The plan assumes `api_v1` views can express every tool.** `hub_recent_changes` needs the narrative code, not a view | `auditNarrative.ts` is TypeScript for a reason | Shared, not rewritten — the reason the gateway is TypeScript (§3). The view supplies rows; the narrative supplies sentences |

### Where every secret lives

| Secret | Home | Never |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | Vercel environment, gateway only | the app bundle, Supabase |
| `GATEWAY_DATABASE_URL` (as `api_gateway`) | Vercel environment | a `VITE_` name, a worker |
| Supabase JWKS URL | Vercel environment (public data, private setting) | — |
| `API_KEY_SALT` | Vercel environment | the database |
| Xero client id and secret | Supabase Edge Function secrets (the worker) | Vercel |
| `MS_CLIENT_ID` / `MS_CLIENT_SECRET` / tenant | Supabase Edge Function secrets — **already there** | Vercel, unless Phase 3 chooses delegated refresh in the gateway, which is then its own registration |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions only — **as today** | the gateway |

---

## 11. What was decided on 8 September, and what is still open

Amber answered all six questions the first draft of this plan left open, in one sitting,
with the options and their future problems in front of her. Recorded with her words in
[`../open-questions.md`](../open-questions.md) → *Answered*, rows 14–19:

| # | Decision | What it changed here |
| --- | --- | --- |
| 14 | **Anthropic only** may receive Lofty's data | Ask ships in Phase 1; no ChatGPT connection; vendor behind one config value |
| 15 | "Microsoft cowork" is **Microsoft 365 Copilot** | The Copilot Studio agent is Phase 1's approved client |
| 16 | **One Xero organisation**; the money shape is **purchase orders from SiteBook, per contractor, linked to jobs, reconciled in Xero**; pull from SiteBook now, push to Xero later when Hub replaces SiteBook | SiteBook moves ahead of Xero; `purchase_orders` with source and push columns from day one; Hub → Xero is a later phase, designed for now, rather than out of scope |
| 17 | SiteBook **has an API and an MCP server, details unknown**; Hub needs job details, PO documents, contact details | Phase 4 opens with the documentation and a test login |
| 18 | **A superadmin connects approved sources organisation-wide; nobody connects a personal AI client; each person connects their own email** | One connection, never one identity (§3); dynamic client registration dropped; per-person mailbox in Phase 3 |
| 19 | **Ask is read-only first** | Comment from the phone is Phase 2 |

Two narrower questions those answers left behind, queued as 20 and 21:

- **20.** A Xero invoice with **no** purchase order — land, development, a consultant on the
  whole site — belongs to a job or to a project? Recommended: one of the two, checked, with the
  review queue for anything matching neither. **Blocks the `invoices` table in Phase 5**, and
  nothing before it.
- **21.** Question 18's answer said *"only managers can connect it to approved sources"* and
  *"this is done by superadmin"*. Read as: superadmin registers, managers use. If managers
  should register sources themselves, Admin → Integrations opens to managers for that one act.
  Not blocking.
