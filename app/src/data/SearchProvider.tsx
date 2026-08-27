import { createContext, useContext, useMemo, useState } from "react";
import { RECORD_STATUS_LABELS, type RecordStatus } from "./types";

/**
 * The free-text search from the header, matching the prototype's behaviour.
 *
 * It is a **filter on the view you are looking at**, not a separate results page. Type
 * on the board and the board narrows; switch to Table and the same query still applies.
 * That is what the prototype did and it is the right shape — you are usually looking
 * for a job in a context, not looking one up in the abstract.
 *
 * The query lives here rather than in each page because the input is in the header and
 * the pages are its consumers. One state, one place.
 */

interface SearchContextValue {
  query: string;
  setQuery: (q: string) => void;
  /** Whitespace-split terms, lowercased. Empty when the box is empty. */
  terms: string[];
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [query, setQuery] = useState("");

  const value = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return { query, setQuery, terms };
  }, [query]);

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside a SearchProvider");
  return ctx;
}

/**
 * **Every** term must appear somewhere, so "bell frame" narrows rather than widening.
 * An OR match would return every job in the Frame stage the moment someone typed a
 * second word, which is the opposite of what they were doing.
 */
export function matchesTerms(haystack: (string | number | null | undefined)[], terms: string[]): boolean {
  if (terms.length === 0) return true;
  const text = haystack.filter(Boolean).join(" ").toLowerCase();
  return terms.every(term => text.includes(term));
}

/**
 * Which address a search matched, when it matched one.
 *
 * Worth surfacing rather than swallowing: a hit on an *original* address means whoever
 * searched is working from something out of date — an old email, a contract, a note in
 * a file. Telling them is more useful than silently returning the record.
 */
export type AddressMatch = "current" | "original" | null;

export function matchedAddress(
  current: string | null | undefined,
  original: string | null | undefined,
  terms: string[]
): AddressMatch {
  if (terms.length === 0) return null;
  if (matchesTerms([current], terms)) return "current";
  if (matchesTerms([original], terms)) return "original";
  return null;
}

// ------------------------------------------------------------- what is searched
//
// One matcher per record type, used by every screen. If Jobs searched the team and
// Reports did not, the same query would return different sets on two screens showing
// the same records — which reads as a bug even though both are "working".
//
// Shapes are structural rather than imported so these keep working when the placeholder
// gives way to `job_display` and `project_display`.

export interface SearchableJob {
  jobNumber: string;
  /** The old Lofty number — the id everything outside the app still links by. */
  jobNumberOld?: string | null;
  projectNumber?: string | number | null;
  stage?: string | null;
  team?: string | null;
  status?: RecordStatus;
  currentAddress?: string | null;
  originalAddress?: string | null;
}

export interface SearchableProject {
  projectNumber: string | number;
  status?: RecordStatus;
  currentAddress?: string | null;
  originalAddress?: string | null;
  jobs?: SearchableJob[];
}

/** Both addresses, so an old address off a contract still finds the job. */
export function jobMatchesQuery(job: SearchableJob, terms: string[]): boolean {
  return matchesTerms(
    [
      job.jobNumber,
      job.jobNumberOld,
      job.projectNumber,
      job.stage,
      job.team,
      job.status && RECORD_STATUS_LABELS[job.status],
      job.currentAddress,
      job.originalAddress
    ],
    terms
  );
}

/**
 * A project matches on its own values *or* on any job it holds — searching a job number
 * and being told the project does not exist would be nonsense when the job is on it.
 */
export function projectMatchesQuery(project: SearchableProject, terms: string[]): boolean {
  if (
    matchesTerms(
      [
        project.projectNumber,
        project.status && RECORD_STATUS_LABELS[project.status],
        project.currentAddress,
        project.originalAddress
      ],
      terms
    )
  ) {
    return true;
  }
  return (project.jobs ?? []).some(j => jobMatchesQuery(j, terms));
}

/**
 * True when something in the result set was only found by its *previous* address. The
 * screens say so once, above the results, rather than badging every row: the useful
 * message is "what you searched is out of date", and it only needs saying once.
 */
export function matchedOnPreviousAddress(
  records: { currentAddress?: string | null; originalAddress?: string | null }[],
  terms: string[]
): boolean {
  return (
    terms.length > 0 &&
    records.some(r => matchedAddress(r.currentAddress, r.originalAddress, terms) === "original")
  );
}
