// app/src/data/orphanProperties.ts
import { DICTIONARY, type DictionaryEntry } from "./dictionary";
import type { ProcessProperty, PropertyDef } from "./types";

/**
 * Which fields of a job or a project no process collects.
 *
 * Amber, 12 September: *"All properties should belong to a process if it is job or
 * project and if they don't they should be flagged as orphaned in the properties setting
 * unless they are the primary key. This should have all properties including properties
 * not on the properties table eg address."* And, clarifying: *"properties that are job or
 * project properties belong to a process. A system property such as a primary key, a user
 * property or contact property or task or maintenance property don't need to belong to a
 * process but may belong to an automation."*
 *
 * THE LAST SENTENCE IS THE HARD HALF, AND IT IS THE POINT
 *
 *   A "property" on this screen has meant a `property_defs` row — configurable, scoped,
 *   attachable to a process through `process_properties`. The current address is not one.
 *   Neither is the council, the owning team, the assignee, the title type, the SharePoint
 *   folder or either completion date: they are **columns on `jobs` and `projects`**. So a
 *   sweep that only looked at `property_defs` would report a clean board while the six
 *   things on the job record's Key properties panel were collected by nothing at all.
 *
 *   The second source is therefore the **data dictionary**, which already carries one
 *   entry per column with its meaning and its status. That is a real record of what the
 *   record holds, not a list invented here — and when a column is missing from it, the
 *   dictionary is what is wrong, which is a finding of its own.
 *
 * TWO EXEMPTIONS, BOTH HERS, NEITHER INVENTED
 *
 *   **Only jobs and projects are swept.** A contact, a task, a maintenance request and a
 *   person all hold fields that no process collects, and that is correct: the rule is
 *   about the two records a process runs on. Nothing on any other table is counted or
 *   reported here.
 *
 *   **A system property is exempt** — *"a system property such as a primary key"*. The
 *   test is not a list typed out here, which would be a guess wearing a rule's clothes.
 *   It is what the **dictionary already says about who writes the value**: a primary key,
 *   a generated column, anything a trigger assigns, stamps, maintains, bumps or
 *   recomputes, and the audit quartet. Nobody records those, so no process can collect
 *   them. Everything else on a job or a project is a field a person fills in, and
 *   Amber's rule applies to it.
 *
 *   Her third clause — *"but may belong to an automation"* — is not built. There is no
 *   automation model to attach one to yet, and inventing the attachment before the model
 *   would be the plausible value this repository keeps warning about.
 *
 * AND WHAT IT CANNOT FIX
 *
 *   `process_properties.property_key` points at `property_defs`. A column has no def, so
 *   **no process can collect it today** — the attachment has nowhere to hang. That is why
 *   a column reads as `unattachable` rather than as a plain `orphaned`: the first is a
 *   gap somebody can close on this screen, the second needs a decision about whether the
 *   fixed columns get definitions at all.
 */

export type FieldVerdict =
  /** A process collects it. Nothing to do. */
  | "collected"
  /** A property definition no process collects. Fixable on this screen. */
  | "orphaned"
  /** A live column with no property definition, so nothing can be attached to it yet. */
  | "unattachable"
  /** Written by the database — a key, a generated value, a trigger's work. Exempt. */
  | "system"
  /** The dictionary says this column was merged away or archived. It is not a live field. */
  | "gone";

export interface FieldRow {
  /** `job.site_fenced` for a property, `jobs.job_current_address_id` for a column. */
  id: string;
  label: string;
  /** Which record it belongs to. */
  scope: "job" | "project";
  /** A `property_defs` row, or a column the dictionary describes. */
  source: "property" | "column";
  verdict: FieldVerdict;
  /** The processes that collect it, by id. Empty for everything but `collected`. */
  processIds: string[];
  /** Why it reads the way it does, in one line, for the screen to print. */
  because: string;
}

/** The four the database writes and nobody records. Matched by suffix, not by a list. */
const AUDIT = ["_created_at", "_created_by", "_updated_at", "_updated_by"];

/**
 * The job and project columns the DATABASE writes, named one at a time.
 *
 * WHY A LIST AND NOT A TEST ON THE DICTIONARY'S PROSE
 *
 *   The first attempt read `rules` and `relationships` for "assigned by", "maintained
 *   by", "bumped by" and so on. It worked on most columns and then quietly disagreed with
 *   itself on the siblings: `jobs.job_stage_entered_at` says *"maintained by the trigger"*
 *   and `projects.project_stage_entered_at` says *"moved by a trigger"*, and the pattern
 *   caught one and not the other. Widening it to catch both then swept in `job_stage` and
 *   `project_stage` — which a person sets, from the Move control on the record — because
 *   their prose mentions the trigger that stamps the date beside them.
 *
 *   A pattern tuned against English until it matches somebody's intuition is a guess
 *   wearing a rule's clothes: it will misclassify the next column somebody documents and
 *   say nothing about it. So the exemptions are written out, each with its reason, and the
 *   screen shows the System group in full — a wrong one is visible rather than hidden.
 *
 * The audit quartet is matched by suffix instead, because *that* is unambiguous: four
 * endings, on every table, written by `touch_updated_at` and the insert defaults.
 */
