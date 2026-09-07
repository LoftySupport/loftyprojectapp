import { useMemo, useState } from "react";
import { Button, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { PersonSelect } from "../components/PersonSelect";
import { Select } from "./Select";
import { Problem } from "./Form";
import type { RecordStaffRole } from "../data/types";
import "./ui.css";
import "./processes.css";

/**
 * SiteBook's project roles, on this project or job (0082): SS Site Supervisor, CM
 * Construction Manager, CA Contracts Administrator… and the Lofty person who holds each.
 *
 * Managers assign; everyone reads, because "who is the site supervisor on 1507" is the
 * question a phone call starts with. Ending a role keeps the history — the person who held
 * it last year is part of the record.
 */
export function StaffRolesPanel({ projectId, jobId }: { projectId?: number; jobId?: string }) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const { data: held, loading } = useQuery<RecordStaffRole[]>(r => r.listRecordStaffRoles({ projectId, jobId }), [], [projectId, jobId, reload]);
  const { data: roles } = useQuery(r => r.listStaffRoles(), []);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [showEnded, setShowEnded] = useState(false);

  const current = useMemo(() => held.filter(h => h.endedOn == null), [held]);
  const ended = useMemo(() => held.filter(h => h.endedOn != null), [held]);
  const canAssign = can("manager");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setProblem(null);
    try { await fn(); setReload(n => n + 1); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel" aria-label="Project roles">
      <div className="panel-head">
        <Text type="text2" weight="bold">Project roles</Text>
        <div className="panel-actions">
          <Text type="text3" color="secondary">who at Lofty holds what here</Text>
          {ended.length > 0 && (
            <Button size="xs" kind="tertiary" onClick={() => setShowEnded(v => !v)}>{showEnded ? "Hide ended" : `${ended.length} ended`}</Button>
          )}
        </div>
      </div>
      {problem && <Problem>{problem}</Problem>}
      {!loading && current.length === 0 && (
        <Text type="text3" color="secondary" ellipsis={false}>
          No roles assigned yet. {canAssign ? "Pick a role and a person below." : "Managers assign them."}
        </Text>
      )}
      {(current.length > 0 || (showEnded && ended.length > 0)) && (
        <ul className="party-list">
          {[...current, ...(showEnded ? ended : [])].map(h => (
            <li key={h.id} className="party-row">
              <span className="party-role" title={h.roleName}>{h.roleAbbreviation}</span>
              <span className="party-who">
                <Text type="text2" element="span">{h.profileName}</Text>
                <span className="slot-sub"> {h.roleName}</span>
              </span>
              {h.endedOn
                ? <span className="slot-sub">ended {new Date(h.endedOn + "T00:00:00").toLocaleDateString()}</span>
                : canAssign && (
                  <Button size="xs" kind="tertiary" disabled={busy} aria-label={`End ${h.profileName}'s ${h.roleName} role`}
                    onClick={() => run(() => repo.endRecordStaffRole(h.id, new Date().toISOString().slice(0, 10)))}>
                    End
                  </Button>
                )}
            </li>
          ))}
        </ul>
      )}
      {canAssign && (
        <div className="party-add">
          <Select aria-label="Project role" placeholder="Role…" clearable value={roleId} onChange={setRoleId}
            options={roles.filter(r => r.isActive).map(r => ({ value: r.id, label: `${r.abbreviation} · ${r.name}` }))} />
          <PersonSelect aria-label="Person" placeholder="Person…" value={profileId} onChange={setProfileId} />
          <Button size="small" disabled={busy || !roleId || !profileId} onClick={() => run(async () => {
            await repo.addRecordStaffRole({ projectId, jobId, roleId: roleId!, profileId: profileId! });
            setRoleId(null); setProfileId(null);
          })}>Assign</Button>
        </div>
      )}
    </section>
  );
}
