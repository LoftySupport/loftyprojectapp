import { encode, truncate, widthOf } from "./helvetica";
import { stamp, type ExportCell, type ExportDocument, type ExportTable } from "./table";

/**
 * A PDF of the table on screen: A4 landscape, the heading repeated on every page, and a
 * page number, so the thing that lands in somebody's inbox is a document rather than a
 * screenshot.
 *
 * WHY THIS EXISTS WHEN THE APP CAN ALREADY PRINT. `window.print()` on the job report
 * (G37) is a different thing, and both are wanted. Print asks the reader to find "Save
 * as PDF" in a dialog, prints what the browser's paged CSS happens to do with a table
 * inside a horizontally scrolling container, and cannot be triggered for a board or a
 * roadmap at all. Amber asked for a **download**: one click, a file, the same on every
 * machine.
 *
 * WHY IT IS HAND-WRITTEN. The same reason as the spreadsheet: the candidates — jsPDF,
 * pdfmake — each bring a document model, a layout engine and an embedded font stack,
 * which is a great deal of bundle for what this actually asks of them, which is text at
 * coordinates on a fixed page. Because the standard fourteen fonts need no embedding,
 * the files stay small: the data dictionary is 298 rows over 50 pages and 250 kB, and a
 * board of 140 jobs is 90 kB.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: wrap. A cell that does not fit its column is
 * truncated with an ellipsis, and every row is one line tall. Wrapping means rows of
 * different heights, which means a page break can land inside a row, and the whole
 * pagination becomes a different problem. The visible ellipsis is also the honest
 * signal — a wrapped cell silently pushes the rest of the table down the page, while
 * "12 Hawthorn Cr…" tells the reader to go and look at the screen.
 */

// A4 landscape, in points. The tables here are wide — ten columns of a job — and
// portrait A4 fits about six of them before every column is a truncated stub.
const WIDTH = 841.89;
const HEIGHT = 595.28;
const MARGIN = 36;

const TITLE_SIZE = 14;
const NOTE_SIZE = 8.5;
const CELL_SIZE = 8.5;
const FOOT_SIZE = 7.5;

const ROW_HEIGHT = 14;
const HEAD_HEIGHT = 16;
/** Each side of a cell. Also the gap between two columns' text. */
const PAD = 5;
/** Nothing is narrower than this, so a squeezed table stays readable rather than fair. */
const MIN_COLUMN = 34;

const INK = "0.11 0.11 0.13";
const MUTED = "0.42 0.42 0.47";
const HEAD_FILL = "0.945 0.945 0.957";
const STRIPE = "0.976 0.976 0.984";
const RULE = "0.85 0.85 0.87";

/** What the reader sees in a cell. Numbers unformatted, exactly as the screen shows them. */
function cellText(value: ExportCell): string {
  if (value === null) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  return value;
}

/**
 * A PDF literal string. `(`, `)` and `\` have to be escaped or they end the string
 * early; everything above 126 is written as an octal escape so the file stays
 * seven-bit — a raw 0x0D inside a string is a real hazard, because some tools normalise
 * line endings in transit and would silently rewrite the byte.
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

function rect(ops: string[], x: number, y: number, w: number, h: number, colour: string) {
  ops.push(`${colour} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
}

/**
 * How wide each column would like to be: its header, or its widest value, plus padding.
 *
 * Uncapped, and used for two different decisions below — which columns share a page, and
 * how the room on that page is shared out. Measured over every row, which is the only
 * way to get it right: sizing from the header alone puts a 60-character address under a
 * 7-character heading.
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
 * Which columns go on which page.
 *
 * THE PROBLEM THIS SOLVES, WHICH WAS WATCHED HAPPENING. The data dictionary exports
 * thirteen columns. Thirteen columns on a landscape A4 at 8.5pt is 34 points each, which
 * is five characters — so every cell was an ellipsis and the download was a list of the
 * *shapes* of the answers. The spreadsheet was fine; the PDF was a page of "profil…
 * profi… profil… Profi…".
 *
 * So a table too wide for the page is split across pages by column, the way a printed
 * report has always done it, and **the first column repeats on every one of them** —
 * without the job number or the property name, the second band is a page of values
 * belonging to nothing. That repeat is the whole reason this is worth building rather
 * than just shrinking the type: a band you cannot line up against a row is not the data,
 * it is a puzzle.
 *
 * Greedy packing, left to right, so the reading order is the column order.
 */
