/**
 * `npm run check:report-widgets` — the Lofty blocks, in Node, with no browser.
 *
 * WHY A CHECK AND NOT A LOOK. Everything this guards is invisible on screen with a full
 * database. A block that copied its rows instead of reading them renders identically to
 * one that reads them — the difference only shows up months later, in a template that
 * quietly reports last September. A block that prints "Choose a project in this block's
 * settings" into an exported document looks fine in the builder, where that sentence is
 * the point. Both are found here or they are found by a client.
 *
 * The module's own guidance is the same: build and test the widgets in Node before any
 * UI, because `engine.compile()` returns a plain object you can inspect.
 *
 * Every assertion below was watched to fail (CLAUDE.md — a check nobody has watched fail
 * is not evidence). The comment on each says what was broken to watch it.
 *
 * The fixtures are two projects and three jobs. They are FIXTURES, not seeds: nothing
 * imports this file but the check, and it never touches the database.
 */
import {
  LOFTY_GROUPS,
  LOFTY_SEEDS,
  LOFTY_WIDGETS
} from "../src/features/reports/adapters/lofty/widgets.js";
// From `core/` rather than from `index.js`, which is the one place in the repo that
// should. `index.js` re-exports the React components, and importing it here would drag
// `.jsx` into a plain-Node process for no reason — the whole point of this check is that
// it needs no browser and no bundler.
import { createReportRegistry } from "../src/features/reports/core/registry.js";
import { createReportEngine } from "../src/features/reports/core/widgetEngine.js";
import { LOFTY_THEME, LOFTY_THEME_QUIET } from "../src/features/reports/adapters/lofty/theme.js";
import { HOUSE_COLOURS } from "../src/data/export/houseFormat.ts";
import { execFileSync } from "node:child_process";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import QRCode from "react-qr-code";
import { qrMatrix, qrPng, QR_LEVEL } from "../src/features/reports/core/qr.js";

