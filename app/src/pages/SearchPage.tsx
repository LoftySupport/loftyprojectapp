import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { useSearch } from "../data/SearchProvider";
import { SEARCH_HIT_LABELS, SEARCH_HIT_PLURALS, type SearchHit, type SearchHitKind } from "../data/types";
import { LoadProblem } from "../components/SearchNotices";
import { PageShell } from "./Placeholder";
import "../components/ui.css";

/**
 * Everything that matches one query, from anywhere in the app.
 *
 * The other half of the header's dropdown. The dropdown answers "take me there" in a
 * keystroke and a click and shows the first few of each kind; this page shows the lot,
 * grouped, with the counts — which is what "how many jobs are in Wandi" needs and a
 * four-row popup cannot give.
 *
 * THE QUERY LIVES IN THE URL, not in the header's state, and that is deliberate: a
 * results page you cannot send to somebody is half a results page. `?q=` is the source of
 * truth here, and the header box is synced FROM it on arrival rather than the other way
 * round, so opening a shared link fills the box in with what it is showing.
 *
 * WHAT IT DOES NOT DO. There is no filtering, sorting or paging on this page. Each kind is
 * capped at fifty and says so when it hits the cap, because the fix for a query with more
 * than fifty jobs in it is a better query or the Jobs table's own filters — both of which
 * exist — rather than a second, weaker copy of that table built here.
 */
export function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const { query, setQuery } = useSearch();

  // Arriving from a shared link, the header box is empty and this page has a query. Fill
  // it in — otherwise the box contradicts the page it is sitting above, and typing into it
  // would start from blank rather than from what is on screen.
  //
  // One direction only. Syncing back would fight the debounce: every keystroke would push
  // a history entry and the back button would walk letter by letter out of the search.
  useEffect(() => {
    if (q && q !== query) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const { data: hits, loading, error } = useQuery<SearchHit[]>(
    r => (q.length >= 2 ? r.search(q, { limit: 50 }) : Promise.resolve([])),
    [],
    [q]
  );

  const order: SearchHitKind[] = ["job", "project", "contact", "company", "maintenance", "document"];
  const groups = order
    .map(kind => ({ kind, rows: hits.filter(h => h.kind === kind) }))
    .filter(g => g.rows.length > 0);

  return (
    <PageShell
      title={q ? `Results for “${q}”` : "Search"}
      subtitle={
        q
          ? `${hits.length} ${hits.length === 1 ? "match" : "matches"} across jobs, projects, people, companies, requests and documents.`
          : "Type in the box at the top of the page to search everything at once."
      }
    >
      {error && <LoadProblem error={error} />}

      {q.length === 1 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          One letter matches most of the database. Type a little more.
        </Text>
      )}

      {loading && q.length >= 2 && (
        <Text type="text2" color="secondary">Searching…</Text>
      )}

      {!loading && q.length >= 2 && hits.length === 0 && !error && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          Nothing matches “{q}”. Every word has to appear somewhere in a record, so fewer
          words find more — and jobs and projects also match on the address they used to
          have, in case what you are searching from is out of date.
        </Text>
      )}

      {groups.map(group => (
        <section className="panel search-group" key={group.kind}>
          <div className="panel-head">
            <Text type="text2" weight="bold">
              {group.rows.length === 1 ? SEARCH_HIT_LABELS[group.kind] : SEARCH_HIT_PLURALS[group.kind]}
            </Text>
            <Text type="text3" color="secondary">
              {group.rows.length === 50 ? "first 50" : group.rows.length}
            </Text>
          </div>
          <ul className="search-hits">
            {group.rows.map(hit => (
              <li key={`${hit.kind}-${hit.id}`}>
                {hit.external ? (
                  // A document that lives in SharePoint. It opens where it is — there is
                  // no screen in this app that renders one — with noreferrer noopener,
                  // because that tenant is administered by somebody else and
                  // `window.opener` is a way back into this tab.
                  <a href={hit.href} target="_blank" rel="noreferrer noopener">
                    {hit.title} <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <Link to={hit.href}>{hit.title}</Link>
                )}
                {hit.detail && (
                  <Text type="text3" color="secondary" element="span" className="search-hit-sub">
                    {hit.detail}
                  </Text>
                )}
                {hit.onPreviousAddress && (
                  <span className="record-documents-note">previous address</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </PageShell>
  );
}
