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

// ---------------------------------------------------------------- projects

export interface Project {
  id: Uuid;
  /** Lofty Project Number — unique, human-facing, e.g. "1201" */
  loftyProjectNumber: string;
  name: string | null;
  // + fields
  createdAt: IsoDateTime;
}

// -------------------------------------------------------------------- jobs

export interface Job {
  id: Uuid;
  /** FK to projects.id — the real relationship */
  projectId: Uuid;
  /**
   * Lofty Project Number, denormalised from the parent so the combined number can be
   * a generated column. Kept in sync by a trigger; never edited directly.
   */
  loftyProjectNumber: string;
  /** Job number within the project, e.g. "01" */
  jobNumber: string;
  /** Generated: loftyProjectNumber || '-' || jobNumber. Unique. e.g. "1201-01" */
  combinedLoftyJobNumber: string;
  address: string | null;
  // + fields
  createdAt: IsoDateTime;
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
  /** Null while the job is still in this stage */
  exitedAt: IsoDateTime | null;
  isCurrent: boolean;
  // + fields
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
  updatedAt: IsoDateTime;
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
export interface ProfileTeam {
  profileId: Uuid;
  teamId: Uuid;
  isPrimary: boolean;
  joinedAt: IsoDateTime;
}

/** What goes after "Hi, ". One place, so the decision is never re-made ad hoc. */
export const greetingName = (p: Profile): string => p.preferredName ?? p.firstName;

// ------------------------------------------------------------------ lookup

/** Stages are a seeded lookup, ordered — this order is the board's column order. */
export interface Stage {
  id: number;
  name: string;
  position: number;
}
