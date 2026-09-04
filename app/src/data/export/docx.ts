import { zip, type ZipEntry } from "./zip";
import { stamp, type ExportDocument, type ExportTable } from "./table";

/**
 * A real .docx — WordprocessingML in an OOXML package — rather than an .rtf or an .html
 * file with the wrong extension.
 *
 * WHY WORD, ALONGSIDE EXCEL AND PDF. Amber asked for Word next to the other two, and the
 * three are not the same file for the same job. A spreadsheet is for the reader who will
 * sort and total the rows; a PDF is for the reader who will print or forward something
 * fixed; a Word document is for the reader who will paste the table into a letter, a
 * scope of works or a client update and keep editing around it. A PDF cannot be edited
 * and a spreadsheet pasted into Word arrives as an unstyled grid, so this exists for the
 * middle case, which on this app is the report that goes out under a cover note.
 *
 * WHY THIS IS HAND-WRITTEN AND NOT `npm install docx`. The document this has to produce
 * is a fixed set of five small XML parts around one flat table, and the `docx` package —
 * the one everyone reaches for — is a general document model with paragraphs, sections,
 * numbering and a builder API, none of which is wanted for "one heading, one table". The
 * hard part of a .docx is the same as an .xlsx: it is the OOXML and the package, not the
 * archive, and the archive is already written next door in `zip.ts`.
 *
 * WHAT A SECTION LOOKS LIKE. The document title, the whole-download note and the stamp
 * once at the top; then, per table, a heading, an optional note, and a bordered table
 * with a shaded, bold, repeating header row. The page is landscape A4 for the same reason
 * the PDF's is — the data dictionary is thirteen columns wide, and portrait turns every
 * cell into a sliver. Word wraps and auto-fits cells, so a wide table needs no banding of
 * its own the way the fixed-width PDF does.
 *
 * WHAT IT SHARES WITH THE SPREADSHEET, ON PURPOSE. A `null` cell is an empty cell, never
 * a dash (see `table.ts`). A `{{table.column}}` token is carried through verbatim, because
 * unbound and empty are different facts. Control characters that XML 1.0 cannot represent
 * — a NUL or a stray 0x1A pasted out of Outlook — are dropped, because one of them makes
 * the whole package unopenable and Word's only report of that is "the file is corrupt".
 * A numeric column is right-aligned, matching the sheet and the PDF.
 */

/**
 * Characters XML 1.0 cannot represent at all, dropped — the same rule the spreadsheet
 * keeps, and for the same reason: `&` mis-renders one cell, but a NUL corrupts the entire
 * package. Tab, newline and return are legal and kept.
 */
function stripUnrepresentable(value: string): string {
  let out = "";
  for (const ch of value) {
    const code = ch.codePointAt(0)!;
    if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) continue;
    if (code === 0x7f) continue;
    out += ch;
  }
  return out;
}

