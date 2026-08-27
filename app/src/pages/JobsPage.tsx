import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Button, Heading, Modal, ModalBasicLayout, ModalContent, ModalFooter,
  ModalHeader, Text
} from "@vibe/core";
import {
  LINEAR_STAGES, PROJECT_TYPES, PROJECT_TYPE_LABELS, RECORD_STATUS_LABELS, RECORD_STATUSES
} from "../data/types";
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
import { JOB_MOVE_NOTE, MoveStageDialog, isForwardMove } from "../components/MoveStageDialog";
import { SortHeader, sortRows, type SortState } from "../components/SortableTable";
import { JobsGantt } from "../components/JobsGantt";
import { MonthCalendar } from "../components/MonthCalendar";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import type { StageName, TeamId } from "../data/types";
import { accentStyle, columnAccent } from "../theme/accents";
import { readPrefs } from "../data/preferences";
import { Token } from "../components/Token";
import { Toolbar } from "../components/Toolbar";
import { Problem, Result } from "../components/Form";
import { Select, toOptions } from "../components/Select";
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
  const { teams, teamNames } = useTeams();
  const { expectedDaysByStage } = useTemplatePhases();
  // No create state and no project list any more: nothing is created from this page, so
  // there is nothing to re-read after and no picker to feed. Both went with the New job
  // dialog — see the note above the toolbar.
  // Bumped after a stage move, so the board re-reads and the card is in its new
  // column rather than where the stale list left it — the same mechanism the create
  // dialogs use on the projects page.
  const [reloadKey, setReloadKey] = useState(0);
  const { jobs: all, loading, error } = useBoardRecords(reloadKey);
  const { can } = usePermission();
  const repo = useRepository();


  const {
    view, setView, grouping, setGrouping, filters, setFilters, setMany, saved, setSaved, search
    // The default view is the preference (G39); a link that names its own view still
    // wins, because the URL is the record of what somebody sent you.
  } = useBoardParams({ view: readPrefs().defaultJobsView, grouping: "Stage" });
  /**
   * Drag a card between columns — but only when the columns ARE the lifecycle, and only
   * for people the database would let finish the move. Grouped by Team the columns are
   * ownership, by Status they are a label, and dropping a card there has no meaning a
   * write could honour.
   *
   * The drop does not move anything by itself: it opens the same confirmation the
   * drawer's picker uses, because Lofty's rule is about lifecycle moves however they
   * are asked for. Dropping on an earlier column is refused during the drag — the
   * column never accepts the drop, so the browser shows not-allowed instead of letting
   * the card land and bounce back with an error.
   */
  const dragEnabled = grouping === "Stage" && can("manager");
  const [dragged, setDragged] = useState<BoardJob | null>(null);
  const [pendingMove, setPendingMove] = useState<{ job: BoardJob; to: StageName } | null>(null);

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
      case "Type": return PROJECT_TYPES.map(t => ({ value: t, label: PROJECT_TYPE_LABELS[t] }));
      default: return [];
    }
  };

  /**
   * Bulk edit, on the table view (Amber, 26 August: "a select button in table view so
   * you can select multiple jobs at once and edit — e.g. assign to team or person or
   * stage"). Selection is page state, not URL state: a half-made selection is a draft,
   * and a link that arrives with jobs pre-selected would be a trap.
   *
   * Team and assignee apply on choice — they are ordinary edits. A stage move confirms
   * first, because that is the lifecycle rule everywhere else; one confirmation covers
   * the batch and says how many actually move. Writes go one at a time so a single
   * refusal (RLS, a guard) names its job instead of failing the lot.
   */
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState<{ ok: string | null; err: string | null }>({ ok: null, err: null });
  const [bulkStage, setBulkStage] = useState<StageName | null>(null);

  const selectedJobs = useMemo(() => rows.filter(j => selected.has(j.jobNumber)), [rows, selected]);
  const allSelected = rows.length > 0 && rows.every(j => selected.has(j.jobNumber));
  const toggleOne = (no: string) =>
    setSelected(s => {
      const next = new Set(s);
      if (next.has(no)) next.delete(no); else next.add(no);
      return next;
    });
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map(j => j.jobNumber)));
  const clearSelection = () => { setSelected(new Set()); setBulkNote({ ok: null, err: null }); };

  async function bulkApply(done: string, jobs: BoardJob[], apply: (j: BoardJob) => Promise<unknown>, skipped = 0) {
    if (bulkBusy) return;
    setBulkBusy(true);
    setBulkNote({ ok: null, err: null });
    let applied = 0;
    const failures: string[] = [];
    for (const j of jobs) {
      try { await apply(j); applied++; }
      catch (e) { failures.push(`${j.jobNumber} — ${e instanceof Error ? e.message : String(e)}`); }
    }
    setBulkBusy(false);
    setReloadKey(k => k + 1);
    const summary =
      `${applied} ${done}` +
      (skipped > 0 ? ` · ${skipped} left as ${skipped === 1 ? "it was" : "they were"}` : "");
    if (failures.length === 0) setBulkNote({ ok: summary, err: null });
    else setBulkNote({ ok: null, err: `${summary} · ${failures.length} refused: ${failures[0]}` });
  }

  // Jobs a bulk stage move would actually touch — already at or past the target,
  // cancelled or archived stay put, the same rule a project cascade follows (0046).
  const bulkMovable = useMemo(
    () => (bulkStage ? selectedJobs.filter(j => isForwardMove(j.stage, bulkStage)) : []),
    [selectedJobs, bulkStage]
  );

  /** Group keys in a deterministic order — pipeline order for stages, else as listed. */
  const groups = useMemo(() => {
    const keyOf = (j: BoardJob) =>
      grouping === "Stage" ? j.stage
      : grouping === "Project" ? j.projectNumber
      : grouping === "Team" ? j.team
      : grouping === "Status" ? RECORD_STATUS_LABELS[j.status]
      // The assignee resolves to a real name now (boardModel). A job with nobody on it
      // groups under its own honest heading rather than under a token.
      : j.assigneeName ?? "Unassigned";

    const order: string[] =
      grouping === "Stage" ? viewStages
      : grouping === "Team" ? teamNames
      : grouping === "Status" ? RECORD_STATUSES.map(s => RECORD_STATUS_LABELS[s])
      : [...new Set(rows.map(keyOf))];

    return order.map(key => ({ key, jobs: rows.filter(j => keyOf(j) === key) }));
  }, [grouping, rows, viewStages, teamNames]);

  /**
   * Table sorting (G12) — the SortableTable idiom the Admin tables already use, applied
   * within each group so "Group by" and "sort by" compose instead of fighting. No sort
   * until a header is clicked: the natural order (pipeline order for stages) is itself
   * meaningful, and a default sort would quietly erase it.
   */
  type JobsColumn = "job" | "project" | "address" | "type" | "stage" | "team" | "assignee" | "createdBy" | "days" | "status";
  const [tableSort, setTableSort] = useState<SortState<JobsColumn> | null>(null);
  const toggleTableSort = (key: JobsColumn) =>
    setTableSort(sort =>
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  const jobColumns = useMemo<Record<JobsColumn, (j: BoardJob) => string | number | null>>(
    () => ({
      job: j => j.jobNumber,
      project: j => Number(j.projectNumber),
      address: j => j.currentAddress ?? null,
      type: j => (j.projectType ? PROJECT_TYPE_LABELS[j.projectType] : null),
      // Pipeline position, not the alphabet — "Construction" before "Pre-construction"
      // alphabetically would be the lifecycle backwards.
      stage: j => {
        const at = viewStages.indexOf(j.stage);
        return at === -1 ? null : at;
      },
      team: j => j.team,
      assignee: j => j.assigneeName ?? null,
      createdBy: j => j.createdBy ?? null,
      days: j => j.daysInStage,
      status: j => RECORD_STATUS_LABELS[j.status]
    }),
    [viewStages]
  );
  const tableGroups = useMemo(
    () => (tableSort ? groups.map(g => ({ ...g, jobs: sortRows(g.jobs, jobColumns, tableSort) })) : groups),
    [groups, jobColumns, tableSort]
  );

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

      {/* The drag hint, from the prototype's view header — shown only when dragging is
          actually possible, so it never promises what the rung below manager lacks. */}
      {view === "Board" && dragEnabled && !loading && all.length > 0 && (
        <div className="drag-hint">
          <Text type="text3" color="secondary">Drag cards between columns to move a job</Text>
        </div>
      )}

      {view === "Board" && !noMatches && !loading && all.length > 0 && (
        <div className="board">
          {groups.map((g, gi) => (
            <section
              className="board-column"
              key={g.key}
              style={accentStyle(columnAccent(grouping, g.key, gi))}
              onDragOver={e => {
                if (dragEnabled && dragged && isForwardMove(dragged.stage, g.key)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }
              }}
              onDrop={e => {
                if (dragEnabled && dragged && isForwardMove(dragged.stage, g.key)) {
                  e.preventDefault();
                  setPendingMove({ job: dragged, to: g.key as StageName });
                }
                setDragged(null);
              }}
            >
              <div className="board-column-head">
                {/* Drill-down (G8), as navigation rather than a page of its own: the
                    prototype's drill-down asked "who holds what inside this phase",
                    and the board already answers that — filtered to the phase,
                    regrouped by team, in the URL like everything else. */}
                {grouping === "Stage" ? (
                  <button
                    type="button"
                    className="board-col-drill"
                    title={`Open ${g.key} grouped by team`}
                    onClick={() =>
                      setMany({
                        grouping: "Team",
                        filters: [...filters.filter(f => f.field !== "Stage"), { field: "Stage", value: g.key }]
                      })
                    }
                  >
                    <Text type="text3" color="secondary">{grouping}</Text>
                    <Text type="text2" weight="medium">{g.key} ›</Text>
                  </button>
                ) : (
                  <div>
                    <Text type="text3" color="secondary">{grouping}</Text>
                    <Text type="text2" weight="medium">{g.key}</Text>
                  </div>
                )}
                {/* Ink-on-tint, per the accent rule — the one place the column's colour
                    repeats, so the chip and the strip read as one system. */}
                <span className="col-count">{g.jobs.length}</span>
              </div>

              {g.jobs.length === 0 ? (
                <div className="board-column-empty">
                  <Text type="text3" color="secondary">No jobs</Text>
                </div>
              ) : (
                g.jobs.map(j => (
                  <div
                    key={j.jobNumber}
                    className={dragEnabled ? "board-card-draggable" : undefined}
                    draggable={dragEnabled}
                    onDragStart={e => {
                      setDragged(j);
                      e.dataTransfer.effectAllowed = "move";
                      // Some browsers refuse to start a drag with no data at all.
                      e.dataTransfer.setData("text/plain", j.jobNumber);
                    }}
                    onDragEnd={() => setDragged(null)}
                  >
                    <JobCard
                      jobNumber={j.jobNumber}
                      stageName={j.stage}
                      team={j.team}
                      address={j.currentAddress}
                      projectType={j.projectType}
                      createdBy={j.createdBy}
                      assigneeName={j.assigneeName}
                      status={j.status}
                      onOpen={() => openOne(j)}
                    />
                  </div>
                ))
              )}
            </section>
          ))}
        </div>
      )}

      {view === "Table" && !noMatches && !loading && all.length > 0 && (
        <>
          {can("user") && selected.size > 0 && (
            <div className="bulk-bar" role="region" aria-label="Bulk edit">
              <Text type="text2" weight="medium">
                {selected.size} selected
              </Text>
              <Button kind="tertiary" size="small" onClick={clearSelection} disabled={bulkBusy}>
                Clear
              </Button>
              <div className="bulk-actions">
                {can("manager") && (
                  <Select
                    aria-label="Move the selected jobs to a later phase"
                    placeholder="Move to…"
                    options={LINEAR_STAGES.map(s => ({ value: s, label: s }))}
                    value={null}
                    onChange={v => setBulkStage(v as StageName)}
                  />
                )}
                <Select
                  aria-label="Set the owning team on the selected jobs"
                  placeholder="Set team…"
                  options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
                  value={null}
                  onChange={v => {
                    if (v) bulkApply("moved to the team", selectedJobs, j => repo.updateJob(j.jobNumber, { owningTeam: v as TeamId }));
                  }}
                />
                <Select
                  aria-label="Assign the selected jobs to a person"
                  placeholder="Assign to…"
                  options={[
                    { value: "— nobody —", label: "— nobody —" },
                    ...profiles.map(p => ({ value: p.id, label: p.fullName }))
                  ]}
                  value={null}
                  onChange={v => {
                    if (!v) return;
                    const id = v === "— nobody —" ? null : v;
                    bulkApply(id ? "assigned" : "unassigned", selectedJobs,
                      j => repo.updateJob(j.jobNumber, { assigneeId: id }));
                  }}
                />
              </div>
              {bulkBusy && <Text type="text3" color="secondary">Saving…</Text>}
              {bulkNote.ok && <Result>{bulkNote.ok}</Result>}
              {bulkNote.err && <Problem>{bulkNote.err}</Problem>}
            </div>
          )}
          <div className="panel data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {can("user") && (
                  <th className="bulk-col">
                    <input
                      type="checkbox"
                      aria-label={allSelected ? "Clear the selection" : "Select every job shown"}
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                {([
                  ["job", "Job"], ["project", "Project"], ["address", "Address"],
                  ["type", "Type"], ["stage", "Stage"], ["team", "Team"],
                  ["assignee", "Assigned to"], ["createdBy", "Created by"],
                  ["days", "Days in stage"], ["status", "Status"]
                ] as const).map(([key, label]) => (
                  <SortHeader
                    key={key}
                    column={key}
                    label={label}
                    sort={tableSort ?? { key: "" as JobsColumn, direction: "asc" }}
                    onSort={toggleTableSort}
                    className={key === "days" ? "num" : undefined}
                  />
                ))}
              </tr>
            </thead>
            {/* One tbody per group, so the table answers the same "Group by" the board
                does. Empty groups are dropped here where the board keeps them: a column
                with no cards is a place to drag one to, and a heading with no rows under
                it is just a heading. */}
            {tableGroups.filter(g => g.jobs.length > 0).map(g => (
              <tbody key={g.key} className="group">
                <tr className="group-head">
                  <th scope="colgroup" colSpan={can("user") ? 11 : 10}>
                    <span className="group-name">{g.key}</span>
                    <span className="group-count">
                      {g.jobs.length} job{g.jobs.length === 1 ? "" : "s"}
                    </span>
                  </th>
                </tr>
                {g.jobs.map(j => (
                  <tr key={j.jobNumber} onClick={() => openOne(j)}>
                    {can("user") && (
                      <td className="bulk-col" onClick={e => e.stopPropagation()}>
                        {/* The row opens the drawer; the checkbox must not. */}
                        <input
                          type="checkbox"
                          aria-label={`Select ${j.jobNumber}`}
                          checked={selected.has(j.jobNumber)}
                          onChange={() => toggleOne(j.jobNumber)}
                        />
                      </td>
                    )}
                    {/* nowrap: "1042-01" breaking into "1042-" / "01" is unreadable
                        as an identifier, and the identifier is what this column is. */}
                    <td style={{ whiteSpace: "nowrap" }}>{j.jobNumber}</td>
                    <td>{j.projectNumber}</td>
                    <td>{j.currentAddress ?? <Token>addresses.consolidated_address</Token>}</td>
                    <td>
                      {j.projectType
                        ? PROJECT_TYPE_LABELS[j.projectType]
                        : <Token>job_display.project_type</Token>}
                    </td>
                    <td>{j.stage}</td>
                    <td>{j.team}</td>
                    <td>{j.assigneeName ?? "—"}</td>
                    <td className="muted">{j.createdBy ?? "—"}</td>
                    <td className="num">{j.daysInStage}</td>
                    <td><StatusPill status={j.status} /></td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          </div>
        </>
      )}

      {view === "Gantt" && !noMatches && !loading && all.length > 0 && (
        <JobsGantt
          groups={groups}
          grouping={grouping}
          expectedDaysByStage={expectedDaysByStage}
          onOpen={openOne}
        />
      )}

      {view === "Calendar" && !noMatches && !loading && all.length > 0 && (
        <MonthCalendar rows={rows} expectedDaysByStage={expectedDaysByStage} onOpen={openOne} />
      )}

      {openJob && (
        <JobDrawer
          siblings={all}
          onJump={openOne}
          job={openJob}
          onClose={() => navigate(`/jobs${search}`)}
          onMoved={() => setReloadKey(k => k + 1)}
        />
      )}

      {/* The confirmation a drop opens. Same dialog as the drawer's picker — Lofty's
          rule is one rule, so it is one component. */}
      {pendingMove && (
        <MoveStageDialog
          show
          subject={pendingMove.job.jobNumber}
          fromStage={pendingMove.job.stage}
          toStage={pendingMove.to}
          move={to => repo.moveJobStage(pendingMove.job.jobNumber, to)}
          note={JOB_MOVE_NOTE}
          onClose={() => setPendingMove(null)}
          onMoved={() => setReloadKey(k => k + 1)}
        />
      )}

      {/* The batch version of the lifecycle confirmation — one modal for the whole
          selection, saying how many actually move. Jobs already at or past the target,
          cancelled or archived, are left as they are (the same rule the project
          cascade in 0046 follows), and that is said before, not discovered after. */}
      <Modal show={bulkStage != null} onClose={() => setBulkStage(null)} id="bulk-move-stage">
        <ModalBasicLayout>
          <ModalHeader title={`Move ${bulkMovable.length} job${bulkMovable.length === 1 ? "" : "s"} to ${bulkStage ?? ""}`} />
          <ModalContent>
            <Text type="text2" element="p" ellipsis={false}>
              {bulkMovable.length} of the {selectedJobs.length} selected will move.
              {selectedJobs.length - bulkMovable.length > 0 &&
                ` The other ${selectedJobs.length - bulkMovable.length} are already at or past ${bulkStage}, cancelled, or archived — they stay where they are.`}
            </Text>
            <Text type="text3" color="secondary" ellipsis={false}>
              The lifecycle only moves forwards, so this cannot be undone by moving them
              back. {JOB_MOVE_NOTE}
            </Text>
          </ModalContent>
        </ModalBasicLayout>
        <ModalFooter
          primaryButton={{
            text: bulkBusy ? "Moving…" : "Move",
            disabled: bulkBusy || bulkMovable.length === 0,
            onClick: async () => {
              const target = bulkStage;
              if (!target) return;
              const skipped = selectedJobs.length - bulkMovable.length;
              setBulkStage(null);
              await bulkApply(`moved to ${target}`, bulkMovable,
                j => repo.moveJobStage(j.jobNumber, target), skipped);
            }
          }}
          secondaryButton={{ text: "Cancel", onClick: () => setBulkStage(null) }}
        />
      </Modal>
    </>
  );
}
