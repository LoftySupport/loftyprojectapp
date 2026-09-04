import { HOUSE_COLOURS, pdfRgb } from "./houseFormat";
import { encode, truncate, widthOf } from "./helvetica";
import { LOGO_RGB } from "./logo";
import { stamp, type ExportCell, type ExportDocument, type ExportTable } from "./table";

/**
 * A PDF of the table on screen, in Lofty's house document format: A4 landscape, the
 * wordmark and a hairline on every page, each table under a heading with the orange rule,
 * and a footer carrying the title, "Commercial in confidence" and the page number — so the
 * thing that lands in somebody's inbox is a Lofty document rather than a screenshot.
 *
 * WHY LANDSCAPE, WHEN THE HOUSE TEMPLATE IS PORTRAIT. The template
 * (`Lofty Document Template`) is a portrait prose format; these exports are DATA TABLES,
 * and a job carries eleven columns and the data dictionary thirteen. Portrait fits about
 * six before every cell is a truncated stub, so the export keeps landscape and wears the
 * template's identity — the logo, the palette, the orange section rule, the grey header
 * row, the footer — over its own wider page.
 *
 * WHY IT IS HAND-WRITTEN. The candidates — jsPDF, pdfmake — each bring a document model, a
 * layout engine and an embedded font stack, which is a great deal of bundle for text at
 * coordinates on a fixed page. The standard fourteen fonts need no embedding, so the files
 * stay small; the one raster is the wordmark, decoded ahead of time (see `logo.ts`) because
 * a PDF has no PNG filter and this writer has no zlib.
 *
 * ON THE TYPEFACE. The template's rounded display face cannot be used here without
 * embedding a TrueType font and its metrics — weeks of writer for a wordmark's worth of
 * glyphs — so the PDF sets Helvetica, one of the fourteen standard faces, and carries the
 * brand in the logo, the palette and the layout instead. The Word document, which names
 * fonts rather than embedding them, uses the real family.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: wrap. A cell that does not fit its column is truncated
 * with an ellipsis, and every row is one line tall. Wrapping means rows of different
 * heights, which means a page break can land inside a row, and the whole pagination becomes
 * a different problem. The visible ellipsis is also the honest signal.
 */

// A4 landscape, in points.
const WIDTH = 841.89;
const HEIGHT = 595.28;
const MARGIN = 40;

const H2_SIZE = 15;
const NOTE_SIZE = 8.5;
const CELL_SIZE = 8.5;
const FOOT_SIZE = 7.5;
const EYEBROW_SIZE = 8;

const ROW_HEIGHT = 15;
const HEAD_HEIGHT = 17;
/** Each side of a cell. Also the gap between two columns' text. */
const PAD = 6;
/** Nothing is narrower than this, so a squeezed table stays readable rather than fair. */
const MIN_COLUMN = 34;

/**
 * The reserved bands at the top and bottom of every page: the wordmark and its hairline
 * above, the footer and its hairline below. The table lives between them, so a page found
 * on its own still carries the brand and says what it is from and which page it is.
 */
const HEADER_H = 44;
const FOOTER_H = 30;

// Lofty's palette, lifted from `src/theme/tokens.css` and the house document template.
// The house palette, derived rather than retyped — see data/export/houseFormat.ts. The
// hand-written triples these replaced had already drifted from the Word writer's copy in
// one channel of ROW_RULE; deriving them is what stops that happening again.
const GREEN = pdfRgb(HOUSE_COLOURS.green);
const INK = pdfRgb(HOUSE_COLOURS.ink);
const MUTED = pdfRgb(HOUSE_COLOURS.muted);
const FOOT_INK = pdfRgb(HOUSE_COLOURS.footInk);
const ORANGE = pdfRgb(HOUSE_COLOURS.orange);
const HEAD_FILL = pdfRgb(HOUSE_COLOURS.headFill);
const ROW_RULE = pdfRgb(HOUSE_COLOURS.rowRule);
const HAIRLINE = pdfRgb(HOUSE_COLOURS.hairline);

/** How wide the wordmark is drawn, in points; its height follows the logo's aspect. */
const LOGO_W = 62;
const LOGO_H = (LOGO_W * LOGO_RGB.height) / LOGO_RGB.width;

