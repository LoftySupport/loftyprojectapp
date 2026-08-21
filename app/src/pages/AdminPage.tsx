import { useState } from "react";
import { Button, Heading, Tab, TabList, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { ActivityDialog, DeactivateDialog, UserDialog } from "../components/UserDialogs";
import { Select, toOptions } from "../components/Select";
import {
  PERMISSION_LEVELS, PROFILE_STATUSES, TEAM_SEED, profileStatus, type Profile, type TeamId
} from "../data/types";
import { useStages, useTeams, useTemplatePhases } from "../data/useLookups";
import { usePlaceholderShape } from "../data/placeholderShape";
import { Token } from "../components/Token";
import "../components/ui.css";

/**
 * People: who works here, which team they are in, and what they may do.
 *
 * Properties moved to Setup. The two were one screen and are two jobs — this one is
 * about a person's access, that one is about how the app is configured, and they are
 * used by different people at different times. Dictionary and Wiring went with it, which
 * also took the nav from nine destinations to eight.
 */
export function AdminPage() {
  const [tab, setTab] = useState(0);

  return (
    <>
      <div className="page-head">
        <Heading type="h2" weight="bold">Admin</Heading>
        <Text type="text2" color="secondary">
          Who works here, which team they are in, and what they may do.
        </Text>
      </div>

      <TabList activeTabId={tab} onTabChange={setTab}>
        <Tab>Users</Tab>
        <Tab>Teams</Tab>
        <Tab>Permissions</Tab>
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {tab === 0 && <Users />}
        {tab === 1 && <Teams />}
        {tab === 2 && <Permissions />}
      </div>
    </>
  );
}

function Users() {
  // Bumped after every write so the table re-reads. useQuery takes a dependency list,
  // so a counter is the whole mechanism — no cache to invalidate because there is none.
  const [reload, setReload] = useState(0);
  const refresh = () => setReload(n => n + 1);
  const { data: profiles, loading, error } = useQuery<Profile[]>(repo => repo.listProfiles(), [], [reload]);
  const [team, setTeam] = useState<string | null>(null);
  const [permission, setPermission] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [editing, setEditing] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<Profile | null>(null);
  const [activityFor, setActivityFor] = useState<Profile | null>(null);

  const shown = profiles.filter(p =>
    (!team || p.teams.includes(team as TeamId)) &&
    (!permission || p.permission === permission) &&
    (!status || profileStatus(p) === status)
  );
  const filtered = Boolean(team || permission || status);

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">
          Users{!loading && !error ? ` (${filtered ? `${shown.length} of ${profiles.length}` : profiles.length})` : ""}
        </Text>
        <Button size="small" onClick={() => setAdding(true)}>Add user</Button>
      </div>

      <Text type="text3" color="secondary" ellipsis={false}>
        The staff list, and what decides who may use the app at all. Signing in with
        Microsoft links an account to a row here — it never creates one, so a directory
        account with no row gets a session that reads nothing.
      </Text>

      <div className="filter-row">
        <Select aria-label="Filter by team" placeholder="All teams" clearable
          options={TEAM_SEED.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
          value={team} onChange={setTeam} />
        <Select aria-label="Filter by permission" placeholder="All permissions" clearable
          options={toOptions([...PERMISSION_LEVELS])} value={permission} onChange={setPermission} />
        {/* active / pending / inactive — pending is "created, has not signed in", which
            only exists because the staff list is made ahead of people arriving. */}
        <Select aria-label="Filter by status" placeholder="All statuses" clearable
          options={toOptions([...PROFILE_STATUSES])} value={status} onChange={setStatus} />
      </div>

      {error && (
        <Text type="text2" color="secondary" ellipsis={false}>
          Could not read <code>profiles</code>: {error.message}
        </Text>
      )}

      {!error && !loading && profiles.length === 0 && (
        /* Not "no users" — forty-five are seeded. An empty read means RLS denied it,
           which after 0015 means the reader has no linked profile of their own. Saying
           "none" would blame the data for a permissions answer. */
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
              <th>Permission</th><th>Status</th><th>Last login</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8}><Text type="text3" color="secondary">Loading…</Text></td></tr>
            )}
            {!loading && filtered && shown.length === 0 && profiles.length > 0 && (
              <tr><td colSpan={8}><Text type="text3" color="secondary">No users match these filters.</Text></td></tr>
            )}
            {!loading && shown.map(p => {
              const st = profileStatus(p);
              return (
                <tr key={p.id}>
                  <td>
                    {/* The name is the way in to their history, which is the thing
                        somebody is usually after when they look a person up. */}
                    <button type="button" className="link-button" onClick={() => setActivityFor(p)}>
                      {p.fullName}
                    </button>
                  </td>
                  <td className="muted">{p.jobTitle ?? "—"}</td>
                  <td className="muted">{p.email}</td>
                  <td>{p.teams.length ? p.teams.join(", ") : "—"}</td>
                  <td>{p.permission}</td>
                  <td><span className={`status-pill is-${st}`}>{st}</span></td>
                  {/* "Never" and "not yet" are different facts: never signed in versus
                      signed in before this column existed. Only the first can happen now. */}
                  <td className="muted">
                    {p.lastLoginAt ? new Date(p.lastLoginAt).toLocaleDateString() : "Never"}
                  </td>
                  <td>
                    <span className="row-actions">
                      <Button size="xs" kind="tertiary" onClick={() => setEditing(p)}>Edit</Button>
                      <Button size="xs" kind="tertiary" onClick={() => setDeactivating(p)}>
                        {p.active ? "Deactivate" : "Restore"}
                      </Button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <UserDialog show={adding} profile={null}
        onClose={() => setAdding(false)} onSaved={refresh} />
      <UserDialog show={editing !== null} profile={editing}
        onClose={() => setEditing(null)} onSaved={refresh} />
      <DeactivateDialog show={deactivating !== null} profile={deactivating}
        onClose={() => setDeactivating(null)} onSaved={refresh} />
      <ActivityDialog show={activityFor !== null} title={activityFor?.fullName ?? ""}
        profileId={activityFor?.id} onClose={() => setActivityFor(null)} />
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
