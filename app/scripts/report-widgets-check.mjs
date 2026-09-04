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

const full = { projects, jobs, teams, stageNames, people, processes };
/** Not an error state: Phase B has not run, so this is the app as it stands today. */
const empty = { projects: [], jobs: [], teams, stageNames, people: [], processes: [] };

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
  const blocks = engine.resolve(engine.createWidget(kind, empty), empty);
  const emptyTable = blocks.find(b => b.type === "table" && (b.rows || []).length === 0);
  const emptyBoard = blocks.find(b => b.type === "board" && (b.columns || []).every(c => !c.cards?.length));
  ok(`${kind} says so rather than drawing an empty grid`,
    !emptyTable && !emptyBoard,
    emptyTable ? "an empty table" : emptyBoard ? "a board of empty columns" : "");
}

// ─── 3. Blocks hold references, never copies ─────────────────────────
//
// The single most important behaviour in the package, and the one whose failure is
// invisible. Watched: a resolver changed to close over a `const rows = jobs` captured at
// module load produced byte-identical output for both contexts below, and the assertion
// reported it.
console.log("--- a resolver reads ctx every time, so the same block renders different data");
for (const kind of Object.keys(LOFTY_WIDGETS)) {
  const widget = engine.createWidget(kind, full);
  const before = textOf(engine.resolve(widget, full));
  const after = textOf(engine.resolve(widget, empty));
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

console.log(failures === 0
  ? "\nreport widgets: every block resolves, reads live data, and stays quiet when it has nothing to say"
  : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