/** What the reader sees in a cell. Numbers unformatted, exactly as the screen shows them. */
function cellText(value: ExportCell): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return value;
}

/**
 * A PDF literal string. `(`, `)` and `\` have to be escaped or they end the string
 * early; everything above 126 is written as an octal escape so the file stays seven-bit.
 */
function pdfString(text: string, bold = false): string {
  let out = "";
  for (const byte of encode(text, bold)) {
    if (byte === 0x28 || byte === 0x29 || byte === 0x5c) out += "\\" + String.fromCharCode(byte);
    else if (byte < 0x20 || byte > 0x7e) out += "\\" + byte.toString(8).padStart(3, "0");
    else out += String.fromCharCode(byte);
  }
  return `(${out})`;
}

function text(ops: string[], value: string, x: number, y: number, size: number, bold: boolean, colour: string) {
  if (!value) return;
  ops.push(`BT ${colour} rg /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value, bold)} Tj ET`);
}

/**
 * Letter-spaced text — for the green eyebrow over the title, set as small caps the way the
 * template's "REPORT" label is. `Tc` is the character spacing operator, reset after.
 */
function trackedText(ops: string[], value: string, x: number, y: number, size: number, colour: string, tracking: number) {
  if (!value) return;
  ops.push(
    `BT ${colour} rg /F2 ${size} Tf ${tracking} Tc ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value, true)} Tj ET 0 Tc`
  );
}

