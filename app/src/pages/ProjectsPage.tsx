import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Heading, Text } from "@vibe/core";
import { useStages, useTeams } from "../data/useLookups";
import { useBoardRecords, type BoardProject } from "../data/boardModel";
import { matchedOnPreviousAddress, projectMatchesQuery, useSearch } from "../data/SearchProvider";
import { useBoardParams } from "../data/useBoardParams";
import { savedViewBySlug, stagesInView } from "../data/savedViews";
import { activeFilterCount, projectMatchesFilters, statusOptions } from "../data/filtering";
import { LoadProblem, NoResults, NothingYet, PreviousAddressNote } from "../components/SearchNotices";
import { SavedViewTabs } from "../components/SavedViewTabs";
import { ProjectCard, StatusPill } from "../components/RecordCards";
import { PropertySlots } from "../components/PropertySlots";
import { PROJECT_TYPE_LABELS } from "../data/types";
import { Token } from "../components/Token";
import { Toolbar } from "../components/Toolbar";
import { toOptions } from "../components/Select";
import { NewProjectDialog, SplitProjectDialog } from "../components/CreateDialogs";
import { InlineNewProjectRow } from "../components/InlineNewProjectRow";
import { usePermission } from "../data/PermissionProvider";
import { useRepository } from "../data/DataProvider";
import "../components/ui.css";

/**
 * Projects, and one project in detail.
 *
 * "Group by Project" is deliberately absent from this screen's toolbar — a project
 * cannot be grouped by itself, and offering it would be a control that does nothing.
 * Everything else in the toolbar reads the same as it does on Jobs.
 *
 * Which project is open is the URL — /projects/1042 — so the detail view is a page
 * somebody can link to, and Back returns to the list instead of leaving the app. The
 * toolbar's own state rides in the query string for the same reason.
 *
 * A saved view names a set of *job* stages, so here it keeps the projects that have at
 * least one job in that slice — "Construction" on this screen means the projects with
 * something on site, which is the question somebody filtering to it is asking.
 */
