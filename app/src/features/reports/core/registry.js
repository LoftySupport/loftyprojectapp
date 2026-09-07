// registry.js — the widget registry.
//
// A report is an ordered list of widgets: { id, kind, options }. A widget
// definition says how its kind appears in the palette, what options it starts
// with, which settings fields it exposes, and how it resolves to blocks.
//
// This file ships only the kinds that are true of ANY application: text,
// headings, images, tables you type into, dividers, buttons, embeds. Every
// data-bound kind ("tools table", "orders by month") lives in an adapter and
// is merged in here by the host app. That is the whole portability boundary:
// core never learns your entities, and you never edit core to add a block.
//
//   const registry = createReportRegistry({ widgets: { ...myWidgets } });
//
// Widget definition:
//   {
//     label,  group,  hint,
//     defaults: (ctx) => options,
//     settings: [field],                       // drives the settings panel
//     resolve: (options, ctx, helpers) => [block],
//     compactable?: boolean,                   // offers the "fit to page" option
//   }
//
// Settings field:
//   { key, type, label, hint?, options?, visible?(options, ctx), ... }
//   type: 'text' | 'textarea' | 'richtext' | 'number' | 'checkbox'
//       | 'select' | 'multiselect' | 'table' | 'image'
//   'image' offers a file picker and a drop target as well as a URL box, and only when
//   the host provides ctx.uploadImage(file) => Promise<url>. It stores a URL either way.
//   `options` is an array of { value, label } or a function (ctx) => that.
//   `visible` hides a field until another option makes it relevant.

import { isEmptyHtml } from './blocks.js';

