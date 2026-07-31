import type { Job, JobStage, Project, Stage, UserProfile } from "./types";

/**
 * The seam.
 *
 * Every screen reads through this interface and nothing else. That is what makes
 * "interface first, data later" work without a rewrite: the UI is written once, against
 * these methods, and each one is swapped from the stub to Supabase independently.
 *
 * The rule that keeps it honest: **no component may import the Supabase client.** If a
 * screen needs data that isn't here, add a method — don't reach around the seam.
 */
export interface Repository {
  readonly name: string;

  /** Which methods are backed by real data yet. Drives the "not wired" badges. */
  readonly wired: ReadonlySet<keyof Repository>;

  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;

  listJobs(opts?: { projectId?: string }): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;

  listStages(): Promise<Stage[]>;
  listJobStages(opts?: { jobId?: string; projectId?: string }): Promise<JobStage[]>;

  listUsers(): Promise<UserProfile[]>;
  currentUser(): Promise<UserProfile | null>;
}

export type RepositoryMethod = Exclude<keyof Repository, "name" | "wired">;

export const ALL_METHODS: RepositoryMethod[] = [
  "listProjects",
  "getProject",
  "listJobs",
  "getJob",
  "listStages",
  "listJobStages",
  "listUsers",
  "currentUser"
];

/** Human labels for the wiring checklist on the Status page. */
export const METHOD_TABLES: Record<RepositoryMethod, string> = {
  listProjects: "projects",
  getProject: "projects",
  listJobs: "jobs",
  getJob: "jobs",
  listStages: "stages",
  listJobStages: "job_stages",
  listUsers: "user_profiles",
  currentUser: "user_profiles"
};
