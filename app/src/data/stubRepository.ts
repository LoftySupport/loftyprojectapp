import type { Repository, RepositoryMethod } from "./repository";
import type {
  Job,
  Profile,
  Project,
  PropertyDef,
  Stage,
  Team,
  TemplateCheckpoint,
  TemplatePhase
} from "./types";

/**
 * The starting point: structure, no data.
 *
 * Record methods resolve empty. Screens render their real chrome — toolbar, columns,
 * table headers, filters — around an empty state, which is exactly the shape they will
 * have on a fresh tenant anyway. Building against this first means the empty states are
 * designed rather than discovered later.
 *
 * The **lookups** are the exception, and they answer honestly: stages, teams, template
 * phases, checkpoints and property definitions are the business process, not something a
 * user creates. Without them there is no board to look at and no field to bind. They are
 * seeded here so the stub can serve them, and they are served *through the repository*
 * rather than exported as constants — the day they exist in Supabase, `listTeams()`
 * changes and nothing else does.
 */

/**
 * The audit quartet on seeded rows.
 *
 * `createdBy` and `updatedBy` are null, which is the honest answer: nobody created a
 * seed. That is exactly why the columns are nullable rather than not-null with a
 * placeholder — a placeholder author is a lie that survives into production.
 */
const SEEDED = {
  createdAt: "2026-08-01T00:00:00Z",
  createdBy: null,
  updatedAt: "2026-08-01T00:00:00Z",
  updatedBy: null
};

export const SEED_STAGES: Stage[] = [
  { id: 1, name: "Sales & acquisition", position: 1, ...SEEDED },
  { id: 2, name: "Planning & Engineering", position: 2, ...SEEDED },
  { id: 3, name: "Working Drawings & Contracts", position: 3, ...SEEDED },
  { id: 4, name: "Preconstruction", position: 4, ...SEEDED },
  { id: 5, name: "Scheduling & Estimating", position: 5, ...SEEDED },
  { id: 6, name: "Construction & execution", position: 6, ...SEEDED },
  { id: 7, name: "Post-construction & closeout", position: 7, ...SEEDED },
  { id: 8, name: "Handover & maintenance", position: 8, ...SEEDED }
];

/**
 * Which teams own which phase, and how long each should take.
 *
 * Stated, not derived from whatever jobs happen to be loaded — deriving it means a team
 * holding nothing right now vanishes from the model, which is wrong: a team that owns a
 * phase owns it on a quiet day too. That bug was real, and this is the fix.
 */
const PHASES: [string, string[], number][] = [
  ["Sales & acquisition", ["Acquisition & Development", "Sales Admin"], 10],
  ["Planning & Engineering", ["Design"], 14],
  ["Working Drawings & Contracts", ["Pre-Construction Admin"], 12],
  ["Preconstruction", ["Scheduling", "Selections"], 10],
  ["Scheduling & Estimating", ["Estimating"], 12],
  ["Construction & execution", ["Construction"], 90],
  ["Post-construction & closeout", ["Construction Admin", "Finance"], 14],
  ["Handover & maintenance", ["Maintenance"], 21]
];

export const SEED_TEMPLATE_PHASES: TemplatePhase[] = PHASES.map(([name, teams, days]) => ({
  stageId: SEED_STAGES.find(s => s.name === name)!.id,
  stageName: name,
  owningTeamNames: teams,
  expectedDays: days
}));

/** Every team, whether or not it currently holds a job. */
export const SEED_TEAMS: Team[] = [...new Set(PHASES.flatMap(([, teams]) => teams))]
  .sort()
  .map(name => ({ id: `team-${name.toLowerCase().replace(/[^a-z]+/g, "-")}`, name, parentTeamId: null, ...SEEDED }));

