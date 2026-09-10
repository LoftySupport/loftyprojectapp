import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Repository } from "./repository";
import { createStubRepository } from "./stubRepository";
import { createSupabaseRepository, isSupabaseConfigured } from "./supabaseRepository";
import { withUndo } from "./undoableRepository";
import { withSchemaDriftNotice } from "./schemaDrift";

const DataContext = createContext<Repository | null>(null);

/**
 * A counter every `useQuery` depends on. Bumping it re-runs every read on the page — the
 * blunt instrument undo and redo need, because the step that was taken back was recorded
 * at the seam and does not know which screen is showing the record. There is no cache to
 * invalidate more precisely; there is no cache.
 */
const RefreshContext = createContext<{ version: number; refresh: () => void }>({ version: 0, refresh: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  // Supabase if it is configured, the stub otherwise. No screen needs to know which.
  // Wrapped so that every field write is undoable — see undoableRepository.ts.
  // Two wrappers, outermost last. `withUndo` records the step; `withSchemaDriftNotice`
  // sits OUTSIDE it so that a "column does not exist" thrown by either the write or the
  // read-before-it comes back as a sentence a person can act on (schemaDrift.ts).
  const repo = useMemo<Repository>(
    () => withSchemaDriftNotice(
      withUndo(isSupabaseConfigured() ? createSupabaseRepository() : createStubRepository())
    ),
    []
  );
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion(v => v + 1), []);
  const refreshApi = useMemo(() => ({ version, refresh }), [version, refresh]);
  return (
    <DataContext.Provider value={repo}>
      <RefreshContext.Provider value={refreshApi}>{children}</RefreshContext.Provider>
    </DataContext.Provider>
  );
}

/** Ask every read on the page to run again — after an undo, a redo, anything the seam did. */
export function useDataRefresh(): () => void {
  return useContext(RefreshContext).refresh;
}

export function useRepository(): Repository {
  const repo = useContext(DataContext);
  if (!repo) throw new Error("useRepository must be used inside <DataProvider>");
  return repo;
}

type QueryState<T> = { data: T; loading: boolean; error: Error | null };

/**
 * Minimal async read. Deliberately not React Query — one dependency fewer while the
 * shape of the app is still moving. Swap it when caching and invalidation start to hurt.
 */
export function useQuery<T>(
  run: (repo: Repository) => Promise<T>,
  fallback: T,
  deps: unknown[] = []
): QueryState<T> {
  const repo = useRepository();
  const { version } = useContext(RefreshContext);
  const [state, setState] = useState<QueryState<T>>({ data: fallback, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    run(repo)
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(error => { if (!cancelled) setState({ data: fallback, loading: false, error }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, version, ...deps]);

  return state;
}
