import { useEffect, useState } from "react";
import { Button, Checkbox, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useTeams } from "../data/useLookups";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import type { MaintenanceCategory, MaintenanceSettings } from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Setup → Maintenance (0084): the clocks and the trades.
 *
 * Amber, 2 September: warranty "3 months is standard"; SLAs "editable in app"; the
 * categories "pull from the contractors who are listed in the database and assigned during
 * the construction stage". So a category is a trade — the party role that did the work on
 * site — with its SLA and at-risk lead; the item's default repairer follows from the job's
 * parties in that role. Nothing is seeded: the list is empty until a manager writes it.
 *
 * The outbox panel at the end says what the thread's worker has actually sent, and says
 * plainly when nothing has.
 */
export function MaintenanceSetupPage() {
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("manager");
  const { teams } = useTeams();
  const [reload, setReload] = useState(0);
  const { data: settings } = useQuery<MaintenanceSettings | null>(r => r.getMaintenanceSettings(), null, [reload]);
  const { data: categories } = useQuery<MaintenanceCategory[]>(r => r.listMaintenanceCategories({ includeInactive: true }), [], [reload]);
  const { data: roles } = useQuery(r => r.listPartyRoles(), []);
  const { data: outbox } = useQuery(r => r.listMaintenanceOutboxStats(), [], [reload]);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<MaintenanceSettings | null>(null);
  const [newCat, setNewCat] = useState({ name: "", partyRoleId: null as string | null, teamId: null as string | null, slaDays: "", lead: "" });

  useEffect(() => { if (settings) setDraft(settings); }, [settings]);

  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); setReload(n => n + 1); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }
  const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v) || 0));
  const slug = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]/, "t$&") || "trade";
  const dirty = settings && draft && JSON.stringify(settings) !== JSON.stringify(draft);

  return (
    <div className="stack">
      <Text type="text2" color="secondary" ellipsis={false}>
        The <strong>settings</strong> are the clocks every request runs on; the <strong>trades</strong> are the categories a request or
        an item is filed under, each with its own SLA and the party role that did that work on the build — which is how the tab knows who
        to offer a repair to first. {canEdit ? "Managers edit." : "Managers edit; you can read what applies."}
      </Text>
      {problem && <Problem>{problem}</Problem>}

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Settings</Text>
          {settings && <Text type="text3" color="secondary">changed {new Date(settings.updatedAt).toLocaleString()}</Text>}
        </div>
        {draft && (
          <>
            <Field label="Warranty period (months)" hint="From the completion of the 7 - Handover run. Amber: 3 months is standard.">
              <input type="number" min={1} className="pf-input dep-lag" aria-label="Warranty months" disabled={!canEdit} value={draft.warrantyMonths} onChange={e => setDraft({ ...draft, warrantyMonths: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
            <Field label="Hours a contractor has to answer an offer" hint="After this, the request's owner is told the offer is unanswered.">
              <input type="number" min={1} className="pf-input dep-lag" aria-label="Offer response hours" disabled={!canEdit} value={draft.offerResponseHours} onChange={e => setDraft({ ...draft, offerResponseHours: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
            <Field label="Visit reminders (days before)" hint="The owner in-app and the homeowner by email.">
              <input type="number" min={0} className="pf-input dep-lag" aria-label="Reminder days before" disabled={!canEdit} value={draft.reminderDaysBefore} onChange={e => setDraft({ ...draft, reminderDaysBefore: Math.max(0, Number(e.target.value) || 0) })} />
            </Field>
            <Field label="Accept link lives (days)" hint="A contractor's link stops working after this.">
              <input type="number" min={1} className="pf-input dep-lag" aria-label="Accept link days" disabled={!canEdit} value={draft.acceptLinkDays} onChange={e => setDraft({ ...draft, acceptLinkDays: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
            <Field label="Intake mailbox" hint="The address homeowners write to. Left blank until it exists — nothing reads mail until the inbound function is connected to it.">
              <TextField size="small" id="maintenance-intake" inputAriaLabel="Intake mailbox" placeholder="maintenance@lofty.com.au" disabled={!canEdit} value={draft.intakeMailbox ?? ""} onChange={v => setDraft({ ...draft, intakeMailbox: v.trim() || null })} />
            </Field>
            {canEdit && (
              <div className="field-inline" style={{ justifyContent: "flex-end" }}>
                <Button size="small" kind="tertiary" disabled={!dirty} onClick={() => setDraft(settings)}>Reset</Button>
                <Button size="small" disabled={!dirty} onClick={() => run(() => repo.saveMaintenanceSettings({
                  warrantyMonths: draft.warrantyMonths, offerResponseHours: draft.offerResponseHours, reminderDaysBefore: draft.reminderDaysBefore,
                  acceptLinkDays: draft.acceptLinkDays, intakeMailbox: draft.intakeMailbox
                }))}>Save settings</Button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Trades</Text>
          <Text type="text3" color="secondary">{categories.length === 0 ? "none yet" : `${categories.filter(c => c.isActive).length} active`}</Text>
        </div>
        {categories.length === 0 && (
          <Text type="text3" color="secondary" ellipsis={false} element="p">
            No trades yet, on purpose — they are yours to name. A request filed under no trade has no SLA and says so.
          </Text>
        )}
        {categories.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Trade</th><th>Did this on the build</th><th>Lofty team</th><th className="num">SLA days</th><th className="num">At risk (days before)</th><th>Active</th></tr></thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id} className={c.isActive ? undefined : "muted"}>
                    <td>
                      {canEdit ? (
                        <input className="pf-input" aria-label={`Name of ${c.name}`} defaultValue={c.name} key={c.name}
                          onBlur={e => { const v = e.target.value.trim(); if (v && v !== c.name) run(() => repo.saveMaintenanceCategory({ ...c, name: v })); }} />
                      ) : c.name}
                    </td>
                    <td>
                      {canEdit ? (
                        <Select aria-label={`Party role for ${c.name}`} clearable placeholder="Party role…" value={c.partyRoleId}
                          options={roles.filter(r => r.isActive || r.id === c.partyRoleId).map(r => ({ value: r.id, label: r.name }))}
                          onChange={v => run(() => repo.saveMaintenanceCategory({ ...c, partyRoleId: v }))} />
                      ) : (roles.find(r => r.id === c.partyRoleId)?.name ?? "—")}
                    </td>
                    <td>
                      {canEdit ? (
                        <Select aria-label={`Team for ${c.name}`} clearable placeholder="Team…" value={c.teamId}
                          options={teams.map(t => ({ value: t.id, label: t.name }))}
                          onChange={v => run(() => repo.saveMaintenanceCategory({ ...c, teamId: v }))} />
                      ) : (teams.find(t => t.id === c.teamId)?.name ?? "—")}
                    </td>
                    <td className="num">
                      {canEdit ? (
                        <input type="number" min={0} className="pf-input dep-lag" aria-label={`SLA days for ${c.name}`} defaultValue={c.slaDays ?? ""} key={`sla-${c.slaDays}`}
                          onBlur={e => { const v = num(e.target.value); if (v !== c.slaDays) run(() => repo.saveMaintenanceCategory({ ...c, slaDays: v })); }} />
                      ) : (c.slaDays ?? "—")}
                    </td>
                    <td className="num">
                      {canEdit ? (
                        <input type="number" min={0} className="pf-input dep-lag" aria-label={`At-risk lead for ${c.name}`} defaultValue={c.atRiskLeadDays ?? ""} key={`lead-${c.atRiskLeadDays}`}
                          onBlur={e => { const v = num(e.target.value); if (v !== c.atRiskLeadDays) run(() => repo.saveMaintenanceCategory({ ...c, atRiskLeadDays: v })); }} />
                      ) : (c.atRiskLeadDays ?? "—")}
                    </td>
                    <td>
                      {canEdit ? <Checkbox label={c.isActive ? "Active" : "Off"} checked={c.isActive} onChange={() => run(() => repo.saveMaintenanceCategory({ ...c, isActive: !c.isActive }))} /> : (c.isActive ? "yes" : "no")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && (
          <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-8)" }}>
            <TextField size="small" id="new-trade-name" inputAriaLabel="New trade" placeholder="Trade — Plumbing" value={newCat.name} onChange={v => setNewCat({ ...newCat, name: v })} />
            <Select aria-label="Party role for the new trade" clearable placeholder="Did this on the build…" value={newCat.partyRoleId} options={roles.filter(r => r.isActive).map(r => ({ value: r.id, label: r.name }))} onChange={v => setNewCat({ ...newCat, partyRoleId: v })} />
            <Select aria-label="Team for the new trade" clearable placeholder="Team…" value={newCat.teamId} options={teams.map(t => ({ value: t.id, label: t.name }))} onChange={v => setNewCat({ ...newCat, teamId: v })} />
            <input type="number" min={0} className="pf-input dep-lag" aria-label="SLA days for the new trade" placeholder="SLA" value={newCat.slaDays} onChange={e => setNewCat({ ...newCat, slaDays: e.target.value })} />
            <input type="number" min={0} className="pf-input dep-lag" aria-label="At-risk lead for the new trade" placeholder="lead" value={newCat.lead} onChange={e => setNewCat({ ...newCat, lead: e.target.value })} />
            <Button size="small" disabled={!newCat.name.trim()} onClick={() => run(async () => {
              await repo.saveMaintenanceCategory({
                id: slug(newCat.name), name: newCat.name.trim(), partyRoleId: newCat.partyRoleId, teamId: newCat.teamId,
                slaDays: num(newCat.slaDays), atRiskLeadDays: num(newCat.lead), position: categories.length + 1, isActive: true
              });
              setNewCat({ name: "", partyRoleId: null, teamId: null, slaDays: "", lead: "" });
            })}>Add trade</Button>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">The thread's outbox</Text>
          <Text type="text3" color="secondary">offers, reminders and closing emails to homeowners and contractors</Text>
        </div>
        {outbox.length === 0 ? (
          <Text type="text3" color="secondary" ellipsis={false}>Nothing has been queued yet.</Text>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Status</th><th className="num">Rows</th><th>Latest</th></tr></thead>
              <tbody>
                {outbox.map(s => (
                  <tr key={s.status}><td>{s.status}</td><td className="num">{s.count}</td><td className="muted">{s.lastAt ? new Date(s.lastAt).toLocaleString() : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-8)" }}>
          These go through the same worker as notifications (<code>supabase/functions/deliver-notifications</code>), which fills each
          offer's accept link on the way out{outbox.some(s => s.status === "sent") ? "" : " — nothing has been marked sent yet, so it is not running"}.
          Inbound mail needs <code>maintenance-inbound</code> connected to the intake mailbox; the accept link needs
          <code>maintenance-accept</code> deployed. Both are written and neither is deployed from here.
        </Text>
      </section>
    </div>
  );
}
