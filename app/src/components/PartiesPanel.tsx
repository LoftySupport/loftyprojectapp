import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Select } from "./Select";
import { Problem } from "./Form";
import type { PartyTarget, RecordParty } from "../data/types";
import "./ui.css";
import "./processes.css";

/**
 * Who, from outside Lofty, is on this record and as what (0082).
 *
 * The purchaser on a job, the plumber on its plumbing run, the council on the project.
 * A row is a person and/or a company in a role; a run-level party shows here too because
 * the view resolves the run back to its job — "who did the plumbing on 1042-01" is the
 * question maintenance will ask, and this is where the answer is recorded.
 *
 * Removing a party ENDS it. The database refuses deleting a contact or company that has
 * history, and a party that was on the job for three months is history.
 */
export function PartiesPanel({
  target, title = "People & companies", compact = false, reloadKey = 0
}: {
  target: PartyTarget;
  title?: string;
  /** Inside a process row: no heading, one line per party. */
  compact?: boolean;
  reloadKey?: number;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const key = `${reloadKey}:${reload}`;
  const targetKey = JSON.stringify(target);
  const { data: parties, loading } = useQuery<RecordParty[]>(r => r.listRecordParties(target), [], [targetKey, key]);
  const { data: roles } = useQuery(r => r.listPartyRoles(), []);
  const { data: contacts } = useQuery(r => r.listContacts(), [], [key]);
  const { data: companies } = useQuery(r => r.listCompanies(), [], [key]);

  const [adding, setAdding] = useState(false);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [engagedBy, setEngagedBy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showEnded, setShowEnded] = useState(false);

  const current = useMemo(() => parties.filter(p => p.endedOn == null), [parties]);
  const ended = useMemo(() => parties.filter(p => p.endedOn != null), [parties]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setProblem(null);
    try { await fn(); setReload(n => n + 1); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  const add = () => {
    if (!roleId || (!contactId && !companyId)) return;
    return run(async () => {
      await repo.addRecordParty({ ...target, roleId, contactId, companyId, engagedByCompanyId: engagedBy });
      setAdding(false); setRoleId(null); setContactId(null); setCompanyId(null); setEngagedBy(null);
    });
  };

  // When a person is picked and they are at one company, that company is offered, not
  // assumed: the row records who they acted FOR here, which is a fact about this job.
  const pickedContact = contacts.find(c => c.id === contactId);
  const roleOptions = roles.filter(r => r.isActive).map(r => ({ value: r.id, label: r.name }));
  const contactOptions = contacts.map(c => ({ value: c.id, label: c.companyName ? `${c.fullName} — ${c.companyName}` : c.fullName }));
  const companyOptions = companies.map(c => ({ value: c.id, label: c.name }));

  const line = (p: RecordParty) => (
    <li key={p.id} className="party-row">
      <span className="party-role">{p.roleName}</span>
      <span className="party-who">
        {p.contactName && <Link to={`/contacts?person=${p.contactId}`} className="tap-link">{p.contactName}</Link>}
        {p.contactName && p.companyName && <span className="muted"> · </span>}
        {p.companyName && <Link to={`/contacts?company=${p.companyId}`} className="tap-link">{p.companyName}</Link>}
        {p.engagedByCompanyName && <span className="slot-sub"> engaged by {p.engagedByCompanyName}</span>}
        {p.processName && !("processRunId" in target) && <span className="slot-chip">{p.processName}</span>}
        {p.isPrimary && <span className="slot-chip is-current">primary</span>}
      </span>
      <span className="party-reach">
        {p.contactPhone && <a href={`tel:${p.contactPhone.replace(/\s/g, "")}`} className="tap-link">{p.contactPhone}</a>}
        {p.contactEmail && <a href={`mailto:${p.contactEmail}`} className="tap-link">{p.contactEmail}</a>}
      </span>
      {p.endedOn
        ? <span className="slot-sub">ended {new Date(p.endedOn + "T00:00:00").toLocaleDateString()}</span>
        : can("user") && (
          <Button size="xs" kind="tertiary" disabled={busy} aria-label={`End ${p.contactName ?? p.companyName ?? "this party"}'s ${p.roleName} role here`}
            onClick={() => run(() => repo.updateRecordParty(p.id, { endedOn: new Date().toISOString().slice(0, 10) }))}>
            End
          </Button>
        )}
    </li>
  );

  if (compact && !loading && current.length === 0 && !can("user")) return null;

  return (
    <section className={compact ? "party-compact" : "panel"} aria-label={title}>
      {!compact && (
        <div className="panel-head">
          <Text type="text2" weight="bold">{title}</Text>
          <div className="panel-actions">
            {ended.length > 0 && (
              <Button size="xs" kind="tertiary" onClick={() => setShowEnded(v => !v)}>
                {showEnded ? "Hide ended" : `${ended.length} ended`}
              </Button>
            )}
            {can("user") && !adding && <Button size="small" onClick={() => setAdding(true)}>+ Add</Button>}
          </div>
        </div>
      )}
      {problem && <Problem>{problem}</Problem>}

      {!loading && current.length === 0 && !adding && (
        <Text type="text3" color="secondary" ellipsis={false}>
          {compact ? "Nobody from outside Lofty recorded on this process." : "Nobody from outside Lofty recorded here yet — the purchaser, the trades, the certifier."}
          {compact && can("user") && <> <button type="button" className="link-button tap-link" onClick={() => setAdding(true)}>Add one</button>.</>}
        </Text>
      )}

      {(current.length > 0 || (showEnded && ended.length > 0)) && (
        <ul className="party-list">
          {current.map(line)}
          {showEnded && ended.map(line)}
        </ul>
      )}
      {compact && !adding && current.length > 0 && can("user") && (
        <button type="button" className="link-button tap-link" onClick={() => setAdding(true)}>Add a person or company</button>
      )}

      {adding && can("user") && (
        <div className="party-add">
          <Select aria-label="Role on this record" placeholder="Role…" options={roleOptions} value={roleId} clearable onChange={setRoleId} />
          <Select aria-label="Person" placeholder="Person…" options={contactOptions} value={contactId} clearable
            onChange={v => { setContactId(v); const c = contacts.find(x => x.id === v); if (c?.companyId && !companyId) setCompanyId(c.companyId); }} />
          <Select aria-label="Company" placeholder={pickedContact?.companyName ? `Company (${pickedContact.companyName})` : "Company…"} options={companyOptions} value={companyId} clearable onChange={setCompanyId} />
          <Select aria-label="Engaged by" placeholder="Engaged by (sub-contract)…" options={companyOptions} value={engagedBy} clearable onChange={setEngagedBy} />
          <Button size="small" disabled={busy || !roleId || (!contactId && !companyId)} onClick={add}>Add</Button>
          <Button size="small" kind="tertiary" onClick={() => setAdding(false)}>Cancel</Button>
          <Text type="text3" color="secondary" element="span">
            Not in the list? <Link to="/contacts?new=1" className="tap-link">Add them in Contacts</Link>.
          </Text>
        </div>
      )}
    </section>
  );
}
