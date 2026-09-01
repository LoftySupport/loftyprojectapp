import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "./repository";
import type {
  MyPropertyAccess,
  NewProcess,
  NewProcessTask,
  NewPropertyAccess,
  Process,
  ProcessDependency,
  ProcessPatch,
  ProcessProperty,
  ProcessRun,
  ProcessRunPatch,
  ProcessRunStatus,
  ProcessTask,
  ProcessTaskDependency,
  ProcessTaskPatch,
  PropertyAccess,
  PropertyOption,
  PropertyValue,
  PropertyValueData,
  PropertyValueHistoryEntry,
  RecordTarget
} from "./types";

/**
 * The property-value and process half of the Supabase repository (0077, 0078).
 *
 * Split out of `supabaseRepository.ts` because that file was 3,000 lines and these
 * thirty methods share nothing with the rest but the client. Same rules apply: every
 * read names its columns, every mapper is a plain function, and nothing here is reached
 * by a component except through the `Repository` interface.
 *
 * TWO RPCS, BOTH SECURITY INVOKER
 *
 *   `push_project_properties` and `instantiate_process_tasks` are the first RPC calls in
 *   the app. Both run as the caller, so the policies decide — a push copies only what
 *   the person may read onto jobs they may write — and neither is a way around RLS.
 *
 * THE TARGET
 *
 *   A value or a run hangs off a job or a project, never both (CHECKed). Every method
 *   takes a `RecordTarget` and turns it into the right column, so no screen has to know
 *   which of two nullable columns a row uses.
 */

type PropertyProcessMethods = Pick<Repository,
  | "myPropertyAccess" | "listPropertyAccess" | "savePropertyAccess" | "deletePropertyAccess"
  | "listPropertyOptions" | "savePropertyOption" | "deletePropertyOption"
  | "listPropertyValues" | "setPropertyValue" | "clearPropertyValue" | "listPropertyValueHistory"
  | "pushProjectProperties"
  | "listProcesses" | "createProcess" | "updateProcess" | "deleteProcess"
  | "listProcessDependencies" | "setProcessDependencies"
  | "listProcessProperties" | "setProcessProperties"
  | "listProcessTasks" | "createProcessTask" | "updateProcessTask" | "deleteProcessTask"
  | "listProcessTaskDependencies" | "setProcessTaskDependencies"
  | "listProcessRuns" | "startProcessRun" | "updateProcessRun" | "deleteProcessRun"
  | "instantiateProcessTasks"
>;

const requireTarget = (t: RecordTarget) => {
  if ((t.jobId == null) === (t.projectId == null)) {
    throw new Error("A value or a run belongs to exactly one record — a job or a project.");
  }
};

