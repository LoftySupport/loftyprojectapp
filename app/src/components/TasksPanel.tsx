import { useMemo, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useTeams } from "../data/useLookups";
import { PersonSelect } from "../components/PersonSelect";
import { Select } from "./Select";
import { Problem } from "./Form";
import { LoadProblem } from "./SearchNotices";
import {
  TASK_HEALTH_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, isTaskLive, teamName,
  type TaskChecklistItem, type TaskEntry, type TaskStatus, type TeamId
} from "../data/types";
import "./ui.css";
import "./processes.css";

/**
 * What has to be done on this job or this project — tasks, their sub-tasks, and the
 * checklist under each (Amber, 2 Sep: "tasks and sub task and checklists are essential
 * for users and teams").
 *
 * THREE LEVELS, TWO KINDS
 *
 *   A task and a sub-task are the same row (`parent_task_id`), so a sub-task has its own
 *   assignee, due date and health, and shows indented under its parent. A checklist line
 *   is lighter on purpose (0081): a tick box with words, no assignee and no date, so a
 *   task with twelve lines stays one task in "my work".
 *
 * HEALTH IS THE VIEW'S WORD
 *
 *   Due is what somebody typed, or start + expected days when nobody did; at risk is due
 *   minus the lead; both come from `task_display`, the same way a process run's do, so
 *   this panel never computes a date the report would disagree with. "No due date" is a
 *   real state and says so.
 *
 * Nothing is seeded. An empty job says it is empty rather than showing a template nobody
 * at Lofty wrote.
 */
