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
      const entered = Date.parse(j.stageEnteredAt);
      if (Number.isNaN(entered)) return false;
      const now = Date.now();
      const DAY = 86_400_000;
      switch (f.value) {
        case "7d": return now - entered <= 7 * DAY;
        case "30d": return now - entered <= 30 * DAY;
        case "month": {
          const d = new Date(entered);
          const t = new Date(now);
          return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth();
        }
        default: return true;
      }
    }
    default: return true;
  }
}

export function jobMatchesFilters(j: BoardJob, filters: ToolbarFilter[]): boolean {
  return filters.every(f => jobMatchesOne(j, f));
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
  return filters.every(f => {
    if (f.value == null || f.value === "") return true;
    if (f.field === "Status") return p.status === f.value;
    return p.jobs.some(j => jobMatchesOne(j, f));
  });
}

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
