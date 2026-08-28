import type { DictionaryOverride } from "./dictionary";
import type {
  ActivityEntry,
  AddressHistoryEntry,
  CloneOptions,
  CommentEntry,
  FeedbackItem,
  FeedbackKind,
  FeedbackStatus,
  Job,
  JobPatch,
  JobSplit,
  NewFeedback,
  NewProfile,
  NewJob,
  NewProject,
  NewAddress,
  NewPropertyDef,
  Profile,
  Project,
  ProjectPatch,
  RecordActivity,
  LatestUpdate,
  StagePeriod,
  PropertyDef,
  Stage,
  StageName,
  TeamId,
  Team,
  TemplateMilestone,
  TemplatePhase,
  SavedViewBoard,
  UserSavedView
} from "./types";

/**
 * The seam.
 *
 * Every screen reads through this interface and nothing else. That is what makes
 * "interface first, data later" work without a rewrite: the UI is written once, against
 * these methods, and each one is swapped from the stub to Supabase independently.
 *
 * The rule that keeps it honest: **no component may import the Supabase client, and no
 * component may import seed data directly.** If a screen needs something that isn't
 * here, add a method — don't reach around the seam.
 *
 * That second half was learned the hard way. The lookups below (teams, template phases,
 * milestones, property definitions) spent a while as module constants imported straight
 * into nine files. They read like configuration, but every one is a real Supabase table,
 * and the day they were seeded all nine files would have had to change — the exact
 * rewrite this interface exists to prevent. If it will live in Postgres, it belongs
 * here, however static it looks today.
 */
export interface Repository {
  readonly name: string;

  /** Which methods are backed by real data yet. Drives the "not wired" badges. */
  readonly wired: ReadonlySet<keyof Repository>;

  // ---- records ----------------------------------------------------------
  listProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | null>;

  listJobs(opts?: { projectId?: string }): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;

  listProfiles(): Promise<Profile[]>;
  currentProfile(): Promise<Profile | null>;
  getProfile(id: string): Promise<Profile | null>;

  /** Admin-only in practice — RLS decides that, not the caller. */
  createProfile(input: NewProfile): Promise<Profile>;
  updateProfile(id: string, patch: Partial<NewProfile>): Promise<Profile>;
  /**
   * Deactivate or restore. There is no delete: `profiles` has no DELETE policy and the
   * schema says so deliberately — a person's name is on years of activity and comments,
   * so removing the row would orphan all of it. "Delete" in the UI means this.
   */
  setProfileActive(id: string, active: boolean): Promise<Profile>;

  /** One person's history, or a whole team's. Newest first. */
  listActivity(opts: { profileId?: string; team?: string; limit?: number }): Promise<ActivityEntry[]>;

  /**
   * The comment thread on one record, newest first — the newest one IS the project's
   * "latest update". Exactly one of the two refs, matching the CHECK on `comments`.
   */
  listComments(ref: { projectId?: number; jobId?: string }, limit?: number): Promise<CommentEntry[]>;

  /**
   * Post an update. The author is stamped by the database from the session — sending it
   * from here would let the client claim to be somebody. Blank bodies are refused by the
   * CHECK before this ever matters.
   */
  addComment(ref: { projectId?: number; jobId?: string }, body: string): Promise<CommentEntry>;

  // ---- creating ---------------------------------------------------------
  // Return the created record rather than void: the caller needs the number the
  // database assigned — projectNo, jobNumber — and a round trip to fetch it would be
  // a second chance to get it wrong.
  createProject(input: NewProject): Promise<Project>;
  createJob(input: NewJob): Promise<Job>;

  /**
   * Split a project into `count` jobs in one action, each with its own lot address.
   *
   * Returns them in lot order. Not a loop over `createJob` on the caller's side: the
   * addresses are copied from the project once, and doing it here keeps the "a job's
   * original address is a copy taken at the split" rule in one place rather than in
   * whichever screen happens to call it.
   */
  createJobsFromSplit(input: JobSplit): Promise<Job[]>;

  /**
   * Remove a job. Its tasks, variations, comments, documents, tags, pipeline positions
   * and stage events all cascade.
   *
   * There is a DELETE for jobs where there is none for profiles, and the difference is
   * deliberate: the lot count stays fluid until it is confirmed, so a job has to be as
   * cheap to remove as it is to create. The number does not come back — delete 1042-02
   * and 1042-03 keeps its own number, because a job number has been on paperwork.
   *
   * **The address does not cascade**, and that is not an oversight: `jobs` points at
   * `addresses`, not the other way round, so the row survives. It should. An address is
   * a fact about a place rather than about a job, it may be shared with the project, and
   * it is what search and `address_history` read. The cost is orphan address rows, which
   * are inert — nothing links them to anything, and nothing reads them.
   */
  deleteJob(id: string): Promise<void>;

