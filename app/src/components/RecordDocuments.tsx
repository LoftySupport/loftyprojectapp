import { Link } from "react-router-dom";
import { Text } from "@vibe/core";
import { useQuery } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { LoadProblem } from "./SearchNotices";
import "./ui.css";
import { CollapsiblePanel } from "./CollapsiblePanel";

/**
 * The documents about one job or one project, on that record's own screen.
 *
 * Amber, 4 September: *"all documents need to be associated to a job or project and they
 * are listed on that project"*. This is the second half of that sentence, and it is what
 * makes a document reachable at all — the Document Builder shows three ways to START one
 * and no list, deliberately, because the list belongs here.
 *
 * IT LINKS RATHER THAN OPENING. A row goes to `/tools/document-builder?open=<id>`, which
 * is the builder with that document open. The alternative was to mount the builder here,
 * and the builder needs an engine, a theme set, a store and a resolved context — ninety
 * lines of setup with a recursion guard and two memoisation decisions in it. Duplicating
 * that into the job drawer would mean two copies of the thing that decides what a report
 * can see, which is the wrong thing in the app to have two of.
 *
 * NO COUNT WHEN THERE ARE NONE. An empty list renders one sentence rather than a heading
 * over nothing, because a job with no documents is the ordinary case and does not need a
 * section shouting about it.
 */
export function RecordDocuments({
  jobId,
  projectId
}: {
  /** Exactly one of these. A document is about a job or about a project, never both. */
  jobId?: string | null;
  projectId?: number | null;
}) {
  const { can } = usePermission();
  const { data: documents, loading, error } = useQuery(
    r => (jobId
      ? r.listReportDocuments({ jobId })
      : projectId != null
        ? r.listReportDocuments({ projectId })
        : Promise.resolve([])),
    [],
    [jobId, projectId]
  );

  if (loading) return null;

  return (
    <CollapsiblePanel id="job-documents" title="Documents" defaultOpen={false}>
      {/* The link is in the BODY, not the heading. The heading is a <button> now, and a
          <Link> inside a <button> is invalid HTML — the nested interactive element is
          unreachable by keyboard and browsers disagree about which one a click hits.
          Nothing is lost: you open a section before you act on it. */}
      {can("user") && (
        <div className="panel-actions">
          <Link to="/tools/document-builder"><Text type="text3">New document</Text></Link>
        </div>
      )}

      {error && <LoadProblem error={error} />}

      {documents.length === 0 ? (
        <Text type="text3" color="secondary" ellipsis={false}>
          Nothing has been written about this one yet. A progress report, a client letter,
          a maintenance report — they are made in the Document Builder and appear here.
        </Text>
      ) : (
        <ul className="record-documents">
          {documents.map(d => (
            <li key={d.id}>
              <Link to={`/tools/document-builder?open=${encodeURIComponent(d.id)}`}>
                {d.title}
              </Link>
              {/* A shared document is the thing somebody outside Lofty can see, so it is
                  worth saying on the row rather than only inside the builder. */}
              {d.shareToken && (
                <span className="record-documents-note">shared</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsiblePanel>
  );
}
