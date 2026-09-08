/**
 * `npm run check:import` — does a Word document or a PDF actually become blocks?
 *
 * WHY A BROWSER, AND WHY REAL FILES
 *
 *   The .docx path parses html with `DOMParser` and the .pdf path runs pdfjs in a Worker.
 *   Neither exists in Node, so a Node test would exercise a different code path from the
 *   one that ships. And a hand-written fixture object would test the walker while
 *   skipping the parsers, which are the part most likely to be wrong.
 *
 *   So both fixtures are REAL FILES, generated here rather than committed:
 *
 *     .docx  built with the `docx` package the app already uses to export one. A
 *            round trip through the library's own writer is the closest thing to a
 *            document somebody would actually hand over.
 *     .pdf   written by hand, byte by byte, with correct xref offsets. There is no
 *            PDF writer in this repo and adding one to make a test file would be a
 *            dependency the app does not otherwise need.
 *
 *   Generated rather than committed because a binary fixture is a thing nobody can read
 *   in a diff, and one that drifts from what it was meant to prove without anybody
 *   noticing.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, rm, mkdtemp } from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const run = (cmd, args, opts = {}) =>
  new Promise((resolve, reject) => {
    const c = spawn(cmd, args, { stdio: "inherit", ...opts });
    c.on("exit", code => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) console.log(`  ok   ${name}`);
  else { failures += 1; console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};

// ─── The .docx fixture ───────────────────────────────────────────────
async function buildDocx() {
  const { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun } =
    await import("docx");
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ text: "Site Report", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun("First paragraph of the letter.")] }),
        new Paragraph({ children: [new TextRun("Second paragraph, same run of prose.")] }),
        new Paragraph({ text: "Scope of Works", heading: HeadingLevel.HEADING_2 }),
        new Table({
          rows: [
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph("Item")] }),
              new TableCell({ children: [new Paragraph("Cost")] })
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph("Slab")] }),
              new TableCell({ children: [new Paragraph("18400")] })
            ]})
          ]
        })
      ]
    }]
  });
  return Packer.toBuffer(doc);
}

// ─── The .pdf fixture, written by hand ───────────────────────────────
/**
 * A minimal two-page PDF with a 24pt title and 10pt body on each page.
 *
 * Offsets are tracked as the objects are written, because the xref table is a list of
 * byte offsets and pdfjs uses it to find the objects. Getting it wrong does not fail
 * loudly — pdfjs falls back to scanning the file and often recovers, which would make a
 * broken fixture look like a working one.
 *
 * Uncompressed streams on purpose: the point is to exercise the text extractor, not a
 * flate decoder, and an uncompressed stream is one somebody can read in a hex dump when
 * this check disagrees with them.
 */
