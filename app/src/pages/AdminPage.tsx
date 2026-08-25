import { useMemo, useState } from "react";
import { Button, Heading, Search, Tab, TabList, Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { ActivityDialog, DeactivateDialog, UserDialog } from "../components/UserDialogs";
import { Select, toOptions } from "../components/Select";
import { SortHeader, useTableSort } from "../components/SortableTable";
import { UserRow } from "../components/UserRow";
import {
  PERMISSION_LEVELS, PROFILE_STATUSES, profileStatus, type Profile, type TeamId
} from "../data/types";
import { useStages, useTeamLabels, useTeams, useTemplatePhases } from "../data/useLookups";
import { useBoardRecords } from "../data/boardModel";
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

/**
 * The columns the Users table sorts on.
 *
 * Named rather than positional, so reordering the table cannot silently repoint a sort
 * at a different column. Status and teams are included on purpose: "who has not signed
 * in yet" and "who is in Estimating" are both questions people ask of this list, and
 * sorting is the cheapest way to ask them of forty-seven rows.
 */
type UserColumn = "name" | "jobTitle" | "email" | "teams" | "permission" | "status" | "lastLogin";

function Users() {
  // Bumped after every write so the table re-reads. useQuery takes a dependency list,
  // so a counter is the whole mechanism — no cache to invalidate because there is none.
  const [reload, setReload] = useState(0);
  const refresh = () => setReload(n => n + 1);
  const { data: profiles, loading, error } = useQuery<Profile[]>(repo => repo.listProfiles(), [], [reload]);
  const { can } = usePermission();
  const { teams: allTeams, labels } = useTeamLabels();

  const [query, setQuery] = useState("");
  const [team, setTeam] = useState<string | null>(null);
  const [permission, setPermission] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [editing, setEditing] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<Profile | null>(null);
  const [activityFor, setActivityFor] = useState<Profile | null>(null);

  // Only managers and above may write. This hides the controls; the RLS policy on
  // `profiles` is what actually refuses, and one without the other is decoration.
  const canEdit = can("manager");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return profiles.filter(p =>
      // Name, job title and both addresses, because all four are things somebody types
      // when they are looking for a person and only one of them is their name.
      (!q ||
        p.fullName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.loginEmail ?? "").toLowerCase().includes(q) ||
        (p.jobTitle ?? "").toLowerCase().includes(q)) &&
      (!team || p.teams.includes(team as TeamId)) &&
      (!permission || p.permission === permission) &&
      (!status || profileStatus(p) === status)
    );
  }, [profiles, query, team, permission, status]);

  const filtered = Boolean(query.trim() || team || permission || status);

  // Sorted on what is *displayed*, not on what is stored: the Teams column reads as
  // "Estimating, Finance" and sorting it by `estimating,finance` would put teams in an
  // order the screen does not show. Same for the name — `fullName`, not `lastName`.
  const columns = useMemo(
    () => ({
      name: (p: Profile) => p.fullName,
      jobTitle: (p: Profile) => p.jobTitle,
      email: (p: Profile) => p.email,
      // Null while the lookup is in flight, which sorts as a blank — right, because the
      // column is blank too. Sorting slugs would order by a string nobody can see.
      teams: (p: Profile) => labels(p.teams)?.join(", ") ?? null,
      // The ladder's own order, not alphabetical: viewer to superadmin is a sequence,
      // and sorting it a-z would interleave the rungs.
      permission: (p: Profile) => PERMISSION_LEVELS.indexOf(p.permission),
      status: (p: Profile) => profileStatus(p),
      lastLogin: (p: Profile) => p.lastLoginAt
    }),
    [labels]
  );

  const { sorted, sort, toggle } = useTableSort<Profile, UserColumn>(shown, columns, {
    key: "name",
    direction: "asc"
  });

  const th = (column: UserColumn, label: string) => (
    <SortHeader column={column} label={label} sort={sort} onSort={toggle} />
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">
          Users{!loading && !error ? ` (${filtered ? `${shown.length} of ${profiles.length}` : profiles.length})` : ""}
        </Text>
        <Button size="small" onClick={() => setAdding(true)} disabled={!canEdit}>Add user</Button>
      </div>

      <Text type="text3" color="secondary" ellipsis={false}>
        The staff list, and what decides who may use the app at all. Signing in with
        Microsoft links an account to a row here — it never creates one, so a directory
        account with no row gets a session that reads nothing.
      </Text>

      <div className="filter-row">
        {/* `inputAriaLabel`, not `aria-label` — Search puts the latter on its wrapper,
            which leaves the input itself unnamed for anyone driving by screen reader. */}
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search name, email or job title"
          inputAriaLabel="Search users"
          id="user-search"
          size="small"
        />
        {/* From the lookup, not from TEAM_SEED. Retired teams are not offerable, but a
            person recorded in one still renders under its name — see useTeamLabels. */}
        <Select aria-label="Filter by team" placeholder="All teams" clearable
          options={allTeams.filter(t => t.isActive).map(t => ({ value: t.id, label: t.name }))}
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
              {th("name", "Name")}
              {th("jobTitle", "Job title")}
              {th("email", "Email")}
              {th("teams", "Teams")}
              {th("permission", "Permission")}
              {th("status", "Status")}
              {th("lastLogin", "Last login")}
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8}><Text type="text3" color="secondary">Loading…</Text></td></tr>
            )}
            {!loading && filtered && shown.length === 0 && profiles.length > 0 && (
              <tr><td colSpan={8}><Text type="text3" color="secondary">No users match these filters.</Text></td></tr>
            )}
            {!loading && sorted.map(p => (
              <UserRow
                key={p.id}
                profile={p}
                editing={editingRow === p.id}
                canEdit={canEdit}
                onEdit={() => setEditingRow(p.id)}
                onDone={saved => { setEditingRow(null); if (saved) refresh(); }}
                onActivity={() => setActivityFor(p)}
                onFullEdit={() => { setEditingRow(null); setEditing(p); }}
                onDeactivate={() => setDeactivating(p)}
              />
            ))}
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

