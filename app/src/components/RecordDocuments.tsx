import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { DOCUMENT_CATEGORIES, type DocumentCategory, type RecordDocument } from "../data/types";
import { Select } from "./Select";
import { LoadProblem } from "./SearchNotices";
import { Problem } from "./Form";
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
 * TWO KINDS IN ONE LIST, and that is the point of this panel rather than two.
 *
 *   **Built** — a row in `report_documents`, made block by block in the Document Builder.
 *   A progress report, a client letter. Editable, exportable, shareable by link.
 *
 *   **Filed** — a row in 0032's `documents`, attached here by a `document_links` row.
 *   Amber, 10 September: *"when adding a document I need to be able to save it as a url
 *   in sharepoint (integration coming) but for now I need to be able to add and delete
 *   them"*, which 0102 made possible by giving `documents` a URL. The contract, the
 *   survey, the engineer's certificate — things that already exist and that nobody is
 *   going to rebuild in a block editor to make findable.
 *
 * "Which documents are on this job" is one question, so it gets one list. The two are kept
 * apart by what the row DOES rather than by a badge: a built document routes into the app,
 * a filed one opens where it lives, in a new tab.
 *
 * REMOVE TAKES IT OFF THIS RECORD, and the confirmation says so in those words. 0032:
 * *"detaching is not deleting: the link goes, the file stays"* — the same contract may be
 * filed on the project and on three of its jobs, and taking it off one must not remove it
 * from the others. Nothing in SharePoint is touched either way.
 *
 * THE APP NEVER FETCHES A FILED DOCUMENT. The row is a pointer; the file is behind
 * SharePoint under Microsoft's own permissions. Somebody who opens a link they should not
 * have gets SharePoint's refusal, not the document — which also means filing a link is
 * not a way of sharing something, and the panel does not pretend otherwise.
 *
 * IT LINKS RATHER THAN OPENING. A built row goes to `/tools/document-builder?open=<id>`,
 * which is the builder with that document open. The alternative was to mount the builder
 * here, and the builder needs an engine, a theme set, a store and a resolved context —
 * ninety lines of setup with a recursion guard and two memoisation decisions in it.
 * Duplicating that into the job drawer would mean two copies of the thing that decides
 * what a report can see, which is the wrong thing in the app to have two of.
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
  const repo = useRepository();
  const [reload, setReload] = useState(0);

  const { data: documents, loading, error } = useQuery(
    r => (jobId
      ? r.listReportDocuments({ jobId })
      : projectId != null
        ? r.listReportDocuments({ projectId })
        : Promise.resolve([])),
    [],
    [jobId, projectId, reload]
  );

  const { data: filed, error: filedError } = useQuery(
    r => r.listRecordDocuments({ jobId: jobId ?? undefined, projectId: projectId ?? undefined }),
    [] as RecordDocument[],
    [jobId, projectId, reload]
  );

  // The add form is closed until asked for. Filing a link is occasional — most visits to
  // this panel are to read it — and two text fields sitting open under every empty list
  // would make "nothing here yet" look like a form somebody failed to fill in.
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  // 0032's vocabulary, and its default. Offered because the column exists with its values
  // already decided — not a facet invented for this panel.
  const [category, setCategory] = useState<DocumentCategory>("other");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Which row is asking "are you sure" — id, or null. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const total = documents.length + filed.length;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
      setReload(n => n + 1);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const add = () =>
    run(async () => {
      await repo.addDocumentUrl({
        name: title,
        url,
        category,
        jobId: jobId ?? null,
        projectId: jobId ? null : projectId ?? null
      });
      setTitle("");
      setUrl("");
      setCategory("other");
      setAdding(false);
    });

  if (loading) return null;

  return (
    <CollapsiblePanel
      id="job-documents"
      title="Documents"
      summary={total > 0 ? `${total} ${total === 1 ? "document" : "documents"}` : undefined}
      defaultOpen={false}
    >
      {/* The links are in the BODY, not the heading. The heading is a <button> now, and a
          <Link> inside a <button> is invalid HTML — the nested interactive element is
          unreachable by keyboard and browsers disagree about which one a click hits.
          Nothing is lost: you open a section before you act on it. */}
      {can("user") && (
        <div className="panel-actions">
          {/* The record travels with the link. Without it you land on the builder and
              have to find this same job or project again in a list of every one of
              them — which is how 117 projects ended up with no documents between
              them (see subjectOptions in TemplateBuilderPage). */}
          <Link
            to={`/tools/document-builder?for=${encodeURIComponent(
              jobId ? `job:${jobId}` : `project:${projectId}`
            )}`}
          >
            <Text type="text3">New document</Text>
          </Link>
          <Button
            size="xs"
            kind="tertiary"
            onClick={() => { setAdding(a => !a); setProblem(null); }}
            aria-expanded={adding}
          >
            {adding ? "Cancel" : "Link a document"}
          </Button>
        </div>
      )}

      {error && <LoadProblem error={error} />}
      {filedError && <LoadProblem error={filedError} />}
      {problem && <Problem>{problem}</Problem>}

      {adding && (
        <div className="doc-link-add">
          <TextField
            id="doc-link-title"
            title="Name"
            placeholder="Development approval"
            value={title}
            onChange={setTitle}
            size="small"
            inputAriaLabel="Document name"
          />
          <TextField
            id="doc-link-url"
            title="Link"
            placeholder="https://lofty.sharepoint.com/…"
            value={url}
            onChange={setUrl}
            size="small"
            inputAriaLabel="Link to the document"
          />
          <Select
            aria-label="What kind of document"
            placeholder="Kind…"
            value={category}
            onChange={v => setCategory((v as DocumentCategory) ?? "other")}
            options={DOCUMENT_CATEGORIES.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))}
          />
          <Button size="small" disabled={busy || !title.trim() || !url.trim()} onClick={add}>
            Save
          </Button>
          {/* Said once, here, rather than as a note under every row: what this app stores
              is the address, and who may open it is SharePoint's decision. */}
          <Text type="text3" color="secondary" element="p" ellipsis={false} className="doc-link-hint">
            Open the document in SharePoint, copy the address from the browser bar, and
            paste it here. Lofty Hub stores the link only — who can open the file stays
            SharePoint's decision, and a proper integration is still to come.
          </Text>
        </div>
      )}

      {total === 0 ? (
        <Text type="text3" color="secondary" ellipsis={false}>
          Nothing has been filed against this one yet. A progress report or client letter is
          made in the Document Builder; anything already in SharePoint can be linked here.
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

          {filed.map(d => (
            <li key={d.linkId}>
              {/* Three states, and only one of them is a link (0032). A document Lofty
                  holds the bytes for has no viewer built yet, and one that has not arrived
                  has nowhere to go at all — so those render as text rather than as an
                  anchor that does nothing when clicked. */}
              {d.url ? (
                // noreferrer noopener on every one: these point at a tenant somebody else
                // administers, and `window.opener` is a way back into this tab.
                <a href={d.url} target="_blank" rel="noreferrer noopener">{d.name}</a>
              ) : (
                <span className="record-documents-link">{d.name}</span>
              )}
              <span className="record-documents-note">
                {d.url ? "sharepoint" : d.storagePath ? "uploaded" : "not received"}
              </span>

              {can("user") && (
                confirming === d.linkId ? (
                  <span className="record-documents-confirm">
                    {/* Two clicks, not a window.confirm: the drawer is a side panel and a
                        browser dialog steals focus out of it. The line says what removing
                        does NOT do, because "remove" beside a document reads as though the
                        file itself is going. */}
                    <Text type="text3" color="secondary" element="span">
                      Take it off this {jobId ? "job" : "project"}? The document stays where it is.
                    </Text>
                    <Button
                      size="xs"
                      kind="tertiary"
                      disabled={busy}
                      onClick={() => run(async () => {
                        await repo.removeRecordDocument(d.linkId);
                        setConfirming(null);
                      })}
                    >
                      Remove
                    </Button>
                    <Button size="xs" kind="tertiary" onClick={() => setConfirming(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="xs"
                    kind="tertiary"
                    disabled={busy}
                    aria-label={`Remove ${d.name} from this record`}
                    onClick={() => { setConfirming(d.linkId); setProblem(null); }}
                  >
                    Remove
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
      )}
    </CollapsiblePanel>
  );
}
