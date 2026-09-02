import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "./repository";
import type {
  JobWarranty, MaintenanceAssignment, MaintenanceCategory, MaintenanceItem, MaintenanceMessage, MaintenanceOffer,
  MaintenanceOutboxStat, MaintenanceRequest, MaintenanceSettings
} from "./types";

/**
 * The maintenance half of the Supabase repository (0084): the settings, the categories, the
 * requests, their items and offers, and the thread on each.
 *
 * Reads come off `maintenance_request_display` and `maintenance_item_display`, so due, at
 * risk, health, the warranty flag, the counts and "who did this trade on the job" are
 * resolved once in the database and never re-derived here. Writes go to the tables and
 * re-read through the view.
 *
 * Nothing here decides who may do what: a user's request is numbered by trigger, a close
 * with open items is refused by trigger, and the offer's token is returned by the database
 * exactly once. The app shows the buttons and repeats the database's words when it says no.
 */
type MaintenanceMethods = Pick<Repository,
  | "getMaintenanceSettings" | "saveMaintenanceSettings" | "listMaintenanceCategories" | "saveMaintenanceCategory"
  | "listMaintenanceRequests" | "getMaintenanceRequest" | "createMaintenanceRequest" | "updateMaintenanceRequest"
  | "listMaintenanceItems" | "addMaintenanceItem" | "updateMaintenanceItem" | "deleteMaintenanceItem"
  | "offerMaintenanceItem" | "updateMaintenanceAssignment" | "listMaintenanceMessages" | "addMaintenanceNote"
  | "getJobWarranty" | "listMaintenanceOutboxStats"
>;

const REQUEST_COLUMNS = [
  "maintenance_request_id", "job_id", "project_id", "maintenance_request_number", "maintenance_request_sequence", "maintenance_request_source",
  "maintenance_request_reported_by_contact_id", "maintenance_request_reported_by_name", "maintenance_request_reported_by_email", "maintenance_request_reported_by_phone",
  "maintenance_request_reported_at", "maintenance_request_summary", "maintenance_request_description", "maintenance_request_priority", "maintenance_request_status",
  "maintenance_category_id", "maintenance_category_name", "maintenance_request_due_on", "maintenance_request_at_risk_on", "maintenance_request_health",
  "maintenance_request_owner_profile_id", "maintenance_request_owner_name", "maintenance_request_closed_at", "maintenance_request_closed_reason", "maintenance_request_external_ref",
  "job_current_address", "job_suburb", "job_handover_at", "job_warranty_ends_on", "maintenance_request_is_warranty",
  "maintenance_request_items_total", "maintenance_request_items_done", "maintenance_request_offers_open", "maintenance_request_next_visit",
  "maintenance_request_messages_total", "maintenance_request_last_message_at", "maintenance_request_created_at", "maintenance_request_updated_at"
].join(", ");

type RequestRow = {
  maintenance_request_id: string; job_id: string; project_id: number; maintenance_request_number: string; maintenance_request_sequence: number;
  maintenance_request_source: MaintenanceRequest["source"]; maintenance_request_reported_by_contact_id: string | null; maintenance_request_reported_by_name: string | null;
  maintenance_request_reported_by_email: string | null; maintenance_request_reported_by_phone: string | null; maintenance_request_reported_at: string;
  maintenance_request_summary: string; maintenance_request_description: string | null; maintenance_request_priority: MaintenanceRequest["priority"];
  maintenance_request_status: MaintenanceRequest["status"]; maintenance_category_id: string | null; maintenance_category_name: string | null;
  maintenance_request_due_on: string | null; maintenance_request_at_risk_on: string | null; maintenance_request_health: MaintenanceRequest["health"];
  maintenance_request_owner_profile_id: string | null; maintenance_request_owner_name: string | null; maintenance_request_closed_at: string | null;
  maintenance_request_closed_reason: string | null; maintenance_request_external_ref: string | null; job_current_address: string; job_suburb: string | null;
  job_handover_at: string | null; job_warranty_ends_on: string | null; maintenance_request_is_warranty: boolean | null;
  maintenance_request_items_total: number; maintenance_request_items_done: number; maintenance_request_offers_open: number; maintenance_request_next_visit: string | null;
  maintenance_request_messages_total: number; maintenance_request_last_message_at: string | null; maintenance_request_created_at: string; maintenance_request_updated_at: string;
};

