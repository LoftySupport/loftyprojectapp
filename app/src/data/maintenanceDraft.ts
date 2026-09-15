// app/src/data/maintenanceDraft.ts

/**
 * The half-filled new-maintenance-request form, kept across a closed drawer.
 *
 * Amber, 14 September: *"ensure the form persists on job drawer when pulling out"*.
 * Reproduced before it was fixed: one stray click on the scrim beside the panel, or one
 * Escape, closes the drawer — and `NewRequests` unmounts, taking every field with it. With
 * a pasted list of twelve issues that is the entire entry, lost to a mis-click.
 *
 * WHY A DRAFT RATHER THAN KEEPING THE PANEL MOUNTED
 *
 *   Hiding the drawer instead of unmounting it would survive a close and nothing else — not
 *   a refresh, not a navigation to the job and back, not the tab being restored tomorrow.
 *   A stored draft survives all four, and it is the same shape a person already expects
 *   from every other form that remembers itself.
 *
 * WHAT IS NOT KEPT, AND WHY IT IS NAMED RATHER THAN DROPPED
 *
 *   **Attachments.** A `File` is a handle to bytes the page was granted access to; it
 *   cannot be serialised and it cannot be re-granted without the person choosing the file
 *   again. So the draft keeps the NAMES and the form says which ones have to be attached
 *   again. Silently losing them would be the worse half of this bug wearing a fix's coat.
 *
 * ONE DRAFT PER DRAWER, KEYED BY THE JOB IT WAS OPENED FOR
 *
 *   A draft must never restore into a drawer opened from another job's record: that logs a
 *   defect against somebody else's house and looks completely normal. Two attempts at this
 *   were wrong before this one, and both were caught by the checks rather than by reading:
 *
 *   1. A single draft with a comparison in `readDraft`. A draft with no job set still
 *      passed into a job's drawer — text written about one house, offered on another.
 *   2. The comparison tightened. Now the drawer for another job started blank, and the
 *      save-on-change effect promptly wrote that blank form over the stored draft. Opening
 *      the wrong drawer for a second destroyed work that had not been lost before.
 *
 *   So the key carries the scope. A drawer opened from job 1042-01's record reads and
 *   writes `…:1042-01`; one opened from the Maintenance page reads and writes `…:none`.
 *   Neither can see or overwrite the other, which makes the guard structural rather than a
 *   comparison somebody has to remember. The job chosen INSIDE an unscoped form is stored
 *   as an ordinary field and restored with the rest.
  */

const KEY_PREFIX = "lofty.maintenance.draft.v1:";

/** The drawer's scope: the job it was opened from, or none. Never the job chosen inside. */
const keyFor = (openedForJob: string | null) => `${KEY_PREFIX}${openedForJob ?? "none"}`;

/** A fortnight. Long enough to survive a weekend, short enough not to resurrect last month. */
const KEEP_FOR_MS = 14 * 24 * 60 * 60 * 1000;

export interface DraftIssue {
  summary: string;
  description: string;
  assigneeKind: "internal" | "external";
  assigneeProfileId: string | null;
  assignedCompanyId: string | null;
  /** The names only. The bytes cannot be stored, and the form says so. */
  fileNames: string[];
}

export interface MaintenanceDraft {
  job: string | null;
  identifiedOn: string | null;
  identifiedAt: string | null;
  reportedBy: string | null;
  issues: DraftIssue[];
  dump: string;
  savedAt: number;
}

/** Nothing typed yet — worth knowing, so an empty form never overwrites a real draft. */
export function draftIsEmpty(d: Omit<MaintenanceDraft, "savedAt">): boolean {
  if (d.dump.trim() !== "") return false;
  if (d.reportedBy || d.identifiedAt) return false;
  return d.issues.every(i =>
    i.summary.trim() === "" && i.description.trim() === "" &&
    !i.assigneeProfileId && !i.assignedCompanyId && i.fileNames.length === 0);
}

/**
 * Every read and write is wrapped. `localStorage` throws rather than returning null in a
 * private window and when a browser is set to block site data, and a drawer that will not
 * open because a draft could not be read would be a worse bug than the one being fixed.
 */
export function readDraft(openedForJob: string | null): MaintenanceDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(openedForJob));
    if (!raw) return null;
    const d = JSON.parse(raw) as MaintenanceDraft;
    if (!d || !Array.isArray(d.issues)) return null;
    if (typeof d.savedAt !== "number" || Date.now() - d.savedAt > KEEP_FOR_MS) return null;
    // Belt and braces. The key already scopes this, so a mismatch here means a draft was
    // written under the wrong key — worth refusing rather than trusting.
    if (openedForJob && d.job && d.job !== openedForJob) return null;
    return d;
  } catch { return null; }
}

export function writeDraft(openedForJob: string | null, d: Omit<MaintenanceDraft, "savedAt">): void {
  try {
    if (draftIsEmpty(d)) { localStorage.removeItem(keyFor(openedForJob)); return; }
    localStorage.setItem(keyFor(openedForJob), JSON.stringify({ ...d, savedAt: Date.now() }));
  } catch { /* a browser that will not store one is not a reason to break the form */ }
}

export function clearDraft(openedForJob: string | null): void {
  try { localStorage.removeItem(keyFor(openedForJob)); } catch { /* as above */ }
}
