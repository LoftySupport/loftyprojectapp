import { DICTIONARY } from "./dictionary";
import {
  PROJECT_TYPE_LABELS, RECORD_STATUS_LABELS, TITLE_TYPE_LABELS, teamName
} from "./types";

/**
 * Turning one `activity_audit` row into a sentence somebody can act on.
 *
 * Amber, 28 August: *"with any of the updates and changes made it needs to say who
 * changed what to what — so when I see Amber changed a profile I need to see what
 * profile Amber changed, and what part of the changes were made. E.g. she changed Ketan
 * (with link to Ketan's record) from Demo mode to not demo mode. Or Deanna changed
 * selections due date from 1/7/26 to 7/7/26."*
 *
 * Four facts, and the feed was carrying one and a half: it said "Updated profiles" and
 * "Assigned to changed". Who, which record, which field, and **from what to what** — the
 * last one is the whole point, because a history that says a field changed and not what
 * it changed from cannot answer the question anybody opens a history to ask.
 *
 * The audit table stores whole rows as jsonb, so all four are already there. This module
 * is the reduction: diff the snapshots, name the columns with their friendly names from
 * the dictionary, and render the values as the words a person uses rather than the keys
 * the database stores — a team slug as its team name, a profile id as a person's name, a
 * boolean as Yes or No, a timestamp as a date.
 *
 * It lives here rather than in the repository because two feeds need exactly this and
 * they must not drift: the record panel on a project or a job, and the per-person
 * activity list in Admin.
 */

/**
 * Columns that move on their own and mean nothing.
 *
 * The touch trigger writes `*_updated_at` and `*_updated_by` on every update, so an
 * edit that changed one real field produces a diff of three. Worse, a write that changed
 * nothing real — a save with no edits, a trigger touching a row — produces a diff of two
 * and would appear in the feed as a change with no content. Three of the five audit rows
 * on project 1002 are exactly that.
 *
 * They are dropped from the *narrative*, not from the table: the columns are still
 * recorded, and "when did this row last change" still has an answer.
 */
export const AUDIT_NOISE = new Set([
  "job_stage_entered_at", "project_stage_entered_at",
  // The value's own stamp pair: who recorded it is the line's author, not a change.
  "property_value_set_at", "property_value_set_by"
]);

/**
 * Since 0080 every table is audited, so the noise rule is the convention itself rather
 * than a list: every table's touch pair is `<table>_updated_at` / `<table>_updated_by`.
 */
export const isNoise = (column: string): boolean =>
  AUDIT_NOISE.has(column) || column.endsWith("_updated_at") || column.endsWith("_updated_by");

/** Names the row cannot carry: a process run's process, a property value's label. */
export interface SubjectNames {
  process: Map<string, string>;
  property: Map<string, string>;
}

/** One field that moved, with both sides already rendered for reading. */
export interface FieldChange {
  column: string;
  /** The dictionary's friendly name — "Assigned to", not `job_assignee_id`. */
  label: string;
  /**
   * The old and new values as words. Null means the field was genuinely empty, which
   * the feed says as "empty" — a real answer, and not the same as "we could not tell".
   */
  from: string | null;
  to: string | null;
  /**
   * True when the values themselves are not renderable — an address id, say, which is a
   * uuid pointing at a row this feed does not read. The line then says the field
   * changed and stops, rather than showing two uuids and calling it a history.
   */
  opaque?: boolean;
}

export interface AuditSnapshot {
  table_name: string;
  operation: string;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
}

