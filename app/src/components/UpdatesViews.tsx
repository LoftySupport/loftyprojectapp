import { useSearchParams } from "react-router-dom";
import "./ui.css";
import "../pages/UpdatesPage.css";

/**
 * How the tracker is looked at: a board, or a table.
 *
 * ============================================================================
 * THERE WAS A GANTT AND A CALENDAR HERE, AND AMBER REMOVED THEM
 *
 *   Both were built on 31 August and taken out on 1 September — *"remove the gantt chart
 *   and calendar"* — and the reason is worth keeping, because it is the argument against
 *   building them again.
 *
 *   A request has no dates of its own. The only dates in reach are its phase's, so every
 *   bar on that gantt was a phase's window borrowed by whatever sat in it: forty requests
 *   in Phase 1 drew forty identical bars. It was an honest chart of a fact the roadmap
 *   already showed once, and drawing it forty times did not make it more informative.
 *
 *   The calendar had the opposite problem. Its two real dates — reported, and last moved
 *   — are facts about administration rather than about work, so a month grid of them
 *   answered "when did people type things" and no question anybody actually had.
 *
 *   The lesson is not "no charts". It is that a time view needs a duration that belongs
 *   to the thing being drawn, and a request has none. If requests ever gain start and
 *   target dates of their own, a gantt becomes worth building — and it will be a
 *   different chart from the one that was removed.
 * ============================================================================
 */

export type UpdatesView = "board" | "table";

export const UPDATES_VIEWS: { slug: UpdatesView; label: string }[] = [
  { slug: "board", label: "Board" },
  { slug: "table", label: "Table" }
];

export function ViewSwitcher({ value, onChange }: {
  value: UpdatesView;
  onChange: (v: UpdatesView) => void;
}) {
  return (
    <div className="updates-views" role="group" aria-label="View">
      {UPDATES_VIEWS.map(v => (
        <button
          key={v.slug}
          type="button"
          className={`updates-view-btn${value === v.slug ? " is-on" : ""}`}
          aria-pressed={value === v.slug}
          onClick={() => onChange(v.slug)}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The view, in the query string — `?view=table`.
 *
 * Local state would have been fewer lines and was the first version. It is wrong here for
 * the reason the jobs board already settled: **the URL is the app's serialisation of
 * "what am I looking at"**, which is why `saved_views` stores a query string verbatim
 * rather than inventing a second schema for the same fact. A view held in a component
 * cannot be linked to, cannot be saved, and disappears on reload.
 *
 * It also cannot be MEASURED. `responsive-check.mjs` visits routes; with the view in
 * state it saw the board twice and the table never.
 *
 * The default is omitted from the URL rather than written as `?view=board`, matching the
 * board's rule that a default is absence. An unknown value falls back to the board
 * instead of rendering nothing — `?view=gantt` is a real link somebody may still have.
 */
export function useUpdatesView(): [UpdatesView, (v: UpdatesView) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view = UPDATES_VIEWS.some(v => v.slug === raw) ? (raw as UpdatesView) : "board";

  const set = (v: UpdatesView) => {
    const next = new URLSearchParams(params);
    if (v === "board") next.delete("view");
    else next.set("view", v);
    // Replace, not push: flicking between views is looking at one thing two ways, and
    // pushing would make Back walk through every glance instead of leaving the page.
    setParams(next, { replace: true });
  };

  return [view, set];
}
