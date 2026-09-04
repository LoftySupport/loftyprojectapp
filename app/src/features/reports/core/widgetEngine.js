// widgetEngine.js — turning a widget list into a report model.
//
// Data widgets store a REFERENCE, never a copy: "the orders table grouped by
// month", not the rows themselves. Every render resolves those references
// against live context, so a report reopened in six months shows current
// numbers while the prose the author wrote is kept verbatim. This is the single
// most important behaviour in the package; preserve it in any adapter you write.
//
// Pure: no React, no network, no storage. Node-testable.

import { COMPACTABLE_BLOCK_TYPES, helpers } from './registry.js';

/** A widget whose kind is not registered still has to render as something. */
const unknownKind = (kind) => [helpers.warn(`Unknown block type “${kind}”. It may come from a plugin that is not installed.`)];

/**
 * Create a widget of `kind` with its default options for this context.
 * Returns null for an unregistered kind, so callers can guard.
 */
export function createWidget(registry, kind, ctx = {}) {
  const def = registry.get(kind);
  if (!def) return null;
  let options;
  try {
    options = def.defaults ? def.defaults(ctx) : {};
  } catch {
    // A defaults() that inspects context must never block adding a block.
    options = {};
  }
  return { id: registry.newId(), kind, options: options || {} };
}

/** Deep-copy a widget list with fresh ids (the "duplicate report" action). */
export function remapWidgetIds(registry, widgets = []) {
  return widgets.map(w => ({ ...w, id: registry.newId(), options: { ...(w.options || {}) } }));
}

/**
 * Resolve one widget to blocks.
 *
 * @param {object}  registry
 * @param {object}  widget                { id, kind, options }
 * @param {object}  ctx                   whatever your adapters read from
 * @param {object}  [opts]
 * @param {boolean} [opts.forExport]      true when compiling a final document:
 *   unfinished blocks render as nothing rather than as an instruction to the
 *   author, so a half-built block never reaches a client.
 */
export function resolveWidget(registry, widget, ctx = {}, { forExport = false } = {}) {
  const def = registry.get(widget?.kind);
  if (!def) return unknownKind(widget?.kind);

  let blocks;
  try {
    blocks = def.resolve(widget.options || {}, ctx, { ...helpers, forExport, widget }) || [];
  } catch (e) {
    // One malformed reference must never take down the whole document.
    return [helpers.warn(
      `This block failed to render (${e?.message || 'unknown error'}). Try re-picking its data in settings.`,
    )];
  }
  if (!Array.isArray(blocks)) return [helpers.warn(`Block “${widget.kind}” returned something that is not a list of blocks.`)];

  // "Fit to page": a widget-level layout option that shrinks wide tables and
  // boards so they fit the printed page instead of running off it.
  if (widget.options?.compact) {
    blocks = blocks.map(b => (COMPACTABLE_BLOCK_TYPES.has(b.type) ? { ...b, compact: true } : b));
  }
  return blocks;
}

/**
 * Compile a widget list into a report model ready for any renderer.
 *
 * Heading widgets are structural: each one starts a new section. Blocks before
 * the first heading land in an untitled lead-in section.
 *
 * @param {object} registry
 * @param {{title?: string, subtitle?: string, meta?: object}} report
 * @param {Array}  widgets
 * @param {object} ctx
 */
export function compileReport(registry, { title, subtitle, meta } = {}, widgets = [], ctx = {}) {
  const sections = [];
  let current = { id: 'sec-intro', title: '', blocks: [] };
  const flush = () => { if (current.blocks.length || current.title) sections.push(current); };

  for (const w of widgets) {
    if (w.kind === 'heading') {
      flush();
      current = { id: `sec-${w.id}`, title: String(w.options?.text || 'Section'), blocks: [] };
      continue;
    }
    current.blocks.push(...resolveWidget(registry, w, ctx, { forExport: true }));
  }
  flush();

  return {
    title: title || 'Untitled report',
    subtitle: subtitle || '',
    meta: {
      generatedAt: new Date().toISOString(),
      documentType: 'custom',
      ...(meta || {}),
    },
    sections,
  };
}

/**
 * Re-point a saved layout at a different data scope.
 *
 * A report saved as a template carries references belonging to wherever it was
 * built (this project, that customer). Inserting it elsewhere must re-pick
 * those references rather than render a page of stale-reference warnings.
 *
 * A widget opts in by declaring `scopedOptions: ['projectId', …]`. Widgets that
 * hold no references pass through untouched.
 */
export function adaptWidgets(registry, widgets = [], ctx = {}) {
  return widgets.map(w => {
    const def = registry.get(w.kind);
    const scoped = def?.scopedOptions || [];
    if (!scoped.length) return w;
    if (!scoped.some(k => w.options?.[k] != null)) return w;

    const fresh = createWidget(registry, w.kind, ctx);
    const override = {};
    for (const key of scoped) {
      override[key] = fresh?.options && key in fresh.options ? fresh.options[key] : null;
    }
    return { ...w, options: { ...w.options, ...override } };
  });
}

/**
 * Build a starting layout from a named seed, so an author begins with a
 * structured draft instead of a blank page. Seeds are supplied by adapters:
 *   { key, label, hint, build: (ctx) => [{ kind, options }] }
 */
export function seedWidgets(registry, seeds, key, ctx = {}) {
  const seed = (seeds || []).find(s => s.key === key);
  if (!seed) return [];
  return (seed.build(ctx) || [])
    .filter(w => registry.has(w.kind))
    .map(w => ({
      id: registry.newId(),
      kind: w.kind,
      options: { ...(createWidget(registry, w.kind, ctx)?.options || {}), ...(w.options || {}) },
    }));
}

/**
 * Bind a registry once and get the engine as plain methods. This is what a host
 * app usually holds, and what the components accept.
 */
export function createReportEngine(registry, { seeds = [] } = {}) {
  return {
    registry,
    seeds,
    createWidget: (kind, ctx) => createWidget(registry, kind, ctx),
    remapIds: (widgets) => remapWidgetIds(registry, widgets),
    resolve: (widget, ctx, opts) => resolveWidget(registry, widget, ctx, opts),
    compile: (report, widgets, ctx) => compileReport(registry, report, widgets, ctx),
    adapt: (widgets, ctx) => adaptWidgets(registry, widgets, ctx),
    seed: (key, ctx) => seedWidgets(registry, seeds, key, ctx),
  };
}
