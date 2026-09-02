import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button, Dialog, DialogContentContainer, Text } from "@vibe/core";
import { Notifications } from "@vibe/icons";
import { Tooltip } from "@vibe/tooltip";
import { useQuery, useRepository } from "../data/DataProvider";
import { FEEDBACK_STAGE_LABELS, type MovedRequest, type Notification } from "../data/types";
import "./ui.css";

/**
 * The header bell — the in-app channel of the notifications built in 0083.
 *
 * Everything listed here is a row in `notifications`, written by the database from a
 * trigger (assigned, mentioned, a stage moved, working drawings changed, a contact
 * awaiting sign-off) or from the 15-minute scan (tasks and processes at risk or overdue).
 * The badge counts unread rows and nothing else — with nothing unread there is no badge,
 * because a 0 would be a claim.
 *
 * The tracker's "a request you follow moved" (0065) keeps its own list here: it predates
 * the inbox and its rows are the tracker's, not notifications'.
 *
 * Opening a notification's record marks it read — following the link IS having seen it.
 * "Mark all read" is one call to the database, not fifty.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const repo = useRepository();
  const [reload, setReload] = useState(0);
  const { data: items } = useQuery<Notification[]>(r => r.listMyNotifications({ limit: 40 }), [], [reload]);
  const { data: moved } = useQuery<MovedRequest[]>(r => r.listMyMovedRequests(), [], [reload]);
  const unread = items.filter(n => n.readAt === null);

  // The bell refreshes itself every two minutes while the page is open, so a scan that
  // ran at 07:30 shows without a reload. Realtime would be the next step and the sync
  // batch adds it; polling is honest until then.
  useEffect(() => {
    const t = setInterval(() => setReload(k => k + 1), 120_000);
    return () => clearInterval(t);
  }, []);

  const openOne = (n: Notification) => {
    close();
    if (n.readAt === null) void repo.markNotificationsRead([n.id]).then(() => setReload(k => k + 1)).catch(() => {});
  };
  const markAll = () => void repo.markNotificationsRead().then(() => setReload(k => k + 1)).catch(() => {});
  const openMoved = (m: MovedRequest) => {
    close();
    void repo.markMoveSeen(m.id).then(() => setReload(k => k + 1)).catch(() => {});
  };

  const waiting = unread.length + moved.length;

  const content = (
    <DialogContentContainer>
      <div className="notif-panel">
        <div className="notif-panel-head">
          <Text type="text2" weight="bold">Notifications</Text>
          <span className="field-inline">
            {waiting > 0 && <Text type="text3" color="secondary">{waiting} unread</Text>}
            {unread.length > 0 && <Button size="xs" kind="tertiary" onClick={markAll}>Mark all read</Button>}
          </span>
        </div>

        {moved.length > 0 && (
          <ul className="notif-mentions">
            {moved.map(m => (
              <li key={m.id} className="is-unread">
                <div className="notif-mention-head">
                  <Text type="text3" weight="medium" element="span">Moved to {FEEDBACK_STAGE_LABELS[m.stage]}</Text>
                  <Text type="text3" color="secondary" element="span">{new Date(m.movedAt).toLocaleDateString()}</Text>
                </div>
                <Text type="text3" element="div" ellipsis={false} className="notif-mention-body">{m.title}</Text>
                {m.note && (
                  <Text type="text3" color="secondary" element="div" ellipsis={false} className="notif-mention-body">“{m.note}”</Text>
                )}
                <Link to="/updates/requests" className="activity-subject" onClick={() => openMoved(m)}>Open the tracker</Link>
              </li>
            ))}
          </ul>
        )}

        {items.length === 0 && moved.length === 0 && (
          <Text type="text3" color="secondary" element="p" ellipsis={false} className="notif-panel-note">
            Nothing for you yet. You will hear here when a task is assigned to you or runs late,
            when somebody names you in a comment, when a job you watch moves, and when working
            drawings change. Choose the channels in <Link to="/settings">Settings</Link>.
          </Text>
        )}

        {items.length > 0 && (
          <ul className="notif-mentions">
            {items.map(n => (
              <li key={n.id} className={n.readAt === null ? "is-unread" : undefined}>
                <div className="notif-mention-head">
                  <Text type="text3" weight="medium" element="span">{n.title}</Text>
                  <Text type="text3" color="secondary" element="span">{new Date(n.createdAt).toLocaleDateString()}</Text>
                </div>
                {n.body && (
                  <Text type="text3" element="div" ellipsis={false} className="notif-mention-body">{n.body}</Text>
                )}
                {n.href ? (
                  <Link to={n.href} className="activity-subject" onClick={() => openOne(n)}>
                    {n.jobId ?? (n.projectId != null ? `Project ${n.projectId}` : "Open")}
                  </Link>
                ) : n.readAt === null ? (
                  <button type="button" className="link-button" onClick={() => openOne(n)}>Mark read</button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </DialogContentContainer>
  );

  return (
    <span className="notif-bell">
      <Dialog open={open} onClickOutside={close} content={content} position="bottom-end" showTrigger={[]} hideTrigger={[]}>
        <Tooltip content={waiting > 0 ? `${waiting} unread` : "Notifications"} position="bottom">
          <button
            type="button"
            className="notif-bell-trigger"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={waiting > 0 ? `Notifications, ${waiting} unread` : "Notifications"}
            onClick={() => setOpen(o => !o)}
            onKeyDown={e => { if (e.key === "Escape") close(); }}
          >
            <Notifications size={20} aria-hidden />
            {waiting > 0 && <span className="notif-badge" aria-hidden>{waiting > 9 ? "9+" : waiting}</span>}
          </button>
        </Tooltip>
      </Dialog>
    </span>
  );
}
