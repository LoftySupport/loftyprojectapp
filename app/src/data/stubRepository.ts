import { TEAM_SEED } from "./types";
import type { DictionaryOverride } from "./dictionary";
import type { Repository, RepositoryMethod } from "./repository";
import type {
  ActivityEntry,
  AddressHistoryEntry,
  CommentEntry,
  Job,
  Profile,
  Project,
  PropertyDef,
  Stage,
  Team,
  TemplateMilestone,
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
 * phases carried an invented owning team and an invented expected duration; milestones
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
  { id: 5, name: "Completed", position: 5, ...SEEDED },
  { id: 6, name: "Closed", position: 6, ...SEEDED },
  { id: 7, name: "Cancelled", position: 7, ...SEEDED }
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
  // without their owning team, milestones and properties not at all — and calling that
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
    async listComments(): Promise<CommentEntry[]> { return []; },
    async addComment(): Promise<CommentEntry> {
      throw new Error("Posting an update needs Supabase.");
    },

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
    async updateJob(): Promise<Job> {
      throw new Error("Editing a job needs Supabase.");
    },
    async moveProjectStage(): Promise<Project> {
      throw new Error("Moving a project between stages needs Supabase.");
    },
    async updateProject(): Promise<Project> {
      throw new Error("Editing a project needs Supabase.");
    },
    async setProjectCurrentAddress(): Promise<Project> {
      throw new Error("Adding an address needs Supabase.");
    },
    async listAddressHistory(): Promise<AddressHistoryEntry[]> { return []; },
    async deleteProject(): Promise<void> {
      throw new Error("Removing a project needs Supabase.");
    },

    // ---- lookups: the business process ----------------------------------
    async listStages(): Promise<Stage[]> { return SEED_STAGES; },
    async listTeams(): Promise<Team[]> { return SEED_TEAMS; },
    async updateTeam(): Promise<never> {
      throw new Error("Editing a team needs Supabase.");
    },
    async createTeam(): Promise<never> {
      throw new Error("Adding a team needs Supabase.");
    },

    // Saved views are per-person rows behind RLS; without a backend there is no person
    // and no rows. Empty on read (the three built-in tabs still render), refuse on write.
    async listSavedViews(): Promise<never[]> { return []; },
    async saveView(): Promise<never> {
      throw new Error("Saving a view needs Supabase.");
    },
    async deleteSavedView(): Promise<never> {
      throw new Error("Removing a saved view needs Supabase.");
    },
    async shareSavedView(): Promise<never> {
      throw new Error("Sharing a view needs Supabase.");
    },

    // No audit table behind a stub run, so no history. Empty rather than invented: a
    // feed of plausible events is the most convincing kind of fiction this app can tell.
    async listRecordActivity(): Promise<never[]> { return []; },

    // Same reason: no comments behind a stub run, so no job has a latest update. An
    // empty map, not an entry per job with an invented line in it.
    async listLatestUpdates(): Promise<Record<string, never>> { return {}; },

    // No audit rows behind a stub run, so no stage history — and a job's timeline is
    // the one thing that must not be sketched in: an invented set of dates is a chart
    // that looks like evidence.
    async listJobStageHistory(): Promise<never[]> { return []; },

    // The tasks table is real and empty. A stub run has no rows to read and nothing to
    // write them to — and a seeded checklist is exactly the kind of fiction that gets
    // quoted back as though somebody at Lofty wrote it.
    async listTasks(): Promise<never[]> { return []; },
    async createTask(): Promise<never> {
      throw new Error("Adding a task needs Supabase.");
    },
    async updateTask(): Promise<never> {
      throw new Error("Changing a task needs Supabase.");
    },
    async deleteTask(): Promise<void> {
      throw new Error("Removing a task needs Supabase.");
    },

    // Cloning needs a job to clone and a sequence to issue the new number; a stub run
    // has neither.
    async cloneJob(): Promise<never> {
      throw new Error("Cloning a job needs Supabase.");
    },

    // Bugs and ideas (0052) need somewhere for the row to land, and a stub run has
    // nowhere. Refused rather than swallowed: a form that says "thanks" and drops the
    // report is worse than one that says it cannot send.
    async submitFeedback(): Promise<never> {
      throw new Error("Sending a bug or an idea needs Supabase.");
    },
    async listFeedback(): Promise<never[]> { return []; },
    async setFeedbackStatus(): Promise<never> {
      throw new Error("Triaging feedback needs Supabase.");
    },

    // Preferences roam with the profile, and without a backend there is no profile.
    // Empty on read — the app falls back to this device's localStorage, which is the
    // honest answer for a run with nothing behind it.
    async listMyPreferences(): Promise<Record<string, unknown>> { return {}; },
    async saveMyPreferences(): Promise<never> {
      throw new Error("Saving preferences needs Supabase.");
    },
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
        expectedDays: null,
        atRiskLeadDays: null
      }));
    },

    async updateStageSla(): Promise<never> {
      throw new Error("Editing stage SLAs needs Supabase.");
    },

    /**
     * Empty, matching what the database says.
     *
     * `pipeline_stage_tasks` and `property_defs` are not built, so the Supabase repository
     * answers both with []. The stub used to answer with 36 milestones and 11 field
     * definitions, which meant a developer running without a backend saw a different — and
     * more convincing — app than anybody with one, and the empty states this app now needs
     * were never once rendered while they were being written.
     */
    async listTemplateMilestones(): Promise<TemplateMilestone[]> { return []; },
    async listPropertyDefs(): Promise<PropertyDef[]> { return []; },
    async listDictionaryOverrides(): Promise<DictionaryOverride[]> { return []; },
    async saveDictionaryOverride(): Promise<DictionaryOverride> {
      throw new Error("Saving a dictionary edit needs Supabase.");
    },
    async createPropertyDef(): Promise<PropertyDef> {
      throw new Error("Defining a property needs Supabase.");
    },
    async updatePropertyDef(): Promise<PropertyDef> {
      throw new Error("Editing a property needs Supabase.");
    },
    async deletePropertyDef(): Promise<void> {
      throw new Error("Removing a property needs Supabase.");
    }
  };
}
