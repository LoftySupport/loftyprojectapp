/**
 * The four starter tables.
 *
 * Deliberately minimal: keys and relationships only. Every table has a `// + fields`
 * marker where the rest of the columns go as they are decided — add them here, add
 * them to the migration, regenerate, done.
 *
 * Relational, so identity is a uuid primary key and everything joins on it. The Lofty
 * numbers are *business keys*: unique, human-quotable, and what people say out loud.
 * They are not the join key — renumbering a project should never orphan its jobs.
 */

export type Uuid = string;
export type IsoDate = string;      // 'YYYY-MM-DD'
export type IsoDateTime = string;  // timestamptz

/**
 * The audit quartet — on every table, no exceptions.
 *
 * The one table without it is the one someone asks about when a value turns out to be
 * wrong. `createdBy` and `updatedBy` are nullable because a row can legitimately have
 * no author: a seeded lookup, an import, the very first profile. Nullable and honest
 * beats not-null filled with a placeholder nobody can trace.
 *
 * `updatedAt` is maintained by a Postgres trigger, not by the app — a default only
 * fires on insert, and a column that silently equals `createdAt` forever is worse than
 * no column, because people trust it.
 */
export interface Audited {
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

// ---------------------------------------------------------------- projects

export const AU_STATES = ["SA", "NSW", "VIC", "QLD", "WA", "NT", "TAS", "ACT"] as const;
export type AuState = (typeof AU_STATES)[number];

/**
 * An address is a record, not a string on another record.
 *
 * They get corrected and they get changed — a lot renumbered by council, a street
 * renamed, a typo found at handover — and everything pointing at one should follow
 * without being edited individually. So projects and jobs hold an id, not text.
 *
 * Lot and street numbers are strings: "12A", "5-7", "Lot 3" are as common as 12.
 */
export interface Address {
  id: Uuid;
  lotNumber: string | null;
  streetNumber: string | null;
  street1: string;
  street2: string | null;
  suburb: string;
  state: AuState;
  country: "AU";
  councilId: Uuid | null;
  /** Generated in Postgres. Read-only: never write to it. */
  consolidatedAddress: string;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

export interface CouncilRegion extends Audited {
  id: Uuid;
  name: string;
  state: AuState;
  active: boolean;
}

/**
 * Two addresses, not one. `original` is where the project started and never moves —
 * it is what contracts and old paperwork refer to. `current` is what every card, board
 * and search shows. They are the same until something changes, and a blank `current`
 * falls back to `original` in the database rather than in every caller.
 */
export const PROJECT_TYPES = ["residential", "commercial", "development"] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  development: "Development"
};

/**
 * One status, on both projects and jobs — a record is in exactly one of these at a time.
 *
 * This is NOT health. Health is a separate, calculated thing (on schedule? over budget?
 * an issue raised?) assembled from inputs still to be decided, and it is deliberately
 * absent from the schema until they are known. Status is what someone sets; health is
 * what the system works out.
 *
 * Snake_case because these are codes, not copy — `RECORD_STATUS_LABELS` holds what a
 * person reads, so a rename is not a data migration.
 */
export const RECORD_STATUSES = [
  "on_track", "at_risk", "behind_schedule", "on_hold",
  "completed", "cancelled", "archived"
] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const RECORD_STATUS_LABELS: Record<RecordStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  behind_schedule: "Behind schedule",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived"
};

/** Not finished and not abandoned. Mirrors the is_current() function in Postgres. */
export const isCurrent = (s: RecordStatus): boolean =>
  s !== "completed" && s !== "cancelled" && s !== "archived";

