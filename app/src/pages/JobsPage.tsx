import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Counter, Heading, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { RECORD_STATUS_LABELS, RECORD_STATUSES, PROJECT_TYPES } from "../data/types";
import { useStages, useTeams, useTemplatePhases } from "../data/useLookups";
import { usePlaceholderShape, type ShapeJob } from "../data/placeholderShape";
import { jobMatchesQuery, matchedOnPreviousAddress, useSearch } from "../data/SearchProvider";
import { NoResults, PreviousAddressNote } from "../components/SearchNotices";
import { JobCard, StatusPill } from "../components/RecordCards";
import { JobDrawer } from "../components/JobDrawer";
import { Token } from "../components/Token";
import { Toolbar, type Grouping, type ToolbarFilter, type View } from "../components/Toolbar";
import { toOptions } from "../components/Select";
import { NewJobDialog } from "../components/CreateDialogs";
import "../components/ui.css";

/**
 * The jobs screen — one dataset, four views, the same toolbar over all of them.
 *
 * Grouping is a property of the view, not of the data, so switching from Board to Table
 * keeps whatever you grouped by. Columns exist before any job does: they come from the
 * stages lookup, which is the business process rather than something a user created.
 *
 * Which job is open is the URL — /jobs/PRJ-001-02 — rather than component state. The view
 * and the grouping are not, deliberately: they are how *you* are looking at the board, and
 * putting them in the path would make every shared link impose the sender's layout.
 */
export function JobsPage() {
  const { stages, stageNames } = useStages();
  const { teamNames } = useTeams();
  const { expectedDaysByStage } = useTemplatePhases();
  const shape = usePlaceholderShape();
  const { data: jobs, loading } = useQuery(r => r.listJobs(), []);
  // The job dialog needs somewhere to put the job — a job cannot exist without a
  // project, so the picker reads the real list rather than the placeholder shape.
  const { data: realProjects } = useQuery(r => r.listProjects(), []);

  const [view, setView] = useState<View>("Board");
  const [grouping, setGrouping] = useState<Grouping>("Stage");
  const [filters, setFilters] = useState<ToolbarFilter[]>([]);
  const [creating, setCreating] = useState(false);

  const { jobNumber } = useParams();
  const navigate = useNavigate();
  const openOne = (j: ShapeJob) => navigate(`/jobs/${encodeURIComponent(j.jobNumber)}`);

  const unbound = !loading && jobs.length === 0;
  const all = useMemo(() => (unbound ? shape.jobs : []), [unbound, shape]);

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
  const rows = useMemo(() => all.filter(j => jobMatchesQuery(j, terms)), [all, terms]);
  /** Only a *search* that found nothing gets the empty state — an unbound board with no
   *  placeholder rows is a different situation and already reads correctly. */
  const noMatches = terms.length > 0 && rows.length === 0;
  const stale = matchedOnPreviousAddress(rows, terms);

  const optionsFor = (field: string) => {
    switch (field) {
      case "Stage": return toOptions(stageNames);
      case "Team": return toOptions(teamNames);
      case "Status": return RECORD_STATUSES.map(s => ({ value: s, label: RECORD_STATUS_LABELS[s] }));
      case "Type": return toOptions(PROJECT_TYPES);
      default: return [];
    }
  };

  /** Group keys in a deterministic order — pipeline order for stages, else as listed. */
  const groups = useMemo(() => {
    const keyOf = (j: ShapeJob) =>
      grouping === "Stage" ? j.stage
      : grouping === "Project" ? j.projectNumber
      : grouping === "Team" ? j.team
      : grouping === "Status" ? RECORD_STATUS_LABELS[j.status]
      : "{{profiles.full_name}}";

    const order: string[] =
      grouping === "Stage" ? stageNames
      : grouping === "Team" ? teamNames
      : grouping === "Status" ? RECORD_STATUSES.map(s => RECORD_STATUS_LABELS[s])
      : [...new Set(rows.map(keyOf))];

    return order.map(key => ({ key, jobs: rows.filter(j => keyOf(j) === key) }));
  }, [grouping, rows, stageNames, teamNames]);

  /**
   * A number nobody recognises goes back to the board, so a stale link is a board rather
   * than a dead end. Guarded on `all.length` on purpose: the list is empty both while the
   * lookups load and when the app is bound to real data with no placeholder shape, and
   * redirecting then would throw away a perfectly good link before it could resolve.
   */
  if (jobNumber && !openJob && all.length > 0) return <Navigate to="/jobs" replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Jobs</Heading>
        <Text type="text2" color="secondary">
          {loading
            ? "Loading…"
            : `${all.length} job${all.length === 1 ? "" : "s"} across ${stages.length} stages`}
        </Text>
      </div>

      <Toolbar
        view={view}
        onViewChange={setView}
        groupings={["Stage", "Project", "Team", "Team member", "Status"]}
        grouping={grouping}
        onGroupingChange={setGrouping}
        filters={filters}
        onFiltersChange={setFilters}
        optionsFor={optionsFor}
        count={`Showing ${rows.length} of ${all.length} jobs`}
        actions={<Button size="small" onClick={() => setCreating(true)}>+ New job</Button>}
      />

      <NewJobDialog
        show={creating}
        onClose={() => setCreating(false)}
        projects={realProjects.map(p => ({ id: p.id, label: String(p.projectNo) }))}
      />

      {stale && <PreviousAddressNote />}

      {noMatches && <NoResults noun="jobs" />}

      {view === "Board" && !noMatches && (
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
                    status={j.status}
                    onOpen={() => openOne(j)}
                  />
                ))
              )}
            </section>
          ))}
        </div>
      )}

      {view === "Table" && !noMatches && (
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
                <th className="num">Days in stage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(j => (
                <tr key={j.jobNumber} onClick={() => openOne(j)}>
                  <td>{j.jobNumber}</td>
                  <td>{j.projectNumber}</td>
                  <td><Token>addresses.consolidated_address</Token></td>
                  <td><Token>job_display.project_type</Token></td>
                  <td>{j.stage}</td>
                  <td>{j.team}</td>
                  <td><Token>profiles.full_name</Token></td>
                  <td className="num">{j.daysInStage}</td>
                  <td><StatusPill status={j.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === "Gantt" && !noMatches && (
        <div className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Time in stage against the template</Text>
            <Text type="text3" color="secondary">Expected days come from template_phases</Text>
          </div>
          {rows.map(j => {
            const expected = expectedDaysByStage[j.stage] ?? 14;
            const pct = Math.min(100, Math.round((j.daysInStage / expected) * 100));
            return (
              <div className="bar-row" key={j.jobNumber}>
                <Text type="text3">{j.jobNumber} · {j.stage}</Text>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${pct}%` }} />
                </div>
                <span className="bar-num">{j.daysInStage}/{expected}d</span>
              </div>
            );
          })}
        </div>
      )}

      {view === "Calendar" && !noMatches && (
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

      {openJob && <JobDrawer job={openJob} onClose={() => navigate("/jobs")} />}
    </>
  );
}
