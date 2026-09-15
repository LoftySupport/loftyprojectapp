import { HOUSE_COLOURS, HOUSE_FONT, ooxmlRgb } from "./houseFormat";
import { zip, type ZipEntry } from "./zip";
import { LOGO_PNG_BASE64, LOGO_ASPECT } from "./logo";
import { stamp, type ExportDocument, type ExportTable } from "./table";

/**
 * A real .docx — WordprocessingML in an OOXML package — in Lofty's house document format:
 * A4 portrait, the wordmark and a hairline in the running header, each table under a
 * heading with the orange rule, and a footer carrying the document name, the date, the
 * confidentiality line and an auto-numbered page. It is the one export a reader keeps
 * editing — pasted under a cover note, a scope of works — so it wears the brand and lands
 * ready to send.
 *
 * WHY WORD, ALONGSIDE EXCEL AND PDF. A spreadsheet is for the reader who will sort and
 * total; a PDF is the fixed copy that prints or forwards; a Word document is for the reader
 * who will edit around the table. The house template's own guidance is explicit that the
 * Word file is "the one a client will edit", which is why it — and this — set Montserrat
 * rather than the brand's Fieldwork Geo: embedding the brand font in a .docx needs Word's
 * embed-fonts option, and Montserrat is the brand's named substitute (`houseFormat.ts`
 * carries the decision; Helvetica, Calibri and Aptos are never used).
 *
 * WHY THIS IS HAND-WRITTEN, like the spreadsheet. The document is a fixed set of small XML
 * parts around one flat table; the `docx` npm package is a general document model none of
 * which is wanted here. The hard part is the OOXML and the package, both of which the
 * spreadsheet already proved, and the archive is `zip.ts` next door. The one raster is the
 * wordmark, embedded as a PNG media part (Word composites its transparency itself).
 *
 * WHAT IT SHARES WITH THE OTHER WRITERS, ON PURPOSE. A `null` cell is an empty cell, never
 * a dash (see `table.ts`); a `{{table.column}}` token is carried through verbatim, because
 * unbound and empty are different facts; XML-1.0-impossible control characters are dropped,
 * because one makes the whole package unopenable; a numeric column is right-aligned. The
 * palette and the type are lifted from the brand kit: Foundation Black `#414042` for
 * headings and body, Crisp Orange `#f47e63` for the rules, Eco Green `#005058` for the one
 * eyebrow, `#f6f7f7` behind the table header, `#e7e8e9` for the layout rules.
 */

// ── the palette and the type scale, from the brand kit ──────────────────────────────
// The house palette, derived rather than retyped — see data/export/houseFormat.ts.
const INK = ooxmlRgb(HOUSE_COLOURS.ink);
const MUTED = ooxmlRgb(HOUSE_COLOURS.muted);
const FOOT = ooxmlRgb(HOUSE_COLOURS.footInk);
const GREEN = ooxmlRgb(HOUSE_COLOURS.green);
const ORANGE = ooxmlRgb(HOUSE_COLOURS.orange);
const HEAD_FILL = ooxmlRgb(HOUSE_COLOURS.headFill);
const ROW_RULE = ooxmlRgb(HOUSE_COLOURS.rowRule);
const HAIRLINE = ooxmlRgb(HOUSE_COLOURS.hairline);

// Word sizes are in half-points; borders in eighths of a point.
const hp = (pt: number) => Math.round(pt * 2);

/**
 * Characters XML 1.0 cannot represent at all, dropped — a NUL corrupts the whole package
 * and Word's only report is "the file is corrupt". Tab, newline and return are kept.
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

interface RunOpts {
  bold?: boolean;
  sizeHalfPt?: number;
  color?: string;
  caps?: boolean;
  /** In twips (1/20 pt) — letter spacing for the eyebrow. */
  spacing?: number;
}

