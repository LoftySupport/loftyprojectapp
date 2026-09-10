import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Heading, Text, TextField } from "@vibe/core";
import { useProcesses, usePropertyAccess, usePropertyDefs, usePropertyOptions, useStages, useTeams } from "../data/useLookups";
import { propertyColumnDefs } from "../data/propertyColumns";
import { useAuth } from "../data/AuthProvider";
import { useBoardRecords, type BoardProject } from "../data/boardModel";
import {
  jobMatchesQuery, matchedOnPreviousAddress, projectMatchesQuery, useSearch
} from "../data/SearchProvider";
import { useBoardParams } from "../data/useBoardParams";
import { NOTHING_RECORDED, pipelineColumns, processColumnOf } from "../data/pipelinePosition";
import { PROJECT_VIEWS, savedViewBySlug, stagesInView, type SavedView } from "../data/savedViews";
import { PROCESS_HEALTH_FILTER_OPTIONS, RECORDED_FILTER_OPTIONS, activeFilterCount, projectMatchesFilters, statusOptions } from "../data/filtering";
import { LoadProblem, NoResults, NothingYet, PreviousAddressNote } from "../components/SearchNotices";
import { SavedViewTabs } from "../components/SavedViewTabs";
import { useSavedViews } from "../data/useSavedViews";
import { Board } from "../components/Board";
import { ProjectCard, StatusPill } from "../components/RecordCards";
import { PropertySlots } from "../components/PropertySlots";
import { ProcessesPanel } from "../components/ProcessesPanel";
import { RecordDocuments } from "../components/RecordDocuments";
import { PushToJobs } from "../components/PushToJobs";
import {
  PROJECT_TYPES, PROJECT_TYPE_LABELS, RECORD_STATUSES, RECORD_STATUS_LABELS, teamName,
  type StageName, type TeamId
} from "../data/types";
import { sortRows, type SortState } from "../components/SortableTable";
import {
  ColumnHeaders, ColumnPicker, exportFields, useColumnLayout, type ColumnDef
} from "../components/TableColumns";
import { ExportMenu } from "../components/ExportMenu";
import { tableFromFields, type ExportDocument } from "../data/export";
import { MoveStageControl, PROJECT_MOVE_NOTE } from "../components/MoveStageDialog";
import { daysSince } from "../data/boardModel";
import { Token, token } from "../components/Token";
import { SidePanel } from "../components/SidePanel";
import { Toolbar } from "../components/Toolbar";
import { accentStyle, columnAccent } from "../theme/accents";
import { Select, toOptions } from "../components/Select";
import { PersonSelect } from "../components/PersonSelect";
import { NewProjectDialog, SplitProjectDialog } from "../components/CreateDialogs";
import { InlineNewProjectRow } from "../components/InlineNewProjectRow";
import { ProjectsGantt } from "../components/ProjectsGantt";
import { ActivityFeed } from "../components/ActivityFeed";
import { CommentsPanel } from "../components/CommentsPanel";
import { TasksPanel } from "../components/TasksPanel";
import { PartiesPanel } from "../components/PartiesPanel";
import { StaffRolesPanel } from "../components/StaffRolesPanel";
import { WatchButton } from "../components/WatchButton";
import { useToasts } from "../components/Toasts";
import { AddressFields } from "../components/CreateDialogs";
import { useQuery } from "../data/DataProvider";
import type { NewAddress } from "../data/types";
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

/**
 * Whether a project belongs in a view — the one place the rule lives.
 *
 * It was written twice: once for the list and once, differently, for the number on the
 * tab above it. The tab required `p.jobs.length > 0`, so a project nobody had split was
 * counted out of every view and then shown in all of them; the tab read 3 and opened a
 * list of 4. Two copies of a predicate is how that happens, so there is one.
 *
 * THE TWO CLAUSES
 *
 *   A view names *job* stages, so a project is in it when one of its jobs is. A project
 *   with no jobs is judged by its OWN lifecycle phase (`projects.project_stage`, 0039) —
 *   found by putting projects on a board, where a project created a minute ago was
 *   invisible on the first screen the app shows.
 *
 *   `requires: "no-jobs"` is New Projects (Amber, 31 Aug), and it is the reverse cut: a
 *   project nobody has split yet, at whatever phase. Its stage list is the whole
 *   lifecycle, so the phase test passes and this clause is the whole of the filter.
 */
function projectInView(
  p: { stage: string; jobs: { stage: string }[] },
  view: SavedView,
  viewStages: string[]
): boolean {
  if (view.requires === "no-jobs" && p.jobs.length > 0) return false;
  return p.jobs.length === 0
    ? viewStages.includes(p.stage)
    : p.jobs.some(j => viewStages.includes(j.stage));
}

