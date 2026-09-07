// import.js — turn a Word or PDF document into builder blocks.
//
// Amber asked for "import a document and turn it into a template", and then for both
// formats: *"Import template as word or pdf"*. They are not the same job, and the
// difference is worth stating before any code, because it decides what this can honestly
// promise.
//
//   .docx  is a STRUCTURED format. A heading is tagged as a heading, a list as a list, a
//          table as a table. Converting it is a translation between two structures, and
//          what comes out is close to what went in.
//
//   .pdf   is a PAGE DESCRIPTION. There are no paragraphs in a PDF — there are glyphs at
//          coordinates in a font at a size. "This line is a heading" is not recorded
//          anywhere; it is INFERRED here, from size and position, and inference is
//          sometimes wrong.
//
// So this module reports what it did as well as doing it. Every importer returns `notes`
// alongside the widgets, and the screen shows them: how many blocks, what was inferred
// rather than read, and what was dropped. A conversion that quietly loses a table is
// worse than one that says it lost a table.
//
// Both parsers are loaded on demand — `mammoth` and `pdfjs-dist` are large, and nobody
// who is not importing should pay for them. Same reasoning as core/docx.js on the way out.

import { sanitizeHtml } from '../components/RichTextEditor.jsx';

/** Every kind this can produce. A file cannot introduce a block the app does not have. */
const uid = () => `w_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

const heading = (text) => ({ id: uid(), kind: 'heading', options: { text } });
const text = (html) => ({ id: uid(), kind: 'text', options: { html } });
const divider = (pageBreak = false) => ({ id: uid(), kind: 'divider', options: { pageBreak } });
const table = (headers, rows) => ({ id: uid(), kind: 'freeTable', options: { headers, rows } });

/**
 * Which importer, decided by extension and then by what the bytes actually are.
 *
 * The extension is a hint, not a fact — a .docx renamed to .pdf is a thing that happens
 * when somebody "converts" a file by retyping its name. So the magic bytes decide:
 * a docx is a zip (PK\x03\x04) and a pdf starts %PDF.
 */
export async function sniffKind(file) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  const isPdf = head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46;
  if (isZip) return 'docx';
  if (isPdf) return 'pdf';
  return null;
}

/**
 * A document in, blocks out.
 *
 * @returns {Promise<{ widgets: object[], notes: string[] }>}
 */
export async function documentToWidgets(file) {
  const kind = await sniffKind(file);
  if (kind === 'docx') return docxToWidgets(file);
  if (kind === 'pdf') return pdfToWidgets(file);
  throw new Error(
    `${file.name} is neither a Word document nor a PDF. Those are the two this can read.`
  );
}

// ─── Word ────────────────────────────────────────────────────────────

/**
 * .docx via mammoth, which converts the document's own structure to html.
 *
 * IMAGES ARE DROPPED, AND COUNTED. mammoth's default inlines every image as a base64
 * data URI, which would put a megabyte of picture inside the layout jsonb — the column
 * a template is stored in, read on every open, and copied into every document made from
 * it. The Image block uploads to a bucket for exactly that reason (0100), and a data URI
 * would route around it. So they are dropped and the note says how many, which is a
 * person's cue to drop them back in properly.
 */
async function docxToWidgets(file) {
  const mammoth = await import('mammoth');
  const notes = [];

  const { value: html, messages } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    // Every image becomes an empty element, which the walker below then ignores.
    { convertImage: mammoth.images.imgElement(() => ({ src: '' })) }
  );

  /**
   * PARSED RAW, SANITISED PER BLOCK — and the order matters, which the check caught.
   *
   * Sanitising the whole document first looked obviously right and silently destroyed
   * every table. `sanitizeHtml` is the RICH TEXT EDITOR's sanitiser: its allowlist is the
   * tags somebody can type into a paragraph, and `table` is not one of them, because a
   * table in this builder is a freeTable block rather than markup inside prose. So
   * DOMPurify removed the `<table>` and kept its text, and the table arrived as a
   * sentence reading "ItemCostSlab18400".
   *
   * `DOMParser` does not execute anything — no script runs, no image loads, no handler
   * fires — so parsing untrusted html is safe. What is not safe is STORING it, and that
   * is where the sanitiser goes: on each prose fragment as it becomes a text block, just
   * below. Table cells never need it because they are read as `textContent`.
   */
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const droppedImages = doc.body.querySelectorAll('img').length;
  if (droppedImages) {
    notes.push(
      `${droppedImages} image${droppedImages === 1 ? ' was' : 's were'} left out. ` +
      'Add them with an Image block, which uploads them properly.'
    );
  }
  doc.body.querySelectorAll('img').forEach(n => n.remove());

  const widgets = [];
  // Consecutive prose is collected and flushed as ONE text block rather than one per
  // paragraph. A twelve-paragraph letter is one thing somebody edits, not twelve blocks
  // to click through — and the builder's own text block holds rich html happily.
  let prose = [];
  const flush = () => {
    // Sanitised HERE, at the point the html is kept, rather than over the whole document
    // before the walk — see the note on DOMParser above for what that cost.
    const html = sanitizeHtml(prose.join('').trim());
    if (html.trim()) widgets.push(text(html));
    prose = [];
  };

  for (const el of Array.from(doc.body.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      flush();
      const t = el.textContent.trim();
      if (t) widgets.push(heading(t));
    } else if (tag === 'table') {
      flush();
      const parsed = tableFrom(el);
      if (parsed) widgets.push(parsed);
      else notes.push('A table had no readable rows and was skipped.');
    } else if (tag === 'hr') {
      flush();
      widgets.push(divider());
    } else if (el.textContent.trim() || el.querySelector('br')) {
      prose.push(el.outerHTML);
    }
  }
  flush();

  // mammoth reports what it could not map — an unrecognised style, usually. Surfaced
  // rather than swallowed, because it names the thing that will look wrong.
  for (const m of messages.slice(0, 5)) {
    if (m.message) notes.push(m.message);
  }

  return { widgets, notes };
}

/** An html <table> as a freeTable's headers and rows, or null when there is nothing in it. */
function tableFrom(el) {
  const rows = Array.from(el.querySelectorAll('tr'))
    .map(tr => Array.from(tr.querySelectorAll('th, td')).map(c => c.textContent.trim()));
  if (!rows.length) return null;
  // The first row is treated as the header, which is what a Word table almost always
  // means by its first row — and if it is not, it is one row to fix rather than a
  // structure to rebuild.
  const [headers, ...body] = rows;
  const width = Math.max(...rows.map(r => r.length));
  const pad = r => Array.from({ length: width }, (_, i) => r[i] ?? '');
  return table(pad(headers), body.length ? body.map(pad) : [pad([])]);
}

// ─── PDF ─────────────────────────────────────────────────────────────

/**
 * .pdf via pdfjs, which gives back positioned text and nothing else.
 *
 * WHAT THIS CAN AND CANNOT DO, because it would be easy to oversell.
 *
 *   A PDF records glyphs at coordinates. There is no paragraph, no heading and no table
 *   in the file — only text that happens to be bigger, or higher, or further left. So
 *   everything below is inference, and it is inference of exactly three things:
 *
 *     lines       — text items sharing a baseline, within a tolerance. Reliable.
 *     paragraphs  — consecutive lines split where the vertical gap grows. Usually right.
 *     headings    — a short line noticeably larger than the document's body size.
 *                   Often right, and wrong on a document that sets its body text in
 *                   several sizes.
 *
 *   TABLES ARE NOT INFERRED AT ALL, and that is deliberate rather than unfinished. Column
 *   detection from x-coordinates guesses wrong on any table with a merged cell or a
 *   wrapped line, and a table that is silently one column out is worse than a paragraph
 *   somebody can see is wrong. A table arrives as its text, and the note says so.
 *
 *   No images either. A PDF's images are resources with no reading order; placing them
 *   would be a guess about where they belong.
 */
async function pdfToWidgets(file) {
  const pdfjs = await import('pdfjs-dist');
  // The worker as a URL Vite will emit. Without this pdfjs looks for a worker at a path
  // that does not exist in a bundled app and falls back to parsing on the main thread,
  // which locks the tab on anything long.
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const notes = [];
  const pages = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    pages.push(linesFrom(content.items));
  }

  const all = pages.flat();
  if (!all.length) {
    throw new Error(
      'No text could be read from that PDF. A scanned page is a picture of text, ' +
      'and reading it would need OCR, which this does not do.'
    );
  }

  // The body size is the most common line size, not the average: an average is dragged
  // up by a title and down by a footnote, and then nothing is "noticeably larger".
  const bodySize = mode(all.map(l => Math.round(l.size)));
  const widgets = [];
  let headings = 0;

  pages.forEach((lines, i) => {
    if (i > 0) widgets.push(divider(true));

    let prose = [];
    const flush = () => {
      if (prose.length) widgets.push(text(`<p>${prose.join(' ')}</p>`));
      prose = [];
    };

    lines.forEach((line, j) => {
      const isHeading = line.size > bodySize * 1.15 && line.text.length < 90;
      if (isHeading) {
        flush();
        widgets.push(heading(line.text));
        headings += 1;
        return;
      }
      prose.push(escapeHtml(line.text));
      // A gap bigger than a line and a half ends the paragraph. Below that it is
      // ordinary leading; above it, somebody pressed return.
      const next = lines[j + 1];
      if (!next || line.y - next.y > line.size * 1.8) flush();
    });
    flush();
  });

  notes.push(
    `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} read. ` +
    `Headings were inferred from text size, not read from the file — ${headings} found. ` +
    'Check them.'
  );
  notes.push(
    'Tables and images do not come across from a PDF. A table arrives as its text, ' +
    'because guessing columns from spacing gets a merged cell wrong silently.'
  );

  return { widgets, notes };
}

/**
 * Text items grouped into lines, top to bottom.
 *
 * pdfjs hands back one item per run of text — often several per visual line, split
 * wherever the font or spacing changed. Items on the same baseline are joined; the
 * tolerance is a fraction of the text height rather than a fixed number of points,
 * because a 24pt title and an 8pt footnote do not sit equally straight.
 */
function linesFrom(items) {
  const placed = items
    .filter(it => typeof it.str === 'string' && it.str.trim())
    .map(it => ({
      text: it.str,
      x: it.transform[4],
      y: it.transform[5],
      // transform[3] is the vertical scale, which is the rendered height of the text.
      size: Math.abs(it.transform[3]) || 10
    }))
    .sort((a, b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  for (const item of placed) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) < Math.max(2, item.size * 0.3)) {
      // A real gap between runs is a space; a hair's breadth is a font change mid-word.
      last.text += (item.x - last.endX > item.size * 0.25 ? ' ' : '') + item.text;
      last.endX = item.x + item.text.length * item.size * 0.5;
      last.size = Math.max(last.size, item.size);
    } else {
      lines.push({
        text: item.text,
        y: item.y,
        size: item.size,
        endX: item.x + item.text.length * item.size * 0.5
      });
    }
  }
  return lines.map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter(l => l.text);
}

/** The most common value. Ties go to the larger, which is the safer body size to assume. */
function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0] ?? 10;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && v > best)) { best = v; bestN = n; }
  }
  return best || 10;
}

/**
 * Escaped, because this text goes into html and it came out of somebody's file.
 *
 * A PDF containing the characters `<script>` is not an attack, but putting them into a
 * text block unescaped would make it one. The docx path does not need this — mammoth
 * emits html and it goes through the sanitiser instead.
 */
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
