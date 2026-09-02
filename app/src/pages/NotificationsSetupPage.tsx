import { useState } from "react";
import { Button, Checkbox, Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useTeams } from "../data/useLookups";
import { Problem } from "../components/Form";
import { Select } from "../components/Select";
import {
  NOTIFICATION_AUDIENCES, NOTIFICATION_AUDIENCE_LABELS, NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_LABELS, teamName,
  type NotificationAudience, type NotificationChannel, type NotificationRule, type NotificationType
} from "../data/types";
import "../components/ui.css";
import "../components/processes.css";

/**
 * Setup → Notifications (0083): who hears what, and the defaults everyone starts from.
 *
 * Amber: "notifications on incomplete tasks and who they go to need to be added". The
 * rules are the "who": per type, an audience — the assignee, the owning team, the engaged
 * teams, whoever watches the record, the managers, a named team or person — with an
 * escalation delay ("overdue 5 days → managers"). Admins edit; everyone can read what
 * will happen to them.
 *
 * The outbox panel at the end says what has actually gone out per channel, and says
 * plainly when nothing has, so "notifications are on" is never a claim the table cannot back.
 */
export function NotificationsSetupPage() {
  const repo = useRepository();
  const { can } = usePermission();
  const canEdit = can("admin");
  const { teams } = useTeams();
  const [reload, setReload] = useState(0);
  const { data: types } = useQuery<NotificationType[]>(r => r.listNotificationTypes(), [], [reload]);
  const { data: rules } = useQuery<NotificationRule[]>(r => r.listNotificationRules(), [], [reload]);
  const { data: profiles } = useQuery(r => r.listProfiles(), []);
  const { data: stats } = useQuery(r => r.listDeliveryStats(), [], [reload]);
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ typeId: string; audience: NotificationAudience; teamId: string | null; profileId: string | null; afterDays: number } | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setProblem(null);
    try { await fn(); setReload(n => n + 1); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }

  const describe = (r: NotificationRule) => {
    const who = r.audience === "specific_team" && r.teamId ? teamName(r.teamId, teams)
      : r.audience === "specific_person" && r.profileId ? (profiles.find(p => p.id === r.profileId)?.fullName ?? "a person")
      : NOTIFICATION_AUDIENCE_LABELS[r.audience];
    return r.afterDays > 0 ? `${who}, after ${r.afterDays} day${r.afterDays === 1 ? "" : "s"}` : who;
  };

  const sent = stats.filter(s => s.status === "sent");

  return (
    <div className="stack">
      <Text type="text2" color="secondary" ellipsis={false}>
        Each <strong>type</strong> of notification has defaults everyone starts from — which channels, and whether it
        comes at once or in the morning digest — and <strong>rules</strong> for who hears it. People change their own
        channels in Settings; the rules are yours. {canEdit ? "Admins edit." : "Admins edit; you can read what applies to you."}
      </Text>
      {problem && <Problem>{problem}</Problem>}

      {types.map(t => {
        const mine = rules.filter(r => r.typeId === t.id);
        return (
          <section className="panel" key={t.id}>
            <div className="panel-head">
              <div>
                <Text type="text2" weight="bold">{t.name}</Text>
                {t.description && <div className="slot-sub">{t.description}</div>}
              </div>
              <div className="panel-actions">
                {canEdit ? (
                  <Checkbox label={t.isActive ? "Active" : "Off"} checked={t.isActive}
                    onChange={() => run(() => repo.saveNotificationType({ ...t, isActive: !t.isActive }))} />
                ) : <span className="slot-chip">{t.isActive ? "active" : "off"}</span>}
              </div>
            </div>

            <div className="field-inline" style={{ flexWrap: "wrap", gap: "var(--space-16)" }}>
              <span className="field-inline">
                <Text type="text3" weight="bold" element="span">Default channels</Text>
                {NOTIFICATION_CHANNELS.map(ch => (
                  <label key={ch} className="pf-check">
                    <input type="checkbox" checked={t.defaultChannels.includes(ch)} disabled={!canEdit}
                      onChange={e => run(() => repo.saveNotificationType({ ...t, defaultChannels: e.target.checked ? [...t.defaultChannels, ch] : t.defaultChannels.filter(c => c !== ch) }))} />
                    <Text type="text3" element="span">{NOTIFICATION_CHANNEL_LABELS[ch as NotificationChannel]}</Text>
                  </label>
                ))}
              </span>
              <span className="field-inline">
                <Text type="text3" weight="bold" element="span">Default timing</Text>
                {canEdit ? (
                  <Select aria-label={`Default timing for ${t.name}`} value={t.defaultTiming}
                    options={[{ value: "immediate", label: "Immediately" }, { value: "digest", label: "Daily digest" }]}
                    onChange={v => run(() => repo.saveNotificationType({ ...t, defaultTiming: v as NotificationType["defaultTiming"] }))} />
                ) : <Text type="text3" element="span">{t.defaultTiming === "digest" ? "Daily digest" : "Immediately"}</Text>}
              </span>
            </div>

            <div style={{ marginTop: "var(--space-8)" }}>
              <Text type="text3" weight="bold">Who hears it</Text>
              {mine.length === 0 && <Text type="text3" color="secondary" ellipsis={false} element="p">Nobody — this type fires and reaches no one until a rule names an audience.</Text>}
              <ul className="dep-list">
                {mine.map(r => (
                  <li key={r.id} className={r.isActive ? undefined : "muted"}>
                    <Text type="text2" element="span" style={{ flex: "1 1 240px" }}>{describe(r)}</Text>
                    {canEdit && (
                      <>
                        <label className="pf-check">
                          <Text type="text3" element="span">after</Text>
                          <input type="number" min={0} className="pf-input dep-lag" aria-label={`Days late before ${describe(r)} hears`} defaultValue={r.afterDays}
                            onBlur={e => { const v = Math.max(0, Number(e.target.value) || 0); if (v !== r.afterDays) run(() => repo.updateNotificationRule(r.id, { afterDays: v })); }} />
                          <Text type="text3" element="span">days</Text>
                        </label>
                        <Checkbox label={r.isActive ? "Active" : "Paused"} checked={r.isActive} onChange={() => run(() => repo.updateNotificationRule(r.id, { isActive: !r.isActive }))} />
                        <Button size="xs" kind="tertiary" onClick={() => run(() => repo.deleteNotificationRule(r.id))}>Remove</Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && draft?.typeId !== t.id && (
                <Button size="xs" kind="tertiary" onClick={() => setDraft({ typeId: t.id, audience: "owning_team", teamId: null, profileId: null, afterDays: 0 })}>+ Add who hears it</Button>
              )}
              {canEdit && draft?.typeId === t.id && (
                <div className="field-inline" style={{ flexWrap: "wrap", marginTop: "var(--space-4)" }}>
                  <Select aria-label="Audience" value={draft.audience} options={NOTIFICATION_AUDIENCES.map(a => ({ value: a, label: NOTIFICATION_AUDIENCE_LABELS[a] }))}
                    onChange={v => setDraft({ ...draft, audience: v as NotificationAudience })} />
                  {draft.audience === "specific_team" && (
                    <Select aria-label="Team" clearable placeholder="Team…" value={draft.teamId} options={teams.map(x => ({ value: x.id, label: x.name }))} onChange={v => setDraft({ ...draft, teamId: v })} />
                  )}
                  {draft.audience === "specific_person" && (
                    <Select aria-label="Person" clearable placeholder="Person…" value={draft.profileId} options={profiles.filter(p => p.active).map(p => ({ value: p.id, label: p.fullName }))} onChange={v => setDraft({ ...draft, profileId: v })} />
                  )}
                  <label className="pf-check">
                    <Text type="text3" element="span">after</Text>
                    <input type="number" min={0} className="pf-input dep-lag" aria-label="Days late before this audience hears" value={draft.afterDays} onChange={e => setDraft({ ...draft, afterDays: Math.max(0, Number(e.target.value) || 0) })} />
                    <Text type="text3" element="span">days</Text>
                  </label>
                  <Button size="small" disabled={(draft.audience === "specific_team" && !draft.teamId) || (draft.audience === "specific_person" && !draft.profileId)}
                    onClick={() => run(async () => { await repo.addNotificationRule({ typeId: draft.typeId, audience: draft.audience, teamId: draft.teamId as NotificationRule["teamId"], profileId: draft.profileId, afterDays: draft.afterDays }); setDraft(null); })}>
                    Add
                  </Button>
                  <Button size="small" kind="tertiary" onClick={() => setDraft(null)}>Cancel</Button>
                </div>
              )}
            </div>
          </section>
        );
      })}

      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">The outbox</Text>
          <Text type="text3" color="secondary">what has actually gone out, per channel</Text>
        </div>
        {stats.length === 0 ? (
          <Text type="text3" color="secondary" ellipsis={false}>Nothing has been queued yet.</Text>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Channel</th><th>Status</th><th className="num">Rows</th><th>Last sent</th></tr></thead>
              <tbody>
                {stats.map(s => (
                  <tr key={`${s.channel}:${s.status}`}>
                    <td>{NOTIFICATION_CHANNEL_LABELS[s.channel]}</td>
                    <td>{s.status}</td>
                    <td className="num">{s.count}</td>
                    <td className="muted">{s.lastSentAt ? new Date(s.lastSentAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Text type="text3" color="secondary" ellipsis={false} element="p" style={{ marginTop: "var(--space-8)" }}>
          In-app rows are sent the moment they are written. Email and Teams need the delivery worker
          (<code>supabase/functions/deliver-notifications</code>) deployed with the Microsoft Graph secrets and a
          schedule{sent.some(s => s.channel === "email") ? "" : " — none has been sent yet, so it is not running"}. SMS
          waits on a provider.
        </Text>
      </section>
    </div>
  );
}
