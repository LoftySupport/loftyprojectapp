import { PHASE_TEAMS, STAGE_NAMES, type HealthStatus } from "./lookups";

/**
 * Layout scaffolding for the unbound state — **not data**.
 *
 * While `listJobs()` and `listProjects()` return nothing, an empty board tells you
 * nothing about what the app looks like in use. This is the same shape the binding
 * template carries: five projects with one to three jobs each, spread so every stage
 * column has something in it. Enough to show every relationship the schema has, small
 * enough that nobody mistakes it for a portfolio.
 *
 * Numbers are placeholders in the real parent-plus-sequence shape — PRJ-001 for a
 * project, PRJ-001-02 for its second job — so the relationship reads off the number
 * while nothing looks like a Lofty number.
 *
 * Every screen that uses this checks its repository call first and only falls back to
 * these when the result is empty. The moment a table is wired, they are gone.
 */

export const PROJECT_SIZES = [3, 2, 2, 3, 1];

export interface ShapeJob {
  jobNumber: string;
  projectNumber: string;
  stage: string;
  team: string;
  status: HealthStatus;
  daysInStage: number;
}

export interface ShapeProject {
  projectNumber: string;
  jobs: ShapeJob[];
  status: HealthStatus;
}

const STATUS_CYCLE: HealthStatus[] = [
  "on-track", "on-track", "on-track", "at-risk", "on-track",
  "on-track", "stale", "on-track", "at-risk", "on-track", "on-track"
];

export const SHAPE_PROJECTS: ShapeProject[] = (() => {
  const projects: ShapeProject[] = [];
  let n = 0;

  PROJECT_SIZES.forEach((size, p) => {
    const projectNumber = `PRJ-${String(p + 1).padStart(3, "0")}`;
    const jobs: ShapeJob[] = [];

    for (let i = 0; i < size; i++) {
      // One job per stage before wrapping, so all eight columns are represented
      // rather than eleven jobs piling into the first two.
      const stage = STAGE_NAMES[n % STAGE_NAMES.length];
      jobs.push({
        jobNumber: `${projectNumber}-${String(i + 1).padStart(2, "0")}`,
        projectNumber,
        stage,
        team: PHASE_TEAMS[stage][0],
        status: STATUS_CYCLE[n % STATUS_CYCLE.length],
        daysInStage: 3 + ((n * 5) % 18)
      });
      n++;
    }

    projects.push({
      projectNumber,
      jobs,
      // A project is only as healthy as its worst job — derived, never stored.
      status: jobs.some(j => j.status === "stale")
        ? "stale"
        : jobs.some(j => j.status === "at-risk")
          ? "at-risk"
          : "on-track"
    });
  });

  return projects;
})();

export const SHAPE_JOBS: ShapeJob[] = SHAPE_PROJECTS.flatMap(p => p.jobs);
