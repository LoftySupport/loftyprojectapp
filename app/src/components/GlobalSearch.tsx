import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Text, TextField } from "@vibe/core";
import { useRepository } from "../data/DataProvider";
import { useSearch } from "../data/SearchProvider";
import { SEARCH_HIT_LABELS, type SearchHit } from "../data/types";
import "./ui.css";

/**
 * The header's search box, and the list of matches under it.
 *
 * Amber, 10 September: *"when doing a search in the top nav bar, It needs to have search
 * result page or have a drop down to show matches as I search so if I am in the projects
 * page or docs page and searching for eg 'brodie' which is a job site, i need to be able
 * to see the matched answers and click on them and go to it from any page"*.
 *
 * BOTH BEHAVIOURS, NOT ONE INSTEAD OF THE OTHER, and this is the decision worth reading.
 *
 *   Until now the box was purely a filter on the view you were looking at — type on the
 *   board and the board narrows. That is genuinely useful and the prototype's own
 *   behaviour, so it is kept: `setQuery` still fires on every keystroke and every screen
 *   that reads `useSearch()` still narrows exactly as it did.
 *
 *   What it could not do is leave the page you are on. On Projects, "brodie" narrowed 117
 *   projects to none — because Brodie Court is a JOB — and the screen said "no projects
 *   match", which is true and useless. The dropdown is the other half: the same query,
 *   asked of the whole app, offered as somewhere to go.
 *
 *   Replacing the filter with the dropdown was the alternative and it is worse: filtering
 *   the table you are reading is the commoner act by a long way, and it would have gone
 *   to pay for the rarer one.
 *
 * WHY A DROPDOWN AND A PAGE. The dropdown answers "take me there" in one keystroke and a
 * click, which is the ask. It shows the first few of each kind, so it cannot answer "how
 * many" or "show me all the jobs in Wandi" — pressing Enter goes to `/search`, which can.
 *
 * WHAT IT SEARCHES lives in `repository.search()`, deliberately, not here: six kinds, each
 * under the caller's own RLS, with every term required to appear. A component that built
 * its own queries would be the seventh place that decides what "matches" means.
 */
