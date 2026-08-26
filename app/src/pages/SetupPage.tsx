import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Button, Checkbox, Counter, Heading, Tab, TabList, Text, TextField } from "@vibe/core";
import { groupByStage, usePropertyDefs, useStages, useTeams } from "../data/useLookups";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Field, Problem } from "../components/Form";
import { Select } from "../components/Select";
import {
  PROPERTY_FORMATS, PROPERTY_SCOPES, WORKING_STAGES,
  type NewPropertyDef, type PropertyDef, type PropertyFormat, type PropertyScope,
  type StageName, type TeamId
} from "../data/types";
import { DictionaryPage } from "./DictionaryPage";
import { PermissionsPage } from "./PermissionsPage";
import { WiringPage } from "./WiringPage";
import "../components/ui.css";

/**
 * How the app is configured, as opposed to who may use it.
 *
 * Admin answers "who works here and what may they do". This answers "how is this thing
 * set up" — the fields that exist, what every property means, what is wired to Supabase,
 * and the automations that fill values in. Different questions, asked by different people
 * at different times, so they are no longer four tabs on one screen.
 *
 * Dictionary and Wiring were top-level nav items sitting beside Projects and Jobs, which
 * put configuration in the same rank as the work. Folding them in here took the nav from
 * nine destinations to eight — worth having when nine already wrapped to two rows on a
 * phone.
 *
 * The section is in the URL rather than in component state, so a link to a particular tab
 * is a link somebody can send.
 */

const SECTIONS = [
  { slug: "properties",  label: "Properties" },
  { slug: "permissions", label: "Permissions" },
  { slug: "dictionary",  label: "Dictionary" },
  { slug: "wiring",      label: "Wiring" },
  { slug: "automations", label: "Automations" }
] as const;

export function SetupPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const index = SECTIONS.findIndex(s => s.slug === section);

  // An unknown or missing section is a redirect, not an error page: /setup on its own is
  // a reasonable thing to type, and it should land somewhere.
  if (index === -1) return <Navigate to="/setup/properties" replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Setup</Heading>
        <Text type="text2" color="secondary">
          Fields, definitions, wiring and automations — how the app itself is configured.
        </Text>
      </div>

      <TabList activeTabId={index} onTabChange={i => navigate(`/setup/${SECTIONS[i].slug}`)}>
        {SECTIONS.map(s => <Tab key={s.slug}>{s.label}</Tab>)}
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {section === "properties"  && <Properties />}
        {/* Moved off Admin. Admin is about people; a permission model is configuration,
            which is what this screen is for. */}
        {section === "permissions" && <PermissionsPage />}
        {section === "dictionary"  && <DictionaryPage />}
        {section === "wiring"      && <WiringPage />}
        {section === "automations" && <Automations />}
      </div>
    </>
  );
}

/**
 * The SLA editor (Amber's Q1), then the honest note about everything else.
 *
 * Per stage: the expected days in stage, and the at-risk lead — how many days before
 * that deadline the record starts flagging at risk. Overdue needs no third number; it
 * is simply past the expected days. Only the four working phases take an SLA: a
 * Completed job is not late, the archive runs on a fixed clock, and a Cancelled job
 * fires no alerts by rule.
 *
 * Superadmin to edit — the 0029 policy on pipeline_stages, because the SLA is part of
 * what the stages ARE. Everyone else reads the numbers, or the em dash that honestly
 * says nobody has set one.
 */
