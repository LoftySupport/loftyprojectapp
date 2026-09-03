/**
 * What a drop onto a process column would write, checked without a browser.
 *
 * Amber, 3 Sep: she could not drag a job between columns, and could not set what a job
 * is up to from a selection. The rules below decide what those actions WRITE — and one
 * of them writes completions across live jobs, so it is worth a check that runs.
 *
 * EACH CASE WAS WATCHED FAILING BEFORE IT WAS TRUSTED. The breakages and what they said:
 *
 *   - `complete` not filtered by what is already behind the job: "only the ones not
 *     already behind it" listed `Site Survey`, which was already complete.
 *   - the backwards guard dropped: "backwards is refused" returned a plan instead of a
 *     refusal, and would have completed the whole stage to move a card left.
 *   - "nothing recorded" treated as position 0 rather than before everything: "a job
 *     with nothing recorded can reach the first process" refused as already-there.
 *   - the other-stage branch removed: "a process from another stage" threw on
 *     `pipeline[-1]` instead of refusing with a reason.
 */
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const mod = await server.ssrLoadModule("/src/data/processMove.ts");
const { refusalText } = mod;

/**
 * The module under test, with a throw turned into an ordinary failure.
 *
 * Watching the "a process from another stage" breakage is what put this here: removing
 * the guard made `planProcessDrop` read `pipeline[-1].name` and the whole run died on a
 * stack trace at case 11, so the five cases after it never ran and the output never
 * named what broke. A check that stops at the first crash reports less the more wrong
 * the code is.
 */
const planProcessDrop = (...args) => {
  try { return mod.planProcessDrop(...args); }
  catch (e) { return { ok: false, threw: e instanceof Error ? e.message : String(e) }; }
};

let failures = 0;
const is = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures += 1; console.error(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); }
  else console.log(`  ✓ ${label}`);
};

const PRE = "Pre-construction";
const proc = (key, name, position, stageName = PRE) =>
  ({ id: `id-${key}`, key, name, stageName, stageGroup: "Stage 1", scope: "job", position, isActive: true });

// A real Pre-construction run, in the order the SiteBook schedule has it.
const PROCESSES = [
  proc("site_survey", "Site Survey", 1),
  proc("concept_plan", "Concept Plan", 2),
  proc("pwa", "PWA", 3),
  proc("working_drawings", "Working Drawings", 4),
  proc("footings", "1 - Footings", 1, "Construction")
];

const job = (runs = [], stage = PRE) => ({ jobNumber: "1042-01", stage, processRuns: runs });
const run = (processKey, status) => ({ processKey, status, health: "on_track" });
const names = list => list.map(p => p.name);

console.log("\na job with nothing recorded");
{
  const j = job();
  const out = planProcessDrop(j, "PWA", PROCESSES);
  is("can be caught up to a process mid-stage", out.ok, true);
  is("and the two before it are offered as outstanding", names(out.plan.outstanding), ["Site Survey", "Concept Plan"]);
  const first = planProcessDrop(j, "Site Survey", PROCESSES);
  // -1, not 0: "nothing recorded" is BEFORE the first process, not sitting on it.
  is("can reach the first process, with nothing outstanding", first.ok && names(first.plan.outstanding), []);
}

console.log("\na job partway through");
{
  const j = job([run("site_survey", "complete"), run("concept_plan", "in_progress")]);
  const out = planProcessDrop(j, "Working Drawings", PROCESSES);
  is("only the ones not already behind it", names(out.plan.outstanding), ["Concept Plan", "PWA"]);
  is("a not-applicable process counts as behind it",
    names(planProcessDrop(
      job([run("site_survey", "not_applicable"), run("concept_plan", "complete")]),
      "Working Drawings", PROCESSES
    ).plan.outstanding), ["PWA"]);
  is("dropping where it already is is refused", planProcessDrop(j, "Concept Plan", PROCESSES).ok, false);
  is("and says so", refusalText(planProcessDrop(j, "Concept Plan", PROCESSES).refusal), "Already up to Concept Plan.");
}

console.log("\nrefusals, each with a reason to print");
{
  const j = job([run("site_survey", "complete"), run("concept_plan", "complete"), run("pwa", "in_progress")]);
  const back = planProcessDrop(j, "Concept Plan", PROCESSES);
  is("backwards is refused", back.ok, false);
  // Amber, 3 Sep: backwards is possible, but only through a variation with an IAF and a
  // stated reason. Until `variations` is wired the refusal names the route rather than
  // pretending the move is impossible.
  is("naming both ends and the route", refusalText(back.refusal),
    "Concept Plan runs before PWA. Going back needs a variation — an IAF filled out and the variation raised with its reason. Raising one from here is not built yet.");
  const other = planProcessDrop(j, "1 - Footings", PROCESSES);
  is("a process from another stage is refused", other.ok, false);
  is("without throwing", other.threw ?? null, null);
  is("and points at the stage move", other.refusal && refusalText(other.refusal),
    "That process belongs to Construction; this job is in Pre-construction. Move its stage first.");
  const bare = planProcessDrop(job([], "Maintenance"), "PWA", PROCESSES);
  is("a stage with no processes is refused", bare.ok, false);
  is("without pretending there is a pipeline", refusalText(bare.refusal),
    "Maintenance has no processes yet, so there is nothing to move through.");
}

console.log("\nstarting the target is the whole move");
{
  // The correction of 3 Sep: work runs ahead of paperwork, so a card lands where it was
  // dropped even with an earlier process still open. Nothing here forces a completion.
  const j = job([run("site_survey", "in_progress")]);
  const out = planProcessDrop(j, "PWA", PROCESSES);
  is("what is behind is offered, not required", names(out.plan.outstanding), ["Site Survey", "Concept Plan"]);
}

console.log("\na run on the target means the job is already there or past it");
{
  // Under the corrected rule the position IS the furthest process with a run, so a target
  // carrying a run can never be ahead of the job. Both directions are refused, which is
  // why the plan has no "start it?" flag left to carry.
  const running = job([run("site_survey", "complete"), run("working_drawings", "in_progress")]);
  is("dropping onto the one it is running is already-there",
    planProcessDrop(running, "Working Drawings", PROCESSES).refusal.kind, "already-there");
  is("and dropping onto an earlier one needs a variation",
    planProcessDrop(running, "PWA", PROCESSES).refusal.kind, "needs-variation");
}

await server.close();
if (failures) { console.error(`\nTHE DROP PLAN IS WRONG (${failures} failed)\n`); process.exit(1); }
console.log("\nTHE DROP PLAN HOLDS (17 checks)\n");
