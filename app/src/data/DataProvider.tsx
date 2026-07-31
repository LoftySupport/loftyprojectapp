import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Repository } from "./repository";
import { createStubRepository } from "./stubRepository";
import { createSupabaseRepository, isSupabaseConfigured } from "./supabaseRepository";

const DataContext = createContext<Repository | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  // Supabase if it is configured, the stub otherwise. No screen needs to know which.
  const repo = useMemo<Repository>(
    () => (isSupabaseConfigured() ? createSupabaseRepository() : createStubRepository()),
    []
  );
  return <DataContext.Provider value={repo}>{children}</DataContext.Provider>;
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
  const [state, setState] = useState<QueryState<T>>({ data: fallback, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));
    run(repo)
      .then(data => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch(error => { if (!cancelled) setState({ data: fallback, loading: false, error }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, ...deps]);

  return state;
}
