import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, Heading, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useAuth } from "../data/AuthProvider";
import { supabaseUrl } from "../data/supabaseEnv";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import { LoadProblem } from "../components/SearchNotices";
import {
  MAINTENANCE_ASSIGNMENT_STATUS_LABELS, MAINTENANCE_HEALTH_LABELS, MAINTENANCE_ITEM_STATUS_LABELS, MAINTENANCE_PRIORITIES, MAINTENANCE_PRIORITY_LABELS,
  MAINTENANCE_SOURCES, MAINTENANCE_SOURCE_LABELS, MAINTENANCE_STATUSES, MAINTENANCE_STATUS_LABELS,
  type MaintenanceItem, type MaintenanceMessage, type MaintenancePriority, type MaintenanceRequest, type MaintenanceSource, type MaintenanceStatus
} from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Maintenance (0084) — the separate tab Amber asked for: "this will have a lot of
 * automation and needs a quick access".
 *
 * THE QUEUE
 *
 *   Every open request on one screen, worst first: over SLA, then at risk, then the rest by
 *   report date. Health is the view's word (`maintenance_request_health`), never computed
 *   here, so the tab and the 15-minute scan that sends the notifications agree.
 *
 * THE REQUEST
 *
 *   One ticket, however it arrived; its items, each a trade; an offer per item to a
 *   contractor — the database queues the email and hands back the accept-link token ONCE,
 *   which this page shows once and then forgets; the thread of what came in, went out and
 *   was said on the phone; and Close, which the database refuses while an item is open,
 *   in its own words.
 *
 * Nothing is invented. A job with no handover run has no warranty end date and says so; a
 * request in a category with no SLA reads "No SLA", not "on track".
 */
