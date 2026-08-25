import { useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Problem } from "./Form";
import { Token } from "./Token";
import "./ui.css";

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
  projectId, jobId, title = "Latest update"
}: {
  projectId?: number;
  jobId?: string;
  title?: string;
}) {
  const repo = useRepository();
  const { can } = usePermission();
  const [reload, setReload] = useState(0);
  const { data: comments, loading, error } = useQuery(
    r => r.listComments({ projectId, jobId }),
    [],
    [reload, projectId, jobId]
  );

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  async function post() {
    if (!draft.trim()) return;
    setPosting(true);
    setPostError(null);
    try {
      await repo.addComment({ projectId, jobId }, draft);
      setDraft("");
      setReload(k => k + 1);
    } catch (e) {
      setPostError(e instanceof Error ? e.message : String(e));
    } finally {
      setPosting(false);
    }
  }

  const [latest, ...earlier] = comments;

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{title}</Text>
        {comments.length > 1 && (
          <Text type="text3" color="secondary">{comments.length} updates</Text>
        )}
      </div>

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
          </div>
          <Text type="text3" ellipsis={false}>{c.body}</Text>
        </div>
      ))}
    </section>
  );
}
