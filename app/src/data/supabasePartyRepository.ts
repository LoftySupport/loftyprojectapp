import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "./repository";
import type {
  Classification, Company, CompanyContact, CompanyPatch, Contact, ContactMethod, ContactPatch,
  NewCompany, NewContact, NewContactMethod, NewRecordParty, PartyRole, PartyTarget, RecordParty,
  RecordStaffRole, StaffRole
} from "./types";

/**
 * The parties half of the Supabase repository (0082): contacts, companies, how to reach
 * them, who works where, and who is on which record as what.
 *
 * Reads come off the three display views — `contact_display`, `company_display`,
 * `record_party_display` — so "the company beside the person" is resolved once in the
 * database from the current employment row, and this file never joins it by hand. Writes
 * go to the tables and re-read through the view, so a caller always gets the derived
 * columns back.
 *
 * Nothing here decides who may do what. A user creating a contact gets an unapproved one
 * because the trigger says so; a manager approving it gets stamped because the trigger
 * says so; the app only shows the buttons.
 */

type PartyMethods = Pick<Repository,
  | "listClassifications" | "saveClassification" | "listPartyRoles" | "savePartyRole" | "listStaffRoles" | "saveStaffRole"
  | "listContacts" | "getContact" | "createContact" | "updateContact" | "approveContact" | "setContactClassifications"
  | "listCompanies" | "getCompany" | "createCompany" | "updateCompany" | "approveCompany" | "setCompanyClassifications"
  | "listContactMethods" | "addContactMethod" | "updateContactMethod" | "deleteContactMethod"
  | "listCompanyContacts" | "addCompanyContact" | "updateCompanyContact"
  | "listRecordParties" | "addRecordParty" | "updateRecordParty" | "deleteRecordParty"
  | "listRecordStaffRoles" | "addRecordStaffRole" | "endRecordStaffRole"
>;

const CONTACT_COLUMNS =
  "contact_id, contact_first_name, contact_last_name, contact_full_name, contact_preferred_name, contact_address_id, contact_address, contact_notes, contact_profile_id, contact_source, contact_is_active, contact_approved_at, contact_approved_by, contact_primary_email, contact_primary_phone, contact_company_id, contact_company_name, contact_job_role, contact_classification_ids, contact_open_parties, contact_created_at, contact_updated_at";

interface ContactRow {
  contact_id: string; contact_first_name: string; contact_last_name: string | null; contact_full_name: string;
  contact_preferred_name: string | null; contact_address_id: string | null; contact_address: string | null;
  contact_notes: string | null; contact_profile_id: string | null; contact_source: Contact["source"];
  contact_is_active: boolean; contact_approved_at: string | null; contact_approved_by: string | null;
  contact_primary_email: string | null; contact_primary_phone: string | null;
  contact_company_id: string | null; contact_company_name: string | null; contact_job_role: string | null;
  contact_classification_ids: string[]; contact_open_parties: number;
  contact_created_at: string; contact_updated_at: string;
}

const toContact = (r: ContactRow): Contact => ({
  id: r.contact_id, firstName: r.contact_first_name, lastName: r.contact_last_name, fullName: r.contact_full_name,
  preferredName: r.contact_preferred_name, addressId: r.contact_address_id, address: r.contact_address,
  notes: r.contact_notes, profileId: r.contact_profile_id, source: r.contact_source, isActive: r.contact_is_active,
  approvedAt: r.contact_approved_at, approvedBy: r.contact_approved_by,
  primaryEmail: r.contact_primary_email, primaryPhone: r.contact_primary_phone,
  companyId: r.contact_company_id, companyName: r.contact_company_name, jobRole: r.contact_job_role,
  classificationIds: r.contact_classification_ids ?? [], openParties: r.contact_open_parties,
  createdAt: r.contact_created_at, updatedAt: r.contact_updated_at
});

const COMPANY_COLUMNS =
  "company_id, company_name, company_trading_name, company_abn, company_address_id, company_address, company_notes, company_source, company_is_active, company_approved_at, company_approved_by, company_primary_email, company_primary_phone, company_classification_ids, company_people_count, company_open_parties, company_created_at, company_updated_at";