function Automations() {
  const repo = useRepository();
  const { can } = usePermission();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: phases } = useQuery(r => r.listTemplatePhases(), [], [reloadKey]);
  const [saving, setSaving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canEdit = can("superadmin");

  const byName = new Map(phases.map(p => [p.stageName, p]));

  const save = async (stage: StageName, patch: { expectedDays?: number | null; atRiskLeadDays?: number | null }) => {
    setSaving(stage);
    setProblem(null);
    try {
      await repo.updateStageSla(stage, patch);
      setReloadKey(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  // Committed on blur, not per keystroke — one write per edit, like the date fields.
  // Blank clears: an unset SLA is a real state, and it is not zero.
  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Stage SLAs</Text>
          <Text type="text3" color="secondary">
            {canEdit ? "blank means no SLA — saving happens when you leave a field" : "read-only below superadmin"}
          </Text>
        </div>
        <Text type="text2" color="secondary" ellipsis={false}>
          How long a record should sit in each working phase, and how many days before
          that deadline it starts flagging at risk. Past the expected days is overdue —
          there is no third number. Completed, Closed and Cancelled take no SLA: done is
          not late, the archive runs on its own clock, and cancelled records fire no
          alerts by rule.
        </Text>
        <div className="data-table-wrap" style={{ marginTop: "var(--space-12)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Expected days in stage</th>
                <th>At risk (days before due)</th>
              </tr>
            </thead>
            <tbody>
              {WORKING_STAGES.map(stage => {
                const phase = byName.get(stage);
                const expected = phase?.expectedDays ?? null;
                const lead = phase?.atRiskLeadDays ?? null;
                return (
                  // Keyed on the values too, so a save's read-back resets the inputs'
                  // defaultValue to what the database actually accepted.
                  <tr key={`${stage}:${expected ?? ""}:${lead ?? ""}`}>
                    <td><Text type="text2" weight="medium">{stage}</Text></td>
                    <td>
                      {canEdit ? (
                        <input
                          type="number"
                          min={1}
                          className="date-input"
                          aria-label={`Expected days in ${stage}`}
                          defaultValue={expected ?? ""}
                          disabled={saving === stage}
                          onBlur={e => {
                            const next = parse(e.target.value);
                            if (next !== expected) save(stage, { expectedDays: next });
                          }}
                        />
                      ) : (
                        <Text type="text2">{expected ?? "—"}</Text>
                      )}
                    </td>
                    <td>
                      {canEdit ? (
                        <input
                          type="number"
                          min={1}
                          className="date-input"
                          aria-label={`At-risk lead for ${stage}`}
                          defaultValue={lead ?? ""}
                          disabled={saving === stage}
                          onBlur={e => {
                            const next = parse(e.target.value);
                            if (next !== lead) save(stage, { atRiskLeadDays: next });
                          }}
                        />
                      ) : (
                        <Text type="text2">{lead ?? "—"}</Text>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {saving && <Text type="text3" color="secondary">Saving…</Text>}
        {problem && <Problem>{problem}</Problem>}
      </section>

      {/* Automations proper are still half-present in the schema — `property_defs.automation`
          names one per field — but nothing defines or runs them. The tab keeps saying so
          rather than showing an empty list. */}
      <section className="panel" style={{ marginTop: "var(--space-16)" }}>
        <div className="panel-head">
          <Text type="text2" weight="bold">Automations</Text>
        </div>
        <Text type="text2" color="secondary" ellipsis={false}>
          Not built yet. A property definition can already name an automation — the field
          that fills its value in without anyone typing it — but there is nothing here to
          define or run them. When there is, it belongs on this tab.
        </Text>
      </section>
    </>
  );
}

/** label → key: "Fencing type" → fencing_type. Offered, editable, checked by the CHECK. */
const slugify = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[0-9]/, "n$&");

const EMPTY_DEF: NewPropertyDef = {
  key: "", label: "", scope: "job", stageName: "", teamId: "" as TeamId, format: "text"
};

function Properties() {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const { propertyDefs } = usePropertyDefs(reload);
  const { stageNames } = useStages();
  const { teams } = useTeams();
  const groups = groupByStage(propertyDefs, stageNames);

  // The add form. Null while closed. The key follows the label until somebody edits it
  // by hand — then it is theirs, because a key that keeps snapping back is unusable.
  const [draft, setDraft] = useState<NewPropertyDef | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const teamOptions = teams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }));
  const draftValid = draft !== null
    && /^[a-z][a-z0-9_]*$/.test(draft.key)
    && draft.label.trim() !== ""
    && draft.stageName !== ""
    && (draft.teamId as string) !== "";

  async function saveDraft() {
    if (!draft || !draftValid) return;
    setSaving(true);
    setError(null);
    try {
      await repo.createPropertyDef(draft);
      setDraft(null);
      setKeyTouched(false);
      setReload(k => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleRequired(d: PropertyDef) {
    setError(null);
    try {
      await repo.updatePropertyDef(d.key, { required: !d.required });
      setReload(k => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove(key: string) {
    setRemoving(key);
    setError(null);
    try {
      await repo.deletePropertyDef(key);
      setReload(k => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Property definitions ({propertyDefs.length})</Text>
        <div className="panel-actions">
          <Counter count={groups.length} kind="line" aria-label="stages capturing properties" />
          {/* Superadmin, same bar as pipelines: deciding what the company captures is
              process design. The policy is what enforces it; this only hides the door. */}
          {can("superadmin") && draft === null && (
            <Button size="small" onClick={() => { setDraft(EMPTY_DEF); setKeyTouched(false); }}>
              + Add property
            </Button>
          )}
        </div>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Properties are <strong>rows, not columns</strong> — which is what lets a team add what
        it captures without a schema migration. Each definition says what level the property
        lives at (<strong>project or job</strong>), then which stage captures it and which team
        captures it, what shape the value takes, and whether it is required to leave that
        stage. Property and field mean the same thing here.
      </Text>

      {error && <Problem>{error}</Problem>}

      {draft !== null && (
        <div className="new-address-block">
          <div className="panel-head">
            <Text type="text2" weight="bold">New property</Text>
          </div>
          <div className="create-form">
            <Field label="Label" required hint="what the field is called on screen">
              <TextField
                value={draft.label}
                onChange={v => setDraft({
                  ...draft,
                  label: v,
                  key: keyTouched ? draft.key : slugify(v)
                })}
                id="prop-label" inputAriaLabel="Property label"
              />
            </Field>
            <Field label="Key" required
              hint="the identity — lowercase letters, digits and underscores. The import addresses fields by this.">
              <TextField
                value={draft.key}
                onChange={v => { setKeyTouched(true); setDraft({ ...draft, key: v }); }}
                id="prop-key" inputAriaLabel="Property key"
                validation={
                  draft.key === "" || /^[a-z][a-z0-9_]*$/.test(draft.key)
                    ? undefined
                    : { status: "error", text: "lowercase letters, digits and underscores, starting with a letter" }
                }
              />
            </Field>
            <Field label="Level" required hint="a project property is one answer for the whole site — jobs cannot override it">
              <Select
                aria-label="Property level"
                options={PROPERTY_SCOPES.map(v => ({ value: v, label: v }))}
                value={draft.scope}
                onChange={v => setDraft({ ...draft, scope: v as PropertyScope })}
              />
            </Field>
            <Field label="Captured at" required hint="which lifecycle stage fills it in">
              <Select
                aria-label="Captured at stage"
                options={stageNames.map(n => ({ value: n, label: n }))}
                value={draft.stageName}
                onChange={v => setDraft({ ...draft, stageName: v })}
                placeholder="Select a stage"
              />
            </Field>
            <Field label="Captured by" required hint="which team is answerable for it">
              <Select
                aria-label="Captured by team"
                options={teamOptions}
                value={draft.teamId as string}
                onChange={v => setDraft({ ...draft, teamId: v as TeamId })}
                placeholder="Select a team"
              />
            </Field>
            <Field label="Format" required>
              <Select
                aria-label="Property format"
                options={PROPERTY_FORMATS.map(f => ({ value: f, label: f }))}
                value={draft.format}
                onChange={v => setDraft({ ...draft, format: v as PropertyFormat })}
              />
            </Field>
            <Field label="Required" hint="required to leave its stage — not required to create the record">
              <Checkbox
                label="Required to exit the stage"
                checked={draft.required ?? false}
                onChange={() => setDraft({ ...draft, required: !(draft.required ?? false) })}
              />
            </Field>
            <Field label="Automation" hint="optional — how the value arrives on its own, if it does">
              <TextField
                value={draft.automation ?? ""}
                onChange={v => setDraft({ ...draft, automation: v || null })}
                id="prop-automation" inputAriaLabel="Automation note"
              />
            </Field>
          </div>
          <div className="field-inline" style={{ marginTop: "var(--space-8)" }}>
            <Button size="small" onClick={saveDraft} disabled={saving || !draftValid}>
              {saving ? "Saving…" : "Add property"}
            </Button>
            <Button size="small" kind="tertiary" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {propertyDefs.length === 0 && draft === null && (
        <div className="search-note">
          <Text type="text3" ellipsis={false}>
            <strong>Nothing defined yet.</strong> The table exists and starts empty on
            purpose — eleven invented definitions used to appear here, five naming a stage
            that does not exist, and a guess on this screen gets quoted back as though it
            were agreed. {can("superadmin")
              ? "Add the fields Lofty actually captures."
              : "A superadmin defines the fields Lofty actually captures."}
          </Text>
        </div>
      )}

      {groups.map(g => (
        <div className="slot-stage" key={g.stage}>
          <div className="slot-stage-head">
            {g.stage} · {g.defs.length} propert{g.defs.length === 1 ? "y" : "ies"} captured here
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Label</th><th>Key</th><th>Level</th><th>Team</th><th>Format</th>
                  <th>Required</th><th>Automation</th>
                  {can("superadmin") && <th aria-label="Remove"></th>}
                </tr>
              </thead>
              <tbody>
                {g.defs.map(d => (
                  <tr key={d.key}>
                    <td><strong>{d.label}</strong></td>
                    <td className="muted"><code>{d.key}</code></td>
                    <td>{d.scope}</td>
                    <td>{d.teamName}</td>
                    <td>{d.format}</td>
                    <td>
                      {can("superadmin") ? (
                        <Checkbox
                          aria-label={`${d.label} required to exit its stage`}
                          checked={d.required}
                          onChange={() => toggleRequired(d)}
                        />
                      ) : d.required ? "Yes" : "—"}
                    </td>
                    <td className="muted">{d.automation ?? "—"}</td>
                    {can("superadmin") && (
                      <td>
                        <Button
                          kind="tertiary" size="small"
                          disabled={removing === d.key}
                          onClick={() => remove(d.key)}
                        >
                          {removing === d.key ? "Removing…" : "Remove"}
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
