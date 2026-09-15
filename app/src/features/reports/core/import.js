// import.js — turn a Word, PDF or HTML document into builder blocks.
//
// Amber asked for "import a document and turn it into a template", then for both
// formats — *"Import template as word or pdf"* — then for a third: *"can we import a
// html as well?"*. They are not the same job, and the difference is worth stating before
// any code, because it decides what each can honestly promise.
//
//   .docx  is a STRUCTURED format. A heading is tagged as a heading, a list as a list, a
//          table as a table. Converting it is a translation between two structures, and
//          what comes out is close to what went in.
//
//   .html  is structured too, and shares the same walker — mammoth converts .docx TO
//          html, so the second format was most of the third already. What it adds is
//          NESTING: mammoth emits a flat run of elements, and real html wraps everything
//          in divs. See CONTAINERS.
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
// The two heavy parsers load on demand — `mammoth` and `pdfjs-dist` are large, and
// nobody who is not importing should pay for them. Same reasoning as core/docx.js on the
// way out. The html path needs neither: the browser already has a parser.

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

  /**
   * HTML HAS NO MAGIC BYTES, so it is the one format here that cannot be identified the
   * way the other two are. It is checked LAST and by content, and only after the two
   * that can be identified properly have said no — otherwise a guess would get first
   * refusal over a fact.
   *
   * A leading `<!doctype html>` or `<html` is conclusive. Beyond that, the test is
   * whether the start of the file contains a recognisable html tag, which is deliberately
   * narrow: a `.txt` shopping list is not an import, and matching any `<…>` would make
   * one out of anything containing a less-than sign.
   */
  const start = (await file.slice(0, 2048).text()).trim().toLowerCase();
  if (/^<!doctype\s+html/.test(start) || /^<html[\s>]/.test(start)) return 'html';
  if (/<(p|div|h[1-6]|table|body|section|article|span|ul|ol|br)[\s>/]/.test(start)) return 'html';
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
  if (kind === 'html') return htmlFileToWidgets(file);
  throw new Error(
    `${file.name} is not a Word document, a PDF or an HTML file. Those are the three this can read.`
  );
}

// ─── The shared html walker ──────────────────────────────────────────

/**
 * Elements that CONTAIN content rather than being content.
 *
 * This list is the whole difference between the Word path and the HTML one. mammoth
 * emits a flat run of `<p>`, `<h2>` and `<table>` at the top level, so walking
 * `body.children` was enough. **Real HTML is nested** — a letter exported from anything
 * arrives wrapped in `<div class="page"><div class="content">…`, and a walker that only
 * looked at the top level would find one div, treat it as prose, and produce a single
 * text block holding the entire document.
 *
 * So a container is descended into rather than kept. Everything not on this list is
 * content, including a `<div>` that holds only text — which is how a great deal of html
 * writes a paragraph.
 */
const CONTAINERS = new Set([
  'div', 'section', 'article', 'main', 'header', 'footer', 'aside',
  'body', 'figure', 'form', 'fieldset', 'nav'
]);

/** Never content, whatever they contain. `<script>` most of all. */
const IGNORED = new Set(['script', 'style', 'noscript', 'template', 'link', 'meta', 'head', 'title']);

/**
 * One html document into builder blocks. Used by BOTH importers.
 *
 * @param {string}  html
 * @param {object}  opts
 * @param {boolean} opts.keepImageUrls  true for an html file, false for a .docx.
 *
 * WHY THAT FLAG EXISTS. An image means two different things in the two formats. In a
 * .docx it is bytes inside the zip, and mammoth's default inlines them as base64 data
 * URIs — a megabyte of picture inside the layout jsonb, which is read on every open and
 * copied into every document made from the template. In html it is already a URL, which
 * is exactly what the Image block stores. So one is dropped and the other is kept, and
 * neither is a compromise.
 */
