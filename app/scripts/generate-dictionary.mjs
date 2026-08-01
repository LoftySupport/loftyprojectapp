/**
 * Writes data-dictionary.md from src/data/dictionary.ts.
 *
 * The file is generated rather than hand-maintained so it cannot drift from the page —
 * there is one array, and both read it. Run `npm run dictionary` after editing the
 * array; CI would fail the build if the file were stale, once there is CI.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const out = resolve(repoRoot, "data-dictionary.md");
const srcPath = resolve(here, "..", "src", "data", "dictionary.ts");

// Transpile with TypeScript itself rather than stripping annotations by regex — the
// array is real code with generics and `as const` in it, and a regex gets that wrong
// in ways that fail loudly today and silently later.
//
// `dictionary.ts` imports nothing, by design, so transpiling it alone is enough.
const { outputText } = ts.transpileModule(readFileSync(srcPath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});

const tmp = join(mkdtempSync(join(tmpdir(), "dict-")), "dictionary.mjs");
writeFileSync(tmp, outputText);
const { DICTIONARY, DICTIONARY_TABLES, STATUS_LABELS } = await import(pathToFileURL(tmp).href);

const esc = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

const counts = {};
DICTIONARY.forEach(d => { counts[d.status] = (counts[d.status] ?? 0) + 1; });

const lines = [];
lines.push("# Data dictionary");
lines.push("");
lines.push("> **Generated — do not edit by hand.**");
lines.push("> Source: `app/src/data/dictionary.ts`. Regenerate with `npm run dictionary` from `app/`.");
lines.push("> The Dictionary page in the app renders the same array, so this file and that page");
lines.push("> cannot disagree. They can still disagree with Postgres — that is what **Status** is for.");
lines.push("");
lines.push(`${DICTIONARY.length} properties across ${DICTIONARY_TABLES.length} tables.`);
lines.push("");
lines.push("| Status | Count | Means |");
lines.push("| --- | --- | --- |");
lines.push(`| To do | ${counts.to_do ?? 0} | Specified here, not yet in the migration |`);
lines.push(`| Created | ${counts.created ?? 0} | In the migration and the types |`);
lines.push(`| Updates required | ${counts.updates_required ?? 0} | Built or specified, but a decision is outstanding |`);
lines.push(`| Merged | ${counts.merged ?? 0} | Folded into another property |`);
lines.push(`| Archived | ${counts.archived ?? 0} | Retired, kept for history |`);
lines.push("");
lines.push("---");
lines.push("");

for (const table of DICTIONARY_TABLES) {
  const cols = DICTIONARY.filter(d => d.table === table);
  lines.push(`## \`${table}\``);
  lines.push("");
  lines.push("| Supabase ID | Lofty name | Definition | Type | Rules | Relationships | Status | Created | Updated |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const d of cols) {
    lines.push(
      `| \`${esc(d.id)}\` | ${esc(d.friendlyName)} | ${esc(d.definition)} | \`${esc(d.type)}\` | ` +
      `${esc(d.rules)} | ${esc(d.relationships)} | ${esc(STATUS_LABELS[d.status])} | ` +
      `${esc(d.createdAt)} · ${esc(d.createdBy)} | ${esc(d.updatedAt)} · ${esc(d.updatedBy)} |`
    );
  }
  lines.push("");
}

writeFileSync(out, lines.join("\n"));
console.log(`data-dictionary.md — ${DICTIONARY.length} properties, ${DICTIONARY_TABLES.length} tables`);
