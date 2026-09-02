import type { SupabaseClient } from "@supabase/supabase-js";
import type { Repository } from "./repository";
import type {
  DeliveryStat, NewNotificationRule, Notification, NotificationChannel, NotificationPreference, NotificationRule, NotificationType,
  RecordWatch
} from "./types";

/**
 * The notifications half of the Supabase repository (0083): the inbox, a person's own
 * preferences and watches, and — for admins — the types and the rules.
 *
 * Nothing here creates a notification. The database does that, from triggers and the
 * 15-minute scan, through `private.notify()`; the app reads what was said and records
 * what each person wants to hear.
 */
type NotificationMethods = Pick<Repository,
  | "listNotificationTypes" | "saveNotificationType" | "listNotificationRules" | "addNotificationRule" | "updateNotificationRule" | "deleteNotificationRule"
  | "listMyNotificationPreferences" | "saveMyNotificationPreference" | "listMyNotifications" | "markNotificationsRead"
  | "listMyWatches" | "watchRecord" | "unwatchRecord" | "listDeliveryStats"
>;

export function notificationMethods(client: SupabaseClient): NotificationMethods {
  return {
    async listNotificationTypes(): Promise<NotificationType[]> {
      const { data, error } = await client.from("notification_types")
        .select("notification_type_id, notification_type_name, notification_type_description, notification_type_default_channels, notification_type_default_timing, notification_type_position, notification_type_is_active")
        .order("notification_type_position");
      if (error) throw error;
      return ((data ?? []) as { notification_type_id: string; notification_type_name: string; notification_type_description: string | null; notification_type_default_channels: NotificationChannel[]; notification_type_default_timing: NotificationType["defaultTiming"]; notification_type_position: number; notification_type_is_active: boolean }[])
        .map(r => ({ id: r.notification_type_id, name: r.notification_type_name, description: r.notification_type_description, defaultChannels: r.notification_type_default_channels ?? [], defaultTiming: r.notification_type_default_timing, position: r.notification_type_position, isActive: r.notification_type_is_active }));
    },
    async saveNotificationType(row: NotificationType): Promise<NotificationType> {
      const { error } = await client.from("notification_types").update({
        notification_type_default_channels: row.defaultChannels, notification_type_default_timing: row.defaultTiming, notification_type_is_active: row.isActive
      }).eq("notification_type_id", row.id);
      if (error) throw error;
      return row;
    },
    async listNotificationRules(): Promise<NotificationRule[]> {
      const { data, error } = await client.from("notification_rules")
        .select("notification_rule_id, notification_type_id, notification_rule_audience, team_id, profile_id, notification_rule_after_days, notification_rule_is_active")
        .order("notification_type_id").order("notification_rule_after_days");
      if (error) throw error;
      return ((data ?? []) as { notification_rule_id: string; notification_type_id: string; notification_rule_audience: NotificationRule["audience"]; team_id: string | null; profile_id: string | null; notification_rule_after_days: number; notification_rule_is_active: boolean }[])
        .map(r => ({ id: r.notification_rule_id, typeId: r.notification_type_id, audience: r.notification_rule_audience, teamId: (r.team_id as NotificationRule["teamId"]) ?? null, profileId: r.profile_id, afterDays: r.notification_rule_after_days, isActive: r.notification_rule_is_active }));
    },
    async addNotificationRule(input: NewNotificationRule): Promise<NotificationRule> {
      const { data, error } = await client.from("notification_rules").insert({
        notification_type_id: input.typeId, notification_rule_audience: input.audience,
        team_id: input.teamId ?? null, profile_id: input.profileId ?? null, notification_rule_after_days: input.afterDays ?? 0
      }).select("notification_rule_id, notification_type_id, notification_rule_audience, team_id, profile_id, notification_rule_after_days, notification_rule_is_active").single();
      if (error) throw error;
      const r = data as { notification_rule_id: string; notification_type_id: string; notification_rule_audience: NotificationRule["audience"]; team_id: string | null; profile_id: string | null; notification_rule_after_days: number; notification_rule_is_active: boolean };
      return { id: r.notification_rule_id, typeId: r.notification_type_id, audience: r.notification_rule_audience, teamId: (r.team_id as NotificationRule["teamId"]) ?? null, profileId: r.profile_id, afterDays: r.notification_rule_after_days, isActive: r.notification_rule_is_active };
    },
    async updateNotificationRule(id, patch): Promise<NotificationRule> {
      const row: Record<string, unknown> = {};
      if (patch.afterDays !== undefined) row.notification_rule_after_days = patch.afterDays;
      if (patch.isActive !== undefined) row.notification_rule_is_active = patch.isActive;
      const { data, error } = await client.from("notification_rules").update(row).eq("notification_rule_id", id)
        .select("notification_rule_id, notification_type_id, notification_rule_audience, team_id, profile_id, notification_rule_after_days, notification_rule_is_active").single();
      if (error) throw error;
      const r = data as { notification_rule_id: string; notification_type_id: string; notification_rule_audience: NotificationRule["audience"]; team_id: string | null; profile_id: string | null; notification_rule_after_days: number; notification_rule_is_active: boolean };
      return { id: r.notification_rule_id, typeId: r.notification_type_id, audience: r.notification_rule_audience, teamId: (r.team_id as NotificationRule["teamId"]) ?? null, profileId: r.profile_id, afterDays: r.notification_rule_after_days, isActive: r.notification_rule_is_active };
    },
    async deleteNotificationRule(id: string): Promise<void> {
      const { error } = await client.from("notification_rules").delete().eq("notification_rule_id", id);
      if (error) throw error;
    },

    async listMyNotificationPreferences(): Promise<NotificationPreference[]> {
      // RLS returns only the caller's rows.
      const { data, error } = await client.from("notification_preferences")
        .select("notification_type_id, notification_preference_channel, notification_preference_is_enabled, notification_preference_timing, notification_preference_digest_time");
      if (error) throw error;
      return ((data ?? []) as { notification_type_id: string; notification_preference_channel: NotificationChannel; notification_preference_is_enabled: boolean; notification_preference_timing: NotificationPreference["timing"]; notification_preference_digest_time: string | null }[])
        .map(r => ({ typeId: r.notification_type_id, channel: r.notification_preference_channel, isEnabled: r.notification_preference_is_enabled, timing: r.notification_preference_timing, digestTime: r.notification_preference_digest_time }));
    },
    async saveMyNotificationPreference(pref: NotificationPreference): Promise<void> {
      const { data: me, error: meError } = await client.rpc("current_profile_id");
      if (meError) throw meError;
      if (!me) throw new Error("Saving a preference needs you to be signed in.");
      const { error } = await client.from("notification_preferences").upsert({
        profile_id: me as string, notification_type_id: pref.typeId, notification_preference_channel: pref.channel,
        notification_preference_is_enabled: pref.isEnabled, notification_preference_timing: pref.timing, notification_preference_digest_time: pref.digestTime
      }, { onConflict: "profile_id,notification_type_id,notification_preference_channel" });
      if (error) throw error;
    },

    async listMyNotifications(opts = {}): Promise<Notification[]> {
      let q = client.from("notifications")
        .select("notification_id, notification_type_id, project_id, job_id, task_id, process_run_id, comment_id, notification_title, notification_body, notification_href, notification_created_at, notification_read_at");
      if (opts.unreadOnly) q = q.is("notification_read_at", null);
      const { data, error } = await q.order("notification_created_at", { ascending: false }).limit(opts.limit ?? 50);
      if (error) throw error;
      return ((data ?? []) as { notification_id: number; notification_type_id: string; project_id: number | null; job_id: string | null; task_id: string | null; process_run_id: string | null; comment_id: string | null; notification_title: string; notification_body: string | null; notification_href: string | null; notification_created_at: string; notification_read_at: string | null }[])
        .map(r => ({ id: r.notification_id, typeId: r.notification_type_id, projectId: r.project_id, jobId: r.job_id, taskId: r.task_id, processRunId: r.process_run_id, commentId: r.comment_id, title: r.notification_title, body: r.notification_body, href: r.notification_href, createdAt: r.notification_created_at, readAt: r.notification_read_at }));
    },
    async markNotificationsRead(ids?: number[]): Promise<number> {
      const { data, error } = await client.rpc("mark_my_notifications_read", { p_ids: ids ?? null });
      if (error) throw error;
      return Number(data ?? 0);
    },

    async listMyWatches(): Promise<RecordWatch[]> {
      const { data, error } = await client.from("record_watchers").select("record_watcher_id, project_id, job_id");
      if (error) throw error;
      return ((data ?? []) as { record_watcher_id: string; project_id: number | null; job_id: string | null }[])
        .map(r => ({ id: r.record_watcher_id, projectId: r.project_id, jobId: r.job_id }));
    },
    async watchRecord(target): Promise<void> {
      const { data: me, error: meError } = await client.rpc("current_profile_id");
      if (meError) throw meError;
      const { error } = await client.from("record_watchers").insert({ profile_id: me as string, project_id: target.projectId ?? null, job_id: target.jobId ?? null });
      if (error && error.code !== "23505") throw error;
    },
    async unwatchRecord(target): Promise<void> {
      let q = client.from("record_watchers").delete();
      q = target.jobId != null ? q.eq("job_id", target.jobId) : q.eq("project_id", target.projectId!);
      const { error } = await q;
      if (error) throw error;
    },

    async listDeliveryStats(): Promise<DeliveryStat[]> {
      // Admin-only by policy; a user's own rows would come back instead, which is harmless
      // and mostly empty.
      const { data, error } = await client.from("notification_deliveries")
        .select("notification_delivery_channel, notification_delivery_status, notification_delivery_sent_at")
        .order("notification_delivery_created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      const acc = new Map<string, DeliveryStat>();
      for (const r of (data ?? []) as { notification_delivery_channel: NotificationChannel; notification_delivery_status: string; notification_delivery_sent_at: string | null }[]) {
        const k = `${r.notification_delivery_channel}:${r.notification_delivery_status}`;
        const cur = acc.get(k) ?? { channel: r.notification_delivery_channel, status: r.notification_delivery_status, count: 0, lastSentAt: null };
        cur.count += 1;
        if (r.notification_delivery_sent_at && (!cur.lastSentAt || r.notification_delivery_sent_at > cur.lastSentAt)) cur.lastSentAt = r.notification_delivery_sent_at;
        acc.set(k, cur);
      }
      return [...acc.values()].sort((a, b) => a.channel.localeCompare(b.channel) || a.status.localeCompare(b.status));
    }
  };
}
