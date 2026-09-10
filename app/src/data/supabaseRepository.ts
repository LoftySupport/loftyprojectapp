import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseKey, supabaseUrl } from "./supabaseEnv";
import type { Repository, RepositoryMethod } from "./repository";
import type { DictionaryOverride } from "./dictionary";
import {
  changesBetween, headline, idsIn, recordLink, type NameLookup, type SubjectNames } from "./auditNarrative";
import { createStubRepository } from "./stubRepository";
import { newShareToken } from "./sharePassword";
import { propertyProcessMethods } from "./supabasePropertyProcessRepository";
import { partyMethods } from "./supabasePartyRepository";
import { notificationMethods } from "./supabaseNotificationRepository";
import { maintenanceMethods } from "./supabaseMaintenanceRepository";
import { MAX_SPLIT, OPENING_TEAM, teamSlug } from "./types";
import { projectDisplayName } from "./types";
import { EMPTY_REPORT_TEMPLATE_LAYOUT } from "./types";
import { matchedAddress } from "./SearchProvider";
import type {
  ActivityEntry,
  DocumentCategory,
  NewDocumentUrl,
  RecordDocument,
  RecentDocument,
  SearchHit,
  NewReportDocument,
  NewReportDocumentShare,
  NewReportTemplate,
  ReportDocument,
  ReportTemplate,
  ReportTemplateLayout,
  AddressHistoryEntry,
  CloneOptions,
  CommentEntry,
  FeedbackAttachment,
  FeedbackItem,
  FeedbackKind,
  FeedbackStage,
  FeedbackVoter,
  MovedRequest,
  NewRelease,
  NewRoadmapPhase,
  Release,
  ReleaseEntry,
  ReleaseEntryKind,
  RoadmapPhase,
  RoadmapPhasePatch,
  RoadmapPhaseStatus,
  Job,
  JobPatch,
  JobSplit,
  NewAddress,
  NewFeedback,
  NewProfile,
  NewPropertyDef,
  NewJob,
  NewProject,
  Profile,
  Project,
  ProjectPatch,
  RecordActivity,
  LatestUpdate,
  StagePeriod,
  MentionEntry,
  TaskEntry,
  TaskStatus,
  NewTask,
  TaskPatch,
  TaskChecklistItem,
  ProcessTaskChecklistItem,
  StageCompletion,
  RecordTarget,
  PropertyDef,
  PropertyDefPatch,
  PermissionLevel,
  Stage,
  StageName,
  Team,
  TeamId,
  TemplateMilestone,
  TemplatePhase,
  SavedViewBoard,
  TitleType,
  UserSavedView
} from "./types";

/**
 * Wire one table at a time.
 *
 * Every method here starts by delegating to the stub. To bring a table online:
 *   1. create it in supabase/migrations
 *   2. replace that one method's body with a query
 *   3. add its name to WIRED
 *
 * Nothing else changes. The screens are already reading through the seam, so a table
 * going live shows up as data appearing, not as a refactor.
 *
 * Nothing here falls back to the seed any more. That fallback was written for a database
 * with no tables in it, and it long outlived the condition: it meant an empty table and a
 * missing table gave the same answer, so a screen could show eleven invented field
 * definitions and look exactly like a screen showing eleven real ones. Empty is now empty,
 * and the screens have states that say which.
 */

// Add a method name here as you implement it. The Wiring page reads this.
//
// listTemplateMilestones is the only one left, and it is not waiting on wiring:
// `pipeline_stage_tasks` does not exist. It returns empty rather than a seed, so the
// Wiring page shows it as the one thing genuinely not built rather than as a method
// somebody forgot. property_defs came off this list with 0043.
const WIRED: RepositoryMethod[] = [
  // 0077 / 0078 — property values, access, options and processes.
  "myPropertyAccess", "listPropertyAccess", "savePropertyAccess", "deletePropertyAccess",
  "listPropertyOptions", "savePropertyOption", "deletePropertyOption",
  "listPropertyValues", "setPropertyValue", "clearPropertyValue", "listPropertyValueHistory",
  "pushProjectProperties",
  "listProcesses", "createProcess", "updateProcess", "deleteProcess",
  "listProcessDependencies", "setProcessDependencies", "listProcessProperties", "setProcessProperties",
  "listProcessTasks", "createProcessTask", "updateProcessTask", "deleteProcessTask",
  "listProcessTaskDependencies", "setProcessTaskDependencies",
  "listProcessRuns", "startProcessRun", "updateProcessRun", "deleteProcessRun", "instantiateProcessTasks",
  "listProjects", "getProject", "listJobs", "getJob",
  "createProject", "createJob", "createJobsFromSplit", "deleteJob", "deleteProject",
  "moveJobStage",
  "updateJob",
  "currentProfile", "listProfiles",
  "createProfile", "updateProfile", "setProfileActive", "listActivity",
  "listComments", "addComment", "updateProject", "moveProjectStage",
  "setProjectCurrentAddress", "setJobCurrentAddress", "listAddressHistory",
  "listStages", "listTeams", "updateTeam", "createTeam", "listTemplatePhases", "updateStageSla",
  "listSavedViews", "saveView", "deleteSavedView", "shareSavedView",
  "submitFeedback", "listFeedback", "setFeedbackStage", "setFeedbackPhase", "setFeedbackKind",
  "setFeedbackVote", "attachmentUrl", "uploadReportImage",
  "listRoadmapPhases", "createRoadmapPhase", "updateRoadmapPhase", "deleteRoadmapPhase",
  "moveRoadmapPhase", "listReleases", "createRelease", "deleteRelease",
  "cloneJob", "listRecordActivity",
  "listMyPreferences", "saveMyPreferences",
  "listPropertyDefs", "createPropertyDef", "updatePropertyDef", "deletePropertyDef",
  "listDictionaryOverrides", "saveDictionaryOverride",
  "listClassifications", "saveClassification", "listPartyRoles", "savePartyRole", "listStaffRoles", "saveStaffRole", "listContacts", "getContact", "createContact", "updateContact", "approveContact", "setContactClassifications", "listCompanies", "getCompany", "createCompany", "updateCompany", "approveCompany", "setCompanyClassifications", "listContactMethods", "addContactMethod", "updateContactMethod", "deleteContactMethod", "listCompanyContacts", "addCompanyContact", "updateCompanyContact", "listRecordParties", "addRecordParty", "updateRecordParty", "deleteRecordParty", "listRecordStaffRoles", "addRecordStaffRole", "endRecordStaffRole", "listTaskChecklist", "addTaskChecklistItem", "updateTaskChecklistItem", "deleteTaskChecklistItem", "listProcessTaskChecklist", "addProcessTaskChecklistItem", "updateProcessTaskChecklistItem", "deleteProcessTaskChecklistItem", "listStageCompletion",
  "listNotificationTypes", "saveNotificationType", "listNotificationRules", "addNotificationRule", "updateNotificationRule", "deleteNotificationRule", "listMyNotificationPreferences", "saveMyNotificationPreference", "listMyNotifications", "markNotificationsRead", "listMyWatches", "watchRecord", "unwatchRecord", "listDeliveryStats",
  "getMaintenanceSettings", "saveMaintenanceSettings", "listMaintenanceCategories", "saveMaintenanceCategory", "listMaintenanceRequests", "getMaintenanceRequest", "createMaintenanceRequest", "updateMaintenanceRequest", "listMaintenanceItems", "addMaintenanceItem", "updateMaintenanceItem", "deleteMaintenanceItem", "offerMaintenanceItem", "updateMaintenanceAssignment", "listMaintenanceMessages", "addMaintenanceNote", "getJobWarranty", "listMaintenanceOutboxStats",
  "listReportTemplates", "getReportTemplate", "createReportTemplate", "updateReportTemplate", "approveReportTemplate", "deleteReportTemplate",
  "listReportDocuments", "getReportDocument", "createReportDocument", "updateReportDocument", "deleteReportDocument"
];

/**
 * The `profiles` columns this app reads. `full_name` is generated; never written.
 *
 * One string literal rather than a concatenation: postgrest-js parses this at the type
 * level to shape the result, and `"a" + "b"` widens to `string`, which it cannot read.
 *
 * The embed names its foreign key — `profile_teams!profile_teams_profile_id_fkey` — and
 * has to. `profile_teams` has THREE foreign keys to `profiles`: profile_id, and
 * created_by and updated_by from the audit quartet. PostgREST refuses to guess between
 * them and returns PGRST201, so the unqualified `profile_teams(...)` embed fails for
 * every profile read, including the one that decides whether you are signed in.
 *
 * Any table with the audit quartet pointing back at `profiles` has this shape, so every
 * future embed of one needs the same treatment.
 */
const PROFILE_COLUMNS =
  "profile_id, profile_auth_user_id, profile_first_name, profile_last_name, profile_full_name, profile_email, profile_login_email, profile_job_title, profile_last_login_at, profile_permission, profile_is_active, profile_is_demo, profile_created_at, profile_created_by, profile_updated_at, profile_updated_by, profile_teams!profile_teams_profile_id_fkey(team_id, profile_team_role)";

/**
 * Named explicitly rather than `select("*")`, and each one a single string literal.
 *
 * postgrest-js reads these at the type level to shape the result, and `"a" + "b"` widens
 * to `string`, which it cannot read — the same reason PROFILE_COLUMNS is one long line.
 *
 * Explicit also means a column added to the table does not silently start arriving in
 * every response: the row types below say what this app reads, and adding to them is a
 * deliberate act. Neither list embeds anything, so neither can hit the PGRST201 ambiguity
 * that PROFILE_COLUMNS has to name its way around.
 */
/**
 * The embed NAMES ITS CONSTRAINT, and has to.
 *
 * `projects` has two foreign keys to `addresses` — current and original — so an
 * unqualified `addresses(...)` embed is ambiguous and PostgREST refuses it with
 * PGRST201. That is the same shape that took sign-in down in August, and it is why the
 * project's address was read as an id and never as text: the column list asked for
 * `project_current_address_id` and nothing resolved it, so every project card and
 * project table row rendered {{project_display.current_address}} over an address the
 * database had.
 */
const PROJECT_COLUMNS =
  "project_id, project_name, project_original_address_id, project_current_address_id, project_type, project_status, project_proposed_dwellings, project_community_title_lots, project_torrens_title_lots, project_owning_team, project_assignee_id, project_start_date, project_target_completion, project_end_date, project_stage, project_stage_entered_at, project_sharepoint_url, project_created_at, project_created_by, project_updated_at, project_updated_by, addresses!projects_project_current_address_id_fkey(address_consolidated, address_suburb, address_council), original:addresses!projects_project_original_address_id_fkey(address_consolidated)";

// Read from `job_display`, not from `jobs`. The view resolves both of the job's
// addresses and its project's, which the base table only carries as uuids — so a card
// could show its number and not the address it is at. 0036 widened the view to carry
// every column mapped below so it can stand in for the table rather than beside it.
//
// Not a PostgREST embed: `jobs` points at `addresses` twice, which is the PGRST201
// ambiguity that took sign-in down on 21 August, and the disambiguating syntax puts a
// constraint NAME in this string where a rename would break it at runtime.
//
// Writes still go to `jobs` — a view is not the place to insert through.
const JOB_COLUMNS =
  "job_id, project_id, job_sequence, job_number_old, job_original_address_id, job_current_address_id, job_status, job_stage, job_stage_entered_at, job_owning_team, job_engaged_teams, job_assignee_id, job_sharepoint_url, job_created_at, job_created_by, job_updated_at, job_updated_by, job_current_address, job_original_address, project_current_address, project_sharepoint_url, project_type, job_title_type, job_council";

/**
 * `""` and `"   "` are how a browser reports a field somebody did not fill in, and they
 * are not the same as a value. Every optional text column goes through this on the way
 * in, because a blank string satisfies a NOT NULL and defeats every `is null` after it.
 */
const emptyToNull = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

const TEAM_COLUMNS = "team_id, team_name, team_position, team_is_active";

/**
 * The private bucket screenshots go into (0062). Private, so every read is a signed URL
 * asked for at the moment a card is opened — there is no permanent link to hold.
 */
const SCREENSHOT_BUCKET = "feedback-screenshots";

/**
 * The PUBLIC bucket report images go into (0100). Public, so the URL is permanent and
 * needs no session — which is what lets a client open a shared document and see the
 * pictures, and equally what means those pictures outlive the link. Amber chose that
 * trade with the alternative in front of her; 0100 records it.
 */
const REPORT_IMAGE_BUCKET = "report-images";

/**
 * What the tracker reads off `feedback_display` (0061, widened by 0068).
 *
 * One string literal, like every other column list here: postgrest-js parses these at
 * the type level to shape the result, and `"a" + "b"` widens to `string`, which it
 * cannot read.
 */
const FEEDBACK_DISPLAY_COLUMNS =
  "feedback_id, feedback_kind, feedback_title, feedback_detail, feedback_page, feedback_error_text, feedback_stage, feedback_stage_entered_at, feedback_created_at, feedback_from_name, feedback_added_by_name, feedback_vote_count, feedback_voted_by_me, roadmap_phase_id, feedback_merged_into_id, feedback_merged_into_title, feedback_duplicate_count, feedback_comment_count, feedback_followed_by_me, feedback_move_unseen";

/**
 * One row of that view, as a request.
 *
 * Extracted because there were two copies of this mapping and 0068 added six columns to
 * it: two copies of a mapper is how a board and a vote click end up disagreeing about
 * what a request is. Attachments are passed in rather than read here — they are a second
 * query, and the vote path deliberately does not make it.
 */
const toFeedbackItem = (
  r: Record<string, any>,
  attachments: FeedbackAttachment[] = []
): FeedbackItem => ({
  id: r.feedback_id,
  kind: r.feedback_kind as FeedbackKind,
  title: r.feedback_title,
  detail: r.feedback_detail ?? "",
  page: r.feedback_page ?? null,
  errorText: r.feedback_error_text ?? null,
  stage: r.feedback_stage as FeedbackStage,
  stageEnteredAt: r.feedback_stage_entered_at,
  // Empty rather than a stand-in when the profile is gone: "Unknown" would be a claim
  // about who sent it.
  fromName: r.feedback_from_name || null,
  // Null on an ordinary report, which is almost all of them — and the card only draws
  // "added by" when it is present, so the common case gains nothing to read past.
  addedByName: r.feedback_added_by_name || null,
  createdAt: r.feedback_created_at,
  voteCount: Number(r.feedback_vote_count ?? 0),
  votedByMe: Boolean(r.feedback_voted_by_me),
  roadmapPhaseId: r.roadmap_phase_id ?? null,
  mergedIntoId: r.feedback_merged_into_id ?? null,
  mergedIntoTitle: r.feedback_merged_into_title ?? null,
  duplicateCount: Number(r.feedback_duplicate_count ?? 0),
  commentCount: Number(r.feedback_comment_count ?? 0),
  followedByMe: Boolean(r.feedback_followed_by_me),
  moveUnseen: Boolean(r.feedback_move_unseen),
  attachments
});

/**
 * `comments` points at `profiles` twice (created_by, updated_by), so the author embed
 * names its constraint — the PGRST201 rule, same as everywhere else.
 */
const COMMENT_COLUMNS =
  "comment_id, project_id, job_id, task_id, variation_id, feedback_id, comment_body, comment_is_pinned, comment_is_internal, comment_feedback_stage, parent_comment_id, comment_edited_at, comment_created_at, comment_created_by, comment_updated_at, comment_updated_by, author:profiles!comments_comment_created_by_fkey(profile_full_name)";

type CommentRow = {
  comment_id: string;
  project_id: number | null; job_id: string | null;
  task_id: string | null; variation_id: string | null;
  feedback_id?: string | null;
  comment_is_pinned?: boolean | null;
  comment_is_internal?: boolean | null;
  comment_feedback_stage?: string | null;
  comment_body: string; parent_comment_id: string | null;
  comment_edited_at: string | null;
  comment_created_at: string; comment_created_by: string | null;
  comment_updated_at: string; comment_updated_by: string | null;
  author: { profile_full_name: string | null } | null;
};

/**
 * Read from `task_display` (0081), which resolves the names and derives due, at-risk and
 * health — so the view, not this file, decides what "at risk" means. Writes still go to
 * `tasks`, and re-read the row through the view.
 */
const TASK_COLUMNS =
  "task_id, job_id, project_id, task_name, task_description, parent_task_id, task_position, task_owning_team, task_assignee_id, task_status, task_due_date, task_scheduled_date, task_completed_at, task_completed_by, task_is_external, process_run_id, process_task_id, task_started_at, task_expected_days, task_at_risk_lead_days, task_created_at, task_created_by, task_updated_at, task_updated_by, task_assignee_name, task_completed_by_name, task_created_by_name, task_process_id, task_process_name, task_record_name, task_record_stage, task_due_effective, task_at_risk_date, task_health, task_checklist_total, task_checklist_done, task_subtask_total, task_subtask_done";

type TaskRow = {
  task_id: string; job_id: string | null; project_id: number | null;
  task_name: string; task_description: string | null;
  parent_task_id: string | null; task_position: number;
  task_owning_team: string | null; task_assignee_id: string | null;
  task_status: string; task_due_date: string | null; task_scheduled_date: string | null;
  task_completed_at: string | null; task_completed_by: string | null;
  task_is_external: boolean;
  process_run_id: string | null; process_task_id: string | null;
  task_started_at: string | null; task_expected_days: number | null; task_at_risk_lead_days: number | null;
  task_created_at: string; task_created_by: string | null;
  task_updated_at: string; task_updated_by: string | null;
  task_assignee_name: string | null; task_completed_by_name: string | null; task_created_by_name: string | null;
  task_process_id: string | null; task_process_name: string | null;
  task_record_name: string | null; task_record_stage: string | null;
  task_due_effective: string | null; task_at_risk_date: string | null;
  task_health: TaskEntry["health"];
  task_checklist_total: number; task_checklist_done: number;
  task_subtask_total: number; task_subtask_done: number;
};

/** One task back through the view after a write, so the caller gets derived dates and counts. */
async function readTask(client: SupabaseClient, id: string): Promise<TaskEntry> {
  const { data, error } = await client.from("task_display").select(TASK_COLUMNS).eq("task_id", id).single();
  if (error) throw error;
  return toTask(data as unknown as TaskRow);
}

const CHECKLIST_COLUMNS =
  "task_checklist_item_id, task_id, task_checklist_item_position, task_checklist_item_text, task_checklist_item_is_done, task_checklist_item_done_at, task_checklist_item_done_by, task_checklist_item_created_at, ticker:profiles!task_checklist_items_task_checklist_item_done_by_fkey(profile_full_name)";

type ChecklistRow = {
  task_checklist_item_id: string; task_id: string; task_checklist_item_position: number;
  task_checklist_item_text: string; task_checklist_item_is_done: boolean;
  task_checklist_item_done_at: string | null; task_checklist_item_done_by: string | null;
  task_checklist_item_created_at: string;
  ticker: { profile_full_name: string | null } | null;
};

const toChecklistItem = (r: ChecklistRow): TaskChecklistItem => ({
  id: r.task_checklist_item_id,
  taskId: r.task_id,
  position: r.task_checklist_item_position,
  text: r.task_checklist_item_text,
  isDone: r.task_checklist_item_is_done,
  doneAt: r.task_checklist_item_done_at,
  doneBy: r.task_checklist_item_done_by,
  doneByName: r.ticker?.profile_full_name ?? null
});

type TemplateChecklistRow = {
  process_task_checklist_item_id: string; process_task_id: string;
  process_task_checklist_item_position: number; process_task_checklist_item_text: string;
};

const toTemplateChecklistItem = (r: TemplateChecklistRow): ProcessTaskChecklistItem => ({
  id: r.process_task_checklist_item_id,
  processTaskId: r.process_task_id,
  position: r.process_task_checklist_item_position,
  text: r.process_task_checklist_item_text
});

function toTask(r: TaskRow): TaskEntry {
  return {
    id: r.task_id,
    jobId: r.job_id,
    projectId: r.project_id,
    name: r.task_name,
    description: r.task_description,
    parentTaskId: r.parent_task_id,
    position: r.task_position,
    owningTeam: (r.task_owning_team as TeamId | null) ?? null,
    assigneeId: r.task_assignee_id,
    assigneeName: r.task_assignee_name,
    status: r.task_status as TaskStatus,
    dueDate: r.task_due_date,
    scheduledDate: r.task_scheduled_date,
    completedAt: r.task_completed_at,
    completedBy: r.task_completed_by,
    completedByName: r.task_completed_by_name,
    startedAt: r.task_started_at,
    expectedDays: r.task_expected_days,
    atRiskLeadDays: r.task_at_risk_lead_days,
    dueEffective: r.task_due_effective,
    atRiskDate: r.task_at_risk_date,
    health: r.task_health,
    checklistTotal: r.task_checklist_total,
    checklistDone: r.task_checklist_done,
    subtaskTotal: r.task_subtask_total,
    subtaskDone: r.task_subtask_done,
    isExternal: r.task_is_external,
    processRunId: r.process_run_id,
    processTaskId: r.process_task_id,
    createdAt: r.task_created_at,
    createdBy: r.task_created_by,
    createdByName: r.task_created_by_name,
    processId: r.task_process_id,
    processName: r.task_process_name,
    recordName: r.task_record_name,
    recordStage: r.task_record_stage as StageName | null,
    updatedAt: r.task_updated_at,
    updatedBy: r.task_updated_by
  };
}

function toComment(r: CommentRow): CommentEntry {
  return {
    id: r.comment_id,
    projectId: r.project_id,
    jobId: r.job_id,
    taskId: r.task_id,
    variationId: r.variation_id,
    body: r.comment_body,
    parentCommentId: r.parent_comment_id,
    editedAt: r.comment_edited_at,
    createdAt: r.comment_created_at,
    createdBy: r.comment_created_by,
    updatedAt: r.comment_updated_at,
    updatedBy: r.comment_updated_by,
    authorName: r.author?.profile_full_name ?? null,
    feedbackId: r.feedback_id ?? null,
    isPinned: Boolean(r.comment_is_pinned),
    isInternal: Boolean(r.comment_is_internal),
    stageAnnounced: (r.comment_feedback_stage as FeedbackStage | null) ?? null
  };
}

const ADDRESS_COLUMNS =
  "address_id, address_res_number, address_lot_number, address_street_number, address_street_1, address_street_2, address_suburb, address_state, address_postcode, address_council";

/** One `activity_audit` row, as this file reads it (the pre-0080 shape `auditNarrative` diffs). */
type AuditRow = {
  id: number;
  table_name: string;
  operation: string;
  changed_at: string;
  jwt_sub: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  /** Who, as a profile — extracted at write time since 0080; null on older rows and on writes with nobody behind them. */
  profile_id: string | null;
  job_id: string | null;
  project_id: number | null;
  origin: string;
};

