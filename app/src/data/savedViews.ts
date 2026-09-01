/**
 * Saved views — named slices of the lifecycle.
 *
 * A saved view is a *named set of stages*, nothing more. It answers "which part of the
 * book am I looking at", which is a different question from the toolbar's filters
 * ("narrow what is in front of me") and from the header search ("find this one thing").
 *
 * **These were rewritten when the lifecycle went from nine stages to five.** The old
 * three — Pre-construction, Construction, Post-construction — were slices of a nine-stage
 * list, and four of those nine turned out to be processes running *inside* a phase rather
 * than phases: Planning & Engineering, Working Drawings & Contracts, Scheduling &
 * Estimating and Post-construction & Closeout. Slicing five phases into three named runs
 * mostly restates the phases, so the useful cut is a different one — live work versus
 * finished — and a team wanting to see its own process wants a nested pipeline, not a
 * saved view over this one.
 *
 * Defined in code for now rather than in the database. Each one resolves to a URL —
 * /jobs?saved=live — so a view is already something you can send to somebody, and the
 * query string is the whole of its state. When saved views become user-created, the table
 * stores a query string per row and everything below keeps working unchanged.
 *
 * **One list per board since 31 August.** They were one, and a view of jobs and a view of
 * projects turned out to be different questions — see PROJECT_VIEWS below.
 *
 * Names must match `pipeline_stages` exactly. `stagesInView` intersects against the live
 * list, so a typo shows up as a phase that matches nothing rather than as an error — and
 * `verify/seeds.sh` compares every name here against the table. (That sentence was in
 * this comment before the check was: it said seeds.sh fails when the two disagree, and
 * seeds.sh had never looked at this file. It does now.)
 */

export interface SavedView {
  slug: string;
  label: string;
  /** Stages in scope, in pipeline order. Empty means every stage. */
  stages: string[];
  /**
   * A predicate the stages cannot express, for the one view that is not a stage slice.
   *
   * `no-jobs` — a project nobody has split yet (Amber, 31 Aug: "New Projects (no job
   * attached)"). It is a real cut and a real piece of work — those projects are the
   * queue — and it cuts across the lifecycle rather than along it, because a project can
   * sit at any phase without having had its lots created.
   *
   * Deliberately not modelled as a stage. A view whose `stages` lied about what it shows
   * would put the wrong options in the toolbar's Stage filter, which reads the same list.
   */
  requires?: "no-jobs";
}

/**
 * The lifecycle's seven phases, in pipeline order. Every view below is a run of these.
 *
 * Written out rather than imported from the database because these files are the app's
 * copy of a list the database owns — the same pairing `verify/seeds.sh` exists to keep
 * honest, which is why it now checks these names too.
 */
const LIFECYCLE = [
  "Acquisition & Development",
  "Pre-construction",
  "Construction",
  "Maintenance",
  "Completed",
  "Closed",
  "Cancelled"
];

/** The four open phases — work that is on. */
const CURRENT = LIFECYCLE.slice(0, 4);
/** Where a record ends up: won, archived and lost. */
const ENDED = ["Completed", "Closed", "Cancelled"];

/**
 * The Jobs board's views.
 *
 * Unchanged: "All jobs" holds everything except the archive, because Amber's 25 August
 * answer was that Closed is "not visible by default but visible by filter" — and the
 * Closed view IS that filter. Cancelled stays visible, since a cancelled job is a fact
 * people need to see and, since 0057, the record they clone from when work restarts.
 */
export const JOB_VIEWS: SavedView[] = [
  {
    slug: "all",
    label: "All jobs",
    stages: LIFECYCLE.filter(s => s !== "Closed")
  },
  {
    // The cut people actually make. "Show me what is on" is asked far more often than
    // "show me everything in Construction", which the Stage filter already does.
    slug: "live",
    label: "Live",
    stages: CURRENT
  },
  {
    // The archive — 0045. A record lands here 12 months after Completed or Cancelled,
    // moved by the lifecycle_archive clock, and this view is the one place it shows.
    slug: "closed",
    label: "Closed",
    stages: ["Closed"]
  }
];

/**
 * The Projects board's views — a different set, not the same three renamed.
 *
 * Amber, 31 August: *"All Projects, Current Projects (projects not completed, closed or
 * cancelled), Archived (Projects in completed, closed or cancelled), New Projects (no job
 * attached) — these are saved views filtered on Lifecycle stage. all projects views
 * should show all the lifecycle stages as default."*
 *
 * WHY THE TWO BOARDS DIVERGED HERE
 *
 *   A job is one dwelling and it either is or is not being worked on, so "Live" is the
 *   whole question. A project is a container: what people ask of the projects list is
 *   which sites are running, which are done with, and which have not been started —
 *   and that last one is not a phase, it is an absence of jobs.
 *
 *   "All Projects" shows every phase, the archive included. That is the direct reading
 *   of "all the lifecycle stages as default", and it is only safe because Archived is
 *   its own tab beside it: on the Jobs board, hiding Closed from "All" is what makes
 *   the archive an archive, and here the same job is done by naming it.
 */
export const PROJECT_VIEWS: SavedView[] = [
  { slug: "all", label: "All Projects", stages: LIFECYCLE },
  { slug: "current", label: "Current Projects", stages: CURRENT },
  { slug: "archived", label: "Archived", stages: ENDED },
  // Every phase, then the jobless test on top: a project with no jobs at Construction is
  // still a project nobody has split, and hiding it behind a phase would be a second
  // rule nobody asked for.
  { slug: "new", label: "New Projects", stages: LIFECYCLE, requires: "no-jobs" }
];

/** Both lists open on the same slug, so the default is absent from the URL on either. */
export const DEFAULT_SAVED_VIEW = "all";

/**
 * A view by slug, within one board's list.
 *
 * The list is passed rather than reached for, because the two boards no longer share
 * one: `?saved=live` means the Live jobs view on /jobs and nothing on /projects, where
 * it falls through to the first view. That fall-through is also what an old bookmark
 * gets, which is the right answer — land somewhere, not nowhere.
 */
export function savedViewBySlug(
  slug: string | null | undefined,
  views: SavedView[]
): SavedView {
  return views.find(v => v.slug === slug) ?? views[0];
}

/**
 * Stage names a view admits, intersected with the stages that actually exist.
 *
 * The intersection is not defensive padding: the view list is written by hand and the
 * stage enum is not, so a renamed stage would otherwise leave a view quietly matching
 * nothing and looking like an empty pipeline rather than a stale config.
 */
export function stagesInView(view: SavedView, allStageNames: string[]): string[] {
  if (view.stages.length === 0) return allStageNames;
  return allStageNames.filter(s => view.stages.includes(s));
}
