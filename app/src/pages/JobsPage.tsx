import { useMemo } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Counter, Heading, Text } from "@vibe/core";
import { PROJECT_TYPE_LABELS, RECORD_STATUS_LABELS, RECORD_STATUSES } from "../data/types";
import { useStages, useTeams, useTemplatePhases } from "../data/useLookups";
import { useBoardRecords, type BoardJob } from "../data/boardModel";
import { jobMatchesQuery, matchedOnPreviousAddress, useSearch } from "../data/SearchProvider";
import { useBoardParams } from "../data/useBoardParams";
import { savedViewBySlug, stagesInView } from "../data/savedViews";
import { activeFilterCount, jobMatchesFilters, statusOptions } from "../data/filtering";
import { LoadProblem, NoResults, NothingYet, PreviousAddressNote } from "../components/SearchNotices";
import { SavedViewTabs } from "../components/SavedViewTabs";
import { JobCard, StatusPill } from "../components/RecordCards";
import { JobDrawer } from "../components/JobDrawer";
import { Token } from "../components/Token";
import { Toolbar } from "../components/Toolbar";
import { toOptions } from "../components/Select";
import "../components/ui.css";

/**
 * The jobs screen — one dataset, four views, the same toolbar over all of them.
 *
 * Grouping is a property of the view, not of the data, so switching from Board to Table
 * keeps whatever you grouped by. Columns exist before any job does: they come from the
 * stages lookup, which is the business process rather than something a user created.
 *
 * Everything you can see is in the URL. The open job is the path — /jobs/PRJ-001-02 — and
 * the view, grouping, filters and saved view are the query string, so the answer to "show
 * me what you are looking at" is a link rather than a list of instructions.
 */
