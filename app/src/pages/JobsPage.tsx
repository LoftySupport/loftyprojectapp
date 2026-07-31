import { useMemo, useState } from "react";
import { Button, Counter, Heading, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import {
  HEALTH_LABELS,
  HEALTH_STATUSES,
  JOB_TYPES,
  PHASE_EXPECTED_DAYS,
  STAGE_NAMES,
  TEAMS
} from "../data/lookups";
import { SHAPE_JOBS, type ShapeJob } from "../data/placeholderShape";
import { JobCard, StatusPill } from "../components/RecordCards";
import { JobDrawer } from "../components/JobDrawer";
import { Token } from "../components/Token";
import { Toolbar, type Grouping, type ToolbarFilter, type View } from "../components/Toolbar";
import { toOptions } from "../components/Select";
import "../components/ui.css";

/**
 * The jobs screen — one dataset, four views, the same toolbar over all of them.
 *
 * Grouping is a property of the view, not of the data, so switching from Board to Table
 * keeps whatever you grouped by. Columns exist before any job does: they come from the
 * stages lookup, which is the business process rather than something a user created.
 */
export function JobsPage() {
  const { data: stages } = useQuery(r => r.listStages(), []);
  const { data: jobs, loading } = useQuery(r => r.listJobs(), []);

  const [view, setView] = useState<View>("Board");
  const [grouping, setGrouping] = useState<Grouping>("Stage");
  const [filters, setFilters] = useState<ToolbarFilter[]>([]);
  const [openJob, setOpenJob] = useState<ShapeJob | null>(null);

  const unbound = !loading && jobs.length === 0;
  const rows = useMemo(() => (unbound ? SHAPE_JOBS : []), [unbound]);

  const optionsFor = (field: string) => {
    switch (field) {
      case "Stage": return toOptions(STAGE_NAMES);
      case "Team": return toOptions(TEAMS);
      case "Status": return HEALTH_STATUSES.map(s => ({ value: s, label: HEALTH_LABELS[s] }));
      case "Type": return toOptions(JOB_TYPES);
      default: return [];
    }
  };

  /** Group keys in a deterministic order — pipeline order for stages, else as listed. */
  const groups = useMemo(() => {
    const keyOf = (j: ShapeJob) =>
      grouping === "Stage" ? j.stage
      : grouping === "Project" ? j.projectNumber
      : grouping === "Team" ? j.team
      : grouping === "Status" ? HEALTH_LABELS[j.status]
      : "{{profiles.full_name}}";

    const order: string[] =
      grouping === "Stage" ? STAGE_NAMES
      : grouping === "Team" ? TEAMS
      : grouping === "Status" ? HEALTH_STATUSES.map(s => HEALTH_LABELS[s])
      : [...new Set(rows.map(keyOf))];

    return order.map(key => ({ key, jobs: rows.filter(j => keyOf(j) === key) }));
  }, [grouping, rows]);

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Jobs</Heading>
        <Text type="text2" color="secondary">
          {loading
            ? "Loading…"
            : `${rows.length} job${rows.length === 1 ? "" : "s"} across ${stages.length} stages`}
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
        count={`Showing ${rows.length} of ${rows.length} jobs`}
        actions={<Button size="small">+ New job</Button>}
      />

      {view === "Board" && (
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
                    onOpen={() => setOpenJob(j)}
                  />
                ))
              )}
            </section>
          ))}
        </div>
      )}

      {view === "Table" && (
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
                <tr key={j.jobNumber} onClick={() => setOpenJob(j)}>
                  <td>{j.jobNumber}</td>
                  <td>{j.projectNumber}</td>
                  <td><Token>addresses.consolidated_address</Token></td>
                  <td><Token>jobs.type</Token></td>
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

      {view === "Gantt" && (
        <div className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Time in stage against the template</Text>
            <Text type="text3" color="secondary">Expected days come from template_phases</Text>
          </div>
          {rows.map(j => {
            const expected = PHASE_EXPECTED_DAYS[j.stage] ?? 14;
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

      {view === "Calendar" && (
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

      {openJob && <JobDrawer job={openJob} onClose={() => setOpenJob(null)} />}
    </>
  );
}
