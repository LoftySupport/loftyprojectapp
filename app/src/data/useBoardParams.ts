import { useCallback, useMemo } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { GROUPINGS, VIEWS, type Grouping, type ToolbarFilter, type View } from "../components/Toolbar";
import { DEFAULT_SAVED_VIEW, savedViewBySlug, type SavedView } from "./savedViews";

/**
 * The board's controls, kept in the query string instead of in component state.
 *
 * Before this, "Table view, grouped by team, construction only" was something you could
 * reach but not send: the URL said /jobs no matter what you were looking at. Now every
 * control is in the address bar, so the answer to "can you show me what you mean" is a
 * link rather than six instructions.
 *
 * Two rules make the URLs stay readable:
 *
 *   Defaults are absent, never spelled out. A board in its default state is /jobs, not
 *   /jobs?view=Board&group=Stage&saved=all. Params appear as you change things and
 *   disappear as you change them back, so a link carries the difference and nothing else.
 *
 *   Writes replace rather than push. Choosing a view is adjusting what is in front of
 *   you, not going somewhere; pushing would put nine dead stops between the board and
 *   the page you came from, and Back would stop meaning "back".
 */

/**
 * Query keys per filterable field. Short and lowercase because these get pasted into
 * Teams messages — `member`, not `team%20member`.
 */
const KEY_BY_FIELD: Record<string, string> = {
  "Stage": "stage",
  "Team": "team",
  "Team member": "member",
  "Status": "status",
  "Date": "date",
  "Type": "type",
  "Tag": "tag"
};
const FIELD_BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(KEY_BY_FIELD).map(([field, key]) => [key, field])
);

export interface BoardParams {
  view: View;
  setView: (v: View) => void;
  grouping: Grouping;
  setGrouping: (g: Grouping) => void;
  filters: ToolbarFilter[];
  setFilters: (f: ToolbarFilter[]) => void;
  saved: SavedView;
  setSaved: (slug: string) => void;
  /**
   * The current query string, to hang off a record link so that closing the drawer
   * returns you to the board you were on rather than to a reset one.
   */
  search: string;
}

export function useBoardParams(defaults: { view: View; grouping: Grouping }): BoardParams {
  const [params, setParams] = useSearchParams();
  const location = useLocation();

  /** An unknown value falls back to the default — a mistyped link should land somewhere. */
  const view = (VIEWS as readonly string[]).includes(params.get("view") ?? "")
    ? (params.get("view") as View)
    : defaults.view;

  const grouping = (GROUPINGS as readonly string[]).includes(params.get("group") ?? "")
    ? (params.get("group") as Grouping)
    : defaults.grouping;

  const saved = savedViewBySlug(params.get("saved"));

  /**
   * A chip with no value is written as a bare `?stage=`. It reads oddly, and it is
   * deliberate: an added-but-unset filter is a real state — the chip is on screen
   * waiting for a choice — and dropping it from the URL would make a shared link
   * silently lose a control the sender could see.
   */
  const filters = useMemo<ToolbarFilter[]>(() => {
    const out: ToolbarFilter[] = [];
    for (const [key, field] of Object.entries(FIELD_BY_KEY)) {
      if (!params.has(key)) continue;
      const raw = params.get(key) ?? "";
      out.push({ field, value: raw === "" ? null : raw });
    }
    return out;
  }, [params]);

  /** One writer, so every control drops its own default the same way. */
  const write = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params);
      mutate(next);
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  const setView = useCallback(
    (v: View) => write(next => (v === defaults.view ? next.delete("view") : next.set("view", v))),
    [write, defaults.view]
  );

  const setGrouping = useCallback(
    (g: Grouping) =>
      write(next => (g === defaults.grouping ? next.delete("group") : next.set("group", g))),
    [write, defaults.grouping]
  );

  const setSaved = useCallback(
    (slug: string) =>
      write(next => (slug === DEFAULT_SAVED_VIEW ? next.delete("saved") : next.set("saved", slug))),
    [write]
  );

  const setFilters = useCallback(
    (list: ToolbarFilter[]) =>
      write(next => {
        // Rewritten wholesale rather than diffed: the caller hands over the complete set,
        // and clearing every key first is what makes "Clear" and "remove one" the same
        // code path instead of two that can disagree.
        for (const key of Object.values(KEY_BY_FIELD)) next.delete(key);
        for (const f of list) {
          const key = KEY_BY_FIELD[f.field];
          if (key) next.set(key, f.value ?? "");
        }
      }),
    [write]
  );

  return {
    view, setView,
    grouping, setGrouping,
    filters, setFilters,
    saved, setSaved,
    search: location.search
  };
}
