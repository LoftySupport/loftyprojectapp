/**
 * The lookups.
 *
 * These are reference data, not records: the business process itself. They come from
 * seeded Supabase tables (`stages`, `teams`, `property_defs`, …) rather than from
 * anything a user creates, which is why they can be stated here and still be honest —
 * without them there is no board to look at and no field to bind.
 *
 * Everything else on screen is a `{{table.column}}` token until its table is wired.
 *
 * When these tables come online, `listStages()` and friends replace these constants and
 * nothing else changes: every screen already reads them through the repository seam.
 */

import { SEED_STAGES } from "./stubRepository";

export const STAGE_NAMES: string[] = SEED_STAGES.map(s => s.name);

/**
 * Which team owns which phase — `template_phases.owning_team_id`.
 *
 * Stated, not derived. Deriving it from whatever jobs happen to be loaded means a team
 * holding nothing right now vanishes from the model, which is wrong: a team that owns a
 * phase owns it on a quiet day too.
 */
export const PHASE_TEAMS: Record<string, string[]> = {
  "Sales & acquisition": ["Acquisition & Development", "Sales Admin"],
  "Planning & Engineering": ["Design"],
  "Working Drawings & Contracts": ["Pre-Construction Admin"],
  "Preconstruction": ["Scheduling", "Selections"],
  "Scheduling & Estimating": ["Estimating"],
  "Construction & execution": ["Construction"],
  "Post-construction & closeout": ["Construction Admin", "Finance"],
  "Handover & maintenance": ["Maintenance"]
};

/** Every team, whether or not it currently holds a job. The `teams` table. */
export const TEAMS: string[] = [
  ...new Set(STAGE_NAMES.flatMap(s => PHASE_TEAMS[s] ?? []))
].sort();

/** How long a phase is expected to take — `template_phases.expected_days`. */
export const PHASE_EXPECTED_DAYS: Record<string, number> = {
  "Sales & acquisition": 10,
  "Planning & Engineering": 14,
  "Working Drawings & Contracts": 12,
  "Preconstruction": 10,
  "Scheduling & Estimating": 12,
  "Construction & execution": 90,
  "Post-construction & closeout": 14,
  "Handover & maintenance": 21
};

export const HEALTH_STATUSES = ["on-track", "at-risk", "stale"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export const HEALTH_LABELS: Record<HealthStatus, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  stale: "Stalled"
};

export const JOB_TYPES = ["Residential", "Commercial", "Development"];

// ------------------------------------------------------------- properties

/**
 * A property IS a field — the two words mean the same thing.
 *
 * Every one lives at **project** or **job** level and carries two pieces of context:
 * which stage captures it, and which team captures it. That is the whole of it.
 *
 * Stage is deliberately not a third level. A pour date is a property of a *job* that
 * happens to be filled in at Scheduling & Estimating; making "stage" a level would
 * conflate where a field is captured with what it hangs off, and buy a value table
 * nobody needs.
 *
 * These are rows, not columns — which is why there is no `field_1`, `field_2`. The
 * count is data. Add a definition and one more slot renders, everywhere it belongs.
 */
export type PropertyScope = "project" | "job";

export type PropertyFormat =
  | "text"
  | "number"
  | "currency"
  | "date"
  | "checkbox"
  | "file"
  | "single select"
  | "multi select"
  | "person"
  | "link";

export interface PropertyDef {
  /** Stable key, referenced by automations. `property_defs.key` */
  key: string;
  /** What people see. Renameable. */
  label: string;
  scope: PropertyScope;
  /** Where in the pipeline it gets captured. */
  stage: string;
  /** Who captures it — one of the teams that owns `stage`. */
  team: string;
  format: PropertyFormat;
  /** Required to *leave* `stage`, not required to create the record. */
  required: boolean;
  automation?: string;
}

