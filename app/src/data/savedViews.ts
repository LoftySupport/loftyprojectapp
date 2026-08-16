/**
 * Saved views — "All jobs", "Pre-construction", "Construction".
 *
 * A saved view is a *named set of stages*, nothing more. It answers "which slice of the
 * pipeline am I looking at", which is a different question from the toolbar's filters
 * ("narrow what is in front of me") and from the header search ("find this one thing").
 *
 * Defined in code for now rather than in the database. Each one resolves to a URL —
 * /jobs?saved=construction — so a view is already something you can send to somebody,
 * and the query string is the whole of its state. That is the point of doing it this way
 * round: when saved views become user-created, the table stores a query string per row
 * and everything below keeps working unchanged. Nothing here has to be unpicked.
 *
 * ────────────────────────────────────────────────────────────────────────────────
 * AMBER: the groupings below are a PLACEHOLDER — my guess at how Lofty splits the
 * eight stages, not something the business told me. Correct `stages` on each entry and
 * the rest of the app follows; nothing else reads the split. Names must match the
 * `stage` enum exactly (see SEED_STAGES in stubRepository.ts).
 * ────────────────────────────────────────────────────────────────────────────────
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
    slug: "pre-construction",
    label: "Pre-construction",
    stages: [
      "Sales & acquisition",
      "Planning & Engineering",
      "Working Drawings & Contracts",
      "Preconstruction"
    ]
  },
  {
    slug: "construction",
    label: "Construction",
    stages: ["Scheduling & Estimating", "Construction & execution"]
  },
  {
    slug: "closeout",
    label: "Closeout",
    stages: ["Post-construction & closeout", "Handover & maintenance"]
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
