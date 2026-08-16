/**
 * The data dictionary.
 *
 * One entry per property, and this module is the only place they are written down. The
 * markdown file at the repo root is *generated* from here (`npm run dictionary`), and
 * the Dictionary page in the app renders the same array — so the file, the page and the
 * code cannot disagree with each other. They can still disagree with Postgres, which is
 * what `status` is for.
 *
 * When `property_defs` comes online this array becomes a seed for a `data_dictionary`
 * table and the page starts reading through the repository seam instead. The shape here
 * is already the shape of that table, so that swap is a query, not a rewrite.
 */

export const DICTIONARY_STATUSES = [
  "to_do",
  "created",
  "updates_required",
  "merged",
  "archived"
] as const;
export type DictionaryStatus = (typeof DICTIONARY_STATUSES)[number];

export const STATUS_LABELS: Record<DictionaryStatus, string> = {
  to_do: "To do",
  created: "Created",
  updates_required: "Updates required",
  merged: "Merged",
  archived: "Archived"
};

/** How the status reads at a glance — drives the pill colour, nothing else. */
export const STATUS_TONE: Record<DictionaryStatus, "neutral" | "positive" | "warning" | "negative"> = {
  to_do: "neutral",
  created: "positive",
  updates_required: "warning",
  merged: "positive",
  archived: "negative"
};

export type DataType =
  | "uuid"
  | "text"
  | "integer"
  | "numeric"
  | "boolean"
  | "date"
  | "timestamptz"
  | "enum"
  | "jsonb"
  | "generated text"
  | "view";

