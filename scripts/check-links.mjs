/**
 * Every relative link in every checked-in Markdown file points at a file that exists.
 *
 * This repository carries ~30 documents that reference each other, and the ones that moved
 * on 6 September moved in bulk. A broken link is not a typo here — it is a reader sent to
 * a file that is not there, in a repository whose whole convention is "the reasoning is
 * written down". Cheaper to assert than to notice.
 *
 * Checked: [text](path). Skipped: absolute URLs, mailto:, bare #anchors, and the vendored
 * skills under .claude/ and .agents/, which are somebody else's documents.
 *
 *   node scripts/check-links.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const files = execSync("git ls-files '*.md'", { encoding: "utf8" })
  .split("\n").filter(Boolean)
  .filter(f => !f.startsWith(".claude/") && !f.startsWith(".agents/"));

let broken = 0;
for (const file of files) {
  const dir = dirname(file);
  for (const m of readFileSync(file, "utf8").matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(m[1])) continue;
    const target = m[1].split("#")[0];
    if (!target) continue;
    if (!existsSync(resolve(dir, target))) {
      console.error(`broken  ${file}  ->  ${m[1]}`);
      broken++;
    }
  }
}

if (broken) {
  console.error(`\n${broken} broken link${broken === 1 ? "" : "s"}.`);
  process.exit(1);
}
console.log(`${files.length} documents, every relative link resolves.`);