function buildPdf() {
  const parts = [];
  const offsets = [0];
  let length = 0;
  const push = (s) => { parts.push(Buffer.from(s, "latin1")); length += Buffer.byteLength(s, "latin1"); };
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n${body}\nendobj\n`); };

  const content = (title, body) =>
    `BT /F1 24 Tf 72 700 Td (${title}) Tj ET\n` +
    `BT /F1 10 Tf 72 660 Td (${body}) Tj ET\n` +
    `BT /F1 10 Tf 72 646 Td (A second line of the same paragraph.) Tj ET\n`;

  push("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>");
  obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
       + "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>");
  const c1 = content("Site Report", "The first page body text.");
  obj(4, `<< /Length ${c1.length} >>\nstream\n${c1}endstream`);
  obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  obj(6, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
       + "/Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>");
  const c2 = content("Second Page", "The second page body text.");
  obj(7, `<< /Length ${c2.length} >>\nstream\n${c2}endstream`);

  const xref = length;
  const n = 8;
  let table = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) table += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

const out = await mkdtemp(join(tmpdir(), "lofty-import-"));
let server;
let browser;
try {
  console.log("building the importer on its own…");
  await run("npx", ["vite", "build",
    "--config", here + "vite.import.ts",
    "--outDir", out, "--emptyOutDir", "--logLevel", "warn"]);

  await writeFile(join(out, "fixture.docx"), await buildDocx());
  await writeFile(join(out, "fixture.pdf"), buildPdf());
  // Neither a zip nor a %PDF — the file somebody picks by mistake.
  await writeFile(join(out, "fixture.txt"), "just some text, not a document at all");

  /**
   * The .html fixture, shaped like html actually is rather than like mammoth's output.
   *
   * NESTED THREE DEEP ON PURPOSE. That is the whole reason the walker descends: the old
   * one read `body.children`, which here is a single <div>, and would have produced one
   * text block holding the entire letter. Every other assertion in this group would
   * still have passed on a flat fixture.
   *
   * It also carries a <script> and a <style> whose text must never appear as prose, an
   * absolute image URL that should survive as an Image block, and a relative one that
   * cannot.
   */
  await writeFile(join(out, "fixture.html"), `<!doctype html>
<html><head>
  <title>Should not appear</title>
  <style>.letterhead { color: red; }</style>
</head>
<body>
  <div class="page"><div class="content"><section>
    <style>.in-the-body { color: blue; }</style>
    <h1>Site Report</h1>
    <p>First paragraph of the letter.</p>
    <p>Second paragraph, same run of prose.</p>
    <h4>A fourth-level heading</h4>
    <div>A bare div is how a lot of html writes a paragraph.</div>
    <img src="https://example.invalid/logo.png" alt="Our logo">
    <img src="./photo-next-to-the-file.png" alt="Site photo">
    <table>
      <tr><th>Item</th><th>Cost</th></tr>
      <tr><td>Slab</td><td>18400</td></tr>
    </table>
    <hr>
    <p>After the rule.</p>
  </section></div></div>
  <script>window.SHOULD_NOT_APPEAR = 1;</script>
</body></html>`);

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
                  ".css": "text/css", ".json": "application/json", ".txt": "text/plain",
                  ".pdf": "application/pdf", ".html": "text/html",
                  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  const page = await readFile(join(out, "scripts", "import.html")).catch(
    () => readFile(join(out, "import.html")));

  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname))
      .replace(/^(\.\.[/\\])+/, "");
    const file = join(out, path);
    const ext = extname(file);
    let isFile = false;
    if (ext && file.startsWith(out)) {
      try { isFile = statSync(file).isFile(); } catch { isFile = false; }
    }
    if (!isFile) { res.writeHead(200, { "content-type": "text/html" }); return res.end(page); }
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const { chromium } = await import("playwright");
  browser = await chromium.launch(
    process.env.LOFTY_CHROMIUM ? { executablePath: process.env.LOFTY_CHROMIUM } : {}
  );
  const ctx = await browser.newContext();
  await ctx.route("**://fonts.googleapis.com/**", r => r.abort());
  await ctx.route("**://fonts.gstatic.com/**", r => r.abort());
  const pg = await ctx.newPage();
  const crashes = [];
  pg.on("pageerror", e => crashes.push(String(e)));
  await pg.goto(`${base}/`, { waitUntil: "networkidle" });
  await pg.waitForSelector("#root:has-text('ready')", { timeout: 20_000 });

  // ── The format is decided by the bytes, not the name ─────────────────
  //
  // Broken by trusting `file.name`: a .docx someone renamed to .pdf then goes to the
  // PDF parser and fails with a message about PDFs, which sends them the wrong way.
  const kinds = await pg.evaluate(async () =>
    [await window.__sniff("/fixture.docx"), await window.__sniff("/fixture.pdf"),
     await window.__sniff("/fixture.txt"), await window.__sniff("/fixture.html")]);
  ok("the format is read from the bytes, not the file name",
    kinds[0] === "docx" && kinds[1] === "pdf" && kinds[2] === null && kinds[3] === "html",
    JSON.stringify(kinds));

  // ── Word ─────────────────────────────────────────────────────────────
  const docx = await pg.evaluate(async () => window.__import("/fixture.docx"));
  const dKinds = docx.widgets.map(w => w.kind);

  // Broken by dropping the h1/h2 branch: the headings arrive as ordinary prose and the
  // template has no sections at all.
  ok("a Word heading becomes a heading block",
    docx.widgets.filter(w => w.kind === "heading").map(w => w.options.text)
      .join("|") === "Site Report|Scope of Works",
    JSON.stringify(dKinds));

  // Broken by flushing per paragraph: two adjacent paragraphs become two blocks, and a
  // twelve-paragraph letter becomes twelve things to click through.
  //
  // The claim is that ADJACENT prose collects, not that the whole document is one block:
  // this fixture has two sections, so two text blocks is the right answer and an earlier
  // version of this assertion demanding exactly one was simply wrong. What it checks is
  // that the two paragraphs between the first two headings share a block.
  const firstText = docx.widgets.find(w => w.kind === "text");
  ok("consecutive paragraphs collect into one text block",
    firstText?.options.html.includes("First paragraph")
    && firstText.options.html.includes("Second paragraph"),
    JSON.stringify(dKinds));

  // Broken by skipping tableFrom: the table's text is lost entirely rather than arriving
  // as a table somebody can edit.
  const tbl = docx.widgets.find(w => w.kind === "freeTable");
  ok("a Word table becomes a table, header row and all",
    tbl?.options.headers.join(",") === "Item,Cost"
    && tbl.options.rows[0].join(",") === "Slab,18400",
    JSON.stringify(tbl?.options));

  // ── PDF ──────────────────────────────────────────────────────────────
  const pdf = await pg.evaluate(async () => window.__import("/fixture.pdf"));
  const pKinds = pdf.widgets.map(w => w.kind);

  // 24pt against a 10pt body. Broken by comparing to the MEAN size rather than the mode:
  // with two 10pt lines and one 24pt line per page the mean is ~15, and 24 > 15 * 1.15
  // still passes — so this is not the assertion that catches that. The one below is.
  ok("a PDF's larger text is inferred as a heading",
    pdf.widgets.filter(w => w.kind === "heading").map(w => w.options.text)
      .join("|") === "Site Report|Second Page",
    JSON.stringify(pKinds));

  // Body text must NOT be promoted. Broken by lowering the 1.15 threshold to 1.0, which
  // makes every line its own heading and the import useless.
  ok("and its body text is not",
    pdf.widgets.filter(w => w.kind === "text").length >= 2
    && pdf.widgets.some(w => w.kind === "text" && w.options.html.includes("first page body")),
    JSON.stringify(pdf.widgets.filter(w => w.kind === "text").map(w => w.options.html)));

  // Runs on one baseline are one line. Broken by dropping the baseline grouping: each
  // pdfjs text item becomes its own line and the prose arrives in fragments.
  ok("two lines of one paragraph arrive as one paragraph",
    pdf.widgets.some(w => w.kind === "text"
      && w.options.html.includes("body text.") && w.options.html.includes("second line")),
    JSON.stringify(pdf.widgets.filter(w => w.kind === "text").map(w => w.options.html)));

  // Broken by not emitting the divider between pages: a two-page source prints as one
  // continuous run.
  ok("a page break in the source becomes a page break in the template",
    pdf.widgets.some(w => w.kind === "divider" && w.options.pageBreak === true),
    JSON.stringify(pKinds));

  // THE HONESTY HALF. The notes are what the conversion could not carry, and they are
  // the difference between a lossy import and a lying one. Broken by returning [].
  ok("a PDF import says its headings were inferred and its tables were not",
    pdf.notes.some(n => /inferred/i.test(n)) && pdf.notes.some(n => /table/i.test(n)),
    JSON.stringify(pdf.notes));

  // ── HTML ─────────────────────────────────────────────────────────────
  const htm = await pg.evaluate(async () => window.__import("/fixture.html"));
  const hKinds = htm.widgets.map(w => w.kind);

  // THE ONE THE WALKER EXISTS FOR. The fixture nests three deep; the old walker read
  // body.children, found one <div>, and would have produced a single text block holding
  // the whole letter. Broken by removing the CONTAINERS descent: this collapses to 1.
  ok("nested wrappers are descended, not treated as one paragraph",
    htm.widgets.length >= 6, `${htm.widgets.length} blocks: ${JSON.stringify(hKinds)}`);

  // h1 and h4 both. Broken by keeping the old /^h[1-3]$/ test: the h4 arrives as prose.
  ok("headings at any level become headings",
    htm.widgets.filter(w => w.kind === "heading").map(w => w.options.text)
      .join("|") === "Site Report|A fourth-level heading",
    JSON.stringify(hKinds));

  const hTable = htm.widgets.find(w => w.kind === "freeTable");
  ok("an HTML table becomes a table",
    hTable?.options.headers.join(",") === "Item,Cost"
    && hTable.options.rows[0].join(",") === "Slab,18400",
    JSON.stringify(hTable?.options));

  // An html image is a URL, unlike a Word one which is bytes. Broken by passing
  // keepImageUrls: false for the html path — the logo silently disappears.
  const img = htm.widgets.find(w => w.kind === "image");
  ok("an absolute image URL survives as an Image block",
    img?.options.url === "https://example.invalid/logo.png" && img.options.caption === "Our logo",
    JSON.stringify(img?.options));

  // …and the relative one cannot, so it is COUNTED rather than dropped in silence.
  // Broken by lumping it in with droppedImages: the note then blames the wrong thing.
  ok("a relative image is reported rather than silently lost",
    htm.notes.some(n => /pointed at a file next to the document/.test(n)),
    JSON.stringify(htm.notes));

  // A bare <div> of text is a paragraph — that is how a lot of html writes one.
  ok("a bare div of text is read as prose",
    htm.widgets.some(w => w.kind === "text" && /bare div/.test(w.options.html)),
    JSON.stringify(htm.widgets.filter(w => w.kind === "text").map(w => w.options.html)));

  // NOTHING FROM <script>, <style> OR <title> ANYWHERE — including a <style> inside the
  // body, which is the case that could plausibly leak.
  //
  // WHAT BREAKS THIS, AND WHAT DOES NOT. Dropping the IGNORED removal in import.js does
  // NOT break it, which was a surprise and is why the fixture now carries a body-level
  // <style>: DOMPurify removes script and style along with their CONTENTS, so the
  // sanitiser is what guards this, not the strip. What breaks it is widening the editor's
  // ALLOWED_TAGS, or sanitising per block being replaced by trusting the source.
  const allHtml = JSON.stringify(htm.widgets);
  ok("script, style and title text never become content",
    !/SHOULD_NOT_APPEAR/.test(allHtml) && !/letterhead/.test(allHtml)
    && !/Should not appear/.test(allHtml) && !/in-the-body/.test(allHtml),
    allHtml.slice(0, 200));

  ok("a horizontal rule becomes a divider",
    htm.widgets.some(w => w.kind === "divider"), JSON.stringify(hKinds));

  // ── Neither ──────────────────────────────────────────────────────────
  const refused = await pg.evaluate(async () => {
    try { await window.__import("/fixture.txt"); return null; }
    catch (e) { return String(e.message ?? e); }
  });
  ok("anything that is not one of the three is refused by name",
    typeof refused === "string" && /Word/.test(refused) && /PDF/.test(refused)
    && /HTML/.test(refused), JSON.stringify(refused));

  ok("nothing threw while doing it", crashes.length === 0, crashes[0]?.slice(0, 200));
} finally {
  await browser?.close().catch(() => {});
  server?.close();
  await rm(out, { recursive: true, force: true });
}

console.log(failures === 0
  ? "\nimport: Word, PDF and HTML all become blocks, and say what they lost"
  : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
