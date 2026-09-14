/**
 * `npm run check:ci-coverage` — every check this repository owns is run by CI.
 *
 * Why this exists. On 14 September a sweep of `package.json` against
 * `.github/workflows/ci.yml` found SEVEN checks that were written, committed, reviewed
 * and then run by nobody: check:pipeline, check:pipeline-order, check:process-move,
 * check:report-widgets, check:share-password, check:file-drop and check:maintenance-draft.
 * Every one of them passed when finally run, which is the point — a check that runs on one
 * developer's machine when they remember is not a check, it is a habit, and nothing would
 * have reported the day one of them stopped being true.
 *
 * Adding the seven to CI fixes the seven. This fixes the CLASS: the eighth check somebody
 * writes next month fails here on the day it is written unless the workflow runs it.
 *
 * HOW A CHECK COUNTS AS RUN. Either the workflow names the npm script (`npm run
 * check:contrast`) or it runs the underlying file the script points at — `check:migrations`
 * is `node ../scripts/check-migrations.mjs` and CI invokes that path directly rather than
 * through npm. Matching on both is deliberate: insisting on one spelling would fail a check
 * that genuinely does run, and a check sweep that cries wolf gets switched off.
 *
 * No dependencies, no browser, no database. It reads two files.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "../package.json"), "utf8"));
const workflow = readFileSync(join(here, "../../.github/workflows/ci.yml"), "utf8");

/** `node --import ./scripts/register-ts.mjs scripts/foo.mjs` → `foo.mjs` */
const scriptFiles = command =>
  (command.match(/[\w./-]+\.(?:mjs|js|ts|sh)/g) ?? [])
    .map(f => basename(f))   // arrow, not a bare reference: map passes the index as basename's suffix
    // The loader is plumbing every TypeScript-reading check shares; finding it in the
    // workflow would prove nothing about the check that pulled it in.
    .filter(f => f !== "register-ts.mjs" && f !== "ts-extensions.mjs");

const missing = [];
for (const [name, command] of Object.entries(pkg.scripts)) {
  if (!name.startsWith("check:")) continue;
  // No exemption for this file. It holds itself to the rule it enforces: before the
  // workflow step existed, running it printed its own name as the one check CI misses.
  const byName = workflow.includes(`npm run ${name}`);
  const byFile = scriptFiles(command).some(f => workflow.includes(f));
  if (!byName && !byFile) missing.push({ name, command });
}

if (missing.length === 0) {
  const total = Object.keys(pkg.scripts).filter(n => n.startsWith("check:")).length;
  console.log(`ok — CI runs all ${total} checks this repository defines`);
  process.exit(0);
}

console.log(`${missing.length} check${missing.length === 1 ? "" : "s"} that CI does not run:`);
for (const m of missing) console.log(`  ${m.name}  —  ${m.command}`);
console.log("\nAdd a step to .github/workflows/ci.yml, or delete the script. A check that");
console.log("runs nowhere passes forever and reports nothing.");
process.exit(1);
