import type { Repository, RepositoryMethod } from "./repository";
import type { Job, JobStage, Project, Stage, Profile } from "./types";

/**
 * The starting point: structure, no data.
 *
 * Every method resolves empty. Screens render their real chrome — toolbar, columns,
 * table headers, filters — around an empty state, which is exactly the shape they will
 * have on a fresh tenant anyway. Building against this first means the empty states are
 * designed rather than discovered later.
 *
 * The one exception is `listStages`, which returns the seeded lookup. Stages are the
 * business process, not data: without them there is no board to look at.
 */

export const SEED_STAGES: Stage[] = [
  { id: 1, name: "Sales & acquisition", position: 1 },
  { id: 2, name: "Planning & Engineering", position: 2 },
  { id: 3, name: "Working Drawings & Contracts", position: 3 },
  { id: 4, name: "Preconstruction", position: 4 },
  { id: 5, name: "Scheduling & Estimating", position: 5 },
  { id: 6, name: "Construction & execution", position: 6 },
  { id: 7, name: "Post-construction & closeout", position: 7 },
  { id: 8, name: "Handover & maintenance", position: 8 }
];

export function createStubRepository(): Repository {
  const wired = new Set<RepositoryMethod>(["listStages"]);
  return {
    name: "stub",
    wired: wired as ReadonlySet<keyof Repository>,

    async listProjects(): Promise<Project[]> { return []; },
    async getProject(): Promise<Project | null> { return null; },

    async listJobs(): Promise<Job[]> { return []; },
    async getJob(): Promise<Job | null> { return null; },

    async listStages(): Promise<Stage[]> { return SEED_STAGES; },
    async listJobStages(): Promise<JobStage[]> { return []; },

    async listProfiles(): Promise<Profile[]> { return []; },
    async currentProfile(): Promise<Profile | null> { return null; }
  };
}