export function htmlToWidgets(html, { keepImageUrls = false } = {}) {
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
   * is where the sanitiser goes: on each prose fragment as it becomes a text block.
   */
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const notes = [];
  const widgets = [];

  /**
   * DEFENCE IN DEPTH, not the thing that keeps script and style out — and the comment
   * here said otherwise until the mutation was run.
   *
   * Removing this line leaves "script, style and title text never become content" green.
   * DOMPurify drops `<script>` and `<style>` along with their CONTENTS, so the CSS and
   * the JS never survive the sanitiser whether they are removed here or not; and `<title>`
   * lives in `<head>`, which the walk never reaches.
   *
   * It stays for two smaller reasons that are true. It keeps markup out of `prose` that
   * is only going to vanish a moment later, so a paragraph is not split around nothing.
   * And it does not depend on the editor's allowlist staying as it is — `sanitizeHtml`
   * belongs to the rich text editor and is tuned for what a person may type, not for what
   * an imported file may contain, and the day `style` is allowed inline for some good
   * reason this is what stops a stylesheet arriving as a paragraph.
   */
  doc.querySelectorAll([...IGNORED].join(',')).forEach(n => n.remove());

  let droppedImages = 0;
  let relativeImages = 0;

  // Consecutive prose is collected and flushed as ONE text block rather than one per
  // paragraph. A twelve-paragraph letter is one thing somebody edits, not twelve blocks
  // to click through — and the builder's own text block holds rich html happily.
  let prose = [];
  const flush = () => {
    // Sanitised HERE, at the point the html is kept, rather than over the whole document
    // before the walk — see the note on DOMParser above for what that cost.
    const kept = sanitizeHtml(prose.join('').trim());
    if (kept.trim()) widgets.push(text(kept));
    prose = [];
  };

  const walk = (parent) => {
    for (const el of Array.from(parent.children)) {
      const tag = el.tagName.toLowerCase();

      if (IGNORED.has(tag)) continue;

      if (tag === 'img') {
        const src = el.getAttribute('src') || '';
        // Only an absolute http(s) URL is worth keeping. A relative one resolved against
        // nothing — the file came off somebody's disk, not off a server — and a data URI
        // is the megabyte-in-the-column problem the flag above exists to avoid.
        if (keepImageUrls && /^https?:\/\//i.test(src)) {
          flush();
          widgets.push({
            id: uid(),
            kind: 'image',
            options: { url: src, caption: el.getAttribute('alt') || '' }
          });
        } else if (src && !/^https?:\/\//i.test(src)) {
          relativeImages += 1;
        } else {
          droppedImages += 1;
        }
        continue;
      }

      if (/^h[1-6]$/.test(tag)) {
        flush();
        const t = el.textContent.trim();
        // h4 to h6 become headings too. The builder has one heading block rather than
        // six levels, so depth is lost — but a sub-sub-heading rendered as a paragraph
        // reads as prose that forgot to be a sentence, which is worse than a flat one.
        if (t) widgets.push(heading(t));
        continue;
      }

      if (tag === 'table') {
        flush();
        const parsed = tableFrom(el);
        if (parsed) widgets.push(parsed);
        else notes.push('A table had no readable rows and was skipped.');
        continue;
      }

      if (tag === 'hr') {
        flush();
        widgets.push(divider());
        continue;
      }

      // A container holds content; it is not content. Descend, and flush first so that
      // prose before the container does not run into prose inside it.
      if (CONTAINERS.has(tag)) {
        // …unless it holds no element children at all, in which case it IS a paragraph.
        // A great deal of html writes one as a bare <div>.
        if (el.children.length === 0) {
          if (el.textContent.trim()) prose.push(`<p>${escapeHtml(el.textContent.trim())}</p>`);
        } else {
          walk(el);
        }
        continue;
      }

      if (el.textContent.trim() || el.querySelector('br')) prose.push(el.outerHTML);
    }
  };

  walk(doc.body);
  flush();

  if (droppedImages) {
    notes.push(
      `${droppedImages} image${droppedImages === 1 ? ' was' : 's were'} left out. ` +
      'Add them with an Image block, which uploads them properly.'
    );
  }
  if (relativeImages) {
    notes.push(
      `${relativeImages} image${relativeImages === 1 ? '' : 's'} pointed at a file next to ` +
      'the document rather than at a web address, so there was nothing to link to.'
    );
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

// ─── Word ────────────────────────────────────────────────────────────

/**
 * .docx via mammoth, which converts the document's own structure to html — and then the
 * shared walker turns that html into blocks.
 *
 * Images are dropped and counted rather than kept; `htmlToWidgets` says why.
 */
async function docxToWidgets(file) {
  const mammoth = await import('mammoth');

  const { value: html, messages } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    // Every image becomes an empty element, which the walker then counts and skips.
    { convertImage: mammoth.images.imgElement(() => ({ src: '' })) }
  );

  const { widgets, notes } = htmlToWidgets(html, { keepImageUrls: false });

  // mammoth reports what it could not map — an unrecognised style, usually. Surfaced
  // rather than swallowed, because it names the thing that will look wrong.
  for (const m of messages.slice(0, 5)) {
    if (m.message) notes.push(m.message);
  }

  return { widgets, notes };
}

// ─── HTML ────────────────────────────────────────────────────────────

/**
 * An .html file, which is the shared walker and almost nothing else.
 *
 * The one thing worth saying is what it is NOT: this reads the markup, not the rendered
 * page. A layout built entirely out of styled `<div>`s with no headings arrives as
 * prose, because there is nothing in the file that says otherwise — the same limit the
 * PDF importer has, reached from the opposite direction. A stylesheet is not consulted:
 * `<style>` is stripped before the walk, and an external one is not fetched.
 */
async function htmlFileToWidgets(file) {
  const { widgets, notes } = htmlToWidgets(await file.text(), { keepImageUrls: true });
  notes.push(
    'Read from the markup, not from how the page looks. Headings, lists and tables come ' +
    'across as themselves; anything that was only a heading because of its styling arrives as text.'
  );
  return { widgets, notes };
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