const fromRequest = (r: RequestRow): MaintenanceRequest => ({
  id: r.maintenance_request_id, jobId: r.job_id, projectId: r.project_id, number: r.maintenance_request_number, sequence: r.maintenance_request_sequence,
  source: r.maintenance_request_source, reportedByContactId: r.maintenance_request_reported_by_contact_id, reportedByName: r.maintenance_request_reported_by_name,
  reportedByEmail: r.maintenance_request_reported_by_email, reportedByPhone: r.maintenance_request_reported_by_phone, reportedAt: r.maintenance_request_reported_at,
  summary: r.maintenance_request_summary, description: r.maintenance_request_description, priority: r.maintenance_request_priority, status: r.maintenance_request_status,
  categoryId: r.maintenance_category_id, categoryName: r.maintenance_category_name, dueOn: r.maintenance_request_due_on, atRiskOn: r.maintenance_request_at_risk_on,
  health: r.maintenance_request_health, ownerProfileId: r.maintenance_request_owner_profile_id, ownerName: r.maintenance_request_owner_name,
  closedAt: r.maintenance_request_closed_at, closedReason: r.maintenance_request_closed_reason, externalRef: r.maintenance_request_external_ref,
  jobAddress: r.job_current_address, jobSuburb: r.job_suburb, handoverAt: r.job_handover_at, warrantyEndsOn: r.job_warranty_ends_on,
  isWarranty: r.maintenance_request_is_warranty === true, itemsTotal: r.maintenance_request_items_total, itemsDone: r.maintenance_request_items_done,
  offersOpen: r.maintenance_request_offers_open, nextVisit: r.maintenance_request_next_visit, messagesTotal: r.maintenance_request_messages_total,
  lastMessageAt: r.maintenance_request_last_message_at, createdAt: r.maintenance_request_created_at, updatedAt: r.maintenance_request_updated_at
});

const ITEM_COLUMNS = [
  "maintenance_item_id", "maintenance_request_id", "maintenance_item_position", "maintenance_item_description", "maintenance_item_location",
  "maintenance_category_id", "maintenance_category_name", "maintenance_item_party_role_id", "maintenance_item_status", "maintenance_item_is_warranty", "maintenance_item_cost",
  "maintenance_item_completed_at", "maintenance_item_completed_by_name", "maintenance_item_original_trade",
  "maintenance_assignment_id", "maintenance_assignment_status", "maintenance_assignment_offered_at", "maintenance_assignment_responded_at",
  "maintenance_assignment_scheduled_for", "maintenance_assignment_note", "maintenance_item_company_id", "maintenance_item_company_name",
  "maintenance_item_contact_id", "maintenance_item_contact_name"
].join(", ");

type ItemRow = {
  maintenance_item_id: string; maintenance_request_id: string; maintenance_item_position: number; maintenance_item_description: string; maintenance_item_location: string | null;
  maintenance_category_id: string | null; maintenance_category_name: string | null; maintenance_item_party_role_id: string | null; maintenance_item_status: MaintenanceItem["status"];
  maintenance_item_is_warranty: boolean | null; maintenance_item_cost: number | string | null; maintenance_item_completed_at: string | null; maintenance_item_completed_by_name: string | null;
  maintenance_item_original_trade: string | null; maintenance_assignment_id: string | null; maintenance_assignment_status: MaintenanceAssignment["status"] | null;
  maintenance_assignment_offered_at: string | null; maintenance_assignment_responded_at: string | null; maintenance_assignment_scheduled_for: string | null;
  maintenance_assignment_note: string | null; maintenance_item_company_id: string | null; maintenance_item_company_name: string | null;
  maintenance_item_contact_id: string | null; maintenance_item_contact_name: string | null;
};

