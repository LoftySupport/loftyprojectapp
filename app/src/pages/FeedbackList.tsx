import { useState } from "react";
import { Text } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { Select } from "../components/Select";
import { Problem } from "../components/Form";
import { LoadProblem } from "../components/SearchNotices";
import { FEEDBACK_STATUSES, type FeedbackKind, type FeedbackStatus } from "../data/types";
import "../components/ui.css";

/**
 * What people have reported — one tab per kind (0052).
 *
 * Admin and above only, and that is the database's answer rather than this screen's:
 * the SELECT policy admits `current_permission() >= 'admin'`, so a manager who typed
 * the URL gets an empty list from Supabase, not a list this component chose to hide.
 * The tab is not offered below admin either, but that part is only tidiness.
 *
 * The status control is the point of the screen. Amber's reason for the whole feature
 * was *"this way I can track what needs to be implemented"* — a list you cannot mark up
 * has to be re-read from the top every week to work out what is left.
 *
 * There is no delete. `declined` says a report was read and is not being actioned,
 * which is a different and more useful fact than the report never existing.
 */

const STATUS_OPTIONS = FEEDBACK_STATUSES.map(s => ({ value: s, label: s }));

export function FeedbackList({ kind }: { kind: FeedbackKind }) {
  const repo = useRepository();
  const [reloadKey, setReloadKey] = useState(0);
  const { data: items, loading, error } = useQuery(r => r.listFeedback(kind), [], [kind, reloadKey]);
  const [saving, setSaving] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const setStatus = async (id: string, status: FeedbackStatus) => {
    setSaving(id);
    setProblem(null);
    try {
      await repo.setFeedbackStatus(id, status);
      setReloadKey(k => k + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{kind === "bug" ? "Bugs" : "Ideas"}</Text>
        <Text type="text3" color="secondary">
          {items.length} {items.length === 1 ? "report" : "reports"}
        </Text>
      </div>
      <Text type="text2" color="secondary" ellipsis={false}>
        Sent from the footer by anyone signed in. Only admins see this list — the sender
        cannot read their own report back, so if something needs a conversation, the
        name beside it is who to go to.
      </Text>

      {error && <LoadProblem error={error} />}
      {problem && <Problem>{problem}</Problem>}

      {!loading && items.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}
              style={{ marginTop: "var(--space-12)" }}>
          {/* An empty list is empty, not "no results found" — nobody has sent one yet. */}
          Nothing reported yet.
        </Text>
      )}

      {items.length > 0 && (
        <div className="data-table-wrap" style={{ marginTop: "var(--space-12)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col">From</th>
                <th scope="col">Where</th>
                <th scope="col">Sent</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(f => (
                <tr key={f.id}>
                  <td>
                    <Text type="text2" weight="medium" element="div" ellipsis={false}>{f.title}</Text>
                    {f.detail && (
                      <Text type="text3" color="secondary" element="div" ellipsis={false}>
                        {f.detail}
                      </Text>
                    )}
                  </td>
                  {/* An em dash, not "Unknown": the profile is gone, and naming somebody
                      would be a claim about who sent it. */}
                  <td><Text type="text2">{f.fromName ?? "—"}</Text></td>
                  <td><span className="dict-type">{f.page ?? "—"}</span></td>
                  <td><Text type="text2">{new Date(f.createdAt).toLocaleDateString()}</Text></td>
                  <td>
                    <Select
                      options={STATUS_OPTIONS}
                      value={f.status}
                      onChange={v => void setStatus(f.id, v as FeedbackStatus)}
                      aria-label={`Status for "${f.title}"`}
                      className={saving === f.id ? "is-busy" : undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
