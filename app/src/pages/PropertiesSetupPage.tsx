import { useEffect, useMemo, useState } from "react";
import { Button, Checkbox, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useProcessProperties, useProcesses, usePropertyDefs, usePropertyOptions, useStages, useTeams } from "../data/useLookups";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
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
 * Each row edits on blur or change and the database answers — a manager retitles and
 * retypes, an admin sets the four rungs and the grants, a superadmin alone restricts.
 * The controls below manager's rung are read-only; the ones above it are hidden below
 * the rung that may use them, because a control the database will refuse is a lie.
 *
 * THE 87 WITH NO FORMAT
 *
 *   The workbook said "unknown (no data)" and the seed kept the word. Those rows are the
 *   first thing this page wants sorted, so they filter to the top with one tick, and the
 *   format picker is the only control on them that is not greyed out. A slot with no
 *   format cannot be recorded against — the CHECK says so — which is the honest state
 *   until somebody who knows says "date".
 */

const slugify = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]/, "n$&");

const EMPTY_DEF: NewPropertyDef = {
  key: "", label: "", scope: "job", stageName: "", teamId: null, format: "text"
};

const LEVEL_OPTIONS = PERMISSION_LEVELS.map(l => ({ value: l, label: l }));

export function PropertiesSetupPage() {
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

  const [draft, setDraft] = useState<NewPropertyDef | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Filters: which stage, only-unknown, only-restricted, retired shown, and a search.
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [showRetired, setShowRetired] = useState(false);
  const [search, setSearch] = useState("");

  const teamOptions = teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }));
  const grantsByKey = useMemo(() => {
    const m = new Map<string, PropertyAccess[]>();
    grants.forEach(g => { (m.get(g.propertyKey) ?? m.set(g.propertyKey, []).get(g.propertyKey)!).push(g); });
    return m;
  }, [grants]);

  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = propertyDefs.filter(d =>
    (showRetired || d.isActive)
    && (!stageFilter || d.stageName === stageFilter)
    && (!onlyUnknown || d.format === "unknown")
    && terms.every(t => `${d.label} ${d.key} ${d.teamName ?? ""} ${d.format} ${d.scope}`.toLowerCase().includes(t))
  );
  const groups = (stageNames.length ? stageNames : [...new Set(shown.map(d => d.stageName))])
    .map(stage => ({ stage, defs: shown.filter(d => d.stageName === stage) }))
    .filter(g => g.defs.length > 0);

  const unknownCount = propertyDefs.filter(d => d.isActive && d.format === "unknown").length;
  const restrictedCount = propertyDefs.filter(d => d.restricted).length;

  async function patch(key: string, change: PropertyDefPatch) {
    setError(null);
    try { await repo.updatePropertyDef(key, change); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true); setError(null);
    try { await repo.createPropertyDef(draft); setDraft(null); setKeyTouched(false); bump(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  }

  const draftValid = draft !== null && /^[a-z][a-z0-9_]*$/.test(draft.key) && draft.label.trim() !== "" && draft.stageName !== "";

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Property definitions ({propertyDefs.filter(d => d.isActive).length})</Text>
        <div className="panel-actions">
          {unknownCount > 0 && (
            <Text type="text3" color="secondary">{unknownCount} without a format</Text>
          )}
          {restrictedCount > 0 && <span className="lock-badge">{restrictedCount} restricted</span>}
          {canEdit && draft === null && (
            <Button size="small" onClick={() => { setDraft(EMPTY_DEF); setKeyTouched(false); }}>+ Add property</Button>
          )}
        </div>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Properties are <strong>rows, not columns</strong>. Each says where it lives (<strong>project</strong> — one
        answer for the site, pushable to the jobs — or <strong>job</strong>), which stage and process collect it,
        what shape the value takes, and who may see and change it: four permission rungs, the teams and people
        named below them, and <strong>restricted</strong> — opt-in, nobody but a superadmin until a team or person
        is granted. {canEdit ? "Managers edit wording, format and team; admins set the rungs and grants; superadmins restrict." : "Managers and above edit."}
      </Text>

      {error && <Problem>{error}</Problem>}

      <div className="toolbar" style={{ marginTop: "var(--space-12)" }}>
        <Select aria-label="Filter by stage" clearable placeholder="All stages" options={stageNames.map(s => ({ value: s, label: s }))}
          value={stageFilter} onChange={setStageFilter} />
        <TextField size="small" id="props-search" inputAriaLabel="Search properties" placeholder="Search…" value={search} onChange={setSearch} />
        <Checkbox label="Only without a format" checked={onlyUnknown} onChange={() => setOnlyUnknown(v => !v)} />
        <Checkbox label="Show retired" checked={showRetired} onChange={() => setShowRetired(v => !v)} />
      </div>

      {draft !== null && (
        <div className="new-address-block">
          <div className="panel-head"><Text type="text2" weight="bold">New property</Text></div>
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
            <Button size="small" onClick={saveDraft} disabled={saving || !draftValid}>{saving ? "Saving…" : "Add property"}</Button>
            <Button size="small" kind="tertiary" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {propertyDefs.length === 0 && draft === null && (
        <div className="search-note">
          <Text type="text3" ellipsis={false}>
            <strong>Nothing defined yet.</strong> The table starts empty on purpose — a guess on this screen
            gets quoted back as though it were agreed.
          </Text>
        </div>
      )}

      {groups.map(g => (
        <div className="slot-stage" key={g.stage}>
          <div className="slot-stage-head">{g.stage} · {g.defs.length} propert{g.defs.length === 1 ? "y" : "ies"}</div>
          <div className="data-table-wrap">
            <table className="data-table props-table">
              <thead>
                <tr>
                  <th>Label</th><th>Process</th><th>Level</th><th>Team</th><th>Format</th><th>SLA</th><th>Access</th><th aria-label="More"></th>
                </tr>
              </thead>
              <tbody>
                {g.defs.map(d => {
                  const procs = (processesByProperty.get(d.key) ?? []).map(pp => processById.get(pp.processId)?.name).filter(Boolean);
                  const isOpen = open === d.key;
                  const rowGrants = grantsByKey.get(d.key) ?? [];
                  return (
                    <RowWithDetail key={d.key} open={isOpen} colSpan={8} detail={
                      <PropertyDetail def={d} grants={rowGrants} options={optionsByProperty.get(d.key) ?? []}
                        teams={teams} profiles={profiles.filter(p => p.active).map(p => ({ id: p.id, name: p.fullName }))}
                        onPatch={change => patch(d.key, change)} onChanged={bump} onError={setError} />
                    }>
                      <td>
                        {canEdit ? (
                          <BlurText value={d.label} label={`Label of ${d.label}`} onCommit={v => v.trim() && patch(d.key, { label: v.trim() })} />
                        ) : <strong>{d.label}</strong>}
                        <div className="slot-sub is-key"><code>{d.key}</code>{!d.isActive && <span className="slot-chip">retired</span>}{d.restricted && <span className="slot-chip is-differs">restricted</span>}</div>
                      </td>
                      <td className="muted">{procs.length ? procs.join(", ") : "—"}</td>
                      <td>
                        {canEdit ? (
                          <Select aria-label={`Level of ${d.label}`} options={PROPERTY_SCOPES.map(v => ({ value: v, label: v }))} value={d.scope} onChange={v => patch(d.key, { scope: v as PropertyScope })} />
                        ) : d.scope}
                      </td>
                      <td>
                        {canEdit ? (
                          <Select aria-label={`Team for ${d.label}`} clearable placeholder="No team" options={teamOptions} value={d.teamId} onChange={v => patch(d.key, { teamId: v as TeamId | null })} />
                        ) : (d.teamName ?? "—")}
                      </td>
                      <td>
                        {canEdit ? (
                          <Select aria-label={`Format of ${d.label}`} placeholder="Set a format"
                            options={PROPERTY_FORMATS.filter(f => f !== "unknown" || d.format === "unknown").map(f => ({ value: f, label: f === "unknown" ? "— not set —" : f }))}
                            value={d.format} onChange={v => patch(d.key, { format: v as PropertyFormat })} />
                        ) : d.format === "unknown" ? <span className="pf-unset">not set</span> : d.format}
                      </td>
                      <td>
                        {canEdit ? (
                          <NumberCell value={d.slaDays} label={`SLA days for ${d.label}`} onCommit={v => patch(d.key, { slaDays: v })} />
                        ) : (d.slaDays ?? "—")}
                      </td>
                      <td className="muted">
                        {describeAccess(d, rowGrants, teams)}
                      </td>
                      <td>
                        <Button kind="tertiary" size="small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : d.key)}>
                          {isOpen ? "Less" : "More"}
                        </Button>
                      </td>
                    </RowWithDetail>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}

function describeAccess(d: PropertyDef, grants: PropertyAccess[], teams: readonly Team[]): string {
  const named = grants.map(g => g.teamId ? teamName(g.teamId, teams) : "a person");
  if (d.restricted) return named.length ? `restricted · ${named.join(", ")}` : "restricted · superadmin only";
  if (named.length) return `${named.join(", ")} · managers`;
  return `everyone at ${d.readLevel}+`;
}

/** A table row that can open a full-width detail row beneath it. */
function RowWithDetail({ open, colSpan, detail, children }: { open: boolean; colSpan: number; detail: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <tr>{children}</tr>
      {open && <tr><td colSpan={colSpan}>{detail}</td></tr>}
    </>
  );
}

function PropertyDetail({ def: d, grants, options, teams, profiles, onPatch, onChanged, onError }: {
  def: PropertyDef; grants: PropertyAccess[]; options: PropertyOption[];
  teams: readonly Team[]; profiles: { id: string; name: string }[];
  onPatch: (change: PropertyDefPatch) => Promise<void>; onChanged: () => void; onError: (e: string | null) => void;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("manager");
  const canLevels = can("admin");
  const canGrant = d.restricted ? can("superadmin") : can("admin");
  const [grantee, setGrantee] = useState<string | null>(null);
  const [newOption, setNewOption] = useState("");

  async function run(fn: () => Promise<unknown>) {
    onError(null);
    try { await fn(); onChanged(); }
    catch (e) { onError(e instanceof Error ? e.message : String(e)); }
  }

  const levelSelect = (label: string, value: PermissionLevel, key: keyof PropertyDefPatch) => (
    <div>
      <Text type="text3" color="secondary">{label}</Text>
      {canLevels ? (
        <Select aria-label={`${label} level for ${d.label}`} options={LEVEL_OPTIONS} value={value} onChange={v => onPatch({ [key]: v as PermissionLevel })} />
      ) : <Text type="text2">{value}</Text>}
    </div>
  );

  return (
    <div className="stack-tight">
      <div className="create-form">
        <Field label="Description" hint="what the field means, for whoever fills it in">
          {canEdit ? (
            <BlurText value={d.description ?? ""} label={`Description of ${d.label}`} onCommit={v => onPatch({ description: v.trim() || null })} wide />
          ) : <Text type="text2" ellipsis={false}>{d.description ?? "—"}</Text>}
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

      <div>
        <Text type="text3" weight="bold">Security levels</Text>
        <Text type="text3" color="secondary" ellipsis={false} element="p">
          The lowest rung that may do each thing. Then, below manager, the teams and people named
          decide — no one named means open at the rung. {canLevels ? "" : "Admins set these."}
        </Text>
        <div className="levels-grid">
          {levelSelect("Record", d.createLevel, "createLevel")}
          {levelSelect("Read", d.readLevel, "readLevel")}
          {levelSelect("Change", d.updateLevel, "updateLevel")}
          {levelSelect("Clear", d.deleteLevel, "deleteLevel")}
        </div>
      </div>

      <div>
        <Text type="text3" weight="bold">Teams and people with access</Text>
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
          <div className="field-inline" style={{ marginTop: "var(--space-4)" }}>
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
      </div>

      {(d.format === "single select" || d.format === "multi select") && (
        <div>
          <Text type="text3" weight="bold">Choices ({options.length})</Text>
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
            <div className="field-inline" style={{ marginTop: "var(--space-4)" }}>
              <input className="pf-input" aria-label={`New choice for ${d.label}`} placeholder="Add a choice…" value={newOption} onChange={e => setNewOption(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newOption.trim()) { run(() => repo.savePropertyOption({ propertyKey: d.key, key: slugify(newOption), label: newOption.trim(), position: options.length + 1, isActive: true })); setNewOption(""); } }} />
              <Button size="small" disabled={!newOption.trim()} onClick={() => { run(() => repo.savePropertyOption({ propertyKey: d.key, key: slugify(newOption), label: newOption.trim(), position: options.length + 1, isActive: true })); setNewOption(""); }}>Add</Button>
            </div>
          )}
        </div>
      )}

      {canEdit && (
        <div className="field-inline">
          <Button size="small" kind="tertiary" onClick={() => run(() => repo.deletePropertyDef(d.key))}>
            Delete definition
          </Button>
          <Text type="text3" color="secondary" element="span">Deletes its values too. Prefer retiring.</Text>
        </div>
      )}
    </div>
  );
}

function BlurText({ value, label, onCommit, wide }: { value: string; label: string; onCommit: (v: string) => void; wide?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input className="pf-input" style={wide ? { width: "100%" } : { width: "min(240px, 100%)" }} aria-label={label} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}

function NumberCell({ value, label, onCommit }: { value: number | null; label: string; onCommit: (v: number | null) => void }) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => { setDraft(value == null ? "" : String(value)); }, [value]);
  return (
    <input type="number" min={0} inputMode="numeric" className="pf-input dep-lag" aria-label={label} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { const v = draft.trim() === "" ? null : Number(draft); if (v !== value) onCommit(v); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
  );
}