const fromItem = (r: ItemRow): MaintenanceItem => ({
  id: r.maintenance_item_id, requestId: r.maintenance_request_id, position: r.maintenance_item_position, description: r.maintenance_item_description,
  location: r.maintenance_item_location, categoryId: r.maintenance_category_id, categoryName: r.maintenance_category_name, partyRoleId: r.maintenance_item_party_role_id,
  status: r.maintenance_item_status, isWarranty: r.maintenance_item_is_warranty,
  cost: r.maintenance_item_cost == null ? null : Number(r.maintenance_item_cost),
  completedAt: r.maintenance_item_completed_at, completedByName: r.maintenance_item_completed_by_name, originalTrade: r.maintenance_item_original_trade,
  assignment: r.maintenance_assignment_id && r.maintenance_assignment_status ? {
    id: r.maintenance_assignment_id, status: r.maintenance_assignment_status, companyId: r.maintenance_item_company_id, companyName: r.maintenance_item_company_name,
    contactId: r.maintenance_item_contact_id, contactName: r.maintenance_item_contact_name, offeredAt: r.maintenance_assignment_offered_at ?? "",
    respondedAt: r.maintenance_assignment_responded_at, scheduledFor: r.maintenance_assignment_scheduled_for, note: r.maintenance_assignment_note
  } : null
});

const MESSAGE_COLUMNS = "maintenance_message_id, maintenance_request_id, maintenance_assignment_id, maintenance_message_direction, maintenance_message_channel, maintenance_message_from_contact_id, maintenance_message_from_profile_id, maintenance_message_to_address, maintenance_message_subject, maintenance_message_body, maintenance_message_status, maintenance_message_attempts, maintenance_message_error, maintenance_message_at";
type MessageRow = {
  maintenance_message_id: string; maintenance_request_id: string; maintenance_assignment_id: string | null; maintenance_message_direction: MaintenanceMessage["direction"];
  maintenance_message_channel: MaintenanceMessage["channel"]; maintenance_message_from_contact_id: string | null; maintenance_message_from_profile_id: string | null;
  maintenance_message_to_address: string | null; maintenance_message_subject: string | null; maintenance_message_body: string; maintenance_message_status: MaintenanceMessage["status"];
  maintenance_message_attempts: number; maintenance_message_error: string | null; maintenance_message_at: string;
};
const fromMessage = (r: MessageRow): MaintenanceMessage => ({
  id: r.maintenance_message_id, requestId: r.maintenance_request_id, assignmentId: r.maintenance_assignment_id, direction: r.maintenance_message_direction,
  channel: r.maintenance_message_channel, fromContactId: r.maintenance_message_from_contact_id, fromProfileId: r.maintenance_message_from_profile_id,
  toAddress: r.maintenance_message_to_address, subject: r.maintenance_message_subject, body: r.maintenance_message_body, status: r.maintenance_message_status,
  attempts: r.maintenance_message_attempts, error: r.maintenance_message_error, at: r.maintenance_message_at
});

const SETTINGS_COLUMNS = "maintenance_setting_warranty_months, maintenance_setting_offer_response_hours, maintenance_setting_reminder_days_before, maintenance_setting_accept_link_days, maintenance_setting_intake_mailbox, maintenance_setting_updated_at";
type SettingsRow = { maintenance_setting_warranty_months: number; maintenance_setting_offer_response_hours: number; maintenance_setting_reminder_days_before: number; maintenance_setting_accept_link_days: number; maintenance_setting_intake_mailbox: string | null; maintenance_setting_updated_at: string };
const fromSettings = (r: SettingsRow): MaintenanceSettings => ({
  warrantyMonths: r.maintenance_setting_warranty_months, offerResponseHours: r.maintenance_setting_offer_response_hours, reminderDaysBefore: r.maintenance_setting_reminder_days_before,
  acceptLinkDays: r.maintenance_setting_accept_link_days, intakeMailbox: r.maintenance_setting_intake_mailbox, updatedAt: r.maintenance_setting_updated_at
});

const CATEGORY_COLUMNS = "maintenance_category_id, maintenance_category_name, party_role_id, team_id, maintenance_category_sla_days, maintenance_category_at_risk_lead_days, maintenance_category_position, maintenance_category_is_active";
type CategoryRow = { maintenance_category_id: string; maintenance_category_name: string; party_role_id: string | null; team_id: string | null; maintenance_category_sla_days: number | null; maintenance_category_at_risk_lead_days: number | null; maintenance_category_position: number; maintenance_category_is_active: boolean };
const fromCategory = (r: CategoryRow): MaintenanceCategory => ({
  id: r.maintenance_category_id, name: r.maintenance_category_name, partyRoleId: r.party_role_id, teamId: r.team_id, slaDays: r.maintenance_category_sla_days,
  atRiskLeadDays: r.maintenance_category_at_risk_lead_days, position: r.maintenance_category_position, isActive: r.maintenance_category_is_active
});

