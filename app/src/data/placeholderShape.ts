import { useMemo } from "react";
import { useTemplatePhases, useStages } from "./useLookups";
import type { RecordStatus } from "./types";

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
 * It is built from the stage and phase lookups rather than hard-coding them, which is
 * why it is a hook: those come through the repository now. Every screen using it checks
 * its repository call first and only falls back to these when the result is empty. The
 * moment a table is wired, they are gone.
 */

export const PROJECT_SIZES = [3, 2, 2, 3, 1];

export interface ShapeJob {
  jobNumber: string;
  projectNumber: string;
  stage: string;
  team: string;
  status: RecordStatus;
  daysInStage: number;
}

export interface ShapeProject {
  projectNumber: string;
  jobs: ShapeJob[];
  status: RecordStatus;
}

/** Spread across the enum so the board shows what each status looks like, not just the
 *  happy one. Completed and cancelled are in there deliberately — they are what
 *  is_current() filters out. */
const STATUS_CYCLE: RecordStatus[] = [
  "on_track", "on_track", "at_risk", "on_track", "behind_schedule",
  "on_track", "on_hold", "completed", "at_risk", "cancelled", "on_track"
];

export function usePlaceholderShape() {
  const { stageNames } = useStages();
  const { teamsByStage } = useTemplatePhases();

  return useMemo(() => {
    if (stageNames.length === 0) return { projects: [], jobs: [] as ShapeJob[] };

    const projects: ShapeProject[] = [];
    let n = 0;

    PROJECT_SIZES.forEach((size, p) => {
      const projectNumber = `PRJ-${String(p + 1).padStart(3, "0")}`;
      const jobs: ShapeJob[] = [];

      for (let i = 0; i < size; i++) {
        // One job per stage before wrapping, so all eight columns are represented
        // rather than eleven jobs piling into the first two.
        const stage = stageNames[n % stageNames.length];
        jobs.push({
          jobNumber: `${projectNumber}-${String(i + 1).padStart(2, "0")}`,
          projectNumber,
          stage,
          team: teamsByStage[stage]?.[0] ?? "",
          status: STATUS_CYCLE[n % STATUS_CYCLE.length],
          daysInStage: 3 + ((n * 5) % 18)
        });
        n++;
      }

      projects.push({
        projectNumber,
        jobs,
        // A project is only as healthy as its worst job — derived, never stored.
        status: jobs.some(j => j.status === "behind_schedule")
          ? "behind_schedule"
          : jobs.some(j => j.status === "at_risk")
            ? "at_risk"
            : "on_track"
      });
    });

    return { projects, jobs: projects.flatMap(p => p.jobs) };
  }, [stageNames, teamsByStage]);
}
