import type { Repository } from "./repository";
import type {
  FeedbackItem, MaintenanceItem, ProcessRun, PropertyValue, RecordTarget, RoadmapPhase,
  TaskEntry, Team
} from "./types";
import { undoHistory, type UndoStep } from "./undoHistory";

/**
 * Every field write on the repository, made undoable — at the seam, once.
 *
 * Amber, 7 September, an hour after the bar shipped: *"the undo and redo doesn't work when i
 * made an update it didn't let me undo it"*. She was right. Undo had been registered by hand
 * at six call sites — the drawer's team and assignee, a project's team, property values, a
 * person's inline edit, a request's stage — and the app has fifty places that write. A
 * project's target date, a task's status, a maintenance request's owner, a process run being
 * marked complete: none of them recorded a step, so the arrows stayed grey and the feature
 * looked broken. A per-screen opt-in is a promise every future screen has to remember to
 * keep, and the first one did not.
 *
 * So it lives here instead. `DataProvider` hands every screen THIS repository, and each
 * patch-shaped write on it does three things: reads the record as it stands, writes the
 * patch, and records a step whose undo writes the same keys back with the values it read.
 * The inverse goes through the UNWRAPPED repository, so undoing is not itself recorded.
 * Nothing here invents a value: what is written back is exactly what was there, read a
 * moment before, under the same RLS as the write.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 *   - Lifecycle moves (`moveJobStage`, `moveProjectStage`). Forwards-only by Amber's rule
 *     and confirmed by a dialog; the database refuses the way back.
 *   - Creating and deleting. A delete is confirmed and a create has a Remove button beside
 *     what it made; an "undo" that deleted a record somebody had already started filling in
 *     is the kind of surprise this feature must not spring.
 *   - Votes, follows, comments, notes. Each has its own take-back on the screen.
 *
 * WHERE "BEFORE" COMES FROM
 *
 *   Jobs, projects, people, contacts, companies and maintenance requests have a getter, so
 *   the record is read fresh. Tasks, process runs, property values, feedback, maintenance
 *   items, phases and teams have only list reads — so the wrapper remembers the last list it
 *   handed out, by id, and takes "before" from there. A screen always lists before it edits,
 *   so the memory is warm; if it is not (a deep link into a write that never listed), the
 *   write still happens and simply records nothing, which is the honest fallback.
 */

/** Field names as a person would read them in a toast. Anything else is de-camelled. */
const WORDS: Record<string, string> = {
  owningTeam: "team", assigneeId: "assignee", jobNumberOld: "old job number",
  titleType: "title type", targetCompletion: "target completion", sharepointUrl: "folder link",
  startDate: "start date", endDate: "end date", dueDate: "due date", dueOn: "due date",
  ownerProfileId: "owner", categoryId: "trade", reportedByContactId: "reporter",
  loginEmail: "sign-in address", jobTitle: "job title", isDemo: "gate", isActive: "active",
  waitingOn: "waiting on", startedAt: "started", closedReason: "close reason",
  externalRef: "reference", firstName: "first name", lastName: "last name",
  preferredName: "preferred name", tradingName: "trading name", isWarranty: "warranty",
  isExternal: "external", parentTaskId: "parent task", expectedDays: "expected days",
  atRiskLeadDays: "at-risk lead", startsOn: "start", endsOn: "end", addressId: "address"
};
const word = (k: string) =>
  WORDS[k] ?? k.replace(/Id$/, "").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const fields = (patch: object) => Object.keys(patch).map(word).join(", ");

/** The same keys as the patch, with the record's current values — the inverse patch. */
function inverseOf<P extends object>(before: object, patch: P): P {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) out[k] = (before as Record<string, unknown>)[k] ?? null;
  return out as P;
}

/** Undefined keys are "not this edit", never "set to nothing" — a patch is what it names. */
function named<P extends object>(patch: P): P {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = v;
  return out as P;
}

