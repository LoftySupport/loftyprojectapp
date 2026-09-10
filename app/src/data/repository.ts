import type { DictionaryOverride } from "./dictionary";
import type {
  ActivityEntry,
  AddressHistoryEntry,
  CloneOptions,
  NewDocumentUrl,
  RecordDocument,
  NewReportDocument,
  NewReportDocumentShare,
  RecentDocument,
  SearchHit,
  NewReportTemplate,
  ReportDocument,
  ReportDocumentPatch,
  ReportTemplate,
  ReportTemplateKind,
  ReportTemplatePatch,
  CommentEntry,
  FeedbackItem,
  FeedbackKind,
  FeedbackStage,
  FeedbackVoter,
  MovedRequest,
  NewRelease,
  NewRoadmapPhase,
  Release,
  RoadmapPhase,
  RoadmapPhasePatch,
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
  MentionEntry,
  TaskEntry,
  NewTask,
  TaskPatch,
  TaskChecklistItem,
  ProcessTaskChecklistItem,
  StageCompletion,
  PropertyDef,
  PropertyDefPatch,
  PropertyOption,
  PropertyAccess,
  NewPropertyAccess,
  MyPropertyAccess,
  PropertyValue,
  PropertyValueData,
  PropertyValueHistoryEntry,
  RecordTarget,
  Process,
  NewProcess,
  ProcessPatch,
  ProcessDependency,
  ProcessHistoryEntry,
  ProcessProperty,
  ProcessTask,
  NewProcessTask,
  ProcessTaskPatch,
  ProcessTaskDependency,
  ProcessRun,
  ProcessRunPatch,
  ProcessRunStatus,
  Stage,
  StageName,
  TeamId,
  Team,
  TemplateMilestone,
  TemplatePhase,
  SavedViewBoard,
  UserSavedView,
  Classification,
  PartyRole,
  StaffRole,
  Company,
  NewCompany,
  CompanyPatch,
  Contact,
  NewContact,
  ContactPatch,
  ContactMethod,
  NewContactMethod,
  CompanyContact,
  RecordParty,
  NewRecordParty,
  RecordStaffRole,
  PartyTarget,
  Uuid,
  NotificationType,
  NotificationRule,
  NewNotificationRule,
  NotificationPreference,
  Notification,
  RecordWatch,
  JobWarranty, MaintenanceAssignmentStatus, MaintenanceCategory, MaintenanceItem, MaintenanceItemPatch, MaintenanceMessage, MaintenanceMessageChannel,
  MaintenanceOffer, MaintenanceOutboxStat, MaintenanceRequest, MaintenanceRequestPatch, MaintenanceSettings, NewMaintenanceRequest,
  DeliveryStat,
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
  listComments(
    ref: { projectId?: number; jobId?: string; feedbackId?: string },
    limit?: number
  ): Promise<CommentEntry[]>;

  /**
   * Post an update. The author is stamped by the database from the session — sending it
   * from here would let the client claim to be somebody. Blank bodies are refused by the
   * CHECK before this ever matters.
   */
  /**
   * Post a comment, and record who it names.
   *
   * `mentions` are profile ids the composer collected as the writer picked people, not
   * names parsed back out of the text — a name parsed out of prose matches the wrong
   * Sarah eventually, and there are two people here who share a surname. The rows land
   * in `comment_mentions`, which is what the bell reads.
   */
  addComment(
    ref: { projectId?: number; jobId?: string; feedbackId?: string },
    body: string,
    mentions?: string[],
    /**
     * The comment's standing (0064) — admin only, and refused by a trigger rather than
     * by this method. `internal` keeps it to admins; `stage` marks it as the note that
     * came with a stage change.
     */
    standing?: { internal?: boolean; stage?: FeedbackStage }
  ): Promise<CommentEntry>;

  /**
   * Pin a comment to the top of a thread, or mark it internal. Admin+, enforced by
   * `guard_comment_standing()` — a column rule, so a trigger and not a policy.
   */
  setCommentStanding(
    commentId: string,
    standing: { pinned?: boolean; internal?: boolean }
  ): Promise<void>;

  /**
   * Every @mention of the person signed in, newest first, unread included.
   *
   * The one notification this app can deliver honestly today: it needs no health
   * calculation and no SLA, because a mention is a fact somebody wrote on purpose.
   * RLS shows you only your own (admins may audit); marking read is owner-only.
   */
  listMyMentions(limit?: number): Promise<MentionEntry[]>;

  /** Mark one read. Only the person mentioned may, which the policy enforces. */
  markMentionRead(commentId: string): Promise<void>;

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

  // ---- tasks (built in Phase A, wired now) -------------------------------
  /**
   * What has to be done — on one job or one project, in order; or across every record
   * at once, for the Tasks board (0102).
   *
   * Exactly one of five scopes, never none: a job, a project, an assignee, a team, or
   * `all` said explicitly. Asking with nothing would quietly return every task in the
   * company — fine for the board's "All tasks" tab, which is why it exists, but not a
   * thing any caller should reach by omission.
   */
  listTasks(opts: {
    jobId?: string; projectId?: number; assigneeId?: string; teams?: TeamId[]; all?: boolean;
  }): Promise<TaskEntry[]>;

  /**
   * Add one. Only the name is required — a checklist that demands six fields per line
   * is a checklist nobody adds to.
   */
  createTask(task: NewTask): Promise<TaskEntry>;

  /**
   * Change one. Ticking it off is `status: "done"` and nothing else: `completed_at` and
   * `completed_by` are stamped by a trigger, and the CHECK refuses a done task with no
   * time on it, so the two can never disagree.
   */
  updateTask(id: string, patch: TaskPatch): Promise<TaskEntry>;

  /** Remove one. Admin-only by policy; sub-tasks go with it (ON DELETE CASCADE). */
  deleteTask(id: string): Promise<void>;

  // ---- checklists under tasks, and on template lines (0081) -----------------
  /** The tick boxes under every task on one record, in order. */
  listTaskChecklist(opts: { jobId?: string; projectId?: number }): Promise<TaskChecklistItem[]>;
  addTaskChecklistItem(taskId: string, text: string): Promise<TaskChecklistItem>;
  /** Ticking is `isDone`; the database stamps who and when, and clears both on untick. */
  updateTaskChecklistItem(id: string, patch: { text?: string; isDone?: boolean; position?: number }): Promise<TaskChecklistItem>;
  deleteTaskChecklistItem(id: string): Promise<void>;
  listProcessTaskChecklist(processId: string): Promise<ProcessTaskChecklistItem[]>;
  addProcessTaskChecklistItem(processTaskId: string, text: string): Promise<ProcessTaskChecklistItem>;
  updateProcessTaskChecklistItem(id: string, patch: { text?: string; position?: number }): Promise<ProcessTaskChecklistItem>;
  deleteProcessTaskChecklistItem(id: string): Promise<void>;
  /** Stage completion for one record, or for every record when no target is given. */
  listStageCompletion(target?: RecordTarget): Promise<StageCompletion[]>;

  // ---- parties (0082): contacts, companies, roles ---------------------------
  listClassifications(): Promise<Classification[]>;
  saveClassification(row: Classification): Promise<Classification>;
  listPartyRoles(): Promise<PartyRole[]>;
  savePartyRole(row: PartyRole): Promise<PartyRole>;
  listStaffRoles(): Promise<StaffRole[]>;
  saveStaffRole(row: StaffRole): Promise<StaffRole>;
  /** Every contact, with their company beside them; `search` narrows by name, email or phone. */
  listContacts(opts?: { search?: string; includeInactive?: boolean }): Promise<Contact[]>;
  getContact(id: string): Promise<Contact | null>;
  /** User and above. Created unapproved unless the creator is a manager or above. */
  createContact(input: NewContact): Promise<Contact>;
  updateContact(id: string, patch: ContactPatch): Promise<Contact>;
  /** Manager and above; the guard refuses anyone else and stamps who. */
  approveContact(id: string, approved: boolean): Promise<Contact>;
  setContactClassifications(id: string, classificationIds: string[]): Promise<void>;
  listCompanies(opts?: { search?: string; includeInactive?: boolean }): Promise<Company[]>;
  getCompany(id: string): Promise<Company | null>;
  createCompany(input: NewCompany): Promise<Company>;
  updateCompany(id: string, patch: CompanyPatch): Promise<Company>;
  approveCompany(id: string, approved: boolean): Promise<Company>;
  setCompanyClassifications(id: string, classificationIds: string[]): Promise<void>;
  listContactMethods(party: { contactId?: string; companyId?: string }): Promise<ContactMethod[]>;
  addContactMethod(input: NewContactMethod): Promise<ContactMethod>;
  updateContactMethod(id: string, patch: { value?: string; label?: string | null; isPrimary?: boolean; isVerified?: boolean }): Promise<ContactMethod>;
  deleteContactMethod(id: string): Promise<void>;
  /** Employment rows for a company or a person, current first. */
  listCompanyContacts(party: { contactId?: string; companyId?: string }): Promise<CompanyContact[]>;
  addCompanyContact(input: { companyId: string; contactId: string; jobRole?: string | null; isPrimary?: boolean; startedOn?: string | null }): Promise<CompanyContact>;
  updateCompanyContact(id: string, patch: { jobRole?: string | null; isPrimary?: boolean; endedOn?: string | null }): Promise<CompanyContact>;
  /** Parties on a record — a job's include those on its process runs. */
  listRecordParties(target: PartyTarget | { contactId: string } | { companyId: string }): Promise<RecordParty[]>;
  addRecordParty(input: NewRecordParty): Promise<RecordParty>;
  updateRecordParty(id: string, patch: { roleId?: string; engagedByCompanyId?: Uuid | null; isPrimary?: boolean; note?: string | null; endedOn?: string | null }): Promise<RecordParty>;
  deleteRecordParty(id: string): Promise<void>;
  listRecordStaffRoles(target: { projectId?: number; jobId?: string }): Promise<RecordStaffRole[]>;
  addRecordStaffRole(input: { projectId?: number; jobId?: string; roleId: string; profileId: string }): Promise<RecordStaffRole>;
  endRecordStaffRole(id: string, endedOn: string): Promise<RecordStaffRole>;

  // ---- notifications (0083) ------------------------------------------------
  listNotificationTypes(): Promise<NotificationType[]>;
  saveNotificationType(row: NotificationType): Promise<NotificationType>;
  listNotificationRules(): Promise<NotificationRule[]>;
  addNotificationRule(input: NewNotificationRule): Promise<NotificationRule>;
  updateNotificationRule(id: string, patch: { afterDays?: number; isActive?: boolean }): Promise<NotificationRule>;
  deleteNotificationRule(id: string): Promise<void>;
  listMyNotificationPreferences(): Promise<NotificationPreference[]>;
  saveMyNotificationPreference(pref: NotificationPreference): Promise<void>;
  /** The inbox, newest first. */
  listMyNotifications(opts?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]>;
  markNotificationsRead(ids?: number[]): Promise<number>;
  listMyWatches(): Promise<RecordWatch[]>;
  watchRecord(target: { projectId?: number; jobId?: string }): Promise<void>;
  unwatchRecord(target: { projectId?: number; jobId?: string }): Promise<void>;
  /** Admin: what the outbox holds, per channel and status. */
  listDeliveryStats(): Promise<DeliveryStat[]>;

  // ---- maintenance (0084) ----------------------------------------------------
  getMaintenanceSettings(): Promise<MaintenanceSettings>;
  /** Manager and above; the policy refuses anyone else. */
  saveMaintenanceSettings(patch: Partial<Omit<MaintenanceSettings, "updatedAt">>): Promise<MaintenanceSettings>;
  listMaintenanceCategories(opts?: { includeInactive?: boolean }): Promise<MaintenanceCategory[]>;
  /** Manager and above. Upsert on the slug. */
  saveMaintenanceCategory(row: MaintenanceCategory): Promise<MaintenanceCategory>;
  /** Requests from maintenance_request_display. `queue` open means not closed or rejected. */
  listMaintenanceRequests(opts?: { jobId?: string; queue?: "open" | "closed" | "all"; search?: string; limit?: number }): Promise<MaintenanceRequest[]>;
  getMaintenanceRequest(id: string): Promise<MaintenanceRequest | null>;
  /** User and above. The number is stamped by trigger; due comes from the category. */
  createMaintenanceRequest(input: NewMaintenanceRequest): Promise<MaintenanceRequest>;
  /** A status of closed is refused by the database while an item is open. */
  updateMaintenanceRequest(id: string, patch: MaintenanceRequestPatch): Promise<MaintenanceRequest>;
  listMaintenanceItems(requestId: string): Promise<MaintenanceItem[]>;
  addMaintenanceItem(input: { requestId: string; description: string; location?: string | null; categoryId?: string | null }): Promise<MaintenanceItem>;
  updateMaintenanceItem(id: string, patch: MaintenanceItemPatch): Promise<MaintenanceItem>;
  deleteMaintenanceItem(id: string): Promise<void>;
  /** Offer an item to a company and/or a person: writes the assignment, queues the email, returns the token once. */
  offerMaintenanceItem(input: { itemId: string; companyId?: string | null; contactId?: string | null; note?: string | null }): Promise<MaintenanceOffer>;
  /** Staff recording an answer given by phone, a visit time, or a cancel. */
  updateMaintenanceAssignment(id: string, patch: { status?: MaintenanceAssignmentStatus; scheduledFor?: string | null; note?: string | null }): Promise<void>;
  listMaintenanceMessages(requestId: string): Promise<MaintenanceMessage[]>;
  /** A note on the thread — what was said on the phone, what was decided. */
  addMaintenanceNote(input: { requestId: string; body: string; channel?: MaintenanceMessageChannel; assignmentId?: string | null }): Promise<MaintenanceMessage>;
  getJobWarranty(jobId: string): Promise<JobWarranty | null>;
  /** What the thread's outbox holds, per status. */
  listMaintenanceOutboxStats(): Promise<MaintenanceOutboxStat[]>;

  // ---- the tracker: bugs, requests, votes (0052, 0060–0063) ----------------
  /**
   * Send a bug or a feature request. Anyone active may — the widest write in the app —
   * and the repository stamps the sender, the page and the browser, so none of the three
   * can be got wrong or faked.
   *
   * Returns the new id. 0052's version returned void on purpose, because the SELECT
   * policy was admin-only and asking for the row back would have failed for exactly the
   * people the form is for. 0060 opened the tracker to everybody, so the row can be read
   * back — and it has to be, because the screenshots are attached to the id.
   */
  submitFeedback(entry: NewFeedback): Promise<string>;

  /**
   * The tracker. One kind, or both when no kind is given — the board shows both together
   * and the Setup tabs show one at a time, and those are two callers of one query rather
   * than two queries.
   */
  listFeedback(kind?: FeedbackKind): Promise<FeedbackItem[]>;

  /**
   * Move a request along the queue. **Superadmin**, and that is the database's answer:
   * `guard_feedback_stage_change()` raises 42501 for anybody lower, admins included. The
   * app hides the control at the same rung, which is politeness rather than security.
   */
  setFeedbackStage(id: string, stage: FeedbackStage, note?: string): Promise<FeedbackItem[]>;

  /** Plan a request into a roadmap phase, or take it out of one. Admin+, by policy. */
  setFeedbackPhase(id: string, phaseId: string | null): Promise<FeedbackItem[]>;
  /**
   * Re-file a request as a bug or as an idea (Amber, 7 Sep: "you can't change an idea to
   * a bug in updates"). Admin's, under the same UPDATE policy as the phase — the kind is
   * a triage judgement, and the person who filed it is the one most often wrong about it.
   */
  setFeedbackKind(id: string, kind: FeedbackKind): Promise<FeedbackItem[]>;

  /**
   * Thumbs up, or take it back. One per person per request, and the primary key on
   * `feedback_votes` is what enforces it — this method cannot double-vote even if it
   * tries. Returns the request as it now stands, so the count on screen is the count in
   * the database rather than one the button incremented locally.
   */
  setFeedbackVote(id: string, voted: boolean): Promise<FeedbackItem>;

  /**
   * Requests whose title or detail matches — what the report form searches while
   * somebody is still typing, so a duplicate is caught before it is filed rather than
   * merged afterwards. Capped: this answers "has anyone asked this", not "list
   * everything".
   */
  searchFeedback(query: string, limit?: number): Promise<FeedbackItem[]>;

  /** Who voted, and who entered each vote — the audit an on-behalf vote needs (0067). */
  listFeedbackVoters(id: string): Promise<FeedbackVoter[]>;

  /**
   * Add somebody else's vote (Canny's vote-on-behalf): the request that arrived on a
   * call or on site. Admin+, stamped with who added it, and never anonymous — that
   * attribution is the whole answer to 0061's objection.
   */
  addVoteFor(id: string, profileId: string): Promise<FeedbackItem>;

  /** Follow or unfollow. Voting and reporting already follow you, by trigger (0065). */
  setFeedbackFollow(id: string, following: boolean): Promise<void>;

  /**
   * Requests you follow that have moved since you last looked — the bell's seventh
   * signal, and the first one after @mentions that is real.
   */
  listMyMovedRequests(): Promise<MovedRequest[]>;

  /** "I have seen where this got to." Writes the seen stamp on your own follow. */
  markMoveSeen(id: string): Promise<void>;

  /**
   * Mark a request a duplicate of another, or clear it (`null`). Admin+, and the
   * database moves the votes and followers — the app cannot, because 0061 rightly
   * refuses it the right to write somebody else's vote.
   */
  mergeFeedback(id: string, intoId: string | null): Promise<FeedbackItem[]>;

  /**
   * A signed URL for one screenshot. The bucket is private, so there is no permanent
   * link to hold; this is asked for when a card is opened and expires shortly after.
   * Null when storage refuses, which the card renders as a missing attachment rather
   * than a broken image.
   */
  attachmentUrl(path: string): Promise<string | null>;

  /**
   * Put an image in the report-images bucket and give back the URL to render it by.
   *
   * A PERMANENT PUBLIC URL, and that is the decision rather than an accident. Amber,
   * 7 September, after the alternative was put to her: *"upload to public bucket that
   * stores in the document only"*. The alternative was a signed URL written into the
   * share snapshot with the link's own expiry, so revoking a shared document revoked its
   * pictures. **The consequence of the choice made: an image in a shared document stays
   * fetchable after the link expires.** `0100` records why that was accepted.
   *
   * Contrast `attachmentUrl` above, which signs every read because that bucket is
   * private. These two are the app's only two storage paths and they behave oppositely
   * on purpose; neither is the pattern to copy without reading which is which.
   *
   * `owner` says which record the file is filed under — the object path becomes
   * `documents/<id>/…` or `library/<id>/…`. That is for auditing and prefix-listing only.
   * **The document's layout is the record of what images it carries**, which is what
   * "stores in the document only" means: there is no attachments table here, because the
   * block already holds the URL and a second copy of that fact could disagree with it.
   */
  uploadReportImage(input: {
    file: File;
    owner: { kind: "document" | "library"; id: Uuid };
  }): Promise<string>;

  // ---- the roadmap (0063) -------------------------------------------------
  /** The phases, in their stored order. Everybody reads; superadmin writes. */
  listRoadmapPhases(): Promise<RoadmapPhase[]>;
  /** Add a phase at the end of the run. The fresh list comes back. */
  createRoadmapPhase(input: NewRoadmapPhase): Promise<RoadmapPhase[]>;
  /** Change one — name, dates, summary, status. Only what is sent is written. */
  updateRoadmapPhase(id: string, patch: RoadmapPhasePatch): Promise<RoadmapPhase[]>;
  /**
   * Remove one. The requests planned into it stay, with their phase cleared — ON DELETE
   * SET NULL, because deleting a phase must never delete what people asked for.
   */
  deleteRoadmapPhase(id: string): Promise<RoadmapPhase[]>;
  /** Move a phase up or down the run, renumbering the whole run so no two share a slot. */
  moveRoadmapPhase(id: string, direction: "up" | "down"): Promise<RoadmapPhase[]>;

  // ---- the changelog (0063) -----------------------------------------------
  /** Releases newest first, each with its lines. Everybody reads; superadmin writes. */
  listReleases(): Promise<Release[]>;
  /**
   * Publish one, with its lines in the same call. A release with no lines is a version
   * number nobody can read anything into, so the two are written together or not at all.
   */
  createRelease(input: NewRelease): Promise<Release[]>;
  /** Unpublish one. Its lines go with it (CASCADE); the requests they name do not. */
  deleteRelease(id: string): Promise<Release[]>;

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
  updatePropertyDef(key: string, patch: PropertyDefPatch): Promise<PropertyDef>;
  deletePropertyDef(key: string): Promise<void>;

  // ---- property values, options and access (0077) ------------------------
  /**
   * What the signed-in person may do with each property's values — the database's own
   * answer, so a control the screen offers is one the policies will accept. A property
   * missing from the list may not be read at all.
   */
  myPropertyAccess(): Promise<MyPropertyAccess[]>;
  /** Every grant on every property — who may do what. Readable by all; the value is the secret, not the grant. */
  listPropertyAccess(): Promise<PropertyAccess[]>;
  /** Upsert one grant (a team or a person on one property). Admin+; superadmin on a restricted property. */
  savePropertyAccess(input: NewPropertyAccess): Promise<PropertyAccess>;
  deletePropertyAccess(id: string): Promise<void>;
  listPropertyOptions(): Promise<PropertyOption[]>;
  savePropertyOption(input: PropertyOption): Promise<PropertyOption>;
  deletePropertyOption(propertyKey: string, optionKey: string): Promise<void>;
  /**
   * The recorded answers. For a job: its own rows plus its project's project-level rows,
   * so the drawer can read a project value through and mark a pushed copy apart from it.
   * With no target: every row the person may read (the board's filters and the reports).
   */
  listPropertyValues(target?: RecordTarget): Promise<PropertyValue[]>;
  /** Record or change one answer. An upsert on (property, record); the database checks the format. */
  setPropertyValue(target: RecordTarget, propertyKey: string, value: PropertyValueData): Promise<PropertyValue>;
  /** Clear an answer — deletes the row; the history keeps what it was. */
  clearPropertyValue(target: RecordTarget, propertyKey: string): Promise<void>;
  listPropertyValueHistory(target: RecordTarget): Promise<PropertyValueHistoryEntry[]>;
  /**
   * Copy a project's project-level values onto every live job on it (all, or the keys
   * given). Returns how many job rows were written. Amber's "push to jobs".
   */
  pushProjectProperties(projectId: number, keys?: string[]): Promise<number>;

  // ---- processes (0078) -------------------------------------------------
  listProcesses(): Promise<Process[]>;
  createProcess(input: NewProcess): Promise<Process>;
  updateProcess(id: string, patch: ProcessPatch): Promise<Process>;
  /** Refused by the database once the process has been run — retire it instead. */
  deleteProcess(id: string): Promise<void>;
  /**
   * Write a new order for a set of processes — what a drag and drop saves.
   *
   * Amber, 3 Sep: the groups "need to be able to be sorted and have processes nested
   * beneath them and be in order as this defines how the job moves through a build cycle
   * stage". Position and group are the only two things a drag may change, so they are the
   * only two this sends; a process's name and duration cannot move as a side effect.
   */
  reorderProcesses(orders: { id: string; stageGroup: string | null; position: number }[]): Promise<void>;
  /**
   * One process's history, newest first — what changed, when, and by whom.
   *
   * Read from `activity_audit`, so it is the record rather than a reconstruction. Capped
   * at the last 50 writes: the panel is a history, not an export.
   */
  listProcessHistory(processId: string): Promise<ProcessHistoryEntry[]>;
  listProcessDependencies(): Promise<ProcessDependency[]>;
  /** Replace what one process waits on. The database refuses a cycle. */
  setProcessDependencies(processId: string, dependsOn: { processId: string; lagDays: number }[]): Promise<ProcessDependency[]>;
  listProcessProperties(): Promise<ProcessProperty[]>;
  /** Replace which properties one process collects, in order, and which are required to complete it. */
  setProcessProperties(processId: string, properties: { propertyKey: string; required: boolean }[]): Promise<ProcessProperty[]>;
  listProcessTasks(processId?: string): Promise<ProcessTask[]>;
  createProcessTask(input: NewProcessTask): Promise<ProcessTask>;
  updateProcessTask(id: string, patch: ProcessTaskPatch): Promise<ProcessTask>;
  deleteProcessTask(id: string): Promise<void>;
  listProcessTaskDependencies(processId: string): Promise<ProcessTaskDependency[]>;
  setProcessTaskDependencies(taskId: string, dependsOn: { taskId: string; lagDays: number }[]): Promise<ProcessTaskDependency[]>;
  /** Runs on one record, or — with no target — every run the person may see. */
  listProcessRuns(target?: RecordTarget): Promise<ProcessRun[]>;
  /** Begin a process on a record. Attempt is the next number for that process on that record. */
  startProcessRun(target: RecordTarget, processId: string, status?: ProcessRunStatus): Promise<ProcessRun>;
  updateProcessRun(id: string, patch: ProcessRunPatch): Promise<ProcessRun>;
  deleteProcessRun(id: string): Promise<void>;
  /** Copy the process's checklist onto the run's record, once. Returns how many tasks were made. */
  instantiateProcessTasks(runId: string): Promise<number>;

  // ---- the template library and its documents (0094) -------------------------
  /**
   * The library: whole templates and the reusable sections dropped into them.
   *
   * What comes back is already narrowed by RLS, and the narrowing is the feature —
   * an entry nobody has signed off is visible only to whoever wrote it, and a
   * manager-scoped one only from manager up. So "every template" means every template
   * this person may see, and the screens say so rather than implying a global list.
   *
   * `includeDrafts` is a listing choice, not a permission one: false hides the caller's
   * own unapproved drafts from a picker that is meant to offer the library.
   */
  listReportTemplates(opts?: {
    kind?: ReportTemplateKind;
    includeDrafts?: boolean;
    includeInactive?: boolean;
  }): Promise<ReportTemplate[]>;
  getReportTemplate(id: string): Promise<ReportTemplate | null>;
  /**
   * Anyone at `user` and above may write one. It is not in the library until a manager
   * approves it — and a manager writing one approves it by existing, which the database
   * decides rather than this method.
   */
  createReportTemplate(input: NewReportTemplate): Promise<ReportTemplate>;
  /**
   * A PARTIAL update, and it has to be: the builder autosaves the name and the layout
   * independently, so a write that sent both every time would blank whichever one the
   * caller did not have.
   *
   * The policy allows it for the author while it is still a draft, and for manager and
   * above afterwards — an approved entry belongs to the library, not to whoever wrote it.
   */
  updateReportTemplate(id: string, patch: ReportTemplatePatch): Promise<ReportTemplate>;
  /**
   * Sign it off, or take the sign-off back. Manager and above; the trigger refuses
   * anybody else and stamps who from the session rather than trusting an argument.
   */
  approveReportTemplate(id: string, approved: boolean): Promise<ReportTemplate>;
  /** The author may withdraw their own draft; otherwise admin and above. */
  deleteReportTemplate(id: string): Promise<void>;

  /**
   * The documents made from the library — a progress report, a client letter.
   *
   * Filterable by the record a document is about, which is what a job or project screen
   * would ask for. `mine` narrows to the caller's own, for the "what am I working on"
   * list.
   */
  listReportDocuments(opts?: { jobId?: string; projectId?: number; mine?: boolean }): Promise<ReportDocument[]>;
  getReportDocument(id: string): Promise<ReportDocument | null>;
  /** User and above. `templateId` records what it was copied from, for the trail. */
  createReportDocument(input: NewReportDocument): Promise<ReportDocument>;
  /** Partial, for the same reason as the template one. */
  updateReportDocument(id: string, patch: ReportDocumentPatch): Promise<ReportDocument>;
  /** The author, or admin and above. */
  deleteReportDocument(id: string): Promise<void>;
  /**
   * Make or replace a share link — a URL a client opens with no Lofty login.
   *
   * The snapshot is compiled by the caller, in the browser, under their own session, so
   * it holds only what their own RLS let them see. Nothing re-resolves when the link is
   * opened: a shared link is a sent document, not a live window (0095).
   */
  shareReportDocument(id: string, input: NewReportDocumentShare): Promise<ReportDocument>;
  /** Revoke the link. The snapshot survives, so "what did we send them" does too. */
  unshareReportDocument(id: string): Promise<ReportDocument>;
  /**
   * Send a built document somewhere, and stop it being a draft (0104).
   *
   * Amber, 10 September: *"as soon as it is ready to share or publish it, you choose the
   * sharepoint location to save it to (which should default to job file) … until
   * integration is in place add in the draft watermark and when ready to publish you have
   * to add in the sharepoint link which replaces the draft document"*.
   *
   * TWO WAYS, AND AT LEAST ONE OF THEM (0106). Amber, 10 September, once 0104 had shipped:
   * *"until Documents are integrated to Sharepoint, please allow the option of saving to
   * Job in the system and/or downloading it and adding a link to that document file"*.
   *
   *   `url`  — where it went, outside Lofty. Records a fact rather than performing a
   *            transfer: somebody has saved the file into SharePoint themselves and is
   *            writing down where. This is the shape the integration will keep.
   *   `file` — the file itself, saved against the record. Uploaded to the `job-documents`
   *            bucket, filed in `documents` and attached to the job or project this
   *            document is about, so it lands in that record's Documents list beside
   *            everything else rather than in a place of its own.
   *
   * Both is an ordinary state, not a contradiction: the copy saved on the job IS what was
   * sent, and the SharePoint address is where the version people edit lives. Neither is
   * refused — by this method and, underneath it, by constraint.
   *
   * `file` needs the document to be about a job or a project. A portfolio report is about
   * the whole book of work and there is no record to file a copy against, so the control
   * says so rather than offering a button that fails.
   *
   * THERE IS NO `unpublish`. Editing the document is what takes the publication back, and
   * the database does it (0104's trigger) rather than the caller: the builder autosaves,
   * the panel writes and the importer writes, and a rule each of them has to remember is
   * a rule the next one will forget.
   *
   * ONE COPY, NOT A HISTORY (0107). Amber, 10 September: *"only onver version of the
   * document. if they want another copy they can download it"* — so a `file` given here
   * REPLACES the copy the previous publish saved on the record, rather than adding one
   * beside it. The database does the replacing, not this method: a trigger, for the same
   * reason the revert is one. The exception is a copy somebody has since filed on another
   * record, which is left where they put it and only unpointed.
   *
   * Nor is there an unpublish hiding in the file's deletion. Deleting the saved copy takes
   * the publication back only when it was the ONLY answer to "where did it go" (0106's
   * trigger) — a document that also went to SharePoint stays published, because the copy
   * people were sent is still where it was sent.
   */
  publishReportDocument(
    id: string,
    input: { url?: string | null; file?: File | null }
  ): Promise<ReportDocument>;

  /**
   * A link to open a file Lofty itself holds for a record (0106).
   *
   * Every `documents` row with a `storagePath` rather than a URL — which today means the
   * copies saved when a document is published to the job, and will mean whatever the
   * import brings.
   *
   * Signed and short-lived: `job-documents` is private, so there is no permanent URL to
   * hold and every read is asked for at the moment somebody clicks. Null when storage
   * refuses — the row then says the copy is gone rather than offering a link that opens
   * on an error page.
   *
   * The same shape as `attachmentUrl`, and deliberately NOT `uploadReportImage`'s
   * permanent public URL. Which of those two a bucket gets is a decision per bucket, and
   * this one holds contracts.
   */
  jobDocumentUrl(path: string): Promise<string | null>;

  /**
   * The documents attached to one job or one project — 0032's `documents` joined through
   * `document_links`.
   *
   * Not the same list as `listReportDocuments`, and the two are deliberately separate:
   * one is what somebody BUILT in the Document Builder, this is what somebody FILED. The
   * Documents panel shows both, because "what is on this job" is one question.
   */
  listRecordDocuments(opts: { jobId?: string; projectId?: number }): Promise<RecordDocument[]>;
  /**
   * File a document that lives in SharePoint, as a URL (0103).
   *
   * Amber, 10 September: *"when adding a document I need to be able to save it as a url
   * in sharepoint (integration coming) but for now I need to be able to add and delete
   * them"*.
   *
   * Two rows: the document, and the attachment to this record. If the URL is already
   * filed elsewhere it is the SAME document — a second attachment, not a second copy —
   * which is what `documents_one_row_per_url` and the whole "held once" design are for.
   *
   * The app never fetches the document itself. It stores the address; Microsoft governs
   * the file, so filing a link is not a way of sharing one.
   */
  addDocumentUrl(input: NewDocumentUrl): Promise<RecordDocument>;
  /**
   * Take a document off this record. `user` and above — 0032: *"detaching is not
   * deleting: the link goes, the file stays"*.
   *
   * The exception is a document nothing else points at and Lofty holds no bytes for: the
   * database reaps that row itself (0103's trigger), because a pointer with no links is
   * reachable from nowhere. Nothing in SharePoint is ever touched either way.
   */
  removeRecordDocument(linkId: string): Promise<void>;

  /**
   * Both kinds of document, newest first — what the dashboard's Recent documents panel
   * reads.
   *
   * One method rather than two lists merged by the screen: "has anything been filed on my
   * jobs this week" is one question, and two panels answering halves of it means merging
   * by eye. Ordered by the later of created and updated, so a document edited today sorts
   * above one filed last week — the ask was "recent documents **or changes**".
   */
  listRecentDocuments(opts?: { limit?: number }): Promise<RecentDocument[]>;

  /**
   * The header's search, across every kind of record somebody types a name into a box
   * hoping to reach.
   *
   * Distinct from the in-page search, which narrows the board or table you are looking at
   * and is pure client-side matching in `SearchProvider`. Both exist and neither replaces
   * the other: on the Jobs page "brodie" should narrow the table AND offer the contact
   * called Brodie, because only one of those is what you meant and the app cannot tell
   * which.
   *
   * Every term must appear somewhere in a record for it to match — the same AND rule the
   * in-page matchers use, so "brodie court" narrows rather than widening.
   *
   * `limit` is PER KIND, not overall. A query matching forty jobs must not push the one
   * matching contact off the end of the list, which is exactly what a single overall cap
   * would do.
   */
  search(query: string, opts?: { limit?: number }): Promise<SearchHit[]>;
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
  "listMyMentions",
  "markMentionRead",
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
  "listTasks",
  "createTask",
  "updateTask",
  "deleteTask",
  "listTaskChecklist",
  "addTaskChecklistItem",
  "updateTaskChecklistItem",
  "deleteTaskChecklistItem",
  "listProcessTaskChecklist",
  "addProcessTaskChecklistItem",
  "updateProcessTaskChecklistItem",
  "deleteProcessTaskChecklistItem",
  "listStageCompletion",
  "listClassifications",
  "saveClassification",
  "listPartyRoles",
  "savePartyRole",
  "listStaffRoles",
  "saveStaffRole",
  "listContacts",
  "getContact",
  "createContact",
  "updateContact",
  "approveContact",
  "setContactClassifications",
  "listCompanies",
  "getCompany",
  "createCompany",
  "updateCompany",
  "approveCompany",
  "setCompanyClassifications",
  "listContactMethods",
  "addContactMethod",
  "updateContactMethod",
  "deleteContactMethod",
  "listCompanyContacts",
  "addCompanyContact",
  "updateCompanyContact",
  "listRecordParties",
  "addRecordParty",
  "updateRecordParty",
  "deleteRecordParty",
  "listRecordStaffRoles",
  "addRecordStaffRole",
  "endRecordStaffRole",
  "listNotificationTypes",
  "saveNotificationType",
  "listNotificationRules",
  "addNotificationRule",
  "updateNotificationRule",
  "deleteNotificationRule",
  "listMyNotificationPreferences",
  "saveMyNotificationPreference",
  "listMyNotifications",
  "markNotificationsRead",
  "listMyWatches",
  "watchRecord",
  "unwatchRecord",
  "listDeliveryStats",
  "getMaintenanceSettings",
  "saveMaintenanceSettings",
  "listMaintenanceCategories",
  "saveMaintenanceCategory",
  "listMaintenanceRequests",
  "getMaintenanceRequest",
  "createMaintenanceRequest",
  "updateMaintenanceRequest",
  "listMaintenanceItems",
  "addMaintenanceItem",
  "updateMaintenanceItem",
  "deleteMaintenanceItem",
  "offerMaintenanceItem",
  "updateMaintenanceAssignment",
  "listMaintenanceMessages",
  "addMaintenanceNote",
  "getJobWarranty",
  "listMaintenanceOutboxStats",
  "submitFeedback",
  "listFeedback",
  "setFeedbackStage",
  "setFeedbackPhase",
  "setFeedbackKind",
  "setFeedbackVote",
  "setCommentStanding",
  "mergeFeedback",
  "markMoveSeen",
  "listMyMovedRequests",
  "setFeedbackFollow",
  "addVoteFor",
  "listFeedbackVoters",
  "searchFeedback",
  "attachmentUrl",
  "uploadReportImage",
  "listRoadmapPhases",
  "createRoadmapPhase",
  "updateRoadmapPhase",
  "deleteRoadmapPhase",
  "moveRoadmapPhase",
  "listReleases",
  "createRelease",
  "deleteRelease",
  "listMyPreferences",
  "saveMyPreferences",
  "updateStageSla",
  "listTemplateMilestones",
  "listPropertyDefs",
  "listDictionaryOverrides",
  "saveDictionaryOverride",
  "createPropertyDef",
  "updatePropertyDef",
  "deletePropertyDef",
  "myPropertyAccess",
  "listPropertyAccess",
  "savePropertyAccess",
  "deletePropertyAccess",
  "listPropertyOptions",
  "savePropertyOption",
  "deletePropertyOption",
  "listPropertyValues",
  "setPropertyValue",
  "clearPropertyValue",
  "listPropertyValueHistory",
  "pushProjectProperties",
  "listProcesses",
  "createProcess",
  "updateProcess",
  "deleteProcess",
  "reorderProcesses",
  "listProcessHistory",
  "listProcessDependencies",
  "setProcessDependencies",
  "listProcessProperties",
  "setProcessProperties",
  "listProcessTasks",
  "createProcessTask",
  "updateProcessTask",
  "deleteProcessTask",
  "listProcessTaskDependencies",
  "setProcessTaskDependencies",
  "listProcessRuns",
  "startProcessRun",
  "updateProcessRun",
  "deleteProcessRun",
  "instantiateProcessTasks",
  "listReportTemplates",
  "getReportTemplate",
  "createReportTemplate",
  "updateReportTemplate",
  "approveReportTemplate",
  "deleteReportTemplate",
  "listReportDocuments",
  "getReportDocument",
  "createReportDocument",
  "updateReportDocument",
  "deleteReportDocument",
  "shareReportDocument",
  "unshareReportDocument",
  "publishReportDocument",
  "jobDocumentUrl",
  "listRecordDocuments",
  "addDocumentUrl",
  "removeRecordDocument",
  "listRecentDocuments",
  "search"
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
  listMyMentions: "comment_mentions",
  markMentionRead: "comment_mentions",
  listTasks: "task_display",
  listTaskChecklist: "task_checklist_items",
  addTaskChecklistItem: "task_checklist_items",
  updateTaskChecklistItem: "task_checklist_items",
  deleteTaskChecklistItem: "task_checklist_items",
  listProcessTaskChecklist: "process_task_checklist_items",
  addProcessTaskChecklistItem: "process_task_checklist_items",
  updateProcessTaskChecklistItem: "process_task_checklist_items",
  deleteProcessTaskChecklistItem: "process_task_checklist_items",
  listStageCompletion: "stage_completion",
  listClassifications: "classifications",
  saveClassification: "classifications",
  listPartyRoles: "party_roles",
  savePartyRole: "party_roles",
  listStaffRoles: "staff_roles",
  saveStaffRole: "staff_roles",
  listContacts: "contact_display",
  getContact: "contact_display",
  createContact: "contacts",
  updateContact: "contacts",
  approveContact: "contacts",
  setContactClassifications: "contact_classifications",
  listCompanies: "company_display",
  getCompany: "company_display",
  createCompany: "companies",
  updateCompany: "companies",
  approveCompany: "companies",
  setCompanyClassifications: "company_classifications",
  listContactMethods: "contact_methods",
  addContactMethod: "contact_methods",
  updateContactMethod: "contact_methods",
  deleteContactMethod: "contact_methods",
  listCompanyContacts: "company_contacts",
  addCompanyContact: "company_contacts",
  updateCompanyContact: "company_contacts",
  listRecordParties: "record_party_display",
  addRecordParty: "record_parties",
  updateRecordParty: "record_parties",
  deleteRecordParty: "record_parties",
  listRecordStaffRoles: "record_staff_roles",
  addRecordStaffRole: "record_staff_roles",
  endRecordStaffRole: "record_staff_roles",
  listNotificationTypes: "notification_types",
  saveNotificationType: "notification_types",
  listNotificationRules: "notification_rules",
  addNotificationRule: "notification_rules",
  updateNotificationRule: "notification_rules",
  deleteNotificationRule: "notification_rules",
  listMyNotificationPreferences: "notification_preferences",
  saveMyNotificationPreference: "notification_preferences",
  listMyNotifications: "notifications",
  markNotificationsRead: "notifications",
  listMyWatches: "record_watchers",
  watchRecord: "record_watchers",
  unwatchRecord: "record_watchers",
  listDeliveryStats: "notification_deliveries",
  getMaintenanceSettings: "maintenance_settings",
  saveMaintenanceSettings: "maintenance_settings",
  listMaintenanceCategories: "maintenance_categories",
  saveMaintenanceCategory: "maintenance_categories",
  listMaintenanceRequests: "maintenance_request_display",
  getMaintenanceRequest: "maintenance_request_display",
  createMaintenanceRequest: "maintenance_requests",
  updateMaintenanceRequest: "maintenance_requests",
  listMaintenanceItems: "maintenance_item_display",
  addMaintenanceItem: "maintenance_items",
  updateMaintenanceItem: "maintenance_items",
  deleteMaintenanceItem: "maintenance_items",
  offerMaintenanceItem: "maintenance_assignments + maintenance_messages",
  updateMaintenanceAssignment: "maintenance_assignments",
  listMaintenanceMessages: "maintenance_messages",
  addMaintenanceNote: "maintenance_messages",
  getJobWarranty: "job_warranty",
  listMaintenanceOutboxStats: "maintenance_messages",
  createTask: "tasks",
  updateTask: "tasks",
  deleteTask: "tasks",
  submitFeedback: "feedback + feedback_attachments",
  listFeedback: "feedback_display",
  setFeedbackStage: "feedback",
  setFeedbackPhase: "feedback",
  setFeedbackKind: "feedback",
  setFeedbackVote: "feedback_votes",
  setCommentStanding: "comments",
  mergeFeedback: "feedback",
  markMoveSeen: "feedback_follows",
  listMyMovedRequests: "feedback_follows",
  setFeedbackFollow: "feedback_follows",
  addVoteFor: "feedback_votes",
  listFeedbackVoters: "feedback_votes",
  searchFeedback: "feedback_display",
  attachmentUrl: "storage: feedback-screenshots",
  uploadReportImage: "storage: report-images",
  listRoadmapPhases: "roadmap_phases",
  createRoadmapPhase: "roadmap_phases",
  updateRoadmapPhase: "roadmap_phases",
  deleteRoadmapPhase: "roadmap_phases",
  moveRoadmapPhase: "roadmap_phases",
  listReleases: "releases + release_entries",
  createRelease: "releases + release_entries",
  deleteRelease: "releases",
  listMyPreferences: "user_preferences",
  saveMyPreferences: "user_preferences",
  listTemplatePhases: "pipeline_stages",
  updateStageSla: "pipeline_stages",
  listTemplateMilestones: "processes (milestones)",
  listPropertyDefs: "property_defs",
  listDictionaryOverrides: "dictionary_overrides",
  saveDictionaryOverride: "dictionary_overrides",
  createPropertyDef: "property_defs",
  updatePropertyDef: "property_defs",
  deletePropertyDef: "property_defs",
  myPropertyAccess: "my_property_access()",
  listPropertyAccess: "property_access",
  savePropertyAccess: "property_access",
  deletePropertyAccess: "property_access",
  listPropertyOptions: "property_options",
  savePropertyOption: "property_options",
  deletePropertyOption: "property_options",
  listPropertyValues: "property_values",
  setPropertyValue: "property_values",
  clearPropertyValue: "property_values",
  listPropertyValueHistory: "property_value_history",
  pushProjectProperties: "push_project_properties()",
  listProcesses: "processes",
  createProcess: "processes",
  updateProcess: "processes",
  deleteProcess: "processes",
  reorderProcesses: "processes",
  listProcessHistory: "activity_audit",
  listProcessDependencies: "process_dependencies",
  setProcessDependencies: "process_dependencies",
  listProcessProperties: "process_properties",
  setProcessProperties: "process_properties",
  listProcessTasks: "process_tasks",
  createProcessTask: "process_tasks",
  updateProcessTask: "process_tasks",
  deleteProcessTask: "process_tasks",
  listProcessTaskDependencies: "process_task_dependencies",
  setProcessTaskDependencies: "process_task_dependencies",
  listProcessRuns: "process_run_display",
  startProcessRun: "process_runs",
  updateProcessRun: "process_runs",
  deleteProcessRun: "process_runs",
  instantiateProcessTasks: "instantiate_process_tasks()",
  listReportTemplates: "report_templates",
  getReportTemplate: "report_templates",
  createReportTemplate: "report_templates",
  updateReportTemplate: "report_templates",
  approveReportTemplate: "report_templates",
  deleteReportTemplate: "report_templates",
  listReportDocuments: "report_documents",
  getReportDocument: "report_documents",
  createReportDocument: "report_documents",
  updateReportDocument: "report_documents",
  deleteReportDocument: "report_documents",
  shareReportDocument: "report_documents",
  unshareReportDocument: "report_documents",
  publishReportDocument: "report_documents + documents + document_links + storage: job-documents",
  jobDocumentUrl: "storage: job-documents",
  listRecordDocuments: "documents + document_links",
  addDocumentUrl: "documents + document_links",
  removeRecordDocument: "document_links",
  // Both kinds in one list, so the Wiring page names the pair rather than half of it.
  listRecentDocuments: "report_documents + documents",
  // Six reads behind one method. Named as the spine it searches; the rest are listed in
  // the method's own comment rather than crammed into a cell.
  search: "job_display + project_display + …"
};