export interface DictionaryEntry {
  /** `table.column` exactly as it is in Postgres. The primary key of this dictionary. */
  id: string;
  /** The table it lives on. Redundant with `id` on purpose — it is what people filter by. */
  table: string;
  /** The column name on its own. */
  column: string;
  /** What Lofty calls it. Editable by managers and above. */
  friendlyName: string;
  /** What it is and what it does. Editable by managers and above. */
  definition: string;
  type: DataType;
  /** Constraints, defaults, checks — anything the database enforces. */
  rules: string;
  /** Foreign keys, generated-from, triggers, views that read it. */
  relationships: string;
  status: DictionaryStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

const AMBER = "Amber Beaumont";
const PROPOSED = "Proposed — from concept spec";
const D = "2026-08-01";

/** Terse constructor so the data below stays readable as a table. */
const e = (
  id: string,
  friendlyName: string,
  definition: string,
  type: DataType,
  rules: string,
  relationships: string,
  status: DictionaryStatus,
  by: string = AMBER
): DictionaryEntry => {
  const [table, column] = id.split(".");
  return {
    id, table, column, friendlyName, definition, type, rules, relationships,
    status, createdAt: D, createdBy: by, updatedAt: D, updatedBy: by
  };
};

export const DICTIONARY: DictionaryEntry[] = [
  // ------------------------------------------------------------------ profiles
  e("profiles.id", "Profile ID",
    "The person's identity in the app, minted when they are added to it. Since 0015 this is Lofty's own key and no longer the auth.users id — a staff record exists before anyone signs in, which is what makes a pre-created team list possible.",
    "uuid", "Primary key. Not null, default gen_random_uuid().",
    "Referenced by addresses.created_by/updated_by, profile_teams.profile_id, activity.author_id. No longer FK to auth.users — see profiles.auth_user_id.",
    "created"),
  e("profiles.auth_user_id", "Microsoft account",
    "The linked Entra login, filled by a trigger the first time the person signs in. Null means created but not yet arrived — a real and expected state. This, not profiles.id, is what every RLS policy compares against auth.uid().",
    "uuid", "Unique. Nullable.",
    "FK → auth.users(id) ON DELETE SET NULL — deleting the Microsoft account unlinks the staff record, it does not erase it. Read by is_active_user() and current_permission().",
    "created"),
  e("profiles.first_name", "First name",
    "Given name. Separate from surname because people change names, and because greetings use the first name on its own — \"Hi, Amber\".",
    "text", "Not null.", "Feeds full_name (generated) and profile_display.greeting_name.", "created"),
  e("profiles.last_name", "Last name",
    "Family name. Separate from first name so a name change is one field, not a string edit that has to be got exactly right.",
    "text", "Not null.", "Feeds full_name (generated).", "created"),
  e("profiles.full_name", "Full name",
    "First and last joined, for cards, comment bylines and reports. Never written directly — change the two halves and this follows.",
    "generated text", "GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED. Read-only.",
    "Derived from profiles.first_name + profiles.last_name.", "created"),
  e("profiles.preferred_name", "Goes by",
    "What someone actually wants to be called, when it differs from their first name. Null means use the first name — never store a copy of it here.",
    "text", "Nullable.", "Read by profile_display.greeting_name via COALESCE.", "created"),
  e("profiles.email", "Email",
    "The address the person actually uses and the one the app shows. At Lofty this is @lofty.com.au, which is usually NOT what they sign in with — see login_email.",
    "text", "Unique. Not null.", "—", "created"),
  e("profiles.login_email", "Microsoft sign-in address",
    "The address on the Microsoft account, when it differs from email — at Lofty typically @loftybg.onmicrosoft.com. A matching key and nothing else: the link trigger looks a person up by this, and no screen displays it.",
    "text", "Unique on lower(login_email). Nullable.",
    "Matched against auth.users.email by the on_auth_user_created trigger.", "created"),
  e("profiles.permission", "Permission level",
    "How far someone reaches: viewer reads, user works their own jobs, manager reads across teams, admin edits definitions, superadmin manages teams and can delete. Intended to sync with Microsoft Teams permission levels.",
    "enum", "permission_level. Not null, default 'viewer' (least privilege).",
    "Compared by ordinal in RLS policies — permission >= 'manager'. Referenced by permission_grants.permission.",
    "created"),
  e("profiles.job_title", "Job title", "Free text, shown on the profile. Not a lookup and not tied to permission — a Manager by title may be a user by permission.",
    "text", "Nullable.", "—", "created"),
  e("profiles.phone", "Phone", "Contact number, editable by the person themselves.", "text", "Nullable.", "—", "to_do"),
  e("profiles.active", "Active",
    "Soft delete. A person is never hard-deleted — their name is on years of activity and comments.",
    "boolean", "Not null, default true.", "Filters every user picker.", "created"),
  e("profiles.source", "Source",
    "Where the account came from — 'Entra ID' once SCIM is live, otherwise a manually created account.",
    "text", "Nullable.", "—", "to_do"),
  e("profiles.created_at", "Created on", "When the profile row was created.", "timestamptz", "Not null, default now().", "—", "created"),
  e("profiles.updated_at", "Updated on", "When the profile row last changed. Worth having when a permission or team change is disputed.", "timestamptz", "Not null, default now().", "—", "created"),

  // ------------------------------------------------------------- profile_teams
  e("profile_teams.profile_id", "Person", "Half of the membership pair. People sit in more than one team, so membership is a table rather than a column on profiles.",
    "uuid", "Part of the composite primary key.", "FK → profiles(id) ON DELETE CASCADE.", "created"),
  e("profile_teams.team", "Team",
    "The other half of the pair. An enum value, not a row — the list of teams is the `team` type, while this table holds who is in them.",
    "enum", "team. Part of the composite primary key. Indexed.",
    "Replaced profile_teams.team_id in 0004, which was a uuid pointing at a teams table that was never built.",
    "created"),
  e("profile_teams.is_primary", "Primary team",
    "Which team answers the questions that need one answer: what the dashboard's \"Heading to your team\" panel watches, and what the board filters to by default.",
    "boolean", "Not null, default false. Partial unique index on (profile_id) WHERE is_primary — at most one per person, and none is legitimate for a new joiner.",
    "Read by the dashboard and the default board filter.", "created"),
  e("profile_teams.joined_at", "Joined on (merged)",
    "Merged into created_at. This was recorded as built and never was — 0001 gave profile_teams the standard audit quartet and no joined_at, and a membership row is created when the person joins, so created_at already answers it. Caught by cross-checking the dictionary against information_schema.",
    "timestamptz", "Never created.",
    "Superseded by profile_teams.created_at.",
    "merged"),

  // ----------------------------------------------------------------- addresses
  e("addresses.id", "Address ID",
    "The address as a record. Addresses get corrected and changed — a lot renumbered by council, a street renamed, a typo found at handover — so everything points at this id rather than carrying a copy of the text.",
    "uuid", "Primary key, default gen_random_uuid().",
    "Referenced by projects.original_address_id / current_address_id and jobs.original_address_id / current_address_id.",
    "created"),
  e("addresses.lot_number", "Lot number",
    "The lot as it appears on the plan of division.",
    "text", "Nullable. Text, not a number — \"12A\", \"5-7\" and \"Lot 3\" are as common as 12, and an integer column has to be migrated the first time one arrives.",
    "—", "created"),
  e("addresses.street_number", "Street number", "The number on the street. Text for the same reason as the lot number.",
    "text", "Nullable.", "Feeds consolidated_address.", "created"),
  e("addresses.street_1", "Street", "Street name and type — \"Ironbark Road\".", "text", "Not null.", "Feeds consolidated_address.", "created"),
  e("addresses.street_2", "Unit / level", "Anything above the street line — unit, level, building name.", "text", "Nullable.", "Feeds consolidated_address.", "created"),
  e("addresses.suburb", "Suburb", "Suburb or locality.", "text", "Not null. Indexed.", "Feeds consolidated_address; exposed by project_display.suburb.", "created"),
  e("addresses.state", "State", "Australian state or territory.",
    "enum", "au_state. Not null, default 'SA'. Values: SA NSW VIC QLD WA NT TAS ACT.",
    "Feeds consolidated_address. Filters the council picker.", "created"),
  e("addresses.country", "Country", "Country. One value today; an enum so a second is ALTER TYPE, not a data-cleaning exercise.",
    "enum", "country_code. Not null, default 'AU'.", "Feeds consolidated_address.", "created"),
  e("addresses.council", "Council region",
    "The local government area the address sits in. The council's name is the value itself — 'City of Burnside', not an id pointing at it — so reading it needs no join.",
    "enum",
    "sa_council. Nullable. Indexed. 68 values from the LGA listing, declared in that listing's order, so `order by council` is picker order. CHECK addresses_council_is_sa: only an SA address may carry one, because the enum is SA-only.",
    "Exposed by project_display.council, project_address_search.council and job_address_search.council. Replaced addresses.council_id in 0003.",
    "created"),
  e("addresses.consolidated_address", "Full address",
    "The whole address as one string, assembled in the database so every card, export and search reads exactly the same text.",
    "text",
    "Not null. Maintained by the addresses_build_consolidated trigger, never written by the app — not a generated column, because a generation expression must be IMMUTABLE and the enum-to-text casts are not (enum_out is STABLE). Built with || and coalesce rather than concat_ws, so a null part drops its separator.",
    "Derived from street_2, street_number, street_1, suburb, state, country. Read by project_display.current_address / original_address.",
    "created"),
  e("addresses.created_at", "Created on", "When the address was first recorded.", "timestamptz", "Not null, default now().", "—", "created"),
  e("addresses.created_by", "Created by", "Who recorded it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),
  e("addresses.updated_at", "Updated on", "When the address was last corrected.", "timestamptz", "Not null, default now().", "—", "created"),
  e("addresses.updated_by", "Updated by", "Who last corrected it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),

  // ----------------------------------------------------------- council_regions
  e("council_regions.id", "Council (merged)",
    "Merged into the sa_council enum on addresses. The table held 68 rows nobody maintained, plus the audit quartet and a touch trigger to look after them. A council is now a value on the address, not a row it points at.",
    "uuid", "Table dropped in 0003.",
    "Superseded by addresses.council. The state filter it used to provide is the addresses_council_is_sa CHECK; the active flag has no equivalent, because Postgres cannot drop an enum value.",
    "merged"),

  // ------------------------------------------------------------------ projects
  e("projects.id", "Project ID", "The project's machine key. Never shown, never typed, never changes.",
    "uuid", "Primary key, default gen_random_uuid().", "Referenced by jobs.project_id ON DELETE CASCADE.", "created"),
  e("projects.project_no", "Project number",
    "The number people quote. Sequential, four digits minimum, and overridable by hand when a number has to match something outside the system.",
    "integer",
    "Not null. Unique. Default nextval('project_no_seq') starting at 1000. CHECK (project_no >= 1000).",
    "Denormalised onto jobs.project_no by the jobs_sync_project_number trigger; a renumber cascades via projects_cascade_renumber. A manual override pushes the sequence forward via projects_bump_no_seq, so the same number is never handed out twice.",
    "created"),
  e("projects.original_address_id", "Original address",
    "Where the project started. Never moves — it is what contracts and old paperwork refer to.",
    "uuid", "Nullable. Falls back from current_address_id via the projects_default_current_address trigger.",
    "FK → addresses(id). Exposed by project_display.original_address.", "created"),
  e("projects.current_address_id", "Current address",
    "What every card, board and search shows. Identical to the original until something changes.",
    "uuid", "Not null. A blank value falls back to original_address_id in a trigger, so a caller only has to supply one. Indexed.",
    "FK → addresses(id). Exposed by project_display.current_address.", "created"),
  e("projects.project_type", "Project type", "Residential, commercial or development.",
    "enum", "project_type. Nullable. Values: residential, commercial, development.", "—", "created"),
  e("projects.status", "Status",
    "Where the project stands. A record is in exactly one of these at a time: on track, at risk, behind schedule, on hold, completed, cancelled or archived. This is what someone sets — it is not health.",
    "enum",
    "record_status. Not null, default 'on_track'. The same enum as jobs.status. Labels are snake_case because they are codes, not copy — the app maps them for display, so a rename is not a data migration.",
    "Feeds is_current(status) — anything not completed, cancelled or archived is current. Exposed by project_display.status.",
    "created"),
  e("projects.start_date", "Start date", "When work began.", "date", "Nullable.", "—", "created"),
  e("projects.target_completion", "Target completion", "The date being worked towards.", "date", "Nullable.", "Drives the Gantt and the overdue calculation.", "created"),
  e("projects.end_date", "End date", "When the project actually finished, as opposed to the target.", "date", "Nullable.", "—", "created"),
  e("projects.created_at", "Created on", "When the project record was created.", "timestamptz", "Not null, default now().", "—", "created"),
  e("projects.created_by", "Created by", "Who created it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),
  e("projects.updated_at", "Updated on", "When it last changed.", "timestamptz", "Not null, default now().", "—", "created"),
  e("projects.updated_by", "Updated by", "Who last changed it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),

  // ------------------------------------------------------------ project_display
  e("project_display.current_address", "Project address (current)",
    "The consolidated current address, joined for the cards. A view because a generated column cannot reach another table.",
    "view", "Read-only.", "projects ⋈ addresses on current_address_id.", "created"),
  e("project_display.original_address", "Project address (original)",
    "The consolidated original address, for paperwork and search.",
    "view", "Read-only.", "projects ⋈ addresses on original_address_id.", "created"),
  e("project_display.council", "Council region",
    "The council of the project's current address, carried through so a card can show it without joining addresses itself. The council's name, not an id — it has been an enum value since 0003.",
    "view", "Read-only. sa_council.", "Reads addresses.council via current_address_id. Replaced project_display.council_id.", "created"),

  // ---------------------------------------------------------------------- jobs
  e("jobs.id", "Job ID", "The job's machine key.", "uuid", "Primary key.", "Referenced by job_tags, job_dependencies, activity. job_stages was dropped in 0006.", "created"),
  e("jobs.project_id", "Parent project",
    "The project this job belongs to. One project, many jobs. The uuid rather than the friendly number, so renumbering a project never orphans its jobs.",
    "uuid", "Not null. Indexed.", "FK → projects(id) ON DELETE CASCADE.", "created"),
  e("jobs.project_no", "Project number",
    "The friendly project number, user-facing. Held on the job only so job_number can be a generated column — a generated column cannot reach another table. Never written by the app.",
    "integer", "Not null.", "Maintained by the jobs_sync_project_number and projects_cascade_renumber triggers.", "created"),
  e("jobs.job_sequence", "Job sequence",
    "The counter within the project — 01, 02, 03. Allocated automatically: insert a job without one and a trigger assigns the next. NOT what Lofty calls the job number — that is jobs.job_number, the combined value.",
    "text", "Not null. Unique with project_id. Zero-padded to two digits, and wider than two past 99 rather than truncating. CHECK (>= 1) — there is no zeroth job, and the check is on the column rather than only in the trigger because a hand-written insert can supply its own sequence.",
    "Assigned by the jobs_assign_sequence trigger, which locks the parent project row first — two concurrent inserts would otherwise read the same max and collide on the unique index. Feeds job_number.",
    "created"),
  e("jobs.job_number", "Job number",
    "The job number as Lofty uses the phrase — '1001-01'. The project number and the sequence joined, so the parent reads straight off the child. This is what people type, quote and say out loud.",
    "generated text", "GENERATED ALWAYS AS (project_no::text || '-' || job_sequence) STORED. Unique.",
    "Derived from jobs.project_no + jobs.job_sequence. Exposed by job_display.job_number.",
    "created"),
  e("jobs.original_address_id", "Original address",
    "The job's address as first recorded — what the contract says and what an email from last year refers to. Never moves. Not displayed, but always searchable.",
    "uuid", "Nullable. Falls back from current in a trigger. Indexed, because half of address search hits this column.",
    "FK → addresses(id). Exposed by job_display.original_address and job_address_search.",
    "created"),
  e("jobs.current_address_id", "Current address",
    "What every card, board and search result shows. Identical to the original until something changes — a lot renumbered by council, a street renamed, a typo found at handover.",
    "uuid", "Not null. Falls back to the original in a trigger. Indexed.",
    "FK → addresses(id). Exposed by job_display.current_address and job_address_search.",
    "created"),
  e("jobs.stage", "Stage",
    "Which of the eight pipeline phases the job is in now, and the single answer to that question. The board filters on this column every load.",
    "enum", "stage. Not null, default 'Sales & acquisition'. Indexed.",
    "Replaced the proposed jobs.stage_id in 0004. Paired with stage_entered_at, which a trigger moves whenever this changes.",
    "created"),
  e("jobs.owning_team", "Owning team", "The one team holding the job right now. \"One job, one team at a time\" is the whole model.", "enum", "team. Not null.", "An enum value since 0004, not an FK — there is no teams table to point at.", "to_do", PROPOSED),
  e("jobs.assignee_id", "Assigned to", "The person responsible inside the owning team.", "uuid", "Nullable.", "FK → profiles(id).", "to_do", PROPOSED),
  e("jobs.status", "Status",
    "Where the job stands — the same seven values as a project, from the same enum. What someone sets, not what the system works out.",
    "enum", "record_status. Not null, default 'on_track'.",
    "Feeds is_current(status). Exposed by job_display.status and job_display.is_current.",
    "to_do", PROPOSED),
  e("jobs.source_system", "Source system", "Where the record originated — HubSpot, SharePoint, SiteBook, Trello.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.contract_status", "Contract status", "Where the contract is up to. Free text today; a lookup once the states settle.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.deposit_status", "Deposit status", "Whether the deposit has been received.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.drawings_status", "Drawings status", "Where the working drawings are up to.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.requested_note", "Waiting on", "What the job is blocked on. Non-null is what makes a card show the amber waiting flag.", "text", "Nullable.", "Drives the card's warning state.", "to_do", PROPOSED),
  e("jobs.notes", "Notes", "Free text on the job.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.stage_entered_at", "Entered stage on",
    "When the job arrived in its current stage. \"Days in stage\" is now() minus this, computed and never stored.",
    "timestamptz", "Not null, default now(). Maintained by the jobs_touch_stage_entered_at trigger, so it cannot drift off stage when someone updates one without the other.",
    "Paired with jobs.stage. Was the alternative to job_stages.entered_at; job_stages was dropped in 0006, so this is the only record of when the current stage began.",
    "created"),

  // -------------------------------------------------------------- job_display
  e("job_display.project_type", "Job type (inherited)",
    "The job's type, which is its project's type. Inherited through the view rather than copied onto the job, so there is nowhere for the two to disagree.",
    "view", "Read-only.", "jobs ⋈ projects on project_id.", "created"),
  e("job_display.is_current", "Is current",
    "Whether the job is still live — not completed, cancelled or archived. Derived from status every time it is read, never stored.",
    "view", "Read-only. is_current(jobs.status).", "Mirrors the isCurrent() helper in the app.", "created"),
  e("jobs.created_at", "Created on", "When the job record was created.", "timestamptz", "Not null, default now().", "—", "created"),
  e("jobs.created_by", "Created by", "Who created it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),
  e("jobs.updated_at", "Updated on", "When it last changed. Maintained by the touch_updated_at trigger, not by the app.", "timestamptz", "Not null, default now().", "Set by the jobs_touch trigger on every update.", "created"),
  e("jobs.updated_by", "Updated by", "Who last changed it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),

  e("job_display.job_number", "Job number",
    "The job number, joined for the board and for search.",
    "view", "Read-only.", "jobs.job_number.", "created"),
  e("job_address_search.role", "Matched address",
    "Whether a search hit the job's current or original address. Worth showing: a hit on an original address is a hint that whoever searched is working from stale information.",
    "view", "Read-only. 'current' | 'original'.",
    "One row per (job, address role), so a match on either address finds the job. Backed by a trigram index on addresses.consolidated_address.",
    "created"),
  e("project_address_search.role", "Matched address",
    "The same, for projects.",
    "view", "Read-only. 'current' | 'original'.",
    "One row per (project, address role).", "created"),
  e("job_display.current_address", "Job address (current)",
    "The consolidated current address, joined for the board and for search.",
    "view", "Read-only.", "jobs ⋈ addresses on current_address_id.", "created"),

  // ---------------------------------------------------------------- job_stages
  e("job_stages.id", "Job stage (removed)",
    "Removed. It was one row per job per stage with entered_at and exited_at, and answering \"what stage is this job in\" meant finding the row with a null exited_at — the wrong shape for a query the board makes on every load. 0004 moved the current position onto the job as stage and stage_entered_at, which left this table holding only the durations of stages a job had already left. Nothing wrote to it and no screen read it, so 0006 dropped it.",
    "uuid", "Table dropped in 0006.",
    "Current position is jobs.stage + jobs.stage_entered_at. Past transitions are in activity_audit, whose trigger captures whole rows — an update changing jobs.stage leaves old_row->>'stage', new_row->>'stage' and changed_at.",
    "merged"),
  e("job_stages.is_current", "Is current (removed)",
    "Removed before the table itself was. Which stage a job is in now is jobs.stage; whether the job itself is current is is_current(status) — anything not completed, cancelled or archived. A third copy of that fact was a third thing to keep true.",
    "boolean", "Dropped from the schema.",
    "Superseded by jobs.stage and the is_current(record_status) function.",
    "merged"),

  // -------------------------------------------------- property_defs and values
  e("property_defs.id", "Property definition ID",
    "A field, defined once. Properties are rows rather than columns, which is what lets a team add what it captures without a schema migration — and why nothing in the app has a fixed number of field slots.",
    "uuid", "Primary key.", "Referenced by property_values.property_def_id.", "to_do", PROPOSED),
  e("property_defs.key", "Key", "Stable machine name, referenced by automations. Renaming the label never breaks them.", "text", "Unique. Not null.", "—", "to_do", PROPOSED),
  e("property_defs.label", "Field name", "What people see. Renameable at any time.", "text", "Not null.", "—", "to_do", PROPOSED),
  e("property_defs.scope", "Level", "Whether the field hangs off a project or a job. Two levels only — stage is context, not a level.", "text", "Not null. CHECK (scope in ('project','job')).", "—", "to_do", PROPOSED),
  e("property_defs.stage", "Captured at", "Which stage of the pipeline this field gets filled in.", "enum", "stage. Not null.", "An enum column since 0004, not an FK. Groups the field slots on the job drawer and project detail.", "to_do", PROPOSED),
  e("property_defs.owning_team", "Captured by", "Which team fills it in. Constrained to teams that own the stage.", "enum", "team. Not null.", "An enum column since 0004, not an FK.", "to_do", PROPOSED),
  e("property_defs.format", "Format", "The shape of the value — text, number, currency, date, checkbox, file, single/multi select, person, link.", "text", "Not null, CHECK against the format list.", "Determines how property_values.value is validated and rendered.", "to_do", PROPOSED),
  e("property_defs.required", "Required to exit stage", "Whether the job can leave the stage without this filled in. Not the same as required to create the record.", "boolean", "Not null, default false.", "OPEN QUESTION: some fields will mean 'required to create'. Those are different columns.", "to_do", PROPOSED),
  e("property_defs.automation", "Automation", "What setting this field triggers — notify, block stage exit, start an SLA clock, recalculate dates.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("property_defs.archived_at", "Archived on", "Retires a field without losing the history of what was captured in it.", "timestamptz", "Nullable.", "—", "to_do", PROPOSED),
  e("property_values.value", "Field value",
    "One row per (property, record). Sparse by design — an unset field has no row at all.",
    "jsonb", "Shape enforced against property_defs.format.",
    "Composite primary key (property_def_id, subject_type, subject_id). subject_type CHECK in ('project','job'); the scope check on property_defs is what stops a project field being set on a job.",
    "to_do", PROPOSED),

  // ------------------------------------------------------------------- lookups
  e("teams.id", "Team (merged)",
    "Merged into the `team` enum. The table was specified but never built — profile_teams.team_id pointed at nothing from 0001 until 0004, and the app queried a table that did not exist. The eleven values came from PHASES in stubRepository.ts, the only place they had been written down.",
    "uuid", "Never created. Superseded by the team enum in 0004.",
    "Referenced now as an enum value by profile_teams.team, and by jobs.owning_team_id, property_defs.owning_team_id and template_phases.owning_team_id when those are built.",
    "merged"),
  e("teams.parent_team_id", "Parent team (merged)",
    "Merged with the table. It existed for the team_hierarchy permission scope to walk, but every seeded team had a null parent, so the hierarchy was never real. An enum cannot hold a parent pointer; if a hierarchy is genuinely wanted it comes back as a table keyed by the enum, not as this column.",
    "uuid", "Never created.",
    "The team_hierarchy scope needs rethinking against a flat team enum, or a new table to walk.",
    "merged"),
  e("stages.id", "Stage (merged)",
    "Merged into the `stage` enum. Eight seeded values that are the business process rather than data anyone maintains. As a table it cost a touch trigger, an RLS policy, the audit quartet and a position column to hold an order that enums give by declaration.",
    "integer", "Table dropped in 0004.",
    "Superseded by jobs.stage. Also the type for property_defs.stage_id and template_phases.stage_id when those are built — as enum columns, not FKs.",
    "merged"),
  e("stages.position", "Order (merged)",
    "Merged. Enum values sort by declaration order, so the type itself is the board's column order and a separate column would be a second copy of it. The cost is that reordering the pipeline is no longer an UPDATE — it needs a new type and a rewrite of jobs.stage.",
    "integer", "Column dropped with the table in 0004.",
    "Superseded by the declaration order of the stage enum.",
    "merged"),
  e("health_statuses.id", "Health status",
    "PARKED — deliberately not built yet. Health is calculated, not set: is it on schedule, is it over budget, has an issue been raised. The inputs are still to be decided, and inventing a column before they are known would bake in the wrong answer. Distinct from status, which is what a person sets.",
    "text", "Not in the schema. Awaiting the list of inputs it is calculated from.",
    "Will be derived, not stored — no column until the calculation is settled.",
    "to_do", PROPOSED),
  e("job_types.id", "Job type (merged)",
    "Merged into the project_type enum. A job's type is its project's type — a commercial project does not contain residential jobs, so a second column would only ever be a chance to disagree with the first. Read it through job_display.project_type.",
    "integer", "Table dropped.",
    "Superseded by projects.project_type, inherited by jobs through the job_display view.",
    "merged", PROPOSED),
  e("build_stages.id", "Build stage", "The construction sub-stage inside Construction & execution — slab, frame, lock-up and so on.", "integer", "Primary key.", "Referenced by jobs.build_stage_id.", "to_do", PROPOSED),
  e("tags.id", "Tag", "A free label on a job — IF, Council hold, Design variation.", "uuid", "Primary key.", "Many-to-many with jobs via job_tags.", "to_do", PROPOSED),
  e("divisions.id", "Division (removed)",
    "Removed — it was never a Lofty concept. Division appears nowhere in the concept spec; the prototype invented it, derived it from the project type, and relabelled development work as \"Land\" — a term that is wrong as well as redundant. The correct word is development, which is what project_type has always used. The table, projects.division_id, teams.division_id and the 'division' permission scope are all gone.",
    "uuid", "Table dropped.",
    "Superseded by projects.project_type. \"Everything of this type\" is project_type; \"everything in these teams\" is the team_hierarchy scope.",
    "merged"),

  // ------------------------------------------------- activity_audit (built)
  // Added outside the numbered migrations. Documented here because it is real and
  // load-bearing — it is where stage history lives now that job_stages is gone.
  e("activity_audit.id", "Audit entry",
    "One row per change to a tracked table. The trg_activity_audit_row trigger fires after every insert, update and delete on profiles, profile_teams, addresses, projects and jobs.",
    "integer", "Primary key, bigint identity. The only index on the table.",
    "Written by log_activity_audit(). Not written by the app.",
    "created", "Amber Beaumont — outside the migrations"),
  e("activity_audit.table_name", "Table", "Which table changed, alongside schema_name.", "text", "Not null.",
    "Filtering by this is a sequential scan today — worth an index on (table_name, changed_at) if audit queries become routine.",
    "created", "Amber Beaumont — outside the migrations"),
  e("activity_audit.operation", "Operation", "INSERT, UPDATE or DELETE.", "text", "Not null.", "—", "created", "Amber Beaumont — outside the migrations"),
  e("activity_audit.old_row", "Before", "The whole row as it was, as jsonb. Null on insert.", "jsonb", "Nullable.",
    "to_jsonb(old). Because it captures every column, old_row->>'stage' is where a job's previous stage is recorded.",
    "created", "Amber Beaumont — outside the migrations"),
  e("activity_audit.new_row", "After", "The whole row as it became, as jsonb. Null on delete.", "jsonb", "Nullable.",
    "to_jsonb(new). new_row->>'stage' paired with changed_at is what replaces job_stages.entered_at.",
    "created", "Amber Beaumont — outside the migrations"),
  e("activity_audit.changed_at", "Changed on", "When the change happened.", "timestamptz", "Not null.",
    "The timestamp any reconstruction of time-in-stage measures between.",
    "created", "Amber Beaumont — outside the migrations"),
  e("activity_audit.changed_by", "Changed by", "The database role that made the change; jwt_sub carries the authenticated user.", "text", "Nullable.", "Paired with jwt_sub.", "created", "Amber Beaumont — outside the migrations"),

  // -------------------------------------------------- login_activity (built)
  e("login_activity.id", "Login entry", "One row per authentication event.", "integer", "Primary key, bigint identity.", "Written from auth.users by log_login_activity_from_auth_users().", "created", "Amber Beaumont — outside the migrations"),
  e("login_activity.user_id", "User", "Who signed in.", "uuid", "Nullable. Indexed.", "References auth.users(id). Email is denormalised alongside it so the row survives account deletion.", "created", "Amber Beaumont — outside the migrations"),
  e("login_activity.event_type", "Event", "What kind of authentication event it was.", "text", "Nullable.", "Details in metadata.", "created", "Amber Beaumont — outside the migrations"),
  e("login_activity.occurred_at", "Occurred on", "When it happened.", "timestamptz", "Not null. Indexed descending.", "Indexed for \"most recent first\", which is how it is read.", "created", "Amber Beaumont — outside the migrations"),

  // ------------------------------------------------------------------ activity
  e("activity.id", "Activity ID", "One feed for both events and comments — the UI interleaves them, so the schema should not keep them apart. Distinct from activity_audit: this is what people read, that is what the database records.", "uuid", "Primary key.", "—", "to_do", PROPOSED),
  e("activity.subject_type", "Subject type", "Whether the entry is against a job or a project.", "text", "Not null. CHECK in ('job','project').", "Paired with subject_id. Indexed with it.", "to_do", PROPOSED),
  e("activity.subject_id", "Subject", "Which job or project.", "uuid", "Not null.", "Polymorphic — no FK, enforced by the app.", "to_do", PROPOSED),
  e("activity.kind", "Kind", "An event the system recorded, or a comment a person wrote.", "text", "Not null. CHECK in ('event','comment').", "—", "to_do", PROPOSED),
  e("activity.description", "Description", "The text of the event or comment.", "text", "Not null.", "—", "to_do", PROPOSED),
  e("activity.author_id", "Author", "Who wrote it. Null for system events.", "uuid", "Nullable.", "FK → profiles(id).", "to_do", PROPOSED),
  e("activity.mentions", "Mentions", "Who was @mentioned, for the notification fan-out.", "jsonb", "uuid[], default '{}'.", "Each entry references profiles(id).", "to_do", PROPOSED),

  // ------------------------------------------------------- templates and perms
  e("template_phases.expected_days", "Expected days", "How long a phase should take. What the Gantt measures actual time in stage against.", "integer", "Nullable.", "Keyed by template plus the stage enum; the owning team is a team enum value. Neither is an FK.", "to_do", PROPOSED),
  e("template_checkpoints.label", "Checkpoint", "One thing a phase expects done before handover. Instantiated per job as job_checkpoints.", "text", "Not null.", "Copied to job_checkpoints.label when a job is created from a template.", "to_do", PROPOSED),
  e("permission_grants.permission", "Permission", "Which rung of the ladder this grant applies to.", "enum", "permission_level. Part of the composite primary key.", "Keyed off the permission_level enum rather than a roles table.", "to_do", PROPOSED),
  e("permission_grants.scope", "Scope",
    "How wide the grant reaches — none, own, team, team_hierarchy, all. There is no 'division' scope: divisions were a prototype invention, not a Lofty concept.",
    "text", "Not null, CHECK against the scope list.",
    "Each value maps to an RLS predicate. 'team' and 'team_hierarchy' both read profile_teams now that membership is many-to-many.",
    "to_do", PROPOSED)
];

// ---------------------------------------------------------------- derived views

export const DICTIONARY_TABLES: string[] = [...new Set(DICTIONARY.map(d => d.table))].sort();

export function entriesFor(table: string): DictionaryEntry[] {
  return DICTIONARY.filter(d => d.table === table);
}

export function countByStatus(): Record<DictionaryStatus, number> {
  const out = Object.fromEntries(DICTIONARY_STATUSES.map(s => [s, 0])) as Record<DictionaryStatus, number>;
  DICTIONARY.forEach(d => { out[d.status] += 1; });
  return out;
}