export function MaintenancePage() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermission();
  const { profile } = useAuth();
  const selected = params.get("request");
  const jobFilter = params.get("job");
  const creating = params.get("new") === "1";
  const queue = (params.get("queue") ?? "open") as "open" | "mine" | "attention" | "closed" | "all";
  const [search, setSearch] = useState("");
  const [reload, setReload] = useState(0);
  const bump = () => setReload(n => n + 1);

  const dbQueue = queue === "closed" ? "closed" : queue === "all" ? "all" : "open";
  const { data: requests, loading, error } = useQuery<MaintenanceRequest[]>(
    r => r.listMaintenanceRequests({ queue: dbQueue, search, jobId: jobFilter ?? undefined }), [], [dbQueue, search, jobFilter, reload]
  );

  const RANK: Record<MaintenanceRequest["health"], number> = { overdue: 0, at_risk: 1, on_track: 2, no_sla: 3, complete: 4, closed: 5 };
  const rows = useMemo(() => {
    let list = requests;
    if (queue === "mine") list = list.filter(r => r.ownerProfileId === profile?.id);
    if (queue === "attention") list = list.filter(r => r.health === "overdue" || r.health === "at_risk" || r.offersOpen > 0 || r.status === "new");
    return [...list].sort((a, b) => RANK[a.health] - RANK[b.health] || b.reportedAt.localeCompare(a.reportedAt));
  }, [requests, queue, profile?.id]);

  const counts = useMemo(() => ({
    open: requests.filter(r => r.status !== "closed" && r.status !== "rejected").length,
    overdue: requests.filter(r => r.health === "overdue").length,
    atRisk: requests.filter(r => r.health === "at_risk").length,
    waiting: requests.filter(r => r.offersOpen > 0).length
  }), [requests]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const hasDetail = Boolean(selected || creating);

  return (
    <>
      <div className="page-head page-head-row">
        <div>
          <Heading type="h2" weight="bold">Maintenance</Heading>
          <Text type="text2" color="secondary" ellipsis={false}>
            What homeowners have reported after handover, who is fixing it, and whether it is inside the time we promised.
          </Text>
        </div>
        {!loading && dbQueue === "open" && (
          <Text type="text3" color="secondary">
            {counts.open} open · {counts.overdue} over SLA · {counts.atRisk} at risk · {counts.waiting} awaiting a contractor
          </Text>
        )}
      </div>

      <div className="toolbar">
        <Select aria-label="Which requests" value={queue} onChange={v => setParam({ queue: v })}
          options={[
            { value: "open", label: "All open" }, { value: "attention", label: "Needs attention" }, { value: "mine", label: "Mine" },
            { value: "closed", label: "Closed" }, { value: "all", label: "Everything" }
          ]} />
        <TextField size="small" id="maintenance-search" inputAriaLabel="Search requests" placeholder="Search number, address, summary, reporter…" value={search} onChange={setSearch} />
        {jobFilter && (
          <Button size="small" kind="tertiary" onClick={() => setParam({ job: null })}>Job {jobFilter} only — show all</Button>
        )}
        {can("user") && <Button size="small" onClick={() => setParam({ new: "1", request: null })}>+ New request</Button>}
      </div>

      {error && <LoadProblem error={error} />}

      <div className={`contacts-grid${hasDetail ? " has-detail" : ""}`}>
        <section className="panel">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Request</th><th>Address</th><th>What</th><th>Reported</th><th>Trade</th><th>Owner</th><th className="num">Items</th><th>Health</th><th>Next visit</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className={`contact-row${selected === r.id ? " is-selected" : ""}`} onClick={() => setParam({ request: r.id, new: null })}>
                    <td className="nowrap">
                      <button type="button" className="link-button tap-link" onClick={e => { e.stopPropagation(); setParam({ request: r.id, new: null }); }}>
                        <strong>{r.number}</strong>
                      </button>
                      {r.priority !== "normal" && <span className={`health is-${r.priority === "low" ? "no_due_date" : "overdue"}`} style={{ marginLeft: 6 }}>{MAINTENANCE_PRIORITY_LABELS[r.priority]}</span>}
                    </td>
                    <td>{r.jobAddress}</td>
                    <td>{r.summary}{r.isWarranty && <span className="slot-chip" style={{ marginLeft: 6 }}>warranty</span>}</td>
                    <td className="muted nowrap">{new Date(r.reportedAt).toLocaleDateString()} · {MAINTENANCE_SOURCE_LABELS[r.source]}</td>
                    <td className="muted">{r.categoryName ?? "—"}</td>
                    <td className="muted">{r.ownerName ?? "—"}</td>
                    <td className="num">{r.itemsTotal ? `${r.itemsDone} / ${r.itemsTotal}` : <span className="muted">—</span>}</td>
                    <td><span className={`health is-${r.health}`}>{MAINTENANCE_HEALTH_LABELS[r.health]}</span>{r.offersOpen > 0 && <div className="slot-sub">{r.offersOpen} offer{r.offersOpen === 1 ? "" : "s"} unanswered</div>}</td>
                    <td className="muted nowrap">{r.nextVisit ? new Date(r.nextVisit).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length === 0 && (
              <Text type="text2" color="secondary" element="p" ellipsis={false}>
                {queue === "closed" ? "Nothing has been closed yet." : queue === "mine" ? "Nothing is owned by you." : "No open maintenance requests. When a homeowner emails the intake mailbox, rings, or a form comes in, it appears here."}
              </Text>
            )}
          </div>
        </section>

        {creating && <NewRequest jobId={jobFilter} onDone={id => { bump(); setParam({ new: null, request: id }); }} onCancel={() => setParam({ new: null })} />}
        {selected && !creating && <RequestDetail id={selected} onChanged={bump} onClose={() => setParam({ request: null })} />}
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------------------
function NewRequest({ jobId, onDone, onCancel }: { jobId: string | null; onDone: (id: string) => void; onCancel: () => void }) {
  const repo = useRepository();
  const { data: jobs } = useQuery(r => r.listJobs(), []);
  const { data: contacts } = useQuery(r => r.listContacts(), []);
  const { data: categories } = useQuery(r => r.listMaintenanceCategories(), []);
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const [job, setJob] = useState<string | null>(jobId);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState<MaintenanceSource>("phone");
  const [priority, setPriority] = useState<MaintenancePriority>("normal");
  const [reporter, setReporter] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!job || !summary.trim()) return;
    setBusy(true); setProblem(null);
    try {
      const r = await repo.createMaintenanceRequest({ jobId: job, summary: summary.trim(), description: description.trim() || null, source, priority, reportedByContactId: reporter, categoryId: category, ownerProfileId: owner });
      onDone(r.id);
    } catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">New maintenance request</Text>
        <Button size="xs" kind="tertiary" onClick={onCancel}>Cancel</Button>
      </div>
      <Text type="text3" color="secondary" ellipsis={false} element="p">
        Logged by hand — a call, a walk-in, an email you are copying in. The number is given on save; the due date comes from the trade's SLA.
      </Text>
      {problem && <Problem>{problem}</Problem>}
      <Field label="Job" required>
        <Select aria-label="Job" clearable placeholder="Job…" value={job} onChange={setJob}
          options={jobs.map(j => ({ value: j.id, label: `${j.id} · ${j.currentAddress}` }))} />
      </Field>
      <Field label="What is wrong" required>
        <TextField size="small" id="new-request-summary" inputAriaLabel="Summary" placeholder="One line — leaking ensuite tap" value={summary} onChange={setSummary} />
      </Field>
      <Field label="Details">
        <textarea className="pf-input" rows={3} aria-label="Details" value={description} onChange={e => setDescription(e.target.value)} placeholder="What the homeowner said, when it started, anything a contractor should know" />
      </Field>
      <Field label="How it arrived">
        <Select aria-label="Source" value={source} onChange={v => setSource(v as MaintenanceSource)} options={MAINTENANCE_SOURCES.filter(s => s !== "api").map(s => ({ value: s, label: MAINTENANCE_SOURCE_LABELS[s] }))} />
      </Field>
      <Field label="Reported by" hint="A contact — add them under Contacts first if they are new">
        <Select aria-label="Reported by" clearable placeholder="Contact…" value={reporter} onChange={setReporter}
          options={contacts.map(c => ({ value: c.id, label: c.fullName + (c.primaryEmail ? ` · ${c.primaryEmail}` : "") }))} />
      </Field>
      <Field label="Trade" hint={categories.length === 0 ? "No categories yet — set them in Setup → Maintenance" : undefined}>
        <Select aria-label="Trade" clearable placeholder="Trade…" value={category} onChange={setCategory} options={categories.map(c => ({ value: c.id, label: c.name }))} />
      </Field>
      <Field label="Priority">
        <Select aria-label="Priority" value={priority} onChange={v => setPriority(v as MaintenancePriority)} options={MAINTENANCE_PRIORITIES.map(p => ({ value: p, label: MAINTENANCE_PRIORITY_LABELS[p] }))} />
      </Field>
      <Field label="Owner">
        <Select aria-label="Owner" clearable placeholder="Lofty person…" value={owner} onChange={setOwner} options={profiles.filter(p => p.active).map(p => ({ value: p.id, label: p.fullName }))} />
      </Field>
      <div className="field-inline" style={{ justifyContent: "flex-end" }}>
        <Button size="small" disabled={busy || !job || !summary.trim()} onClick={submit}>Log request</Button>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------------------------------
function RequestDetail({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const repo = useRepository();
  const { can } = usePermission();
  const canWrite = can("user");
  const [reload, setReload] = useState(0);
  const { data: request, loading } = useQuery<MaintenanceRequest | null>(r => r.getMaintenanceRequest(id), null, [id, reload]);
  const { data: items } = useQuery<MaintenanceItem[]>(r => r.listMaintenanceItems(id), [], [id, reload]);
  const { data: messages } = useQuery<MaintenanceMessage[]>(r => r.listMaintenanceMessages(id), [], [id, reload]);
  const { data: categories } = useQuery(r => r.listMaintenanceCategories(), []);
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const [problem, setProblem] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [note, setNote] = useState("");
  const [newItem, setNewItem] = useState({ description: "", location: "", categoryId: null as string | null });

  const bump = () => { setReload(n => n + 1); onChanged(); };
  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); bump(); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }

  if (loading && !request) return <section className="panel"><Text type="text2" color="secondary">Loading…</Text></section>;
  if (!request) return <section className="panel"><Text type="text2" color="secondary">This request no longer exists.</Text></section>;
  const r = request;
  const isClosed = r.status === "closed" || r.status === "rejected";
  const openItems = items.filter(i => i.status !== "done" && i.status !== "not_applicable").length;

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <Text type="text2" weight="bold">{r.number} · {r.summary}</Text>
            <div className="slot-sub">
              <Link to={`/jobs/${r.jobId}`}>{r.jobId}</Link> · {r.jobAddress} · reported {new Date(r.reportedAt).toLocaleDateString()} by {MAINTENANCE_SOURCE_LABELS[r.source].toLowerCase()}
            </div>
          </div>
          <div className="panel-actions">
            <span className={`health is-${r.health}`}>{MAINTENANCE_HEALTH_LABELS[r.health]}</span>
            <Button size="xs" kind="tertiary" onClick={onClose} aria-label="Close this request panel">×</Button>
          </div>
        </div>
        {problem && <Problem>{problem}</Problem>}

        <div className="field-inline" style={{ flexWrap: "wrap", gap: "var(--space-8)" }}>
          {r.handoverAt
            ? <span className={`slot-chip${r.isWarranty ? "" : " muted"}`}>{r.isWarranty ? "In warranty" : "Out of warranty"} · handed over {new Date(r.handoverAt).toLocaleDateString()}, ends {r.warrantyEndsOn ? new Date(r.warrantyEndsOn).toLocaleDateString() : "—"}</span>
            : <span className="slot-chip muted">No handover run completed on this job — warranty unknown</span>}
          {r.dueOn && <span className="slot-chip">Due {new Date(r.dueOn).toLocaleDateString()}{r.atRiskOn && r.atRiskOn !== r.dueOn ? ` · at risk from ${new Date(r.atRiskOn).toLocaleDateString()}` : ""}</span>}
          {!r.dueOn && <span className="slot-chip muted">No SLA — pick a trade with one, or type a due date</span>}
        </div>

        <div className="field-inline" style={{ flexWrap: "wrap", gap: "var(--space-12)", marginTop: "var(--space-8)" }}>
          <label className="field-inline"><Text type="text3" element="span">Status</Text>
            {canWrite ? (
              <Select aria-label="Status" value={r.status} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { status: v as MaintenanceStatus }))}
                options={MAINTENANCE_STATUSES.filter(s => s !== "closed").map(s => ({ value: s, label: MAINTENANCE_STATUS_LABELS[s] }))} />
            ) : <Text type="text3" element="span">{MAINTENANCE_STATUS_LABELS[r.status]}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Priority</Text>
            {canWrite ? (
              <Select aria-label="Priority" value={r.priority} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { priority: v as MaintenancePriority }))}
                options={MAINTENANCE_PRIORITIES.map(p => ({ value: p, label: MAINTENANCE_PRIORITY_LABELS[p] }))} />
            ) : <Text type="text3" element="span">{MAINTENANCE_PRIORITY_LABELS[r.priority]}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Trade</Text>
            {canWrite ? (
              <Select aria-label="Trade" clearable placeholder="Trade…" value={r.categoryId} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { categoryId: v }))}
                options={categories.map(c => ({ value: c.id, label: c.name }))} />
            ) : <Text type="text3" element="span">{r.categoryName ?? "—"}</Text>}
          </label>
          <label className="field-inline"><Text type="text3" element="span">Owner</Text>
            {canWrite ? (
              <Select aria-label="Owner" clearable placeholder="Lofty person…" value={r.ownerProfileId} onChange={v => run(() => repo.updateMaintenanceRequest(r.id, { ownerProfileId: v }))}
                options={profiles.filter(p => p.active).map(p => ({ value: p.id, label: p.fullName }))} />
            ) : <Text type="text3" element="span">{r.ownerName ?? "—"}</Text>}
          </label>
          {canWrite && (
            <label className="field-inline"><Text type="text3" element="span">Due</Text>
              <input type="date" className="date-input" aria-label="Due date" defaultValue={r.dueOn ?? ""} key={r.dueOn ?? "none"}
                onBlur={e => { const v = e.target.value || null; if (v !== r.dueOn) run(() => repo.updateMaintenanceRequest(r.id, { dueOn: v })); }} />
            </label>
          )}
        </div>

        <div style={{ marginTop: "var(--space-8)" }}>
          <Text type="text3" weight="bold">Reported by</Text>
          {r.reportedByName ? (
            <Text type="text2" ellipsis={false} element="p">
              {r.reportedByName}
              {r.reportedByEmail && <> · <a href={`mailto:${r.reportedByEmail}`} className="tap-link">{r.reportedByEmail}</a></>}
              {r.reportedByPhone && <> · <a href={`tel:${r.reportedByPhone.replace(/\s/g, "")}`} className="tap-link">{r.reportedByPhone}</a></>}
            </Text>
          ) : <Text type="text3" color="secondary" ellipsis={false} element="p">Nobody recorded — the closing email has nowhere to go until a contact is set.</Text>}
          {r.description && <Text type="text2" ellipsis={false} element="p" style={{ whiteSpace: "pre-wrap" }}>{r.description}</Text>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Items</Text>
          <Text type="text3" color="secondary">{items.length === 0 ? "none yet" : `${items.length - openItems} of ${items.length} done`}</Text>
        </div>
        <Text type="text3" color="secondary" ellipsis={false} element="p">One line per trade. Offer each to a contractor — the email goes with an accept link; the item follows the answer.</Text>
        {items.map(i => <ItemRow key={i.id} item={i} closed={isClosed} canWrite={canWrite} onRun={run} />)}
        {canWrite && !isClosed && (
          <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-8)" }}>
            <TextField size="small" id={`item-${r.id}`} inputAriaLabel="New item" placeholder="What is wrong…" value={newItem.description} onChange={v => setNewItem({ ...newItem, description: v })} />
            <TextField size="small" id={`item-loc-${r.id}`} inputAriaLabel="Where in the house" placeholder="Where — ensuite, garage…" value={newItem.location} onChange={v => setNewItem({ ...newItem, location: v })} />
            <Select aria-label="Trade for the new item" clearable placeholder="Trade…" value={newItem.categoryId} onChange={v => setNewItem({ ...newItem, categoryId: v })} options={categories.map(c => ({ value: c.id, label: c.name }))} />
            <Button size="small" disabled={!newItem.description.trim()} onClick={() => run(async () => {
              await repo.addMaintenanceItem({ requestId: r.id, description: newItem.description.trim(), location: newItem.location.trim() || null, categoryId: newItem.categoryId ?? r.categoryId });
              setNewItem({ description: "", location: "", categoryId: null });
            })}>Add item</Button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Thread</Text>
          <Text type="text3" color="secondary">what came in, what went out, what was said</Text>
        </div>
        {messages.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">Nothing yet.</Text>}
        <ul className="maint-thread">
          {messages.map(m => (
            <li key={m.id} className={`maint-msg is-${m.direction}`}>
              <div className="maint-msg-head">
                <span className="slot-chip" style={{ marginLeft: 0 }}>{m.direction === "in" ? "← in" : m.direction === "out" ? "→ out" : "note"} · {m.channel}</span>
                {m.toAddress && <span className="muted">{m.direction === "in" ? "from" : "to"} {m.toAddress}</span>}
                <span className="muted">{new Date(m.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                {m.direction === "out" && <span className={`health is-${m.status === "sent" ? "done" : m.status === "failed" ? "overdue" : "no_due_date"}`}>{m.status}</span>}
              </div>
              {m.subject && <Text type="text2" weight="medium" ellipsis={false} element="div">{m.subject}</Text>}
              <Text type="text2" ellipsis={false} element="div" style={{ whiteSpace: "pre-wrap" }}>{m.body.replace("{{ACCEPT_LINK}}", "[accept link — filled when sent]")}</Text>
              {m.error && <div className="slot-sub">{m.error}</div>}
            </li>
          ))}
        </ul>
        {canWrite && (
          <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
            <TextField size="small" id={`note-${r.id}`} inputAriaLabel="Add a note" placeholder="Rang the homeowner — they are away until Monday…" value={note} onChange={setNote}
              onKeyDown={e => { if (e.key === "Enter" && note.trim()) run(async () => { await repo.addMaintenanceNote({ requestId: r.id, body: note.trim(), channel: "phone" }); setNote(""); }); }} />
            <Button size="small" disabled={!note.trim()} onClick={() => run(async () => { await repo.addMaintenanceNote({ requestId: r.id, body: note.trim(), channel: "phone" }); setNote(""); })}>Note</Button>
          </div>
        )}
      </section>

      {canWrite && (
        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">{isClosed ? "Closed" : "Close"}</Text>
            {isClosed && <Text type="text3" color="secondary">{r.closedAt ? new Date(r.closedAt).toLocaleString() : ""}{r.closedReason ? ` · ${r.closedReason}` : ""}</Text>}
          </div>
          {isClosed ? (
            <Button size="small" kind="secondary" onClick={() => run(() => repo.updateMaintenanceRequest(r.id, { status: "in_progress" }))}>Reopen</Button>
          ) : (
            <>
              <Text type="text3" color="secondary" ellipsis={false} element="p">
                {openItems > 0 ? `${openItems} item${openItems === 1 ? " is" : "s are"} still open — the database will refuse to close until each is done or not applicable.` : "Closing emails the homeowner (when they have an email on file) and tells the owner. A reply reopens it."}
              </Text>
              <div className="field-inline" style={{ flexWrap: "wrap" }}>
                <TextField size="small" id={`close-${r.id}`} inputAriaLabel="Reason for closing" placeholder="Reason — tap replaced, not a warranty item…" value={closeReason} onChange={setCloseReason} />
                <Button size="small" onClick={() => run(() => repo.updateMaintenanceRequest(r.id, { status: "closed", closedReason: closeReason.trim() || null }))}>Close request</Button>
                <Button size="small" kind="tertiary" onClick={() => run(() => repo.updateMaintenanceRequest(r.id, { status: "rejected", closedReason: closeReason.trim() || null }))}>Reject</Button>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------------------
function acceptLinkFor(token: string): string | null {
  // supabaseUrl, not the raw variable: the project URL can arrive under either of two
  // names and resolving it twice is how one of them gets forgotten.
  return supabaseUrl ? `${supabaseUrl}/functions/v1/maintenance-accept?t=${token}` : null;
}

function ItemRow({ item, closed, canWrite, onRun }: { item: MaintenanceItem; closed: boolean; canWrite: boolean; onRun: (fn: () => Promise<unknown>) => Promise<void> }) {
  const repo = useRepository();
  const [offering, setOffering] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [shown, setShown] = useState<{ token: string; sentTo: string | null } | null>(null);
  const { data: companies } = useQuery(r => offering ? r.listCompanies() : Promise.resolve([]), [], [offering]);
  const { data: contacts } = useQuery(r => offering ? r.listContacts() : Promise.resolve([]), [], [offering]);
  const [draft, setDraft] = useState({ companyId: null as string | null, contactId: null as string | null, note: "" });
  const [answer, setAnswer] = useState({ status: "accepted" as "accepted" | "scheduled" | "declined", when: "", note: "" });
  const a = item.assignment;
  const live = a && (a.status === "offered" || a.status === "accepted" || a.status === "scheduled");
  const link = shown ? acceptLinkFor(shown.token) : null;

  return (
    <div className="maint-item">
      <div className="maint-item-head">
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>
          <Text type="text2" weight="medium" ellipsis={false} element="div">{item.description}{item.location && <span className="muted"> · {item.location}</span>}</Text>
          <div className="slot-sub">
            {item.categoryName ?? "no trade"}
            {item.originalTrade && <> · did this on the build: <strong>{item.originalTrade}</strong></>}
            {item.completedAt && <> · done {new Date(item.completedAt).toLocaleDateString()}{item.completedByName ? ` by ${item.completedByName}` : ""}</>}
          </div>
        </div>
        <span className={`health is-${item.status === "done" ? "done" : item.status === "not_applicable" ? "cancelled" : item.status === "scheduled" ? "on_track" : item.status === "assigned" ? "waiting" : "no_due_date"}`}>{MAINTENANCE_ITEM_STATUS_LABELS[item.status]}</span>
      </div>
      {a && (
        <div className="slot-sub">
          {a.companyName ?? a.contactName ?? "somebody"}{a.companyName && a.contactName ? ` (${a.contactName})` : ""} — {MAINTENANCE_ASSIGNMENT_STATUS_LABELS[a.status]}
          {a.scheduledFor && <> · {new Date(a.scheduledFor).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</>}
          {a.respondedAt && <> · answered {new Date(a.respondedAt).toLocaleDateString()}</>}
          {a.note && <> · “{a.note}”</>}
        </div>
      )}
      {shown && (
        <div className="token-box" role="status">
          <Text type="text3" weight="bold" element="div">The contractor's accept link — shown once</Text>
          <Text type="text3" ellipsis={false} element="div">
            {shown.sentTo ? `Queued by email to ${shown.sentTo}. ` : "No email on file for them, so nothing was queued. "}
            Copy it now if you are sending it another way; it is not stored in the clear and cannot be shown again.
          </Text>
          <code className="token-link">{link ?? `token ${shown.token} (the app does not know its Supabase URL, so the link cannot be built here)`}</code>
          <div className="field-inline">
            {link && <Button size="xs" kind="secondary" onClick={() => { void navigator.clipboard?.writeText(link); }}>Copy link</Button>}
            <Button size="xs" kind="tertiary" onClick={() => setShown(null)}>Done</Button>
          </div>
        </div>
      )}
      {canWrite && !closed && item.status !== "done" && item.status !== "not_applicable" && (
        <div className="field-inline" style={{ flexWrap: "wrap", gap: "var(--space-4)" }}>
          {!live && <Button size="xs" kind="secondary" onClick={() => setOffering(o => !o)}>{offering ? "Cancel offer" : "Offer to a contractor…"}</Button>}
          {live && a.status === "offered" && <Button size="xs" kind="secondary" onClick={() => setAnswering(x => !x)}>{answering ? "Cancel" : "Record their answer…"}</Button>}
          {live && a.status !== "offered" && <Button size="xs" kind="secondary" onClick={() => setAnswering(x => !x)}>{answering ? "Cancel" : "Change the visit…"}</Button>}
          {live && <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceAssignment(a.id, { status: "done" }))}>Done</Button>}
          {live && <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceAssignment(a.id, { status: "cancelled" }))}>Cancel offer</Button>}
          {!live && <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceItem(item.id, { status: "done" }))}>Done</Button>}
          <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceItem(item.id, { status: "not_applicable" }))}>Not applicable</Button>
        </div>
      )}
      {canWrite && !closed && (item.status === "done" || item.status === "not_applicable") && !live && (
        <Button size="xs" kind="tertiary" onClick={() => onRun(() => repo.updateMaintenanceItem(item.id, { status: "open" }))}>Reopen item</Button>
      )}
      {offering && (
        <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          <Select aria-label="Company" clearable placeholder="Company…" value={draft.companyId} onChange={v => setDraft({ ...draft, companyId: v })}
            options={companies.map(c => ({ value: c.id, label: c.name + (c.primaryEmail ? ` · ${c.primaryEmail}` : "") }))} />
          <Select aria-label="Person" clearable placeholder="Person (optional)…" value={draft.contactId} onChange={v => setDraft({ ...draft, contactId: v })}
            options={contacts.filter(c => !draft.companyId || c.companyId === draft.companyId).map(c => ({ value: c.id, label: c.fullName + (c.primaryEmail ? ` · ${c.primaryEmail}` : "") }))} />
          <TextField size="small" id={`offer-note-${item.id}`} inputAriaLabel="Note to the contractor" placeholder="Note — before Friday please" value={draft.note} onChange={v => setDraft({ ...draft, note: v })} />
          <Button size="small" disabled={!draft.companyId && !draft.contactId} onClick={() => onRun(async () => {
            const o = await repo.offerMaintenanceItem({ itemId: item.id, companyId: draft.companyId, contactId: draft.contactId, note: draft.note.trim() || null });
            setShown({ token: o.acceptToken, sentTo: o.sentTo }); setOffering(false); setDraft({ companyId: null, contactId: null, note: "" });
          })}>Send offer</Button>
        </div>
      )}
      {answering && a && (
        <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          <Select aria-label="Their answer" value={answer.status} onChange={v => setAnswer({ ...answer, status: v as typeof answer.status })}
            options={[{ value: "accepted", label: "Accepted, no time yet" }, { value: "scheduled", label: "Accepted, with a time" }, { value: "declined", label: "Declined" }]} />
          {answer.status === "scheduled" && <input type="datetime-local" className="date-input" aria-label="Visit time" value={answer.when} onChange={e => setAnswer({ ...answer, when: e.target.value })} />}
          <TextField size="small" id={`answer-note-${item.id}`} inputAriaLabel="What they said" placeholder="What they said" value={answer.note} onChange={v => setAnswer({ ...answer, note: v })} />
          <Button size="small" disabled={answer.status === "scheduled" && !answer.when} onClick={() => onRun(async () => {
            await repo.updateMaintenanceAssignment(a.id, { status: answer.status, scheduledFor: answer.status === "scheduled" ? new Date(answer.when).toISOString() : null, note: answer.note.trim() || undefined });
            await repo.addMaintenanceNote({ requestId: item.requestId, assignmentId: a.id, channel: "phone", body: `${a.companyName ?? a.contactName ?? "The contractor"} ${answer.status === "declined" ? "declined" : "accepted"} by phone${answer.status === "scheduled" ? ` for ${new Date(answer.when).toLocaleString()}` : ""}${answer.note.trim() ? `: ${answer.note.trim()}` : ""}` });
            setAnswering(false);
          })}>Record</Button>
        </div>
      )}
    </div>
  );
}
