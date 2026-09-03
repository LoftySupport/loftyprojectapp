import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Checkbox, Text, TextField } from "@vibe/core";
import { MoveArrowDown, MoveArrowUp } from "@vibe/icons";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useProcessProperties, useProcesses, usePropertyDefs, useStages, useTeams } from "../data/useLookups";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import { SidePanel } from "../components/SidePanel";
import { SortHeader, sortRows, type SortState } from "../components/SortableTable";
import { BlurText, NumberInput } from "../components/InlineInputs";
import {
  PROPERTY_SCOPES, WORKING_STAGES, teamName,
  type NewProcess, type Process, type ProcessDependency, type ProcessHistoryEntry, type ProcessPatch, type ProcessTask,
  type ProcessTaskChecklistItem, type ProcessTaskDependency, type PropertyScope, type Team, type TeamId
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
const NO_GROUP = "Not in a group";
const groupLabel = (g: string | null) => g ?? NO_GROUP;

const whenText = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

type Col = "pipeline" | "name" | "group" | "stage" | "team" | "milestone" | "days" | "updated";

/**
 * The stage's canonical order: groups as contiguous blocks in the order their first
 * process falls, each block in position order. Two processes with the same position fall
 * back to their names so the order is stable rather than whatever the array arrived in.
 */
function stageOrder(list: Process[]): Process[] {
  const sorted = [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const seen: string[] = [];
  const blocks = new Map<string, Process[]>();
  for (const p of sorted) {
    const k = groupLabel(p.stageGroup);
    if (!blocks.has(k)) { blocks.set(k, []); seen.push(k); }
    blocks.get(k)!.push(p);
  }
  return seen.flatMap(k => blocks.get(k)!);
}

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
  const { data: allTasks } = useQuery(r => r.listProcessTasks(), [], [reload]);

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
  const tasksByProcess = useMemo(() => {
    const m = new Map<string, number>();
    allTasks.forEach(t => m.set(t.processId, (m.get(t.processId) ?? 0) + 1));
    return m;
  }, [allTasks]);
  const groupNames = useMemo(
    () => [...new Set(processes.map(p => groupLabel(p.stageGroup)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [processes]
  );

  const shown = useMemo(() => {
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return processes.filter(p =>
      (showRetired || p.isActive || p.id === selectedId)
      && (!stageFilter || p.stageName === stageFilter)
      && (!teamFilter || p.owningTeam === teamFilter)
      && (!groupFilter || groupLabel(p.stageGroup) === groupFilter)
      && terms.every(t => `${p.name} ${p.key} ${p.stageGroup ?? ""} ${p.owningTeam ? teamName(p.owningTeam, teams) : ""}`.toLowerCase().includes(t))
    );
  }, [processes, search, showRetired, selectedId, stageFilter, teamFilter, groupFilter, teams]);
  const visible = useMemo(() => new Set(shown.map(p => p.id)), [shown]);

  /** What each sortable column compares on. `pipeline` is the stage's own numbering. */
  const columns = useMemo(() => ({
    pipeline: (p: Process) => p.position,
    name: (p: Process) => p.name,
    group: (p: Process) => p.stageGroup,
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
   * The pipeline, as stage → group → processes, with the stage's running number attached.
   * Built from the FULL stage list so the numbers on screen are the numbers in the column
   * even when a filter is hiding rows between them, then narrowed to what is shown.
   */
  const pipeline = useMemo(() => stages.map(stage => {
    const ordered = stageOrder(processes.filter(p => p.stageName === stage));
    const blocks: { group: string; list: { p: Process; n: number }[] }[] = [];
    ordered.forEach((p, i) => {
      const g = groupLabel(p.stageGroup);
      const last = blocks[blocks.length - 1];
      const row = { p, n: i + 1 };
      if (last && last.group === g) last.list.push(row);
      else blocks.push({ group: g, list: [row] });
    });
    const kept = blocks
      .map(b => ({ ...b, list: b.list.filter(r => visible.has(r.p.id)) }))
      .filter(b => b.list.length > 0);
    return { stage, blocks: kept, count: kept.reduce((n, b) => n + b.list.length, 0) };
  }).filter(s => s.count > 0), [stages, processes, visible]);

  /**
   * One move, expressed as "rewrite this stage's order". `mutate` gets the stage's whole
   * list in its canonical order and returns the order it should be in; only the rows whose
   * number or group changed are written, so a nudge is two writes and not forty-nine.
   */
  async function reorder(stage: string, mutate: (arr: Process[]) => Process[]) {
    const before = stageOrder(processes.filter(p => p.stageName === stage));
    const was = new Map(before.map(p => [p.id, { position: p.position, group: p.stageGroup ?? null }]));
    const orders = mutate(before)
      .map((p, i) => ({ id: p.id, stageGroup: p.stageGroup ?? null, position: i + 1 }))
      .filter(o => {
        const b = was.get(o.id);
        return !b || b.position !== o.position || b.group !== o.stageGroup;
      });
    if (orders.length === 0) return;
    setError(null);
    try { await repo.reorderProcesses(orders); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  /** Lift one process out and drop it at `index`, taking `group` with it. */
  const spliceProcess = (arr: Process[], id: string, index: number, group: string | null) => {
    const from = arr.findIndex(p => p.id === id);
    if (from === -1) return arr;
    const out = arr.slice();
    const [moved] = out.splice(from, 1);
    const at = from < index ? index - 1 : index;
    out.splice(at, 0, { ...moved, stageGroup: group });
    return out;
  };

  /** Lift a whole group block out and drop it in front of the block at `index`. */
  const spliceGroup = (arr: Process[], group: string, index: number) => {
    const block = arr.filter(p => groupLabel(p.stageGroup) === group);
    if (block.length === 0) return arr;
    const rest = arr.filter(p => groupLabel(p.stageGroup) !== group);
    const removedBefore = arr.slice(0, index).filter(p => groupLabel(p.stageGroup) === group).length;
    const out = rest.slice();
    out.splice(index - removedBefore, 0, ...block);
    return out;
  };

  const moveProcessBy = (stage: string, id: string, dir: -1 | 1) =>
    reorder(stage, arr => {
      const i = arr.findIndex(p => p.id === id);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= arr.length) return arr;
      // Stepping past a group boundary joins the group you stepped into — which is what
      // moving a process down out of "Stage 1" and into "Stage 2" is asking to do.
      return spliceProcess(arr, id, dir === -1 ? j : j + 1, arr[j].stageGroup ?? null);
    });

  const moveGroupBy = (stage: string, group: string, dir: -1 | 1) =>
    reorder(stage, arr => {
      const order = [...new Set(arr.map(p => groupLabel(p.stageGroup)))];
      const i = order.indexOf(group);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= order.length) return arr;
      const target = dir === -1
        ? arr.findIndex(p => groupLabel(p.stageGroup) === order[j])
        : arr.map(p => groupLabel(p.stageGroup)).lastIndexOf(order[j]) + 1;
      return spliceGroup(arr, group, target);
    });

  const onDropProcess = (stage: string, targetId: string) => {
    const d = dragging;
    setDragging(null); setDropOn(null);
    if (!d || d.stage !== stage) return;
    if (d.kind === "process") {
      if (d.id === targetId) return;
      void reorder(stage, arr => {
        const to = arr.findIndex(p => p.id === targetId);
        if (to === -1) return arr;
        return spliceProcess(arr, d.id, to, arr[to].stageGroup ?? null);
      });
    } else {
      void reorder(stage, arr => {
        const to = arr.findIndex(p => p.id === targetId);
        if (to === -1) return arr;
        return spliceGroup(arr, d.id, to);
      });
    }
  };

  const onDropGroup = (stage: string, group: string) => {
    const d = dragging;
    setDragging(null); setDropOn(null);
    if (!d || d.stage !== stage) return;
    if (d.kind === "group") {
      if (d.id === group) return;
      void reorder(stage, arr => spliceGroup(arr, d.id, arr.findIndex(p => groupLabel(p.stageGroup) === group)));
    } else {
      // Dropped on a heading: joins that group, at the top of it.
      void reorder(stage, arr => {
        const to = arr.findIndex(p => groupLabel(p.stageGroup) === group);
        if (to === -1) return arr;
        const target = arr[to];
        return spliceProcess(arr, d.id, to, target.stageGroup ?? null);
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
        and the groups are the blocks that flow is made of. Drag a process, or a whole group, to change
        that order. Click one to open it.
      </Text>

      {error && <Problem>{error}</Problem>}

      <div className="toolbar" style={{ marginTop: "var(--space-12)" }}>
        <Select aria-label="Filter by lifecycle stage" clearable placeholder="All stages" options={stages.map(s => ({ value: s, label: s }))}
          value={stageFilter} onChange={setStageFilter} />
        <Select aria-label="Filter by team" clearable placeholder="All teams"
          options={teams.filter(t => t.isActive || processes.some(p => p.owningTeam === t.id)).map(t => ({ value: t.id, label: t.name }))}
          value={teamFilter} onChange={setTeamFilter} />
        <Select aria-label="Filter by group" clearable placeholder="All groups" options={groupNames.map(g => ({ value: g, label: g }))}
          value={groupFilter} onChange={setGroupFilter} />
        <TextField size="small" id="procs-search" inputAriaLabel="Search processes" placeholder="Search…" value={search} onChange={setSearch} />
        <Checkbox label="Show retired" checked={showRetired} onChange={() => setShowRetired(v => !v)} />
        {!pipelineView && (
          <Button size="small" kind="tertiary" onClick={() => setSort({ key: "pipeline", direction: "asc" })}>Back to pipeline order</Button>
        )}
        {canEdit && <Button size="small" onClick={() => setParam({ new: "1", process: null })}>+ New process</Button>}
      </div>

      {!pipelineView && (
        <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-4)" }}>
          Sorted by a column, so this is a flat list and dragging is off — a pipeline sorted by team is
          not a pipeline. Go back to pipeline order to change what runs when.
        </Text>
      )}

      <section className="panel" style={{ marginTop: "var(--space-12)" }}>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader<Col> column="pipeline" label="#" sort={sort} onSort={toggleSort} className="num" />
                <SortHeader<Col> column="name" label="Process" sort={sort} onSort={toggleSort} />
                <SortHeader<Col> column="group" label="Group / pipeline" sort={sort} onSort={toggleSort} />
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

            {pipelineView ? pipeline.map(s => (
              <tbody className="group" key={s.stage}>
                <tr className="group-head">
                  <th colSpan={columnsCount} scope="colgroup">{s.stage} · {s.count}</th>
                </tr>
                {s.blocks.map((b, bi) => (
                  <PipelineBlock
                    key={`${s.stage}:${b.group}:${bi}`}
                    stage={s.stage}
                    block={b}
                    canEdit={canEdit}
                    canMoveUp={bi > 0}
                    canMoveDown={bi < s.blocks.length - 1}
                    dropOn={dropOn}
                    dragging={dragging}
                    dragProps={dragProps}
                    onDropGroup={onDropGroup}
                    onDropProcess={onDropProcess}
                    onMoveGroup={dir => moveGroupBy(s.stage, b.group, dir)}
                    onMoveProcess={(id, dir) => moveProcessBy(s.stage, id, dir)}
                    teams={teams}
                    propertyCount={id => (propsByProcess.get(id) ?? []).length}
                    taskCount={id => tasksByProcess.get(id) ?? 0}
                    selectedId={selectedId}
                    onSelect={select}
                    confirmDelete={confirmDelete}
                    onAskDelete={setConfirmDelete}
                    onDelete={remove}
                    columnsCount={columnsCount}
                  />
                ))}
              </tbody>
            )) : (
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
            )}
          </table>
          {processes.length === 0 && (
            <Text type="text2" color="secondary" element="p" ellipsis={false}>No processes defined yet.</Text>
          )}
          {processes.length > 0 && shown.length === 0 && (
            <Text type="text2" color="secondary" element="p" ellipsis={false}>Nothing matches — clear the search or the filters.</Text>
          )}
        </div>
      </section>

      {creating && canEdit && (
        <NewProcessPanel
          stageNames={stages}
          teams={teams}
          onCancel={() => setParam({ new: null })}
          onCreated={p => { bump(); select(p.id); }}
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

// -------------------------------------------------------------------- the pipeline
function PipelineBlock({
  stage, block, canEdit, canMoveUp, canMoveDown, dropOn, dragging, dragProps, onDropGroup, onDropProcess,
  onMoveGroup, onMoveProcess, teams, propertyCount, taskCount, selectedId, onSelect, confirmDelete, onAskDelete, onDelete, columnsCount
}: {
  stage: string;
  block: { group: string; list: { p: Process; n: number }[] };
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  dropOn: string | null;
  dragging: { kind: "process" | "group"; id: string; stage: string } | null;
  dragProps: (kind: "process" | "group", id: string, stage: string) => Record<string, unknown>;
  onDropGroup: (stage: string, group: string) => void;
  onDropProcess: (stage: string, targetId: string) => void;
  onMoveGroup: (dir: -1 | 1) => void;
  onMoveProcess: (id: string, dir: -1 | 1) => void;
  teams: readonly Team[];
  propertyCount: (id: string) => number;
  taskCount: (id: string) => number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  confirmDelete: string | null;
  onAskDelete: (id: string | null) => void;
  onDelete: (p: Process) => void;
  columnsCount: number;
}) {
  return (
    <>
      <tr
        className={`pipeline-group${dropOn === block.group && dragging ? " is-drop" : ""}`}
        {...dragProps("group", block.group, stage)}
        onDrop={e => { e.preventDefault(); onDropGroup(stage, block.group); }}
      >
        <td colSpan={columnsCount}>
          <div className="pipeline-group-head">
            {canEdit && <span className="drag-dots" aria-hidden title="Drag to reorder this group">⠿</span>}
            <Text type="text2" weight="bold" element="span">{block.group}</Text>
            <Text type="text3" color="secondary" element="span">
              {block.list.length} process{block.list.length === 1 ? "" : "es"} · runs {block.list[0].n}–{block.list[block.list.length - 1].n}
            </Text>
            {canEdit && (
              <span className="pipeline-group-moves">
                <Button size="xs" kind="tertiary" aria-label={`Move group ${block.group} earlier`} disabled={!canMoveUp} onClick={() => onMoveGroup(-1)}>
                  <MoveArrowUp size={16} aria-hidden />
                </Button>
                <Button size="xs" kind="tertiary" aria-label={`Move group ${block.group} later`} disabled={!canMoveDown} onClick={() => onMoveGroup(1)}>
                  <MoveArrowDown size={16} aria-hidden />
                </Button>
              </span>
            )}
          </div>
        </td>
      </tr>
      {block.list.map(({ p, n }) => (
        <ProcessRow
          key={p.id} p={p} n={n} teams={teams} nested
          properties={propertyCount(p.id)} tasks={taskCount(p.id)}
          canEdit={canEdit} selected={p.id === selectedId} onSelect={onSelect}
          confirming={confirmDelete === p.id} onAskDelete={onAskDelete} onDelete={onDelete}
          dropping={dropOn === p.id && Boolean(dragging)}
          rowProps={{
            ...dragProps("process", p.id, stage),
            onDrop: (e: React.DragEvent) => { e.preventDefault(); onDropProcess(stage, p.id); }
          }}
          onMove={dir => onMoveProcess(p.id, dir)}
          columnsCount={columnsCount}
        />
      ))}
    </>
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
        <td className="muted">{p.stageGroup ?? NO_GROUP}</td>
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
function NewProcessPanel({ stageNames, teams, onCancel, onCreated }: {
  stageNames: string[];
  teams: readonly Team[];
  onCancel: () => void;
  onCreated: (p: Process) => void;
}) {
  const repo = useRepository();
  const [draft, setDraft] = useState<NewProcess>({ key: "", name: "", stageName: WORKING_STAGES[1], scope: "job" });
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[a-z][a-z0-9_]*$/.test(draft.key) && draft.name.trim() !== "" && draft.stageName !== "";

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
          <Select aria-label="Lifecycle stage" options={stageNames.map(s => ({ value: s, label: s }))}
            value={draft.stageName} onChange={v => setDraft({ ...draft, stageName: v })} />
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
function ProcessEditor({ process: p, all, deps, teams, stageNames, canEdit, onChanged, onError, onDeleted }: {
  process: Process;
  all: Process[];
  deps: ProcessDependency[];
  teams: readonly Team[];
  stageNames: string[];
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
              <code>{p.key}</code> · {p.stageName}{p.stageGroup && <> · {p.stageGroup}</>}{p.importRef && <> · from {p.importRef}</>}
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
          <Field label="Lifecycle stage" required>
            {canEdit ? (
              <Select aria-label="Lifecycle stage" options={stageNames.map(s => ({ value: s, label: s }))} value={p.stageName} onChange={v => patch({ stageName: v })} />
            ) : <Text type="text2">{p.stageName}</Text>}
          </Field>
          <Field label="Group / pipeline" hint="the block it runs in inside the stage — Stage 1, Stage 2, Variation. Reorder the blocks on the list">
            <BlurText value={p.stageGroup ?? ""} disabled={!canEdit || saving} label="Group" onCommit={v => patch({ stageGroup: v.trim() || null })} plain />
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
      <PropertiesEditor process={p} canEdit={canEdit} onChanged={onChanged} onError={setProblem} />
      <ChecklistEditor process={p} teams={teams} canEdit={canEdit} onError={setProblem} />
      <ProcessHistory process={p} />

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
  process_stage_group: "Group",
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

function ProcessHistory({ process: p }: { process: Process }) {
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
              {h.changes.map(c => (
                <Text type="text3" element="div" key={c.field} ellipsis={false}>
                  <strong>{fieldLabel(c.field)}</strong>{" "}
                  {/* An emptied field is shown as the word, not as nothing: "Team → " reads
                      as a rendering bug, "Team → cleared" reads as what happened. */}
                  {c.from == null || c.from === "" ? <em>blank</em> : c.from} → {c.to == null || c.to === "" ? <em>cleared</em> : c.to}
                </Text>
              ))}
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
            options={candidates.map(c => ({ value: c.id, label: `${c.name} (${c.stageName}${c.stageGroup ? `, ${c.stageGroup}` : ""})` }))}
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

// -------------------------------------------------------------------- properties
function PropertiesEditor({ process: p, canEdit, onChanged, onError }: {
  process: Process; canEdit: boolean; onChanged: () => void; onError: (e: string | null) => void;
}) {
  const repo = useRepository();
  const { propertyDefs } = usePropertyDefs();
  const { byProcess } = useProcessProperties();
  const [reload, setReload] = useState(0);
  const { data: fresh } = useQuery(r => r.listProcessProperties(), [], [reload]);
  const mine = useMemo(() => (fresh.length ? fresh : Array.from(byProcess.values()).flat()).filter(pp => pp.processId === p.id).sort((a, b) => a.position - b.position), [fresh, byProcess, p.id]);
  const defByKey = new Map(propertyDefs.map(d => [d.key, d]));
  const [adding, setAdding] = useState<string | null>(null);
  // Both scopes, deliberately: a process asks for what it asks for, and 0079 already has
  // job properties attached to project processes and the other way round (Amber, 3 Sep).
  const candidates = propertyDefs.filter(d => d.isActive && !mine.some(pp => pp.propertyKey === d.key))
    .sort((a, b) => (a.stageName === p.stageName ? 0 : 1) - (b.stageName === p.stageName ? 0 : 1) || a.label.localeCompare(b.label));

  async function write(next: { propertyKey: string; required: boolean }[]) {
    onError(null);
    try { await repo.setProcessProperties(p.id, next); setReload(n => n + 1); onChanged(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }
  const current = mine.map(pp => ({ propertyKey: pp.propertyKey, required: pp.required }));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...current]; const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    write(next);
  };
  const jobCount = mine.filter(pp => defByKey.get(pp.propertyKey)?.scope === "job").length;
  const projectCount = mine.filter(pp => defByKey.get(pp.propertyKey)?.scope === "project").length;

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Properties collected ({mine.length})</Text>
        <Text type="text3" color="secondary">
          {jobCount && projectCount ? `${jobCount} job · ${projectCount} project` : "in the order the process asks for them"}
        </Text>
      </div>
      {mine.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>This process collects no properties yet.</Text>}
      <ul className="dep-list">
        {mine.map((pp, i) => {
          const d = defByKey.get(pp.propertyKey);
          return (
            <li key={pp.propertyKey}>
              <Text type="text2" element="span" style={{ flex: "1 1 200px" }}>
                {d?.label ?? pp.propertyKey}
                <span className="slot-sub">{d ? [d.scope, d.format === "unknown" ? "format not set" : d.format, d.stageName !== p.stageName ? d.stageName : null].filter(Boolean).join(" · ") : ""}</span>
              </Text>
              <label className="pf-check">
                <input type="checkbox" checked={pp.required} disabled={!canEdit}
                  onChange={e => write(current.map(c => c.propertyKey === pp.propertyKey ? { ...c, required: e.target.checked } : c))} />
                <Text type="text3" element="span">required to complete</Text>
              </label>
              {canEdit && (
                <>
                  <Button size="xs" kind="tertiary" aria-label={`Move ${d?.label ?? pp.propertyKey} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <MoveArrowUp size={16} aria-hidden />
                  </Button>
                  <Button size="xs" kind="tertiary" aria-label={`Move ${d?.label ?? pp.propertyKey} down`} disabled={i === mine.length - 1} onClick={() => move(i, 1)}>
                    <MoveArrowDown size={16} aria-hidden />
                  </Button>
                  <Button size="xs" kind="tertiary" onClick={() => write(current.filter(c => c.propertyKey !== pp.propertyKey))}>Remove</Button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {canEdit && (
        <div className="field-inline" style={{ marginTop: "var(--space-8)", flexWrap: "wrap" }}>
          <Select aria-label="Add a property this process collects" clearable placeholder="Add a property…"
            options={candidates.map(d => ({ value: d.key, label: `${d.label} — ${d.stageName} (${d.scope})` }))}
            value={adding} onChange={v => setAdding(v)} />
          <Button size="small" disabled={!adding} onClick={() => { if (adding) { write([...current, { propertyKey: adding, required: false }]); setAdding(null); } }}>Add</Button>
        </div>
      )}
      <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-8)" }}>
        Job and project properties both — a process asks for whichever it needs. Define new properties,
        their formats and who may see them in the Properties tab.
      </Text>
    </section>
  );
}

// --------------------------------------------------------------------- checklist
/**
 * Every template task with everything about it in view — name, team, days, whether it
 * waits on somebody outside, which task it sits under, what it waits on, and its tick-box
 * lines (0081). Nothing is behind an "Order" or "More" button: the sidebar is the place
 * to edit, so it shows the whole thing (Amber, 2 Sep).
 */
function ChecklistEditor({ process: p, teams, canEdit, onError }: {
  process: Process; teams: readonly Team[]; canEdit: boolean; onError: (e: string | null) => void;
}) {
  const repo = useRepository();
  const [reload, setReload] = useState(0);
  const { data: tasks } = useQuery(r => r.listProcessTasks(p.id), [], [p.id, reload]);
  const { data: deps } = useQuery(r => r.listProcessTaskDependencies(p.id), [], [p.id, reload]);
  const { data: lines } = useQuery(r => r.listProcessTaskChecklist(p.id), [], [p.id, reload]);
  const [newName, setNewName] = useState("");
  const bump = () => setReload(n => n + 1);

  async function run(fn: () => Promise<unknown>) {
    onError(null);
    try { await fn(); bump(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }

  const ordered = useMemo(() => {
    // Parents in position order, each followed by its children.
    const parents = tasks.filter(t => t.parentId == null).sort((a, b) => a.position - b.position);
    const out: ProcessTask[] = [];
    parents.forEach(t => {
      out.push(t);
      tasks.filter(c => c.parentId === t.id).sort((a, b) => a.position - b.position).forEach(c => out.push(c));
    });
    // Orphans whose parent is gone still show.
    tasks.filter(t => t.parentId != null && !tasks.some(x => x.id === t.parentId)).forEach(t => out.push(t));
    return out;
  }, [tasks]);
  const linesByTask = useMemo(() => {
    const m = new Map<string, ProcessTaskChecklistItem[]>();
    lines.forEach(l => { (m.get(l.processTaskId) ?? m.set(l.processTaskId, []).get(l.processTaskId)!).push(l); });
    m.forEach(list => list.sort((a, b) => a.position - b.position));
    return m;
  }, [lines]);
  const teamOptions = teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }));
  const add = () => {
    if (!newName.trim()) return;
    run(() => repo.createProcessTask({ processId: p.id, name: newName.trim(), position: tasks.length + 1 }));
    setNewName("");
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Checklist ({tasks.length})</Text>
        <Text type="text3" color="secondary">the tasks a run hands the record — with team, days and order</Text>
      </div>
      {tasks.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>No checklist. A run of this process creates no tasks.</Text>}
      {ordered.map(t => (
        <TemplateTask key={t.id} task={t} tasks={tasks} waitsOn={deps.filter(d => d.taskId === t.id)} lines={linesByTask.get(t.id) ?? []}
          teamOptions={teamOptions} teams={teams} canEdit={canEdit} run={run} />
      ))}
      {canEdit && (
        <div className="field-inline" style={{ marginTop: "var(--space-8)", flexWrap: "wrap" }}>
          <input className="pf-input" style={{ width: "min(320px, 100%)" }} aria-label="New task name" placeholder="Add a task…" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") add(); }} />
          <Button size="small" disabled={!newName.trim()} onClick={add}>Add task</Button>
        </div>
      )}
    </section>
  );
}

function TemplateTask({ task: t, tasks, waitsOn, lines, teamOptions, teams, canEdit, run }: {
  task: ProcessTask; tasks: ProcessTask[]; waitsOn: ProcessTaskDependency[]; lines: ProcessTaskChecklistItem[];
  teamOptions: { value: string; label: string }[]; teams: readonly Team[]; canEdit: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const repo = useRepository();
  const [adding, setAdding] = useState<string | null>(null);
  const [newLine, setNewLine] = useState("");
  const byId = new Map(tasks.map(x => [x.id, x]));
  const current = waitsOn.map(d => ({ taskId: d.dependsOnTaskId, lagDays: d.lagDays }));
  const others = tasks.filter(x => x.id !== t.id);
  const addLine = () => {
    if (!newLine.trim()) return;
    run(() => repo.addProcessTaskChecklistItem(t.id, newLine.trim()));
    setNewLine("");
  };

  return (
    <div className={`tpl-task${t.parentId ? " is-child" : ""}`} style={{ flexDirection: "column", alignItems: "stretch" }}>
      <div className="field-inline" style={{ flexWrap: "wrap" }}>
        <span className="tpl-name">
          <BlurText value={t.name} disabled={!canEdit} label={`Task ${t.name}`} onCommit={v => v.trim() && run(() => repo.updateProcessTask(t.id, { name: v.trim() }))} wide plain />
          {t.importRef != null && <span className="slot-sub">line {t.importRef}</span>}
        </span>
        {canEdit ? (
          <Select className="proc-control" aria-label={`Team for ${t.name}`} clearable placeholder="No team" options={teamOptions} value={t.owningTeam}
            onChange={v => run(() => repo.updateProcessTask(t.id, { owningTeam: v as TeamId | null }))} />
        ) : <Text type="text3" color="secondary" element="span">{t.owningTeam ? teamName(t.owningTeam, teams) : "no team"}</Text>}
        <NumberInput value={t.expectedDays} disabled={!canEdit} label={`Days for ${t.name}`} small min={0} onCommit={v => run(() => repo.updateProcessTask(t.id, { expectedDays: v }))} />
        <Text type="text3" color="secondary" element="span">days</Text>
        <label className="pf-check">
          <input type="checkbox" checked={t.isExternal} disabled={!canEdit} onChange={e => run(() => repo.updateProcessTask(t.id, { isExternal: e.target.checked }))} />
          <Text type="text3" element="span">external</Text>
        </label>
        {canEdit && <Button size="xs" kind="tertiary" onClick={() => run(() => repo.deleteProcessTask(t.id))}>Remove</Button>}
      </div>

      <div className="proc-body">
        <div className="field-inline" style={{ flexWrap: "wrap" }}>
          <Text type="text3" element="span">Under</Text>
          {canEdit ? (
            <Select className="proc-control" aria-label={`Parent of ${t.name}`} clearable placeholder="No parent — a top-level task"
              options={others.filter(x => x.parentId == null).map(x => ({ value: x.id, label: x.name }))}
              value={t.parentId} onChange={v => run(() => repo.updateProcessTask(t.id, { parentId: v }))} />
          ) : <Text type="text3" color="secondary" element="span">{t.parentId ? byId.get(t.parentId)?.name ?? "?" : "nothing — a top-level task"}</Text>}
        </div>

        <Text type="text3" weight="bold" element="div" style={{ marginTop: "var(--space-8)" }}>Waits on</Text>
        {waitsOn.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>Nothing — it can start with the run.</Text>}
        <ul className="dep-list">
          {waitsOn.map(d => (
            <li key={d.dependsOnTaskId}>
              <Text type="text2" element="span" style={{ flex: "1 1 160px" }}>{byId.get(d.dependsOnTaskId)?.name ?? "?"}</Text>
              <Text type="text3" color="secondary" element="span">then</Text>
              <NumberInput small min={0} value={d.lagDays} disabled={!canEdit} label={`Lag after ${byId.get(d.dependsOnTaskId)?.name ?? "the task"}`}
                onCommit={v => { const lag = Math.max(0, v ?? 0); if (lag !== d.lagDays) run(() => repo.setProcessTaskDependencies(t.id, current.map(c => c.taskId === d.dependsOnTaskId ? { ...c, lagDays: lag } : c))); }} />
              <Text type="text3" color="secondary" element="span">days</Text>
              {canEdit && <Button size="xs" kind="tertiary" onClick={() => run(() => repo.setProcessTaskDependencies(t.id, current.filter(c => c.taskId !== d.dependsOnTaskId)))}>Remove</Button>}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="field-inline" style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
            <Select aria-label={`Add a task ${t.name} waits on`} clearable placeholder="Add a task this waits on…"
              options={others.filter(x => !current.some(c => c.taskId === x.id)).map(x => ({ value: x.id, label: x.name }))}
              value={adding} onChange={v => setAdding(v)} />
            <Button size="small" disabled={!adding} onClick={() => { if (adding) { run(() => repo.setProcessTaskDependencies(t.id, [...current, { taskId: adding, lagDays: 0 }])); setAdding(null); } }}>Add</Button>
          </div>
        )}

        <Text type="text3" weight="bold" element="div" style={{ marginTop: "var(--space-8)" }}>Tick boxes ({lines.length})</Text>
        {lines.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>None — the task is one line when a run creates it.</Text>}
        <ul className="dep-list">
          {lines.map(l => (
            <li key={l.id}>
              <span style={{ flex: "1 1 200px", minWidth: 0 }}>
                <BlurText value={l.text} disabled={!canEdit} label={`Tick box ${l.text}`} onCommit={v => v.trim() && run(() => repo.updateProcessTaskChecklistItem(l.id, { text: v.trim() }))} wide plain />
              </span>
              {canEdit && <Button size="xs" kind="tertiary" aria-label={`Remove tick box ${l.text}`} onClick={() => run(() => repo.deleteProcessTaskChecklistItem(l.id))}>Remove</Button>}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="field-inline" style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
            <input className="pf-input" style={{ width: "min(320px, 100%)" }} aria-label={`New tick box for ${t.name}`} placeholder="Add a tick box…" value={newLine}
              onChange={e => setNewLine(e.target.value)} onKeyDown={e => { if (e.key === "Enter") addLine(); }} />
            <Button size="small" disabled={!newLine.trim()} onClick={addLine}>Add</Button>
          </div>
        )}
      </div>
    </div>
  );
}
