import { useMemo, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useTeams } from "../data/useLookups";
import { Select } from "./Select";
import { Problem } from "./Form";
import { LoadProblem } from "./SearchNotices";
import {
  TASK_STATUSES, TASK_STATUS_LABELS, isTaskLive, teamName,
  type TaskEntry, type TaskStatus, type TeamId
} from "../data/types";
import "./ui.css";

/**
 * What has to be done on this job or this project.
 *
 * The `tasks` table has been built and empty since the first migration — name, owning
 * team, assignee, status, due date, sub-tasks, and a completion the database stamps —
 * and no screen has ever read it. This is that screen.
 *
 * **It is the missing half of two things people have already asked for.** A due date
 * that moves ("Deanna changed selections due date from 1/7/26 to 7/7/26") is a task's
 * due date, and the activity feed narrates the change the moment one moves, because
 * `tasks` carries the same audit trigger as jobs and projects. And a job's progress
 * stops being "which stage is it in" once there are tasks to count.
 *
 * **Five states, not a tick box.** Blocked and "waiting on someone outside Lofty" are
 * the states that explain why a job has stopped; a checklist that only knows done from
 * not-done cannot tell "nobody has started this" from "the council has had it three
 * weeks". External is kept separate from blocked on purpose — council's statutory 28
 * days are not Design running late, and the two must not be added together in a report.
 *
 * Nothing is seeded. An empty job says it is empty rather than showing a template
 * nobody at Lofty wrote.
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
  const { data: profiles } = useQuery(r => r.listProfiles(), []);

  const [draft, setDraft] = useState("");
  const [draftDue, setDraftDue] = useState("");
  const [busy, setBusy] = useState(false);
  /** Which task has its second row of controls showing. One at a time. */
  const [open, setOpen] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  /** Done over the ones that count. Cancelled is neither done nor outstanding. */
  const counted = useMemo(() => tasks.filter(t => t.status !== "cancelled"), [tasks]);
  const done = useMemo(() => counted.filter(t => t.status === "done").length, [counted]);

  const today = new Date().toISOString().slice(0, 10);

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
      // Position is left at its default: the list orders by position then by when it
      // was created, so tasks nobody has reordered stay in the order they were typed.
      await repo.createTask({ jobId, projectId, name, dueDate: draftDue || null });
      setDraft("");
      setDraftDue("");
    });
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{title}</Text>
        {counted.length > 0 && (
          <Text type="text3" color="secondary">
            {done} of {counted.length} done
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
          and shows up in this record’s history when it changes.
        </Text>
      )}

      {tasks.length > 0 && (
        <ul className="task-list">
          {tasks.map(t => {
            const overdue = t.dueDate != null && isTaskLive(t.status) && t.dueDate < today;
            return (
              <li key={t.id} className={t.status === "done" ? "is-done" : undefined}>
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
                  </Text>
                  <div className="task-meta">
                    {/* Due, and whether it has passed. Overdue is said in words as well
                        as colour — a red date is invisible to a screen reader and to
                        about one man in twelve. */}
                    {t.dueDate && (
                      <Text type="text3" color={overdue ? undefined : "secondary"} element="span"
                        className={overdue ? "task-overdue" : undefined}>
                        Due {new Date(t.dueDate + "T00:00:00").toLocaleDateString()}
                        {overdue && " · overdue"}
                      </Text>
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
                      aria-expanded={open === t.id}
                      aria-label={`${open === t.id ? "Hide" : "Show"} who is doing ${t.name}`}
                      onClick={() => setOpen(open === t.id ? null : t.id)}
                    >
                      {open === t.id ? "Less" : "More"}
                    </Button>
                  </div>
                )}

                {can("user") && open === t.id && (
                  <div className="task-more">
                    <Select
                      className="task-control"
                      clearable
                      placeholder="Nobody"
                      aria-label={`Who is doing ${t.name}`}
                      options={profiles.filter(p => p.active).map(p => ({ value: p.id, label: p.fullName }))}
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
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
