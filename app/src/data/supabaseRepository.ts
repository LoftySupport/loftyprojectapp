import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repository, RepositoryMethod } from "./repository";
import { createStubRepository, SEED_STAGES } from "./stubRepository";
import type {
  ActivityEntry,
  Job,
  NewProfile,
  NewJob,
  NewProject,
  Profile,
  Project,
  PropertyDef,
  Stage,
  Team,
  TemplateCheckpoint,
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
 * The lookups fall back to the seed on error or an empty result, deliberately: a missing
 * table on a fresh project should not leave the board with no columns, the templates
 * page with no phases, or the drawer with no field slots. A half-built database should
 * degrade to the structure, not to a blank screen.
 */

// Add a method name here as you implement it. The Wiring page reads this.
//
// listStages came off this list in 0004. Stages are a `stage` enum now, not a table,
// so there is nothing to query — the values are known at compile time and the seed is
// the source. An enum cannot be wired; it can only be regenerated.
const WIRED: RepositoryMethod[] = [
  "createProject", "createJob", "currentProfile", "listProfiles",
  "createProfile", "updateProfile", "setProfileActive", "listActivity"
];

/**
 * The `profiles` columns this app reads. `full_name` is generated; never written.
 *
 * One string literal rather than a concatenation: postgrest-js parses this at the type
 * level to shape the result, and `"a" + "b"` widens to `string`, which it cannot read.
 */
const PROFILE_COLUMNS =
  "id, auth_user_id, first_name, last_name, full_name, email, login_email, job_title, last_login_at, permission, active, teams, created_at, created_by, updated_at, updated_by";

interface ProfileRow {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  login_email: string | null;
  job_title: string | null;
  last_login_at: string | null;
  permission: Profile["permission"];
  active: boolean;
  /** A `team[]` column since 0022, not an embed — so it is always present. */
  teams: string[] | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

/** Past tense, because the audit log is a record of what happened. */
const OPERATION_WORDS: Record<string, string> = {
  INSERT: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted"
};

/** Re-read after a write, so the caller gets generated columns and teams, not its input. */
async function readProfile(client: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await client
    .from("profiles").select(PROFILE_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return toProfile(data as unknown as ProfileRow);
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  authUserId: r.auth_user_id,
  firstName: r.first_name,
  lastName: r.last_name,
  fullName: r.full_name,
  email: r.email,
  loginEmail: r.login_email,
  jobTitle: r.job_title,
  lastLoginAt: r.last_login_at,
  permission: r.permission,
  active: r.active,
  createdAt: r.created_at,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by,
  // Sorted and deduplicated by the database on write, so it arrives in order and this
  // does not re-sort it. `?? []` covers a select that did not ask for the column.
  teams: r.teams ?? []
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

  return {
    name: "supabase",
    wired: new Set<RepositoryMethod>(WIRED) as ReadonlySet<keyof Repository>,

    // ---- projects -------------------------------------------------------
    async listProjects(): Promise<Project[]> {
      return stub.listProjects();
      // const { data, error } = await client
      //   .from("projects")
      //   .select("id, project_no, current_address_id, project_type, status, created_at")
      //   .order("project_no");
      // if (error) throw error;
      // return (data ?? []).map(toProject);
    },

    async getProject(id: string): Promise<Project | null> {
      return stub.getProject(id);
    },

    // ---- jobs -----------------------------------------------------------
    async listJobs(opts?: { projectId?: string }): Promise<Job[]> {
      return stub.listJobs(opts);
    },

    async getJob(id: string): Promise<Job | null> {
      return stub.getJob(id);
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
        .order("last_name")
        .order("first_name");
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
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();

      if (error || !data) return null;
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
          first_name: input.firstName,
          last_name: input.lastName,
          email: input.email,
          login_email: input.loginEmail,
          job_title: input.jobTitle,
          permission: input.permission,
          teams: input.teams
        })
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw error;

      return toProfile(data as unknown as ProfileRow);
    },

    async updateProfile(id: string, patch: Partial<NewProfile>): Promise<Profile> {
      const row: Record<string, unknown> = {};
      if (patch.firstName !== undefined) row.first_name = patch.firstName;
      if (patch.lastName !== undefined) row.last_name = patch.lastName;
      if (patch.email !== undefined) row.email = patch.email;
      if (patch.loginEmail !== undefined) row.login_email = patch.loginEmail;
      if (patch.jobTitle !== undefined) row.job_title = patch.jobTitle;
      if (patch.permission !== undefined) row.permission = patch.permission;
      // A column now, so it rides the same update as everything else — no second write
      // to keep in step, and no window where the name changed and the teams did not.
      if (patch.teams !== undefined) row.teams = patch.teams;

      if (Object.keys(row).length) {
        const { error } = await client.from("profiles").update(row).eq("id", id);
        if (error) throw error;
      }

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
      const { error } = await client.from("profiles").update({ active }).eq("id", id);
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

      // One query rather than the two the join needed: `contains` is `teams @> {Design}`,
      // which the GIN index in 0022 serves, and it no longer has to switch shape between
      // "filtered by team" and "not".
      let q = client.from("profiles").select("id, auth_user_id, full_name");
      if (opts.profileId) q = q.eq("id", opts.profileId);
      if (opts.team) q = q.contains("teams", [opts.team]);
      const { data: people, error: peopleError } = await q;
      if (peopleError) throw peopleError;

      const rows = (people ?? []) as unknown as { id: string; auth_user_id: string | null; full_name: string }[];
      const byAuthId = new Map(rows.filter(r => r.auth_user_id).map(r => [r.auth_user_id!, r.full_name]));
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
          lot_number: input.address.lotNumber ?? null,
          street_number: input.address.streetNumber ?? null,
          street_1: input.address.street1,
          street_2: input.address.street2 ?? null,
          suburb: input.address.suburb,
          state: input.address.state ?? "SA",
          council: input.address.council ?? null
        })
        .select("id")
        .single();
      if (addressError) throw addressError;

      // original_address_id is left unset: the database's default_current_address
      // trigger points it at the same row, which is what "it has not moved yet" means.
      const { data, error } = await client
        .from("projects")
        .insert({
          current_address_id: address.id,
          project_type: input.projectType,
          status: input.status ?? "on_track",
          start_date: input.startDate ?? null,
          target_completion: input.targetCompletion ?? null
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
            lot_number: input.address.lotNumber ?? null,
            street_number: input.address.streetNumber ?? null,
            street_1: input.address.street1,
            street_2: input.address.street2 ?? null,
            suburb: input.address.suburb,
            state: input.address.state ?? "SA",
            council: input.address.council ?? null
          })
          .select("id")
          .single();
        if (addressError) throw addressError;
        addressId = address.id;
      } else {
        const { data: project, error: projectError } = await client
          .from("projects")
          .select("current_address_id")
          .eq("id", input.projectId)
          .single();
        if (projectError) throw projectError;
        addressId = project.current_address_id;
      }

      // job_sequence is omitted on purpose — assign_job_sequence() sets it under a lock
      // on the parent project, which is the only thing that stops two people creating
      // jobs at the same moment from both claiming "-03".
      const { data, error } = await client
        .from("jobs")
        .insert({
          project_id: input.projectId,
          current_address_id: addressId,
          stage: input.stage ?? "Sales & acquisition",
          status: input.status ?? "on_track"
        })
        .select("*")
        .single();
      if (error) throw error;
      return toJob(data);
    },

    // ---- lookups --------------------------------------------------------
    // Stages and teams are enums as of 0004 (`stage`, `team`), not tables. There is no
    // query to make: PostgREST cannot select from a type, and the values are fixed at
    // migration time rather than maintained as rows. These stay on the seed until the
    // generated Database["public"]["Enums"] types replace it, which is a type change
    // rather than a wiring one.
    async listStages(): Promise<Stage[]> {
      return SEED_STAGES;
    },

    async listTeams(): Promise<Team[]> {
      return stub.listTeams();
    },

    async listTemplatePhases(): Promise<TemplatePhase[]> {
      return stub.listTemplatePhases();
      // Joins template_phases -> stages -> teams; a phase can be owned by more than
      // one team, so this groups rather than mapping one-to-one.
    },

    async listTemplateCheckpoints(): Promise<TemplateCheckpoint[]> {
      return stub.listTemplateCheckpoints();
    },

    async listPropertyDefs(): Promise<PropertyDef[]> {
      return stub.listPropertyDefs();
      // const { data, error } = await client
      //   .from("property_defs")
      //   .select("key, label, scope, format, required, automation, stages(name), teams(name)")
      //   .is("archived_at", null)
      //   .order("position");
      // if (error || !data?.length) return stub.listPropertyDefs();
      // return (data ?? []).map(toPropertyDef);
    }
  };
}