function xml(value: string): string {
  return stripUnrepresentable(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One run of text as a paragraph. Newlines in a value become `<w:br/>` rather than
 * separate paragraphs, so a multi-line note stays one table cell. `xml:space="preserve"`
 * keeps a leading space that Word would otherwise trim — an address like " 12 High St"
 * pasted with its space intact is somebody's deliberate alignment.
 */
function paragraph(text: string, opts: { bold?: boolean; sizeHalfPt?: number; color?: string; right?: boolean; spaceBefore?: number; spaceAfter?: number } = {}): string {
  const runProps =
    (opts.bold ? `<w:b/>` : "") +
    (opts.color ? `<w:color w:val="${opts.color}"/>` : "") +
    (opts.sizeHalfPt ? `<w:sz w:val="${opts.sizeHalfPt}"/><w:szCs w:val="${opts.sizeHalfPt}"/>` : "");
  const spacing =
    opts.spaceBefore != null || opts.spaceAfter != null
      ? `<w:spacing${opts.spaceBefore != null ? ` w:before="${opts.spaceBefore}"` : ""}${opts.spaceAfter != null ? ` w:after="${opts.spaceAfter}"` : ""}/>`
      : "";
  const pProps =
    spacing || opts.right
      ? `<w:pPr>${spacing}${opts.right ? `<w:jc w:val="right"/>` : ""}</w:pPr>`
      : "";
  const runs = xml(text)
    .split("\n")
    .map((line, i) => (i === 0 ? "" : `<w:br/>`) + `<w:t xml:space="preserve">${line}</w:t>`)
    .join("");
  const run = `<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ""}${runs}</w:r>`;
  return `<w:p>${pProps}${run}</w:p>`;
}

/** A shaded, bold header cell that repeats at the top of every page the table spills onto. */
function headerCell(label: string): string {
  return (
    `<w:tc>` +
    `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F1F1F3"/></w:tcPr>` +
    paragraph(label, { bold: true, sizeHalfPt: 20 }) +
    `</w:tc>`
  );
}

function bodyCell(value: string | number | null, numeric: boolean | undefined): string {
  // A blank cell still needs its paragraph — Word requires the last block in a cell to be
  // one, and a cell with no `<w:p>` at all makes the document unreadable. So an empty cell
  // is an empty paragraph, which is a blank on the page, not a dash.
  if (value === null || value === "") return `<w:tc><w:tcPr/><w:p/></w:tc>`;
  // NaN and Infinity have no honest text, so a figure that did not compute is left blank
  // rather than written as the word "NaN" — matching the spreadsheet.
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<w:tc><w:tcPr/><w:p/></w:tc>`;
    return `<w:tc><w:tcPr/>${paragraph(String(value), { sizeHalfPt: 20, right: true })}</w:tc>`;
  }
  return `<w:tc><w:tcPr/>${paragraph(value, { sizeHalfPt: 20, right: numeric })}</w:tc>`;
}

function tableXml(table: ExportTable, docNote: string | undefined): string {
  const heading = paragraph(table.name, { bold: true, sizeHalfPt: 26, spaceBefore: 240, spaceAfter: 60 });
  // The table's own note, but not a second copy of the document note when they are the
  // same string — the spreadsheet makes the same call.
  const note =
    table.note && table.note !== docNote
      ? paragraph(table.note, { color: "6B6B76", sizeHalfPt: 18, spaceAfter: 120 })
      : "";

  const grid =
    `<w:tblGrid>` +
    table.columns.map(() => `<w:gridCol/>`).join("") +
    `</w:tblGrid>`;

  const headerRow =
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    table.columns.map(c => headerCell(c.label)).join("") +
    `</w:tr>`;

  const bodyRows = table.rows
    .map(
      cells =>
        `<w:tr>` +
        table.columns.map((c, i) => bodyCell(cells[i] ?? null, c.numeric)).join("") +
        `</w:tr>`
    )
    .join("");

  // A table with no rows is still a table with its header — "nothing needs attention" is a
  // result, and a section that silently vanished reads as one lost on the way out.
  const tbl =
    `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblLayout w:type="autofit"/>` +
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map(side => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9C9D0"/>`)
      .join("") +
    `</w:tblBorders>` +
    `<w:tblCellMar>` +
    `<w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>` +
    `<w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/>` +
    `</w:tblCellMar>` +
    `</w:tblPr>` +
    grid +
    headerRow +
    bodyRows +
    `</w:tbl>`;

  return heading + note + tbl;
}

function documentXml(doc: ExportDocument, takenAt: Date): string {
  const head = [
    paragraph(doc.title, { bold: true, sizeHalfPt: 32, spaceAfter: 60 }),
    ...(doc.note ? [paragraph(doc.note, { color: "6B6B76", sizeHalfPt: 20 })] : []),
    paragraph(`Exported ${stamp(takenAt)}`, { color: "6B6B76", sizeHalfPt: 18, spaceAfter: 120 })
  ].join("");

  const body = doc.tables.map(t => tableXml(t, doc.note)).join("");

  // Landscape A4: 16838 × 11906 twips (a twip is 1/1440 inch), one-inch margins. Landscape
  // for the same reason the PDF is — the widest tables in this app do not fit portrait.
  const sectPr =
    `<w:sectPr>` +
    `<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>` +
    `<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>` +
    `</w:sectPr>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${head}${body}${sectPr}</w:body>` +
    `</w:document>`
  );
}

export function toDocx(doc: ExportDocument): Uint8Array {
  const takenAt = doc.takenAt ?? new Date();

  const entries: ZipEntry[] = [
    {
      path: "[Content_Types].xml",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `</Types>`
    },
    {
      path: "_rels/.rels",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`
    },
    {
      // Provenance, where Word shows it under File → Info: what this is and when it was
      // taken, for the copy that ends up on a desktop with the heading scrolled off.
      path: "docProps/core.xml",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"` +
        ` xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"` +
        ` xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
        `<dc:title>${xml(doc.title)}</dc:title>` +
        (doc.note ? `<dc:description>${xml(doc.note)}</dc:description>` : "") +
        `<cp:lastModifiedBy>Lofty</cp:lastModifiedBy>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${takenAt.toISOString().replace(/\.\d+Z$/, "Z")}</dcterms:created>` +
        `</cp:coreProperties>`
    },
    {
      path: "word/_rels/document.xml.rels",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`
    },
    {
      // A minimal styles part: the document defaults (Calibri, 11pt) and a Normal style, so
      // every value written without explicit run properties still has a font. All other
      // formatting is inlined on the runs, so there are no `pStyle` references to break.
      path: "word/styles.xml",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:docDefaults><w:rPrDefault><w:rPr>` +
        `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>` +
        `</w:rPr></w:rPrDefault></w:docDefaults>` +
        `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
        `</w:styles>`
    },
    {
      path: "word/document.xml",
      body: documentXml(doc, takenAt)
    }
  ];

  return zip(entries, takenAt);
}
