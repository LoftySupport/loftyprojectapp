import { Text } from "@vibe/core";
import { Link } from "react-router";
import { changeSentence } from "../data/auditNarrative";
import { useQuery } from "../data/DataProvider";
import { LoadProblem } from "./SearchNotices";
import "./ui.css";
import { CappedList } from "./CappedList";

/**
 * A record's history, as the prototype drew it (Amber, 28 Aug: "projects also need to
 * have their history and project activity. I like the way it appears in the prototype
 * layout — this is neat and clean").
 *
 * One line per event: the date, then what happened. The prototype's version reads
 * `2026-05-17 — Project 1201 opened`, and that shape is the whole design — a rule down
 * the left, dates that align, and no avatars, icons or cards. A feed is scanned from
 * the top until something looks wrong; anything that slows the eye down is in the way.
 *
 * **It is not a merged timeline.** Comments are user-authored and editable, activity is
 * append-only, and mixing them means a feed where half the entries can be rewritten
 * after the fact. They sit as two panels, which is also how the prototype had it.
 *
 * Nothing is invented when the list is empty. A record whose only event was its own
 * creation says exactly that.
 */
export function ActivityFeed({
  projectId,
  jobId,
  title = "Activity"
}: {
  projectId?: number;
  jobId?: string;
  title?: string;
}) {
  const { data: entries, loading, error } = useQuery(
    r => r.listRecordActivity({ projectId, jobId }),
    [],
    [projectId, jobId]
  );

  return (
    <section className="panel">
      <div className="panel-head">
        <Text type="text2" weight="bold">{title}</Text>
        {entries.length > 0 && (
          <Text type="text3" color="secondary">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </Text>
        )}
      </div>

      {error && <LoadProblem error={error} />}

      {!loading && entries.length === 0 && (
        <Text type="text2" color="secondary" element="p" ellipsis={false}>
          Nothing recorded yet.
        </Text>
      )}

      {entries.length > 0 && (
        <ol className="activity-feed">
          <CappedList items={entries} noun="events">{e => (
            <li key={e.id}>
              {/* The date first, in the prototype's ISO form. It sorts, it is
                  unambiguous between AU and US readers, and it lines up down the
                  column — which is what makes the list scannable rather than read. */}
              <Text type="text3" color="secondary" element="span" className="activity-when">
                {e.at.slice(0, 10)}
              </Text>
              <Text type="text2" element="span" ellipsis={false}>
                {/* The subject links to the record it names (Amber, 28 August: "with
                    link to Ketan's record"). A feed that names a job and cannot take
                    you to it makes you search for what it just told you. */}
                {e.subject && (
                  // Not linked when the line is about the record you are already
                  // looking at: in a job drawer every line names that job, and forty
                  // links back to the current page are forty invitations to go nowhere.
                  e.href && e.subject !== jobId && e.subject !== String(projectId ?? "")
                    ? <Link to={e.href} className="activity-subject" onClick={ev => ev.stopPropagation()}>{e.subject}</Link>
                    : <strong>{e.subject}</strong>
                )}{" "}
                {/* What moved, and from what to what — one line per field, because two
                    changes in one save are two facts and running them together makes
                    both harder to read than either alone. */}
                {e.changes.length > 0
                  ? e.changes.map(c => (
                      <span className="activity-change" key={c.column}>{changeSentence(c)}</span>
                    ))
                  : e.summary}
                {/* Who, quietly. It is the second question, never the first. */}
                {e.who && (
                  <Text type="text3" color="secondary" element="span"> · {e.who}</Text>
                )}
              </Text>
            </li>
          )}</CappedList>
        </ol>
      )}
    </section>
  );
}