const SYSTEM_COLUMNS: Record<string, string> = {
  // Identity. Amber's own stated exemption: "a system property such as a primary key".
  "jobs.job_id": "the job number — the primary key, stamped at insert",
  "projects.project_id": "the project number — the primary key",
  // The parent link. Chosen once when the job is created and structural afterwards; it is
  // the job's place in the tree rather than a fact somebody records about the job.
  "jobs.project_id": "which project the job belongs to — set at creation, never collected",
  // Counters and sequences. Only triggers read or write these.
  "jobs.job_sequence": "the counter within the project, assigned by a trigger",
  "jobs.job_maintenance_seq_high_water": "a counter, bumped by a trigger",
  "projects.project_job_seq_high_water": "a counter, bumped by a trigger",
  // Stamped when the stage moves, so that days-in-stage can be computed rather than stored.
  // The STAGE itself is not here: a person sets that, from the record's Move control.
  "jobs.job_stage_entered_at": "stamped by a trigger when the stage changes",
  "projects.project_stage_entered_at": "stamped by a trigger when the phase changes"
};

/** Nobody records this value, so no process can collect it. */
const isSystem = (e: DictionaryEntry) =>
  AUDIT.some(suffix => e.column.endsWith(suffix)) || e.id in SYSTEM_COLUMNS;

const TABLE_SCOPE: Record<string, "job" | "project"> = { jobs: "job", projects: "project" };

/** "merged" and "archived" mean the column is not there any more. */
const isGone = (e: DictionaryEntry) => e.status === "merged" || e.status === "archived";

/**
 * Every field of every job and project, and whether a process collects it.
 *
 * `defs` and `byProperty` come from the repository; the columns come from the dictionary,
 * which is a module rather than a read — the same source the Dictionary page renders.
 */
export function fieldsByCollection(
  defs: PropertyDef[],
  byProperty: Map<string, ProcessProperty[]>,
  dictionary: DictionaryEntry[] = DICTIONARY
): FieldRow[] {
  const rows: FieldRow[] = [];

  // ---- the property definitions ------------------------------------------------
  for (const d of defs) {
    if (d.scope !== "job" && d.scope !== "project") continue;   // process-scoped properties are already a process's
    const processIds = (byProperty.get(d.key) ?? []).map(pp => pp.processId);
    rows.push({
      id: d.key,
      label: d.label,
      scope: d.scope,
      source: "property",
      verdict: processIds.length > 0 ? "collected" : "orphaned",
      processIds,
      because: processIds.length > 0
        ? `collected by ${processIds.length} process${processIds.length === 1 ? "" : "es"}`
        : "no process collects it — attach it to one in Setup → Processes"
    });
  }

  // ---- the columns the dictionary describes ------------------------------------
  // Keyed by column name so a property def that shadows a column is not counted twice.
  const defKeys = new Set(defs.map(d => d.key));
  for (const e of dictionary) {
    const scope = TABLE_SCOPE[e.table];
    if (!scope) continue;
    if (defKeys.has(e.column) || defKeys.has(`${scope}.${e.column}`)) continue;

    const verdict: FieldVerdict =
      isGone(e) ? "gone"
      : isSystem(e) ? "system"
      : "unattachable";

    rows.push({
      id: e.id,
      label: e.friendlyName,
      scope,
      source: "column",
      verdict,
      processIds: [],
      because:
        verdict === "gone" ? "merged away — not a live column"
        : verdict === "system" ? SYSTEM_COLUMNS[e.id] ?? "written by the database, recorded by nobody"
        : "a column, not a property — no process can collect it until it has a definition"
    });
  }

  return rows;
}

/** What the screen puts at the top: how many fields nothing collects. */
export function orphanCount(rows: FieldRow[]): { orphaned: number; unattachable: number } {
  return {
    orphaned: rows.filter(r => r.verdict === "orphaned").length,
    unattachable: rows.filter(r => r.verdict === "unattachable").length
  };
}

/** Whether a verdict is a gap somebody should close, as opposed to a fact of the schema. */
export const isGap = (v: FieldVerdict) => v === "orphaned" || v === "unattachable";

export const VERDICT_LABELS: Record<FieldVerdict, string> = {
  collected: "Collected",
  orphaned: "Orphaned",
  unattachable: "Not a property",
  system: "System",
  gone: "Merged away"
};