const CHECKPOINTS: Record<string, string[]> = {
  "Sales & acquisition": ["Enquiry logged", "Site inspection booked", "Contract issued", "Deposit received"],
  "Planning & Engineering": ["Design brief finalised", "Preliminary floor plan", "Engineering assessment", "Client sign-off"],
  "Working Drawings & Contracts": ["Working drawings started", "Drawings sent to client", "Contract prepared", "Contract signed"],
  "Preconstruction": ["Selections booked", "Selections finalised", "Site survey", "Baseline schedule drafted"],
  "Scheduling & Estimating": ["Quotes requested", "Purchase orders issued", "Site prep checklist started", "Trades confirmed"],
  "Construction & execution": ["Site established", "Slab poured", "Frame complete", "Lock-up reached"],
  "Post-construction & closeout": ["Defect walkthrough", "Defect list issued", "Final invoice", "Compliance pack lodged"],
  "Handover & maintenance": ["Keys handed over", "Handover pack issued", "Maintenance period opened", "90-day review booked"]
};

export const SEED_CHECKPOINTS: TemplateCheckpoint[] = SEED_STAGES.flatMap(stage =>
  (CHECKPOINTS[stage.name] ?? []).map((label, i) => ({
    stageId: stage.id,
    stageName: stage.name,
    label,
    position: i + 1
  }))
);

export const SEED_PROPERTY_DEFS: PropertyDef[] = [
  { key: "address", label: "Site address", scope: "job", stageName: "Sales & acquisition", teamName: "Sales Admin", format: "text", required: true },
  { key: "type", label: "Project type", scope: "project", stageName: "Sales & acquisition", teamName: "Acquisition & Development", format: "single select", required: true, automation: "Recalculate dependent dates" },
  { key: "deposit", label: "Deposit status", scope: "job", stageName: "Sales & acquisition", teamName: "Sales Admin", format: "single select", required: true, automation: "Notify owning team on change" },
  { key: "drawings", label: "Drawings status", scope: "job", stageName: "Planning & Engineering", teamName: "Design", format: "single select", required: true, automation: "Block stage exit until set" },
  { key: "final_eer", label: "Final EER", scope: "job", stageName: "Planning & Engineering", teamName: "Design", format: "file", required: true, automation: "Block stage exit until set" },
  { key: "contract", label: "Contract status", scope: "job", stageName: "Working Drawings & Contracts", teamName: "Pre-Construction Admin", format: "single select", required: true, automation: "Block stage exit until set" },
  { key: "contract_val", label: "Contract value", scope: "project", stageName: "Working Drawings & Contracts", teamName: "Pre-Construction Admin", format: "currency", required: false },
  { key: "council_hold", label: "Council hold", scope: "job", stageName: "Preconstruction", teamName: "Scheduling", format: "checkbox", required: false, automation: "Notify owning team on change" },
  { key: "temp_fence", label: "Temp fence supplier", scope: "job", stageName: "Scheduling & Estimating", teamName: "Estimating", format: "text", required: false, automation: "Start SLA clock when set" },
  { key: "pour_date", label: "Pour date", scope: "job", stageName: "Scheduling & Estimating", teamName: "Estimating", format: "date", required: true, automation: "Recalculate dependent dates" },
  { key: "pc_date", label: "Practical completion", scope: "job", stageName: "Construction & execution", teamName: "Construction", format: "date", required: true, automation: "Notify assignee when set" }
];

export function createStubRepository(): Repository {
  const wired = new Set<RepositoryMethod>([
    "listStages",
    "listTeams",
    "listTemplatePhases",
    "listTemplateCheckpoints",
    "listPropertyDefs"
  ]);

  return {
    name: "stub",
    wired: wired as ReadonlySet<keyof Repository>,

    // ---- records: nothing yet -------------------------------------------
    async listProjects(): Promise<Project[]> { return []; },
    async getProject(): Promise<Project | null> { return null; },

    async listJobs(): Promise<Job[]> { return []; },
    async getJob(): Promise<Job | null> { return null; },


    async listProfiles(): Promise<Profile[]> { return []; },
    async currentProfile(): Promise<Profile | null> { return null; },

    // ---- lookups: the business process ----------------------------------
    async listStages(): Promise<Stage[]> { return SEED_STAGES; },
    async listTeams(): Promise<Team[]> { return SEED_TEAMS; },
    async listTemplatePhases(): Promise<TemplatePhase[]> { return SEED_TEMPLATE_PHASES; },
    async listTemplateCheckpoints(): Promise<TemplateCheckpoint[]> { return SEED_CHECKPOINTS; },
    async listPropertyDefs(): Promise<PropertyDef[]> { return SEED_PROPERTY_DEFS; }
  };
}