let failures = 0;
const ok = (name, condition, detail = "") => {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const registry = createReportRegistry({ widgets: LOFTY_WIDGETS, groups: LOFTY_GROUPS });
const engine = createReportEngine(registry, { seeds: LOFTY_SEEDS });

// ─── Fixtures ────────────────────────────────────────────────────────

const teams = [
  { id: "design", name: "Design", position: 3, isActive: true },
  { id: "construction", name: "Construction", position: 8, isActive: true },
  { id: "commercial", name: "Commercial", position: 90, isActive: false }
];
const stageNames = ["Acquisition & Development", "Design", "Pre-Construction", "Construction", "Handover"];

const jobs = [
  {
    jobNumber: "1042-001", projectNumber: "1042", stage: "Design", team: "Design", teamId: "design",
    status: "on_track", daysInStage: 4, currentAddress: "28 Corner Street, Golden Grove",
    assigneeName: "Deanna Pike", jobNumberOld: "12345",
    processRuns: [{ processKey: "site_start", status: "in_progress", health: "at_risk" }]
  },
  {
    jobNumber: "1042-002", projectNumber: "1042", stage: "Construction", team: "Construction",
    teamId: "construction", status: "at_risk", daysInStage: 31,
    currentAddress: "30 Corner Street, Golden Grove", assigneeName: null, jobNumberOld: null,
    processRuns: []
  },
  {
    jobNumber: "1043-001", projectNumber: "1043", stage: "Construction", team: "Construction",
    teamId: "construction", status: "completed", daysInStage: 120,
    currentAddress: "5 Modbury Road, Modbury", assigneeName: "Ketan Shah", jobNumberOld: "12401",
    processRuns: []
  }
];

const projects = [
  {
    projectNumber: "1042", projectId: 1042, jobs: jobs.slice(0, 2), proposedDwellings: 2,
    projectType: "residential", targetCompletion: "2027-02-01",
    currentAddress: "28 Corner Street, Golden Grove", status: "on_track",
    suburb: "Golden Grove", council: "City of Tea Tree Gully", stage: "Design", owningTeam: "design"
  },
  {
    projectNumber: "1043", projectId: 1043, jobs: jobs.slice(2), proposedDwellings: null,
    projectType: null, targetCompletion: null, currentAddress: "5 Modbury Road, Modbury",
    status: "completed", suburb: "Modbury", council: "City of Tea Tree Gully",
    stage: "Handover", owningTeam: "construction"
  }
];

const people = [
  { id: "p1", fullName: "Deanna Pike", jobTitle: "Design lead", teams: ["design"], isActive: true },
  { id: "p2", fullName: "Ketan Shah", jobTitle: null, teams: [], isActive: true }
];

const processes = [
  { id: "pr1", key: "site_start", name: "Site start", stageName: "Construction", position: 1 },
  { id: "pr2", key: "frame_inspection", name: "Frame inspection", stageName: "Construction", position: 2 }
];

// The property store, and a library section, so the two blocks that read them have
// something to read. `property_defs` rows are trimmed to the fields the widgets touch.
const propertyDefs = [
  { key: "site_start_date", label: "Site start date", format: "date", stageName: "Construction", position: 1 },
  { key: "slab_cost", label: "Slab cost", format: "currency", stageName: "Construction", position: 2 },
  { key: "council_approved", label: "Council approved", format: "checkbox", stageName: "Pre-Construction", position: 1 },
  { key: "cladding", label: "Cladding", format: "single select", stageName: "Design", position: 1 },
  { key: "never_filled_in", label: "Nobody has filled this in", format: "text", stageName: "Design", position: 2 }
];
const propertyOptions = [
  { propertyKey: "cladding", key: "brick", label: "Brick veneer", position: 1, isActive: true }
];
const propertyValues = [
  { id: "v1", propertyKey: "site_start_date", format: "date", jobId: "1042-001", projectId: null, value: { date: "2026-10-01" } },
  { id: "v2", propertyKey: "slab_cost", format: "currency", jobId: "1042-001", projectId: null, value: { number: 18400 } },
  { id: "v3", propertyKey: "council_approved", format: "checkbox", jobId: "1042-001", projectId: null, value: { bool: true } },
  { id: "v4", propertyKey: "cladding", format: "single select", jobId: "1042-001", projectId: null, value: { optionKey: "brick" } },
  { id: "v5", propertyKey: "slab_cost", format: "currency", jobId: null, projectId: 1042, value: { number: 51000 } }
];

/** One approved library section, holding two blocks. */
const sections = [
  {
    id: "sec1", kind: "section", name: "Site header", scope: "global", teamId: null,
    approvedAt: "2026-09-04T00:00:00Z", isActive: true,
    layout: {
      widgets: [
        { id: "s_w1", kind: "heading", options: { text: "Site" } },
        { id: "s_w2", kind: "recordProperties", options: { source: "document", propertyKeys: ["site_start_date"] } }
      ]
    }
  }
];

/**
 * The expander the screen supplies, in miniature.
 *
 * Same shape as `TemplateBuilderPage`'s: resolve the section's widgets against the
 * CURRENT context, with a depth counter, because the recursion goes back out through
 * `engine.resolve` which has no idea it is nested.
 */
const MAX_SECTION_DEPTH = 3;
let depth = 0;
const expandSection = (section, h) => {
  // The same sentence the screen uses. A stub that worded its refusal differently would
  // let the assertion below pass while the real one said something else.
  if (depth >= MAX_SECTION_DEPTH) {
    return [{
      type: "callout", tone: "warn",
      text: `\u201c${section.name}\u201d is nested inside itself, or more than ${MAX_SECTION_DEPTH} sections deep. It stops here.`
    }];
  }
  depth += 1;
  try {
    return (section.layout?.widgets ?? []).flatMap(w => engine.resolve(w, currentCtx, { forExport: h.forExport }));
  } finally {
    depth -= 1;
  }
};

const full = {
  projects, jobs, teams, stageNames, people, processes,
  propertyDefs, propertyValues, propertyOptions,
  sections, expandSection,
  subject: { jobId: "1042-001", projectId: null },
  // The document's own widget list, which compileReport and the builder both supply.
  // Only `tableOfContents` reads it — it is the one block that describes the DOCUMENT
  // rather than the app — and without it here the "reads live data" sweep below would
  // find no difference between a full context and an empty one and report the block as
  // returning a copy. Watched doing exactly that before this line existed.
  __widgets: [
    { id: "h1", kind: "heading", options: { text: "Site" } },
    { id: "t1", kind: "text", options: { html: "<p>Prose between the headings.</p>" } },
    // A NON-heading that also carries `options.text`. Without it the "only the headings"
    // assertion below passes for the wrong reason — a text block has no `text` option, so
    // it drops out of the contents whether the kind filter is there or not. Watched: with
    // this line absent, replacing the kind filter with one that keeps everything changed
    // nothing and the check stayed green.
    { id: "b1", kind: "button", options: { text: "Book a site visit", url: "https://example.com" } },
    { id: "h2", kind: "heading", options: { text: "Jobs on this project" } },
    { id: "h3", kind: "heading", options: { text: "Where things are up to" } }
  ]
};
/** Not an error state: Phase B has not run, so this is the app as it stands today. */
const empty = {
  projects: [], jobs: [], teams, stageNames, people: [], processes: [],
  propertyDefs: [], propertyValues: [], propertyOptions: [],
  sections: [], expandSection, subject: null
};
/** What `expandSection` resolves against; the screen keeps this in a ref for the same reason. */
let currentCtx = full;

// Walk a block tree and collect what a reader would actually see.
const textOf = (blocks) => JSON.stringify(blocks);
const typesIn = (blocks) => blocks.map(b => b.type);

// ─── 1. Every widget resolves, in both directions ────────────────────
//
// Watched: a resolver that reads `ctx.stages` where the page supplies `ctx.stageNames`
// throws, the engine catches it, and the block renders as "This block failed to
// render". On screen that is one grey box among ten; here it is a line of output.
console.log("--- every registered widget resolves against a full context and an empty one");
for (const kind of Object.keys(LOFTY_WIDGETS)) {
  for (const [label, ctx] of [["full", full], ["empty", empty]]) {
    currentCtx = ctx;
    const widget = engine.createWidget(kind, ctx);
    const blocks = engine.resolve(widget, ctx);
    const failed = blocks.some(b => b.type === "callout" && /failed to render|Unknown block/i.test(b.text || ""));
    ok(`${kind} resolves against a ${label} context`, blocks.length > 0 && !failed,
      failed ? textOf(blocks) : "returned no blocks at all");
  }
}

// ─── 2. Empty data is a sentence, never an empty grid ────────────────
//
// Watched: `jobsTable` returning `[{ type: 'table', headers, rows: [] }]` on an empty
// database renders as a header row over nothing, which reads as a rendering fault
// rather than as "there are no jobs yet".
console.log("--- an empty database produces callouts, not empty tables");
for (const kind of Object.keys(LOFTY_WIDGETS)) {
  currentCtx = empty;
  const blocks = engine.resolve(engine.createWidget(kind, empty), empty);
  const emptyTable = blocks.find(b => b.type === "table" && (b.rows || []).length === 0);
  const emptyBoard = blocks.find(b => b.type === "board" && (b.columns || []).every(c => !c.cards?.length));
  ok(`${kind} says so rather than drawing an empty grid`,
    !emptyTable && !emptyBoard,
    emptyTable ? "an empty table" : emptyBoard ? "a board of empty columns" : "");
}
currentCtx = full;

// ─── 3. Blocks hold references, never copies ─────────────────────────
//
// The single most important behaviour in the package, and the one whose failure is
// invisible. Watched: a resolver changed to close over a `const rows = jobs` captured at
// module load produced byte-identical output for both contexts below, and the assertion
// reported it.
//
// ONE EXEMPTION, AND THE BAR FOR JOINING IT IS HIGH: a block belongs here only if it has
// no app data to read at all, so there is no copy it could be holding. `qrCode` is made
// entirely of text its author typed — the same class as the module's own heading and text
// blocks, which are not in this sweep because they are not Lofty's.
//
// A block that reads app data and renders the same against a full and an empty context is
// the bug this sweep exists for. Adding one here to quieten it would remove the only
// thing standing between a template and a snapshot.
const NOTHING_TO_READ = new Set(["qrCode"]);

console.log("--- a resolver reads ctx every time, so the same block renders different data");
for (const kind of Object.keys(LOFTY_WIDGETS)) {
  if (NOTHING_TO_READ.has(kind)) continue;
  const widget = engine.createWidget(kind, full);
  currentCtx = full;
  const before = textOf(engine.resolve(widget, full));
  currentCtx = empty;
  const after = textOf(engine.resolve(widget, empty));
  currentCtx = full;
  ok(`${kind} renders differently against different data`, before !== after,
    "identical output for a full and an empty context — the resolver is not reading ctx");
}

// ─── 4. Author-facing prompts never reach a reader ───────────────────
//
// Watched: `projectDetail` without the `forExport` guard put "Choose a project in this
// block's settings" into the compiled document — the sentence a client would read.
console.log("--- an unfinished block is silent in an exported document");
{
  const unset = { id: "w1", kind: "projectDetail", options: { projectNumber: null, showJobs: true } };
  const inBuilder = engine.resolve(unset, full, { forExport: false });
  const inDocument = engine.resolve(unset, full, { forExport: true });
  ok("projectDetail prompts the author in the builder", inBuilder.length === 1 && inBuilder[0].type === "callout");
  ok("projectDetail says nothing at all in the export", inDocument.length === 0, textOf(inDocument));
}

// ─── 5. A reference that no longer resolves asks to be re-picked ─────
//
// Watched: without the `staleRef`, a template pointing at a project the reader cannot
// see rendered the whole block as blank — indistinguishable from a project with no data.
console.log("--- a reference to something that is gone is reported, not blanked");
{
  const stale = { id: "w2", kind: "projectDetail", options: { projectNumber: "9999", showJobs: true } };
  const blocks = engine.resolve(stale, full);
  ok("projectDetail flags a project that is no longer in view",
    blocks.length === 1 && blocks[0].repick === true, textOf(blocks));
}

// ─── 6. The numbers are the numbers ──────────────────────────────────
//
// Watched: `avgDays` over an empty set returned "0", which is the failure CLAUDE.md
// names by name — the Reports page's "45% on track" computed from a fixed array. Zero
// days in stage is a claim; an em dash is the truth.
console.log("--- the headline numbers count what is there, and admit what is not");
{
  const w = { id: "w3", kind: "headlineNumbers", options: { stats: ["projects", "jobs", "liveJobs", "avgDays"] } };
  const items = engine.resolve(w, full)[0].items;
  const value = (label) => items.find(i => i.label === label)?.value;
  ok("two projects and three jobs are counted", value("Projects") === "2" && value("Jobs") === "3",
    `${value("Projects")} projects, ${value("Jobs")} jobs`);
  ok("the completed job is not counted as in progress", value("Jobs in progress") === "2", value("Jobs in progress"));
  // (4 + 31) / 2 = 17.5, rounded to 18. The completed job's 120 days are excluded.
  ok("the average excludes finished jobs", value("Average days in stage") === "18", value("Average days in stage"));

  const none = engine.resolve(w, empty)[0].items;
  ok("an average over no jobs is an em dash, not zero",
    none.find(i => i.label === "Average days in stage")?.value === "—",
    none.find(i => i.label === "Average days in stage")?.value);
}

// ─── 7. Finished work is excluded unless it is asked for ─────────────
console.log("--- completed, cancelled and archived jobs are opt-in");
{
  const open = engine.resolve({ id: "w4", kind: "jobsTable", options: { groupBy: "none", includeFinished: false, columns: ["status"] } }, full);
  const all = engine.resolve({ id: "w5", kind: "jobsTable", options: { groupBy: "none", includeFinished: true, columns: ["status"] } }, full);
  ok("two open jobs by default, three with finished included",
    open[0].rows.length === 2 && all[0].rows.length === 3,
    `${open[0].rows.length} then ${all[0].rows.length}`);
}

// ─── 7b. A block can be pointed at particular records ────────────────
//
// Amber, 4 September: "to select a single job, or multiple jobs or projects". The rule
// that matters most is the DEFAULT: empty means everything, because a block that starts
// as "no records" renders an empty table until it is configured, and a report covering
// nothing looks exactly like a report covering everything and finding nothing.
console.log("--- a block can be narrowed to particular jobs, projects or teams");
{
  // `.rows ?? []` rather than `.rows`: when a narrowing returns nothing the resolver
  // returns an info block, not an empty table — so a mutation that over-narrows would
  // otherwise crash this check instead of failing it, and a crash names the wrong line.
  const table = (options) => {
    const block = engine.resolve({ id: "wp", kind: "jobsTable", options: { groupBy: "none", columns: ["address"], ...options } }, full)[0];
    return { ...block, rows: block?.rows ?? [] };
  };

  ok("no pickers set means every open job", table({}).rows.length === 2, String(table({}).rows.length));

  const oneJob = table({ jobIds: ["1042-001"] });
  ok("one job picked returns exactly that job",
    oneJob.rows.length === 1 && JSON.stringify(oneJob.rows[0]).includes("1042-001"),
    JSON.stringify(oneJob.rows));

  ok("two jobs picked returns both",
    table({ jobIds: ["1042-001", "1042-002"] }).rows.length === 2);

  // A finished job stays filtered when it is picked by name, which is the interaction
  // worth pinning: picking a record is "which", not "regardless of".
  ok("picking a finished job still respects the finished filter",
    table({ jobIds: ["1043-001"] }).rows.length === 0);
  ok("…and returns it once finished jobs are included",
    table({ jobIds: ["1043-001"], includeFinished: true }).rows.length === 1);

  // 1043-001 is the third fixture job and is finished, so a project pick has to respect
  // includeFinished exactly as an unpicked table does.
  const byProject = table({ projectIds: ["1042"] });
  ok("a project picked returns its open jobs", byProject.rows.length === 2, String(byProject.rows.length));

  // The union, not the intersection. An AND would return one row here and read as a bug.
  ok("a job and a different project combine rather than narrow",
    table({ jobIds: ["1043-001"], projectIds: ["1042"], includeFinished: true }).rows.length === 3);

  // Pointing a block at a record that is gone must say so, not render an empty grid and
  // not claim there are no jobs at all — those are three different situations.
  const nowhere = engine.resolve({ id: "wp2", kind: "jobsTable", options: { groupBy: "none", columns: ["address"], jobIds: ["9999-999"] } }, full);
  ok("a block pointed at nothing says what happened rather than drawing an empty table",
    nowhere[0].type !== "table" && /pointed at/i.test(textOf(nowhere)),
    textOf(nowhere));

  const teamTable = (options) => engine.resolve({ id: "wt", kind: "teamWorkload", options }, full)[0];
  ok("team workload covers every team by default", teamTable({}).rows.length >= 2, String(teamTable({}).rows.length));
  const oneTeam = teamTable({ teamIds: ["design"] });
  ok("one team picked returns exactly that team",
    oneTeam.rows.length === 1 && JSON.stringify(oneTeam.rows[0]).includes("Design"),
    JSON.stringify(oneTeam.rows));
}

// ─── 7c. A table of contents lists the document, not the data ────────
console.log("--- the table of contents reads the document it is in");
{
  const toc = (options = {}) => engine.resolve({ id: "toc", kind: "tableOfContents", options: { title: "Contents", numbered: true, ...options } }, full);

  const blocks = toc();
  const list = blocks.find(b => b.type === "list");
  ok("every heading in the document, in order",
    list && list.items.join("|") === "Site|Jobs on this project|Where things are up to",
    JSON.stringify(list?.items));
  ok("and only the headings — text blocks are not sections",
    list && list.items.length === 3, String(list?.items.length));
  ok("numbered when asked", list?.ordered === true);
  ok("and bulleted when not", toc({ numbered: false }).find(b => b.type === "list")?.ordered === false);
  ok("its own heading is settable", blocks.some(b => b.type === "subheading" && b.text === "Contents"));
  ok("and can be turned off", !toc({ title: "" }).some(b => b.type === "subheading"));

  // A document with no headings: a prompt while writing, silence when sending. The same
  // rule every other unfinished block here follows.
  const noHeadings = { ...full, __widgets: [{ id: "t", kind: "text", options: {} }] };
  const w = engine.createWidget("tableOfContents", noHeadings);
  ok("a document with no headings prompts the author",
    /add some section headings/i.test(textOf(engine.resolve(w, noHeadings, { forExport: false }))));
  ok("…and says nothing at all in the sent document",
    engine.resolve(w, noHeadings, { forExport: true }).length === 0);
}

// ─── 8. A board draws the pipeline, including its empty columns ──────
//
// Watched: dropping empty columns made a five-stage pipeline render as two, which
// misrepresents the process as shorter than it is.
console.log("--- the jobs board draws every declared stage, in pipeline order");
{
  const board = engine.resolve({ id: "w6", kind: "jobsBoard", options: { groupBy: "stage", includeFinished: false } }, full)[0];
  ok("five columns for five stages", board.columns.length === stageNames.length, String(board.columns.length));
  ok("in the pipeline's order, not by size",
    board.columns.map(c => c.title).join("|") === stageNames.join("|"),
    board.columns.map(c => c.title).join("|"));
}

// ─── 9. Every seed builds blocks the registry knows ──────────────────
//
// Watched: a seed naming `statCards` — the placeholder adapter's key, not ours — was
// silently dropped by `seedWidgets`, and the draft came out three blocks short with no
// error anywhere.
console.log("--- every seed produces the blocks it names");
for (const seed of LOFTY_SEEDS) {
  const named = seed.build(full).length;
  const built = engine.seed(seed.key, full).length;
  ok(`seed "${seed.key}" builds all ${named} of its blocks`, built === named, `built ${built}`);
}

// ─── 10. A compiled report is sections, and headings make them ───────
console.log("--- compiling a seeded draft produces a sectioned document");
{
  const widgets = engine.seed("leadership", full);
  const report = engine.compile({ title: "Leadership summary" }, widgets, full);
  const headings = widgets.filter(w => w.kind === "heading").length;
  ok(`${headings} headings become ${headings} sections`, report.sections.length === headings,
    `${report.sections.length} sections`);
  ok("every section has a title and at least one block",
    report.sections.every(s => s.title && s.blocks.length > 0),
    JSON.stringify(report.sections.map(s => [s.title, s.blocks.length])));
  ok("no author-facing prompt survived into the document",
    !/settings/i.test(JSON.stringify(report)),
    "a block is still telling the reader to open its settings");
  ok("the tables carry real rows",
    typesIn(report.sections.flatMap(s => s.blocks)).includes("table"));
}

// ─── 11. Properties come from the record, formatted the app's own way ────
//
// Watched: a second formatter written here rendered the slab cost as "18400" where the
// job drawer says "$18,400" — the report and the drawer disagreeing about the same
// number, which is why `formatValue` was lifted into `data/propertyFormat.ts` and is
// imported rather than reimplemented.
console.log("--- record properties read the job's own values, formatted as the drawer formats them");
{
  currentCtx = full;
  const w = { id: "w7", kind: "recordProperties", options: { source: "document", propertyKeys: [], showBlanks: false } };
  const items = engine.resolve(w, full)[0].items;
  const val = (label) => items.find(i => i.label === label)?.value;

  ok("a date renders as a date", !!val("Site start date") && val("Site start date") !== "—", val("Site start date"));
  ok("a currency renders with its symbol and separators", /\$/.test(val("Slab cost") || "") && /18[,.]?400/.test(val("Slab cost") || ""), val("Slab cost"));
  ok("a checkbox renders Yes, not true", val("Council approved") === "Yes", val("Council approved"));
  ok("a select renders its label, not its key", val("Cladding") === "Brick veneer", val("Cladding"));

  // Watched: without the hasValue filter the block emitted a row of em dashes for every
  // property nobody had filled in, which is a page of dashes on a client letter.
  ok("a property nobody filled in is left out by default",
    val("Nobody has filled this in") === undefined, String(val("Nobody has filled this in")));

  const withBlanks = engine.resolve(
    { id: "w8", kind: "recordProperties", options: { source: "document", propertyKeys: [], showBlanks: true } },
    full
  )[0].items;
  ok("…and is an em dash, never a zero or a blank, when asked for",
    withBlanks.find(i => i.label === "Nobody has filled this in")?.value === "—",
    withBlanks.find(i => i.label === "Nobody has filled this in")?.value);

  // The project's own slab cost is a different row from the job's. Watched: a filter on
  // propertyKey alone returned both and the block printed the project's number on a job
  // report.
  const onProject = engine.resolve(
    { id: "w9", kind: "recordProperties", options: { source: "project", projectId: "1042", propertyKeys: ["slab_cost"] } },
    full
  )[0].items;
  ok("a project's value is not the job's", /51[,.]?000/.test(onProject[0]?.value || ""), onProject[0]?.value);

  // The chosen order is the printed order, not the pipeline's.
  const ordered = engine.resolve(
    { id: "w10", kind: "recordProperties", options: { source: "document", propertyKeys: ["cladding", "site_start_date"] } },
    full
  )[0].items;
  ok("the order chosen in settings is the order printed",
    ordered.map(i => i.label).join("|") === "Cladding|Site start date",
    ordered.map(i => i.label).join("|"));
}

// ─── 12. A document about nothing says so, in the document ───────────────
//
// The one place a prompt SHOULD survive into an export. Watched: returning [] here put a
// heading over nothing into a compiled letter, which reads as a rendering fault.
console.log("--- a properties block on a document about no record is not silently blank");
{
  const noSubject = { ...full, subject: null };
  currentCtx = noSubject;
  const w = { id: "w11", kind: "recordProperties", options: { source: "document", propertyKeys: [] } };
  const inBuilder = engine.resolve(w, noSubject, { forExport: false });
  const inDocument = engine.resolve(w, noSubject, { forExport: true });
  ok("the builder tells the author to set the record",
    inBuilder.length === 1 && inBuilder[0].tone === "info", textOf(inBuilder));
  ok("the export warns the reader rather than printing nothing",
    inDocument.length === 1 && inDocument[0].tone === "warn", textOf(inDocument));
  currentCtx = full;
}

// ─── 13. A library section expands to the blocks it stands for ───────────
console.log("--- a library section renders its own blocks, resolved against live data");
{
  currentCtx = full;
  const w = { id: "w12", kind: "librarySection", options: { sectionId: "sec1" } };
  const blocks = engine.resolve(w, full);
  ok("the section's heading and its properties block both render",
    blocks.some(b => b.type === "subheading") && blocks.some(b => b.type === "keyValues"),
    typesIn(blocks).join("|"));
  // The nested properties block read the OUTER document's subject, which is the whole
  // reason a section is worth having: written once, correct on every job.
  const kv = blocks.find(b => b.type === "keyValues");
  ok("a block inside the section resolved against the document's own record",
    kv?.items?.[0]?.label === "Site start date" && kv.items[0].value !== "—",
    JSON.stringify(kv?.items));

  const gone = engine.resolve({ id: "w13", kind: "librarySection", options: { sectionId: "nope" } }, full);
  ok("a section that has left the library asks to be re-picked",
    gone.length === 1 && gone[0].repick === true, textOf(gone));
}

// ─── 14. A section inside itself stops, rather than hanging the tab ──────
//
// Two clicks build this by accident. Watched: without the depth counter this recursed
// until the stack blew — and in the browser that is a frozen tab with no error, on the
// author's own screen, with their unsaved work in it.
console.log("--- a section nested inside itself is stopped, not followed");
{
  const selfReferential = [{
    ...sections[0],
    id: "loop", name: "Loops back",
    layout: { widgets: [{ id: "l_w1", kind: "librarySection", options: { sectionId: "loop" } }] }
  }];
  const looping = { ...full, sections: selfReferential };
  currentCtx = looping;
  let blocks;
  const started = Date.now();
  try {
    blocks = engine.resolve({ id: "w14", kind: "librarySection", options: { sectionId: "loop" } }, looping);
  } catch (e) {
    blocks = [{ type: "callout", tone: "danger", text: String(e && e.message) }];
  }
  ok("it terminates", Date.now() - started < 2000, `${Date.now() - started}ms`);
  ok("and says why rather than rendering nothing",
    JSON.stringify(blocks).includes("nested inside itself"), textOf(blocks).slice(0, 200));
  currentCtx = full;
}

// ─── 15. The builder's documents wear the house format, not a second one ─
//
// A document composed in the builder and a table exported from Jobs land in the same
// email. They came from different code and, before this, from two different palettes:
// the theme here was built from the app's UI tokens (teal ink) while every export in
// data/export/ uses the house document format (Foundation Black, Eco Green, Crisp
// Orange). Nobody would have called that a bug; they would have called the app
// inconsistent, which is worse because there is nothing to fix.
//
// Watched: with the theme's ink set back to the old #00393f, this reports.
console.log("--- the Lofty theme is the house document format, role for role");
{
  const pairs = [
    ["ink", HOUSE_COLOURS.ink],
    ["muted", HOUSE_COLOURS.muted],
    ["surfaceAlt", HOUSE_COLOURS.headFill],
    ["line", HOUSE_COLOURS.rowRule],
    ["accent", HOUSE_COLOURS.orange],
    ["heading", HOUSE_COLOURS.green]
  ];
  for (const [role, expected] of pairs) {
    const got = LOFTY_THEME.colors[role];
    ok(`${role} is the house ${expected}`,
      String(got).toLowerCase() === String(expected).toLowerCase(), String(got));
  }
  // The quiet variant is the same format with the rule held back, not a third palette.
  ok("the quiet variant shares the house ink and heading",
    LOFTY_THEME_QUIET.colors.ink.toLowerCase() === HOUSE_COLOURS.ink.toLowerCase()
    && LOFTY_THEME_QUIET.colors.heading.toLowerCase() === HOUSE_COLOURS.green.toLowerCase(),
    `${LOFTY_THEME_QUIET.colors.ink} / ${LOFTY_THEME_QUIET.colors.heading}`);
  // Helvetica first, never Arial — the Word writer's rule, and core/docx.js takes the
  // first family in the stack and writes it into the file.
  ok("the document font is Helvetica first, and Arial appears nowhere",
    /^Helvetica\b/.test(LOFTY_THEME.fonts.body) && !/Arial/i.test(LOFTY_THEME.fonts.body),
    LOFTY_THEME.fonts.body);
}

// ─── 16. The QR on screen is the QR in the exported document ─────────────
//
// There are two drawings of every QR: `react-qr-code` puts one on the screen, and
// core/qr.js writes the other into the .docx and the HTML download. If they ever encode
// differently, BOTH still look like QR codes and BOTH still scan — they just go to
// different places, and the one nobody notices is the one that went out to a client.
// Nothing on screen can catch that. This can.
{
  const cases = [
    "https://lofty.com.au/jobs/1042-001",
    // A non-ASCII string on purpose. `qrcode-generator` encodes latin1 unless its
    // `stringToBytes` is replaced, and `react-qr-code` replaces it on the shared module
    // when the component loads. Before core/qr.js replaced it too, an em dash split the
    // two encodings in exactly this way — identical for plain URLs, divergent the moment
    // somebody pasted a caption Word had autocorrected.
    "Scan for the site induction — 28 Corner Street, Golden Grove",
    "ok"
  ];

  for (const text of cases) {
    const mine = qrMatrix(text);
    const markup = renderToStaticMarkup(
      React.createElement(QRCode, { value: text, level: QR_LEVEL, size: 100 })
    );
    const box = /viewBox="0 0 (\d+) \d+"/.exec(markup);
    const dark = /<path d="([^"]*)"[^>]*fill="#000000"/.exec(markup)
      || /fill="#000000"[^>]*d="([^"]*)"/.exec(markup);
    const drawn = new Set((dark?.[1].match(/M (\d+) (\d+)/g) || []).map(m => m.slice(2).replace(" ", ",")));

    let ours = 0;
    let same = true;
    for (let y = 0; y < mine.size; y++) {
      for (let x = 0; x < mine.size; x++) {
        if (!mine.at(x, y)) continue;
        ours += 1;
        if (!drawn.has(`${x},${y}`)) same = false;
      }
    }

    const label = text.length > 30 ? `${text.slice(0, 30)}…` : text;
    // Broken by swapping `mine.at(x, y)` for `mine.at(y, x)` — the transpose that
    // `isDark(row, col)` invites, and which still produces something that looks like a
    // QR code. It reported: 422 dark modules on both sides, none of them agreeing.
    ok(`"${label}" encodes the same on screen as in the export`,
      same && ours === drawn.size && Number(box?.[1]) === mine.size,
      `${mine.size}×${mine.size}, ${ours} dark vs ${drawn.size} drawn`);
  }

  // WITHOUT THE COMPONENT IN THE ROOM.
  //
  // `qrcode-generator` encodes latin1 by default, and BOTH core/qr.js and
  // `react-qr-code` replace its `stringToBytes` with a UTF-8 encoder — on the same shared
  // module object. So inside this process, where the component is imported, deleting the
  // line in core/qr.js changes nothing and the checks above stay green. That is a check
  // that cannot fail, which is not a check.
  //
  // A child process that imports core/qr.js AND NOTHING ELSE is where the line is load
  // bearing: the Word export, an HTML render, any future script that wants a QR without
  // React. Broken by deleting the `qrcode.stringToBytes` line: the em dash encoded as one
  // latin1 byte instead of three, the code came out 29×29 against the component's 33×33,
  // and the .docx carried a QR pointing somewhere else.
  {
    const text = "Scan for the site induction — 28 Corner Street, Golden Grove";
    // Every module, not the module COUNT: latin1 turns the em dash into ONE byte instead
    // of three, and both spellings of this caption still fit a 33×33 code. Comparing the
    // size would have passed while proving nothing — which is how it was written first,
    // and the mutation above is what said so.
    const bits = (m) => {
      let out = "";
      for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) out += m.at(x, y) ? "1" : "0";
      return out;
    };
    const alone = execFileSync(process.execPath, [
      "--input-type=module", "-e",
      `import { qrMatrix } from "./src/features/reports/core/qr.js";`
      + ` const m = qrMatrix(${JSON.stringify(text)});`
      + ` let o = ""; for (let y = 0; y < m.size; y++) for (let x = 0; x < m.size; x++) o += m.at(x, y) ? "1" : "0";`
      + ` process.stdout.write(o);`
    ], { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" }).trim();

    ok("core/qr.js encodes UTF-8 on its own, without react-qr-code loaded",
      alone.length > 0 && alone === bits(qrMatrix(text)),
      `${alone.length} modules alone, ${bits(qrMatrix(text)).length} alongside the component`);
  }

  // `QR_LEVEL === "M"` on its own would prove nothing, so this proves that PASSING it
  // matters: `react-qr-code` defaults to 'L', and a component left to default draws a
  // different, smaller code than the export writes. Both scan. Nobody looks.
  //
  // Broken by removing `level` from the <QRCode> call in ReportDocument.jsx — which is
  // what this stands in for, since the .jsx cannot be imported into a plain-Node check.
  {
    const text = "https://lofty.com.au/jobs/1042-001";
    const drawn = (props) => renderToStaticMarkup(
      React.createElement(QRCode, { value: text, size: 100, ...props })
    );
    // Not the module COUNT — 'L' and 'M' both fit this URL in a 29×29 code, so the two
    // are the same size and a different pattern. Comparing the size would have passed
    // while proving nothing, which is how this assertion was written the first time.
    ok("leaving the component's level to default would draw a different code",
      QR_LEVEL === "M"
      && drawn({ level: QR_LEVEL }) !== drawn({})
      && drawn({ level: "L" }) === drawn({}),
      `M===default: ${drawn({ level: "M" }) === drawn({})}`);
  }

  // Word cannot embed an SVG, so the .docx gets a PNG this repo encodes by hand. Broken
  // by returning the raw pixel bytes without the zlib header: `file` still called it a
  // PNG, Word showed a red X, and nothing else in the suite noticed.
  const png = qrPng("https://lofty.com.au/jobs/1042-001");
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  ok("the Word copy is a real PNG, 1-bit greyscale",
    sig.every((b, i) => png[i] === b)
    && String.fromCharCode(...png.subarray(12, 16)) === "IHDR"
    && png[24] === 1 && png[25] === 0
    // 8 signature + (4 length + 4 "IHDR" + 13 data + 4 CRC) + (4 length + 4 "IDAT") = 41,
    // where the zlib stream starts. 0x78 0x01 is deflate, 32K window, no dictionary.
    && png[41] === 0x78 && png[42] === 0x01,
    `${png.length} bytes, depth ${png[24]}, colour ${png[25]}, zlib ${png[41]?.toString(16)}`);

  // A QR is the one block made entirely of its own settings, so an empty one has nothing
  // to fall back on. Broken by dropping the `forExport` arm: an exported client document
  // carried "Give this code something to point at in its settings."
  const empty = LOFTY_WIDGETS.qrCode.resolve({ url: "  " }, {}, { forExport: true });
  const onscreen = LOFTY_WIDGETS.qrCode.resolve({ url: "  " }, {}, { forExport: false });
  ok("an unset QR is silent in an export and asks in the builder",
    empty.length === 0
    && onscreen.length === 1
    && onscreen[0].type === "callout"
    && /point at/.test(onscreen[0].text),
    `${empty.length} / ${onscreen.map(b => b.type).join(",")}`);

  // Amber asked for a basic block, not a QR specification. Broken by putting the
  // error-correction picker back: the count went to 4.
  ok("the QR block asks three questions, not four",
    LOFTY_WIDGETS.qrCode.settings.length === 3
    && LOFTY_WIDGETS.qrCode.settings.map(s => s.key).join(",") === "url,caption,size",
    LOFTY_WIDGETS.qrCode.settings.map(s => s.key).join(","));
}

console.log(failures === 0
  ? "\nreport widgets: every block resolves, reads live data, and stays quiet when it has nothing to say"
  : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