/**
 * The columns as 0080 named them. Every read of the audit table goes through
 * `fromAuditRow`, so the rename touched one place in the app rather than four.
 */
const AUDIT_COLUMNS =
  "activity_audit_id, activity_audit_table, activity_audit_operation, activity_audit_at, activity_audit_jwt_sub, activity_audit_old_row, activity_audit_new_row, activity_audit_profile_id, activity_audit_job_id, activity_audit_project_id, activity_audit_origin";

interface AuditDbRow {
  activity_audit_id: number;
  activity_audit_table: string;
  activity_audit_operation: string;
  activity_audit_at: string;
  activity_audit_jwt_sub: string | null;
  activity_audit_old_row: Record<string, unknown> | null;
  activity_audit_new_row: Record<string, unknown> | null;
  activity_audit_profile_id: string | null;
  activity_audit_job_id: string | null;
  activity_audit_project_id: number | null;
  activity_audit_origin: string;
}

const fromAuditRow = (r: AuditDbRow): AuditRow => ({
  id: r.activity_audit_id,
  table_name: r.activity_audit_table,
  operation: r.activity_audit_operation,
  changed_at: r.activity_audit_at,
  jwt_sub: r.activity_audit_jwt_sub,
  old_row: r.activity_audit_old_row,
  new_row: r.activity_audit_new_row,
  profile_id: r.activity_audit_profile_id,
  job_id: r.activity_audit_job_id,
  project_id: r.activity_audit_project_id,
  origin: r.activity_audit_origin
});

/**
 * The names a feed line needs that are not in the row: a process run's process, a
 * property value's label. Fetched once per batch and handed to `recordLink`, so the line
 * reads "2 - Frame started" and "Frame inspection booked is now 4 Sep 2026" rather than
 * two uuids.
 */
async function resolveSubjects(client: SupabaseClient, rows: AuditRow[]): Promise<SubjectNames> {
  const processIds = [...new Set(rows.filter(r => r.table_name === "process_runs")
    .map(r => String((r.new_row ?? r.old_row)?.process_id ?? "")).filter(Boolean))];
  const keys = [...new Set(rows.filter(r => r.table_name === "property_values" || r.table_name === "property_access" || r.table_name === "property_options")
    .map(r => String((r.new_row ?? r.old_row)?.property_def_key ?? "")).filter(Boolean))];
  const [procs, defs] = await Promise.all([
    processIds.length
      ? client.from("processes").select("process_id, process_name").in("process_id", processIds)
      : Promise.resolve({ data: [] as { process_id: string; process_name: string }[] }),
    keys.length
      ? client.from("property_defs").select("property_def_key, property_def_label").in("property_def_key", keys)
      : Promise.resolve({ data: [] as { property_def_key: string; property_def_label: string }[] })
  ]);
  return {
    process: new Map(((procs.data ?? []) as { process_id: string; process_name: string }[]).map(p => [p.process_id, p.process_name])),
    property: new Map(((defs.data ?? []) as { property_def_key: string; property_def_label: string }[]).map(d => [d.property_def_key, d.property_def_label]))
  };
}

/**
 * The people named anywhere in a batch of audit rows, resolved in one pass.
 *
 * Two lookups, because the audit table holds two different kinds of person id and they
 * are not interchangeable: the ACTOR is `jwt_sub`, an auth uid, while every person id
 * INSIDE a row — an assignee, a created_by — is a `profiles.profile_id`. Resolving one
 * with the other silently returns nobody, which reads on screen as "we do not know who
 * that is" for a person sitting three feet away.
 */
async function resolvePeople(
  client: SupabaseClient, rows: AuditRow[]
): Promise<{ byAuth: Map<string, string>; byProfile: Map<string, string> }> {
  const subs = [...new Set(rows.map(r => r.jwt_sub).filter(Boolean))] as string[];
  const ids = [...new Set([...rows.flatMap(r => idsIn(r)), ...rows.map(r => r.profile_id).filter((v): v is string => Boolean(v))])];
  const byAuth = new Map<string, string>();
  const byProfile = new Map<string, string>();

  const [auth, profs] = await Promise.all([
    subs.length
      ? client.from("profiles").select("profile_auth_user_id, profile_full_name").in("profile_auth_user_id", subs)
      : Promise.resolve({ data: [] as { profile_auth_user_id: string | null; profile_full_name: string }[] }),
    ids.length
      ? client.from("profiles").select("profile_id, profile_full_name").in("profile_id", ids)
      : Promise.resolve({ data: [] as { profile_id: string; profile_full_name: string }[] })
  ]);
  for (const p of (auth.data ?? []) as { profile_auth_user_id: string | null; profile_full_name: string }[]) {
    if (p.profile_auth_user_id) byAuth.set(p.profile_auth_user_id, p.profile_full_name);
  }
  for (const p of (profs.data ?? []) as { profile_id: string; profile_full_name: string }[]) {
    byProfile.set(p.profile_id, p.profile_full_name);
  }
  return { byAuth, byProfile };
}

/**
 * Whole days between two instants, floored, never negative.
 *
 * Floored rather than rounded: a stage entered yesterday afternoon and left this
 * morning is "0 days", which is what somebody counting working days would say, and
 * rounding it to 1 would quietly inflate every short stage in a report.
 */
function whole_days(from: string, to: string): number {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/**
 * One audit row as a line of history: what record, what changed, from what to what.
 *
 * Amber, 28 August, on the first version of this feed: *"it needs to say who changed
 * what to what… she changed Ketan (with link to Ketan's record) from Demo mode to not
 * demo mode. Or Deanna changed selections due date from 1/7/26 to 7/7/26."* The wording
 * and the value rendering live in `auditNarrative` so the Admin list says it the same
 * way; this function is only the assembly.
 *
 * **Returns null for a no-op**, and the caller drops those rows. Three of the first five
 * real rows on project 1002 were updates where nothing moved but `job_updated_at` — a
 * touch, not an event. Rendering them as "1002-01 updated" would fill the panel with
 * lines that carry no information, which is the opposite of the "neat and clean" this
 * was asked to be. An event nobody can act on is not history; it is a row in a table.
 */
function narrate(r: AuditRow, lookup: NameLookup, names: SubjectNames): RecordActivity | null {
  const { subject, href } = recordLink(r.table_name, r.new_row ?? r.old_row, names);
  const who = (r.profile_id ? lookup.person(r.profile_id) : null)
    ?? (r.jwt_sub ? lookup.actor(r.jwt_sub) : null)
    // An integration is an actor with a name, not "system" (0080's origin column).
    ?? (r.origin && r.origin !== "app" ? `${r.origin} sync` : null);
  const verb = headline(r);
  const base = { id: String(r.id), at: r.changed_at, subject, href, who };

  if (verb) return { ...base, summary: verb, changes: [] };

  const changes = changesBetween(r, lookup);
  if (changes.length === 0) return null;
  return { ...base, summary: "", changes };
}

const STAGE_COLUMNS =
  "pipeline_stage_id, pipeline_stage_name, pipeline_stage_position, pipeline_stage_owning_team, pipeline_stage_expected_days, pipeline_stage_at_risk_lead_days, pipeline_stage_created_at, pipeline_stage_created_by, pipeline_stage_updated_at, pipeline_stage_updated_by";

interface StageRow {
  pipeline_stage_id: string;
  pipeline_stage_name: string;
  pipeline_stage_position: number;
  pipeline_stage_owning_team: TeamId | null;
  pipeline_stage_expected_days: number | null;
  pipeline_stage_at_risk_lead_days: number | null;
  pipeline_stage_created_at: string;
  pipeline_stage_created_by: string | null;
  pipeline_stage_updated_at: string;
  pipeline_stage_updated_by: string | null;
}

/**
 * The stages of the build lifecycle, in order.
 *
 * Two round trips rather than one embed, deliberately. `pipelines` and `pipeline_stages`
 * reference each other in both directions — `pipeline_stages.pipeline_id` down, and
 * `pipelines.pipeline_parent_stage_id` back up for the nesting — and an embed across a
 * pair like that is exactly the shape that produced PGRST201 on sign-in. Two plain
 * queries cannot be ambiguous, and this runs once per page load.
 *
 * Filtered to `build_lifecycle` because a job sits in several pipelines at once: the
 * lifecycle, then a nested one per phase. Without the filter this would return every
 * stage of every pipeline as though they were one list.
 */
async function loadLifecycleStages(client: SupabaseClient): Promise<StageRow[]> {
  const { data: pipeline, error: pipelineError } = await client
    .from("pipelines")
    .select("pipeline_id")
    .eq("pipeline_key", "build_lifecycle")
    .maybeSingle();
  if (pipelineError) throw pipelineError;
  if (!pipeline) return [];

  const { data, error } = await client
    .from("pipeline_stages")
    .select(STAGE_COLUMNS)
    .eq("pipeline_id", pipeline.pipeline_id)
    .order("pipeline_stage_position");
  if (error) throw error;
  return (data ?? []) as unknown as StageRow[];
}

interface ProfileRow {
  profile_id: string;
  profile_auth_user_id: string | null;
  profile_first_name: string;
  profile_last_name: string;
  profile_full_name: string;
  profile_email: string;
  profile_login_email: string | null;
  profile_job_title: string | null;
  profile_last_login_at: string | null;
  profile_permission: Profile["permission"];
  profile_is_active: boolean;
  profile_is_demo: boolean;
  /**
   * An embedded join again, not a column — membership went back to being a table when
   * it had to carry whether somebody manages the team. PostgREST returns [] rather than
   * null for an embed with no rows, but `?? []` still covers a select that did not ask.
   */
  profile_teams: { team_id: TeamId; profile_team_role: "member" | "manager" }[] | null;
  profile_created_at: string;
  profile_created_by: string | null;
  profile_updated_at: string;
  profile_updated_by: string | null;
}

/** Past tense, because the audit log is a record of what happened. */
const OPERATION_WORDS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted"
};

/**
 * Replace a person's team memberships.
 *
 * Delete-then-insert rather than a diff: the set is three rows at most, PostgREST gives
 * each request its own transaction so a diff would be no more atomic than this, and the
 * failure modes are the same. What it must NOT do is touch `profile_team_role` — nothing
 * in the UI sets it yet, so a diff that preserved it would be pretending to a fidelity
 * this does not have. Recorded here because it will matter when managers are editable.
 */
async function writeTeams(client: SupabaseClient, profileId: string, teams: TeamId[]) {
  // Remove only what was actually removed, and add only what is new.
  //
  // Delete-all-then-reinsert is the obvious version and it is wrong: profile_team_role
  // has a default of 'member', so re-inserting a row a manager already had silently
  // demotes them. Every edit to somebody's team list would quietly strip the one
  // attribute this table exists to carry — and nothing would report it, because the
  // write succeeds.
  const { data: existing, error: readError } = await client
    .from("profile_teams").select("team_id").eq("profile_id", profileId);
  if (readError) throw readError;

  const had = new Set((existing ?? []).map(r => r.team_id as TeamId));
  const wanted = new Set(teams);

  const removed = [...had].filter(t => !wanted.has(t));
  const added = [...wanted].filter(t => !had.has(t));

  if (removed.length) {
    const { error } = await client.from("profile_teams")
      .delete().eq("profile_id", profileId).in("team_id", removed);
    if (error) throw error;
  }
  if (added.length) {
    const { error } = await client.from("profile_teams")
      .insert(added.map(team_id => ({ profile_id: profileId, team_id })));
    if (error) throw error;
  }
  // Teams in both sets are left completely alone, which is what preserves the role.
}

/** Re-read after a write, so the caller gets generated columns and teams, not its input. */
async function readProfile(client: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles").select(PROFILE_COLUMNS).eq("profile_id", id).maybeSingle();
  if (error || !data) return null;
  return toProfile(data as unknown as ProfileRow);
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.profile_id,
  authUserId: r.profile_auth_user_id,
  firstName: r.profile_first_name,
  lastName: r.profile_last_name,
  fullName: r.profile_full_name,
  email: r.profile_email,
  loginEmail: r.profile_login_email,
  jobTitle: r.profile_job_title,
  lastLoginAt: r.profile_last_login_at,
  permission: r.profile_permission,
  active: r.profile_is_active,
  isDemo: r.profile_is_demo,
  createdAt: r.profile_created_at,
  createdBy: r.profile_created_by,
  updatedAt: r.profile_updated_at,
  updatedBy: r.profile_updated_by,
  // Flattened to slugs: the role rides along in the row but nothing reads it until the
  // permission model lands, and exposing it now would invite a screen to depend on it
  // before the policies that make it mean anything exist.
  teams: (r.profile_teams ?? []).map(t => t.team_id).sort()
});

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabase);
}

