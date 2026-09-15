import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Checkbox, Text, TextField } from "@vibe/core";
import { MoveArrowDown, MoveArrowUp } from "@vibe/icons";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useProcessProperties, useProcesses, usePropertyDefs, useStages, useTeams } from "../data/useLookups";
import { Field, Problem } from "../components/Form";
import { Tooltip } from "@vibe/tooltip";
import { Select } from "../components/Select";
import { SidePanel } from "../components/SidePanel";
import { SortHeader, sortRows, type SortState } from "../components/SortableTable";
import { BlurText, NumberInput } from "../components/InlineInputs";
import { GroupPicker } from "../components/GroupPicker";
import {
  NO_GROUP, groupKey, groupLabel, moveProcess, moveSubstage, ordersToWrite, spliceProcess, spliceSubstage, stageOrder,
  substageOrdersToWrite
} from "../data/pipelineOrder";
import {
  PROPERTY_SCOPES, WORKING_STAGES, teamName,
  type LifecycleSubstage,
  type NewProcess, type Process, type ProcessDependency, type ProcessHistoryEntry, type ProcessPatch,
  type ProcessStep, type ProcessStepDependency, type ProcessStepKind, type PropertyDef,
  type PropertyScope, type Team, type TeamId
} from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Setup → Processes: what happens inside each lifecycle stage, editable.
 *
 * Amber, 1 Sep: "a process interface in the app so that the [properties] collected in
 * each process stage can be changed and edited, and the process information including
 * how long it should go for, the steps that are preceding and coming after that process
 * or in conjunction with that process, are also editable in the app by managers, admin
 * and super admin."
 *
 * Amber, 3 Sep, on what this page was still missing:
 *
 *   "doesn't have an edit or delete button on there and if it is a milestone / these
 *   coilumns also need to be filterable and sortable by teams, Build Lifecycle Stage,
 *   Group/Pipeline / the Groups need to be able to be sorted and have processes nested
 *   beneath them and be in ordered as this defines how the job moves through a build
 *   cycle stage, so it is more like a pipeline as each process has an number and they
 *   should be able to be dragged and dropped in order to create a flow of processes that
 *   go through a stage to move a job through the construction or preconstruction stage.
 *   … clikc on a process should have hte same sidebar slideout like all other records
 *   with ability to open it in full screen. … they also need to show in processes when
 *   they were last updated and by who and what happened"
 *
 * So the list is A PIPELINE, not a table of rows that happen to share a stage. A stage
 * holds groups, a group holds processes, and the number beside each process is its place
 * in the run through that stage — one sequence, 1..n, across the whole stage rather than
 * restarting per group, because that is the order a job actually moves in.
 *
 * WHY THE NUMBER IS DERIVED AND NOT A SECOND COLUMN
 *
 *   `process_position` already exists and already means "order within the stage". Groups
 *   need no position of their own: a group's place in the stage IS the position of its
 *   first process, and every reorder renumbers the whole stage 1..n so the blocks stay
 *   contiguous. That keeps a schema change out of a screen change, and it means the
 *   number on screen and the number in the column can never disagree.
 *
 * WHY A REORDER READS THE WHOLE STAGE AND NOT WHAT IS ON SCREEN
 *
 *   The filters are the point of the filters. If dragging renumbered only the visible
 *   rows, filtering to one team and moving a process would silently shove every hidden
 *   process to the end of the stage. So a move is expressed against the stage's FULL
 *   list — filtered-out rows keep their places — and only the rows whose number or group
 *   actually changed are written.
 *
 * Sorting by a column is a different question ("which of these is oldest?") and gets a
 * different answer: a flat table in that order, with dragging off, because a pipeline
 * sorted by team is not a pipeline.
 */

const slugify = (label: string) =>
  label.toLowerCase().replace(/\b1st\b/g, "first").replace(/\b2nd\b/g, "second").replace(/\b3rd\b/g, "third")
    .replace(/^\s*\d+\s*-\s*/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]/, "p_$&");

/** The group heading a process with no group sits under. A label for a blank, not a value. */
const whenText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

type Col = "pipeline" | "name" | "group" | "stage" | "team" | "milestone" | "days" | "updated";