export interface Project {
  id: Uuid;
  /** Sequential from 1000, four digits minimum, unique. Overridable by hand. */
  projectNo: number;
  originalAddressId: Uuid | null;
  currentAddressId: Uuid;
  projectType: ProjectType | null;
  status: RecordStatus;
  startDate: IsoDate | null;
  targetCompletion: IsoDate | null;
  /** Actual, as opposed to target. */
  endDate: IsoDate | null;
  // + fields
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/** The joined shape the cards read — `project_display`. */
export interface ProjectDisplay {
  id: Uuid;
  projectNo: number;
  projectType: ProjectType | null;
  status: RecordStatus;
  currentAddress: string;
  originalAddress: string | null;
  suburb: string;
  councilId: Uuid | null;
}

// -------------------------------------------------------------------- jobs

export interface Job {
  id: Uuid;
  /** FK to projects.id — the real relationship. Renumbering must not orphan jobs. */
  projectId: Uuid;
  /**
   * The friendly project number, denormalised from the parent so `jobNumber` can be a
   * generated column. Kept in sync by a trigger; never written by the app.
   */
  projectNo: number;
  /**
   * The counter within the project — "01", "02". Assigned by a trigger when omitted,
   * under a lock on the parent project row.
   *
   * Not what Lofty calls "the job number" — that is `jobNumber` below, the combined
   * value. Keeping the two words apart here is the whole reason this one is renamed.
   */
  jobSequence: string;
  /** Generated: projectNo || '-' || jobSequence. Unique. e.g. "1001-01" */
  jobNumber: string;
  /** Same pair as projects, for the same reason. */
  originalAddressId: Uuid | null;
  currentAddressId: Uuid;
  /** The same enum as projects. Not health — health is calculated, and not yet built. */
  status: RecordStatus;
  /**
   * No `projectType`. A job's type is its project's type, read through `job_display` —
   * a commercial project does not contain residential jobs, so a second field would
   * only ever be a chance to disagree with the first.
   */
  // + fields
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/** The joined shape the board reads — `job_display`. Carries the inherited type. */
export interface JobDisplay {
  id: Uuid;
  jobNumber: string;
  projectId: Uuid;
  projectNo: number;
  /** Inherited from the project, never stored on the job. */
  projectType: ProjectType | null;
  status: RecordStatus;
  /** Derived from status — not finished and not abandoned. */
  isCurrent: boolean;
  currentAddress: string;
  originalAddress: string | null;
  suburb: string;
}

// ------------------------------------------------------- project/job/stage

/**
 * The composite table: one row per job per stage. This is what makes stage history
 * possible — a single `stage_id` on the job would only ever tell you where it is now,
 * not when it got there, how long it sat, or what it skipped.
 *
 * `projectId` is carried alongside `jobId` so project-level rollups don't need the
 * extra join. It is enforced against the job's project by a foreign key.
 */
export interface JobStage {
  id: Uuid;
  projectId: Uuid;
  jobId: Uuid;
  stageId: number;
  /** Null until the job reaches this stage */
  enteredAt: IsoDateTime | null;
  /** Null while the job is still in this stage — which is what makes it the open one. */
  exitedAt: IsoDateTime | null;
  /**
   * No `isCurrent` flag. Which stage a job is in now is `jobs.stageId`; whether the job
   * itself is current is `isCurrent(job.status)`. A third copy of that fact is a third
   * thing to keep true.
   */
  // + fields
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

// ------------------------------------------------------------ user profile

/**
 * `profiles`, not `users` — `auth.users` is Supabase's table, populated by Microsoft
 * Entra. This is the row Lofty owns beside it, keyed to it: the same person, but the
 * parts the app decides. Role and team live here, not in Entra.
 */
export interface Profile {
  id: Uuid;
  /** Two fields, not one — people change names, and greetings use the first. */
  firstName: string;
  lastName: string;
  /** Generated in Postgres from the two above. Read-only: never write to it. */
  fullName: string;
  /** Only when someone goes by something else. Null means "use firstName". */
  preferredName: string | null;
  email: string;
  /**
   * The permission ladder, in order — a comparison, not a set. `viewer` reads,
   * `user` works their own jobs, `manager` reads across teams, `admin` edits
   * definitions, `superadmin` manages teams and can delete. Maps onto Microsoft
   * Teams permission levels when that sync lands.
   */
  permission: PermissionLevel;
  // + fields
  active: boolean;
  createdAt: IsoDateTime;
  createdBy: Uuid | null;
  updatedAt: IsoDateTime;
  updatedBy: Uuid | null;
}

/** Declaration order is the ladder; Postgres compares enum values by it. */
export const PERMISSION_LEVELS = ["viewer", "user", "manager", "admin", "superadmin"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

/** `atLeast(p, "manager")` reads the way the RLS predicate does. */
export const atLeast = (have: PermissionLevel, need: PermissionLevel): boolean =>
  PERMISSION_LEVELS.indexOf(have) >= PERMISSION_LEVELS.indexOf(need);

/**
 * Team membership is many-to-many — people sit in more than one team.
 *
 * `isPrimary` is what the screens that need a single answer use: which team the
 * dashboard watches, what the board filters to by default. At most one per person,
 * and a new joiner legitimately has none.
 */
export interface ProfileTeam extends Audited {
  profileId: Uuid;
  teamId: Uuid;
  isPrimary: boolean;
}

/** What goes after "Hi, ". One place, so the decision is never re-made ad hoc. */
export const greetingName = (p: Profile): string => p.preferredName ?? p.firstName;

// ------------------------------------------------------------------ lookup
//
// These are reference tables in Supabase, not constants. They are the business
// process — which is exactly why they must come through the repository, not be
// imported from a module: the day they are seeded, every screen already reads them
// from the right place.

/** Stages are a seeded lookup, ordered — this order is the board's column order. */
export interface Stage extends Audited {
  id: number;
  name: string;
  position: number;
}

/** `teams`. Each owns one or more pipeline phases. */
export interface Team extends Audited {
  id: Uuid;
  name: string;
  /** The hierarchy the `team_hierarchy` permission scope walks. */
  parentTeamId: Uuid | null;
}

/**
 * `template_phases` — which team owns a stage, and how long it should take.
 *
 * Stated, not derived from whatever jobs happen to be loaded: a team that owns a phase
 * owns it on a quiet day too.
 */
export interface TemplatePhase {
  stageId: number;
  stageName: string;
  owningTeamNames: string[];
  expectedDays: number;
}

/** `template_checkpoints` — what a phase expects done before it hands over. */
export interface TemplateCheckpoint {
  stageId: number;
  stageName: string;
  label: string;
  position: number;
}

// -------------------------------------------------------------- properties

export type PropertyScope = "project" | "job";

export type PropertyFormat =
  | "text" | "number" | "currency" | "date" | "checkbox"
  | "file" | "single select" | "multi select" | "person" | "link";

/**
 * `property_defs`. A property IS a field — the two words mean the same thing.
 *
 * Every one lives at project or job level and carries two pieces of context: which
 * stage captures it, and which team captures it. Stage is deliberately not a third
 * level — a pour date is a property of a *job* that happens to be filled in at
 * Scheduling & Estimating.
 *
 * These are rows, not columns, which is why nothing in this app has `field_1`. The
 * count is data.
 */
export interface PropertyDef {
  key: string;
  label: string;
  scope: PropertyScope;
  stageName: string;
  teamName: string;
  format: PropertyFormat;
  /** Required to *leave* its stage, not required to create the record. */
  required: boolean;
  automation?: string;
}
