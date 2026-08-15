import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repository, RepositoryMethod } from "./repository";
import { createStubRepository, SEED_STAGES } from "./stubRepository";
import type {
  Job,
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
const WIRED: RepositoryMethod[] = ["createProject", "createJob"];

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
    async listProfiles(): Promise<Profile[]> {
      return stub.listProfiles();
    },

    async currentProfile(): Promise<Profile | null> {
      return stub.currentProfile();
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