export function maintenanceMethods(client: SupabaseClient): MaintenanceMethods {
  async function readRequest(id: string): Promise<MaintenanceRequest> {
    const { data, error } = await client.from("maintenance_request_display").select(REQUEST_COLUMNS).eq("maintenance_request_id", id).single();
    if (error) throw error;
    return fromRequest(data as unknown as RequestRow);
  }
  async function readItem(id: string): Promise<MaintenanceItem> {
    const { data, error } = await client.from("maintenance_item_display").select(ITEM_COLUMNS).eq("maintenance_item_id", id).single();
    if (error) throw error;
    return fromItem(data as unknown as ItemRow);
  }

  return {
    async getMaintenanceSettings(): Promise<MaintenanceSettings> {
      const { data, error } = await client.from("maintenance_settings").select(SETTINGS_COLUMNS).eq("maintenance_setting_id", 1).single();
      if (error) throw error;
      return fromSettings(data as SettingsRow);
    },
    async saveMaintenanceSettings(patch): Promise<MaintenanceSettings> {
      const row: Record<string, unknown> = {};
      if (patch.warrantyMonths !== undefined) row.maintenance_setting_warranty_months = patch.warrantyMonths;
      if (patch.offerResponseHours !== undefined) row.maintenance_setting_offer_response_hours = patch.offerResponseHours;
      if (patch.reminderDaysBefore !== undefined) row.maintenance_setting_reminder_days_before = patch.reminderDaysBefore;
      if (patch.acceptLinkDays !== undefined) row.maintenance_setting_accept_link_days = patch.acceptLinkDays;
      if (patch.intakeMailbox !== undefined) row.maintenance_setting_intake_mailbox = patch.intakeMailbox;
      const { data: me } = await client.rpc("current_profile_id");
      if (me) row.maintenance_setting_updated_by = me;
      const { data, error } = await client.from("maintenance_settings").update(row).eq("maintenance_setting_id", 1).select(SETTINGS_COLUMNS).maybeSingle();
      if (error) throw error;
      // RLS filters a write below manager to zero rows rather than refusing it; say so.
      if (!data) throw new Error("The maintenance settings were not changed — editing them needs manager or above.");
      return fromSettings(data as SettingsRow);
    },

    async listMaintenanceCategories(opts = {}): Promise<MaintenanceCategory[]> {
      let q = client.from("maintenance_categories").select(CATEGORY_COLUMNS);
      if (!opts.includeInactive) q = q.eq("maintenance_category_is_active", true);
      const { data, error } = await q.order("maintenance_category_position").order("maintenance_category_name");
      if (error) throw error;
      return ((data ?? []) as CategoryRow[]).map(fromCategory);
    },
    async saveMaintenanceCategory(row): Promise<MaintenanceCategory> {
      const { data, error } = await client.from("maintenance_categories").upsert({
        maintenance_category_id: row.id, maintenance_category_name: row.name, party_role_id: row.partyRoleId, team_id: row.teamId,
        maintenance_category_sla_days: row.slaDays, maintenance_category_at_risk_lead_days: row.atRiskLeadDays,
        maintenance_category_position: row.position, maintenance_category_is_active: row.isActive
      }, { onConflict: "maintenance_category_id" }).select(CATEGORY_COLUMNS).single();
      if (error) throw error;
      return fromCategory(data as CategoryRow);
    },

    async listMaintenanceRequests(opts = {}): Promise<MaintenanceRequest[]> {
      let q = client.from("maintenance_request_display").select(REQUEST_COLUMNS);
      if (opts.jobId) q = q.eq("job_id", opts.jobId);
      if (opts.queue === "open" || opts.queue === undefined) q = q.not("maintenance_request_status", "in", "(closed,rejected)");
      if (opts.queue === "closed") q = q.in("maintenance_request_status", ["closed", "rejected"]);
      if (opts.search?.trim()) {
        const s = opts.search.trim().replace(/[%,()]/g, " ");
        q = q.or(`maintenance_request_number.ilike.%${s}%,maintenance_request_summary.ilike.%${s}%,job_current_address.ilike.%${s}%,maintenance_request_reported_by_name.ilike.%${s}%`);
      }
      const { data, error } = await q.order("maintenance_request_reported_at", { ascending: false }).limit(opts.limit ?? 500);
      if (error) throw error;
      return ((data ?? []) as unknown as RequestRow[]).map(fromRequest);
    },
    async getMaintenanceRequest(id: string): Promise<MaintenanceRequest | null> {
      const { data, error } = await client.from("maintenance_request_display").select(REQUEST_COLUMNS).eq("maintenance_request_id", id).maybeSingle();
      if (error) throw error;
      return data ? fromRequest(data as unknown as RequestRow) : null;
    },
    async createMaintenanceRequest(input): Promise<MaintenanceRequest> {
      const { data, error } = await client.from("maintenance_requests").insert({
        job_id: input.jobId, maintenance_request_summary: input.summary, maintenance_request_source: input.source,
        maintenance_request_description: input.description ?? null, maintenance_request_priority: input.priority ?? "normal",
        maintenance_request_reported_by_contact_id: input.reportedByContactId ?? null,
        ...(input.reportedAt ? { maintenance_request_reported_at: input.reportedAt } : {}),
        maintenance_category_id: input.categoryId ?? null, maintenance_request_owner_profile_id: input.ownerProfileId ?? null
      }).select("maintenance_request_id").single();
      if (error) throw error;
      return readRequest((data as { maintenance_request_id: string }).maintenance_request_id);
    },
    async updateMaintenanceRequest(id, patch): Promise<MaintenanceRequest> {
      const row: Record<string, unknown> = {};
      if (patch.summary !== undefined) row.maintenance_request_summary = patch.summary;
      if (patch.description !== undefined) row.maintenance_request_description = patch.description;
      if (patch.priority !== undefined) row.maintenance_request_priority = patch.priority;
      if (patch.status !== undefined) row.maintenance_request_status = patch.status;
      if (patch.categoryId !== undefined) row.maintenance_category_id = patch.categoryId;
      if (patch.dueOn !== undefined) row.maintenance_request_due_on = patch.dueOn;
      if (patch.ownerProfileId !== undefined) row.maintenance_request_owner_profile_id = patch.ownerProfileId;
      if (patch.reportedByContactId !== undefined) row.maintenance_request_reported_by_contact_id = patch.reportedByContactId;
      if (patch.closedReason !== undefined) row.maintenance_request_closed_reason = patch.closedReason;
      if (patch.externalRef !== undefined) row.maintenance_request_external_ref = patch.externalRef;
      const { data: me } = await client.rpc("current_profile_id");
      if (me) row.maintenance_request_updated_by = me;
      const { error } = await client.from("maintenance_requests").update(row).eq("maintenance_request_id", id);
      if (error) throw error;
      return readRequest(id);
    },

    async listMaintenanceItems(requestId: string): Promise<MaintenanceItem[]> {
      const { data, error } = await client.from("maintenance_item_display").select(ITEM_COLUMNS).eq("maintenance_request_id", requestId)
        .order("maintenance_item_position").order("maintenance_item_created_at");
      if (error) throw error;
      return ((data ?? []) as unknown as ItemRow[]).map(fromItem);
    },
    async addMaintenanceItem(input): Promise<MaintenanceItem> {
      const { data: last } = await client.from("maintenance_items").select("maintenance_item_position").eq("maintenance_request_id", input.requestId)
        .order("maintenance_item_position", { ascending: false }).limit(1).maybeSingle();
      const position = ((last as { maintenance_item_position: number } | null)?.maintenance_item_position ?? 0) + 1;
      const { data, error } = await client.from("maintenance_items").insert({
        maintenance_request_id: input.requestId, maintenance_item_description: input.description, maintenance_item_location: input.location ?? null,
        maintenance_category_id: input.categoryId ?? null, maintenance_item_position: position
      }).select("maintenance_item_id").single();
      if (error) throw error;
      return readItem((data as { maintenance_item_id: string }).maintenance_item_id);
    },
    async updateMaintenanceItem(id, patch): Promise<MaintenanceItem> {
      const row: Record<string, unknown> = {};
      if (patch.description !== undefined) row.maintenance_item_description = patch.description;
      if (patch.location !== undefined) row.maintenance_item_location = patch.location;
      if (patch.categoryId !== undefined) row.maintenance_category_id = patch.categoryId;
      if (patch.status !== undefined) row.maintenance_item_status = patch.status;
      if (patch.isWarranty !== undefined) row.maintenance_item_is_warranty = patch.isWarranty;
      if (patch.cost !== undefined) row.maintenance_item_cost = patch.cost;
      if (patch.position !== undefined) row.maintenance_item_position = patch.position;
      const { data: me } = await client.rpc("current_profile_id");
      if (me) row.maintenance_item_updated_by = me;
      const { error } = await client.from("maintenance_items").update(row).eq("maintenance_item_id", id);
      if (error) throw error;
      return readItem(id);
    },
    async deleteMaintenanceItem(id: string): Promise<void> {
      const { error } = await client.from("maintenance_items").delete().eq("maintenance_item_id", id);
      if (error) throw error;
    },

    async offerMaintenanceItem(input): Promise<MaintenanceOffer> {
      const { data, error } = await client.rpc("offer_maintenance_item", {
        p_item: input.itemId, p_company: input.companyId ?? null, p_contact: input.contactId ?? null, p_note: input.note ?? null
      });
      if (error) throw error;
      const rows = (data ?? []) as { maintenance_assignment_id: string; accept_token: string; sent_to: string | null }[];
      const r = rows[0];
      if (!r) throw new Error("The offer was not recorded — the database returned nothing.");
      return { assignmentId: r.maintenance_assignment_id, acceptToken: r.accept_token, sentTo: r.sent_to };
    },
    async updateMaintenanceAssignment(id, patch): Promise<void> {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) {
        row.maintenance_assignment_status = patch.status;
        if (patch.status !== "offered") row.maintenance_assignment_responded_at = new Date().toISOString();
      }
      if (patch.scheduledFor !== undefined) row.maintenance_assignment_scheduled_for = patch.scheduledFor;
      if (patch.note !== undefined) row.maintenance_assignment_note = patch.note;
      const { data: me } = await client.rpc("current_profile_id");
      if (me) row.maintenance_assignment_updated_by = me;
      const { error } = await client.from("maintenance_assignments").update(row).eq("maintenance_assignment_id", id);
      if (error) throw error;
    },

    async listMaintenanceMessages(requestId: string): Promise<MaintenanceMessage[]> {
      const { data, error } = await client.from("maintenance_messages").select(MESSAGE_COLUMNS).eq("maintenance_request_id", requestId).order("maintenance_message_at");
      if (error) throw error;
      return ((data ?? []) as MessageRow[]).map(fromMessage);
    },
    async addMaintenanceNote(input): Promise<MaintenanceMessage> {
      const { data: me } = await client.rpc("current_profile_id");
      const { data, error } = await client.from("maintenance_messages").insert({
        maintenance_request_id: input.requestId, maintenance_assignment_id: input.assignmentId ?? null,
        maintenance_message_direction: "note", maintenance_message_channel: input.channel ?? "app",
        maintenance_message_from_profile_id: (me as string | null) ?? null, maintenance_message_body: input.body, maintenance_message_status: "noted"
      }).select(MESSAGE_COLUMNS).single();
      if (error) throw error;
      return fromMessage(data as MessageRow);
    },

    async getJobWarranty(jobId: string): Promise<JobWarranty | null> {
      const { data, error } = await client.from("job_warranty").select("job_id, job_handover_at, job_warranty_ends_on, job_is_in_warranty").eq("job_id", jobId).maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const r = data as { job_id: string; job_handover_at: string | null; job_warranty_ends_on: string | null; job_is_in_warranty: boolean | null };
      return { jobId: r.job_id, handoverAt: r.job_handover_at, warrantyEndsOn: r.job_warranty_ends_on, isInWarranty: r.job_is_in_warranty === true };
    },

    async listMaintenanceOutboxStats(): Promise<MaintenanceOutboxStat[]> {
      const { data, error } = await client.from("maintenance_messages").select("maintenance_message_status, maintenance_message_at")
        .eq("maintenance_message_direction", "out").order("maintenance_message_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const acc = new Map<string, MaintenanceOutboxStat>();
      for (const r of (data ?? []) as { maintenance_message_status: MaintenanceMessage["status"]; maintenance_message_at: string }[]) {
        const cur = acc.get(r.maintenance_message_status) ?? { status: r.maintenance_message_status, count: 0, lastAt: null };
        cur.count += 1;
        if (!cur.lastAt || r.maintenance_message_at > cur.lastAt) cur.lastAt = r.maintenance_message_at;
        acc.set(r.maintenance_message_status, cur);
      }
      return [...acc.values()].sort((a, b) => a.status.localeCompare(b.status));
    }
  };
}