// ---------------------------------------------------------------- row mappers
// Postgres is snake_case and the app is camelCase; these are the one place that is
// true. Written by hand rather than generated so the shape mismatch shows up here as a
// type error rather than at runtime as an undefined.

type ProjectRow = {
  id: string; project_no: number;
  original_address_id: string | null; current_address_id: string;
  project_type: Project["projectType"]; status: Project["status"];
  start_date: string | null; target_completion: string | null; end_date: string | null;
  created_at: string; created_by: string | null;
  updated_at: string; updated_by: string | null;
};

function toProject(r: ProjectRow): Project {
  return {
    id: r.id,
    projectNo: r.project_no,
    originalAddressId: r.original_address_id,
    currentAddressId: r.current_address_id,
    projectType: r.project_type,
    status: r.status,
    startDate: r.start_date,
    targetCompletion: r.target_completion,
    endDate: r.end_date,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by
  };
}

type JobRow = {
  id: string; project_id: string; project_no: number;
  job_sequence: string; job_number: string;
  original_address_id: string | null; current_address_id: string;
  status: Job["status"];
  created_at: string; created_by: string | null;
  updated_at: string; updated_by: string | null;
};

function toJob(r: JobRow): Job {
  return {
    id: r.id,
    projectId: r.project_id,
    projectNo: r.project_no,
    jobSequence: r.job_sequence,
    jobNumber: r.job_number,
    originalAddressId: r.original_address_id,
    currentAddressId: r.current_address_id,
    status: r.status,
    createdAt: r.created_at,
    createdBy: r.created_by,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by
  };
}
