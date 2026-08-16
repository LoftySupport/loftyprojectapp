import type { ToolbarFilter } from "../components/Toolbar";
import { RECORD_STATUS_LABELS } from "./types";
import type { ShapeJob, ShapeProject } from "./placeholderShape";

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

function jobMatchesOne(j: ShapeJob, f: ToolbarFilter): boolean {
  if (f.value == null || f.value === "") return true;
  switch (f.field) {
    case "Stage": return j.stage === f.value;
    case "Team": return j.team === f.value;
    // The Status select carries the enum as its value and the label as its text, so this
    // compares against the enum. Comparing labels would break the moment one is reworded.
    case "Status": return j.status === f.value;
    default: return true;
  }
}

export function jobMatchesFilters(j: ShapeJob, filters: ToolbarFilter[]): boolean {
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
export function projectMatchesFilters(p: ShapeProject, filters: ToolbarFilter[]): boolean {
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
