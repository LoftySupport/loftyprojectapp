import { useMemo, useState } from "react";
import { Button, Heading, Search, Tab, TabList, Text, TextField } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { ActivityDialog, DeactivateDialog, UserDialog } from "../components/UserDialogs";
import { Select, toOptions } from "../components/Select";
import { SortHeader, useTableSort } from "../components/SortableTable";
import { UserRow } from "../components/UserRow";
import { Problem } from "../components/Form";
import {
  PERMISSION_LEVELS, PROFILE_STATUSES, profileStatus, type Profile, type TeamId
} from "../data/types";
import { useStages, useTeamLabels, useTemplatePhases } from "../data/useLookups";
import { useBoardRecords } from "../data/boardModel";
import { useRepository } from "../data/DataProvider";
import { useToasts } from "../components/Toasts";
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

      {/* Permissions moved to Setup — Admin is who works here, Setup is how the app is
          configured, and the matrix that used to sit here was five invented objects over
          a table that does not exist. */}
      <TabList activeTabId={tab} onTabChange={setTab}>
        <Tab>Users</Tab>
        <Tab>Teams</Tab>
      </TabList>

      <div style={{ marginTop: "var(--space-16)" }}>
        {tab === 0 && <Users />}
        {tab === 1 && <Teams />}
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
  const repo = useRepository();
  const { can } = usePermission();
  const { toast } = useToasts();
  // Its own read rather than useTeams(), because editing needs a reload the shared
  // lookup hook does not carry — and retired teams must appear here, dimmed, or there
  // is nowhere to restore one from.
  const [reloadKey, setReloadKey] = useState(0);
  const { data: allTeams } = useQuery(r => r.listTeams(), [], [reloadKey]);
  const { stageNames } = useStages();
  const { teamsByStage } = useTemplatePhases();
  const { jobs } = useBoardRecords();
  const { data: profiles } = useQuery<Profile[]>(r => r.listProfiles(), []);

  // Rename state: which team, and the draft label.
  const [renaming, setRenaming] = useState<TeamId | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async (id: TeamId, patch: { name?: string; isActive?: boolean }, done: string) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await repo.updateTeam(id, patch);
      toast(done);
      setRenaming(null);
      setReloadKey(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = useMemo(
    () =>
      allTeams.map(t => ({
        id: t.id,
        team: t.name,
        isActive: t.isActive,
        owned: stageNames.filter(s => (teamsByStage[s] ?? []).includes(t.name)),
        held: jobs.filter(j => j.team === t.name).length,
        members: profiles.filter(p => p.active && p.teams.includes(t.id))
      })),
    [allTeams, stageNames, teamsByStage, jobs, profiles]
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
  const canEdit = can("admin");

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Teams ({rows.filter(r => r.isActive).length} active)</Text>
        <Text type="text3" color="secondary">
          Rename freely — the slug underneath never changes, so nothing pointing at a team
          breaks. Retire instead of delete; a team holding jobs must hand them on first.
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
              {canEdit && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.id} className={r.isActive ? undefined : "row-retired"}>
                <td>
                  {renaming === r.id ? (
                    <div className="field-inline">
                      <TextField
                        inputAriaLabel={`Rename ${r.team}`}
                        value={draft}
                        onChange={setDraft}
                        size="small"
                        autoFocus
                      />
                      <Button
                        size="small"
                        disabled={busy || !draft.trim() || draft.trim() === r.team}
                        onClick={() => save(r.id, { name: draft.trim() }, `${r.team} renamed to ${draft.trim()}.`)}
                      >
                        Save
                      </Button>
                      <Button size="small" kind="tertiary" onClick={() => setRenaming(null)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <strong>{r.team}</strong>
                      {!r.isActive && <span className="muted"> · retired</span>}
                    </>
                  )}
                </td>
                <td className="muted">{r.owned.join(", ") || "—"}</td>
                <td className="num">{r.held}</td>
                {/* Active members only: a deactivated person is not on the team any more
                    in any sense that matters to somebody reading this column. */}
                <td>
                  {r.members.length
                    ? r.members.map(m => m.fullName).join(", ")
                    : <span className="muted">No members</span>}
                </td>
                {canEdit && (
                  <td className="num">
                    <div className="field-inline">
                      {renaming !== r.id && (
                        <Button size="small" kind="tertiary" onClick={() => { setRenaming(r.id); setDraft(r.team); }}>
                          Rename
                        </Button>
                      )}
                      {r.isActive ? (
                        <span title={r.held > 0 ? `Holding ${r.held} job${r.held === 1 ? "" : "s"} — reassign them first` : undefined}>
                          <Button
                            size="small"
                            kind="tertiary"
                            disabled={busy || r.held > 0}
                            onClick={() => save(r.id, { isActive: false }, `${r.team} retired.`)}
                          >
                            {r.held > 0 ? `Retire (holds ${r.held})` : "Retire"}
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="small"
                          kind="tertiary"
                          disabled={busy}
                          onClick={() => save(r.id, { isActive: true }, `${r.team} restored.`)}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problem && <Problem>{problem}</Problem>}
    </section>
  );
}