export function GlobalSearch() {
  const { query, setQuery } = useSearch();
  const repo = useRepository();
  const navigate = useNavigate();
  const location = useLocation();
  const listId = useId();

  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Which row the keyboard is on. -1 is "the input", not "the first row". */
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLSpanElement>(null);

  /**
   * Debounced, because this is six queries and it fires on every keystroke.
   *
   * 250ms: below about 200 a fast typist still sends a request per letter, and above
   * about 350 the list visibly lags the box. The floor of two characters is in the
   * repository rather than here, so the page and the dropdown cannot disagree about when
   * a query is worth asking.
   */
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setProblem(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    const t = setTimeout(() => {
      repo.search(q, { limit: 4 })
        .then(found => {
          if (cancelled) return;
          setHits(found);
          setProblem(null);
          setBusy(false);
          setActive(-1);
        })
        .catch(e => {
          if (cancelled) return;
          // Said, not swallowed. A search that quietly returns nothing when the request
          // failed is indistinguishable from one that found nothing, and the difference
          // is whether somebody goes looking for a record that is actually there.
          setProblem(e instanceof Error ? e.message : String(e));
          setHits([]);
          setBusy(false);
        });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, repo]);

  // Navigating closes it. Clicking a result routes, and a list of matches left hanging
  // over the page you just arrived at is the commonest way this kind of control feels
  // broken.
  useEffect(() => { setOpen(false); }, [location.key]);

  // Clicking anywhere else closes it. `pointerdown` rather than `click`: a click on a
  // result fires after its own mousedown, and closing on `click` would unmount the row
  // before the browser delivered the event to it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const go = useCallback((hit: SearchHit) => {
    setOpen(false);
    if (hit.external) {
      // A document that lives in SharePoint. New tab, and noopener explicitly — this is
      // the scripted equivalent of rel="noreferrer noopener" on an anchor, and without it
      // the opened page gets a handle back into this one.
      window.open(hit.href, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(hit.href);
  }, [navigate]);

  const seeAll = useCallback(() => {
    setOpen(false);
    navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  }, [navigate, query]);

  /**
   * Grouped for the eye, flat for the keyboard.
   *
   * The list renders under a heading per kind, which is what makes "a job, not a project"
   * readable at a glance. Arrow keys have to walk it as one sequence regardless, so the
   * flat order is derived from the grouped one rather than kept beside it — two lists
   * that had to agree would drift the first time a kind was added.
   */
  const groups = useMemo(() => {
    const order: SearchHit["kind"][] = ["job", "project", "contact", "company", "maintenance", "document"];
    return order
      .map(kind => ({ kind, rows: hits.filter(h => h.kind === kind) }))
      .filter(g => g.rows.length > 0);
  }, [hits]);
  const flat = useMemo(() => groups.flatMap(g => g.rows), [groups]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // First Escape closes the list, second clears the box. Clearing on the first would
      // take the filter off the page underneath as a side effect of dismissing a dropdown
      // somebody was only trying to get out of the way.
      if (open) { setOpen(false); e.stopPropagation(); }
      else if (query) setQuery("");
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!flat.length) return;
      e.preventDefault();
      setOpen(true);
      setActive(i => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        // Wraps, and -1 is a real position: arrowing up off the top returns to the input
        // so the whole query can be edited without reaching for the mouse.
        if (next >= flat.length) return -1;
        if (next < -1) return flat.length - 1;
        return next;
      });
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && flat[active]) go(flat[active]);
      else if (query.trim().length >= 2) seeAll();
    }
  };

  const showList = open && query.trim().length >= 2;

  return (
    <span className="app-search" ref={boxRef}>
      {/* `inputAriaLabel`, not `aria-label` — Vibe's TextField writes its own aria-label
          from the placeholder and drops anything passed through, so a plain aria-label
          here is silently ignored. An explicit id too: without one every TextField on the
          page renders id="input". */}
      <TextField
        id="app-search"
        type="search"
        // "Search or jump to", from the 11 September handoff: the box is in the rail now,
        // and the dropdown does jump to a record, so the longer placeholder is the true one.
        placeholder="Search or jump to"
        value={query}
        onChange={v => { setQuery(v); setOpen(true); }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        size="small"
        inputAriaLabel="Search jobs, projects, people and documents"
        autoComplete="off"
        // Vibe's own combobox hooks rather than raw ARIA: `searchResultsContainerId`
        // becomes aria-owns and turns the input's role into combobox, `activeDescendant`
        // becomes aria-activedescendant. Passing `role`, `aria-expanded` or
        // `aria-controls` here does nothing — TextField destructures the props it knows
        // and drops the rest, which is the same trap `inputAriaLabel` exists for.
        searchResultsContainerId={showList ? listId : ""}
        activeDescendant={active >= 0 ? `${listId}-${active}` : ""}
      />

      {/* TextField exposes no `aria-expanded`, so the count is announced instead — which
          is the more useful half anyway: "4 matches" tells somebody whether to keep typing,
          where "expanded" only tells them something appeared. Polite, so it waits for a
          gap rather than interrupting every keystroke. */}
      <span className="sr-only" role="status" aria-live="polite">
        {showList && !busy && !problem
          ? flat.length === 0
            ? "No matches"
            : `${flat.length} ${flat.length === 1 ? "match" : "matches"}`
          : ""}
      </span>

      {showList && (
        <div className="app-search-pop" id={listId} role="listbox" aria-label="Search results">
          {problem ? (
            <div className="app-search-msg" role="alert">
              <Text type="text3" color="secondary" ellipsis={false}>
                Search is not answering: {problem}
              </Text>
            </div>
          ) : flat.length === 0 ? (
            <div className="app-search-msg">
              <Text type="text3" color="secondary" ellipsis={false}>
                {busy
                  ? "Searching…"
                  : `Nothing matches “${query.trim()}”. Jobs and projects also match on the address they used to have.`}
              </Text>
            </div>
          ) : (
            <>
              {groups.map(group => (
                <div key={group.kind} className="app-search-group">
                  <div className="app-search-group-head" aria-hidden="true">
                    {SEARCH_HIT_LABELS[group.kind]}
                  </div>
                  {group.rows.map(hit => {
                    const index = flat.indexOf(hit);
                    return (
                      <button
                        key={`${hit.kind}-${hit.id}`}
                        id={`${listId}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={index === active}
                        className={"app-search-row" + (index === active ? " is-active" : "")}
                        // Pointer, not hover: moving the mouse across the list on the way
                        // to somewhere else should not silently change what Enter does.
                        onPointerMove={() => setActive(index)}
                        onClick={() => go(hit)}
                      >
                        <span className="app-search-row-main">
                          {/* The kind is repeated for a screen reader because the visual
                              heading above is aria-hidden — a listbox may only contain
                              options, so the group headings cannot be labels. */}
                          <span className="sr-only">{SEARCH_HIT_LABELS[hit.kind]}: </span>
                          {hit.title}
                          {hit.external && <span className="app-search-ext" aria-hidden="true"> ↗</span>}
                        </span>
                        {hit.detail && <span className="app-search-row-sub">{hit.detail}</span>}
                        {/* Worth saying rather than swallowing: a hit on an address the
                            record no longer uses means whoever searched is working from
                            something out of date — an old email, a contract, a note. */}
                        {hit.onPreviousAddress && (
                          <span className="app-search-row-sub">matched a previous address</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
              <button type="button" className="app-search-all" onClick={seeAll}>
                <Text type="text3" element="span">
                  See all results for “{query.trim()}”
                </Text>
              </button>
            </>
          )}
        </div>
      )}
    </span>
  );
}