interface CompanyRow {
  company_id: string; company_name: string; company_trading_name: string | null; company_abn: string | null;
  company_address_id: string | null; company_address: string | null; company_notes: string | null;
  company_source: Company["source"]; company_is_active: boolean;
  company_approved_at: string | null; company_approved_by: string | null;
  company_primary_email: string | null; company_primary_phone: string | null;
  company_classification_ids: string[]; company_people_count: number; company_open_parties: number;
  company_created_at: string; company_updated_at: string;
}

const toCompany = (r: CompanyRow): Company => ({
  id: r.company_id, name: r.company_name, tradingName: r.company_trading_name, abn: r.company_abn,
  addressId: r.company_address_id, address: r.company_address, notes: r.company_notes, source: r.company_source,
  isActive: r.company_is_active, approvedAt: r.company_approved_at, approvedBy: r.company_approved_by,
  primaryEmail: r.company_primary_email, primaryPhone: r.company_primary_phone,
  classificationIds: r.company_classification_ids ?? [], peopleCount: r.company_people_count, openParties: r.company_open_parties,
  createdAt: r.company_created_at, updatedAt: r.company_updated_at
});

const METHOD_COLUMNS =
  "contact_method_id, contact_id, company_id, contact_method_kind, contact_method_value, contact_method_label, contact_method_is_primary, contact_method_is_verified";
interface MethodRow {
  contact_method_id: string; contact_id: string | null; company_id: string | null;
  contact_method_kind: ContactMethod["kind"]; contact_method_value: string; contact_method_label: string | null;
  contact_method_is_primary: boolean; contact_method_is_verified: boolean;
}
const toMethod = (r: MethodRow): ContactMethod => ({
  id: r.contact_method_id, contactId: r.contact_id, companyId: r.company_id, kind: r.contact_method_kind,
  value: r.contact_method_value, label: r.contact_method_label, isPrimary: r.contact_method_is_primary, isVerified: r.contact_method_is_verified
});

// Both embeds name their key: company_contacts points at profiles twice (created_by,
// updated_by) and PostgREST will not guess; companies and contacts once each, named anyway.
const EMPLOYMENT_COLUMNS =
  "company_contact_id, company_id, contact_id, company_contact_job_role, company_contact_is_primary, company_contact_started_on, company_contact_ended_on, company:companies!company_contacts_company_id_fkey(company_name), person:contacts!company_contacts_contact_id_fkey(contact_full_name)";
interface EmploymentRow {
  company_contact_id: string; company_id: string; contact_id: string; company_contact_job_role: string | null;
  company_contact_is_primary: boolean; company_contact_started_on: string | null; company_contact_ended_on: string | null;
  company: { company_name: string } | null; person: { contact_full_name: string } | null;
}
const toEmployment = (r: EmploymentRow): CompanyContact => ({
  id: r.company_contact_id, companyId: r.company_id, companyName: r.company?.company_name ?? "", contactId: r.contact_id,
  contactName: r.person?.contact_full_name ?? "", jobRole: r.company_contact_job_role, isPrimary: r.company_contact_is_primary,
  startedOn: r.company_contact_started_on, endedOn: r.company_contact_ended_on
});

const PARTY_COLUMNS =
  "record_party_id, project_id, job_id, process_run_id, record_job_id, record_project_id, contact_id, contact_full_name, company_id, company_name, party_role_id, party_role_name, record_party_engaged_by_company_id, record_party_engaged_by_company_name, record_party_is_primary, record_party_started_on, record_party_ended_on, record_party_note, process_name, contact_email, contact_phone";
