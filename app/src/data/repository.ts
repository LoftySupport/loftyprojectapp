import type {
  Job,
  Profile,
  Project,
  PropertyDef,
  Stage,
  Team,
  TemplateCheckpoint,
  TemplatePhase
} from "./types";

/**
 * The seam.
 *
 * Every screen reads through this interface and nothing else. That is what makes
 * "interface first, data later" work without a rewrite: the UI is written once, against
 * these methods, and each one is swapped from the stub to Supabase independently.
 *
 * The rule that keeps it honest: **no component may import the Supabase client, and no
 * component may import seed data directly.** If a screen needs something that isn't
 * here, add a method — don't reach around the seam.
 *
 * That second half was learned the hard way. The lookups below (teams, template phases,
 * checkpoints, property definitions) spent a while as module constants imported straight
 * into nine files. They read like configuration, but every one is a real Supabase table,
 * and the day they were seeded all nine files would have had to change — the exact
 * rewrite this interface exists to prevent. If it will live in Postgres, it belongs
 * here, however static it looks today.
 */
export interface Repository {
  readonly name: string;

  /** Which methods are backed by real data yet. Drives the "not wired" badges. */
  readonly wired: ReadonlySet<keyof Repository>;

  // ---- records ----------------------------------------------------------
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;

  listJobs(opts?: { projectId?: string }): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;

  listProfiles(): Promise<Profile[]>;
  currentProfile(): Promise<Profile | null>;

  // ---- lookups ----------------------------------------------------------
  // Reference tables. Seeded rather than user-created, which is why the stub can answer
  // them honestly — but they are tables, so they come through the seam.
  listStages(): Promise<Stage[]>;
  listTeams(): Promise<Team[]>;
  listTemplatePhases(): Promise<TemplatePhase[]>;
  listTemplateCheckpoints(): Promise<TemplateCheckpoint[]>;
  listPropertyDefs(): Promise<PropertyDef[]>;
}

export type RepositoryMethod = Exclude<keyof Repository, "name" | "wired">;

export const ALL_METHODS: RepositoryMethod[] = [
  "listProjects",
  "getProject",
  "listJobs",
  "getJob",
  "listProfiles",
  "currentProfile",
  "listStages",
  "listTeams",
  "listTemplatePhases",
  "listTemplateCheckpoints",
  "listPropertyDefs"
];

/** Human labels for the wiring checklist on the Status page. */
export const METHOD_TABLES: Record<RepositoryMethod, string> = {
  listProjects: "projects",
  getProject: "projects",
  listJobs: "jobs",
  getJob: "jobs",
  listProfiles: "profiles",
  currentProfile: "profiles",
  listStages: "stage (enum)",
  listTeams: "team (enum)",
  listTemplatePhases: "template_phases",
  listTemplateCheckpoints: "template_checkpoints",
  listPropertyDefs: "property_defs"
};
