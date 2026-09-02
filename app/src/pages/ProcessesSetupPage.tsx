import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Text, TextField } from "@vibe/core";
import { MoveArrowDown, MoveArrowUp } from "@vibe/icons";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useProcessProperties, useProcesses, usePropertyDefs, useStages, useTeams } from "../data/useLookups";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import {
  PROPERTY_SCOPES, WORKING_STAGES, teamName,
  type NewProcess, type Process, type ProcessDependency, type ProcessPatch, type ProcessTask,
  type ProcessTaskDependency, type PropertyScope, type Team, type TeamId
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
 * So, per process: its facts (stage, level, team, duration, at-risk lead, milestone),
 * what it WAITS ON and what it LEADS TO (the dependency graph, edited from either side
 * but stored once), the PROPERTIES it collects and which are required to complete it,
 * and its CHECKLIST — the template tasks a run instantiates, with their own order.
 *
 * Every save goes through the seam one field at a time, and the database is the judge:
 * a cycle, a lead longer than the duration, a key that is not a slug all come back as
 * the sentence Postgres wrote. Below manager the page is the same page, read-only.
 */

const slugify = (label: string) =>
  label.toLowerCase().replace(/\b1st\b/g, "first").replace(/\b2nd\b/g, "second").replace(/\b3rd\b/g, "third")
    .replace(/^\s*\d+\s*-\s*/, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]/, "p_$&");

