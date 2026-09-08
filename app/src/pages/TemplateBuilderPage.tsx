import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Text, TextField } from "@vibe/core";
import { useQuery, useRepository } from "../data/DataProvider";
import { useAuth } from "../data/AuthProvider";
import { usePermission } from "../data/PermissionProvider";
import { useBoardRecords } from "../data/boardModel";
import { useProcesses, usePropertyDefs, usePropertyOptions, useStages, useTeams } from "../data/useLookups";
import { LoadProblem, NothingYet } from "../components/SearchNotices";
import { Problem } from "../components/Form";
import { Select, toOptions } from "../components/Select";
import { parseSubject, subjectOptionsFor, type SubjectKind } from "./documentSubject";
import { SidePanel } from "../components/SidePanel";
import { useToasts } from "../components/Toasts";
import {
  REPORT_TEMPLATE_SCOPE_LABELS,
  snippetHtml,
  snippetLayout,
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
  makeFillTokens,
  resolveTheme,
  sanitizeHtml,
  tokensFor,
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
/**
 * What each library lane calls the thing it holds.
 *
 * `scratchHint` is the only one that is not mechanical: what an empty template, an empty
 * section and an empty snippet are FOR are three different sentences, and a generic
 * "an empty one" would be the kind of copy that is technically correct and tells nobody
 * anything.
 */
/**
 * What an import could not carry, shown before it becomes a document.
 *
 * NOT a warning and not an error — it is a receipt. A .docx says how many images it left
 * out; a .pdf says its headings were inferred from text size rather than read from the
 * file, and that its tables arrived as text. All three are true and none of them means
 * the import failed.
 *
 * It is here, above the Create button, rather than in a toast afterwards, because the
 * useful moment to learn a PDF's tables did not survive is while deciding whether to
 * import it — not once it is already a document with somebody's name on it.
 */
function ImportNotes({ fileName, notes }: { fileName: string; notes: string[] }) {
  return (
    <div className="import-notes">
      <Text type="text3" weight="bold" ellipsis={false}>Read from {fileName}</Text>
      {notes.length === 0 ? (
        <Text type="text3" color="secondary" ellipsis={false}>
          Everything in it came across.
        </Text>
      ) : (
        <ul>
          {notes.map((n, i) => (
            <li key={i}><Text type="text3" color="secondary" ellipsis={false}>{n}</Text></li>
          ))}
        </ul>
      )}
    </div>
  );
}

const LANE_WORDS: Record<ReportTemplateKind, {
  one: string; One: string; many: string; egName: string; scratchHint: string;
}> = {
  template: {
    one: "template", One: "Template", many: "templates", egName: "Progress report",
    scratchHint: "An empty page. Drag blocks in from the palette on the left of the builder."
  },
  section: {
    one: "section", One: "Section", many: "sections", egName: "Letterhead",
    scratchHint: "An empty fragment. Build the blocks a template will drop in — a letterhead, a scope-of-works table, a sign-off."
  },
  snippet: {
    one: "snippet", One: "Snippet", many: "snippets", egName: "Standard sign-off",
    scratchHint: "Wording you reuse. Write it once here, then drop it into any letter from the editor's Insert snippet menu."
  }
};

export function TemplateBuilderPage({ lane }: { lane: "documents" | "template" | "section" | "snippet" }) {
  const repo = useRepository();
  const [params, setParams] = useSearchParams();
  const { can } = usePermission();
  const { profile } = useAuth();
  const { toast } = useToasts();

  const canWrite = can("user");
  const canApprove = can("manager");
  const canDelete = can("admin");

  const [reloadKey, setReloadKey] = useState(0);
  const bump = useCallback(() => setReloadKey(k => k + 1), []);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  /**
   * What is open, readable from inside `ctx` without `ctx` depending on it.
   *
   * Exactly the reasoning behind `ctxRef`: `ctx` is memoised because a fresh identity
   * re-resolves every block, which makes typing in a text block feel broken. Adding
   * `open` to the dependency list would rebuild it on every autosave — the row comes back
   * as a new object each time it saves — so the upload reads the ref instead.
   */
  const openRef = useRef<OpenTarget | null>(null);
  openRef.current = open;
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
  const [starting, setStarting] = useState<{ how: "template" | "clone" | "scratch" | "import" } | null>(null);
  /**
   * The record the new document is ABOUT, as one value rather than two.
   *
   * Amber, 4 September: *"all documents need to be associated to a job or project and
   * they are listed on that project"*. It is one question with one answer, so it is one
   * control — `job:1042-001` or `project:1042` — rather than two pickers where filling
   * in the wrong one is a thing that can happen.
   */
  const [subjectPick, setSubjectPick] = useState<string | null>(null);
  /**
   * Job or project — asked before the list, not buried inside it.
   *
   * See `subjectOptions` for the number that made this its own control. It defaults to
   * "job" because that is still the common case; what changed is that "project" is now
   * one click away instead of 75 rows down.
   */
  const [subjectKind, setSubjectKind] = useState<SubjectKind>("job");
  /**
   * The same thing for the library lanes: which card was clicked, so the panel knows
   * whether to ask for a source as well as a name.
   *
   * A second piece of state rather than one shared with the documents lane, because the
   * two write to different stores and to different name fields, and a single `starting`
   * covering both would need a lane check at every read — the kind of condition that is
   * right until somebody adds a fourth way in.
   */
  const [startingLib, setStartingLib] = useState<{ how: "clone" | "scratch" | "import" } | null>(null);
  const libKind: ReportTemplateKind =
    lane === "section" ? "section" : lane === "snippet" ? "snippet" : "template";

  /**
   * The lane's own words, in one place.
   *
   * This used to be a two-way ternary repeated at eight call sites, which was tolerable
   * while there were two kinds. A third turns each of them into a nested conditional and
   * the eighth one somebody forgets is a screen that calls a snippet a template.
   */
  const words = LANE_WORDS[libKind];
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
   * The snippets the editor offers, as the menu wants them.
   *
   * Same gate as sections — in the library and still current — because an unapproved
   * snippet is its author's draft and a retired one is wording somebody deliberately
   * stopped offering. `snippetHtml` is the one place that knows a snippet is a single
   * text widget; see 0098 for why it is stored that way.
   *
   * A snippet with no wording yet is dropped rather than listed: it would be a menu entry
   * that inserts nothing, which reads as broken rather than as empty.
   */
  const textSnippets = useMemo(
    () => templates
      .filter(t => t.kind === "snippet" && t.approvedAt !== null && t.isActive)
      .map(t => ({ value: t.id, label: t.name, html: snippetHtml(t.layout) }))
      .filter(sn => sn.html.trim() !== ""),
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

  /**
   * Saving a snippet: the wording is held here while the author names it.
   *
   * A string and not a boolean, because the html has to survive the trip through the
   * panel — by the time somebody has typed a name the selection they saved is long gone,
   * and re-reading it then would save whatever happens to be selected now.
   */
  /**
   * A parsed import, held between choosing the file and naming what it becomes.
   *
   * The parse happens on the file picker's change, not on Create, and that is the point:
   * a Word document with an unreadable table or a scanned PDF with no text at all should
   * say so BEFORE somebody has typed a name and pressed a button, not after. `notes` is
   * what the conversion could not carry, and the panel shows it.
   */
  const [imported, setImported] =
    useState<{ widgets: ReportWidget[]; notes: string[]; fileName: string } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  /** Which lane asked, so the file picker knows which naming panel to open afterwards. */
  const importLaneRef = useRef<"documents" | "library">("documents");

  const [savingSnippet, setSavingSnippet] = useState<string | null>(null);
  const [snippetName, setSnippetName] = useState("");

  const askToSaveSnippet = useCallback((html: string) => {
    setSnippetName("");
    setSavingSnippet(html);
  }, []);

  /** What the open document is about, so "the record this document is about" has an answer. */
  const subject = open?.lane === "document" ? open.subject : null;

  // Memoised, and it is not an optimisation: a fresh `ctx` identity re-resolves every
  // block on every render, which makes typing in a text block feel broken.
  const ctx = useMemo(
    () => {
      const base = {
        projects, jobs, teams, stageNames, people, processes,
        propertyDefs, propertyValues, propertyOptions,
        sections, expandSection,
        subject
      };
      return {
        ...base,
        /**
         * Placeholders in prose — `{{site_start_date}}` inside a letter.
         *
         * Two halves, both supplied by the app rather than the module: the list the
         * editor's "Insert field" menu offers, and the function that fills them in when
         * the block renders. `core/registry.js` knows only that a host may provide
         * `fillTokens`; what a token means is Lofty's business, because a token is a
         * name for one of Lofty's own fields.
         *
         * Built from `base` and not from `ctx`, which does not exist yet inside its own
         * initialiser — and it needs the real subject, jobs and values, so it cannot be
         * hoisted out of the memo either.
         */
        textTokens: tokensFor(base),
        fillTokens: makeFillTokens(base),
        /**
         * Saved wording — the list the editor offers, and where a new one goes.
         *
         * Both host-supplied for the same reason the tokens are: the module knows a
         * snippet is html to drop in at the caret, and nothing about the library it came
         * out of, who may see it or the manager who has to sign it off.
         *
         * `saveTextSnippet` only opens the naming panel. Writing the row is deliberately
         * NOT done here — the author has to name it, and a snippet called "Untitled" is
         * one nobody finds again in a menu.
         */
        textSnippets,
        saveTextSnippet: askToSaveSnippet,
        /**
         * Put an image in the bucket and hand back the URL the block renders.
         *
         * Host-supplied for the same reason everything else here is: the module knows a
         * File goes in and a URL comes back, and nothing about buckets or who may write
         * to them. Absent when nothing is open, which makes the settings control fall
         * back to the URL box rather than offering an upload with nowhere to file it.
         *
         * The owner is what the object path is filed under (`documents/<id>/…`), not a
         * second record of what the document carries — the layout is that, which is what
         * "stores in the document only" meant (0100).
         */
        uploadImage: openRef.current
          ? (file: File) => repo.uploadReportImage({
              file,
              owner: openRef.current!.lane === "document"
                ? { kind: "document", id: openRef.current!.row.id }
                : { kind: "library", id: openRef.current!.row.id }
            })
          : undefined
      };
    },
    [projects, jobs, teams, stageNames, people, processes,
     propertyDefs, propertyValues, propertyOptions, sections, expandSection, subject,
     textSnippets, askToSaveSnippet]
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
  // Snippets go through the same store as everything else in the library, because they
  // are the same table and the same sign-off (0098). The store is parameterised by kind
  // for exactly this reason — a third one costs a line, not a file.
  const snippetStore = useMemo(() => createLibraryStore(repo, "snippet"), [repo]);
  /**
   * Kind → store, in one function.
   *
   * `kind === "section" ? sectionStore : templateStore` was correct while there were two
   * kinds and became a silent bug the moment there were three: a snippet would have gone
   * to the template store and been created as a template, under a name that said
   * otherwise. A record lookup cannot fall through like that.
   */
  const libraryStoreFor = useCallback(
    (kind: ReportTemplateKind) =>
      ({ template: templateStore, section: sectionStore, snippet: snippetStore })[kind],
    [templateStore, sectionStore, snippetStore]
  );
  const storeFor = (t: OpenTarget) =>
    t.lane === "document" ? documentStore : libraryStoreFor(t.kind);

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

  /**
   * Every job and every project, in one list, jobs first.
   *
   * ONE LIST OF ONE KIND, chosen above it — and the reason is a number.
   *
   * This was a single list of every job AND every project, jobs first on the reasoning
   * that a document is usually about one. On 7 September the live database had 75 jobs
   * and 117 projects, and of the 8 documents anybody had made, **6 were on a job and 0
   * were on a project.** Not one, ever.
   *
   * Nothing was broken: the column, the foreign key, the RLS policy and the value this
   * picker emits were all correct, and a project-linked document rendered on the project
   * perfectly well once one existed. What was wrong was that you could not get to it.
   * 192 options in one control, and `Select` sorts by label unless told not to — job
   * labels start with a digit and project labels started with the word "Project", so
   * every project sorted below every job. Reaching one meant scrolling past 75 jobs or
   * guessing that "Project" was the word to type.
   *
   * "Rarer" was the wrong thing to optimise for. Rare is not the same as hidden, and a
   * list that is technically complete but practically unreachable produces exactly this:
   * a feature that works and that nobody has ever used. So the kind is its own control
   * now, and each list holds one kind and is as long as that kind is.
   *
   * The label carries the address as well as the number, because "1042-001" is what
   * somebody types and "28 Corner Street" is what they remember, and the Select searches
   * the label. "Project" is no longer prefixed onto it — the control above already says
   * which kind you are looking at, and repeating it in all 117 labels only made them
   * sort away from the numbers people search by.
   */
  const subjectOptions = useMemo(
    () => subjectOptionsFor(
      subjectKind,
      jobs.map(j => ({ number: j.jobNumber, currentAddress: j.currentAddress })),
      projects.map(p => ({ number: p.projectNumber, currentAddress: p.currentAddress }))
    ),
    [subjectKind, jobs, projects]
  );

  /** `job:1042-001` → what createReportDocument wants. See `documentSubject.ts`. */
  const pickedSubject = useMemo(() => parseSubject(subjectPick), [subjectPick]);

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
      // The record is required by the screen rather than by the column — both are
      // nullable, because a document made from a job drawer gets its subject from where
      // it was opened and an import may arrive without one. The button is what enforces
      // it here; see the panel below.
      const subject = pickedSubject ?? { jobId: null, projectId: null };
      const row = await documentStore.create({
        title,
        layout: from
          ? { ...from.layout, widgets: engine.remapIds((from.layout?.widgets ?? []) as ReportWidget[]) }
          // An import brings its own blocks. `remapIds` here too, for the same reason it
          // is used on a clone: the importer generates ids, and importing the same file
          // twice must not produce two documents whose blocks collide in the builder's
          // drag-and-drop, which keys on block id.
          : imported
            ? { widgets: engine.remapIds(imported.widgets) }
            : { widgets: [] },
        templateId: from?.id ?? null,
        ...subject
      });
      setDocTitle("");
      setDocFrom(null);
      setImported(null);
      setSubjectPick(null);
      setStarting(null);
      bump();
      // The builder opens ON that record, so a "Record properties" block left on "this
      // document's own record" resolves to 1042-001 rather than to nothing.
      setOpen({ lane: "document", row, subject });
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
      // A clone defaults to the record its source was about — copying last month's
      // progress report for 28 Corner Street and having it come back about nothing means
      // re-picking in every property block — but the panel lets it be moved, because
      // "the same report for the other lot" is exactly why somebody clones one.
      const subject = pickedSubject ?? { jobId: source.jobId, projectId: source.projectId };
      const row = await documentStore.create({
        title,
        layout: {
          ...(full.layout as object),
          widgets: engine.remapIds((full.layout?.widgets ?? []) as ReportWidget[])
        },
        templateId: source.templateId,
        ...subject
      });
      setDocTitle("");
      setCloneFrom(null);
      setSubjectPick(null);
      setStarting(null);
      bump();
      setOpen({ lane: "document", row, subject });
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
    setSubjectPick(null);
    setImported(null);
  };

  /**
   * The one button at the bottom of the naming panel, whichever card opened it.
   *
   * It dispatches to the same two functions the old inline buttons called, rather than
   * repeating their bodies — `remapIds`, the share columns a clone must not inherit, and
   * the subject a clone keeps are all decisions with reasons written where they are made,
   * and a second copy here would be a second place for them to drift.
   */
  /**
   * Read the chosen file, then open the naming panel with what came out of it.
   *
   * The parsers are loaded by `documentToWidgets` on demand — mammoth and pdfjs together
   * are larger than the rest of the builder, and nobody who is not importing should wait
   * for them. The name is suggested from the file's own, minus the extension, because
   * "Site Report.docx" is what the thing is called and retyping it is a chore.
   */
  const takeImport = (file: File | undefined, lane: "documents" | "library") =>
    run(async () => {
      if (!file) return;
      importLaneRef.current = lane;
      const { documentToWidgets } = await import("../features/reports/index.js");
      const { widgets, notes } = await documentToWidgets(file);
      if (!widgets.length) {
        throw new Error(`Nothing could be read out of ${file.name}.`);
      }
      const suggested = file.name.replace(/\.[^.]+$/, "");
      setImported({ widgets: widgets as ReportWidget[], notes, fileName: file.name });
      if (lane === "documents") {
        setDocTitle(suggested);
        setStarting({ how: "import" });
      } else {
        setLibName(suggested);
        setStartingLib({ how: "import" });
      }
    });

  const confirmStart = () => {
    if (!starting) return;
    if (starting.how === "clone") cloneDocument();
    else if (starting.how === "import") createDocument(null);
    else createDocument(starting.how === "template" ? docFrom : null);
  };

  /**
   * `?open=<id>` — the way back into a document.
   *
   * A document has no URL of its own: the builder is a portal over the viewport that
   * opens on a click, so "the progress report for 28 Corner Street" was not a thing
   * anybody could link to, and after the list came off this screen it was not a thing
   * anybody could reach either.
   *
   * A query parameter rather than a route, because the document is not a PLACE — it is
   * this screen with something open on it. Consumed on arrival so that closing the
   * builder does not immediately reopen it, and so the URL somebody copies afterwards is
   * the plain screen rather than a link that springs a document on them.
   *
   * Amber, 4 September: *"all documents need to be associated to a job or project and
   * they are listed on that project"* — this is the half that makes a listing clickable.
   */
  const wanted = params.get("open");
  useEffect(() => {
    if (!wanted || open) return;
    let live = true;
    (async () => {
      try {
        const row = await documentStore.get(wanted);
        const meta = await repo.getReportDocument(wanted);
        if (!live) return;
        setOpen({
          lane: "document",
          row,
          subject: { jobId: meta?.jobId ?? null, projectId: meta?.projectId ?? null }
        });
      } catch (e) {
        if (live) setProblem(e instanceof Error ? e.message : "That document could not be opened.");
      } finally {
        if (live) {
          const next = new URLSearchParams(params);
          next.delete("open");
          setParams(next, { replace: true });
        }
      }
    })();
    return () => { live = false; };
    // `params`/`setParams` deliberately out: the effect clears the parameter it reads, and
    // depending on them would re-run it against the URL it just changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, open, documentStore, repo]);

  /**
   * `?for=project:1042` — arriving from a record, with that record already chosen.
   *
   * The other half of the same problem `subjectOptions` describes. "New document" on a
   * project used to drop you on the builder with an empty picker, so the first thing you
   * did was hunt for the project you had just been looking at. Now the link carries it.
   *
   * It opens the naming panel too, because coming from that link IS the decision to make
   * a document; stopping at the Get Started cards would be one more click to say what you
   * have already said. "Start from scratch" is the assumption — the record is known, the
   * template is not, and a template can be chosen on the next document.
   *
   * The parameter is cleared once read, exactly as `?open=` is and for the same reason:
   * cancel the panel and it must stay cancelled, rather than springing back on the next
   * render from a URL nobody updated.
   */
  const wantedFor = params.get("for");
  useEffect(() => {
    if (!wantedFor || open || starting) return;
    const [kind, id] = wantedFor.split(/:(.*)/s);
    if ((kind === "job" || kind === "project") && id) {
      setSubjectKind(kind);
      setSubjectPick(`${kind}:${id}`);
      setStarting({ how: "scratch" });
    }
    const next = new URLSearchParams(params);
    next.delete("for");
    setParams(next, { replace: true });
    // Same reasoning as the effect above: it clears the parameter it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedFor, open, starting]);

  // NO `openDocument` AND NO `removeDocument` ON THIS SCREEN, AND THAT IS DELIBERATE.
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
      const store = libraryStoreFor(libKind);
      const row = await store.create({
        title: name,
        layout: imported ? { widgets: engine.remapIds(imported.widgets) } : { widgets: [] }
      });
      setLibName("");
      setImported(null);
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
      const store = libraryStoreFor(libKind);
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

  /**
   * Keep the wording, under the name its author gave it.
   *
   * Through the same store as a template or a section, so the same trigger decides
   * whether it is signed off on creation: a manager's snippet is in the library at once,
   * a user's waits, and "save a snippet" is not a way around the sign-off.
   *
   * `bump()` is what puts it in the menu — the editor reads `textSnippets`, which comes
   * off the same `listReportTemplates` query the rest of the page does.
   */
  const confirmSaveSnippet = () =>
    run(async () => {
      const name = snippetName.trim();
      if (!name || savingSnippet === null) return;
      await snippetStore.create({ title: name, layout: snippetLayout(savingSnippet) });
      setSavingSnippet(null);
      setSnippetName("");
      bump();
    });

  const closeSaveSnippet = () => {
    if (busy) return;
    setSavingSnippet(null);
    setSnippetName("");
  };

  const closeStartingLib = () => {
    if (busy) return;
    setStartingLib(null);
    setLibName("");
    setCloneFrom(null);
    setImported(null);
  };

  const confirmStartLib = () => {
    if (!startingLib) return;
    if (startingLib.how === "clone") cloneLibraryEntry();
    // "scratch" and "import" both go to createLibraryEntry — it reads `imported` for the
    // layout, so the only difference between them is whether that is set.
    else createLibraryEntry();
  };

  const openLibraryEntry = (t: ReportTemplate) =>
    run(async () => {
      const store = libraryStoreFor(t.kind);
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
              <GetStartedCard
                title="Import A Document"
                hint="A Word file, a PDF or an HTML page you already have. Its headings, prose and tables become blocks you can edit."
                onClick={() => { importLaneRef.current = "documents"; importInputRef.current?.click(); }}
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
                hint={words.scratchHint}
                onClick={() => setStartingLib({ how: "scratch" })}
              />
              <GetStartedCard
                title={`Clone An Existing ${words.One}`}
                hint="Copy one that already works and change what this one needs. The original is untouched."
                disabled={!ofKind.length}
                disabledNote={`No ${words.many} to copy yet`}
                onClick={() => setStartingLib({ how: "clone" })}
              />
              <GetStartedCard
                title="Import A Document"
                hint="A Word file, a PDF or an HTML page you already have. Its headings, prose and tables become blocks you can edit."
                onClick={() => { importLaneRef.current = "library"; importInputRef.current?.click(); }}
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
            title={`No ${words.many} yet`}
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
          : starting?.how === "import" ? "New document from a file"
          : "New empty document"
        }
        onClose={closeStarting}
        footer={
          <>
            <Button
              onClick={confirmStart}
              disabled={
                busy || !docTitle.trim() || !subjectPick
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
          {starting?.how === "import" && imported && (
            <ImportNotes fileName={imported.fileName} notes={imported.notes} />
          )}
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

          {/* WHICH RECORD, AND IT IS REQUIRED.
              *"all documents need to be associated to a job or project and they are
              listed on that project"*. One control rather than two, because it is one
              question — a document is about a job or about a project, never both and
              never neither.

              The column stays nullable on purpose: a document started from a job drawer
              takes its record from where it was opened, and an imported one may arrive
              without a record to attach. What is required is the ANSWER on this screen,
              which is where somebody is choosing freely and could otherwise leave it
              blank without noticing. */}
          <div className="subject-pick">
            <div className="subject-kind" role="radiogroup" aria-label="Is this document about a job or a project?">
              {(["job", "project"] as const).map(k => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={subjectKind === k}
                  className={`subject-kind-option${subjectKind === k ? " is-on" : ""}`}
                  /* Clearing the pick is the point, not tidiness: `job:1042-001` left in
                     state while the Project list is showing would create a document
                     against a job the panel is no longer offering. */
                  onClick={() => { setSubjectKind(k); setSubjectPick(null); }}
                >
                  {k === "job" ? "A job" : "A project"}
                </button>
              ))}
            </div>
            <Select
              aria-label={subjectKind === "project" ? "The project this document is about" : "The job this document is about"}
              placeholder={
                subjectOptions.length
                  ? (subjectKind === "project" ? "Which project…" : "Which job…")
                  : (subjectKind === "project" ? "No projects yet" : "No jobs yet")
              }
              options={subjectOptions}
              value={subjectPick}
              onChange={v => setSubjectPick(v)}
            />
          </div>

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

      {/* ONE file input for both lanes, outside either panel.
          Inside a SidePanel it would unmount with the panel — and the panel is exactly
          what the file picker OPENS, so the element that fired the change would be gone
          before the change was handled. `importLaneRef` is what remembers which card
          asked, because the input cannot know. */}
      <input
        ref={importInputRef}
        type="file"
        accept=".docx,.pdf,.html,.htm,text/html,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        onChange={e => {
          const file = e.target.files?.[0];
          // Cleared immediately, so picking the SAME file twice still fires a change.
          e.target.value = "";
          takeImport(file, importLaneRef.current);
        }}
      />

      {/* Naming a snippet. The wording is already decided — this asks the one thing the
          editor cannot: what to call it in the menu. */}
      <SidePanel
        open={savingSnippet !== null}
        title="Save as a snippet"
        onClose={closeSaveSnippet}
        footer={
          <>
            <Button onClick={confirmSaveSnippet} disabled={busy || !snippetName.trim()}>
              {busy ? "Saving…" : "Save snippet"}
            </Button>
            <Button kind="tertiary" onClick={closeSaveSnippet} disabled={busy}>Cancel</Button>
          </>
        }
      >
        <div className="get-started-card-fields">
          <TextField
            id="new-snippet-name"
            title="Name"
            placeholder="Standard sign-off"
            value={snippetName}
            onChange={setSnippetName}
            autoFocus
            inputAriaLabel="Name for the snippet"
          />

          {/* What is actually being kept, rendered rather than described. Somebody who
              meant to select one paragraph and caught two should be able to see that
              here, before it is in the menu under a name that says otherwise. */}
          <Text type="text3" color="secondary" ellipsis={false}>What you are keeping:</Text>
          <div
            className="snippet-preview"
            /* Sanitised on the way in by the editor, and again here: this is the one
               place the html is put back into the DOM outside the editor, and the rule
               everywhere else in this app is that html is cleaned at the point of use
               rather than trusted because of where it came from. */
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(savingSnippet ?? "") }}
          />

          <Text type="text3" color="secondary" ellipsis={false}>
            {canApprove
              ? "Signed into the library on saving, so everybody can use it."
              : "Saved as your own draft until a manager signs it into the library."}
            {" "}Inserting a snippet copies it — editing it later leaves documents already
            written exactly as they are.
          </Text>
        </div>
      </SidePanel>

      {/* The library's naming panel — the same one, asking the same question. */}
      <SidePanel
        open={startingLib !== null}
        title={
          startingLib?.how === "clone"
            ? `Copy an existing ${words.one}`
            : startingLib?.how === "import" ? `New ${words.one} from a file`
            : `New empty ${words.one}`
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
          {startingLib?.how === "import" && imported && (
            <ImportNotes fileName={imported.fileName} notes={imported.notes} />
          )}
          <TextField
            id="new-library-name"
            title="Name"
            placeholder={words.egName}
            value={libName}
            onChange={setLibName}
            autoFocus
            inputAriaLabel={`Name for a new ${words.one}`}
          />

          {startingLib?.how === "clone" && (
            <Select
              aria-label={`${words.One} to copy`}
              placeholder={`Which ${words.one}…`}
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
