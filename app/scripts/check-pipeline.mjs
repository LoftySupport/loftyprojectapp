/**
 * Does "what a job is up to" answer correctly?
 *
 * One rule decides two things — which column a job sits in on the board, and what the
 * "Up to" cell says in the table — so the two can only agree if they read the same
 * function. `src/data/pipelinePosition.ts` is that function, and this is what proves it.
 *
 * Amber, 3 September, gave the rule: *"the process is the same for every job, it has to
 * go through it. even if it isn't recorded in the app (as it was done befofre app
 * creation) it moves through the process in lifecycle stage order, then process stage
 * order"*. The cases below are that sentence, plus the one thing it does not say and the
 * app must not invent: a job with nothing recorded is NOT at the first process.
 *
 * Every case here was watched failing before it was trusted:
 *
 *   - the per-stage empty test weakened to "any runs at all"  → "runs only in a stage it
 *     has left" returned "Invoice" instead of null
 *   - `not_applicable` no longer counted as behind it         → "first not applicable"
 *     returned "Invoice" instead of "Concept Plan"
 *   - the pipeline sorted by name instead of position         → columns came out
 *     "Concept Plan · Invoice · Site Survey" and "waiting is still open" broke with it
 *
 * Run it with `npm run check:pipeline`. It loads the real module through Vite rather than
 * re-implementing it in JavaScript, because a check that carries its own copy of the
 * logic passes when the logic is wrong.
 */
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { currentProcessName, processColumnOf, pipelineColumns, NOTHING_RECORDED } =
  await vite.ssrLoadModule("/src/data/pipelinePosition.ts");

/** Only the fields the rule reads; the rest of Process is not its business. */
const P = (key, name, stageName, position, scope = "job") =>
  ({ key, name, stageName, position, scope, isActive: true });

const processes = [
  P("invoice", "Invoice", "Pre-construction", 1),
  P("concept_plan", "Concept Plan", "Pre-construction", 2),
  P("site_survey", "Site Survey", "Pre-construction", 3),
  // Project-scoped, so it must never appear on a jobs board.
  P("project_creation", "Project Creation", "Pre-construction", 4, "project"),
  P("footings", "Footings", "Construction", 1)
];
const job = (stage, runs) => ({
  stage,
  processRuns: runs.map(([processKey, status]) => ({ processKey, status, health: "on_track" }))
});

const cases = [
  ["a job with nothing recorded is not claimed to be at the first process",
   job("Pre-construction", []), null],
  ["runs from a stage it has left do not count as recorded here",
   job("Pre-construction", [["footings", "complete"]]), null],
  ["the first process complete puts it on the second",
   job("Pre-construction", [["invoice", "complete"]]), "Concept Plan"],
  ["not applicable is behind it — a job with no retaining wall has finished retaining",
   job("Pre-construction", [["invoice", "not_applicable"]]), "Concept Plan"],
  ["an open run is where it stands",
   job("Pre-construction", [["invoice", "complete"], ["concept_plan", "in_progress"]]), "Concept Plan"],
  ["waiting is still open, so it has not moved on",
   job("Pre-construction", [["invoice", "waiting"]]), "Invoice"],
  ["every process behind it holds at the last one until the lifecycle moves",
   job("Pre-construction", [["invoice", "complete"], ["concept_plan", "complete"], ["site_survey", "complete"]]), "Site Survey"],
  ["a stage with no job-level processes has nothing to be up to",
   job("Cancelled", [["invoice", "complete"]]), null]
];

let failed = 0;
const say = (ok, line) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"} ${line}`); };

for (const [what, j, want] of cases) {
  const got = currentProcessName(j, processes);
  say(got === want, `${what} — ${JSON.stringify(got)}`);
}
say(processColumnOf(job("Pre-construction", []), processes) === NOTHING_RECORDED,
    `an unrecorded job lands under "${NOTHING_RECORDED}"`);

const columns = pipelineColumns(processes, ["Pre-construction", "Construction"]);
say(columns.join(" · ") === "Invoice · Concept Plan · Site Survey · Footings",
    `columns run in lifecycle-stage order then position — ${columns.join(" · ")}`);
say(!columns.includes("Project Creation"),
    "a project-scoped process is not a column on a board of jobs");

await vite.close();
console.log(failed === 0
  ? `\nWHAT A JOB IS UP TO BEHAVES (${cases.length + 3} checks)`
  : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
