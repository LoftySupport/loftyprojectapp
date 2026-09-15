import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Checkbox, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useProcessProperties, useProcesses, usePropertyDefs, usePropertyOptions, useStages, useTeams } from "../data/useLookups";
import { VERDICT_LABELS, fieldsByCollection, orphanCount } from "../data/orphanProperties";
import { SidePanel } from "../components/SidePanel";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import { BlurText, NumberInput } from "../components/InlineInputs";
import {
  PERMISSION_LEVELS, PROPERTY_FORMATS, PROPERTY_SCOPES, RECORDABLE_FORMATS, teamName,
  type NewPropertyDef, type PermissionLevel, type PropertyAccess, type PropertyDef, type PropertyDefPatch,
  type PropertyFormat, type PropertyOption, type PropertyScope, type Team, type TeamId
} from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Setup → Properties: every field the company captures, editable in place.
 *
 * Amber, 1 Sep: "You will need to update the Properties table in the app so that the
 * properties are editable." And: security levels per property, team-level CRUD, and a
 * restricted flag that is opt-in.
 *
 * Amber, 2 Sep: "the processes and properties should follow correct format and be easy
 * to edit, not in a drop down but always show in a sidebar like elsewhere in the app."
 *
 * So the table on the left is a LIST — one row per property, grouped by the stage that
 * captures it, read-only — and the selected property opens in a panel beside it (under it
 * on a phone) where EVERYTHING about it is editable and in view: label, level, stage, team,
 * format, SLA, position, description, required, active, restricted, the four security
 * rungs, the teams and people with access, the choices of a select, and delete. Nothing
 * sits behind a "More" toggle or an expanding row any more. The selection rides the URL
 * (`?property=…`), like a contact or a maintenance request.
 *
 * Each field saves on blur or change and the database answers — a manager retitles and
 * retypes, an admin sets the four rungs and the grants, a superadmin alone restricts.
 * Below manager the page is the same page, read-only; the controls above manager's rung
 * are hidden below the rung that may use them, because a control the database will
 * refuse is a lie.
 *
 * THE 87 WITH NO FORMAT
 *
 *   The workbook said "unknown (no data)" and the seed kept the word. Those rows are the
 *   first thing this page wants sorted, so they filter to the top with one tick and read
 *   "not set" in the list. A slot with no format cannot be recorded against — the CHECK
 *   says so — which is the honest state until somebody who knows says "date".
 */

const slugify = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]/, "n$&");

const EMPTY_DEF: NewPropertyDef = {
  key: "", label: "", scope: "job", stageName: "", teamId: null, format: "text"
};

const LEVEL_OPTIONS = PERMISSION_LEVELS.map(l => ({ value: l, label: l }));

