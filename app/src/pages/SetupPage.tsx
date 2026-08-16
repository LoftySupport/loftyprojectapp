import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Counter, Heading, Tab, TabList, Text } from "@vibe/core";
import { groupByStage, usePropertyDefs, useStages } from "../data/useLookups";
import { DictionaryPage } from "./DictionaryPage";
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
        {section === "dictionary"  && <DictionaryPage />}
        {section === "wiring"      && <WiringPage />}
        {section === "automations" && <Automations />}
      </div>
    </>
  );
}

/**
 * Nothing here yet, and saying so beats an empty panel.
 *
 * Automations are already half-present in the schema — `property_defs.automation` names
 * one per field — but nothing defines or runs them. This tab exists because the grouping
 * is the point: when they land, this is where they go, rather than becoming a tenth nav
 * item.
 */
function Automations() {
  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Automations</Text>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Not built yet. A property definition can already name an automation — the field
        that fills its value in without anyone typing it — but there is nothing here to
        define or run them. When there is, it belongs on this tab.
      </Text>
    </section>
  );
}

function Properties() {
  const { propertyDefs } = usePropertyDefs();
  const { stageNames } = useStages();
  const groups = groupByStage(propertyDefs, stageNames);

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Property definitions ({propertyDefs.length})</Text>
        <Counter count={groups.length} kind="line" aria-label="stages capturing properties" />
      </div>
      <Text type="text2" color="secondary">
        Properties are <strong>rows, not columns</strong> — which is what lets a team add what
        it captures without a schema migration. Each definition says what level the property
        lives at (<strong>project or job</strong>), then which stage captures it and which team
        captures it, what shape the value takes, and whether it is required to leave that
        stage. Property and field mean the same thing here.
      </Text>

      {groups.map(g => (
        <div className="slot-stage" key={g.stage}>
          <div className="slot-stage-head">
            {g.stage} · {g.defs.length} propert{g.defs.length === 1 ? "y" : "ies"} captured here
          </div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Label</th><th>Key</th><th>Level</th><th>Team</th><th>Format</th><th>Required</th><th>Automation</th></tr>
              </thead>
              <tbody>
                {g.defs.map(d => (
                  <tr key={d.key}>
                    <td><strong>{d.label}</strong></td>
                    <td className="muted"><code>{d.key}</code></td>
                    <td>{d.scope}</td>
                    <td>{d.teamName}</td>
                    <td>{d.format}</td>
                    <td>{d.required ? "Yes" : "—"}</td>
                    <td className="muted">{d.automation ?? "—"}</td>
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
