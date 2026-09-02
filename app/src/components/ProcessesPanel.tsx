import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useProcessProperties, useProcesses, usePropertyAccess, useStages, useTeams } from "../data/useLookups";
import {
  PROCESS_RUN_HEALTH_LABELS, PROCESS_RUN_STATUSES, PROCESS_RUN_STATUS_LABELS, isRunOpen, teamName,
  type Process, type ProcessRun, type ProcessRunStatus, type PropertyScope, type RecordTarget, type TeamId
} from "../data/types";
import { PropertySlots } from "./PropertySlots";
import { PartiesPanel } from "./PartiesPanel";
import { Select } from "./Select";
import "./ui.css";
import "./processes.css";

/**
 * Where a record stands in every process of every stage.
 *
 * One panel, stage by stage, the record's own stage open and the rest folded. Under each
 * stage: every process that runs at this level (project or job), with its latest run —
 * or "not started" and a Start button when there is none. Open a process and its
 * properties are right there to record, and its checklist a click away.
 *
 * THE RULES THIS ENCODES
 *
 *   - Health is the view's word, shown as a word. `no_expectation` is not `on_track`.
 *   - No auto-advance (agreed 24 Aug). The stage header counts milestones passed and
 *     processes still open, and says "ready to move on" when nothing is open — and then a
 *     person moves the lifecycle, from the stage control, not this panel.
 *   - Not applicable is a real answer, one click away, because a job with no retaining
 *     wall has finished the retaining process by having none.
 *   - A second attempt is a new row. Completing one and needing it again is an amendment,
 *     and the two durations must both survive.
 *   - Running a process is `user` work; the Select and buttons hide below that rung.
 */
