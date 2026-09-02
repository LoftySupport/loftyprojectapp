import { matchesRange, parseRange } from "../components/DateRange";
import type { ToolbarFilter } from "../components/Toolbar";
import { RECORD_STATUS_LABELS } from "./types";
import type { BoardJob, BoardProject } from "./boardModel";

/**
 * Applying the toolbar's filters.
 *
 * These existed as chips you could add, choose a value on, and watch do nothing: the
 * pages rendered `filters` into the toolbar and then filtered `rows` by the header
 * search alone. The control was real, the effect was not. This is the missing half.
 *
 * An unset chip matches everything on purpose — you have added the control but not yet
 * made a choice, and blanking the board at that moment would punish you for reaching
 * for a filter.
 */

function jobMatchesOne(j: BoardJob, f: ToolbarFilter): boolean {
  if (f.value == null || f.value === "") return true;
  switch (f.field) {
    case "Stage": return j.stage === f.value;
    // One Team filter, two ways to belong to it. Amber, 26 August: it "should just
    // read 'team' and anyone who owns a job, if they are in that team (even if they
    // have multiple teams), it should show." So a job matches Design when Design is
    // its owning team OR its assignee sits in Design — and there is deliberately no
    // separate person filter alongside this one.
    case "Team": return j.team === f.value || j.assigneeTeams.includes(f.value);
    // The Status select carries the enum as its value and the label as its text, so this
    // compares against the enum. Comparing labels would break the moment one is reworded.
    case "Status": return j.status === f.value;
    // The project's type, inherited by the job — the enum as the value, labels free.
    case "Type": return j.projectType === f.value;
    // "When did it move" — matched against job_stage_entered_at, the one real date every
    // job carries. The prototype filtered on a fabricated latest-activity date; this is
    // the honest nearest fact, and the option labels say exactly what they mean.
    case "Date": {
      /**
       * The app's standard date range since 1 September (`components/DateRange.tsx`) —
       * Amber: *"this is the default way for every date picker in the app"*. The three
       * hand-rolled cases that used to live here became six presets plus a custom range,
       * and the arithmetic moved to one place so the tracker and the board cannot drift
       * apart about what "last 7 days" means.
       *
       * `month` is still parsed, and that is not tidiness. `saved_views` stores a query
       * string VERBATIM (0048), so somebody's saved board may carry `?date=month` — and
       * a value that stops parsing does not error, it silently stops filtering, which
       * is the worst way for a saved view to break.
       */
      if (f.value === "month") {
        const entered = Date.parse(j.stageEnteredAt);
        if (Number.isNaN(entered)) return false;
        const d = new Date(entered);
        const t = new Date();
        return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
      }
      return matchesRange(j.stageEnteredAt, parseRange(f.value));
    }
    default: return true;
  }
}

/**
 * Two pairs of chips read TOGETHER, because each half alone answers the wrong question.
 *
 *   Process + Process health   "Concept Plan, overdue" is one fact about one run. Process
 *                              alone = the job has a run of it (any state); health alone =
 *                              any run in that state; both = that process in that state.
 *   Property + Recorded        "Pour date, not recorded". Property alone = it is recorded;
 *                              Recorded alone = has any / has none of the readable
 *                              properties; both = that property is / is not recorded.
 *
 * The absence filter is only honest for properties the person may read — a restricted
 * property they cannot see would otherwise read as "not recorded" on every job. The
 * picker offers only readable properties, and `recordedKeys` on the board job is built
 * from rows RLS already let through, so a key nobody may see is never offered.
 */
function jobMatchesPairs(j: BoardJob, filters: ToolbarFilter[]): boolean {
  const val = (field: string) => filters.find(f => f.field === field)?.value || null;
  const process = val("Process");
  const health = val("Process health");
  if (process || health) {
    const runs = j.processRuns.filter(r => !process || r.processKey === process);
    if (process && !health && runs.length === 0) return false;
    if (health) {
      const want = health === "waiting" ? (r: BoardJob["processRuns"][number]) => r.status === "waiting" : (r: BoardJob["processRuns"][number]) => r.health === health;
      if (health === "not_started" && process) {
        // "Not started" for a named process means no run at all, or a run still at not_started.
        if (runs.length > 0 && !runs.some(r => r.status === "not_started")) return false;
      } else if (!runs.some(want)) return false;
    }
  }
  const property = val("Property");
  const recorded = val("Recorded");
  if (property || recorded) {
    const has = property ? j.recordedKeys.includes(property) : j.recordedKeys.length > 0;
    if (recorded === "no") { if (has) return false; }
    else if (!has) return false;
  }
  return true;
}

const PAIRED = new Set(["Process", "Process health", "Property", "Recorded"]);

export function jobMatchesFilters(j: BoardJob, filters: ToolbarFilter[]): boolean {
  return filters.every(f => PAIRED.has(f.field) || jobMatchesOne(j, f)) && jobMatchesPairs(j, filters);
}

/**
 * A project matches when *one of its jobs* does.
 *
 * Stage and Team are properties of a job, not of a project, so the alternative would be
 * a Stage filter that empties the project board every time — the project itself has no
 * stage to match. Status is the exception: a project has its own, derived from its worst
 * job, so that one is compared directly.
 */
export function projectMatchesFilters(p: BoardProject, filters: ToolbarFilter[]): boolean {
  const paired = filters.filter(f => PAIRED.has(f.field));
  return filters.every(f => {
    if (f.value == null || f.value === "") return true;
    if (PAIRED.has(f.field)) return true;
    if (f.field === "Status") return p.status === f.value;
    return p.jobs.some(j => jobMatchesOne(j, f));
  }) && (paired.every(f => !f.value) || p.jobs.some(j => jobMatchesPairs(j, paired)));
}

/** The health options the Process health chip offers, in the order a board reads them. */
export const PROCESS_HEALTH_FILTER_OPTIONS = [
  { value: "overdue", label: "Overdue" },
  { value: "at_risk", label: "At risk" },
  { value: "on_track", label: "On track" },
  { value: "waiting", label: "Waiting" },
  { value: "no_expectation", label: "No duration set" },
  { value: "not_started", label: "Not started" },
  { value: "complete", label: "Complete" },
  { value: "not_applicable", label: "Not applicable" }
];
export const RECORDED_FILTER_OPTIONS = [
  { value: "yes", label: "Recorded" },
  { value: "no", label: "Not recorded" }
];

/** For the count line: "Showing 4 of 37" is only honest if something is actually cut. */
export function activeFilterCount(filters: ToolbarFilter[]): number {
  return filters.filter(f => f.value != null && f.value !== "").length;
}

/** Status options, enum as the value so the label is free to change. */
export const statusOptions = () =>
  (Object.keys(RECORD_STATUS_LABELS) as (keyof typeof RECORD_STATUS_LABELS)[]).map(s => ({
    value: s,
    label: RECORD_STATUS_LABELS[s]
  }));