export function ProjectsPage() {
  const { stageNames } = useStages();
  const { teams, teamNames } = useTeams();
  const { processes } = useProcesses();
  const { propertyDefs } = usePropertyDefs();
  const { access: filterAccess } = usePropertyAccess();
  const { byProperty: optionsByProperty } = usePropertyOptions();
  const { data: pageProfiles } = useQuery(r => r.listProfiles(), []);
  const people = useMemo(() => pageProfiles.map(p => ({ id: p.id, name: p.fullName })), [pageProfiles]);
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
  const [splitting, setSplitting] = useState<
    { id: number; count: number | null; community: number | null; torrens: number | null; nextLot: number }
    | null>(null);

  // Grouping is live on this screen now (Amber, 28 Aug: "i need to see projects in
  // lifecycle stages as well"). It was inert for as long as the projects board was a
  // flat grid of cards — which answered "what sites are there" and not "where is the
  // portfolio up to", the question the jobs board has always been able to answer.
  const { view, setView, grouping, setGrouping, filters, setFilters, saved, setSaved, search } =
    useBoardParams({ view: "Board", grouping: "Stage", views: PROJECT_VIEWS });
  // The teams this person is in — sharing a view offers their own team, and offers
  // nothing at all to somebody in none (0051).
  const { profile: me } = useAuth();
  const myTeams = useMemo(
    () => teams.filter(t => t.isActive && (me?.teams ?? []).includes(t.id)),
    [teams, me]
  );
  // This person's own saved views (0048) — the fourth tab onwards.
  const myViews = useSavedViews("projects");

  const { projectNumber } = useParams();
  const navigate = useNavigate();
  const openOne = (p: BoardProject) =>
    navigate(`/projects/${encodeURIComponent(p.projectNumber)}${search}`);

  const viewStages = useMemo(() => stagesInView(saved, stageNames), [saved, stageNames]);

  const inView = useMemo(
    () => all.filter(p => projectInView(p, saved, viewStages)),
    [all, saved, viewStages]
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

  /**
   * The table's columns — what they are, what they sort on, what each cell shows.
   *
   * The same list the jobs table keeps, for the same reason (Amber, 28 August: columns
   * that sort, drag to reorder, and can be added or removed). Four of these are off
   * until somebody asks for them: the table was eight fixed columns wide and every one
   * added to it costs the address room to be read.
   */
  const projectColumnDefs = useMemo<ColumnDef<BoardProject>[]>(() => [
    // Sorted as a number, exported as text: a project number is an identifier, and a
    // column of them typed as numbers invites a total at the bottom of it.
    { key: "project", label: "Project", fixed: true, className: "nowrap",
      sort: p => Number(p.projectNumber), cell: p => p.projectNumber,
      text: p => p.projectNumber },
    { key: "address", label: "Address", sort: p => p.currentAddress ?? null,
      cell: p => p.currentAddress ?? <Token>project_display.current_address</Token>,
      text: p => p.currentAddress ?? token("project_display.current_address") },
    { key: "suburb", label: "Suburb", sort: p => p.suburb ?? null,
      cell: p => p.suburb ?? <Token>addresses.suburb</Token>,
      text: p => p.suburb ?? token("addresses.suburb") },
    // Pipeline position, not the alphabet — the same call the jobs table makes.
    { key: "stage", label: "Stage",
      sort: p => { const at = viewStages.indexOf(p.stage); return at === -1 ? null : at; },
      cell: p => p.stage, text: p => p.stage },
    { key: "type", label: "Type",
      sort: p => (p.projectType ? PROJECT_TYPE_LABELS[p.projectType] : null),
      cell: p => (p.projectType
        ? PROJECT_TYPE_LABELS[p.projectType]
        : <Token>projects.project_type</Token>),
      text: p => (p.projectType
        ? PROJECT_TYPE_LABELS[p.projectType]
        : token("projects.project_type")) },
    { key: "team", label: "Owning team", offByDefault: true,
      sort: p => (p.owningTeam ? teamName(p.owningTeam) : null),
      cell: p => (p.owningTeam ? teamName(p.owningTeam) : "—"),
      text: p => (p.owningTeam ? teamName(p.owningTeam) : null) },
    { key: "start", label: "Start date", offByDefault: true,
      sort: p => p.startDate ?? null,
      // The date as the screen writes it, not the ISO string underneath: a download is
      // read by a person, and 2026-11-04 in an Australian office is ambiguous in the one
      // direction that matters.
      cell: p => (p.startDate ? new Date(p.startDate).toLocaleDateString() : "—"),
      text: p => (p.startDate ? new Date(p.startDate).toLocaleDateString() : null) },
    // No target date reads "Not set" (Amber, 2 Sep) — the same words the card and the
    // detail use, so a blank never turns into a column token or an "Invalid Date". In a
    // file that "Not set" is an absent value, so it exports as a blank cell rather than
    // as the words, which would read as something somebody typed.
    { key: "target", label: "Target completion", sort: p => p.targetCompletion ?? null,
      cell: p => (p.targetCompletion
        ? new Date(p.targetCompletion).toLocaleDateString()
        : <span className="muted pf-unset">Not set</span>),
      text: p => (p.targetCompletion ? new Date(p.targetCompletion).toLocaleDateString() : null) },
    // Intended lots, and the split between the two kinds of title (0053). Null on both
    // means nobody has said, which is not the same statement as zero — hence the dash
    // rather than "0 / 0".
    { key: "lots", label: "Lots", offByDefault: true, className: "num",
      sort: p => p.proposedDwellings,
      cell: p => (p.proposedDwellings == null ? "—" : p.proposedDwellings),
      text: p => p.proposedDwellings },
    { key: "split", label: "Community / Torrens", offByDefault: true, className: "num",
      sort: p => p.communityTitleLots,
      cell: p => (p.communityTitleLots == null && p.torrensTitleLots == null
        ? "—"
        : `${p.communityTitleLots ?? "—"} / ${p.torrensTitleLots ?? "—"}`),
      // Two numbers in one cell, so it exports as the text it is rather than as a
      // number — and stays right-aligned, which is what `num` is doing on it.
      text: p => (p.communityTitleLots == null && p.torrensTitleLots == null
        ? null
        : `${p.communityTitleLots ?? "—"} / ${p.torrensTitleLots ?? "—"}`) },
    { key: "jobs", label: "Jobs", className: "num",
      sort: p => p.jobs.length, cell: p => p.jobs.length, text: p => p.jobs.length },
    { key: "status", label: "Status", sort: p => RECORD_STATUS_LABELS[p.status],
      cell: p => <StatusPill status={p.status} />, text: p => RECORD_STATUS_LABELS[p.status] },
    // Every project-scope property the reader may see, off until asked for (Amber, 7 Sep).
    ...propertyColumnDefs<BoardProject>({
      defs: propertyDefs, scopes: ["project"], canRead: k => filterAccess(k).canRead,
      optionsByProperty, people
    })
  ], [viewStages, propertyDefs, filterAccess, optionsByProperty, people]);

  const projectLayout = useColumnLayout("projects", projectColumnDefs);

  /** No sort until a header is asked for one — see the jobs table for why. */
  const [projectSort, setProjectSort] = useState<SortState<string> | null>(null);
  const toggleProjectSort = (key: string) =>
    setProjectSort(sort =>
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  const sortedRows = useMemo(() => {
    if (!projectSort) return rows;
    const readers = Object.fromEntries(
      projectColumnDefs.filter(d => d.sort).map(d => [d.key, d.sort!])
    ) as Record<string, (p: BoardProject) => string | number | null>;
    return sortRows(rows, readers, projectSort);
  }, [rows, projectColumnDefs, projectSort]);

  /**
   * The board's columns.
   *
   * Ordered by the lifecycle rather than by what happens to be present, and empty
   * columns are kept: "nothing in Construction" is a fact about the portfolio, and a
   * column that vanishes when it empties makes the pipeline look shorter than it is.
   *
   * A project's own stage, not the worst of its jobs — `projects.project_stage` is a
   * real column that somebody sets (and that 0046 moves with its jobs), so deriving one
   * here would quietly overrule them.
   */
  const projectGroups = useMemo(() => {
    /**
     * WHERE ITS JOBS ARE — a project in several columns at once.
     *
     * Amber, 3 September: *"projects need to be able to have the same dropdown in
     * pipeline view so you can see what projects are in what stage of preconstrujction
     * etc… if jobs are in multijple stages then you show the project card multple times
     * and the jobs split to the different stages"*.
     *
     * This is a DIFFERENT question from the Stage grouping above it, which is why it is a
     * different grouping rather than a redefinition. "Stage" asks where the PROJECT is —
     * `projects.project_stage`, a column somebody sets and that 0046 moves with its jobs.
     * "Job stage" asks where its WORK is, and the honest answer to that is often several
     * places at once: eleven jobs on 1042 can be spread across three phases, and no single
     * column can say so.
     *
     * So a project appears once per column its jobs reach, carrying only the jobs that put
     * it there. Every other grouping on this board still puts a project in exactly one
     * column; these two are the exception, and the card says "4 of 11 jobs here" so a
     * slice is never mistaken for the whole.
     */
    const byJobs = grouping === "Job stage" || grouping === "Job process";
    if (byJobs) {
      const columnOf = (j: BoardProject["jobs"][number]) =>
        grouping === "Job stage" ? j.stage : processColumnOf(j, processes);
      const order = grouping === "Job stage"
        ? viewStages
        : [NOTHING_RECORDED, ...pipelineColumns(processes, viewStages)];

      const seen = new Set(rows.flatMap(p => p.jobs.map(columnOf)));
      // A stray key keeps its jobs rather than dropping them — the same guard the jobs
      // board carries, for the same reason: a column built from a lookup can miss a value
      // the rows actually hold, and losing a job is worse than an unexpected heading.
      const columns = [...order.filter(k => seen.has(k)), ...[...seen].filter(k => !order.includes(k))];

      return columns.map(key => ({
        key,
        projects: rows
          .map(p => ({ ...p, jobs: p.jobs.filter(j => columnOf(j) === key), ofTotal: p.jobs.length }))
          .filter(p => p.jobs.length > 0)
      }));
    }

    const keyOf = (p: BoardProject) =>
      grouping === "None" ? ""
      : grouping === "Type" ? (p.projectType ? PROJECT_TYPE_LABELS[p.projectType] : "No type set")
      : grouping === "Status" ? RECORD_STATUS_LABELS[p.status]
      : p.stage;

    const order: string[] =
      grouping === "None" ? [""]
      // `viewStages`, not every stage there is — the same list the Jobs kanban lays its
      // columns out from (Amber, 31 Aug: "the projects per stage should look like the
      // jobs per stage layout in the kanban board by default"). Reading `stageNames`
      // meant this board ignored the saved view it was sitting in: Current Projects
      // rendered Completed, Closed and Cancelled columns, permanently empty, because
      // `inView` had already filtered those projects out. Two lists, one of which was
      // the whole lifecycle no matter what the tab said.
      : grouping === "Stage" ? viewStages
      : grouping === "Status" ? RECORD_STATUSES.map(st => RECORD_STATUS_LABELS[st])
      : [...new Set(rows.map(keyOf))];

    return order.map(key => ({
      key,
      projects: rows.filter(p => keyOf(p) === key).map(p => ({ ...p, ofTotal: p.jobs.length }))
    }));
  }, [grouping, rows, viewStages, processes]);

  /**
   * The download, built at the click (see `ExportMenu`).
   *
   * IT FOLLOWS THE SCREEN, INCLUDING WHERE THE SCREEN IS INCONSISTENT. The projects
   * table renders one flat list however you have grouped it, while the board and the
   * gantt put each group in its own column — so the table exports one sheet in the sort
   * order on screen, and the other two export a sheet per group. That difference is the
   * app's, not this function's: an export that grouped a table nobody had grouped would
   * be a file that disagrees with the thing it was taken from, which is the one way an
   * export can be worse than no export.
   */
  const buildExport = (): ExportDocument => {
    const fields = exportFields(projectLayout.columns);
    const filtersSet = activeFilterCount(filters);
    const note = [
      `Showing ${rows.length} of ${inView.length} projects`,
      saved.label,
      grouping !== "None" && view !== "Table" ? `grouped by ${grouping.toLowerCase()}` : null,
      filtersSet > 0 ? `${filtersSet} filter${filtersSet === 1 ? "" : "s"} set` : null,
      terms.length > 0 ? `search: ${terms.join(" ")}` : null
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      title: saved.slug === "all" ? "Projects" : `Projects · ${saved.label}`,
      note,
      tables:
        grouping === "None" || view === "Table"
          ? [tableFromFields("Projects", fields, view === "Table" ? sortedRows : rows)]
          : projectGroups
              .filter(g => g.projects.length > 0)
              .map(g => tableFromFields(g.key, fields, g.projects, `${grouping}: ${g.key}`))
    };
  };

  const narrowed = terms.length > 0 || activeFilterCount(filters) > 0;
  const noMatches = narrowed && rows.length === 0;
  const stale = matchedOnPreviousAddress(rows.flatMap(p => [p, ...p.jobs]), terms);
  const jobCount = all.reduce((n, p) => n + p.jobs.length, 0);

  const optionsFor = (field: string) => {
    switch (field) {
      // The project's own phase and its jobs' stages are the same list of names — the
      // one lifecycle — but two different questions; see projectMatchesFilters.
      case "Stage": return toOptions(viewStages);
      case "Job stage": return toOptions(viewStages);
      case "Team": return toOptions(teamNames);
      case "Status": return statusOptions();
      case "Type": return PROJECT_TYPES.map(t => ({ value: t, label: PROJECT_TYPE_LABELS[t] }));
      case "Process": return processes.filter(x => x.isActive).map(x => ({ value: x.key, label: `${x.name} (${x.stageName})` }));
      case "Process health": return PROCESS_HEALTH_FILTER_OPTIONS;
      case "Property": return propertyDefs.filter(d => d.isActive && filterAccess(d.key).canRead).map(d => ({ value: d.key, label: `${d.label} (${d.scope})` }));
      case "Recorded": return RECORDED_FILTER_OPTIONS;
      default: return [];
    }
  };

  // At page level so the New project dialog can hand straight to it. It used to be
  // mounted in two branches, because opening a project returned early and replaced the
  // whole page; the project now opens in a slideout OVER the board, so there is one
  // branch and one mount.
  const splitDialog = (
    <SplitProjectDialog
      show={splitting !== null}
      onClose={() => setSplitting(null)}
      projectId={splitting?.id ?? null}
      suggestedCount={splitting?.count}
      suggestedCommunity={splitting?.community}
      suggestedTorrens={splitting?.torrens}
      nextLot={splitting?.nextLot}
      onCreated={refresh}
    />
  );

  // A project's slideout, built here so the board below stays mounted and readable
  // behind it (Amber, 3 Sep: "ensure all pages open items in the slideout side bar (can
  // expand to full width) and is width adjustable").
  //
  // This USED TO BE AN EARLY RETURN that replaced the whole page with a project view.
  // That made a project the one record in the app that behaved differently from every
  // other: a job at /jobs/1042-01 slides out over its board, and a project at
  // /projects/1042 took the screen. Same shell now, so the same three things come with
  // it — expand to full width, a grab edge that remembers its width, and Escape.
  const projectPanel = open && (
    <SidePanel
      open
      title={open.currentAddress ?? `Project ${open.projectNumber}`}
      onClose={() => navigate(`/projects${search}`)}
    >
      <ProjectDetail
        key={open.projectId}
        project={open}
        onChanged={refresh}
        onSplit={() =>
          setSplitting({
            id: open.projectId,
            // The proposed count, less what is already there — asking for four when
            // four exist is almost never what somebody means on a second visit.
            count: open.proposedDwellings != null
              ? Math.max(1, open.proposedDwellings - open.jobs.length)
              : null,
            // The intended mix, so each row starts as the right kind of lot. Sent
            // whole rather than reduced by what exists: which of the six are already
            // created is not knowable from the counts alone.
            community: open.communityTitleLots,
            torrens: open.torrensTitleLots,
            // Counted from the jobs already on the project rather than read from their
            // addresses, which are not wired yet. Pre-filled and editable, not stored.
            nextLot: open.jobs.length + 1
          })
        }
      />
    </SidePanel>
  );

  /**
   * Same guard as Jobs: only redirect once there is a list to have missed it in.
   *
   * `!open` is load-bearing now. It used to sit after the early return, so reaching it
   * at all meant the number had matched nothing; with the board and the panel rendering
   * together, a found project would otherwise be redirected away from itself.
   */
  if (!open && projectNumber && all.length > 0) return <Navigate to={`/projects${search}`} replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Projects</Heading>
        <Text type="text2" color="secondary">
          {loading
            ? "Loading…"
            // On All Projects the two totals ARE the answer; on any other view the
            // interesting number is how much of the whole it is. The test used to be
            // `saved.stages.length === 0` — "the view names no stages" — which no
            // built-in view has ever satisfied, so the portfolio line never once
            // rendered on the first screen the app shows.
            : saved.slug === "all"
              ? `${all.length} projects · ${jobCount} jobs`
              // The view's name is not repeated here: the tab carrying it is the next
              // thing down the page, bold and with its own count, and "projects with
              // work in All Projects" is what embedding it produced.
              : `${inView.length} of ${all.length} projects`}
        </Text>
      </div>

      <SavedViewTabs
        views={PROJECT_VIEWS}
        activeSlug={saved.slug}
        onSelect={setSaved}
        hrefFor={slug => (slug === "all" ? "/projects" : `/projects?saved=${slug}`)}
        countFor={slug => {
          // The same test `inView` applies, through the same function. It used to be a
          // near-copy — `p.jobs.length > 0 && p.jobs.some(…)` — which counted a project
          // with no jobs out of every view while the list below let it in on its own
          // stage. The tab said 3 and opened a list of 4, and the number under a tab is
          // the one thing on this row somebody checks their work against.
          const v = savedViewBySlug(slug, PROJECT_VIEWS);
          const s = stagesInView(v, stageNames);
          return all.filter(p => projectInView(p, v, s)).length;
        }}
        userViews={myViews.views}
        currentQuery={search}
        basePath="/projects"
        onOpenView={v => navigate(`/projects${v.query ? `?${v.query}` : ""}`, { replace: true })}
        onSaveView={name => myViews.save(name, search.replace(/^\?/, ""))}
        onDeleteView={v => { void myViews.remove(v.id); }}
        onShareView={(v, team) => { void myViews.share(v.id, team); }}
        shareTeams={myTeams}
        teamLabel={id => teams.find(t => t.id === id)?.name ?? id}
        saveProblem={myViews.problem}
        saveBusy={myViews.busy}
      />

      <Toolbar
        views={["Board", "Table", "Gantt"]}
        view={view}
        onViewChange={setView}
        groupings={["None", "Stage", "Job stage", "Job process", "Type", "Status"]}
        grouping={grouping}
        onGroupingChange={setGrouping}
        filters={filters}
        onFiltersChange={setFilters}
        optionsFor={optionsFor}
        /* The same fields as Group by (Amber, 7 Sep): the project's phase, its jobs'
           stages, its type and its status. "Job process" groups; Process filters. */
        primary={["Stage", "Job stage", "Type", "Status"]}
        advanced={["Number", "Team", "Process", "Date", "Process health", "Property", "Recorded"]}
        count={`Showing ${rows.length} of ${inView.length} projects`}
        actions={
          <>
            {/* Only where there are columns to configure. */}
            {view === "Table" && (
              <ColumnPicker
                title="Columns on the projects table"
                all={projectLayout.all}
                hidden={projectLayout.hidden}
                onToggle={projectLayout.toggle}
                onMoveBy={projectLayout.moveBy}
                onReset={projectLayout.reset}
                isDefault={projectLayout.isDefault}
              />
            )}
            {/* On every view — a board is a set of projects arranged for reading, and
                "the projects I am looking at, as a spreadsheet" is the same ask
                whichever arrangement is on screen. */}
            <ExportMenu build={buildExport} disabled={loading || rows.length === 0} />
            <Button size="small" onClick={() => setCreating(true)}>+ New project</Button>
          </>
        }
      />

      <NewProjectDialog
        show={creating}
        onClose={() => setCreating(false)}
        onCreated={refresh}
        onSplit={(id, count, community, torrens) =>
          setSplitting({ id, count, community, torrens, nextLot: 1 })}
      />

      {/* Over the board, the way the job drawer is — the board stays mounted behind it. */}
      {projectPanel}
      {/* AFTER the project's panel, deliberately. Both are `SidePanel`s at the same
          z-index, so document order decides which is on top — and with the split rendered
          first it opened BEHIND the project it was creating jobs for. Nothing appeared to
          happen on "+ Create jobs" until you closed the project (Amber, 7 Sep: "when
          clicked it should open the interface not have to close out to create"). */}
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
        // The same board the jobs page renders, with project cards in the columns —
        // one component's worth of markup rather than a second kind of board, so a
        // column looks and behaves the same whichever record is in it.
        <Board>
          {projectGroups.map((g, gi) => (
            <section
              className="board-column"
              key={g.key}
              style={accentStyle(columnAccent(grouping, g.key, gi))}
            >
              <div className="board-column-head">
                {grouping === "None" ? (
                  <div><Text type="text3" color="secondary">All projects</Text></div>
                ) : (
                  <div>
                    <Text type="text3" color="secondary">{grouping}</Text>
                    <Text type="text2" weight="medium">{g.key}</Text>
                  </div>
                )}
                <span className="col-count">{g.projects.length}</span>
              </div>

              {g.projects.length === 0 ? (
                <div className="board-column-empty">
                  <Text type="text3" color="secondary">No projects</Text>
                </div>
              ) : (
                g.projects.map(p => (
                  <ProjectCard
                    key={p.projectNumber}
                    projectNumber={p.projectNumber}
                    jobs={p.jobs.map(j => ({ jobNumber: j.jobNumber, address: j.currentAddress ?? null, stage: j.stage }))}
                    address={p.currentAddress}
                    suburb={p.suburb}
                    stage={p.stage}
                    projectType={p.projectType}
                    targetCompletion={p.targetCompletion}
                    status={p.status}
                    ofTotal={p.ofTotal}
                    onOpen={() => openOne(p)}
                  />
                ))
              )}
            </section>
          ))}
        </Board>
      ) : view === "Gantt" ? (
        <ProjectsGantt rows={rows} onOpen={openOne} />
      ) : (
        <div className="panel data-table-wrap">
          <table className="data-table">
            <thead>
              <ColumnHeaders
                columns={projectLayout.columns}
                sort={projectSort}
                onSort={toggleProjectSort}
                onReorder={projectLayout.moveTo}
              />
            </thead>
            <tbody>
              {sortedRows.map(p => (
                <tr key={p.projectNumber} onClick={() => openOne(p)}>
                  {projectLayout.columns.map(c => (
                    <td key={c.key} className={c.className}>{c.cell(p)}</td>
                  ))}
                </tr>
              ))}
              {/* The other way in, per Lofty: "both. they can add either way." The
                  toolbar button opens the panel; this is for when you are already
                  looking at the list and want three more sites in it.

                  Spans whatever is shown — it was 8 while the columns were fixed, and
                  a new-row form that spans the wrong number of them straddles the edge
                  of the table. */}
              {can("user") && (
                <InlineNewProjectRow columns={projectLayout.columns.length} onCreated={refresh} />
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * The project's team and assignee, editable from `user` up — the rung the projects
 * update policy already enforces. Saves on change; the read-back is `onChanged`'s
 * reload, the same proof-by-re-read the dates use. Below `user` it reads only, and an
 * em dash stays the honest answer for "nobody".
 */
function WhoHoldsIt({ project, onChanged, onError }: {
  project: BoardProject;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const { teams } = useTeams();
  const { data: profiles } = useQuery(r => r.listProfiles(), []);

  const save = async (patch: { owningTeam?: TeamId; assigneeId?: string | null }) => {
    onError(null);
    try {
      // Undoable from the header — the repository records the step (undoableRepository).
      await repo.updateProject(project.projectId, patch);
      onChanged();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const assigneeName = project.assigneeId
    ? profiles.find(p => p.id === project.assigneeId)?.fullName ?? "—"
    : "—";

  return (
    <>
      <div className="field-row">
        <div className="field-label"><Text type="text2">Team</Text></div>
        {can("user") ? (
          <Select
            aria-label="Owning team"
            placeholder="— no team —"
            options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
            value={project.owningTeam}
            onChange={v => { if (v !== project.owningTeam) save({ owningTeam: v as TeamId }); }}
          />
        ) : (
          <Text type="text2" weight="medium">
            {project.owningTeam ? teams.find(t => t.id === project.owningTeam)?.name ?? project.owningTeam : "—"}
          </Text>
        )}
      </div>
      <div className="field-row">
        <div className="field-label"><Text type="text2">Assigned to</Text></div>
        {can("user") ? (
          /* The project's own team first, everybody else under "Other teams" — pick the
             team and the likely people rise to the top (Amber, 7 Sep). */
          <PersonSelect
            aria-label="Assignee"
            teamId={project.owningTeam}
            value={project.assigneeId}
            onChange={v => { if (v !== project.assigneeId) save({ assigneeId: v }); }}
          />
        ) : (
          <Text type="text2" weight="medium">{assigneeName}</Text>
        )}
      </div>
    </>
  );
}

function ProjectDetail({
  project,
  onSplit,
  onChanged
}: {
  project: BoardProject;
  onSplit: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const repo = useRepository();
  const { can } = usePermission();
  const { toast } = useToasts();
  const [removing, setRemoving] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // The push-to-jobs preview (Amber, 1 Sep). Open until pushed or cancelled.
  const [pushing, setPushing] = useState(false);
  const [propsReload, setPropsReload] = useState(0);

  /**
   * Searching within one project — its own box, not the header's.
   *
   * The header search decides which projects are in the list; this decides which of a
   * project's jobs you are looking at. They are different questions and sharing one box
   * would mean answering one of them badly: typing "lot 17" up there takes you off this
   * page entirely.
   *
   * Same matcher as the boards use, so "1042-03", "Wandi", "Construction" and a team
   * name all find a job here exactly as they do everywhere else.
   */
  const [jobQuery, setJobQuery] = useState("");
  const jobTerms = useMemo(
    () => jobQuery.trim().toLowerCase().split(/\s+/).filter(Boolean),
    [jobQuery]
  );
  const shownJobs = useMemo(
    () => project.jobs.filter(j => jobMatchesQuery(j, jobTerms)),
    [project.jobs, jobTerms]
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [folderUrl, setFolderUrl] = useState(project.sharepointUrl ?? "");
  // The "Add another address" form. Null while closed; a NewAddress being edited while
  // open. Saving repoints the current address — the outgoing one lands in the history
  // below by trigger (0042), which is what keeps an old contract's address findable.
  const [addingAddress, setAddingAddress] = useState<NewAddress | null>(null);
  const [savingAddress, setSavingAddress] = useState(false);
  const { data: pastAddresses } = useQuery(
    r => r.listAddressHistory({ projectId: project.projectId }),
    [],
    [project.projectId, project.currentAddress]
  );

  async function saveNewAddress() {
    if (!addingAddress) return;
    setSavingAddress(true);
    setSaveError(null);
    try {
      await repo.setProjectCurrentAddress(project.projectId, addingAddress);
      setAddingAddress(null);
      onChanged();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAddress(false);
    }
  }

  /**
   * One field at a time, straight through the seam. The patch carries only the key
   * being edited, so saving a date cannot clear the folder — and onChanged re-reads,
   * which is how the row proves the database accepted it rather than assuming.
   */
  async function saveField(patch: Parameters<typeof repo.updateProject>[1]) {
    setSaveError(null);
    try {
      await repo.updateProject(project.projectId, patch);
      onChanged();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  async function removeJob(jobNumber: string) {
    setRemoving(jobNumber);
    setRemoveError(null);
    try {
      await repo.deleteJob(jobNumber);
      // A toast because the row is gone the moment this succeeds — there is nowhere
      // on screen left to say it worked.
      toast(`Job ${jobNumber} removed.`, "normal");
      onChanged();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      {/* No page head: the slideout carries the address and the ×, and "← Projects" was
          the back button of a page that no longer exists — closing the panel IS going
          back. What stays is the pair the head cannot fit. */}
      <div className="panel-head">
        <Text type="text2" color="secondary" element="div">
          Project {project.projectNumber} · {project.jobs.length} job{project.jobs.length === 1 ? "" : "s"}
        </Text>
        <StatusPill status={project.status} />
      </div>

      <div className="stack">
        {/* FIRST, above the properties (Amber, 7 Sep: "create a job should be at the
            top"). A project exists to hold its jobs, and the act this drawer is opened
            for most is adding them; it sat under eleven other panels, below the fold of
            a 460px drawer, with the create button the last control on the page. */}
        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Jobs on this project ({project.jobs.length})</Text>
            <div className="panel-actions">
              {project.proposedDwellings != null && (
                <Text type="text3" color="secondary">
                  {project.proposedDwellings} proposed
                  {/* The mix, when the project has one (0053). Said as counts rather
                      than as a ratio, because "3 community" is what somebody checks
                      against the plan of division. */}
                  {(project.communityTitleLots != null || project.torrensTitleLots != null) && (
                    <>
                      {" "}({project.communityTitleLots ?? 0} community,{" "}
                      {project.torrensTitleLots ?? 0} Torrens)
                    </>
                  )}
                  {project.jobs.length !== project.proposedDwellings &&
                    ` · ${project.jobs.length} created`}
                </Text>
              )}
              {/* Amber, 1 Sep: a project property is pushed to all jobs from here. The
                  button opens a preview of what would move; the function does the copy. */}
              <Button size="small" kind="secondary" onClick={() => setPushing(true)} disabled={pushing}>
                Push to jobs…
              </Button>
              <Button size="small" onClick={onSplit}>+ Create jobs</Button>
            </div>
          </div>

          {removeError && (
            <div className="create-problem" role="alert">
              <Text type="text2" ellipsis={false}>{removeError}</Text>
            </div>
          )}

          {pushing && (
            <PushToJobs
              projectId={project.projectId}
              jobCount={project.jobs.filter(j => j.stage !== "Closed" && j.stage !== "Cancelled").length}
              onClose={() => setPushing(false)}
              onDone={n => {
                setPushing(false);
                setPropsReload(k => k + 1);
                toast(n === 0 ? "Nothing was pushed — the jobs already carry these values, or none is live." : `Pushed ${n} value${n === 1 ? "" : "s"} onto the jobs.`, "normal");
              }}
            />
          )}

          {project.jobs.length === 0 && (
            <Text type="text3" color="secondary" ellipsis={false}>
              No jobs yet. <strong>Create jobs</strong> splits this project into one per lot,
              each with its own lot address.
            </Text>
          )}
          {/* Search inside one project (Amber, 28 August: *"being able to search at a
              job level or project level for a job or word is essential"*). The header
              search narrows the whole portfolio, which is the wrong instrument once you
              are standing on a thirty-lot project and want lot 17: it would take you off
              this page and back to a filtered board. This one stays here and narrows
              only what is in front of you.

              Shown from four jobs up. On a project with two, a search box is furniture. */}
          {project.jobs.length > 3 && (
            <div className="panel-search">
              <TextField
                size="small"
                id={`find-job-${project.projectId}`}
                placeholder="Find a job on this project — number, lot, address, stage, team"
                inputAriaLabel={`Find a job on project ${project.projectNumber}`}
                value={jobQuery}
                onChange={v => setJobQuery(v)}
              />
              {jobTerms.length > 0 && (
                <Text type="text3" color="secondary">
                  {shownJobs.length} of {project.jobs.length}
                </Text>
              )}
            </div>
          )}

          {/* A search that matches nothing says so, rather than showing an empty table
              that reads as "this project has no jobs". */}
          {jobTerms.length > 0 && shownJobs.length === 0 && (
            <Text type="text3" color="secondary" ellipsis={false}>
              No job on this project matches “{jobQuery.trim()}”.
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
                {shownJobs.map(j => (
                  // Now that a job has an address of its own, this list is a set of links
                  // rather than a printout — same click as a row on the Jobs table.
                  <tr
                    key={j.jobNumber}
                    onClick={() => navigate(`/jobs/${encodeURIComponent(j.jobNumber)}`)}
                  >
                    <td>{j.jobNumber}</td>
                    <td>{j.currentAddress ?? <Token>addresses.consolidated_address</Token>}</td>
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
          {/* The simplified `projects`: a number, two addresses, a type, a status and
              three dates. Client, notes and the rest are property definitions now — they
              render in the slot list below rather than as columns here. Every row here
              is a real read since the embeds landed; a Token remains only where the
              column is genuinely empty. */}
          <div className="field-row">
            <div className="field-label"><Text type="text2">Current address</Text></div>
            {project.currentAddress != null
              ? <Text type="text2" weight="medium">{project.currentAddress}</Text>
              : <Token>project_display.current_address</Token>}
          </div>
          {/* Not in the token list below: a null original address is not an unwired
              column, it means the project was never renamed — the same real state the
              job drawer words the same way. The token here claimed a gap where the
              database was answering plainly. */}
          <div className="field-row">
            <div className="field-label"><Text type="text2">Original address</Text></div>
            {project.originalAddress != null
              ? <Text type="text2" weight="medium">{project.originalAddress}</Text>
              : <Text type="text3" color="secondary">never renamed — always this address</Text>}
          </div>
          {([
            ["Suburb", project.suburb, "addresses.suburb"],
            ["Council region", project.council, "addresses.council"],
            ["Type", project.projectType ? PROJECT_TYPE_LABELS[project.projectType] : null, "projects.project_type"]
          ] as const).map(([label, value, token]) => (
            <div className="field-row" key={label}>
              <div className="field-label"><Text type="text2">{label}</Text></div>
              {value != null
                ? <Text type="text2" weight="medium">{value}</Text>
                : <Token>{token}</Token>}
            </div>
          ))}

          {/* Who holds the project — the same pair the job drawer edits, at the same
              rung (`user`+, the update policy on projects). New projects open with
              Acquisition & Development (Amber's Q2); this is where that changes. */}
          <WhoHoldsIt project={project} onChanged={onChanged} onError={setSaveError} />

          {/* The lifecycle. The same forwards-only picker the job drawer has — Amber's
              rule covers both — with the same confirmation, and the same line the
              database draws at manager. The days count is derived on every read. */}
          <div className="field-row">
            <div className="field-label">
              <Text type="text2">Project stage</Text>
              <div className="field-hint">
                {daysSince(project.stageEnteredAt)}d in phase · follows its slowest job, and only forwards
              </div>
            </div>
            <div className="field-inline">
              <Text type="text2" weight="medium">{project.stage}</Text>
              <MoveStageControl
                subject={`Project ${project.projectNumber}`}
                stage={project.stage}
                move={(to: StageName) => repo.moveProjectStage(project.projectId, to)}
                note={PROJECT_MOVE_NOTE}
                onMoved={onChanged}
              />
            </div>
          </div>

          {saveError && (
            <div className="create-problem" role="alert">
              <Text type="text2" ellipsis={false}>{saveError}</Text>
            </div>
          )}

          {/* The three dates. Editable at `user` and above, which is the update policy
              on projects — a date input holding nothing is a date nobody set, never a
              stand-in. Saving happens on change; the read-back is the board reload. */}
          {([
            ["Start date", "startDate", project.startDate],
            ["Target completion", "targetCompletion", project.targetCompletion],
            ["End date", "endDate", project.endDate]
          ] as const).map(([label, key, value]) => (
            <div className="field-row" key={key}>
              <div className="field-label"><Text type="text2">{label}</Text></div>
              {can("user") ? (
                <input
                  type="date"
                  className="date-input"
                  aria-label={label}
                  defaultValue={value ?? ""}
                  onChange={e => saveField({ [key]: e.target.value || null })}
                />
              ) : value != null ? (
                <Text type="text2" weight="medium">{new Date(value).toLocaleDateString()}</Text>
              ) : (
                /* Read-only and unset: the words, not the column name (Amber, 2 Sep, on
                   the target date; the three dates share this row so they share the
                   answer). */
                <Text type="text2" color="secondary"><span className="pf-unset">Not set</span></Text>
              )}
            </div>
          ))}

          {/* The project's folder. Its jobs' folders are subfolders held on the jobs —
              one link per record, so this row is one link. The CHECK in the database
              (https, not blank) is the validator; its refusal shows here verbatim. */}
          <div className="field-row">
            <div className="field-label">
              <Text type="text2">SharePoint folder</Text>
              <div className="field-hint">each job holds its own subfolder link</div>
            </div>
            <div className="field-inline">
              {project.sharepointUrl && (
                <a href={project.sharepointUrl} target="_blank" rel="noreferrer" className="link-button">
                  Open folder
                </a>
              )}
              {can("user") && (
                <TextField
                  size="small"
                  id={`sharepoint-${project.projectId}`}
                  inputAriaLabel="SharePoint folder URL"
                  value={folderUrl}
                  onChange={v => setFolderUrl(v)}
                  onBlur={() => {
                    if ((folderUrl.trim() || null) !== (project.sharepointUrl ?? null)) {
                      saveField({ sharepointUrl: folderUrl.trim() || null });
                    }
                  }}
                />
              )}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Addresses</Text>
            {can("user") && addingAddress === null && (
              <Button size="small" kind="secondary" onClick={() => setAddingAddress({ suburb: "", postcode: "" })}>
                + Add another address
              </Button>
            )}
          </div>
          <Text type="text3" color="secondary" element="p" ellipsis={false}>
            The original address never changes — it is what the site was bought as, and
            what old paperwork says. Adding a new address makes it the current one; every
            previous address stays here and stays searchable.
          </Text>

          {addingAddress !== null && (
            <div className="new-address-block">
              <div className="panel-head">
                <Text type="text2" weight="bold">New address</Text>
              </div>
              <div className="create-form">
                <AddressFields value={addingAddress} onChange={setAddingAddress} />
              </div>
              <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
                <Button
                  size="small"
                  onClick={saveNewAddress}
                  disabled={savingAddress || !addingAddress.suburb.trim() || !addingAddress.postcode.trim()}
                >
                  {savingAddress ? "Saving…" : "Make this the current address"}
                </Button>
                <Button size="small" kind="tertiary" onClick={() => setAddingAddress(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {pastAddresses.length > 0 && (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Address</th><th>Was</th><th>From</th><th>Until</th></tr>
                </thead>
                <tbody>
                  {pastAddresses.map(h => (
                    <tr key={h.id}>
                      <td>{h.address ?? <Token>addresses.consolidated_address</Token>}</td>
                      <td>{h.role}</td>
                      <td>{new Date(h.validFrom).toLocaleDateString()}</td>
                      <td>{new Date(h.validTo).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Site-wide work — the things that belong to the project rather than to any one
            lot. A task hangs off exactly one of the two, which the CHECK enforces. */}
        <TasksPanel projectId={project.projectId} title="Tasks on this project" />

        {/* SiteBook's project roles — who at Lofty holds SS, CM, CA… on this project — and
            the outside parties: the council, the certifier, the developer's agent (0082). */}
        <div className="field-inline" style={{ justifyContent: "flex-end" }}><WatchButton projectId={project.projectId} /></div>
        <StaffRolesPanel projectId={project.projectId} />
        <PartiesPanel target={{ projectId: project.projectId }} />

        {/* The newest comment IS the latest update — one mechanism, not a field and a
            feed that could disagree. */}
        <CommentsPanel projectId={project.projectId} />

        {/* The project's history, and its jobs' — "1042-03 moved to Construction" is
            project 1042's news too, and a feed of only the parent row would be nearly
            empty on a site where all the work happens in the lots. */}
        <ActivityFeed projectId={project.projectId} title="Project activity" />

        {/* Project-level fields, in the stage and process that capture each one. */}
        <PropertySlots scope="project" target={{ projectId: project.projectId }} reloadKey={propsReload} showHistory />

        {/* The project's own processes — the site-wide ones, Concept Plan through DA. */}
        <ProcessesPanel target={{ projectId: project.projectId }} scope="project" currentStage={project.stage} reloadKey={propsReload} />

        {/* Same list as the job drawer, for a document about the whole site rather than
            one lot — a feasibility, a whole-project summary. */}
        <RecordDocuments projectId={project.projectId} folderUrl={project.sharepointUrl} />

      </div>
    </>
  );
}
