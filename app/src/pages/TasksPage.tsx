import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Heading, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useAuth } from "../data/AuthProvider";
import { useProcesses, useTeams } from "../data/useLookups";
import { PersonSelect } from "../components/PersonSelect";
import { Select } from "../components/Select";
import { Problem } from "../components/Form";
import { LoadProblem } from "../components/SearchNotices";
import { SortHeader, useTableSort, type SortValue } from "../components/SortableTable";
import {
  TASK_HEALTH_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, isTaskLive,
  type TaskEntry, type TaskStatus
} from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/** Today, and six days on — the window "due this week" reads against. */
const isoToday = () => new Date().toISOString().slice(0, 10);
const isoPlusDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString();

type Scope = "mine" | "team" | "all" | "overdue" | "today" | "week";

/**
 * The Tasks board (0102) — every task, across every job and project, one screen.
 *
 * Amber: tasks are either a process's workflow assigning one when a stage or process
 * changes, or a person typing one in for themselves or their team — and both kinds
 * belong on one board, in the Jobs board's own shape: filtered and sorted by team and
 * process, opening on "my tasks", with a manager's own team on top of that, and three
 * more slices of the same due-date question everybody asks — overdue, due today, due
 * this week.
 *
 * `listTasks` reads one of five scopes (0102) — an assignee, a set of teams, or every
 * task — and the three due-date tabs read "every task" and slice it here, the same way
 * `task_health` already slices done from overdue from at risk. Health is never
 * recomputed: it is `task_display`'s word, read and shown, exactly as `TasksPanel`
 * shows it on one job's own page.
 */
