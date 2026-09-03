/**
 * The drag rules of Setup → Processes, checked without a browser or a database.
 *
 * Amber, 3 Sep, with four screenshots of HubSpot's deal-pipeline settings: the processes
 * of a lifecycle stage should be a short ordered list you drag, rename in place and add
 * to. What that list writes is `process_position`, and `pipelinePosition.ts` sorts the
 * jobs board on exactly that column — so a bug in the maths below is a bug in what every
 * job looks like it is up to.
 *
 * The cases run through the REAL module via Vite's SSR loader rather than a JavaScript
 * re-implementation, because a check carrying its own copy of the logic passes when the
 * logic is wrong.
 *
 * EACH CASE WAS WATCHED FAILING BEFORE IT WAS TRUSTED. Four breakages and what they said:
 *
 *   - `spliceProcess` given `index` rather than the corrected `at` when moving down:
 *     "moving down one step" landed the process two places later — `b,c,a` for `a,b,c`.
 *   - `moveProcess` keeping its own group instead of joining the one it steps into:
 *     "into the next group" reported group `Stage 1`, wanted `Stage 2`.
 *   - `ordersToWrite` returning every row rather than the changed ones: "a nudge writes
 *     two rows" reported 5 writes, wanted 2.
 *   - `stageOrder` sorting on name alone: "position wins where they disagree" reported
 *     `alpha, zulu`. The first fixture missed this one — its names sorted the same way
 *     its positions did — which is why the case beside it exists.
 */
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const {
  NO_GROUP, groupLabel, moveGroup, moveProcess, ordersToWrite, spliceGroup, spliceProcess, stageOrder
} = await server.ssrLoadModule("/src/data/pipelineOrder.ts");

let failures = 0;
const is = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures += 1; console.error(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); }
  else console.log(`  ✓ ${label}`);
};

/** A process, cut down to the four fields the order maths reads. */
const proc = (id, position, stageGroup = null, name = id) =>
  ({ id, name, position, stageGroup, stageName: "Pre-construction" });

const names = list => list.map(p => p.id);
const groups = list => list.map(p => groupLabel(p.stageGroup));

console.log("\nthe stage's canonical order");
{
  // Deliberately out of order and interleaved by group: 0093 left real stages like this.
  const list = [proc("c", 3, "Stage 2"), proc("a", 1, "Stage 1"), proc("d", 4, "Stage 1"), proc("b", 2, "Stage 1")];
  is("position order, blocks contiguous", names(stageOrder(list)), ["a", "b", "d", "c"]);
  is("a block keeps the place of its first process", groups(stageOrder(list)),
    ["Stage 1", "Stage 1", "Stage 1", "Stage 2"]);
  is("equal positions fall back to the name",
    names(stageOrder([proc("zeta", 1), proc("alpha", 1)])), ["alpha", "zeta"]);
  // Position beats the name where the two disagree. The first fixture above could not
  // see this — its names happened to sort the same way its positions did, so a build
  // that sorted on the name alone passed it. Real stages are full of these: "1 - Footings"
  // sorts before "Site Survey" alphabetically and runs long after it.
  is("but position wins where they disagree",
    names(stageOrder([proc("zulu", 1, "Stage 1"), proc("alpha", 2, "Stage 1")])), ["zulu", "alpha"]);
  is("no group is a group", groupLabel(null), NO_GROUP);
}

console.log("\nmoving one process");
{
  const stage = [proc("a", 1, "Stage 1"), proc("b", 2, "Stage 1"), proc("c", 3, "Stage 1")];
  is("down one step", names(moveProcess(stage, "a", 1)), ["b", "a", "c"]);
  is("up one step", names(moveProcess(stage, "c", -1)), ["a", "c", "b"]);
  is("off the top is a no-op", names(moveProcess(stage, "a", -1)), ["a", "b", "c"]);
  is("off the bottom is a no-op", names(moveProcess(stage, "c", 1)), ["a", "b", "c"]);
}

console.log("\ncrossing a group boundary");
{
  const stage = [proc("a", 1, "Stage 1"), proc("b", 2, "Stage 1"), proc("c", 3, "Stage 2")];
  const moved = moveProcess(stage, "b", 1);
  is("stepping into the next group joins it", groups(moved), ["Stage 1", "Stage 2", "Stage 2"]);
  is("and lands after the row it stepped past", names(moved), ["a", "c", "b"]);
  // Symmetry, and it caught me out writing this: stepping back UP past a row takes that
  // row's group as well. `b` moving above `c` lands between a Stage 1 row and a Stage 2
  // row, and the rule is "join the group you stepped into", not "go back where you were".
  // To return to Stage 1 you step past `a`. Blocks stay contiguous either way, which is
  // the property that actually matters — a group split in two is not a block.
  const back = moveProcess(moved, "b", -1);
  is("stepping back up takes that row's group too", groups(back), ["Stage 1", "Stage 2", "Stage 2"]);
  is("and blocks are still contiguous", new Set(groups(back)).size, 2);
  is("dropping onto a row takes that row's group",
    groups(spliceProcess(stage, "a", 2, "Stage 2")), ["Stage 1", "Stage 2", "Stage 2"]);
}

console.log("\nmoving a whole block");
{
  const stage = [
    proc("a", 1, "Stage 1"), proc("b", 2, "Stage 1"),
    proc("c", 3, "Stage 2"), proc("d", 4, "Stage 3")
  ];
  is("a block moves as one", names(moveGroup(stage, "Stage 2", -1)), ["c", "a", "b", "d"]);
  is("its processes keep their own order",
    names(moveGroup(stage, "Stage 1", 1)), ["c", "a", "b", "d"]);
  is("past the last block is a no-op", names(moveGroup(stage, "Stage 3", 1)), ["a", "b", "c", "d"]);
  is("a group nothing is in is a no-op", names(spliceGroup(stage, "Stage 9", 0)), ["a", "b", "c", "d"]);
}

console.log("\nwhat a move writes");
{
  const before = [proc("a", 1, "Stage 1"), proc("b", 2, "Stage 1"), proc("c", 3, "Stage 1"),
    proc("d", 4, "Stage 2"), proc("e", 5, "Stage 2")];
  const writes = ordersToWrite(before, moveProcess(before, "a", 1));
  is("a nudge writes only what moved", writes.map(w => w.id).sort(), ["a", "b"]);
  is("renumbered from one, across the stage", writes.map(w => w.position).sort(), [1, 2]);
  is("an unchanged order writes nothing", ordersToWrite(before, before), []);
  const joined = ordersToWrite(before, spliceProcess(before, "e", 0, "Stage 1"));
  is("a group change is a write even at the same number",
    joined.filter(w => w.id === "e").map(w => w.stageGroup), ["Stage 1"]);
  // The whole stage renumbers, never the filtered view: a hidden row must not be shoved
  // to the end because a filter was on when somebody dragged.
  is("every row after the move is renumbered contiguously",
    ordersToWrite(before, moveGroup(before, "Stage 2", -1)).map(w => w.position).sort(),
    [1, 2, 3, 4, 5]);
}

await server.close();
if (failures) { console.error(`\nTHE PIPELINE ORDER IS WRONG (${failures} failed)\n`); process.exit(1); }
console.log("\nTHE PIPELINE ORDER HOLDS (24 checks)\n");
