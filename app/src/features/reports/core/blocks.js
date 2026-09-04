// blocks.js — the report block model.
//
// A report is:
//   { title, subtitle?, meta: { generatedAt, ... }, sections: [{ id, title, blocks }] }
//
// Blocks are deliberately few and dumb, so that every renderer (React, Markdown,
// HTML, Word) stays trivial and no renderer can drift from the others. Anything
// app-specific must be expressed as one of these, never as a new renderer.
//
//   { type: 'paragraph',  text }
//   { type: 'subheading', text, color? }        // color renders as a small dot
//   { type: 'keyValues',  items: [{ label, value }] }
//   { type: 'list',       items: [string] }
//   { type: 'table',      headers: [cell], rows: [[cell]] }
//       a cell is a string OR { text, chip } where chip is a tone key; the chip
//       renders as a coloured pill and degrades to plain text everywhere else
//   { type: 'callout',    tone: 'info'|'warn'|'danger', text, repick? }
//       repick marks a stale reference the builder makes clickable
//   { type: 'image',      src, caption }        // URL or data URL
//   { type: 'richText',   html }                // sanitised HTML
//   { type: 'board',      caption, columns: [{ title, color, cards }] }
//       a card is { title, sub?, icon?, chip?: { text, tone } }
//   { type: 'chart',      chartType: 'bar'|'pie', series: [{ label, value, color }], unit?, caption? }
//   { type: 'divider',    pageBreak? }
//   { type: 'button',     text, url }
//   { type: 'embed',      url, caption? }       // iframe in live views only
//   { type: 'flow',       name, stages: [{ name }], accent? }
//       a left-to-right chain of labelled chips
//   { type: 'sketch',     caption, viewBox, nodes, edges }
//       a pure-SVG diagram drawn from stored geometry; no DOM capture needed

export const BLOCK_TYPES = [
  'paragraph', 'subheading', 'keyValues', 'list', 'table', 'callout',
  'image', 'richText', 'board', 'chart', 'divider', 'button', 'embed',
  'flow', 'sketch',
];

export const CHIP_TONES = ['green', 'amber', 'blue', 'orange', 'red', 'grey'];

// ─── Cell + HTML helpers, shared by every serialiser ─────────────────

/** A table cell is a string or { text, chip }. This reads either. */
export const cellText = (c) => (c && typeof c === 'object' ? c.text : c);

/** Plain-text view of rich-text HTML, for Markdown and Word output. */
export const stripHtml = (html = '') =>
  String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** True when rich-text HTML carries no visible content (tags only). */
export const isEmptyHtml = (html) =>
  !String(html || '').replace(/<[^>]*>/g, '').trim() && !/<(img|hr)\b/i.test(String(html || ''));

// ─── Block constructors ──────────────────────────────────────────────
// Use these rather than object literals so a typo in a block type surfaces at
// the call site instead of as a silently unrendered block.

export const paragraph  = (text) => ({ type: 'paragraph', text });
export const subheading = (text, color) => ({ type: 'subheading', text, ...(color ? { color } : {}) });
export const keyValues  = (items) => ({ type: 'keyValues', items });
export const list       = (items) => ({ type: 'list', items });
export const table      = (headers, rows) => ({ type: 'table', headers, rows });
export const callout    = (text, tone = 'info') => ({ type: 'callout', tone, text });
export const image      = (src, caption = '') => ({ type: 'image', src, caption });
export const richText   = (html) => ({ type: 'richText', html });
export const divider    = (pageBreak = false) => ({ type: 'divider', pageBreak });

/** A warning that a block's data reference no longer resolves. The builder
 *  renders these as clickable so the reference can be re-picked. */
export const staleRef = (text) => ({ type: 'callout', tone: 'warn', text, repick: true });

/** An empty report, useful as a fallback so renderers never receive null. */
export const emptyReport = (title = 'Report') => ({
  title,
  subtitle: '',
  meta: { generatedAt: new Date().toISOString() },
  sections: [],
});
