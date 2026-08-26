import { useMemo } from "react";
import { useQuery } from "./DataProvider";
import { useTeams } from "./useLookups";
import { teamName, type ProjectType, type RecordStatus, type TeamId } from "./types";

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
  /** The project's type, inherited through `job_display`. Null until somebody sets it. */
  projectType: ProjectType | null;
  /**
   * Who created the job, by name.
   *
   * NOT the assignee, and labelled apart from it everywhere it shows. Lofty read an
   * empty "Assigned to" as a mistake — "there is 10 jobs assigned to me" — and the
   * database is unambiguous: all ten have `job_created_by` set to her and
   * `job_assignee_id` null. Two facts, and collapsing them into one column is how a
   * board comes to claim work is allocated when nothing has been.
   */
  createdBy: string | null;
  /**
   * The assignee, resolved to a name. `jobs.job_assignee_id` has existed since 0028;
   * what was missing was this resolution — every "Assigned to" rendered a token while
   * the column sat unbound. Null means nobody is assigned, which is a real state and
   * renders as an em dash, not as a token: the app can answer, and the answer is
   * "no one".
   */
  assigneeName: string | null;
  /** The assignee's id, for the drawer's editor — the name above is for reading. */
  assigneeId: string | null;
  /**
   * The team NAMES the assignee sits in — resolved from `profile_teams` through the
   * profile, plural because people sit in more than one. Amber, 26 August: the Team
   * filter "should just read 'team' and anyone who owns a job, if they are in that
   * team (even if they have multiple teams), it should show" — so the filter matches
   * this list as well as the owning team, and there is no separate person filter.
   */
  assigneeTeams: string[];
  /** Derived from stageEnteredAt on every read. Never stored, so it cannot go stale. */
  daysInStage: number;
  /** When the current stay began — what the Gantt and calendar place in time. */
  stageEnteredAt: string;
  /**
   * Resolved by `job_display` since 0036 — the card shows the job number and the address
   * together, because neither reads as a place on its own.
   *
   * `originalAddress` is null until the job is renamed away from what it was created as,
   * and search reads all three: somebody typing an old contract's address should find the
   * job that used to be at it.
   */
  currentAddress?: string | null;
  originalAddress?: string | null;
  /** The site the job belongs to. Read through from the project, never copied. */
  projectAddress?: string | null;
}

export interface BoardProject {
  projectNumber: string;
  /** The number itself, for methods that take the key rather than the label. */
  projectId: number;
  jobs: BoardJob[];
  /** What was intended at creation. Null when nobody said. */
  proposedDwellings: number | null;
  projectType: ProjectType | null;
  /** The date being worked towards, or null when none is set. */
  targetCompletion: string | null;
  /**
   * The project's current address as text, resolved on the read by an embed that names
   * its foreign key. Null only when the address row is genuinely unreadable, which is
   * what the card's token still covers.
   */
  currentAddress: string | null;
  /**
   * The project's own status column, not the worst of its jobs.
   *
   * The placeholder derived it, because a generated project had no status of its own.
   * `projects.project_status` is a real column that somebody sets, and deriving it here
   * would quietly overrule them.
   */
  status: RecordStatus;
  originalAddress: string | null;
  /** The current address's suburb and council, from the same embed as the address. */
  suburb: string | null;
  council: string | null;
  /** The project's own lifecycle phase — 0039. Its jobs may be elsewhere. */
  stage: string;
  stageEnteredAt: string;
  /** Who holds the project — editable on the detail page, per Amber's Q2. */
  owningTeam: TeamId | null;
  assigneeId: string | null;
  startDate: string | null;
  endDate: string | null;
  sharepointUrl: string | null;
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
  // Names for the audit columns. Small and cached by the query hook — 47 rows — and it
  // is the only way to turn `job_created_by` into something a person recognises.
  const { data: profiles, loading: prLoading } = useQuery(r => r.listProfiles(), []);

  return useMemo(() => {
    const now = Date.now();
    const nameOf = new Map(profiles.map(p => [p.id, p.fullName]));
    // Team memberships per person, resolved to display names once rather than on every
    // filter comparison — the Team filter's options are names, so this compares equal.
    const teamsOf = new Map(
      profiles.map(p => [p.id, p.teams.map(t => teamName(t, teams))])
    );

    const boardJobs: BoardJob[] = jobs.map(j => ({
      jobNumber: j.id,
      projectNumber: String(j.projectId),
      stage: j.stage,
      team: teamName(j.owningTeam, teams),
      teamId: j.owningTeam,
      status: j.status,
      projectType: j.projectType,
      createdBy: j.createdBy ? nameOf.get(j.createdBy) ?? null : null,
      assigneeName: j.assigneeId ? nameOf.get(j.assigneeId) ?? null : null,
      assigneeId: j.assigneeId ?? null,
      assigneeTeams: j.assigneeId ? teamsOf.get(j.assigneeId) ?? [] : [],
      daysInStage: daysSince(j.stageEnteredAt, now),
      stageEnteredAt: j.stageEnteredAt,
      currentAddress: j.currentAddress,
      originalAddress: j.originalAddress,
      projectAddress: j.projectCurrentAddress
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
      projectType: p.projectType,
      targetCompletion: p.targetCompletion,
      // The project's own address, not one borrowed from its first job. Deriving it
      // from the jobs worked only because every project here has some — a project
      // created and not yet split had no address at all, which is precisely the case
      // the field exists for.
      currentAddress: p.currentAddress,
      originalAddress: p.originalAddress,
      suburb: p.suburb,
      council: p.council,
      stage: p.stage,
      stageEnteredAt: p.stageEnteredAt,
      owningTeam: p.owningTeam,
      assigneeId: p.assigneeId,
      startDate: p.startDate,
      endDate: p.endDate,
      sharepointUrl: p.sharepointUrl,
      status: p.status
    }));

    return {
      projects: boardProjects,
      jobs: boardJobs,
      // Teams are in the gate too: without them every owning team renders as its slug,
      // which then matches none of the toolbar's Team options.
      loading: pLoading || jLoading || tLoading || prLoading,
      error: pError ?? jError
    };
  }, [projects, jobs, teams, profiles, pLoading, jLoading, tLoading, prLoading, pError, jError]);
}
