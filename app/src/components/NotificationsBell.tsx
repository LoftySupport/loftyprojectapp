import { useState } from "react";
import { Link } from "react-router";
import { Dialog, DialogContentContainer, Text } from "@vibe/core";
import { Notifications } from "@vibe/icons";
import { Tooltip } from "@vibe/tooltip";
import { useQuery, useRepository } from "../data/DataProvider";
import { FEEDBACK_STAGE_LABELS, type MentionEntry, type MovedRequest } from "../data/types";
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
 * **A second one is real since 0065**: a request you follow has moved along the tracker.
 * It passes the same test — no health model, no SLA, nothing derived from a definition
 * nobody has written: somebody moved it, and the move already carries a timestamp. Voting
 * and reporting subscribe you by trigger, so most people receive this without ever having
 * pressed a follow button, which is the behaviour Canny's portal has and the reason the
 * loop closes at all.
 *
 * The six named below still have no model behind them — no triggers, no read state — so
 * they remain named rather than shown, each honestly marked. The badge counts only what
 * is real: with nothing unread there is no badge at all, because a 0 would be a claim
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

  /**
   * The second real signal (0065): a request you follow has moved.
   *
   * It qualifies on the same test the mention did — no health model, no SLA, no
   * derivation from something nobody has defined. Somebody moved it, and the move has a
   * timestamp the database already keeps. Voting and reporting follow you automatically,
   * so most people get this without ever pressing anything.
   */
  const { data: moved } = useQuery<MovedRequest[]>(r => r.listMyMovedRequests(), [], [reload]);

  /** Opening the request marks it seen, the same rule the mention rows follow. */
  const openMoved = (m: MovedRequest) => {
    close();
    void repo.markMoveSeen(m.id).then(() => setReload(k => k + 1)).catch(() => {});
  };

  /** Opening the record marks it read — following the link IS having seen it. */
  const openMention = (m: MentionEntry) => {
    close();
    if (m.readAt === null) {
      void repo.markMentionRead(m.commentId).then(() => setReload(k => k + 1)).catch(() => {});
    }
  };

  /**
   * What the badge counts: unread mentions plus requests that moved.
   *
   * Still only real things. The six unbuilt signals are named in the panel and counted
   * nowhere — a 0 that included them would be a claim the app is watching them.
   */
  const waiting = unread.length + moved.length;

  const content = (
    <DialogContentContainer>
      <div className="notif-panel">
        <div className="notif-panel-head">
          <Text type="text2" weight="bold">Notifications</Text>
          {unread.length + moved.length > 0 && (
            <Text type="text3" color="secondary">{unread.length + moved.length} unread</Text>
          )}
        </div>

        {/* Requests first, and deliberately: a person who came to the bell after voting
            for something is here about that, and a mention is a conversation they are
            already in. */}
        {moved.length > 0 && (
          <ul className="notif-mentions">
            {moved.map(m => (
              <li key={m.id} className="is-unread">
                <div className="notif-mention-head">
                  <Text type="text3" weight="medium" element="span">
                    Moved to {FEEDBACK_STAGE_LABELS[m.stage]}
                  </Text>
                  <Text type="text3" color="secondary" element="span">
                    {new Date(m.movedAt).toLocaleDateString()}
                  </Text>
                </div>
                <Text type="text3" element="div" ellipsis={false} className="notif-mention-body">
                  {m.title}
                </Text>
                {/* The note whoever moved it left. Shown because "Planned" on its own
                    answers when, not why, and why is what stops the follow-up question. */}
                {m.note && (
                  <Text type="text3" color="secondary" element="div" ellipsis={false}
                        className="notif-mention-body">
                    “{m.note}”
                  </Text>
                )}
                <Link to="/updates/requests" className="activity-subject" onClick={() => openMoved(m)}>
                  Open the tracker
                </Link>
              </li>
            ))}
          </ul>
        )}

        {mentions.length === 0 && moved.length === 0 && (
          <Text type="text3" color="secondary" element="p" ellipsis={false} className="notif-panel-note">
            Nothing for you yet. Type <strong>@</strong> in any comment to name somebody —
            they get it here — and anything you vote for in the tracker tells you when it
            moves.
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
          content={waiting > 0
            ? `${waiting} unread`
            : "Notifications"}
          position="bottom"
        >
        <button
          type="button"
          className="notif-bell-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={waiting > 0
            ? `Notifications, ${waiting} unread`
            : "Notifications"}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => { if (e.key === "Escape") close(); }}
        >
          <Notifications size={20} aria-hidden />
          {/* Only ever a real count. No badge at zero: a 0 would claim the system is
              watching the six signals that are not built. */}
          {waiting > 0 && (
            <span className="notif-badge" aria-hidden>{waiting > 9 ? "9+" : waiting}</span>
          )}
        </button>
        </Tooltip>
      </Dialog>
    </span>
  );
}
