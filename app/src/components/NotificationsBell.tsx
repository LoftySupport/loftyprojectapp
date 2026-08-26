import { useState } from "react";
import { Dialog, DialogContentContainer, Text } from "@vibe/core";
import { Notifications } from "@vibe/icons";
import "./ui.css";

/**
 * The header bell (Amber's Q4: notifications land in-app — dashboard surfaces and this
 * bell — this phase; Teams and email later).
 *
 * The panel is the shape the prototype settled — a list under the header, one row per
 * signal — but THE MODEL BEHIND IT IS NOT BUILT: no notifications table, no triggers,
 * no read state. So there is no badge (an invented count is worse than none) and the
 * rows name the signals that will fire, each one honestly marked. The seven types are
 * the same seven the Settings matrix already lists, minus the ones the lifecycle
 * revision rules out for cancelled records.
 */

const COMING_SIGNALS: { name: string; when: string }[] = [
  { name: "Overdue", when: "a job of yours is past its stage's expected days" },
  { name: "At risk", when: "a job enters its at-risk lead window (set per stage in Setup → Automations)" },
  { name: "Mentions", when: "somebody @mentions you in a comment" },
  { name: "Waiting on", when: "a variation on your job is waiting on a response" },
  { name: "Blocked", when: "a task dependency on your job has not cleared" },
  { name: "Handover", when: "a job is heading to your team" },
  { name: "Ownership", when: "two teams are editing the same job" }
];

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const content = (
    <DialogContentContainer>
      <div className="notif-panel">
        <div className="notif-panel-head">
          <Text type="text2" weight="bold">Notifications</Text>
          <Text type="text3" color="secondary">coming soon</Text>
        </div>
        <Text type="text3" color="secondary" element="p" ellipsis={false} className="notif-panel-note">
          Nothing fires yet — the signals below will appear here (and on the dashboard)
          once the notification model is built. Cancelled records never notify.
        </Text>
        <ul className="notif-signal-list">
          {COMING_SIGNALS.map(s => (
            <li key={s.name}>
              <Text type="text2" weight="medium" element="span">{s.name}</Text>{" "}
              <Text type="text3" color="secondary" element="span" ellipsis={false}>
                — when {s.when}
              </Text>
            </li>
          ))}
        </ul>
      </div>
    </DialogContentContainer>
  );

  return (
    <span className="notif-bell">
      <Dialog
        open={open}
        onClickOutside={close}
        content={content}
        position="bottom-end"
        showTrigger={[]}
        hideTrigger={[]}
      >
        <button
          type="button"
          className="notif-bell-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Notifications (coming soon)"
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => { if (e.key === "Escape") close(); }}
        >
          {/* No badge on purpose: there is no real count to show, and 0 would be a
              claim the system is watching when it is not yet. */}
          <Notifications size={20} aria-hidden />
        </button>
      </Dialog>
    </span>
  );
}