interface ParaOpts {
  right?: boolean;
  spaceBefore?: number; // twips
  spaceAfter?: number; // twips
  lineTwips?: number; // exact line height in twips
  /** An orange or grey rule under the paragraph — the section rule and the header hairline. */
  ruleBelow?: { color: string; size: number };
}

function runProps(o: RunOpts): string {
  return (
    (o.bold ? `<w:b/>` : "") +
    (o.caps ? `<w:caps/>` : "") +
    (o.spacing ? `<w:spacing w:val="${o.spacing}"/>` : "") +
    (o.color ? `<w:color w:val="${o.color}"/>` : "") +
    (o.sizeHalfPt ? `<w:sz w:val="${o.sizeHalfPt}"/><w:szCs w:val="${o.sizeHalfPt}"/>` : "")
  );
}

/** One paragraph. Newlines become `<w:br/>`, so a multi-line note stays one cell. */
function paragraph(text: string, run: RunOpts = {}, para: ParaOpts = {}): string {
  const spacing =
    para.spaceBefore != null || para.spaceAfter != null || para.lineTwips != null
      ? `<w:spacing${para.spaceBefore != null ? ` w:before="${para.spaceBefore}"` : ""}` +
        `${para.spaceAfter != null ? ` w:after="${para.spaceAfter}"` : ""}` +
        `${para.lineTwips != null ? ` w:line="${para.lineTwips}" w:lineRule="exact"` : ""}/>`
      : "";
  const border = para.ruleBelow
    ? `<w:pBdr><w:bottom w:val="single" w:sz="${para.ruleBelow.size}" w:space="2" w:color="${para.ruleBelow.color}"/></w:pBdr>`
    : "";
  const jc = para.right ? `<w:jc w:val="right"/>` : "";
  const pPr = spacing || border || jc ? `<w:pPr>${border}${spacing}${jc}</w:pPr>` : "";
  const rp = runProps(run);
  const runs = xml(text)
    .split("\n")
    .map((line, i) => (i === 0 ? "" : `<w:br/>`) + `<w:t xml:space="preserve">${line}</w:t>`)
    .join("");
  return `<w:p>${pPr}<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ""}${runs}</w:r></w:p>`;
}

// ── the table ───────────────────────────────────────────────────────────────────────

function headerCell(label: string): string {
  return (
    `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${HEAD_FILL}"/>` +
    `<w:tcMar><w:top w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/></w:tcMar></w:tcPr>` +
    paragraph(label, { bold: true, sizeHalfPt: hp(9), color: INK }) +
    `</w:tc>`
  );
}

function bodyCell(value: string | number | null, numeric: boolean | undefined): string {
  const pad = `<w:tcMar><w:top w:w="30" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/></w:tcMar>`;
  if (value === null || value === "") return `<w:tc><w:tcPr>${pad}</w:tcPr><w:p/></w:tc>`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return `<w:tc><w:tcPr>${pad}</w:tcPr><w:p/></w:tc>`;
    return `<w:tc><w:tcPr>${pad}</w:tcPr>${paragraph(String(value), { sizeHalfPt: hp(9.5), color: INK }, { right: true })}</w:tc>`;
  }
  return `<w:tc><w:tcPr>${pad}</w:tcPr>${paragraph(value, { sizeHalfPt: hp(9.5), color: INK }, { right: numeric })}</w:tc>`;
}

