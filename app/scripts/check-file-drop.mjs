/**
 * `npm run check:file-drop` — does a dragged file actually arrive?
 *
 * WHY THIS EXISTS AS ITS OWN CHECK
 *
 *   Amber, 14 September: *"can you make it so file uploads can be drag and dropped into
 *   the add files as they are often dragged from emails and not saved"*. The second half
 *   is the requirement — the attachment exists nowhere on disk, so "Browse…" means saving
 *   it first and hunting for it again.
 *
 *   Every interesting part of that is browser behaviour with no pure function underneath:
 *   whether `dragover` was prevented (without it the browser NAVIGATES to the file and the
 *   page appears to crash), what `dataTransfer.files` holds, and what an empty drop does.
 *   None of it can be asserted without a real browser and a real DataTransfer.
 *
 * IT ASSERTS ON WHAT THE CALLER WAS TOLD, not on what the list shows. A drop zone that
 * renders a filename it never passed on looks right in a screenshot and attaches nothing;
 * `window.taken` is what the caller received, which is the thing that matters.
 *
 * THE EMPTY DROP IS THE POINT, not an edge case. Dragging out of Outlook on the web hands
 * the browser a promise it cannot collect, and `files` comes back empty. Doing nothing
 * silently is indistinguishable from a broken page, so the control has to say so — and
 * that sentence is asserted here, because it is the one somebody will actually read.
 *
 * Chromium comes from LOFTY_CHROMIUM if set, for the reason the other browser checks give:
 * a container has the browser on disk under a version Playwright's pin does not know.
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

const out = await mkdtemp(join(tmpdir(), "lofty-drop-"));
let server;
let browser;
try {
  console.log("building the drop zone on its own…");
  await run("npx", ["vite", "build",
    "--config", here + "vite.file-drop.ts",
    "--outDir", out, "--emptyOutDir", "--logLevel", "warn"]);

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
                  ".woff2": "font/woff2", ".ico": "image/x-icon" };
  const html = await readFile(join(out, "scripts", "file-drop.html")).catch(
    () => readFile(join(out, "file-drop.html")));

  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname))
      .replace(/^(\.\.[/\\])+/, "");
    const file = join(out, path);
    const ext = extname(file);
    let isFile = false;
    if (ext && file.startsWith(out)) {
      try { isFile = statSync(file).isFile(); } catch { isFile = false; }
    }
    if (!isFile) { res.writeHead(200, { "content-type": "text/html" }); return res.end(html); }
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const { chromium } = await import("playwright");
  browser = await chromium.launch(
    process.env.LOFTY_CHROMIUM ? { executablePath: process.env.LOFTY_CHROMIUM } : {}
  );
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
  // Nothing off this machine: a check that needs the internet fails for reasons that are
  // not about the code.
  await ctx.route("**://fonts.googleapis.com/**", r => r.abort());
  await ctx.route("**://fonts.gstatic.com/**", r => r.abort());
  const pg = await ctx.newPage();

  const crashes = [];
  pg.on("pageerror", e => crashes.push(String(e)));

  await pg.goto(`${base}/`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".file-drop", { timeout: 20_000 });

  const zone = pg.locator(".file-drop").first();
  const taken = () => pg.evaluate(() => window.taken ?? []);
  const note = () => pg.locator(".file-drop-note").first().innerText().catch(() => "");

  /** A real drop, with real bytes — what the Finder and Outlook for Mac hand over. */
  const drop = async (specs) => {
    const dt = await pg.evaluateHandle((list) => {
      const d = new DataTransfer();
      for (const s of list) d.items.add(new File([s.body ?? "x"], s.name, { type: s.type }));
      return d;
    }, specs);
    await zone.dispatchEvent("dragenter", { dataTransfer: dt });
    await zone.dispatchEvent("dragover", { dataTransfer: dt });
    await zone.dispatchEvent("drop", { dataTransfer: dt });
    await pg.waitForTimeout(250);
  };

  // ---- the line that stops the browser navigating to the file ---------------------
  //
  // `dragover` MUST be prevented or the browser leaves the app and opens the dropped file,
  // which looks exactly like the page crashing. This is asserted directly on
  // `defaultPrevented` rather than through a drop, and that is not a stylistic choice:
  // Playwright's `dispatchEvent("drop")` fires the event straight at the element and
  // bypasses the browser's real drag protocol entirely, so a drop still "works" in this
  // harness with the preventDefault removed. Watched doing exactly that — the whole suite
  // stayed green with the line deleted, which is why this assertion exists.
  const prevented = await zone.evaluate(el => {
    const ev = new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok("dragover is prevented, so the browser drops rather than navigating away", prevented);

  // ---- a photograph, which is the commonest thing dragged ------------------------
  await drop([{ name: "ensuite-tap.jpg", type: "image/jpeg" }]);
  ok("a dropped photo reaches the caller",
    (await taken()).some(f => f.name === "ensuite-tap.jpg"), JSON.stringify(await taken()));

  // ---- several at once, including the two email attachments carry ----------------
  await drop([
    { name: "Defect report.pdf", type: "application/pdf" },
    { name: "Scope.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }
  ]);
  const afterMany = await taken();
  ok("several files in one drop all reach the caller",
    afterMany.some(f => f.name === "Defect report.pdf") && afterMany.some(f => f.name === "Scope.docx"),
    JSON.stringify(afterMany));

  // ---- a type the bucket does not take -------------------------------------------
  // `accept` filters the file PICKER and does nothing to a drop, so without the check in
  // FileDrop this would reach the caller and be refused by Storage with a message nobody
  // can act on.
  const before = (await taken()).length;
  await drop([{ name: "walkthrough.mov", type: "video/quicktime" }]);
  ok("a type the bucket refuses never reaches the caller", (await taken()).length === before);
  ok("and it is named, rather than silently ignored",
    /walkthrough\.mov/.test(await note()), JSON.stringify(await note()));

  // ---- the Outlook-on-the-web case ------------------------------------------------
  await drop([]);
  const empty = await note();
  ok("an empty drop explains itself instead of doing nothing",
    /nothing came across/i.test(empty) && /save the attachment first/i.test(empty), JSON.stringify(empty));

  // ---- a file with no type at all -------------------------------------------------
  // HEIC off a phone, and some mail clients, hand over an empty `type`. Refusing a real
  // photograph because the browser did not label it is the fault this guards against.
  const beforeHeic = (await taken()).length;
  await drop([{ name: "IMG_0042.HEIC", type: "" }]);
  ok("a photo with no MIME type is taken on its extension",
    (await taken()).length === beforeHeic + 1, JSON.stringify(await taken()));

  // ---- the highlight ---------------------------------------------------------------
  ok("the drag highlight clears after the drop",
    !(await zone.evaluate(el => el.className.includes("is-over"))));

  ok("nothing threw", crashes.length === 0, crashes.join(" | "));
} finally {
  await browser?.close();
  server?.close();
  await rm(out, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failed` : "\nok — a dragged file arrives, and a drop that carries nothing says so");
process.exit(failures ? 1 : 0);
