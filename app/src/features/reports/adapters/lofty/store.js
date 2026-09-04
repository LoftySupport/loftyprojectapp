// store.js — the module's ReportStore, backed by the app's repository seam.
//
// The package ships a Supabase store that takes a client and talks to a table. This app
// does not let a component hold a Supabase client (CLAUDE.md: "No component imports the
// Supabase client… everything reads through the repository seam"), so this store takes
// the repository instead and speaks `report_templates` through it. Same contract, one
// layer further back — which is also what lets the whole Template Builder screen render
// against `createStubRepository()` in a build with no backend, where every write says
// what it needs rather than pretending to succeed.
//
// The contract is `docs/CONTRACTS.md` in the module. What is implemented here:
//
//   list, get, create, save, remove     required — all present
//   createShareLink, deleteShareLink    NOT implemented, so the Share panel is hidden
//   fetchShared                         NOT implemented, so there is no public read path
//   listTemplates, saveTemplate         NOT implemented — see below
//
// The optional methods are feature-detected by the builder rather than assumed, so their
// absence hides a control instead of breaking one.
//
// WHY "SAVE AS TEMPLATE" IS NOT WIRED
//
//   In the module a report is the thing and a template is a reusable copy of its layout.
//   Here the row IS the template: Tools → Template Builder builds templates, and a
//   second "save this template as a template" would be two names for one row. The
//   builder hides the button when `saveTemplate` is absent, so nothing has to be
//   removed from its UI to say so.
//
// WHY THERE ARE NO SHARE LINKS
//
//   A share link is an anonymous read path around RLS, served by an edge function with a
//   service-role key. Nothing has asked for one, and RLS is this app's security boundary
//   — so the honest position is not to offer it rather than to offer it half-built. The
//   module's own guidance says the same thing: "Sharing last. It is optional, and it is
//   the part with real security consequences."

import { EMPTY_REPORT_TEMPLATE_LAYOUT } from '../../../../data/types';
import { LOFTY_THEME } from './theme.js';

/**
 * A `report_templates` row as the builder wants it.
 *
 * `title` and `name` are the same string under two names — the module calls it a title,
 * the database calls it a name — and this is the only place that translation happens.
 *
 * `shareToken` and `hasPassword` are reported as absent rather than omitted: the panel
 * that reads them is hidden anyway, and a defined `false` is a clearer statement than an
 * `undefined` that could be read as "not loaded yet".
 */
const toRow = (t) => ({
  id: t.id,
  title: t.name,
  // The theme is defaulted HERE rather than left to the module, whose own default is
  // `modern` — a black-and-lime theme that is nobody's brand. A template with no theme
  // recorded is one built before a theme was chosen, and Lofty's is the right answer for
  // it. Anything that has a theme keeps it: switching a saved report's look under its
  // author is worse than an unbranded default.
  layout: { theme: LOFTY_THEME.key, ...(t.layout || EMPTY_REPORT_TEMPLATE_LAYOUT) },
  scopeId: null,
  shareToken: null,
  hasPassword: false,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  // Not part of the module's contract; carried through so the list screen can say who
  // last changed a template that everybody shares.
  createdBy: t.createdBy,
  updatedBy: t.updatedBy
});

/**
 * @param {object} repo the app repository (`useRepository()`)
 */
export function createRepositoryTemplateStore(repo) {
  return {
    async list() {
      return (await repo.listReportTemplates()).map(toRow);
    },

    async get(id) {
      const row = await repo.getReportTemplate(id);
      // The contract says get() throws when the row is missing, and the builder relies
      // on that: a null here would render an empty document over somebody's deleted
      // template and autosave the emptiness back.
      if (!row) throw new Error('That template no longer exists.');
      return toRow(row);
    },

    async create({ title = 'Untitled template', layout = { widgets: [] } } = {}) {
      return toRow(await repo.createReportTemplate({
        name: title,
        layout: { theme: LOFTY_THEME.key, ...layout }
      }));
    },

    // Partial by design. The builder debounces the title and the layout onto separate
    // saves, so a store that wrote whole rows would blank whichever one this call did
    // not carry — the failure the module's docs single out.
    async save(id, patch) {
      const next = {};
      if (patch.title !== undefined) next.name = patch.title;
      if (patch.layout !== undefined) next.layout = patch.layout;
      return toRow(await repo.updateReportTemplate(id, next));
    },

    async remove(id) {
      await repo.deleteReportTemplate(id);
      return { ok: true };
    }
  };
}
