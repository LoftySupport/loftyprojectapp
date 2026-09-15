import { matchesRange, parseRange } from "../components/DateRange";
import type { ToolbarFilter } from "../components/Toolbar";
import { TASK_HEALTH_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, type TaskEntry, type TaskHealth } from "./types";
import { matchesNumber } from "./filtering";

/**
 * Applying the toolbar's filters to a task.
 *
 * The jobs board has `filtering.ts` and this is its counterpart, separate because a task
 * is not a job and the questions asked of it are not the same ones. Three differences
 * carry the whole file:
 *
 *   **Assignee is a filter here.** On the jobs board it deliberately is not — Amber, 26
 *   August: the Team filter matches membership, so "my team's jobs" is the question and
 *   a person filter beside it would be a second way to ask it. A task is held by ONE
 *   person; "who is doing this" is the question, and a team cannot answer it.
 *
 *   **Two dates, not one.** `dueDate` is when it must be finished and `scheduledDate` is
 *   when somebody plans to do it (0102), and filtering on the wrong one is how a week's
 *   work goes missing. Both use the app's standard range picker.
 *
 *   **Where it came from is a fact worth filtering on.** A task instantiated by a
 *   process run and a task somebody typed in are different kinds of work — one is the
 *   business process, the other is a person's own list — and Amber's description of the
 *   board names both. `processId` is the test; there is no flag to invent.
 *
 * An unset filter matches everything, exactly as on the jobs board: you have reached for
 * a control and not yet made a choice, and emptying the screen at that moment punishes
 * you for reaching.
 */

/** Nobody is assigned — a real answer, and the one people filter for most after their own name. */
export const UNASSIGNED = "unassigned";

/**
 * A date-only column, read as LOCAL midnight.
 *
 * `new Date("2026-09-10")` is UTC midnight, and the ranges are built from local
 * `setHours(0,0,0,0)`. The two agree in Australia and disagree west of Greenwich, which
 * is the kind of bug that shows up as one task in the wrong week and is never traced.
 */
const asLocal = (iso: string | null): string | null =>
  iso == null ? null : iso.length === 10 ? `${iso}T00:00:00` : iso;

/** The health options the Health filter offers, in the order a board reads them. */
export const TASK_HEALTH_FILTER_OPTIONS: { value: TaskHealth; label: string }[] =
  (["overdue", "at_risk", "on_track", "no_due_date", "done", "cancelled"] as TaskHealth[])
    .map(h => ({ value: h, label: TASK_HEALTH_LABELS[h] }));

/** Task statuses as filter options, in lifecycle order rather than alphabetically. */
export const TASK_STATUS_FILTER_OPTIONS = TASK_STATUSES.map(s => ({ value: s, label: TASK_STATUS_LABELS[s] }));

/**
 * Where the task came from. Amber's sentence for the board is that tasks are *"either a
 * process's workflow assigning one when a stage or process changes, or a person typing
 * one in"* — so those are the two options, in her words rather than in the column's.
 */
export const TASK_SOURCE_FILTER_OPTIONS = [
  { value: "process", label: "A process's workflow" },
  { value: "manual", label: "Typed in by hand" }
];

/**
 * Whose court it is in. `is_external` is kept out of team SLA reporting on purpose —
 * council's statutory 28 days are not Design running late — so "what is sitting with
 * somebody outside Lofty" is a question the column was added to answer.
 */
export const TASK_EXTERNAL_FILTER_OPTIONS = [
  { value: "yes", label: "Somebody outside Lofty" },
  { value: "no", label: "Us" }
];

function taskMatchesOne(t: TaskEntry, f: ToolbarFilter): boolean {
  if (f.value == null || f.value === "") return true;
  switch (f.field) {
    case "Team": return t.owningTeam === f.value;
    case "Status": return t.status === f.value;
    case "Health": return t.health === f.value;
    case "Assignee":
      return f.value === UNASSIGNED ? t.assigneeId == null : t.assigneeId === f.value;
    case "Created by": return t.createdBy === f.value;
    // The template it was instantiated from, resolved on the read (0102) — not the run,
    // because "every Concept Plan task" spans every run of that process.
    case "Process": return t.processId === f.value;
    case "Source": return f.value === "process" ? t.processId != null : t.processId == null;
    case "External": return t.isExternal === (f.value === "yes");
    // The lifecycle stage of the job or project the task hangs off.
    case "Stage": return t.recordStage === f.value;
    // Prefix, as on the jobs board: "1042" finds every task on the project, "1042-003"
    // the one job's. A task on a project rather than a job matches the project number.
    case "Number":
      return matchesNumber(f.value, [t.jobId, t.projectId != null ? String(t.projectId) : null]);
    // `dueEffective`, not `dueDate`: it is the typed date where there is one and the
    // derived start + expected days where there is not, which is the date the board
    // shows and the date health is read against. Filtering on the raw column would
    // silently exclude every task whose due date the template works out.
    case "Due": return matchesRange(asLocal(t.dueEffective), parseRange(f.value));
    case "Scheduled": return matchesRange(asLocal(t.scheduledDate), parseRange(f.value));
    default: return true;
  }
}

export function taskMatchesFilters(t: TaskEntry, filters: ToolbarFilter[]): boolean {
  return filters.every(f => taskMatchesOne(t, f));
}

/** Free-text, over the fields a person would recognise a task by. */
export function taskMatchesQuery(t: TaskEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [t.name, t.description, t.recordName, t.jobId, t.assigneeName, t.processName]
    .some(v => v != null && v.toLowerCase().includes(q));
}