  /**
   * Move a job to another lifecycle stage.
   *
   * The database is the authority on both rules — who (manager and above, 0038) and
   * which way (forwards only, 0039) — so this sends the move and reports the refusal
   * verbatim if one comes back. The app's `can()` check hides the control; it is not
   * the security. Returns the job re-read through `job_display`, because the move
   * restamps `job_stage_entered_at` and can advance the project underneath it (0041).
   */
  moveJobStage(id: string, stage: StageName): Promise<Job>;

  /**
   * Ownership and assignment on a job — the two facts the bulk bar and the drawer may
   * change without a lifecycle move. Patch-shaped like updateProject: only the keys
   * present are written, and `assigneeId: null` un-assigns. `user` and above by
   * policy; RLS is the authority and a refusal is shown verbatim.
   */
  updateJob(id: string, patch: JobPatch): Promise<Job>;

  /**
   * The project's own lifecycle move — same two rules as a job's, enforced in the same
   * place: manager and above, forwards only. The trigger from 0041 also calls this
   * column its own; a manual move and an inherited one land identically.
   */
  moveProjectStage(id: number, stage: StageName): Promise<Project>;

  /**
   * The editable facts on a project's record page: the three dates and the SharePoint
   * folder. `user` and above by policy. Only the keys present are written, so a blank
   * date field arriving as undefined cannot null a date somebody set.
   */
  updateProject(id: number, patch: ProjectPatch): Promise<Project>;

  /**
   * Give a project a new current address — the "add another address" on the record
   * page, for legacy imports and for sites that get renamed. The original never moves
   * (guard_original_address, admin-only, and even then recorded); the outgoing current
   * address lands in address_history by trigger, which is what keeps an old contract's
   * address findable.
   */
  setProjectCurrentAddress(id: number, address: NewAddress): Promise<Project>;

  /** Every address a record has had and when it stopped applying. Newest first. */
  listAddressHistory(ref: { projectId?: number; jobId?: string }): Promise<AddressHistoryEntry[]>;

  /**
   * Remove a project and every job under it — `jobs.project_id` cascades. Admin-only by
   * policy, and the same address caveat applies.
   */
  deleteProject(id: number): Promise<void>;

  // ---- lookups ----------------------------------------------------------
  // Reference tables. Seeded rather than user-created, which is why the stub can answer
  // them honestly — but they are tables, so they come through the seam.
  listStages(): Promise<Stage[]>;
  listTeams(): Promise<Team[]>;
  /**
   * Rename or retire a team (admin+, the 0026 policy). Retire is a flag, never a
   * delete; the fresh list comes back as proof. The jobs-held guard is the screen's.
   */
  updateTeam(id: TeamId, patch: { name?: string; isActive?: boolean }): Promise<Team[]>;
  /**
   * Add a team (admin+, the same 0026 policy family as updateTeam). The slug is derived
   * from the name once, at creation, and is then permanent — renames touch only the
   * label. Slots after the last active team; the fresh list comes back as proof.
   */
  createTeam(name: string): Promise<Team[]>;
  listTemplatePhases(): Promise<TemplatePhase[]>;

  // ---- saved views ------------------------------------------------------
  /** The signed-in person's saved views for one board, oldest first. Owner-only by RLS. */
  listSavedViews(board: SavedViewBoard): Promise<UserSavedView[]>;
  /**
   * Save the current board state under a name — the query string verbatim (0048).
   * Insert, not upsert: a second view with the same name on the same board is refused
   * by the unique constraint, and the refusal names the clash rather than silently
   * overwriting a view the person meant to keep. The fresh list comes back as proof.
   */
  saveView(board: SavedViewBoard, name: string, query: string): Promise<UserSavedView[]>;
  /** Remove one of your own saved views. RLS makes anyone else's unreachable. */
  deleteSavedView(id: string): Promise<UserSavedView[]>;
  /**
   * Share one of your views with a team, or `null` to make it private again (0051).
   * Only the owner may — the update policy never sees the shared clause, so a
   * teammate's attempt matches no row rather than being refused halfway.
   */
  shareSavedView(id: string, team: TeamId | null): Promise<UserSavedView[]>;