export const PROPERTY_DEFS: PropertyDef[] = [
  { key: "address", label: "Site address", scope: "job", stage: "Sales & acquisition", team: "Sales Admin", format: "text", required: true },
  { key: "type", label: "Project type", scope: "project", stage: "Sales & acquisition", team: "Acquisition & Development", format: "single select", required: true, automation: "Recalculate dependent dates" },
  { key: "deposit", label: "Deposit status", scope: "job", stage: "Sales & acquisition", team: "Sales Admin", format: "single select", required: true, automation: "Notify owning team on change" },
  { key: "drawings", label: "Drawings status", scope: "job", stage: "Planning & Engineering", team: "Design", format: "single select", required: true, automation: "Block stage exit until set" },
  { key: "final_eer", label: "Final EER", scope: "job", stage: "Planning & Engineering", team: "Design", format: "file", required: true, automation: "Block stage exit until set" },
  { key: "contract", label: "Contract status", scope: "job", stage: "Working Drawings & Contracts", team: "Pre-Construction Admin", format: "single select", required: true, automation: "Block stage exit until set" },
  { key: "contract_val", label: "Contract value", scope: "project", stage: "Working Drawings & Contracts", team: "Pre-Construction Admin", format: "currency", required: false },
  { key: "council_hold", label: "Council hold", scope: "job", stage: "Preconstruction", team: "Scheduling", format: "checkbox", required: false, automation: "Notify owning team on change" },
  { key: "temp_fence", label: "Temp fence supplier", scope: "job", stage: "Scheduling & Estimating", team: "Estimating", format: "text", required: false, automation: "Start SLA clock when set" },
  { key: "pour_date", label: "Pour date", scope: "job", stage: "Scheduling & Estimating", team: "Estimating", format: "date", required: true, automation: "Recalculate dependent dates" },
  { key: "pc_date", label: "Practical completion", scope: "job", stage: "Construction & execution", team: "Construction", format: "date", required: true, automation: "Notify assignee when set" }
];

/**
 * Definitions that already have a column of their own on `projects` / `jobs`, so they
 * render in their own section rather than in the generic slot list. Everything else is
 * a `property_values` row.
 */
export const COLUMN_BACKED_KEYS = ["address", "type", "contract", "deposit", "drawings"];

export function slotsFor(scope: PropertyScope): PropertyDef[] {
  return PROPERTY_DEFS.filter(d => d.scope === scope && !COLUMN_BACKED_KEYS.includes(d.key));
}

/** Group definitions by the stage that captures them, in pipeline order. */
export function byStage(defs: PropertyDef[]): { stage: string; defs: PropertyDef[] }[] {
  return STAGE_NAMES.map(stage => ({ stage, defs: defs.filter(d => d.stage === stage) })).filter(
    g => g.defs.length > 0
  );
}

// ------------------------------------------------------------- checkpoints

/** `template_checkpoints` — what each phase expects done before it hands over. */
export const PHASE_CHECKPOINTS: Record<string, string[]> = {
  "Sales & acquisition": ["Enquiry logged", "Site inspection booked", "Contract issued", "Deposit received"],
  "Planning & Engineering": ["Design brief finalised", "Preliminary floor plan", "Engineering assessment", "Client sign-off"],
  "Working Drawings & Contracts": ["Working drawings started", "Drawings sent to client", "Contract prepared", "Contract signed"],
  "Preconstruction": ["Selections booked", "Selections finalised", "Site survey", "Baseline schedule drafted"],
  "Scheduling & Estimating": ["Quotes requested", "Purchase orders issued", "Site prep checklist started", "Trades confirmed"],
  "Construction & execution": ["Site established", "Slab poured", "Frame complete", "Lock-up reached"],
  "Post-construction & closeout": ["Defect walkthrough", "Defect list issued", "Final invoice", "Compliance pack lodged"],
  "Handover & maintenance": ["Keys handed over", "Handover pack issued", "Maintenance period opened", "90-day review booked"]
};
