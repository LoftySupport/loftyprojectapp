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
 * Names must match `pipeline_stages` exactly. `stagesInView` intersects against the live
 * list, so a typo shows up as a phase that matches nothing rather than as an error —
 * and `verify/seeds.sh` fails when the two lists disagree.
 */

export interface SavedView {
  slug: string;
  label: string;
  /** Stages in scope, in pipeline order. Empty means every stage. */
  stages: string[];
}

export const SAVED_VIEWS: SavedView[] = [
  {
    // Everything except the archive. Amber, 25 August: Closed is "not visible by
    // default but visible by filter" — and in this app the Closed view below IS that
    // filter. Cancelled stays visible here on purpose: a cancelled job is a fact
    // people need to see (and maybe revive), not an archived one.
    slug: "all",
    label: "All jobs",
    stages: [
      "Acquisition & Development",
      "Pre-construction",
      "Construction",
      "Handover & Maintenance",
      "Completed",
      "Cancelled"
    ]
  },
  {
    // The cut people actually make. "Show me what is on" is asked far more often than
    // "show me everything in Construction", which the Stage filter already does.
    // Completed and Cancelled are both out: neither is work that is on.
    slug: "live",
    label: "Live",
    stages: [
      "Acquisition & Development",
      "Pre-construction",
      "Construction",
      "Handover & Maintenance"
    ]
  },
  {
    // The archive — 0045. A record lands here 12 months after Completed or Cancelled,
    // moved by the lifecycle_archive clock, and this view is the one place it shows.
    slug: "closed",
    label: "Closed",
    stages: ["Closed"]
  }
];

export const DEFAULT_SAVED_VIEW = "all";

export function savedViewBySlug(slug: string | null | undefined): SavedView {
  return SAVED_VIEWS.find(v => v.slug === slug) ?? SAVED_VIEWS[0];
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