export function JobsPage() {
  const { stages, stageNames } = useStages();
  const { teamNames } = useTeams();
  const { expectedDaysByStage } = useTemplatePhases();
  // No create state and no project list any more: nothing is created from this page, so
  // there is nothing to re-read after and no picker to feed. Both went with the New job
  // dialog — see the note above the toolbar.
  const { jobs: all, loading, error } = useBoardRecords();

  const {
    view, setView, grouping, setGrouping, filters, setFilters, saved, setSaved, search
  } = useBoardParams({ view: "Board", grouping: "Stage" });

  const { jobNumber } = useParams();
  const navigate = useNavigate();
  // `search` rides along, so closing the drawer puts you back on the board you left
  // rather than on a reset one.
  const openOne = (j: BoardJob) =>
    navigate(`/jobs/${encodeURIComponent(j.jobNumber)}${search}`);

  /** The stages this saved view admits — the board's columns, and its scope. */
  const viewStages = useMemo(() => stagesInView(saved, stageNames), [saved, stageNames]);
  const inView = useMemo(
    () => all.filter(j => viewStages.includes(j.stage)),
    [all, viewStages]
  );

  /**
   * Resolved against `all` rather than `rows`: a job you opened should not vanish because
   * the header search stopped matching it while the drawer was up.
   */
  const openJob = useMemo(
    () => (jobNumber ? all.find(j => j.jobNumber === jobNumber) ?? null : null),
    [all, jobNumber]
  );

  /**
   * The header search narrows the view you are on — it is not a separate results page.
   * Board, Table, Gantt and Calendar all read `rows`, so the query survives switching
   * between them, which is the whole point of putting it in the header.
   */
  const { terms } = useSearch();
  const rows = useMemo(
    () => inView.filter(j => jobMatchesFilters(j, filters) && jobMatchesQuery(j, terms)),
    [inView, filters, terms]
  );
  /** Only a *narrowing* that found nothing gets the empty state — an unbound board with
   *  no placeholder rows is a different situation and already reads correctly. Filters
   *  count alongside the search now that they do something. */
  const narrowed = terms.length > 0 || activeFilterCount(filters) > 0;
  const noMatches = narrowed && rows.length === 0;
  const stale = matchedOnPreviousAddress(rows, terms);

  const optionsFor = (field: string) => {
    switch (field) {
      // The stages this saved view admits, not all eight: offering "Construction" inside
      // the Pre-construction view is offering a choice that returns nothing.
      case "Stage": return toOptions(viewStages);
      case "Team": return toOptions(teamNames);
      case "Status": return statusOptions();
      default: return [];
    }
  };

  /** Group keys in a deterministic order — pipeline order for stages, else as listed. */
  const groups = useMemo(() => {
    const keyOf = (j: BoardJob) =>
      grouping === "Stage" ? j.stage
      : grouping === "Project" ? j.projectNumber
      : grouping === "Team" ? j.team
      : grouping === "Status" ? RECORD_STATUS_LABELS[j.status]
      : "{{profiles.full_name}}";

    const order: string[] =
      grouping === "Stage" ? viewStages
      : grouping === "Team" ? teamNames
      : grouping === "Status" ? RECORD_STATUSES.map(s => RECORD_STATUS_LABELS[s])
      : [...new Set(rows.map(keyOf))];

    return order.map(key => ({ key, jobs: rows.filter(j => keyOf(j) === key) }));
  }, [grouping, rows, viewStages, teamNames]);

  /**
   * A number nobody recognises goes back to the board, so a stale link is a board rather
   * than a dead end. Guarded on `all.length` on purpose: the list is empty both while the
   * lookups load and when the app is bound to real data with no placeholder shape, and
   * redirecting then would throw away a perfectly good link before it could resolve.
   */
  if (jobNumber && !openJob && all.length > 0) return <Navigate to={`/jobs${search}`} replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Jobs</Heading>
        <Text type="text2" color="secondary">
          {loading
            ? "Loading…"
            : saved.stages.length === 0
              ? `${all.length} job${all.length === 1 ? "" : "s"} across ${stages.length} stages`
              : `${inView.length} of ${all.length} jobs · ${saved.label}, ${viewStages.length} of ${stages.length} stages`}
        </Text>
      </div>

      <SavedViewTabs
        activeSlug={saved.slug}
        onSelect={setSaved}
        hrefFor={slug => (slug === "all" ? "/jobs" : `/jobs?saved=${slug}`)}
        countFor={slug =>
          all.filter(j => stagesInView(savedViewBySlug(slug), stageNames).includes(j.stage)).length
        }
      />

      {/* No "+ New job" on this page. Lofty, 23 August: "a new job can only be created
          from the project screen as they must be linked to a project."

          The dialog this button used to open asked which project to put the job on — a
          question with no good answer from a board showing every project at once, and one
          somebody can get wrong. From the project screen the answer is already known, so
          it cannot be. The button navigates rather than disappearing, because "why can I
          not add a job here" is the obvious next thought and this answers it. */}
      <Toolbar
        view={view}
        onViewChange={setView}
        groupings={["Stage", "Project", "Team", "Team member", "Status"]}
        grouping={grouping}
        onGroupingChange={setGrouping}
        filters={filters}
        onFiltersChange={setFilters}
        optionsFor={optionsFor}
        count={`Showing ${rows.length} of ${inView.length} jobs`}
        actions={
          <Button size="small" kind="secondary" onClick={() => navigate("/projects")}>
            Add a job on its project
          </Button>
        }
      />

      {stale && <PreviousAddressNote />}

      {error && <LoadProblem error={error} />}

      {loading && (
        <div className="panel"><Text type="text2" color="secondary">Loading…</Text></div>
      )}

      {!loading && all.length === 0 && (
        <NothingYet
          title="No jobs yet"
          description="A job is one dwelling on a project. Create a project first, then add its jobs — one per lot."
        />
      )}

      {noMatches && <NoResults noun="jobs" />}

      {view === "Board" && !noMatches && !loading && all.length > 0 && (
        <div className="board">
          {groups.map(g => (
            <section className="board-column" key={g.key}>
              <div className="board-column-head">
                <div>
                  <Text type="text3" color="secondary">{grouping}</Text>
                  <Text type="text2" weight="medium">{g.key}</Text>
                </div>
                <Counter count={g.jobs.length} kind="line" />
              </div>

              {g.jobs.length === 0 ? (
                <div className="board-column-empty">
                  <Text type="text3" color="secondary">No jobs</Text>
                </div>
              ) : (
                g.jobs.map(j => (
                  <JobCard
                    key={j.jobNumber}
                    jobNumber={j.jobNumber}
                    stageName={j.stage}
                    team={j.team}
                    address={j.currentAddress}
                    projectType={j.projectType}
                    createdBy={j.createdBy}
                    status={j.status}
                    onOpen={() => openOne(j)}
                  />
                ))
              )}
            </section>
          ))}
        </div>
      )}

      {view === "Table" && !noMatches && !loading && all.length > 0 && (
        <div className="panel data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Project</th>
                <th>Address</th>
                <th>Type</th>
                <th>Stage</th>
                <th>Team</th>
                <th>Assigned to</th>
                <th>Created by</th>
                <th className="num">Days in stage</th>
                <th>Status</th>
              </tr>
            </thead>
            {/* One tbody per group, so the table answers the same "Group by" the board
                does. Empty groups are dropped here where the board keeps them: a column
                with no cards is a place to drag one to, and a heading with no rows under
                it is just a heading. */}
            {groups.filter(g => g.jobs.length > 0).map(g => (
              <tbody key={g.key} className="group">
                <tr className="group-head">
                  <th scope="colgroup" colSpan={10}>
                    <span className="group-name">{g.key}</span>
                    <span className="group-count">
                      {g.jobs.length} job{g.jobs.length === 1 ? "" : "s"}
                    </span>
                  </th>
                </tr>
                {g.jobs.map(j => (
                  <tr key={j.jobNumber} onClick={() => openOne(j)}>
                    <td>{j.jobNumber}</td>
                    <td>{j.projectNumber}</td>
                    <td>{j.currentAddress ?? <Token>addresses.consolidated_address</Token>}</td>
                    <td>
                      {j.projectType
                        ? PROJECT_TYPE_LABELS[j.projectType]
                        : <Token>job_display.project_type</Token>}
                    </td>
                    <td>{j.stage}</td>
                    <td>{j.team}</td>
                    <td><Token>profiles.full_name</Token></td>
                    <td className="muted">{j.createdBy ?? "—"}</td>
                    <td className="num">{j.daysInStage}</td>
                    <td><StatusPill status={j.status} /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {view === "Gantt" && !noMatches && !loading && all.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Time in stage against the template</Text>
            <Text type="text3" color="secondary">
              Expected days come from pipeline_stages
            </Text>
          </div>
          {/* A bar needs something to be a proportion OF. `?? 14` used to supply that,
              which drew every job against an SLA nobody set — and 14 is not a neutral
              default, it is a claim. With no expectation the honest bar is no bar. */}
          {rows.map(j => {
            const expected = expectedDaysByStage[j.stage];
            const pct = expected ? Math.min(100, Math.round((j.daysInStage / expected) * 100)) : 0;
            return (
              <div className="bar-row" key={j.jobNumber}>
                <Text type="text3">{j.jobNumber} · {j.stage}</Text>
                <div className="bar-track">
                  {expected != null && (
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  )}
                </div>
                <span className="bar-num">
                  {expected != null ? `${j.daysInStage}/${expected}d` : `${j.daysInStage}d`}
                </span>
              </div>
            );
          })}
          {Object.keys(expectedDaysByStage).length === 0 && (
            <Text type="text3" color="secondary" ellipsis={false}>
              No stage has an expected duration set, so there is nothing to measure these
              against — only the days each job has been where it is.
            </Text>
          )}
        </div>
      )}

      {view === "Calendar" && !noMatches && !loading && all.length > 0 && (
        <div className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Scheduled dates</Text>
            <Text type="text3" color="secondary">
              Every date here is a property definition of format “date”
            </Text>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Job</th><th>Stage</th><th>Date field</th><th>Value</th></tr>
              </thead>
              <tbody>
                {rows.map(j => (
                  <tr key={j.jobNumber}>
                    <td>{j.jobNumber}</td>
                    <td>{j.stage}</td>
                    <td><Token>property_defs.label</Token></td>
                    <td><Token>property_values.value</Token></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {openJob && <JobDrawer job={openJob} onClose={() => navigate(`/jobs${search}`)} />}
    </>
  );
}
