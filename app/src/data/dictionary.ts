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
  | "bigint"
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
  e("profiles.profile_id", "Profile ID",
    "The person's identity in the app, minted when they are added to it. Since 0015 this is Lofty's own key and no longer the auth.users id — a staff record exists before anyone signs in, which is what makes a pre-created team list possible.",
    "uuid", "Primary key. Not null, default gen_random_uuid().",
    "Referenced by addresses.created_by/updated_by and activity.author_id. No longer FK to auth.users — see profiles.auth_user_id.",
    "created"),
  e("profiles.profile_auth_user_id", "Microsoft account",
    "The linked Entra login, filled by a trigger the first time the person signs in. Null means created but not yet arrived — a real and expected state. This, not profiles.id, is what every RLS policy compares against auth.uid().",
    "uuid", "Unique. Nullable.",
    "FK → auth.users(id) ON DELETE SET NULL — deleting the Microsoft account unlinks the staff record, it does not erase it. Read by is_active_user() and current_permission().",
    "created"),
  e("profiles.profile_first_name", "First name",
    "Given name. Separate from surname because people change names, and because greetings use the first name on its own — \"Hi, Amber\".",
    "text", "Not null.", "Feeds full_name (generated) and profile_display.greeting_name.", "created"),
  e("profiles.profile_last_name", "Last name",
    "Family name. Separate from first name so a name change is one field, not a string edit that has to be got exactly right.",
    "text", "Not null.", "Feeds full_name (generated).", "created"),
  e("profiles.profile_full_name", "Full name",
    "First and last joined, for cards, comment bylines and reports. Never written directly — change the two halves and this follows.",
    "generated text", "GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED. Read-only.",
    "Derived from profiles.first_name + profiles.last_name.", "created"),
  e("profiles.preferred_name", "Goes by (merged)",
    "Merged into first_name and dropped in 0021. It was the one genuinely personal field on a profile until 0019 made it admin-set like the rest, which left a nullable column that either repeated first_name or was null — and a greeting that had to COALESCE the two on every read to find out which. Lofty's answer is to use the first name, so the second place a person's name could live is gone.",
    "text", "Dropped in 0021.",
    "Was read by profile_display.greeting_name via COALESCE; that view now selects first_name directly.",
    "merged"),
  e("profiles.profile_email", "Email",
    "The address the person actually uses and the one the app shows. At Lofty this is @lofty.com.au, which is usually NOT what they sign in with — see login_email.",
    "text", "Unique. Not null.", "—", "created"),
  e("profiles.profile_login_email", "Microsoft sign-in address",
    "The address on the Microsoft account, when it differs from email — at Lofty typically @loftybg.onmicrosoft.com. A matching key and nothing else: the link trigger looks a person up by this, and no screen displays it.",
    "text", "Unique on lower(login_email). Nullable.",
    "Matched against auth.users.email by the on_auth_user_created trigger.", "created"),
  e("profiles.profile_permission", "Permission level",
    "How far someone reaches: viewer reads, user works their own jobs, manager reads across teams, admin edits definitions, superadmin manages teams and can delete. Intended to sync with Microsoft Teams permission levels.",
    "enum", "permission_level. Not null, default 'viewer' (least privilege).",
    "Compared by ordinal in RLS policies — permission >= 'manager'. Referenced by permission_grants.permission.",
    "created"),
  e("profiles.profile_job_title", "Job title", "Free text, shown on the profile. Not a lookup and not tied to permission — a Manager by title may be a user by permission.",
    "text", "Nullable.", "—", "created"),
  e("profiles.phone", "Phone", "Contact number, editable by the person themselves.", "text", "Nullable.", "—", "to_do"),
  e("profiles.profile_is_active", "Active",
    "Soft delete. A person is never hard-deleted — their name is on years of activity and comments.",
    "boolean", "Not null, default true.", "Filters every user picker.", "created"),
  e("profiles.source", "Source",
    "Where the account came from — 'Entra ID' once SCIM is live, otherwise a manually created account.",
    "text", "Nullable.", "—", "to_do"),
  e("profiles.profile_created_at", "Created on", "When the profile row was created.", "timestamptz", "Not null, default now().", "—", "created"),
  e("profiles.profile_updated_at", "Updated on", "When the profile row last changed. Worth having when a permission or team change is disputed.", "timestamptz", "Not null, default now().", "—", "created"),

  e("profiles.teams", "Teams (merged)",
    "Merged back into profile_teams rows, reversing 0022. The test 0022 applied was \"does the membership carry attributes of its own?\" — is_primary was constant, so the array won. The same test now gives the opposite answer, because whether somebody MANAGES a team is an attribute of the membership, and a person can be a member of four teams while managing three. Two parallel arrays could disagree — someone managing a team they are not in — and a table cannot express that.",
    "enum", "Dropped. Was: team[], not null, GIN indexed, normalised by trigger.",
    "Superseded by profile_teams. The 45 memberships were carried across row for row and checked before and after.",
    "merged"),

  // ------------------------------------------------------------- profile_teams
  e("profile_teams.profile_id", "Person (merged)",
    "Merged into profiles.teams. The table modelled a many-to-many that never had a many — forty-five people, forty-five rows, nobody in two teams — while the app treated membership as a list all along and kept a replaceTeams() helper purely to explode the array into rows and read it back.",
    "uuid", "Dropped with the table in 0022.",
    "Superseded by profiles.teams. The membership history the table accumulated is still in activity_audit, which captured whole rows.",
    "merged"),
  e("profile_teams.team_id", "Team",
    "Which team the membership is in. A real foreign key again, pointing at a table that now exists — it was a uuid pointing at nothing in 0001, then an enum value in 0004, then an array element in 0022.",
    "text", "Not null. Part of the primary key with profile_id. Indexed on its own for \"everyone in Design\".",
    "FK → teams(team_id) ON UPDATE CASCADE.", "created"),
  e("profile_teams.profile_team_role", "Role in the team",
    "Whether this person is a member of the team or manages it. THIS is the column that justifies the table existing: 0022 folded membership into an array on the argument that it carried nothing of its own, and this is something of its own. A manager has full CRUD over the work of the teams they manage.",
    "text", "Not null, default 'member'. CHECK (in 'member','manager'). Partially indexed where role = 'manager'.",
    "Nobody is seeded as a manager: who manages what is recorded nowhere today, so inventing it would be worse than leaving it for a person to set. Read by private.my_managed_teams() when the permission model lands.",
    "created"),
  e("profile_teams.profile_team_is_primary", "Primary team",
    "Which team the person is \"in\" when only one can be shown — a card byline, the default board filter. At most one per person, enforced by a partial unique index, and a new joiner legitimately has none.",
    "boolean", "Not null, default false. UNIQUE(profile_id) WHERE profile_team_is_primary — partial, so the many false rows cost nothing.",
    "Restored with the table. See the merged note below for why it was dropped, and why that reasoning no longer holds.",
    "created"),
  e("profile_teams.is_primary", "Primary team, first attempt (merged)",
    "Merged, and carrying no information when it went: true on all forty-five rows. It was meant to answer the questions needing one team — the dashboard panel, the default board filter — but a column with one value cannot answer anything. If a primary team is genuinely wanted, it needs to be a column somebody sets, not a flag derived from array position.",
    "boolean", "Dropped with the table in 0022.",
    "No replacement. profiles.teams is an unordered set.",
    "merged"),
  e("profile_teams.joined_at", "Joined on (merged)",
    "Merged into created_at. This was recorded as built and never was — 0001 gave profile_teams the standard audit quartet and no joined_at, and a membership row is created when the person joins, so created_at already answers it. Caught by cross-checking the dictionary against information_schema.",
    "timestamptz", "Never created; the table itself was dropped in 0022.",
    "Superseded by profile_teams.created_at, and then by profiles.teams.",
    "merged"),

  // ----------------------------------------------------------------- addresses
  e("addresses.address_id", "Address ID",
    "The address as a record. Addresses get corrected and changed — a lot renumbered by council, a street renamed, a typo found at handover — so everything points at this id rather than carrying a copy of the text.",
    "uuid", "Primary key, default gen_random_uuid().",
    "Referenced by projects.original_address_id / current_address_id and jobs.original_address_id / current_address_id.",
    "created"),
  e("addresses.address_lot_number", "Lot number",
    "The lot as it appears on the plan of division.",
    "text",
    "Nullable, but not freely: CHECK addresses_has_a_number requires at least one of lot number or street number. Before titles are issued a subdivided site has only \"Lot 3\"; afterwards it has \"28\". Text, not a number — \"12A\", \"5-7\" and \"Lot 3\" are as common as 12, and an integer column has to be migrated the first time one arrives.",
    "Feeds consolidated_address since 0025 — \"Lot 3 Corner Street\" is what the job is called for months, and what people keep typing into search long after.",
    "created"),
  e("addresses.address_street_number", "Street number", "The number on the street. Text for the same reason as the lot number.",
    "text", "Nullable — see addresses.lot_number for the CHECK that requires one of the two.",
    "Feeds consolidated_address.", "created"),
  e("addresses.address_street_1", "Street", "Street name and type — \"Ironbark Road\".", "text", "Not null.", "Feeds consolidated_address.", "created"),
  e("addresses.address_street_2", "Unit / level", "Anything above the street line — unit, level, building name.", "text", "Nullable.", "Feeds consolidated_address.", "created"),
  e("addresses.address_suburb", "Suburb", "Suburb or locality.", "text", "Not null. Indexed.", "Feeds consolidated_address; exposed by project_display.suburb.", "created"),
  e("addresses.address_state", "State", "Australian state or territory.",
    "enum", "au_state. Not null, default 'SA'. Values: SA NSW VIC QLD WA NT TAS ACT.",
    "Feeds consolidated_address. Filters the council picker.", "created"),
  e("addresses.address_postcode", "Postcode",
    "The four-digit postcode. Part of what makes an address findable — people search \"5000\" as readily as they search a street name.",
    "text",
    "Not null. Text, not an integer: Australian postcodes are not numbers and 0800 is Darwin, which an integer would silently make 800. CHECK addresses_postcode_shape: exactly four digits.",
    "Feeds consolidated_address. Added in 0025.", "created"),
  e("addresses.address_country", "Country", "Country. One value today; an enum so a second is ALTER TYPE, not a data-cleaning exercise.",
    "enum", "country_code. Not null, default 'AU'.", "Feeds consolidated_address.", "created"),
  e("addresses.address_council", "Council region",
    "The local government area the address sits in. The council's name is the value itself — 'City of Burnside', not an id pointing at it — so reading it needs no join.",
    "enum",
    "sa_council. Nullable. Indexed. 68 values from the LGA listing, declared in that listing's order, so `order by council` is picker order. Two checks, from either side: addresses_council_is_sa says only an SA address may carry one, because the enum is SA-only; addresses_council_required_in_sa (0025) says an SA address must. Together those make council required in practice — every address is South Australian today — without a flat NOT NULL, which would leave an interstate address no valid value to give.",
    "Exposed by project_display.council, project_address_search.council and job_address_search.council. Replaced addresses.council_id in 0003.",
    "created"),
  e("addresses.address_consolidated", "Full address",
    "The whole address as one string, assembled in the database so every card, export and search reads exactly the same text.",
    "text",
    "Not null. Maintained by the addresses_build_consolidated trigger, never written by the app — not a generated column, because a generation expression must be IMMUTABLE and the enum-to-text casts are not (enum_out is STABLE). Built with || and coalesce rather than concat_ws, so a null part drops its separator.",
    "Derived from street_2, lot_number, street_number, street_1, suburb, state, postcode, country — the lot number and postcode joined in 0025. Covered by a GIN trigram index, so search is fuzzy across the whole string. Read by project_display.current_address / original_address.",
    "created"),
  e("addresses.address_created_at", "Created on", "When the address was first recorded.", "timestamptz", "Not null, default now().", "—", "created"),
  e("addresses.address_created_by", "Created by", "Who recorded it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),
  e("addresses.address_updated_at", "Updated on", "When the address was last corrected.", "timestamptz", "Not null, default now().", "—", "created"),
  e("addresses.address_updated_by", "Updated by", "Who last corrected it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),

  // ------------------------------------------------------------ address_history
  // Superseded assignments only. The current and original addresses are columns on the
  // record itself; this is the middle of the timeline, which those columns lose.
  e("address_history.address_history_id", "History entry ID",
    "One superseded address assignment — which record was at which address, and for how long. This is what makes \"12 Test Street\" still find project 1042 years after it became \"20 Corner Street\".",
    "bigint",
    "Primary key, GENERATED ALWAYS AS IDENTITY. A sequential key rather than a uuid: the table only grows, nothing references it, and sequential values keep the index dense.",
    "Nothing references this table.", "created"),
  e("address_history.address_history_project_id", "Project",
    "The project this address used to belong to, when the parent is a project.",
    "uuid",
    "Nullable. CHECK address_history_one_parent: exactly one of project_id / job_id is set. Two real foreign keys rather than a subject_type discriminator, so the reference is enforced and the delete cascades.",
    "FK → projects(id) ON DELETE CASCADE. Indexed with valid_to desc, partial on not null.",
    "created"),
  e("address_history.address_history_job_id", "Job",
    "The job this address used to belong to, when the parent is a job.",
    "uuid",
    "Nullable. The other arm of address_history_one_parent.",
    "FK → jobs(id) ON DELETE CASCADE. Indexed with valid_to desc, partial on not null.",
    "created"),
  e("address_history.address_history_address_id", "Address",
    "The address itself. A link, never a copy — the text lives once, in addresses, so a site renamed twice has one addresses row per name and no fact stored twice.",
    "uuid", "Not null. No cascade: an address referenced by history cannot be deleted out from under it.",
    "FK → addresses(id). Indexed on its own, for the other direction — \"which record was ever at this address\", which is what search reads.",
    "created"),
  e("address_history.address_history_role", "Which address it was",
    "Whether this was the record's original address or its current one at the time. Original changes almost never — only an admin may correct it — so nearly every row here is a superseded current.",
    "text", "Not null. CHECK role in ('original','current'). Text with a check rather than an enum, so a third role is an UPDATE and not a type migration.",
    "—", "created"),
  e("address_history.address_history_valid_from", "Applied from", "When this address started applying to the record.",
    "timestamptz", "Not null. CHECK address_history_period: valid_to >= valid_from.", "—", "created"),
  e("address_history.address_history_valid_to", "Applied until",
    "When it stopped applying. Never null: a row is written only once the assignment has been superseded, so the open-ended period is the one on the record itself, not in here.",
    "timestamptz", "Not null.", "Leading column of both parent indexes, descending — most recent first.", "created"),
  e("address_history.address_history_changed_by", "Changed by", "Who repointed the record to a different address.",
    "uuid", "Nullable — a change made by an import or a migration has no person behind it.",
    "FK → profiles(id).", "created"),
  e("address_history.address_history_created_at", "Recorded on", "When the history row was written.",
    "timestamptz", "Not null, default now().", "—", "created"),

  // ---------------------------------------------------------------------- tasks
  e("tasks.task_id", "Task",
    "One thing to be done. The same table holds a checklist item instantiated from a process template and a task somebody typed in — they differ only by where they came from, and two tables would make every \"what am I working on\" query a union forever.",
    "uuid", "Primary key.", "Referenced by task_dependencies from both sides, and by tasks.parent_task_id.", "created"),
  e("tasks.job_id", "Job", "The job this task belongs to, when the parent is a job.",
    "text", "Nullable. CHECK tasks_one_parent: exactly one of job_id / project_id.",
    "FK → jobs(job_id) ON UPDATE CASCADE ON DELETE CASCADE. Indexed with task_position.", "created"),
  e("tasks.project_id", "Project",
    "The project this task belongs to. Some work genuinely belongs to the site rather than to one dwelling — a land division, a shared driveway — and would otherwise be filed under an arbitrary one of its jobs.",
    "integer", "Nullable. The other arm of tasks_one_parent.",
    "FK → projects(project_id) ON UPDATE CASCADE ON DELETE CASCADE.", "created"),
  e("tasks.task_name", "Task", "What the task is.", "text", "Not null, and not blank.", "—", "created"),
  e("tasks.task_description", "Details", "Anything the person doing it needs to know. The process map carries 142 steps with notes; this is where they land, so the context reaches the person doing the step rather than dying in a canvas file.",
    "text", "Nullable.", "—", "created"),
  e("tasks.parent_task_id", "Parent task",
    "Sub-tasks. The process map has 57 steps and the checklists group them into about 40; rather than resolving that mismatch by hand, a step that is really several becomes a parent with children.",
    "uuid", "Nullable. CHECK tasks_not_its_own_parent.", "FK → tasks(task_id) ON DELETE CASCADE.", "created"),
  e("tasks.task_owning_team", "Owning team", "The team responsible. Nullable: an unassigned task in a team's queue is a real state.",
    "text", "Nullable.", "FK → teams(team_id) ON UPDATE CASCADE. Partially indexed on the open statuses.", "created"),
  e("tasks.task_assignee_id", "Assignee", "The person doing it. Nullable for the same reason as the team.",
    "uuid", "Nullable.", "FK → profiles(profile_id). Partially indexed with the due date — this is the \"my work\" query.", "created"),
  e("tasks.task_status", "Status", "open · in_progress · blocked · done · cancelled.",
    "text", "Not null, default 'open'. CHECK on the five values, and CHECK tasks_done_has_a_time ties it to the completion time in both directions.",
    "The open three drive every partial index on this table, because a done task is in nobody's queue and those rows will outnumber the open ones many times over.", "created"),
  e("tasks.task_due_date", "Due", "When it should be finished.", "date", "Nullable.", "Indexed with the open statuses, for the overdue report.", "created"),
  e("tasks.task_completed_at", "Completed on",
    "When it was finished, and the single source of truth for whether it was. There is deliberately no boolean beside this: two columns for one fact can disagree, and then one of them is wrong without anything noticing.",
    "timestamptz",
    "Nullable. Stamped by the tasks_stamp_completion trigger when the status becomes done, and CLEARED when it stops being done — a completion time on a reopened task is a lie, and it is exactly the lie a variation produces.",
    "Paired with task_status by CHECK tasks_done_has_a_time.", "created"),
  e("tasks.task_completed_by", "Completed by", "Who finished it. Stamped by the database, never sent by the client — a client that can write this can write somebody else's name into it.",
    "uuid", "Nullable.", "FK → profiles(profile_id).", "created"),
  e("tasks.task_is_external", "Waiting on someone outside Lofty",
    "Council, the EER consultant, SA Water. The process map marks these in orange: nothing downstream moves until they are done, and they are not the owning team's fault when they run late. Without the flag, Design looks permanently overdue for council's statutory 28 days.",
    "boolean", "Not null, default false.", "Excluded from team SLA reporting.", "created"),
  e("tasks.task_position", "Order", "Display order within the record.", "integer", "smallint. Not null, default 0.", "—", "created"),

  // ------------------------------------------------------------ task_dependencies
  e("task_dependencies.task_id", "Task", "The task that waits.",
    "uuid", "Part of the primary key. CHECK task_dependencies_not_self.",
    "FK → tasks(task_id) ON DELETE CASCADE. A trigger refuses any edge that would close a cycle, and another refuses an edge between tasks on different records.", "created"),
  e("task_dependencies.depends_on_task_id", "Waits for", "The task that has to finish first.",
    "uuid", "Part of the primary key. Indexed on its own for the reverse direction.",
    "FK → tasks(task_id) ON DELETE CASCADE.", "created"),
  e("task_dependencies.task_dependency_lag_days", "Lag",
    "How many days after the predecessor finishes this one is due. On the edge rather than on the task because Lofty's process map puts its SLAs on the ARROWS — \"Within 14 Days\" labels a transition between two steps, not either step itself.",
    "integer", "smallint. Not null, default 0.", "—", "created"),

  // ----------------------------------------------------------- council_regions
  e("council_regions.id", "Council (merged)",
    "Merged into the sa_council enum on addresses. The table held 68 rows nobody maintained, plus the audit quartet and a touch trigger to look after them. A council is now a value on the address, not a row it points at.",
    "uuid", "Table dropped in 0003.",
    "Superseded by addresses.council. The state filter it used to provide is the addresses_council_is_sa CHECK; the active flag has no equivalent, because Postgres cannot drop an enum value.",
    "merged"),

  // ------------------------------------------------------------------ projects
  e("projects.id", "Project machine key (merged)",
    "Merged into projects.project_id. A uuid primary key sitting beside a unique 4-digit number meant every project had two identities and every child row had to carry both — jobs held project_id AND project_no, kept in step by a trigger. The number is stable (corrected only during the import) so it is a sound natural key, and using it deletes the copy, the trigger and the renumber cascade together.",
    "uuid", "Dropped. Was: primary key, default gen_random_uuid().",
    "Superseded by projects.project_id. The cost accepted is that every FK to projects now needs ON UPDATE CASCADE, and that a renumber after go-live is expensive — which is why the import happens first.",
    "merged"),
  e("projects.project_id", "Project number",
    "The number people quote — 1042 — and the primary key. One identity, not two: what Lofty says out loud is what the database joins on.",
    "integer",
    "Primary key, GENERATED BY DEFAULT AS IDENTITY starting at 1000. `by default` rather than `always` on purpose — the import assigns numbers explicitly, and a number can be corrected by hand. CHECK projects_number_floor (project_id >= 1000).",
    "Referenced by jobs.project_id and address_history.address_history_project_id, both ON UPDATE CASCADE ON DELETE CASCADE. A hand-set number pushes the identity sequence forward via projects_bump_no_seq, so the same number is never handed out twice.",
    "created"),
  e("projects.project_name", "Project name",
    "An optional name. Most projects are known by their address, not by a name, so this is nullable and usually empty — it exists for the sites that do get called something.",
    "text", "Nullable.", "—", "created"),
  e("projects.project_proposed_dwellings", "Proposed dwellings",
    "How many dwellings were intended when the project was created. A different fact from how many jobs exist, which is why it is stored while the count is not: \"we planned four lots and got three\" needs both numbers, and a derived count can only ever tell you the second.",
    "integer", "smallint. Nullable. CHECK (> 0).",
    "The actual count is count(*) over jobs.project_id — derived, never stored, so it cannot drift. The CONFIRMED count is that same count excluding cancelled jobs.",
    "created"),
  e("projects.project_job_seq_high_water", "Highest job number issued",
    "The highest job sequence ever handed out on this project — not the highest currently in use. Only ever goes up, so a deleted job's number is never issued a second time.",
    "integer", "smallint. Not null, default 0. Incremented under a row lock by jobs_assign_sequence.",
    "Read and written only by the trigger. The gap it leaves behind is deliberate: gaps are permanent, because a job number appears on contracts and folders.",
    "created"),
  e("projects.project_owning_team", "Owning team",
    "The team primarily accountable for the project. Nullable, because not every project has one and inventing an owner is worse than leaving it unset.",
    "text", "Nullable.", "FK → teams(team_id) ON UPDATE CASCADE. Indexed.", "created"),
  e("projects.project_assignee_id", "Assignee",
    "The person accountable for the project, as opposed to the team.",
    "uuid", "Nullable.", "FK → profiles(profile_id). Indexed.", "created"),
  e("projects.project_original_address_id", "Original address",
    "Where the project started. Never moves — it is what contracts and old paperwork refer to.",
    "uuid", "Nullable. Falls back from current_address_id via the projects_default_current_address trigger.",
    "FK → addresses(id). Exposed by project_display.original_address.", "created"),
  e("projects.project_current_address_id", "Current address",
    "What every card, board and search shows. Identical to the original until something changes.",
    "uuid", "Not null. A blank value falls back to original_address_id in a trigger, so a caller only has to supply one. Indexed.",
    "FK → addresses(id). Exposed by project_display.current_address.", "created"),
  e("projects.project_type", "Project type", "Residential, commercial or development.",
    "enum", "project_type. Nullable. Values: residential, commercial, development.", "—", "created"),
  e("projects.project_status", "Status",
    "Where the project stands. A record is in exactly one of these at a time: on track, at risk, behind schedule, on hold, completed, cancelled or archived. This is what someone sets — it is not health.",
    "enum",
    "record_status. Not null, default 'on_track'. The same enum as jobs.status. Labels are snake_case because they are codes, not copy — the app maps them for display, so a rename is not a data migration.",
    "Feeds is_current(status) — anything not completed, cancelled or archived is current. Exposed by project_display.status.",
    "created"),
  e("projects.project_start_date", "Start date", "When work began.", "date", "Nullable.", "—", "created"),
  e("projects.project_target_completion", "Target completion", "The date being worked towards.", "date", "Nullable.", "Drives the Gantt and the overdue calculation.", "created"),
  e("projects.project_end_date", "End date", "When the project actually finished, as opposed to the target.", "date", "Nullable.", "—", "created"),
  e("projects.project_created_at", "Created on", "When the project record was created.", "timestamptz", "Not null, default now().", "—", "created"),
  e("projects.project_created_by", "Created by", "Who created it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),
  e("projects.project_updated_at", "Updated on", "When it last changed.", "timestamptz", "Not null, default now().", "—", "created"),
  e("projects.project_updated_by", "Updated by", "Who last changed it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),

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
  e("jobs.id", "Job machine key (merged)",
    "Merged into jobs.job_id, for the same reason projects.id was: '1042-01' is already unique and already what everybody calls the job, so a uuid beside it was a second identity that bought nothing.",
    "uuid", "Dropped. Was: primary key.",
    "Superseded by jobs.job_id.", "merged"),
  e("jobs.project_id", "Parent project",
    "The project this job belongs to — one project, many jobs — and the project number, because they are the same value now. Reads as `using (project_id)` in a join, with no aliasing.",
    "integer", "Not null. Indexed.",
    "FK → projects(project_id) ON UPDATE CASCADE ON DELETE CASCADE. The update cascade is what makes a natural key safe: a renumber moves the children rather than orphaning them. It is exercised during the import and effectively dormant afterwards.",
    "created"),
  e("jobs.project_no", "Project number on the job (merged)",
    "Merged into jobs.project_id. It was a copy of the parent's number, kept in step by the jobs_sync_project_number trigger, and it existed for one reason: job_number was a generated column and a generated column cannot reach another table. Once project_id IS the project number, the foreign key already carries it — so the column, its trigger and the renumber cascade all went together.",
    "integer", "Dropped. Was: not null, maintained by trigger.",
    "Superseded by jobs.project_id, which is now the number itself.", "merged"),
  e("jobs.job_sequence", "Job sequence",
    "The counter within the project — 01, 02, 03. Allocated automatically: insert a job without one and a trigger assigns the next. NOT what Lofty calls the job number — that is jobs.job_id, the combined value.",
    "text", "Not null. Unique with project_id. Zero-padded to two digits, and wider than two past 99 rather than truncating. CHECK (>= 1) — there is no zeroth job, and the check is on the column rather than only in the trigger because a hand-written insert can supply its own sequence.",
    "Assigned by the jobs_assign_sequence trigger from projects.project_job_seq_high_water, under a row lock on the parent. A high-water mark rather than max(job_sequence) over the live jobs: max()+1 reissues the number of a deleted highest job, and two builds sharing 1042-03 across contracts and folders is worse than a gap. Feeds job_id.",
    "created"),
  e("jobs.job_id", "Job number",
    "The job number as Lofty uses the phrase — '1042-01' — and the primary key. What people type, quote and say out loud is what the database joins on.",
    "text",
    "Primary key. STAMPED by the jobs_assign_sequence trigger at insert, from project_id and job_sequence, and then left alone. Deliberately not a generated column, which is what it was: a generated column would silently rewrite a number already printed on a contract.",
    "Recomputed by jobs_resync_job_id only when the parent is renumbered — which, because numbers are corrected at import only, happens once. Referenced by address_history.address_history_job_id ON UPDATE CASCADE.",
    "created"),
  e("jobs.job_number_old", "Old job number",
    "The number the job had in the old system — '12345'. SiteBook and Trello use the same Lofty number, so one column covers all three. Searchable for the life of the system, because old paperwork, SharePoint folders, invoices and emails will carry it for years.",
    "text",
    "Nullable and UNIQUE, which compose correctly in Postgres: nulls do not collide, so jobs created in the app simply have none. Renamed from old_job_number, and the unique constraint replaced 0023's separate partial index — one index for the lookup, not two.",
    "Identifies an imported record without needing a flag: job_number_old IS NOT NULL is exactly \"came from the old system\".",
    "created"),
  e("jobs.job_engaged_teams", "Engaged teams",
    "Every team currently holding the job. \"One team at a time\" is an aspiration rather than a fact — a variation in construction can have Selections, Estimating and Scheduling all working the same job at once — so the row-level permission check has to ask \"any team engaged\", not \"the team that owns it\".",
    "text", "text[]. Not null, default '{}'. GIN indexed, because && is the operator every permission check will use.",
    "An array cannot carry a foreign key, so jobs_validate_engaged_teams checks every value against teams(team_id) on write. Same pattern the multi-select property options will need.",
    "created"),
  e("jobs.job_original_address_id", "Original address",
    "The job's address as first recorded — what the contract says and what an email from last year refers to. Never moves. Not displayed, but always searchable.",
    "uuid", "Nullable. Falls back from current in a trigger. Indexed, because half of address search hits this column.",
    "FK → addresses(id). Exposed by job_display.original_address and job_address_search.",
    "created"),
  e("jobs.job_current_address_id", "Current address",
    "What every card, board and search result shows. Identical to the original until something changes — a lot renumbered by council, a street renamed, a typo found at handover.",
    "uuid", "Not null. Falls back to the original in a trigger. Indexed.",
    "FK → addresses(id). Exposed by job_display.current_address and job_address_search.",
    "created"),
  e("jobs.job_stage", "Stage",
    "Which of the eight pipeline phases the job is in now, and the single answer to that question. The board filters on this column every load.",
    "enum", "stage. Not null, default 'Sales & acquisition'. Indexed.",
    "Replaced the proposed jobs.stage_id in 0004. Paired with stage_entered_at, which a trigger moves whenever this changes.",
    "created"),
  e("jobs.job_owning_team", "Owning team", "The one team holding the job right now. \"One job, one team at a time\" is the whole model.", "enum", "team. Not null.", "An enum value since 0004, not an FK — there is no teams table to point at.", "to_do", PROPOSED),
  e("jobs.job_assignee_id", "Assigned to", "The person responsible inside the owning team.", "uuid", "Nullable.", "FK → profiles(id).", "to_do", PROPOSED),
  e("jobs.job_status", "Status",
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
  e("jobs.job_stage_entered_at", "Entered stage on",
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
  e("jobs.job_created_at", "Created on", "When the job record was created.", "timestamptz", "Not null, default now().", "—", "created"),
  e("jobs.job_created_by", "Created by", "Who created it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),
  e("jobs.job_updated_at", "Updated on", "When it last changed. Maintained by the touch_updated_at trigger, not by the app.", "timestamptz", "Not null, default now().", "Set by the jobs_touch trigger on every update.", "created"),
  e("jobs.job_updated_by", "Updated by", "Who last changed it.", "uuid", "Nullable.", "FK → profiles(id).", "created"),

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
  e("teams.team_id", "Team",
    "A team, as a row. The slug is the key — 'design', 'sales_admin' — so a team reads out of a query result without a join, and renaming the label never rewrites anything pointing at it.",
    "text",
    "Primary key. CHECK (team_id ~ '^[a-z][a-z0-9_]*$'). Stable: this never changes, which is what lets it be a foreign key everywhere.",
    "Referenced by profile_teams.team_id, jobs.job_owning_team, projects.project_owning_team, and checked by trigger for every value in jobs.job_engaged_teams. Replaced the `team` Postgres enum, which was specified as a table in 0001, became an enum in 0004, and came back.",
    "created"),
  e("teams.team_name", "Team name",
    "What the team is called — \"Design\". A label, and renameable freely, which is the point of keying on the slug instead.",
    "text", "Not null. Unique.", "—", "created"),
  e("teams.team_position", "Display order",
    "Where the team sits in pickers and on boards. The three retired teams are numbered from 90 so they sort last if anything ever shows them.",
    "integer", "smallint. Not null.", "—", "created"),
  e("teams.team_is_active", "Active",
    "Whether the team is still one. Retiring Commercial is one flag: it leaves every picker while every row that ever referenced it still resolves. This is the whole reason the enum had to go — ALTER TYPE has no DROP VALUE, so an enum value added by mistake is permanent.",
    "boolean", "Not null, default true. Twelve teams seeded true; Commercial, Executive and Admin seeded false.",
    "Filtered out of the team pickers in the app. Never used to hide history.",
    "created"),
  e("teams.parent_team_id", "Parent team (merged)",
    "Never built, and not revived when teams became a real table. It existed for a team_hierarchy permission scope to walk, but every seeded team had a null parent, so the hierarchy was never real. The scopes settled as none / own / team / all, none of which walks a tree.",
    "uuid", "Never created.",
    "No replacement, deliberately. If a hierarchy is genuinely wanted later it is a second table of edges, not a column here — teams belong to more than one grouping in practice.",
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
    "One row per change to a tracked table. The trg_activity_audit_row trigger fires after every insert, update and delete on profiles, addresses, projects and jobs — profile_teams was the fifth until 0022 folded it into profiles.teams.",
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
    "Each value maps to an RLS predicate. 'team' and 'team_hierarchy' both read profiles.teams, which is an array — the predicate is an overlap test, not a join, since 0022.",
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
