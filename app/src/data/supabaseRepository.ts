import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repository, RepositoryMethod } from "./repository";
import { createStubRepository, SEED_STAGES } from "./stubRepository";
import type {
  Job,
  JobStage,
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
const WIRED: RepositoryMethod[] = ["listStages", "currentProfile"];

/**
 * The `profiles` columns this app reads. `full_name` is generated; never written.
 *
 * One string literal rather than a concatenation: postgrest-js parses this at the type
 * level to shape the result, and `"a" + "b"` widens to `string`, which it cannot read.
 */
const PROFILE_COLUMNS =
  "id, first_name, last_name, full_name, preferred_name, email, permission, active, created_at, created_by, updated_at, updated_by";

interface ProfileRow {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  preferred_name: string | null;
  email: string;
  permission: Profile["permission"];
  active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  fullName: r.full_name,
  preferredName: r.preferred_name,
  email: r.email,
  permission: r.permission,
  active: r.active,
  createdAt: r.created_at,
  createdBy: r.created_by,
  updatedAt: r.updated_at,
  updatedBy: r.updated_by
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

    async listJobStages(opts?: { jobId?: string; projectId?: string }): Promise<JobStage[]> {
      return stub.listJobStages(opts);
    },

    // ---- profiles -------------------------------------------------------
    async listProfiles(): Promise<Profile[]> {
      return stub.listProfiles();
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
     * `maybeSingle()` rather than `single()` — no row is a real state, not an error. It
     * means the 0003 trigger did not fire for this user, which the caller surfaces
     * instead of crashing on.
     */
    async currentProfile(): Promise<Profile | null> {
      const { data: auth } = await client.auth.getUser();
      if (!auth.user) return null;

      const { data, error } = await client
        .from("profiles")
        .select(PROFILE_COLUMNS)
        // Redundant against the "read own profile" policy, which already restricts this
        // to `id = auth.uid()`. Stated anyway: a query that only works because of a
        // policy breaks silently and confusingly the day the policy is widened.
        .eq("id", auth.user.id)
        .maybeSingle();

      if (error || !data) return null;
      return toProfile(data as ProfileRow);
    },

    // ---- lookups --------------------------------------------------------
    async listStages(): Promise<Stage[]> {
      const { data, error } = await client
        .from("stages")
        .select("id, name, position")
        .order("position");
      if (error || !data?.length) return SEED_STAGES;
      return data as Stage[];
    },

    async listTeams(): Promise<Team[]> {
      return stub.listTeams();
      // const { data, error } = await client
      //   .from("teams")
      //   .select("id, name, parent_team_id")
      //   .order("name");
      // if (error || !data?.length) return stub.listTeams();
      // return (data ?? []).map(toTeam);
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