const uid = () => `w_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

/** Blocks that can be shrunk to fit a printed page. */
export const COMPACTABLE_BLOCK_TYPES = new Set(['table', 'board']);

// ─── Helpers handed to every resolver ────────────────────────────────

export const helpers = {
  info:     (text) => ({ type: 'callout', tone: 'info', text }),
  warn:     (text) => ({ type: 'callout', tone: 'warn', text }),
  danger:   (text) => ({ type: 'callout', tone: 'danger', text }),
  // A stale reference the builder renders as clickable: clicking selects the
  // block and opens its settings so the reference can be re-picked.
  staleRef: (text) => ({ type: 'callout', tone: 'warn', text, repick: true }),
};

// ─── The portable widgets ────────────────────────────────────────────

export const TEXT_GROUP = 'Text & layout';

export const CORE_WIDGETS = {
  heading: {
    label: 'Section heading',
    group: TEXT_GROUP,
    hint: 'Starts a new titled section',
    defaults: () => ({ text: 'New section' }),
    settings: [{ key: 'text', type: 'text', label: 'Heading text' }],
    // Sections are formed structurally by compileReport; this render is only
    // so the heading is visible while editing.
    resolve: (o) => [{ type: 'subheading', text: o?.text || 'Section' }],
  },

  text: {
    label: 'Text',
    group: TEXT_GROUP,
    hint: 'Free-form rich text: summaries, recommendations, context',
    defaults: () => ({ html: '' }),
    settings: [{ key: 'html', type: 'richtext', label: 'Content' }],
    /**
     * PLACEHOLDERS, WITHOUT THIS MODULE KNOWING WHAT ONE IS.
     *
     * `ctx.fillTokens` is supplied by the host, the same way `ctx.expandSection` is. It
     * takes the html and gives back html; everything about WHICH tokens exist and what
     * they resolve to belongs to the app, because a token is a name for one of that
     * app's own fields. This package would be wrong to have an opinion about it.
     *
     * `forExport` is passed through so the host can render an unfilled placeholder one
     * way on the canvas, where it is a thing to go and fix, and another in a document
     * somebody is about to send.
     */
    resolve: (o, ctx, h) => {
      if (isEmptyHtml(o?.html)) {
        return h.forExport ? [] : [helpers.info('Empty text block. Select it and start typing.')];
      }
      const html = typeof ctx?.fillTokens === 'function'
        ? ctx.fillTokens(o.html, { forExport: !!h.forExport })
        : o.html;
      return [{ type: 'richText', html }];
    },
  },

  image: {
    label: 'Image',
    group: TEXT_GROUP,
    hint: 'A picture: logo, site photo, screenshot, diagram',
    defaults: () => ({ url: '', caption: '' }),
    settings: [
      /**
       * `image` rather than `text`, which is what makes the control offer an upload —
       * but only when the host supplies `ctx.uploadImage`. Without it the field renders
       * as the URL box it has always been, so a host with nowhere to put a file is not
       * shown a button that cannot work.
       */
      { key: 'url', type: 'image', label: 'Image', placeholder: 'https://…' },
      { key: 'caption', type: 'text', label: 'Caption' },
    ],
    resolve: (o, ctx, h) => (!o?.url
      ? (h.forExport ? [] : [helpers.info('No image yet. Select this block and drop one in, or paste a URL.')])
      : [{ type: 'image', src: o.url, caption: o.caption || '' }]),
  },

  freeTable: {
    label: 'Table',
    group: TEXT_GROUP,
    hint: 'Editable table: add your own rows and columns',
    defaults: () => ({ headers: ['Column 1', 'Column 2'], rows: [['', ''], ['', '']] }),
    settings: [{ key: 'rows', type: 'table', label: 'Table contents' }],
    compactable: true,
    resolve: (o) => {
      const headers = o?.headers?.length ? o.headers : ['Column 1'];
      const rows = (o?.rows || []).map(r => headers.map((_, i) => r?.[i] ?? ''));
      return [{ type: 'table', headers, rows }];
    },
  },

  divider: {
    label: 'Divider',
    group: TEXT_GROUP,
    hint: 'Horizontal rule, or a page break when printing',
    defaults: () => ({ pageBreak: false }),
    settings: [{ key: 'pageBreak', type: 'checkbox', label: 'Start a new page here when printing' }],
    resolve: (o) => [{ type: 'divider', pageBreak: !!o?.pageBreak }],
  },

  button: {
    label: 'Button / link',
    group: TEXT_GROUP,
    hint: 'A clickable button linking out: booking link, proposal, doc',
    defaults: () => ({ text: 'View link', url: '' }),
    settings: [
      { key: 'text', type: 'text', label: 'Button text' },
      { key: 'url', type: 'text', label: 'Links to', placeholder: 'https://…' },
    ],
    resolve: (o, ctx, h) => (!o?.url
      ? (h.forExport ? [] : [helpers.info('Set a URL in this block’s settings.')])
      : [{ type: 'button', text: o.text || o.url, url: o.url }]),
  },

  embed: {
    label: 'Embed',
    group: TEXT_GROUP,
    hint: 'Embed a video, form or external page by URL',
    defaults: () => ({ url: '', caption: '' }),
    settings: [
      { key: 'url', type: 'text', label: 'Embed URL', placeholder: 'https://…' },
      { key: 'caption', type: 'text', label: 'Caption' },
    ],
    // Embeds cannot print. Every non-live serialiser degrades them to a link.
    resolve: (o, ctx, h) => (!o?.url
      ? (h.forExport ? [] : [helpers.info('Set a URL in this block’s settings.')])
      : [{ type: 'embed', url: o.url, caption: o.caption || '' }]),
  },
};

// ─── Registry construction ───────────────────────────────────────────

/**
 * Build a registry from the core widgets plus any adapter widgets.
 *
 * @param {object}  [config]
 * @param {object}  [config.widgets]      adapter widget definitions, keyed by kind
 * @param {string[]}[config.groups]       palette group order; unknown groups are appended
 * @param {boolean} [config.includeCore]  set false to drop the built-in text widgets
 */
export function createReportRegistry({ widgets = {}, groups = [], includeCore = true } = {}) {
  const types = { ...(includeCore ? CORE_WIDGETS : {}), ...widgets };

  for (const [kind, def] of Object.entries(types)) {
    if (typeof def?.resolve !== 'function') {
      throw new Error(`Report widget "${kind}" has no resolve(options, ctx, helpers) function.`);
    }
    if (!def.label || !def.group) {
      throw new Error(`Report widget "${kind}" needs both a label and a group for the palette.`);
    }
  }

  const present = [...new Set(Object.values(types).map(d => d.group))];
  const ordered = [
    ...groups.filter(g => present.includes(g)),
    ...present.filter(g => !groups.includes(g)),
  ];

  return {
    types,
    groups: ordered,
    kinds: Object.keys(types),
    get: (kind) => types[kind] || null,
    has: (kind) => Object.prototype.hasOwnProperty.call(types, kind),
    kindsInGroup: (group) => Object.keys(types).filter(k => types[k].group === group),
    newId: uid,
  };
}
