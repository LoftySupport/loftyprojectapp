import { useState } from "react";
import { Counter, Heading, Tab, TabList, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { groupByStage, usePropertyDefs, useStages, useTeams, useTemplatePhases } from "../data/useLookups";
import { usePlaceholderShape } from "../data/placeholderShape";
import { Token } from "../components/Token";
import "../components/ui.css";

/**
 * Users, teams, properties and permissions.
 *
 * The Properties tab is the one that matters for the build: it is where a field is
 * defined, and every slot everywhere else in the app comes from a row here. Properties
 * are rows, not columns — which is what lets a team add what it captures without a
 * schema migration, and why nothing in this app has a fixed number of field slots.
 */
export function AdminPage() {
  const [tab, setTab] = useState(0);

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Admin</Heading>
        <Text type="text2" color="secondary">
          Users, teams, properties and permissions.
        </Text>
      </div>

      <TabList activeTabId={tab} onTabChange={setTab}>
        <Tab>Users</Tab>
        <Tab>Teams</Tab>
        <Tab>Properties</Tab>
        <Tab>Permissions</Tab>
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {tab === 0 && <Users />}
        {tab === 1 && <Teams />}
        {tab === 2 && <Properties />}
        {tab === 3 && <Permissions />}
      </div>
    </>
  );
}

function Users() {
  const { data: profiles, loading, error } = useQuery(repo => repo.listProfiles(), []);

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">
          Users{!loading && !error ? ` (${profiles.length})` : ""}
        </Text>
        <Text type="text3" color="secondary" ellipsis={false}>
          The staff list, and the thing that decides who may use the app at all. Signing
          in with Microsoft links an account to a row here — it never creates one, so a
          directory account with no row gets a session that reads nothing.
        </Text>
      </div>

      {error && (
        <Text type="text2" color="secondary" ellipsis={false}>
          Could not read <code>profiles</code>: {error.message}
        </Text>
      )}

      {!error && !loading && profiles.length === 0 && (
        /* Not "no users" — 45 are seeded. An empty read means the RLS policy denied it,
           which after 0015 means the reader has no linked profile of their own. Saying
           "none" here would blame the data for a permissions answer. */
        <Text type="text2" color="secondary" ellipsis={false}>
          No profiles are readable with your current session. Every read is gated on
          having an active linked profile — if you are signed in and seeing this, your
          Microsoft account has not been linked to a row yet.
        </Text>
      )}

      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th><th>Job title</th><th>Email</th><th>Teams</th>
              <th>Permission</th><th>Signed in</th><th>Active</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7}><Text type="text3" color="secondary">Loading…</Text></td></tr>
            )}
            {!loading && profiles.map(p => (
              <tr key={p.id}>
                <td>{p.fullName}</td>
                <td>{p.jobTitle ?? <Token>profiles.job_title</Token>}</td>
                <td>{p.email}</td>
                {/* Many-to-many — one person, one row per team, primary first. */}
                <td>{p.teams.length ? p.teams.join(", ") : "—"}</td>
                <td>{p.permission}</td>
                {/* Whether they have ever signed in, which is what auth_user_id means.
                    Useful precisely because the staff list is created ahead of arrival. */}
                <td>{p.authUserId ? "Yes" : "Not yet"}</td>
                <td>{p.active ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Teams() {
  const { teamNames } = useTeams();
  const { stageNames } = useStages();
  const { teamsByStage } = useTemplatePhases();
  const { jobs } = usePlaceholderShape();

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Teams ({teamNames.length})</Text>
        <Text type="text3" color="secondary">
          Each team owns one or more phases. That mapping drives “one job, one team at a
          time” and the handover between phases.
        </Text>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr><th>Team</th><th>Phases owned</th><th className="num">Jobs held</th><th>Members</th></tr>
          </thead>
          <tbody>
            {teamNames.map(t => {
              const owned = stageNames.filter(s => (teamsByStage[s] ?? []).includes(t));
              const held = jobs.filter(j => j.team === t).length;
              return (
                <tr key={t}>
                  <td><strong>{t}</strong></td>
                  <td className="muted">{owned.join(", ") || "—"}</td>
                  <td className="num">{held}</td>
                  <td><Token>profiles.full_name</Token></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

/** The `permission_level` enum, in ladder order. Read left to right: each rung has
 *  everything the one before it has. Maps onto Microsoft Teams permission levels when
 *  that sync lands. */
const PERMISSIONS = ["viewer", "user", "manager", "admin", "superadmin"];
const OBJECTS = ["Project", "Job", "Checklist", "Comment", "Report"];

function Permissions() {
  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Permission grants</Text>
        <Text type="text3" color="secondary">
          A ladder, not a set — each rung has everything to its left. Read down a column
          to see one permission level’s version of the app.
        </Text>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Object</th>
              {PERMISSIONS.map(r => <th key={r}>{r}</th>)}
            </tr>
          </thead>
          <tbody>
            {OBJECTS.map(o => (
              <tr key={o}>
                <td><strong>{o}</strong></td>
                {PERMISSIONS.map(r => (
                  <td key={r}><Token>permission_grants.action</Token></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
