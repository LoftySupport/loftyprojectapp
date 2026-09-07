import { useMemo, useState } from "react";
import { Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import {
  useProcessProperties, useProcesses, usePropertyAccess, usePropertyDefs, usePropertyOptions, useStages
} from "../data/useLookups";
import type {
  Process, PropertyDef, PropertyScope, PropertyValue, PropertyValueData, RecordTarget
} from "../data/types";
import { PropertyField, formatValue, hasValue } from "./PropertyField";
import "./ui.css";
import "./processes.css";

/**
 * The field slots, with their values.
 *
 * Every property defined in Setup → Properties that does not already have a column of
 * its own, rendered where it lives: grouped by the stage that captures it and, under
 * that, the process that collects it. A value is edited in place through the seam, and
 * every control is drawn only if the database will accept it — `myPropertyAccess()` is
 * the same function the policies use, so a slot never offers a save it cannot make.
 *
 * WHAT A JOB SEES OF ITS PROJECT
 *
 *   A project-level property has one true answer, on the project, and every job reads it
 *   through. It can also be PUSHED (Amber, 1 Sep) — copied onto the jobs — after which
 *   the job holds its own row. The slot says which it is looking at: "from project" is
 *   read-through and read-only here; "pushed" is the job's own copy, editable, and marked
 *   "differs from project" the day the two stop agreeing.
 *
 * WHAT IS NOT HERE
 *
 *   A property the person may not read. Not a locked row — a locked row says a figure
 *   exists, and on a restricted property the existence is part of what is restricted.
 *   The access map simply does not contain it, and neither does this list.
 */
export function PropertySlots({
  scope,
  target,
  title,
  note,
  processId,
  reloadKey = 0,
  onChanged,
  showHistory = false
}: {
  scope: PropertyScope;
  /** The record the values are on. A job target also reads its project's values through. */
  target: RecordTarget;
  title?: string;
  note?: string;
  /** Only the properties one process collects — the process panel's view. */
  processId?: string;
  reloadKey?: number;
  onChanged?: () => void;
  showHistory?: boolean;
}) {
  const repo = useRepository();
  const [localReload, setLocalReload] = useState(0);
  const key = `${reloadKey}:${localReload}`;

  const { slotsFor, propertyDefs } = usePropertyDefs(reloadKey);
  const { stageNames } = useStages();
  const { access, loading: accessLoading } = usePropertyAccess(reloadKey);
  const { byProperty: optionsByProperty } = usePropertyOptions(reloadKey);
  const { byProcess, byProperty: processesByProperty } = useProcessProperties(reloadKey);
  const { byId: processById } = useProcesses(reloadKey);
  const { data: values, loading: valuesLoading } = useQuery(
    r => r.listPropertyValues(target), [], [target.jobId, target.projectId, key]
  );
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const people = useMemo(
    () => profiles.filter(p => p.active).map(p => ({ id: p.id, name: p.fullName })),
    [profiles]
  );
  const { data: history } = useQuery(
    r => (showHistory ? r.listPropertyValueHistory(target) : Promise.resolve([])),
    [], [target.jobId, target.projectId, key, showHistory]
  );

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A retired definition still shows while a value is recorded in it — hiding the row
  // would hide the value, and the value is the fact.
  const recordedKeys = useMemo(() => new Set(values.map(v => v.propertyKey)), [values]);
  /**
   * WHEN A PROCESS ASKS, THE PROCESS'S OWN LIST IS THE ANSWER — BOTH SCOPES
   *
   * Amber, 3 September: *"processes will often include job and project properties, so it
   * isn't either/or and that needs to be removed."*
   *
   * This used to start from `slotsFor(scope)` in every case, so a process rendered on a job
   * could only ever show its job-scoped properties. That was not a cosmetic filter: on the
   * live database it hid nine property attachments somebody had already configured — one
   * project property on a job-scoped process, and eight job properties on project-scoped
   * ones. They were set up, saved, and invisible.
   *
   * So when a `processId` is given, the process's own list decides, whatever each property's
   * scope says. The value still comes from the right record: `PropertyField` reads a
   * project-scoped property through to the project and marks it "from project", which is
   * the behaviour a job showing its project's answer already had.
   *
   * Without a `processId` this is a record's own panel — "Job properties", "Project
   * properties" — and there the scope IS the question being asked, so it still filters.
   */
  const defs = useMemo(() => {
    const forProcess = processId != null;
    const keys = forProcess ? new Set((byProcess.get(processId) ?? []).map(pp => pp.propertyKey)) : null;
    const live = forProcess ? propertyDefs.filter(d => d.isActive) : slotsFor(scope);
    const retiredWithValues = propertyDefs.filter(
      d => !d.isActive && recordedKeys.has(d.key) && (forProcess || d.scope === scope)
    );
    let all = [...live, ...retiredWithValues].filter(d => access(d.key).canRead);
    if (keys) all = all.filter(d => keys.has(d.key));
    return all;
  }, [slotsFor, scope, propertyDefs, recordedKeys, access, processId, byProcess]);

  const groups = useMemo(() => groupSlots(defs, stageNames, processesByProperty, processById, byProcess, processId), [defs, stageNames, processesByProperty, processById, byProcess, processId]);

  // The value on THIS record, and — for a job looking at a project property — the
  // project's value read through.
  const own = useMemo(() => {
    const m = new Map<string, PropertyValue>();
    values.forEach(v => {
      const mine = target.jobId != null ? v.jobId === target.jobId : v.projectId === target.projectId;
      if (mine) m.set(v.propertyKey, v);
    });
    return m;
  }, [values, target]);
  const fromProject = useMemo(() => {
    const m = new Map<string, PropertyValue>();
    if (target.jobId != null) values.forEach(v => { if (v.projectId != null) m.set(v.propertyKey, v); });
    return m;
  }, [values, target]);

  async function save(def: PropertyDef, value: PropertyValueData | null) {
    setBusyKey(def.key);
    setError(null);
    try {
      // Undoable from the header — the repository records the step (undoableRepository).
      if (value == null) await repo.clearPropertyValue(target, def.key);
      else await repo.setPropertyValue(target, def.key, value);
      setLocalReload(n => n + 1);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  }

  // Nothing to show, or nothing to show YET — either way no panel, so a drawer never
  // flashes "0 of 0 recorded" for the half-second before the values arrive.
  if (groups.length === 0) return null;
  const loading = accessLoading || valuesLoading;

  const total = defs.length;
  const recorded = defs.filter(d => own.has(d.key) || fromProject.has(d.key)).length;
  const heading = title ?? (scope === "project" ? "Project properties" : "Job properties");

  return (
    <section className="panel" aria-label={heading}>
      <div className="panel-head">
        <Text type="text2" weight="bold">{heading}</Text>
        <Text type="text3" color="secondary">
          {loading ? "Loading…" : `${recorded} of ${total} recorded`}
        </Text>
      </div>
      {note && (
        <Text type="text3" color="secondary" element="p" ellipsis={false} className="slot-note">{note}</Text>
      )}
      {error && <div className="create-problem" role="alert"><Text type="text2" ellipsis={false}>{error}</Text></div>}

      {groups.map(g => (
        <div className="slot-stage" key={g.stage}>
          {!processId && <div className="slot-stage-head">{g.stage}</div>}
          {g.processes.map(pg => (
            <div key={pg.process?.id ?? "none"}>
              {!processId && g.processes.length > 0 && (pg.process || g.processes.length > 1) && (
                <div className="slot-process-head">
                  <span>{pg.process ? pg.process.name : "Not tied to a process"}</span>
                  {pg.process?.stageGroup && <span className="slot-sub">{pg.process.stageGroup}</span>}
                </div>
              )}
              {pg.defs.map(d => {
                const mine = own.get(d.key) ?? null;
                const borrowed = !mine && d.scope === "project" && target.jobId != null ? fromProject.get(d.key) ?? null : null;
                const shown = mine ?? borrowed;
                const projectCopy = mine && d.scope === "project" && target.jobId != null ? fromProject.get(d.key) ?? null : null;
                const differs = projectCopy != null && formatValue(d, mine!.value) !== formatValue(d, projectCopy.value);
                const a = access(d.key);
                const required = (byProcess.get(pg.process?.id ?? "") ?? []).find(pp => pp.propertyKey === d.key)?.required || d.required;
                return (
                  <div className="slot-row" key={d.key}>
                    <div className="slot-label">
                      <Text type="text2" weight="medium" element="span">{d.label}</Text>
                      {required && <span className="slot-required" title="Required to complete">required</span>}
                      {!d.isActive && <span className="slot-chip">retired</span>}
                      {borrowed && <span className="slot-chip" title="Read through from the project. Change it on the project, or push it to the jobs.">from project</span>}
                      {mine && d.scope === "project" && target.jobId != null && (
                        <span className={"slot-chip is-pushed"} title="This job's own copy, pushed from the project.">pushed</span>
                      )}
                      {differs && <span className="slot-chip is-differs" title="The project's value has changed since this was pushed.">differs from project</span>}
                      <div className="slot-sub">
                        {[d.teamName, d.format === "unknown" ? "format not set" : d.format, d.slaDays != null ? `${d.slaDays} days` : null]
                          .filter(Boolean).join(" · ")}
                      </div>
                      {shown && shown.setByName && (
                        <div className="slot-meta">
                          recorded {new Date(shown.setAt).toLocaleDateString()} by {shown.setByName}
                        </div>
                      )}
                    </div>
                    <div className="slot-value">
                      <PropertyField
                        def={d}
                        value={shown?.value ?? null}
                        access={a}
                        options={optionsByProperty.get(d.key) ?? []}
                        people={people}
                        busy={busyKey === d.key}
                        onSave={borrowed ? undefined : v => save(d, v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {showHistory && history.length > 0 && (
        <div className="slot-history">
          <Text type="text3" weight="bold">Recent changes</Text>
          <ul className="slot-history-list">
            {history.slice(0, 20).map(h => (
              <li key={h.id}>
                <Text type="text3" color="secondary" element="span">{new Date(h.at).toLocaleString()}</Text>
                <Text type="text3" element="span">
                  {propertyDefs.find(d => d.key === h.propertyKey)?.label ?? h.propertyKey}: {describe(h.oldValue)} → {describe(h.newValue)}
                </Text>
                {h.byName && <Text type="text3" color="secondary" element="span">{h.byName}</Text>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

const describe = (v: unknown) => v == null ? "—" : Array.isArray(v) ? v.join(", ") : String(v);

interface SlotGroup {
  stage: string;
  processes: { process: Process | null; defs: PropertyDef[] }[];
}

/**
 * Stage, then process, in the order the process list gives. A property collected by two
 * processes appears under the first; one tied to none sits last under its stage.
 */
export function groupSlots(
  defs: PropertyDef[],
  stageNames: string[],
  processesByProperty: Map<string, { processId: string; position: number }[]>,
  processById: Map<string, Process>,
  byProcess: Map<string, { propertyKey: string; position: number }[]>,
  onlyProcess?: string
): SlotGroup[] {
  const stages = stageNames.length ? stageNames : [...new Set(defs.map(d => d.stageName))];
  return stages.map(stage => {
    const inStage = defs.filter(d => d.stageName === stage);
    const buckets = new Map<string, PropertyDef[]>();
    inStage.forEach(d => {
      const links = processesByProperty.get(d.key) ?? [];
      const chosen = onlyProcess
        ? links.find(l => l.processId === onlyProcess)
        : [...links].sort((a, b) =>
            (processById.get(a.processId)?.position ?? 9999) - (processById.get(b.processId)?.position ?? 9999))[0];
      const id = chosen?.processId ?? "";
      (buckets.get(id) ?? buckets.set(id, []).get(id)!).push(d);
    });
    const processes = [...buckets.entries()]
      .map(([id, ds]) => {
        const process = id ? processById.get(id) ?? null : null;
        const order = new Map((byProcess.get(id) ?? []).map(pp => [pp.propertyKey, pp.position]));
        ds.sort((a, b) => (order.get(a.key) ?? a.position) - (order.get(b.key) ?? b.position) || a.label.localeCompare(b.label));
        return { process, defs: ds };
      })
      .sort((a, b) => (a.process?.position ?? 9999) - (b.process?.position ?? 9999));
    return { stage, processes };
  }).filter(g => g.processes.length > 0);
}

export { hasValue };