export function ProcessesPanel({
  target,
  scope,
  currentStage,
  title = "Processes",
  reloadKey = 0,
  onChanged
}: {
  target: RecordTarget;
  scope: PropertyScope;
  /** The record's own lifecycle stage — the one that opens by default. */
  currentStage: string;
  title?: string;
  reloadKey?: number;
  onChanged?: () => void;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const [localReload, setLocalReload] = useState(0);
  const key = `${reloadKey}:${localReload}`;

  const { stageNames } = useStages();
  const { teams } = useTeams();
  const { processes } = useProcesses(reloadKey);
  const { byProcess } = useProcessProperties(reloadKey);
  const { byKey: accessByKey } = usePropertyAccess(reloadKey);
  const { data: runs, loading } = useQuery(
    r => r.listProcessRuns(target), [], [target.jobId, target.projectId, key]
  );
  const { data: values } = useQuery(
    r => r.listPropertyValues(target), [], [target.jobId, target.projectId, key]
  );
  const { data: tasks } = useQuery(
    r => r.listTasks({ jobId: target.jobId, projectId: target.projectId }), [], [target.jobId, target.projectId, key]
  );

  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorded = useMemo(() => new Set(values.map(v => v.propertyKey)), [values]);
  const tasksByRun = useMemo(() => {
    const m = new Map<string, { total: number; done: number }>();
    tasks.forEach(t => {
      const runId = t.processRunId;
      if (!runId) return;
      const c = m.get(runId) ?? { total: 0, done: 0 };
      c.total += 1;
      if (t.status === "done") c.done += 1;
      m.set(runId, c);
    });
    return m;
  }, [tasks]);

  /** The latest attempt per process — the one the row shows. Earlier attempts read as history. */
  const latestRun = useMemo(() => {
    const m = new Map<string, ProcessRun>();
    runs.forEach(r => {
      const prior = m.get(r.processId);
      if (!prior || r.attempt > prior.attempt) m.set(r.processId, r);
    });
    return m;
  }, [runs]);

  const applicable = useMemo(
    () => processes.filter(p => p.scope === scope && (p.isActive || latestRun.has(p.id))),
    [processes, scope, latestRun]
  );

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await fn();
      setLocalReload(n => n + 1);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const stages = (stageNames.length ? stageNames : [...new Set(applicable.map(p => p.stageName))])
    .map(stage => ({ stage, processes: applicable.filter(p => p.stageName === stage).sort((a, b) => a.position - b.position) }))
    .filter(s => s.processes.length > 0);

  if (!loading && stages.length === 0) {
    return (
      <section className="panel" aria-label={title}>
        <div className="panel-head"><Text type="text2" weight="bold">{title}</Text></div>
        <Text type="text2" color="secondary" ellipsis={false}>
          No {scope} processes are defined yet. Managers define them in Setup → Processes.
        </Text>
      </section>
    );
  }

  return (
    <section className="panel" aria-label={title}>
      <div className="panel-head">
        <Text type="text2" weight="bold">{title}</Text>
        <Text type="text3" color="secondary">
          {loading
            ? "Loading…"
            : `${runs.filter(r => r.status === "complete").length} complete · ${runs.filter(r => isRunOpen(r.status) && r.status !== "not_started").length} in progress`}
        </Text>
      </div>
      {error && <div className="create-problem" role="alert"><Text type="text2" ellipsis={false}>{error}</Text></div>}

      {stages.map(({ stage, processes: ps }) => {
        const runsHere = ps.map(p => latestRun.get(p.id)).filter((r): r is ProcessRun => r != null);
        const milestones = ps.filter(p => p.isMilestone);
        const milestonesPassed = milestones.filter(p => latestRun.get(p.id)?.status === "complete" || latestRun.get(p.id)?.status === "not_applicable").length;
        const openCount = ps.filter(p => { const r = latestRun.get(p.id); return !r || isRunOpen(r.status); }).length;
        const overdue = runsHere.filter(r => r.health === "overdue").length;
        const atRisk = runsHere.filter(r => r.health === "at_risk").length;
        const isCurrent = stage === currentStage;
        return (
          <details className={`proc-stage${isCurrent ? " is-current" : ""}`} key={stage} open={isCurrent}>
            <summary>
              <span>
                {stage}
                {isCurrent && <span className="slot-chip is-current">current stage</span>}
              </span>
              <span className="proc-summary">
                {milestones.length > 0 && `${milestonesPassed} of ${milestones.length} milestones · `}
                {openCount === 0 ? "nothing open — ready to move on" : `${openCount} open`}
                {overdue > 0 && ` · ${overdue} overdue`}
                {atRisk > 0 && ` · ${atRisk} at risk`}
              </span>
            </summary>
            <ul className="proc-list">
              {ps.map(p => {
                const run = latestRun.get(p.id) ?? null;
                const props = byProcess.get(p.id) ?? [];
                const readable = props.filter(pp => accessByKey.get(pp.propertyKey)?.canRead);
                const recordedHere = readable.filter(pp => recorded.has(pp.propertyKey)).length;
                const requiredMissing = props.filter(pp => pp.required && !recorded.has(pp.propertyKey)).length;
                const taskCount = run ? tasksByRun.get(run.id) : undefined;
                const isOpen = open === p.id;
                const rowBusy = busy === p.id;
                return (
                  <li className="proc-row" key={p.id}>
                    <div className="proc-row-head">
                      <div className="proc-name">
                        <span>
                          <Text type="text2" weight="medium" element="span">{p.name}</Text>
                          {p.isMilestone && <span className="slot-chip" title="A milestone of this stage">milestone</span>}
                          {p.isExternal && <span className="slot-chip" title="Waiting on somebody outside Lofty is expected">external</span>}
                          {!p.isActive && <span className="slot-chip">retired</span>}
                          {run && run.attempt > 1 && <span className="slot-chip">attempt {run.attempt}</span>}
                        </span>
                        <span className="proc-sub">
                          {[
                            p.stageGroup,
                            p.owningTeam ? teamName(p.owningTeam, teams) : null,
                            readable.length ? `${recordedHere} of ${readable.length} recorded` : null,
                            requiredMissing ? `${requiredMissing} required missing` : null,
                            run?.startedAt ? `started ${new Date(run.startedAt).toLocaleDateString()}` : null,
                            run?.dueDate ? `due ${new Date(run.dueDate + "T00:00:00").toLocaleDateString()}` : (run && run.status !== "not_started" && p.expectedDays == null ? "no duration set" : null),
                            run?.status === "waiting" && run.waitingOn ? `waiting on ${teamName(run.waitingOn, teams)}` : null,
                            run?.completedAt ? `done ${new Date(run.completedAt).toLocaleDateString()}${run.daysTaken != null ? ` in ${run.daysTaken}d` : ""}` : null,
                            taskCount ? `${taskCount.done}/${taskCount.total} tasks` : null
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                      <div className="proc-controls">
                        <HealthChip run={run} />
                        {can("user") && run && (
                          <Select
                            className="proc-control"
                            size="small"
                            aria-label={`Status of ${p.name}`}
                            options={PROCESS_RUN_STATUSES.map(s => ({ value: s, label: PROCESS_RUN_STATUS_LABELS[s] }))}
                            value={run.status}
                            onChange={v => {
                              const status = v as ProcessRunStatus;
                              if (status === "waiting" && !run.waitingOn) {
                                // Waiting has to name a team; open the row so the picker shows.
                                setOpen(p.id);
                                act(p.id, () => repo.updateProcessRun(run.id, { status, waitingOn: p.owningTeam ?? teams.find(t => t.isActive)?.id ?? null }));
                                return;
                              }
                              act(p.id, () => repo.updateProcessRun(run.id, { status }));
                            }}
                          />
                        )}
                        {can("user") && !run && (
                          <>
                            <Button size="small" disabled={rowBusy} onClick={() => act(p.id, () => repo.startProcessRun(target, p.id, "in_progress"))}>
                              Start
                            </Button>
                            <Button size="small" kind="tertiary" disabled={rowBusy} onClick={() => act(p.id, () => repo.startProcessRun(target, p.id, "not_applicable"))}>
                              Not applicable
                            </Button>
                          </>
                        )}
                        {can("user") && run && run.status === "complete" && (
                          <Button size="small" kind="tertiary" disabled={rowBusy} aria-label={`Start a new attempt of ${p.name} — a second pass, keeping the first`}
                            onClick={() => act(p.id, () => repo.startProcessRun(target, p.id, "in_progress"))}>
                            New attempt
                          </Button>
                        )}
                        {(props.length > 0 || run) && (
                          <Button size="small" kind="tertiary" aria-expanded={isOpen} aria-controls={`proc-body-${p.id}`} onClick={() => setOpen(isOpen ? null : p.id)}>
                            {isOpen ? "Less" : "Open"}
                          </Button>
                        )}
                      </div>
                    </div>

                    {isOpen && (
                      <div className="proc-body" id={`proc-body-${p.id}`}>
                        {run && run.status === "waiting" && can("user") && (
                          <div className="field-inline" style={{ marginBottom: "var(--space-8)" }}>
                            <Text type="text3" element="span">Waiting on</Text>
                            <Select
                              className="proc-control"
                              aria-label={`Who ${p.name} is waiting on`}
                              options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
                              value={run.waitingOn}
                              onChange={v => act(p.id, () => repo.updateProcessRun(run.id, { waitingOn: v as TeamId }))}
                            />
                          </div>
                        )}
                        {run && (
                          <RunNote run={run} disabled={!can("user") || rowBusy}
                            onSave={note => act(p.id, () => repo.updateProcessRun(run.id, { note }))} />
                        )}
                        {run && can("user") && !taskCount && (
                          <ChecklistOffer processId={p.id} onCreate={() => act(p.id, () => repo.instantiateProcessTasks(run.id))} busy={rowBusy} />
                        )}
                        {props.length > 0 ? (
                          <PropertySlots
                            scope={scope}
                            target={target}
                            processId={p.id}
                            title={`Recorded by ${p.name}`}
                            reloadKey={localReload + reloadKey}
                            onChanged={() => { setLocalReload(n => n + 1); onChanged?.(); }}
                          />
                        ) : (
                          <Text type="text3" color="secondary" ellipsis={false}>
                            This process collects no properties yet — a manager can attach some in Setup → Processes.
                          </Text>
                        )}
                        {/* Who did this process here — the plumber on the plumbing run — which is
                            what the maintenance categories will read (Amber, answer 3). */}
                        {run && <PartiesPanel target={{ processRunId: run.id }} compact reloadKey={localReload + reloadKey} />}
                        {p.description && <Text type="text3" color="secondary" element="p" ellipsis={false}>{p.description}</Text>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </section>
  );
}

export function HealthChip({ run }: { run: ProcessRun | null }) {
  const health = run ? (run.status === "waiting" ? "waiting" : run.health) : "not_started";
  const label = health === "waiting" ? "Waiting" : PROCESS_RUN_HEALTH_LABELS[health as keyof typeof PROCESS_RUN_HEALTH_LABELS] ?? health;
  return <span className={`health is-${health}`}>{label}</span>;
}

function RunNote({ run, disabled, onSave }: { run: ProcessRun; disabled: boolean; onSave: (note: string | null) => void }) {
  const [draft, setDraft] = useState(run.note ?? "");
  return (
    <div className="field-inline" style={{ marginBottom: "var(--space-8)" }}>
      <input
        className="pf-input"
        style={{ width: "min(420px, 100%)" }}
        aria-label={`Note on ${run.processName}`}
        placeholder="A note — why it is waiting, why it does not apply…"
        value={draft}
        disabled={disabled}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (run.note ?? "")) onSave(draft.trim() || null); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      />
    </div>
  );
}

/** Offered only when the process actually has a checklist to copy. */
function ChecklistOffer({ processId, onCreate, busy }: { processId: string; onCreate: () => void; busy: boolean }) {
  const { data: templates } = useQuery(r => r.listProcessTasks(processId), [], [processId]);
  if (templates.length === 0) return null;
  return (
    <div className="field-inline" style={{ marginBottom: "var(--space-8)" }}>
      <Text type="text3" color="secondary" element="span">
        This process has a {templates.length}-line checklist.
      </Text>
      <Button size="small" kind="secondary" disabled={busy} onClick={onCreate}>Create the checklist</Button>
    </div>
  );
}

export type { Process };
