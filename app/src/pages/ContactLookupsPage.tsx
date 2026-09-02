import { useState } from "react";
import { Button, Checkbox, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Problem } from "../components/Form";
import { Select } from "../components/Select";
import type { Classification, PartyRole, StaffRole } from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Setup → Contacts: the three lookups behind the Contacts screen (0082) — what a party
 * IS (classifications), what a party is doing on a record (party roles), and SiteBook's
 * project roles for Lofty people (staff roles). Managers edit; a retired row keeps its
 * history and leaves the pickers.
 */
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]/, "n$&");
const APPLIES = [{ value: "both", label: "People and companies" }, { value: "contact", label: "People only" }, { value: "company", label: "Companies only" }];

export function ContactLookupsPage() {
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("manager");
  const [reload, setReload] = useState(0);
  const { data: classifications } = useQuery(r => r.listClassifications(), [], [reload]);
  const { data: partyRoles } = useQuery(r => r.listPartyRoles(), [], [reload]);
  const { data: staffRoles } = useQuery(r => r.listStaffRoles(), [], [reload]);
  const [problem, setProblem] = useState<string | null>(null);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [newAbbr, setNewAbbr] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); setReload(n => n + 1); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }

  const lookup = <T extends { id: string; name: string; position: number; isActive: boolean }>(
    key: string, title: string, note: string, rows: T[], save: (row: T) => Promise<unknown>,
    make: (name: string) => T, extra?: (row: T) => React.ReactNode
  ) => (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{title} ({rows.filter(r => r.isActive).length})</Text>
        <Text type="text3" color="secondary">{note}</Text>
      </div>
      <ul className="dep-list">
        {rows.map(r => (
          <li key={r.id} className={r.isActive ? undefined : "muted"}>
            <Text type="text2" element="span" style={{ flex: "1 1 200px" }}>
              {r.name} <span className="muted"><code>{r.id}</code></span>
            </Text>
            {extra?.(r)}
            <Checkbox label={r.isActive ? "Active" : "Retired"} checked={r.isActive} disabled={!canEdit}
              onChange={() => run(() => save({ ...r, isActive: !r.isActive }))} />
          </li>
        ))}
      </ul>
      {canEdit && (
        <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
          {key === "staff" && (
            <input className="pf-input dep-lag" aria-label="Abbreviation for the new role" placeholder="ABBR" value={newAbbr}
              onChange={e => setNewAbbr(e.target.value.toUpperCase())} />
          )}
          <input className="pf-input" aria-label={`New ${title.toLowerCase()} name`} placeholder={`Add a ${title.toLowerCase().replace(/s$/, "")}…`} value={newName[key] ?? ""}
            onChange={e => setNewName(d => ({ ...d, [key]: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter" && (newName[key] ?? "").trim()) { run(() => save(make(newName[key].trim()))); setNewName(d => ({ ...d, [key]: "" })); setNewAbbr(""); } }} />
          <Button size="small" disabled={!(newName[key] ?? "").trim() || (key === "staff" && !newAbbr.trim())}
            onClick={() => { run(() => save(make(newName[key].trim()))); setNewName(d => ({ ...d, [key]: "" })); setNewAbbr(""); }}>
            Add
          </Button>
        </div>
      )}
    </section>
  );

  const appliesSelect = (value: string, onChange: (v: string) => void, label: string) =>
    canEdit ? (
      <Select aria-label={label} options={APPLIES} value={value} onChange={onChange} />
    ) : <Text type="text3" color="secondary" element="span">{APPLIES.find(a => a.value === value)?.label}</Text>;

  return (
    <div className="stack">
      <Text type="text2" color="secondary" ellipsis={false}>
        The words behind the Contacts screen. A <strong>classification</strong> is what a person or company is
        to Lofty; a <strong>party role</strong> is what they are doing on a particular job, project or process;
        a <strong>project role</strong> is one of SiteBook's roles a Lofty person holds on a project.
        {canEdit ? " Managers and above edit; retiring keeps the history." : " Managers and above edit."}
      </Text>
      {problem && <Problem>{problem}</Problem>}
      {lookup<Classification>("class", "Classifications", "client, contractor, supplier…", classifications, repo.saveClassification,
        name => ({ id: slugify(name), name, appliesTo: "both", position: classifications.length + 1, isActive: true }),
        r => appliesSelect(r.appliesTo, v => run(() => repo.saveClassification({ ...r, appliesTo: v as Classification["appliesTo"] })), `Who ${r.name} applies to`))}
      {lookup<PartyRole>("role", "Party roles", "purchaser, certifier, council…", partyRoles, repo.savePartyRole,
        name => ({ id: slugify(name), name, appliesTo: "both", position: partyRoles.length + 1, isActive: true }),
        r => appliesSelect(r.appliesTo, v => run(() => repo.savePartyRole({ ...r, appliesTo: v as PartyRole["appliesTo"] })), `Who ${r.name} applies to`))}
      {lookup<StaffRole & { name: string }>("staff", "Project roles", "SiteBook's SS, CM, CA…", staffRoles, repo.saveStaffRole,
        name => ({ id: slugify(name), abbreviation: newAbbr.trim(), name, position: staffRoles.length + 1, isActive: true }),
        r => <span className="party-role">{r.abbreviation}</span>)}
    </div>
  );
}