export function propertyProcessMethods(client: SupabaseClient): PropertyProcessMethods {
  return {
    // ------------------------------------------------------------ access
    async myPropertyAccess(): Promise<MyPropertyAccess[]> {
      const { data, error } = await client.rpc("my_property_access");
      if (error) throw error;
      return (data as MyAccessRow[]).map(r => ({
        propertyKey: r.property_def_key,
        canCreate: r.can_create,
        canRead: r.can_read,
        canUpdate: r.can_update,
        canDelete: r.can_delete
      }));
    },

    async listPropertyAccess(): Promise<PropertyAccess[]> {
      const { data, error } = await client.from("property_access").select(ACCESS_COLUMNS);
      if (error) throw error;
      return (data as unknown as AccessRow[]).map(toAccess);
    },

    async savePropertyAccess(input: NewPropertyAccess): Promise<PropertyAccess> {
      if ((input.teamId == null) === (input.profileId == null)) {
        throw new Error("A grant names a team or a person, not both and not neither.");
      }
      const row = {
        property_def_key: input.propertyKey,
        team_id: input.teamId ?? null,
        profile_id: input.profileId ?? null,
        property_access_can_create: input.canCreate,
        property_access_can_read: input.canRead,
        property_access_can_update: input.canUpdate,
        property_access_can_delete: input.canDelete
      };
      // Upsert on the partial unique index: PostgREST needs the conflict columns named,
      // and a partial index cannot be named, so this is a select-then-write.
      const existing = await client.from("property_access").select("property_access_id")
        .eq("property_def_key", input.propertyKey)
        [input.teamId ? "eq" : "is"]("team_id", input.teamId ?? null)
        [input.profileId ? "eq" : "is"]("profile_id", input.profileId ?? null)
        .maybeSingle();
      if (existing.error) throw existing.error;
      const q = existing.data
        ? client.from("property_access").update(row).eq("property_access_id", existing.data.property_access_id)
        : client.from("property_access").insert(row);
      const { data, error } = await q.select(ACCESS_COLUMNS).single();
      if (error) throw error;
      return toAccess(data as unknown as AccessRow);
    },

    async deletePropertyAccess(id: string): Promise<void> {
      const { data, error } = await client.from("property_access").delete()
        .eq("property_access_id", id).select("property_access_id");
      if (error) throw error;
      if (!data?.length) throw new Error("The grant was not removed — it no longer exists, or you do not have permission.");
    },

    // ----------------------------------------------------------- options
    async listPropertyOptions(): Promise<PropertyOption[]> {
      const { data, error } = await client.from("property_options").select(OPTION_COLUMNS)
        .order("property_option_position").order("property_option_label");
      if (error) throw error;
      return (data as unknown as OptionRow[]).map(toOption);
    },

    async savePropertyOption(input: PropertyOption): Promise<PropertyOption> {
      const { data, error } = await client.from("property_options").upsert({
        property_def_key: input.propertyKey,
        property_option_key: input.key,
        property_option_label: input.label,
        property_option_position: input.position,
        property_option_is_active: input.isActive
      }, { onConflict: "property_def_key,property_option_key" }).select(OPTION_COLUMNS).single();
      if (error) throw error;
      return toOption(data as unknown as OptionRow);
    },

    async deletePropertyOption(propertyKey: string, optionKey: string): Promise<void> {
      const { data, error } = await client.from("property_options").delete()
        .eq("property_def_key", propertyKey).eq("property_option_key", optionKey)
        .select("property_option_key");
      if (error) throw error;
      if (!data?.length) throw new Error("The option was not removed — it no longer exists, or you do not have permission.");
    },

    // ------------------------------------------------------------ values
    async listPropertyValues(target?: RecordTarget): Promise<PropertyValue[]> {
      let q = client.from("property_values").select(VALUE_COLUMNS);
      if (target?.jobId != null) {
        // The job's own rows, plus the project's project-level rows read through. One
        // query with an OR rather than two round trips; the project id comes from the
        // job, which is one indexed read.
        const { data: job, error: jErr } = await client.from("jobs").select("project_id")
          .eq("job_id", target.jobId).maybeSingle();
        if (jErr) throw jErr;
        q = job
          ? q.or(`job_id.eq.${target.jobId},project_id.eq.${job.project_id}`)
          : q.eq("job_id", target.jobId);
      } else if (target?.projectId != null) {
        q = q.eq("project_id", target.projectId);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as ValueRow[]).map(toValue);
    },

    async setPropertyValue(target: RecordTarget, propertyKey: string, value: PropertyValueData): Promise<PropertyValue> {
      requireTarget(target);
      // The format rides along from the definition so the composite FK can hold the row
      // to it. Read here rather than trusted from the caller: a stale screen could send
      // yesterday's format.
      const { data: def, error: dErr } = await client.from("property_defs")
        .select("property_def_format").eq("property_def_key", propertyKey).maybeSingle();
      if (dErr) throw dErr;
      if (!def) throw new Error(`Property ${propertyKey} is not defined.`);

      const row = {
        property_def_key: propertyKey,
        property_def_format: def.property_def_format,
        job_id: target.jobId ?? null,
        project_id: target.projectId ?? null,
        property_value_text: value.text ?? null,
        property_value_number: value.number ?? null,
        property_value_date: value.date ?? null,
        property_value_bool: value.bool ?? null,
        property_value_profile_id: value.profileId ?? null,
        property_value_option_key: value.optionKey ?? null,
        property_value_option_keys: value.optionKeys ?? null
      };
      // Same partial-unique-index situation as grants: find the row, then write it.
      const found = await client.from("property_values").select("property_value_id")
        .eq("property_def_key", propertyKey)
        .eq(target.jobId != null ? "job_id" : "project_id", target.jobId ?? target.projectId!)
        .maybeSingle();
      if (found.error) throw found.error;
      const q = found.data
        ? client.from("property_values").update(row).eq("property_value_id", found.data.property_value_id)
        : client.from("property_values").insert(row);
      const { data, error } = await q.select(VALUE_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The value was not saved — you may not have permission to change this property.");
      return toValue(data as unknown as ValueRow);
    },

    async clearPropertyValue(target: RecordTarget, propertyKey: string): Promise<void> {
      requireTarget(target);
      const { data, error } = await client.from("property_values").delete()
        .eq("property_def_key", propertyKey)
        .eq(target.jobId != null ? "job_id" : "project_id", target.jobId ?? target.projectId!)
        .select("property_value_id");
      if (error) throw error;
      if (!data?.length) throw new Error("The value was not cleared — it is not recorded, or you may not clear this property.");
    },

    async listPropertyValueHistory(target: RecordTarget): Promise<PropertyValueHistoryEntry[]> {
      requireTarget(target);
      const { data, error } = await client.from("property_value_history").select(HISTORY_COLUMNS)
        .eq(target.jobId != null ? "job_id" : "project_id", target.jobId ?? target.projectId!)
        .order("property_value_history_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data as unknown as HistoryRow[]).map(r => ({
        id: r.property_value_history_id,
        propertyKey: r.property_def_key,
        jobId: r.job_id,
        projectId: r.project_id,
        oldValue: r.property_value_history_old,
        newValue: r.property_value_history_new,
        at: r.property_value_history_at,
        byName: r.by?.profile_full_name ?? null
      }));
    },

    async pushProjectProperties(projectId: number, keys?: string[]): Promise<number> {
      const { data, error } = await client.rpc("push_project_properties", {
        p_project_id: projectId, p_keys: keys ?? null
      });
      if (error) throw error;
      return Number(data ?? 0);
    },

    // --------------------------------------------------------- processes
    async listProcesses(): Promise<Process[]> {
      const { data, error } = await client.from("processes").select(PROCESS_COLUMNS)
        .order("process_stage").order("process_position").order("process_name");
      if (error) throw error;
      return (data as unknown as ProcessRow[]).map(toProcess);
    },

    async createProcess(input: NewProcess): Promise<Process> {
      const { data, error } = await client.from("processes").insert(processRow(input))
        .select(PROCESS_COLUMNS).single();
      if (error) throw error;
      return toProcess(data as unknown as ProcessRow);
    },

    async updateProcess(id: string, patch: ProcessPatch): Promise<Process> {
      const row = processRow(patch);
      if ("isActive" in patch) row.process_is_active = patch.isActive;
      const { data, error } = await client.from("processes").update(row).eq("process_id", id)
        .select(PROCESS_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The process was not updated — it no longer exists, or you do not have permission.");
      return toProcess(data as unknown as ProcessRow);
    },

    async deleteProcess(id: string): Promise<void> {
      const { data, error } = await client.from("processes").delete().eq("process_id", id).select("process_id");
      if (error) throw error;
      if (!data?.length) throw new Error("The process was not removed — it no longer exists, or you do not have permission.");
    },

    async listProcessDependencies(): Promise<ProcessDependency[]> {
      const { data, error } = await client.from("process_dependencies")
        .select("process_id, depends_on_process_id, process_dependency_lag_days");
      if (error) throw error;
      return (data as unknown as DepRow[]).map(r => ({
        processId: r.process_id, dependsOnProcessId: r.depends_on_process_id, lagDays: r.process_dependency_lag_days
      }));
    },

    async setProcessDependencies(processId, dependsOn): Promise<ProcessDependency[]> {
      // Replace rather than diff: the editor sends the whole list, and two writes are
      // simpler to reason about than three. The cycle guard fires on the inserts.
      const del = await client.from("process_dependencies").delete().eq("process_id", processId);
      if (del.error) throw del.error;
      if (dependsOn.length) {
        const ins = await client.from("process_dependencies").insert(dependsOn.map(d => ({
          process_id: processId, depends_on_process_id: d.processId, process_dependency_lag_days: d.lagDays
        })));
        if (ins.error) throw ins.error;
      }
      return this.listProcessDependencies();
    },

    async listProcessProperties(): Promise<ProcessProperty[]> {
      const { data, error } = await client.from("process_properties")
        .select("process_id, property_def_key, process_property_position, process_property_required")
        .order("process_property_position");
      if (error) throw error;
      return (data as unknown as ProcPropRow[]).map(r => ({
        processId: r.process_id, propertyKey: r.property_def_key,
        position: r.process_property_position, required: r.process_property_required
      }));
    },

    async setProcessProperties(processId, properties): Promise<ProcessProperty[]> {
      const del = await client.from("process_properties").delete().eq("process_id", processId);
      if (del.error) throw del.error;
      if (properties.length) {
        const ins = await client.from("process_properties").insert(properties.map((p, i) => ({
          process_id: processId, property_def_key: p.propertyKey,
          process_property_position: i + 1, process_property_required: p.required
        })));
        if (ins.error) throw ins.error;
      }
      return this.listProcessProperties();
    },

    // ----------------------------------------------------- template tasks
    async listProcessTasks(processId?: string): Promise<ProcessTask[]> {
      let q = client.from("process_tasks").select(PTASK_COLUMNS).order("process_task_position");
      if (processId) q = q.eq("process_id", processId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as PTaskRow[]).map(toProcessTask);
    },

    async createProcessTask(input: NewProcessTask): Promise<ProcessTask> {
      const { data, error } = await client.from("process_tasks").insert({
        process_id: input.processId,
        parent_process_task_id: input.parentId ?? null,
        process_task_name: input.name,
        process_task_owning_team: input.owningTeam ?? null,
        process_task_expected_days: input.expectedDays ?? null,
        process_task_is_external: input.isExternal ?? false,
        process_task_position: input.position ?? 0
      }).select(PTASK_COLUMNS).single();
      if (error) throw error;
      return toProcessTask(data as unknown as PTaskRow);
    },

    async updateProcessTask(id: string, patch: ProcessTaskPatch): Promise<ProcessTask> {
      const row: Record<string, unknown> = {};
      if ("name" in patch) row.process_task_name = patch.name;
      if ("parentId" in patch) row.parent_process_task_id = patch.parentId ?? null;
      if ("owningTeam" in patch) row.process_task_owning_team = patch.owningTeam ?? null;
      if ("expectedDays" in patch) row.process_task_expected_days = patch.expectedDays ?? null;
      if ("isExternal" in patch) row.process_task_is_external = patch.isExternal;
      if ("position" in patch) row.process_task_position = patch.position;
      const { data, error } = await client.from("process_tasks").update(row).eq("process_task_id", id)
        .select(PTASK_COLUMNS).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The template task was not updated — it no longer exists, or you do not have permission.");
      return toProcessTask(data as unknown as PTaskRow);
    },

    async deleteProcessTask(id: string): Promise<void> {
      const { data, error } = await client.from("process_tasks").delete().eq("process_task_id", id).select("process_task_id");
      if (error) throw error;
      if (!data?.length) throw new Error("The template task was not removed — it no longer exists, or you do not have permission.");
    },

    async listProcessTaskDependencies(processId: string): Promise<ProcessTaskDependency[]> {
      // Filter through the task's process with an inner embed — the dependency row
      // itself does not carry the process.
      const { data, error } = await client.from("process_task_dependencies")
        .select("process_task_id, depends_on_process_task_id, process_task_dependency_lag_days, task:process_tasks!process_task_dependencies_process_task_id_fkey!inner(process_id)")
        .eq("task.process_id", processId);
      if (error) throw error;
      return (data as unknown as PTaskDepRow[]).map(r => ({
        taskId: r.process_task_id, dependsOnTaskId: r.depends_on_process_task_id,
        lagDays: r.process_task_dependency_lag_days
      }));
    },

    async setProcessTaskDependencies(taskId, dependsOn): Promise<ProcessTaskDependency[]> {
      const { data: task, error: tErr } = await client.from("process_tasks").select("process_id")
        .eq("process_task_id", taskId).maybeSingle();
      if (tErr) throw tErr;
      if (!task) throw new Error("That template task no longer exists.");
      const del = await client.from("process_task_dependencies").delete().eq("process_task_id", taskId);
      if (del.error) throw del.error;
      if (dependsOn.length) {
        const ins = await client.from("process_task_dependencies").insert(dependsOn.map(d => ({
          process_task_id: taskId, depends_on_process_task_id: d.taskId, process_task_dependency_lag_days: d.lagDays
        })));
        if (ins.error) throw ins.error;
      }
      return this.listProcessTaskDependencies(task.process_id);
    },

    // -------------------------------------------------------------- runs
    async listProcessRuns(target?: RecordTarget): Promise<ProcessRun[]> {
      let q = client.from("process_run_display").select(RUN_COLUMNS)
        .order("process_stage").order("process_position").order("process_run_attempt");
      if (target?.jobId != null) q = q.eq("job_id", target.jobId);
      else if (target?.projectId != null) q = q.eq("project_id", target.projectId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as unknown as RunRow[]).map(toRun);
    },

    async startProcessRun(target: RecordTarget, processId: string, status: ProcessRunStatus = "in_progress"): Promise<ProcessRun> {
      requireTarget(target);
      // The next attempt number for this process on this record. Read, then insert:
      // the unique index refuses a race, and a refusal names itself.
      const { data: prior, error: pErr } = await client.from("process_runs").select("process_run_attempt")
        .eq("process_id", processId)
        .eq(target.jobId != null ? "job_id" : "project_id", target.jobId ?? target.projectId!)
        .order("process_run_attempt", { ascending: false }).limit(1);
      if (pErr) throw pErr;
      const attempt = (prior?.[0]?.process_run_attempt ?? 0) + 1;
      const { data, error } = await client.from("process_runs").insert({
        process_id: processId,
        job_id: target.jobId ?? null,
        project_id: target.projectId ?? null,
        process_run_attempt: attempt,
        process_run_status: status
      }).select("process_run_id").single();
      if (error) throw error;
      return readRun(client, data.process_run_id);
    },

    async updateProcessRun(id: string, patch: ProcessRunPatch): Promise<ProcessRun> {
      const row: Record<string, unknown> = {};
      if ("status" in patch) row.process_run_status = patch.status;
      if ("waitingOn" in patch) row.process_run_waiting_on = patch.waitingOn ?? null;
      if ("note" in patch) row.process_run_note = patch.note ?? null;
      if ("startedAt" in patch) row.process_run_started_at = patch.startedAt ?? null;
      const { data, error } = await client.from("process_runs").update(row).eq("process_run_id", id)
        .select("process_run_id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("The process was not updated — it no longer exists, or you do not have permission.");
      return readRun(client, id);
    },

    async deleteProcessRun(id: string): Promise<void> {
      const { data, error } = await client.from("process_runs").delete().eq("process_run_id", id).select("process_run_id");
      if (error) throw error;
      if (!data?.length) throw new Error("The run was not removed — it no longer exists, or you do not have permission.");
    },

    async instantiateProcessTasks(runId: string): Promise<number> {
      const { data, error } = await client.rpc("instantiate_process_tasks", { p_process_run_id: runId });
      if (error) throw error;
      return Number(data ?? 0);
    }
  };
}

async function readRun(client: SupabaseClient, id: string): Promise<ProcessRun> {
  const { data, error } = await client.from("process_run_display").select(RUN_COLUMNS)
    .eq("process_run_id", id).single();
  if (error) throw error;
  return toRun(data as unknown as RunRow);
}

// ------------------------------------------------------------------ rows

type MyAccessRow = {
  property_def_key: string; can_create: boolean; can_read: boolean; can_update: boolean; can_delete: boolean;
};

const ACCESS_COLUMNS =
  "property_access_id, property_def_key, team_id, profile_id, property_access_can_create, property_access_can_read, property_access_can_update, property_access_can_delete";
type AccessRow = {
  property_access_id: string; property_def_key: string; team_id: string | null; profile_id: string | null;
  property_access_can_create: boolean; property_access_can_read: boolean;
  property_access_can_update: boolean; property_access_can_delete: boolean;
};
const toAccess = (r: AccessRow): PropertyAccess => ({
  id: r.property_access_id, propertyKey: r.property_def_key, teamId: r.team_id, profileId: r.profile_id,
  canCreate: r.property_access_can_create, canRead: r.property_access_can_read,
  canUpdate: r.property_access_can_update, canDelete: r.property_access_can_delete
});

const OPTION_COLUMNS =
  "property_def_key, property_option_key, property_option_label, property_option_position, property_option_is_active";
type OptionRow = {
  property_def_key: string; property_option_key: string; property_option_label: string;
  property_option_position: number; property_option_is_active: boolean;
};
const toOption = (r: OptionRow): PropertyOption => ({
  propertyKey: r.property_def_key, key: r.property_option_key, label: r.property_option_label,
  position: r.property_option_position, isActive: r.property_option_is_active
});

const VALUE_COLUMNS =
  "property_value_id, property_def_key, property_def_format, job_id, project_id, property_value_text, property_value_number, property_value_date, property_value_bool, property_value_profile_id, property_value_option_key, property_value_option_keys, property_value_set_at, property_value_set_by, setter:profiles!property_values_property_value_set_by_fkey(profile_full_name)";
type ValueRow = {
  property_value_id: string; property_def_key: string; property_def_format: PropertyValue["format"];
  job_id: string | null; project_id: number | null;
  property_value_text: string | null; property_value_number: number | string | null;
  property_value_date: string | null; property_value_bool: boolean | null;
  property_value_profile_id: string | null; property_value_option_key: string | null;
  property_value_option_keys: string[] | null;
  property_value_set_at: string; property_value_set_by: string | null;
  setter: { profile_full_name: string | null } | null;
};
const toValue = (r: ValueRow): PropertyValue => ({
  id: r.property_value_id,
  propertyKey: r.property_def_key,
  format: r.property_def_format,
  jobId: r.job_id,
  projectId: r.project_id,
  value: {
    text: r.property_value_text,
    // numeric comes back as a string from PostgREST; a number on the wire would lose precision.
    number: r.property_value_number == null ? null : Number(r.property_value_number),
    date: r.property_value_date,
    bool: r.property_value_bool,
    profileId: r.property_value_profile_id,
    optionKey: r.property_value_option_key,
    optionKeys: r.property_value_option_keys
  },
  setAt: r.property_value_set_at,
  setById: r.property_value_set_by,
  setByName: r.setter?.profile_full_name ?? null
});

const HISTORY_COLUMNS =
  "property_value_history_id, property_def_key, job_id, project_id, property_value_history_old, property_value_history_new, property_value_history_at, by:profiles!property_value_history_property_value_history_by_fkey(profile_full_name)";
type HistoryRow = {
  property_value_history_id: number; property_def_key: string; job_id: string | null; project_id: number | null;
  property_value_history_old: unknown; property_value_history_new: unknown; property_value_history_at: string;
  by: { profile_full_name: string | null } | null;
};

const PROCESS_COLUMNS =
  "process_id, process_key, process_name, process_stage, process_stage_group, process_scope, process_owning_team, process_expected_days, process_at_risk_lead_days, process_is_milestone, process_is_external, process_position, process_is_active, process_description, process_automation, process_sharepoint_folder, process_import_ref";
type ProcessRow = {
  process_id: string; process_key: string; process_name: string; process_stage: string;
  process_stage_group: string | null; process_scope: Process["scope"]; process_owning_team: string | null;
  process_expected_days: number | null; process_at_risk_lead_days: number | null;
  process_is_milestone: boolean; process_is_external: boolean; process_position: number;
  process_is_active: boolean; process_description: string | null; process_automation: string | null;
  process_sharepoint_folder: string | null; process_import_ref: string | null;
};
const toProcess = (r: ProcessRow): Process => ({
  id: r.process_id, key: r.process_key, name: r.process_name, stageName: r.process_stage,
  stageGroup: r.process_stage_group, scope: r.process_scope, owningTeam: r.process_owning_team,
  expectedDays: r.process_expected_days, atRiskLeadDays: r.process_at_risk_lead_days,
  isMilestone: r.process_is_milestone, isExternal: r.process_is_external, position: r.process_position,
  isActive: r.process_is_active, description: r.process_description, automation: r.process_automation,
  sharepointFolder: r.process_sharepoint_folder, importRef: r.process_import_ref
});
const processRow = (p: Partial<NewProcess>): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if ("key" in p) row.process_key = p.key;
  if ("name" in p) row.process_name = p.name;
  if ("stageName" in p) row.process_stage = p.stageName;
  if ("stageGroup" in p) row.process_stage_group = p.stageGroup || null;
  if ("scope" in p) row.process_scope = p.scope;
  if ("owningTeam" in p) row.process_owning_team = p.owningTeam || null;
  if ("expectedDays" in p) row.process_expected_days = p.expectedDays ?? null;
  if ("atRiskLeadDays" in p) row.process_at_risk_lead_days = p.atRiskLeadDays ?? null;
  if ("isMilestone" in p) row.process_is_milestone = p.isMilestone;
  if ("isExternal" in p) row.process_is_external = p.isExternal;
  if ("position" in p) row.process_position = p.position;
  if ("description" in p) row.process_description = p.description || null;
  if ("automation" in p) row.process_automation = p.automation || null;
  if ("sharepointFolder" in p) row.process_sharepoint_folder = p.sharepointFolder || null;
  return row;
};