export function createSupabaseRepository(): Repository {
  const stub = createStubRepository();
  const client = supabase;
  if (!client) return stub;

  const lifecycleStages = () => loadLifecycleStages(client);

  // Pinned to the narrowed type: the build's tsc does not carry `if (!client)` into a
  // nested function the way the editor's does, and `db` makes the narrowing explicit.
  const db: SupabaseClient = client;

  /**
   * Upload the screenshots for one report and record them.
   *
   * The object path starts with the uploader's profile id, and it has to: the storage
   * policy in 0062 compares `(storage.foldername(name))[1]` to `current_profile_id()`,
   * because storage.objects has no column saying which report a file belongs to. The
   * link between file and report is the `feedback_attachments` row and nothing else.
   *
   * The name is sanitised rather than trusted. A filename arrives from a person's
   * machine, and `../` in an object path is the oldest trick there is; anything that is
   * not a letter, number, dot or dash becomes a dash, and the uuid in front keeps two
   * files called "Screenshot.png" apart.
   */
  const attachScreenshots = async (feedbackId: string, profileId: string, files: File[]) => {
    for (const file of files) {
      const safe = file.name.replace(/[^a-zA-Z0-9.-]/g, "-").slice(-80) || "screenshot";
      const path = `${profileId}/${crypto.randomUUID()}-${safe}`;
      const { error: uploadError } = await db.storage
        .from(SCREENSHOT_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw uploadError;

      const { error } = await db.from("feedback_attachments").insert({
        feedback_id: feedbackId,
        feedback_attachment_path: path,
        feedback_attachment_name: file.name,
        feedback_attachment_mime: file.type ?? "",
        feedback_attachment_bytes: file.size ?? 0
      });
      if (error) throw error;
    }
  };

  /**
   * Insert one address row and return its id. The same normalisation everywhere: blank
   * strings become null before they can pass a NOT NULL as a street named nothing.
   */
  async function insertAddress(a: NewAddress): Promise<string> {
    const { data, error } = await db
      .from("addresses")
      .insert({
        // Null on a project's address — the form does not offer it there. `0105`
        // explains why the database does not forbid it rather than checking it.
        // Numbers since 0106 — `emptyToNull` is for the text fields below it.
        address_res_number: a.resNumber ?? null,
        address_lot_number: a.lotNumber ?? null,
        address_street_number: emptyToNull(a.streetNumber),
        address_street_1: emptyToNull(a.street1),
        address_street_2: emptyToNull(a.street2),
        address_suburb: a.suburb,
        address_state: a.state ?? "SA",
        address_postcode: a.postcode,
        address_council: a.council ?? null
      })
      .select("address_id")
      .single();
    if (error) throw error;
    return data.address_id;
  }

  /** One project, re-read with its embeds — the read-back both project mutators share. */
  async function readProject(id: number): Promise<Project> {
    const { data, error } = await db
      .from("projects")
      .select(PROJECT_COLUMNS)
      .eq("project_id", id)
      .single();
    if (error) throw error;
    return toProject(data as unknown as ProjectRow);
  }

  // Bound rather than returned inline: listTemplatePhases reads the same team list
  // listTeams returns, and calling it through the object keeps one definition of what a
  // team looks like instead of two queries that could drift apart.
  const repo: Repository = {
    // The property-value and process methods (0077, 0078) live in their own module;
    // they share nothing with the rest but the client.
    ...propertyProcessMethods(client),
    ...partyMethods(client),
    ...notificationMethods(client),
    ...maintenanceMethods(client),
    name: "supabase",
    wired: new Set<RepositoryMethod>(WIRED) as ReadonlySet<keyof Repository>,

    // ---- projects -------------------------------------------------------
    /**
     * Every project the reader may see. RLS decides which; this asks for all of them.
     *
     * No fallback to the stub on an empty result. That fallback is right for the lookups —
     * an empty `teams` table means "not seeded yet", not "there are no teams" — and wrong
     * here, because zero projects is a true and ordinary answer. It was also actively
     * harmful: `createProject` has written to Supabase for a while, so a project created
     * in the app was inserted, given its number, and then not shown, because this method
     * was still answering from a stub that returns nothing. The record existed and the
     * app that made it could not see it.
     */
    async listProjects(): Promise<Project[]> {
      const { data, error } = await client
        .from("projects")
        .select(PROJECT_COLUMNS)
        .order("project_id");
      if (error) throw error;
      return (data ?? []).map(r => toProject(r as unknown as ProjectRow));
    },

    /**
     * `id` arrives as text because it came out of a URL. `project_id` is an integer, and
     * PostgREST will not coerce a non-numeric string for us — it returns a 22P02 that
     * reads like a server fault rather than a bad link. So a URL that is not a number is
     * "no such project", which is what it means.
     */
    async getProject(id: string): Promise<Project | null> {
      const projectId = Number(id);
      if (!Number.isInteger(projectId)) return null;

      const { data, error } = await client
        .from("projects")
        .select(PROJECT_COLUMNS)
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      return data ? toProject(data as unknown as ProjectRow) : null;
    },

    // ---- jobs -----------------------------------------------------------
    async listJobs(opts?: { projectId?: string }): Promise<Job[]> {
      let query = client.from("job_display").select(JOB_COLUMNS);

      if (opts?.projectId != null) {
        const projectId = Number(opts.projectId);
        // A filter that cannot be honoured must not silently widen to "every job".
        if (!Number.isInteger(projectId)) return [];
        query = query.eq("project_id", projectId);
      }

      // By project, then by sequence — so 1042-02 sorts after 1042-01 and before 1042-10,
      // which ordering by job_id as text would not do.
      const { data, error } = await query.order("project_id").order("job_sequence");
      if (error) throw error;
      return (data ?? []).map(r => toJob(r as unknown as JobRow));
    },

    /** `maybeSingle`, not `single`: a job that is not there is null, not an error. */
    async getJob(id: string): Promise<Job | null> {
      const { data, error } = await client
        .from("job_display")
        .select(JOB_COLUMNS)
        .eq("job_id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? toJob(data as unknown as JobRow) : null;
    },

    // ---- profiles -------------------------------------------------------
    /**
     * Everyone on the staff list, for the Admin table.
     *
     * No fallback to the stub on an empty result, unlike the lookups. An empty list here
     * is a real answer — it means the reader cannot see any profiles, which after 0015
     * means they are not linked — and seeding it with invented people would hide exactly
     * that. The read policy is `is_active_user()`, so this returns everyone to anyone
     * with an active linked profile, and nothing to anybody else.
     */
    async listProfiles(): Promise<Profile[]> {
      const { data, error } = await client
        .from("profiles")
        .select(PROFILE_COLUMNS)
        .order("profile_last_name")
        .order("profile_first_name");
      if (error) throw error;
      return (data ?? []).map(r => toProfile(r as unknown as ProfileRow));
    },

    /**
     * The signed-in person's own row, or null when nobody is signed in.
     *
     * No fallback to the stub. Every other method here degrades to seed data so a
     * half-built database still shows its structure, but identity is the one thing that
     * must never be invented: a made-up profile would come with a made-up `permission`,
     * and every gate in the app reads that. Null is the honest answer, and the header
     * shows it as signed out.
     *
     * Keyed on `auth_user_id`, not `id`. Since 0015 those are different things: `id` is
     * Lofty's key on the staff record, `auth.uid()` is Microsoft's on the session, and
     * the trigger joins them at first sign-in.
     *
     * `maybeSingle()` rather than `single()` — no row is a real state, not an error, and
     * a meaningful one: it means this Microsoft account is not on Lofty's list. The
     * caller turns that into "not set up" rather than crashing on it.
     */
    async currentProfile(): Promise<Profile | null> {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return null;

      const { data, error } = await client
        .from("profiles")
        .select(PROFILE_COLUMNS)
        // The read policy is `is_active_user()`, which is broader than "your own row" —
        // so this filter is doing real work, not restating a policy.
        .eq("profile_auth_user_id", auth.user.id)
        .maybeSingle();

      // An error is NOT "no profile". Collapsing the two is what made a broken query
      // look like "your account is not set up": currentProfile returned null, the gate
      // read that as unlinked, and nothing anywhere said the query had failed.
      if (error) throw error;
      if (!data) return null;
      return toProfile(data as ProfileRow);
    },


    /**
     * Add somebody to the staff list.
     *
     * Two statements, not one, and deliberately not in a transaction — PostgREST gives
     * each request its own, so there is no way to ask for one. If the team insert fails
     * the profile is already committed: a person with no team, which the Admin table
     * shows as "—" and an admin can fix. The alternative failure — a team row pointing
     * at nothing — cannot happen, because the profile is written first.
     *
     * No auth_user_id: that is the whole point. The row exists before the person has
     * signed in, and the 0015 trigger fills it when they do.
     */
    async createProfile(input: NewProfile): Promise<Profile> {
      const { data, error } = await client
        .from("profiles")
        .insert({
          profile_first_name: input.firstName,
          profile_last_name: input.lastName,
          profile_email: input.email,
          profile_login_email: input.loginEmail,
          profile_job_title: input.jobTitle,
          profile_permission: input.permission,
          profile_is_demo: input.isDemo ?? false
        })
        .select("profile_id")
        .single();
      if (error) throw error;

      await writeTeams(client, (data as { profile_id: string }).profile_id, input.teams);

      const after = await readProfile(client, (data as { profile_id: string }).profile_id);
      if (!after) throw new Error("Profile disappeared while being created");
      return after;
    },

    async updateProfile(id: string, patch: Partial<NewProfile>): Promise<Profile> {
      const row: Record<string, unknown> = {};
      if (patch.firstName !== undefined) row.profile_first_name = patch.firstName;
      if (patch.lastName !== undefined) row.profile_last_name = patch.lastName;
      if (patch.email !== undefined) row.profile_email = patch.email;
      if (patch.loginEmail !== undefined) row.profile_login_email = patch.loginEmail;
      if (patch.jobTitle !== undefined) row.profile_job_title = patch.jobTitle;
      if (patch.permission !== undefined) row.profile_permission = patch.permission;
      // 0049. Ticking this is what holds the account at the door; the database refuses
      // its reads from that moment, so the screen and the boundary agree.
      if (patch.isDemo !== undefined) row.profile_is_demo = patch.isDemo;

      if (Object.keys(row).length) {
        const { error } = await client.from("profiles").update(row).eq("profile_id", id);
        if (error) throw error;
      }

      // A second write again, because membership is a table again. Deliberately after
      // the profile update rather than before: if this half fails, the name change has
      // still landed and the teams are visibly unchanged, which an admin can see and
      // redo. The other order would leave the teams moved under an unchanged name.
      if (patch.teams !== undefined) await writeTeams(client, id, patch.teams);

      const after = await readProfile(client, id);
      if (!after) throw new Error("Profile disappeared while being updated");
      return after;
    },

    /**
     * The "delete" button. `profiles` has no DELETE policy, by design: a name sits on
     * years of activity and comments, and removing the row orphans all of it. Setting
     * `active` false is what removes their access — `is_active_user()` requires it —
     * while leaving the history readable.
     */
    async setProfileActive(id: string, active: boolean): Promise<Profile> {
      const { error } = await client.from("profiles")
        .update({ profile_is_active: active }).eq("profile_id", id);
      if (error) throw error;
      const after = await readProfile(client, id);
      if (!after) throw new Error("Profile disappeared while being deactivated");
      return after;
    },

    async getProfile(id: string): Promise<Profile | null> {
      return readProfile(client, id);
    },

    /**
     * One list from two tables, because a reader wants one story.
     *
     * `activity_audit` records the actor as `jwt_sub` — auth.uid() as text — so this
     * matches on auth_user_id, not on the profile id. Somebody who has never signed in
     * has no auth_user_id and therefore no activity, which is correct rather than empty
     * by accident.
     */
    async listActivity(opts: { profileId?: string; team?: string; limit?: number }): Promise<ActivityEntry[]> {
      const limit = opts.limit ?? 100;

      // Back to a join, because membership is a table again. `!inner` is what makes the
      // embed filter the parent rather than just decorate it — without it, filtering by
      // team returns every profile with an empty teams array attached.
      let q = client.from("profiles").select(
        opts.team
          ? "profile_id, profile_auth_user_id, profile_full_name, profile_teams!profile_teams_profile_id_fkey!inner(team_id)"
          : "profile_id, profile_auth_user_id, profile_full_name"
      );
      if (opts.profileId) q = q.eq("profile_id", opts.profileId);
      if (opts.team) q = q.eq("profile_teams.team_id", opts.team);
      const { data: people, error: peopleError } = await q;
      if (peopleError) throw peopleError;

      /**
       * The PREFIXED column names, which is what the select above asks for.
       *
       * This cast claimed `{ id, auth_user_id, full_name }` — the names these columns had
       * before 0028 renamed them. `as unknown as` silences the compiler completely, so
       * nothing caught it: every row came back with `auth_user_id: undefined`, the filter
       * below dropped all of them, `authIds` was empty and the function returned `[]`
       * before it ever read the audit table.
       *
       * So activity looked like it was not being recorded when it was — 221 rows of it,
       * including the profile edits made minutes before the report. A lie in a cast is
       * worse than a missing type, because it reads as though somebody checked.
       */
      const rows = (people ?? []) as unknown as {
        profile_id: string;
        profile_auth_user_id: string | null;
        profile_full_name: string;
      }[];
      const byAuthId = new Map(
        rows
          .filter(r => r.profile_auth_user_id)
          .map(r => [r.profile_auth_user_id!, r.profile_full_name])
      );
      const authIds = [...byAuthId.keys()];
      if (!authIds.length) return [];

      const [audit, logins] = await Promise.all([
        client.from("activity_audit")
          // The snapshots come too, which is what lets a line say WHICH record and WHAT
          // moved on it (Amber, 28 August). Since 0080 every active user may read this,
          // less the restricted values the policy withholds.
          .select(AUDIT_COLUMNS)
          .in("activity_audit_jwt_sub", authIds).order("activity_audit_at", { ascending: false }).limit(limit),
        client.from("login_activity")
          .select("login_activity_id, login_activity_user_id, login_activity_event_type, login_activity_at")
          .in("login_activity_user_id", authIds).order("login_activity_at", { ascending: false }).limit(limit)
      ]);
      if (audit.error) throw audit.error;
      if (logins.error) throw logins.error;

      /**
       * "Updated profiles" was the whole line here, and it names the table rather than
       * the person — forty identical lines on one admin's list, and finding which of
       * them touched Ketan meant opening every record in the app. Same reduction as the
       * record feed now: which record, what moved, from what to what.
       *
       * A row where nothing moved but a touch column keeps its line here, unlike the
       * record feed: this list answers "what has this person been doing", and a save
       * that changed nothing is still something they did.
       */
      const auditRows = ((audit.data ?? []) as unknown as AuditDbRow[]).map(fromAuditRow);
      const [{ byProfile }, names] = await Promise.all([resolvePeople(client, auditRows), resolveSubjects(client, auditRows)]);
      const lookup: NameLookup = {
        person: id => byProfile.get(id) ?? null,
        actor: sub => byAuthId.get(sub) ?? null
      };

      const entries: ActivityEntry[] = [
        ...auditRows
          .map(a => {
            const { subject, href } = recordLink(a.table_name, a.new_row ?? a.old_row, names);
            const changes = a.operation === "UPDATE" ? changesBetween(a, lookup) : [];
            const verb = OPERATION_WORDS[a.operation] ?? a.operation;
            return {
              id: `audit-${a.id}`,
              kind: "audit" as const,
              at: a.changed_at,
              actorAuthId: a.jwt_sub,
              subject,
              href,
              changes,
              verb,
              // Named only when the list spans several people — on one person's own
              // list, every line is theirs and repeating the name forty times is noise.
              actorName: byAuthId.size > 1
                ? (a.jwt_sub ? byAuthId.get(a.jwt_sub) ?? null : null)
                : null,
              // The fallback still names the table, for a row on something with no
              // screen of its own — an address, a membership — where naming the record
              // would mean printing an id. Only used when there is no subject to link.
              summary: `${verb} ${subject || a.table_name}`
            };
          }),
        ...((logins.data ?? []) as unknown as { login_activity_id: number; login_activity_user_id: string; login_activity_event_type: string; login_activity_at: string }[])
          .map(l => ({
            id: `login-${l.login_activity_id}`,
            kind: "login" as const,
            at: l.login_activity_at,
            actorAuthId: l.login_activity_user_id,
            summary: (l.login_activity_event_type === "SIGNUP" ? "First signed in" : "Signed in")
              + (byAuthId.size > 1 ? ` — ${byAuthId.get(l.login_activity_user_id) ?? "unknown"}` : "")
          }))
      ];

      return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    },

    async listComments(
      ref: { projectId?: number; jobId?: string; feedbackId?: string }, limit = 50
    ): Promise<CommentEntry[]> {
      let q = client.from("comments").select(COMMENT_COLUMNS);
      // Exactly one ref, the same rule the CHECK enforces — asking with neither would
      // quietly return every comment in the company.
      if (ref.projectId != null) q = q.eq("project_id", ref.projectId);
      else if (ref.jobId != null) q = q.eq("job_id", ref.jobId);
      else if (ref.feedbackId != null) q = q.eq("feedback_id", ref.feedbackId);
      else throw new Error("listComments needs a projectId, a jobId or a feedbackId.");

      const { data, error } = await q
        // Pinned first — the official answer sits above the discussion (0064). Then
        // newest, which is the order every other thread in the app uses.
        .order("comment_is_pinned", { ascending: false })
        .order("comment_created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      // Internal comments are filtered by the READ POLICY, not here. A client-side
      // filter would mean the rows had already crossed the wire to somebody who may not
      // read them, and the count on the board would have to guess at the same rule.
      return (data as unknown as CommentRow[]).map(toComment);
    },

    async addComment(
      ref: { projectId?: number; jobId?: string; feedbackId?: string },
      body: string,
      mentions: string[] = [],
      standing: { internal?: boolean; stage?: FeedbackStage } = {}
    ): Promise<CommentEntry> {
      if (ref.projectId == null && ref.jobId == null && ref.feedbackId == null) {
        throw new Error("addComment needs a projectId, a jobId or a feedbackId.");
      }
      // The author is NOT sent: comments_stamp_created_by fills it from the session,
      // which is the only version of "who wrote this" a client cannot forge.
      const { data, error } = await client
        .from("comments")
        .insert({
          project_id: ref.projectId ?? null,
          job_id: ref.jobId ?? null,
          feedback_id: ref.feedbackId ?? null,
          comment_body: body,
          // Both refused below admin by guard_comment_standing_on_insert(), so a
          // non-admin sending them gets 42501 rather than a comment that quietly is
          // not what they asked for.
          comment_is_internal: standing.internal ?? false,
          comment_feedback_stage: standing.stage ?? null
        })
        .select(COMMENT_COLUMNS)
        .single();
      if (error) throw error;
      const comment = toComment(data as unknown as CommentRow);

      // The mentions, after the comment exists — they carry its id. A failure here is
      // not allowed to lose the comment somebody just wrote: the text is posted and
      // visible, and the worst case is a notification that did not fire, which is
      // recoverable by saying their name again. Losing the comment is not.
      const named = [...new Set(mentions)];
      if (named.length > 0) {
        const { error: mentionError } = await client
          .from("comment_mentions")
          .insert(named.map(profile_id => ({ comment_id: comment.id, profile_id })));
        if (mentionError) {
          // Said out loud rather than swallowed, so "I tagged her and she never saw it"
          // has an answer.
          throw new Error(
            `Your comment was posted, but the mention did not send: ${mentionError.message}`
          );
        }
      }
      return comment;
    },

    async listMyMentions(limit = 30): Promise<MentionEntry[]> {
      // RLS does the filtering — `read own mentions` compares profile_id to
      // current_profile_id() — so this asks for "mine" without saying whose, and there
      // is no client-side check to forget.
      const { data, error } = await client
        .from("comment_mentions")
        .select(
          "comment_id, comment_mention_read_at, comment_mention_created_at, " +
          "comment:comments!comment_mentions_comment_id_fkey(comment_body, comment_created_at, job_id, project_id, author:profiles!comments_comment_created_by_fkey(profile_full_name))"
        )
        .order("comment_mention_created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;

      type Row = {
        comment_id: string;
        comment_mention_read_at: string | null;
        comment_mention_created_at: string;
        comment: {
          comment_body: string; comment_created_at: string;
          job_id: string | null; project_id: number | null;
          author: { profile_full_name: string | null } | null;
        } | null;
      };
      return ((data ?? []) as unknown as Row[])
        // A mention whose comment is not readable is dropped rather than shown as an
        // empty row: the notification would be a claim about something the reader
        // cannot open.
        .filter(r => r.comment != null)
        .map(r => ({
          commentId: r.comment_id,
          body: r.comment!.comment_body,
          authorName: r.comment!.author?.profile_full_name ?? null,
          at: r.comment!.comment_created_at ?? r.comment_mention_created_at,
          readAt: r.comment_mention_read_at,
          jobId: r.comment!.job_id,
          projectId: r.comment!.project_id
        }));
    },

    async markMentionRead(commentId: string): Promise<void> {
      // No profile_id in the filter, and that is not an oversight: the UPDATE policy
      // restricts the row to the reader's own, so naming it here would add a second
      // place for the same rule to be got wrong.
      const { error } = await client
        .from("comment_mentions")
        .update({ comment_mention_read_at: new Date().toISOString() })
        .eq("comment_id", commentId)
        .is("comment_mention_read_at", null);
      if (error) throw error;
    },

    // ---- creating -------------------------------------------------------
    // The first two methods that actually write. Both are two inserts, and both are
    // deliberately *not* wrapped in a transaction, because PostgREST has no way to
    // offer one — each request is its own transaction. If the second insert fails the
    // first has already committed, so the address is left behind.
    //
    // That is an orphan row, not corruption: an address referenced by nothing, which
    // costs a row and breaks nothing. The alternative is a Postgres function doing both
    // inserts atomically, which is the right answer once creating a project means more
    // than two tables. Worth doing then, not worth the indirection now.
    async createProject(input: NewProject): Promise<Project> {
      const { data: address, error: addressError } = await client
        .from("addresses")
        .insert({
          address_lot_number: input.address.lotNumber ?? null,
          address_street_number: input.address.streetNumber ?? null,
          // Blank normalises to null. `0037` made the street optional so a project can
          // be created at a locality, and `""` would be a street named nothing — which
          // passes the not-null it replaced and reads as `address_precision = 'street'`,
          // which would then let a job be attached to a place with no street.
          address_street_1: emptyToNull(input.address.street1),
          address_street_2: emptyToNull(input.address.street2),
          address_suburb: input.address.suburb,
          address_state: input.address.state ?? "SA",
          address_postcode: input.address.postcode,
          address_council: input.address.council ?? null
        })
        .select("address_id")
        .single();
      if (addressError) throw addressError;

      // A second block on the form means "already renamed": the first address is the
      // immutable original and this one is where the project now is. No history row —
      // the original was never this project's current address for any period.
      const currentId = input.newAddress
        ? await insertAddress(input.newAddress)
        : address.address_id;

      // original_address_id: set explicitly when the pair differs; otherwise left for
      // the database's default_current_address trigger, which is what "it has not moved
      // yet" means.
      const { data, error } = await client
        .from("projects")
        .insert({
          project_original_address_id: input.newAddress ? address.address_id : undefined,
          project_current_address_id: currentId,
          // Left null on the insert: the name is composed below, because it needs the
          // number the sequence has not issued yet.
          project_name: null,
          // Amber, 26 Aug: every new record opens with Acquisition & Development. The
          // project form has no team field, so this is written rather than defaulted.
          project_owning_team: OPENING_TEAM,
          project_type: input.projectType,
          // The total. Given by the form since Amber asked for a box for it, and summed
          // here when the caller does not say — which is the import, where the split is
          // often all there is. `project_lot_split_adds_up` refuses a row where a total
          // and a known split disagree, so the form checks that before it gets here.
          // Null when neither kind is given and no total is passed: "not settled", which
          // is not zero.
          project_proposed_dwellings:
            input.proposedDwellings !== undefined
              ? input.proposedDwellings
              : input.communityTitleLots == null && input.torrensTitleLots == null
                ? null
                : (input.communityTitleLots ?? 0) + (input.torrensTitleLots ?? 0),
          project_community_title_lots: input.communityTitleLots ?? null,
          project_torrens_title_lots: input.torrensTitleLots ?? null,
          project_status: input.status ?? "on_track",
          project_start_date: input.startDate ?? null,
          project_target_completion: input.targetCompletion ?? null
        })
        .select("*")
        .single();
      if (error) throw error;

      /**
       * The name, now that the number exists (Amber, 28 Aug: "project name is the
       * Project number - SUBURB, street address").
       *
       * A second statement rather than a trigger, deliberately. A trigger would have to
       * reach into `addresses` to compose it, and would then be the thing that decides
       * what a project is called — invisible from the app, and re-running on every
       * address change whether or not anybody wanted the name to follow. The rule lives
       * in `projectDisplayName`, one implementation, read by both the form's preview and
       * this write.
       *
       * Composed from the CURRENT address: where the project is, not where it was.
       */
      const named = input.newAddress ?? input.address;
      const street = [named.streetNumber, named.street1].filter(Boolean).join(" ");
      const { data: renamed, error: nameError } = await client
        .from("projects")
        .update({ project_name: projectDisplayName(data.project_id, named.suburb, street) })
        .eq("project_id", data.project_id)
        .select("*")
        .single();
      // A project that exists without its name is still a project. Losing the whole
      // creation because the label did not stick would be the worse failure, so the
      // insert's row is what comes back if the second statement is refused.
      if (nameError) return toProject(data);
      return toProject(renamed);
    },

    async createJob(input: NewJob): Promise<Job> {
      let addressId: string | undefined;

      // No address given is the common case — the job sits at the project's address,
      // and default_current_address fills it in. Only insert one if it differs.
      if (input.address) {
        const { data: address, error: addressError } = await client
          .from("addresses")
          .insert({
            address_res_number: input.address.resNumber ?? null,
            address_lot_number: input.address.lotNumber ?? null,
            address_street_number: input.address.streetNumber ?? null,
            address_street_1: input.address.street1,
            address_street_2: input.address.street2 ?? null,
            address_suburb: input.address.suburb,
            address_state: input.address.state ?? "SA",
            address_postcode: input.address.postcode,
            address_council: input.address.council ?? null
          })
          .select("address_id")
          .single();
        if (addressError) throw addressError;
        addressId = address.address_id;
      } else {
        const { data: project, error: projectError } = await client
          .from("projects")
          .select("project_current_address_id")
          .eq("project_id", input.projectId)
          .single();
        if (projectError) throw projectError;
        addressId = project.project_current_address_id;
      }

      // job_sequence is omitted on purpose — assign_job_sequence() sets it under a lock
      // on the parent project, which is the only thing that stops two people creating
      // jobs at the same moment from both claiming "-03".
      const { data, error } = await client
        .from("jobs")
        .insert({
          project_id: input.projectId,
          job_owning_team: input.owningTeam,
          job_current_address_id: addressId,
          // The first of the five lifecycle phases. 0035 cut the list from nine after
          // Lofty confirmed what the lifecycle actually is, and moved the column from an
          // enum to text with a check — so a wrong value here is a constraint violation
          // naming itself rather than a type error.
          job_stage: input.stage ?? "Acquisition & Development",
          job_status: input.status ?? "on_track",
          // The old job number, when the job already exists elsewhere (Amber, 7 Sep: "you
          // should be able to add a sitebook number as well at the time"). Trimmed and
          // blank-to-null for the reason updateJob gives: the column is unique over
          // non-nulls. Omitted from the row entirely when not given, so the column's own
          // default stands.
          ...(input.jobNumberOld?.trim() ? { job_number_old: input.jobNumberOld.trim() } : {})
        })
        .select("*")
        .single();
      if (error) {
        if (error.code === "23505" && input.jobNumberOld?.trim()) {
          throw new Error(
            `Old job number ${input.jobNumberOld.trim()} is already on another job — search it to see which.`
          );
        }
        throw error;
      }
      return toJob(data);
    },

    /**
     * Split a project into its lots.
     *
     * Each job gets a **copy** of the project's current address with its lot number set,
     * not a pointer at the shared row. That is the whole difference between this and
     * calling createJob n times, and it is what makes "the original address" mean
     * anything: rename the project to 20A Corner Street later and Lot 3 still remembers
     * it was created as Lot 3, Corner Street.
     *
     * `job_sequence` is left to assign_job_sequence(), which takes a lock on the parent
     * project row — so the numbers come out contiguous even though the addresses are
     * inserted first and the jobs one at a time.
     *
     * Not a transaction, because PostgREST gives each request its own. A failure part
     * way through leaves the jobs it already made, which is the right failure for this
     * shape: they are real jobs on a real project, visible immediately, and removable
     * one at a time. Rolling them back would be worse — it would also throw away the
     * numbers, and a number that was issued should not be handed out twice.
     */
    async createJobsFromSplit(input: JobSplit): Promise<Job[]> {

      const { data: project, error: projectError } = await client
        .from("projects")
        .select("project_current_address_id")
        .eq("project_id", input.projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      if (!project) throw new Error(`Project ${input.projectId} does not exist.`);

      const { data: source, error: sourceError } = await client
        .from("addresses")
        .select(ADDRESS_COLUMNS)
        .eq("address_id", project.project_current_address_id)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (!source) throw new Error("That project has no address to copy from.");

      const firstLot = input.startLot ?? 1;

      /**
       * How many were asked for — the list's length when there is one, the count when
       * there is not. Checked BEFORE the list is built, so "99 jobs" is refused as over
       * the limit rather than becoming an empty list refused as "1 or more"; and so a
       * caller cannot send eighty lots past a limit that exists to stop exactly that.
       */
      const requested = input.lots?.length ?? input.count;
      if (!Number.isInteger(requested) || requested < 1) {
        throw new Error("Number of jobs must be a whole number, 1 or more.");
      }
      if (requested > MAX_SPLIT) {
        throw new Error(
          `${requested} jobs is more than this creates at once (limit ${MAX_SPLIT}). ` +
          "Split it into two goes, or check the number is right."
        );
      }

      /**
       * The lots, either as the person named them or generated from a count.
       *
       * Named ones can be "2B" — Lofty's own example — which is why lot numbers are
       * text and why the mapping back from inserted addresses no longer sorts them
       * numerically.
       */
      const lots: { lotNumber: string; jobNumberOld?: string | null; streetNumber?: string | null; titleType?: TitleType | null }[] =
        input.lots?.length
          ? input.lots
          : Array.from({ length: input.count }, (_, i) => ({ lotNumber: String(firstLot + i) }));

      if (lots.some(l => !l.lotNumber.trim())) {
        throw new Error("Every job needs a lot number.");
      }
      /**
       * A lot number is only ever a number (`0106`). The column is an integer, so
       * "2B" would come back as a Postgres cast error naming a type nobody typed —
       * refused here instead, in the words of the thing that is wrong. A typed "Lot 3"
       * is stripped rather than refused: people write the label, and the database can
       * no longer clean it up on their behalf.
       */
      const asLot = (typed: string): number => {
        const bare = typed.trim().replace(/^lot[\s.:#-]*/i, "").trim();
        if (!/^\d+$/.test(bare)) {
          throw new Error(
            `"${typed.trim()}" is not a lot number — a lot number is only digits. ` +
            "A number with a letter or a dash in it is a street number, not a lot."
          );
        }
        return Number(bare);
      };
      const duplicate = lots.find((l, i) => lots.findIndex(o => o.lotNumber === l.lotNumber) !== i);
      if (duplicate) {
        throw new Error(`Lot ${duplicate.lotNumber} is listed twice — each job needs its own lot number.`);
      }

      // address_consolidated is left out: build_consolidated_address() composes it, and
      // a value sent from here would be overwritten anyway — or worse, not be.
      const rows = lots.map(lot => ({
        address_lot_number: asLot(lot.lotNumber),
        /**
         * The lot's own street number, or the project's.
         *
         * THIS WAS HARD-CODED TO NULL, and the comment defending it read: *"A lot has a
         * lot number, not a street number — the street number arrives when the titles
         * do, which is exactly the rename the address history exists for."* True of a
         * lot on a plan of division, and false of the address anybody uses. Amber, 10
         * September: *"jobs are not showing the street number on the address. they are
         * only showing lot number."*
         *
         * It was also the one field the split singled out: street, suburb, state,
         * postcode and council are all copied from the project's address, and the
         * street number alone was thrown away — so a job at 28 Corner Street read
         * "Lot 3, Corner Street, Adelaide SA 5000", an address with no number in it.
         *
         * Inherited rather than invented: the value comes from the project's own
         * address row. A lot that has been given its own number carries it instead,
         * which is the per-lot field on the split dialog. The address history still
         * records the rename when titles issue — that mechanism is untouched.
         */
        address_street_number: emptyToNull(lot.streetNumber ?? null) ?? source.address_street_number,
        address_street_1: source.address_street_1,
        address_street_2: source.address_street_2,
        address_suburb: source.address_suburb,
        address_state: source.address_state,
        address_postcode: source.address_postcode,
        address_council: source.address_council
      }));

      const { data: addresses, error: addressError } = await client
        .from("addresses")
        .insert(rows)
        .select("address_id, address_lot_number");
      if (addressError) throw addressError;

      /**
       * Matched back by lot number, not sorted by it.
       *
       * Insert order is not return order for a bulk insert, so the rows have to be
       * re-identified. This sorted `Number(lot)` — which works for "1, 2, 3" and puts
       * "2B" wherever NaN happens to land, silently pairing a job with another lot's
       * address. Lot numbers are unique within the batch (checked above), so the lot
       * string is the key, and the order is the one the person typed.
       */
      const byLot = new Map((addresses ?? []).map(a => [a.address_lot_number, a.address_id]));

      const created: Job[] = [];
      for (const lot of lots) {
        const addressId = byLot.get(asLot(lot.lotNumber));
        if (!addressId) throw new Error(`Lot ${lot.lotNumber} did not get an address.`);
        const { data, error } = await client
          .from("jobs")
          .insert({
            project_id: input.projectId,
            job_owning_team: input.owningTeam,
            job_current_address_id: addressId,
            // Null rather than "" — the column is unique, and empty strings collide
            // with each other where nulls do not.
            job_number_old: lot.jobNumberOld?.trim() || null,
            // Community or Torrens (0054). Seeded per row by the split dialog from the
            // project's intended mix, and null when nobody has said — a generated batch
            // (the inline row, the create-then-split flow) carries none.
            job_title_type: lot.titleType ?? null,
            job_stage: input.stage ?? "Acquisition & Development",
            job_status: input.status ?? "on_track"
          })
          .select("*")
          .single();
        if (error) {
          // Say how far it got. "duplicate key" on job four of six is a different
          // problem from the same message on job one, and the caller cannot tell
          // without being told.
          throw new Error(
            created.length
              ? `Created ${created.length} of ${lots.length} jobs, then: ${error.message}`
              : error.message
          );
        }
        created.push(toJob(data));
      }
      return created;
    },

    /**
     * RLS decides whether this is allowed; the app only hides the button.
     *
     * A delete that removes no rows is not an error in Postgres — the policy filters it
     * out and the statement succeeds having done nothing. So this counts what came back
     * and says so, or a viewer would click Remove, see no error, and watch the job stay.
     */
    async deleteJob(id: string): Promise<void> {
      const { data, error } = await client
        .from("jobs").delete().eq("job_id", id).select("job_id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error(`Job ${id} was not removed — it no longer exists, or you do not have permission.`);
      }
    },

    /**
     * The write goes to `jobs`; the read-back comes from `job_display`, because that is
     * where the restamped `job_stage_entered_at` and the rest of the card's columns live.
     *
     * Zero rows updated is a refusal, not a success: RLS filters rather than raises on
     * UPDATE, so a viewer's move would otherwise "succeed" against nothing and the board
     * would quietly snap back. The guards that DO raise — manager-only (0038), forwards
     * only (0039) — come through as errors with the database's own sentence, which is
     * better than any message invented here.
     */
    async moveJobStage(id: string, stage: StageName): Promise<Job> {
      const { data: updated, error } = await client
        .from("jobs")
        .update({ job_stage: stage })
        .eq("job_id", id)
        .select("job_id");
      if (error) throw error;
      if (!updated?.length) {
        throw new Error(`Job ${id} was not moved — it no longer exists, or you do not have permission.`);
      }

      const { data, error: readError } = await client
        .from("job_display")
        .select(JOB_COLUMNS)
        .eq("job_id", id)
        .single();
      if (readError) throw readError;
      return toJob(data as unknown as JobRow);
    },

    async updateJob(id: string, patch: JobPatch): Promise<Job> {
      // Only the keys the caller sent — same rule as updateProject: undefined means
      // "not this edit", null (on assigneeId) means "un-assign".
      const row: Record<string, string | null> = {};
      if ("owningTeam" in patch && patch.owningTeam !== undefined) row.job_owning_team = patch.owningTeam;
      if ("assigneeId" in patch) row.job_assignee_id = patch.assigneeId ?? null;
      // Trimmed, and blank becomes null: the column is unique-over-non-nulls, so an
      // empty string would collide with the next empty string where null never does.
      if ("jobNumberOld" in patch) row.job_number_old = patch.jobNumberOld?.trim() || null;
      // Null clears it back to "nobody has said", which is a real answer here.
      if ("titleType" in patch) row.job_title_type = patch.titleType ?? null;
      if (Object.keys(row).length === 0) {
        const { data, error } = await client
          .from("job_display").select(JOB_COLUMNS).eq("job_id", id).single();
        if (error) throw error;
        return toJob(data as unknown as JobRow);
      }

      const { data: updated, error } = await client
        .from("jobs")
        .update(row)
        .eq("job_id", id)
        .select("job_id");
      if (error) {
        if (error.code === "23505" && "jobNumberOld" in patch) {
          throw new Error(
            `Lofty number ${patch.jobNumberOld?.trim()} is already on another job — search it to see which.`
          );
        }
        throw error;
      }
      if (!updated?.length) {
        throw new Error(`Job ${id} was not updated — it no longer exists, or you do not have permission.`);
      }

      const { data, error: readError } = await client
        .from("job_display")
        .select(JOB_COLUMNS)
        .eq("job_id", id)
        .single();
      if (readError) throw readError;
      return toJob(data as unknown as JobRow);
    },

    /** Same shape as moveJobStage: the write to the table, the read-back with embeds. */
    async moveProjectStage(id: number, stage: StageName): Promise<Project> {
      const { data: updated, error } = await client
        .from("projects")
        .update({ project_stage: stage })
        .eq("project_id", id)
        .select("project_id");
      if (error) throw error;
      if (!updated?.length) {
        throw new Error(`Project ${id} was not moved — it no longer exists, or you do not have permission.`);
      }
      return await readProject(id);
    },

    async updateProject(id: number, patch: ProjectPatch): Promise<Project> {
      // Only the keys the caller sent. `undefined` means "not this edit", null means
      // "clear it" — a distinction Object.entries keeps and a spread would flatten.
      const row: Record<string, string | null> = {};
      if ("startDate" in patch) row.project_start_date = patch.startDate ?? null;
      if ("targetCompletion" in patch) row.project_target_completion = patch.targetCompletion ?? null;
      if ("endDate" in patch) row.project_end_date = patch.endDate ?? null;
      if ("sharepointUrl" in patch) row.project_sharepoint_url = emptyToNull(patch.sharepointUrl);
      if ("owningTeam" in patch && patch.owningTeam !== undefined) row.project_owning_team = patch.owningTeam;
      if ("assigneeId" in patch) row.project_assignee_id = patch.assigneeId ?? null;
      if (Object.keys(row).length === 0) return await readProject(id);

      const { data: updated, error } = await client
        .from("projects")
        .update(row)
        .eq("project_id", id)
        .select("project_id");
      if (error) throw error;
      if (!updated?.length) {
        throw new Error(`Project ${id} was not updated — it no longer exists, or you do not have permission.`);
      }
      return await readProject(id);
    },

    async setProjectCurrentAddress(id: number, address: NewAddress): Promise<Project> {
      const addressId = await insertAddress(address);
      // The repoint. guard_original_address leaves the original alone, and the 0042
      // trigger records the outgoing current address's stint in address_history.
      const { data: updated, error } = await client
        .from("projects")
        .update({ project_current_address_id: addressId })
        .eq("project_id", id)
        .select("project_id");
      if (error) throw error;
      if (!updated?.length) {
        throw new Error(`Project ${id} was not updated — it no longer exists, or you do not have permission.`);
      }
      return await readProject(id);
    },

    /**
     * Give a job a new current address (0105).
     *
     * The project half of this has existed since the record page grew an "add another
     * address"; the job half never did, so a job's address was set once at the split
     * and frozen. That is the wrong way round — the job's address is the one that
     * moves, from "Lot 3" to "13 Tester Street" when titles issue, and it is where the
     * res number arrives months into a build.
     *
     * Deliberately the same three lines as `setProjectCurrentAddress`: insert the new
     * address, repoint, read back. Every rule that makes it safe is a trigger rather
     * than a check written here — `guard_original_address` protects the original,
     * `0042` files the outgoing address in `address_history`, and
     * `guard_job_address_is_a_street` refuses a job left at a locality, which is the
     * one a job has and a project does not. Re-implementing any of them here would be
     * a second opinion that can disagree with the database.
     */
    async setJobCurrentAddress(jobNumber: string, address: NewAddress): Promise<Job> {
      const addressId = await insertAddress(address);
      const { data: updated, error } = await client
        .from("jobs")
        .update({ job_current_address_id: addressId })
        .eq("job_id", jobNumber)
        .select("job_id");
      if (error) throw error;
      if (!updated?.length) {
        throw new Error(`Job ${jobNumber} was not updated — it no longer exists, or you do not have permission.`);
      }
      const { data, error: readError } = await client
        .from("job_display").select(JOB_COLUMNS).eq("job_id", jobNumber).single();
      if (readError) throw readError;
      return toJob(data as unknown as JobRow);
    },

    async listAddressHistory(ref: { projectId?: number; jobId?: string }): Promise<AddressHistoryEntry[]> {
      let q = client
        .from("address_history")
        .select("address_history_id, address_history_role, address_history_valid_from, address_history_valid_to, addresses!address_history_address_history_address_id_fkey(address_consolidated)");
      if (ref.projectId != null) q = q.eq("address_history_project_id", ref.projectId);
      else if (ref.jobId != null) q = q.eq("address_history_job_id", ref.jobId);
      else throw new Error("listAddressHistory needs a projectId or a jobId.");

      const { data, error } = await q.order("address_history_valid_to", { ascending: false });
      if (error) throw error;
      type Row = {
        address_history_id: number;
        address_history_role: "original" | "current";
        address_history_valid_from: string;
        address_history_valid_to: string;
        addresses: { address_consolidated: string | null } | null;
      };
      return (data as unknown as Row[]).map(r => ({
        id: r.address_history_id,
        role: r.address_history_role,
        address: r.addresses?.address_consolidated ?? null,
        validFrom: r.address_history_valid_from,
        validTo: r.address_history_valid_to
      }));
    },

    async deleteProject(id: number): Promise<void> {
      const { data, error } = await client
        .from("projects").delete().eq("project_id", id).select("project_id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error(`Project ${id} was not removed — it no longer exists, or you do not have permission.`);
      }
    },

    // ---- lookups --------------------------------------------------------
    /**
     * Three of these are real tables now and two are not, and the honest answers differ.
     *
     * `pipeline_stages` (0029) and `teams` (0026) hold rows, so they are queried. They
     * were answered from a TypeScript seed long after that stopped being necessary, and
     * the seed was right — which is the problem: nothing would have said so if it drifted,
     * and the app and the database disagreed about who owns Working Drawings for weeks
     * without either being wrong enough to notice.
     *
     * `template_milestones` and `property_defs` do not exist. They are Phase C. The seed
     * answered them with a plausible invention — 36 milestones and 11 field definitions
     * that nobody at Lofty wrote — and a plausible invention is the worst of the three
     * options, because it is the one that gets treated as the process and quoted back at
     * people. Empty is the true answer, and the screens say so.
     */
    async listStages(): Promise<Stage[]> {
      const rows = await lifecycleStages();
      return rows.map(r => ({
        // The position, not the uuid. `Stage.id` is a number the app uses only to key a
        // list, and position is the stable small integer the seed already used.
        id: r.pipeline_stage_position,
        name: r.pipeline_stage_name,
        position: r.pipeline_stage_position,
        createdAt: r.pipeline_stage_created_at,
        createdBy: r.pipeline_stage_created_by,
        updatedAt: r.pipeline_stage_updated_at,
        updatedBy: r.pipeline_stage_updated_by
      }));
    },

    /**
     * Every team, retired ones included.
     *
     * Retired teams have to come back: `team_is_active` is false for Commercial,
     * Executive and Admin, and a record still owned by one of them would otherwise render
     * its slug. Pickers filter on `isActive` — that is what the column is for — and the
     * filtering belongs at the point of display rather than here, where it would silently
     * remove rows the caller may need.
     */
    async listTeams(): Promise<Team[]> {
      const { data, error } = await client
        .from("teams")
        .select(TEAM_COLUMNS)
        .order("team_position");
      if (error) throw error;
      return (data ?? []).map(r => ({
        id: r.team_id as TeamId,
        name: r.team_name,
        position: r.team_position,
        isActive: r.team_is_active
      }));
    },

    /**
     * Rename or retire a team (G44). Rename is the whole reason the slug is the key —
     * the label changes, nothing pointing at it does. Retire is a flag, never a delete:
     * the 0026 policy deliberately grants no DELETE, because a deleted team dangles in
     * every job_engaged_teams array that named it. Admin+, per that policy. The
     * jobs-held guard lives in the UI — the database allows retiring a team with jobs
     * (history must stay resolvable); the screen is where "reassign them first" belongs.
     */
    async updateTeam(id: TeamId, patch: { name?: string; isActive?: boolean }): Promise<Team[]> {
      const row: Record<string, string | boolean> = {};
      if (patch.name !== undefined) row.team_name = patch.name;
      if (patch.isActive !== undefined) row.team_is_active = patch.isActive;
      if (Object.keys(row).length === 0) return await repo.listTeams();

      const { data: updated, error } = await db
        .from("teams")
        .update(row)
        .eq("team_id", id)
        .select("team_id");
      if (error) throw error;
      if (!updated?.length) {
        throw new Error(`The team was not updated — editing teams needs admin.`);
      }
      return await repo.listTeams();
    },

    /**
     * Add a team (Amber, 27 Aug). The slug is derived from the name here, once — it is
     * the permanent key, so it is cut at creation and never regenerated; a later rename
     * touches only the label. Position slots after the last active team, below the
     * retired block that 0026 parked at 90+. A duplicate slug is the primary key
     * refusing, reported as the name being taken rather than as a constraint code.
     */
    async createTeam(name: string): Promise<Team[]> {
      const label = name.trim();
      if (!label) throw new Error("A team needs a name.");
      const slug = teamSlug(label);
      if (!slug) throw new Error("The name needs at least one letter or digit.");

      const teams = await repo.listTeams();
      const position =
        Math.max(0, ...teams.filter(t => t.position < 90).map(t => t.position)) + 1;

      const { error } = await db.from("teams").insert({
        team_id: slug,
        team_name: label,
        team_position: position,
        team_is_active: true
      });
      if (error) {
        if (error.code === "23505") {
          throw new Error(`A team with the slug '${slug}' already exists.`);
        }
        if (error.code === "42501") {
          throw new Error("Adding a team needs admin.");
        }
        throw error;
      }
      return await repo.listTeams();
    },

    // ---- saved views (0048) ----------------------------------------------
    // No profile_id is ever sent from here: the policy compares the row's profile_id
    // to current_profile_id(), and the column's default is not set — so the insert
    // below names it from the signed-in profile the repository already holds. Reads
    // need no owner filter either; RLS has already narrowed them to yours.

    async listSavedViews(board: SavedViewBoard): Promise<UserSavedView[]> {
      const { data, error } = await client
        .from("saved_views")
        .select(
          "saved_view_id, saved_view_board, saved_view_name, saved_view_query, saved_view_shared_with_team, profile_id, profiles!saved_views_profile_id_fkey(profile_first_name)"
        )
        .eq("saved_view_board", board)
        .order("saved_view_created_at", { ascending: true });
      if (error) throw error;
      const me = await repo.currentProfile();
      return (data ?? []).map(r => {
        const mine = r.profile_id === me?.id;
        const owner = (r as unknown as { profiles?: { profile_first_name?: string } }).profiles;
        return {
          id: r.saved_view_id,
          board: r.saved_view_board as SavedViewBoard,
          name: r.saved_view_name,
          query: r.saved_view_query,
          sharedWithTeam: r.saved_view_shared_with_team ?? null,
          // Null for your own: you know whose it is, and the name is shorter without it.
          ownerName: mine ? null : owner?.profile_first_name ?? null,
          isMine: mine
        };
      });
    },

    async saveView(board: SavedViewBoard, name: string, query: string): Promise<UserSavedView[]> {
      const label = name.trim();
      if (!label) throw new Error("A saved view needs a name.");
      const me = await repo.currentProfile();
      if (!me) throw new Error("Saving a view needs you to be signed in.");

      const { error } = await client.from("saved_views").insert({
        profile_id: me.id,
        saved_view_board: board,
        saved_view_name: label,
        saved_view_query: query
      });
      if (error) {
        // Insert, not upsert: overwriting a view somebody meant to keep is worse than
        // refusing, and the refusal can name the clash.
        if (error.code === "23505") {
          throw new Error(`You already have a view called "${label}" on this board.`);
        }
        throw error;
      }
      return await repo.listSavedViews(board);
    },

    async deleteSavedView(id: string): Promise<UserSavedView[]> {
      const { data, error } = await client
        .from("saved_views")
        .delete()
        .eq("saved_view_id", id)
        .select("saved_view_board");
      if (error) throw error;
      // RLS makes another person's view unreachable rather than forbidden, so a delete
      // that matched nothing is the only signal that it was not yours (or is gone).
      const board = data?.[0]?.saved_view_board as SavedViewBoard | undefined;
      if (!board) throw new Error("That view was not removed — it no longer exists.");
      return await repo.listSavedViews(board);
    },

    async shareSavedView(id: string, team: TeamId | null): Promise<UserSavedView[]> {
      const { data, error } = await client
        .from("saved_views")
        .update({ saved_view_shared_with_team: team })
        .eq("saved_view_id", id)
        .select("saved_view_board");
      if (error) throw error;
      // The update policy is owner-only, so a teammate's attempt matches nothing at
      // all rather than erroring — which is the only signal that it was not theirs.
      const board = data?.[0]?.saved_view_board as SavedViewBoard | undefined;
      if (!board) throw new Error("That view was not changed — it is not yours to share.");
      return await repo.listSavedViews(board);
    },

    /**
     * Clone a job (0057).
     *
     * Read the source, copy the parts that were asked for, and let the database supply
     * everything that must be new. The address is INSERTED as a fresh row rather than
     * pointed at: two jobs sharing one address row means renaming a lot renames a lot
     * on a job nobody was looking at, which is the fault `addresses` exists to prevent.
     *
     * `job_number_old` carries the source's job number — Amber's instruction, and it
     * costs no schema. One consequence worth knowing: the column is unique and already
     * means "the number this had in the old system", so a source that carries a
     * SiteBook number cannot pass it on. The link back wins, because for a clone of a
     * cancelled job that is the more useful of the two.
     */
    async cloneJob(id: string, copy: CloneOptions): Promise<Job> {
      const source = await repo.getJob(id);
      if (!source) throw new Error(`Job ${id} does not exist, or you cannot see it.`);

      let addressId: string;
      if (copy.address) {
        const { data: from, error: readError } = await client
          .from("addresses")
          .select(ADDRESS_COLUMNS)
          .eq("address_id", source.currentAddressId)
          .single();
        if (readError) throw readError;
        // address_consolidated is generated; sending it would be overwritten, or worse
        // accepted and then disagree with its own parts.
        const { data: made, error: writeError } = await client
          .from("addresses")
          .insert({
            address_res_number: from.address_res_number,
            address_lot_number: from.address_lot_number,
            address_street_number: from.address_street_number,
            address_street_1: from.address_street_1,
            address_street_2: from.address_street_2,
            address_suburb: from.address_suburb,
            address_state: from.address_state,
            address_postcode: from.address_postcode,
            address_council: from.address_council
          })
          .select("address_id")
          .single();
        if (writeError) throw writeError;
        addressId = made.address_id;
      } else {
        // No address of its own: sit at the project's, the same default a job created
        // without one takes.
        const { data: project, error: projectError } = await client
          .from("projects")
          .select("project_current_address_id")
          .eq("project_id", source.projectId)
          .single();
        if (projectError) throw projectError;
        addressId = project.project_current_address_id;
      }

      const { data, error } = await client
        .from("jobs")
        .insert({
          project_id: source.projectId,
          job_current_address_id: addressId,
          // Not copied, ever: the number (the sequence issues it), the stage, the
          // status, the SharePoint folder. See CloneOptions for why each.
          job_owning_team: copy.who ? source.owningTeam : OPENING_TEAM,
          job_assignee_id: copy.who ? source.assigneeId : null,
          job_title_type: copy.titleType ? source.titleType : null,
          job_number_old: source.id,
          job_stage: "Acquisition & Development",
          job_status: "on_track"
        })
        .select("*")
        .single();
      if (error) {
        // The one collision that is not a bug in this code: something already claims
        // the source's number as its old number — most likely the source has been
        // cloned once already.
        if (error.code === "23505") {
          throw new Error(
            `${source.id} has already been cloned — the new job would be the second one ` +
            "claiming it as its old number. Open the existing clone instead."
          );
        }
        throw error;
      }
      return toJob(data);
    },

    /**
     * One record's history — every table (0080).
     *
     * One indexed query: 0080 extracts the job and the project from every audited row at
     * write time, so a job's feed is `activity_audit_job_id = …` across tasks, process
     * runs, property values, comments and the job itself, and a project's feed includes
     * its jobs' rows. The two jsonb-path scans 0058 needed are gone with it.
     */
    async listRecordActivity(
      opts: { projectId?: number; jobId?: string; limit?: number }
    ): Promise<RecordActivity[]> {
      const limit = opts.limit ?? 50;
      let q = client.from("activity_audit").select(AUDIT_COLUMNS);
      if (opts.jobId) q = q.eq("activity_audit_job_id", opts.jobId);
      else if (opts.projectId != null) q = q.eq("activity_audit_project_id", opts.projectId);
      else return [];
      const { data, error } = await q.order("activity_audit_at", { ascending: false }).limit(limit);
      if (error) throw error;
      const rows = ((data ?? []) as unknown as AuditDbRow[]).map(fromAuditRow);

      // Who, and who the values name. Two lookups for the whole feed rather than one
      // per row, and a null when a person is not one we can name — a row written by the
      // import or by a migration has nobody behind it, and saying "Unknown" invents one.
      const [{ byAuth, byProfile }, names] = await Promise.all([resolvePeople(client, rows), resolveSubjects(client, rows)]);
      const lookup: NameLookup = {
        person: id => byProfile.get(id) ?? null,
        actor: sub => byAuth.get(sub) ?? null
      };

      return rows
        // A touch with nothing behind it is dropped rather than shown as "updated".
        .map(r => narrate(r, lookup, names))
        .filter((e): e is RecordActivity => e !== null);
    },

    /**
     * The newest comment on each of these jobs (0059).
     *
     * `.in()` on a list of job numbers, against a view that has already reduced comments
     * to one row per job — so the wire carries sixty rows for a sixty-job board, not
     * every comment ever written on them.
     *
     * Chunked at 200 because the job list rides in the URL as a PostgREST filter, and a
     * whole-portfolio board would otherwise build a request too long to send. Nobody has
     * hit that yet; the chunking is here so the first person who does gets an answer
     * rather than a 414.
     */
    async listLatestUpdates(jobIds: string[]): Promise<Record<string, LatestUpdate>> {
      const out: Record<string, LatestUpdate> = {};
      for (let i = 0; i < jobIds.length; i += 200) {
        const chunk = jobIds.slice(i, i + 200);
        if (!chunk.length) continue;
        const { data, error } = await client
          .from("job_latest_update")
          .select("job_id, latest_comment_body, latest_comment_at, latest_comment_edited_at, latest_comment_author")
          .in("job_id", chunk);
        if (error) throw error;
        for (const r of (data ?? []) as unknown as {
          job_id: string; latest_comment_body: string; latest_comment_at: string;
          latest_comment_edited_at: string | null; latest_comment_author: string | null;
        }[]) {
          out[r.job_id] = {
            jobId: r.job_id,
            body: r.latest_comment_body,
            at: r.latest_comment_at,
            editedAt: r.latest_comment_edited_at,
            author: r.latest_comment_author
          };
        }
      }
      return out;
    },

    /**
     * One job's stage history, oldest first.
     *
     * Every period comes from a single audit row and needs no arithmetic across rows:
     * a transition's `changed_at` is when the old stage ENDED, and the same row's
     * `old_row.job_stage_entered_at` is when it BEGAN. Both are recorded facts. Reading
     * it that way also means a job whose earliest stages happened before anybody was
     * watching still shows them correctly — the entered-at column was being maintained
     * the whole time, whether or not there is an INSERT row to find.
     *
     * The stage the job is in now comes from the job, because it has not ended and no
     * transition row exists for it yet. `job_stage_entered_at` is the same column, read
     * live instead of out of a snapshot.
     */
    async listJobStageHistory(jobId: string): Promise<StagePeriod[]> {
      const { data, error } = await client
        .from("activity_audit")
        .select(AUDIT_COLUMNS)
        .eq("activity_audit_table", "jobs")
        .eq("activity_audit_job_id", jobId)
        .order("activity_audit_at", { ascending: true });
      if (error) throw error;

      const rows = ((data ?? []) as unknown as AuditDbRow[]).map(fromAuditRow);
      const periods: StagePeriod[] = [];
      for (const r of rows) {
        const was = r.old_row?.job_stage;
        const now = r.new_row?.job_stage;
        if (r.operation !== "UPDATE" || !was || was === now) continue;
        const from = (r.old_row?.job_stage_entered_at as string | undefined) ?? null;
        periods.push({
          stage: String(was),
          from,
          to: r.changed_at,
          days: from ? whole_days(from, r.changed_at) : null
        });
      }

      const { data: live, error: liveError } = await client
        .from("job_display")
        .select("job_stage, job_stage_entered_at")
        .eq("job_id", jobId)
        .maybeSingle();
      if (liveError) throw liveError;
      if (live) {
        const from = (live as { job_stage_entered_at: string | null }).job_stage_entered_at;
        periods.push({
          stage: String((live as { job_stage: string }).job_stage),
          from,
          to: null,
          days: from ? whole_days(from, new Date().toISOString()) : null
        });
      }
      return periods;
    },

    // ---- tasks -----------------------------------------------------------

    async listTasks(opts: {
      jobId?: string; projectId?: number; assigneeId?: string; teams?: TeamId[]; all?: boolean;
    }): Promise<TaskEntry[]> {
      let q = client.from("task_display").select(TASK_COLUMNS);
      // Exactly one scope. Asking with none would quietly return every task in the
      // company — the Tasks board's "All tasks" tab does exactly that, which is why
      // `all` exists, but only as an explicit ask rather than the fallthrough.
      if (opts.jobId != null) q = q.eq("job_id", opts.jobId);
      else if (opts.projectId != null) q = q.eq("project_id", opts.projectId);
      else if (opts.assigneeId != null) q = q.eq("task_assignee_id", opts.assigneeId);
      else if (opts.teams != null) q = q.in("task_owning_team", opts.teams);
      else if (opts.all) { /* every task — nothing to filter by */ }
      else throw new Error("listTasks needs a scope: a job, a project, an assignee, a team, or all.");

      const { data, error } = await q
        // Position first because somebody chose it; created_at breaks the tie, so two
        // tasks added at position 0 stay in the order they were typed rather than
        // swapping places between reads. Meaningless across records (the Tasks board
        // sorts itself), harmless as a tiebreak.
        .order("task_position", { ascending: true })
        .order("task_created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as TaskRow[]).map(toTask);
    },

    async createTask(task: NewTask): Promise<TaskEntry> {
      const name = task.name.trim();
      if (!name) throw new Error("Give the task a name first.");
      if ((task.jobId == null) === (task.projectId == null)) {
        throw new Error("A task belongs to exactly one job or one project.");
      }
      const { data, error } = await client
        .from("tasks")
        .insert({
          job_id: task.jobId ?? null,
          project_id: task.projectId ?? null,
          task_name: name,
          task_description: task.description?.trim() || null,
          task_owning_team: task.owningTeam ?? null,
          task_assignee_id: task.assigneeId ?? null,
          task_due_date: task.dueDate ?? null,
          task_scheduled_date: task.scheduledDate ?? null,
          task_is_external: task.isExternal ?? false,
          parent_task_id: task.parentTaskId ?? null,
          task_expected_days: task.expectedDays ?? null,
          task_at_risk_lead_days: task.atRiskLeadDays ?? null
          // No task_created_by: stamp_created_by fills it from the session, which is the
          // only version of "who added this" a client cannot forge.
        })
        .select("task_id")
        .single();
      if (error) throw error;
      return readTask(client, (data as { task_id: string }).task_id);
    },

    async updateTask(id: string, patch: TaskPatch): Promise<TaskEntry> {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.task_name = patch.name.trim();
      if (patch.description !== undefined) row.task_description = patch.description?.trim() || null;
      if (patch.status !== undefined) row.task_status = patch.status;
      if (patch.owningTeam !== undefined) row.task_owning_team = patch.owningTeam;
      if (patch.assigneeId !== undefined) row.task_assignee_id = patch.assigneeId;
      if (patch.dueDate !== undefined) row.task_due_date = patch.dueDate;
      if (patch.scheduledDate !== undefined) row.task_scheduled_date = patch.scheduledDate;
      if (patch.isExternal !== undefined) row.task_is_external = patch.isExternal;
      if (patch.position !== undefined) row.task_position = patch.position;
      if (patch.startedAt !== undefined) row.task_started_at = patch.startedAt;
      if (patch.expectedDays !== undefined) row.task_expected_days = patch.expectedDays;
      if (patch.atRiskLeadDays !== undefined) row.task_at_risk_lead_days = patch.atRiskLeadDays;
      if (patch.parentTaskId !== undefined) row.parent_task_id = patch.parentTaskId;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");

      // `task_completed_at` is deliberately not settable here. stamp_task_completion
      // sets it when the status becomes done and clears it when it stops being done,
      // and tasks_done_has_a_time refuses any row where the two disagree — so the app
      // sends the status and the database keeps the pair honest.
      const { error } = await client.from("tasks").update(row).eq("task_id", id);
      if (error) throw error;
      return readTask(client, id);
    },

    // ---- checklists (0081) ----------------------------------------------
    async listTaskChecklist(opts: { jobId?: string; projectId?: number }): Promise<TaskChecklistItem[]> {
      // The lines of every task on the record in one read, filtered through the task's
      // own parent rather than fetched per task.
      let ids = client.from("tasks").select("task_id");
      if (opts.jobId != null) ids = ids.eq("job_id", opts.jobId);
      else if (opts.projectId != null) ids = ids.eq("project_id", opts.projectId);
      else throw new Error("listTaskChecklist needs a jobId or a projectId.");
      const { data: taskIds, error: idError } = await ids;
      if (idError) throw idError;
      const list = ((taskIds ?? []) as { task_id: string }[]).map(t => t.task_id);
      if (!list.length) return [];
      const { data, error } = await client
        .from("task_checklist_items")
        .select(CHECKLIST_COLUMNS)
        .in("task_id", list)
        .order("task_checklist_item_position", { ascending: true })
        .order("task_checklist_item_created_at", { ascending: true });
      if (error) throw error;
      return (data as unknown as ChecklistRow[]).map(toChecklistItem);
    },

    async addTaskChecklistItem(taskId: string, text: string): Promise<TaskChecklistItem> {
      const clean = text.trim();
      if (!clean) throw new Error("Give the line some words first.");
      const { data, error } = await client
        .from("task_checklist_items")
        .insert({ task_id: taskId, task_checklist_item_text: clean })
        .select(CHECKLIST_COLUMNS)
        .single();
      if (error) throw error;
      return toChecklistItem(data as unknown as ChecklistRow);
    },

    async updateTaskChecklistItem(id: string, patch: { text?: string; isDone?: boolean; position?: number }): Promise<TaskChecklistItem> {
      const row: Record<string, unknown> = {};
      if (patch.text !== undefined) row.task_checklist_item_text = patch.text.trim();
      if (patch.isDone !== undefined) row.task_checklist_item_is_done = patch.isDone;
      if (patch.position !== undefined) row.task_checklist_item_position = patch.position;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");
      const { data, error } = await client
        .from("task_checklist_items").update(row).eq("task_checklist_item_id", id).select(CHECKLIST_COLUMNS).single();
      if (error) throw error;
      return toChecklistItem(data as unknown as ChecklistRow);
    },

    async deleteTaskChecklistItem(id: string): Promise<void> {
      const { error } = await client.from("task_checklist_items").delete().eq("task_checklist_item_id", id);
      if (error) throw error;
    },

    async listProcessTaskChecklist(processId: string): Promise<ProcessTaskChecklistItem[]> {
      const { data, error } = await client
        .from("process_task_checklist_items")
        .select("process_task_checklist_item_id, process_task_id, process_task_checklist_item_position, process_task_checklist_item_text, process_tasks!inner(process_id)")
        .eq("process_tasks.process_id", processId)
        .order("process_task_checklist_item_position", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as unknown as TemplateChecklistRow[]).map(toTemplateChecklistItem);
    },

    async addProcessTaskChecklistItem(processTaskId: string, text: string): Promise<ProcessTaskChecklistItem> {
      const clean = text.trim();
      if (!clean) throw new Error("Give the line some words first.");
      const { data, error } = await client
        .from("process_task_checklist_items")
        .insert({ process_task_id: processTaskId, process_task_checklist_item_text: clean })
        .select("process_task_checklist_item_id, process_task_id, process_task_checklist_item_position, process_task_checklist_item_text")
        .single();
      if (error) throw error;
      return toTemplateChecklistItem(data as unknown as TemplateChecklistRow);
    },

    async updateProcessTaskChecklistItem(id: string, patch: { text?: string; position?: number }): Promise<ProcessTaskChecklistItem> {
      const row: Record<string, unknown> = {};
      if (patch.text !== undefined) row.process_task_checklist_item_text = patch.text.trim();
      if (patch.position !== undefined) row.process_task_checklist_item_position = patch.position;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");
      const { data, error } = await client
        .from("process_task_checklist_items").update(row).eq("process_task_checklist_item_id", id)
        .select("process_task_checklist_item_id, process_task_id, process_task_checklist_item_position, process_task_checklist_item_text").single();
      if (error) throw error;
      return toTemplateChecklistItem(data as unknown as TemplateChecklistRow);
    },

    async deleteProcessTaskChecklistItem(id: string): Promise<void> {
      const { error } = await client.from("process_task_checklist_items").delete().eq("process_task_checklist_item_id", id);
      if (error) throw error;
    },

    async listStageCompletion(target?: RecordTarget): Promise<StageCompletion[]> {
      let q = client.from("stage_completion")
        .select("job_id, project_id, stage, stage_is_current, processes_total, processes_open, milestones_total, milestones_passed, stage_is_complete");
      if (target?.jobId != null) q = q.eq("job_id", target.jobId);
      else if (target?.projectId != null) q = q.eq("project_id", target.projectId);
      const { data, error } = await q;
      if (error) throw error;
      return ((data ?? []) as unknown as {
        job_id: string | null; project_id: number | null; stage: string; stage_is_current: boolean;
        processes_total: number; processes_open: number; milestones_total: number; milestones_passed: number; stage_is_complete: boolean;
      }[]).map(r => ({
        jobId: r.job_id, projectId: r.project_id, stage: r.stage, isCurrent: r.stage_is_current,
        processesTotal: r.processes_total, processesOpen: r.processes_open,
        milestonesTotal: r.milestones_total, milestonesPassed: r.milestones_passed, isComplete: r.stage_is_complete
      }));
    },

    async deleteTask(id: string): Promise<void> {
      const { error } = await client.from("tasks").delete().eq("task_id", id);
      if (error) throw error;
    },

    // ---- bugs and ideas (0052) -------------------------------------------

    /**
     * No `.select()` after the insert, and that is not an oversight.
     *
     * Supabase returns the inserted row by default, which runs the SELECT policy — and
     * that policy is admin-only. Asking for the row back would make every submission
     * fail with "row-level security" for exactly the viewers and users the form exists
     * for, while working perfectly for the admin testing it. Insert only; the toast is
     * the confirmation.
     */
    async submitFeedback(entry: NewFeedback): Promise<string> {
      const title = entry.title.trim();
      if (!title) throw new Error("Give it a one-line summary first.");
      const me = await repo.currentProfile();
      if (!me) throw new Error("Sending this needs you to be signed in.");

      // On behalf of somebody else (0070). `profile_id` becomes the person it is FROM and
      // `feedback_added_by` records who typed it — the split that keeps "Deanna asked for
      // this" and "Amber says Deanna asked for this" from being the same row.
      //
      // The self-case is dropped rather than sent: filing on behalf of yourself is just a
      // report, and the CHECK refuses a row whose adder is its own reporter. Sending it
      // anyway would turn a no-op choice in a dropdown into a failed save.
      const onBehalf = entry.onBehalfOf && entry.onBehalfOf !== me.id ? entry.onBehalfOf : null;

      const { data, error } = await client
        .from("feedback")
        .insert({
          // Ordinarily stamped here, not typed: the with-check compares it to
          // current_profile_id(), so a report is filed under the person filing it. The
          // on-behalf path goes through the second, admin-only policy instead.
          profile_id: onBehalf ?? me.id,
          feedback_added_by: onBehalf ? me.id : null,
          feedback_kind: entry.kind,
          feedback_title: title,
          feedback_detail: entry.detail.trim(),
          feedback_page: entry.page,
          feedback_error_text: entry.errorText?.trim() || null,
          // Captured, never asked for: nobody knows their own browser version, and it is
          // the first thing anybody asks when a bug reproduces for one person only.
          feedback_user_agent: typeof navigator === "undefined" ? null : navigator.userAgent
        })
        // Readable since 0060, and needed: the screenshots hang off this id.
        .select("feedback_id")
        .single();
      if (error) throw error;
      const id = data.feedback_id as string;

      // Uploaded AFTER the row exists, and deliberately not in a transaction with it —
      // there is no such transaction to be had across Postgres and object storage. If an
      // upload fails, the report still stands with the words in it, which is the half
      // worth keeping. The failure is reported rather than swallowed.
      if (entry.screenshots?.length) {
        await attachScreenshots(id, me.id, entry.screenshots);
      }
      return id;
    },

    /**
     * The tracker, read through `feedback_display` (0061) so a board is one query rather
     * than a vote count per card.
     *
     * The attachments come in a second query rather than an embed: `feedback_display` is
     * a view, and PostgREST can only embed through a foreign key — a view has none. Two
     * round trips for a whole board, not two per card.
     */
    async listFeedback(kind?: FeedbackKind): Promise<FeedbackItem[]> {
      let q = client
        .from("feedback_display")
        .select(
          FEEDBACK_DISPLAY_COLUMNS
        )
        .order("feedback_created_at", { ascending: false });
      if (kind) q = q.eq("feedback_kind", kind);
      const { data, error } = await q;
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      const { data: files, error: filesError } = await client
        .from("feedback_attachments")
        .select(
          "feedback_attachment_id, feedback_id, feedback_attachment_path, feedback_attachment_name, feedback_attachment_mime, feedback_attachment_bytes"
        )
        .in("feedback_id", rows.map(r => r.feedback_id))
        .order("feedback_attachment_created_at", { ascending: true });
      if (filesError) throw filesError;

      const byReport = new Map<string, FeedbackAttachment[]>();
      for (const f of files ?? []) {
        const list = byReport.get(f.feedback_id) ?? [];
        list.push({
          id: f.feedback_attachment_id,
          path: f.feedback_attachment_path,
          name: f.feedback_attachment_name || f.feedback_attachment_path,
          mime: f.feedback_attachment_mime ?? "",
          bytes: f.feedback_attachment_bytes ?? 0
        });
        byReport.set(f.feedback_id, list);
      }

      return rows.map(r => toFeedbackItem(r, byReport.get(r.feedback_id) ?? []));
    },

    /**
     * Moving a request along the queue — superadmin, enforced by the trigger.
     *
     * The two refusals look different and both have to be handled. Below admin the UPDATE
     * policy matches no row, so the result is empty and nothing was written. At admin the
     * policy passes and `guard_feedback_stage_change()` raises 42501, which arrives here
     * as a thrown error carrying its own message — the one the person should read.
     */
    async setFeedbackStage(id: string, stage: FeedbackStage, note?: string): Promise<FeedbackItem[]> {
      const { data, error } = await client
        .from("feedback")
        .update({ feedback_stage: stage })
        .eq("feedback_id", id)
        .select("feedback_id");
      if (error) throw error;
      if (!data?.[0]) throw new Error("That did not move — moving a request needs superadmin.");

      // Canny's status update: the move, and the sentence that came with it. Posted
      // after the move and not in place of it — if this fails the request has still
      // moved, which is the half that matters, and the failure is reported.
      if (note?.trim()) {
        await repo.addComment({ feedbackId: id }, note.trim(), [], { stage });
      }
      return await repo.listFeedback();
    },

    async setFeedbackPhase(id: string, phaseId: string | null): Promise<FeedbackItem[]> {
      const { data, error } = await client
        .from("feedback")
        .update({ roadmap_phase_id: phaseId })
        .eq("feedback_id", id)
        .select("feedback_id");
      if (error) throw error;
      if (!data?.[0]) throw new Error("That was not changed — planning a request needs admin.");
      return await repo.listFeedback();
    },

    /**
     * Bug or idea. The same policy as the phase — `admins triage feedback` — and no
     * trigger stands in the way: the kind is not the stage, so `guard_feedback_stage_change`
     * lets it through at admin, which is where re-filing belongs.
     */
    async setFeedbackKind(id: string, kind: FeedbackKind): Promise<FeedbackItem[]> {
      const { data, error } = await client
        .from("feedback")
        .update({ feedback_kind: kind })
        .eq("feedback_id", id)
        .select("feedback_id");
      if (error) throw error;
      if (!data?.[0]) throw new Error("That was not changed — re-filing a request needs admin.");
      return await repo.listFeedback();
    },

    /**
     * A vote, and taking one back.
     *
     * The insert cannot double up — `(feedback_id, profile_id)` is the primary key — so a
     * double click is a duplicate-key error rather than a second vote, and it is treated
     * as "already voted" rather than raised: the person wanted the thumb filled, and it
     * is. 23505 is unique_violation.
     */
    async setFeedbackVote(id: string, voted: boolean): Promise<FeedbackItem> {
      const me = await repo.currentProfile();
      if (!me) throw new Error("Voting needs you to be signed in.");

      if (voted) {
        const { error } = await client
          .from("feedback_votes")
          .insert({ feedback_id: id, profile_id: me.id });
        if (error && error.code !== "23505") throw error;
      } else {
        // Only ever your own row: the DELETE policy says so, and naming the profile here
        // means a mistake matches nothing rather than removing somebody else's vote.
        const { error } = await client
          .from("feedback_votes")
          .delete()
          .eq("feedback_id", id)
          .eq("profile_id", me.id);
        if (error) throw error;
      }

      const { data, error } = await client
        .from("feedback_display")
        .select(
          FEEDBACK_DISPLAY_COLUMNS
        )
        .eq("feedback_id", id)
        .single();
      if (error) throw error;
      // Attachments deliberately not re-read: the vote did not change them, and a second
      // query per click to return the same list is a round trip nobody asked for.
      return toFeedbackItem(data);
    },

    /**
     * The duplicate search behind the report form.
     *
     * `ilike` on title and detail, capped. Not full-text search: `to_tsvector` would
     * need an index and a configuration decision, and it stems — "councils" would find
     * "council", which is good, but "filter" would not find "filtering" without more
     * setup than a typeahead over a few hundred rows can justify. When the tracker is
     * big enough for that to hurt, this is the one method that changes.
     *
     * Merged duplicates are excluded: showing somebody the request that was already
     * folded into another one sends them to the dead end rather than to the live thread.
     */
    async searchFeedback(query: string, limit = 6): Promise<FeedbackItem[]> {
      const q = query.trim();
      if (q.length < 3) return [];
      // Escaped, because % and _ are wildcards in LIKE and a person typing "50%" should
      // search for "50%" rather than for everything.
      const safe = q.replace(/[\\%_]/g, m => "\\" + m);
      const { data, error } = await client
        .from("feedback_display")
        .select(FEEDBACK_DISPLAY_COLUMNS)
        .is("feedback_merged_into_id", null)
        .or(`feedback_title.ilike.%${safe}%,feedback_detail.ilike.%${safe}%`)
        .order("feedback_vote_count", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map(r => toFeedbackItem(r));
    },

    async listFeedbackVoters(id: string): Promise<FeedbackVoter[]> {
      const { data, error } = await client
        .from("feedback_votes")
        .select(
          "profile_id, feedback_vote_at, voter:profiles!feedback_votes_profile_id_fkey(profile_full_name), addedBy:profiles!feedback_votes_feedback_vote_added_by_fkey(profile_full_name)"
        )
        .eq("feedback_id", id)
        .order("feedback_vote_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(r => {
        const row = r as unknown as {
          profile_id: string;
          feedback_vote_at: string;
          voter?: { profile_full_name?: string };
          addedBy?: { profile_full_name?: string };
        };
        return {
          profileId: row.profile_id,
          name: row.voter?.profile_full_name ?? null,
          // Null means they voted for themselves. Rendered as nothing rather than as
          // "added by nobody", which would read as a gap in the record.
          addedByName: row.addedBy?.profile_full_name ?? null,
          at: row.feedback_vote_at
        };
      });
    },

    async addVoteFor(id: string, profileId: string): Promise<FeedbackItem> {
      const me = await repo.currentProfile();
      if (!me) throw new Error("Adding a vote needs you to be signed in.");
      if (me.id === profileId) {
        // The on-behalf policy refuses this outright (added_by must differ from the
        // voter), so it is caught here to say why rather than as a 403.
        throw new Error("That is your own vote — use the thumb.");
      }
      const { error } = await client.from("feedback_votes").insert({
        feedback_id: id,
        profile_id: profileId,
        feedback_vote_added_by: me.id
      });
      // Already voted is not a failure: the person's position is recorded, which is what
      // was wanted. 23505 is unique_violation.
      if (error && error.code !== "23505") throw error;

      const { data, error: readError } = await client
        .from("feedback_display")
        .select(FEEDBACK_DISPLAY_COLUMNS)
        .eq("feedback_id", id)
        .single();
      if (readError) throw readError;
      return toFeedbackItem(data);
    },

    async setFeedbackFollow(id: string, following: boolean): Promise<void> {
      const me = await repo.currentProfile();
      if (!me) throw new Error("Following needs you to be signed in.");
      if (following) {
        const { error } = await client.from("feedback_follows").insert({
          feedback_id: id,
          profile_id: me.id,
          // Seen now: you are looking at it, so following must not immediately light the
          // bell for a move that happened before you arrived.
          feedback_follow_seen_stage_at: new Date().toISOString()
        });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await client
          .from("feedback_follows")
          .delete()
          .eq("feedback_id", id)
          .eq("profile_id", me.id);
        if (error) throw error;
      }
    },

    /**
     * The bell's seventh signal.
     *
     * RLS does the "mine" filtering — the select policy on `feedback_follows` compares
     * profile_id to current_profile_id() — so this asks for follows without saying
     * whose, the same way listMyMentions does. Unseen is computed here from two dates
     * rather than read from a notifications table, because there isn't one: 0065 stores
     * a seen stamp and derives the rest.
     */
    async listMyMovedRequests(): Promise<MovedRequest[]> {
      const { data, error } = await client
        .from("feedback_follows")
        .select(
          "feedback_id, feedback_follow_seen_stage_at, request:feedback!feedback_follows_feedback_id_fkey(feedback_title, feedback_stage, feedback_stage_entered_at)"
        );
      if (error) throw error;

      const rows = (data ?? []) as unknown as {
        feedback_id: string;
        feedback_follow_seen_stage_at: string | null;
        request?: { feedback_title: string; feedback_stage: string; feedback_stage_entered_at: string };
      }[];

      const moved = rows.filter(r =>
        r.request &&
        (r.feedback_follow_seen_stage_at === null ||
         Date.parse(r.request.feedback_stage_entered_at) > Date.parse(r.feedback_follow_seen_stage_at))
      );
      if (moved.length === 0) return [];

      // The note that came with each move, when there was one — read in one query for
      // the whole list rather than one per row.
      const { data: notes } = await client
        .from("comments")
        .select("feedback_id, comment_body, comment_feedback_stage, comment_created_at")
        .in("feedback_id", moved.map(m => m.feedback_id))
        .not("comment_feedback_stage", "is", null)
        .order("comment_created_at", { ascending: false });

      const noteFor = new Map<string, string>();
      for (const n of notes ?? []) {
        // Newest first, so the first one seen per request is the current one.
        if (!noteFor.has(n.feedback_id)) noteFor.set(n.feedback_id, n.comment_body);
      }

      return moved
        .map(r => ({
          id: r.feedback_id,
          title: r.request!.feedback_title,
          stage: r.request!.feedback_stage as FeedbackStage,
          movedAt: r.request!.feedback_stage_entered_at,
          note: noteFor.get(r.feedback_id) ?? null
        }))
        .sort((a, b) => Date.parse(b.movedAt) - Date.parse(a.movedAt));
    },

    async markMoveSeen(id: string): Promise<void> {
      // No profile filter, and that is not an oversight: the UPDATE policy restricts the
      // row to the reader's own, so naming it here would add a second place for the same
      // rule to be got wrong. The same reasoning as markMentionRead.
      const { error } = await client
        .from("feedback_follows")
        .update({ feedback_follow_seen_stage_at: new Date().toISOString() })
        .eq("feedback_id", id);
      if (error) throw error;
    },

    async mergeFeedback(id: string, intoId: string | null): Promise<FeedbackItem[]> {
      const { data, error } = await client
        .from("feedback")
        .update({ feedback_merged_into_id: intoId })
        .eq("feedback_id", id)
        .select("feedback_id");
      // The trigger raises for a chain (23514) and for a non-admin (42501); both arrive
      // here carrying the message the person should read, so neither is rewritten.
      if (error) throw error;
      if (!data?.[0]) throw new Error("That was not merged — merging needs admin.");
      return await repo.listFeedback();
    },

    async setCommentStanding(
      commentId: string, standing: { pinned?: boolean; internal?: boolean }
    ): Promise<void> {
      const row: Record<string, unknown> = {};
      if (standing.pinned !== undefined) row.comment_is_pinned = standing.pinned;
      if (standing.internal !== undefined) row.comment_is_internal = standing.internal;
      if (Object.keys(row).length === 0) return;
      const { error } = await client.from("comments").update(row).eq("comment_id", commentId);
      // guard_comment_standing() raises 42501 below admin — the author's own edit policy
      // would otherwise have let them pin their own comment.
      if (error) throw error;
    },

    async uploadReportImage(input: {
      file: File;
      owner: { kind: "document" | "library"; id: string };
    }): Promise<string> {
      // The same sanitising as attachScreenshots, and for the same reason: a filename
      // arrives from somebody's machine and `../` in an object path is the oldest trick
      // there is. Anything that is not a letter, number, dot or dash becomes a dash, and
      // the uuid in front keeps two files called "site.jpg" apart.
      const safe = input.file.name.replace(/[^a-zA-Z0-9.-]/g, "-").slice(-80) || "image";
      const folder = input.owner.kind === "document" ? "documents" : "library";
      const path = `${folder}/${input.owner.id}/${crypto.randomUUID()}-${safe}`;

      const { error } = await db.storage
        .from(REPORT_IMAGE_BUCKET)
        .upload(path, input.file, { contentType: input.file.type || undefined, upsert: false });
      // Thrown rather than swallowed into a null. An image that silently did not upload
      // is a block that stays empty with nothing saying why — and the two failures worth
      // telling apart, too big and wrong type, both arrive here with their own message.
      if (error) throw error;

      const { data } = db.storage.from(REPORT_IMAGE_BUCKET).getPublicUrl(path);
      if (!data?.publicUrl) throw new Error("The image uploaded but has no public URL.");
      return data.publicUrl;
    },

    async attachmentUrl(path: string): Promise<string | null> {
      const { data, error } = await client.storage
        .from(SCREENSHOT_BUCKET)
        // Long enough to open a card and look at the picture, short enough that a copied
        // URL is not a permanent public link to it.
        .createSignedUrl(path, 300);
      if (error) return null;
      return data?.signedUrl ?? null;
    },

    // ---- the roadmap (0063) ----------------------------------------------

    async listRoadmapPhases(): Promise<RoadmapPhase[]> {
      const { data, error } = await client
        .from("roadmap_phases")
        .select(
          "roadmap_phase_id, roadmap_phase_name, roadmap_phase_summary, roadmap_phase_starts_on, roadmap_phase_ends_on, roadmap_phase_position, roadmap_phase_status"
        )
        .order("roadmap_phase_position", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(r => ({
        id: r.roadmap_phase_id,
        name: r.roadmap_phase_name,
        summary: r.roadmap_phase_summary ?? "",
        startsOn: r.roadmap_phase_starts_on ?? null,
        endsOn: r.roadmap_phase_ends_on ?? null,
        position: r.roadmap_phase_position,
        status: r.roadmap_phase_status as RoadmapPhaseStatus
      }));
    },

    async createRoadmapPhase(input: NewRoadmapPhase): Promise<RoadmapPhase[]> {
      const name = input.name.trim();
      if (!name) throw new Error("A phase needs a name.");
      const existing = await repo.listRoadmapPhases();
      // Appended after the last one. The position index is unique, so this is also the
      // one place a race would show up — as a refusal, which is the right answer.
      const position = existing.reduce((n, p) => Math.max(n, p.position), 0) + 1;
      const { error } = await client.from("roadmap_phases").insert({
        roadmap_phase_name: name,
        roadmap_phase_summary: input.summary?.trim() ?? "",
        roadmap_phase_starts_on: input.startsOn || null,
        roadmap_phase_ends_on: input.endsOn || null,
        roadmap_phase_position: position,
        roadmap_phase_status: input.status ?? "planned"
      });
      if (error) throw error;
      return await repo.listRoadmapPhases();
    },

    async updateRoadmapPhase(id: string, patch: RoadmapPhasePatch): Promise<RoadmapPhase[]> {
      // Only what is being changed is sent, so editing a name cannot blank the dates.
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.roadmap_phase_name = patch.name.trim();
      if (patch.summary !== undefined) row.roadmap_phase_summary = patch.summary;
      if (patch.startsOn !== undefined) row.roadmap_phase_starts_on = patch.startsOn || null;
      if (patch.endsOn !== undefined) row.roadmap_phase_ends_on = patch.endsOn || null;
      if (patch.status !== undefined) row.roadmap_phase_status = patch.status;
      if (Object.keys(row).length === 0) return await repo.listRoadmapPhases();

      const { data, error } = await client
        .from("roadmap_phases")
        .update(row)
        .eq("roadmap_phase_id", id)
        .select("roadmap_phase_id");
      if (error) throw error;
      if (!data?.[0]) throw new Error("That was not saved — changing the roadmap needs superadmin.");
      return await repo.listRoadmapPhases();
    },

    async deleteRoadmapPhase(id: string): Promise<RoadmapPhase[]> {
      const { data, error } = await client
        .from("roadmap_phases")
        .delete()
        .eq("roadmap_phase_id", id)
        .select("roadmap_phase_id");
      if (error) throw error;
      if (!data?.[0]) throw new Error("That was not removed — changing the roadmap needs superadmin.");
      return await repo.listRoadmapPhases();
    },

    /**
     * Moving a phase up or down.
     *
     * The two rows swap positions, and they cannot both be written at once — the position
     * index is unique and immediate, so a straight swap collides halfway through. The
     * park-and-place below is what that constraint forces, and it is the honest cost of
     * having the database refuse two phases in one slot: one of the three writes failing
     * leaves a phase parked at a negative position, which is visible and fixable, rather
     * than two phases silently sharing slot 3.
     */
    async moveRoadmapPhase(id: string, direction: "up" | "down"): Promise<RoadmapPhase[]> {
      const phases = await repo.listRoadmapPhases();
      const i = phases.findIndex(p => p.id === id);
      const j = direction === "up" ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= phases.length) return phases;
      const a = phases[i], b = phases[j];

      const park = -Math.abs(a.position) - 1;
      const write = async (phaseId: string, position: number) => {
        const { data, error } = await client
          .from("roadmap_phases")
          .update({ roadmap_phase_position: position })
          .eq("roadmap_phase_id", phaseId)
          .select("roadmap_phase_id");
        if (error) throw error;
        if (!data?.[0]) throw new Error("That was not moved — changing the roadmap needs superadmin.");
      };
      await write(a.id, park);
      await write(b.id, a.position);
      await write(a.id, b.position);
      return await repo.listRoadmapPhases();
    },

    // ---- the changelog (0063) --------------------------------------------

    async listReleases(): Promise<Release[]> {
      const { data, error } = await client
        .from("releases")
        .select("release_id, release_version, release_name, release_summary, release_shipped_on")
        .order("release_shipped_on", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      if (rows.length === 0) return [];

      // The embed names its constraint. `release_entries` has one foreign key to
      // `feedback` today; naming it costs nothing and is what stops the PGRST201 the day
      // a second one is added — the shape that took sign-in down in August.
      const { data: entries, error: entriesError } = await client
        .from("release_entries")
        .select(
          "release_entry_id, release_id, release_entry_kind, release_entry_summary, feedback_id, release_entry_position, feedback!release_entries_feedback_id_fkey(feedback_title)"
        )
        .in("release_id", rows.map(r => r.release_id))
        .order("release_entry_position", { ascending: true });
      if (entriesError) throw entriesError;

      const byRelease = new Map<string, ReleaseEntry[]>();
      for (const e of entries ?? []) {
        const linked = (e as unknown as { feedback?: { feedback_title?: string } }).feedback;
        const list = byRelease.get(e.release_id) ?? [];
        list.push({
          id: e.release_entry_id,
          kind: e.release_entry_kind as ReleaseEntryKind,
          summary: e.release_entry_summary,
          feedbackId: e.feedback_id ?? null,
          feedbackTitle: linked?.feedback_title ?? null
        });
        byRelease.set(e.release_id, list);
      }

      return rows.map(r => ({
        id: r.release_id,
        version: r.release_version,
        name: r.release_name ?? "",
        summary: r.release_summary ?? "",
        shippedOn: r.release_shipped_on,
        entries: byRelease.get(r.release_id) ?? []
      }));
    },

    async createRelease(input: NewRelease): Promise<Release[]> {
      const version = input.version.trim();
      if (!version) throw new Error("A release needs a version.");
      const lines = input.entries.filter(e => e.summary.trim());
      if (lines.length === 0) throw new Error("A release needs at least one line — otherwise it says nothing.");

      const { data, error } = await client
        .from("releases")
        .insert({
          release_version: version,
          release_name: input.name?.trim() ?? "",
          release_summary: input.summary?.trim() ?? "",
          release_shipped_on: input.shippedOn
        })
        .select("release_id")
        .single();
      if (error) throw error;

      const { error: entriesError } = await client.from("release_entries").insert(
        lines.map((e, i) => ({
          release_id: data.release_id,
          release_entry_kind: e.kind,
          release_entry_summary: e.summary.trim(),
          feedback_id: e.feedbackId ?? null,
          release_entry_position: i
        }))
      );
      // The release row is already in. Left standing rather than rolled back by hand: a
      // release with no lines is visible and fixable, and a "cleanup" delete here would
      // be a second write that can fail too.
      if (entriesError) throw entriesError;
      return await repo.listReleases();
    },

    async deleteRelease(id: string): Promise<Release[]> {
      const { data, error } = await client
        .from("releases")
        .delete()
        .eq("release_id", id)
        .select("release_id");
      if (error) throw error;
      if (!data?.[0]) throw new Error("That was not removed — the changelog needs superadmin.");
      return await repo.listReleases();
    },

    // ---- preferences (0050) ----------------------------------------------
    // Owner-only by RLS, and the row is keyed by the person — so the read needs no
    // filter and the write is an upsert on the primary key.

    async listMyPreferences(): Promise<Record<string, unknown>> {
      const { data, error } = await client
        .from("user_preferences")
        .select("user_preference_payload")
        .maybeSingle();
      if (error) throw error;
      const bag = data?.user_preference_payload;
      return bag && typeof bag === "object" && !Array.isArray(bag)
        ? (bag as Record<string, unknown>)
        : {};
    },

    async saveMyPreferences(patch: Record<string, unknown>): Promise<Record<string, unknown>> {
      const me = await repo.currentProfile();
      if (!me) throw new Error("Saving preferences needs you to be signed in.");
      // Merged here rather than with a jsonb || in SQL, because the caller sends a
      // patch and the row may not exist yet — one upsert covers both, and the merge
      // is over a bag the app already validates on read.
      const current = await repo.listMyPreferences();
      const next = { ...current, ...patch };
      const { error } = await client
        .from("user_preferences")
        .upsert({ profile_id: me.id, user_preference_payload: next }, { onConflict: "profile_id" });
      if (error) throw error;
      return next;
    },

    /**
     * Who picks a job up at each phase, and how long it should take.
     *
     * Both come off `pipeline_stages` rather than a seed, which settles a disagreement:
     * the app said Pre-Construction Admin owned Working Drawings & Contracts and the
     * database said Design. Neither was authoritative, and two sources that disagree are
     * worse than one that is provisional.
     *
     * `expectedDays` is null for all nine, because nobody has set one. It used to render
     * as 10, 14, 12, 90 — numbers written to fill the field, which the Gantt then drew
     * bars against. A blank reads as "not configured"; an invented 14 reads as an SLA.
     */
    async listTemplatePhases(): Promise<TemplatePhase[]> {
      const [stages, teams] = await Promise.all([lifecycleStages(), repo.listTeams()]);
      const nameOf = new Map(teams.map(t => [t.id, t.name]));

      return stages.map(r => ({
        stageId: r.pipeline_stage_position,
        stageName: r.pipeline_stage_name,
        // One owning team per stage in the schema. An array because a phase genuinely can
        // be shared, and widening this later should not be a type change on every caller.
        owningTeamNames: r.pipeline_stage_owning_team
          ? [nameOf.get(r.pipeline_stage_owning_team) ?? r.pipeline_stage_owning_team]
          : [],
        expectedDays: r.pipeline_stage_expected_days,
        atRiskLeadDays: r.pipeline_stage_at_risk_lead_days
      }));
    },

    /**
     * The SLA, per lifecycle stage — expected days in stage and the at-risk lead (0047).
     *
     * Keyed by stage name, the vocabulary every screen already shares. `null` clears —
     * an unset SLA is a real state — and the CHECKs (lead needs an expectation, lead
     * shorter than it) refuse here with their names, shown verbatim by the editor.
     * Superadmin by the 0029 policy: the SLA is part of what the stages ARE.
     */
    async updateStageSla(
      stage: StageName,
      patch: { expectedDays?: number | null; atRiskLeadDays?: number | null }
    ): Promise<TemplatePhase[]> {
      const row: Record<string, number | null> = {};
      if ("expectedDays" in patch) row.pipeline_stage_expected_days = patch.expectedDays ?? null;
      if ("atRiskLeadDays" in patch) row.pipeline_stage_at_risk_lead_days = patch.atRiskLeadDays ?? null;
      if (Object.keys(row).length === 0) return await repo.listTemplatePhases();

      const { data: pipeline, error: pipelineError } = await db
        .from("pipelines")
        .select("pipeline_id")
        .eq("pipeline_key", "build_lifecycle")
        .single();
      if (pipelineError) throw pipelineError;

      const { data: updated, error } = await db
        .from("pipeline_stages")
        .update(row)
        .eq("pipeline_id", pipeline.pipeline_id)
        .eq("pipeline_stage_name", stage)
        .select("pipeline_stage_id");
      if (error) throw error;
      if (!updated?.length) {
        throw new Error(`The ${stage} stage was not updated — editing stage SLAs needs superadmin.`);
      }
      return await repo.listTemplatePhases();
    },

    /**
     * Empty until the process exists.
     *
     * `pipeline_stage_tasks` is specified and not built, and the 36 milestones this used
     * to return — "Slab poured", "Defect walkthrough" — were invented to give the template
     * card something to show. The real ones are the 57-step preconstruction schedule and
     * the process map, both still being revised by Lofty, and both needing a person to map
     * each step to a team before they can be loaded.
     */
    async listTemplateMilestones(): Promise<TemplateMilestone[]> {
      return [];
    },

    /**
     * `property_defs` since 0043. It starts empty — the eleven invented definitions
     * this used to return are the reason it does: five named a stage that does not
     * exist, and nobody could tell a missing field from one never defined. What comes
     * back now is only ever what somebody at Lofty typed in.
     *
     * The team's display name rides the read as an embed, so the table never shows a
     * slug where Setup › Teams shows a name.
     */
    async listPropertyDefs(): Promise<PropertyDef[]> {
      const { data, error } = await client
        .from("property_defs")
        .select(PROPERTY_DEF_COLUMNS)
        .order("property_def_stage")
        .order("property_def_position")
        .order("property_def_label");
      if (error) throw error;
      return (data as unknown as PropertyDefRow[]).map(toPropertyDef);
    },

    async createPropertyDef(input: NewPropertyDef): Promise<PropertyDef> {
      const { data, error } = await client
        .from("property_defs")
        .insert({
          property_def_key: input.key,
          property_def_label: input.label,
          property_def_scope: input.scope,
          property_def_stage: input.stageName,
          property_def_owning_team: input.teamId || null,
          property_def_format: input.format,
          property_def_required: input.required ?? false,
          property_def_automation: emptyToNull(input.automation),
          property_def_position: input.position ?? 0,
          ...(input.restricted != null ? { property_def_restricted: input.restricted } : {}),
          ...(input.createLevel ? { property_def_create_level: input.createLevel } : {}),
          ...(input.readLevel ? { property_def_read_level: input.readLevel } : {}),
          ...(input.updateLevel ? { property_def_update_level: input.updateLevel } : {}),
          ...(input.deleteLevel ? { property_def_delete_level: input.deleteLevel } : {}),
          ...(input.slaDays !== undefined ? { property_def_sla_days: input.slaDays } : {}),
          ...(input.description !== undefined ? { property_def_description: emptyToNull(input.description) } : {})
        })
        .select(PROPERTY_DEF_COLUMNS)
        .single();
      if (error) throw error;
      return toPropertyDef(data as unknown as PropertyDefRow);
    },

    async updatePropertyDef(key: string, patch: PropertyDefPatch): Promise<PropertyDef> {
      const row: Record<string, unknown> = {};
      if ("label" in patch) row.property_def_label = patch.label;
      if ("scope" in patch) row.property_def_scope = patch.scope;
      if ("stageName" in patch) row.property_def_stage = patch.stageName;
      if ("teamId" in patch) row.property_def_owning_team = patch.teamId || null;
      if ("format" in patch) row.property_def_format = patch.format;
      if ("required" in patch) row.property_def_required = patch.required;
      if ("automation" in patch) row.property_def_automation = emptyToNull(patch.automation);
      if ("position" in patch) row.property_def_position = patch.position;
      if ("restricted" in patch) row.property_def_restricted = patch.restricted;
      if ("createLevel" in patch) row.property_def_create_level = patch.createLevel;
      if ("readLevel" in patch) row.property_def_read_level = patch.readLevel;
      if ("updateLevel" in patch) row.property_def_update_level = patch.updateLevel;
      if ("deleteLevel" in patch) row.property_def_delete_level = patch.deleteLevel;
      if ("slaDays" in patch) row.property_def_sla_days = patch.slaDays ?? null;
      if ("isActive" in patch) row.property_def_is_active = patch.isActive;
      if ("description" in patch) row.property_def_description = emptyToNull(patch.description);

      const { data, error } = await client
        .from("property_defs")
        .update(row)
        .eq("property_def_key", key)
        .select(PROPERTY_DEF_COLUMNS)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(`Property ${key} was not updated — it no longer exists, or you do not have permission.`);
      }
      return toPropertyDef(data as unknown as PropertyDefRow);
    },

    async listDictionaryOverrides(): Promise<DictionaryOverride[]> {
      const { data, error } = await client
        .from("dictionary_overrides")
        .select(DICT_OVERRIDE_COLUMNS);
      if (error) throw error;
      return (data as unknown as DictOverrideRow[]).map(toDictOverride);
    },

    async saveDictionaryOverride(
      id: string,
      patch: { friendlyName?: string | null; definition?: string | null; status?: DictionaryOverride["status"] }
    ): Promise<DictionaryOverride> {
      // Upsert with only the fields being changed: PostgREST's ON CONFLICT UPDATE sets
      // only the payload's columns, so retitling cannot blank a definition.
      const row: Record<string, unknown> = { dictionary_override_id: id };
      if ("friendlyName" in patch) row.dictionary_override_friendly_name = emptyToNull(patch.friendlyName);
      if ("definition" in patch) row.dictionary_override_definition = emptyToNull(patch.definition);
      if ("status" in patch) row.dictionary_override_status = patch.status;

      const { data, error } = await client
        .from("dictionary_overrides")
        .upsert(row, { onConflict: "dictionary_override_id" })
        .select(DICT_OVERRIDE_COLUMNS)
        .single();
      if (error) throw error;
      return toDictOverride(data as unknown as DictOverrideRow);
    },

    // ---- the template library and its documents (0094) ------------------------
    //
    // No `profiles` embed on any of these, deliberately: the audit quartet gives both
    // tables two foreign keys to `profiles`, and an unqualified embed of an ambiguous
    // table is the PGRST201 that took sign-in down (verify/embeds.sh, 0080). The ids come
    // back and the screens resolve them against the profile list they already hold.

    async listReportTemplates(opts = {}): Promise<ReportTemplate[]> {
      let q = client.from("report_templates").select(REPORT_TEMPLATE_COLUMNS);
      if (opts.kind) q = q.eq("report_template_kind", opts.kind);
      // RLS has already dropped everybody else's drafts; this drops the caller's OWN
      // unapproved ones, which is a listing choice rather than a permission one — a
      // picker offering the library should not offer a draft nobody has signed off.
      if (opts.includeDrafts === false) q = q.not("report_template_approved_at", "is", null);
      if (!opts.includeInactive) q = q.eq("report_template_is_active", true);
      const { data, error } = await q.order("report_template_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(r => toReportTemplate(r as unknown as ReportTemplateRow));
    },

    async getReportTemplate(id: string): Promise<ReportTemplate | null> {
      const { data, error } = await client
        .from("report_templates")
        .select(REPORT_TEMPLATE_COLUMNS)
        .eq("report_template_id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? toReportTemplate(data as unknown as ReportTemplateRow) : null;
    },

    async createReportTemplate(input: NewReportTemplate): Promise<ReportTemplate> {
      // The approval columns are deliberately absent from this payload. The trigger
      // stamps them from the session — a manager approves by existing, a user's waits —
      // and sending them from the browser would be asking the client what its own
      // permission level is.
      const { data, error } = await client
        .from("report_templates")
        .insert({
          report_template_kind: input.kind,
          report_template_name: input.name,
          report_template_description: input.description ?? null,
          report_template_scope: input.scope ?? "global",
          team_id: input.teamId ?? null,
          report_template_layout: input.layout ?? EMPTY_REPORT_TEMPLATE_LAYOUT
        })
        .select(REPORT_TEMPLATE_COLUMNS)
        .single();
      if (error) throw reportLibraryError(error, input.name);
      return toReportTemplate(data as unknown as ReportTemplateRow);
    },

    // Partial, and it has to be: the builder debounces the name and the layout onto
    // separate saves, so sending both here would blank whichever the caller did not have.
    async updateReportTemplate(id, patch): Promise<ReportTemplate> {
      const payload: Record<string, unknown> = {};
      if (patch.name !== undefined) payload.report_template_name = patch.name;
      if (patch.description !== undefined) payload.report_template_description = patch.description;
      if (patch.scope !== undefined) payload.report_template_scope = patch.scope;
      if (patch.teamId !== undefined) payload.team_id = patch.teamId;
      if (patch.layout !== undefined) payload.report_template_layout = patch.layout;
      if (patch.isActive !== undefined) payload.report_template_is_active = patch.isActive;
      if (!Object.keys(payload).length) {
        const current = await repo.getReportTemplate(id);
        if (!current) throw new Error("That template no longer exists.");
        return current;
      }
      const { data, error } = await client
        .from("report_templates")
        .update(payload)
        .eq("report_template_id", id)
        .select(REPORT_TEMPLATE_COLUMNS);
      if (error) throw reportLibraryError(error, patch.name);
      // RLS turns a refused update into zero rows, not an error. Saying so is the whole
      // difference between "your autosave is being dropped" and silent data loss — and
      // the likeliest cause here is real: an approved entry is no longer its author's.
      if (!data?.length) {
        throw new Error(
          "That was not saved. Once a manager has approved a template it belongs to the library — ask a manager to make the change, or copy it into a document of your own."
        );
      }
      return toReportTemplate(data[0] as unknown as ReportTemplateRow);
    },

    async approveReportTemplate(id: string, approved: boolean): Promise<ReportTemplate> {
      // `now()` versus null is the whole message. The trigger overwrites the timestamp
      // with its own and names the approver from the session, so what is sent here is
      // only ever "approved" or "not" — a client-supplied date could not be trusted and
      // is not read.
      const { data, error } = await client
        .from("report_templates")
        .update({
          report_template_approved_at: approved ? new Date().toISOString() : null,
          report_template_approved_by: approved ? undefined : null
        })
        .eq("report_template_id", id)
        .select(REPORT_TEMPLATE_COLUMNS);
      if (error) throw reportLibraryError(error);
      if (!data?.length) {
        throw new Error("That sign-off did not go through — approving a template is a manager's, and the database refused it.");
      }
      return toReportTemplate(data[0] as unknown as ReportTemplateRow);
    },

    async deleteReportTemplate(id: string): Promise<void> {
      const { data, error } = await client
        .from("report_templates")
        .delete()
        .eq("report_template_id", id)
        .select("report_template_id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That was not removed. An approved library entry is retired rather than deleted — switch it off instead, so the documents made from it still name it.");
      }
    },

    async listReportDocuments(opts = {}): Promise<ReportDocument[]> {
      let q = client.from("report_documents").select(REPORT_DOCUMENT_COLUMNS);
      if (opts.jobId) q = q.eq("job_id", opts.jobId);
      if (opts.projectId != null) q = q.eq("project_id", opts.projectId);
      if (opts.mine) {
        const me = await repo.currentProfile();
        // No profile, no documents of your own — rather than every document, which is
        // what an unfiltered query would have returned for exactly the person the filter
        // exists to protect.
        if (!me) return [];
        q = q.eq("report_document_created_by", me.id);
      }
      const { data, error } = await q.order("report_document_updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(r => toReportDocument(r as unknown as ReportDocumentRow));
    },

    async getReportDocument(id: string): Promise<ReportDocument | null> {
      const { data, error } = await client
        .from("report_documents")
        .select(REPORT_DOCUMENT_COLUMNS)
        .eq("report_document_id", id)
        .maybeSingle();
      if (error) throw error;
      return data ? toReportDocument(data as unknown as ReportDocumentRow) : null;
    },

    async createReportDocument(input: NewReportDocument): Promise<ReportDocument> {
      const { data, error } = await client
        .from("report_documents")
        .insert({
          report_document_title: input.title,
          report_document_layout: input.layout ?? EMPTY_REPORT_TEMPLATE_LAYOUT,
          report_template_id: input.templateId ?? null,
          job_id: input.jobId ?? null,
          project_id: input.projectId ?? null
        })
        .select(REPORT_DOCUMENT_COLUMNS)
        .single();
      if (error) throw reportLibraryError(error, input.title);
      return toReportDocument(data as unknown as ReportDocumentRow);
    },

    async updateReportDocument(id, patch): Promise<ReportDocument> {
      const payload: Record<string, unknown> = {};
      if (patch.title !== undefined) payload.report_document_title = patch.title;
      if (patch.layout !== undefined) payload.report_document_layout = patch.layout;
      if (patch.jobId !== undefined) payload.job_id = patch.jobId;
      if (patch.projectId !== undefined) payload.project_id = patch.projectId;
      if (!Object.keys(payload).length) {
        const current = await repo.getReportDocument(id);
        if (!current) throw new Error("That document no longer exists.");
        return current;
      }
      const { data, error } = await client
        .from("report_documents")
        .update(payload)
        .eq("report_document_id", id)
        .select(REPORT_DOCUMENT_COLUMNS);
      if (error) throw reportLibraryError(error, patch.title);
      if (!data?.length) {
        throw new Error("That document was not saved — it no longer exists, or you do not have permission to edit it.");
      }
      return toReportDocument(data[0] as unknown as ReportDocumentRow);
    },

    async deleteReportDocument(id: string): Promise<void> {
      const { data, error } = await client
        .from("report_documents")
        .delete()
        .eq("report_document_id", id)
        .select("report_document_id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That document was not removed — it no longer exists, or it is somebody else's.");
      }
    },

    /**
     * Make a share link, or replace the one that is there.
     *
     * The snapshot arrives already compiled, from the browser, under this person's own
     * session — which is the whole security design (0095). Nothing is resolved here and
     * nothing is resolved when the link is opened.
     *
     * Passing `passwordHash: null` explicitly clears a password; omitting it keeps
     * whatever is set, so "regenerate the link" does not silently drop protection.
     */
    async shareReportDocument(id: string, input: NewReportDocumentShare): Promise<ReportDocument> {
      const payload: Record<string, unknown> = {
        report_document_share_token: newShareToken(),
        report_document_share_expires_at: input.expiresAt,
        report_document_share_snapshot: input.snapshot
      };
      if (input.passwordHash !== undefined) {
        payload.report_document_share_password_hash = input.passwordHash;
      }
      const { data, error } = await client
        .from("report_documents")
        .update(payload)
        .eq("report_document_id", id)
        .select(REPORT_DOCUMENT_COLUMNS);
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That link was not created — the document no longer exists, or you do not have permission to change it.");
      }
      return toReportDocument(data[0] as unknown as ReportDocumentRow);
    },

    /**
     * Revoke the link. The snapshot stays: "what did we send them" is worth more than the
     * bytes it costs, and 0095's constraint is an implication rather than an equivalence
     * precisely so that it can.
     */
    async unshareReportDocument(id: string): Promise<ReportDocument> {
      const { data, error } = await client
        .from("report_documents")
        .update({
          report_document_share_token: null,
          report_document_share_expires_at: null,
          report_document_share_password_hash: null
        })
        .eq("report_document_id", id)
        .select(REPORT_DOCUMENT_COLUMNS);
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That link was not revoked — the document no longer exists, or you do not have permission to change it.");
      }
      return toReportDocument(data[0] as unknown as ReportDocumentRow);
    },

    // ---- what is filed on a record, and where it lives (0032 / 0103) ------

    /**
     * The documents attached to one record.
     *
     * An embed rather than two round trips: `document_links` has exactly one foreign key
     * to `documents`, so `documents(...)` is unambiguous here — this is not the PGRST201
     * shape that the address embeds are (0036), because that one has TWO keys to the same
     * table and this has one.
     */
    async listRecordDocuments(opts): Promise<RecordDocument[]> {
      let q = client.from("document_links").select(RECORD_DOCUMENT_COLUMNS);
      if (opts.jobId) q = q.eq("job_id", opts.jobId);
      else if (opts.projectId != null) q = q.eq("project_id", opts.projectId);
      // Neither: the caller asked for the documents belonging to no record, and 0032's
      // `document_links_one_parent` makes that row impossible. Answering with EVERY
      // attachment in the company would be the unfiltered-query bug that
      // listReportDocuments' `mine` branch already guards against.
      else return [];
      const { data, error } = await q.order("document_link_created_at", { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .map(r => toRecordDocument(r as unknown as RecordDocumentRow))
        // A link whose document the caller's RLS did not return. Filtered rather than
        // rendered as a blank row: 0032's policies on the two tables are the same today,
        // so this cannot happen — and a row with no name would be the first sign that
        // somebody had narrowed one of them without the other.
        .filter((d): d is RecordDocument => d !== null);
    },

    /**
     * File a document that lives in SharePoint.
     *
     * TWO WRITES, AND THE FIRST ONE MAY FIND RATHER THAN CREATE. `documents_one_row_per_url`
     * says one SharePoint address is one document, so filing the project's contract
     * against a job as well must attach the existing row rather than make a second. The
     * lookup is done first and explicitly rather than by catching the unique violation,
     * because an insert that fails still consumes a sequence and, more to the point, the
     * "already there" case is ordinary rather than exceptional.
     *
     * NOT A TRANSACTION, and that is a real limitation rather than an oversight. PostgREST
     * has no client-side transaction, so a document row can be created and its link then
     * refused — leaving a pointer with no attachments. 0103's reaper does not help there:
     * it fires on DELETE of a link, and no link was ever made. The honest fallback is to
     * report the failure with the document named, which is what the catch below does; the
     * row is then reachable by URL, so refiling it attaches rather than duplicating.
     */
    async addDocumentUrl(input: NewDocumentUrl): Promise<RecordDocument> {
      const url = input.url.trim();
      const name = input.name.trim();
      // Checked here as well as by the constraint, because a constraint's message goes on
      // screen verbatim and "violates check constraint documents_url_is_https" does not
      // tell somebody who pasted a network path what to do instead.
      if (!name) throw new Error("Give the document a name — that is what the list shows.");
      if (!/^https:\/\/\S+$/.test(url)) {
        throw new Error(
          "That does not look like a link. Open the document in SharePoint, copy the address from the browser bar, and paste it here — it starts with https://."
        );
      }
      if (!input.jobId && input.projectId == null) {
        throw new Error("A document has to be filed against a job or a project.");
      }

      const existing = await client
        .from("documents")
        .select("document_id")
        .eq("document_url", url)
        .maybeSingle();
      if (existing.error) throw existing.error;

      let documentId = (existing.data as { document_id: string } | null)?.document_id ?? null;

      if (!documentId) {
        const made = await client
          .from("documents")
          .insert({
            document_name: name,
            document_description: emptyToNull(input.description),
            document_url: url,
            document_category: input.category ?? "other"
          })
          .select("document_id")
          .single();
        if (made.error) throw documentError(made.error);
        documentId = (made.data as { document_id: string }).document_id;
      }

      const link = await client
        .from("document_links")
        .insert({
          document_id: documentId,
          job_id: input.jobId ?? null,
          project_id: input.jobId ? null : input.projectId ?? null
        })
        .select(RECORD_DOCUMENT_COLUMNS)
        .single();
      if (link.error) throw documentError(link.error);

      const filed = toRecordDocument(link.data as unknown as RecordDocumentRow);
      if (!filed) throw new Error("The document was filed but could not be read back.");
      return filed;
    },

    /**
     * Take a document off this record.
     *
     * The link only. 0032: *"detaching is not deleting: the link goes, the file stays"* —
     * and where nothing else points at the document and Lofty holds no bytes for it,
     * 0103's trigger removes the row too, inside this same delete. Nothing in SharePoint
     * is touched either way, which is what the screen says before it asks.
     */
    async removeRecordDocument(linkId: string): Promise<void> {
      const { data, error } = await client
        .from("document_links")
        .delete()
        .eq("document_link_id", linkId)
        .select("document_link_id");
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That document was not removed from this record — it is no longer attached, or you do not have permission.");
      }
    },

    /**
     * Both kinds of document, newest first.
     *
     * Two reads rather than a view over both: `report_documents` and `documents` have
     * different shapes, different delete rules and different reasons to exist, and a UNION
     * view would have to be recreated every time either one changed.
     *
     * A FILED document is joined back to the record it is on, because the panel is the
     * only place it is otherwise reachable and "Site survey" with nothing beside it does
     * not tell you whose site. A document on several records appears once per record,
     * which is right: what changed is the filing, and each one is its own event.
     *
     * `limit` is applied to each read AND to the merge, so a week of filing cannot push
     * every built document off the list.
     *
     * Names are resolved from `listProfiles()` rather than embedded. Both tables carry two
     * foreign keys to profiles (the audit quartet), which is precisely the PGRST201
     * ambiguity `verify/embeds.sh` exists to catch — 0094 records the same decision.
     */
    async listRecentDocuments(opts = {}): Promise<RecentDocument[]> {
      const limit = opts.limit ?? 8;

      const [built, filed, people] = await Promise.all([
        client
          .from("report_documents")
          .select("report_document_id, report_document_title, job_id, project_id, report_document_created_at, report_document_updated_at, report_document_updated_by, report_document_created_by")
          .order("report_document_updated_at", { ascending: false })
          .limit(limit),
        client
          .from("document_links")
          .select(RECORD_DOCUMENT_COLUMNS)
          .order("document_link_created_at", { ascending: false })
          .limit(limit),
        repo.listProfiles()
      ]);
      if (built.error) throw built.error;
      if (filed.error) throw filed.error;

      const nameOf = (id: string | null | undefined) =>
        (id && people.find(p => p.id === id)?.fullName) || null;

      // "Added" only while nothing has touched it since. The two timestamps are set
      // together on insert and the touch trigger moves one of them, so a gap of more than
      // a second means it has genuinely been edited — a tolerance rather than an equality
      // test, because the column default and the trigger do not fire in the same statement
      // and can land a millisecond apart.
      const change = (createdAt: string, updatedAt: string): RecentDocument["change"] =>
        Math.abs(Date.parse(updatedAt) - Date.parse(createdAt)) > 1000 ? "changed" : "added";

      const rows: RecentDocument[] = [
        ...(built.data ?? []).map(r => {
          const d = r as unknown as {
            report_document_id: string; report_document_title: string;
            job_id: string | null; project_id: number | null;
            report_document_created_at: string; report_document_updated_at: string;
            report_document_updated_by: string | null; report_document_created_by: string | null;
          };
          return {
            id: d.report_document_id,
            kind: "built" as const,
            title: d.report_document_title,
            url: null,
            jobId: d.job_id,
            projectId: d.project_id,
            at: d.report_document_updated_at,
            change: change(d.report_document_created_at, d.report_document_updated_at),
            byName: nameOf(d.report_document_updated_by ?? d.report_document_created_by)
          };
        }),
        ...(filed.data ?? [])
          .map(r => toRecordDocument(r as unknown as RecordDocumentRow))
          .filter((d): d is RecordDocument => d !== null)
          .map(d => ({
            // The LINK, not the document: the same contract filed on a project and on a
            // job is two events on this list, and two rows sharing a React key would have
            // one of them silently disappear.
            id: d.linkId,
            kind: "filed" as const,
            title: d.name,
            url: d.url,
            jobId: d.jobId,
            projectId: d.projectId,
            // When it was filed HERE. A document uploaded in July and attached to this job
            // today is news today, and its own updated_at would sort it out of sight.
            at: d.attachedAt,
            change: "added" as const,
            byName: nameOf(d.createdBy)
          }))
      ];

      return rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
    },

    /**
     * The header's search, across six kinds at once.
     *
     * SIX QUERIES IN PARALLEL, NOT ONE. A single `search_everything` view over six tables
     * would need a UNION whose column list is the widest of them, recreated every time
     * any one changes, and — because each table's RLS differs — a `security_invoker`
     * chain nobody could reason about. Six narrow reads under the caller's own session
     * keep each table's own policy doing its own job, which is the same argument 0103
     * makes for not merging document links into report_documents.
     *
     * EVERY TERM MUST APPEAR, WHICH IS WHY THE FILTERS ARE CHAINED. Each `.or()` is one
     * term across that table's searchable columns; PostgREST ANDs the top-level filters
     * together, so "brodie court" is (brodie somewhere) AND (court somewhere). An OR
     * across terms would widen the result the moment somebody typed a second word, which
     * is the opposite of what they were doing — the same rule `matchesTerms` follows for
     * the in-page search, deliberately, so the two never disagree about what matches.
     *
     * Three terms at most. Beyond that the filter string grows past what a URL should
     * carry, and nobody narrows a search four words at a time.
     */
    async search(query: string, opts = {}): Promise<SearchHit[]> {
      const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
      // One character matches most of the database. The caller debounces; this is the
      // floor that makes a stray keystroke free rather than a six-query round trip.
      if (!terms.length || query.trim().length < 2) return [];
      const limit = opts.limit ?? 6;
      const raw = query.trim();

      /** One term, across several columns — the OR half of the AND-of-ORs above. */
      const anyOf = (columns: string[], term: string) =>
        columns.map(c => `${c}.ilike.${ilike(term)}`).join(",");

      let jobQ = client
        .from("job_display")
        .select("job_id, project_id, job_number_old, job_stage, job_owning_team, job_current_address, job_original_address")
        .limit(limit);
      for (const t of terms) {
        jobQ = jobQ.or(anyOf(["job_id", "job_number_old", "job_current_address", "job_original_address"], t));
      }

      let projectQ = client
        .from("project_display")
        .select("project_id, project_name, project_status, project_current_address, project_original_address")
        .limit(limit);
      for (const t of terms) {
        const parts = [anyOf(["project_name", "project_current_address", "project_original_address"], t)];
        // `project_id` is an integer and PostgREST will not ilike one, so a numeric term
        // is matched exactly instead. Without this, typing a project number found the
        // project only if its address happened to contain the digits.
        if (/^\d+$/.test(t)) parts.push(`project_id.eq.${Number(t)}`);
        projectQ = projectQ.or(parts.join(","));
      }

      let builtQ = client
        .from("report_documents")
        .select("report_document_id, report_document_title, job_id, project_id")
        .limit(limit);
      for (const t of terms) builtQ = builtQ.or(anyOf(["report_document_title"], t));

      // The FILED documents (0032). Searched on the document rather than on its links, so
      // a contract on a project and on three of its jobs is one hit rather than four of
      // the same name — the panel on the record is where you pick which copy you meant.
      let filedQ = client
        .from("documents")
        .select("document_id, document_name, document_description, document_url, document_category, document_storage_path")
        .limit(limit);
      for (const t of terms) filedQ = filedQ.or(anyOf(["document_name", "document_description"], t));

      // Contacts, companies and maintenance go through their own list methods rather
      // than a query written again here: each already has a search that knows which of
      // its columns are worth matching, and two copies of that would drift.
      const [jobs, projects, built, filed, contacts, companies, requests] = await Promise.all([
        jobQ,
        projectQ,
        builtQ,
        filedQ,
        repo.listContacts({ search: raw }),
        repo.listCompanies({ search: raw }),
        repo.listMaintenanceRequests({ search: raw, queue: "all", limit })
      ]);
      if (jobs.error) throw jobs.error;
      if (projects.error) throw projects.error;
      if (built.error) throw built.error;
      if (filed.error) throw filed.error;

      const hits: SearchHit[] = [];

      for (const r of (jobs.data ?? []) as unknown as {
        job_id: string; project_id: number; job_number_old: string | null;
        job_stage: string | null; job_owning_team: string | null;
        job_current_address: string | null; job_original_address: string | null;
      }[]) {
        hits.push({
          kind: "job",
          id: r.job_id,
          title: r.job_current_address ?? r.job_id,
          detail: [r.job_id, r.job_stage].filter(Boolean).join(" · ") || null,
          href: `/jobs/${encodeURIComponent(r.job_id)}`,
          onPreviousAddress:
            matchedAddress(r.job_current_address, r.job_original_address, terms) === "original"
        });
      }

      for (const r of (projects.data ?? []) as unknown as {
        project_id: number; project_name: string | null; project_status: string | null;
        project_current_address: string | null; project_original_address: string | null;
      }[]) {
        hits.push({
          kind: "project",
          id: String(r.project_id),
          title: r.project_current_address ?? r.project_name ?? `Project ${r.project_id}`,
          detail: `Project ${r.project_id}`,
          href: `/projects/${r.project_id}`,
          onPreviousAddress:
            matchedAddress(r.project_current_address, r.project_original_address, terms) === "original"
        });
      }

      for (const c of contacts.slice(0, limit)) {
        hits.push({
          kind: "contact",
          id: c.id,
          title: c.fullName,
          detail: c.companyName ?? c.primaryEmail ?? null,
          href: `/contacts?person=${encodeURIComponent(c.id)}`
        });
      }

      for (const c of companies.slice(0, limit)) {
        hits.push({
          kind: "company",
          id: c.id,
          title: c.name,
          detail: c.tradingName ?? null,
          href: `/contacts?tab=companies&company=${encodeURIComponent(c.id)}`
        });
      }

      for (const m of requests.slice(0, limit)) {
        hits.push({
          kind: "maintenance",
          id: m.id,
          title: m.summary,
          detail: [m.number, m.jobAddress].filter(Boolean).join(" · ") || null,
          // `queue=all` so a closed request found by search actually renders. Without it
          // the page opens on the open queue and the row the link names is filtered out,
          // which reads as a broken link rather than as a filter.
          href: `/maintenance?queue=all&request=${encodeURIComponent(m.id)}`
        });
      }

      for (const r of (built.data ?? []) as unknown as {
        report_document_id: string; report_document_title: string;
        job_id: string | null; project_id: number | null;
      }[]) {
        hits.push({
          kind: "document",
          id: r.report_document_id,
          title: r.report_document_title,
          detail: r.job_id ?? (r.project_id != null ? `Project ${r.project_id}` : null),
          href: `/tools/document-builder?open=${encodeURIComponent(r.report_document_id)}`
        });
      }

      for (const r of (filed.data ?? []) as unknown as {
        document_id: string; document_name: string; document_description: string | null;
        document_url: string | null; document_category: string;
        document_storage_path: string | null;
      }[]) {
        // A document with a URL opens where it lives — there is no screen in this app that
        // renders one, and routing somebody to a record and making them find the row again
        // is a worse answer than opening the thing they searched for.
        //
        // One WITHOUT a URL is 0032's other two states: an upload, or a document Lofty is
        // still waiting on. Neither has anywhere to go yet — the upload viewer is not
        // built and a document that has not arrived has no destination at all — so those
        // are left out rather than offered as a row that does nothing when clicked.
        if (!r.document_url) continue;
        hits.push({
          kind: "document",
          id: r.document_id,
          title: r.document_name,
          detail: r.document_category === "other" ? r.document_description : r.document_category,
          href: r.document_url,
          external: true
        });
      }

      return hits;
    },

    /**
     * Record that a document has been saved into SharePoint, and stop it being a draft.
     *
     * `published_at` is sent as a value the trigger then OVERWRITES with `now()` — it has
     * to be non-null for the guard to recognise a publication, and the guard refuses to
     * take the caller's word for when. `published_by` is not sent at all: it is read from
     * the session, the same rule as every other "who did this" column in this schema.
     *
     * A re-publish after an edit is the same call. There is deliberately no separate
     * method for it: from here the two are indistinguishable, and the only thing that
     * differs — whether a URL was already there — is something the DIALOG uses to
     * pre-fill, not something the write needs to know.
     */
    async publishReportDocument(id: string, input: { url: string }): Promise<ReportDocument> {
      const url = input.url.trim();
      // Checked here as well as by the constraint, because a constraint's message reaches
      // the screen verbatim and "violates check constraint
      // report_documents_published_url_is_https" tells somebody who pasted a network path
      // nothing they can act on.
      if (!/^https:\/\/\S+$/.test(url)) {
        throw new Error(
          "That does not look like a SharePoint address. Save the document into SharePoint, copy the address from the browser bar, and paste it here — it starts with https://."
        );
      }
      const { data, error } = await client
        .from("report_documents")
        .update({
          report_document_published_url: url,
          report_document_published_at: new Date().toISOString()
        })
        .eq("report_document_id", id)
        .select(REPORT_DOCUMENT_COLUMNS);
      if (error) throw error;
      if (!data?.length) {
        throw new Error("That document was not published — it no longer exists, or you do not have permission to change it.");
      }
      return toReportDocument(data[0] as unknown as ReportDocumentRow);
    },

    async deletePropertyDef(key: string): Promise<void> {
      const { data, error } = await client
        .from("property_defs")
        .delete()
        .eq("property_def_key", key)
        .select("property_def_key");
      if (error) throw error;
      if (!data?.length) {
        throw new Error(`Property ${key} was not removed — it no longer exists, or you do not have permission.`);
      }
    }
  };

  return repo;
}

// No editor embed, deliberately: nothing in this schema stamps updated_by (created_by
// is trigger-stamped, but it names the FIRST editor forever). A name that is null or
// wrong is worse than the date alone, so the date alone is what comes back.
const DICT_OVERRIDE_COLUMNS =
  "dictionary_override_id, dictionary_override_friendly_name, dictionary_override_definition, dictionary_override_status, dictionary_override_updated_at";

type DictOverrideRow = {
  dictionary_override_id: string;
  dictionary_override_friendly_name: string | null;
  dictionary_override_definition: string | null;
  dictionary_override_status: DictionaryOverride["status"];
  dictionary_override_updated_at: string;
};

function toDictOverride(r: DictOverrideRow): DictionaryOverride {
  return {
    id: r.dictionary_override_id,
    friendlyName: r.dictionary_override_friendly_name,
    definition: r.dictionary_override_definition,
    status: r.dictionary_override_status,
    updatedAt: r.dictionary_override_updated_at
  };
}

const PROPERTY_DEF_COLUMNS =
  "property_def_key, property_def_label, property_def_scope, property_def_stage, property_def_owning_team, property_def_format, property_def_required, property_def_automation, property_def_position, property_def_restricted, property_def_create_level, property_def_read_level, property_def_update_level, property_def_delete_level, property_def_sla_days, property_def_is_active, property_def_description, property_def_import_ref, teams!property_defs_property_def_owning_team_fkey(team_name)";

type PropertyDefRow = {
  property_def_key: string;
  property_def_label: string;
  property_def_scope: PropertyDef["scope"];
  property_def_stage: string;
  property_def_owning_team: TeamId | null;
  property_def_format: PropertyDef["format"];
  property_def_required: boolean;
  property_def_automation: string | null;
  property_def_position: number;
  property_def_restricted: boolean;
  property_def_create_level: PermissionLevel;
  property_def_read_level: PermissionLevel;
  property_def_update_level: PermissionLevel;
  property_def_delete_level: PermissionLevel;
  property_def_sla_days: number | null;
  property_def_is_active: boolean;
  property_def_description: string | null;
  property_def_import_ref: string | null;
  teams: { team_name: string | null } | null;
};

function toPropertyDef(r: PropertyDefRow): PropertyDef {
  return {
    key: r.property_def_key,
    label: r.property_def_label,
    scope: r.property_def_scope,
    stageName: r.property_def_stage,
    teamId: r.property_def_owning_team,
    teamName: r.property_def_owning_team ? (r.teams?.team_name ?? r.property_def_owning_team) : null,
    format: r.property_def_format,
    required: r.property_def_required,
    automation: r.property_def_automation ?? undefined,
    position: r.property_def_position,
    restricted: r.property_def_restricted,
    createLevel: r.property_def_create_level,
    readLevel: r.property_def_read_level,
    updateLevel: r.property_def_update_level,
    deleteLevel: r.property_def_delete_level,
    slaDays: r.property_def_sla_days,
    isActive: r.property_def_is_active,
    description: r.property_def_description,
    importRef: r.property_def_import_ref
  };
}

// ---------------------------------------------------------------- row mappers
// Postgres is snake_case and the app is camelCase; these are the one place that is
// true. Written by hand rather than generated so the shape mismatch shows up here as a
// type error rather than at runtime as an undefined.

type ProjectRow = {
  project_id: number; project_name: string | null;
  project_original_address_id: string | null; project_current_address_id: string;
  project_type: Project["projectType"]; project_status: Project["status"];
  project_proposed_dwellings: number | null;
  project_community_title_lots: number | null;
  project_torrens_title_lots: number | null;
  project_owning_team: TeamId | null; project_assignee_id: string | null;
  project_start_date: string | null; project_target_completion: string | null;
  project_end_date: string | null;
  project_stage: Project["stage"]; project_stage_entered_at: string;
  project_sharepoint_url: string | null;
  project_created_at: string; project_created_by: string | null;
  project_updated_at: string; project_updated_by: string | null;
  // The embeds above. PostgREST returns an object for a to-one relationship, and null
  // when the row it points at is not readable. `original` is the aliased second embed —
  // two FKs to addresses is the PGRST201 shape, so both name their constraint.
  addresses: { address_consolidated: string | null; address_suburb: string | null; address_council: string | null } | null;
  original: { address_consolidated: string | null } | null;
};

function toProject(r: ProjectRow): Project {
  return {
    // The number IS the id. There is no second identity to carry.
    id: r.project_id,
    name: r.project_name,
    originalAddressId: r.project_original_address_id,
    currentAddressId: r.project_current_address_id,
    // The address as text, resolved by the embed rather than by a second request.
    currentAddress: r.addresses?.address_consolidated ?? null,
    suburb: r.addresses?.address_suburb ?? null,
    council: r.addresses?.address_council ?? null,
    originalAddress: r.original?.address_consolidated ?? null,
    projectType: r.project_type,
    status: r.project_status,
    stage: r.project_stage,
    stageEnteredAt: r.project_stage_entered_at,
    sharepointUrl: r.project_sharepoint_url,
    proposedDwellings: r.project_proposed_dwellings,
    communityTitleLots: r.project_community_title_lots,
    torrensTitleLots: r.project_torrens_title_lots,
    owningTeam: r.project_owning_team,
    assigneeId: r.project_assignee_id,
    startDate: r.project_start_date,
    targetCompletion: r.project_target_completion,
    endDate: r.project_end_date,
    createdAt: r.project_created_at,
    createdBy: r.project_created_by,
    updatedAt: r.project_updated_at,
    updatedBy: r.project_updated_by
  };
}

type JobRow = {
  job_id: string; project_id: number;
  job_sequence: string; job_number_old: string | null;
  job_title_type: Job["titleType"];
  job_original_address_id: string | null; job_current_address_id: string;
  job_status: Job["status"];
  job_stage: StageName; job_stage_entered_at: string;
  job_owning_team: TeamId; job_engaged_teams: TeamId[];
  job_assignee_id: string | null;
  job_sharepoint_url: string | null;
  job_created_at: string; job_created_by: string | null;
  job_updated_at: string; job_updated_by: string | null;
  // Resolved by the view, not present on the table.
  job_current_address: string; job_original_address: string | null;
  project_current_address: string;
  project_sharepoint_url: string | null;
  project_type: Job["projectType"];
  job_council: Job["council"];
};

function toJob(r: JobRow): Job {
  return {
    // '1042-01'. The job number and the key are the same thing now.
    id: r.job_id,
    projectId: r.project_id,
    jobSequence: r.job_sequence,
    jobNumberOld: r.job_number_old,
    titleType: r.job_title_type,
    originalAddressId: r.job_original_address_id,
    currentAddressId: r.job_current_address_id,
    status: r.job_status,
    stage: r.job_stage,
    stageEnteredAt: r.job_stage_entered_at,
    owningTeam: r.job_owning_team,
    engagedTeams: r.job_engaged_teams ?? [],
    assigneeId: r.job_assignee_id,
    sharepointUrl: r.job_sharepoint_url,
    createdAt: r.job_created_at,
    createdBy: r.job_created_by,
    updatedAt: r.job_updated_at,
    updatedBy: r.job_updated_by,
    currentAddress: r.job_current_address,
    originalAddress: r.job_original_address,
    projectCurrentAddress: r.project_current_address,
    // The job's OWN address's council, not its project's — 0108 widened the view for
    // it. Amber, 10 Sep: "the council area still needs to be recorded, but just not in
    // the full address line." It never was in the line; it was simply never read back.
    council: r.job_council,
    projectSharepointUrl: r.project_sharepoint_url,
    // Inherited from the project through the view, never stored on the job. `job_display`
    // has exposed it since 0028; this read simply never asked for it, so every card and
    // every table row rendered {{job_display.project_type}} for a value one column away.
    projectType: r.project_type
  };
}


// --------------------------------- the template library and its documents (0094)

const REPORT_TEMPLATE_COLUMNS =
  "report_template_id, report_template_kind, report_template_name, report_template_description, report_template_scope, team_id, report_template_layout, report_template_approved_at, report_template_approved_by, report_template_is_active, report_template_created_at, report_template_created_by, report_template_updated_at, report_template_updated_by";

// No password hash. It is not in the list, so it cannot arrive by accident when somebody
// adds a column later — `hasSharePassword` below is computed from a boolean the database
// sends instead. A hash in a browser response is a hash somebody can attack offline.
const REPORT_DOCUMENT_COLUMNS =
  "report_document_id, report_document_title, report_document_layout, report_template_id, job_id, project_id, report_document_share_token, report_document_share_expires_at, report_document_has_share_password, report_document_has_share_snapshot, report_document_published_at, report_document_published_by, report_document_published_url, report_document_created_at, report_document_created_by, report_document_updated_at, report_document_updated_by";

type ReportTemplateRow = {
  report_template_id: string;
  report_template_kind: ReportTemplate["kind"];
  report_template_name: string;
  report_template_description: string | null;
  report_template_scope: ReportTemplate["scope"];
  team_id: TeamId | null;
  report_template_layout: ReportTemplateLayout | null;
  report_template_approved_at: string | null;
  report_template_approved_by: string | null;
  report_template_is_active: boolean;
  report_template_created_at: string;
  report_template_created_by: string | null;
  report_template_updated_at: string;
  report_template_updated_by: string | null;
};

/**
 * A LIKE pattern from something a person typed.
 *
 * `%`, `,`, `(` and `)` are stripped rather than escaped: the first two are LIKE
 * wildcards that would turn a typo into "match everything", and the last three are what
 * PostgREST uses to delimit an `or=(…)` filter — a comma in a search term silently
 * becomes a second condition. The same shape, and the same reasoning, as the helper in
 * supabasePartyRepository.ts; it is duplicated rather than exported because a two-line
 * string function shared across modules is a dependency for no benefit.
 */
const ilike = (s: string) => `%${s.replace(/[%_,()]/g, " ").trim()}%`;

/**
 * An attachment with its document embedded — one link row and the file or URL it points at.
 *
 * THE FOREIGN KEY IS NAMED, and the first version of this did not name it on the reasoning
 * that `document_links` has exactly one key to `documents` so there is nothing to
 * disambiguate. `verify/embeds.sh` refused it, and it was right to: `documents` itself
 * carries three foreign keys (two to profiles, one to itself for the supersedes chain), so
 * PostgREST has more than one relationship to weigh and answers PGRST201. That is the same
 * shape that took sign-in down on 21 August, found here by a check rather than by a user.
 */
const RECORD_DOCUMENT_COLUMNS =
  "document_link_id, document_id, job_id, project_id, document_link_created_at, document_link_created_by, documents!document_links_document_id_fkey(document_id, document_name, document_description, document_storage_path, document_url, document_mime_type, document_size_bytes, document_category, document_supersedes_id, document_created_at, document_created_by, document_updated_at, document_updated_by)";

type RecordDocumentRow = {
  document_link_id: string;
  document_id: string;
  job_id: string | null;
  project_id: number | null;
  document_link_created_at: string;
  document_link_created_by: string | null;
  documents: {
    document_id: string;
    document_name: string;
    document_description: string | null;
    document_storage_path: string | null;
    document_url: string | null;
    document_mime_type: string | null;
    document_size_bytes: number | null;
    document_category: DocumentCategory;
    document_supersedes_id: string | null;
    document_created_at: string;
    document_created_by: string | null;
    document_updated_at: string;
    document_updated_by: string | null;
  } | null;
};

/**
 * Null when the embed came back empty — a link whose document the caller's RLS did not
 * return. 0032's policies on the two tables are identical today, so this cannot happen;
 * it returns null rather than a half-built row so that the day somebody narrows one policy
 * without the other, the panel shows one fewer row instead of a nameless one.
 */
function toRecordDocument(r: RecordDocumentRow): RecordDocument | null {
  const d = r.documents;
  if (!d) return null;
  return {
    id: d.document_id,
    linkId: r.document_link_id,
    jobId: r.job_id,
    projectId: r.project_id,
    attachedAt: r.document_link_created_at,
    name: d.document_name,
    description: d.document_description,
    storagePath: d.document_storage_path,
    url: d.document_url,
    mimeType: d.document_mime_type,
    sizeBytes: d.document_size_bytes,
    category: d.document_category,
    supersedesId: d.document_supersedes_id,
    createdAt: d.document_created_at,
    createdBy: r.document_link_created_by ?? d.document_created_by,
    updatedAt: d.document_updated_at,
    updatedBy: d.document_updated_by
  };
}

/**
 * The constraints on `documents` and `document_links` somebody can hit by typing, turned
 * into sentences. Everything else surfaces as it comes: an unexpected error dressed up as
 * a friendly one is how a real fault gets ignored for a week.
 */
function documentError(error: { code?: string; message: string }): Error {
  if (error.code === "23505" && /once_per_/.test(error.message)) {
    return new Error("That document is already filed against this record.");
  }
  if (error.code === "23505") {
    return new Error("That link is already filed under another name. Find it on the record it is on rather than filing it twice.");
  }
  if (error.code === "23514" && /url_is_https/.test(error.message)) {
    return new Error(
      "That does not look like a link. Open the document in SharePoint, copy the address from the browser bar, and paste it here — it starts with https://."
    );
  }
  return error instanceof Error ? error : new Error(error.message);
}

type ReportDocumentRow = {
  report_document_id: string;
  report_document_title: string;
  report_document_layout: ReportTemplateLayout | null;
  report_template_id: string | null;
  job_id: string | null;
  project_id: number | null;
  report_document_share_token: string | null;
  report_document_share_expires_at: string | null;
  // Generated columns (0095). The hash and the snapshot they derive from are deliberately
  // NOT in the select list: one is attackable offline, the other is a whole document on
  // every row of a list nobody is rendering.
  report_document_has_share_password: boolean;
  report_document_has_share_snapshot: boolean;
  report_document_published_at: string | null;
  report_document_published_by: string | null;
  report_document_published_url: string | null;
  report_document_created_at: string;
  report_document_created_by: string | null;
  report_document_updated_at: string;
  report_document_updated_by: string | null;
};

function toReportTemplate(r: ReportTemplateRow): ReportTemplate {
  return {
    id: r.report_template_id,
    kind: r.report_template_kind,
    name: r.report_template_name,
    description: r.report_template_description,
    scope: r.report_template_scope,
    teamId: r.team_id,
    // The column is NOT NULL with a CHECK that `widgets` is an array, so this coalesce is
    // for the type rather than for the data — but it is the one place a malformed row
    // would reach `layout.widgets.map()` and blank the screen, so it stays.
    layout: r.report_template_layout ?? { ...EMPTY_REPORT_TEMPLATE_LAYOUT },
    approvedAt: r.report_template_approved_at,
    approvedBy: r.report_template_approved_by,
    isActive: r.report_template_is_active,
    createdAt: r.report_template_created_at,
    createdBy: r.report_template_created_by,
    updatedAt: r.report_template_updated_at,
    updatedBy: r.report_template_updated_by
  };
}

function toReportDocument(r: ReportDocumentRow): ReportDocument {
  return {
    id: r.report_document_id,
    title: r.report_document_title,
    layout: r.report_document_layout ?? { ...EMPTY_REPORT_TEMPLATE_LAYOUT },
    templateId: r.report_template_id,
    jobId: r.job_id,
    projectId: r.project_id,
    shareToken: r.report_document_share_token,
    shareExpiresAt: r.report_document_share_expires_at,
    hasSharePassword: r.report_document_has_share_password,
    hasShareSnapshot: r.report_document_has_share_snapshot,
    publishedAt: r.report_document_published_at,
    publishedBy: r.report_document_published_by,
    publishedUrl: r.report_document_published_url,
    createdAt: r.report_document_created_at,
    createdBy: r.report_document_created_by,
    updatedAt: r.report_document_updated_at,
    updatedBy: r.report_document_updated_by
  };
}

/**
 * Postgres errors a person can act on.
 *
 * The builder shows `error.message` verbatim, so "duplicate key value violates unique
 * constraint \"report_templates_one_name_per_kind\"" would go on screen as it stands.
 * Three of these constraints are reachable by typing.
 */
function reportLibraryError(error: { code?: string; message: string }, name?: string): Error {
  if (error.code === "23505") {
    return new Error(
      name
        ? `There is already one called "${name}". The library shares one list of names, so it has to be unique.`
        : "There is already an entry with that name."
    );
  }
  if (error.code === "23514") {
    return new Error("That could not be saved: it needs a name, and a team-wide entry has to name its team.");
  }
  if (error.code === "42501") {
    return new Error("The database refused that. Approving a template is a manager's, and an approved one is no longer its author's to edit.");
  }
  return new Error(error.message);
}
