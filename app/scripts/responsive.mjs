/**
 * `npm run responsive` — build, serve, measure, tear down.
 *
 * Against the BUILT app, not the dev server. Two reasons, one practical and one that
 * matters more: a cold dev server transforms Vibe per route and a fifty-page sweep took
 * over half an hour, and the CSS the dev server serves is not the CSS that ships. The
 * `:has()` selector and the `min()` widths this check exists to verify all go through a
 * minifier on the way to production, and a minifier is a thing that can drop them.
 *
 * The build uses `scripts/vite.responsive.ts`, which aliases in a signed-in session so
 * the pages are reachable at all — see README.md. Its output goes to a temp directory
 * outside the repo and is deleted afterwards, because a bundle carrying that stub must
 * never be sitting next to `dist/` where something could publish it.
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

let code = 0;
const out = await mkdtemp(join(tmpdir(), "lofty-responsive-"));
try {
  console.log("building…");
  await run("npx", ["vite", "build",
    "--config", here + "vite.responsive.ts",
    "--outDir", out,
    "--emptyOutDir",
    "--logLevel", "warn"]);

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
                  ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json",
                  ".woff2": "font/woff2", ".ico": "image/x-icon" };
  const index = await readFile(join(out, "index.html"));

  const server = createServer((req, res) => {
    // normalize() then strip any leading traversal: this serves a directory over HTTP and
    // "../../etc/passwd" is a real request somebody's scanner will make even on localhost.
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname))
      .replace(/^(\.\.[/\\])+/, "");
    const file = join(out, path);
    const ext = extname(file);
    // Every app route is client-side, so anything that is not a file on disk is
    // index.html. Checked with statSync before any header goes out — writing a 404 from
    // the stream's error handler is too late, the 200 has already been sent, and the
    // ERR_HTTP_HEADERS_SENT that follows takes the whole server down mid-run.
    let isFile = false;
    if (ext && file.startsWith(out)) {
      try { isFile = statSync(file).isFile(); } catch { isFile = false; }
    }
    if (!isFile) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(index);
    }
    res.writeHead(200, { "content-type": TYPES[ext] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });

  // Port 0: the OS picks a free one. A fixed port means the check fails with EADDRINUSE
  // whenever somebody has `npm run dev` open, which is most of the time.
  await new Promise(r => server.listen(Number(process.env.RESPONSIVE_PORT ?? 0), "127.0.0.1", r));
  const port = server.address().port;

  // The check's own non-zero exit is a result, not a crash. Rethrowing it printed a Node
  // stack trace under the findings, which is the wrong thing to leave at the bottom of the
  // screen when the useful output is fifty lines above it.
  const check = spawn(process.execPath, [here + "responsive-check.mjs"], {
    stdio: "inherit",
    env: { ...process.env, RESPONSIVE_BASE: `http://127.0.0.1:${port}` }
  });
  code = await new Promise(r => check.on("exit", c => r(c ?? 1)));
  server.close();
} finally {
  await rm(out, { recursive: true, force: true });
}
process.exit(code);
