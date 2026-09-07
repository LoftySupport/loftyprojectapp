/**
 * `npm run check:builder-dnd` — can you actually drag a block into a report?
 *
 * WHY THIS EXISTS AS ITS OWN CHECK
 *
 *   Because the answer was no for a while and nothing said so. `useDroppable` was called
 *   in ReportBuilder, the same component that renders `<DndContext>` — and a hook reads
 *   the context of an ANCESTOR, so the document never registered as a drop target.
 *
 *   Every other check stayed green. It typechecked, it linted, it built, and it LOOKED
 *   right: the card dimmed, the drag overlay followed the cursor, the cursor changed to
 *   a grabbing hand. Only `over` was permanently undefined, so the drop silently did
 *   nothing. Reordering blocks already in the document kept working the whole time,
 *   because `useSortable` lives in a child — so the feature read as "drag and drop
 *   works" to anyone who tried the wrong half of it first.
 *
 *   Amber found it, not the suite: *"drag and drop isnt working on the add block to
 *   report it only ads by double clicking"*.
 *
 * It needs a real browser because that is where the bug lived. There is no unit test of
 * a pure function that would have caught it — the fault was in where a hook was called
 * relative to a provider, and it only shows up when a pointer moves.
 *
 * Chromium comes from LOFTY_CHROMIUM if set, for the same reason responsive-check.mjs
 * takes it: a container has the browser on disk under a version Playwright's pin does
 * not know, and "run npx playwright install" is a dead end with no network.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, rm, mkdtemp } from "node:fs/promises";
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

const out = await mkdtemp(join(tmpdir(), "lofty-dnd-"));
let server;
let browser;
try {
  console.log("building the builder on its own…");
  await run("npx", ["vite", "build",
    "--config", here + "vite.builder-dnd.ts",
    "--outDir", out, "--emptyOutDir", "--logLevel", "warn"]);

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
                  ".woff2": "font/woff2", ".ico": "image/x-icon" };
  const page = await readFile(join(out, "scripts", "builder-dnd.html")).catch(
    () => readFile(join(out, "builder-dnd.html")));

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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Nothing off this machine, for the reason responsive-check.mjs gives: a check that
  // needs the internet is a check that fails for reasons that are not about the code.
  await ctx.route("**://fonts.googleapis.com/**", r => r.abort());
  await ctx.route("**://fonts.gstatic.com/**", r => r.abort());
  const pg = await ctx.newPage();

  const crashes = [];
  pg.on("pageerror", e => crashes.push(String(e)));

  await pg.goto(`${base}/`, { waitUntil: "networkidle" });
  await pg.waitForSelector('[role="dialog"]', { timeout: 20_000 });
  await pg.waitForTimeout(400);

  const EMPTY = "Drag blocks in from the palette";

  ok("the builder mounts with an empty document",
    (await pg.getByText(EMPTY).count()) === 1);

  /** Press, move in steps, release. One jump does not drag: dnd-kit's PointerSensor
   *  activates on movement, and a single teleport from A to B is one event. */
  const dragIn = async (label) => {
    const card = pg.locator("aside button", { hasText: label }).first();
    const from = await card.boundingBox();
    const onto = await pg.locator("main").first().boundingBox();
    const tx = onto.x + onto.width / 2;
    const ty = onto.y + 220;
    await pg.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await pg.mouse.down();
    for (let i = 1; i <= 14; i++) {
      await pg.mouse.move(
        from.x + from.width / 2 + (tx - from.x - from.width / 2) * i / 14,
        from.y + from.height / 2 + (ty - from.y - from.height / 2) * i / 14
      );
      await pg.waitForTimeout(20);
    }
    await pg.mouse.up();
    await pg.waitForTimeout(500);
  };

  // THE ONE THAT MATTERS. Broken by moving `useDroppable` back into ReportBuilder,
  // beside the `<DndContext>` it renders: the drag still animates, and this reports.
  await dragIn("Text");
  ok("dragging a block from the palette puts it in the document",
    (await pg.getByText(EMPTY).count()) === 0,
    "the empty-state is still showing, so nothing was dropped");

  // A second one, because "the first drop works" and "drops work" are different claims —
  // the first lands on an empty page, the rest land on a SortableContext.
  await dragIn("Divider");
  const blocks = await pg.locator("main [data-block]").count();
  ok("and a second block lands alongside the first", blocks >= 2, `${blocks} blocks`);

  // Clicking is the other way in, and it is the one Amber fell back to. Broken by
  // removing `onClick` from PaletteCard.
  await pg.locator("aside button", { hasText: "QR code" }).first().click();
  await pg.waitForTimeout(400);
  const afterClick = await pg.locator("main [data-block]").count();
  ok("clicking a palette card adds one at the end", afterClick === blocks + 1,
    `${blocks} → ${afterClick}`);

  // ── Placeholders in prose ─────────────────────────────────────────────
  //
  // The resolver is covered in Node by `check:report-widgets`. What is checked here is
  // the round trip: the menu exists in the editor people actually write in, choosing an
  // item puts the token in the text, and the preview then shows the value.
  //
  // NOT COVERED, and worth saying: whether `el.focus()` before `insertText` is needed.
  // Commenting it out leaves this green, because `selectOption` does not move focus the
  // way a real click on a <select> does. The line stays for the real pointer; the claim
  // that it is load-bearing is not one this check earns.
  await dragIn("Text");
  const editor = pg.locator('[contenteditable="true"]').first();
  await editor.click();
  await pg.keyboard.type("Booked for ");
  // Scoped to the canvas. There are two of these — the settings panel renders the same
  // editor — and the one that matters is the one you write in. An unscoped locator is
  // ambiguous, which is Playwright telling you the same thing.
  const menu = pg.locator('main select[aria-label="Insert a field"]');
  ok("the editor you write in offers the host's fields", await menu.count() === 1,
    `${await pg.locator('select[aria-label="Insert a field"]').count()} on the page`);

  if (await menu.count()) {
    await menu.selectOption("slab_cost");
    await pg.waitForTimeout(400);
    const typed = await editor.innerText();
    // Broken by removing the `insertToken` call, or the menu's onChange.
    ok("choosing one puts the token where the caret is",
      typed.includes("{{slab_cost}}"), JSON.stringify(typed.slice(0, 80)));

    // And once you step away, the canvas shows the VALUE rather than the token.
    //
    // The deselect is the point, not a workaround: a SELECTED text block is the editor,
    // and it has to show the literal `{{slab_cost}}` or the token could never be edited
    // or deleted. Only the resolved preview substitutes. Getting this wrong in the check
    // would have meant "asserting the editor does not resolve", which is nothing.
    //
    // Broken by removing the fillTokens call in core/registry.js: the preview keeps
    // showing the braces.
    await pg.locator("main").first().click({ position: { x: 5, y: 5 } });
    await pg.waitForTimeout(900);
    const canvas = await pg.locator("main").first().innerText();
    ok("and the document shows what it resolves to",
      /A\$18[,.]?400/.test(canvas), JSON.stringify(canvas.slice(0, 160)));
  }

  // ── Snippets: saved wording, inserted and kept ────────────────────────
  //
  // Two claims, and they fail for different reasons, so they are two assertions.
  //
  // The block is re-selected first: the token half above deselected it to read the
  // resolved preview, and a deselected text block is not an editor.
  await pg.locator('main [data-block="text"]').last().click();
  await pg.waitForTimeout(300);
  const rte = pg.locator('main [contenteditable="true"]').first();

  const snipMenu = pg.locator('main select[aria-label="Insert a snippet"]');
  ok("the editor offers the host's saved wording", await snipMenu.count() === 1,
    `${await pg.locator('select[aria-label="Insert a snippet"]').count()} on the page`);

  if (await snipMenu.count()) {
    // Broken by making insertSnippet use insertText: the tags arrive as visible
    // characters and `<b>` never becomes an element, so this reports.
    await snipMenu.selectOption("sn_signoff");
    await pg.waitForTimeout(400);
    const html = await rte.innerHTML();
    ok("inserting one brings its formatting with it",
      html.includes("Kind regards") && /<b>\s*Lofty\s*<\/b>/i.test(html),
      JSON.stringify(html.slice(-140)));
  }

  // WHICH HTML "Save snippet" HANDS OVER.
  //
  // Select the word "Lofty" only, then click the button, and the host should be handed
  // that word rather than the whole block.
  //
  // This is what proves `onMouseDown={e => e.preventDefault()}` on the button is
  // load-bearing rather than decoration. Watched both ways: with the handler removed,
  // the real click moves focus, the contenteditable's selection collapses before the
  // click handler runs, and `saveSnippet` falls through to the whole-block branch —
  // `__savedSnippet` comes back with "Booked for" in it and this reports.
  await pg.evaluate(() => {
    const el = document.querySelector('main [contenteditable="true"]');
    const bold = el?.querySelector("b");
    if (!bold) return;
    const range = document.createRange();
    range.selectNodeContents(bold);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  await pg.locator("main [data-save-snippet]").first().click();
  await pg.waitForTimeout(300);
  const saved = await pg.evaluate(() => window.__savedSnippet ?? null);
  ok("saving one keeps the selection, not the whole block",
    typeof saved === "string" && saved.includes("Lofty") && !saved.includes("Booked for"),
    JSON.stringify(saved));

  // AND THE CARET IS STILL IN THE EDITOR AFTERWARDS.
  //
  // This is the claim `onMouseDown={e => e.preventDefault()}` on the button actually
  // earns. Reading the selection does NOT need it — a DOM Selection is document-wide and
  // survives focus moving to a button, which is why removing the handler leaves the
  // assertion above green. What it earns is this: without it the click focuses the
  // button, and the next thing the author types goes nowhere.
  //
  // Watched both ways: with the handler removed, "!" lands outside the editor and this
  // reports.
  await pg.keyboard.type("!");
  await pg.waitForTimeout(300);
  const afterSave = await rte.innerText();
  ok("and the caret stays in the editor, so typing carries on",
    afterSave.trimEnd().endsWith("!"), JSON.stringify(afterSave.slice(-60)));

  ok("nothing threw while doing it", crashes.length === 0, crashes[0]?.slice(0, 200));
} finally {
  await browser?.close().catch(() => {});
  server?.close();
  await rm(out, { recursive: true, force: true });
}

console.log(failures === 0
  ? "\nthe builder accepts blocks: dragged in, clicked in, and its editor keeps wording"
  : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
