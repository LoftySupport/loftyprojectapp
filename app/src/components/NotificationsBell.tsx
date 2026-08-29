import { useState } from "react";
import { Link } from "react-router";
import { Dialog, DialogContentContainer, Text } from "@vibe/core";
import { Notifications } from "@vibe/icons";
import { Tooltip } from "@vibe/tooltip";
import { useQuery, useRepository } from "../data/DataProvider";
import type { MentionEntry } from "../data/types";
import "./ui.css";

/**
 * The header bell (Amber's Q4: notifications land in-app — dashboard surfaces and this
 * bell — this phase; Teams and email later).
 *
 * The panel is the shape the prototype settled — a list under the header, one row per
 * signal.
 *
 * **One of the seven is real now.** `comment_mentions` has been built and empty since
 * Phase A, and a mention is the one signal this app can deliver honestly today: it
 * needs no health calculation, no SLA and no derivation, because somebody chose to
 * write your name. So mentions are listed, unread first, and the badge counts them.
 *
 * The other six still have no model behind them — no triggers, no read state — so they
 * remain named rather than shown, each honestly marked. The badge counts only what is
 * real: with no unread mentions there is no badge at all, because a 0 would be a claim
 * that the system is watching six things it is not.
 */

const COMING_SIGNALS: { name: string; when: string }[] = [
  { name: "Overdue", when: "a job of yours is past its stage's expected days" },
  { name: "At risk", when: "a job enters its at-risk lead window (set per stage in Setup → Automations)" },
  { name: "Waiting on", when: "a variation on your job is waiting on a response" },
  { name: "Blocked", when: "a task dependency on your job has not cleared" },
  { name: "Handover", when: "a job is heading to your team" },
  { name: "Ownership", when: "two teams are editing the same job" }
];

/** Where a mention happened, so the row is a link rather than a note. */
function recordOf(m: MentionEntry): { label: string; href: string } | null {
  if (m.jobId) return { label: m.jobId, href: `/jobs/${encodeURIComponent(m.jobId)}` };
  if (m.projectId != null) return { label: `Project ${m.projectId}`, href: `/projects/${m.projectId}` };
  return null;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const repo = useRepository();
  const [reload, setReload] = useState(0);
  const { data: mentions } = useQuery<MentionEntry[]>(r => r.listMyMentions(), [], [reload]);
  const unread = mentions.filter(m => m.readAt === null);

  /** Opening the record marks it read — following the link IS having seen it. */
  const openMention = (m: MentionEntry) => {
    close();
    if (m.readAt === null) {
      void repo.markMentionRead(m.commentId).then(() => setReload(k => k + 1)).catch(() => {});
    }
  };

  const content = (
    <DialogContentContainer>
      <div className="notif-panel">
        <div className="notif-panel-head">
          <Text type="text2" weight="bold">Notifications</Text>
          {unread.length > 0 && (
            <Text type="text3" color="secondary">{unread.length} unread</Text>
          )}
        </div>

        {mentions.length === 0 && (
          <Text type="text3" color="secondary" element="p" ellipsis={false} className="notif-panel-note">
            Nobody has mentioned you yet. Type <strong>@</strong> in any comment to name
            somebody — they get it here.
          </Text>
        )}

        {mentions.length > 0 && (
          <ul className="notif-mentions">
            {mentions.map(m => {
              const where = recordOf(m);
              return (
                <li key={m.commentId} className={m.readAt === null ? "is-unread" : undefined}>
                  <div className="notif-mention-head">
                    <Text type="text3" weight="medium" element="span">
                      {m.authorName ?? "Somebody"}
                    </Text>
                    <Text type="text3" color="secondary" element="span">
                      {new Date(m.at).toLocaleDateString()}
                    </Text>
                  </div>
                  {/* What was said, not "you were mentioned" — the point of a mention
                      is usually answerable without opening anything. */}
                  <Text type="text3" element="div" ellipsis={false} className="notif-mention-body">
                    {m.body}
                  </Text>
                  {where && (
                    <Link to={where.href} className="activity-subject" onClick={() => openMention(m)}>
                      {where.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Text type="text3" color="secondary" element="p" ellipsis={false} className="notif-panel-note">
          The signals below have no model behind them yet, so nothing fires for them.
          Cancelled records never notify.
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
        <Tooltip
          content={unread.length > 0
            ? `${unread.length} unread mention${unread.length === 1 ? "" : "s"}`
            : "Notifications"}
          position="bottom"
        >
        <button
          type="button"
          className="notif-bell-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={unread.length > 0
            ? `Notifications, ${unread.length} unread`
            : "Notifications"}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => { if (e.key === "Escape") close(); }}
        >
          <Notifications size={20} aria-hidden />
          {/* Only ever a real count. No badge at zero: a 0 would claim the system is
              watching the six signals that are not built. */}
          {unread.length > 0 && (
            <span className="notif-badge" aria-hidden>{unread.length > 9 ? "9+" : unread.length}</span>
          )}
        </button>
        </Tooltip>
      </Dialog>
    </span>
  );
}