interface PartyRow {
  record_party_id: string; project_id: number | null; job_id: string | null; process_run_id: string | null;
  record_job_id: string | null; record_project_id: number | null;
  contact_id: string | null; contact_full_name: string | null; company_id: string | null; company_name: string | null;
  party_role_id: string; party_role_name: string;
  record_party_engaged_by_company_id: string | null; record_party_engaged_by_company_name: string | null;
  record_party_is_primary: boolean; record_party_started_on: string; record_party_ended_on: string | null; record_party_note: string | null;
  process_name: string | null; contact_email: string | null; contact_phone: string | null;
}
const toParty = (r: PartyRow): RecordParty => ({
  id: r.record_party_id, projectId: r.project_id, jobId: r.job_id, processRunId: r.process_run_id,
  recordJobId: r.record_job_id, recordProjectId: r.record_project_id,
  contactId: r.contact_id, contactName: r.contact_full_name, companyId: r.company_id, companyName: r.company_name,
  roleId: r.party_role_id, roleName: r.party_role_name,
  engagedByCompanyId: r.record_party_engaged_by_company_id, engagedByCompanyName: r.record_party_engaged_by_company_name,
  isPrimary: r.record_party_is_primary, startedOn: r.record_party_started_on, endedOn: r.record_party_ended_on, note: r.record_party_note,
  processName: r.process_name, contactEmail: r.contact_email, contactPhone: r.contact_phone
});

const STAFF_ROLE_COLUMNS =
  "record_staff_role_id, project_id, job_id, staff_role_id, profile_id, record_staff_role_started_on, record_staff_role_ended_on, role:staff_roles!record_staff_roles_staff_role_id_fkey(staff_role_abbreviation, staff_role_name), person:profiles!record_staff_roles_profile_id_fkey(profile_full_name)";
interface StaffRoleRow {
  record_staff_role_id: string; project_id: number | null; job_id: string | null; staff_role_id: string; profile_id: string;
  record_staff_role_started_on: string; record_staff_role_ended_on: string | null;
  role: { staff_role_abbreviation: string; staff_role_name: string } | null; person: { profile_full_name: string } | null;
}
const toStaffRole = (r: StaffRoleRow): RecordStaffRole => ({
  id: r.record_staff_role_id, projectId: r.project_id, jobId: r.job_id, roleId: r.staff_role_id,
  roleAbbreviation: r.role?.staff_role_abbreviation ?? "", roleName: r.role?.staff_role_name ?? "",
  profileId: r.profile_id, profileName: r.person?.profile_full_name ?? "",
  startedOn: r.record_staff_role_started_on, endedOn: r.record_staff_role_ended_on
});

/** Postgres `or=` filter escaping for a search term: commas and parentheses would break the filter. */
const ilike = (s: string) => `%${s.replace(/[%,()]/g, " ").trim()}%`;