type TeamColumn = "team" | "phases" | "jobs" | "members";

function Teams() {
  const { teams: allTeams, teamNames } = useTeams();
  const { stageNames } = useStages();
  const { teamsByStage } = useTemplatePhases();
  const { jobs } = useBoardRecords();
  // The members. `profiles.teams` is a list of team slugs, so this is a read the app
  // already does everywhere else — the column just never asked for it and rendered
  // {{profiles.full_name}} over forty-seven memberships the database was holding.
  const { data: profiles } = useQuery<Profile[]>(repo => repo.listProfiles(), []);

  // Derived once, so the sort reads the same numbers the cells render rather than
  // recounting the jobs inside a comparator on every comparison.
  const rows = useMemo(
    () =>
      teamNames.map(t => {
        // Names come from the lookup, membership is stored by slug — so the row has to
        // carry both. Matching on the display name would break the day a team is renamed.
        const slug = allTeams.find(x => x.name === t)?.id;
        return {
          team: t,
          owned: stageNames.filter(s => (teamsByStage[s] ?? []).includes(t)),
          held: jobs.filter(j => j.team === t).length,
          members: slug
            ? profiles.filter(p => p.active && p.teams.includes(slug as TeamId))
            : []
        };
      }),
    [teamNames, allTeams, stageNames, teamsByStage, jobs, profiles]
  );

  const columns = useMemo(
    () => ({
      team: (r: (typeof rows)[number]) => r.team,
      phases: (r: (typeof rows)[number]) => r.owned.join(", "),
      jobs: (r: (typeof rows)[number]) => r.held,
      members: (r: (typeof rows)[number]) => r.members.length
    }),
    []
  );

  const { sorted, sort, toggle } = useTableSort(rows, columns, { key: "team" as TeamColumn, direction: "asc" });

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
            <tr>
              <SortHeader column={"team" as TeamColumn} label="Team" sort={sort} onSort={toggle} />
              <SortHeader column={"phases" as TeamColumn} label="Phases owned" sort={sort} onSort={toggle} />
              <SortHeader column={"jobs" as TeamColumn} label="Jobs held" sort={sort} onSort={toggle} className="num" />
              <SortHeader column={"members" as TeamColumn} label="Members" sort={sort} onSort={toggle} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.team}>
                <td><strong>{r.team}</strong></td>
                <td className="muted">{r.owned.join(", ") || "—"}</td>
                <td className="num">{r.held}</td>
                {/* Active members only: a deactivated person is not on the team any more
                    in any sense that matters to somebody reading this column. */}
                <td>
                  {r.members.length
                    ? r.members.map(m => m.fullName).join(", ")
                    : <span className="muted">No members</span>}
                </td>
              </tr>
            ))}
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
