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
    "The person's identity in the app. Keyed one-to-one to auth.users, which Microsoft Entra populates — this row is the part Lofty owns, not the part the IdP owns.",
    "uuid", "Primary key. Not null.",
    "FK → auth.users(id) ON DELETE CASCADE. Referenced by projects.manager_id (removed), addresses.created_by/updated_by, profile_teams.profile_id, activity.author_id.",
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
    "Work email. Also the join key if people are ever imported from a spreadsheet.",
    "text", "Unique. Not null.", "—", "created"),
  e("profiles.permission", "Permission level",
    "How far someone reaches: viewer reads, user works their own jobs, manager reads across teams, admin edits definitions, superadmin manages teams and can delete. Intended to sync with Microsoft Teams permission levels.",
    "enum", "permission_level. Not null, default 'viewer' (least privilege).",
    "Compared by ordinal in RLS policies — permission >= 'manager'. Referenced by permission_grants.permission.",
    "created"),
  e("profiles.job_title", "Job title", "Free text, shown on the profile. Not a lookup and not tied to permission.",
    "text", "Nullable.", "—", "to_do"),
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
  e("profile_teams.team_id", "Team", "The other half of the pair.",
    "uuid", "Part of the composite primary key.", "FK → teams(id) ON DELETE CASCADE.", "created"),
  e("profile_teams.is_primary", "Primary team",
    "Which team answers the questions that need one answer: what the dashboard's \"Heading to your team\" panel watches, and what the board filters to by default.",
    "boolean", "Not null, default false. Partial unique index on (profile_id) WHERE is_primary — at most one per person, and none is legitimate for a new joiner.",
    "Read by the dashboard and the default board filter.", "created"),
  e("profile_teams.joined_at", "Joined on", "When the person was added to this team.", "timestamptz", "Not null, default now().", "—", "created"),

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
  e("addresses.council_id", "Council region", "The local government area the address sits in.",
    "uuid", "Nullable. Indexed.", "FK → council_regions(id). Exposed by project_display.council_id.", "created"),
  e("addresses.consolidated_address", "Full address",
    "The whole address as one string, assembled in the database so every card, export and search reads exactly the same text.",
    "generated text",
    "GENERATED ALWAYS AS (…) STORED. Built with || and coalesce rather than concat_ws — concat_ws is only STABLE and a generated column requires IMMUTABLE.",
    "Derived from street_2, street_number, street_1, suburb, state, country. Read by project_display.current_address / original_address.",
    "created"),
  e("addresses.created_at", "Created on", "When the address was first recorded.", "timestamptz", "Not null, default now().", "—", "created"),
  e("addresses.created_by", "Created by", "Who recorded it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),
  e("addresses.updated_at", "Updated on", "When the address was last corrected.", "timestamptz", "Not null, default now().", "—", "created"),
  e("addresses.updated_by", "Updated by", "Who last corrected it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),

  // ----------------------------------------------------------- council_regions
  e("council_regions.id", "Council ID", "A local government area.", "uuid", "Primary key.", "Referenced by addresses.council_id.", "created"),
  e("council_regions.name", "Council name", "The council's name as published by the LGA.", "text", "Not null. Unique with state.", "—", "created"),
  e("council_regions.state", "State", "Which state the council is in, so the picker can filter to the state already chosen on the address.",
    "enum", "au_state. Not null. Indexed.", "—", "created"),
  e("council_regions.active", "Active", "Councils amalgamate and split. Retiring one keeps the addresses that reference it intact.",
    "boolean", "Not null, default true.", "—", "created"),

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
  e("projects.status", "Project status",
    "Where the project stands: on track, at risk, behind schedule, on hold, completed, cancelled or archived.",
    "enum",
    "project_status. Not null, default 'on_track'. Labels are snake_case because they are codes, not copy — the app maps them for display, so a rename is not a data migration.",
    "OPEN QUESTION: on_track / at_risk / behind_schedule are derivable from the jobs underneath, while on_hold / completed / cancelled / archived are lifecycle states only a person sets. Stored as one column a project can read \"On track\" while three of its jobs are stalled.",
    "updates_required"),
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

  // ---------------------------------------------------------------------- jobs
  e("jobs.id", "Job ID", "The job's machine key.", "uuid", "Primary key.", "Referenced by job_stages.job_id, job_tags, job_dependencies, activity.", "created"),
  e("jobs.project_id", "Parent project", "The project this job belongs to. One project, many jobs.",
    "uuid", "Not null. Indexed.", "FK → projects(id) ON DELETE CASCADE.", "created"),
  e("jobs.project_no", "Project number (denormalised)",
    "A copy of the parent's number, held here only so the combined job number can be a generated column — a generated column cannot reach another table. Never written by the app.",
    "integer", "Not null.", "Maintained by the jobs_sync_project_number and projects_cascade_renumber triggers.", "created"),
  e("jobs.job_number", "Job number", "The sequence within the project — '01', '02'.", "text", "Not null. Unique with project_id.", "Feeds combined_job_number.", "created"),
  e("jobs.combined_job_number", "Job number (full)",
    "What people actually quote — '1000-01'. The parent reads straight off the child.",
    "generated text", "GENERATED ALWAYS AS (project_no::text || '-' || job_number) STORED. Unique.",
    "Derived from jobs.project_no + jobs.job_number.", "created"),
  e("jobs.original_address_id", "Original address", "The job's address as first recorded.", "uuid", "Nullable.", "FK → addresses(id).", "created"),
  e("jobs.current_address_id", "Current address", "What the board shows and what people search on.", "uuid", "Not null. Falls back to the original in a trigger. Indexed.", "FK → addresses(id).", "created"),
  e("jobs.stage_id", "Stage", "Which of the eight pipeline phases the job is in now.", "integer", "Not null.", "FK → stages(id). Duplicated by job_stages.is_current — see the open question there.", "to_do", PROPOSED),
  e("jobs.owning_team_id", "Owning team", "The one team holding the job right now. \"One job, one team at a time\" is the whole model.", "uuid", "Not null.", "FK → teams(id).", "to_do", PROPOSED),
  e("jobs.assignee_id", "Assigned to", "The person responsible inside the owning team.", "uuid", "Nullable.", "FK → profiles(id).", "to_do", PROPOSED),
  e("jobs.status", "Health status", "On track, at risk or stalled. Distinct from projects.status, which has a wider set.", "text", "Not null, default 'on-track'.", "FK → health_statuses(id).", "to_do", PROPOSED),
  e("jobs.source_system", "Source system", "Where the record originated — HubSpot, SharePoint, SiteBook, Trello.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.contract_status", "Contract status", "Where the contract is up to. Free text today; a lookup once the states settle.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.deposit_status", "Deposit status", "Whether the deposit has been received.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.drawings_status", "Drawings status", "Where the working drawings are up to.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.requested_note", "Waiting on", "What the job is blocked on. Non-null is what makes a card show the amber waiting flag.", "text", "Nullable.", "Drives the card's warning state.", "to_do", PROPOSED),
  e("jobs.notes", "Notes", "Free text on the job.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("jobs.stage_entered_at", "Entered stage on", "When the job arrived in its current stage. \"Days in stage\" is computed from this, never stored.", "timestamptz", "Not null, default now().", "Superseded by job_stages.entered_at if the composite table becomes authoritative.", "to_do", PROPOSED),

  // ---------------------------------------------------------------- job_stages
  e("job_stages.id", "Job stage ID", "One row per job per stage. This is what makes stage history possible — a single stage_id on the job says where something is now, not when it got there or how long it sat.",
    "uuid", "Primary key.", "—", "created"),
  e("job_stages.project_id", "Project", "Carried alongside job_id so project rollups do not need the extra join.", "uuid", "Not null.", "Composite FK with job_id, so it cannot disagree with the job's own project.", "created"),
  e("job_stages.job_id", "Job", "The job this stage row belongs to.", "uuid", "Not null.", "FK → jobs(id) ON DELETE CASCADE.", "created"),
  e("job_stages.stage_id", "Stage", "Which phase.", "integer", "Not null.", "FK → stages(id).", "created"),
  e("job_stages.entered_at", "Entered on", "When the job reached this stage. Null until it does.", "timestamptz", "Nullable.", "—", "created"),
  e("job_stages.exited_at", "Exited on", "When it left. Null while it is still here.", "timestamptz", "Nullable.", "—", "created"),
  e("job_stages.is_current", "Is current", "Marks the one live stage row.", "boolean", "Not null, default false. Partial unique index — one current stage per job.", "OPEN QUESTION: duplicates jobs.stage_id. One of the two should be authoritative and the other derived.", "updates_required"),

  // -------------------------------------------------- property_defs and values
  e("property_defs.id", "Property definition ID",
    "A field, defined once. Properties are rows rather than columns, which is what lets a team add what it captures without a schema migration — and why nothing in the app has a fixed number of field slots.",
    "uuid", "Primary key.", "Referenced by property_values.property_def_id.", "to_do", PROPOSED),
  e("property_defs.key", "Key", "Stable machine name, referenced by automations. Renaming the label never breaks them.", "text", "Unique. Not null.", "—", "to_do", PROPOSED),
  e("property_defs.label", "Field name", "What people see. Renameable at any time.", "text", "Not null.", "—", "to_do", PROPOSED),
  e("property_defs.scope", "Level", "Whether the field hangs off a project or a job. Two levels only — stage is context, not a level.", "text", "Not null. CHECK (scope in ('project','job')).", "—", "to_do", PROPOSED),
  e("property_defs.stage_id", "Captured at", "Which stage of the pipeline this field gets filled in.", "integer", "Not null.", "FK → stages(id). Groups the field slots on the job drawer and project detail.", "to_do", PROPOSED),
  e("property_defs.owning_team_id", "Captured by", "Which team fills it in. Constrained to teams that own the stage.", "uuid", "Not null.", "FK → teams(id).", "to_do", PROPOSED),
  e("property_defs.format", "Format", "The shape of the value — text, number, currency, date, checkbox, file, single/multi select, person, link.", "text", "Not null, CHECK against the format list.", "Determines how property_values.value is validated and rendered.", "to_do", PROPOSED),
  e("property_defs.required", "Required to exit stage", "Whether the job can leave stage_id without this filled in. Not the same as required to create the record.", "boolean", "Not null, default false.", "OPEN QUESTION: some fields will mean 'required to create'. Those are different columns.", "to_do", PROPOSED),
  e("property_defs.automation", "Automation", "What setting this field triggers — notify, block stage exit, start an SLA clock, recalculate dates.", "text", "Nullable.", "—", "to_do", PROPOSED),
  e("property_defs.archived_at", "Archived on", "Retires a field without losing the history of what was captured in it.", "timestamptz", "Nullable.", "—", "to_do", PROPOSED),
  e("property_values.value", "Field value",
    "One row per (property, record). Sparse by design — an unset field has no row at all.",
    "jsonb", "Shape enforced against property_defs.format.",
    "Composite primary key (property_def_id, subject_type, subject_id). subject_type CHECK in ('project','job'); the scope check on property_defs is what stops a project field being set on a job.",
    "to_do", PROPOSED),

  // ------------------------------------------------------------------- lookups
  e("teams.id", "Team ID", "A team. Each owns one or more pipeline phases, which drives the handover between them.", "uuid", "Primary key.", "Referenced by profile_teams.team_id, jobs.owning_team_id, property_defs.owning_team_id, template_phases.owning_team_id.", "to_do", PROPOSED),
  e("teams.name", "Team name", "What the team is called.", "text", "Unique. Not null.", "—", "to_do", PROPOSED),
  e("teams.parent_team_id", "Parent team", "The hierarchy the team_hierarchy permission scope walks.", "uuid", "Nullable.", "Self-FK → teams(id). Walked recursively by visible_team_ids().", "to_do", PROPOSED),
  e("stages.id", "Stage ID", "One of the eight pipeline phases. Seeded, not user-created — this is the business process.", "integer", "Primary key.", "Referenced by jobs.stage_id, job_stages.stage_id, property_defs.stage_id, template_phases.stage_id.", "created"),
  e("stages.name", "Stage name", "The phase name, as it appears as a board column heading.", "text", "Unique. Not null.", "—", "created"),
  e("stages.position", "Order", "Board column order. The whole reason stages are ordered rather than a set.", "integer", "Unique. Not null.", "—", "created"),
  e("health_statuses.id", "Health status", "on-track, at-risk or stale. Job-level health, distinct from projects.status.", "text", "Primary key.", "Referenced by jobs.status.", "to_do", PROPOSED),
  e("job_types.id", "Job type", "Residential, Commercial or Development at job level.", "integer", "Primary key.", "Referenced by jobs.type_id. OPEN QUESTION: projects use the project_type enum instead — these two should probably be the same thing.", "updates_required", PROPOSED),
  e("build_stages.id", "Build stage", "The construction sub-stage inside Construction & execution — slab, frame, lock-up and so on.", "integer", "Primary key.", "Referenced by jobs.build_stage_id.", "to_do", PROPOSED),
  e("tags.id", "Tag", "A free label on a job — IF, Council hold, Design variation.", "uuid", "Primary key.", "Many-to-many with jobs via job_tags.", "to_do", PROPOSED),
  e("divisions.id", "Division", "Residential, Commercial or Land, above the team.", "uuid", "Primary key.",
    "OPEN QUESTION: projects.division_id was removed when projects were simplified, and the 'division' permission scope hung off it. Either the scope goes or division moves to the address/council.",
    "updates_required", PROPOSED),

  // ------------------------------------------------------------------ activity
  e("activity.id", "Activity ID", "One feed for both events and comments — the UI interleaves them, so the schema should not keep them apart.", "uuid", "Primary key.", "—", "to_do", PROPOSED),
  e("activity.subject_type", "Subject type", "Whether the entry is against a job or a project.", "text", "Not null. CHECK in ('job','project').", "Paired with subject_id. Indexed with it.", "to_do", PROPOSED),
  e("activity.subject_id", "Subject", "Which job or project.", "uuid", "Not null.", "Polymorphic — no FK, enforced by the app.", "to_do", PROPOSED),
  e("activity.kind", "Kind", "An event the system recorded, or a comment a person wrote.", "text", "Not null. CHECK in ('event','comment').", "—", "to_do", PROPOSED),
  e("activity.description", "Description", "The text of the event or comment.", "text", "Not null.", "—", "to_do", PROPOSED),
  e("activity.author_id", "Author", "Who wrote it. Null for system events.", "uuid", "Nullable.", "FK → profiles(id).", "to_do", PROPOSED),
  e("activity.mentions", "Mentions", "Who was @mentioned, for the notification fan-out.", "jsonb", "uuid[], default '{}'.", "Each entry references profiles(id).", "to_do", PROPOSED),

  // ------------------------------------------------------- templates and perms
  e("template_phases.expected_days", "Expected days", "How long a phase should take. What the Gantt measures actual time in stage against.", "integer", "Nullable.", "FK context: template_phases → templates, stages, teams.", "to_do", PROPOSED),
  e("template_checkpoints.label", "Checkpoint", "One thing a phase expects done before handover. Instantiated per job as job_checkpoints.", "text", "Not null.", "Copied to job_checkpoints.label when a job is created from a template.", "to_do", PROPOSED),
  e("permission_grants.permission", "Permission", "Which rung of the ladder this grant applies to.", "enum", "permission_level. Part of the composite primary key.", "Keyed off the permission_level enum rather than a roles table.", "to_do", PROPOSED),
  e("permission_grants.scope", "Scope", "How wide the grant reaches — none, own, team, team_hierarchy, division, all.", "text", "Not null, CHECK against the scope list.", "Each value maps to an RLS predicate. 'team' and 'team_hierarchy' both read profile_teams now that membership is many-to-many.", "to_do", PROPOSED)
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
