import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repository, RepositoryMethod } from "./repository";
import type { DictionaryOverride } from "./dictionary";
import { createStubRepository } from "./stubRepository";
import { MAX_SPLIT, OPENING_TEAM } from "./types";
import type {
  ActivityEntry,
  AddressHistoryEntry,
  CommentEntry,
  Job,
  JobPatch,
  JobSplit,
  NewAddress,
  NewProfile,
  NewPropertyDef,
  NewJob,
  NewProject,
  Profile,
  Project,
  ProjectPatch,
  PropertyDef,
  Stage,
  StageName,
  Team,
  TeamId,
  TemplateMilestone,
  TemplatePhase
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
  "listProjects", "getProject", "listJobs", "getJob",
  "createProject", "createJob", "createJobsFromSplit", "deleteJob", "deleteProject",
  "moveJobStage",
  "updateJob",
  "currentProfile", "listProfiles",
  "createProfile", "updateProfile", "setProfileActive", "listActivity",
  "listComments", "addComment", "updateProject", "moveProjectStage",
  "setProjectCurrentAddress", "listAddressHistory",
  "listStages", "listTeams", "updateTeam", "listTemplatePhases", "updateStageSla",
  "listPropertyDefs", "createPropertyDef", "updatePropertyDef", "deletePropertyDef",
  "listDictionaryOverrides", "saveDictionaryOverride"
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
  "profile_id, profile_auth_user_id, profile_first_name, profile_last_name, profile_full_name, profile_email, profile_login_email, profile_job_title, profile_last_login_at, profile_permission, profile_is_active, profile_created_at, profile_created_by, profile_updated_at, profile_updated_by, profile_teams!profile_teams_profile_id_fkey(team_id, profile_team_role)";

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
  "project_id, project_name, project_original_address_id, project_current_address_id, project_type, project_status, project_proposed_dwellings, project_owning_team, project_assignee_id, project_start_date, project_target_completion, project_end_date, project_stage, project_stage_entered_at, project_sharepoint_url, project_created_at, project_created_by, project_updated_at, project_updated_by, addresses!projects_project_current_address_id_fkey(address_consolidated, address_suburb, address_council), original:addresses!projects_project_original_address_id_fkey(address_consolidated)";

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
  "job_id, project_id, job_sequence, job_number_old, job_original_address_id, job_current_address_id, job_status, job_stage, job_stage_entered_at, job_owning_team, job_engaged_teams, job_assignee_id, job_sharepoint_url, job_created_at, job_created_by, job_updated_at, job_updated_by, job_current_address, job_original_address, project_current_address, project_sharepoint_url, project_type";

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
 * `comments` points at `profiles` twice (created_by, updated_by), so the author embed
 * names its constraint — the PGRST201 rule, same as everywhere else.
 */
const COMMENT_COLUMNS =
  "comment_id, project_id, job_id, task_id, variation_id, comment_body, parent_comment_id, comment_edited_at, comment_created_at, comment_created_by, comment_updated_at, comment_updated_by, author:profiles!comments_comment_created_by_fkey(profile_full_name)";

type CommentRow = {
  comment_id: string;
  project_id: number | null; job_id: string | null;
  task_id: string | null; variation_id: string | null;
  comment_body: string; parent_comment_id: string | null;
  comment_edited_at: string | null;
  comment_created_at: string; comment_created_by: string | null;
  comment_updated_at: string; comment_updated_by: string | null;
  author: { profile_full_name: string | null } | null;
};

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
    authorName: r.author?.profile_full_name ?? null
  };
}

const ADDRESS_COLUMNS =
  "address_id, address_lot_number, address_street_number, address_street_1, address_street_2, address_suburb, address_state, address_postcode, address_council";

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
  createdAt: r.profile_created_at,
  createdBy: r.profile_created_by,
  updatedAt: r.profile_updated_at,
  updatedBy: r.profile_updated_by,
  // Flattened to slugs: the role rides along in the row but nothing reads it until the
  // permission model lands, and exposing it now would invite a screen to depend on it
  // before the policies that make it mean anything exist.
  teams: (r.profile_teams ?? []).map(t => t.team_id).sort()
});

