import { useCallback, useState } from "react";
import { useQuery, useRepository } from "./DataProvider";
import type { SavedViewBoard, UserSavedView } from "./types";

/**
 * A person's own saved views (0048), read and written through the seam.
 *
 * The three built-in tabs stay in code — they are slices of the lifecycle every person
 * needs, not preferences. These are the ones somebody made: a name over the board's
 * query string, private by RLS, and back on any machine they sign in from.
 *
 * `save` and `remove` return the fresh list from the repository rather than mutating a
 * local copy: the database is the authority on what exists, and a list assembled here
 * would be a second answer that could disagree with it after a refusal.
 */
export function useSavedViews(board: SavedViewBoard) {
  const repo = useRepository();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: views, loading } = useQuery(r => r.listSavedViews(board), [], [board, reloadKey]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = useCallback(
    async (name: string, query: string): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setProblem(null);
      try {
        await repo.saveView(board, name, query);
        setReloadKey(k => k + 1);
        return true;
      } catch (e) {
        setProblem(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [repo, board, busy]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (busy) return false;
      setBusy(true);
      setProblem(null);
      try {
        await repo.deleteSavedView(id);
        setReloadKey(k => k + 1);
        return true;
      } catch (e) {
        setProblem(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [repo, busy]
  );

  return { views: views as UserSavedView[], loading, busy, problem, save, remove, clearProblem: () => setProblem(null) };
}

/**
 * Whether the board is currently showing exactly what a saved view holds.
 *
 * Compared as sorted key/value pairs rather than as strings: `?view=Table&group=Team`
 * and `?group=Team&view=Table` are the same board, and a person who reached one by a
 * different route should not be offered "save" for a view they already have.
 */
export function sameQuery(a: string, b: string): boolean {
  const norm = (q: string) => {
    const p = new URLSearchParams(q.startsWith("?") ? q.slice(1) : q);
    const pairs = [...p.entries()].sort(([k1, v1], [k2, v2]) => k1.localeCompare(k2) || v1.localeCompare(v2));
    return JSON.stringify(pairs);
  };
  return norm(a) === norm(b);
}