export function ProjectsPage() {
  const { stageNames } = useStages();
  const { teamNames } = useTeams();
  // The inline add row is hidden below `user`, matching the insert policy on `projects`.
  // A control that offers to do what RLS will refuse is worse than no control — this is
  // the app's can() hiding it, and the policy is what actually decides.
  const { can } = usePermission();
  const [creating, setCreating] = useState(false);
  // Bumped after a create so the board re-reads. There is no cache to invalidate.
  const [reload, setReload] = useState(0);
  const refresh = () => setReload(n => n + 1);
  const { projects: all, loading, error } = useBoardRecords(reload);

  // Which project the split dialog is for, and what to pre-fill it with. Held here
  // rather than in ProjectDetail so the New project dialog can hand straight to it.
  const [splitting, setSplitting] = useState<{ id: number; count: number | null; nextLot: number } | null>(null);

  // No grouping control on this screen, so the value is inert — it still has to be given,
  // and "Stage" is the one the toolbar would show if the control were ever turned on.
  const { view, setView, filters, setFilters, saved, setSaved, search } =
    useBoardParams({ view: "Board", grouping: "Stage" });

  const { projectNumber } = useParams();
  const navigate = useNavigate();
  const openOne = (p: BoardProject) =>
    navigate(`/projects/${encodeURIComponent(p.projectNumber)}${search}`);

  const viewStages = useMemo(() => stagesInView(saved, stageNames), [saved, stageNames]);

  /**
   * A saved view names a set of *job* stages, so a project is in view when one of its
   * jobs is. A project with no jobs yet has no position in any pipeline, so it can only
   * appear in the unfiltered view — but it must appear there, or a project created before
   * its lots are added is invisible in the app that just created it.
   */
  const showingEverything = saved.stages.length === 0;
  const inView = useMemo(
    () =>
      all.filter(p =>
        p.jobs.length === 0 ? showingEverything : p.jobs.some(j => viewStages.includes(j.stage))
      ),
    [all, viewStages, showingEverything]
  );

  const open = useMemo(
    () => (projectNumber ? all.find(p => p.projectNumber === projectNumber) ?? null : null),
    [all, projectNumber]
  );

  /**
   * A project stays in the list when one of its *jobs* matches — searching a job number
   * and being told the project does not exist would be nonsense when the job is on it.
   */
  const { terms } = useSearch();
  const rows = useMemo(
    () => inView.filter(p => projectMatchesFilters(p, filters) && projectMatchesQuery(p, terms)),
    [inView, filters, terms]
  );
  const narrowed = terms.length > 0 || activeFilterCount(filters) > 0;
  const noMatches = narrowed && rows.length === 0;
  const stale = matchedOnPreviousAddress(rows.flatMap(p => [p, ...p.jobs]), terms);
  const jobCount = all.reduce((n, p) => n + p.jobs.length, 0);

  const optionsFor = (field: string) => {
    switch (field) {
      case "Stage": return toOptions(viewStages);
      case "Team": return toOptions(teamNames);
      case "Status": return statusOptions();
      default: return [];
    }
  };

  // The split dialog is rendered in both branches. It lives at page level so the New
  // project dialog can hand straight to it, and the detail view returns early — so
  // mounting it only in the list branch means the button on a project opens nothing.
  const splitDialog = (
    <SplitProjectDialog
      show={splitting !== null}
      onClose={() => setSplitting(null)}
      projectId={splitting?.id ?? null}
      suggestedCount={splitting?.count}
      nextLot={splitting?.nextLot}
      onCreated={refresh}
    />
  );

  if (open) {
    return (
      <>
        {splitDialog}
        <ProjectDetail
          project={open}
          onBack={() => navigate(`/projects${search}`)}
          onChanged={refresh}
          onSplit={() =>
            setSplitting({
              id: open.projectId,
              // The proposed count, less what is already there — asking for four when
              // four exist is almost never what somebody means on a second visit.
              count: open.proposedDwellings != null
                ? Math.max(1, open.proposedDwellings - open.jobs.length)
                : null,
              // Counted from the jobs already on the project rather than read from their
              // addresses, which are not wired yet. Pre-filled and editable, not stored.
              nextLot: open.jobs.length + 1
            })
          }
        />
      </>
    );
  }
  /** Same guard as Jobs: only redirect once there is a list to have missed it in. */
  if (projectNumber && all.length > 0) return <Navigate to={`/projects${search}`} replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Projects</Heading>
        <Text type="text2" color="secondary">
          {loading
            ? "Loading…"
            : saved.stages.length === 0
              ? `${all.length} projects · ${jobCount} jobs`
              : `${inView.length} of ${all.length} projects with work in ${saved.label}`}
        </Text>
      </div>

      <SavedViewTabs
        activeSlug={saved.slug}
        onSelect={setSaved}
        hrefFor={slug => (slug === "all" ? "/projects" : `/projects?saved=${slug}`)}
        countFor={slug => {
          if (slug === "all") return all.length;
          const s = stagesInView(savedViewBySlug(slug), stageNames);
          return all.filter(p => p.jobs.length > 0 && p.jobs.some(j => s.includes(j.stage))).length;
        }}
      />

      <Toolbar
        views={["Board", "Table"]}
        view={view}
        onViewChange={setView}
        filters={filters}
        onFiltersChange={setFilters}
        optionsFor={optionsFor}
        count={`Showing ${rows.length} of ${inView.length} projects`}
        actions={<Button size="small" onClick={() => setCreating(true)}>+ New project</Button>}
      />

      <NewProjectDialog
        show={creating}
        onClose={() => setCreating(false)}
        onCreated={refresh}
        onSplit={(id, count) => setSplitting({ id, count, nextLot: 1 })}
      />

      {splitDialog}

      {stale && <PreviousAddressNote />}

      {error && <LoadProblem error={error} />}

      {loading ? (
        <div className="panel"><Text type="text2" color="secondary">Loading…</Text></div>
      ) : all.length === 0 ? (
        <NothingYet
          title="No projects yet"
          description="A project is the parent folder for the jobs on one site. Create one and its jobs sit beneath it."
          // The empty state runs instead of the table, so the inline add row is
          // unreachable here — which is the first screen anybody sees. Saying
          // "create one" and offering nothing to click is the gap this closes.
          action={
            can("user")
              ? <Button size="small" onClick={() => setCreating(true)}>+ New project</Button>
              : undefined
          }
        />
      ) : noMatches ? (
        <NoResults noun="projects" />
      ) : view === "Board" ? (
        <div className="card-grid">
          {rows.map(p => (
            <ProjectCard
              key={p.projectNumber}
              projectNumber={p.projectNumber}
              jobNumbers={p.jobs.map(j => j.jobNumber)}
              address={p.currentAddress}
              projectType={p.projectType}
              targetCompletion={p.targetCompletion}
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
                  <td>{p.currentAddress ?? <Token>project_display.current_address</Token>}</td>
                  {/* Still a token: the suburb is its own column on `addresses` and the
                      board never reads it — only the consolidated line comes through. */}
                  <td><Token>addresses.suburb</Token></td>
                  <td>
                    {p.projectType
                      ? PROJECT_TYPE_LABELS[p.projectType]
                      : <Token>projects.project_type</Token>}
                  </td>
                  <td>
                    {p.targetCompletion
                      ? new Date(p.targetCompletion).toLocaleDateString()
                      : <Token>projects.target_completion</Token>}
                  </td>
                  <td className="num">{p.jobs.length}</td>
                  <td><StatusPill status={p.status} /></td>
                </tr>
              ))}
              {/* The other way in, per Lofty: "both. they can add either way." The
                  toolbar button opens the panel; this is for when you are already
                  looking at the list and want three more sites in it. */}
              {can("user") && (
                <InlineNewProjectRow columns={7} onCreated={refresh} />
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ProjectDetail({
  project,
  onBack,
  onSplit,
  onChanged
}: {
  project: BoardProject;
  onBack: () => void;
  onSplit: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const repo = useRepository();
  const { can } = usePermission();
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function removeJob(jobNumber: string) {
    setRemoving(jobNumber);
    setRemoveError(null);
    try {
      await repo.deleteJob(jobNumber);
      onChanged();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  }

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
            <div className="panel-actions">
              {project.proposedDwellings != null && (
                <Text type="text3" color="secondary">
                  {project.proposedDwellings} proposed
                  {project.jobs.length !== project.proposedDwellings &&
                    ` · ${project.jobs.length} created`}
                </Text>
              )}
              <Button size="small" onClick={onSplit}>+ Create jobs</Button>
            </div>
          </div>

          {removeError && (
            <div className="create-problem" role="alert">
              <Text type="text2" ellipsis={false}>{removeError}</Text>
            </div>
          )}

          {project.jobs.length === 0 && (
            <Text type="text3" color="secondary" ellipsis={false}>
              No jobs yet. <strong>Create jobs</strong> splits this project into one per lot,
              each with its own lot address.
            </Text>
          )}
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Job</th><th>Address</th><th>Stage</th><th>Team</th><th>Status</th>
                  {/* `admins delete jobs` is the policy. The column is hidden below that
                      level so nobody is offered a button the database will refuse — but
                      the hiding is courtesy, not security: RLS is what actually stops it. */}
                  {can("admin") && <th aria-label="Remove"></th>}
                </tr>
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
                    {can("admin") && (
                      <td onClick={e => e.stopPropagation()}>
                        <Button
                          kind="tertiary"
                          size="small"
                          disabled={removing === j.jobNumber}
                          onClick={() => removeJob(j.jobNumber)}
                        >
                          {removing === j.jobNumber ? "Removing…" : "Remove"}
                        </Button>
                      </td>
                    )}
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
