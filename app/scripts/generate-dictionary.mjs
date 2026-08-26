/**
 * Writes data-dictionary.md from src/data/dictionary.ts.
 *
 * The file is generated rather than hand-maintained so it cannot drift from the page —
 * there is one array, and both read it. Run `npm run dictionary` after editing the
 * array; CI would fail the build if the file were stale, once there is CI.
 */
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { basename, dirname, resolve, join } from "node:path";
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
// `dictionary.ts` used to import nothing and transpiling it alone was enough. It now
// imports `./types` for the value lists behind ALLOWED_VALUES, so the relative graph is
// followed: each module is transpiled into the same temp directory under its own name,
// and the emitted `from "./types"` resolves there. Both files are plain data with no
// dependencies of their own, so this bottoms out immediately — it is a two-file walk,
// not a bundler.
const dir = mkdtempSync(join(tmpdir(), "dict-"));
const done = new Set();

function emit(tsPath) {
  if (done.has(tsPath)) return;
  done.add(tsPath);
  const source = readFileSync(tsPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  });
  // Node needs an extension on a relative specifier; TypeScript does not write one.
  writeFileSync(
    join(dir, basename(tsPath).replace(/\.ts$/, ".mjs")),
    outputText.replace(/(from\s+["']\.\.?\/[^"']+)(["'])/g, "$1.mjs$2")
  );
  for (const m of source.matchAll(/from\s+["'](\.\.?\/[^"']+)["']/g)) {
    emit(resolve(dirname(tsPath), m[1] + ".ts"));
  }
}

emit(srcPath);
const tmp = join(dir, "dictionary.mjs");
const { DICTIONARY, DICTIONARY_TABLES, STATUS_LABELS, TABLE_DESCRIPTIONS } =
  await import(pathToFileURL(tmp).href);

// Every table gets a purpose line, and only real tables get one. Refusing to write the
// file beats writing it with a hole in it — a missing description would just render as
// a table that apparently needs no explaining, which is the one thing none of them is.
const undescribed = DICTIONARY_TABLES.filter(t => !TABLE_DESCRIPTIONS[t]);
const orphaned = Object.keys(TABLE_DESCRIPTIONS).filter(t => !DICTIONARY_TABLES.includes(t));
if (undescribed.length || orphaned.length) {
  if (undescribed.length) {
    console.error(`No TABLE_DESCRIPTIONS entry for: ${undescribed.join(", ")}`);
  }
  if (orphaned.length) {
    console.error(`TABLE_DESCRIPTIONS names tables the dictionary does not: ${orphaned.join(", ")}`);
  }
  console.error("Fix TABLE_DESCRIPTIONS in src/data/dictionary.ts — nothing was written.");
  process.exit(1);
}

const esc = s => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

/**
 * The permitted values, as one cell.
 *
 * Says where they live as well as what they are, because that is what decides who can
 * change them: rows in a lookup are an ordinary write, an enum or a check is a migration.
 * The two table-backed ones have no list here on purpose — they are read live, and a
 * copy in a generated file would be stale the first time somebody adds a team.
 */
const values = d => {
  const a = d.allowed;
  if (!a) return "—";
  const where =
    a.source === "table" ? `rows in \`${a.holder}\`` :
    a.source === "enum" ? `enum \`${a.holder}\`` :
    `CHECK \`${a.holder}\``;
  return a.values ? `${a.values.map(v => `\`${v}\``).join(" · ")} — ${where}` : `read from ${where}`;
};

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
  lines.push(TABLE_DESCRIPTIONS[table]);
  lines.push("");
  lines.push("| Supabase ID | Lofty name | Definition | Type | Values | Rules | Relationships | Status | Created | Updated |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const d of cols) {
    lines.push(
      `| \`${esc(d.id)}\` | ${esc(d.friendlyName)} | ${esc(d.definition)} | \`${esc(d.type)}\` | ` +
      `${esc(values(d))} | ${esc(d.rules)} | ${esc(d.relationships)} | ${esc(STATUS_LABELS[d.status])} | ` +
      `${esc(d.createdAt)} · ${esc(d.createdBy)} | ${esc(d.updatedAt)} · ${esc(d.updatedBy)} |`
    );
  }
  lines.push("");
}

writeFileSync(out, lines.join("\n"));
console.log(`data-dictionary.md — ${DICTIONARY.length} properties, ${DICTIONARY_TABLES.length} tables`);