/** How this module resolves ids it finds inside a row. Supplied by the repository. */
export interface NameLookup {
  /** A `profiles.profile_id` → that person's full name, or null if not readable. */
  person(id: string): string | null;
  /**
   * An auth uid → the person who signed in as it. Separate from `person` because the
   * audit table records the actor as `jwt_sub`, which is an auth uid, while every id
   * inside a row is a profile id. Looking one up in the other map returns nobody, every
   * time, and the feed then says it does not know who did something it knows perfectly.
   */
  actor(authUserId: string): string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** The dictionary's name for a column, falling back to the column itself. */
export function columnLabel(table: string, column: string): string {
  return DICTIONARY.find(d => d.id === `${table}.${column}`)?.friendlyName ?? column;
}

/**
 * One stored value as the word a person would say.
 *
 * Returns `undefined` — distinct from null — when the value cannot be rendered honestly.
 * Null is "the field was empty"; undefined is "this is an id and naming it is beyond
 * what this feed reads", and the caller turns that into a line without values rather
 * than into a line with a uuid in it.
 */
export function renderValue(
  column: string, raw: unknown, lookup: NameLookup
): string | null | undefined {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (Array.isArray(raw)) return raw.length ? raw.map(v => String(v)).join(", ") : null;
  if (typeof raw === "object") return undefined;

  const v = String(raw);
  if (v === "true" || v === "false") return v === "true" ? "Yes" : "No";

  if (UUID.test(v)) {
    // A person, if this is a person. Everything else that is a uuid — an address id, a
    // saved view — is an id we would only be able to print, and printing it is worse
    // than saying the field changed.
    return lookup.person(v) ?? undefined;
  }

  // Teams are stored as slugs; `teamName` is the display name, and falls back to the
  // slug for a team that has been retired since.
  if (column.endsWith("_owning_team") || column === "team_id") return teamName(v);

  if (column.endsWith("_status")) return RECORD_STATUS_LABELS[v as keyof typeof RECORD_STATUS_LABELS] ?? v;
  if (column.endsWith("_type") && v in PROJECT_TYPE_LABELS) {
    return PROJECT_TYPE_LABELS[v as keyof typeof PROJECT_TYPE_LABELS];
  }
  if (column.endsWith("title_type")) return TITLE_TYPE_LABELS[v as keyof typeof TITLE_TYPE_LABELS] ?? v;

  // Dates as dates. A due date moving is the example Amber gave, and "2026-07-01" is
  // not how anybody says it out loud.
  if (DATE_ONLY.test(v)) return new Date(v + "T00:00:00").toLocaleDateString();
  if (TIMESTAMP.test(v)) return new Date(v).toLocaleString();

  return v;
}

/**
 * Every field that moved between the two snapshots, ready to read.
 *
 * Compared as strings because jsonb round-trips a number as a number and a numeric text
 * column as a string, and `1042 !== "1042"` would report a change nobody made.
 */
export function changesBetween(
  snap: AuditSnapshot, lookup: NameLookup
): FieldChange[] {
  const before = snap.old_row ?? {};
  const after = snap.new_row ?? {};
  const columns = Object.keys(after).filter(
    k => !isNoise(k) && String(before[k] ?? "") !== String(after[k] ?? "")
  );

  return columns.map(column => {
    const from = renderValue(column, before[column], lookup);
    const to = renderValue(column, after[column], lookup);
    const opaque = from === undefined || to === undefined;
    return {
      column,
      label: columnLabel(snap.table_name, column),
      from: opaque ? null : from ?? null,
      to: opaque ? null : to ?? null,
      ...(opaque ? { opaque: true } : {})
    };
  });
}

/** Where the record a line is about lives, so the subject can be a link to it. */
export function recordLink(
  table: string, row: Record<string, unknown> | null, names?: SubjectNames
): { subject: string; href: string | null } {
  if (!row) return { subject: "", href: null };
  // Where a change on a job's or project's dependent lives: the record it belongs to.
  const home = row.job_id != null ? `/jobs/${String(row.job_id)}`
    : row.project_id != null ? `/projects/${String(row.project_id)}` : null;
  switch (table) {
    case "tasks":
      return { subject: `task “${String(row.task_name ?? "")}”`, href: home };
    case "task_checklist_items":
      return { subject: `checklist item “${String(row.task_checklist_item_text ?? "")}”`, href: null };
    case "process_runs": {
      const name = names?.process.get(String(row.process_id ?? "")) ?? "a process";
      const attempt = Number(row.process_run_attempt ?? 1);
      return { subject: `process ${name}${attempt > 1 ? ` (attempt ${attempt})` : ""}`, href: home };
    }
    case "property_values": {
      const label = names?.property.get(String(row.property_def_key ?? "")) ?? String(row.property_def_key ?? "a property");
      return { subject: label, href: home };
    }
    case "comments":
      return { subject: "a comment", href: home };
    case "documents":
      return { subject: `document “${String(row.document_name ?? "")}”`, href: null };
    case "variations":
      return { subject: `variation ${String(row.variation_number ?? "")}`, href: home };
    case "property_defs":
      return { subject: `property definition “${String(row.property_def_label ?? row.property_def_key ?? "")}”`, href: "/setup/properties" };
    case "processes":
      return { subject: `process definition “${String(row.process_name ?? "")}”`, href: "/setup/processes" };
    case "jobs": {
      const id = row.job_id == null ? "" : String(row.job_id);
      return { subject: id, href: id ? `/jobs/${id}` : null };
    }
    case "projects": {
      const id = row.project_id == null ? "" : String(row.project_id);
      return { subject: id, href: id ? `/projects/${id}` : null };
    }
    case "profiles": {
      const id = row.profile_id == null ? "" : String(row.profile_id);
      // Admin is where a person's record is edited, and it opens them by id (see
      // AdminPage's `person` parameter). A feed that names Ketan and cannot take you
      // to Ketan is the half-answer this whole change is about.
      return {
        subject: String(row.profile_full_name ?? id),
        href: id ? `/admin?person=${id}` : null
      };
    }
    case "addresses":
      return { subject: String(row.consolidated_address ?? ""), href: null };
    default:
      return { subject: "", href: null };
  }
}

/** The verb for a row that is not a field-by-field update. */
export function headline(snap: AuditSnapshot): string | null {
  if (snap.operation === "INSERT") {
    switch (snap.table_name) {
      case "projects": return "opened";
      case "process_runs": return "started";
      case "property_values": return "recorded";
      case "comments": return "added";
      case "tasks": return "added";
      default: return "created";
    }
  }
  if (snap.operation === "DELETE") return snap.table_name === "property_values" ? "cleared" : "deleted";
  return null;
}

/**
 * One change as a sentence: "Assigned to changed from Deanna Nguyen to Ketan Patel".
 *
 * Kept here rather than in the components so the record feed and the Admin list say it
 * the same way. A field that went from nothing to something reads "set to X", and one
 * that was cleared reads "cleared" — "changed from empty to X" is technically true and
 * nobody talks like that.
 */
export function changeSentence(c: FieldChange): string {
  if (c.opaque) return `${c.label} changed`;
  // "is now", not "set to": half the labels in this app end in a preposition, and
  // "Assigned to set to Deanna Nguyen" is what "set to" produces on those. Watched on
  // the seeded feed before it was changed.
  if (c.from === null && c.to !== null) return `${c.label} is now ${c.to}`;
  if (c.to === null && c.from !== null) return `${c.label} cleared (was ${c.from})`;
  if (c.from === null && c.to === null) return `${c.label} changed`;
  return `${c.label} changed from ${c.from} to ${c.to}`;
}

/** Every uuid in either snapshot, so the repository can resolve the people among them. */
export function idsIn(snap: AuditSnapshot): string[] {
  const out: string[] = [];
  for (const row of [snap.old_row, snap.new_row]) {
    for (const v of Object.values(row ?? {})) {
      if (typeof v === "string" && UUID.test(v)) out.push(v);
    }
  }
  return out;
}
