/**
 * Rendered contrast: what a person actually sees, measured in a browser.
 *
 *   npm run contrast:sweep
 *
 * `check-contrast.mjs` asserts the pairings DESIGN.md writes down, out of the token
 * mirror. This is the other half — it builds the app, serves it, walks the screens and
 * measures every text node as it is painted: the colour composited through every
 * ancestor's opacity, onto the background that actually paints behind it.
 *
 * The difference is not academic. `.pd-stat-lbl` is `--text-color-on-primary` on
 * `--primary-color`, which the palette says is white on Crisp Orange at 2.62:1 — the
 * pairing Amber accepted on 11 September. It rendered at **2.29:1**, because the rule
 * also carried `opacity: 0.85`. Token arithmetic cannot see that and never will: it
 * reads the two colours and has no way to know something dimmed one of them afterwards.
 *
 * ## Two ways this measurement lies, both learned the hard way
 *
 * **`opacity: 0` is not unreadable text.** The first run reported sixteen nodes at
 * 1.00:1 and they looked like the worst finding in the app. They are `.sort-arrow`,
 * held at zero on purpose so every column reserves the arrow's width and the headings
 * do not shift sideways as the sort moves between them. Nodes at zero are skipped.
 *
 * **An unclassed element is not a group.** Grouping by `className` put every bare
 * `<span>` in the app into one bucket — thirty-one nodes across five routes, spanning
 * 1.91 to 2.62, which is not one fault but several unrelated ones averaged into
 * nonsense. An element with no class of its own is now named for its nearest classed
 * ancestor.
 *
 * ## Reading the output
 *
 * Most rows will be 2.62:1, and most of those are fine: that is white on Crisp Orange,
 * which DESIGN.md records as a known shortfall and Amber accepted — *"crisp orange and
 * a white together are ok"*. The rows worth acting on are the ones **below** it, because
 * a pairing that was sanctioned at 2.62 and renders at 2.29 is not the sanctioned
 * pairing — it is that pairing with something dimming it, which nobody agreed to.
 *
 * Not in CI. It builds, serves and drives a browser over twenty-six routes and takes
 * minutes, and it has no baseline to fail against — it reports, a person reads it.
 * `check-contrast.mjs` is the one that bites on every pull request.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile, rm, mkdtemp, writeFile } from "node:fs/promises";
import { createReadStream, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, normalize } from "node:path";
import { chromium } from "playwright";

import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const APP = join(here, "..");
const run = (cmd, args, opts = {}) => new Promise((res, rej) => {
  const c = spawn(cmd, args, { stdio: "inherit", ...opts });
  c.on("exit", code => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))));
});

const ROUTES = ["/", "/dashboard", "/projects", "/jobs", "/tasks",
  "/tasks?scope=all&view=Board", "/tasks?scope=all&view=Calendar",
  "/projects?view=Calendar", "/reports",
  "/setup/properties", "/setup/processes", "/contacts", "/setup/contacts",
  "/setup/notifications", "/maintenance", "/setup/maintenance",
  "/admin", "/settings", "/setup", "/setup/dictionary", "/setup/wiring",
  "/tools/document-builder", "/tools/template-library",
  "/updates/requests", "/updates/roadmap", "/updates/changelog"];

const out = await mkdtemp(join(tmpdir(), "lofty-contrast-"));
let server;
try {
  console.log("building…");
  await run("npx", ["vite", "build", "--config", here + "vite.responsive.ts",
    "--outDir", out, "--emptyOutDir", "--logLevel", "warn"], { cwd: APP });

  const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml",
                  ".png":"image/png", ".json":"application/json", ".woff2":"font/woff2", ".ico":"image/x-icon" };
  const index = await readFile(join(out, "index.html"));
  server = createServer((req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = join(out, p), ext = extname(file);
    let isFile = false;
    if (ext && file.startsWith(out)) { try { isFile = statSync(file).isFile(); } catch {} }
    if (!isFile) { res.writeHead(200, {"content-type":"text/html"}); return res.end(index); }
    res.writeHead(200, {"content-type": TYPES[ext] ?? "application/octet-stream"});
    createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  const MEASURE = () => {
    const parse = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (f, b) => f.slice(0,3).map((c,i) => c*f[3] + b[i]*(1-f[3]));
    const lin = (c) => { c/=255; return c<=0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
    const lum = ([r,g,b]) => 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b);
    const ratio = (f,b) => { const [x,y]=[lum(f),lum(b)].sort((a,c)=>c-a); return (x+0.05)/(y+0.05); };

    // the background that actually paints behind el, compositing every translucent layer
    const backdrop = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        const bg = parse(s.backgroundColor);
        if (bg && bg[3] > 0) layers.push([bg, +s.opacity]);
        if (n === document.body) break;
      }
      let base = [255,255,255];
      for (let i = layers.length - 1; i >= 0; i--) {
        const [bg, op] = layers[i];
        base = over([bg[0], bg[1], bg[2], bg[3] * op], base);
      }
      return base;
    };
    const cumulativeOpacity = (el) => {
      let o = 1;
      for (let n = el; n; n = n.parentElement) { o *= +getComputedStyle(n).opacity; if (n === document.body) break; }
      return o;
    };

    const found = [];
    for (const el of document.querySelectorAll("body *")) {
      const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("").trim();
      if (!text) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none") continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      if (el.closest(".sr-only")) continue;
      const fg = parse(s.color); if (!fg) continue;
      const op = cumulativeOpacity(el);
      // opacity:0 is a spacer, not unreadable text. `.sort-arrow` reserves its width on
      // every column so the headings do not shift as the sort moves, and measuring it
      // reported sixteen nodes at 1.00:1 — the tool's fault, not the app's.
      if (op === 0) continue;
      const bg = backdrop(el);
      const eff = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      const r = ratio(eff, bg);
      if (r < 3) {
        found.push({
          ratio: +r.toFixed(2),
          cls: (() => {
            const own = typeof el.className === "string" && el.className.trim();
            if (own) return "." + own.trim().split(/\s+/).join(".");
            for (let n = el.parentElement; n; n = n.parentElement) {
              const c = typeof n.className === "string" && n.className.trim();
              if (c) return "." + c.trim().split(/\s+/)[0] + " > " + el.tagName.toLowerCase();
            }
            return el.tagName.toLowerCase();
          })(),
          tag: el.tagName.toLowerCase(),
          size: s.fontSize,
          weight: s.fontWeight,
          fgc: eff.map(Math.round).join(","),
          bgc: bg.map(Math.round).join(","),
          text: text.slice(0, 40),
        });
      }
    }
    return found;
  };

  const all = [];
  for (const route of ROUTES) {
    process.stdout.write(".");
    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".app-main", { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(400);
    const found = await page.evaluate(MEASURE);
    for (const f of found) all.push({ ...f, route });
  }
  console.log("");
  await browser.close();

  const byClass = new Map();
  for (const f of all) {
    const k = f.cls;
    if (!byClass.has(k)) byClass.set(k, { cls: k, n: 0, min: 99, max: 0, routes: new Set(), sample: f.text, size: f.size, weight: f.weight, fgc: f.fgc, bgc: f.bgc });
    const g = byClass.get(k);
    g.n++; g.min = Math.min(g.min, f.ratio); g.max = Math.max(g.max, f.ratio); g.routes.add(f.route);
  }
  const groups = [...byClass.values()].sort((a,b) => b.n - a.n);
  console.log(`\n  ${all.length} text nodes under 3:1, in ${groups.length} classes\n`);
  for (const g of groups) {
    console.log(`  ${String(g.n).padStart(4)}  ${g.min.toFixed(2)}–${g.max.toFixed(2)}  ${g.size}/${g.weight}  ${g.cls.slice(0,52).padEnd(52)} ${String(g.routes.size).padStart(2)}rt  ${g.fgc.padEnd(13)}on ${g.bgc.padEnd(13)} "${g.sample}"`);
  }
  // Every measured node, for picking apart a group the summary only counts.
  const detail = join(tmpdir(), "lofty-contrast-nodes.json");
  await writeFile(detail, JSON.stringify(all, null, 1));
  console.log(`\n  every node: ${detail}\n`);
} finally {
  server?.close();
  await rm(out, { recursive: true, force: true });
}