export function withUndo(base: Repository, record: (step: UndoStep) => void = undoHistory.record): Repository {
  // The last-seen records, for the entities that have no getter.
  const tasks = new Map<string, TaskEntry>();
  const runs = new Map<string, ProcessRun>();
  const feedback = new Map<string, FeedbackItem>();
  const items = new Map<string, MaintenanceItem>();
  const phases = new Map<string, RoadmapPhase>();
  const teams = new Map<string, Team>();
  /** Keyed by record and property — `job:1042-01:client`, `project:1042:notes`. */
  const values = new Map<string, PropertyValue>();
  const valueKey = (t: RecordTarget, key: string) =>
    t.jobId != null ? `job:${t.jobId}:${key}` : `project:${t.projectId}:${key}`;
  const rememberValues = (rows: PropertyValue[]) => {
    rows.forEach(v => {
      if (v.jobId != null) values.set(`job:${v.jobId}:${v.propertyKey}`, v);
      else if (v.projectId != null) values.set(`project:${v.projectId}:${v.propertyKey}`, v);
    });
  };
  const rememberFeedback = (rows: FeedbackItem[]) => { rows.forEach(f => feedback.set(f.id, f)); return rows; };

  /**
   * One patch-shaped write. `find` answers the record as it stands (or null, in which case
   * the write goes through unrecorded); `write` is the base method; `what` names the record
   * for the toast.
   */
  const patched = <Id, P extends object, R>(
    find: (id: Id) => Promise<object | null | undefined>,
    write: (id: Id, patch: P) => Promise<R>,
    what: (id: Id, before: object) => string
  ) => async (id: Id, patch: P): Promise<R> => {
    const clean = named(patch);
    if (Object.keys(clean).length === 0) return write(id, patch);
    const before = await find(id).catch(() => null);
    // The inverse is taken BEFORE the write, not after. A repository that hands back the
    // object it also mutates (the stub harness does; a cache might) would otherwise show
    // the new value by the time the inverse was built, and undo would rewrite the change
    // it was meant to take back — which is exactly what the first run of this did.
    const inverse = before ? inverseOf(before, clean) : null;
    const label = before ? `${what(id, before)}: ${fields(clean)}` : null;
    const result = await write(id, patch);
    if (inverse && label) {
      record({
        label,
        undo: async () => { await write(id, inverse); },
        redo: async () => { await write(id, clean); }
      });
    }
    return result;
  };

  return {
    ...base,

    // ---- the list reads the wrapper remembers -------------------------------------
    async listTasks(opts) {
      const rows = await base.listTasks(opts);
      rows.forEach(t => tasks.set(t.id, t));
      return rows;
    },
    async listProcessRuns(target) {
      const rows = await base.listProcessRuns(target);
      rows.forEach(r => runs.set(r.id, r));
      return rows;
    },
    async listPropertyValues(target) {
      const rows = await base.listPropertyValues(target);
      rememberValues(rows);
      return rows;
    },
    async listFeedback(kind) { return rememberFeedback(await base.listFeedback(kind)); },
    async listMaintenanceItems(requestId) {
      const rows = await base.listMaintenanceItems(requestId);
      rows.forEach(i => items.set(i.id, i));
      return rows;
    },
    async listRoadmapPhases() {
      const rows = await base.listRoadmapPhases();
      rows.forEach(p => phases.set(p.id, p));
      return rows;
    },
    async listTeams() {
      const rows = await base.listTeams();
      rows.forEach(t => teams.set(t.id, t));
      return rows;
    },

    // ---- records with a getter: read fresh ---------------------------------------
    updateJob: patched(
      id => base.getJob(id),
      (id, patch) => base.updateJob(id, patch),
      id => `Job ${id}`
    ),
    updateProject: patched(
      id => base.getProject(String(id)),
      (id, patch) => base.updateProject(id, patch),
      id => `Project ${id}`
    ),
    updateProfile: patched(
      async id => (await base.listProfiles()).find(p => p.id === id),
      (id, patch) => base.updateProfile(id, patch),
      (_id, before) => (before as { fullName: string }).fullName
    ),
    async setProfileActive(id, active) {
      const before = (await base.listProfiles().catch(() => [])).find(p => p.id === id);
      const result = await base.setProfileActive(id, active);
      if (before && before.active !== active) {
        record({
          label: `${before.fullName}: ${active ? "restored" : "deactivated"}`,
          undo: async () => { await base.setProfileActive(id, before.active); },
          redo: async () => { await base.setProfileActive(id, active); }
        });
      }
      return result;
    },
    updateContact: patched(
      id => base.getContact(id),
      (id, patch) => base.updateContact(id, patch),
      (_id, before) => (before as { fullName: string }).fullName
    ),
    updateCompany: patched(
      id => base.getCompany(id),
      (id, patch) => base.updateCompany(id, patch),
      (_id, before) => (before as { name: string }).name
    ),
    updateMaintenanceRequest: patched(
      id => base.getMaintenanceRequest(id),
      (id, patch) => base.updateMaintenanceRequest(id, patch),
      (_id, before) => `Maintenance ${(before as { number: string | number }).number}`
    ),

    // ---- records the wrapper remembers -------------------------------------------
    updateTask: patched(
      async id => tasks.get(id),
      (id, patch) => base.updateTask(id, patch),
      (_id, before) => `Task “${(before as { name: string }).name}”`
    ),
    updateProcessRun: patched(
      async id => runs.get(id),
      (id, patch) => base.updateProcessRun(id, patch),
      (_id, before) => `${(before as { processName: string }).processName} on ${(before as { jobId: string | null; recordProjectId: number }).jobId ?? `project ${(before as { recordProjectId: number }).recordProjectId}`}`
    ),
    updateMaintenanceItem: patched(
      async id => items.get(id),
      (id, patch) => base.updateMaintenanceItem(id, patch),
      (_id, before) => `Item “${(before as { description: string }).description}”`
    ),
    updateRoadmapPhase: patched(
      async id => phases.get(id),
      (id, patch) => base.updateRoadmapPhase(id, patch),
      (_id, before) => `Phase “${(before as { name: string }).name}”`
    ),
    updateTeam: patched(
      async id => teams.get(id),
      (id, patch) => base.updateTeam(id, patch),
      (_id, before) => `Team ${(before as { name: string }).name}`
    ),

    // ---- the tracker's three triage writes ---------------------------------------
    async setFeedbackStage(id, stage, note) {
      const before = feedback.get(id);
      const rows = rememberFeedback(await base.setFeedbackStage(id, stage, note));
      if (before && before.stage !== stage) {
        // The note is not re-sent on undo: the move back is its own event, and a comment
        // saying why it went forward would be wrong on the way back.
        record({
          label: `“${before.title}”: stage`,
          undo: async () => { rememberFeedback(await base.setFeedbackStage(id, before.stage)); },
          redo: async () => { rememberFeedback(await base.setFeedbackStage(id, stage)); }
        });
      }
      return rows;
    },
    async setFeedbackPhase(id, phaseId) {
      const before = feedback.get(id);
      const rows = rememberFeedback(await base.setFeedbackPhase(id, phaseId));
      if (before && before.roadmapPhaseId !== phaseId) {
        record({
          label: `“${before.title}”: roadmap phase`,
          undo: async () => { rememberFeedback(await base.setFeedbackPhase(id, before.roadmapPhaseId)); },
          redo: async () => { rememberFeedback(await base.setFeedbackPhase(id, phaseId)); }
        });
      }
      return rows;
    },
    async setFeedbackKind(id, kind) {
      const before = feedback.get(id);
      const rows = rememberFeedback(await base.setFeedbackKind(id, kind));
      if (before && before.kind !== kind) {
        record({
          label: `“${before.title}”: filed as`,
          undo: async () => { rememberFeedback(await base.setFeedbackKind(id, before.kind)); },
          redo: async () => { rememberFeedback(await base.setFeedbackKind(id, kind)); }
        });
      }
      return rows;
    },

    // ---- property values: set and clear are each other's inverse ------------------
    async setPropertyValue(target, propertyKey, value) {
      const before = values.get(valueKey(target, propertyKey));
      const result = await base.setPropertyValue(target, propertyKey, value);
      values.set(valueKey(target, propertyKey), result);
      const restore = async () => {
        if (before) values.set(valueKey(target, propertyKey), await base.setPropertyValue(target, propertyKey, before.value));
        else { await base.clearPropertyValue(target, propertyKey); values.delete(valueKey(target, propertyKey)); }
      };
      record({
        label: `${word(propertyKey)} on ${target.jobId ?? `project ${target.projectId}`}`,
        undo: restore,
        redo: async () => { values.set(valueKey(target, propertyKey), await base.setPropertyValue(target, propertyKey, value)); }
      });
      return result;
    },
    async clearPropertyValue(target, propertyKey) {
      const before = values.get(valueKey(target, propertyKey));
      await base.clearPropertyValue(target, propertyKey);
      values.delete(valueKey(target, propertyKey));
      if (before) {
        record({
          label: `${word(propertyKey)} on ${target.jobId ?? `project ${target.projectId}`}: cleared`,
          undo: async () => { values.set(valueKey(target, propertyKey), await base.setPropertyValue(target, propertyKey, before.value)); },
          redo: async () => { await base.clearPropertyValue(target, propertyKey); values.delete(valueKey(target, propertyKey)); }
        });
      }
    }
  };
}
