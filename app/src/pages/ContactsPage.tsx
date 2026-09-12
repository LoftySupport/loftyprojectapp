import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Checkbox, Heading, Tab, TabList, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Field, Problem } from "../components/Form";
import { SidePanel } from "../components/SidePanel";
import { Select } from "../components/Select";
import { useOneLine } from "../components/Toolbar";
import {
  CONTACT_METHOD_KINDS, CONTACT_METHOD_LABELS,
  type Company, type Contact, type ContactMethodKind, type RecordParty
} from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Contacts (0082): the people and companies outside Lofty, with the company beside each
 * person (Amber, 1 Sep: "a list of contacts that shows the company as part of that
 * contact even though the company will be a separate table").
 *
 * Two tabs, one list each, a detail beside the list on a desk and under it on a phone.
 * Search covers name, email, phone and company. A person or company a user created and
 * no manager has signed off wears an "awaiting sign-off" chip and is otherwise ordinary —
 * usable on a job today, checked by a manager tomorrow.
 *
 * Every write here goes to its own table — a phone number is a contact_methods row, a
 * classification a junction row, a job a company_contacts row — and the list is a view
 * over them. Nothing is denormalised into the person.
 */
export function ContactsPage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermission();
  /** Below 720px the create button moves onto the heading's line — see `useOneLine`. */
  const oneLine = useOneLine();
  const tab = params.get("company") ? 1 : params.get("tab") === "companies" ? 1 : 0;
  const selectedPerson = params.get("person");
  const selectedCompany = params.get("company");
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const [creating, setCreating] = useState(params.get("new") === "1");
  const { data: contacts, loading: peopleLoading } = useQuery(r => r.listContacts({ search }), [], [search, reload]);
  const { data: companies, loading: companiesLoading } = useQuery(r => r.listCompanies({ search }), [], [search, reload]);
  const { data: classifications } = useQuery(r => r.listClassifications(), []);
  const bump = () => setReload(n => n + 1);

  const classLabel = (id: string) => classifications.find(c => c.id === id)?.name ?? id;
  const pending = contacts.filter(c => !c.approvedAt).length + companies.filter(c => !c.approvedAt).length;

  const select = (kind: "person" | "company", id: string | null) => {
    const next = new URLSearchParams(params);
    next.delete("person"); next.delete("company"); next.delete("new");
    if (id) next.set(kind, id);
    if (kind === "company" || tab === 1) next.set("tab", "companies"); else next.delete("tab");
    setParams(next, { replace: true });
  };
  const setTab = (i: number) => {
    const next = new URLSearchParams();
    if (i === 1) next.set("tab", "companies");
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="page-head page-head-row">
        {/* No line under the heading (12 September). The counts beside it stay. */}
        <div>
          <Heading type="h2" weight="bold">Contacts</Heading>
        </div>
        <Text type="text3" color="secondary">
          {contacts.length} people · {companies.length} companies{pending > 0 && can("manager") ? ` · ${pending} awaiting sign-off` : ""}
        </Text>
        {/* The create button rides the heading's line on a phone and stays in the
            toolbar at a desk — Amber, 12 September. One or the other, never both. */}
        {oneLine && can("user") && (
          <Button size="small" onClick={() => { setCreating(true); select("person", null); }}>
            {tab === 1 ? "+ New company" : "+ New person"}
          </Button>
        )}
      </div>

      <div className="toolbar">
        <TabList activeTabId={tab} onTabChange={setTab}>
          <Tab>People</Tab>
          <Tab>Companies</Tab>
        </TabList>
        <TextField size="small" id="contacts-search" inputAriaLabel="Search contacts" placeholder="Search name, email, phone, company…" value={search} onChange={setSearch} />
        {!oneLine && can("user") && <Button size="small" onClick={() => { setCreating(true); select("person", null); }}>{tab === 1 ? "+ New company" : "+ New person"}</Button>}
      </div>

      {/*
        The list is full width, and the record opens over it in the shared slideout.
        This was `contacts-grid has-detail` — a detail column beside the list — which
        Amber, 3 September, ruled out for every page: "ensure all pages open items in the
        slideout side bar (can expand to full width) and is width adjustable". A column
        cannot do any of those three: it halves the list, it has no expand and no grab
        edge. SidePanel has all three and is the same panel Jobs, Projects and Processes
        already use, so the record reads the same everywhere.
      */}
      <section className="panel">
          {tab === 0 ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Name</th><th>Company</th><th>Role there</th><th>Email</th><th>Phone</th><th>Is</th><th className="num">On</th></tr></thead>
                <tbody>
                  {contacts.map(c => (
                    <tr key={c.id} className={`contact-row${selectedPerson === c.id ? " is-selected" : ""}`} onClick={() => { setCreating(false); select("person", c.id); }}>
                      <td>
                        <button type="button" className="link-button tap-link" onClick={e => { e.stopPropagation(); setCreating(false); select("person", c.id); }}>
                          <strong>{c.fullName}</strong>
                        </button>
                        {!c.approvedAt && <span className="approval-chip" style={{ marginLeft: 8 }}>awaiting sign-off</span>}
                      </td>
                      <td>{c.companyName ?? <span className="muted">—</span>}</td>
                      <td className="muted">{c.jobRole ?? "—"}</td>
                      <td>{c.primaryEmail ? <a href={`mailto:${c.primaryEmail}`} className="tap-link" onClick={e => e.stopPropagation()}>{c.primaryEmail}</a> : <span className="muted">—</span>}</td>
                      <td className="nowrap">{c.primaryPhone ? <a href={`tel:${c.primaryPhone.replace(/\s/g, "")}`} className="tap-link" onClick={e => e.stopPropagation()}>{c.primaryPhone}</a> : <span className="muted">—</span>}</td>
                      <td><span className="contact-classes">{c.classificationIds.map(k => <span key={k} className="slot-chip" style={{ marginLeft: 0 }}>{classLabel(k)}</span>)}</span></td>
                      <td className="num">{c.openParties || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!peopleLoading && contacts.length === 0 && (
                <Text type="text2" color="secondary" element="p" ellipsis={false}>
                  {search ? `Nobody matches “${search}”.` : "No people yet. Add the first — a purchaser, a tradesperson — and they can be put on a job straight away."}
                </Text>
              )}
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>Company</th><th>ABN</th><th>Email</th><th>Phone</th><th>Is</th><th className="num">People</th><th className="num">On</th></tr></thead>
                <tbody>
                  {companies.map(c => (
                    <tr key={c.id} className={`contact-row${selectedCompany === c.id ? " is-selected" : ""}`} onClick={() => { setCreating(false); select("company", c.id); }}>
                      <td>
                        <button type="button" className="link-button tap-link" onClick={e => { e.stopPropagation(); setCreating(false); select("company", c.id); }}>
                          <strong>{c.name}</strong>
                        </button>
                        {c.tradingName && <span className="slot-sub"> t/a {c.tradingName}</span>}
                        {!c.approvedAt && <span className="approval-chip" style={{ marginLeft: 8 }}>awaiting sign-off</span>}
                      </td>
                      <td className="nowrap num">{c.abn ? fmtAbn(c.abn) : <span className="muted">—</span>}</td>
                      <td>{c.primaryEmail ? <a href={`mailto:${c.primaryEmail}`} className="tap-link" onClick={e => e.stopPropagation()}>{c.primaryEmail}</a> : <span className="muted">—</span>}</td>
                      <td className="nowrap">{c.primaryPhone ?? <span className="muted">—</span>}</td>
                      <td><span className="contact-classes">{c.classificationIds.map(k => <span key={k} className="slot-chip" style={{ marginLeft: 0 }}>{classLabel(k)}</span>)}</span></td>
                      <td className="num">{c.peopleCount || <span className="muted">—</span>}</td>
                      <td className="num">{c.openParties || <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!companiesLoading && companies.length === 0 && (
                <Text type="text2" color="secondary" element="p" ellipsis={false}>
                  {search ? `No company matches “${search}”.` : "No companies yet. Add the first — a plumber, a supplier, the council."}
                </Text>
              )}
            </div>
          )}
      </section>

      {creating && (
        <SidePanel open title={tab === 1 ? "New company" : "New person"} onClose={() => setCreating(false)}>
          <NewPartyForm kind={tab === 1 ? "company" : "person"} companies={companies}
            onDone={(kind, id) => { setCreating(false); bump(); select(kind, id); }} onCancel={() => setCreating(false)} />
        </SidePanel>
      )}
      {/* The name comes from the row that was clicked, not from the detail's own fetch:
          the panel head must say whose record is opening before the round trip lands. */}
      {!creating && selectedPerson && (
        <SidePanel open onClose={() => select("person", null)}
          title={contacts.find(c => c.id === selectedPerson)?.fullName ?? "Person"}>
          <ContactDetail id={selectedPerson} companies={companies} onChanged={bump} />
        </SidePanel>
      )}
      {!creating && selectedCompany && (
        <SidePanel open onClose={() => select("company", null)}
          title={companies.find(c => c.id === selectedCompany)?.name ?? "Company"}>
          <CompanyDetail id={selectedCompany} onChanged={bump} />
        </SidePanel>
      )}
    </>
  );
}

export const fmtAbn = (abn: string) => abn.replace(/^(\d{2})(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3 $4");

// --------------------------------------------------------------------- new party
function NewPartyForm({ kind, companies, onDone, onCancel }: {
  kind: "person" | "company"; companies: Company[];
  onDone: (kind: "person" | "company", id: string) => void; onCancel: () => void;
}) {
  const repo = useRepository();
  const { data: classifications } = useQuery(r => r.listClassifications(), []);
  const [first, setFirst] = useState(""); const [last, setLast] = useState("");
  const [name, setName] = useState(""); const [abn, setAbn] = useState("");
  const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null); const [jobRole, setJobRole] = useState("");
  const [classes, setClasses] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false); const [problem, setProblem] = useState<string | null>(null);
  const applicable = classifications.filter(c => c.isActive && (c.appliesTo === "both" || c.appliesTo === (kind === "person" ? "contact" : "company")));
  const valid = kind === "person" ? first.trim() !== "" : name.trim() !== "";

  async function save() {
    setSaving(true); setProblem(null);
    try {
      if (kind === "person") {
        const c = await repo.createContact({ firstName: first, lastName: last || null, email: email || null, phone: phone || null,
          classificationIds: [...classes], companyId, jobRole: jobRole || null });
        onDone("person", c.id);
      } else {
        const c = await repo.createCompany({ name, abn: abn || null, email: email || null, phone: phone || null, classificationIds: [...classes] });
        onDone("company", c.id);
      }
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="stack">
      {problem && <Problem>{problem}</Problem>}
      <div className="create-form">
        {kind === "person" ? (<>
          <Field label="First name" required><TextField id="np-first" inputAriaLabel="First name" value={first} onChange={setFirst} /></Field>
          <Field label="Last name"><TextField id="np-last" inputAriaLabel="Last name" value={last} onChange={setLast} /></Field>
          <Field label="Company" hint="where they work, if anywhere — and what they do there">
            <Select aria-label="Company" clearable placeholder="No company" options={companies.map(c => ({ value: c.id, label: c.name }))} value={companyId} onChange={setCompanyId} />
          </Field>
          {companyId && <Field label="Job role"><TextField id="np-role" inputAriaLabel="Job role at the company" placeholder="Plumber, Site foreman, Director…" value={jobRole} onChange={setJobRole} /></Field>}
        </>) : (<>
          <Field label="Company name" required><TextField id="nc-name" inputAriaLabel="Company name" value={name} onChange={setName} /></Field>
          <Field label="ABN" hint="eleven digits; spaces are fine"><TextField id="nc-abn" inputAriaLabel="ABN" value={abn} onChange={setAbn} placeholder="51 824 753 556" /></Field>
        </>)}
        <Field label="Email"><TextField id="np-email" inputAriaLabel="Email" type="email" value={email} onChange={setEmail} /></Field>
        <Field label={kind === "person" ? "Mobile or phone" : "Phone"}><TextField id="np-phone" inputAriaLabel="Phone" value={phone} onChange={setPhone} /></Field>
        <Field label="Is" hint="tick every one that applies — a client can also be a contractor">
          <div className="pf-multi">
            {applicable.map(c => (
              <label key={c.id} className="pf-check">
                <input type="checkbox" checked={classes.has(c.id)} onChange={e => setClasses(s => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                <Text type="text3" element="span">{c.name}</Text>
              </label>
            ))}
          </div>
        </Field>
      </div>
      <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
        <Button size="small" onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : kind === "person" ? "Add person" : "Add company"}</Button>
        <Button size="small" kind="tertiary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the detail
function useMethodsEditor(party: { contactId?: string; companyId?: string }, reloadKey: number, onChanged: () => void) {
  const repo = useRepository();
  const { data: methods } = useQuery(r => r.listContactMethods(party), [], [party.contactId, party.companyId, reloadKey]);
  const [kind, setKind] = useState<ContactMethodKind>("email");
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); onChanged(); } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }
  const canEdit = true;
  const ui = (
    <div>
      <Text type="text3" weight="bold">How to reach them</Text>
      {problem && <Problem>{problem}</Problem>}
      {methods.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">No email or phone recorded yet.</Text>}
      <ul className="method-list">
        {methods.map(m => (
          <li key={m.id}>
            <span className="method-kind">{CONTACT_METHOD_LABELS[m.kind]}</span>
            {m.kind === "email"
              ? <a href={`mailto:${m.value}`} className="tap-link">{m.value}</a>
              : m.kind === "other" ? <Text type="text2" element="span">{m.value}</Text>
              : <a href={`tel:${m.value.replace(/\s/g, "")}`} className="tap-link">{m.value}</a>}
            {m.label && <span className="slot-sub">{m.label}</span>}
            {m.isPrimary ? <span className="slot-chip is-current">primary</span>
              : canEdit && <Button size="xs" kind="tertiary" onClick={() => run(() => repo.updateContactMethod(m.id, { isPrimary: true }))}>Make primary</Button>}
            {canEdit && <Button size="xs" kind="tertiary" aria-label={`Remove ${m.value}`} onClick={() => run(() => repo.deleteContactMethod(m.id))}>Remove</Button>}
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="field-inline" style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
          <Select aria-label="Kind of contact method" options={CONTACT_METHOD_KINDS.map(k => ({ value: k, label: CONTACT_METHOD_LABELS[k] }))} value={kind} onChange={v => setKind(v as ContactMethodKind)} />
          <input className="pf-input" aria-label="Email or number" placeholder={kind === "email" ? "name@example.com" : "04xx xxx xxx"} value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && value.trim()) { run(() => repo.addContactMethod({ ...party, kind, value, isPrimary: !methods.some(m => m.kind === kind && m.isPrimary) })); setValue(""); } }} />
          <Button size="small" disabled={!value.trim()} onClick={() => { run(() => repo.addContactMethod({ ...party, kind, value, isPrimary: !methods.some(m => m.kind === kind && m.isPrimary) })); setValue(""); }}>Add</Button>
        </div>
      )}
    </div>
  );
  return ui;
}

function Approval({ approvedAt, onApprove }: { approvedAt: string | null; onApprove: (v: boolean) => void }) {
  const { can } = usePermission();
  return (
    <div className="field-inline">
      <span className={`approval-chip${approvedAt ? " is-approved" : ""}`}>
        {approvedAt ? `signed off ${new Date(approvedAt).toLocaleDateString()}` : "awaiting sign-off"}
      </span>
      {can("manager") && (
        <Button size="xs" kind="tertiary" onClick={() => onApprove(!approvedAt)}>{approvedAt ? "Withdraw sign-off" : "Sign off"}</Button>
      )}
      {!can("manager") && !approvedAt && <Text type="text3" color="secondary" element="span">A manager signs new contacts off. Usable meanwhile.</Text>}
    </div>
  );
}

function PartiesList({ parties, title }: { parties: RecordParty[]; title: string }) {
  const current = parties.filter(p => !p.endedOn);
  if (parties.length === 0) return <Text type="text3" color="secondary" ellipsis={false} element="p">{title}: none yet.</Text>;
  return (
    <div>
      <Text type="text3" weight="bold">{title} ({current.length} current)</Text>
      <ul className="party-list">
        {parties.slice(0, 30).map(p => (
          <li key={p.id} className="party-row">
            <span className="party-role">{p.roleName}</span>
            <span className="party-who">
              {p.recordJobId ? <a href={`/jobs/${encodeURIComponent(p.recordJobId)}`} className="tap-link">{p.recordJobId}</a>
                : p.recordProjectId ? <a href={`/projects/${p.recordProjectId}`} className="tap-link">Project {p.recordProjectId}</a> : "—"}
              {p.processName && <span className="slot-chip">{p.processName}</span>}
              {p.companyName && p.contactName && <span className="slot-sub"> for {p.companyName}</span>}
            </span>
            <span className="slot-sub">{p.endedOn ? `ended ${new Date(p.endedOn + "T00:00:00").toLocaleDateString()}` : `since ${new Date(p.startedOn + "T00:00:00").toLocaleDateString()}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactDetail({ id, companies, onChanged }: { id: string; companies: Company[]; onChanged: () => void }) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const bump = () => { setReload(n => n + 1); onChanged(); };
  const { data: contact } = useQuery<Contact | null>(r => r.getContact(id), null, [id, reload]);
  const { data: classifications } = useQuery(r => r.listClassifications(), []);
  const { data: employment } = useQuery(r => r.listCompanyContacts({ contactId: id }), [], [id, reload]);
  const { data: parties } = useQuery(r => r.listRecordParties({ contactId: id }), [], [id, reload]);
  const methods = useMethodsEditor({ contactId: id }, reload, bump);
  const [problem, setProblem] = useState<string | null>(null);
  const [newCompany, setNewCompany] = useState<string | null>(null);
  const [newRole, setNewRole] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => { setNotes(contact?.notes ?? ""); }, [contact?.notes]);
  const canEdit = can("user");

  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); bump(); } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }
  if (!contact) return <Text type="text3" color="secondary">Loading…</Text>;
  const applicable = classifications.filter(c => c.isActive && c.appliesTo !== "company");

  return (
    /* A body, not a panel: SidePanel is the panel, and it carries the name and the ×.
       What stays is the sub-line, which the head cannot fit — the role and the company. */
    <div className="stack" aria-label={`Details of ${contact.fullName}`}>
      <div className="slot-sub">{[contact.jobRole, contact.companyName].filter(Boolean).join(" at ") || "no company"}</div>
      {problem && <Problem>{problem}</Problem>}
      <Approval approvedAt={contact.approvedAt} onApprove={v => run(() => repo.approveContact(id, v))} />

      <div className="stack-tight" style={{ marginTop: "var(--space-12)" }}>
        {methods}

        <div>
          <Text type="text3" weight="bold">Is</Text>
          <div className="pf-multi">
            {applicable.map(c => (
              <label key={c.id} className="pf-check">
                <input type="checkbox" checked={contact.classificationIds.includes(c.id)} disabled={!canEdit}
                  onChange={e => run(() => repo.setContactClassifications(id, e.target.checked ? [...contact.classificationIds, c.id] : contact.classificationIds.filter(k => k !== c.id)))} />
                <Text type="text3" element="span">{c.name}</Text>
              </label>
            ))}
          </div>
        </div>

        <div>
          <Text type="text3" weight="bold">Works at</Text>
          {employment.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">No company recorded.</Text>}
          <ul className="party-list">
            {employment.map(e => (
              <li key={e.id} className="party-row">
                <span className="party-who">
                  <a href={`/contacts?company=${e.companyId}`} className="tap-link">{e.companyName}</a>
                  {canEdit && !e.endedOn ? (
                    <input className="pf-input" style={{ width: 160, marginLeft: 8 }} aria-label={`Job role at ${e.companyName}`} placeholder="Job role" defaultValue={e.jobRole ?? ""}
                      onBlur={ev => { if (ev.target.value.trim() !== (e.jobRole ?? "")) run(() => repo.updateCompanyContact(e.id, { jobRole: ev.target.value })); }} />
                  ) : e.jobRole && <span className="slot-sub"> {e.jobRole}</span>}
                </span>
                {e.endedOn ? <span className="slot-sub">left {new Date(e.endedOn + "T00:00:00").toLocaleDateString()}</span>
                  : canEdit && <Button size="xs" kind="tertiary" onClick={() => run(() => repo.updateCompanyContact(e.id, { endedOn: new Date().toISOString().slice(0, 10) }))}>Left</Button>}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="field-inline" style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
              <Select aria-label="Add a company" clearable placeholder="Add a company…" options={companies.map(c => ({ value: c.id, label: c.name }))} value={newCompany} onChange={setNewCompany} />
              <input className="pf-input" style={{ width: 160 }} aria-label="Job role at the new company" placeholder="Job role" value={newRole} onChange={e => setNewRole(e.target.value)} />
              <Button size="small" disabled={!newCompany} onClick={() => { if (newCompany) { run(() => repo.addCompanyContact({ companyId: newCompany, contactId: id, jobRole: newRole || null })); setNewCompany(null); setNewRole(""); } }}>Add</Button>
            </div>
          )}
        </div>

        <PartiesList parties={parties} title="On records" />

        <Field label="Notes">
          {canEdit ? (
            <textarea className="pf-input" style={{ width: "100%", height: 72, padding: 8 }} aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)}
              onBlur={() => { if (notes.trim() !== (contact.notes ?? "")) run(() => repo.updateContact(id, { notes })); }} />
          ) : <Text type="text2" ellipsis={false}>{contact.notes ?? "—"}</Text>}
        </Field>

        {canEdit && (
          <div className="field-inline">
            <Checkbox label={contact.isActive ? "Active" : "Retired"} checked={contact.isActive} onChange={() => run(() => repo.updateContact(id, { isActive: !contact.isActive }))} />
            <Text type="text3" color="secondary" element="span">Retiring keeps every record they were on.</Text>
          </div>
        )}
      </div>
    </div>
  );
}

function CompanyDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const bump = () => { setReload(n => n + 1); onChanged(); };
  const { data: company } = useQuery<Company | null>(r => r.getCompany(id), null, [id, reload]);
  const { data: classifications } = useQuery(r => r.listClassifications(), []);
  const { data: people } = useQuery(r => r.listCompanyContacts({ companyId: id }), [], [id, reload]);
  const { data: parties } = useQuery(r => r.listRecordParties({ companyId: id }), [], [id, reload]);
  const methods = useMethodsEditor({ companyId: id }, reload, bump);
  const [problem, setProblem] = useState<string | null>(null);
  const canEdit = can("user");
  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); bump(); } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }
  const current = useMemo(() => people.filter(p => !p.endedOn), [people]);
  if (!company) return <Text type="text3" color="secondary">Loading…</Text>;
  const applicable = classifications.filter(c => c.isActive && c.appliesTo !== "contact");

  return (
    <div className="stack" aria-label={`Details of ${company.name}`}>
      <div className="slot-sub">{[company.tradingName ? `t/a ${company.tradingName}` : null, company.abn ? `ABN ${fmtAbn(company.abn)}` : null].filter(Boolean).join(" · ") || "no ABN recorded"}</div>
      {problem && <Problem>{problem}</Problem>}
      <Approval approvedAt={company.approvedAt} onApprove={v => run(() => repo.approveCompany(id, v))} />

      <div className="stack-tight" style={{ marginTop: "var(--space-12)" }}>
        {canEdit && (
          <Field label="ABN" hint="eleven digits; spaces are fine">
            <input className="pf-input" aria-label="ABN" defaultValue={company.abn ? fmtAbn(company.abn) : ""} placeholder="51 824 753 556"
              onBlur={e => { const v = e.target.value.replace(/\s/g, ""); if (v !== (company.abn ?? "")) run(() => repo.updateCompany(id, { abn: v || null })); }} />
          </Field>
        )}
        {methods}
        <div>
          <Text type="text3" weight="bold">Is</Text>
          <div className="pf-multi">
            {applicable.map(c => (
              <label key={c.id} className="pf-check">
                <input type="checkbox" checked={company.classificationIds.includes(c.id)} disabled={!canEdit}
                  onChange={e => run(() => repo.setCompanyClassifications(id, e.target.checked ? [...company.classificationIds, c.id] : company.classificationIds.filter(k => k !== c.id)))} />
                <Text type="text3" element="span">{c.name}</Text>
              </label>
            ))}
          </div>
        </div>
        <div>
          <Text type="text3" weight="bold">People ({current.length})</Text>
          {people.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">Nobody recorded here yet — add a person in the People tab and pick this company.</Text>}
          <ul className="party-list">
            {people.map(e => (
              <li key={e.id} className="party-row">
                <span className="party-who">
                  <a href={`/contacts?person=${e.contactId}`} className="tap-link">{e.contactName}</a>
                  {e.jobRole && <span className="slot-sub"> {e.jobRole}</span>}
                </span>
                {e.endedOn && <span className="slot-sub">left {new Date(e.endedOn + "T00:00:00").toLocaleDateString()}</span>}
              </li>
            ))}
          </ul>
        </div>
        <PartiesList parties={parties} title="On records" />
        {canEdit && (
          <div className="field-inline">
            <Checkbox label={company.isActive ? "Active" : "Retired"} checked={company.isActive} onChange={() => run(() => repo.updateCompany(id, { isActive: !company.isActive }))} />
            <Text type="text3" color="secondary" element="span">Retiring keeps every record it was on.</Text>
          </div>
        )}
      </div>
    </div>
  );
}
