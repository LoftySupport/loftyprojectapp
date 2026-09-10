// store.js — the module's ReportStore contract, twice, over the repository seam.
//
// The package ships a Supabase store that takes a client and talks to one table. This app
// does not let a component hold a Supabase client (CLAUDE.md: "No component imports the
// Supabase client… everything reads through the repository seam"), so these take the
// repository instead. Same contract, one layer further back — which is also what lets the
// whole screen render against `createStubRepository()` in a build with no backend, where
// every write says what it needs rather than pretending to succeed.
//
// TWO STORES, BECAUSE THERE ARE TWO THINGS
//
//   the library store    a template or a section: written once, used many times, and in
//                        the library only once a manager has signed it off
//   the document store   one thing somebody made and may edit freely
//
// The builder does not know the difference and does not need to: it is handed whichever
// store matches what is open. That is the whole reason the module's contract is a store
// rather than a table name.
//
// FEATURE DETECTION IS REAL HERE, NOT DECORATIVE
//
//   The builder shows its Share panel only when the store has BOTH createShareLink and
//   deleteShareLink. So they are attached only when this store was given a `compile`
//   function — because without one there is nothing to snapshot, and a Share button that
//   appears and then apologises is worse than no Share button.
//
//   The library store never gets them: you share a document you sent, not a template
//   somebody might start from.

import { EMPTY_REPORT_TEMPLATE_LAYOUT } from '../../../../data/types';
import { hashSharePassword } from '../../../../data/sharePassword';
import { LOFTY_THEME } from './theme.js';

/**
 * How long a share link lives.
 *
 * The database makes an expiry mandatory — a link nobody revokes is a link still open in
 * two years — and the module's Share panel does not ask for one, so the number is decided
 * here. Thirty days is long enough for a client to read a progress report and come back
 * to it, and short enough that a link forgotten in an email thread stops working before
 * the job it describes is finished.
 *
 * It is NOT hidden: the panel prints the date beside the link, and re-sharing makes a new
 * one. Change it here and nowhere else.
 */
const SHARE_DAYS = 30;

/**
 * A stored row as the builder wants it.
 *
 * `title` and `name` are the same string under two names — the module calls it a title,
 * the library calls it a name — and this is the only place that translation happens.
 *
 * The theme is defaulted HERE rather than left to the module, whose own default is
 * `modern`, a black-and-lime theme that is nobody's brand. Anything that already has a
 * theme keeps it: switching a saved document's look under its author is worse than an
 * unbranded default.
 */
const withTheme = (layout) => ({
  theme: LOFTY_THEME.key,
  ...(layout || EMPTY_REPORT_TEMPLATE_LAYOUT)
});

const templateToRow = (t) => ({
  id: t.id,
  title: t.name,
  layout: withTheme(t.layout),
  scopeId: null,
  shareToken: null,
  hasPassword: false,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  // Not part of the module's contract; carried through so the screen around the builder
  // can say whose it is, whether it is in the library yet, and who signed it off.
  kind: t.kind,
  scope: t.scope,
  teamId: t.teamId,
  description: t.description,
  approvedAt: t.approvedAt,
  approvedBy: t.approvedBy,
  isActive: t.isActive,
  createdBy: t.createdBy,
  updatedBy: t.updatedBy
});

const documentToRow = (d) => ({
  id: d.id,
  title: d.title,
  layout: withTheme(d.layout),
  scopeId: null,
  shareToken: d.shareToken,
  hasPassword: d.hasSharePassword,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  templateId: d.templateId,
  jobId: d.jobId,
  projectId: d.projectId,
  shareExpiresAt: d.shareExpiresAt,
  // Publication (0104). Carried on the row so the builder can watermark live: its
  // autosave is what reverts a published document to a draft, and a page waiting for a
  // list refresh would show a clean preview of something that had just become a draft.
  publishedAt: d.publishedAt,
  publishedUrl: d.publishedUrl,
  createdBy: d.createdBy,
  updatedBy: d.updatedBy
});

/**
 * The library: templates and sections.
 *
 * @param {object} repo the app repository (`useRepository()`)
 * @param {'template'|'section'} kind which half of the library this store is over
 */
export function createLibraryStore(repo, kind = 'template') {
  return {
    async list() {
      return (await repo.listReportTemplates({ kind })).map(templateToRow);
    },

    async get(id) {
      const row = await repo.getReportTemplate(id);
      // The contract says get() throws when the row is missing, and the builder relies
      // on it: a null here would render an empty document over somebody's deleted
      // template and autosave the emptiness back.
      if (!row) throw new Error('That is no longer in the library.');
      return templateToRow(row);
    },

    async create({ title = 'Untitled', layout = { widgets: [] } } = {}) {
      return templateToRow(await repo.createReportTemplate({
        kind,
        name: title,
        layout: withTheme(layout)
      }));
    },

    // Partial by design. The builder debounces the title and the layout onto separate
    // saves, so a store that wrote whole rows would blank whichever one this call did
    // not carry — the failure the module's docs single out.
    async save(id, patch) {
      const next = {};
      if (patch.title !== undefined) next.name = patch.title;
      if (patch.layout !== undefined) next.layout = patch.layout;
      return templateToRow(await repo.updateReportTemplate(id, next));
    },

    async remove(id) {
      await repo.deleteReportTemplate(id);
      return { ok: true };
    }
  };
}

