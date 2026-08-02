# Data dictionary

> **Generated — do not edit by hand.**
> Source: `app/src/data/dictionary.ts`. Regenerate with `npm run dictionary` from `app/`.
> The Dictionary page in the app renders the same array, so this file and that page
> cannot disagree. They can still disagree with Postgres — that is what **Status** is for.

118 properties across 24 tables.

| Status | Count | Means |
| --- | --- | --- |
| To do | 42 | Specified here, not yet in the migration |
| Created | 73 | In the migration and the types |
| Updates required | 0 | Built or specified, but a decision is outstanding |
| Merged | 3 | Folded into another property |
| Archived | 0 | Retired, kept for history |

---

## `activity`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `activity.id` | Activity ID | One feed for both events and comments — the UI interleaves them, so the schema should not keep them apart. | `uuid` | Primary key. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `activity.subject_type` | Subject type | Whether the entry is against a job or a project. | `text` | Not null. CHECK in ('job','project'). | Paired with subject_id. Indexed with it. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `activity.subject_id` | Subject | Which job or project. | `uuid` | Not null. | Polymorphic — no FK, enforced by the app. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `activity.kind` | Kind | An event the system recorded, or a comment a person wrote. | `text` | Not null. CHECK in ('event','comment'). | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `activity.description` | Description | The text of the event or comment. | `text` | Not null. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `activity.author_id` | Author | Who wrote it. Null for system events. | `uuid` | Nullable. | FK → profiles(id). | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `activity.mentions` | Mentions | Who was @mentioned, for the notification fan-out. | `jsonb` | uuid[], default '{}'. | Each entry references profiles(id). | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `addresses`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `addresses.id` | Address ID | The address as a record. Addresses get corrected and changed — a lot renumbered by council, a street renamed, a typo found at handover — so everything points at this id rather than carrying a copy of the text. | `uuid` | Primary key, default gen_random_uuid(). | Referenced by projects.original_address_id / current_address_id and jobs.original_address_id / current_address_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.lot_number` | Lot number | The lot as it appears on the plan of division. | `text` | Nullable. Text, not a number — "12A", "5-7" and "Lot 3" are as common as 12, and an integer column has to be migrated the first time one arrives. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.street_number` | Street number | The number on the street. Text for the same reason as the lot number. | `text` | Nullable. | Feeds consolidated_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.street_1` | Street | Street name and type — "Ironbark Road". | `text` | Not null. | Feeds consolidated_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.street_2` | Unit / level | Anything above the street line — unit, level, building name. | `text` | Nullable. | Feeds consolidated_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.suburb` | Suburb | Suburb or locality. | `text` | Not null. Indexed. | Feeds consolidated_address; exposed by project_display.suburb. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.state` | State | Australian state or territory. | `enum` | au_state. Not null, default 'SA'. Values: SA NSW VIC QLD WA NT TAS ACT. | Feeds consolidated_address. Filters the council picker. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.country` | Country | Country. One value today; an enum so a second is ALTER TYPE, not a data-cleaning exercise. | `enum` | country_code. Not null, default 'AU'. | Feeds consolidated_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.council_id` | Council region | The local government area the address sits in. | `uuid` | Nullable. Indexed. | FK → council_regions(id). Exposed by project_display.council_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.consolidated_address` | Full address | The whole address as one string, assembled in the database so every card, export and search reads exactly the same text. | `generated text` | GENERATED ALWAYS AS (…) STORED. Built with \|\| and coalesce rather than concat_ws — concat_ws is only STABLE and a generated column requires IMMUTABLE. | Derived from street_2, street_number, street_1, suburb, state, country. Read by project_display.current_address / original_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.created_at` | Created on | When the address was first recorded. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.created_by` | Created by | Who recorded it. | `uuid` | Nullable. | FK → profiles(id). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.updated_at` | Updated on | When the address was last corrected. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `addresses.updated_by` | Updated by | Who last corrected it. | `uuid` | Nullable. | FK → profiles(id). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `build_stages`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `build_stages.id` | Build stage | The construction sub-stage inside Construction & execution — slab, frame, lock-up and so on. | `integer` | Primary key. | Referenced by jobs.build_stage_id. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `council_regions`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `council_regions.id` | Council ID | A local government area. | `uuid` | Primary key. | Referenced by addresses.council_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `council_regions.name` | Council name | The council's name as published by the LGA. | `text` | Not null. Unique with state. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `council_regions.state` | State | Which state the council is in, so the picker can filter to the state already chosen on the address. | `enum` | au_state. Not null. Indexed. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `council_regions.active` | Active | Councils amalgamate and split. Retiring one keeps the addresses that reference it intact. | `boolean` | Not null, default true. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `divisions`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `divisions.id` | Division (removed) | Removed — it was never a Lofty concept. Division appears nowhere in the concept spec; the prototype invented it, derived it from the project type, and relabelled development work as "Land" — a term that is wrong as well as redundant. The correct word is development, which is what project_type has always used. The table, projects.division_id, teams.division_id and the 'division' permission scope are all gone. | `uuid` | Table dropped. | Superseded by projects.project_type. "Everything of this type" is project_type; "everything in these teams" is the team_hierarchy scope. | Merged | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `health_statuses`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `health_statuses.id` | Health status | PARKED — deliberately not built yet. Health is calculated, not set: is it on schedule, is it over budget, has an issue been raised. The inputs are still to be decided, and inventing a column before they are known would bake in the wrong answer. Distinct from status, which is what a person sets. | `text` | Not in the schema. Awaiting the list of inputs it is calculated from. | Will be derived, not stored — no column until the calculation is settled. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `job_address_search`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `job_address_search.role` | Matched address | Whether a search hit the job's current or original address. Worth showing: a hit on an original address is a hint that whoever searched is working from stale information. | `view` | Read-only. 'current' \| 'original'. | One row per (job, address role), so a match on either address finds the job. Backed by a trigram index on addresses.consolidated_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `job_display`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `job_display.project_type` | Job type (inherited) | The job's type, which is its project's type. Inherited through the view rather than copied onto the job, so there is nowhere for the two to disagree. | `view` | Read-only. | jobs ⋈ projects on project_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_display.is_current` | Is current | Whether the job is still live — not completed, cancelled or archived. Derived from status every time it is read, never stored. | `view` | Read-only. is_current(jobs.status). | Mirrors the isCurrent() helper in the app. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_display.job_number` | Job number | The job number, joined for the board and for search. | `view` | Read-only. | jobs.job_number. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_display.current_address` | Job address (current) | The consolidated current address, joined for the board and for search. | `view` | Read-only. | jobs ⋈ addresses on current_address_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `job_stages`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `job_stages.id` | Job stage ID | One row per job per stage. This is what makes stage history possible — a single stage_id on the job says where something is now, not when it got there or how long it sat. | `uuid` | Primary key. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_stages.project_id` | Project | Carried alongside job_id so project rollups do not need the extra join. | `uuid` | Not null. | Composite FK with job_id, so it cannot disagree with the job's own project. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_stages.job_id` | Job | The job this stage row belongs to. | `uuid` | Not null. | FK → jobs(id) ON DELETE CASCADE. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_stages.stage_id` | Stage | Which phase. | `integer` | Not null. | FK → stages(id). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_stages.entered_at` | Entered on | When the job reached this stage. Null until it does. | `timestamptz` | Nullable. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_stages.exited_at` | Exited on | When it left. Null while it is still here. | `timestamptz` | Nullable. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `job_stages.is_current` | Is current (removed) | Removed. Which stage a job is in now is jobs.stage_id; whether the job itself is current is is_current(status) — anything not completed, cancelled or archived. The open stage row is simply the one with exited_at null, guaranteed by a partial unique index. A third copy of that fact was a third thing to keep true. | `boolean` | Dropped from the schema. | Superseded by jobs.stage_id and the is_current(record_status) function. | Merged | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `job_types`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `job_types.id` | Job type (merged) | Merged into the project_type enum. A job's type is its project's type — a commercial project does not contain residential jobs, so a second column would only ever be a chance to disagree with the first. Read it through job_display.project_type. | `integer` | Table dropped. | Superseded by projects.project_type, inherited by jobs through the job_display view. | Merged | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `jobs`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `jobs.id` | Job ID | The job's machine key. | `uuid` | Primary key. | Referenced by job_stages.job_id, job_tags, job_dependencies, activity. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.project_id` | Parent project | The project this job belongs to. One project, many jobs. The uuid rather than the friendly number, so renumbering a project never orphans its jobs. | `uuid` | Not null. Indexed. | FK → projects(id) ON DELETE CASCADE. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.project_no` | Project number | The friendly project number, user-facing. Held on the job only so job_number can be a generated column — a generated column cannot reach another table. Never written by the app. | `integer` | Not null. | Maintained by the jobs_sync_project_number and projects_cascade_renumber triggers. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.job_sequence` | Job sequence | The counter within the project — 01, 02, 03. Allocated automatically: insert a job without one and a trigger assigns the next. NOT what Lofty calls the job number — that is jobs.job_number, the combined value. | `text` | Not null. Unique with project_id. Zero-padded to two digits, and wider than two past 99 rather than truncating. | Assigned by the jobs_assign_sequence trigger, which locks the parent project row first — two concurrent inserts would otherwise read the same max and collide on the unique index. Feeds job_number. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.job_number` | Job number | The job number as Lofty uses the phrase — '1001-01'. The project number and the sequence joined, so the parent reads straight off the child. This is what people type, quote and say out loud. | `generated text` | GENERATED ALWAYS AS (project_no::text \|\| '-' \|\| job_sequence) STORED. Unique. | Derived from jobs.project_no + jobs.job_sequence. Exposed by job_display.job_number. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.original_address_id` | Original address | The job's address as first recorded — what the contract says and what an email from last year refers to. Never moves. Not displayed, but always searchable. | `uuid` | Nullable. Falls back from current in a trigger. Indexed, because half of address search hits this column. | FK → addresses(id). Exposed by job_display.original_address and job_address_search. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.current_address_id` | Current address | What every card, board and search result shows. Identical to the original until something changes — a lot renumbered by council, a street renamed, a typo found at handover. | `uuid` | Not null. Falls back to the original in a trigger. Indexed. | FK → addresses(id). Exposed by job_display.current_address and job_address_search. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.stage_id` | Stage | Which of the eight pipeline phases the job is in now. The single answer to that question — job_stages carries the history, not the current position. | `integer` | Not null. | FK → stages(id). job_stages.is_current was removed in favour of this. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.owning_team_id` | Owning team | The one team holding the job right now. "One job, one team at a time" is the whole model. | `uuid` | Not null. | FK → teams(id). | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.assignee_id` | Assigned to | The person responsible inside the owning team. | `uuid` | Nullable. | FK → profiles(id). | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.status` | Status | Where the job stands — the same seven values as a project, from the same enum. What someone sets, not what the system works out. | `enum` | record_status. Not null, default 'on_track'. | Feeds is_current(status). Exposed by job_display.status and job_display.is_current. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.source_system` | Source system | Where the record originated — HubSpot, SharePoint, SiteBook, Trello. | `text` | Nullable. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.contract_status` | Contract status | Where the contract is up to. Free text today; a lookup once the states settle. | `text` | Nullable. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.deposit_status` | Deposit status | Whether the deposit has been received. | `text` | Nullable. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.drawings_status` | Drawings status | Where the working drawings are up to. | `text` | Nullable. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.requested_note` | Waiting on | What the job is blocked on. Non-null is what makes a card show the amber waiting flag. | `text` | Nullable. | Drives the card's warning state. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.notes` | Notes | Free text on the job. | `text` | Nullable. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.stage_entered_at` | Entered stage on | When the job arrived in its current stage. "Days in stage" is computed from this, never stored. | `timestamptz` | Not null, default now(). | Superseded by job_stages.entered_at if the composite table becomes authoritative. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `jobs.created_at` | Created on | When the job record was created. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.created_by` | Created by | Who created it. | `uuid` | Nullable. | FK → profiles(id). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.updated_at` | Updated on | When it last changed. Maintained by the touch_updated_at trigger, not by the app. | `timestamptz` | Not null, default now(). | Set by the jobs_touch trigger on every update. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `jobs.updated_by` | Updated by | Who last changed it. | `uuid` | Nullable. | FK → profiles(id). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `permission_grants`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `permission_grants.permission` | Permission | Which rung of the ladder this grant applies to. | `enum` | permission_level. Part of the composite primary key. | Keyed off the permission_level enum rather than a roles table. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `permission_grants.scope` | Scope | How wide the grant reaches — none, own, team, team_hierarchy, all. There is no 'division' scope: divisions were a prototype invention, not a Lofty concept. | `text` | Not null, CHECK against the scope list. | Each value maps to an RLS predicate. 'team' and 'team_hierarchy' both read profile_teams now that membership is many-to-many. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `profile_teams`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `profile_teams.profile_id` | Person | Half of the membership pair. People sit in more than one team, so membership is a table rather than a column on profiles. | `uuid` | Part of the composite primary key. | FK → profiles(id) ON DELETE CASCADE. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profile_teams.team_id` | Team | The other half of the pair. | `uuid` | Part of the composite primary key. | FK → teams(id) ON DELETE CASCADE. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profile_teams.is_primary` | Primary team | Which team answers the questions that need one answer: what the dashboard's "Heading to your team" panel watches, and what the board filters to by default. | `boolean` | Not null, default false. Partial unique index on (profile_id) WHERE is_primary — at most one per person, and none is legitimate for a new joiner. | Read by the dashboard and the default board filter. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profile_teams.joined_at` | Joined on | When the person was added to this team. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `profiles`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `profiles.id` | Profile ID | The person's identity in the app. Keyed one-to-one to auth.users, which Microsoft Entra populates — this row is the part Lofty owns, not the part the IdP owns. | `uuid` | Primary key. Not null. | FK → auth.users(id) ON DELETE CASCADE. Referenced by projects.manager_id (removed), addresses.created_by/updated_by, profile_teams.profile_id, activity.author_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.first_name` | First name | Given name. Separate from surname because people change names, and because greetings use the first name on its own — "Hi, Amber". | `text` | Not null. | Feeds full_name (generated) and profile_display.greeting_name. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.last_name` | Last name | Family name. Separate from first name so a name change is one field, not a string edit that has to be got exactly right. | `text` | Not null. | Feeds full_name (generated). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.full_name` | Full name | First and last joined, for cards, comment bylines and reports. Never written directly — change the two halves and this follows. | `generated text` | GENERATED ALWAYS AS (first_name \|\| ' ' \|\| last_name) STORED. Read-only. | Derived from profiles.first_name + profiles.last_name. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.preferred_name` | Goes by | What someone actually wants to be called, when it differs from their first name. Null means use the first name — never store a copy of it here. | `text` | Nullable. | Read by profile_display.greeting_name via COALESCE. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.email` | Email | Work email. Also the join key if people are ever imported from a spreadsheet. | `text` | Unique. Not null. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.permission` | Permission level | How far someone reaches: viewer reads, user works their own jobs, manager reads across teams, admin edits definitions, superadmin manages teams and can delete. Intended to sync with Microsoft Teams permission levels. | `enum` | permission_level. Not null, default 'viewer' (least privilege). | Compared by ordinal in RLS policies — permission >= 'manager'. Referenced by permission_grants.permission. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.job_title` | Job title | Free text, shown on the profile. Not a lookup and not tied to permission. | `text` | Nullable. | — | To do | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.phone` | Phone | Contact number, editable by the person themselves. | `text` | Nullable. | — | To do | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.active` | Active | Soft delete. A person is never hard-deleted — their name is on years of activity and comments. | `boolean` | Not null, default true. | Filters every user picker. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.source` | Source | Where the account came from — 'Entra ID' once SCIM is live, otherwise a manually created account. | `text` | Nullable. | — | To do | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.created_at` | Created on | When the profile row was created. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `profiles.updated_at` | Updated on | When the profile row last changed. Worth having when a permission or team change is disputed. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `project_address_search`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `project_address_search.role` | Matched address | The same, for projects. | `view` | Read-only. 'current' \| 'original'. | One row per (project, address role). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `project_display`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `project_display.current_address` | Project address (current) | The consolidated current address, joined for the cards. A view because a generated column cannot reach another table. | `view` | Read-only. | projects ⋈ addresses on current_address_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `project_display.original_address` | Project address (original) | The consolidated original address, for paperwork and search. | `view` | Read-only. | projects ⋈ addresses on original_address_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `projects`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `projects.id` | Project ID | The project's machine key. Never shown, never typed, never changes. | `uuid` | Primary key, default gen_random_uuid(). | Referenced by jobs.project_id ON DELETE CASCADE. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.project_no` | Project number | The number people quote. Sequential, four digits minimum, and overridable by hand when a number has to match something outside the system. | `integer` | Not null. Unique. Default nextval('project_no_seq') starting at 1000. CHECK (project_no >= 1000). | Denormalised onto jobs.project_no by the jobs_sync_project_number trigger; a renumber cascades via projects_cascade_renumber. A manual override pushes the sequence forward via projects_bump_no_seq, so the same number is never handed out twice. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.original_address_id` | Original address | Where the project started. Never moves — it is what contracts and old paperwork refer to. | `uuid` | Nullable. Falls back from current_address_id via the projects_default_current_address trigger. | FK → addresses(id). Exposed by project_display.original_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.current_address_id` | Current address | What every card, board and search shows. Identical to the original until something changes. | `uuid` | Not null. A blank value falls back to original_address_id in a trigger, so a caller only has to supply one. Indexed. | FK → addresses(id). Exposed by project_display.current_address. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.project_type` | Project type | Residential, commercial or development. | `enum` | project_type. Nullable. Values: residential, commercial, development. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.status` | Status | Where the project stands. A record is in exactly one of these at a time: on track, at risk, behind schedule, on hold, completed, cancelled or archived. This is what someone sets — it is not health. | `enum` | record_status. Not null, default 'on_track'. The same enum as jobs.status. Labels are snake_case because they are codes, not copy — the app maps them for display, so a rename is not a data migration. | Feeds is_current(status) — anything not completed, cancelled or archived is current. Exposed by project_display.status. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.start_date` | Start date | When work began. | `date` | Nullable. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.target_completion` | Target completion | The date being worked towards. | `date` | Nullable. | Drives the Gantt and the overdue calculation. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.end_date` | End date | When the project actually finished, as opposed to the target. | `date` | Nullable. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.created_at` | Created on | When the project record was created. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.created_by` | Created by | Who created it. | `uuid` | Nullable. | FK → profiles(id). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.updated_at` | Updated on | When it last changed. | `timestamptz` | Not null, default now(). | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `projects.updated_by` | Updated by | Who last changed it. | `uuid` | Nullable. | FK → profiles(id). | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `property_defs`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `property_defs.id` | Property definition ID | A field, defined once. Properties are rows rather than columns, which is what lets a team add what it captures without a schema migration — and why nothing in the app has a fixed number of field slots. | `uuid` | Primary key. | Referenced by property_values.property_def_id. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.key` | Key | Stable machine name, referenced by automations. Renaming the label never breaks them. | `text` | Unique. Not null. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.label` | Field name | What people see. Renameable at any time. | `text` | Not null. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.scope` | Level | Whether the field hangs off a project or a job. Two levels only — stage is context, not a level. | `text` | Not null. CHECK (scope in ('project','job')). | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.stage_id` | Captured at | Which stage of the pipeline this field gets filled in. | `integer` | Not null. | FK → stages(id). Groups the field slots on the job drawer and project detail. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.owning_team_id` | Captured by | Which team fills it in. Constrained to teams that own the stage. | `uuid` | Not null. | FK → teams(id). | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.format` | Format | The shape of the value — text, number, currency, date, checkbox, file, single/multi select, person, link. | `text` | Not null, CHECK against the format list. | Determines how property_values.value is validated and rendered. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.required` | Required to exit stage | Whether the job can leave stage_id without this filled in. Not the same as required to create the record. | `boolean` | Not null, default false. | OPEN QUESTION: some fields will mean 'required to create'. Those are different columns. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.automation` | Automation | What setting this field triggers — notify, block stage exit, start an SLA clock, recalculate dates. | `text` | Nullable. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `property_defs.archived_at` | Archived on | Retires a field without losing the history of what was captured in it. | `timestamptz` | Nullable. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `property_values`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `property_values.value` | Field value | One row per (property, record). Sparse by design — an unset field has no row at all. | `jsonb` | Shape enforced against property_defs.format. | Composite primary key (property_def_id, subject_type, subject_id). subject_type CHECK in ('project','job'); the scope check on property_defs is what stops a project field being set on a job. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `stages`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `stages.id` | Stage ID | One of the eight pipeline phases. Seeded, not user-created — this is the business process. | `integer` | Primary key. | Referenced by jobs.stage_id, job_stages.stage_id, property_defs.stage_id, template_phases.stage_id. | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `stages.name` | Stage name | The phase name, as it appears as a board column heading. | `text` | Unique. Not null. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |
| `stages.position` | Order | Board column order. The whole reason stages are ordered rather than a set. | `integer` | Unique. Not null. | — | Created | 2026-08-01 · Amber Beaumont | 2026-08-01 · Amber Beaumont |

## `tags`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tags.id` | Tag | A free label on a job — IF, Council hold, Design variation. | `uuid` | Primary key. | Many-to-many with jobs via job_tags. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `teams`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `teams.id` | Team ID | A team. Each owns one or more pipeline phases, which drives the handover between them. | `uuid` | Primary key. | Referenced by profile_teams.team_id, jobs.owning_team_id, property_defs.owning_team_id, template_phases.owning_team_id. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `teams.name` | Team name | What the team is called. | `text` | Unique. Not null. | — | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
| `teams.parent_team_id` | Parent team | The hierarchy the team_hierarchy permission scope walks. | `uuid` | Nullable. | Self-FK → teams(id). Walked recursively by visible_team_ids(). | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `template_checkpoints`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `template_checkpoints.label` | Checkpoint | One thing a phase expects done before handover. Instantiated per job as job_checkpoints. | `text` | Not null. | Copied to job_checkpoints.label when a job is created from a template. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |

## `template_phases`

| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `template_phases.expected_days` | Expected days | How long a phase should take. What the Gantt measures actual time in stage against. | `integer` | Nullable. | FK context: template_phases → templates, stages, teams. | To do | 2026-08-01 · Proposed — from concept spec | 2026-08-01 · Proposed — from concept spec |
