import { zip, type ZipEntry } from "./zip";
import { stamp, type ExportDocument, type ExportTable } from "./table";

/**
 * A real .xlsx — SpreadsheetML in an OOXML package — rather than a CSV with the wrong
 * extension.
 *
 * WHY NOT CSV. Amber asked for Excel, and the two differ in ways that show up on the
 * first file somebody opens:
 *
 *   - **A CSV has no types.** `1042-01` is a job number; Excel reads it as a date and
 *     writes back "1 Oct 2042". Every job number in this app would arrive mangled.
 *   - **A CSV has no header.** No bold row, no frozen pane, no filter buttons — the
 *     three things that make a 200-row table usable are all sheet features.
 *   - **A CSV is a formula-injection vector.** A cell beginning `=`, `+`, `-` or `@`
 *     is executed by Excel on open, and one of these columns is free text typed by
 *     forty-seven people. Every value here is written as an inline string, which Excel
 *     cannot interpret as a formula whatever it starts with.
 *
 * WHAT A SHEET LOOKS LIKE. Title, the note, the stamp, a blank row, then the header and
 * the rows — with the pane frozen under the header and a filter on it. The preamble
 * costs four rows and answers the question somebody always asks of a spreadsheet in an
 * inbox: what is this, what was filtered, and when was it taken.
 */