/**
 * The documents made from the library.
 *
 * @param {object} repo
 * @param {object} [subject] what a NEW document is about — { jobId } or { projectId }.
 *   Only used by create(); an existing document carries its own.
 * @param {object} [opts]
 * @param {(doc: object) => Promise<object>} [opts.compile] turn a stored document into the
 *   compiled snapshot a share link serves. Omit it and the store has no share methods at
 *   all, so the builder hides the Share panel rather than offering a button that fails.
 */
export function createDocumentStore(repo, subject = {}, { compile } = {}) {
  const shareMethods = buildShareMethods(repo, compile);
  return {
    async list() {
      return (await repo.listReportDocuments()).map(documentToRow);
    },

    async get(id) {
      const row = await repo.getReportDocument(id);
      if (!row) throw new Error('That document no longer exists.');
      return documentToRow(row);
    },

    /**
     * @param jobId,projectId the record this document is ABOUT, overriding the subject
     *   the store was built with.
     *
     * Both, because the store is built once per screen while the record is chosen per
     * document. Amber, 4 September: *"all documents need to be associated to a job or
     * project and they are listed on that project"* — so the Tools screen, which builds
     * one store and then makes many documents, has to say which record each one is for
     * at the moment it is created. `undefined` falls back to the store's subject, which
     * is what a builder opened FROM a job already carries.
     */
    async create({
      title = 'Untitled document',
      layout = { widgets: [] },
      templateId = null,
      jobId,
      projectId
    } = {}) {
      return documentToRow(await repo.createReportDocument({
        title,
        layout: withTheme(layout),
        templateId,
        jobId: jobId !== undefined ? jobId : (subject.jobId ?? null),
        projectId: projectId !== undefined ? projectId : (subject.projectId ?? null)
      }));
    },

    async save(id, patch) {
      const next = {};
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.layout !== undefined) next.layout = patch.layout;
      return documentToRow(await repo.updateReportDocument(id, next));
    },

    async remove(id) {
      await repo.deleteReportDocument(id);
      return { ok: true };
    },

    ...shareMethods,

    /**
     * "Save as template" — the builder's own button, and it lands exactly where Amber
     * asked it to: *"any user and above can create a template but a manager and above
     * must approve it before it is saved as a template in the template library"*.
     *
     * So this writes a `report_templates` row and the database decides what happens
     * next: a manager's proposal is approved by existing, and everybody else's waits
     * where only they can see it. The builder's own copy already tells the author that
     * references get re-picked when the layout is reused elsewhere; what it cannot know
     * is the sign-off, so the screen says that part.
     *
     * `engine.remapIds` has already given the widgets fresh ids by the time this is
     * called, so the new template shares no block id with the document it came from.
     */
    async saveTemplate({ name, type = 'template', data }) {
      const kind = type === 'section' ? 'section' : 'template';
      return await repo.createReportTemplate({
        kind,
        name,
        layout: withTheme({ widgets: data?.widgets || [] })
      });
    }
  };
}

/**
 * The two share methods, built only when the screen can compile a document.
 *
 * Split out so the object above reads as one thing: `...shareMethods` either adds both or
 * adds neither, which is exactly the condition the builder checks.
 */
function buildShareMethods(repo, compile) {
  if (typeof compile !== 'function') return {};
  return {
    /**
     * Make a share link — a URL a client opens with no Lofty login.
     *
     * THE COMPILE HAPPENS HERE, IN THE BROWSER, AND THAT IS THE SECURITY DESIGN.
     *
     * `compile` is handed in by the screen because it needs the widget registry and the
     * ctx, which this store has no business holding. It runs under the signed-in person's
     * own session, so the document it produces contains only what their own RLS let them
     * read — no margin they cannot see, no job they are not on. The endpoint that serves
     * the link then has nothing to query and nothing to filter, which is the class of bug
     * it removes rather than guards against.
     *
     * The module's panel passes `undefined` for the password when the box is unticked and
     * a string when it is ticked. `null` is sent in the first case so that re-sharing a
     * link whose box is unticked actually clears the old password rather than silently
     * keeping it.
     */
    async createShareLink(id, password) {
      const current = await repo.getReportDocument(id);
      if (!current) throw new Error('That document no longer exists.');

      const snapshot = await compile(current);
      if (!snapshot?.report?.sections) {
        // The database refuses this too, but failing here names the actual problem
        // instead of surfacing a constraint violation to somebody clicking Share.
        throw new Error('That document could not be prepared for sharing.');
      }

      const expiresAt = new Date(Date.now() + SHARE_DAYS * 86_400_000).toISOString();
      const passwordHash = password ? await hashSharePassword(password) : null;

      return documentToRow(await repo.shareReportDocument(id, { expiresAt, snapshot, passwordHash }));
    },

    /** Revoke it. The snapshot stays behind, so what was sent is still answerable. */
    async deleteShareLink(id) {
      return documentToRow(await repo.unshareReportDocument(id));
    }
  };
}