export function TasksPage() {
  const { profile: me } = useAuth();
  const { can } = usePermission();
  const repo = useRepository();
  const { teams } = useTeams();
  const { processes } = useProcesses();
  const [params, setParams] = useSearchParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const scope = (params.get("scope") ?? "mine") as Scope;
  const teamFilter = params.get("team");
  const statusFilter = params.get("status") as TaskStatus | null;
  const processFilter = params.get("process");

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const myTeams = useMemo(
    () => teams.filter(t => t.isActive && (me?.teams ?? []).includes(t.id)).map(t => t.id),
    [teams, me]
  );

  // Every scope but "mine" and "team" needs the whole board read once and sliced here,
  // because the due-date tabs and "all tasks" are the same fetch — see the class doc above.
  const { data: tasks, loading, error } = useQuery<TaskEntry[]>(
    r => {
      if (scope === "mine" && me) return r.listTasks({ assigneeId: me.id });
      if (scope === "team" && myTeams.length > 0) return r.listTasks({ teams: myTeams });
      return r.listTasks({ all: true });
    },
    [], [scope, me?.id, myTeams.join(","), reloadKey]
  );

  const scoped = useMemo(() => {
    switch (scope) {
      // "team" without a team fell through to "all" above (nobody to scope to) — show
      // nothing rather than every task in the company standing in for it.
      case "team": return myTeams.length > 0 ? tasks : [];
      case "overdue": return tasks.filter(t => t.health === "overdue");
      case "today": return tasks.filter(t => isTaskLive(t.status) && t.dueEffective === isoToday());
      case "week": {
        const start = isoToday(); const end = isoPlusDays(6);
        return tasks.filter(t => isTaskLive(t.status) && t.dueEffective != null && t.dueEffective >= start && t.dueEffective <= end);
      }
      default: return tasks;
    }
  }, [tasks, scope, myTeams]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return scoped.filter(t =>
      (!teamFilter || t.owningTeam === teamFilter) &&
      (!statusFilter || t.status === statusFilter) &&
      (!processFilter || t.processId === processFilter) &&
      (!q || t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q) || (t.recordName ?? "").toLowerCase().includes(q))
    );
  }, [scoped, teamFilter, statusFilter, processFilter, search]);

  type Key = "name" | "status" | "job" | "stage" | "process" | "due" | "scheduled" | "createdBy" | "assignee";
  const columns: Record<Key, (t: TaskEntry) => SortValue> = {
    name: t => t.name,
    status: t => TASK_STATUS_LABELS[t.status],
    job: t => t.recordName ?? t.jobId ?? (t.projectId != null ? String(t.projectId) : null),
    stage: t => t.recordStage,
    process: t => t.processName,
    due: t => t.dueEffective,
    scheduled: t => t.scheduledDate,
    createdBy: t => t.createdByName,
    assignee: t => t.assigneeName
  };
  const { sorted, sort, toggle } = useTableSort<TaskEntry, Key>(filtered, columns, { key: "due", direction: "asc" });

  async function run(what: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try { await what(); setReloadKey(k => k + 1); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const TABS: { slug: Scope; label: string; need?: "manager" }[] = [
    { slug: "mine", label: "My tasks" },
    { slug: "team", label: "My team's tasks", need: "manager" },
    { slug: "all", label: "All tasks" },
    { slug: "overdue", label: "Overdue" },
    { slug: "today", label: "Due today" },
    { slug: "week", label: "Due this week" }
  ];

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <Heading type="h2" weight="bold">Tasks</Heading>
          <Text type="text2" color="secondary" ellipsis={false}>
            What has to be done — assigned by a process's workflow, or typed in by hand — across every job and project.
          </Text>
        </div>
      </div>

      <nav className="saved-views" aria-label="Which tasks">
        {TABS.filter(t => !t.need || can(t.need)).map(t => (
          <a
            key={t.slug}
            href={`?${new URLSearchParams({ ...Object.fromEntries(params), scope: t.slug }).toString()}`}
            aria-current={scope === t.slug ? "page" : undefined}
            className={"saved-view" + (scope === t.slug ? " is-active" : "")}
            onClick={e => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              setParam({ scope: t.slug });
            }}
          >
            <Text type="text2" element="span" weight={scope === t.slug ? "bold" : "normal"}>{t.label}</Text>
          </a>
        ))}
      </nav>

      <div className="toolbar">
        <Select aria-label="Team" clearable placeholder="Any team" value={teamFilter}
          onChange={v => setParam({ team: v })}
          options={teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))} />
        <Select aria-label="Status" clearable placeholder="Any status" value={statusFilter}
          onChange={v => setParam({ status: v })}
          options={TASK_STATUSES.map(s => ({ value: s, label: TASK_STATUS_LABELS[s] }))} />
        <Select aria-label="Process" clearable placeholder="Any process" value={processFilter}
          onChange={v => setParam({ process: v })}
          options={processes.map(p => ({ value: p.id, label: p.name }))} />
        <input
          className="pf-input"
          type="search"
          aria-label="Search tasks"
          placeholder="Search name, description, job…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ minWidth: 220 }}
        />
      </div>

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      <section className="panel">
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader column="name" label="Task" sort={sort} onSort={toggle} />
                <SortHeader column="status" label="Status" sort={sort} onSort={toggle} />
                <SortHeader column="job" label="Job" sort={sort} onSort={toggle} />
                <SortHeader column="stage" label="Stage" sort={sort} onSort={toggle} />
                <SortHeader column="process" label="Process" sort={sort} onSort={toggle} />
                <SortHeader column="due" label="Due date" sort={sort} onSort={toggle} />
                <SortHeader column="scheduled" label="Scheduled date" sort={sort} onSort={toggle} />
                <SortHeader column="createdBy" label="Created by" sort={sort} onSort={toggle} />
                <SortHeader column="assignee" label="Assigned to" sort={sort} onSort={toggle} />
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => {
                const ref = t.jobId ?? (t.projectId != null ? `Project ${t.projectId}` : "—");
                const href = t.jobId ? `/jobs/${t.jobId}` : t.projectId != null ? `/projects/${t.projectId}` : null;
                return (
                  <tr key={t.id}>
                    <td>
                      <Text type="text2" element="span" ellipsis={false}>{t.name}</Text>
                      {isTaskLive(t.status) && t.health !== "no_due_date" && (
                        <span className={`health is-${t.health}`} style={{ marginLeft: 6 }}>{TASK_HEALTH_LABELS[t.health]}</span>
                      )}
                    </td>
                    <td>
                      {can("user") ? (
                        <Select className="task-control" aria-label={`Status of ${t.name}`}
                          options={TASK_STATUSES.map(v => ({ value: v, label: TASK_STATUS_LABELS[v] }))}
                          value={t.status} onChange={v => run(() => repo.updateTask(t.id, { status: v as TaskStatus }))} />
                      ) : TASK_STATUS_LABELS[t.status]}
                    </td>
                    <td className="nowrap">
                      {href ? <Link to={href}>{ref}</Link> : ref}
                      {t.recordName && <span className="muted"> · {t.recordName}</span>}
                    </td>
                    <td className="muted">{t.recordStage ?? "—"}</td>
                    <td className="muted">{t.processName ?? "Manual"}</td>
                    <td className="nowrap">
                      {can("user") ? (
                        <input type="date" className="date-input" aria-label={`Due date for ${t.name}`}
                          disabled={busy}
                          defaultValue={t.dueDate ?? ""} key={`due-${t.id}-${t.dueDate ?? ""}`}
                          onBlur={e => { const v = e.target.value || null; if (v !== t.dueDate) run(() => repo.updateTask(t.id, { dueDate: v })); }} />
                      ) : (t.dueEffective ? fmt(t.dueEffective) : "—")}
                    </td>
                    <td className="nowrap">
                      {can("user") ? (
                        <input type="date" className="date-input" aria-label={`Scheduled date for ${t.name}`}
                          disabled={busy}
                          defaultValue={t.scheduledDate ?? ""} key={`sched-${t.id}-${t.scheduledDate ?? ""}`}
                          onBlur={e => { const v = e.target.value || null; if (v !== t.scheduledDate) run(() => repo.updateTask(t.id, { scheduledDate: v })); }} />
                      ) : (t.scheduledDate ? fmt(t.scheduledDate) : "—")}
                    </td>
                    <td className="muted">{t.createdByName ?? "—"}</td>
                    <td>
                      {can("user") ? (
                        <PersonSelect className="task-control" placeholder="Nobody" aria-label={`Who is doing ${t.name}`}
                          disabled={busy}
                          teamId={t.owningTeam} value={t.assigneeId}
                          onChange={v => run(() => repo.updateTask(t.id, { assigneeId: v }))} />
                      ) : (t.assigneeName ?? "—")}
                    </td>
                    <td className="muted">
                      <Text type="text3" color="secondary">{t.description ?? "—"}</Text>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && sorted.length === 0 && (
            <Text type="text2" color="secondary" element="p" ellipsis={false}>
              {scope === "mine" ? "Nothing is assigned to you."
                : scope === "team" ? (myTeams.length === 0 ? "You are not in a team, so there is no team view to show." : "Nothing is assigned to your team.")
                : scope === "overdue" ? "Nothing is overdue."
                : scope === "today" ? "Nothing is due today."
                : scope === "week" ? "Nothing is due this week."
                : "No tasks match the current filters."}
            </Text>
          )}
        </div>
      </section>
    </>
  );
}
