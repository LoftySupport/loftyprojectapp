import { useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Problem } from "./Form";
import { Token } from "./Token";
import { FEEDBACK_STAGE_LABELS, type CommentEntry } from "../data/types";
import "./ui.css";
import { CollapsiblePanel } from "./CollapsiblePanel";

/**
 * The comment thread on one record, and the composer that adds to it.
 *
 * Amber, 25 August: "Latest update (comment that appears on the comments thread on the
 * project activity)". So the latest update is not a column — it is the newest comment,
 * shown first, and posting a new one replaces it by arriving above it. One mechanism,
 * not a field and a feed that could disagree.
 *
 * The author's name comes resolved from the read; the author on a write is stamped by
 * the database from the session, which is the only version a client cannot forge. An
 * edited comment says so — `editedAt` is set by a trigger only when the body changes.
 *
 * Comments and activity events are different things on purpose (user-authored and
 * mutable vs append-only), so this panel does not merge them. The job timeline view in
 * the database reads both as one stream; a screen that wants that asks for it there.
 */
export function CommentsPanel({
  projectId, jobId, feedbackId, title = "Latest update"
}: {
  projectId?: number;
  jobId?: string;
  /**
   * A tracker request (0064's fifth parent on `comments`).
   *
   * The tracker gets this panel rather than a thread of its own, and the reuse is the
   * point: @mentions, the picker, the edited marker and the bell all already work here,
   * and a second thread component would have to grow every one of them again. What the
   * tracker adds is standing — a pinned answer and an internal lane — which is two
   * badges and one admin control, not a second component.
   */
  feedbackId?: string;
  title?: string;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const { data: comments, loading, error } = useQuery(
    r => r.listComments({ projectId, jobId, feedbackId }),
    [],
    [reload, projectId, jobId, feedbackId]
  );

  const [draft, setDraft] = useState("");
  /** Admin-only, and offered only on a request: the team's own lane (0064). */
  const [internal, setInternal] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  /**
   * @mentions.
   *
   * The ids are collected as people are picked, not parsed back out of the text when
   * the comment is sent. Parsing prose finds the wrong Sarah eventually, and two people
   * here share a surname — but a name typed by hand that happens to match is not a
   * mention either, because nobody chose it.
   *
   * What IS re-checked at send time is whether each picked name is still in the text:
   * type a name, change your mind, delete it, and nobody is notified about a sentence
   * that no longer says their name.
   */
  const { data: people } = useQuery(r => r.listProfiles(), []);
  const [picked, setPicked] = useState<{ id: string; name: string }[]>([]);

  /** The "@…" being typed at the caret, if any. Null when the box is not in a mention. */
  const typing = /(?:^|\s)@([\p{L}' -]*)$/u.exec(draft)?.[1] ?? null;
  const matches = typing === null
    ? []
    : people
        .filter(p => p.active && p.fullName.toLowerCase().includes(typing.trim().toLowerCase()))
        .slice(0, 6);

  const insertMention = (id: string, name: string) => {
    setDraft(d => d.replace(/(?:^|\s)@([\p{L}' -]*)$/u, m => (m.startsWith(" ") ? " " : "") + `@${name} `));
    setPicked(prev => (prev.some(p => p.id === id) ? prev : [...prev, { id, name }]));
  };

  async function post() {
    if (!draft.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      // Only the people whose names survived the edit.
      const mentions = picked.filter(p => draft.includes(`@${p.name}`)).map(p => p.id);
      await repo.addComment({ projectId, jobId, feedbackId }, draft, mentions,
        internal ? { internal: true } : undefined);
      setDraft("");
      setPicked([]);
      setInternal(false);
      setReload(k => k + 1);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  const [latest, ...earlier] = comments;

  return (
    <CollapsiblePanel
      id="job-comments"
      title={title}
      defaultOpen={false}
      summary={comments.length > 1 ? <>{comments.length} updates</> : undefined}
    >

      {/* The composer first: "add the latest update" is the action this panel is for,
          and it should not sit under a long thread. `user` and above is the insert
          policy on comments; RLS is what actually decides. */}
      {can("user") && (
        <div className="comment-composer">
          <TextField
            size="small"
            id={`comment-draft-${projectId ?? jobId}`}
            inputAriaLabel="Write an update"
            value={draft}
            onChange={v => setDraft(v)}
            onKeyDown={e => {
              if (e.key === "Enter" && draft.trim()) post();
            }}
          />
          <Button size="small" onClick={post} disabled={posting || !draft.trim()}>
            {posting ? "Posting…" : "Post"}
          </Button>
        </div>
      )}

      {/* Only on a request, and only for admins — the insert trigger refuses it below
          that rung, so offering the tick to anybody else would be offering a control
          that always fails. */}
      {feedbackId && can("admin") && (
        <label className="comment-internal">
          <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
          <Text type="text3" color="secondary" element="span" ellipsis={false}>
            Only admins can see this — for triage talk, not for the person who asked.
          </Text>
        </label>
      )}

      {/* The picker, under the box, while an "@" is being typed. A list rather than a
          dropdown: it is six names at most, and a dropdown would cover the comment
          being written. */}
      {can("user") && matches.length > 0 && (
        <div className="mention-picker" role="listbox" aria-label="Mention somebody">
          {matches.map(p => (
            <button type="button" key={p.id} role="option" aria-selected={false}
              onClick={() => insertMention(p.id, p.fullName)}>
              {p.fullName}
              {p.jobTitle && (
                <Text type="text3" color="secondary" element="span"> · {p.jobTitle}</Text>
              )}
            </button>
          ))}
        </div>
      )}
      {can("user") && picked.filter(p => draft.includes(`@${p.name}`)).length > 0 && (
        <Text type="text3" color="secondary" element="p" ellipsis={false}>
          Will notify {picked.filter(p => draft.includes(`@${p.name}`)).map(p => p.name).join(", ")}.
        </Text>
      )}
      {postError && <Problem>{postError}</Problem>}

      {error && (
        <Text type="text3" color="secondary" ellipsis={false}>
          Could not load updates: {error.message}
        </Text>
      )}

      {!loading && !error && comments.length === 0 && (
        <Text type="text3" color="secondary" ellipsis={false}>
          No updates yet. The newest comment posted here becomes the record’s latest update.
        </Text>
      )}

      {latest && (
        <div className="comment latest">
          <div className="comment-meta">
            <Text type="text3" weight="medium">
              {latest.authorName ?? <Token>profiles.full_name</Token>}
            </Text>
            <Text type="text3" color="secondary">
              {new Date(latest.createdAt).toLocaleString()}
              {latest.editedAt && " · edited"}
            </Text>
            <Standing comment={latest} canPin={Boolean(feedbackId) && can("admin")}
                      onChanged={() => setReload(k => k + 1)} />
          </div>
          <Text type="text2" ellipsis={false}>{latest.body}</Text>
        </div>
      )}

      {earlier.map(c => (
        <div className="comment" key={c.id}>
          <div className="comment-meta">
            <Text type="text3" weight="medium">
              {c.authorName ?? <Token>profiles.full_name</Token>}
            </Text>
            <Text type="text3" color="secondary">
              {new Date(c.createdAt).toLocaleString()}
              {c.editedAt && " · edited"}
            </Text>
            <Standing comment={c} canPin={Boolean(feedbackId) && can("admin")}
                      onChanged={() => setReload(k => k + 1)} />
          </div>
          <Text type="text3" ellipsis={false}>{c.body}</Text>
        </div>
      ))}
    </CollapsiblePanel>
  );
}

/**
 * What a comment is, beyond its words: the official answer, the team's private lane, or
 * the note that came with a stage change.
 *
 * The badges are text and not colour alone — "Internal" has to be unmissable, because the
 * cost of misreading it is somebody writing "we could fake this in an hour" where the
 * person who asked can read it. An internal comment a viewer cannot read never reaches
 * this component at all: the read policy filters it, and this badge is for the admins who
 * can see it.
 */
function Standing({
  comment, canPin, onChanged
}: {
  comment: CommentEntry;
  canPin: boolean;
  onChanged: () => void;
}) {
  const repo = useRepository();
  const [busy, setBusy] = useState(false);

  const set = async (pinned: boolean) => {
    setBusy(true);
    try {
      await repo.setCommentStanding(comment.id, { pinned });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {comment.isPinned && <span className="comment-badge is-pinned">Pinned</span>}
      {comment.isInternal && <span className="comment-badge is-internal">Internal</span>}
      {comment.stageAnnounced && (
        <span className="comment-badge">Moved to {FEEDBACK_STAGE_LABELS[comment.stageAnnounced]}</span>
      )}
      {canPin && (
        <button type="button" className="link-button" disabled={busy}
                onClick={() => void set(!comment.isPinned)}>
          {comment.isPinned ? "Unpin" : "Pin"}
        </button>
      )}
    </>
  );
}
