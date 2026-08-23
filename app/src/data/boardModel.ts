import { useMemo } from "react";
import { useQuery } from "./DataProvider";
import { useTeams } from "./useLookups";
import { teamName, type RecordStatus, type TeamId } from "./types";

/**
 * What the boards render, built from real records.
 *
 * This replaces `placeholderShape.ts`, which generated five projects and eleven jobs so
 * the boards would not be empty. That scaffolding did its job — the screens were designed
 * against realistic structure rather than against nothing — and then outlived it: numbers
 * like `PRJ-001-02` read as a decision the app had made rather than as an absence, and
 * every figure on Reports was arithmetic over a fixed array. A placeholder that is
 * mistaken for data is worse than an empty screen, because an empty screen is honest.
 *
 * The field names are deliberately the ones the pages already used. Nothing about a board
 * changed except where its rows come from, so the diff is a source swap rather than a
 * rewrite — and `filtering.ts` and `SearchProvider` keep working untouched.
 *
 * Three things are resolved here rather than on each page, because each of them was
 * getting a different answer in a different file:
 *
 *   - **Team** is a slug on the row (`design`) and a name on the screen ("Design"). The
 *     filter options are names, so the board model carries the name and keeps the slug
 *     beside it for anything that needs the key.
 *   - **Days in stage** is derived from `job_stage_entered_at`, never stored. A stored
 *     counter needs a nightly job and is wrong between runs.
 *   - **A project's jobs** are grouped from the job list rather than fetched per project,
 *     which is one query instead of one per card.
 */

export interface BoardJob {
  /** '1042-01' — the job number and the primary key are the same thing. */
  jobNumber: string;
  /** '1042' as text, because it is an identifier on screen and in the URL. */
  projectNumber: string;
  stage: string;
  /** The display name, "Design" — what the toolbar's Team filter compares against. */
  team: string;
  /** The slug, for anything keyed rather than labelled. */
  teamId: TeamId;
  status: RecordStatus;
  /** Derived from stageEnteredAt on every read. Never stored, so it cannot go stale. */
  daysInStage: number;
  /**
   * Both left unset until `addresses` is wired. They exist because search reads them —
   * the moment they carry values, searching a previous address starts working with no
   * change to any page.
   */
  currentAddress?: string | null;
  originalAddress?: string | null;
}

export interface BoardProject {
  projectNumber: string;
  /** The number itself, for methods that take the key rather than the label. */
  projectId: number;
  jobs: BoardJob[];
  /** What was intended at creation. Null when nobody said. */
  proposedDwellings: number | null;
  /**
   * The project's own status column, not the worst of its jobs.
   *
   * The placeholder derived it, because a generated project had no status of its own.
   * `projects.project_status` is a real column that somebody sets, and deriving it here
   * would quietly overrule them.
   */
  status: RecordStatus;
  currentAddress?: string | null;
  originalAddress?: string | null;
}

const DAY = 86_400_000;

/** Whole days since the job entered its current stage. Same-day reads 0, not 1. */
export function daysSince(iso: string, now: number = Date.now()): number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now - then) / DAY));
}

export interface BoardRecords {
  projects: BoardProject[];
  jobs: BoardJob[];
  loading: boolean;
  error: Error | null;
}

/**
 * Every project and job the reader may see, shaped for the boards.
 *
 * `loading` is both queries, so a page cannot render "0 projects" while the projects
 * query is still in flight — which is the same sentence as the real empty state and
 * would flash the wrong answer on every load.
 *
 * `reloadKey` is what a page bumps after a create. Without it, creating a project wrote
 * the row and left the board showing the list it had fetched before — which is the same
 * symptom as the bug this replaced, arriving by a different route.
 */
export function useBoardRecords(reloadKey: number = 0): BoardRecords {
  const { data: projects, loading: pLoading, error: pError } =
    useQuery(r => r.listProjects(), [], [reloadKey]);
  const { data: jobs, loading: jLoading, error: jError } =
    useQuery(r => r.listJobs(), [], [reloadKey]);
  const { teams, loading: tLoading } = useTeams();

  return useMemo(() => {
    const now = Date.now();

    const boardJobs: BoardJob[] = jobs.map(j => ({
      jobNumber: j.id,
      projectNumber: String(j.projectId),
      stage: j.stage,
      team: teamName(j.owningTeam, teams),
      teamId: j.owningTeam,
      status: j.status,
      daysInStage: daysSince(j.stageEnteredAt, now)
    }));

    const byProject = new Map<string, BoardJob[]>();
    boardJobs.forEach(j => {
      const bucket = byProject.get(j.projectNumber);
      if (bucket) bucket.push(j);
      else byProject.set(j.projectNumber, [j]);
    });

    const boardProjects: BoardProject[] = projects.map(p => ({
      projectNumber: String(p.id),
      projectId: p.id,
      jobs: byProject.get(String(p.id)) ?? [],
      proposedDwellings: p.proposedDwellings,
      status: p.status
    }));

    return {
      projects: boardProjects,
      jobs: boardJobs,
      // Teams are in the gate too: without them every owning team renders as its slug,
      // which then matches none of the toolbar's Team options.
      loading: pLoading || jLoading || tLoading,
      error: pError ?? jError
    };
  }, [projects, jobs, teams, pLoading, jLoading, tLoading, pError, jError]);
}