// The publishable key (`sb_publishable_…`), not the legacy JWT anon key. Both work, and
// both are safe in a client bundle — this key is public by design and RLS is what
// actually protects the data. The publishable one rotates independently of the JWT
// secret, which the legacy anon key does not, so a compromise there does not force a
// re-issue of every token.
//
// Never the service role key. It bypasses RLS entirely, and anything named VITE_* is
// inlined into the JavaScript that ships to the browser.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey) : null;

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
   * Insert one address row and return its id. The same normalisation everywhere: blank
   * strings become null before they can pass a NOT NULL as a street named nothing.
   */
  async function insertAddress(a: NewAddress): Promise<string> {
    const { data, error } = await db
      .from("addresses")
      .insert({
        address_lot_number: emptyToNull(a.lotNumber),
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
          profile_permission: input.permission
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
          .select("id, table_name, operation, changed_at, jwt_sub")
          .in("jwt_sub", authIds).order("changed_at", { ascending: false }).limit(limit),
        client.from("login_activity")
          .select("id, user_id, event_type, occurred_at")
          .in("user_id", authIds).order("occurred_at", { ascending: false }).limit(limit)
      ]);
      if (audit.error) throw audit.error;
      if (logins.error) throw logins.error;

      const entries: ActivityEntry[] = [
        ...((audit.data ?? []) as unknown as { id: number; table_name: string; operation: string; changed_at: string; jwt_sub: string }[])
          .map(a => ({
            id: `audit-${a.id}`,
            kind: "audit" as const,
            at: a.changed_at,
            actorAuthId: a.jwt_sub,
            summary: `${OPERATION_WORDS[a.operation] ?? a.operation} ${a.table_name}`
              + (byAuthId.size > 1 ? ` — ${byAuthId.get(a.jwt_sub) ?? "unknown"}` : "")
          })),
        ...((logins.data ?? []) as unknown as { id: number; user_id: string; event_type: string; occurred_at: string }[])
          .map(l => ({
            id: `login-${l.id}`,
            kind: "login" as const,
            at: l.occurred_at,
            actorAuthId: l.user_id,
            summary: (l.event_type === "SIGNUP" ? "First signed in" : "Signed in")
              + (byAuthId.size > 1 ? ` — ${byAuthId.get(l.user_id) ?? "unknown"}` : "")
          }))
      ];

      return entries.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
    },

    async listComments(ref: { projectId?: number; jobId?: string }, limit = 50): Promise<CommentEntry[]> {
      let q = client.from("comments").select(COMMENT_COLUMNS);
      // Exactly one ref, the same rule the CHECK enforces — asking with neither would
      // quietly return every comment in the company.
      if (ref.projectId != null) q = q.eq("project_id", ref.projectId);
      else if (ref.jobId != null) q = q.eq("job_id", ref.jobId);
      else throw new Error("listComments needs a projectId or a jobId.");

      const { data, error } = await q
        .order("comment_created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data as unknown as CommentRow[]).map(toComment);
    },

    async addComment(ref: { projectId?: number; jobId?: string }, body: string): Promise<CommentEntry> {
      if (ref.projectId == null && ref.jobId == null) {
        throw new Error("addComment needs a projectId or a jobId.");
      }
      // The author is NOT sent: comments_stamp_created_by fills it from the session,
      // which is the only version of "who wrote this" a client cannot forge.
      const { data, error } = await client
        .from("comments")
        .insert({
          project_id: ref.projectId ?? null,
          job_id: ref.jobId ?? null,
          comment_body: body.trim()
        })
        .select(COMMENT_COLUMNS)
        .single();
      if (error) throw error;
      return toComment(data as unknown as CommentRow);
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
          project_name: emptyToNull(input.name),
          // Amber, 26 Aug: every new record opens with Acquisition & Development. The
          // project form has no team field, so this is written rather than defaulted.
          project_owning_team: OPENING_TEAM,
          project_type: input.projectType,
          project_proposed_dwellings: input.proposedDwellings ?? null,
          project_status: input.status ?? "on_track",
          project_start_date: input.startDate ?? null,
          project_target_completion: input.targetCompletion ?? null
        })
        .select("*")
        .single();
      if (error) throw error;
      return toProject(data);
    },

    async createJob(input: NewJob): Promise<Job> {
      let addressId: string | undefined;

      // No address given is the common case — the job sits at the project's address,
      // and default_current_address fills it in. Only insert one if it differs.
      if (input.address) {
        const { data: address, error: addressError } = await client
          .from("addresses")
          .insert({
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
          job_status: input.status ?? "on_track"
        })
        .select("*")
        .single();
      if (error) throw error;
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
      const lots: { lotNumber: string; jobNumberOld?: string | null }[] =
        input.lots?.length
          ? input.lots
          : Array.from({ length: input.count }, (_, i) => ({ lotNumber: String(firstLot + i) }));

      if (lots.some(l => !l.lotNumber.trim())) {
        throw new Error("Every job needs a lot number.");
      }
      const duplicate = lots.find((l, i) => lots.findIndex(o => o.lotNumber === l.lotNumber) !== i);
      if (duplicate) {
        throw new Error(`Lot ${duplicate.lotNumber} is listed twice — each job needs its own lot number.`);
      }

      // address_consolidated is left out: build_consolidated_address() composes it, and
      // a value sent from here would be overwritten anyway — or worse, not be.
      const rows = lots.map(lot => ({
        address_lot_number: lot.lotNumber,
        // A lot has a lot number, not a street number — the street number arrives when
        // the titles do, which is exactly the rename the address history exists for.
        address_street_number: null,
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
        const addressId = byLot.get(lot.lotNumber);
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
      if (error) throw error;
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
          property_def_owning_team: input.teamId,
          property_def_format: input.format,
          property_def_required: input.required ?? false,
          property_def_automation: emptyToNull(input.automation),
          property_def_position: input.position ?? 0
        })
        .select(PROPERTY_DEF_COLUMNS)
        .single();
      if (error) throw error;
      return toPropertyDef(data as unknown as PropertyDefRow);
    },

    async updatePropertyDef(key: string, patch: Partial<Omit<NewPropertyDef, "key">>): Promise<PropertyDef> {
      const row: Record<string, unknown> = {};
      if ("label" in patch) row.property_def_label = patch.label;
      if ("scope" in patch) row.property_def_scope = patch.scope;
      if ("stageName" in patch) row.property_def_stage = patch.stageName;
      if ("teamId" in patch) row.property_def_owning_team = patch.teamId;
      if ("format" in patch) row.property_def_format = patch.format;
      if ("required" in patch) row.property_def_required = patch.required;
      if ("automation" in patch) row.property_def_automation = emptyToNull(patch.automation);
      if ("position" in patch) row.property_def_position = patch.position;

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
  "property_def_key, property_def_label, property_def_scope, property_def_stage, property_def_owning_team, property_def_format, property_def_required, property_def_automation, property_def_position, teams!property_defs_property_def_owning_team_fkey(team_name)";

type PropertyDefRow = {
  property_def_key: string;
  property_def_label: string;
  property_def_scope: PropertyDef["scope"];
  property_def_stage: string;
  property_def_owning_team: TeamId;
  property_def_format: PropertyDef["format"];
  property_def_required: boolean;
  property_def_automation: string | null;
  property_def_position: number;
  teams: { team_name: string | null } | null;
};

function toPropertyDef(r: PropertyDefRow): PropertyDef {
  return {
    key: r.property_def_key,
    label: r.property_def_label,
    scope: r.property_def_scope,
    stageName: r.property_def_stage,
    teamId: r.property_def_owning_team,
    teamName: r.teams?.team_name ?? r.property_def_owning_team,
    format: r.property_def_format,
    required: r.property_def_required,
    automation: r.property_def_automation ?? undefined,
    position: r.property_def_position
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
};

function toJob(r: JobRow): Job {
  return {
    // '1042-01'. The job number and the key are the same thing now.
    id: r.job_id,
    projectId: r.project_id,
    jobSequence: r.job_sequence,
    jobNumberOld: r.job_number_old,
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
    projectSharepointUrl: r.project_sharepoint_url,
    // Inherited from the project through the view, never stored on the job. `job_display`
    // has exposed it since 0028; this read simply never asked for it, so every card and
    // every table row rendered {{job_display.project_type}} for a value one column away.
    projectType: r.project_type
  };
}