type DepRow = { process_id: string; depends_on_process_id: string; process_dependency_lag_days: number };
type ProcPropRow = { process_id: string; property_def_key: string; process_property_position: number; process_property_required: boolean };

const PTASK_COLUMNS =
  "process_task_id, process_id, parent_process_task_id, process_task_name, process_task_owning_team, process_task_expected_days, process_task_is_external, process_task_position, process_task_import_ref";
type PTaskRow = {
  process_task_id: string; process_id: string; parent_process_task_id: string | null; process_task_name: string;
  process_task_owning_team: string | null; process_task_expected_days: number | null;
  process_task_is_external: boolean; process_task_position: number; process_task_import_ref: number | null;
};
const toProcessTask = (r: PTaskRow): ProcessTask => ({
  id: r.process_task_id, processId: r.process_id, parentId: r.parent_process_task_id, name: r.process_task_name,
  owningTeam: r.process_task_owning_team, expectedDays: r.process_task_expected_days,
  isExternal: r.process_task_is_external, position: r.process_task_position, importRef: r.process_task_import_ref
});
type PTaskDepRow = { process_task_id: string; depends_on_process_task_id: string; process_task_dependency_lag_days: number };

const RUN_COLUMNS =
  "process_run_id, process_id, process_key, process_name, process_stage, process_stage_group, process_scope, process_owning_team, process_is_milestone, process_is_external, process_expected_days, process_at_risk_lead_days, process_position, job_id, project_id, record_project_id, process_run_attempt, process_run_status, process_run_waiting_on, process_run_started_at, process_run_completed_at, process_run_completed_by, process_run_note, process_run_due_date, process_run_at_risk_date, process_run_health, process_run_days_taken";
