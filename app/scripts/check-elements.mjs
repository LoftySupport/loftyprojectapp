/**
 * The element sweep: how many ways does this app draw the same thing?
 *
 *   node scripts/check-elements.mjs            compare against the baseline
 *   node scripts/check-elements.mjs --report   print the live census
 *   node scripts/check-elements.mjs --update   write the baseline from the live census
 *   node scripts/check-elements.mjs --json     the census as JSON
 *
 * ## Why this exists
 *
 * Every other check in this repository asks whether a thing is *present*. The design rules
 * in PRODUCT.md are written the same way — "every comparable column sorts", "the filters are
 * persistent and inline", "the empty state says what to do" — and a rule written as a
 * behaviour is satisfied by any implementation that produces the behaviour. So each screen
 * satisfied it its own way, honestly, and passed. On 11 September the count was eight sort
 * implementations, thirty-seven header idioms, thirteen hand-built filter rows and a hundred
 * and ten container recipes. Compliance had gone up the whole time. Consistency had gone down.
 *
 * The second half of the same failure is propagation. Amber, 4 September: *"fix the other 2
 * pages as well to have same format"* — the fix lands on the screen that was asked about and
 * not on the twelve with the same fault. The date-picker rule was agreed on 1 September and
 * honoured in three files; ten days later sixteen raw `type="date"` inputs were still in the
 * tree, and nothing anywhere went red about it.
 *
 * So this script does not ask whether a screen is correct. It counts **how many different ways
 * the app does each thing**, and holds that number down. A fix that lands on one screen leaves
 * the count where it was, which is the point: it is not finished, and the sweep says so. A new
 * screen that invents a thirty-eighth header idiom fails on the pull request that invents it,
 * naming the selector.
 *
 * ## The ratchet
 *
 * `elements-baseline.json` records what each family measured when it was last agreed. The
 * check fails **in both directions**:
 *
 *   - the count went up   → a new idiom. The failure names it and points at the component
 *                           that already does the job.
 *   - the count went down → good, and the baseline has to come down with it, or the ground
 *                           gained is free to be given back tomorrow without anything noticing.
 *                           `--update` writes it; the diff of that file is the record of what
 *                           was fixed.
 *
 * ## What it does not measure
 *
 * Nothing here judges whether a design is *good*. A family with a count of 1 is consistent,
 * not correct — E16's single `FieldRow` could still be the wrong row. This catches divergence,
 * which is the thing that was invisible; the register (docs/design/element-register.md) carries
 * the judgement.
 *
 * E03 (where a page puts its record count) has no mechanical signature and is deliberately
 * absent rather than approximated. A measure that fires on the wrong thing gets muted, and a
 * muted check is worse than no check.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, "..");
const srcDir = join(appDir, "src");
const baselinePath = join(here, "elements-baseline.json");

// ---------------------------------------------------------------------------- reading source

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const allFiles = walk(srcDir);
const rel = (p) => relative(appDir, p).split("\\").join("/");
// Read through node rather than shelling out to grep, and not as a style preference. TasksPage.tsx
// declares two deliberate NUL-prefixed sentinels (`const NONE = "\0none"`, so a group key can never
// collide with a real value). Those NULs make grep class the whole file as binary and skip it in
// silence: counted by grep the raw date inputs came to thirteen, and the true figure is sixteen.
// A census that quietly drops a file is worse than no census, because the number still looks like one.
const read = (p) => readFileSync(p, "utf8");

const tsxFiles = allFiles.filter((f) => f.endsWith(".tsx")).sort();
const cssFiles = allFiles.filter((f) => f.endsWith(".css")).sort();
const pageFiles = tsxFiles.filter((f) => rel(f).startsWith("src/pages/"));

/** Comments and template literals stripped, so a measure cannot fire on an explanation of itself. */
function code(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`[^`]*`/g, "``");
}

/** Every `selector { declarations }` block across the app's CSS, with the file it came from. */
const cssRules = cssFiles.flatMap((file) => {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    file: rel(file),
    selector: m[1].trim(),
    declarations: Object.fromEntries(
      [...m[2].matchAll(/([\w-]+)\s*:\s*([^;]+)/g)].map((d) => [d[1].trim(), d[2].trim()]),
    ),
  }));
});

/** Distinct class names across every rule, each remembered with the first file that declared it. */
function classNames(test) {
  const found = new Map();
  for (const rule of cssRules) {
    for (const m of rule.selector.matchAll(/\.([a-zA-Z0-9_-]+)/g)) {
      if (test(m[1]) && !found.has(m[1])) found.set(m[1], rule.file);
    }
  }
  return found;
}

// ------------------------------------------------------------------------------- the families
//
// Two shapes, because the two kinds of drift need different evidence.
//
//   kind: "variants" — the drift IS the list. Every distinct idiom is stored by name, so the
//                      failure can say "`.maint-panel-head` is new" instead of "37 became 38",
//                      and so the git diff of a merge shows which idioms died.
//   kind: "sites"    — one right answer exists and the drift is how many places ignore it.
//                      Stored as a count per file, not per line: line numbers churn on every
//                      edit above them, and a check that cries wolf gets deleted.

const families = [
  {
    id: "E02",
    name: "page header",
    kind: "variants",
    target: 1,
    rule: "One header component. A page that draws its own is a new idiom.",
    measure() {
      // "typeahead" contains "head" and is not one. Six of the forty-three matches are its.
      const found = classNames((c) => c.includes("head") && !c.includes("typeahead"));
      return [...found].map(([name, file]) => ({ key: `.${name}`, where: file }));
    },
  },
  {
    id: "E07",
    name: "table",
    kind: "variants",
    target: 1,
    rule: "One data table. `SortableTable` sorts; a screen does not bring its own.",
    measure() {
      const found = classNames((c) => /(^|-)table($|-)/.test(c));
      const roots = new Map();
      for (const [name, file] of found) {
        const root = name.replace(/-(wrap|open|purpose|row|cell|head|body|foot).*$/, "");
        if (!roots.has(root)) roots.set(root, file);
      }
      return [...roots].map(([name, file]) => ({ key: `.${name}`, where: file }));
    },
  },
  {
    id: "E08",
    name: "record card",
    kind: "variants",
    target: 1,
    rule: "One card. The Jobs card and the Tasks card are two drawings of one object.",
    measure() {
      const found = classNames((c) => c === "card" || /-card$/.test(c));
      return [...found].map(([name, file]) => ({ key: `.${name}`, where: file }));
    },
  },
  {
    id: "E11",
    name: "container recipe",
    kind: "variants",
    rule: "A padded, bordered or filled box is a `panel`. Each distinct recipe is another box that is almost a panel.",
    measure() {
      // A "recipe" is what makes a box look like a box: its padding together with whatever
      // draws its edge. Two rules with the same five values are the same box drawn twice.
      const seen = new Map();
      for (const rule of cssRules) {
        const d = rule.declarations;
        if (!d.padding) continue;
        if (!(d.border || d.background || d["border-radius"] || d["box-shadow"])) continue;
        const key = [d.padding, d.border ?? "", d.background ?? "", d["border-radius"] ?? "", d["box-shadow"] ?? ""]
          .join(" | ");
        if (!seen.has(key)) seen.set(key, `${rule.file}  ${rule.selector}`);
      }
      return [...seen].map(([key, where]) => ({ key, where }));
    },
  },
  {
    id: "E12",
    name: "empty state",
    kind: "variants",
    target: 1,
    rule: "One empty state. PRODUCT.md requires it to say what to do — it does not require a new class each time.",
    measure() {
      const found = classNames((c) => c.includes("empty") && !c.includes("typeahead"));
      return [...found].map(([name, file]) => ({ key: `.${name}`, where: file }));
    },
  },
  {
    id: "E04",
    name: "bespoke filter row",
    kind: "sites",
    target: 0,
    rule: "The filters are `Toolbar`'s. A control outside it has no `toolbar-field` wrapper, so Vibe's width:100% takes the whole row — which is the full-width filters Amber has been pointing at.",
    measure() {
      const control = /<(Dropdown|Search|TextField|DatePicker|Select|TypeaheadSelect)\b|type="date"/;
      return pageFiles
        .filter((f) => {
          const source = code(read(f));
          return control.test(source) && !/components\/Toolbar/.test(source);
        })
        .map((f) => ({ where: rel(f), count: 1 }));
    },
  },
  {
    id: "E05",
    name: "prose in the page body",
    kind: "sites",
    rule: "Ratchet only. Empty-state copy is required by PRODUCT.md and is counted here too — the number is not meant to reach zero, it is meant never to rise.",
    measure() {
      const out = [];
      for (const f of tsxFiles) {
        let n = 0;
        for (const m of code(read(f)).matchAll(/>\s*([A-Z][^<>{}`=;]{40,})\s*</g)) {
          if (m[1].replace(/\s+/g, " ").trim().length >= 100) n++;
        }
        if (n) out.push({ where: rel(f), count: n });
      }
      return out;
    },
  },
  {
    id: "E14",
    name: "unbound token rendered to a user",
    kind: "sites",
    target: 0,
    rule: "`<Token>` prints `{{column.name}}` on the screen. CLAUDE.md: empty, or a token that names its column — but a person should never be the one reading it.",
    measure() {
      return tsxFiles
        .map((f) => ({ where: rel(f), count: [...code(read(f)).matchAll(/<Token\b/g)].length }))
        .filter((x) => x.count);
    },
  },
  {
    id: "E17",
    name: "field hint line",
    kind: "sites",
    target: 0,
    rule: "Form.tsx:39 turns every `hint` into a permanent line under the control. Amber, 10 September: a description belongs in a tooltip or nowhere.",
    measure() {
      return tsxFiles
        .map((f) => ({ where: rel(f), count: [...code(read(f)).matchAll(/\shint=/g)].length }))
        .filter((x) => x.count);
    },
  },
  {
    id: "E17",
    name: "slot metadata line",
    kind: "sites",
    target: 0,
    rule: "PropertySlots.tsx prints team · format · SLA under every row. Amber, 10 September, on those three: \"Remove all three\".",
    measure() {
      return tsxFiles
        .map((f) => ({ where: rel(f), count: [...code(read(f)).matchAll(/slot-sub/g)].length }))
        .filter((x) => x.count);
    },
  },
  {
    id: "E16",
    name: "raw date input",
    kind: "sites",
    target: 0,
    rule: "Agreed 1 September: every date filter is `DateRangeFilter`. Honoured in three files, and these are the ones the fix never reached.",
    measure() {
      return tsxFiles
        .map((f) => ({ where: rel(f), count: [...code(read(f)).matchAll(/type="date"/g)].length }))
        .filter((x) => x.count);
    },
  },
  {
    id: "—",
    name: "hex colour in a component",
    kind: "sites",
    target: 0,
    rule: "Already zero, and held there. This is the one rule that was written as a value rather than a behaviour, and it is the one that never drifted.",
    measure() {
      return tsxFiles
        .map((f) => ({ where: rel(f), count: [...code(read(f)).matchAll(/#[0-9a-fA-F]{3,8}\b/g)].length }))
        .filter((x) => x.count);
    },
  },
];

// -------------------------------------------------------------------------------- the census

function census() {
  const out = {};
  for (const family of families) {
    const items = family.measure();
    const slug = `${family.id}-${family.name}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    out[slug] = {
      family,
      items,
      count: family.kind === "variants" ? items.length : items.reduce((n, i) => n + i.count, 0),
    };
  }
  return out;
}

/** What goes in the baseline: names for variants, per-file counts for sites. */
function record(entry) {
  if (entry.family.kind === "variants") {
    return { count: entry.count, variants: entry.items.map((i) => i.key).sort() };
  }
  return {
    count: entry.count,
    files: Object.fromEntries(entry.items.map((i) => [i.where, i.count]).sort((a, b) => a[0] < b[0] ? -1 : 1)),
  };
}

const live = census();
const args = new Set(process.argv.slice(2));

if (args.has("--json")) {
  console.log(JSON.stringify(Object.fromEntries(Object.entries(live).map(([k, v]) => [k, record(v)])), null, 2));
  process.exit(0);
}

if (args.has("--update")) {
  const baseline = {
    $comment:
      "Written by scripts/check-elements.mjs --update. Each number is how many different ways " +
      "the app currently does one thing. It may go down and may not go up; the diff of this " +
      "file is the record of which idioms were retired.",
    measured: new Date().toISOString().slice(0, 10),
    families: Object.fromEntries(Object.entries(live).map(([k, v]) => [k, record(v)])),
  };
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`Baseline written: ${Object.keys(live).length} families.`);
  process.exit(0);
}

if (args.has("--report")) {
  console.log("\n  The element census\n");
  for (const entry of Object.values(live)) {
    const { family, count } = entry;
    const goal = family.target === undefined ? "" : `  (target ${family.target})`;
    console.log(`  ${family.id.padEnd(4)} ${family.name.padEnd(34)} ${String(count).padStart(4)}${goal}`);
  }
  console.log("");
  process.exit(0);
}

// ---------------------------------------------------------------------------------- the check

let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, "utf8")).families;
} catch {
  console.error(
    "No baseline. Run `npm run check:elements -- --update` once, read what it wrote, and commit it.",
  );
  process.exit(1);
}

const problems = [];

for (const [slug, entry] of Object.entries(live)) {
  const { family, count, items } = entry;
  const was = baseline[slug];

  if (!was) {
    problems.push([`${family.id} ${family.name}`, `is new to the sweep and has no baseline — run --update`, []]);
    continue;
  }

  if (count === was.count) continue;

  if (count < was.count) {
    problems.push([
      `${family.id} ${family.name}`,
      `is down to ${count} from ${was.count} — lower the baseline so it cannot go back up: ` +
        `npm run check:elements -- --update`,
      [],
      "fixed",
    ]);
    continue;
  }

  // Gone up. Name what appeared, so the person who wrote it does not have to go looking.
  const detail = [];
  if (family.kind === "variants") {
    const before = new Set(was.variants);
    for (const item of items) if (!before.has(item.key)) detail.push(`${item.key}   ${item.where}`);
  } else {
    for (const item of items) {
      const had = was.files[item.where] ?? 0;
      if (item.count > had) detail.push(`${item.where}   ${had} → ${item.count}`);
    }
  }
  problems.push([
    `${family.id} ${family.name}`,
    `is up to ${count} from ${was.count}. ${family.rule}`,
    detail,
  ]);
}

if (problems.length === 0) {
  const total = Object.values(live).reduce((n, e) => n + e.count, 0);
  console.log(`The element sweep holds: ${families.length} families, ${total} instances, none of them new.`);
  process.exit(0);
}

console.error("\n  The element sweep\n");
for (const [title, message, detail, kind] of problems) {
  console.error(`  ${kind === "fixed" ? "↓" : "✗"} ${title} ${message}`);
  for (const line of detail) console.error(`      ${line}`);
  console.error("");
}
if (problems.some(([, , , kind]) => kind !== "fixed")) {
  console.error(
    "  A family goes up when a screen does a thing its own way. The fix is the shared component,\n" +
      "  not a second baseline entry. docs/design/element-sweep.md says what each family means.\n",
  );
} else {
  console.error(
    "  Nothing is wrong with the code — the baseline is just behind it. Commit the new numbers\n" +
      "  with the fix, so the ground gained cannot be given back without this going red.\n",
  );
}
process.exit(1);
