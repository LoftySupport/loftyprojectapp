/**
 * `npm run export-check` — proves the two files the app hands people are real files.
 *
 * WHY A CHECK AND NOT A LOOK. Both writers produce a container whose correctness is
 * invisible: an .xlsx with one bad byte offset in its ZIP directory, or a PDF whose
 * cross-reference table is counted in characters instead of bytes, opens perfectly in
 * one reader and reports "the file is corrupt" in another. Neither failure can be seen
 * by opening the download on the machine that made it, which is the only way anybody
 * would otherwise test this.
 *
 * Every assertion below was watched to fail (CLAUDE.md — a check nobody has watched
 * fail is not evidence). The comment on each says what was broken to watch it, because
 * that is the part that cannot be re-derived later.
 *
 * WHAT MAKES IT INDEPENDENT. The archive is re-parsed here from the bytes out — end of
 * central directory, then each entry — and every entry's checksum is re-computed with
 * `zlib.crc32`, which is Node's, not the app's. A check that verified the writer's CRC
 * with the writer's own CRC would agree with itself about a wrong answer.
 */
import { crc32 } from "node:zlib";
import { toXlsx } from "../src/data/export/xlsx.ts";
import { toDocx } from "../src/data/export/docx.ts";
import { toPdf } from "../src/data/export/pdf.ts";
import { encode, truncate, widthOf, widthOfBytes } from "../src/data/export/helvetica.ts";
import { fileStem, tableFromFields, type ExportDocument } from "../src/data/export/table.ts";