  /**
   * Clone a job (0057). The new job sits on the same project, takes its own number from
   * the sequence, opens at Acquisition & Development, and records the job it came from
   * in `job_number_old` — Amber, 28 Aug: "it will need a new job number… and we can use
   * the old job number field to capture the new information."
   *
   * This is the way back from Cancelled, which is otherwise terminal. It is not only
   * for that: cloning a live job is the fast path for a second dwelling on the same
   * plan.
   */
  cloneJob(id: string, copy: CloneOptions): Promise<Job>;

  /**
   * One record's history (0058) — the project page's activity panel, and the job
   * drawer's Activity tab.
   *
   * A project asks for its own rows AND its jobs': "1042-03 moved to Construction" is
   * project 1042's news too, and a feed that showed only the parent row would be nearly
   * empty on a site where all the work happens in the lots.
   *
   * Readable by any active person since 0058 — before that the audit table was
   * admin-only, and this panel would have rendered empty for almost everybody while
   * looking right to whoever built it.
   */
  listRecordActivity(opts: { projectId?: number; jobId?: string; limit?: number }): Promise<RecordActivity[]>;

  /**
   * The newest comment on each of these jobs, keyed by job number (0059).
   *
   * One read for the whole board rather than one per card: sixty cards asking
   * individually is sixty round trips, and the naive alternative — read every comment on
   * all sixty jobs and keep the newest of each — needs a LIMIT to stay sane, and that
   * LIMIT silently drops the newest comment on a quiet job as soon as a busy one has
   * more comments than the cap. `job_latest_update` does it in the database, uncapped.
   *
   * A job with no comments is simply absent from the map. There is no empty entry to
   * mistake for an update nobody wrote.
   */
  listLatestUpdates(jobIds: string[]): Promise<Record<string, LatestUpdate>>;

  /**
   * One job's passage through the lifecycle, oldest first (Amber, 28 August: a single
   * job as a gantt, a calendar or a list).
   *
   * Read from `activity_audit`, where every stage change has been recorded since 0001 —
   * so this is history, not a reconstruction. The stage the job is in now is added from
   * the job itself, because that period has not ended and there is no transition row
   * for it yet.
   */
  listJobStageHistory(jobId: string): Promise<StagePeriod[]>;

  // ---- bugs and ideas (0052) --------------------------------------------
  /**
   * Send a bug or an idea. Anyone active may — the widest write in the app — and the
   * repository stamps the sender and the page, so neither can be got wrong or faked.
   *
   * Returns nothing on purpose. The select policy is admin-only, so asking for the row
   * back would make every submission fail for exactly the people the form is for.
   */
  submitFeedback(entry: NewFeedback): Promise<void>;
  /** Every report of one kind, newest first. Admin+ by RLS; nobody else sees a row. */
  listFeedback(kind: FeedbackKind): Promise<FeedbackItem[]>;
  /** Triage: the only edit the table takes. Admin+, and the fresh list comes back. */
  setFeedbackStatus(id: string, status: FeedbackStatus): Promise<FeedbackItem[]>;

