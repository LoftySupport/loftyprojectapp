/**
 * Saved views — the phases of the build, as slices of the eight stages.
 *
 * The eight stages are the *whole* process, start to finish. A phase is a run of
 * consecutive stages within it, and Preconstruction and Construction are two of them:
 * everything up to "Released to Construction" is preconstruction, and the build itself
 * is construction. That is Lofty's own vocabulary, taken from the preconstruction
 * process map rather than guessed.
 *
 * A saved view is a *named set of stages*, nothing more. It answers "which phase am I
 * looking at", which is a different question from the toolbar's filters ("narrow what is
 * in front of me") and from the header search ("find this one thing").
 *
 * Defined in code for now rather than in the database. Each one resolves to a URL —
 * /jobs?saved=construction — so a view is already something you can send to somebody,
 * and the query string is the whole of its state. That is the point of doing it this way
 * round: when saved views become user-created, the table stores a query string per row
 * and everything below keeps working unchanged. Nothing here has to be unpicked.
 *
 * Two things to know before editing:
 *
 *   Names must match the `stage` enum exactly — see SEED_STAGES in stubRepository.ts.
 *   `stagesInView` intersects against the live list, so a typo shows up as a phase that
 *   matches nothing rather than as an error.
 *
 *   The phase called Preconstruction contains a *stage* also called Preconstruction.
 *   That collision is Lofty's, not this file's, and it is left alone deliberately —
 *   inventing a different word for one of them would put a name in the app that nobody
 *   at Lofty uses. Worth revisiting if it reads badly on the board.
 */

export interface SavedView {
  slug: string;
  label: string;
  /** Stages in scope, in pipeline order. Empty means every stage. */
  stages: string[];
}

export const SAVED_VIEWS: SavedView[] = [
  {
    slug: "all",
    label: "All jobs",
    stages: []
  },
  {
    // Everything from the PWA being issued through to "Released to Construction" — the
    // 57 steps of the preconstruction process map. Selections and Estimating are both
    // inside it, which is why Scheduling & Estimating belongs here and not with the
    // build: the production estimate, the finance approval and the construction release
    // all happen before a slab is poured.
    slug: "preconstruction",
    label: "Pre-construction",
    stages: [
      "Sales & Acquisition",
      "Planning & Engineering",
      "Working Drawings & Contracts",
      "Pre-construction",
      "Scheduling & Estimating"
    ]
  },
  {
    slug: "construction",
    label: "Construction",
    stages: ["Construction"]
  },
  {
    // INFERRED, unlike the two above. Lofty named preconstruction and construction; what
    // to call the two stages after handover, and whether they are one phase or two, has
    // not been said. Grouped and named here so the last two stages are reachable rather
    // than orphaned — rename or split it when the business says.
    slug: "post-construction",
    label: "Post-construction",
    // Three, not two: the database split "Handover & maintenance" into Handover and
    // Maintenance, so leaving Maintenance out here would make the last stage of a job's
    // life unreachable from any saved view.
    stages: ["Post-construction & Closeout", "Handover", "Maintenance"]
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
