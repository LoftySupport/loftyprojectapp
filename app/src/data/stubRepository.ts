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
  { id: 4, name: "Maintenance", position: 4, ...SEEDED },
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
    async setJobCurrentAddress(): Promise<Job> {
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
    // No comments behind a stub run, so nobody has been mentioned.
    async listMyMentions(): Promise<never[]> { return []; },
    async markMentionRead(): Promise<void> {
      throw new Error("Marking a mention read needs Supabase.");
    },

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
    async listTaskChecklist(): Promise<never[]> { return []; },
    async addTaskChecklistItem(): Promise<never> { throw new Error("A checklist needs Supabase."); },
    async updateTaskChecklistItem(): Promise<never> { throw new Error("A checklist needs Supabase."); },
    async deleteTaskChecklistItem(): Promise<void> { throw new Error("A checklist needs Supabase."); },
    async listProcessTaskChecklist(): Promise<never[]> { return []; },
    async addProcessTaskChecklistItem(): Promise<never> { throw new Error("A template checklist needs Supabase."); },
    async updateProcessTaskChecklistItem(): Promise<never> { throw new Error("A template checklist needs Supabase."); },
    async deleteProcessTaskChecklistItem(): Promise<void> { throw new Error("A template checklist needs Supabase."); },
    async listStageCompletion(): Promise<never[]> { return []; },
    async listClassifications(): Promise<never[]> { return []; },
    async saveClassification(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async listPartyRoles(): Promise<never[]> { return []; },
    async savePartyRole(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async listStaffRoles(): Promise<never[]> { return []; },
    async saveStaffRole(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async listContacts(): Promise<never[]> { return []; },
    async getContact(): Promise<null> { return null; },
    async createContact(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async updateContact(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async approveContact(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async setContactClassifications(): Promise<void> { throw new Error("Contacts need Supabase."); },
    async listCompanies(): Promise<never[]> { return []; },
    async getCompany(): Promise<null> { return null; },
    async createCompany(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async updateCompany(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async approveCompany(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async setCompanyClassifications(): Promise<void> { throw new Error("Contacts need Supabase."); },
    async listContactMethods(): Promise<never[]> { return []; },
    async addContactMethod(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async updateContactMethod(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async deleteContactMethod(): Promise<void> { throw new Error("Contacts need Supabase."); },
    async listCompanyContacts(): Promise<never[]> { return []; },
    async addCompanyContact(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async updateCompanyContact(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async listRecordParties(): Promise<never[]> { return []; },
    async addRecordParty(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async updateRecordParty(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async deleteRecordParty(): Promise<void> { throw new Error("Contacts need Supabase."); },
    async listRecordStaffRoles(): Promise<never[]> { return []; },
    async addRecordStaffRole(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async endRecordStaffRole(): Promise<never> { throw new Error("Contacts need Supabase."); },
    async listNotificationTypes(): Promise<never[]> { return []; },
    async saveNotificationType(): Promise<never> { throw new Error("Notifications need Supabase."); },
    async listNotificationRules(): Promise<never[]> { return []; },
    async addNotificationRule(): Promise<never> { throw new Error("Notifications need Supabase."); },
    async updateNotificationRule(): Promise<never> { throw new Error("Notifications need Supabase."); },
    async deleteNotificationRule(): Promise<void> { throw new Error("Notifications need Supabase."); },
    async listMyNotificationPreferences(): Promise<never[]> { return []; },
    async saveMyNotificationPreference(): Promise<void> { throw new Error("Notifications need Supabase."); },
    async listMyNotifications(): Promise<never[]> { return []; },
    async markNotificationsRead(): Promise<number> { return 0; },
    async listMyWatches(): Promise<never[]> { return []; },
    async watchRecord(): Promise<void> { throw new Error("Notifications need Supabase."); },
    async unwatchRecord(): Promise<void> { throw new Error("Notifications need Supabase."); },
    async listDeliveryStats(): Promise<never[]> { return []; },
    async getMaintenanceSettings(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async saveMaintenanceSettings(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async listMaintenanceCategories(): Promise<never[]> { return []; },
    async saveMaintenanceCategory(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async listMaintenanceRequests(): Promise<never[]> { return []; },
    async getMaintenanceRequest(): Promise<null> { return null; },
    async createMaintenanceRequest(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async updateMaintenanceRequest(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async listMaintenanceItems(): Promise<never[]> { return []; },
    async addMaintenanceItem(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async updateMaintenanceItem(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async deleteMaintenanceItem(): Promise<void> { throw new Error("Maintenance needs Supabase."); },
    async offerMaintenanceItem(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async updateMaintenanceAssignment(): Promise<void> { throw new Error("Maintenance needs Supabase."); },
    async listMaintenanceMessages(): Promise<never[]> { return []; },
    async addMaintenanceNote(): Promise<never> { throw new Error("Maintenance needs Supabase."); },
    async getJobWarranty(): Promise<null> { return null; },
    async listMaintenanceOutboxStats(): Promise<never[]> { return []; },

    // Cloning needs a job to clone and a sequence to issue the new number; a stub run
    // has neither.
    async cloneJob(): Promise<never> {
      throw new Error("Cloning a job needs Supabase.");
    },

    // Bugs and ideas (0052) need somewhere for the row to land, and a stub run has
    // nowhere. Refused rather than swallowed: a form that says "thanks" and drops the
    // report is worse than one that says it cannot send.
    // The tracker (0052, 0060–0063). Reads are empty and writes say why, which is the
    // rule everywhere in this file: an empty list is a true answer about a database with
    // nothing in it, and a write that silently succeeded here would be a report nobody
    // ever receives.
    async submitFeedback(): Promise<never> {
      throw new Error("Sending a bug or an idea needs Supabase.");
    },
    async listFeedback(): Promise<never[]> { return []; },
    async setFeedbackStage(): Promise<never> {
      throw new Error("Moving a request between stages needs Supabase.");
    },
    async setFeedbackPhase(): Promise<never> {
      throw new Error("Planning a request into a phase needs Supabase.");
    },
    async setFeedbackKind(): Promise<never> {
      throw new Error("Re-filing a request needs Supabase.");
    },
    async setFeedbackVote(): Promise<never> {
      throw new Error("Voting needs Supabase.");
    },
    async attachmentUrl(): Promise<null> { return null; },
    // Throws rather than returning a fake URL: a stub that handed back a plausible
    // link would put a broken image in the document and look like a working upload.
    async uploadReportImage(): Promise<never> { throw new Error("Uploading an image needs Supabase."); },

    // The Canny round (0064–0068). Reads answer empty, writes say what they need.
    async searchFeedback(): Promise<never[]> { return []; },
    async listFeedbackVoters(): Promise<never[]> { return []; },
    async addVoteFor(): Promise<never> {
      throw new Error("Adding a vote for somebody needs Supabase.");
    },
    async setFeedbackFollow(): Promise<never> {
      throw new Error("Following a request needs Supabase.");
    },
    async listMyMovedRequests(): Promise<never[]> { return []; },
    async markMoveSeen(): Promise<void> { /* nothing to mark seen with no backend */ },
    async mergeFeedback(): Promise<never> {
      throw new Error("Merging a duplicate needs Supabase.");
    },
    async setCommentStanding(): Promise<never> {
      throw new Error("Pinning a comment needs Supabase.");
    },

    async listRoadmapPhases(): Promise<never[]> { return []; },
    async createRoadmapPhase(): Promise<never> {
      throw new Error("Adding a roadmap phase needs Supabase.");
    },
    async updateRoadmapPhase(): Promise<never> {
      throw new Error("Changing a roadmap phase needs Supabase.");
    },
    async deleteRoadmapPhase(): Promise<never> {
      throw new Error("Removing a roadmap phase needs Supabase.");
    },
    async moveRoadmapPhase(): Promise<never> {
      throw new Error("Reordering the roadmap needs Supabase.");
    },

    async listReleases(): Promise<never[]> { return []; },
    async createRelease(): Promise<never> {
      throw new Error("Publishing a release needs Supabase.");
    },
    async deleteRelease(): Promise<never> {
      throw new Error("Removing a release needs Supabase.");
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
    },

    // ---- property values, options, access and processes (0077, 0078) ------
    // Reads answer empty; writes say what they need. Same posture as everything
    // above: a fabricated success here would be a slot that appears to save.
    async myPropertyAccess() { return []; },
    async listPropertyAccess() { return []; },
    async savePropertyAccess(): Promise<never> { throw new Error("Granting property access needs Supabase."); },
    async deletePropertyAccess(): Promise<never> { throw new Error("Removing property access needs Supabase."); },
    async listPropertyOptions() { return []; },
    async savePropertyOption(): Promise<never> { throw new Error("Saving a property option needs Supabase."); },
    async deletePropertyOption(): Promise<never> { throw new Error("Removing a property option needs Supabase."); },
    async listPropertyValues() { return []; },
    async setPropertyValue(): Promise<never> { throw new Error("Recording a property value needs Supabase."); },
    async clearPropertyValue(): Promise<never> { throw new Error("Clearing a property value needs Supabase."); },
    async listPropertyValueHistory() { return []; },
    async pushProjectProperties(): Promise<never> { throw new Error("Pushing project properties to jobs needs Supabase."); },
    async listProcesses() { return []; },
    async createProcess(): Promise<never> { throw new Error("Defining a process needs Supabase."); },
    async updateProcess(): Promise<never> { throw new Error("Editing a process needs Supabase."); },
    async deleteProcess(): Promise<never> { throw new Error("Removing a process needs Supabase."); },
    async reorderProcesses(): Promise<never> { throw new Error("Reordering the pipeline needs Supabase."); },
    async listProcessHistory() { return []; },
    async listProcessDependencies() { return []; },
    async setProcessDependencies(): Promise<never> { throw new Error("Editing process dependencies needs Supabase."); },
    async listProcessProperties() { return []; },
    async setProcessProperties(): Promise<never> { throw new Error("Editing a process's properties needs Supabase."); },
    async listProcessTasks() { return []; },
    async createProcessTask(): Promise<never> { throw new Error("Adding a template task needs Supabase."); },
    async updateProcessTask(): Promise<never> { throw new Error("Editing a template task needs Supabase."); },
    async deleteProcessTask(): Promise<never> { throw new Error("Removing a template task needs Supabase."); },
    async listProcessTaskDependencies() { return []; },
    async setProcessTaskDependencies(): Promise<never> { throw new Error("Editing task dependencies needs Supabase."); },
    async listProcessRuns() { return []; },
    async startProcessRun(): Promise<never> { throw new Error("Starting a process needs Supabase."); },
    async updateProcessRun(): Promise<never> { throw new Error("Updating a process needs Supabase."); },
    async deleteProcessRun(): Promise<never> { throw new Error("Removing a process run needs Supabase."); },
    async instantiateProcessTasks(): Promise<never> { throw new Error("Creating a process checklist needs Supabase."); },

    // ---- the template library and its documents (0094) --------------------
    // Reads answer empty; writes say what they need. A stub that kept these in memory
    // would let somebody build a template, close the tab and lose it — a fabricated
    // success, which is the one thing this file exists not to do. It also means the
    // whole screen still renders with no backend, around the empty state it will have
    // on a fresh tenant anyway.
    async listReportTemplates() { return []; },
    async getReportTemplate() { return null; },
    async createReportTemplate(): Promise<never> { throw new Error("Saving a template needs Supabase."); },
    async updateReportTemplate(): Promise<never> { throw new Error("Saving a template needs Supabase."); },
    async approveReportTemplate(): Promise<never> { throw new Error("Approving a template needs Supabase."); },
    async deleteReportTemplate(): Promise<never> { throw new Error("Removing a template needs Supabase."); },
    async listReportDocuments() { return []; },
    async getReportDocument() { return null; },
    async createReportDocument(): Promise<never> { throw new Error("Creating a document needs Supabase."); },
    async updateReportDocument(): Promise<never> { throw new Error("Saving a document needs Supabase."); },
    async deleteReportDocument(): Promise<never> { throw new Error("Removing a document needs Supabase."); },
    async shareReportDocument(): Promise<never> { throw new Error("Creating a share link needs Supabase."); },
    async unshareReportDocument(): Promise<never> { throw new Error("Revoking a share link needs Supabase."); },
    async publishReportDocument(): Promise<never> { throw new Error("Publishing a document needs Supabase."); },
    // Null rather than a throw: the row asks for this to decide whether to offer a link,
    // and a stub that throws would take the whole panel down on a screen that has no
    // published documents in it anyway.
    async jobDocumentUrl(): Promise<string | null> { return null; },

    // ---- what is filed on a record, and where it lives (0032 / 0103) ------
    // Same stance again: nothing to read, and a write that says what it needs. An
    // in-memory list would let somebody file the contract, close the tab and lose it.
    async listRecordDocuments() { return []; },
    async addDocumentUrl(): Promise<never> { throw new Error("Filing a document needs Supabase."); },
    async removeRecordDocument(): Promise<never> { throw new Error("Removing a document needs Supabase."); },
    async listRecentDocuments() { return []; },

    // No records behind a stub run, so nothing matches anything. Empty rather than a
    // handful of plausible hits — a search that invents results is the fastest way to
    // make somebody trust a screen that is lying to them.
    async search() { return []; }
  };
}