function columnBands(natural: number[]): number[][] {
  if (natural.length === 0) return [[]];
  const total = natural.reduce((a, b) => a + b, 0);
  // Half again too wide is still one page. A table that overflows by a fifth — which is
  // the jobs table with every column switched on — squeezes to about eleven characters a
  // column and reads; splitting it would put the same nine columns on two pages to save
  // a few truncated addresses, and a reader comparing two jobs would be turning pages to
  // do it. Past `SQUEEZE_LIMIT` the squeeze stops being a squeeze and becomes a column of
  // ellipses, and then bands are the lesser loss.
  if (total <= AVAILABLE * SQUEEZE_LIMIT) return [natural.map((_w, i) => i)];

  // What the repeated identity column costs on every band after the first. Capped, or a
  // wide first column would leave no room for the columns the band exists to carry.
  const idWidth = Math.min(natural[0], AVAILABLE / 3);
  const bands: number[][] = [];
  let band: number[] = [0];
  let used = natural[0];
  for (let i = 1; i < natural.length; i++) {
    // A column asks for at most half of what a band has to give.
    //
    // Without the cap, one free-text column takes a band to itself and strands its
    // narrow neighbours in bands of their own: the dictionary came out as seventy pages,
    // several of which were a page of "Type" beside the repeated identifier. A long
    // definition is going to be truncated at any width — half a band is enough of it to
    // be worth reading, and the spreadsheet is where the whole of it lives.
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
 * How the room on one page is shared out between the columns on it.
 *
 * Scaled up as well as down: a four-column table left at its natural width sits in the
 * left third of a landscape page and reads as a rendering failure rather than a narrow
 * table.
 *
 * Squeezing is not proportional. Every column is guaranteed `MIN_COLUMN` first and the
 * rest is shared out in proportion to what each column asked for, so a table with one
 * enormous free-text column does not reduce the other nine to two characters each.
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

/** The heading block. Identical on every page of a table, so the rows-per-page is too. */
function headingLines(table: ExportTable, doc: ExportDocument, takenAt: Date) {
  const lines: { value: string; size: number; bold: boolean; colour: string }[] = [
    { value: table.name, size: TITLE_SIZE, bold: true, colour: INK }
  ];
  if (doc.note) lines.push({ value: doc.note, size: NOTE_SIZE, bold: false, colour: MUTED });
  if (table.note && table.note !== doc.note) {
    lines.push({ value: table.note, size: NOTE_SIZE, bold: false, colour: MUTED });
  }
  lines.push({ value: `Exported ${stamp(takenAt)}`, size: NOTE_SIZE, bold: false, colour: MUTED });
  return lines;
}

export function toPdf(doc: ExportDocument): Uint8Array {
  const takenAt = doc.takenAt ?? new Date();
  const pages: string[] = [];

  // Laid out table by table, each starting a new page: a report is several tables of
  // different shapes, and continuing one under another means a column layout that
  // changes half way down a page.
  for (const table of doc.tables) {
    const natural = naturalWidths(table);
    const bands = columnBands(natural);
    const lines = headingLines(table, doc, takenAt);
    const floor = MARGIN + 10; // above the footer
    const fits = (heading: number) =>
      Math.max(1, Math.floor((HEIGHT - MARGIN - heading - floor - HEAD_HEIGHT) / ROW_HEIGHT));

    /**
     * Twice, because the "Part 2 of 5" line only exists once the table is known to span
     * pages — and it costs a line of heading on every page, including the first. Sized
     * once with it and once without, the rows-per-page is the same on every page of the
     * table, which is what keeps the header band at the same height throughout. Sized
     * only without it, every continuation page ran eleven points past its own floor.
     *
     * The banded case takes the same line, so a table that is both too wide and too long
     * measures the same on every one of its pages.
     */
    const bare = lines.reduce((n, l) => n + l.size + 5, 0) + 8;
    const needsNote = bands.length > 1 || table.rows.length > fits(bare);
    const headingHeight = needsNote ? bare + NOTE_SIZE + 5 : bare;
    const top = HEIGHT - MARGIN - headingHeight;
    const perPage = fits(headingHeight);

    const chunks: ExportCell[][][] = [];
    for (let at = 0; at < table.rows.length; at += perPage) {
      chunks.push(table.rows.slice(at, at + perPage));
    }
    // A table with no rows still gets its page. "Nothing needs attention" is a result,
    // and a report that silently omits the section reads as a report that lost it.
    if (chunks.length === 0) chunks.push([]);

    // Bands outside, row chunks inside: all the rows for the first set of columns, then
    // all the rows again for the next. The other nesting interleaves them, and a reader
    // following one job down the page would have to leaf back and forth.
    for (const band of bands) {
      const columns = band.map(i => table.columns[i]);
      const widths = fitWidths(band.map(i => Math.min(natural[i], AVAILABLE)));
      const edges = widths.reduce<number[]>((acc, w, i) => [...acc, acc[i] + w], [MARGIN]);
      const right = edges[edges.length - 1];

      chunks.forEach((rows, index) => {
        const ops: string[] = [];
        let y = HEIGHT - MARGIN;
        for (const line of lines) {
          y -= line.size + 2;
          text(ops, line.value, MARGIN, y, line.size, line.bold, line.colour);
          y -= 3;
        }
        // Said on the pages that need it and nowhere else: "part 1 of 1" on a one-page
        // table is a line of chrome answering a question nobody asked. Where a table is
        // split both ways, both halves of the position are on the line — the page is
        // otherwise indistinguishable from the one before it.
        if (needsNote) {
          // The first column of a later band is the repeated identifier, not one of the
          // columns the band is carrying — so the range starts at the second entry
          // there, and says which column is along for the ride.
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
          y -= NOTE_SIZE + 2;
          text(ops, where, MARGIN, y, NOTE_SIZE, false, MUTED);
          y -= 3;
        }

        // Header band, then the header text sitting on its baseline.
        let rowTop = Math.min(y - 8, top);
        rect(ops, MARGIN, rowTop - HEAD_HEIGHT, right - MARGIN, HEAD_HEIGHT, HEAD_FILL);
        columns.forEach((c, i) => {
          const inner = widths[i] - 2 * PAD;
          const label = truncate(c.label, inner, CELL_SIZE, true);
          const x = c.numeric ? edges[i + 1] - PAD - widthOf(label, CELL_SIZE, true) : edges[i] + PAD;
          text(ops, label, x, rowTop - HEAD_HEIGHT + 5, CELL_SIZE, true, INK);
        });
        rowTop -= HEAD_HEIGHT;
        rect(ops, MARGIN, rowTop - 0.5, right - MARGIN, 0.5, RULE);

        rows.forEach((row, r) => {
          const bottom = rowTop - ROW_HEIGHT * (r + 1);
          if (r % 2 === 1) rect(ops, MARGIN, bottom, right - MARGIN, ROW_HEIGHT, STRIPE);
          columns.forEach((c, i) => {
            const inner = widths[i] - 2 * PAD;
            const value = truncate(cellText(row[band[i]]), inner, CELL_SIZE);
            if (!value) return;
            const x = c.numeric ? edges[i + 1] - PAD - widthOf(value, CELL_SIZE) : edges[i] + PAD;
            text(ops, value, x, bottom + 4, CELL_SIZE, false, INK);
          });
        });

        // The running head as a footer, so a page found on its own says what it is from.
        text(ops, doc.title, MARGIN, MARGIN - 14, FOOT_SIZE, false, MUTED);
        pages.push(ops.join("\n"));
      });
    }
  }

  // "Page 3 of 11" counts the whole download, not the table it happens to be in —
  // added here rather than in the loop above because the total is not known until every
  // table has been laid out, and a footer reading "page 3 of 4" on a document of eleven
  // pages is how a report gets sent out with two of its sections missing unnoticed.
  const numbered = pages.map((content, i) => {
    const ops: string[] = [];
    const label = `Page ${i + 1} of ${pages.length}`;
    text(ops, label, WIDTH - MARGIN - widthOf(label, FOOT_SIZE), MARGIN - 14, FOOT_SIZE, false, MUTED);
    return `${content}\n${ops.join("\n")}`;
  });

  return assemble(doc.title, numbered, takenAt);
}

/**
 * The file itself: objects, then the cross-reference table that says where each one
 * starts. Every offset is counted in bytes rather than characters — a `·` in a heading
 * is two bytes of UTF-8 and one character, and an xref built by counting characters
 * points a few bytes short of every object after the first accent. This is the classic
 * way a hand-written PDF breaks, and it breaks in Acrobat while looking fine in Chrome.
 */
function assemble(title: string, pages: string[], takenAt: Date): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  let length = 0;
  const push = (s: string) => {
    const bytes = encoder.encode(s);
    parts.push(bytes);
    length += bytes.length;
  };

  const FIRST_PAGE = 6; // 1 catalog, 2 pages, 3 F1, 4 F2, 5 info
  const pageIds = pages.map((_p, i) => FIRST_PAGE + i * 2);
  const objects: string[] = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
    `<< /Title ${pdfString(title)} /Producer ${pdfString("Lofty")} /CreationDate ${pdfString(pdfDate(takenAt))} >>`
  ];

  pages.forEach((content, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}]` +
        ` /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>` +
        ` /Contents ${pageIds[i] + 1} 0 R >>`
    );
    // The stream length counts bytes, for the same reason the xref does.
    objects.push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
  });

  push(`%PDF-1.4\n`);
  // A comment of high bytes, which is the convention that tells anything sniffing the
  // file that it is binary and must not be line-ending-converted.
  push(`%âãÏÓ\n`);

  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(length);
    push(`${i + 1} 0 obj\n${body}\nendobj\n`);
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