export function ProcessesSetupPage() {
  const [params, setParams] = useSearchParams();
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("manager");
  const [reload, setReload] = useState(0);
  const bump = () => setReload(n => n + 1);

  const { processes } = useProcesses(reload);
  const { stageNames } = useStages();
  const { teams } = useTeams();
  const { data: deps } = useQuery(r => r.listProcessDependencies(), [], [reload]);
  const { byProcess: propsByProcess } = useProcessProperties(reload);
  const { data: allSteps } = useQuery(r => r.listProcessSteps(), [], [reload]);
  const { data: substages } = useQuery(r => r.listSubstages(), [], [reload]);

  const selectedId = params.get("process");
  const creating = params.get("new") === "1";
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState<Col>>({ key: "pipeline", direction: "asc" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ kind: "process" | "group"; id: string; stage: string } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  const select = (id: string | null) => setParam({ process: id, new: null });

  const selected = processes.find(p => p.id === selectedId) ?? null;
  // Memoised because the pipeline is built from it: a fresh array every render would
  // rebuild every stage block on every keystroke in the search box.
  const stages = useMemo(
    () => (stageNames.length ? stageNames : [...new Set(processes.map(p => p.stageName))]),
    [stageNames, processes]
  );
  // The Checklist column counts TASK STEPS, not every step: a process's tick boxes and the
  // properties it collects each have their own column, and three numbers that add up to the
  // step count read better than one that does not.
  const tasksByProcess = useMemo(() => {
    const m = new Map<string, number>();
    allSteps.filter(st => st.kind === "task").forEach(st => m.set(st.processId, (m.get(st.processId) ?? 0) + 1));
    return m;
  }, [allSteps]);
  /**
   * The sub-stages a process can be filed into: its own stage's, active ones, in the
   * stage's order (0127). Before the sub-stages were rows this offered every stage's group
   * names as one shared vocabulary; a sub-stage belongs to one stage, and the database
   * refuses a process filed under another stage's, so only the stage's own are offered.
   */
  const substagesFor = useMemo(() => {
    const byStage = new Map<string, LifecycleSubstage[]>();
    substages.forEach(s => { (byStage.get(s.stageName) ?? byStage.set(s.stageName, []).get(s.stageName)!).push(s); });
    return (stage: string) =>
      (byStage.get(stage) ?? []).filter(s => s.isActive).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  }, [substages]);

  /** Sub-stage id → name, for the drawer's history, which holds ids and reads to people. */
  const substageNames = useMemo(() => new Map(substages.map(x => [x.id, x.name])), [substages]);

  /**
   * A new sub-stage from the picker: made here so the list reloads with it in.
   *
   * A name that matches a RETIRED block of the same stage brings that one back instead of
   * making a second. The database refuses the twin anyway (the name is unique within the
   * stage), and "that name is taken by something you cannot see" is not an answer.
   */
  async function createSubstage(stageName: string, name: string): Promise<string | null> {
    setError(null);
    const wanted = name.trim().toLowerCase();
    const retired = substages.find(x =>
      x.stageName === stageName && !x.isActive && x.name.trim().toLowerCase() === wanted);
    try {
      if (retired) { await repo.updateSubstage(retired.id, { isActive: true }); bump(); return retired.id; }
      const s = await repo.createSubstage({ stageName, name });
      bump();
      return s.id;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); return null; }
  }

  /** Renaming a sub-stage is data: the processes carry its id, so nothing follows the name. */
  async function renameSubstage(sub: LifecycleSubstage, name: string) {
    const next = name.trim();
    if (!next || next === sub.name) return;
    setError(null);
    try { await repo.updateSubstage(sub.id, { name: next }); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  /**
   * Retiring a sub-stage takes it out of the pickers and off this screen. Only an empty one:
   * a block with processes in it would take them off the screen with it, and the honest way
   * to empty it is to move them.
   */
  async function retireSubstage(sub: LifecycleSubstage) {
    setError(null);
    try { await repo.updateSubstage(sub.id, { isActive: false }); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const groupNames = useMemo(
    () => [...new Set(processes.map(p => groupLabel(p)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [processes]
  );

  const shown = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return processes.filter(p =>
      (showRetired || p.isActive || p.id === selectedId)
      && (!stageFilter || p.stageName === stageFilter)
      && (!teamFilter || p.owningTeam === teamFilter)
      && (!groupFilter || groupLabel(p) === groupFilter)
      && terms.every(t => `${p.name} ${p.key} ${p.substageName ?? ""} ${p.owningTeam ? teamName(p.owningTeam, teams) : ""}`.toLowerCase().includes(t))
    );
  }, [processes, search, showRetired, selectedId, stageFilter, teamFilter, groupFilter, teams]);
  const visible = useMemo(() => new Set(shown.map(p => p.id)), [shown]);

  /** What each sortable column compares on. `pipeline` is the stage's own numbering. */
  const columns = useMemo(() => ({
    pipeline: (p: Process) => p.position,
    name: (p: Process) => p.name,
    group: (p: Process) => p.substageName,
    stage: (p: Process) => stages.indexOf(p.stageName),
    team: (p: Process) => (p.owningTeam ? teamName(p.owningTeam, teams) : null),
    milestone: (p: Process) => p.isMilestone,
    days: (p: Process) => p.expectedDays,
    updated: (p: Process) => p.updatedAt
  }), [stages, teams]);

  /** Click a header: the same column reverses, a new column starts ascending. */
  const toggleSort = (k: Col) =>
    setSort(s => (s.key === k ? { key: k, direction: s.direction === "asc" ? "desc" : "asc" } : { key: k, direction: "asc" }));

  const pipelineView = sort.key === "pipeline";
  const flat = useMemo(() => (pipelineView ? [] : sortRows(shown, columns, sort)), [pipelineView, shown, columns, sort]);

  /**
   * The pipeline, as stage → sub-stage → processes, with the stage's running number attached.
   * Built from the FULL stage list so the numbers on screen are the numbers in the column
   * even when a filter is hiding rows between them, then narrowed to what is shown. A block
   * is keyed by the sub-stage's id (0127) and labelled by its name.
   */
  const pipeline = useMemo(() => stages.map(stage => {
    const ordered = stageOrder(processes.filter(p => p.stageName === stage));
    const numbered = new Map(ordered.map((p, i) => [p.id, i + 1]));
    // The blocks are the stage's SUB-STAGES, in their own order — not the blocks its
    // processes happen to form. A sub-stage with no processes in it is still a block: Amber
    // seeded 2 Month and 3 Month empty on purpose, and a block nobody can see is a block
    // nobody can rename, reorder or retire. The parked rows (no sub-stage, only ever a
    // retired process) come last under their own heading, which has no controls because
    // there is no row behind it.
    const subs = substagesFor(stage);
    const blocks = subs.map(sub => ({
      key: sub.id,
      group: sub.name,
      sub: sub as LifecycleSubstage | null,
      list: ordered.filter(p => p.substageId === sub.id).map(p => ({ p, n: numbered.get(p.id)! }))
    }));
    const parked = ordered.filter(p => p.substageId === null);
    if (parked.length) {
      blocks.push({ key: "", group: groupLabel(parked[0]), sub: null,
        list: parked.map(p => ({ p, n: numbered.get(p.id)! })) });
    }
    // A filter hides rows, not blocks: a block keeps its place while anything in it matches,
    // and a block that holds nothing at all stays so it can be managed.
    const kept = blocks
      .map(b => ({ ...b, list: b.list.filter(r => visible.has(r.p.id)), holds: b.list.length }))
      .filter(b => b.list.length > 0 || b.holds === 0);
    return { stage, blocks: kept, count: kept.reduce((n, b) => n + b.list.length, 0),
      hasBlocks: kept.length > 0 };
  }).filter(s => s.count > 0 || s.hasBlocks), [stages, processes, visible, substagesFor]);

  /**
   * One move, expressed as "rewrite this stage's order". `mutate` gets the stage's whole
   * list in its canonical order and returns the order it should be in; only the rows whose
   * number or group changed are written, so a nudge is two writes and not forty-nine.
   */
  async function reorder(stage: string, mutate: (arr: Process[]) => Process[]) {
    const before = stageOrder(processes.filter(p => p.stageName === stage));
    const orders = ordersToWrite(before, mutate(before));
    if (orders.length === 0) return;
    setError(null);
    try { await repo.reorderProcesses(orders); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const moveProcessBy = (stage: string, id: string, dir: -1 | 1) =>
    reorder(stage, arr => moveProcess(arr, id, dir));

  /**
   * Moving a block moves the SUB-STAGE (0127): its own position among the stage's sub-stages
   * changes, and the processes follow because they are grouped by it. Only the rows whose
   * position changed are written.
   */
  async function reorderSubstages(stage: string, mutate: (subs: LifecycleSubstage[]) => LifecycleSubstage[]) {
    const active = substagesFor(stage);
    // Retired blocks are not on screen and do not move, but they still hold positions. Renumber
    // them after the active ones rather than leaving them where they were: 1..n over the active
    // list alone collides with a retired 1, and `stageOrder` then breaks the tie on the name,
    // which puts the blocks in alphabetical order for no reason a person could see.
    const retired = substages
      .filter(x => x.stageName === stage && !x.isActive)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
    const before = [...active, ...retired];
    const orders = substageOrdersToWrite(before, [...mutate(active), ...retired]);
    if (orders.length === 0) return;
    setError(null);
    try { await repo.reorderSubstages(orders); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const moveGroupBy = (stage: string, substageId: string, dir: -1 | 1) =>
    reorderSubstages(stage, subs => moveSubstage(subs, substageId, dir));

  const onDropProcess = (stage: string, targetId: string) => {
    const d = dragging;
    setDragging(null); setDropOn(null);
    if (!d || d.stage !== stage) return;
    if (d.kind === "process") {
      if (d.id === targetId) return;
      void reorder(stage, arr => {
        const to = arr.findIndex(p => p.id === targetId);
        if (to === -1) return arr;
        return spliceProcess(arr, d.id, to, arr[to]);
      });
    } else {
      // A block dropped on a process lands in front of that process's block.
      const target = processes.find(p => p.id === targetId);
      if (!target?.substageId || target.substageId === d.id) return;
      void reorderSubstages(stage, subs => spliceSubstage(subs, d.id, subs.findIndex(s => s.id === target.substageId)));
    }
  };

  const onDropGroup = (stage: string, group: string) => {
    const d = dragging;
    setDragging(null); setDropOn(null);
    if (!d || d.stage !== stage) return;
    if (d.kind === "group") {
      if (d.id === group) return;
      void reorderSubstages(stage, subs => spliceSubstage(subs, d.id, subs.findIndex(s => s.id === group)));
    } else {
      // Dropped on a heading: joins that sub-stage, at the top of it.
      void reorder(stage, arr => {
        const to = arr.findIndex(p => groupKey(p) === group);
        if (to === -1) return arr;
        return spliceProcess(arr, d.id, to, arr[to]);
      });
    }
  };

  async function remove(p: Process) {
    setError(null);
    try {
      await repo.deleteProcess(p.id);
      setConfirmDelete(null);
      if (p.id === selectedId) select(null);
      bump();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setConfirmDelete(null); }
  }

  /**
   * Rename in place: type in the box, leave it, one
   * write. A blank is refused rather than saved — an unnamed process is a row nobody can
   * find again, and the box puts the old name straight back so nothing is lost to a
   * stray keystroke.
   */
  async function rename(p: Process, name: string) {
    const next = name.trim();
    if (next === "" || next === p.name) { bump(); return; }
    setError(null);
    try { await repo.updateProcess(p.id, { name: next }); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); bump(); }
  }

  const active = processes.filter(p => p.isActive).length;
  const dragProps = (kind: "process" | "group", id: string, stage: string) =>
    canEdit && pipelineView
      ? {
        draggable: true,
        onDragStart: (e: React.DragEvent) => { e.stopPropagation(); setDragging({ kind, id, stage }); e.dataTransfer.effectAllowed = "move"; },
        onDragEnd: () => { setDragging(null); setDropOn(null); },
        onDragOver: (e: React.DragEvent) => {
          if (!dragging || dragging.stage !== stage) return;
          e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDropOn(id);
        },
        onDragLeave: () => setDropOn(d => (d === id ? null : d))
      }
      : {};

  const columnsCount = 11;

  return (
    <>
      <div className="panel-head">
        <Text type="text2" weight="bold">Processes ({active} active{processes.length - active ? `, ${processes.length - active} retired` : ""})</Text>
        <Text type="text3" color="secondary">{canEdit ? "Managers and above edit everything here." : "You can read everything here; managers and above edit it."}</Text>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        A process is a piece of work inside a lifecycle stage — <strong>Concept Plan</strong>,
        <strong> Working Drawings</strong>, <strong>1 - Footings</strong>. Inside a stage they run in
        order: the number beside each one is its place in the flow that moves a job through the stage,
        and the sub-stages are the blocks that flow is made of. Drag a process, or a whole sub-stage, to
        change that order. Click one to open it.
      </Text>

      {error && <Problem>{error}</Problem>}

      <div className="toolbar" style={{ marginTop: "var(--space-12)" }}>
        <span className="toolbar-control">
          <Select aria-label="Filter by lifecycle stage" clearable placeholder="All stages" options={stages.map(s => ({ value: s, label: s }))}
            value={stageFilter} onChange={setStageFilter} />
        </span>
        <span className="toolbar-control">
          <Select aria-label="Filter by team" clearable placeholder="All teams"
            options={teams.filter(t => t.isActive || processes.some(p => p.owningTeam === t.id)).map(t => ({ value: t.id, label: t.name }))}
            value={teamFilter} onChange={setTeamFilter} />
        </span>
        <span className="toolbar-control">
          <Select aria-label="Filter by sub-stage" clearable placeholder="All sub-stages" options={groupNames.map(g => ({ value: g, label: g }))}
            value={groupFilter} onChange={setGroupFilter} />
        </span>
        <span className="toolbar-search"><TextField size="small" id="procs-search" inputAriaLabel="Search processes" placeholder="Search…" value={search} onChange={setSearch} /></span>
        <Checkbox label="Show retired" checked={showRetired} onChange={() => setShowRetired(v => !v)} />
        {/* Two views of the same rows, named rather than implied: the pipeline is the
            order a job moves in, the table is every column sortable and filterable.
            Clicking a sort header still lands in the table — this only makes the way
            back, and the fact that there IS a way back, visible before you need it. */}
        <span className="view-switch" role="group" aria-label="View">
          <Button size="small" kind={pipelineView ? "primary" : "tertiary"} aria-pressed={pipelineView}
            onClick={() => setSort({ key: "pipeline", direction: "asc" })}>Pipeline</Button>
          <Button size="small" kind={pipelineView ? "tertiary" : "primary"} aria-pressed={!pipelineView}
            onClick={() => setSort(s => (s.key === "pipeline" ? { key: "name", direction: "asc" } : s))}>Table</Button>
        </span>
        {canEdit && <Button size="small" onClick={() => setParam({ new: "1", process: null })}>+ New process</Button>}
      </div>

      {!pipelineView && (
        <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-4)" }}>
          Sorted by a column, so this is a flat list and dragging is off — a pipeline sorted by team is
          not a pipeline. Go back to pipeline order to change what runs when.
        </Text>
      )}

      {pipelineView ? (
        <>
          {pipeline.map(s => (
            <PipelineStageCard
              key={s.stage}
              stage={s.stage}
              blocks={s.blocks}
              count={s.count}
              canEdit={canEdit}
              dropOn={dropOn}
              dragging={dragging}
              dragProps={dragProps}
              onDropGroup={onDropGroup}
              onDropProcess={onDropProcess}
              onMoveGroup={(group, dir) => moveGroupBy(s.stage, group, dir)}
              onMoveProcess={(id, dir) => moveProcessBy(s.stage, id, dir)}
              onRenameGroup={renameSubstage}
              onRetireGroup={retireSubstage}
              teams={teams}
              propertyCount={id => (propsByProcess.get(id) ?? []).length}
              taskCount={id => tasksByProcess.get(id) ?? 0}
              selectedId={selectedId}
              onSelect={select}
              confirmDelete={confirmDelete}
              onAskDelete={setConfirmDelete}
              onDelete={remove}
              onRename={rename}
              onAdd={(stage, group) =>
                setParam({ new: "1", process: null, newStage: stage, newGroup: group ?? null })}
            />
          ))}
          {pipeline.length === 0 && (
            <section className="panel" style={{ marginTop: "var(--space-12)" }}>
              <Text type="text2" color="secondary" element="p" ellipsis={false}>
                {processes.length === 0 ? "No processes defined yet." : "Nothing matches — clear the search or the filters."}
              </Text>
            </section>
          )}
        </>
      ) : (
        <section className="panel" style={{ marginTop: "var(--space-12)" }}>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <SortHeader<Col> column="pipeline" label="#" sort={sort} onSort={toggleSort} className="num" />
                  <SortHeader<Col> column="name" label="Process" sort={sort} onSort={toggleSort} />
                  <SortHeader<Col> column="group" label="Sub-stage" sort={sort} onSort={toggleSort} />
                  <SortHeader<Col> column="stage" label="Build lifecycle stage" sort={sort} onSort={toggleSort} />
                  <SortHeader<Col> column="team" label="Team" sort={sort} onSort={toggleSort} />
                  <SortHeader<Col> column="milestone" label="Milestone" sort={sort} onSort={toggleSort} />
                  <SortHeader<Col> column="days" label="Days" sort={sort} onSort={toggleSort} className="num" />
                  <th className="num" scope="col">Properties</th>
                  <th className="num" scope="col">Checklist</th>
                  <SortHeader<Col> column="updated" label="Last updated" sort={sort} onSort={toggleSort} />
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {flat.map(p => (
                  <ProcessRow
                    key={p.id} p={p} n={p.position} teams={teams}
                    properties={(propsByProcess.get(p.id) ?? []).length} tasks={tasksByProcess.get(p.id) ?? 0}
                    showStage canEdit={canEdit} selected={p.id === selectedId} onSelect={select}
                    confirming={confirmDelete === p.id} onAskDelete={setConfirmDelete} onDelete={remove}
                    columnsCount={columnsCount}
                  />
                ))}
              </tbody>
            </table>
            {processes.length === 0 && (
              <Text type="text2" color="secondary" element="p" ellipsis={false}>No processes defined yet.</Text>
            )}
            {processes.length > 0 && shown.length === 0 && (
              <Text type="text2" color="secondary" element="p" ellipsis={false}>Nothing matches — clear the search or the filters.</Text>
            )}
          </div>
        </section>
      )}

      {creating && canEdit && (
        <NewProcessPanel
          stageNames={stages}
          teams={teams}
          stage={params.get("newStage")}
          group={params.get("newGroup")}
          substagesFor={substagesFor}
          onCreateSubstage={createSubstage}
          onCancel={() => setParam({ new: null, newStage: null, newGroup: null })}
          onCreated={p => { bump(); setParam({ new: null, newStage: null, newGroup: null, process: p.id }); }}
        />
      )}
      {!creating && selected && (
        <SidePanel open title={selected.name} onClose={() => select(null)}>
          <ProcessEditor
            key={selected.id}
            process={selected}
            all={processes}
            deps={deps}
            teams={teams}
            stageNames={stages}
            substagesFor={substagesFor}
            substageNames={substageNames}
            onCreateSubstage={createSubstage}
            canEdit={canEdit}
            onChanged={bump}
            onError={setError}
            onDeleted={() => { bump(); select(null); }}
          />
        </SidePanel>
      )}
    </>
  );
}

// ------------------------------------------------------------ the pipeline editor
/**
 * One lifecycle stage, drawn as an ordered list you rearrange rather than a table you
 * read down: a drag handle, the run number, the name in a box you type straight into,
 * and the row's own actions — edit, delete — at the end of it.
 *
 * The shape comes from four screenshots Amber sent on 3 Sep, and she was explicit about
 * how to read them: *"Note these are looking at the ui and ux reference not using
 * deals"*. So what is borrowed is the INTERACTION — rows with handles, names edited in
 * place, an add row at the foot, per-row settings — and not somebody else's object
 * model. What is in the list here is this app's own: the processes of a lifecycle stage,
 * in the order a job runs them.
 *
 * The dense table is still here, one click away, because Amber asked for sortable and
 * filterable columns on the same screen and a pipeline sorted by team is not a pipeline.
 * This view answers "what order does a job go through this stage in"; that one answers
 * "which of these is oldest, and who owns it".
 */
function PipelineStageCard({
  stage, blocks, count, canEdit, dropOn, dragging, dragProps, onDropGroup, onDropProcess,
  onMoveGroup, onMoveProcess, onRenameGroup, onRetireGroup, teams, propertyCount, taskCount,
  selectedId, onSelect, confirmDelete, onAskDelete, onDelete, onRename, onAdd
}: {
  stage: string;
  blocks: { key: string; group: string; sub: LifecycleSubstage | null; holds: number; list: { p: Process; n: number }[] }[];
  count: number;
  canEdit: boolean;
  dropOn: string | null;
  dragging: { kind: "process" | "group"; id: string; stage: string } | null;
  dragProps: (kind: "process" | "group", id: string, stage: string) => Record<string, unknown>;
  onDropGroup: (stage: string, group: string) => void;
  onDropProcess: (stage: string, targetId: string) => void;
  onMoveGroup: (group: string, dir: -1 | 1) => void;
  onMoveProcess: (id: string, dir: -1 | 1) => void;
  onRenameGroup: (sub: LifecycleSubstage, name: string) => void;
  onRetireGroup: (sub: LifecycleSubstage) => void;
  teams: readonly Team[];
  propertyCount: (id: string) => number;
  taskCount: (id: string) => number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  confirmDelete: string | null;
  onAskDelete: (id: string | null) => void;
  onDelete: (p: Process) => void;
  onRename: (p: Process, name: string) => void;
  onAdd: (stage: string, group?: string | null) => void;
}) {
  return (
    <section className="panel pipe">
      <div className="panel-head">
        <Text type="text2" weight="bold">{stage}</Text>
        <Text type="text3" color="secondary">
          {count} process{count === 1 ? "" : "es"} · a job runs them top to bottom
        </Text>
      </div>

      <div className="pipe-head" aria-hidden>
        <span className="pipe-col-run">#</span>
        <span>Process name</span>
        <span>Team</span>
        <span className="pipe-col-days">Days</span>
        <span>Collects</span>
        <span />
      </div>

      {blocks.map((b, bi) => (
        <div className="pipe-block" key={`${stage}:${b.key}:${bi}`}>
          <div
            className={`pipe-group${dropOn === b.key && dragging ? " is-drop" : ""}`}
            {...(b.key ? dragProps("group", b.key, stage) : {})}
            onDrop={e => { e.preventDefault(); if (b.key) onDropGroup(stage, b.key); }}
          >
            {canEdit && b.key && <span className="drag-dots" aria-hidden title="Drag to reorder this sub-stage">⠿</span>}
            {/* The name is a box, like a process's: renaming a sub-stage is data, because the
                processes carry its id and nothing follows the words. */}
            {canEdit && b.sub ? (
              <BlurText
                value={b.group}
                label={`Name of sub-stage ${b.group} in ${stage}`}
                onCommit={v => onRenameGroup(b.sub!, v)}
              />
            ) : <Text type="text2" weight="bold" element="span">{b.group}</Text>}
            <Text type="text3" color="secondary" element="span">
              {b.list.length === 0
                ? "no processes yet"
                : `runs ${b.list[0].n}–${b.list[b.list.length - 1].n}`}
            </Text>
            {canEdit && b.key && (
              <Button size="xs" kind="tertiary" onClick={() => onAdd(stage, b.key)}
                aria-label={`Add a process to ${b.group}`}>
                + Add
              </Button>
            )}
            {/* Retiring takes the block out of the pickers and off this screen. Only an empty
                one: a block with processes would take them with it, and the honest way to
                empty it is to move them. `holds` counts what is in the block before the
                filters, so a filter cannot make a full block look retirable. */}
            {canEdit && b.sub && (
              <Tooltip content={b.holds > 0
                ? "Move its processes out first — retiring a block would take them off this screen"
                : "Retire this sub-stage: it leaves the pickers and this screen"}>
                <span>
                  <Button size="xs" kind="tertiary" disabled={b.holds > 0}
                    aria-label={`Retire sub-stage ${b.group}`}
                    onClick={() => onRetireGroup(b.sub!)}>
                    Retire
                  </Button>
                </span>
              </Tooltip>
            )}
            {/* The arrows step through the stage's sub-stages, and `bi` is this block's place
                among the blocks DRAWN. They are the same list now that every active sub-stage
                draws, empty or not — before that an empty block between two others made the
                first click look like a broken button, because the move happened out of
                sight. */}
            {canEdit && b.key && (
              <span className="pipeline-group-moves">
                <Button size="xs" kind="tertiary" aria-label={`Move sub-stage ${b.group} earlier`}
                  disabled={bi === 0} onClick={() => onMoveGroup(b.key, -1)}>
                  <MoveArrowUp size={16} aria-hidden />
                </Button>
                <Button size="xs" kind="tertiary" aria-label={`Move sub-stage ${b.group} later`}
                  disabled={bi === blocks.filter(x => x.sub).length - 1} onClick={() => onMoveGroup(b.key, 1)}>
                  <MoveArrowDown size={16} aria-hidden />
                </Button>
              </span>
            )}
          </div>

          {b.list.map(({ p, n }) => (
            <div key={p.id}>
              <div
                className={`pipe-row${p.id === selectedId ? " is-selected" : ""}${dropOn === p.id && dragging ? " is-drop" : ""}${p.isActive ? "" : " is-retired"}`}
                {...dragProps("process", p.id, stage)}
                onDrop={e => { e.preventDefault(); onDropProcess(stage, p.id); }}
              >
                <span className="pipe-col-run">
                  {canEdit && <span className="drag-dots" aria-hidden title="Drag to reorder">⠿</span>}
                  {n}
                </span>

                {/* The name is a box you type in, not a cell you click through to.
                    One edit is one write: BlurText commits on blur or Enter, never per key. */}
                <span className="pipe-name">
                  <BlurText
                    value={p.name}
                    label={`Name of process ${n} in ${stage}`}
                    disabled={!canEdit}
                    plain={!canEdit}
                    onCommit={v => onRename(p, v)}
                  />
                  {p.isMilestone && <span className="slot-chip is-current">milestone</span>}
                  {p.isExternal && <span className="slot-chip">external</span>}
                  {!p.isActive && <span className="slot-chip">retired</span>}
                </span>

                {/* The labels are for the narrow layout, where the cells stack under the
                    name and a bare "3" beside a bare em dash says nothing at all. CSS
                    draws them from `data-label`; the wide layout has real headers. */}
                <span className="muted" data-label="Team">{p.owningTeam ? teamName(p.owningTeam, teams) : "—"}</span>
                {/* Blank stays blank: no agreed duration is not zero days. */}
                <span className="pipe-col-days muted" data-label="Days">{p.expectedDays ?? "—"}</span>
                <span className="muted" data-label="Collects">
                  {propertyCount(p.id) || taskCount(p.id)
                    ? [
                      propertyCount(p.id) ? `${propertyCount(p.id)} propert${propertyCount(p.id) === 1 ? "y" : "ies"}` : null,
                      taskCount(p.id) ? `${taskCount(p.id)} checklist` : null
                    ].filter(Boolean).join(" · ")
                    : "—"}
                </span>

                <span className="row-actions">
                  {canEdit && (
                    <>
                      <Button size="xs" kind="tertiary" aria-label={`Move ${p.name} earlier`} onClick={() => onMoveProcess(p.id, -1)}>
                        <MoveArrowUp size={16} aria-hidden />
                      </Button>
                      <Button size="xs" kind="tertiary" aria-label={`Move ${p.name} later`} onClick={() => onMoveProcess(p.id, 1)}>
                        <MoveArrowDown size={16} aria-hidden />
                      </Button>
                    </>
                  )}
                  <Button size="xs" kind="tertiary" onClick={() => onSelect(p.id)}>
                    {canEdit ? "Edit properties" : "Open"}
                  </Button>
                  {canEdit && <Button size="xs" kind="tertiary" onClick={() => onAskDelete(p.id)}>Delete</Button>}
                </span>
              </div>

              {confirmDelete === p.id && (
                /* Two clicks, the second one named: retiring keeps the history, this does not. */
                <div className="pipe-confirm field-inline" role="alert">
                  <Text type="text2" element="span" ellipsis={false}>
                    Delete <strong>{p.name}</strong> for good? Its checklist and its place in the order go with it.
                    A process that has run on a record is refused — retire it instead.
                  </Text>
                  <Button size="small" color="negative" onClick={() => onDelete(p)}>Delete for good</Button>
                  <Button size="small" kind="tertiary" onClick={() => onAskDelete(null)}>Keep it</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {canEdit && (
        <button type="button" className="pipe-add" onClick={() => onAdd(stage)}>
          + Add a process to {stage}
        </button>
      )}
    </section>
  );
}

function ProcessRow({
  p, n, teams, properties, tasks, canEdit, selected, onSelect, confirming, onAskDelete, onDelete,
  nested, showStage, dropping, rowProps, onMove, columnsCount
}: {
  p: Process;
  n: number;
  teams: readonly Team[];
  properties: number;
  tasks: number;
  canEdit: boolean;
  selected: boolean;
  onSelect: (id: string | null) => void;
  confirming: boolean;
  onAskDelete: (id: string | null) => void;
  onDelete: (p: Process) => void;
  nested?: boolean;
  showStage?: boolean;
  dropping?: boolean;
  rowProps?: Record<string, unknown>;
  onMove?: (dir: -1 | 1) => void;
  columnsCount: number;
}) {
  return (
    <>
      <tr
        className={`contact-row${selected ? " is-selected" : ""}${nested ? " is-nested" : ""}${dropping ? " is-drop" : ""}`}
        onClick={() => onSelect(p.id)}
        aria-current={selected ? "true" : undefined}
        {...rowProps}
      >
        <td className="num">
          {canEdit && nested && <span className="drag-dots" aria-hidden title="Drag to reorder">⠿</span>}
          {n}
        </td>
        <td>
          <button type="button" className="link-button tap-link" onClick={e => { e.stopPropagation(); onSelect(p.id); }}>
            <strong>{p.name}</strong>
          </button>
          {p.isExternal && <span className="slot-chip">external</span>}
          {!p.isActive && <span className="slot-chip">retired</span>}
        </td>
        <td className="muted">{p.substageName ?? NO_GROUP}</td>
        <td className="muted">{showStage ? p.stageName : <span className="muted">{p.stageName}</span>}</td>
        <td className="muted">{p.owningTeam ? teamName(p.owningTeam, teams) : "—"}</td>
        {/* Amber asked to see "if it is a milestone" from the list, so it is a column of its
            own rather than a chip that only appears when true — a blank cell in a column
            called Milestone answers the question; a missing chip only fails to raise it. */}
        <td>{p.isMilestone ? <span className="slot-chip is-current">milestone</span> : <span className="muted">—</span>}</td>
        {/* Blank stays blank: no duration is not zero days (Amber, 2 Sep, on the at-risk column). */}
        <td className="num">{p.expectedDays ?? <span className="muted">—</span>}</td>
        <td className="num">{properties || <span className="muted">—</span>}</td>
        <td className="num">{tasks || <span className="muted">—</span>}</td>
        <td className="muted">
          {/* 0091 stamps the editor on every write, and writes null when the writer was a
              script rather than a person. Null is said as null: attributing a migration to
              whoever ran it would put a name on screen that did not do the thing. */}
          {whenText(p.updatedAt)}
          <span className="slot-sub">{p.updatedBy ?? "no author recorded"}</span>
        </td>
        <td onClick={e => e.stopPropagation()}>
          <div className="row-actions">
            {canEdit && onMove && (
              <>
                <Button size="xs" kind="tertiary" aria-label={`Move ${p.name} earlier`} onClick={() => onMove(-1)}>
                  <MoveArrowUp size={16} aria-hidden />
                </Button>
                <Button size="xs" kind="tertiary" aria-label={`Move ${p.name} later`} onClick={() => onMove(1)}>
                  <MoveArrowDown size={16} aria-hidden />
                </Button>
              </>
            )}
            <Button size="xs" kind="tertiary" onClick={() => onSelect(p.id)}>{canEdit ? "Edit" : "Open"}</Button>
            {canEdit && <Button size="xs" kind="tertiary" onClick={() => onAskDelete(p.id)}>Delete</Button>}
          </div>
        </td>
      </tr>
      {confirming && (
        /* Two clicks, the second one named: retiring keeps the history, this does not. */
        <tr className="confirm-row">
          <td colSpan={columnsCount}>
            <div className="field-inline" role="alert" onClick={e => e.stopPropagation()}>
              <Text type="text2" element="span" ellipsis={false}>
                Delete <strong>{p.name}</strong> for good? Its checklist and its place in the order go with it.
                A process that has run on a record is refused — retire it instead.
              </Text>
              <Button size="small" color="negative" onClick={() => onDelete(p)}>Delete for good</Button>
              <Button size="small" kind="tertiary" onClick={() => onAskDelete(null)}>Keep it</Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ------------------------------------------------------------------ new process
function NewProcessPanel({ stageNames, teams, stage, group, substagesFor, onCreateSubstage, onCancel, onCreated }: {
  stageNames: string[];
  teams: readonly Team[];
  /** The stage its "+ Add a process" was clicked in, so the picker opens on that one. */
  stage?: string | null;
  /** And the sub-stage's id, when the add came from a block: "added into that pipeline". */
  group?: string | null;
  substagesFor: (stage: string) => LifecycleSubstage[];
  onCreateSubstage: (stageName: string, name: string) => Promise<string | null>;
  onCancel: () => void;
  onCreated: (p: Process) => void;
}) {
  const repo = useRepository();
  const firstStage = stage ?? WORKING_STAGES[1];
  const [draft, setDraft] = useState<NewProcess>({
    key: "", name: "", stageName: firstStage, scope: "job",
    // The block it was added from, else the stage's first: an active process needs one,
    // and the database says so if this is left empty.
    substageId: group ?? substagesFor(firstStage)[0]?.id ?? null
  });
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[a-z][a-z0-9_]*$/.test(draft.key) && draft.name.trim() !== "" && draft.stageName !== "" && !!draft.substageId;

  async function save() {
    setSaving(true); setError(null);
    try { onCreated(await repo.createProcess(draft)); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <SidePanel
      open
      title="New process"
      onClose={onCancel}
      footer={
        <div className="field-inline">
          <Button size="small" onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : "Add process"}</Button>
          <Button size="small" kind="tertiary" onClick={onCancel}>Cancel</Button>
        </div>
      }
    >
      {error && <Problem>{error}</Problem>}
      <div className="create-form">
        <Field label="Name" required>
          <TextField value={draft.name} id="proc-name" inputAriaLabel="Process name"
            onChange={v => setDraft({ ...draft, name: v, key: keyTouched ? draft.key : slugify(v) })} />
        </Field>
        <Field label="Key" required hint="the identity — lowercase letters, digits and underscores">
          <TextField value={draft.key} id="proc-key" inputAriaLabel="Process key"
            onChange={v => { setKeyTouched(true); setDraft({ ...draft, key: v }); }} />
        </Field>
        <Field label="Lifecycle stage" required>
          <Select ordered aria-label="Lifecycle stage" options={stageNames.map(s => ({ value: s, label: s }))}
            value={draft.stageName}
            onChange={v => setDraft({ ...draft, stageName: v, substageId: substagesFor(v)[0]?.id ?? null })} />
        </Field>
        {/* Amber, 3 Sep: "when adding a process to a group it can [be] selected from that
            pipeline [and] added into that pipeline". It was not on this panel at all, so a
            new process could only be filed into a block by saving it and reopening it. */}
        <Field label="Sub-stage" required hint="the block it runs in inside the stage; a stage with none needs one made first">
          <GroupPicker
            value={draft.substageId ?? null}
            groups={substagesFor(draft.stageName)}
            noneLabel="Choose a sub-stage"
            onChange={id => setDraft({ ...draft, substageId: id })}
            onCreate={name => onCreateSubstage(draft.stageName, name)}
          />
        </Field>
        <Field label="Appears on" required hint="the project's drawer, or each job's — it does not limit which properties the process can collect">
          <Select aria-label="Appears on" options={PROPERTY_SCOPES.map(s => ({ value: s, label: s }))}
            value={draft.scope} onChange={v => setDraft({ ...draft, scope: v as PropertyScope })} />
        </Field>
        <Field label="Team" hint="who does the work — leave blank if nobody is named">
          <Select aria-label="Owning team" clearable placeholder="No team"
            options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
            value={draft.owningTeam ?? null} onChange={v => setDraft({ ...draft, owningTeam: v as TeamId | null })} />
        </Field>
      </div>
    </SidePanel>
  );
}

// -------------------------------------------------------------------- the editor
function ProcessEditor({ process: p, all, deps, teams, stageNames, substagesFor, substageNames, onCreateSubstage, canEdit, onChanged, onError, onDeleted }: {
  process: Process;
  all: Process[];
  deps: ProcessDependency[];
  teams: readonly Team[];
  stageNames: string[];
  /** The sub-stages a stage has, active, in the stage's order (0127). */
  substagesFor: (stage: string) => LifecycleSubstage[];
  /** Sub-stage id → name, so the history reads names where the trail holds uuids. */
  substageNames: Map<string, string>;
  onCreateSubstage: (stageName: string, name: string) => Promise<string | null>;
  canEdit: boolean;
  onChanged: () => void;
  onError: (e: string | null) => void;
  onDeleted: () => void;
}) {
  const repo = useRepository();
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function patch(change: ProcessPatch) {
    setSaving(true); setProblem(null); onError(null);
    try { await repo.updateProcess(p.id, change); onChanged(); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const waitsOn = deps.filter(d => d.processId === p.id);
  const leadsTo = deps.filter(d => d.dependsOnProcessId === p.id);
  const byId = new Map(all.map(x => [x.id, x]));
  const teamOptions = teams.filter(t => t.isActive || t.id === p.owningTeam).map(t => ({ value: t.id, label: t.name }));

  return (
    <div className="stack" aria-label={`Details of ${p.name}`}>
      {problem && <Problem>{problem}</Problem>}
      <section className="panel">
        <div className="panel-head">
          <div>
            <div className="slot-sub">
              <code>{p.key}</code> · {p.stageName}{p.substageName && <> · {p.substageName}</>}{p.importRef && <> · from {p.importRef}</>}
              {p.isMilestone && <span className="slot-chip is-current">milestone</span>}
              {!p.isActive && <span className="slot-chip">retired</span>}
            </div>
            <Text type="text3" color="secondary" element="div" ellipsis={false}>
              Last updated {whenText(p.updatedAt)} · {p.updatedBy ?? "no author recorded"}
            </Text>
          </div>
          <div className="panel-actions">
            {canEdit && (
              <Button size="small" kind="tertiary" onClick={() => patch({ isActive: !p.isActive })} disabled={saving}>
                {p.isActive ? "Retire" : "Restore"}
              </Button>
            )}
          </div>
        </div>

        <div className="create-form">
          <Field label="Name" required>
            <BlurText value={p.name} disabled={!canEdit || saving} label="Process name" onCommit={v => v.trim() && patch({ name: v.trim() })} wide />
          </Field>
          {/* A stage with no sub-stages is not offered: an active process needs one (0127), so
              moving there would be refused. Moving to a stage that has some lands in its
              first, shown in the field below so it can be changed on the spot. */}
          <Field label="Lifecycle stage" required>
            {canEdit ? (
              <Select ordered aria-label="Lifecycle stage"
                options={stageNames.filter(s => s === p.stageName || substagesFor(s).length > 0).map(s => ({ value: s, label: s }))}
                value={p.stageName}
                onChange={v => patch({ stageName: v, substageId: substagesFor(v)[0]?.id ?? null })} />
            ) : <Text type="text2">{p.stageName}</Text>}
          </Field>
          <Field label="Sub-stage" required hint="the block it runs in inside the stage: Stage 1, Footings, 1 Month. Reorder the blocks on the list">
            {canEdit
              ? (
                <GroupPicker
                  value={p.substageId}
                  groups={substagesFor(p.stageName)}
                  noneLabel={NO_GROUP}
                  onChange={id => patch({ substageId: id })}
                  onCreate={name => onCreateSubstage(p.stageName, name)}
                />
              )
              : <Text type="text2">{p.substageName ?? NO_GROUP}</Text>}
          </Field>
          {/*
            Was "Runs on", and read as though it also decided which properties the process
            could collect. Amber, 3 Sep: "processes will often include job and project
            properties, so it isn't either/or and that needs to be removed." The restriction
            is gone — a process collects properties of both scopes — and this field now says
            only what it actually decides, which is whose drawer the process appears in.
          */}
          <Field label="Appears on" required hint="the project's drawer, or each job's. It does not limit which properties the process collects">
            {canEdit ? (
              <Select aria-label="Appears on" options={PROPERTY_SCOPES.map(s => ({ value: s, label: s }))} value={p.scope} onChange={v => patch({ scope: v as PropertyScope })} />
            ) : <Text type="text2">{p.scope}</Text>}
          </Field>
          <Field label="Team" hint="who does the work">
            {canEdit ? (
              <Select aria-label="Owning team" clearable placeholder="No team named" options={teamOptions} value={p.owningTeam} onChange={v => patch({ owningTeam: v as TeamId | null })} />
            ) : <Text type="text2">{p.owningTeam ? teamName(p.owningTeam, teams) : "No team named"}</Text>}
          </Field>
          <Field label="Expected days" hint="how long a run should take from its start. Blank means no agreed duration, not zero">
            <NumberInput value={p.expectedDays} disabled={!canEdit || saving} label="Expected days" min={0} onCommit={v => patch({ expectedDays: v })} />
          </Field>
          <Field label="At-risk lead (days)" hint="how many days before the due date a run flags at risk — must be shorter than the duration">
            <NumberInput value={p.atRiskLeadDays} disabled={!canEdit || saving} label="At-risk lead days" min={0} onCommit={v => patch({ atRiskLeadDays: v })} />
          </Field>
          <Field label="Milestone" hint="counted at the stage — never turned into a percentage">
            <Checkbox label="Passing this process is a milestone of its stage" checked={p.isMilestone} disabled={!canEdit || saving} onChange={() => patch({ isMilestone: !p.isMilestone })} />
          </Field>
          <Field label="External" hint="council, SA Water, a consultant — late is not the team's fault">
            <Checkbox label="Waits on somebody outside Lofty" checked={p.isExternal} disabled={!canEdit || saving} onChange={() => patch({ isExternal: !p.isExternal })} />
          </Field>
          <Field label="Optional">
            <Checkbox label="Optional in its sub-stage" checked={p.isOptional} disabled={!canEdit || saving} onChange={() => patch({ isOptional: !p.isOptional })} />
          </Field>
          <Field label="Number in the stage" hint="its place in the flow. Dragging on the list renumbers the whole stage; this sets one">
            <NumberInput value={p.position} disabled={!canEdit || saving} label="Number in the stage" onCommit={v => patch({ position: v ?? 0 })} />
          </Field>
          <Field label="Description">
            <BlurText value={p.description ?? ""} disabled={!canEdit || saving} label="Description" onCommit={v => patch({ description: v.trim() || null })} wide plain />
          </Field>
          <Field label="Automation" hint="how this process will run itself, when it does — a note today">
            <BlurText value={p.automation ?? ""} disabled={!canEdit || saving} label="Automation" onCommit={v => patch({ automation: v.trim() || null })} wide plain />
          </Field>
          <Field label="SharePoint subfolder" hint="inside the record's folder — a name, not a link">
            <BlurText value={p.sharepointFolder ?? ""} disabled={!canEdit || saving} label="SharePoint subfolder" onCommit={v => patch({ sharepointFolder: v.trim() || null })} plain />
          </Field>
        </div>
      </section>

      <DependenciesEditor process={p} all={all} waitsOn={waitsOn} leadsTo={leadsTo} byId={byId} canEdit={canEdit} onChanged={onChanged} onError={setProblem} />
      <StepsEditor process={p} teams={teams} canEdit={canEdit} onChanged={onChanged} onError={setProblem} />
      <ProcessHistory process={p} substageNames={substageNames} />

      {canEdit && (
        <section className="panel">
          {!confirmDelete ? (
            <div className="field-inline">
              <Button size="small" kind="tertiary" onClick={() => setConfirmDelete(true)}>Delete process…</Button>
              <Text type="text3" color="secondary" element="span" ellipsis={false}>
                Removes its checklist and its place in the order. A process with runs on a record is refused — retire it instead.
              </Text>
            </div>
          ) : (
            /* Two clicks, the second one named: retiring keeps the history, this does not. */
            <div className="field-inline" role="alert">
              <Text type="text2" element="span" ellipsis={false}>Delete <strong>{p.name}</strong> for good?</Text>
              <Button size="small" color="negative" onClick={async () => {
                setProblem(null);
                try { await repo.deleteProcess(p.id); onDeleted(); }
                catch (e) { setProblem(e instanceof Error ? e.message : String(e)); setConfirmDelete(false); }
              }}>Delete for good</Button>
              <Button size="small" kind="tertiary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------- history
/**
 * What happened to this process, when, and who did it (Amber, 3 Sep: processes "need to
 * show in processes when they were last updated and by who and what happened").
 *
 * "What happened" is the field-by-field diff, not the word "updated": knowing that
 * somebody touched a row is not knowing that the expected days went from 10 to 25. The
 * rows come from `activity_audit`, which every active person may read, so this shows the
 * same thing to everybody — the audit trail is not a manager's private view.
 */
const FIELD_LABELS: Record<string, string> = {
  process_name: "Name",
  process_key: "Key",
  process_stage_name: "Lifecycle stage",
  lifecycle_substage_id: "Sub-stage",
  process_is_optional: "Optional",
  process_scope: "Appears on",
  process_owning_team: "Team",
  process_expected_days: "Expected days",
  process_at_risk_lead_days: "At-risk lead",
  process_is_milestone: "Milestone",
  process_is_external: "External",
  process_position: "Number in the stage",
  process_is_active: "Active",
  process_description: "Description",
  process_automation: "Automation",
  process_sharepoint_folder: "SharePoint subfolder"
};
const fieldLabel = (f: string) =>
  FIELD_LABELS[f] ?? f.replace(/^process_/, "").replace(/_/g, " ").replace(/^./, c => c.toUpperCase());

function ProcessHistory({ process: p, substageNames }: {
  process: Process;
  /**
   * Sub-stage id → name. The audit trail stores what the column holds, and since 0127 that
   * is a uuid, so the drawer would read `Sub-stage 8f3c… → 0a17…` where it used to read
   * `Group Stage 1 → Stage 2`. A trail nobody can read is not a trail.
   */
  substageNames: Map<string, string>;
}) {
  const { data: history } = useQuery<ProcessHistoryEntry[]>(r => r.listProcessHistory(p.id), [], [p.id, p.updatedAt]);

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">History</Text>
        <Text type="text3" color="secondary">what changed, when, and who changed it</Text>
      </div>
      {history.length === 0 ? (
        <Text type="text3" color="secondary" ellipsis={false}>
          Nothing recorded. A row shows history from the first time it is edited; a seeded row has none yet.
        </Text>
      ) : (
        <ul className="slot-history-list">
          {history.map((h, i) => (
            <li key={`${h.at}:${i}`} style={{ flexDirection: "column", alignItems: "stretch", gap: 2 }}>
              <Text type="text3" color="secondary" element="div">
                {new Date(h.at).toLocaleString()} · {h.by ?? "someone whose profile is gone"}
                {h.operation === "INSERT" && " · created"}
                {h.operation === "DELETE" && " · deleted"}
              </Text>
              {h.changes.length === 0 && h.operation === "UPDATE" && (
                <Text type="text3" color="secondary" element="div" ellipsis={false}>Saved with no field changed.</Text>
              )}
              {h.changes.map(c => {
                // A sub-stage change is stored as two uuids; show the names they stand for,
                // and fall back to the raw value for a block that has since been deleted.
                const read = (v: string | null) =>
                  c.field === "lifecycle_substage_id" && v ? substageNames.get(v) ?? v : v;
                const from = read(c.from), to = read(c.to);
                return (
                  <Text type="text3" element="div" key={c.field} ellipsis={false}>
                    <strong>{fieldLabel(c.field)}</strong>{" "}
                    {/* An emptied field is shown as the word, not as nothing: "Team → " reads
                        as a rendering bug, "Team → cleared" reads as what happened. */}
                    {from == null || from === "" ? <em>blank</em> : from} → {to == null || to === "" ? <em>cleared</em> : to}
                  </Text>
                );
              })}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ dependencies
function DependenciesEditor({ process: p, all, waitsOn, leadsTo, byId, canEdit, onChanged, onError }: {
  process: Process; all: Process[]; waitsOn: ProcessDependency[]; leadsTo: ProcessDependency[];
  byId: Map<string, Process>; canEdit: boolean; onChanged: () => void; onError: (e: string | null) => void;
}) {
  const repo = useRepository();
  const [adding, setAdding] = useState<string | null>(null);
  const candidates = all.filter(x => x.id !== p.id && x.isActive && !waitsOn.some(d => d.dependsOnProcessId === x.id));

  async function write(next: { processId: string; lagDays: number }[]) {
    onError(null);
    try { await repo.setProcessDependencies(p.id, next); onChanged(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }
  const current = waitsOn.map(d => ({ processId: d.dependsOnProcessId, lagDays: d.lagDays }));

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Order</Text>
        <Text type="text3" color="secondary">what this waits on, and what waits on it</Text>
      </div>
      <Text type="text3" weight="bold">Waits on</Text>
      {waitsOn.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>Nothing — it can start as soon as its stage does.</Text>}
      <ul className="dep-list">
        {waitsOn.map(d => (
          <li key={d.dependsOnProcessId}>
            <Text type="text2" element="span" style={{ flex: "1 1 200px" }}>{byId.get(d.dependsOnProcessId)?.name ?? "?"}</Text>
            <Text type="text3" color="secondary" element="span">then</Text>
            <NumberInput small min={0} value={d.lagDays} disabled={!canEdit} label={`Lag after ${byId.get(d.dependsOnProcessId)?.name ?? "the process"}`}
              onCommit={v => { const lag = Math.max(0, v ?? 0); if (lag !== d.lagDays) write(current.map(c => c.processId === d.dependsOnProcessId ? { ...c, lagDays: lag } : c)); }} />
            <Text type="text3" color="secondary" element="span">days</Text>
            {canEdit && <Button size="xs" kind="tertiary" onClick={() => write(current.filter(c => c.processId !== d.dependsOnProcessId))}>Remove</Button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="field-inline" style={{ marginTop: "var(--space-8)", flexWrap: "wrap" }}>
          <Select aria-label="Add a process this waits on" clearable placeholder="Add a process this waits on…"
            options={candidates.map(c => ({ value: c.id, label: `${c.name} (${c.stageName}${c.substageName ? `, ${c.substageName}` : ""})` }))}
            value={adding} onChange={v => setAdding(v)} />
          <Button size="small" disabled={!adding} onClick={() => { if (adding) { write([...current, { processId: adding, lagDays: 0 }]); setAdding(null); } }}>Add</Button>
        </div>
      )}
      <div style={{ marginTop: "var(--space-12)" }}>
        <Text type="text3" weight="bold">Leads to</Text>
        {leadsTo.length === 0
          ? <Text type="text3" color="secondary" ellipsis={false}>Nothing waits on this process.</Text>
          : <Text type="text2" ellipsis={false}>{leadsTo.map(d => byId.get(d.processId)?.name ?? "?").join(" · ")}</Text>}
        <Text type="text3" color="secondary" ellipsis={false} element="p">
          Edit the other side from the process that waits — a dependency is stored once.
        </Text>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------------- steps
/**
 * The one list a process is (0128): properties to record, tasks to do, tick boxes to tick,
 * automations to fire, in the order the process works through them.
 *
 * This replaced two editors and a third list. Until 0131 a process was three tables —
 * `process_properties`, `process_tasks` and `process_task_checklist_items` — with three
 * orderings that could not be interleaved, so "record the plan number, THEN send it to the
 * Acquisitions team, THEN tick that they replied" could not be written down. Amber's
 * walk-through of Working Drawings on 15 September is one numbered list, and this is it.
 *
 * The kind decides which fields mean anything, and the database says so with a CHECK per
 * kind rather than by convention, so this editor offers a field only where the kind allows
 * it: no team on a tick box, no SLA on a property, no property key on an automation.
 */
function StepsEditor({ process: p, teams, canEdit, onChanged, onError }: {
  process: Process; teams: readonly Team[]; canEdit: boolean;
  onChanged: () => void; onError: (e: string | null) => void;
}) {
  const repo = useRepository();
  const { propertyDefs } = usePropertyDefs();
  const [reload, setReload] = useState(0);
  const { data: steps } = useQuery(r => r.listProcessSteps(p.id), [], [p.id, reload]);
  const { data: deps } = useQuery(r => r.listProcessStepDependencies(p.id), [], [p.id, reload]);
  const [addingProperty, setAddingProperty] = useState<string | null>(null);
  const [newTask, setNewTask] = useState("");
  const [newAutomation, setNewAutomation] = useState("");

  async function run(fn: () => Promise<unknown>) {
    onError(null);
    try { await fn(); setReload(n => n + 1); onChanged(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }

  const defByKey = useMemo(() => new Map(propertyDefs.map(d => [d.key, d])), [propertyDefs]);
  const taskSteps = useMemo(() => steps.filter(st => st.kind === "task"), [steps]);

  // Parents in position order, each followed by its children. Same shape the checklist
  // editor had, because a tick box under its task is how the list reads on paper.
  const ordered = useMemo(() => {
    const out: ProcessStep[] = [];
    const children = (id: string) => steps.filter(st => st.parentId === id).sort((a, b) => a.position - b.position);
    steps.filter(st => st.parentId == null).sort((a, b) => a.position - b.position).forEach(st => {
      out.push(st);
      children(st.id).forEach(c => out.push(c));
    });
    // A step whose parent is gone still shows — better a stray row than a step nobody can find.
    steps.filter(st => st.parentId != null && !steps.some(x => x.id === st.parentId)).forEach(st => out.push(st));
    return out;
  }, [steps]);

  const stepLabel = (st: ProcessStep) =>
    st.kind === "property" ? defByKey.get(st.propertyKey ?? "")?.label ?? st.propertyKey ?? "?" : st.name ?? "?";

  /**
   * Move a step among ITS SIBLINGS, then write the flattened order 1..n.
   *
   * Swapping with the next row on screen would move a task past one of its own tick boxes,
   * which the tree then puts straight back — so the swap is with the next step that has the
   * same parent, and the whole process is renumbered from the tree afterwards.
   */
  const move = (st: ProcessStep, dir: -1 | 1) => {
    const siblings = steps.filter(x => x.parentId === st.parentId).sort((a, b) => a.position - b.position);
    const i = siblings.findIndex(x => x.id === st.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    const swapped = [...siblings];
    [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
    const order = new Map(swapped.map((x, n) => [x.id, n]));
    const flat: string[] = [];
    const push = (x: ProcessStep) => {
      flat.push(x.id);
      steps.filter(c => c.parentId === x.id)
        .sort((a, b) => (order.get(a.id) ?? a.position) - (order.get(b.id) ?? b.position))
        .forEach(push);
    };
    steps.filter(x => x.parentId == null)
      .sort((a, b) => (order.get(a.id) ?? a.position) - (order.get(b.id) ?? b.position))
      .forEach(push);
    steps.filter(x => x.parentId != null && !steps.some(y => y.id === x.parentId)).forEach(x => flat.push(x.id));
    run(() => repo.reorderProcessSteps(p.id, flat));
  };
  const siblingCount = (st: ProcessStep) => steps.filter(x => x.parentId === st.parentId).length;
  const siblingIndex = (st: ProcessStep) =>
    steps.filter(x => x.parentId === st.parentId).sort((a, b) => a.position - b.position).findIndex(x => x.id === st.id);

  // Both scopes, deliberately: a process asks for what it asks for, and 0079 already has
  // job properties attached to project processes and the other way round (Amber, 3 Sep).
  const candidates = propertyDefs
    .filter(d => d.isActive && !steps.some(st => st.kind === "property" && st.propertyKey === d.key))
    .sort((a, b) => (a.stageName === p.stageName ? 0 : 1) - (b.stageName === p.stageName ? 0 : 1) || a.label.localeCompare(b.label));

  const counts = {
    property: steps.filter(st => st.kind === "property").length,
    task: taskSteps.length,
    checklist: steps.filter(st => st.kind === "checklist").length,
    automation: steps.filter(st => st.kind === "automation").length
  };
  const summary = [
    counts.property ? `${counts.property} to record` : null,
    counts.task ? `${counts.task} to do` : null,
    counts.checklist ? `${counts.checklist} to tick` : null,
    counts.automation ? `${counts.automation} automated` : null
  ].filter(Boolean).join(" · ");

  const addTask = () => {
    if (!newTask.trim()) return;
    run(() => repo.createProcessStep({ processId: p.id, kind: "task", name: newTask.trim() }));
    setNewTask("");
  };
  const addAutomation = () => {
    if (!newAutomation.trim()) return;
    run(() => repo.createProcessStep({
      processId: p.id, kind: "automation", name: newAutomation.trim(), automation: newAutomation.trim()
    }));
    setNewAutomation("");
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Steps ({steps.length})</Text>
        <Text type="text3" color="secondary">{summary || "in the order the process works through them"}</Text>
      </div>
      {steps.length === 0 && (
        <Text type="text3" color="secondary" ellipsis={false}>
          This process has no steps yet. Add the first property it records, or the first task it hands out.
        </Text>
      )}
      {ordered.map(st => (
        <StepRow
          key={st.id} step={st} steps={steps} taskSteps={taskSteps}
          waitsOn={deps.filter(d => d.stepId === st.id)}
          label={stepLabel(st)} defByKey={defByKey} propertyDefs={propertyDefs}
          teams={teams} canEdit={canEdit} run={run}
          index={siblingIndex(st)} siblings={siblingCount(st)} onMove={move}
          labelOf={stepLabel}
        />
      ))}
      {canEdit && (
        <div className="proc-body" style={{ marginTop: "var(--space-12)" }}>
          <div className="field-inline" style={{ flexWrap: "wrap" }}>
            <Select aria-label="Add a property this process records" clearable placeholder="Add a property…"
              options={candidates.map(d => ({ value: d.key, label: `${d.label} — ${d.stageName} (${d.scope})` }))}
              value={addingProperty} onChange={v => setAddingProperty(v)} />
            <Button size="small" disabled={!addingProperty}
              onClick={() => {
                if (!addingProperty) return;
                run(() => repo.createProcessStep({ processId: p.id, kind: "property", propertyKey: addingProperty }));
                setAddingProperty(null);
              }}>Add property</Button>
          </div>
          <div className="field-inline" style={{ marginTop: "var(--space-8)", flexWrap: "wrap" }}>
            <input className="pf-input" style={{ width: "min(320px, 100%)" }} aria-label="New task name" placeholder="Add a task…"
              value={newTask} onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addTask(); }} />
            <Button size="small" disabled={!newTask.trim()} onClick={addTask}>Add task</Button>
          </div>
          <div className="field-inline" style={{ marginTop: "var(--space-8)", flexWrap: "wrap" }}>
            <input className="pf-input" style={{ width: "min(320px, 100%)" }} aria-label="New automation" placeholder="Add an automation…"
              value={newAutomation} onChange={e => setNewAutomation(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addAutomation(); }} />
            <Button size="small" disabled={!newAutomation.trim()} onClick={addAutomation}>Add automation</Button>
          </div>
          <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-8)" }}>
            A tick box is added under the task it belongs to. Job and project properties both — a process
            asks for whichever it needs; define new ones in the Properties tab. An automation is a note
            until Setup → Automations gives it something to fire.
          </Text>
        </div>
      )}
    </section>
  );
}

const STEP_KIND_LABELS: Record<ProcessStepKind, string> = {
  property: "Record",
  task: "Task",
  checklist: "Tick box",
  automation: "Automation"
};

/**
 * One step, with everything about it in view — nothing behind an "Order" or "More" button,
 * because the sidebar is the place to edit and it shows the whole thing (Amber, 2 Sep).
 *
 * Which fields appear is the kind's business: the CHECK constraints in 0128 refuse a team on
 * a tick box, so offering the control would be offering a refusal.
 */
function StepRow({
  step: st, steps, taskSteps, waitsOn, label, defByKey, propertyDefs, teams, canEdit, run, index, siblings, onMove, labelOf
}: {
  step: ProcessStep; steps: ProcessStep[]; taskSteps: ProcessStep[]; waitsOn: ProcessStepDependency[];
  label: string; defByKey: Map<string, PropertyDef>; propertyDefs: readonly PropertyDef[];
  teams: readonly Team[]; canEdit: boolean; run: (fn: () => Promise<unknown>) => Promise<void>;
  index: number; siblings: number; onMove: (step: ProcessStep, dir: -1 | 1) => void;
  labelOf: (step: ProcessStep) => string;
}) {
  const repo = useRepository();
  const [adding, setAdding] = useState<string | null>(null);
  const [newLine, setNewLine] = useState("");
  const byId = new Map(steps.map(x => [x.id, x]));
  const current = waitsOn.map(d => ({ stepId: d.dependsOnStepId, lagDays: d.lagDays }));
  const others = steps.filter(x => x.id !== st.id);
  const teamOptions = teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }));
  const def = st.kind === "property" ? defByKey.get(st.propertyKey ?? "") : undefined;
  const addLine = () => {
    if (!newLine.trim()) return;
    run(() => repo.createProcessStep({ processId: st.processId, kind: "checklist", name: newLine.trim(), parentId: st.id }));
    setNewLine("");
  };

  return (
    <div className={`tpl-task${st.parentId ? " is-child" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="field-inline" style={{ flexWrap: "wrap" }}>
        <span className="tpl-name">
          {st.kind === "property" ? (
            <Text type="text2" element="span">
              {label}
              <span className="slot-sub">
                {def ? [def.scope, def.format === "unknown" ? "format not set" : def.format, def.stageName].filter(Boolean).join(" · ") : "definition missing"}
              </span>
            </Text>
          ) : (
            <BlurText value={label} disabled={!canEdit} label={`${STEP_KIND_LABELS[st.kind]} ${label}`} wide plain
              onCommit={v => v.trim() && run(() => repo.updateProcessStep(st.id, { name: v.trim() }))} />
          )}
          {st.importRef != null && <span className="slot-sub">line {st.importRef}</span>}
        </span>
        <Text type="text3" color="secondary" element="span">{STEP_KIND_LABELS[st.kind]}</Text>
        {st.kind === "task" && (
          <>
            {canEdit ? (
              <Select className="proc-control" aria-label={`Team for ${label}`} clearable placeholder="No team" options={teamOptions}
                value={st.owningTeam} onChange={v => run(() => repo.updateProcessStep(st.id, { owningTeam: v as TeamId | null }))} />
            ) : <Text type="text3" color="secondary" element="span">{st.owningTeam ? teamName(st.owningTeam, teams) : "no team"}</Text>}
            <NumberInput value={st.expectedDays} disabled={!canEdit} label={`Days for ${label}`} small min={0}
              onCommit={v => run(() => repo.updateProcessStep(st.id, { expectedDays: v }))} />
            <Text type="text3" color="secondary" element="span">days</Text>
            <label className="pf-check">
              <input type="checkbox" checked={st.isExternal} disabled={!canEdit}
                onChange={e => run(() => repo.updateProcessStep(st.id, { isExternal: e.target.checked }))} />
              <Text type="text3" element="span">external</Text>
            </label>
          </>
        )}
        <label className="pf-check">
          <input type="checkbox" checked={st.isRequired} disabled={!canEdit}
            onChange={e => run(() => repo.updateProcessStep(st.id, { isRequired: e.target.checked }))} />
          <Text type="text3" element="span">required to complete</Text>
        </label>
        {canEdit && (
          <>
            <Button size="xs" kind="tertiary" aria-label={`Move ${label} up`} disabled={index <= 0} onClick={() => onMove(st, -1)}>
              <MoveArrowUp size={16} aria-hidden />
            </Button>
            <Button size="xs" kind="tertiary" aria-label={`Move ${label} down`} disabled={index < 0 || index >= siblings - 1} onClick={() => onMove(st, 1)}>
              <MoveArrowDown size={16} aria-hidden />
            </Button>
            <Button size="xs" kind="tertiary" onClick={() => run(() => repo.deleteProcessStep(st.id))}>Remove</Button>
          </>
        )}
      </div>

      <div className="proc-body">
        {st.kind === "automation" && (
          <div className="field-inline" style={{ flexWrap: "wrap" }}>
            <Text type="text3" element="span">Does</Text>
            <BlurText value={st.automation ?? ""} disabled={!canEdit} label={`What ${label} does`} wide plain
              onCommit={v => v.trim() && run(() => repo.updateProcessStep(st.id, { automation: v.trim() }))} />
          </div>
        )}

        {st.kind === "task" && (
          <div className="field-inline" style={{ flexWrap: "wrap" }}>
            <Text type="text3" element="span">Stamps</Text>
            {canEdit ? (
              <Select className="proc-control" aria-label={`Property ${label} stamps when it is ticked`} clearable
                placeholder="Nothing — ticking it records no date"
                options={propertyDefs.filter(d => d.isActive && d.format === "date").map(d => ({ value: d.key, label: `${d.label} — ${d.stageName}` }))}
                value={st.stampsPropertyKey}
                onChange={v => run(() => repo.updateProcessStep(st.id, { stampsPropertyKey: v }))} />
            ) : (
              <Text type="text3" color="secondary" element="span">
                {st.stampsPropertyKey ? defByKey.get(st.stampsPropertyKey)?.label ?? st.stampsPropertyKey : "nothing"}
              </Text>
            )}
          </div>
        )}

        {(st.kind === "task" || st.kind === "checklist") && (
          <div className="field-inline" style={{ flexWrap: "wrap" }}>
            <Text type="text3" element="span">Under</Text>
            {canEdit ? (
              <Select className="proc-control" aria-label={`Parent of ${label}`} clearable={st.kind === "task"}
                placeholder={st.kind === "checklist" ? "Pick the task it sits under" : "No parent — a top-level task"}
                options={taskSteps.filter(x => x.id !== st.id && x.parentId == null).map(x => ({ value: x.id, label: labelOf(x) }))}
                value={st.parentId} onChange={(v: string | null) => run(() => repo.updateProcessStep(st.id, { parentId: v }))} />
            ) : (
              <Text type="text3" color="secondary" element="span">
                {st.parentId ? labelOf(byId.get(st.parentId) ?? st) : "nothing — a top-level task"}
              </Text>
            )}
          </div>
        )}

        <Text type="text3" weight="bold" element="div" style={{ marginTop: "var(--space-8)" }}>Waits on</Text>
        {waitsOn.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>Nothing — it can start with the run.</Text>}
        <ul className="dep-list">
          {waitsOn.map(d => (
            <li key={d.dependsOnStepId}>
              <Text type="text2" element="span" style={{ flex: "1 1 160px" }}>
                {byId.has(d.dependsOnStepId) ? labelOf(byId.get(d.dependsOnStepId)!) : "?"}
              </Text>
              <Text type="text3" color="secondary" element="span">then</Text>
              <NumberInput small min={0} value={d.lagDays} disabled={!canEdit}
                label={`Lag after ${byId.has(d.dependsOnStepId) ? labelOf(byId.get(d.dependsOnStepId)!) : "the step"}`}
                onCommit={v => {
                  const lag = Math.max(0, v ?? 0);
                  if (lag !== d.lagDays) {
                    run(() => repo.setProcessStepDependencies(st.id, current.map(c => c.stepId === d.dependsOnStepId ? { ...c, lagDays: lag } : c)));
                  }
                }} />
              <Text type="text3" color="secondary" element="span">days</Text>
              {canEdit && (
                <Button size="xs" kind="tertiary"
                  onClick={() => run(() => repo.setProcessStepDependencies(st.id, current.filter(c => c.stepId !== d.dependsOnStepId)))}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="field-inline" style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
            <Select aria-label={`Add a step ${label} waits on`} clearable placeholder="Add a step this waits on…"
              options={others.filter(x => !current.some(c => c.stepId === x.id)).map(x => ({ value: x.id, label: labelOf(x) }))}
              value={adding} onChange={v => setAdding(v)} />
            <Button size="small" disabled={!adding}
              onClick={() => {
                if (!adding) return;
                run(() => repo.setProcessStepDependencies(st.id, [...current, { stepId: adding, lagDays: 0 }]));
                setAdding(null);
              }}>Add</Button>
          </div>
        )}

        {st.kind === "task" && canEdit && (
          <div className="field-inline" style={{ marginTop: "var(--space-8)", flexWrap: "wrap" }}>
            <input className="pf-input" style={{ width: "min(320px, 100%)" }} aria-label={`New tick box for ${label}`} placeholder="Add a tick box…"
              value={newLine} onChange={e => setNewLine(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addLine(); }} />
            <Button size="small" disabled={!newLine.trim()} onClick={addLine}>Add</Button>
          </div>
        )}
      </div>
    </div>
  );
}
