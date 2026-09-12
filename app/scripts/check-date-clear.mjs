/**
 * `npm run check:date-clear` — can you take a date back?
 *
 * WHY THIS EXISTS AS ITS OWN CHECK
 *
 *   Amber, 12 September: *"when you are on a date field the reset button isn't working —
 *   for example on a job if I hit the completion date by accident u can't undo it. You
 *   should be able to x it out."*
 *
 *   Two separate faults wore the same coat. The job's completion date was a bare
 *   `<input type="date">`, and the browser's own clear is not a promise: Chrome draws a
 *   small ✕, Safari draws nothing, and a phone gives you a wheel with no way back to
 *   empty. And every property of format `date` DID have a clear, which silently did
 *   nothing — `onChange` read `if (e.target.value)`, so emptying the field told nobody
 *   and the old value stayed exactly where it was.
 *
 *   The second one is the reason this check asserts on what the CALLER was told rather
 *   than on what the input is showing. A control that empties on screen and reports
 *   nothing looks fixed in a screenshot and is not fixed at all.
 *
 * It needs a real browser because `input type="date"` is where the fault lived: its
 * empty value, its native clear, and the difference between the two are all browser
 * behaviour, and there is no pure function underneath to test instead.
 *
 * Not the app, and not the responsive harness: `stubRepository.updateJob` throws
 * ("Editing a job needs Supabase."), so a date typed into a job reverts before the check
 * can see it. `scripts/date-clear-stub.jsx` mounts the two controls with local state.
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

const out = await mkdtemp(join(tmpdir(), "lofty-date-"));
let server;
let browser;
try {
  console.log("building the two date controls on their own…");
  await run("npx", ["vite", "build",
    "--config", here + "vite.date-clear.ts",
    "--outDir", out, "--emptyOutDir", "--logLevel", "warn"]);

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
                  ".woff2": "font/woff2", ".ico": "image/x-icon" };
  const html = await readFile(join(out, "scripts", "date-clear.html")).catch(
    () => readFile(join(out, "date-clear.html")));

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
  // Nothing off this machine, for the reason responsive-check.mjs gives: a check that
  // needs the internet is a check that fails for reasons that are not about the code.
  await ctx.route("**://fonts.googleapis.com/**", r => r.abort());
  await ctx.route("**://fonts.gstatic.com/**", r => r.abort());
  const pg = await ctx.newPage();

  const crashes = [];
  pg.on("pageerror", e => crashes.push(String(e)));

  await pg.goto(`${base}/`, { waitUntil: "networkidle" });
  await pg.waitForSelector(".date-field-input", { timeout: 20_000 });

  const told = () => pg.evaluate(() => window.saved ?? {});

  // ---- the job's completion date ------------------------------------------------
  const field = pg.locator(".date-field-input").first();
  ok("the completion date starts at the date it was given",
    (await field.inputValue()) === "2027-03-04", await field.inputValue());

  const x = pg.getByRole("button", { name: "Clear Completion date" });
  ok("the ✕ is there while there is something to clear", await x.isVisible());

  await x.click();
  await pg.waitForTimeout(200);
  const afterX = await told();
  ok("pressing ✕ tells the caller the date is gone",
    afterX.completion === null, JSON.stringify(afterX.completion));
  ok("pressing ✕ empties the field", (await field.inputValue()) === "");
  ok("with nothing to clear the ✕ leaves the keyboard order",
    (await pg.locator(".date-field-clear").first().getAttribute("tabindex")) === "-1");
  ok("and focus is back on the field, ready for the right date",
    await pg.evaluate(() => document.activeElement?.classList.contains("date-field-input")));

  // Typed straight back in — the commonest reason to clear one.
  await field.fill("2028-01-09");
  await pg.waitForTimeout(200);
  ok("typing a date after clearing reaches the caller",
    (await told()).completion === "2028-01-09", JSON.stringify((await told()).completion));
  ok("and the ✕ comes back with it", await x.isVisible());

  // ---- a property of format date ------------------------------------------------
  // The half that emptied on screen and told nobody. Driven by setting the input to ""
  // and firing the event, which is what the browser's own clear does — Playwright's
  // fill("") does the same through the same path.
  const propInput = pg.locator(".pf-date input[type=date]").first();
  ok("the property date starts at the date it was given",
    (await propInput.inputValue()) === "2027-03-04", await propInput.inputValue());

  await propInput.fill("");
  await pg.waitForTimeout(200);
  const afterEmpty = await told();
  ok("emptying a property date reaches the caller as null, rather than being swallowed",
    afterEmpty.property === null, JSON.stringify(afterEmpty.property));

  ok("nothing threw", crashes.length === 0, crashes.join(" | "));
} finally {
  await browser?.close();
  server?.close();
  await rm(out, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failed` : "\nok — a date can be taken back");
process.exit(failures ? 1 : 0);