export function PropertiesSetupPage() {
  const [params, setParams] = useSearchParams();
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("manager");
  const [reload, setReload] = useState(0);
  const bump = () => setReload(k => k + 1);

  const { propertyDefs } = usePropertyDefs(reload);
  const { stageNames } = useStages();
  const { teams } = useTeams();
  const { byProperty: processesByProperty } = useProcessProperties(reload);
  const { byId: processById } = useProcesses();
  const { byProperty: optionsByProperty } = usePropertyOptions(reload);
  const { data: grants } = useQuery(r => r.listPropertyAccess(), [], [reload]);
  const { data: profiles } = useQuery(r => r.listProfiles(), []);

  const selectedKey = params.get("property");
  const creating = params.get("new") === "1";
  const [error, setError] = useState<string | null>(null);

  // Filters: which stage, only-unknown, retired shown, and a search.
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  /* Amber, 12 September: *"all properties should belong to a process if it is job or
     project and if they don't they should be flagged as orphaned in the properties
     setting"*. */
  const [onlyOrphaned, setOnlyOrphaned] = useState(params.get("orphaned") === "1");
  const [showRetired, setShowRetired] = useState(false);
  const [search, setSearch] = useState("");

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v == null) next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  const select = (key: string | null) => setParam({ property: key, new: null });

  const grantsByKey = useMemo(() => {
    const m = new Map<string, PropertyAccess[]>();
    grants.forEach(g => { (m.get(g.propertyKey) ?? m.set(g.propertyKey, []).get(g.propertyKey)!).push(g); });
    return m;
  }, [grants]);

  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = propertyDefs.filter(d =>
    (showRetired || d.isActive || d.key === selectedKey)
    && (!stageFilter || d.stageName === stageFilter)
    && (!onlyUnknown || d.format === "unknown")
    && (!onlyOrphaned || ((d.scope === "job" || d.scope === "project") && (processesByProperty.get(d.key) ?? []).length === 0))
    && terms.every(t => `${d.label} ${d.key} ${d.teamName ?? ""} ${d.format} ${d.scope}`.toLowerCase().includes(t))
  );
  const stages = stageNames.length ? stageNames : [...new Set(propertyDefs.map(d => d.stageName))];
  const groups = stages
    .map(stage => ({ stage, defs: shown.filter(d => d.stageName === stage).sort((a, b) => a.position - b.position || a.label.localeCompare(b.label)) }))
    .filter(g => g.defs.length > 0);

  const selected = propertyDefs.find(d => d.key === selectedKey) ?? null;
  /**
   * Every field of a job or a project, and whether a process collects it.
   *
   * The second half is the part that needed building: a sweep of `property_defs` alone
   * would report a clean board while the six things on the job record's Key properties
   * panel — the address among them — were collected by nothing, because they are columns
   * rather than property rows. See `orphanProperties.ts`.
   */
  const fields = useMemo(
    () => fieldsByCollection(propertyDefs, processesByProperty),
    [propertyDefs, processesByProperty]
  );
  const orphans = orphanCount(fields);
  /* Grouped by verdict, gaps first — the same shape the property table above uses, and
     it stops the Why column repeating one sentence thirty-three times. */
  const notProperties = useMemo(() => {
    const columns = fields.filter(f => f.source === "column" && f.verdict !== "gone");
    return ([["unattachable", "Not a property"], ["system", "System"]] as const)
      .map(([verdict, label]) => ({
        verdict,
        label,
        rows: columns.filter(f => f.verdict === verdict).sort((a, b) => a.id.localeCompare(b.id))
      }))
      .filter(g => g.rows.length > 0);
  }, [fields]);
  const notPropertyCount = notProperties.reduce((n, g) => n + g.rows.length, 0);

  const unknownCount = propertyDefs.filter(d => d.isActive && d.format === "unknown").length;
  const restrictedCount = propertyDefs.filter(d => d.restricted).length;
  const activeProfiles = useMemo(() => profiles.filter(p => p.active).map(p => ({ id: p.id, name: p.fullName })), [profiles]);

  async function patch(key: string, change: PropertyDefPatch) {
    setError(null);
    try { await repo.updatePropertyDef(key, change); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <>
      <div className="panel-head">
        <Text type="text2" weight="bold">Property definitions ({propertyDefs.filter(d => d.isActive).length})</Text>
        <div className="panel-actions">
          {orphans.orphaned > 0 && (
            <button
              type="button"
              className="link-button"
              onClick={() => setOnlyOrphaned(true)}
            >
              {orphans.orphaned} orphaned
            </button>
          )}
          {unknownCount > 0 && <Text type="text3" color="secondary">{unknownCount} without a format</Text>}
          {restrictedCount > 0 && <span className="lock-badge">{restrictedCount} restricted</span>}
        </div>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Properties are <strong>rows, not columns</strong>. Each says where it lives (<strong>project</strong> — one
        answer for the site, pushable to the jobs — or <strong>job</strong>), which stage and process collect it,
        what shape the value takes, and who may see and change it: four permission rungs, the teams and people
        named below them, and <strong>restricted</strong> — opt-in, nobody but a superadmin until a team or person
        is granted. Pick one and it opens beside the list. {canEdit ? "Managers edit wording, format and team; admins set the rungs and grants; superadmins restrict." : "Managers and above edit."}
      </Text>

      {error && <Problem>{error}</Problem>}

      <div className="toolbar" style={{ marginTop: "var(--space-12)" }}>
        <Select aria-label="Filter by stage" clearable placeholder="All stages" options={stages.map(s => ({ value: s, label: s }))}
          value={stageFilter} onChange={setStageFilter} />
        <TextField size="small" id="props-search" inputAriaLabel="Search properties" placeholder="Search…" value={search} onChange={setSearch} />
        <Checkbox label="Only without a format" checked={onlyUnknown} onChange={() => setOnlyUnknown(v => !v)} />
        <Checkbox label="Only orphaned" checked={onlyOrphaned} onChange={() => setOnlyOrphaned(v => !v)} />
        <Checkbox label="Show retired" checked={showRetired} onChange={() => setShowRetired(v => !v)} />
        {canEdit && <Button size="small" onClick={() => setParam({ new: "1", property: null })}>+ Add property</Button>}
      </div>

      {/* Full width, with the property opening over it in the shared slideout — the
          same change, for the same reason, as Contacts and Maintenance (Amber, 3 Sep:
          "ensure all pages open items in the slideout side bar (can expand to full
          width) and is width adjustable"). */}
      <section className="panel">
          {propertyDefs.length === 0 && (
            <div className="search-note">
              <Text type="text3" ellipsis={false}>
                <strong>Nothing defined yet.</strong> The table starts empty on purpose — a guess on this screen
                gets quoted back as though it were agreed.
              </Text>
            </div>
          )}
          <div className="data-table-wrap">
            <table className="data-table props-table">
              <thead>
                <tr><th>Property</th><th>Process</th><th>Level</th><th>Team</th><th>Format</th><th className="num">SLA</th><th>Access</th></tr>
              </thead>
              {groups.map(g => (
                <tbody className="group" key={g.stage}>
                  <tr className="group-head"><th colSpan={7} scope="colgroup">{g.stage} · {g.defs.length} propert{g.defs.length === 1 ? "y" : "ies"}</th></tr>
                  {g.defs.map(d => {
                    const procs = (processesByProperty.get(d.key) ?? []).map(pp => processById.get(pp.processId)?.name).filter(Boolean);
                    return (
                      <tr key={d.key} className={`contact-row${d.key === selectedKey ? " is-selected" : ""}`} onClick={() => select(d.key)} aria-current={d.key === selectedKey ? "true" : undefined}>
                        <td>
                          <button type="button" className="link-button tap-link" onClick={e => { e.stopPropagation(); select(d.key); }}>
                            <strong>{d.label}</strong>
                          </button>
                          <div className="slot-sub is-key"><code>{d.key}</code>{!d.isActive && <span className="slot-chip">retired</span>}{d.restricted && <span className="slot-chip is-differs">restricted</span>}{d.required && <span className="slot-chip">required</span>}</div>
                        </td>
                        <td className="muted">{procs.length ? procs.join(", ") : "—"}</td>
                        <td className="muted">{d.scope}</td>
                        <td className="muted">{d.teamName ?? "—"}</td>
                        <td>{d.format === "unknown" ? <span className="pf-unset muted">not set</span> : d.format}</td>
                        <td className="num">{d.slaDays ?? <span className="muted">—</span>}</td>
                        <td className="muted">{describeAccess(d, grantsByKey.get(d.key) ?? [], teams)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
            {propertyDefs.length > 0 && shown.length === 0 && (
              <Text type="text2" color="secondary" element="p" ellipsis={false}>Nothing matches — clear the search or the filters.</Text>
            )}
          </div>
      </section>

      {/* THE FIELDS THAT ARE NOT PROPERTY ROWS, AND THEREFORE CANNOT BELONG TO A PROCESS.
          Amber, 12 September: *"this should have all properties including properties not
          on the properties table eg address"*.

          A sweep of `property_defs` alone reports a clean board while the address, the
          council, the owning team, the assignee and both completion dates are collected
          by nothing — they are columns on `jobs` and `projects`, and
          `process_properties.property_key` points at `property_defs`, so there is nowhere
          for the attachment to hang. That is the finding, said out loud rather than left
          as a clean-looking count.

          The System group is shown rather than hidden. Amber exempted *"a system property
          such as a primary key"*, and an exemption list nobody can see is an exemption
          list nobody can correct — every row says why it is exempt. */}
      <section className="panel" style={{ marginTop: "var(--space-16)" }}>
        <div className="panel-head">
          <Text type="text2" weight="bold">Fields that are not properties ({notPropertyCount})</Text>
          <div className="panel-actions">
            {orphans.unattachable > 0 && (
              <span className="slot-chip is-differs">{orphans.unattachable} no process can collect</span>
            )}
          </div>
        </div>
        <Text type="text2" color="secondary" ellipsis={false}>
          Columns on <code>jobs</code> and <code>projects</code>, from the data dictionary. A process
          collects a <strong>property</strong>, and these are not properties — so nothing can be attached
          to them until they have a definition. System fields are exempt and listed here so the exemption
          can be read and argued with.
        </Text>
        <div className="data-table-wrap">
          <table className="data-table props-table">
            <thead>
              <tr><th>Field</th><th>Column</th><th>Record</th><th>Why</th></tr>
            </thead>
            {notProperties.map(g => (
              <tbody className="group" key={g.verdict}>
                <tr className="group-head">
                  <th colSpan={4} scope="colgroup">
                    {VERDICT_LABELS[g.verdict]} · {g.rows.length} field{g.rows.length === 1 ? "" : "s"}
                    {g.verdict === "unattachable"
                      ? " — no process can collect these until they have a definition"
                      : " — exempt: nobody records these"}
                  </th>
                </tr>
                {g.rows.map(f => (
                  <tr key={f.id}>
                    {/* The column in its own cell rather than as a second line under the
                        label: the element sweep counts stacked metadata lines, and Amber
                        had three of them removed from the slot rows on 10 September. */}
                    <td><strong>{f.label}</strong></td>
                    <td className="muted"><code>{f.id}</code></td>
                    <td className="muted">{f.scope}</td>
                    {/* Said once in the group heading for the thirty-three that share a
                        reason; per-row only where the reason is the row's own. */}
                    <td className="muted">{f.verdict === "system" ? f.because : ""}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      {creating && canEdit && (
        <SidePanel open title="New property" onClose={() => setParam({ new: null })}>
          <NewPropertyForm stageNames={stages} teams={teams} onCancel={() => setParam({ new: null })} onCreated={key => { bump(); select(key); }} />
        </SidePanel>
      )}
      {!creating && selected && (
        <SidePanel open title={selected.label} onClose={() => select(null)}>
          <PropertyDetail key={selected.key} def={selected} grants={grantsByKey.get(selected.key) ?? []} options={optionsByProperty.get(selected.key) ?? []}
            processNames={(processesByProperty.get(selected.key) ?? []).map(pp => processById.get(pp.processId)?.name).filter((n): n is string => Boolean(n))}
            stageNames={stages} teams={teams} profiles={activeProfiles}
            onPatch={change => patch(selected.key, change)} onChanged={bump} onError={setError}
            onDeleted={() => { bump(); select(null); }} />
        </SidePanel>
      )}
    </>
  );
}

function describeAccess(d: PropertyDef, grants: PropertyAccess[], teams: readonly Team[]): string {
  const named = grants.map(g => g.teamId ? teamName(g.teamId, teams) : "a person");
  if (d.restricted) return named.length ? `restricted · ${named.join(", ")}` : "restricted · superadmin only";
  if (named.length) return `${named.join(", ")} · managers`;
  return `everyone at ${d.readLevel}+`;
}

// ------------------------------------------------------------------ new property
function NewPropertyForm({ stageNames, teams, onCancel, onCreated }: {
  stageNames: string[]; teams: readonly Team[]; onCancel: () => void; onCreated: (key: string) => void;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const [draft, setDraft] = useState<NewPropertyDef>(EMPTY_DEF);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teamOptions = teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }));
  const valid = /^[a-z][a-z0-9_]*$/.test(draft.key) && draft.label.trim() !== "" && draft.stageName !== "";

  async function save() {
    setSaving(true); setError(null);
    try { const d = await repo.createPropertyDef(draft); onCreated(d.key); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  return (
    <div className="stack" aria-label="New property">
      {error && <Problem>{error}</Problem>}
      <div className="create-form">
        <Field label="Label" required>
          <TextField value={draft.label} id="prop-label" inputAriaLabel="Property label"
            onChange={v => setDraft({ ...draft, label: v, key: keyTouched ? draft.key : slugify(v) })} />
        </Field>
        <Field label="Key" required hint="the identity — lowercase letters, digits and underscores">
          <TextField value={draft.key} id="prop-key" inputAriaLabel="Property key"
            onChange={v => { setKeyTouched(true); setDraft({ ...draft, key: v }); }} />
        </Field>
        <Field label="Level" required hint="a project property is one answer for the whole site, pushable to its jobs">
          <Select aria-label="Property level" options={PROPERTY_SCOPES.map(v => ({ value: v, label: v }))}
            value={draft.scope} onChange={v => setDraft({ ...draft, scope: v as PropertyScope })} />
        </Field>
        <Field label="Captured at" required>
          <Select aria-label="Captured at stage" options={stageNames.map(n => ({ value: n, label: n }))}
            value={draft.stageName} onChange={v => setDraft({ ...draft, stageName: v })} placeholder="Select a stage" />
        </Field>
        <Field label="Captured by" hint="leave blank if no team is answerable yet">
          <Select aria-label="Captured by team" clearable placeholder="No team" options={teamOptions}
            value={draft.teamId ?? null} onChange={v => setDraft({ ...draft, teamId: v as TeamId | null })} />
        </Field>
        <Field label="Format" required>
          <Select aria-label="Property format" options={RECORDABLE_FORMATS.map(f => ({ value: f, label: f }))}
            value={draft.format} onChange={v => setDraft({ ...draft, format: v as PropertyFormat })} />
        </Field>
        <Field label="Description">
          <TextField value={draft.description ?? ""} id="prop-desc" inputAriaLabel="Description"
            onChange={v => setDraft({ ...draft, description: v || null })} />
        </Field>
        {can("superadmin") && (
          <Field label="Restricted" hint="opt-in: hidden from everyone below superadmin until granted">
            <Checkbox label="Restricted" checked={draft.restricted ?? false} onChange={() => setDraft({ ...draft, restricted: !(draft.restricted ?? false) })} />
          </Field>
        )}
      </div>
      <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
        <Button size="small" onClick={save} disabled={saving || !valid}>{saving ? "Saving…" : "Add property"}</Button>
        <Button size="small" kind="tertiary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the detail
function PropertyDetail({ def: d, grants, options, processNames, stageNames, teams, profiles, onPatch, onChanged, onError, onDeleted }: {
  def: PropertyDef; grants: PropertyAccess[]; options: PropertyOption[]; processNames: string[];
  stageNames: string[]; teams: readonly Team[]; profiles: { id: string; name: string }[];
  onPatch: (change: PropertyDefPatch) => Promise<void>; onChanged: () => void; onError: (e: string | null) => void;
  onDeleted: () => void;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("manager");
  const canLevels = can("admin");
  const canGrant = d.restricted ? can("superadmin") : can("admin");
  const [grantee, setGrantee] = useState<string | null>(null);
  const [newOption, setNewOption] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const teamOptions = teams.filter(t => t.isActive || t.id === d.teamId).map(t => ({ value: t.id, label: t.name }));

  async function run(fn: () => Promise<unknown>) {
    onError(null);
    try { await fn(); onChanged(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }
  const addOption = () => {
    if (!newOption.trim()) return;
    run(() => repo.savePropertyOption({ propertyKey: d.key, key: slugify(newOption), label: newOption.trim(), position: options.length + 1, isActive: true }));
    setNewOption("");
  };

  const levelSelect = (label: string, value: PermissionLevel, key: keyof PropertyDefPatch) => (
    <div>
      <Text type="text3" color="secondary">{label}</Text>
      {canLevels ? (
        <Select aria-label={`${label} level for ${d.label}`} options={LEVEL_OPTIONS} value={value} onChange={v => onPatch({ [key]: v as PermissionLevel })} />
      ) : <Text type="text2">{value}</Text>}
    </div>
  );

  return (
    <div className="stack" aria-label={`Details of ${d.label}`}>
      <section className="panel">
        {/* The name and the × are the slideout's; what stays is the line the head cannot
            fit — the key, the stage, and which processes collect it. */}
        <div className="panel-head">
          <div className="slot-sub">
            <code>{d.key}</code> · {d.stageName}{processNames.length > 0 && <> · collected by {processNames.join(", ")}</>}
            {!d.isActive && <span className="slot-chip">retired</span>}{d.restricted && <span className="slot-chip is-differs">restricted</span>}
          </div>
        </div>

        <div className="create-form">
          <Field label="Label" required>
            <BlurText value={d.label} disabled={!canEdit} label={`Label of ${d.label}`} onCommit={v => v.trim() && onPatch({ label: v.trim() })} wide />
          </Field>
          <Field label="Level" required hint="a project property is one answer for the whole site, pushable to its jobs">
            {canEdit ? (
              <Select aria-label={`Level of ${d.label}`} options={PROPERTY_SCOPES.map(v => ({ value: v, label: v }))} value={d.scope} onChange={v => onPatch({ scope: v as PropertyScope })} />
            ) : <Text type="text2">{d.scope}</Text>}
          </Field>
          <Field label="Captured at" required>
            {canEdit ? (
              <Select aria-label={`Stage of ${d.label}`} options={stageNames.map(n => ({ value: n, label: n }))} value={d.stageName} onChange={v => onPatch({ stageName: v })} />
            ) : <Text type="text2">{d.stageName}</Text>}
          </Field>
          <Field label="Captured by" hint="the team answerable for it — blank if nobody is yet">
            {canEdit ? (
              <Select aria-label={`Team for ${d.label}`} clearable placeholder="No team" options={teamOptions} value={d.teamId} onChange={v => onPatch({ teamId: v as TeamId | null })} />
            ) : <Text type="text2">{d.teamName ?? "No team"}</Text>}
          </Field>
          <Field label="Format" required hint={d.format === "unknown" ? "not set — nothing can be recorded against it until it is" : undefined}>
            {canEdit ? (
              <Select aria-label={`Format of ${d.label}`} placeholder="Set a format"
                options={PROPERTY_FORMATS.filter(f => f !== "unknown" || d.format === "unknown").map(f => ({ value: f, label: f === "unknown" ? "— not set —" : f }))}
                value={d.format} onChange={v => onPatch({ format: v as PropertyFormat })} />
            ) : d.format === "unknown" ? <span className="pf-unset">not set</span> : <Text type="text2">{d.format}</Text>}
          </Field>
          <Field label="SLA days" hint="the SLA sheet's number for this step, as given">
            <NumberInput value={d.slaDays} disabled={!canEdit} label={`SLA days for ${d.label}`} min={0} onCommit={v => onPatch({ slaDays: v })} />
          </Field>
          <Field label="Position" hint="order among its stage's slots">
            <NumberInput value={d.position} disabled={!canEdit} label={`Position of ${d.label}`} onCommit={v => onPatch({ position: v ?? 0 })} />
          </Field>
          <Field label="Description" hint="what the field means, for whoever fills it in">
            <BlurText value={d.description ?? ""} disabled={!canEdit} label={`Description of ${d.label}`} onCommit={v => onPatch({ description: v.trim() || null })} wide plain />
          </Field>
          <Field label="Required" hint="required to leave its stage — not required to create the record">
            <Checkbox label="Required to exit the stage" checked={d.required} disabled={!canEdit} onChange={() => onPatch({ required: !d.required })} />
          </Field>
          <Field label="Active" hint="a retired property keeps every value ever recorded in it">
            <Checkbox label={d.isActive ? "Active" : "Retired"} checked={d.isActive} disabled={!canEdit} onChange={() => onPatch({ isActive: !d.isActive })} />
          </Field>
          <Field label="Restricted" hint="opt-in: nobody below superadmin sees or touches its values unless granted below. Superadmin only.">
            <Checkbox label="Restricted" checked={d.restricted} disabled={!can("superadmin")} onChange={() => onPatch({ restricted: !d.restricted })} />
          </Field>
          {d.importRef && (
            <Field label="Source"><Text type="text2">{d.importRef}</Text></Field>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Security levels</Text>
          <Text type="text3" color="secondary">{canLevels ? "the lowest rung that may do each thing" : "admins set these"}</Text>
        </div>
        <Text type="text3" color="secondary" ellipsis={false} element="p">
          Then, below manager, the teams and people named decide — no one named means open at the rung.
        </Text>
        <div className="levels-grid">
          {levelSelect("Record", d.createLevel, "createLevel")}
          {levelSelect("Read", d.readLevel, "readLevel")}
          {levelSelect("Change", d.updateLevel, "updateLevel")}
          {levelSelect("Clear", d.deleteLevel, "deleteLevel")}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Teams and people with access</Text>
          <Text type="text3" color="secondary">{d.restricted ? "the only way in" : "narrows access below manager"}</Text>
        </div>
        {grants.length === 0 && (
          <Text type="text3" color="secondary" ellipsis={false} element="p">
            {d.restricted ? "Nobody yet — superadmin only." : "Nobody named — open to everyone at the rungs above; managers and above always."}
          </Text>
        )}
        <ul className="dep-list">
          {grants.map(g => (
            <li key={g.id}>
              <Text type="text2" element="span" style={{ flex: "1 1 160px" }}>
                {g.teamId ? teamName(g.teamId, teams) : profiles.find(p => p.id === g.profileId)?.name ?? "a person"}
              </Text>
              {(["canCreate", "canRead", "canUpdate", "canDelete"] as const).map(verb => (
                <label key={verb} className="pf-check">
                  <input type="checkbox" checked={g[verb]} disabled={!canGrant}
                    onChange={e => run(() => repo.savePropertyAccess({ propertyKey: d.key, teamId: g.teamId, profileId: g.profileId, canCreate: g.canCreate, canRead: g.canRead, canUpdate: g.canUpdate, canDelete: g.canDelete, [verb]: e.target.checked }))} />
                  <Text type="text3" element="span">{{ canCreate: "record", canRead: "read", canUpdate: "change", canDelete: "clear" }[verb]}</Text>
                </label>
              ))}
              {canGrant && <Button size="xs" kind="tertiary" onClick={() => run(() => repo.deletePropertyAccess(g.id))}>Remove</Button>}
            </li>
          ))}
        </ul>
        {canGrant && (
          <div className="field-inline" style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
            <Select aria-label={`Grant access to ${d.label}`} clearable placeholder="Add a team or a person…"
              options={[
                ...teams.filter(t => t.isActive && !grants.some(g => g.teamId === t.id)).map(t => ({ value: `team:${t.id}`, label: `Team · ${t.name}` })),
                ...profiles.filter(p => !grants.some(g => g.profileId === p.id)).map(p => ({ value: `person:${p.id}`, label: p.name }))
              ]}
              value={grantee} onChange={setGrantee} />
            <Button size="small" disabled={!grantee} onClick={() => {
              if (!grantee) return;
              const [kind, id] = grantee.split(":");
              run(() => repo.savePropertyAccess({ propertyKey: d.key, teamId: kind === "team" ? id : null, profileId: kind === "person" ? id : null, canCreate: true, canRead: true, canUpdate: true, canDelete: false }));
              setGrantee(null);
            }}>Grant</Button>
          </div>
        )}
      </section>

      {(d.format === "single select" || d.format === "multi select") && (
        <section className="panel">
          <div className="panel-head">
            <Text type="text2" weight="bold">Choices ({options.length})</Text>
            <Text type="text3" color="secondary">what the picker offers</Text>
          </div>
          {options.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">No choices yet — the workbook named none, so the picker offers nothing until somebody adds them here.</Text>}
          <ul className="dep-list">
            {options.map(o => (
              <li key={o.key}>
                <Text type="text2" element="span" style={{ flex: "1 1 160px" }}>{o.label} <span className="muted"><code>{o.key}</code></span></Text>
                <Checkbox label="Active" checked={o.isActive} disabled={!canEdit} onChange={() => run(() => repo.savePropertyOption({ ...o, isActive: !o.isActive }))} />
                {canEdit && <Button size="xs" kind="tertiary" onClick={() => run(() => repo.deletePropertyOption(d.key, o.key))}>Remove</Button>}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="field-inline" style={{ marginTop: "var(--space-4)", flexWrap: "wrap" }}>
              <input className="pf-input" aria-label={`New choice for ${d.label}`} placeholder="Add a choice…" value={newOption} onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addOption(); }} />
              <Button size="small" disabled={!newOption.trim()} onClick={addOption}>Add</Button>
            </div>
          )}
        </section>
      )}

      {canEdit && (
        <section className="panel">
          {!confirmDelete ? (
            <div className="field-inline">
              <Button size="small" kind="tertiary" onClick={() => setConfirmDelete(true)}>Delete definition…</Button>
              <Text type="text3" color="secondary" element="span">Deletes its values too. Prefer retiring.</Text>
            </div>
          ) : (
            /* Two clicks, the second one named: the first says what will go, the second does it.
               Retiring keeps every value; this does not, and there is no undo. */
            <div className="field-inline" role="alert">
              <Text type="text2" element="span" ellipsis={false}>
                Delete <strong>{d.label}</strong> and every value ever recorded in it?
              </Text>
              <Button size="small" color="negative" onClick={async () => {
                onError(null);
                try { await repo.deletePropertyDef(d.key); onDeleted(); }
                catch (e) { onError(e instanceof Error ? e.message : String(e)); setConfirmDelete(false); }
              }}>Delete for good</Button>
              <Button size="small" kind="tertiary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
