import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Button, Heading, Modal, ModalBasicLayout, ModalContent, ModalFooter,
  ModalHeader, Text
} from "@vibe/core";
import {
  LINEAR_STAGES, PROJECT_TYPES, PROJECT_TYPE_LABELS, RECORD_STATUS_LABELS, RECORD_STATUSES
} from "../data/types";
import { useProcesses, usePropertyAccess, usePropertyDefs, usePropertyOptions, useStages, useTeams, useTemplatePhases } from "../data/useLookups";
import { propertyColumnDefs } from "../data/propertyColumns";
import { useAuth } from "../data/AuthProvider";
import { useBoardRecords, type BoardJob } from "../data/boardModel";
import { jobMatchesQuery, matchedOnPreviousAddress, useSearch } from "../data/SearchProvider";
import { useBoardParams } from "../data/useBoardParams";
import { JOB_VIEWS, savedViewBySlug, stagesInView } from "../data/savedViews";
import { PROCESS_HEALTH_FILTER_OPTIONS, RECORDED_FILTER_OPTIONS, activeFilterCount, jobMatchesFilters, statusOptions } from "../data/filtering";
import { LoadProblem, NoResults, NothingYet, PreviousAddressNote } from "../components/SearchNotices";
import { SavedViewTabs } from "../components/SavedViewTabs";
import { useSavedViews } from "../data/useSavedViews";
import { JobCard, StatusPill } from "../components/RecordCards";
import { JobDrawer } from "../components/JobDrawer";
import { JOB_MOVE_NOTE, MoveStageDialog, isForwardMove } from "../components/MoveStageDialog";
import { sortRows, type SortState } from "../components/SortableTable";
import {
  ColumnHeaders, ColumnPicker, exportFields, useColumnLayout, type ColumnDef
} from "../components/TableColumns";
import { ExportMenu } from "../components/ExportMenu";
import { tableFromFields, type ExportDocument } from "../data/export";
import { Board } from "../components/Board";
import { BoardColumn } from "../components/BoardColumn";
import { JobsGantt } from "../components/JobsGantt";
import { MonthCalendar } from "../components/MonthCalendar";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import type { LatestUpdate, StageName, TeamId } from "../data/types";
import { accentStyle, columnAccent } from "../theme/accents";
import { NOTHING_RECORDED, currentProcessName, pipelineColumns, processColumnOf } from "../data/pipelinePosition";
import { planProcessDrop, refusalText, type DropPlan } from "../data/processMove";
import { MoveProcessDialog } from "../components/MoveProcessDialog";
import { readPrefs } from "../data/preferences";
import { Token, token } from "../components/Token";
import { Toolbar } from "../components/Toolbar";
import { Problem, Result } from "../components/Form";
import { PersonSelect } from "../components/PersonSelect";
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
  // `stages` (the full list, for the "across N stages" line) went with the subtitle on
  // 12 September; the names are what the filters and the board still need.
  const { stageNames } = useStages();
  const { teams, teamNames } = useTeams();
  // For the Process / Property filter chips (0077, 0078).
  const { processes } = useProcesses();
  const { propertyDefs } = usePropertyDefs();
  const { access: filterAccess } = usePropertyAccess();
  // For the property columns: a select's labels, and a person-format value's name.
  const { byProperty: optionsByProperty } = usePropertyOptions();
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const people = useMemo(() => profiles.map(p => ({ id: p.id, name: p.fullName })), [profiles]);
  const { expectedDaysByStage } = useTemplatePhases();
  // No create state and no project list any more: nothing is created from this page, so
  // there is nothing to re-read after and no picker to feed. Both went with the New job
  // dialog — see the note above the toolbar.
  // Bumped after a stage move, so the board re-reads and the card is in its new
  // column rather than where the stale list left it — the same mechanism the create
  // dialogs use on the projects page.
  const [reloadKey, setReloadKey] = useState(0);
  const { jobs: all, projects: allProjects, loading, error } = useBoardRecords(reloadKey);
  const { can } = usePermission();
  const repo = useRepository();


  const {
    view, setView, grouping, setGrouping, filters, setFilters, setMany, saved, setSaved, search
    // The default view is the preference (G39); a link that names its own view still
    // wins, because the URL is the record of what somebody sent you.
  } = useBoardParams({ view: readPrefs().defaultJobsView, grouping: "Stage", views: JOB_VIEWS });
  // The teams this person is in — sharing a view offers their own team, and offers
  // nothing at all to somebody in none (0051).
  const { profile: me } = useAuth();
  const myTeams = useMemo(
    () => teams.filter(t => t.isActive && (me?.teams ?? []).includes(t.id)),
    [teams, me]
  );
  // This person's own saved views (0048) — the fourth tab onwards.
  const myViews = useSavedViews("jobs");
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
  /**
   * Two groupings carry an order a drop can honour, and they are the two Amber drags in:
   * **Stage** moves the job along the lifecycle, **Process** moves it along the run
   * inside its stage. Everything else — Team, Status, Project, Team member — is a label
   * rather than a sequence, and dropping a card on a label has no write behind it.
   *
   * It used to be Stage alone, so drilling into a stage (which opens Process since #21)
   * left every card inert with nothing on screen saying why. That was the bug.
   */
  const dragGrouping = grouping === "Stage" || grouping === "Process";
  const dragEnabled = dragGrouping && can("manager");
  const [dragged, setDragged] = useState<BoardJob | null>(null);
  /**
   * Whether this column will take the card currently in the air. Answered DURING the
   * drag, so an illegal drop is refused before it lands and the browser shows
   * not-allowed rather than letting the card fall and bounce back with an error.
   *
   * Forwards only, in both groupings — Amber kept that rule when asked. The Nothing
   * recorded column is never a target: it is the absence of a record, and you cannot
   * move a job INTO having nothing recorded.
   */
  /**
   * Why this column will not take that card, in a sentence.
   *
   * Amber, 3 September, on going back: *"it can only go backwards if there is a Variation
   * where a variation is required and an 'Internal Amendment Form' (IAF) is filled out
   * and variation raised (and reason listed)"*. So a refusal names the route rather than
   * saying no — and for the lifecycle it says the thing `0031` decided: a job does not
   * rewind out of Construction, the work lives on the variation while the job stays put.
   */
  const whyNot = (job: BoardJob, columnKey: string): string => {
    if (grouping === "Stage") {
      if (columnKey === job.stage) return `${job.jobNumber} is already in ${columnKey}.`;
      return `A job does not move back from ${job.stage} to ${columnKey}. Going back needs a variation — `
        + "an IAF filled out and the variation raised with its reason — and the job stays where it is "
        + "while that work runs. Raising one from here is not built yet.";
    }
    if (columnKey === NOTHING_RECORDED) {
      return `"${NOTHING_RECORDED}" is the absence of a record, not a place to put a job.`;
    }
    const out = planProcessDrop(job, columnKey, processes);
    return out.ok ? "" : refusalText(out.refusal);
  };

  const acceptsDrop = (columnKey: string): boolean => {
    if (!dragEnabled || !dragged) return false;
    if (grouping === "Stage") return isForwardMove(dragged.stage, columnKey);
    if (columnKey === NOTHING_RECORDED) return false;
    return planProcessDrop(dragged, columnKey, processes).ok;
  };
  const [pendingMove, setPendingMove] = useState<{ job: BoardJob; to: StageName } | null>(null);
  /** A drop or a bulk action waiting on the catch-up confirmation. */
  const [pendingProcess, setPendingProcess] =
    useState<{ jobs: BoardJob[]; to: string; plans: Map<string, DropPlan> } | null>(null);
  /** Why the last drop was refused — printed where it happened rather than swallowed. */
  const [refused, setRefused] = useState<string | null>(null);

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
      case "Process": return processes.filter(x => x.isActive).map(x => ({ value: x.key, label: `${x.name} (${x.stageName})` }));
      case "Process health": return PROCESS_HEALTH_FILTER_OPTIONS;
      case "Property": return propertyDefs.filter(d => d.isActive && filterAccess(d.key).canRead).map(d => ({ value: d.key, label: `${d.label} (${d.scope})` }));
      case "Recorded": return RECORDED_FILTER_OPTIONS;
      // The board groups by project, so it filters by one too — number and address, so
      // it can be found by either.
      case "Project": return allProjects.map(p => ({ value: p.projectNumber, label: `${p.projectNumber} · ${p.currentAddress ?? "no address yet"}` }));
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
  /**
   * The latest update on every job on the board — its newest comment (0059).
   *
   * Amber, 28 August: *"the latest update should be the last comment placed on the
   * job."* Read for `all` rather than for `rows`, so typing in the search box does not
   * fire a request per keystroke; the map is looked up per card and a job with no
   * comments is simply missing from it.
   */
  const jobKey = useMemo(() => all.map(j => j.jobNumber).join(","), [all]);
  const { data: latestUpdates } = useQuery<Record<string, LatestUpdate>>(
    r => (jobKey ? r.listLatestUpdates(jobKey.split(",")) : Promise.resolve({})),
    {},
    [jobKey]
  );

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

  /**
   * Plan a move onto a process column for one job or a selection, and open the
   * confirmation — or say why not a single one of them can go.
   *
   * A mixed selection is normal and is not an error: some jobs are already past the
   * target, some are in another stage. Those are dropped from the batch and counted, the
   * same way the bulk stage move counts what it leaves alone.
   */
  function askProcessMove(jobs: BoardJob[], to: string) {
    const plans = new Map<string, DropPlan>();
    const refusals: string[] = [];
    for (const j of jobs) {
      const out = planProcessDrop(j, to, processes);
      if (out.ok) plans.set(j.jobNumber, out.plan);
      else refusals.push(refusalText(out.refusal));
    }
    if (plans.size === 0) {
      // Every one refused. Print the first reason rather than a generic "cannot": the
      // reasons are written to be read, and a selection usually fails for one of them.
      setRefused(refusals[0] ?? `Nothing to move to ${to}.`);
      return;
    }
    setRefused(null);
    setPendingProcess({ jobs: jobs.filter(j => plans.has(j.jobNumber)), to, plans });
  }

  /**
   * Write the move. `alsoComplete` is the answer to the dialog's question — with it, the
   * processes before the target are completed so the job reads where it was put; without
   * it, only the target starts and the card may stay where it was, honestly.
   *
   * A run that already exists is updated rather than started again: starting one is a new
   * ATTEMPT (0078), and a second attempt is a real thing that means "we did this twice".
   * So the runs are read per job first, and the id decides which call to make.
   */
  async function applyProcessMove(alsoComplete: boolean) {
    const pending = pendingProcess;
    if (!pending) return;
    const { jobs, to, plans } = pending;
    setPendingProcess(null);
    const skipped = selectedJobs.length > 0 && jobs.length < selectedJobs.length
      ? selectedJobs.length - jobs.length
      : 0;
    await bulkApply(`moved to ${to}`, jobs, async j => {
      const plan = plans.get(j.jobNumber);
      if (!plan) return;
      const runs = await repo.listProcessRuns({ jobId: j.jobNumber });
      const latest = new Map<string, { id: string; attempt: number }>();
      for (const r of runs) {
        const seen = latest.get(r.processId);
        if (!seen || r.attempt > seen.attempt) latest.set(r.processId, { id: r.id, attempt: r.attempt });
      }
      const set = async (processId: string, status: "complete" | "in_progress") => {
        const existing = latest.get(processId);
        if (existing) await repo.updateProcessRun(existing.id, { status });
        else await repo.startProcessRun({ jobId: j.jobNumber }, processId, status);
      };
      // The move: the target starts, and the board reads the furthest recorded process,
      // so the card lands where it was dropped. The completions are the optional tidy-up.
      if (alsoComplete) for (const p of plan.outstanding) await set(p.id, "complete");
      await set(plan.target.id, "in_progress");
    }, skipped);
    clearSelection();
  }

  /**
   * Which stages the Process columns are drawn from.
   *
   * The saved view's stages, NARROWED by the Stage filter when one is set. Amber, 3
   * September, filtered the board to Pre-construction and still got Acquisition &
   * Development's PWA as a column — then a refusal when she dropped a job on it. A board
   * narrowed to one stage should not offer another stage's processes as places to put a
   * card: the filter said which stage she was working in, and the columns ignored it.
   *
   * The Stage filter is a job filter everywhere else, so this is the one place it also
   * decides what is on screen to drop onto. Unset, nothing changes.
   */
  const columnStages = useMemo(() => {
    const picked = filters.filter(f => f.field === "Stage" && f.value).map(f => String(f.value));
    const kept = picked.filter(s => viewStages.includes(s));
    return kept.length > 0 ? kept : viewStages;
  }, [filters, viewStages]);

  /** The processes of the stages in view, in run order — the "Up to…" options. */
  const processPipeline = useMemo(() => pipelineColumns(processes, columnStages), [processes, columnStages]);

  // Jobs a bulk stage move would actually touch — already at or past the target,
  // cancelled or archived stay put, the same rule a project cascade follows (0046).
  const bulkMovable = useMemo(
    () => (bulkStage ? selectedJobs.filter(j => isForwardMove(j.stage, bulkStage)) : []),
    [selectedJobs, bulkStage]
  );

  /** Group keys in a deterministic order — pipeline order for stages, else as listed. */
  const groups = useMemo(() => {
    // "None" is one group with no name — the header is suppressed below, so the board
    // renders a single column and the table a single run of rows.
    const keyOf = (j: BoardJob) =>
      grouping === "None" ? ""
      : grouping === "Stage" ? j.stage
      : grouping === "Project" ? j.projectNumber
      : grouping === "Team" ? j.team
      : grouping === "Status" ? RECORD_STATUS_LABELS[j.status]
      // Derived, never stored: the first process of the job's stage that is not behind
      // it, or "Nothing recorded". pipelinePosition.ts carries the rule and the reason.
      : grouping === "Process" ? processColumnOf(j, processes)
      // The assignee resolves to a real name now (boardModel). A job with nobody on it
      // groups under its own honest heading rather than under a token.
      : j.assigneeName ?? "Unassigned";

    const order: string[] =
      grouping === "None" ? [""]
      : grouping === "Stage" ? viewStages
      : grouping === "Team" ? teamNames
      : grouping === "Status" ? RECORD_STATUSES.map(s => RECORD_STATUS_LABELS[s])
      // Lifecycle stage order, then position within the stage — Amber's sentence, as an
      // array. "Nothing recorded" leads, because a job nobody has recorded against is at
      // the head of the stage's work, not partway through it.
      : grouping === "Process" ? [NOTHING_RECORDED, ...pipelineColumns(processes, columnStages)]
      : [...new Set(rows.map(keyOf))];

    // No row may fall outside the columns. Every other grouping either lists its own
    // domain (the stages, the teams) or derives the order from the rows themselves; the
    // pipeline is built from the process table, so a job whose stage the saved view does
    // not admit would have a key with no column and would simply not be drawn. Appending
    // the strays keeps the board honest about how many jobs it is showing.
    const strays = [...new Set(rows.map(keyOf))].filter(k => !order.includes(k));

    return [...order, ...strays].map(key => ({ key, jobs: rows.filter(j => keyOf(j) === key) }));
  }, [grouping, rows, viewStages, columnStages, teamNames, processes]);

  /**
   * Table sorting (G12) — the SortableTable idiom the Admin tables already use, applied
   * within each group so "Group by" and "sort by" compose instead of fighting. No sort
   * until a header is clicked: the natural order (pipeline order for stages) is itself
   * meaningful, and a default sort would quietly erase it.
   */
  /**
   * The table's columns: what they are, what they sort on, and what each cell shows.
   *
   * One list, rather than a header array and a cell block that have to be kept in the
   * same order by hand — which is how a table ends up with "Team" over the assignee's
   * name. It is also what makes the columns configurable (Amber, 28 August: *"they need
   * to be sortable and able to be drag and dropped and re ordred, or add and remove
   * columns"*): reordering is reordering this list, hiding one is dropping it.
   */
  // The flat pipeline, for the "Up to" column's sort: alphabetical would put Working
  // Drawings before the Site Survey that precedes it, which is the lifecycle backwards —
  // the same reasoning the Stage column already sorts on its index rather than its name.
  const pipelineOrder = useMemo(() => pipelineColumns(processes, columnStages), [processes, columnStages]);

  const jobColumnDefs = useMemo<ColumnDef<BoardJob>[]>(() => [
    // The job number cannot be turned off. A table of jobs with no job number in it is
    // a table nobody can act on; everything else is somebody's call.
    { key: "job", group: "Identity", label: "Job", fixed: true, className: "nowrap",
      sort: j => j.jobNumber,
      // "1042-01" breaking into "1042-" / "01" is unreadable as an identifier, and the
      // identifier is what this column is — hence `nowrap`.
      cell: j => j.jobNumber, text: j => j.jobNumber },
    // Exported as text, not as the number it sorts on: a project number is an
    // identifier, and 1042 in a spreadsheet column of numbers invites somebody to
    // average it.
    { key: "project", group: "Identity", label: "Project", sort: j => Number(j.projectNumber),
      cell: j => j.projectNumber, text: j => j.projectNumber },
    { key: "address", group: "Identity", label: "Address", sort: j => j.currentAddress ?? null,
      cell: j => j.currentAddress ?? <Token>addresses.consolidated_address</Token>,
      text: j => j.currentAddress ?? token("addresses.consolidated_address") },
    { key: "type", group: "Identity", label: "Type",
      sort: j => (j.projectType ? PROJECT_TYPE_LABELS[j.projectType] : null),
      cell: j => (j.projectType
        ? PROJECT_TYPE_LABELS[j.projectType]
        : <Token>job_display.project_type</Token>),
      text: j => (j.projectType
        ? PROJECT_TYPE_LABELS[j.projectType]
        : token("job_display.project_type")) },
    // Pipeline position, not the alphabet — "Construction" before "Pre-construction"
    // alphabetically would be the lifecycle backwards.
    { key: "stage", group: "Programme", label: "Stage",
      sort: j => { const at = viewStages.indexOf(j.stage); return at === -1 ? null : at; },
      cell: j => j.stage, text: j => j.stage },
    { key: "team", group: "People", label: "Team", sort: j => j.team, cell: j => j.team, text: j => j.team },
    // The dash is for the screen only: a blank table cell reads as a rendering fault,
    // where a blank spreadsheet cell reads as "nobody", which is what it means.
    { key: "assignee", group: "People", label: "Assigned to", sort: j => j.assigneeName ?? null,
      cell: j => j.assigneeName ?? "—", text: j => j.assigneeName ?? null },
    // Off by default since 28 August, when it came off the cards for the same reason:
    // who typed a job in months ago is not what anybody scans a list for. Still here
    // for the person who does want it, which is what the picker is for.
    { key: "createdBy", group: "People", label: "Created by", offByDefault: true, className: "muted",
      sort: j => j.createdBy ?? null, cell: j => j.createdBy ?? "—",
      text: j => j.createdBy ?? null },
    // Same rule as the board's Process columns — one helper, so a job cannot be in the
    // "Working Drawings" column and read "Selections" here. Null is said as null: most
    // of these jobs were worked before the app existed, and an empty run list means the
    // app was not there, not that the job has done nothing.
    { key: "process", group: "Programme", label: "Up to",
      sort: j => { const n = currentProcessName(j, processes); return n === null ? null : pipelineOrder.indexOf(n); },
      cell: j => {
        const name = currentProcessName(j, processes);
        return name ?? <span className="muted">Nothing recorded</span>;
      },
      // "Nothing recorded" is a real answer here, not an absence — the run list is empty
      // because the app was not there when the job was worked, which is worth saying in a
      // file rather than leaving as a blank that reads as "not checked".
      text: j => currentProcessName(j, processes) ?? "Nothing recorded" },
    { key: "days", group: "Programme", label: "Days in stage", className: "num",
      sort: j => j.daysInStage, cell: j => j.daysInStage, text: j => j.daysInStage },
    // The pill has no text in it at all — this column is the reason `text` is
    // required rather than derived from the cell.
    { key: "status", group: "Programme", label: "Status", sort: j => RECORD_STATUS_LABELS[j.status],
      cell: j => <StatusPill status={j.status} />, text: j => RECORD_STATUS_LABELS[j.status] },
    // Every property the reader may see, job's own and the project's it inherits — off
    // until asked for, in the picker (Amber, 7 Sep). See data/propertyColumns.tsx.
    ...propertyColumnDefs<BoardJob>({
      defs: propertyDefs, scopes: ["job", "project"], canRead: k => filterAccess(k).canRead,
      optionsByProperty, people, labelScope: true
    })
  ], [viewStages, processes, pipelineOrder, propertyDefs, filterAccess, optionsByProperty, people]);

  const jobLayout = useColumnLayout("jobs", jobColumnDefs);

  /**
   * Table sorting (G12) — the SortableTable idiom the Admin tables already use, applied
   * within each group so "Group by" and "sort by" compose instead of fighting. No sort
   * until a header is clicked: the natural order (pipeline order for stages) is itself
   * meaningful, and a default sort would quietly erase it.
   */
  const [tableSort, setTableSort] = useState<SortState<string> | null>(null);
  const toggleTableSort = (key: string) =>
    setTableSort(sort =>
      sort?.key === key
        ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  // Read straight off the definitions, so a column and the thing it sorts on cannot
  // drift apart. Hidden columns keep their reader: hiding a column you had sorted by
  // should not silently reshuffle the rows underneath you.
  const jobColumns = useMemo(
    () => Object.fromEntries(
      jobColumnDefs.filter(d => d.sort).map(d => [d.key, d.sort!])
    ) as Record<string, (j: BoardJob) => string | number | null>,
    [jobColumnDefs]
  );
  const tableGroups = useMemo(
    () => (tableSort ? groups.map(g => ({ ...g, jobs: sortRows(g.jobs, jobColumns, tableSort) })) : groups),
    [groups, jobColumns, tableSort]
  );

  /**
   * The download, built at the click rather than on every render (see `ExportMenu`).
   *
   * WHAT IT CONTAINS IS WHAT THE TOOLBAR SAYS IT CONTAINS. `tableGroups` is the sorted,
   * grouped, filtered, searched set the table renders — not `all`, and not `inView`. The
   * count line above says "Showing 11 of 200"; a file with 200 rows in it would make
   * that line a lie in the one direction nobody checks.
   *
   * GROUPING BECOMES SHEETS. Grouped by stage, the workbook has a sheet per stage, the
   * Word document a section per stage, and the PDF a page per stage — the board's own
   * shape. Empty groups are dropped, following the table rather than the board: a board
   * column with no cards is somewhere to drag one to, while a sheet with no rows is a tab
   * somebody opens for nothing.
   *
   * Available on every view, not only the table. A board is a set of jobs arranged for
   * reading, and "the jobs I am looking at, as a spreadsheet" is the same request
   * whichever arrangement is on screen. The columns are the table's — the ones in the
   * picker — because those are the only columns anybody has expressed a preference over.
   */
  const buildExport = (): ExportDocument => {
    const fields = exportFields(jobLayout.columns);
    const parts = [
      `Showing ${rows.length} of ${inView.length} jobs`,
      saved.label,
      grouping !== "None" ? `grouped by ${grouping.toLowerCase()}` : null,
      activeFilterCount(filters) > 0
        ? `${activeFilterCount(filters)} filter${activeFilterCount(filters) === 1 ? "" : "s"} set`
        : null,
      terms.length > 0 ? `search: ${terms.join(" ")}` : null
    ].filter(Boolean);
    return {
      title: saved.slug === "all" ? "Jobs" : `Jobs · ${saved.label}`,
      note: parts.join(" · "),
      tables:
        grouping === "None"
          ? [tableFromFields("Jobs", fields, tableGroups.flatMap(g => g.jobs))]
          : tableGroups
              .filter(g => g.jobs.length > 0)
              .map(g => tableFromFields(g.key, fields, g.jobs, `${grouping}: ${g.key}`))
    };
  };

  /**
   * A number nobody recognises goes back to the board, so a stale link is a board rather
   * than a dead end. Guarded on `all.length` on purpose: the list is empty both while the
   * lookups load and when the app is bound to real data with no placeholder shape, and
   * redirecting then would throw away a perfectly good link before it could resolve.
   */
  if (jobNumber && !openJob && all.length > 0) return <Navigate to={`/jobs${search}`} replace />;

  return (
    <>
      {/* No line under the heading. Amber, 12 September: *"on all pages remove
          descriptive line text under page header … we need the most above the fold
          possible"*. The count this line carried is said again by the
          toolbar — "Showing 3 of 3 jobs" — and the view's name by the tab under it. */}
      <div className="page-head">
        <Heading type="h2" weight="bold">Jobs</Heading>
      </div>

      <SavedViewTabs
        views={JOB_VIEWS}
        activeSlug={saved.slug}
        onSelect={setSaved}
        hrefFor={slug => (slug === "all" ? "/jobs" : `/jobs?saved=${slug}`)}
        countFor={slug =>
          all.filter(j => stagesInView(savedViewBySlug(slug, JOB_VIEWS), stageNames).includes(j.stage)).length
        }
        userViews={myViews.views}
        currentQuery={search}
        basePath="/jobs"
        onOpenView={v => navigate(`/jobs${v.query ? `?${v.query}` : ""}`, { replace: true })}
        onSaveView={name => myViews.save(name, search.replace(/^\?/, ""))}
        onDeleteView={v => { void myViews.remove(v.id); }}
        onShareView={(v, team) => { void myViews.share(v.id, team); }}
        shareTeams={myTeams}
        teamLabel={id => teams.find(t => t.id === id)?.name ?? id}
        saveProblem={myViews.problem}
        saveBusy={myViews.busy}
      />

      {/* Nothing creates a job from this page. Lofty, 23 August: "a new job can only be
          created from the project screen as they must be linked to a project."

          There was a button here that navigated to Projects — the idea being that "why
          can I not add a job here" deserves an answer. Amber, 28 Aug: "remove the add a
          job button on job page." A control whose whole job is to send you somewhere
          else is a control that takes up the toolbar and does nothing anybody came for;
          the empty state below still says where jobs come from, which is where that
          sentence belongs. */}
      <Toolbar
        view={view}
        onViewChange={setView}
        groupings={["None", "Stage", "Project", "Team", "Team member", "Status", "Process"]}
        grouping={grouping}
        onGroupingChange={setGrouping}
        filters={filters}
        onFiltersChange={setFilters}
        optionsFor={optionsFor}
        /* The same fields as Group by (Amber, 7 Sep). Team member is deliberately not a
           filter: the Team filter matches membership (26 Aug). */
        primary={["Stage", "Team", "Status", "Process"]}
        advanced={["Number", "Project", "Type", "Date", "Process health", "Property", "Recorded"]}
        count={`Showing ${rows.length} of ${inView.length} jobs`}
        actions={
          <>
            {/* Only on the view that has columns. On the board it would be a control
                promising something the screen cannot do. */}
            {view === "Table" && (
              <ColumnPicker
                title="Columns on the jobs table"
                all={jobLayout.all}
                hidden={jobLayout.hidden}
                onToggle={jobLayout.toggle}
                onMoveBy={jobLayout.moveBy}
                onReset={jobLayout.reset}
                isDefault={jobLayout.isDefault}
              />
            )}
            {/* On every view — see `buildExport`. Disabled while the read is in flight
                and when there is nothing in view: a file of nothing is not an answer,
                and the empty state on screen already says so. */}
            <ExportMenu build={buildExport} disabled={loading || rows.length === 0} />
          </>
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

      {/* The drag hint, from the prototype's view header. It used to appear only when
          dragging was possible and say nothing otherwise, so a board of inert cards
          looked broken rather than grouped by something a drop cannot write to. It now
          says which of the two it is — Amber reported the silence, not the rule. */}
      {view === "Board" && !loading && all.length > 0 && can("manager") && (
        <div className="drag-hint">
          <Text type="text3" color="secondary" ellipsis={false} element="p">
            {dragEnabled
              ? grouping === "Stage"
                ? "Drag cards between columns to move a job forwards through the lifecycle"
                : "Drag cards between columns to move a job forwards through this stage's processes"
              : `Grouped by ${grouping}, so cards do not drag — ${grouping === "None" ? "there is one column" : "these columns are a label, not an order"}. Group by Stage or Process to move jobs.`}
          </Text>
        </div>
      )}

      {/* Why the last drop bounced. On the board rather than in a toast: it belongs
          where the card landed, and it clears itself the moment anything else happens. */}
      {refused && view === "Board" && (
        <div className="drag-hint">
          <Problem>{refused}</Problem>
        </div>
      )}

      {view === "Board" && !noMatches && !loading && all.length > 0 && (
        <Board>
          {groups.map((g, gi) => (
            <BoardColumn
              board="jobs"
              key={g.key}
              name={g.key}
              grouping={grouping}
              count={g.jobs.length}
              empty="No jobs"
              accent={accentStyle(columnAccent(grouping, g.key, gi))}
              /* The Jobs board is the one column head that does more than read: drilling
                 into a stage turns the columns into that stage's processes. */
              head={grouping === "Stage" ? (
                <button
                  type="button"
                  className="board-col-drill"
                  title={`Open ${g.key} as its processes, each job in the one it is up to`}
                  onClick={() =>
                    setMany({
                      grouping: "Process",
                      filters: [...filters.filter(f => f.field !== "Stage"), { field: "Stage", value: g.key }]
                    })
                  }
                >
                  <Text type="text3" color="secondary">{grouping}</Text>
                  <Text type="text2" weight="medium">{g.key} ›</Text>
                </button>
              ) : undefined}
              /**
               * Why the refusal is explained on ENTER rather than on drop.
               *
               * A column that will not take a card has to refuse the drop, and the only
               * way to refuse one is to leave `dropEffect` at "none" — at which point
               * Chromium fires no `drop` event at all, so there is nothing to explain
               * itself on release. That silence is what Amber reported: a card that will
               * not land and a board that says nothing about why.
               *
               * So the reason arrives the moment the card is over the column, while there
               * is still time to put it somewhere else, and the cursor stays honest.
               */
              onDragEnter={() => {
                if (!dragEnabled || !dragged) return;
                setRefused(acceptsDrop(g.key) ? null : whyNot(dragged, g.key));
              }}
              onDragOver={e => {
                if (!dragEnabled || !dragged) return;
                if (!acceptsDrop(g.key)) return;   // no preventDefault: the drop is refused
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={e => {
                const job = dragged;
                setDragged(null);
                if (!job || !dragEnabled || !acceptsDrop(g.key)) return;
                e.preventDefault();
                setRefused(null);
                if (grouping === "Stage") setPendingMove({ job, to: g.key as StageName });
                else askProcessMove([job], g.key);
              }}
            >
              {(
                g.jobs.map(j => (
                  <div
                    key={j.jobNumber}
                    className={`board-card-wrap${dragEnabled ? " board-card-draggable" : ""}${selected.has(j.jobNumber) ? " is-picked" : ""}`}
                    draggable={dragEnabled}
                    onDragStart={e => {
                      setDragged(j);
                      setRefused(null);
                      e.dataTransfer.effectAllowed = "move";
                      // Some browsers refuse to start a drag with no data at all.
                      e.dataTransfer.setData("text/plain", j.jobNumber);
                    }}
                    onDragEnd={() => setDragged(null)}
                  >
                    {/* Selection lived only in the table, so "multiselect and update the
                        stage" was impossible on the board — Amber's second report. The
                        same `selected` set backs both views, so a selection survives
                        switching between them. */}
                    {can("user") && (
                      <label className="board-card-pick">
                        <input
                          type="checkbox"
                          checked={selected.has(j.jobNumber)}
                          onChange={() => toggleOne(j.jobNumber)}
                          aria-label={`Select job ${j.jobNumber}`}
                        />
                      </label>
                    )}
                    <JobCard
                      jobNumber={j.jobNumber}
                      stageName={j.stage}
                      team={j.team}
                      address={j.currentAddress}
                      projectType={j.projectType}
                      assigneeName={j.assigneeName}
                      status={j.status}
                      latestUpdate={latestUpdates[j.jobNumber] ?? null}
                      onOpen={() => openOne(j)}
                    />
                  </div>
                ))
              )}
            </BoardColumn>
          ))}
        </Board>
      )}

      {/* The bulk bar belongs to the selection, not to one view of it. It was inside the
          table branch, so selecting cards on the board — once that was possible — would
          have had nowhere to act. */}
      {!noMatches && !loading && all.length > 0 && can("user") && selected.size > 0 && (
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
                    ordered
                    options={LINEAR_STAGES.map(s => ({ value: s, label: s }))}
                    value={null}
                    onChange={v => setBulkStage(v as StageName)}
                  />
                )}
                {/* "or by process or pipelien" — the other half of Amber's report. The
                    options are the processes of the stages in view, in the order a job
                    runs them, so this list reads the same way the board's columns do. */}
                {can("manager") && processPipeline.length > 0 && (
                  <Select
                    /* The stage's run of processes, in the order a job passes through
                       them — the one list on this board where A–Z would be actively
                       wrong, since it is the sequence that says what "up to" means. */
                    ordered
                    aria-label="Set what the selected jobs are up to"
                    placeholder="Up to…"
                    options={processPipeline.map(n => ({ value: n, label: n }))}
                    value={null}
                    onChange={v => { if (v) askProcessMove(selectedJobs, v); }}
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
                <PersonSelect
                  aria-label="Assign the selected jobs to a person"
                  placeholder="Assign to…"
                  clearable={false}
                  value={null}
                  onChange={v => {
                    if (!v) return;
                    bulkApply("assigned", selectedJobs,
                      j => repo.updateJob(j.jobNumber, { assigneeId: v }));
                  }}
                />
                <Button
                  size="small"
                  kind="tertiary"
                  disabled={selectedJobs.every(j => !j.assigneeId)}
                  onClick={() => bulkApply("unassigned", selectedJobs,
                    j => repo.updateJob(j.jobNumber, { assigneeId: null }))}
                >
                  Unassign
                </Button>
              </div>
              {bulkBusy && <Text type="text3" color="secondary">Saving…</Text>}
              {bulkNote.ok && <Result>{bulkNote.ok}</Result>}
              {bulkNote.err && <Problem>{bulkNote.err}</Problem>}
              {refused && view === "Table" && <Problem>{refused}</Problem>}
            </div>
      )}

      {view === "Table" && !noMatches && !loading && all.length > 0 && (
        <>
          <div className="panel data-table-wrap">
          <table className="data-table">
            <thead>
              <ColumnHeaders
                columns={jobLayout.columns}
                sort={tableSort}
                onSort={toggleTableSort}
                onReorder={jobLayout.moveTo}
                leading={can("user") && (
                  <th className="bulk-col">
                    <input
                      type="checkbox"
                      aria-label={allSelected ? "Clear the selection" : "Select every job shown"}
                      checked={allSelected}
                      onChange={toggleAll}
                    />
                  </th>
                )}
              />
            </thead>
            {/* One tbody per group, so the table answers the same "Group by" the board
                does. Empty groups are dropped here where the board keeps them: a column
                with no cards is a place to drag one to, and a heading with no rows under
                it is just a heading. */}
            {tableGroups.filter(g => g.jobs.length > 0).map(g => (
              <tbody key={g.key} className="group">
                {/* No heading row when ungrouped — a table split into one group by
                    nothing is just a table, and a blank colgroup header reads as a
                    rendering fault. */}
                {grouping !== "None" && (
                  <tr className="group-head">
                    {/* Counted, not hardcoded: the count was 11 and 10 when the columns
                        were fixed, and a heading that spans the wrong number of columns
                        is a table that visibly comes apart. */}
                    <th scope="colgroup" colSpan={jobLayout.columns.length + (can("user") ? 1 : 0)}>
                      <span className="group-name">{g.key}</span>
                      <span className="group-count">
                        {g.jobs.length} job{g.jobs.length === 1 ? "" : "s"}
                      </span>
                    </th>
                  </tr>
                )}
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
                    {jobLayout.columns.map(c => (
                      <td key={c.key} className={c.className}>{c.cell(j)}</td>
                    ))}
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

      {pendingProcess && (
        <MoveProcessDialog
          subject={pendingProcess.jobs.length === 1
            ? pendingProcess.jobs[0].jobNumber
            : `${pendingProcess.jobs.length} jobs`}
          count={pendingProcess.jobs.length}
          target={pendingProcess.to}
          // The names to complete, across the batch — a job already past one of them
          // does not put it on the list twice, and a job that needs none adds nothing.
          completes={[...new Set(
            pendingProcess.jobs.flatMap(j => (pendingProcess.plans.get(j.jobNumber)?.outstanding ?? []).map(p => p.name))
          )]}
          onConfirm={applyProcessMove}
          onClose={() => setPendingProcess(null)}
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