/** 1 → A, 27 → AA. */
function columnLetter(index: number): string {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Characters XML 1.0 cannot represent at all, dropped.
 *
 * This is the half of escaping that matters. `&` in an address renders one cell wrong if
 * it is missed; a NUL or a stray 0x1A — which arrive in text pasted out of Word and out
 * of Outlook — make the whole package unopenable, and Excel's report of that is "the
 * file is corrupt", with no clue which cell did it. Tab, newline and return are legal
 * and kept.
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
 * Excel's rules for a sheet tab, which it enforces by refusing to open the file: at most
 * 31 characters, none of `[ ] : * ? / \`, not blank, and unique within the workbook.
 * "Jobs by stage" and "Jobs by status" both truncate to the same 31 characters on a
 * longer name, so the de-duplication suffix is not theoretical.
 */
function sheetNames(tables: ExportTable[]): string[] {
  const used = new Set<string>();
  return tables.map((t, i) => {
    const base = (t.name.replace(/[[\]:*?/\\]/g, " ").trim() || `Sheet ${i + 1}`).slice(0, 31);
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` ${n++}`;
      name = base.slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Style indexes into `cellXfs` below. */
const BODY = 0;
const HEADER = 1;
const TITLE = 2;
const NOTE = 3;

function textCell(ref: string, value: string, style: number): string {
  const s = style === BODY ? "" : ` s="${style}"`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function sheetXml(table: ExportTable, doc: ExportDocument, takenAt: Date): string {
  // Rows 1..n of preamble, a blank row, then the header. Built as a list so adding a
  // line does not mean re-counting the freeze and the filter by hand.
  const preamble = [
    { text: table.name, style: TITLE },
    ...(doc.note ? [{ text: doc.note, style: NOTE }] : []),
    ...(table.note && table.note !== doc.note ? [{ text: table.note, style: NOTE }] : []),
    { text: `Exported ${stamp(takenAt)}`, style: NOTE }
  ];
  const headerRow = preamble.length + 2; // the +1 is the blank row between
  const lastColumn = columnLetter(Math.max(0, table.columns.length - 1));

  const rows: string[] = preamble.map(
    (line, i) => `<row r="${i + 1}">${textCell(`A${i + 1}`, line.text, line.style)}</row>`
  );

  rows.push(
    `<row r="${headerRow}">` +
      table.columns
        .map((c, i) => textCell(`${columnLetter(i)}${headerRow}`, c.label, HEADER))
        .join("") +
      `</row>`
  );

  table.rows.forEach((cells, r) => {
    const rowNumber = headerRow + 1 + r;
    const body = cells
      .map((value, i) => {
        const ref = `${columnLetter(i)}${rowNumber}`;
        // A blank cell is written by not writing a cell at all — see `table.ts` for why
        // this is a blank rather than a dash.
        if (value === null || value === "") return "";
        if (typeof value === "number") {
          // NaN and Infinity have no SpreadsheetML representation, and a cell holding
          // the text "NaN" would be a number column Excel can no longer sum. A figure
          // that did not compute is a figure nobody has, so it is left blank.
          return Number.isFinite(value) ? `<c r="${ref}"><v>${value}</v></c>` : "";
        }
        return textCell(ref, value, BODY);
      })
      .join("");
    rows.push(`<row r="${rowNumber}">${body}</row>`);
  });

  // Width is in characters, near enough: the header, or the longest value, whichever is
  // wider. Clamped both ends — under about 9 the filter arrow covers the heading, and a
  // free-text column of pasted error messages would otherwise be 400 wide.
  const cols = table.columns
    .map((c, i) => {
      const widest = table.rows.reduce(
        (n, row) => Math.max(n, String(row[i] ?? "").length),
        c.label.length
      );
      const width = Math.min(55, Math.max(9, widest + 2));
      return `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`;
    })
    .join("");

  const lastRow = headerRow + table.rows.length;
  const filter = table.rows.length
    ? `<autoFilter ref="A${headerRow}:${lastColumn}${lastRow}"/>`
    : "";

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    // Frozen under the header, so scrolling row 200 still says which column is which.
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    filter +
    `</worksheet>`
  );
}

export function toXlsx(doc: ExportDocument): Uint8Array {
  const takenAt = doc.takenAt ?? new Date();
  const names = sheetNames(doc.tables);

  const entries: ZipEntry[] = [
    {
      path: "[Content_Types].xml",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        doc.tables
          .map(
            (_t, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join("") +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
        `</Types>`
    },
    {
      path: "_rels/.rels",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
        `</Relationships>`
    },
    {
      // Provenance, in the place Windows shows it in a file's properties: what this is
      // and when it was taken, for the copy that ends up on somebody's desktop with the
      // preamble scrolled off.
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
      path: "xl/workbook.xml",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"` +
        ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<sheets>` +
        names
          .map((name, i) => `<sheet name="${xml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        `</sheets></workbook>`
    },
    {
      path: "xl/_rels/workbook.xml.rels",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        doc.tables
          .map(
            (_t, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
          )
          .join("") +
        `<Relationship Id="rId${doc.tables.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`
    },
    {
      path: "xl/styles.xml",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<fonts count="4">` +
        `<font><sz val="11"/><name val="Calibri"/></font>` +
        `<font><b/><sz val="11"/><name val="Calibri"/></font>` +
        `<font><b/><sz val="14"/><name val="Calibri"/></font>` +
        `<font><sz val="10"/><color rgb="FF6B6B76"/><name val="Calibri"/></font>` +
        `</fonts>` +
        // The gray125 fill at index 1 is never used and cannot be removed: Excel
        // assumes the first two fills are "none" and "gray125", and shifts every
        // fill index by one if they are not there.
        `<fills count="3">` +
        `<fill><patternFill patternType="none"/></fill>` +
        `<fill><patternFill patternType="gray125"/></fill>` +
        `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F1F3"/><bgColor indexed="64"/></patternFill></fill>` +
        `</fills>` +
        `<borders count="2">` +
        `<border><left/><right/><top/><bottom/><diagonal/></border>` +
        `<border><left/><right/><top/><bottom style="thin"><color rgb="FFC9C9D0"/></bottom><diagonal/></border>` +
        `</borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="4">` +
        `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>` +
        `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
        `</cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
        `</styleSheet>`
    },
    ...doc.tables.map((table, i) => ({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      body: sheetXml(table, doc, takenAt)
    }))
  ];

  return zip(entries, takenAt);
}
