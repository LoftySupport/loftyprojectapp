import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Heading, Tab, TabList, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Problem } from "../components/Form";
import { WORKING_STAGES, type StageName } from "../data/types";
import { DictionaryPage } from "./DictionaryPage";
import { FeedbackList } from "./FeedbackList";
import { PermissionsPage } from "./PermissionsPage";
import { PropertiesSetupPage } from "./PropertiesSetupPage";
import { ProcessesSetupPage } from "./ProcessesSetupPage";
import { ContactLookupsPage } from "./ContactLookupsPage";
import { NotificationsSetupPage } from "./NotificationsSetupPage";
import { MaintenanceSetupPage } from "./MaintenanceSetupPage";
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

/**
 * `adminOnly` NO LONGER MIRRORS A DATABASE RULE, and that is worth saying out loud
 * because it used to. Until 0060 the feedback SELECT policy admitted admin and above, so
 * a manager who typed /setup/bugs got an empty list either way and the hidden tab was
 * only tidiness. 0060 opened the tracker to everybody — the whole point of the feature is
 * that people can see the queue — so a manager reaching this URL would now see rows.
 *
 * The tabs stay admin-only anyway, as a routing choice rather than a security one: this
 * is the triage view, and the queue everybody is meant to read lives on **Updates**. If
 * that flag is ever removed, nothing leaks; a manager simply gets a second, uglier way to
 * read what /updates already shows them.
 */
const SECTIONS = [
  { slug: "properties",  label: "Properties",  adminOnly: false },
  { slug: "processes",   label: "Processes",   adminOnly: false },
  { slug: "contacts",    label: "Contacts",    adminOnly: false },
  { slug: "notifications", label: "Notifications", adminOnly: false },
  { slug: "maintenance", label: "Maintenance", adminOnly: false },
  { slug: "permissions", label: "Permissions", adminOnly: false },
  { slug: "dictionary",  label: "Dictionary",  adminOnly: false },
  { slug: "wiring",      label: "Wiring",      adminOnly: false },
  { slug: "automations", label: "Automations", adminOnly: false },
  // Last, and in this order: a bug is something to fix, an idea is something to weigh.
  { slug: "bugs",        label: "Bugs",        adminOnly: true },
  { slug: "ideas",       label: "Ideas",       adminOnly: true }
] as const;

export function SetupPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const sections = SECTIONS.filter(s => !s.adminOnly || can("admin"));
  const index = sections.findIndex(s => s.slug === section);

  // An unknown or missing section is a redirect, not an error page: /setup on its own is
  // a reasonable thing to type, and it should land somewhere. A section this person may
  // not see takes the same path — landing on Properties beats an error for a tab that,
  // to them, does not exist.
  if (index === -1) return <Navigate to="/setup/properties" replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Setup</Heading>
        <Text type="text2" color="secondary">
          Properties, processes, definitions, wiring and automations — how the app itself is configured.
        </Text>
      </div>

      <TabList activeTabId={index} onTabChange={i => navigate(`/setup/${sections[i].slug}`)}>
        {sections.map(s => <Tab key={s.slug}>{s.label}</Tab>)}
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {section === "properties"  && <PropertiesSetupPage />}
        {section === "processes"   && <ProcessesSetupPage />}
        {section === "contacts"    && <ContactLookupsPage />}
        {section === "notifications" && <NotificationsSetupPage />}
        {section === "maintenance" && <MaintenanceSetupPage />}
        {/* Moved off Admin. Admin is about people; a permission model is configuration,
            which is what this screen is for. */}
        {section === "permissions" && <PermissionsPage />}
        {section === "dictionary"  && <DictionaryPage />}
        {section === "wiring"      && <WiringPage />}
        {section === "automations" && <Automations />}
        {section === "bugs"        && <FeedbackList kind="bug" />}
        {section === "ideas"       && <FeedbackList kind="idea" />}
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
