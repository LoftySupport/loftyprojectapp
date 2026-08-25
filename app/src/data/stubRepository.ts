import { TEAM_SEED } from "./types";
import type { Repository, RepositoryMethod } from "./repository";
import type {
  ActivityEntry,
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
 * **Stages and teams** are the exception, and they are seeded here because without them
 * there is no board to look at. Both are real tables now, and the Supabase repository
 * queries them; these copies exist only for a run with no backend, and `verify/seeds.sh`
 * fails if they stop matching what the migrations create.
 *
 * The other three lookups used to be seeded too, and should not have been. Template
 * phases carried an invented owning team and an invented expected duration; checkpoints
 * and property definitions were 36 and 11 rows of plausible fiction. None of them existed
 * anywhere in the database, so seeding them meant this stub and production disagreed about
 * what the app contains — and the more convincing answer was the wrong one. They now say
 * what the database says, which is nothing.
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
  { id: 1, name: "Acquisition & Development", position: 1, ...SEEDED },
  { id: 2, name: "Pre-construction", position: 2, ...SEEDED },
  { id: 3, name: "Construction", position: 3, ...SEEDED },
  { id: 4, name: "Handover & Maintenance", position: 4, ...SEEDED },
  { id: 5, name: "Closed", position: 5, ...SEEDED }
];

/**
 * Every team, retired ones included.
 *
 * Not filtered to active, matching what `listTeams()` returns from Postgres. A record
 * still owned by Commercial or Executive has to resolve to a name rather than to its slug,
 * and the filtering belongs where the pickers are — `useTeams().teamNames` — rather than
 * here, where it would silently remove rows a caller may need.
 *
 * Read straight from TEAM_SEED rather than derived from anything: a list derived from
 * which teams own a phase leaves out Finance and Lofty General, who own none and still
 * have people in them.
 */
export const SEED_TEAMS: Team[] = TEAM_SEED.map(t => ({ ...t }));

export function createStubRepository(): Repository {
  // Stages and teams only. The other three answer honestly rather than fully — phases
  // without their owning team, checkpoints and properties not at all — and calling that
  // "wired" on the Wiring page would overstate what a backendless run can tell you.
  const wired = new Set<RepositoryMethod>(["listStages", "listTeams"]);

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
    async getProfile(): Promise<Profile | null> { return null; },

    // Same stance as createProject below: refuse rather than pretend. A fabricated
    // profile would be a person who does not exist, holding a permission level.
    async createProfile(): Promise<Profile> {
      throw new Error(
        "Adding a user needs Supabase — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
      );
    },
    async updateProfile(): Promise<Profile> {
      throw new Error("Editing a user needs Supabase.");
    },
    async setProfileActive(): Promise<Profile> {
      throw new Error("Changing a user's status needs Supabase.");
    },
    async listActivity(): Promise<ActivityEntry[]> { return []; },

    // ---- creating: refuse rather than pretend ---------------------------
    // The other stubs answer with empty arrays, which is honest — there are no records
    // yet. A create cannot be stubbed the same way: returning a fabricated Project
    // would put a row on screen that does not exist anywhere, with a projectNo the
    // database never issued, and the person who typed it would have no way to tell.
    // Failing loudly is the only answer that stays true.
    async createProject(): Promise<Project> {
      throw new Error(
        "Creating a project needs Supabase — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
      );
    },
    async createJob(): Promise<Job> {
      throw new Error(
        "Creating a job needs Supabase — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
      );
    },
    async createJobsFromSplit(): Promise<Job[]> {
      throw new Error(
        "Splitting a project into jobs needs Supabase — set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
      );
    },

    // Refuse rather than resolve. A delete that quietly succeeds against nothing is the
    // worst of the three answers: the row is still there and the screen says it went.
    async deleteJob(): Promise<void> {
      throw new Error("Removing a job needs Supabase.");
    },
    async moveJobStage(): Promise<Job> {
      throw new Error("Moving a job between stages needs Supabase.");
    },
    async deleteProject(): Promise<void> {
      throw new Error("Removing a project needs Supabase.");
    },

    // ---- lookups: the business process ----------------------------------
    async listStages(): Promise<Stage[]> { return SEED_STAGES; },
    async listTeams(): Promise<Team[]> { return SEED_TEAMS; },
    /**
     * The stages, with nothing attached to them.
     *
     * This used to return a team per phase and an expected duration — invented, both of
     * them, and the durations were then drawn as Gantt bars. The database has an owning
     * team on `pipeline_stages` and the Supabase repository reads it; the stub cannot
     * know it, and guessing is what produced two sources that disagreed about who owns
     * Working Drawings.
     */
    async listTemplatePhases(): Promise<TemplatePhase[]> {
      return SEED_STAGES.map(s => ({
        stageId: s.id,
        stageName: s.name,
        owningTeamNames: [],
        expectedDays: null
      }));
    },

    /**
     * Empty, matching what the database says.
     *
     * `pipeline_stage_tasks` and `property_defs` are not built, so the Supabase repository
     * answers both with []. The stub used to answer with 36 checkpoints and 11 field
     * definitions, which meant a developer running without a backend saw a different — and
     * more convincing — app than anybody with one, and the empty states this app now needs
     * were never once rendered while they were being written.
     */
    async listTemplateCheckpoints(): Promise<TemplateCheckpoint[]> { return []; },
    async listPropertyDefs(): Promise<PropertyDef[]> { return []; }
  };
}
