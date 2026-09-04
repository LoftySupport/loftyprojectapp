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
// WHAT IS NOT IMPLEMENTED, AND WHY THAT IS THE INTERFACE WORKING
//
//   createShareLink / deleteShareLink / fetchShared — absent, so the builder's Share
//   panel is hidden. Reading a document by token means answering somebody with no
//   session, which cannot go through RLS; it needs the `report-share` endpoint, and that
//   is written but not deployed. The moment it is, these three methods are the whole of
//   the wiring and no component changes.
//
// The builder feature-detects every optional method rather than assuming it, so an
// absence hides a control instead of breaking one.

import { EMPTY_REPORT_TEMPLATE_LAYOUT } from '../../../../data/types';
import { LOFTY_THEME } from './theme.js';

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
 */
export function createDocumentStore(repo, subject = {}) {
  return {
    async list() {
      return (await repo.listReportDocuments()).map(documentToRow);
    },

    async get(id) {
      const row = await repo.getReportDocument(id);
      if (!row) throw new Error('That document no longer exists.');
      return documentToRow(row);
    },

    async create({ title = 'Untitled document', layout = { widgets: [] }, templateId = null } = {}) {
      return documentToRow(await repo.createReportDocument({
        title,
        layout: withTheme(layout),
        templateId,
        jobId: subject.jobId ?? null,
        projectId: subject.projectId ?? null
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