function rect(ops: string[], x: number, y: number, w: number, h: number, colour: string) {
  ops.push(`${colour} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
}

/**
 * How wide each column would like to be: its header, or its widest value, plus padding.
 * Measured over every row — sizing from the header alone puts a 60-character address under
 * a 7-character heading.
 */
function naturalWidths(table: ExportTable): number[] {
  return table.columns.map((c, i) => {
    const header = widthOf(c.label, CELL_SIZE, true);
    const widest = table.rows.reduce(
      (n, row) => Math.max(n, widthOf(cellText(row[i]), CELL_SIZE)),
      header
    );
    return widest + 2 * PAD;
  });
}

const AVAILABLE = WIDTH - 2 * MARGIN;
/** How much wider than the page a table may be before it is split by column instead. */
const SQUEEZE_LIMIT = 1.5;

/**
 * Which columns go on which page. A table too wide for the page is split across pages by
 * column, the first column repeating on every band — without the job number the second
 * band is a page of values belonging to nothing. Greedy, left to right, so the reading
 * order is the column order.
 */
function columnBands(natural: number[]): number[][] {
  if (natural.length === 0) return [[]];
  const total = natural.reduce((a, b) => a + b, 0);
  if (total <= AVAILABLE * SQUEEZE_LIMIT) return [natural.map((_w, i) => i)];

  const idWidth = Math.min(natural[0], AVAILABLE / 3);
  const bands: number[][] = [];
  let band: number[] = [0];
  let used = natural[0];
  for (let i = 1; i < natural.length; i++) {
    const want = Math.min(natural[i], (AVAILABLE - idWidth) / 2);
    if (band.length > 1 && used + want > AVAILABLE) {
      bands.push(band);
      band = [0, i];
      used = idWidth + want;
    } else {
      band.push(i);
      used += want;
    }
  }
  bands.push(band);
  return bands;
}

/**
 * How the room on one page is shared out between the columns on it. Scaled up as well as
 * down; every column is guaranteed `MIN_COLUMN` first and the rest is shared in proportion
 * to what each asked for, so one enormous free-text column does not reduce the others to
 * two characters each.
 */
function fitWidths(natural: number[]): number[] {
  const total = natural.reduce((a, b) => a + b, 0);
  if (natural.length === 0) return [];
  if (total === 0) return natural.map(() => AVAILABLE / natural.length);
  if (total <= AVAILABLE) return natural.map(w => (w / total) * AVAILABLE);

  const floors = natural.map(w => Math.min(w, MIN_COLUMN));
  const fixed = floors.reduce((a, b) => a + b, 0);
  const spare = Math.max(0, AVAILABLE - fixed);
  const asking = natural.reduce((a, b, i) => a + Math.max(0, b - floors[i]), 0);
  return natural.map((w, i) => floors[i] + (asking ? ((w - floors[i]) / asking) * spare : 0));
}

/**
 * The heading block over a table: the document title once (the first table only), the
 * table's own name as the section heading with the orange rule under it, and the caption
 * lines. Identical on every page of a table, so the rows-per-page is too.
 *
 * `withTitle` is set for the very first table, which carries the whole-document title block
 * the way the template's cover does — the green eyebrow, the big title, the subtitle. Later
 * tables get their section heading alone.
 */
interface HeadingLine {
  value: string;
  size: number;
  bold: boolean;
  colour: string;
  /** An eyebrow is letter-spaced small caps; a rule is the orange line under a heading. */
  kind?: "eyebrow" | "rule";
  gap: number;
}

function headingLines(table: ExportTable, doc: ExportDocument, takenAt: Date, withTitle: boolean): HeadingLine[] {
  const lines: HeadingLine[] = [];
  if (withTitle) {
    lines.push({ value: "LOFTY EXPORT", size: EYEBROW_SIZE, bold: true, colour: GREEN, kind: "eyebrow", gap: 6 });
    lines.push({ value: doc.title, size: H2_SIZE + 3, bold: true, colour: INK, gap: 4 });
    if (doc.note) lines.push({ value: doc.note, size: NOTE_SIZE + 1.5, bold: false, colour: MUTED, gap: 3 });
    lines.push({ value: `Exported ${stamp(takenAt)}`, size: NOTE_SIZE, bold: false, colour: FOOT_INK, gap: 10 });
  }
  // The table's own name is the section heading, with the orange rule under it.
  lines.push({ value: table.name, size: H2_SIZE, bold: true, colour: INK, gap: 5 });
  lines.push({ value: "", size: 0, bold: false, colour: ORANGE, kind: "rule", gap: 7 });
  if (!withTitle && doc.note) lines.push({ value: doc.note, size: NOTE_SIZE, bold: false, colour: MUTED, gap: 3 });
  if (table.note && table.note !== doc.note) {
    lines.push({ value: table.note, size: NOTE_SIZE, bold: false, colour: MUTED, gap: 3 });
  }
  if (!withTitle) {
    lines.push({ value: `Exported ${stamp(takenAt)}`, size: NOTE_SIZE, bold: false, colour: FOOT_INK, gap: 4 });
  }
  return lines;
}

/** The total height a heading block occupies, so the rows-per-page can be counted. */
function headingHeight(lines: HeadingLine[]): number {
  return lines.reduce((n, l) => n + (l.kind === "rule" ? 2 : l.size) + l.gap, 0);
}

/** Draw a heading block from `contentTop` down; returns the y it finished at. */
function drawHeading(ops: string[], lines: HeadingLine[], contentTop: number): number {
  let y = contentTop;
  for (const line of lines) {
    if (line.kind === "rule") {
      // The 2px orange rule under a section heading, full content width — the house
      // format's Level 2 rule (brand kit: 2px #f47e63 below the heading).
      rect(ops, MARGIN, y - 2, WIDTH - 2 * MARGIN, 2, line.colour);
      y -= 2 + line.gap;
      continue;
    }
    y -= line.size;
    if (line.kind === "eyebrow") trackedText(ops, line.value, MARGIN, y, line.size, line.colour, 1.2);
    else text(ops, line.value, MARGIN, y, line.size, line.bold, line.colour);
    y -= line.gap;
  }
  return y;
}

export function toPdf(doc: ExportDocument): Uint8Array {
  const takenAt = doc.takenAt ?? new Date();
  const pages: string[] = [];
  const contentTop = HEIGHT - MARGIN - HEADER_H;

  doc.tables.forEach((table, tableIndex) => {
    const natural = naturalWidths(table);
    const bands = columnBands(natural);
    const floor = MARGIN + FOOTER_H;
    const fits = (heading: number) =>
      Math.max(1, Math.floor((contentTop - heading - floor - HEAD_HEIGHT) / ROW_HEIGHT));

    // Sized twice, so the "Rows/columns …" continuation line — which only exists once the
    // table is known to span — costs the same line of heading on every page, keeping the
    // rows-per-page constant.
    const linesBare = headingLines(table, doc, takenAt, tableIndex === 0);
    const bareHeight = headingHeight(linesBare);
    const needsNote = bands.length > 1 || table.rows.length > fits(bareHeight);
    const fullHeight = needsNote ? bareHeight + NOTE_SIZE + 5 : bareHeight;
    const perPage = fits(fullHeight);

    const chunks: ExportCell[][][] = [];
    for (let at = 0; at < table.rows.length; at += perPage) {
      chunks.push(table.rows.slice(at, at + perPage));
    }
    if (chunks.length === 0) chunks.push([]);

    for (const band of bands) {
      const columns = band.map(i => table.columns[i]);
      const widths = fitWidths(band.map(i => Math.min(natural[i], AVAILABLE)));
      const edges = widths.reduce<number[]>((acc, w, i) => [...acc, acc[i] + w], [MARGIN]);
      const right = edges[edges.length - 1];

      chunks.forEach((rows, index) => {
        const ops: string[] = [];
        const lines = headingLines(table, doc, takenAt, tableIndex === 0);
        let y = drawHeading(ops, lines, contentTop);

        if (needsNote) {
          const carried = band.length > 1 && band[1] !== 1 ? band[1] : band[0];
          const where = [
            chunks.length > 1
              ? `Rows ${index * perPage + 1}–${index * perPage + rows.length} of ${table.rows.length}`
              : null,
            bands.length > 1
              ? `columns ${carried + 1}–${band[band.length - 1] + 1} of ${table.columns.length}` +
                (carried === 0 ? "" : `, with ${table.columns[0].label} repeated`)
              : null
          ]
            .filter(Boolean)
            .join(" · ");
          y -= NOTE_SIZE;
          text(ops, where, MARGIN, y, NOTE_SIZE, false, MUTED);
          y -= 5;
        }

        // Header band, then the header text sitting on its baseline.
        let rowTop = y - 4;
        rect(ops, MARGIN, rowTop - HEAD_HEIGHT, right - MARGIN, HEAD_HEIGHT, HEAD_FILL);
        columns.forEach((c, i) => {
          const inner = widths[i] - 2 * PAD;
          const label = truncate(c.label, inner, CELL_SIZE, true);
          const x = c.numeric ? edges[i + 1] - PAD - widthOf(label, CELL_SIZE, true) : edges[i] + PAD;
          text(ops, label, x, rowTop - HEAD_HEIGHT + 6, CELL_SIZE, true, INK);
        });
        rowTop -= HEAD_HEIGHT;
        rect(ops, MARGIN, rowTop - 0.6, right - MARGIN, 0.6, HAIRLINE);

        rows.forEach((row, r) => {
          const bottom = rowTop - ROW_HEIGHT * (r + 1);
          // A hairline under each row, the way the template's data table separates rows —
          // no zebra fill, which the house format does not use.
          rect(ops, MARGIN, bottom, right - MARGIN, 0.5, ROW_RULE);
          columns.forEach((c, i) => {
            const inner = widths[i] - 2 * PAD;
            const value = truncate(cellText(row[band[i]]), inner, CELL_SIZE);
            if (!value) return;
            const x = c.numeric ? edges[i + 1] - PAD - widthOf(value, CELL_SIZE) : edges[i] + PAD;
            text(ops, value, x, bottom + 5, CELL_SIZE, false, INK);
          });
        });

        pages.push(ops.join("\n"));
      });
    }
  });

  // The brand furniture — wordmark and hairline above, footer and hairline below — plus the
  // page number, added once every page is laid out: "Page 3 of 11" counts the whole
  // download, and the total is not known until the last table has paginated.
  // The footer's date — spelled, not numeric, so 03/09 and 09/03 are not both read as it.
  const footerDate = takenAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  const decorated = pages.map((content, i) => {
    const ops: string[] = [];

    // Running header: the wordmark top-left, drawn from the shared image, and a hairline.
    const logoY = HEIGHT - MARGIN - LOGO_H;
    ops.push(`q ${LOGO_W.toFixed(2)} 0 0 ${LOGO_H.toFixed(2)} ${MARGIN} ${logoY.toFixed(2)} cm /Im0 Do Q`);
    const headRuleY = HEIGHT - MARGIN - HEADER_H + 12;
    rect(ops, MARGIN, headRuleY, WIDTH - 2 * MARGIN, 0.6, HAIRLINE);

    // Footer (brand kit): a hairline, then the document name with © and the date beneath
    // it on the left, and the confidentiality line with the page number on the right.
    const footRuleY = MARGIN + FOOTER_H - 6;
    rect(ops, MARGIN, footRuleY, WIDTH - 2 * MARGIN, 0.6, HAIRLINE);
    text(ops, `${doc.title} ©`, MARGIN, MARGIN + FOOT_SIZE + 3, FOOT_SIZE, false, FOOT_INK);
    text(ops, footerDate, MARGIN, MARGIN, FOOT_SIZE, false, FOOT_INK);
    const right = `Commercial in confidence  ·  Page ${i + 1} of ${pages.length}`;
    text(ops, right, WIDTH - MARGIN - widthOf(right, FOOT_SIZE), MARGIN + (FOOT_SIZE + 3) / 2, FOOT_SIZE, false, FOOT_INK);

    return `${ops.join("\n")}\n${content}`;
  });

  return assemble(doc.title, decorated, takenAt);
}

/** One PDF object's body: text, or a stream whose data is raw bytes (the logo image). */
type ObjectBody = string | { head: string; bytes: Uint8Array; tail: string };

/**
 * The file itself: objects, then the cross-reference table that says where each one starts.
 * Every offset is counted in bytes rather than characters — a `·` in a heading is two bytes
 * of UTF-8 and one character, and an xref built by counting characters points a few bytes
 * short of every object after the first accent. The image object carries raw binary, so the
 * assembler works in bytes throughout rather than encoding strings after the fact.
 */
function assemble(title: string, pages: string[], takenAt: Date): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const pushBytes = (bytes: Uint8Array) => {
    parts.push(bytes);
    length += bytes.length;
  };
  const push = (s: string) => pushBytes(encoder.encode(s));

  // The wordmark, decoded once in `logo.ts`, as an uncompressed DeviceRGB image XObject.
  const logoBytes = base64ToBytes(LOGO_RGB.base64);
  const LOGO_OBJ = 6; // 1 catalog, 2 pages, 3 F1, 4 F2, 5 info, 6 image
  const FIRST_PAGE = 7;
  const pageIds = pages.map((_p, i) => FIRST_PAGE + i * 2);

  const objects: ObjectBody[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    `<< /Title ${pdfString(title)} /Producer ${pdfString("Lofty")} /CreationDate ${pdfString(pdfDate(takenAt))} >>`,
    {
      head:
        `<< /Type /XObject /Subtype /Image /Width ${LOGO_RGB.width} /Height ${LOGO_RGB.height}` +
        ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${logoBytes.length} >>\nstream\n`,
      bytes: logoBytes,
      tail: `\nendstream`
    }
  ];

  pages.forEach((content, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}]` +
        ` /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << /Im0 ${LOGO_OBJ} 0 R >> >>` +
        ` /Contents ${pageIds[i] + 1} 0 R >>`
    );
    objects.push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
  });

  push(`%PDF-1.4\n`);
  push(`%âãÏÓ\n`);

  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    if (typeof body === "string") {
      push(`${i + 1} 0 obj\n${body}\nendobj\n`);
    } else {
      push(`${i + 1} 0 obj\n${body.head}`);
      pushBytes(body.bytes);
      push(`${body.tail}\nendobj\n`);
    }
  });

  const xrefAt = length;
  push(`xref\n0 ${objects.length + 1}\n`);
  push(`0000000000 65535 f \n`);
  for (const at of offsets) push(`${String(at).padStart(10, "0")} 00000 n \n`);
  push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`
  );

  const out = new Uint8Array(length);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/**
 * Base64 to bytes, without `atob` — this writer runs in the browser and in the Node check,
 * and `atob` is not in Node's globals in every version the check runs under. Standard
 * alphabet, no line breaks (which is how `logo.ts` is generated).
 */
function base64ToBytes(b64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/=+$/, "");
  const out = new Uint8Array((clean.length * 3) >> 2);
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | lookup[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out;
}

/** `D:20260903161200+09'30'` — PDF's own date syntax, offset included. */
function pdfDate(at: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  const offset = -at.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `D:${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}` +
    `${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}` +
    `${sign}${two(Math.floor(abs / 60))}'${two(abs % 60)}'`
  );
}
