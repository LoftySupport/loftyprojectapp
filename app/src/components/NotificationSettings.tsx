import { useMemo, useState } from "react";
import { Text, Toggle } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { Problem } from "./Form";
import { Select } from "./Select";
import {
  NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_LABELS,
  type NotificationChannel, type NotificationPreference, type NotificationType
} from "../data/types";
import "./ui.css";
import "./processes.css";

/**
 * Your notifications (0083, Amber: channels "selected in user settings").
 *
 * One row per type, one toggle per channel, and for each type whether it comes at once or
 * in your daily digest, and when. Every choice is a `notification_preferences` row of
 * your own; where you have not chosen, the type's default stands and the toggle shows
 * it. SMS is listed because it will exist; it says plainly that no provider is set up yet.
 */
const TIMES = ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "12:00", "17:00"];

export function NotificationSettings() {
  const repo = useRepository();
  const [reload, setReload] = useState(0);
  const { data: types } = useQuery<NotificationType[]>(r => r.listNotificationTypes(), []);
  const { data: prefs } = useQuery<NotificationPreference[]>(r => r.listMyNotificationPreferences(), [], [reload]);
  const [problem, setProblem] = useState<string | null>(null);

  const byKey = useMemo(() => new Map(prefs.map(p => [`${p.typeId}:${p.channel}`, p])), [prefs]);
  const effective = (t: NotificationType, ch: NotificationChannel): NotificationPreference =>
    byKey.get(`${t.id}:${ch}`) ?? { typeId: t.id, channel: ch, isEnabled: t.defaultChannels.includes(ch), timing: null, digestTime: null };

  async function save(p: NotificationPreference) {
    setProblem(null);
    try { await repo.saveMyNotificationPreference(p); setReload(n => n + 1); }
    catch (e) { setProblem(e instanceof Error ? e.message : String(e)); }
  }

  /** Timing is per type: the same choice is written to every channel row so the worker sees one answer. */
  const timingOf = (t: NotificationType) => {
    const rows = NOTIFICATION_CHANNELS.map(ch => byKey.get(`${t.id}:${ch}`)).filter((p): p is NotificationPreference => Boolean(p));
    return rows.find(r => r.timing)?.timing ?? t.defaultTiming;
  };
  const digestOf = (t: NotificationType) => {
    const rows = NOTIFICATION_CHANNELS.map(ch => byKey.get(`${t.id}:${ch}`)).filter((p): p is NotificationPreference => Boolean(p));
    return rows.find(r => r.digestTime)?.digestTime?.slice(0, 5) ?? "07:30";
  };
  const setTiming = async (t: NotificationType, timing: "immediate" | "digest", digest?: string) => {
    for (const ch of NOTIFICATION_CHANNELS) {
      const cur = effective(t, ch);
      await save({ ...cur, timing, digestTime: digest ?? cur.digestTime ?? "07:30" });
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">Notifications</Text>
        <Text type="text3" color="secondary">what you hear, where, and when</Text>
      </div>
      <Text type="text3" color="secondary" ellipsis={false} element="p">
        In-app is the bell. Email and Teams come from the Lofty mailbox. <strong>Immediate</strong> sends as it
        happens; <strong>digest</strong> gathers the day's into one message at the time you choose. Where you have
        not chosen, the default shown applies. SMS is listed for when a provider is set up; nothing sends by SMS yet.
      </Text>
      {problem && <Problem>{problem}</Problem>}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>When</th>
              {NOTIFICATION_CHANNELS.map(ch => <th key={ch}>{NOTIFICATION_CHANNEL_LABELS[ch]}</th>)}
              <th>Timing</th>
            </tr>
          </thead>
          <tbody>
            {types.filter(t => t.isActive).map(t => {
              const timing = timingOf(t);
              return (
                <tr key={t.id}>
                  <td>
                    <Text type="text2" weight="medium" element="div">{t.name}</Text>
                    {t.description && <div className="slot-sub">{t.description}</div>}
                  </td>
                  {NOTIFICATION_CHANNELS.map(ch => {
                    const p = effective(t, ch);
                    return (
                      <td key={ch}>
                        <Toggle size="small" isSelected={p.isEnabled} aria-label={`${t.name} by ${NOTIFICATION_CHANNEL_LABELS[ch]}`}
                          disabled={ch === "sms"} onChange={on => save({ ...p, isEnabled: on })} />
                        {ch === "sms" && <div className="slot-sub">no provider yet</div>}
                      </td>
                    );
                  })}
                  <td>
                    <div className="field-inline" style={{ flexWrap: "wrap" }}>
                      <Select aria-label={`Timing for ${t.name}`} value={timing}
                        options={[{ value: "immediate", label: "Immediately" }, { value: "digest", label: "In my digest" }]}
                        onChange={v => setTiming(t, v as "immediate" | "digest")} />
                      {timing === "digest" && (
                        <Select aria-label={`Digest time for ${t.name}`} value={digestOf(t)}
                          options={TIMES.map(x => ({ value: x, label: x }))}
                          onChange={v => setTiming(t, "digest", v)} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
