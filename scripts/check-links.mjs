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
 * UNTRACKED FILES COUNT. The first version listed `git ls-files`, which is tracked files
 * only — so a brand-new document's links were unchecked until it was staged, and the run
 * that mattered (the one before `git add`) always passed. That shipped a broken link to
 * CI on 6 September. `--others --exclude-standard` adds new files while still honouring
 * .gitignore, so the check now sees what the author sees.
 *
 *   node scripts/check-links.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";

const files = execSync("git ls-files --cached --others --exclude-standard '*.md'", { encoding: "utf8" })
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