export function TasksPanel({
  jobId, projectId, title = "Tasks"
}: {
  jobId?: string;
  projectId?: number;
  title?: string;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const { teams } = useTeams();
  const [reload, setReload] = useState(0);
  const { data: tasks, loading, error } = useQuery<TaskEntry[]>(
    r => r.listTasks({ jobId, projectId }), [], [reload, jobId, projectId]
  );
  const { data: lines } = useQuery<TaskChecklistItem[]>(
    r => r.listTaskChecklist({ jobId, projectId }), [], [reload, jobId, projectId]
  );

  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [busy, setBusy] = useState(false);
  /** Which task has its second row of controls showing. One at a time. */
  const [open, setOpen] = useState<string | null>(null);
  /** Which task is growing a sub-task right now. */
  const [subFor, setSubFor] = useState<string | null>(null);
  const [subDraft, setSubDraft] = useState("");
  /** The checklist line being typed, per task. */
  const [lineDraft, setLineDraft] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);

  /** Done over the ones that count. Cancelled is neither done nor outstanding. */
  const counted = useMemo(() => tasks.filter(t => t.status !== "cancelled"), [tasks]);
  const done = useMemo(() => counted.filter(t => t.status === "done").length, [counted]);
  const atRisk = useMemo(() => tasks.filter(t => t.health === "at_risk").length, [tasks]);
  const overdue = useMemo(() => tasks.filter(t => t.health === "overdue").length, [tasks]);

  /** Parents in order, each followed by its children; an orphan whose parent is gone still shows. */
  const ordered = useMemo(() => {
    const byId = new Set(tasks.map(t => t.id));
    const parents = tasks.filter(t => t.parentTaskId == null || !byId.has(t.parentTaskId));
    const out: { task: TaskEntry; child: boolean }[] = [];
    parents.forEach(p => {
      out.push({ task: p, child: false });
      tasks.filter(c => c.parentTaskId === p.id).forEach(c => out.push({ task: c, child: true }));
    });
    return out;
  }, [tasks]);

  const linesByTask = useMemo(() => {
    const m = new Map<string, TaskChecklistItem[]>();
    lines.forEach(l => { (m.get(l.taskId) ?? m.set(l.taskId, []).get(l.taskId)!).push(l); });
    return m;
  }, [lines]);

  async function run(what: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await what();
      setReload(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const add = () => {
    const name = draft.trim();
    if (!name) return;
    return run(async () => {
      await repo.createTask({ jobId, projectId, name, dueDate: draftDue || null });
      setDraft("");
      setDraftDue("");
    });
  };

  const addSub = (parent: TaskEntry) => {
    const name = subDraft.trim();
    if (!name) return;
    return run(async () => {
      await repo.createTask({ jobId, projectId, name, parentTaskId: parent.id });
      setSubDraft("");
      setSubFor(null);
    });
  };

  const addLine = (task: TaskEntry) => {
    const text = (lineDraft[task.id] ?? "").trim();
    if (!text) return;
    return run(async () => {
      await repo.addTaskChecklistItem(task.id, text);
      setLineDraft(d => ({ ...d, [task.id]: "" }));
    });
  };

  const fmt = (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString();

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{title}</Text>
        {counted.length > 0 && (
          <Text type="text3" color="secondary">
            {done} of {counted.length} done
            {overdue > 0 && ` · ${overdue} overdue`}
            {atRisk > 0 && ` · ${atRisk} at risk`}
          </Text>
        )}
      </div>

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      {/* The composer first — adding is the action this panel is for, and it should not
          sit under a list of forty. `user` and above is the insert policy; RLS is what
          actually decides. */}
      {can("user") && (
        <div className="task-composer">
          <TextField
            size="small"
            id={`task-draft-${jobId ?? projectId}`}
            placeholder="Add a task…"
            inputAriaLabel="Add a task"
            value={draft}
            onChange={v => setDraft(v)}
            onKeyDown={e => { if (e.key === "Enter") add(); }}
          />
          <input
            type="date"
            className="date-input"
            aria-label="Due date for the new task"
            value={draftDue}
            onChange={e => setDraftDue(e.target.value)}
          />
          <Button size="small" onClick={add} disabled={busy || !draft.trim()}>Add</Button>
        </div>
      )}

      {!loading && !error && tasks.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          No tasks yet. Anything added here carries its own due date, team and assignee,
          can hold sub-tasks and a checklist, and shows up in this record’s history when it changes.
        </Text>
      )}

      {tasks.length > 0 && (
        <ul className="task-list">
          {ordered.map(({ task: t, child }) => {
            const taskLines = linesByTask.get(t.id) ?? [];
            const isOpen = open === t.id;
            const live = isTaskLive(t.status);
            return (
              <li key={t.id} className={[t.status === "done" ? "is-done" : "", child ? "is-child" : ""].filter(Boolean).join(" ") || undefined}>
                {/* One click to finish, one to undo. The database stamps who and when
                    on the way through, and clears both on the way back. */}
                <input
                  type="checkbox"
                  checked={t.status === "done"}
                  disabled={busy || !can("user")}
                  aria-label={`Mark ${t.name} ${t.status === "done" ? "not done" : "done"}`}
                  onChange={() =>
                    run(() => repo.updateTask(t.id, { status: t.status === "done" ? "open" : "done" }))
                  }
                />

                <div className="task-body">
                  <Text type="text2" element="div" ellipsis={false} className="task-name">
                    {t.name}
                    {/* Health as a word, from the view — never computed here. */}
                    {live && t.health !== "no_due_date" && (
                      <span className={`health is-${t.health}`} style={{ marginLeft: 8 }}>{TASK_HEALTH_LABELS[t.health]}</span>
                    )}
                  </Text>
                  <div className="task-meta">
                    {t.dueEffective && (
                      <Text type="text3" color={t.health === "overdue" ? undefined : "secondary"} element="span"
                        className={t.health === "overdue" ? "task-overdue" : undefined}>
                        Due {fmt(t.dueEffective)}{t.dueDate == null && t.expectedDays != null ? ` (${t.expectedDays} days from start)` : ""}
                        {t.health === "overdue" && " · overdue"}
                      </Text>
                    )}
                    {live && t.atRiskDate && t.health === "on_track" && (
                      <Text type="text3" color="secondary" element="span">at risk from {fmt(t.atRiskDate)}</Text>
                    )}
                    {t.startedAt && live && (
                      <Text type="text3" color="secondary" element="span">started {fmt(t.startedAt)}</Text>
                    )}
                    {t.assigneeName && (
                      <Text type="text3" color="secondary" element="span">{t.assigneeName}</Text>
                    )}
                    {t.owningTeam && (
                      <Text type="text3" color="secondary" element="span">{teamName(t.owningTeam, teams)}</Text>
                    )}
                    {t.isExternal && (
                      <Text type="text3" color="secondary" element="span">waiting on someone outside Lofty</Text>
                    )}
                    {t.subtaskTotal > 0 && (
                      <Text type="text3" color="secondary" element="span">{t.subtaskDone}/{t.subtaskTotal} sub-tasks</Text>
                    )}
                    {t.checklistTotal > 0 && (
                      <Text type="text3" color="secondary" element="span">{t.checklistDone}/{t.checklistTotal} checklist</Text>
                    )}
                    {t.status === "done" && t.completedByName && (
                      <Text type="text3" color="secondary" element="span">
                        done by {t.completedByName}
                      </Text>
                    )}
                  </div>
                </div>

                {can("user") && (
                  <div className="task-controls">
                    {/* The two that move constantly, inline: what state it is in, and
                        when it is due. Everything else is one click away rather than
                        three selects deep on every row — a job with fifty tasks is a
                        list to scan, and three dropdowns per line is a form. */}
                    <Select
                      className="task-control"
                      aria-label={`Status of ${t.name}`}
                      options={TASK_STATUSES.map(v => ({ value: v, label: TASK_STATUS_LABELS[v] }))}
                      value={t.status}
                      onChange={v => run(() => repo.updateTask(t.id, { status: v as TaskStatus }))}
                    />
                    <input
                      type="date"
                      className="date-input"
                      aria-label={`Due date for ${t.name}`}
                      defaultValue={t.dueDate ?? ""}
                      onChange={e => run(() => repo.updateTask(t.id, { dueDate: e.target.value || null }))}
                    />
                    <Button
                      kind="tertiary" size="small"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? "Hide" : "Show"} the details of ${t.name}`}
                      onClick={() => setOpen(isOpen ? null : t.id)}
                    >
                      {isOpen ? "Less" : "More"}
                    </Button>
                  </div>
                )}

                {can("user") && isOpen && (
                  <div className="task-more">
                    <PersonSelect
                      className="task-control"
                      placeholder="Nobody"
                      aria-label={`Who is doing ${t.name}`}
                      teamId={t.owningTeam}
                      value={t.assigneeId}
                      onChange={v => run(() => repo.updateTask(t.id, { assigneeId: v }))}
                    />
                    <Select
                      className="task-control"
                      clearable
                      placeholder="No team"
                      aria-label={`Which team owns ${t.name}`}
                      options={teams.map(x => ({ value: x.id, label: x.name }))}
                      value={t.owningTeam}
                      onChange={v => run(() => repo.updateTask(t.id, { owningTeam: v as TeamId | null }))}
                    />
                    {/* The same two numbers a process has (0081). Blank is "no agreed
                        duration", never zero; the database refuses a lead longer than
                        the duration and says so in its own words. */}
                    <label className="task-external">
                      <Text type="text3" element="span">Expected</Text>
                      <input type="number" min={0} inputMode="numeric" className="pf-input task-days"
                        aria-label={`Expected days for ${t.name}`} defaultValue={t.expectedDays ?? ""}
                        onBlur={e => { const v = e.target.value.trim() === "" ? null : Number(e.target.value); if (v !== t.expectedDays) run(() => repo.updateTask(t.id, { expectedDays: v })); }} />
                      <Text type="text3" element="span">days</Text>
                    </label>
                    <label className="task-external">
                      <Text type="text3" element="span">At risk</Text>
                      <input type="number" min={0} inputMode="numeric" className="pf-input task-days"
                        aria-label={`At-risk lead days for ${t.name}`} defaultValue={t.atRiskLeadDays ?? ""}
                        onBlur={e => { const v = e.target.value.trim() === "" ? null : Number(e.target.value); if (v !== t.atRiskLeadDays) run(() => repo.updateTask(t.id, { atRiskLeadDays: v })); }} />
                      <Text type="text3" element="span">days before due</Text>
                    </label>
                    {t.startedAt && (
                      <label className="task-external">
                        <Text type="text3" element="span">Started</Text>
                        <input type="date" className="date-input" aria-label={`Start date of ${t.name}`}
                          defaultValue={t.startedAt.slice(0, 10)}
                          onChange={e => { if (e.target.value) run(() => repo.updateTask(t.id, { startedAt: e.target.value + "T09:00:00" })); }} />
                      </label>
                    )}
                    {/* Kept apart from Blocked on purpose: council's statutory 28 days
                        are not Design running late, and a report that adds the two
                        together says the wrong team is slow. */}
                    <label className="task-external">
                      <input
                        type="checkbox"
                        checked={t.isExternal}
                        onChange={e => run(() => repo.updateTask(t.id, { isExternal: e.target.checked }))}
                      />
                      <Text type="text3" element="span">Waiting on someone outside Lofty</Text>
                    </label>
                    {!child && (
                      <Button kind="tertiary" size="small" disabled={busy}
                        aria-expanded={subFor === t.id}
                        onClick={() => { setSubFor(subFor === t.id ? null : t.id); setSubDraft(""); }}>
                        {subFor === t.id ? "Cancel sub-task" : "Add a sub-task"}
                      </Button>
                    )}
                    {/* Admin-only by policy. Hidden below that so nobody is offered a
                        button the database will refuse — courtesy, not security. */}
                    {can("admin") && (
                      <Button kind="tertiary" size="small" disabled={busy}
                        aria-label={`Remove ${t.name}`}
                        onClick={() => run(() => repo.deleteTask(t.id))}>
                        Remove
                      </Button>
                    )}
                  </div>
                )}

                {can("user") && subFor === t.id && (
                  <div className="task-sub-composer">
                    <input className="pf-input" aria-label={`Name of the new sub-task under ${t.name}`}
                      placeholder="Add a sub-task…" value={subDraft} autoFocus
                      onChange={e => setSubDraft(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addSub(t); }} />
                    <Button size="small" disabled={busy || !subDraft.trim()} onClick={() => addSub(t)}>Add sub-task</Button>
                  </div>
                )}

                {/* The checklist: shown whenever it has lines, or when the task is open
                    so a line can be added. Ticking stamps who and when in the database. */}
                {(taskLines.length > 0 || isOpen) && (
                  <>
                    {taskLines.length > 0 && (
                      <ul className="task-checklist" aria-label={`Checklist for ${t.name}`}>
                        {taskLines.map(l => (
                          <li key={l.id}>
                            <input type="checkbox" checked={l.isDone} disabled={busy || !can("user")}
                              aria-label={`${l.isDone ? "Untick" : "Tick"} ${l.text}`}
                              onChange={e => run(() => repo.updateTaskChecklistItem(l.id, { isDone: e.target.checked }))} />
                            <Text type="text3" element="span" className={l.isDone ? "is-ticked" : undefined} ellipsis={false}>{l.text}</Text>
                            {l.isDone && l.doneByName && l.doneAt && (
                              <Text type="text3" color="secondary" element="span">{l.doneByName} · {fmt(l.doneAt)}</Text>
                            )}
                            {can("user") && isOpen && (
                              <Button kind="tertiary" size="xs" className="task-line-remove" disabled={busy}
                                aria-label={`Remove the line ${l.text}`}
                                onClick={() => run(() => repo.deleteTaskChecklistItem(l.id))}>
                                Remove
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {can("user") && isOpen && (
                      <div className="task-add-line">
                        <input className="pf-input" aria-label={`New checklist line for ${t.name}`}
                          placeholder="Add a checklist line…" value={lineDraft[t.id] ?? ""}
                          onChange={e => setLineDraft(d => ({ ...d, [t.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") addLine(t); }} />
                        <Button size="small" kind="secondary" disabled={busy || !(lineDraft[t.id] ?? "").trim()} onClick={() => addLine(t)}>Add line</Button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
