import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Repository, RepositoryMethod } from "./repository";
import { createStubRepository, SEED_STAGES } from "./stubRepository";
import type { Job, JobStage, Project, Stage, UserProfile } from "./types";

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
 */

// Add a method name here as you implement it. The Status page reads this.
const WIRED: RepositoryMethod[] = ["listStages"];

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

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
      //   .select("id, lofty_project_number, name, created_at")
      //   .order("lofty_project_number");
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

    // ---- stages ---------------------------------------------------------
    async listStages(): Promise<Stage[]> {
      const { data, error } = await client
        .from("stages")
        .select("id, name, position")
        .order("position");
      // A missing table on a fresh project shouldn't break the shell — fall back to
      // the seed so the board still has its columns.
      if (error || !data?.length) return SEED_STAGES;
      return data as Stage[];
    },

    async listJobStages(opts?: { jobId?: string; projectId?: string }): Promise<JobStage[]> {
      return stub.listJobStages(opts);
    },

    // ---- user profiles --------------------------------------------------
    async listUsers(): Promise<UserProfile[]> {
      return stub.listUsers();
    },

    async currentUser(): Promise<UserProfile | null> {
      return stub.currentUser();
    }
  };
}
