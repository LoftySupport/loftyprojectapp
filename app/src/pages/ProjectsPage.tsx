import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Heading, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { RECORD_STATUS_LABELS, RECORD_STATUSES, PROJECT_TYPES } from "../data/types";
import { useStages, useTeams } from "../data/useLookups";
import { usePlaceholderShape, type ShapeProject } from "../data/placeholderShape";
import { matchedOnPreviousAddress, projectMatchesQuery, useSearch } from "../data/SearchProvider";
import { NoResults, PreviousAddressNote } from "../components/SearchNotices";
import { ProjectCard, StatusPill } from "../components/RecordCards";
import { PropertySlots } from "../components/PropertySlots";
import { Token } from "../components/Token";
import { Toolbar, type ToolbarFilter, type View } from "../components/Toolbar";
import { toOptions } from "../components/Select";
import { NewProjectDialog } from "../components/CreateDialogs";
import "../components/ui.css";

/**
 * Projects, and one project in detail.
 *
 * "Group by Project" is deliberately absent from this screen's toolbar — a project
 * cannot be grouped by itself, and offering it would be a control that does nothing.
 * Everything else in the toolbar reads the same as it does on Jobs.
 *
 * Which project is open is the URL — /projects/PRJ-001 — so the detail view is a page
 * somebody can link to, and Back returns to the list instead of leaving the app.
 */
export function ProjectsPage() {
  const { stageNames } = useStages();
  const { teamNames } = useTeams();
  const shape = usePlaceholderShape();
  const { data: projects, loading } = useQuery(r => r.listProjects(), []);
  const [view, setView] = useState<View>("Board");
  const [filters, setFilters] = useState<ToolbarFilter[]>([]);
  const [creating, setCreating] = useState(false);

  const { projectNumber } = useParams();
  const navigate = useNavigate();
  const openOne = (p: ShapeProject) => navigate(`/projects/${encodeURIComponent(p.projectNumber)}`);

  const unbound = !loading && projects.length === 0;
  const all = useMemo(() => (unbound ? shape.projects : []), [unbound, shape]);

  const open = useMemo(
    () => (projectNumber ? all.find(p => p.projectNumber === projectNumber) ?? null : null),
    [all, projectNumber]
  );

  /**
   * A project stays in the list when one of its *jobs* matches — searching a job number
   * and being told the project does not exist would be nonsense when the job is on it.
   */
  const { terms } = useSearch();
  const rows = useMemo(() => all.filter(p => projectMatchesQuery(p, terms)), [all, terms]);
  const noMatches = terms.length > 0 && rows.length === 0;
  const stale = matchedOnPreviousAddress(rows.flatMap(p => [p, ...p.jobs]), terms);
  const jobCount = all.reduce((n, p) => n + p.jobs.length, 0);

  const optionsFor = (field: string) => {
    switch (field) {
      case "Stage": return toOptions(stageNames);
      case "Team": return toOptions(teamNames);
      case "Status": return RECORD_STATUSES.map(s => ({ value: s, label: RECORD_STATUS_LABELS[s] }));
      case "Type": return toOptions(PROJECT_TYPES);
      default: return [];
    }
  };

  if (open) return <ProjectDetail project={open} onBack={() => navigate("/projects")} />;
  /** Same guard as Jobs: only redirect once there is a list to have missed it in. */
  if (projectNumber && all.length > 0) return <Navigate to="/projects" replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Projects</Heading>
        <Text type="text2" color="secondary">
          {loading ? "Loading…" : `${all.length} projects · ${jobCount} jobs`}
        </Text>
      </div>

      <Toolbar
        views={["Board", "Table"]}
        view={view}
        onViewChange={setView}
        filters={filters}
        onFiltersChange={setFilters}
        optionsFor={optionsFor}
        count={`Showing ${rows.length} of ${all.length} projects`}
        actions={<Button size="small" onClick={() => setCreating(true)}>+ New project</Button>}
      />

      <NewProjectDialog show={creating} onClose={() => setCreating(false)} />

      {stale && <PreviousAddressNote />}

      {noMatches ? (
        <NoResults noun="projects" />
      ) : view === "Board" ? (
        <div className="card-grid">
          {rows.map(p => (
            <ProjectCard
              key={p.projectNumber}
              projectNumber={p.projectNumber}
              jobNumbers={p.jobs.map(j => j.jobNumber)}
              status={p.status}
              onOpen={() => openOne(p)}
            />
          ))}
        </div>
      ) : (
        <div className="panel data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th><th>Address</th><th>Suburb</th><th>Type</th>
                <th>Target completion</th><th className="num">Jobs</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.projectNumber} onClick={() => openOne(p)}>
                  <td>{p.projectNumber}</td>
                  <td><Token>project_display.current_address</Token></td>
                  <td><Token>addresses.suburb</Token></td>
                  <td><Token>projects.project_type</Token></td>
                  <td><Token>projects.target_completion</Token></td>
                  <td className="num">{p.jobs.length}</td>
                  <td><StatusPill status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ProjectDetail({ project, onBack }: { project: ShapeProject; onBack: () => void }) {
  const navigate = useNavigate();

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <Button kind="tertiary" size="small" onClick={onBack}>← Projects</Button>
          <Heading type="h2" weight="bold"><Token>project_display.current_address</Token></Heading>
          <Text type="text2" color="secondary">
            Project {project.projectNumber} · {project.jobs.length} jobs
          </Text>
        </div>
        <StatusPill status={project.status} />
      </div>

      <div className="stack">
        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Project properties</Text>
          </div>
          <div className="field-row">
            <div className="field-label">
              <Text type="text2">Project number</Text>
              <div className="field-hint">immutable once assigned</div>
            </div>
            <Text type="text2" weight="medium">{project.projectNumber}</Text>
          </div>
          {[
            /* The simplified `projects`: a number, two addresses, a type, a status and
               three dates. Client, notes and the rest are property definitions now — they
               render in the slot list below rather than as columns here. */
            ["Current address", "project_display.current_address"],
            ["Original address", "project_display.original_address"],
            ["Suburb", "addresses.suburb"],
            ["Council region", "addresses.council"],
            ["Type", "projects.project_type"],
            ["Start date", "projects.start_date"],
            ["Target completion", "projects.target_completion"],
            ["End date", "projects.end_date"]
          ].map(([label, token]) => (
            <div className="field-row" key={label}>
              <div className="field-label"><Text type="text2">{label}</Text></div>
              <Token>{token}</Token>
            </div>
          ))}
        </section>

        {/* Project-level fields, in the stage that captures each one. */}
        <PropertySlots scope="project" />

        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Jobs on this project ({project.jobs.length})</Text>
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Job</th><th>Address</th><th>Stage</th><th>Team</th><th>Status</th></tr>
              </thead>
              <tbody>
                {project.jobs.map(j => (
                  // Now that a job has an address of its own, this list is a set of links
                  // rather than a printout — same click as a row on the Jobs table.
                  <tr
                    key={j.jobNumber}
                    onClick={() => navigate(`/jobs/${encodeURIComponent(j.jobNumber)}`)}
                  >
                    <td>{j.jobNumber}</td>
                    <td><Token>addresses.consolidated_address</Token></td>
                    <td>{j.stage}</td>
                    <td>{j.team}</td>
                    <td><StatusPill status={j.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
