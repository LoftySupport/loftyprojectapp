/**
 * Which record a document is about — the option list, and the parsing of what comes back.
 *
 * Pulled out of `TemplateBuilderPage` so it can be asserted. It is not a component and it
 * holds no state; the reason it exists as its own module is the bug it was written for.
 *
 * WHAT WENT WRONG, BECAUSE IT IS NOT THE KIND OF BUG A TYPE CATCHES
 *
 *   The picker used to be ONE list of every job and every project. On 7 September the
 *   live database held 75 jobs and 117 projects, and of the 8 documents anybody had made,
 *   6 were on a job and 0 were on a project. Not one, ever.
 *
 *   Every mechanical part was correct — the column, the foreign key, the RLS policy, the
 *   value the picker emitted, the panel that lists a project's documents. A document
 *   linked to a project rendered perfectly, once one existed. It never did, because
 *   `Select` sorts by label and a project's label began with the word "Project": digits
 *   sort before letters, so all 117 projects sat below all 75 jobs. Reaching one meant
 *   scrolling past every job or guessing the word to type.
 *
 *   "Correct but unreachable" is the shape to remember. Nothing failed, nothing logged,
 *   and the only evidence was a count of zero in a column nobody looked at.
 */

export type SubjectKind = "job" | "project";

export interface SubjectRecord {
  /** `jobNumber` for a job, `projectNumber` for a project — both display identifiers. */
  number: string;
  currentAddress?: string | null;
}

export interface SubjectOption {
  value: string;
  label: string;
}

/**
 * The options for ONE kind, which is the whole of the fix.
 *
 * No "Project " prefix on the label any more: the control above the list already says
 * which kind is being shown, and repeating it in all 117 labels was what sorted them away
 * from the numbers people actually search by.
 */
export function subjectOptionsFor(
  kind: SubjectKind,
  jobs: readonly SubjectRecord[],
  projects: readonly SubjectRecord[]
): SubjectOption[] {
  const from = kind === "project" ? projects : jobs;
  return from.map(r => ({
    value: `${kind}:${r.number}`,
    label: `${r.number}${r.currentAddress ? ` — ${r.currentAddress}` : ""}`
  }));
}

/**
 * `project:1042` → what `createReportDocument` wants.
 *
 * The split keeps everything after the FIRST colon, because a job number is
 * `1042-001` today but nothing promises an identifier will never contain one.
 * Returns null rather than a half-filled subject when the string is not one of ours —
 * a `?for=` parameter arrives from a URL, and a URL is somebody else's input.
 */
export function parseSubject(
  picked: string | null | undefined
): { jobId: string | null; projectId: number | null } | null {
  if (!picked) return null;
  const [kind, id] = picked.split(/:(.*)/s);
  if (!id) return null;
  if (kind === "project") {
    const n = Number(id);
    return Number.isFinite(n) ? { jobId: null, projectId: n } : null;
  }
  return kind === "job" ? { jobId: id, projectId: null } : null;
}