  // ---- preferences (0050) -----------------------------------------------
  /**
   * The signed-in person's preferences, roaming with the profile (Q9's last layer).
   * Returns the raw bag; the caller validates it, the same way it validates what comes
   * out of localStorage — an unrecognised key is inert rather than dangerous.
   */
  listMyPreferences(): Promise<Record<string, unknown>>;
  /** Merge a patch into the bag and return what the database now holds. */
  saveMyPreferences(patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  /**
   * The SLA per lifecycle stage — expected days in stage and the at-risk lead (0047),
   * keyed by stage name. `null` clears a number; the fresh phase list comes back as
   * proof the database accepted it. Superadmin, by the 0029 policy on pipeline_stages.
   */
  updateStageSla(
    stage: StageName,
    patch: { expectedDays?: number | null; atRiskLeadDays?: number | null }
  ): Promise<TemplatePhase[]>;
  listTemplateMilestones(): Promise<TemplateMilestone[]>;
  listPropertyDefs(): Promise<PropertyDef[]>;

  /** Lofty's words on top of the repo's dictionary — see DictionaryOverride. */
  listDictionaryOverrides(): Promise<DictionaryOverride[]>;

  /**
   * Save an edit to one entry. Upserts, sending only the fields being changed, so
   * retitling cannot blank a definition somebody else wrote. The ladder is enforced in
   * the database: manager for wording, admin for status, superadmin to archive.
   */
  saveDictionaryOverride(
    id: string,
    patch: { friendlyName?: string | null; definition?: string | null; status?: DictionaryOverride["status"] }
  ): Promise<DictionaryOverride>;

  /**
   * Defining, changing and retiring fields — superadmin by policy, the same bar as
   * pipelines, because deciding what the company captures is process design. The key
   * is immutable from the UI; the database could cascade a rename, but offering it
   * casually would detach what people call a field from what the import calls it.
   */
  createPropertyDef(input: NewPropertyDef): Promise<PropertyDef>;
  updatePropertyDef(key: string, patch: Partial<Omit<NewPropertyDef, "key">>): Promise<PropertyDef>;
  deletePropertyDef(key: string): Promise<void>;
}

export type RepositoryMethod = Exclude<keyof Repository, "name" | "wired">;

export const ALL_METHODS: RepositoryMethod[] = [
  "listProjects",
  "getProject",
  "listJobs",
  "getJob",
  "listProfiles",
  "currentProfile",
  "getProfile",
  "createProfile",
  "updateProfile",
  "setProfileActive",
  "listActivity",
  "listComments",
  "addComment",
  "createProject",
  "createJob",
  "createJobsFromSplit",
  "deleteJob",
  "deleteProject",
  "moveJobStage",
  "updateJob",
  "moveProjectStage",
  "updateProject",
  "setProjectCurrentAddress",
  "listAddressHistory",
  "listStages",
  "listTeams",
  "updateTeam",
  "createTeam",
  "listTemplatePhases",
  "listSavedViews",
  "saveView",
  "deleteSavedView",
  "shareSavedView",
  "cloneJob",
  "listRecordActivity",
  "listLatestUpdates",
  "listJobStageHistory",
  "submitFeedback",
  "listFeedback",
  "setFeedbackStatus",
  "listMyPreferences",
  "saveMyPreferences",
  "updateStageSla",
  "listTemplateMilestones",
  "listPropertyDefs",
  "listDictionaryOverrides",
  "saveDictionaryOverride",
  "createPropertyDef",
  "updatePropertyDef",
  "deletePropertyDef"
];

/** Human labels for the wiring checklist on the Status page. */
export const METHOD_TABLES: Record<RepositoryMethod, string> = {
  listProjects: "projects",
  getProject: "projects",
  listJobs: "jobs",
  getJob: "jobs",
  listProfiles: "profiles",
  currentProfile: "profiles",
  getProfile: "profiles",
  createProfile: "profiles",
  updateProfile: "profiles",
  setProfileActive: "profiles",
  listActivity: "activity_audit",
  listComments: "comments",
  addComment: "comments",
  createProject: "projects + addresses",
  createJob: "jobs",
  createJobsFromSplit: "jobs + addresses",
  deleteJob: "jobs",
  deleteProject: "projects",
  moveJobStage: "jobs",
  updateJob: "jobs",
  moveProjectStage: "projects",
  updateProject: "projects",
  setProjectCurrentAddress: "projects + addresses",
  listAddressHistory: "address_history",
  // Both became tables — `teams` in 0026, `pipeline_stages` in 0029. The labels
  // said "enum" long after that stopped being true, on the one screen whose entire
  // job is to say what is backed by what.
  listStages: "pipeline_stages",
  listTeams: "teams",
  updateTeam: "teams",
  createTeam: "teams",
  listSavedViews: "saved_views",
  saveView: "saved_views",
  deleteSavedView: "saved_views",
  shareSavedView: "saved_views",
  cloneJob: "jobs + addresses",
  listRecordActivity: "activity_audit",
  listLatestUpdates: "job_latest_update",
  listJobStageHistory: "activity_audit",
  submitFeedback: "feedback",
  listFeedback: "feedback",
  setFeedbackStatus: "feedback",
  listMyPreferences: "user_preferences",
  saveMyPreferences: "user_preferences",
  listTemplatePhases: "pipeline_stages",
  updateStageSla: "pipeline_stages",
  listTemplateMilestones: "pipeline_stage_tasks (not built)",
  listPropertyDefs: "property_defs",
  listDictionaryOverrides: "dictionary_overrides",
  saveDictionaryOverride: "dictionary_overrides",
  createPropertyDef: "property_defs",
  updatePropertyDef: "property_defs",
  deletePropertyDef: "property_defs"
};
