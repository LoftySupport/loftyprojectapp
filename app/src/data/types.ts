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
 * Profile rows are keyed to auth.users.id. Identity comes from the IdP; role and team
 * are owned here, not in Entra — which is what the prototype's Admin page already says.
 */
export interface UserProfile {
  id: Uuid;
  fullName: string;
  email: string;
  // + fields
  active: boolean;
  createdAt: IsoDateTime;
}

// ------------------------------------------------------------------ lookup

/** Stages are a seeded lookup, ordered — this order is the board's column order. */
export interface Stage {
  id: number;
  name: string;
  position: number;
}