function tableXml(table: ExportTable, docNote: string | undefined, first: boolean): string {
  // The section heading, with the 2pt orange rule under it (brand kit: Level 2).
  const heading = paragraph(
    table.name,
    { bold: true, sizeHalfPt: hp(18), color: INK },
    { spaceBefore: first ? 120 : 520, spaceAfter: 200, ruleBelow: { color: ORANGE, size: 16 } }
  );
  const note =
    table.note && table.note !== docNote
      ? paragraph(table.note, { sizeHalfPt: hp(10), color: MUTED }, { spaceAfter: 160, lineTwips: 300 })
      : "";

  const grid = `<w:tblGrid>${table.columns.map(() => `<w:gridCol/>`).join("")}</w:tblGrid>`;
  const headerRow =
    `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
    table.columns.map(c => headerCell(c.label)).join("") +
    `</w:tr>`;
  const bodyRows = table.rows
    .map(
      cells =>
        `<w:tr>` + table.columns.map((c, i) => bodyCell(cells[i] ?? null, c.numeric)).join("") + `</w:tr>`
    )
    .join("");

  // Grey header, hairline row rules, no vertical borders and no zebra — the house table.
  const tbl =
    `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblW w:w="5000" w:type="pct"/>` +
    `<w:tblLayout w:type="autofit"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="single" w:sz="4" w:space="0" w:color="${HAIRLINE}"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="${HAIRLINE}"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="${ROW_RULE}"/>` +
    `</w:tblBorders>` +
    `<w:tblCellMar><w:left w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar>` +
    `</w:tblPr>` +
    grid +
    headerRow +
    bodyRows +
    `</w:tbl>`;

  return heading + note + tbl;
}

function documentXml(doc: ExportDocument, takenAt: Date): string {
  // The title block — the green eyebrow once, the title, the subtitle, the stamp — the way
  // the template's cover opens, sized down for a data export rather than a report cover.
  const head =
    paragraph("LOFTY EXPORT", { bold: true, caps: true, sizeHalfPt: hp(8.5), color: GREEN, spacing: 24 }, { spaceAfter: 60 }) +
    paragraph(doc.title, { bold: true, sizeHalfPt: hp(24), color: INK }, { spaceAfter: 40, lineTwips: 560 }) +
    (doc.note ? paragraph(doc.note, { sizeHalfPt: hp(11.5), color: MUTED }, { spaceAfter: 20, lineTwips: 320 }) : "") +
    paragraph(`Exported ${stamp(takenAt)}`, { sizeHalfPt: hp(9), color: FOOT }, { spaceAfter: 40 });

  const body = doc.tables.map((t, i) => tableXml(t, doc.note, i === 0)).join("");

  // A4 portrait, brand-kit margins (top/bottom 1cm = 567tw, left/right 0.7in = 1008tw), the
  // running header and footer bound to this section.
  const sectPr =
    `<w:sectPr>` +
    `<w:headerReference w:type="default" r:id="rIdHeader"/>` +
    `<w:footerReference w:type="default" r:id="rIdFooter"/>` +
    `<w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="567" w:right="1008" w:bottom="567" w:left="1008" w:header="454" w:footer="454" w:gutter="0"/>` +
    `</w:sectPr>`;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` +
    ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"` +
    ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
    ` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:body>${head}${body}${sectPr}</w:body>` +
    `</w:document>`
  );
}

/** The running header: the wordmark as an inline picture, with a hairline under the paragraph. */
function headerXml(): string {
  // ~86pt wide, in EMU (1pt = 12700 EMU); height follows the logo's aspect. Brand kit draws
  // the logo small in the running header.
  const emuW = Math.round(86 * 12700);
  const emuH = Math.round((86 / LOGO_ASPECT) * 12700);
  const drawing =
    `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${emuW}" cy="${emuH}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:docPr id="1" name="Lofty logo"/>` +
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="Lofty logo"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emuW}" cy="${emuH}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"` +
    ` xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"` +
    ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
    ` xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="${HAIRLINE}"/></w:pBdr>` +
    `<w:spacing w:after="0"/></w:pPr><w:r>${drawing}</w:r></w:p>` +
    `</w:hdr>`
  );
}

/**
 * The running footer: the document name with © and the date on the left, the confidentiality
 * line and an auto-numbered "Page X of Y" on the right. A right-aligned tab stop puts the
 * right-hand run at the margin, and PAGE/NUMPAGES are Word fields it fills in.
 */