type RunRow = {
  process_run_id: string; process_id: string; process_key: string; process_name: string; process_stage: string;
  process_stage_group: string | null; process_scope: Process["scope"]; process_owning_team: string | null;
  process_is_milestone: boolean; process_is_external: boolean; process_expected_days: number | null;
  process_at_risk_lead_days: number | null; process_position: number;
  job_id: string | null; project_id: number | null; record_project_id: number | null;
  process_run_attempt: number; process_run_status: ProcessRun["status"]; process_run_waiting_on: string | null;
  process_run_started_at: string | null; process_run_completed_at: string | null; process_run_completed_by: string | null;
  process_run_note: string | null; process_run_due_date: string | null; process_run_at_risk_date: string | null;
  process_run_health: ProcessRun["health"]; process_run_days_taken: number | null;
};
const toRun = (r: RunRow): ProcessRun => ({
  id: r.process_run_id, processId: r.process_id, processKey: r.process_key, processName: r.process_name,
  stageName: r.process_stage, stageGroup: r.process_stage_group, scope: r.process_scope,
  owningTeam: r.process_owning_team, isMilestone: r.process_is_milestone, isExternal: r.process_is_external,
  expectedDays: r.process_expected_days, atRiskLeadDays: r.process_at_risk_lead_days, position: r.process_position,
  jobId: r.job_id, projectId: r.project_id, recordProjectId: r.record_project_id,
  attempt: r.process_run_attempt, status: r.process_run_status, waitingOn: r.process_run_waiting_on,
  startedAt: r.process_run_started_at, completedAt: r.process_run_completed_at,
  completedById: r.process_run_completed_by, note: r.process_run_note,
  dueDate: r.process_run_due_date, atRiskDate: r.process_run_at_risk_date,
  health: r.process_run_health, daysTaken: r.process_run_days_taken
});