export function partyMethods(client: SupabaseClient): PartyMethods {
  const readContact = async (id: string): Promise<Contact> => {
    const { data, error } = await client.from("contact_display").select(CONTACT_COLUMNS).eq("contact_id", id).single();
    if (error) throw error;
    return toContact(data as unknown as ContactRow);
  };
  const readCompany = async (id: string): Promise<Company> => {
    const { data, error } = await client.from("company_display").select(COMPANY_COLUMNS).eq("company_id", id).single();
    if (error) throw error;
    return toCompany(data as unknown as CompanyRow);
  };
  const readParty = async (id: string): Promise<RecordParty> => {
    const { data, error } = await client.from("record_party_display").select(PARTY_COLUMNS).eq("record_party_id", id).single();
    if (error) throw error;
    return toParty(data as unknown as PartyRow);
  };
  const readEmployment = async (id: string): Promise<CompanyContact> => {
    const { data, error } = await client.from("company_contacts").select(EMPLOYMENT_COLUMNS).eq("company_contact_id", id).single();
    if (error) throw error;
    return toEmployment(data as unknown as EmploymentRow);
  };
  const readStaffRole = async (id: string): Promise<RecordStaffRole> => {
    const { data, error } = await client.from("record_staff_roles").select(STAFF_ROLE_COLUMNS).eq("record_staff_role_id", id).single();
    if (error) throw error;
    return toStaffRole(data as unknown as StaffRoleRow);
  };

  return {
    // ---- lookups ----------------------------------------------------------
    async listClassifications(): Promise<Classification[]> {
      const { data, error } = await client.from("classifications")
        .select("classification_id, classification_name, classification_applies_to, classification_position, classification_is_active")
        .order("classification_position").order("classification_name");
      if (error) throw error;
      return ((data ?? []) as { classification_id: string; classification_name: string; classification_applies_to: Classification["appliesTo"]; classification_position: number; classification_is_active: boolean }[])
        .map(r => ({ id: r.classification_id, name: r.classification_name, appliesTo: r.classification_applies_to, position: r.classification_position, isActive: r.classification_is_active }));
    },
    async saveClassification(row: Classification): Promise<Classification> {
      const { error } = await client.from("classifications").upsert({
        classification_id: row.id, classification_name: row.name.trim(), classification_applies_to: row.appliesTo,
        classification_position: row.position, classification_is_active: row.isActive
      }, { onConflict: "classification_id" });
      if (error) throw error;
      return row;
    },
    async listPartyRoles(): Promise<PartyRole[]> {
      const { data, error } = await client.from("party_roles")
        .select("party_role_id, party_role_name, party_role_applies_to, party_role_position, party_role_is_active")
        .order("party_role_position").order("party_role_name");
      if (error) throw error;
      return ((data ?? []) as { party_role_id: string; party_role_name: string; party_role_applies_to: PartyRole["appliesTo"]; party_role_position: number; party_role_is_active: boolean }[])
        .map(r => ({ id: r.party_role_id, name: r.party_role_name, appliesTo: r.party_role_applies_to, position: r.party_role_position, isActive: r.party_role_is_active }));
    },
    async savePartyRole(row: PartyRole): Promise<PartyRole> {
      const { error } = await client.from("party_roles").upsert({
        party_role_id: row.id, party_role_name: row.name.trim(), party_role_applies_to: row.appliesTo,
        party_role_position: row.position, party_role_is_active: row.isActive
      }, { onConflict: "party_role_id" });
      if (error) throw error;
      return row;
    },
    async listStaffRoles(): Promise<StaffRole[]> {
      const { data, error } = await client.from("staff_roles")
        .select("staff_role_id, staff_role_abbreviation, staff_role_name, staff_role_position, staff_role_is_active")
        .order("staff_role_position");
      if (error) throw error;
      return ((data ?? []) as { staff_role_id: string; staff_role_abbreviation: string; staff_role_name: string; staff_role_position: number; staff_role_is_active: boolean }[])
        .map(r => ({ id: r.staff_role_id, abbreviation: r.staff_role_abbreviation, name: r.staff_role_name, position: r.staff_role_position, isActive: r.staff_role_is_active }));
    },
    async saveStaffRole(row: StaffRole): Promise<StaffRole> {
      const { error } = await client.from("staff_roles").upsert({
        staff_role_id: row.id, staff_role_abbreviation: row.abbreviation.trim().toUpperCase(), staff_role_name: row.name.trim(),
        staff_role_position: row.position, staff_role_is_active: row.isActive
      }, { onConflict: "staff_role_id" });
      if (error) throw error;
      return row;
    },

    // ---- contacts -----------------------------------------------------------
    async listContacts(opts = {}): Promise<Contact[]> {
      let q = client.from("contact_display").select(CONTACT_COLUMNS);
      if (!opts.includeInactive) q = q.eq("contact_is_active", true);
      const s = opts.search?.trim();
      if (s) q = q.or(`contact_full_name.ilike.${ilike(s)},contact_primary_email.ilike.${ilike(s)},contact_primary_phone.ilike.${ilike(s)},contact_company_name.ilike.${ilike(s)}`);
      const { data, error } = await q.order("contact_full_name").limit(500);
      if (error) throw error;
      return (data as unknown as ContactRow[]).map(toContact);
    },
    async getContact(id: string): Promise<Contact | null> {
      const { data, error } = await client.from("contact_display").select(CONTACT_COLUMNS).eq("contact_id", id).maybeSingle();
      if (error) throw error;
      return data ? toContact(data as unknown as ContactRow) : null;
    },
    async createContact(input: NewContact): Promise<Contact> {
      const first = input.firstName.trim();
      if (!first) throw new Error("A contact needs at least a first name.");
      const { data, error } = await client.from("contacts").insert({
        contact_first_name: first,
        contact_last_name: input.lastName?.trim() || null,
        contact_preferred_name: input.preferredName?.trim() || null,
        contact_notes: input.notes?.trim() || null
      }).select("contact_id").single();
      if (error) throw error;
      const id = (data as { contact_id: string }).contact_id;
      // The rest are their own rows, each refused or accepted by its own table.
      if (input.email?.trim()) await this.addContactMethod({ contactId: id, kind: "email", value: input.email.trim(), isPrimary: true });
      if (input.phone?.trim()) await this.addContactMethod({ contactId: id, kind: /^0?4/.test(input.phone.replace(/\s/g, "")) ? "mobile" : "phone", value: input.phone.trim(), isPrimary: true });
      if (input.classificationIds?.length) await this.setContactClassifications(id, input.classificationIds);
      if (input.companyId) await this.addCompanyContact({ companyId: input.companyId, contactId: id, jobRole: input.jobRole ?? null, isPrimary: true });
      return readContact(id);
    },
    async updateContact(id: string, patch: ContactPatch): Promise<Contact> {
      const row: Record<string, unknown> = {};
      if (patch.firstName !== undefined) row.contact_first_name = patch.firstName.trim();
      if (patch.lastName !== undefined) row.contact_last_name = patch.lastName?.trim() || null;
      if (patch.preferredName !== undefined) row.contact_preferred_name = patch.preferredName?.trim() || null;
      if (patch.addressId !== undefined) row.contact_address_id = patch.addressId;
      if (patch.notes !== undefined) row.contact_notes = patch.notes?.trim() || null;
      if (patch.isActive !== undefined) row.contact_is_active = patch.isActive;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");
      const { error } = await client.from("contacts").update(row).eq("contact_id", id);
      if (error) throw error;
      return readContact(id);
    },
    async approveContact(id: string, approved: boolean): Promise<Contact> {
      // The trigger stamps the time and the person; the app only says yes or no.
      const { error } = await client.from("contacts")
        .update({ contact_approved_at: approved ? new Date().toISOString() : null, contact_approved_by: null })
        .eq("contact_id", id);
      if (error) throw error;
      return readContact(id);
    },
    async setContactClassifications(id: string, classificationIds: string[]): Promise<void> {
      const { data: have, error: readError } = await client.from("contact_classifications").select("classification_id").eq("contact_id", id);
      if (readError) throw readError;
      const had = new Set(((have ?? []) as { classification_id: string }[]).map(r => r.classification_id));
      const want = new Set(classificationIds);
      const remove = [...had].filter(k => !want.has(k));
      const add = [...want].filter(k => !had.has(k));
      if (remove.length) {
        const { error } = await client.from("contact_classifications").delete().eq("contact_id", id).in("classification_id", remove);
        if (error) throw error;
      }
      if (add.length) {
        const { error } = await client.from("contact_classifications").insert(add.map(k => ({ contact_id: id, classification_id: k })));
        if (error) throw error;
      }
    },

    // ---- companies ----------------------------------------------------------
    async listCompanies(opts = {}): Promise<Company[]> {
      let q = client.from("company_display").select(COMPANY_COLUMNS);
      if (!opts.includeInactive) q = q.eq("company_is_active", true);
      const s = opts.search?.trim();
      if (s) q = q.or(`company_name.ilike.${ilike(s)},company_trading_name.ilike.${ilike(s)},company_abn.ilike.${ilike(s)},company_primary_email.ilike.${ilike(s)}`);
      const { data, error } = await q.order("company_name").limit(500);
      if (error) throw error;
      return (data as unknown as CompanyRow[]).map(toCompany);
    },
    async getCompany(id: string): Promise<Company | null> {
      const { data, error } = await client.from("company_display").select(COMPANY_COLUMNS).eq("company_id", id).maybeSingle();
      if (error) throw error;
      return data ? toCompany(data as unknown as CompanyRow) : null;
    },
    async createCompany(input: NewCompany): Promise<Company> {
      const name = input.name.trim();
      if (!name) throw new Error("A company needs a name.");
      const { data, error } = await client.from("companies").insert({
        company_name: name,
        company_trading_name: input.tradingName?.trim() || null,
        company_abn: input.abn ? input.abn.replace(/\s/g, "") : null,
        company_notes: input.notes?.trim() || null
      }).select("company_id").single();
      if (error) throw error;
      const id = (data as { company_id: string }).company_id;
      if (input.email?.trim()) await this.addContactMethod({ companyId: id, kind: "email", value: input.email.trim(), isPrimary: true });
      if (input.phone?.trim()) await this.addContactMethod({ companyId: id, kind: "phone", value: input.phone.trim(), isPrimary: true });
      if (input.classificationIds?.length) await this.setCompanyClassifications(id, input.classificationIds);
      return readCompany(id);
    },
    async updateCompany(id: string, patch: CompanyPatch): Promise<Company> {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.company_name = patch.name.trim();
      if (patch.tradingName !== undefined) row.company_trading_name = patch.tradingName?.trim() || null;
      if (patch.abn !== undefined) row.company_abn = patch.abn ? patch.abn.replace(/\s/g, "") : null;
      if (patch.addressId !== undefined) row.company_address_id = patch.addressId;
      if (patch.notes !== undefined) row.company_notes = patch.notes?.trim() || null;
      if (patch.isActive !== undefined) row.company_is_active = patch.isActive;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");
      const { error } = await client.from("companies").update(row).eq("company_id", id);
      if (error) throw error;
      return readCompany(id);
    },
    async approveCompany(id: string, approved: boolean): Promise<Company> {
      const { error } = await client.from("companies")
        .update({ company_approved_at: approved ? new Date().toISOString() : null, company_approved_by: null })
        .eq("company_id", id);
      if (error) throw error;
      return readCompany(id);
    },
    async setCompanyClassifications(id: string, classificationIds: string[]): Promise<void> {
      const { data: have, error: readError } = await client.from("company_classifications").select("classification_id").eq("company_id", id);
      if (readError) throw readError;
      const had = new Set(((have ?? []) as { classification_id: string }[]).map(r => r.classification_id));
      const want = new Set(classificationIds);
      const remove = [...had].filter(k => !want.has(k));
      const add = [...want].filter(k => !had.has(k));
      if (remove.length) {
        const { error } = await client.from("company_classifications").delete().eq("company_id", id).in("classification_id", remove);
        if (error) throw error;
      }
      if (add.length) {
        const { error } = await client.from("company_classifications").insert(add.map(k => ({ company_id: id, classification_id: k })));
        if (error) throw error;
      }
    },

    // ---- methods --------------------------------------------------------------
    async listContactMethods(party): Promise<ContactMethod[]> {
      let q = client.from("contact_methods").select(METHOD_COLUMNS);
      if (party.contactId) q = q.eq("contact_id", party.contactId);
      else if (party.companyId) q = q.eq("company_id", party.companyId);
      else throw new Error("listContactMethods needs a contact or a company.");
      const { data, error } = await q.order("contact_method_kind").order("contact_method_is_primary", { ascending: false }).order("contact_method_created_at");
      if (error) throw error;
      return (data as unknown as MethodRow[]).map(toMethod);
    },
    async addContactMethod(input: NewContactMethod): Promise<ContactMethod> {
      const value = input.value.trim();
      if (!value) throw new Error("Type the email or number first.");
      if ((input.contactId == null) === (input.companyId == null)) throw new Error("A contact method belongs to exactly one contact or one company.");
      const { data, error } = await client.from("contact_methods").insert({
        contact_id: input.contactId ?? null, company_id: input.companyId ?? null,
        contact_method_kind: input.kind, contact_method_value: input.kind === "email" ? value.toLowerCase() : value,
        contact_method_label: input.label?.trim() || null, contact_method_is_primary: input.isPrimary ?? false
      }).select(METHOD_COLUMNS).single();
      if (error) throw error;
      return toMethod(data as unknown as MethodRow);
    },
    async updateContactMethod(id, patch): Promise<ContactMethod> {
      const row: Record<string, unknown> = {};
      if (patch.value !== undefined) row.contact_method_value = patch.value.trim();
      if (patch.label !== undefined) row.contact_method_label = patch.label?.trim() || null;
      if (patch.isPrimary !== undefined) row.contact_method_is_primary = patch.isPrimary;
      if (patch.isVerified !== undefined) row.contact_method_is_verified = patch.isVerified;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");
      // Making one primary demotes the current primary of the same kind first, so the
      // partial unique index does not refuse the promotion.
      if (patch.isPrimary) {
        const { data: cur } = await client.from("contact_methods").select("contact_id, company_id, contact_method_kind").eq("contact_method_id", id).single();
        const c = cur as { contact_id: string | null; company_id: string | null; contact_method_kind: string } | null;
        if (c) {
          let demote = client.from("contact_methods").update({ contact_method_is_primary: false })
            .eq("contact_method_kind", c.contact_method_kind).neq("contact_method_id", id);
          demote = c.contact_id ? demote.eq("contact_id", c.contact_id) : demote.eq("company_id", c.company_id!);
          const { error } = await demote;
          if (error) throw error;
        }
      }
      const { data, error } = await client.from("contact_methods").update(row).eq("contact_method_id", id).select(METHOD_COLUMNS).single();
      if (error) throw error;
      return toMethod(data as unknown as MethodRow);
    },
    async deleteContactMethod(id: string): Promise<void> {
      const { error } = await client.from("contact_methods").delete().eq("contact_method_id", id);
      if (error) throw error;
    },

    // ---- employment -----------------------------------------------------------
    async listCompanyContacts(party): Promise<CompanyContact[]> {
      let q = client.from("company_contacts").select(EMPLOYMENT_COLUMNS);
      if (party.contactId) q = q.eq("contact_id", party.contactId);
      else if (party.companyId) q = q.eq("company_id", party.companyId);
      else throw new Error("listCompanyContacts needs a contact or a company.");
      const { data, error } = await q.order("company_contact_ended_on", { ascending: true, nullsFirst: true }).order("company_contact_is_primary", { ascending: false });
      if (error) throw error;
      return (data as unknown as EmploymentRow[]).map(toEmployment);
    },
    async addCompanyContact(input): Promise<CompanyContact> {
      const { data, error } = await client.from("company_contacts").insert({
        company_id: input.companyId, contact_id: input.contactId,
        company_contact_job_role: input.jobRole?.trim() || null,
        company_contact_is_primary: input.isPrimary ?? false,
        company_contact_started_on: input.startedOn ?? null
      }).select("company_contact_id").single();
      if (error) throw error;
      return readEmployment((data as { company_contact_id: string }).company_contact_id);
    },
    async updateCompanyContact(id, patch): Promise<CompanyContact> {
      const row: Record<string, unknown> = {};
      if (patch.jobRole !== undefined) row.company_contact_job_role = patch.jobRole?.trim() || null;
      if (patch.isPrimary !== undefined) row.company_contact_is_primary = patch.isPrimary;
      if (patch.endedOn !== undefined) row.company_contact_ended_on = patch.endedOn;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");
      const { error } = await client.from("company_contacts").update(row).eq("company_contact_id", id);
      if (error) throw error;
      return readEmployment(id);
    },

    // ---- parties on records ----------------------------------------------------
    async listRecordParties(target): Promise<RecordParty[]> {
      let q = client.from("record_party_display").select(PARTY_COLUMNS);
      if ("jobId" in target) q = q.eq("record_job_id", target.jobId);
      else if ("projectId" in target) q = q.eq("record_project_id", target.projectId);
      else if ("processRunId" in target) q = q.eq("process_run_id", target.processRunId);
      else if ("contactId" in target) q = q.eq("contact_id", target.contactId);
      else if ("companyId" in target) q = q.or(`company_id.eq.${target.companyId},record_party_engaged_by_company_id.eq.${target.companyId}`);
      else throw new Error("listRecordParties needs a record, a contact or a company.");
      const { data, error } = await q
        .order("record_party_ended_on", { ascending: true, nullsFirst: true })
        .order("record_party_is_primary", { ascending: false })
        .order("record_party_started_on", { ascending: false });
      if (error) throw error;
      return (data as unknown as PartyRow[]).map(toParty);
    },
    async addRecordParty(input: NewRecordParty): Promise<RecordParty> {
      const targets = [input.projectId != null, input.jobId != null, input.processRunId != null].filter(Boolean).length;
      if (targets !== 1) throw new Error("A party belongs to exactly one project, job or process run.");
      if (!input.contactId && !input.companyId) throw new Error("Name a person or a company.");
      const { data, error } = await client.from("record_parties").insert({
        project_id: input.projectId ?? null, job_id: input.jobId ?? null, process_run_id: input.processRunId ?? null,
        contact_id: input.contactId ?? null, company_id: input.companyId ?? null,
        party_role_id: input.roleId, record_party_engaged_by_company_id: input.engagedByCompanyId ?? null,
        record_party_is_primary: input.isPrimary ?? false, record_party_note: input.note?.trim() || null
      }).select("record_party_id").single();
      if (error) throw error;
      return readParty((data as { record_party_id: string }).record_party_id);
    },
    async updateRecordParty(id, patch): Promise<RecordParty> {
      const row: Record<string, unknown> = {};
      if (patch.roleId !== undefined) row.party_role_id = patch.roleId;
      if (patch.engagedByCompanyId !== undefined) row.record_party_engaged_by_company_id = patch.engagedByCompanyId;
      if (patch.isPrimary !== undefined) row.record_party_is_primary = patch.isPrimary;
      if (patch.note !== undefined) row.record_party_note = patch.note?.trim() || null;
      if (patch.endedOn !== undefined) row.record_party_ended_on = patch.endedOn;
      if (Object.keys(row).length === 0) throw new Error("Nothing to change.");
      const { error } = await client.from("record_parties").update(row).eq("record_party_id", id);
      if (error) throw error;
      return readParty(id);
    },
    async deleteRecordParty(id: string): Promise<void> {
      const { error } = await client.from("record_parties").delete().eq("record_party_id", id);
      if (error) throw error;
    },

    // ---- staff roles -------------------------------------------------------------
    async listRecordStaffRoles(target): Promise<RecordStaffRole[]> {
      let q = client.from("record_staff_roles").select(STAFF_ROLE_COLUMNS);
      if (target.jobId != null) q = q.eq("job_id", target.jobId);
      else if (target.projectId != null) q = q.eq("project_id", target.projectId);
      else throw new Error("listRecordStaffRoles needs a project or a job.");
      const { data, error } = await q.order("record_staff_role_ended_on", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data as unknown as StaffRoleRow[]).map(toStaffRole)
        .sort((a, b) => (a.endedOn ? 1 : 0) - (b.endedOn ? 1 : 0));
    },
    async addRecordStaffRole(input): Promise<RecordStaffRole> {
      const { data, error } = await client.from("record_staff_roles").insert({
        project_id: input.projectId ?? null, job_id: input.jobId ?? null, staff_role_id: input.roleId, profile_id: input.profileId
      }).select("record_staff_role_id").single();
      if (error) throw error;
      return readStaffRole((data as { record_staff_role_id: string }).record_staff_role_id);
    },
    async endRecordStaffRole(id: string, endedOn: string): Promise<RecordStaffRole> {
      const { error } = await client.from("record_staff_roles").update({ record_staff_role_ended_on: endedOn }).eq("record_staff_role_id", id);
      if (error) throw error;
      return readStaffRole(id);
    }
  };
}

export type { PartyTarget };
