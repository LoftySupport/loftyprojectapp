import { useCallback, useMemo, useRef, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { useAuth } from "../data/AuthProvider";
import { usePermission } from "../data/PermissionProvider";
import { useBoardRecords } from "../data/boardModel";
import { useProcesses, usePropertyDefs, usePropertyOptions, useStages, useTeams } from "../data/useLookups";
import { LoadProblem, NothingYet } from "../components/SearchNotices";
import { Problem } from "../components/Form";
import { Select, toOptions } from "../components/Select";
import { useToasts } from "../components/Toasts";
import {
  REPORT_TEMPLATE_SCOPE_LABELS,
  type ReportDocument,
  type ReportTemplate,
  type ReportTemplateKind
} from "../data/types";
import type { CompiledReport, ReportStoreRow, ReportWidget } from "../features/reports/index.js";
import {
  LOFTY_GROUPS,
  LOFTY_SEEDS,
  LOFTY_THEME,
  LOFTY_THEME_SPECS,
  LOFTY_WIDGETS,
  ReportBuilder,
  ReportOverlay,
  createDocumentStore,
  createLibraryStore,
  createReportEngine,
  createReportRegistry,
  createThemeSet,
  resolveTheme,
  helpers
} from "../features/reports/index.js";
import "../features/reports/reports.css";
import "../components/ui.css";

/**
 * Tools → Template Builder.
 *
 * The report builder from `amberbeaumont/modules → packages/report-builder`, wired to
 * Lofty's data. `src/features/reports/README.md` says what was changed on the way in;
 * this file and the three adapter files beside it are the whole of the wiring.
 *
 * THREE THINGS ON ONE SCREEN, AND THEY ARE NOT THE SAME THING
 *
 *   Documents   what somebody made and is sending. Theirs to edit.
 *   Templates   the layouts a document starts from.
 *   Sections    reusable fragments dropped into a template by the "Library section"
 *               block, and resolved live — so fixing a section fixes every template
 *               using it.
 *
 * WHY A DOCUMENT IS A COPY
 *
 *   Amber, 4 September: *"a user may take an existing template and modify it for a
 *   particular instance eg sending a letter and they need to change the wording"*. If
 *   that edit wrote back to the template, the next person would inherit one letter's
 *   wording — silently, because the template would still be called what it was called.
 *
 * WHAT A TEMPLATE STILL HOLDS
 *
 *   The question, never the answer. "The jobs table grouped by stage", "the Site Start
 *   properties for this job" — the rows are read out of the app every time it is opened.
 *   A builder that saved the rows would produce a document that looked current and was
 *   not, which is the same failure as the Reports page computing "45% on track" from a
 *   fixed array.
 *
 * WHO MAY DO WHAT
 *
 *   Everyone at `user` and above makes documents, and proposes templates and sections.
 *   A manager signs a proposal into the library. Until then it is the author's draft and
 *   literally nobody else can see it — that is the read policy in 0094, not this screen.
 *   The `can()` calls below decide which buttons render; the policies decide what the
 *   database accepts, and they are the security.
 */

// Built once at module scope. The registry is a pure description of the palette, so
// rebuilding it per render would only churn identities the memoised previews compare on.
const registry = createReportRegistry({ widgets: LOFTY_WIDGETS, groups: LOFTY_GROUPS });
const engine = createReportEngine(registry, { seeds: LOFTY_SEEDS });
const themes = createThemeSet(LOFTY_THEME_SPECS);

/** How deep a section may sit inside another before we stop expanding. */
const MAX_SECTION_DEPTH = 3;

/** What the builder is currently open on — the two stores are not interchangeable. */
type OpenTarget =
  | { lane: "document"; row: ReportStoreRow; subject: { jobId: string | null; projectId: number | null } }
  | { lane: "library"; row: ReportStoreRow; kind: ReportTemplateKind };

/**
 * One way into an empty builder.
 *
 * Amber, 4 September, with an annotated screenshot: a GET STARTED heading over dashed
 * cards, in place of the row of buttons and dropdowns this replaces. That row put three
 * buttons side by side with two dropdowns between them, and which dropdown belonged to
 * which button was a matter of reading the order — the dropdown for "Clone Existing" sat
 * next to "Start From Scratch", which does not take one.
 *
 * A card fixes that by enclosure: one act, its inputs and its button inside one border.
 *
 * `children` is the fields, `action` the button. They are separate props rather than one
 * block of children so the button can be pinned to the bottom of the tallest card — the
 * cards hold different numbers of fields, and buttons at three different heights read as
 * three unrelated controls rather than three choices.
 */
function GetStartedCard(
  { title, hint, children, action }:
  {
    title: string;
    hint: string;
    children?: React.ReactNode;
    action: React.ReactNode;
  }
) {
  return (
    <div className="get-started-card">
      <div className="get-started-card-title">
        <Text type="text2" weight="bold">{title}</Text>
      </div>
      <Text type="text3" color="secondary" ellipsis={false}>{hint}</Text>
      {children && <div className="get-started-card-fields">{children}</div>}
      <div className="get-started-card-fill" />
      {action}
    </div>
  );
}

/**
 * @param lane which of the three the URL is on. It lives in ToolsPage rather than here
 *   because it is in the path — a link to the Section Library has to be a link somebody
 *   can send, and a tab held in component state is not one.
 */
export function TemplateBuilderPage({ lane }: { lane: "documents" | "template" | "section" }) {
  const repo = useRepository();
  const { can } = usePermission();
  const { profile } = useAuth();
  const { toast } = useToasts();

  const canWrite = can("user");
  const canApprove = can("manager");
  const canDelete = can("admin");

  const [reloadKey, setReloadKey] = useState(0);
  const bump = useCallback(() => setReloadKey(k => k + 1), []);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [preview, setPreview] = useState<{ model: CompiledReport; theme: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const [docTitle, setDocTitle] = useState("");
  const [docFrom, setDocFrom] = useState<string | null>(null);
  const [libName, setLibName] = useState("");
  /** What "Clone" copies from — a document id in the builder lane, a library id otherwise. */
  const [cloneFrom, setCloneFrom] = useState<string | null>(null);
  const libKind: ReportTemplateKind = lane === "section" ? "section" : "template";
  const [busy, setBusy] = useState(false);

  // ── What is in the library, and what has been made from it ───────────────
  const { data: templates, loading: libLoading, error: libError } =
    useQuery(r => r.listReportTemplates(), [], [reloadKey]);
  const { data: documents, loading: docsLoading, error: docsError } =
    useQuery(r => r.listReportDocuments(), [], [reloadKey]);

  // ── The data every block resolves against ────────────────────────────────
  //
  // The same reads the boards use, so a report cannot disagree with the board it was
  // taken from — and already narrowed by RLS, so "every job" means every job this person
  // may see, and a restricted property they may not see never arrives at all.
  const { projects, jobs, error: recordsError } = useBoardRecords(reloadKey);
  const { teams } = useTeams();
  const { stageNames } = useStages();
  const { processes } = useProcesses();
  const { propertyDefs } = usePropertyDefs(reloadKey);
  const { options: propertyOptions } = usePropertyOptions(reloadKey);
  const { data: propertyValues } = useQuery(r => r.listPropertyValues(), [], [reloadKey]);
  const { data: people } = useQuery(r => r.listProfiles(), []);

  /** Only the sections a document may actually use: in the library, and still current. */
  const sections = useMemo(
    () => templates.filter(t => t.kind === "section" && t.approvedAt !== null && t.isActive),
    [templates]
  );
  const libraryTemplates = useMemo(
    () => templates.filter(t => t.kind === "template" && t.approvedAt !== null && t.isActive),
    [templates]
  );

  /**
   * Expanding a "Library section" block into the blocks it stands for.
   *
   * It lives here rather than in the widget because it needs the engine, and the engine
   * is not part of `ctx`. Two things it has to get right:
   *
   * - **The context it resolves against is the CURRENT one**, read through a ref. `ctx`
   *   holds this function, so a `ctx` in its closure would be last render's — the
   *   section would keep rendering the jobs the page had when it first loaded.
   * - **Depth.** A section holding a Library section block pointing at itself is an
   *   infinite loop, and it is one an author can build by accident in two clicks. The
   *   counter is a ref rather than an argument because the recursion goes back out
   *   through `engine.resolve`, which has no idea it is nested.
   */
  const ctxRef = useRef<unknown>(null);
  const depthRef = useRef(0);
  const expandSection = useCallback(
    (section: ReportTemplate, h: { forExport: boolean }) => {
      if (depthRef.current >= MAX_SECTION_DEPTH) {
        return [helpers.warn(
          `“${section.name}” is nested inside itself, or more than ${MAX_SECTION_DEPTH} sections deep. It stops here.`
        )];
      }
      depthRef.current += 1;
      try {
        return (section.layout?.widgets ?? []).flatMap(w =>
          engine.resolve(w as ReportWidget, ctxRef.current, { forExport: h.forExport })
        );
      } finally {
        depthRef.current -= 1;
      }
    },
    []
  );

  /** What the open document is about, so "the record this document is about" has an answer. */
  const subject = open?.lane === "document" ? open.subject : null;

  // Memoised, and it is not an optimisation: a fresh `ctx` identity re-resolves every
  // block on every render, which makes typing in a text block feel broken.
  const ctx = useMemo(
    () => ({
      projects, jobs, teams, stageNames, people, processes,
      propertyDefs, propertyValues, propertyOptions,
      sections, expandSection,
      subject
    }),
    [projects, jobs, teams, stageNames, people, processes,
     propertyDefs, propertyValues, propertyOptions, sections, expandSection, subject]
  );
  ctxRef.current = ctx;

  /**
   * Compile a stored document into the snapshot a share link serves.
   *
   * This is what makes a shared link safe to hand a client: it runs HERE, in the signed-in
   * person's browser, so every block resolves through the ctx their own RLS produced. The
   * endpoint that serves the link never queries anything, so it has no filter to forget
   * (0095).
   *
   * `forExport` is implied by engine.compile, which is the same call Preview & Export
   * makes — so a half-finished block renders as nothing rather than as an instruction to
   * its author, and the client never reads "pick a project for this block".
   *
   * The theme is RESOLVED into the snapshot rather than named by key. A sent document
   * should not restyle itself six weeks later because the brand palette moved.
   */
  const compileForShare = useCallback(
    async (raw: unknown) => {
      const doc = raw as ReportDocument;
      const docSubject = doc.jobId
        ? { type: "job" as const, id: doc.jobId }
        : doc.projectId
          ? { type: "project" as const, id: doc.projectId }
          : null;
      const compileCtx = { ...(ctx as object), subject: docSubject };
      // Same ref swap Preview uses: a Library-section block expands through ctxRef, so it
      // has to see this document's subject too or a nested property block renders blank.
      ctxRef.current = compileCtx;
      try {
        return {
          report: engine.compile(
            { title: doc.title },
            (doc.layout?.widgets ?? []) as ReportWidget[],
            compileCtx
          ),
          theme: resolveTheme(doc.layout?.theme ?? LOFTY_THEME.key, themes)
        };
      } finally {
        ctxRef.current = ctx;
      }
    },
    [ctx]
  );

  const documentStore = useMemo(
    () => createDocumentStore(repo, {}, { compile: compileForShare }),
    [repo, compileForShare]
  );
  const templateStore = useMemo(() => createLibraryStore(repo, "template"), [repo]);
  const sectionStore = useMemo(() => createLibraryStore(repo, "section"), [repo]);
  const storeFor = (t: OpenTarget) =>
    t.lane === "document" ? documentStore : t.kind === "section" ? sectionStore : templateStore;

  const nameOf = useCallback(
    (id: string | null) => (id ? people.find(p => p.id === id)?.fullName ?? null : null),
    [people]
  );
  const mine = (createdBy: string | null) => createdBy != null && createdBy === profile?.id;

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Documents ────────────────────────────────────────────────────────────

  /**
   * @param fromTemplateId which template to copy, or null for a blank page.
   *
   * Passed in rather than read from state, because "Start From Scratch" would otherwise
   * have to `setDocFrom(null)` first — and a state setter does not take effect before the
   * next render, so the blank-page button would silently make a document from whatever
   * template happened to be selected.
   */
  const createDocument = (fromTemplateId: string | null) =>
    run(async () => {
      const title = docTitle.trim();
      if (!title) return;
      const from = fromTemplateId ? libraryTemplates.find(t => t.id === fromTemplateId) : null;
      // `remapIds` so the copy shares no block id with the template it came from —
      // otherwise two documents from one template would collide in the builder's
      // drag-and-drop, which keys on block id.
      const row = await documentStore.create({
        title,
        layout: from
          ? { ...from.layout, widgets: engine.remapIds((from.layout?.widgets ?? []) as ReportWidget[]) }
          : { widgets: [] },
        templateId: from?.id ?? null
      } as Parameters<typeof documentStore.create>[0]);
      setDocTitle("");
      setDocFrom(null);
      bump();
      setOpen({ lane: "document", row, subject: { jobId: null, projectId: null } });
    });

  /**
   * Clone a document somebody already sent.
   *
   * `remapIds` for the same reason `createDocument` uses it: two documents sharing block
   * ids collide in the builder's drag-and-drop, which keys on them.
   *
   * The clone does NOT inherit the original's share link. That is deliberate and it is
   * the whole risk in this button — a copy that arrived carrying a live URL would be a
   * document somebody could open before its author had read it. The columns are simply
   * not carried across: `create` writes a fresh row and never touches them.
   */
  const cloneDocument = () =>
    run(async () => {
      const title = docTitle.trim();
      const source = documents.find(d => d.id === cloneFrom);
      if (!title || !source) return;
      const full = await documentStore.get(source.id);
      const row = await documentStore.create({
        title,
        layout: {
          ...(full.layout as object),
          widgets: engine.remapIds((full.layout?.widgets ?? []) as ReportWidget[])
        },
        templateId: source.templateId
      } as Parameters<typeof documentStore.create>[0]);
      setDocTitle("");
      setCloneFrom(null);
      bump();
      setOpen({
        lane: "document",
        row,
        // A clone is about the same job as the document it came from — copying a progress
        // report for 28 Corner Street and having it come back about nothing would mean
        // re-picking the record in every property block.
        subject: { jobId: source.jobId, projectId: source.projectId }
      });
    });

  const openDocument = (d: ReportDocument) =>
    run(async () => {
      // Re-read rather than use the row the list is holding: these are shared, the list
      // was fetched when the tab opened, and the builder autosaves whatever it is given.
      // Opening a stale copy would write it back over somebody's work.
      const row = await documentStore.get(d.id);
      setOpen({ lane: "document", row, subject: { jobId: d.jobId, projectId: d.projectId } });
    });

  const removeDocument = (d: ReportDocument) =>
    run(async () => {
      if (!window.confirm(`Delete “${d.title}”? This does not touch the template it came from.`)) return;
      await repo.deleteReportDocument(d.id);
      bump();
      toast(`Deleted “${d.title}”.`, "positive");
    });

  // ── The library ──────────────────────────────────────────────────────────

  const createLibraryEntry = () =>
    run(async () => {
      const name = libName.trim();
      if (!name) return;
      const store = libKind === "section" ? sectionStore : templateStore;
      const row = await store.create({ title: name, layout: { widgets: [] } });
      setLibName("");
      bump();
      setOpen({ lane: "library", row, kind: libKind });
    });

  /**
   * Clone a template or a section.
   *
   * The copy is a PROPOSAL, exactly as a new one is: it goes through the same store, so
   * the same trigger decides whether it is signed off on creation. Cloning an approved
   * template as a user therefore gives you a draft only you can see — which is right,
   * because otherwise "clone and edit" would be the way around the sign-off.
   */
  const cloneLibraryEntry = () =>
    run(async () => {
      const name = libName.trim();
      const source = ofKind.find(t => t.id === cloneFrom);
      if (!name || !source) return;
      const store = libKind === "section" ? sectionStore : templateStore;
      const full = await repo.getReportTemplate(source.id);
      if (!full) throw new Error("That is no longer in the library.");
      const row = await store.create({
        title: name,
        layout: {
          ...(full.layout as object),
          widgets: engine.remapIds((full.layout?.widgets ?? []) as ReportWidget[])
        }
      });
      setLibName("");
      setCloneFrom(null);
      bump();
      setOpen({ lane: "library", row, kind: libKind });
    });

  const openLibraryEntry = (t: ReportTemplate) =>
    run(async () => {
      const store = t.kind === "section" ? sectionStore : templateStore;
      setOpen({ lane: "library", row: await store.get(t.id), kind: t.kind });
    });

  const approve = (t: ReportTemplate, approved: boolean) =>
    run(async () => {
      await repo.approveReportTemplate(t.id, approved);
      bump();
      toast(
        approved ? `“${t.name}” is in the library.` : `“${t.name}” is back with its author.`,
        "positive"
      );
    });

  const retire = (t: ReportTemplate) =>
    run(async () => {
      await repo.updateReportTemplate(t.id, { isActive: false });
      bump();
      toast(`“${t.name}” retired — documents made from it still name it.`, "positive");
    });

  const withdraw = (t: ReportTemplate) =>
    run(async () => {
      if (!window.confirm(`Delete the draft “${t.name}”?`)) return;
      await repo.deleteReportTemplate(t.id);
      bump();
    });

  // ── Preview, for anything ────────────────────────────────────────────────

  const previewLayout = useCallback(
    (title: string, widgets: unknown[], theme: string | undefined, docSubject: typeof subject) => {
      // The subject has to be in ctx for THIS compile, or a "the record this document is
      // about" block silently renders its prompt instead of the record's properties.
      const compileCtx = { ...(ctx as object), subject: docSubject };
      ctxRef.current = compileCtx;
      try {
        setPreview({
          model: engine.compile({ title }, widgets as ReportWidget[], compileCtx),
          theme: theme ?? LOFTY_THEME.key
        });
      } finally {
        ctxRef.current = ctx;
      }
    },
    [ctx]
  );

  if (libError) return <LoadProblem error={libError} />;

  // Filtered by the tab, so the Sections tab is sections and nothing else. Waiting
  // proposals come first in the list below: they are the ones somebody has to act on.
  const ofKind = templates.filter(t => t.kind === libKind);
  const pending = ofKind.filter(t => t.approvedAt === null);
  const inLibrary = ofKind.filter(t => t.approvedAt !== null);

  return (
    <>
      {problem && <Problem>{problem}</Problem>}

      {/* ── Documents ───────────────────────────────────────────────────── */}
      {lane === "documents" && (
      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">Document Builder</Text>
          <Text type="text3" color="secondary">
            yours to edit — changing one never changes the template it came from
          </Text>
        </div>
        <Text type="text2" color="secondary" ellipsis={false}>
          A progress report, a client letter, a maintenance report. Start from a template
          and change whatever this one needs — the wording, the blocks, the order. Send it
          with <strong>Preview &amp; export</strong>: print, PDF, Word, Markdown or HTML.
        </Text>

        {canWrite && (
          <div className="get-started">
            <span className="get-started-label">Get started</span>
            {/* ONE NAME FIELD, ABOVE THE THREE, BECAUSE ALL THREE NEED IT.
                It was inside the first card for a draft, with a line underneath saying
                the other two used it as well — which is the same "which control belongs
                to which" problem the cards exist to remove, moved rather than fixed. A
                field that belongs to all three sits above all three. */}
            <span style={{ display: "block", maxWidth: 360 }}>
              <TextField
                id="new-document-title"
                title="Name"
                placeholder="Name a new document…"
                value={docTitle}
                onChange={setDocTitle}
                size="small"
                inputAriaLabel="Title for a new document"
              />
            </span>
            <div className="get-started-grid">
              {/* THREE CARDS, BECAUSE THEY ARE THREE DIFFERENT ACTS
                  and a single button with a dropdown made the difference invisible. Each
                  is disabled until it has what it needs, so which are available is itself
                  the answer to "can I clone anything yet". */}
              <GetStartedCard
                title="Start From A Template"
                hint="A layout a manager has signed into the library. You get a copy — changing it never changes the template."
                action={
                  <Button
                    size="small"
                    onClick={() => createDocument(docFrom)}
                    disabled={!docTitle.trim() || !docFrom || busy}
                  >
                    Create New Document
                  </Button>
                }
              >
                <Select
                  aria-label="Template to start the document from"
                  placeholder={libraryTemplates.length ? "From a template…" : "No templates in the library yet"}
                  options={toOptions(libraryTemplates.map(t => t.name))}
                  value={docFrom ? libraryTemplates.find(t => t.id === docFrom)?.name ?? null : null}
                  onChange={n => setDocFrom(libraryTemplates.find(t => t.name === n)?.id ?? null)}
                />
              </GetStartedCard>

              <GetStartedCard
                title="Clone An Existing Document"
                hint="Start from one that has already been sent — last month's progress report, with this month's numbers read fresh."
                action={
                  <Button
                    size="small"
                    kind="secondary"
                    onClick={cloneDocument}
                    disabled={!docTitle.trim() || !cloneFrom || busy}
                  >
                    Clone Existing
                  </Button>
                }
              >
                <Select
                  aria-label="Document to clone"
                  placeholder={documents.length ? "A document to copy…" : "No documents to copy yet"}
                  options={toOptions(documents.map(d => d.title))}
                  value={cloneFrom ? documents.find(d => d.id === cloneFrom)?.title ?? null : null}
                  onChange={n => setCloneFrom(documents.find(d => d.title === n)?.id ?? null)}
                />
              </GetStartedCard>

              <GetStartedCard
                title="Start From Scratch"
                hint="An empty page. Drag blocks in from the palette on the left of the builder."
                action={
                  <Button
                    size="small"
                    kind="secondary"
                    onClick={() => createDocument(null)}
                    disabled={!docTitle.trim() || busy}
                  >
                    Start From Scratch
                  </Button>
                }
              />
            </div>
          </div>
        )}

        {docsError && <LoadProblem error={docsError} />}
        {docsLoading ? (
          <Text type="text2" color="secondary">Loading…</Text>
        ) : documents.length === 0 ? (
          <NothingYet
            title="No documents yet"
            /* The three cards are directly above this and say all of it. What is left is
               the one thing they do not: whether the emptiness is yours or everyone's. */
            description={
              canWrite
                ? "Use one of the three ways above to make the first one."
                : "Nobody has made a document yet."
            }
          />
        ) : (
          <div className="data-table-wrap" style={{ marginTop: "var(--space-12)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>About</th>
                  <th>From</th>
                  <th>Last changed</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {documents.map(d => (
                  <tr key={d.id}>
                    <td><Text type="text2" weight="medium">{d.title}</Text></td>
                    <td>
                      <Text type="text2">
                        {d.jobId ?? (d.projectId != null ? String(d.projectId) : "—")}
                      </Text>
                    </td>
                    <td>
                      <Text type="text2">
                        {d.templateId
                          ? templates.find(t => t.id === d.templateId)?.name ?? "a template since removed"
                          : "—"}
                      </Text>
                    </td>
                    <td>
                      <Text type="text2">
                        {new Date(d.updatedAt).toLocaleDateString("en-AU")}
                        {nameOf(d.updatedBy) ? ` · ${nameOf(d.updatedBy)}` : ""}
                      </Text>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button
                          size="small" kind="tertiary"
                          onClick={() => previewLayout(
                            d.title, d.layout?.widgets ?? [], d.layout?.theme,
                            { jobId: d.jobId, projectId: d.projectId }
                          )}
                        >
                          Preview &amp; export
                        </Button>
                        {canWrite && (
                          <Button size="small" kind="tertiary" onClick={() => openDocument(d)}>Edit</Button>
                        )}
                        {(canDelete || mine(d.createdBy)) && (
                          <Button size="small" kind="tertiary" onClick={() => removeDocument(d)}>Delete</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}

      {/* ── The library ─────────────────────────────────────────────────── */}
      {lane !== "documents" && (
      <section className="panel">
        <div className="panel-head">
          <Text type="text2" weight="bold">
            {/* Capitalised to match the tab that got you here. "Template Library" in the
                tab and "Template library" in the panel under it reads as two places. */}
            {libKind === "section" ? "Section Library" : "Template Library"}
          </Text>
          <Text type="text3" color="secondary">
            {canApprove
              ? "you can sign entries into the library — a change here changes what everybody starts from"
              : "anyone can propose one; a manager signs it into the library"}
          </Text>
        </div>
        <Text type="text2" color="secondary" ellipsis={false}>
          {libKind === "section" ? (
            <>
              A <strong>section</strong> is a fragment — a letterhead, a scope-of-works
              table, a sign-off block — dropped into a template by the{" "}
              <em>Library section</em> block and resolved every time it renders, so
              correcting a section here corrects every template using it.
            </>
          ) : (
            <>
              A <strong>template</strong> is a whole document to start from. Making a
              document from one takes a copy, so changing that document never changes the
              template it came from.
            </>
          )}
        </Text>

        {canWrite && (
          <div className="get-started">
            <span className="get-started-label">Get started</span>
            {/* The kind comes from the tab. It used to be a dropdown here as well, which
                was two controls for one question — and the way somebody names a section,
                leaves the dropdown on Template, and cannot find it afterwards. */}
            <span style={{ display: "block", maxWidth: 360 }}>
              <TextField
                id="new-library-name"
                title="Name"
                placeholder={libKind === "section" ? "Name a new section…" : "Name a new template…"}
                value={libName}
                onChange={setLibName}
                size="small"
                inputAriaLabel={libKind === "section" ? "Name for a new section" : "Name for a new template"}
              />
            </span>

            {/* TWO CARDS HERE, NOT THREE.
                Amber: *"This is the sam for template library and sction library"* — the
                treatment, which is what the screenshot showed. Not the count: there is no
                "start from a template" for a template. The two acts that exist are a
                blank page and a copy, and a third dashed card standing for an act nobody
                can perform would be decoration. */}
            <div className="get-started-grid">
              <GetStartedCard
                title="Start From Scratch"
                hint={
                  libKind === "section"
                    ? "An empty fragment. Build the blocks a template will drop in — a letterhead, a scope-of-works table, a sign-off."
                    : "An empty page. Drag blocks in from the palette on the left of the builder."
                }
                action={
                  <Button size="small" onClick={createLibraryEntry} disabled={!libName.trim() || busy}>
                    {libKind === "section" ? "Create New Section" : "Create New Template"}
                  </Button>
                }
              />

              <GetStartedCard
                title={libKind === "section" ? "Clone An Existing Section" : "Clone An Existing Template"}
                hint="Copy one that already works and change what this one needs. The original is untouched."
                action={
                  <Button
                    size="small"
                    kind="secondary"
                    onClick={cloneLibraryEntry}
                    disabled={!libName.trim() || !cloneFrom || busy}
                  >
                    {libKind === "section" ? "Clone Section" : "Clone Template"}
                  </Button>
                }
              >
                <Select
                  aria-label={libKind === "section" ? "Section to clone" : "Template to clone"}
                  placeholder={
                    ofKind.length
                      ? libKind === "section" ? "A section to copy…" : "A template to copy…"
                      : "Nothing to copy yet"
                  }
                  options={toOptions(ofKind.map(t => t.name))}
                  value={cloneFrom ? ofKind.find(t => t.id === cloneFrom)?.name ?? null : null}
                  onChange={n => setCloneFrom(ofKind.find(t => t.name === n)?.id ?? null)}
                />
              </GetStartedCard>
            </div>

            {!canApprove && (
              <Text type="text3" color="secondary" ellipsis={false}>
                Yours to work on until a manager approves it — nobody else can see it before then.
              </Text>
            )}
          </div>
        )}

        {libLoading ? (
          <Text type="text2" color="secondary">Loading…</Text>
        ) : templates.length === 0 ? (
          <NothingYet
            title={libKind === "section" ? "No sections yet" : "No templates yet"}
            description={
              canWrite
                ? libKind === "section"
                  ? "Use one of the two ways above. A section is a group of blocks a template drops in — a letterhead, a scope-of-works table, a sign-off."
                  : "Use one of the two ways above to make the first one."
                : "Nothing has been added to the library yet."
            }
          />
        ) : (
          <div className="data-table-wrap" style={{ marginTop: "var(--space-12)" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>For</th>
                  <th>Status</th>
                  <th>Last changed</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {[...pending, ...inLibrary].map(t => {
                  const draft = t.approvedAt === null;
                  const editable = canApprove || (draft && mine(t.createdBy));
                  return (
                    <tr key={t.id}>
                      <td>
                        <Text type="text2" weight="medium">{t.name}</Text>
                        {t.description && (
                          <Text type="text3" color="secondary" ellipsis={false}>{t.description}</Text>
                        )}
                      </td>
                      <td><Text type="text2">{t.kind === "section" ? "Section" : "Template"}</Text></td>
                      <td>
                        <Text type="text2">
                          {t.scope === "team"
                            ? teams.find(x => x.id === t.teamId)?.name ?? t.teamId ?? "—"
                            : REPORT_TEMPLATE_SCOPE_LABELS[t.scope]}
                        </Text>
                      </td>
                      <td>
                        {/* Not a colour-only signal: the word is the status, and the
                            sentence beside it says whose move it is. */}
                        <Text type="text2">
                          {!t.isActive
                            ? "Retired"
                            : draft
                              ? mine(t.createdBy) ? "Your draft — awaiting a manager" : "Awaiting approval"
                              : "In the library"}
                        </Text>
                      </td>
                      <td>
                        <Text type="text2">
                          {new Date(t.updatedAt).toLocaleDateString("en-AU")}
                          {nameOf(t.updatedBy) ? ` · ${nameOf(t.updatedBy)}` : ""}
                        </Text>
                      </td>
                      <td>
                        <div className="row-actions">
                          {t.kind === "template" && (
                            <Button
                              size="small" kind="tertiary"
                              onClick={() => previewLayout(t.name, t.layout?.widgets ?? [], t.layout?.theme, null)}
                            >
                              Preview
                            </Button>
                          )}
                          {editable && (
                            <Button size="small" kind="tertiary" onClick={() => openLibraryEntry(t)}>
                              Edit
                            </Button>
                          )}
                          {canApprove && draft && (
                            <Button size="small" onClick={() => approve(t, true)} disabled={busy}>
                              Approve
                            </Button>
                          )}
                          {canApprove && !draft && t.isActive && (
                            <Button size="small" kind="tertiary" onClick={() => retire(t)} disabled={busy}>
                              Retire
                            </Button>
                          )}
                          {draft && (mine(t.createdBy) || canDelete) && (
                            <Button size="small" kind="tertiary" onClick={() => withdraw(t)} disabled={busy}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* The reads behind the blocks, failing loudly. A builder whose ctx never arrived
            renders every block as "no jobs yet", which is the same sentence as the truth
            on an empty database and a lie on a full one. */}
        {recordsError && <LoadProblem error={recordsError} />}
      </section>
      )}

      {/* Both render into a portal over the whole viewport, so neither needs a slot in
          the page's layout. */}
      {open && (
        <ReportBuilder
          report={open.row}
          engine={engine}
          store={storeFor(open)}
          ctx={ctx}
          themes={themes}
          branding="Lofty"
          // Only from a document, and it means "propose this layout as a template".
          // From a library entry it would be a template saved as a template.
          canSaveTemplate={open.lane === "document"}
          // The module defaults to /reports/shared, which this app already uses for the
          // signed-in Reports page. BASE_URL rather than a literal, for the reason
          // App.tsx gives: `base` in vite.config.ts stays the one place the app's
          // location is decided.
          shareUrlBase={`${window.location.origin}${import.meta.env.BASE_URL}shared`}
          onClose={() => { setOpen(null); bump(); }}
          onSaved={(row: ReportStoreRow) =>
            setOpen(cur => (cur ? { ...cur, row } as OpenTarget : cur))}
        />
      )}

      {preview && (
        <ReportOverlay
          report={preview.model}
          themes={themes}
          initialTheme={preview.theme}
          branding="Lofty"
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}