function footerXml(doc: ExportDocument, takenAt: Date): string {
  const date = takenAt.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
  const rp = runProps({ sizeHalfPt: hp(7.5), color: FOOT });
  const tab = `<w:r><w:rPr>${rp}</w:rPr><w:tab/></w:r>`;
  const run = (t: string) => `<w:r><w:rPr>${rp}</w:rPr><w:t xml:space="preserve">${xml(t)}</w:t></w:r>`;
  const field = (instr: string) =>
    `<w:r><w:rPr>${rp}</w:rPr><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:rPr>${rp}</w:rPr><w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>` +
    `<w:r><w:rPr>${rp}</w:rPr><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:rPr>${rp}</w:rPr><w:t>1</w:t></w:r>` +
    `<w:r><w:rPr>${rp}</w:rPr><w:fldChar w:fldCharType="end"/></w:r>`;
  // The border sits above the footer, so it reads as a rule over the standing line. A
  // right-aligned tab at the text width (9890 twips = page minus the two margins).
  const line1 =
    `<w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="10" w:color="${HAIRLINE}"/></w:pBdr>` +
    `<w:tabs><w:tab w:val="right" w:pos="9890"/></w:tabs><w:spacing w:after="0" w:line="220" w:lineRule="exact"/></w:pPr>` +
    run(`${doc.title} ©`) + tab + run("Commercial in confidence  ·  Page ") + field("PAGE") + run(" of ") + field("NUMPAGES") +
    `</w:p>`;
  const line2 =
    `<w:p><w:pPr><w:spacing w:after="0" w:line="220" w:lineRule="exact"/></w:pPr>` + run(date) + `</w:p>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    line1 + line2 +
    `</w:ftr>`
  );
}

/** Bare base64 → bytes, for the logo PNG media part. No `atob` (absent in some Node globals). */
function base64ToBytes(b64: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) lookup[chars.charCodeAt(i)] = i;
  const clean = b64.replace(/=+$/, "");
  const out = new Uint8Array((clean.length * 3) >> 2);
  let bits = 0, acc = 0, o = 0;
  for (let i = 0; i < clean.length; i++) {
    acc = (acc << 6) | lookup[clean.charCodeAt(i)];
    bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 0xff; }
  }
  return out;
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
        `<Default Extension="png" ContentType="image/png"/>` +
        `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
        `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
        `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` +
        `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
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
        `<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
        `<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>` +
        `</Relationships>`
    },
    {
      // The header's own relationship to the logo image part.
      path: "word/_rels/header1.xml.rels",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>` +
        `</Relationships>`
    },
    {
      // Montserrat as the document default — the brand's substitute for the .docx a client
      // edits; the reasoning is in houseFormat.ts. A reader without Montserrat installed
      // sees Word's substitution, which is the trade the decision accepts.
      path: "word/styles.xml",
      body:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:docDefaults><w:rPrDefault><w:rPr>` +
        `<w:rFonts w:ascii="${HOUSE_FONT}" w:hAnsi="${HOUSE_FONT}" w:cs="${HOUSE_FONT}"/>` +
        `<w:sz w:val="${hp(10.5)}"/><w:szCs w:val="${hp(10.5)}"/><w:color w:val="${INK}"/>` +
        `</w:rPr></w:rPrDefault></w:docDefaults>` +
        `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
        `</w:styles>`
    },
    { path: "word/header1.xml", body: headerXml() },
    { path: "word/footer1.xml", body: footerXml(doc, takenAt) },
    { path: "word/document.xml", body: documentXml(doc, takenAt) },
    // The logo, as a binary PNG entry — `zip.ts` encodes bodies as UTF-8, so the PNG rides
    // as a Latin-1 string of its bytes and is decoded here into the archive.
    { path: "word/media/image1.png", body: binaryString(base64ToBytes(LOGO_PNG_BASE64)) }
  ];

  return zip(entries, takenAt, ["word/media/image1.png"]);
}

/** Bytes as a string of code points 0–255, the form `zip.ts` stores verbatim as bytes. */
function binaryString(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}
