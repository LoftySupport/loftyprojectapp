import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Heading, Tab, TabList, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Problem } from "../components/Form";
import { WORKING_STAGES, type StageName } from "../data/types";
import { PropertiesSetupPage } from "./PropertiesSetupPage";
import { ProcessesSetupPage } from "./ProcessesSetupPage";
import { ContactLookupsPage } from "./ContactLookupsPage";
import { NotificationsSetupPage } from "./NotificationsSetupPage";
import { MaintenanceSetupPage } from "./MaintenanceSetupPage";
import "../components/ui.css";

/**
 * Settings: the dials a manager turns.
 *
 * It was **Setup**, and it was everybody's. Amber, 4 September: *"Change the sidebar
 * 'Setup' to 'Settings' and grant permissions for managers and above to view this page.
 * The purpose of 'settings' is to allow managers and above update properties, processes,
 * contact settings, maintenance tabs, SLAs and automations."*
 *
 * So two things happened at once, and they are the same decision read twice:
 *
 *   1. The five tabs a manager runs the work with stayed — Properties, Processes,
 *      Contacts, Maintenance, Automations.
 *   2. The five that were never a manager's business left for **Admin**, behind the
 *      header cog: Permissions, Dictionary, Wiring, and the Bugs and Ideas queues.
 *
 * The old cut was by subject — Admin was people, Setup was configuration. This one is by
 * **who asks**. A manager adding a maintenance category and an admin renaming a column in
 * the dictionary were sharing a tab strip because both were "setup", and the strip was ten
 * tabs long for it.
 *
 * WHAT THE NAME COSTS, said out loud because the file above this one used to say the
 * opposite: the user menu's "User settings" is now the only thing keeping the two
 * "settings" apart, and it is carrying that on its own. The screen kept its `/setup`
 * path — `/settings` is the personal one, and swapping them would break every bookmark and
 * Teams link in the company to save a word in a URL nobody reads.
 *
 * The section is still in the URL, so a link to a particular tab is a link somebody can
 * send.
 */
const SECTIONS = [
  { slug: "properties",  label: "Properties" },
  { slug: "processes",   label: "Processes" },
  { slug: "contacts",    label: "Contacts" },
  { slug: "maintenance", label: "Maintenance" },
  // SLAs and the notification rules. Last because it is the one that reads the others:
  // an SLA is a number about a stage, and a rule is who hears when it is missed.
  { slug: "automations", label: "Automations" }
] as const;

/**
 * The tabs that went to Admin, and where each one is now.
 *
 * A redirect rather than a 404, because these were the URLs for weeks: /setup/dictionary
 * is in Teams messages, in the audit feed's links, and in at least one bookmark bar. A
 * manager who follows one lands on Admin's own "for admins and above" answer, which is
 * the truth and is more use than a dead tab.
 */
const MOVED_TO_ADMIN = ["permissions", "dictionary", "wiring", "bugs", "ideas"] as const;

export function SetupPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const index = SECTIONS.findIndex(s => s.slug === section);

  /**
   * Notifications was a tab of its own, and Amber, 3 Sep: "notificatiosn are already
   * under user settings so it is doubling up having it in setup". It was — from the
   * outside. Both screens are a table of notification types with switches beside them,
   * and reading them side by side does not tell you that one is your channels and the
   * other is everyone's audiences.
   *
   * So the tab is gone. What is genuinely NOT in user settings — who hears each type,
   * whether a type fires at all, and the outbox — is not deleted with it: it is an
   * automation ("overdue 5 days → the managers"), so it moved to the Automations tab
   * beside the SLAs that decide when overdue starts. This redirect keeps every link to
   * the old tab, and Updates' own links to it, landing on that.
   */
  if (section === "notifications") return <Navigate to="/setup/automations" replace />;
  if (MOVED_TO_ADMIN.includes(section as (typeof MOVED_TO_ADMIN)[number])) {
    return <Navigate to={`/admin/${section}`} replace />;
  }
  // An unknown or missing section is a redirect, not an error page: /setup on its own is
  // a reasonable thing to type, and it should land somewhere.
  if (index === -1) return <Navigate to="/setup/properties" replace />;

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Settings</Heading>
        <Text type="text2" color="secondary">
          Properties, processes, contacts, maintenance and automations — the dials the work
          runs on. Users, teams, the dictionary and the wiring are under the cog.
        </Text>
      </div>

      <TabList activeTabId={index} onTabChange={i => navigate(`/setup/${SECTIONS[i].slug}`)}>
        {SECTIONS.map(s => <Tab key={s.slug}>{s.label}</Tab>)}
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {section === "properties"  && <PropertiesSetupPage />}
        {section === "processes"   && <ProcessesSetupPage />}
        {section === "contacts"    && <ContactLookupsPage />}
        {section === "maintenance" && <MaintenanceSetupPage />}
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
 * MANAGER TO EDIT, SINCE 0096 — and it was superadmin until 4 September, on 0047's
 * reasoning that the SLA is part of what the stages ARE. Amber moved it with the screen:
 * Settings exists to let "managers and above update properties, processes, contact
 * settings, maintenance tabs, SLAs and automations". The policy moved with it, in the only
 * way that keeps the rest of 0047 true — a manager may set the two SLA columns and still
 * cannot rename, reorder or add a stage, which a trigger enforces because RLS cannot
 * express a column rule. Below manager: the numbers, or the em dash that honestly says
 * nobody has set one.
 */
function Automations() {
  const repo = useRepository();
  const { can } = usePermission();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: phases } = useQuery(r => r.listTemplatePhases(), [], [reloadKey]);
  const [saving, setSaving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const canEdit = can("manager");

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
            {canEdit ? "blank means no SLA — saving happens when you leave a field" : "read-only below manager"}
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

      {/*
        Who hears what, moved off its own tab (see the redirect above). It sits under the
        SLAs on purpose: an SLA decides when something is late, and these rules decide who
        finds out — the same sentence, read twice.
      */}
      <div style={{ marginTop: "var(--space-16)" }}>
        <div className="panel-head">
          <Text type="text2" weight="bold">Notifications</Text>
          <Text type="text3" color="secondary">who hears what — your own channels are in User settings</Text>
        </div>
        <NotificationsSetupPage />
      </div>

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