let failures = 0;
const ok = (name: string, condition: boolean, detail = "") => {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (name: string) => console.log(`\n${name}`);

/** The character that makes a workbook unopenable, spelled rather than typed. */
const NUL = String.fromCharCode(0);

/**
 * The awkward cases, all in one table on purpose.
 *
 * A job number Excel would read as a date, a value that is genuinely absent, an unbound
 * column carrying its token, an ampersand and an angle bracket that have to survive XML,
 * curly quotes and an em dash that have to survive WinAnsi, a character that cannot be
 * encoded at all, a NUL that would make the spreadsheet unopenable, and a free-text
 * field long enough to force truncation in the PDF.
 */
interface Row {
  job: string;
  address: string | null;
  note: string;
  days: number;
}

const rows: Row[] = [
  { job: "1042-01", address: "28 Corner Street, Ridgehaven SA 5097", note: "Fine & dandy <ok>", days: 3 },
  { job: "1042-02", address: null, note: "Amber’s note — “quoted”, café", days: 0 },
  { job: "1042-03", address: "{{addresses.consolidated_address}}", note: "中文 Ω unencodable", days: 41 },
  { job: "1042-100", address: "1 A Street", note: `has a NUL ${NUL} in it`, days: 7 },
  {
    job: "1042-101",
    address: "A very long address indeed, long enough that no column on an A4 page could hold it whole",
    note: "x".repeat(400),
    days: 999
  },
  // Enough ordinary rows to push the table past one page, because the pagination is the
  // part with arithmetic in it — see the page-count assertions below.
  ...Array.from({ length: 60 }, (_v, i) => ({
    job: `1043-${String(i + 1).padStart(3, "0")}`,
    address: `${i + 1} Hawthorn Crescent, Golden Grove SA 5125`,
    note: "Ordinary",
    days: i
  }))
];

const takenAt = new Date("2026-09-03T09:15:00Z");
const doc: ExportDocument = {
  title: "Jobs · at risk",
  note: "Showing 5 of 200 jobs",
  takenAt,
  tables: [
    tableFromFields<Row>(
      "Jobs",
      [
        { label: "Job", text: r => r.job },
        { label: "Address", text: r => r.address },
        { label: "Note", text: r => r.note },
        { label: "Days in stage", numeric: true, text: r => r.days }
      ],
      rows
    ),
    // A second table, to prove sheets and pages are per-table — and one with no rows,
    // which is the case that used to produce a sheet Excel refused to open.
    { name: "Needs attention", columns: [{ label: "Job" }], rows: [] },
    // A name that has to be cut to 31 characters, and cut to something unique.
    { name: "Jobs by stage and by owning team", columns: [{ label: "Stage" }], rows: [["Handover"]] },
    { name: "Jobs by stage and by owning tea", columns: [{ label: "Stage" }], rows: [["Handover"]] }
  ]
};

// ── the archive, re-parsed from the bytes ──────────────────────────────────────────

interface Entry { path: string; body: Buffer; crc: number }

function readZip(bytes: Uint8Array): Entry[] {
  const buf = Buffer.from(bytes);
  let eocd = -1;
  for (let at = buf.length - 22; at >= 0; at--) {
    if (buf.readUInt32LE(at) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0) throw new Error("no end of central directory");
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`central header ${i} is not where the directory says`);
    const crc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 24);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const path = buf.toString("utf8", at + 46, at + 46 + nameLength);
    if (buf.readUInt32LE(localAt) !== 0x04034b50) {
      throw new Error(`the local header for ${path} is not at its stated offset`);
    }
    const localName = buf.readUInt16LE(localAt + 26);
    const localExtra = buf.readUInt16LE(localAt + 28);
    const from = localAt + 30 + localName + localExtra;
    out.push({ path, body: buf.subarray(from, from + size), crc });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

section("the spreadsheet is an OOXML package");
const xlsx = toXlsx(doc);
let entries: Entry[] = [];
try {
  entries = readZip(xlsx);
} catch (e) {
  failures++;
  console.log(`  FAIL the archive parses — ${(e as Error).message}`);
}
const part = (path: string) => entries.find(e => e.path === path)?.body.toString("utf8") ?? "";

// Watched by writing the central directory before the file data, which is what a
// mis-ordered writer does: every offset then points one header early.
ok("every entry's local header sits where the directory says", entries.length > 0);
// Watched by dropping the `xl/` prefix on the sheet parts: Excel then reports the file
// as unreadable, with no indication of which part is missing.
for (const path of [
  "[Content_Types].xml", "_rels/.rels", "docProps/core.xml",
  "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml",
  "xl/worksheets/sheet1.xml", "xl/worksheets/sheet4.xml"
]) {
  ok(`the package contains ${path}`, entries.some(e => e.path === path));
}
// Watched by seeding the CRC at 0 instead of 0xffffffff — every reader then rejects
// every entry, and `unzip -t` reports a bad CRC without saying what it should be.
for (const e of entries) {
  ok(`${e.path} checksums`, crc32(e.body) === e.crc, `the directory says ${e.crc}`);
}
// Watched by declaring one sheet in the workbook and writing two: Excel opens it and
// silently shows one, which is what this pair of assertions exists to catch.
const sheetCount = (part("xl/workbook.xml").match(/<sheet /g) ?? []).length;
ok("a sheet is declared for every table", sheetCount === doc.tables.length, `declared ${sheetCount}`);
const relCount = (part("xl/_rels/workbook.xml.rels").match(/worksheets\//g) ?? []).length;
ok("a relationship points at every sheet part", relCount === doc.tables.length);

section("the sheet says what the screen said");
const sheet1 = part("xl/worksheets/sheet1.xml");
// Watched by writing the job number as `<v>`: Excel reads 1042-01 as a date and the
// column comes back as 01/10/2042.
ok("a job number is a string, not a number", sheet1.includes(`<is><t xml:space="preserve">1042-01</t></is>`));
ok("a job number is never written as a bare value", !sheet1.includes("<v>1042"));
// Watched by writing "—" for a null: a dash in a numeric column stops SUM working, and
// in a text column it is a claim that somebody typed one. Matched as a whole cell, not
// as a substring — one of the notes above legitimately contains an em dash.
ok("an absent value is never a dash", !sheet1.includes(`<t xml:space="preserve">—</t>`));
const nulls = rows.filter(r => r.address === null).length;
const addressCells = (sheet1.match(/<c r="B\d+"/g) ?? []).length;
ok(
  "the blank leaves a hole in its column",
  addressCells === rows.length + 1 - nulls, // +1 for the header, -1 per blank
  `saw ${addressCells} cells in column B`
);
// Watched by dropping the token from the field: an unbound column then exports as blank,
// which reads as "checked, nothing there" instead of "not wired up yet".
ok("an unbound column exports its token", sheet1.includes("{{addresses.consolidated_address}}"));
// Watched by removing the escape: `Fine & dandy` alone makes the part malformed XML and
// the whole workbook unopenable.
ok("an ampersand is escaped", sheet1.includes("Fine &amp; dandy &lt;ok&gt;"));
// Watched by keeping the NUL: Excel reports "unreadable content" on open and does not
// name the cell that did it.
ok("a control character is dropped", !sheet1.includes(NUL));
// Watched by pointing the freeze at row 1: scrolling then hides the headings, which is
// the whole reason a 200-row export needs them frozen.
const headerRow = 5; // title, note, stamp, blank, header
ok(`the pane freezes under the header (row ${headerRow})`, sheet1.includes(`ySplit="${headerRow}"`));
// Watched by leaving the filter on the header row alone: Excel then filters nothing.
ok(
  "the filter covers the header and the rows",
  sheet1.includes(`<autoFilter ref="A${headerRow}:D${headerRow + rows.length}"/>`)
);
// Watched by emitting an autoFilter for the empty table: Excel refuses the file.
ok("an empty table gets no filter", !part("xl/worksheets/sheet2.xml").includes("autoFilter"));

section("Excel's own rules about sheet names");
const names = [...part("xl/workbook.xml").matchAll(/<sheet name="([^"]*)"/g)].map(m => m[1]);
// Watched by passing the 32-character name through: Excel refuses to open the workbook
// and says only that the file is invalid.
ok("no name is longer than 31 characters", names.every(n => n.length <= 31), names.join(" | "));
// Watched by dropping the de-duplication: two tables whose names differ after the 31st
// character produce two tabs called the same thing, and Excel refuses that too.
ok("no two names collide", new Set(names.map(n => n.toLowerCase())).size === names.length, names.join(" | "));

section("the Word document is an OOXML package");
const docx = toDocx(doc);
let wordEntries: Entry[] = [];
try {
  wordEntries = readZip(docx);
} catch (e) {
  failures++;
  console.log(`  FAIL the archive parses — ${(e as Error).message}`);
}
const wordPart = (path: string) => wordEntries.find(e => e.path === path)?.body.toString("utf8") ?? "";

// Watched by dropping the `word/` prefix on the document part: Word then reports the file
// as unreadable, the same way Excel does for a missing sheet.
for (const path of [
  "[Content_Types].xml", "_rels/.rels", "docProps/core.xml",
  "word/document.xml", "word/_rels/document.xml.rels", "word/styles.xml"
]) {
  ok(`the package contains ${path}`, wordEntries.some(e => e.path === path));
}
// Watched by seeding the CRC at 0: every reader then rejects every entry — the same shared
// zip writer as the spreadsheet, re-checked with Node's own CRC, not the app's.
for (const e of wordEntries) {
  ok(`${e.path} checksums`, crc32(e.body) === e.crc, `the directory says ${e.crc}`);
}
// Watched by declaring document.xml as the wrong content type: Word opens the package and
// then refuses the part, with no indication which override is wrong.
ok(
  "the main document is declared as a Word document part",
  wordPart("[Content_Types].xml").includes("wordprocessingml.document.main+xml")
);

section("the Word document says what the screen said");
const document = wordPart("word/document.xml");
// Tag balance, because there is no XML parser in Node's standard library and an unbalanced
// table is exactly what makes Word call the file corrupt. Watched by dropping a closing
// </w:tc>: LibreOffice recovers and Word does not.
const balanced = (tag: string) =>
  (document.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length ===
  (document.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
ok("every table element is closed", balanced("w:tbl"));
ok("every row element is closed", balanced("w:tr"));
ok("every cell element is closed", balanced("w:tc"));
// Watched by writing the job number through a numeric path: a job number is a string in
// Word just as in Excel, and must never lose its leading zeros or its hyphen.
ok("a job number is carried as text", document.includes("1042-01"));
// Watched by writing "—" for a null: an absent value is a blank cell, not a dash. The
// document legitimately contains an em dash inside a note, so this matches the standalone
// run a dash-for-null would produce.
ok("an absent value is never a dash cell", !document.includes(`<w:t xml:space="preserve">—</w:t>`));
// Watched by dropping the token from the field: an unbound column exports its token, so
// the reader sees it is not wired up rather than "checked, nothing there".
ok("an unbound column exports its token", document.includes("{{addresses.consolidated_address}}"));
// Watched by removing the escape: a bare `&` makes the part malformed XML and the whole
// document unopenable.
ok("an ampersand is escaped", document.includes("Fine &amp; dandy &lt;ok&gt;"));
// Watched by keeping the NUL: Word reports the content as unreadable and names no cell.
ok("a control character is dropped", !document.includes(NUL));
// Watched by omitting <w:tblHeader/>: the header row then does not repeat when a long
// table breaks across pages, and page two is a grid of values with no column names.
ok("the header row repeats across pages", document.includes("<w:tblHeader/>"));
// Watched by shading nothing: the header row is then indistinguishable from the body.
ok("the header row is shaded", document.includes(`w:fill="F1F1F3"`));
// Watched by left-aligning figures: a numeric column right-aligns in Word as it does in
// the sheet and the PDF. "Days in stage" is the numeric column in the fixture.
ok("a numeric cell is right-aligned", document.includes(`<w:jc w:val="right"/>`));
// Watched by writing a portrait page: the thirteen-column dictionary needs landscape, and
// this is where that is set for Word.
ok("the page is landscape", document.includes(`w:orient="landscape"`));
// One table element per table in the document — the empty "Needs attention" table still
// gets its heading and its header row. Watched by skipping empty tables: the section then
// vanishes and reads as one lost on the way out.
const tableCount = (document.match(/<w:tbl>/g) ?? []).length;
ok("a table is written for every table", tableCount === doc.tables.length, `saw ${tableCount}`);
ok("an empty table's heading is still present", document.includes("<w:t xml:space=\"preserve\">Needs attention</w:t>"));

section("the PDF is a PDF");
const pdf = Buffer.from(toPdf(doc));
const raw = pdf.toString("latin1");
ok("it starts with a header", raw.startsWith("%PDF-1.4"));
ok("it ends with the EOF marker", raw.trimEnd().endsWith("%%EOF"));

// The xref, walked. This is the table that makes a PDF a PDF: every object's byte offset
// listed in order, and a reader that trusts a wrong one reports the file as damaged
// rather than drawing the page. The classic way to get it wrong is to count characters
// instead of bytes — the first accented character in a heading then puts every later
// object out by one, which Chrome recovers from by rebuilding the table and Acrobat does
// not. Watched with each offset moved by a single byte.
const startxref = Number(raw.match(/startxref\s+(\d+)/)?.[1]);
ok("startxref points at the xref table", raw.startsWith("xref", startxref), `startxref=${startxref}`);
const table = raw.slice(startxref);
const size = Number(table.match(/\/Size (\d+)/)?.[1]);
const offsets = [...table.matchAll(/^(\d{10}) 00000 n /gm)].map(m => Number(m[1]));
ok("the table has an entry for every object", offsets.length === size - 1, `${offsets.length} of ${size - 1}`);
offsets.forEach((at, i) => {
  ok(`object ${i + 1} starts where the xref says`, raw.startsWith(`${i + 1} 0 obj`, at), `offset ${at}`);
});

// Every content stream is ASCII by construction — anything above 126 is written as an
// octal escape — so the byte-versus-character trap that the xref falls into cannot bite
// here. What this guards is the arithmetic around the stream: the newline after
// `stream`, the newline before `endstream`, and the length between them. Watched by
// declaring one byte short, at which point readers truncate the last operator on the
// page and draw the page without its final cell.
const declared = [...raw.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
ok("every content stream declares a length", declared.length > 0);
for (const match of declared) {
  const from = match.index! + match[0].length;
  const length = Number(match[1]);
  const end = pdf.subarray(from + length, from + length + 10).toString("latin1");
  ok("a content stream's length reaches its endstream", end.startsWith("\nendstream"), JSON.stringify(end));
}

const pageCount = (raw.match(/\/Type \/Page[^s]/g) ?? []).length;
const declaredPages = Number(raw.match(/\/Count (\d+)/)?.[1]);
// Watched by leaving /Count at the number of tables while writing more pages: readers
// show only the first few and nothing says the rest are there.
ok("the page tree counts every page", pageCount === declaredPages, `${pageCount} pages, /Count ${declaredPages}`);
// Watched by leaving the 400-character note on one line in one column: the row runs off
// the side of the sheet, and the pagination that assumes one line per row runs off the
// end of the page.
ok("a long table runs to several pages", pageCount > doc.tables.length, `${pageCount} pages`);
// Watched by numbering per table: a nine-page download then reads "Page 1 of 2" three
// times over, and a section that failed to render is invisible.
ok("page numbers count the whole download", raw.includes(`(Page 1 of ${pageCount})`));
ok("the last page is numbered as the last", raw.includes(`(Page ${pageCount} of ${pageCount})`));
// Watched by skipping the empty table's page: "nothing needs attention" is a result, and
// its absence reads as a section lost on the way out.
ok("a table with no rows still gets a page", raw.includes("(Needs attention)"));

section("a table too wide for the page");
// Thirteen columns is the data dictionary, which is what made this necessary: at four
// columns to a page it reads, and at thirteen every cell was an ellipsis.
const wide: ExportDocument = {
  title: "Wide",
  takenAt,
  tables: [
    {
      name: "Wide",
      columns: Array.from({ length: 13 }, (_v, i) => ({ label: i === 0 ? "Job" : `Column ${i}` })),
      rows: [Array.from({ length: 13 }, (_v, i) => (i === 0 ? "1042-01" : `value ${i} `.repeat(6)))]
    }
  ]
};
const widePdf = Buffer.from(toPdf(wide)).toString("latin1");
const widePages = (widePdf.match(/\/Type \/Page[^s]/g) ?? []).length;
// Watched by removing the banding and letting `fitWidths` squeeze all thirteen onto one
// page: it still renders, and every column is five characters of ellipsis.
ok("it is split across pages by column", widePages > 1, `${widePages} pages`);
// Watched by not repeating the first column: the later pages are then columns of values
// with nothing to line them up against, which is worse than truncation.
ok("the identifier repeats on every band", widePdf.includes("with Job repeated"));
const identifierPages = (widePdf.match(/\(1042-01\)/g) ?? []).length;
ok("the identifier's value is on every page", identifierPages === widePages, `on ${identifierPages}`);
ok("the band is named on the page", widePdf.includes("columns "));

// The other side of the rule: a table that is only somewhat too wide is squeezed onto
// one page rather than split. Nine columns of a job overflow a landscape A4 by about a
// fifth, and turning that into two pages to save a few truncated addresses would put the
// columns a reader is comparing on different sheets of paper.
const snug: ExportDocument = {
  title: "Snug",
  takenAt,
  tables: [
    {
      name: "Snug",
      columns: [
        "Job", "Project", "Address", "Suburb", "Stage", "Team", "Assigned to",
        "Created by", "Latest update", "Days", "Status"
      ].map(label => ({ label })),
      // An eighth wider than the page — measured, not guessed: the assertion below is
      // worthless if the fixture happens to fit, and the first two versions of it did.
      rows: [[
        "1042-01", "1042", "Lot 118, 28 Hawthorn Crescent, Golden Grove SA 5125",
        "Golden Grove", "Pre-construction", "Estimating & Design", "Deanna Trescothick",
        "Ketan Raghunathan", "Slab booked for the 14th", 3, "On track"
      ]]
    }
  ]
};
const snugPdf = Buffer.from(toPdf(snug)).toString("latin1");
// Watched by lowering SQUEEZE_LIMIT to 1: this table is a fifth too wide, so it bands in
// two the moment the tolerance goes.
ok("a table a little too wide is squeezed, not split", !snugPdf.includes("columns "));
ok("and it stays on one page", (snugPdf.match(/\/Type \/Page[^s]/g) ?? []).length === 1);

// A table whose columns genuinely fit says nothing about bands at all.
const narrow: ExportDocument = {
  title: "Narrow",
  takenAt,
  tables: [{ name: "Narrow", columns: [{ label: "Job" }, { label: "Stage" }], rows: [["1042-01", "Handover"]] }]
};
// Watched by banding unconditionally: a two-column table then carries a "columns 1-2 of
// 2" line explaining a split that never happened.
ok("a table that fits is not split", !Buffer.from(toPdf(narrow)).toString("latin1").includes("columns "));
// NOTE ON MATCHING, for every assertion above and below that looks inside the file:
// every character above 126 is an octal escape in a PDF string, so the en dash in
// "columns 1–4" is `\226` there. An assertion written with the dash in it passes whatever
// the writer does — which is how the first version of this one "passed" while the
// document under it was banded into eleven pages. Match the ASCII, or match the escape.

section("what the writer can encode, and what it admits it cannot");
// Watched by writing the raw UTF-8 bytes into the string: an em dash then comes out as
// "â€" in every viewer, which is exactly how this app's dashes looked before WinAnsi.
ok("an em dash survives as one character", raw.includes("\\227"));
// Watched by passing unencodable text through: Helvetica has no glyph, so the viewer
// drops it and the width the layout reserved is wrong for the rest of the row.
ok("a character with no glyph becomes a question mark", encode("中")[0] === 0x3f);
// The property behind that: whatever goes in, every byte that comes out has a width.
// Watched by mapping one character in `HIGH` to a code WinAnsi leaves empty — the text
// then draws as nothing while the column reserves no room for it, and every cell after
// it on the row slides left. Swept over the whole BMP prefix the app could ever hold.
const everyByte = encode(
  Array.from({ length: 0x2200 }, (_v, c) => String.fromCharCode(c)).join("")
);
ok(
  "every byte the writer can emit has a width",
  everyByte.every(b => widthOfBytes([b], 9) > 0),
  [...new Set(everyByte.filter(b => widthOfBytes([b], 9) === 0))].join(",")
);
// Watched by hard-cutting instead: "12 Hawthorn Cres" cut to "12 Hawthorn Cre" is a
// different address, and nothing on the page says it was cut.
const cut = truncate("A very long address indeed, longer than its column", 60, 8.5);
ok("a truncated cell says it was truncated", cut.endsWith("…"), cut);
ok("a truncated cell fits its column", widthOf(cut, 8.5) <= 60, `${widthOf(cut, 8.5).toFixed(2)}pt`);
// Watched against the AFM tables the widths were read from, arithmetic done by hand:
// "1042-01" is six digits at 556 plus a hyphen at 333, which is 3669 units of 1/1000 em,
// so 33.021pt at 9pt. A width table that had been remembered rather than read would miss
// this by a few units per character and nothing else in this file would notice.
const measured = widthOf("1042-01", 9);
ok("a string measures what the metrics say", Math.abs(measured - 33.021) < 0.0001, `${measured}pt`);

section("the file name says which download this is");
// Watched by dropping the date: four exports of the same board in a downloads folder are
// "jobs.xlsx" and three copies of it, and nobody can tell which is this morning's.
const stem = fileStem(doc.title, takenAt);
ok("the name carries the screen and the day", stem === "lofty-jobs-at-risk-2026-09-03", stem);

console.log(
  failures === 0
    ? "\nAll export checks passed."
    : `\n${failures} export check${failures === 1 ? "" : "s"} failed.`
);
process.exit(failures === 0 ? 0 : 1);