export function ProcessesSetupPage() {
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("manager");
  const [reload, setReload] = useState(0);
  const bump = () => setReload(n => n + 1);

  const { processes, byStage } = useProcesses(reload);
  const { stageNames } = useStages();
  const { teams } = useTeams();
  const { data: deps } = useQuery(r => r.listProcessDependencies(), [], [reload]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = processes.find(p => p.id === selectedId) ?? null;
  const stages = stageNames.length ? stageNames : [...byStage.keys()];

  const active = processes.filter(p => p.isActive).length;

  return (
    <>
      <div className="panel-head">
        <Text type="text2" weight="bold">Processes ({active} active{processes.length - active ? `, ${processes.length - active} retired` : ""})</Text>
        <div className="panel-actions">
          <Checkbox label="Show retired" checked={showRetired} onChange={() => setShowRetired(v => !v)} />
          {canEdit && <Button size="small" onClick={() => { setCreating(true); setSelectedId(null); }}>+ New process</Button>}
        </div>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        A process is a piece of work inside a lifecycle stage — <strong>Concept Plan</strong>,
        <strong> Working Drawings</strong>, <strong>1 - Footings</strong>. Each says which stage
        it belongs to, whether it runs on the project or on each job, who does it, how long it
        should take, what it waits on and what it leads to, which properties it collects, and
        the checklist it hands a job. {canEdit ? "Managers and above edit everything here." : "You can read everything here; managers and above edit it."}
      </Text>

      {error && <Problem>{error}</Problem>}

      <div className="proc-editor" style={{ marginTop: "var(--space-16)" }}>
        <nav className="proc-nav panel" aria-label="Processes by stage">
          {stages.map(stage => {
            const list = (byStage.get(stage) ?? []).filter(p => showRetired || p.isActive || p.id === selectedId);
            if (list.length === 0) return null;
            return (
              <div key={stage}>
                <div className="proc-nav-stage">{stage}</div>
                {list.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    className={`${p.id === selectedId ? "is-selected" : ""}${p.isActive ? "" : " is-retired"}`}
                    onClick={() => { setSelectedId(p.id); setCreating(false); }}
                    aria-current={p.id === selectedId ? "true" : undefined}
                  >
                    <span>{p.name}</span>
                    {/* The at-risk lead as a column (Amber, 2 Sep): "7d · at risk 2d before" reads
                        the rule without opening the process. Blank stays blank. */}
                    <span className="muted">
                      {[p.stageGroup, p.scope,
                        p.expectedDays != null ? `${p.expectedDays}d` : null,
                        p.atRiskLeadDays != null ? `at risk ${p.atRiskLeadDays}d before` : null
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
          {processes.length === 0 && (
            <Text type="text3" color="secondary" ellipsis={false}>No processes defined yet.</Text>
          )}
        </nav>

        <div>
          {creating && (
            <NewProcessForm
              stageNames={stages}
              teams={teams}
              onCancel={() => setCreating(false)}
              onCreated={p => { setCreating(false); setSelectedId(p.id); bump(); }}
            />
          )}
          {!creating && !selected && (
            <section className="panel">
              <Text type="text2" color="secondary" ellipsis={false}>
                Pick a process to see and edit it. On a phone the list is above; on a desk it is
                beside this.
              </Text>
            </section>
          )}
          {!creating && selected && (
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
              onRetire={async () => {
                setError(null);
                try {
                  await repo.updateProcess(selected.id, { isActive: !selected.isActive });
                  bump();
                } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ new process
function NewProcessForm({ stageNames, teams, onCancel, onCreated }: {
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
    <section className="panel">
      <div className="panel-head"><Text type="text2" weight="bold">New process</Text></div>
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
        <Field label="Runs on" required hint="the project as a whole, or each job">
          <Select aria-label="Runs on" options={PROPERTY_SCOPES.map(s => ({ value: s, label: s }))}
            value={draft.scope} onChange={v => setDraft({ ...draft, scope: v as PropertyScope })} />
        </Field>
        <Field label="Team" hint="who does the work — leave blank if nobody is named">
          <Select aria-label="Owning team" clearable placeholder="No team"
            options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
            value={draft.owningTeam ?? null} onChange={v => setDraft({ ...draft, owningTeam: v as TeamId | null })} />
        </Field>
      </div>
      <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
        <Button size="small" onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : "Add process"}</Button>
        <Button size="small" kind="tertiary" onClick={onCancel}>Cancel</Button>
      </div>
    </section>
  );
}

// -------------------------------------------------------------------- the editor
function ProcessEditor({ process: p, all, deps, teams, stageNames, canEdit, onChanged, onError, onRetire }: {
  process: Process;
  all: Process[];
  deps: ProcessDependency[];
  teams: readonly Team[];
  stageNames: string[];
  canEdit: boolean;
  onChanged: () => void;
  onError: (e: string | null) => void;
  onRetire: () => void;
}) {
  const repo = useRepository();
  const [saving, setSaving] = useState(false);

  async function patch(change: ProcessPatch) {
    setSaving(true); onError(null);
    try { await repo.updateProcess(p.id, change); onChanged(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const waitsOn = deps.filter(d => d.processId === p.id);
  const leadsTo = deps.filter(d => d.dependsOnProcessId === p.id);
  const byId = new Map(all.map(x => [x.id, x]));
  const teamOptions = teams.filter(t => t.isActive || t.id === p.owningTeam).map(t => ({ value: t.id, label: t.name }));

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <Text type="text2" weight="bold">{p.name}</Text>
            <div className="slot-sub"><code>{p.key}</code>{p.importRef && <> · from {p.importRef}</>}{!p.isActive && <span className="slot-chip">retired</span>}</div>
          </div>
          {canEdit && (
            <Button size="small" kind="tertiary" onClick={onRetire} disabled={saving}>
              {p.isActive ? "Retire" : "Restore"}
            </Button>
          )}
        </div>

        <div className="create-form">
          <Field label="Name" required>
            <BlurField value={p.name} disabled={!canEdit || saving} label="Process name" onCommit={v => v.trim() && patch({ name: v.trim() })} />
          </Field>
          <Field label="Lifecycle stage" required>
            {canEdit ? (
              <Select aria-label="Lifecycle stage" options={stageNames.map(s => ({ value: s, label: s }))} value={p.stageName} onChange={v => patch({ stageName: v })} />
            ) : <Text type="text2">{p.stageName}</Text>}
          </Field>
          <Field label="Stage group" hint="a heading inside the stage — Stage 1, Stage 2, Variation">
            <BlurField value={p.stageGroup ?? ""} disabled={!canEdit || saving} label="Stage group" onCommit={v => patch({ stageGroup: v.trim() || null })} />
          </Field>
          <Field label="Runs on" required>
            {canEdit ? (
              <Select aria-label="Runs on" options={PROPERTY_SCOPES.map(s => ({ value: s, label: s }))} value={p.scope} onChange={v => patch({ scope: v as PropertyScope })} />
            ) : <Text type="text2">{p.scope}</Text>}
          </Field>
          <Field label="Team" hint="who does the work">
            {canEdit ? (
              <Select aria-label="Owning team" clearable placeholder="No team named" options={teamOptions} value={p.owningTeam} onChange={v => patch({ owningTeam: v as TeamId | null })} />
            ) : <Text type="text2">{p.owningTeam ? teamName(p.owningTeam, teams) : "No team named"}</Text>}
          </Field>
          <Field label="Expected days" hint="how long a run should take from its start. Blank means no agreed duration, not zero">
            <NumberField value={p.expectedDays} disabled={!canEdit || saving} label="Expected days" onCommit={v => patch({ expectedDays: v })} />
          </Field>
          <Field label="At-risk lead (days)" hint="how many days before the due date a run flags at risk — must be shorter than the duration">
            <NumberField value={p.atRiskLeadDays} disabled={!canEdit || saving} label="At-risk lead days" onCommit={v => patch({ atRiskLeadDays: v })} />
          </Field>
          <Field label="Milestone" hint="counted at the stage — never turned into a percentage">
            <Checkbox label="Passing this process is a milestone of its stage" checked={p.isMilestone} disabled={!canEdit || saving} onChange={() => patch({ isMilestone: !p.isMilestone })} />
          </Field>
          <Field label="External" hint="council, SA Water, a consultant — late is not the team's fault">
            <Checkbox label="Waits on somebody outside Lofty" checked={p.isExternal} disabled={!canEdit || saving} onChange={() => patch({ isExternal: !p.isExternal })} />
          </Field>
          <Field label="Position" hint="order within the stage">
            <NumberField value={p.position} disabled={!canEdit || saving} label="Position" onCommit={v => patch({ position: v ?? 0 })} />
          </Field>
          <Field label="Description">
            <BlurField value={p.description ?? ""} disabled={!canEdit || saving} label="Description" onCommit={v => patch({ description: v.trim() || null })} />
          </Field>
          <Field label="Automation" hint="how this process will run itself, when it does — a note today">
            <BlurField value={p.automation ?? ""} disabled={!canEdit || saving} label="Automation" onCommit={v => patch({ automation: v.trim() || null })} />
          </Field>
          <Field label="SharePoint subfolder" hint="inside the record's folder — a name, not a link">
            <BlurField value={p.sharepointFolder ?? ""} disabled={!canEdit || saving} label="SharePoint subfolder" onCommit={v => patch({ sharepointFolder: v.trim() || null })} />
          </Field>
        </div>
      </section>

      <DependenciesEditor process={p} all={all} waitsOn={waitsOn} leadsTo={leadsTo} byId={byId} canEdit={canEdit} onChanged={onChanged} onError={onError} />
      <PropertiesEditor process={p} canEdit={canEdit} onChanged={onChanged} onError={onError} />
      <ChecklistEditor process={p} teams={teams} canEdit={canEdit} onError={onError} />
    </div>
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
            <input type="number" min={0} className="pf-input dep-lag" aria-label={`Lag after ${byId.get(d.dependsOnProcessId)?.name}`}
              defaultValue={d.lagDays} disabled={!canEdit}
              onBlur={e => { const lag = Math.max(0, Number(e.target.value) || 0); if (lag !== d.lagDays) write(current.map(c => c.processId === d.dependsOnProcessId ? { ...c, lagDays: lag } : c)); }} />
            <Text type="text3" color="secondary" element="span">days</Text>
            {canEdit && <Button size="xs" kind="tertiary" onClick={() => write(current.filter(c => c.processId !== d.dependsOnProcessId))}>Remove</Button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
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

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Properties collected ({mine.length})</Text>
        <Text type="text3" color="secondary">in the order the process asks for them</Text>
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
        <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
          <Select aria-label="Add a property this process collects" clearable placeholder="Add a property…"
            options={candidates.map(d => ({ value: d.key, label: `${d.label} — ${d.stageName}${d.scope === "project" ? " (project)" : ""}` }))}
            value={adding} onChange={v => setAdding(v)} />
          <Button size="small" disabled={!adding} onClick={() => { if (adding) { write([...current, { propertyKey: adding, required: false }]); setAdding(null); } }}>Add</Button>
        </div>
      )}
      <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-8)" }}>
        Define new properties, their formats and who may see them in the Properties tab.
      </Text>
    </section>
  );
}

// --------------------------------------------------------------------- checklist
function ChecklistEditor({ process: p, teams, canEdit, onError }: {
  process: Process; teams: readonly Team[]; canEdit: boolean; onError: (e: string | null) => void;
}) {
  const repo = useRepository();
  const [reload, setReload] = useState(0);
  const { data: tasks } = useQuery(r => r.listProcessTasks(p.id), [], [p.id, reload]);
  const { data: deps } = useQuery(r => r.listProcessTaskDependencies(p.id), [], [p.id, reload]);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
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
  const byId = new Map(tasks.map(t => [t.id, t]));
  const waitsOn = (id: string) => deps.filter(d => d.taskId === id);
  const teamOptions = teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }));

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Checklist ({tasks.length})</Text>
        <Text type="text3" color="secondary">the tasks a run hands the record — with team, days and order</Text>
      </div>
      {tasks.length === 0 && <Text type="text3" color="secondary" ellipsis={false}>No checklist. A run of this process creates no tasks.</Text>}
      {ordered.map(t => {
        const isOpen = open === t.id;
        const w = waitsOn(t.id);
        return (
          <div key={t.id}>
            <div className={`tpl-task${t.parentId ? " is-child" : ""}`}>
              <span className="tpl-name">
                <BlurField value={t.name} disabled={!canEdit} label={`Task ${t.name}`} onCommit={v => v.trim() && run(() => repo.updateProcessTask(t.id, { name: v.trim() }))} plain />
                <span className="slot-sub">
                  {[t.importRef != null ? `line ${t.importRef}` : null, w.length ? `waits on ${w.map(d => byId.get(d.dependsOnTaskId)?.name ?? "?").join(", ")}` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              {canEdit ? (
                <Select className="proc-control" aria-label={`Team for ${t.name}`} clearable placeholder="No team" options={teamOptions} value={t.owningTeam}
                  onChange={v => run(() => repo.updateProcessTask(t.id, { owningTeam: v as TeamId | null }))} />
              ) : <Text type="text3" color="secondary" element="span">{t.owningTeam ? teamName(t.owningTeam, teams) : "—"}</Text>}
              <NumberField value={t.expectedDays} disabled={!canEdit} label={`Days for ${t.name}`} small onCommit={v => run(() => repo.updateProcessTask(t.id, { expectedDays: v }))} />
              <Text type="text3" color="secondary" element="span">days</Text>
              {canEdit && (
                <>
                  <Button size="xs" kind="tertiary" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)}>{isOpen ? "Less" : "Order"}</Button>
                  <Button size="xs" kind="tertiary" onClick={() => run(() => repo.deleteProcessTask(t.id))}>Remove</Button>
                </>
              )}
            </div>
            {isOpen && canEdit && (
              <TaskOrderEditor task={t} tasks={tasks} waitsOn={w} onWrite={next => run(() => repo.setProcessTaskDependencies(t.id, next))}
                onParent={v => run(() => repo.updateProcessTask(t.id, { parentId: v }))} />
            )}
          </div>
        );
      })}
      {canEdit && (
        <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
          <input className="pf-input" style={{ width: "min(320px, 100%)" }} aria-label="New task name" placeholder="Add a task…" value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newName.trim()) { run(() => repo.createProcessTask({ processId: p.id, name: newName.trim(), position: tasks.length + 1 })); setNewName(""); } }} />
          <Button size="small" disabled={!newName.trim()} onClick={() => { run(() => repo.createProcessTask({ processId: p.id, name: newName.trim(), position: tasks.length + 1 })); setNewName(""); }}>Add task</Button>
        </div>
      )}
    </section>
  );
}

function TaskOrderEditor({ task, tasks, waitsOn, onWrite, onParent }: {
  task: ProcessTask; tasks: ProcessTask[]; waitsOn: ProcessTaskDependency[];
  onWrite: (next: { taskId: string; lagDays: number }[]) => void;
  onParent: (parentId: string | null) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const current = waitsOn.map(d => ({ taskId: d.dependsOnTaskId, lagDays: d.lagDays }));
  const others = tasks.filter(t => t.id !== task.id);
  const byId = new Map(tasks.map(t => [t.id, t]));
  return (
    <div className="proc-body">
      <div className="field-inline">
        <Text type="text3" element="span">Under</Text>
        <Select className="proc-control" aria-label={`Parent of ${task.name}`} clearable placeholder="No parent"
          options={others.filter(t => t.parentId == null).map(t => ({ value: t.id, label: t.name }))}
          value={task.parentId} onChange={v => onParent(v)} />
      </div>
      <Text type="text3" weight="bold" element="div" style={{ marginTop: "var(--space-8)" }}>Waits on</Text>
      <ul className="dep-list">
        {waitsOn.map(d => (
          <li key={d.dependsOnTaskId}>
            <Text type="text2" element="span" style={{ flex: "1 1 160px" }}>{byId.get(d.dependsOnTaskId)?.name ?? "?"}</Text>
            <Text type="text3" color="secondary" element="span">then</Text>
            <input type="number" min={0} className="pf-input dep-lag" aria-label="Lag days" defaultValue={d.lagDays}
              onBlur={e => { const lag = Math.max(0, Number(e.target.value) || 0); if (lag !== d.lagDays) onWrite(current.map(c => c.taskId === d.dependsOnTaskId ? { ...c, lagDays: lag } : c)); }} />
            <Text type="text3" color="secondary" element="span">days</Text>
            <Button size="xs" kind="tertiary" onClick={() => onWrite(current.filter(c => c.taskId !== d.dependsOnTaskId))}>Remove</Button>
          </li>
        ))}
      </ul>
      <div className="field-inline" style={{ marginTop: "var(--space-4)" }}>
        <Select aria-label="Add a task this waits on" clearable placeholder="Add a task this waits on…"
          options={others.filter(t => !current.some(c => c.taskId === t.id)).map(t => ({ value: t.id, label: t.name }))}
          value={adding} onChange={v => setAdding(v)} />
        <Button size="small" disabled={!adding} onClick={() => { if (adding) { onWrite([...current, { taskId: adding, lagDays: 0 }]); setAdding(null); } }}>Add</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ small inputs
function BlurField({ value, disabled, label, onCommit, plain }: { value: string; disabled: boolean; label: string; onCommit: (v: string) => void; plain?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (disabled && plain) return <Text type="text2" element="span">{value}</Text>;
  return (
    <input className="pf-input" style={plain ? { width: "100%" } : undefined} aria-label={label} value={draft} disabled={disabled}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

function NumberField({ value, disabled, label, onCommit, small }: { value: number | null; disabled: boolean; label: string; onCommit: (v: number | null) => void; small?: boolean }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => { setDraft(value == null ? "" : String(value)); }, [value]);
  return (
    <input type="number" inputMode="numeric" className={`pf-input${small ? " dep-lag" : ""}`} aria-label={label} value={draft} disabled={disabled} placeholder={small ? "" : "not set"}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { const v = draft.trim() === "" ? null : Number(draft); if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
