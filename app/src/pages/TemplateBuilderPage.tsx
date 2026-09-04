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
import { SidePanel } from "../components/SidePanel";
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
  { title, hint, action, children, onClick, disabled, disabledNote }:
  {
    title: string;
    hint: string;
    /** A button, for the library lanes where the choice still needs a field beside it. */
    action?: React.ReactNode;
    children?: React.ReactNode;
    /** Makes the whole card the control. The Document Builder uses this. */
    onClick?: () => void;
    disabled?: boolean;
    /** Why it is disabled, in place of the hint. "No templates in the library yet". */
    disabledNote?: string;
  }
) {
  const body = (
    <>
      <div className="get-started-card-title">
        <Text type="text2" weight="bold">{title}</Text>
      </div>
      <Text type="text3" color="secondary" ellipsis={false}>
        {disabled && disabledNote ? disabledNote : hint}
      </Text>
      {children && <div className="get-started-card-fields">{children}</div>}
      <div className="get-started-card-fill" />
      {action}
    </>
  );

  // THE WHOLE CARD IS THE BUTTON, not a card with a button in it.
  //
  // Amber's sketch has three things to click and nothing else on the screen. A card
  // holding a button gives the eye two targets for one act and a dead margin between
  // them that looks clickable and is not. A real <button> rather than a div with an
  // onClick, so it is reachable by keyboard and announces itself as a control.
  if (onClick) {
    return (
      <button
        type="button"
        className="get-started-card get-started-card-button"
        onClick={onClick}
        disabled={disabled}
      >
        {body}
      </button>
    );
  }
  return <div className="get-started-card">{body}</div>;
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
  /**
   * Which of the three was clicked, and therefore what the naming panel has to ask.
   *
   * Null means no panel. The choice comes FIRST and the name second, which is the order
   * Amber asked for — *"when you click on it, it should create a new one and ask to name
   * it"* — and the order that lets the three cards be live buttons rather than three
   * controls greyed out behind a field nobody has filled in yet.
   */
  const [starting, setStarting] = useState<{ how: "template" | "clone" | "scratch" } | null>(null);
  /**
   * The same thing for the library lanes: which card was clicked, so the panel knows
   * whether to ask for a source as well as a name.
   *
   * A second piece of state rather than one shared with the documents lane, because the
   * two write to different stores and to different name fields, and a single `starting`
   * covering both would need a lane check at every read — the kind of condition that is
   * right until somebody adds a fourth way in.
   */
  const [startingLib, setStartingLib] = useState<{ how: "clone" | "scratch" } | null>(null);
  const libKind: ReportTemplateKind = lane === "section" ? "section" : "template";
  const [busy, setBusy] = useState(false);

  // ── What is in the library, and what has been made from it ───────────────
  const { data: templates, loading: libLoading, error: libError } =
    useQuery(r => r.listReportTemplates(), [], [reloadKey]);
  // Still read, though nothing lists them any more: "Clone An Existing Document" needs
  // to know what there is to clone, and whether there is anything at all decides whether
  // that card is live or greyed.
  const { data: documents, error: docsError } =
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
      setStarting(null);
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
      setStarting(null);
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

  /**
   * Close the naming panel, and forget what was half-typed into it.
   *
   * Clearing on close rather than on open: a panel that opens showing the last attempt's
   * name looks like it remembered something on purpose, and the first thing anybody does
   * is delete it.
   */
  const closeStarting = () => {
    if (busy) return;
    setStarting(null);
    setDocTitle("");
    setDocFrom(null);
    setCloneFrom(null);
  };

  /**
   * The one button at the bottom of the naming panel, whichever card opened it.
   *
   * It dispatches to the same two functions the old inline buttons called, rather than
   * repeating their bodies — `remapIds`, the share columns a clone must not inherit, and
   * the subject a clone keeps are all decisions with reasons written where they are made,
   * and a second copy here would be a second place for them to drift.
   */
  const confirmStart = () => {
    if (!starting) return;
    if (starting.how === "clone") cloneDocument();
    else createDocument(starting.how === "template" ? docFrom : null);
  };

  // NO `openDocument` AND NO `removeDocument`, AND THAT IS A GAP WORTH NAMING.
  //
  // Both existed for the table that used to sit under the cards. Amber, 4 September:
  // *"I don't need a list of documents created below. they will live on the job."* They
  // will — but they do not yet, so between this change and the job page carrying them
  // there is NO WAY BACK INTO A DOCUMENT once the builder is closed, and no way to
  // delete one.
  //
  // Deleted rather than left unused: dead code that still compiles is the kind a later
  // reader wires back up to "fix" the gap, which would put the list back on the screen
  // it was just taken off. The functions were eight lines each; the decisions in them —
  // re-read before opening so autosave cannot write a stale copy over somebody's work,
  // and say in the confirm that deleting a document does not touch its template — are
  // the parts worth carrying to the job page, so they are written here.

  // ── The library ──────────────────────────────────────────────────────────

  const createLibraryEntry = () =>
    run(async () => {
      const name = libName.trim();
      if (!name) return;
      const store = libKind === "section" ? sectionStore : templateStore;
      const row = await store.create({ title: name, layout: { widgets: [] } });
      setLibName("");
      setStartingLib(null);
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
      setStartingLib(null);
      bump();
      setOpen({ lane: "library", row, kind: libKind });
    });

  const closeStartingLib = () => {
    if (busy) return;
    setStartingLib(null);
    setLibName("");
    setCloneFrom(null);
  };

  const confirmStartLib = () => {
    if (!startingLib) return;
    if (startingLib.how === "clone") cloneLibraryEntry();
    else createLibraryEntry();
  };

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
      {/* ── Document Builder ─────────────────────────────────────────────
          FULL SCREEN, THREE CHOICES, NOTHING ELSE.

          Amber, 4 September: *"I don't need text explaining above the buttons. I don't
          need a list of documents created below. they will live on the job. I just want
          the document build to be full screen like the image with the three butons in
          the middle. when you click on it, it should create a new one and ask to name
          it"*.

          Three things went, and each was load-bearing until it was not:

          THE PARAGRAPH. It said what a document is and what Preview & export does — read
          once, then stepped over daily by the person who already knows.

          THE NAME FIELD. It sat above the cards and had to be filled before any button
          would light up, so the first thing the screen did was disable itself. The name
          is asked for AFTER the choice now, when it is a question about a thing that is
          about to exist rather than a gate in front of three greyed-out buttons.

          THE TABLE. A document belongs to the job it is about, and that is where it will
          be opened from. A second list here would be a second place to look, going stale
          the moment the job page has one.

          What is left is the choice, in the middle of the screen. */}
      {lane === "documents" && (
      <section className="lane-empty">
        {canWrite ? (
          <div className="get-started get-started-centred">
            <div className="get-started-grid">
              <GetStartedCard
                title="Start From A Template"
                hint="A layout a manager has signed into the library. You get a copy — changing it never changes the template."
                disabled={!libraryTemplates.length}
                disabledNote="No templates in the library yet"
                onClick={() => setStarting({ how: "template" })}
              />
              <GetStartedCard
                title="Clone An Existing Document"
                hint="Start from one that has already been sent — last month's progress report, with this month's numbers read fresh."
                disabled={!documents.length}
                disabledNote="No documents to copy yet"
                onClick={() => setStarting({ how: "clone" })}
              />
              <GetStartedCard
                title="Start From Scratch"
                hint="An empty page. Drag blocks in from the palette on the left of the builder."
                onClick={() => setStarting({ how: "scratch" })}
              />
            </div>
          </div>
        ) : (
          <NothingYet
            title="Documents are made by the people who send them"
            description="Ask a colleague at user level or above to start one."
          />
        )}

        {/* The reads behind the blocks, failing loudly. A builder whose ctx never arrived
            renders every block as "no jobs yet", which is the same sentence as the truth
            on an empty database and a lie on a full one. */}
        {recordsError && <LoadProblem error={recordsError} />}
        {docsError && <LoadProblem error={docsError} />}
      </section>
      )}

      {/* ── The library ─────────────────────────────────────────────────── */}
      {/* ── Template Library and Section Library ────────────────────────
          Amber, 4 September: *"fix the other 2 pages as well to have same format"*.

          Same format, and it is the same code — one GetStartedCard, one naming panel,
          one set of styles. The card is the button, the name is asked for after the
          choice, and the cards sit in the middle of the screen with nothing above them.

          TWO CARDS, NOT THREE: there is no "start from a template" for a template. The
          acts that exist are a blank page and a copy.

          AND THE LIST COMES BACK ONCE THERE IS ONE. This is the single deviation, and it
          is not cosmetic: a document belongs to its job and will be opened from there,
          but a template belongs to the library and this IS the library. With no list a
          template could be made and never opened again. So an EMPTY library is the same
          full-screen screen as the Document Builder, and a library with something in it
          shows the cards above what it holds. */}
      {lane !== "documents" && (
      <section className={templates.length === 0 ? "lane-empty" : ""}>
        {canWrite ? (
          <div className={`get-started get-started-centred${templates.length ? " get-started-inline" : ""}`}>
            <div className="get-started-grid">
              <GetStartedCard
                title="Start From Scratch"
                hint={
                  libKind === "section"
                    ? "An empty fragment. Build the blocks a template will drop in — a letterhead, a scope-of-works table, a sign-off."
                    : "An empty page. Drag blocks in from the palette on the left of the builder."
                }
                onClick={() => setStartingLib({ how: "scratch" })}
              />
              <GetStartedCard
                title={libKind === "section" ? "Clone An Existing Section" : "Clone An Existing Template"}
                hint="Copy one that already works and change what this one needs. The original is untouched."
                disabled={!ofKind.length}
                disabledNote={libKind === "section" ? "No sections to copy yet" : "No templates to copy yet"}
                onClick={() => setStartingLib({ how: "clone" })}
              />
            </div>
            {!canApprove && (
              <Text type="text3" color="secondary" ellipsis={false}>
                Yours to work on until a manager approves it — nobody else can see it before then.
              </Text>
            )}
          </div>
        ) : templates.length === 0 ? (
          <NothingYet
            title={libKind === "section" ? "No sections yet" : "No templates yet"}
            description="Nothing has been added to the library yet."
          />
        ) : null}

        {/* NO "No templates yet" BOX UNDER THE CARDS.
            It sat directly beneath them saying "use one of the two ways above", which
            the two ways above already say — and the Clone card says the more useful half
            of it in place of its own hint ("No templates to copy yet"). An empty library
            is now the two cards on an empty screen, which is the Document Builder's
            format and the point of this change. */}
        {libLoading ? (
          <Text type="text2" color="secondary">Loading…</Text>
        ) : templates.length === 0 ? null : (
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

      {/* ── Name it, once the choice is made ────────────────────────────────
          A SidePanel rather than a modal of its own, because that is what this app
          opens for "one more thing before I make the record" — cloning a job, splitting
          a project, adding a user. A second convention for the same act would be a
          second thing to learn.

          The name is the only required field. Where the act needs a source as well —
          which template, which document — that sits under it, already narrowed to the
          one kind of thing that can answer. */}
      <SidePanel
        open={starting !== null}
        title={
          starting?.how === "template" ? "New document from a template"
          : starting?.how === "clone" ? "Copy an existing document"
          : "New empty document"
        }
        onClose={closeStarting}
        footer={
          <>
            <Button
              onClick={confirmStart}
              disabled={
                busy || !docTitle.trim()
                || (starting?.how === "template" && !docFrom)
                || (starting?.how === "clone" && !cloneFrom)
              }
            >
              {busy ? "Creating…" : "Create and open"}
            </Button>
            <Button kind="tertiary" onClick={closeStarting} disabled={busy}>Cancel</Button>
          </>
        }
      >
        <div className="get-started-card-fields">
          <TextField
            id="new-document-title"
            title="Name"
            placeholder="Progress report — 28 Corner Street"
            value={docTitle}
            onChange={setDocTitle}
            /* The name is what somebody came here to type, so the caret starts in it
               rather than on the panel. */
            autoFocus
            inputAriaLabel="Title for a new document"
          />

          {starting?.how === "template" && (
            <Select
              aria-label="Template to start the document from"
              placeholder="Which template…"
              options={toOptions(libraryTemplates.map(t => t.name))}
              value={docFrom ? libraryTemplates.find(t => t.id === docFrom)?.name ?? null : null}
              onChange={n => setDocFrom(libraryTemplates.find(t => t.name === n)?.id ?? null)}
            />
          )}

          {starting?.how === "clone" && (
            <Select
              aria-label="Document to copy"
              placeholder="Which document…"
              options={toOptions(documents.map(d => d.title))}
              value={cloneFrom ? documents.find(d => d.id === cloneFrom)?.title ?? null : null}
              onChange={n => setCloneFrom(documents.find(d => d.title === n)?.id ?? null)}
            />
          )}

          <Text type="text3" color="secondary" ellipsis={false}>
            {starting?.how === "template"
              ? "You get a copy. Changing this document never changes the template it came from."
              : starting?.how === "clone"
                ? "A copy of the blocks, not of the numbers — the data is read fresh every time it is opened."
                : "An empty page. Drag blocks in from the palette on the left of the builder."}
          </Text>
        </div>
      </SidePanel>

      {/* The library's naming panel — the same one, asking the same question. */}
      <SidePanel
        open={startingLib !== null}
        title={
          startingLib?.how === "clone"
            ? (libKind === "section" ? "Copy an existing section" : "Copy an existing template")
            : (libKind === "section" ? "New empty section" : "New empty template")
        }
        onClose={closeStartingLib}
        footer={
          <>
            <Button
              onClick={confirmStartLib}
              disabled={busy || !libName.trim() || (startingLib?.how === "clone" && !cloneFrom)}
            >
              {busy ? "Creating…" : "Create and open"}
            </Button>
            <Button kind="tertiary" onClick={closeStartingLib} disabled={busy}>Cancel</Button>
          </>
        }
      >
        <div className="get-started-card-fields">
          <TextField
            id="new-library-name"
            title="Name"
            placeholder={libKind === "section" ? "Letterhead" : "Progress report"}
            value={libName}
            onChange={setLibName}
            autoFocus
            inputAriaLabel={libKind === "section" ? "Name for a new section" : "Name for a new template"}
          />

          {startingLib?.how === "clone" && (
            <Select
              aria-label={libKind === "section" ? "Section to copy" : "Template to copy"}
              placeholder={libKind === "section" ? "Which section…" : "Which template…"}
              options={toOptions(ofKind.map(t => t.name))}
              value={cloneFrom ? ofKind.find(t => t.id === cloneFrom)?.name ?? null : null}
              onChange={n => setCloneFrom(ofKind.find(t => t.name === n)?.id ?? null)}
            />
          )}

          {/* THE KIND COMES FROM THE TAB, and is not asked here. It used to be a dropdown
              as well, which was two controls for one question — and the way somebody
              names a section, leaves the dropdown on Template, and cannot find it after. */}
          <Text type="text3" color="secondary" ellipsis={false}>
            {canApprove
              ? "Signed into the library on creation, so everybody can start from it."
              : "Yours until a manager approves it — nobody else can see it before then."}
          </Text>
        </div>
      </SidePanel>

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
