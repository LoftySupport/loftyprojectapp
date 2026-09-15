/**
 * The drag rules of Setup → Processes, checked without a browser or a database.
 *
 * Amber, 3 Sep, with four screenshots sent as a "ui and ux reference": the processes of a
 * lifecycle stage should be a short ordered list you drag, rename in place and add to. What that list writes is `process_position`, and `pipelinePosition.ts` sorts the
 * jobs board on exactly that column — so a bug in the maths below is a bug in what every
 * job looks like it is up to.
 *
 * The cases run through the REAL module via Vite's SSR loader rather than a JavaScript
 * re-implementation, because a check carrying its own copy of the logic passes when the
 * logic is wrong.
 *
 * SINCE 0127 THE BLOCKS ARE ROWS. A process carries `substageId` and the block's own
 * position rather than a free-text group name, so there are two orders here and two things
 * a drag writes: a process's number and sub-stage (`ordersToWrite`), and a sub-stage's
 * place among its stage's sub-stages (`substageOrdersToWrite`). `moveGroup` and
 * `spliceGroup`, which shuffled processes to move a block, are gone: a block moves by
 * writing one row.
 *
 * EACH CASE WAS WATCHED FAILING BEFORE IT WAS TRUSTED. Six breakages and what they said:
 *
 *   - `spliceProcess` given `index` rather than the corrected `at` when moving down:
 *     "moving down one step" landed the process two places later — `b,c,a` for `a,b,c`.
 *   - `moveProcess` keeping its own sub-stage instead of joining the one it steps into:
 *     "into the next block" reported `Stage 1`, wanted `Stage 2`.
 *   - `ordersToWrite` returning every row rather than the changed ones: "a nudge writes
 *     two rows" reported 5 writes, wanted 2.
 *   - `stageOrder` sorting on name alone: "position wins where they disagree" reported
 *     `alpha, zulu`. The first fixture missed this one — its names sorted the same way
 *     its positions did — which is why the case beside it exists.
 *   - `stageOrder` sorting blocks by their first process's number, which is what it did
 *     before 0127: "a block sorts on its own position" reported `a, c`, wanted `c, a`.
 *   - `substageOrdersToWrite` returning every sub-stage rather than the moved ones:
 *     "moving a block writes only the blocks that moved" reported 3 writes, wanted 2.
 */
import { createServer } from "vite";

const server = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const {
  NO_GROUP, groupKey, groupLabel, moveProcess, moveSubstage, ordersToWrite,
  spliceProcess, spliceSubstage, stageOrder, substageOrdersToWrite
} = await server.ssrLoadModule("/src/data/pipelineOrder.ts");

let failures = 0;
const is = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures += 1; console.error(`  ✗ ${label}\n      got  ${g}\n      want ${w}`); }
  else console.log(`  ✓ ${label}`);
};

/** A sub-stage row, cut down to what the order maths reads. */
const sub = (id, name, position) =>
  ({ id, stageId: "pre_construction", stageName: "Pre-construction", name, position, isActive: true, description: null });

const S1 = sub("s1", "Stage 1", 1);
const S2 = sub("s2", "Stage 2", 2);
const S3 = sub("s3", "Stage 3", 3);

/** A process, cut down to the fields the order maths reads. A null block means parked. */
const proc = (id, position, s = null, name = id) => ({
  id, name, position,
  substageId: s ? s.id : null,
  substageName: s ? s.name : null,
  substagePosition: s ? s.position : null,
  stageName: "Pre-construction"
});

const names = list => list.map(p => p.id);
const labels = list => list.map(groupLabel);

console.log("\nthe stage's canonical order");
{
  // Deliberately out of order and interleaved by block: 0093 left real stages like this.
  const list = [proc("c", 3, S2), proc("a", 1, S1), proc("d", 4, S1), proc("b", 2, S1)];
  is("position order, blocks contiguous", names(stageOrder(list)), ["a", "b", "d", "c"]);
  is("a block's processes stay together", labels(stageOrder(list)),
    ["Stage 1", "Stage 1", "Stage 1", "Stage 2"]);
  is("equal positions fall back to the name",
    names(stageOrder([proc("zeta", 1, S1), proc("alpha", 1, S1)])), ["alpha", "zeta"]);
  // Position beats the name where the two disagree. The first fixture above could not
  // see this — its names happened to sort the same way its positions did, so a build
  // that sorted on the name alone passed it. Real stages are full of these: "1 - Footings"
  // sorts before "Site Survey" alphabetically and runs long after it.
  is("but position wins where they disagree",
    names(stageOrder([proc("zulu", 1, S1), proc("alpha", 2, S1)])), ["zulu", "alpha"]);
  // The rule 0127 changed. Before it, a block's place was wherever its first process
  // happened to fall, so moving a block meant renumbering every process in the stage.
  // Now the block carries its own position and the processes follow it: LATE, at
  // position 9, holds process number 1 and still sorts second.
  const LATE = sub("late", "Stage 9", 9);
  is("a block sorts on its own position, not its first process's",
    names(stageOrder([proc("a", 1, LATE), proc("c", 3, S1)])), ["c", "a"]);
  // A process with no sub-stage is a retired one. It sorts last rather than first, which
  // is what a null would do on its own.
  is("a parked process sorts last",
    names(stageOrder([proc("parked", 1), proc("a", 9, S1)])), ["a", "parked"]);
  is("no block is a block", groupLabel(proc("parked", 1)), NO_GROUP);
  is("and its key is the empty one", groupKey(proc("parked", 1)), "");
  is("a block's key is its id", groupKey(proc("a", 1, S1)), "s1");
}

console.log("\nmoving one process");
{
  const stage = [proc("a", 1, S1), proc("b", 2, S1), proc("c", 3, S1)];
  is("down one step", names(moveProcess(stage, "a", 1)), ["b", "a", "c"]);
  is("up one step", names(moveProcess(stage, "c", -1)), ["a", "c", "b"]);
  is("off the top is a no-op", names(moveProcess(stage, "a", -1)), ["a", "b", "c"]);
  is("off the bottom is a no-op", names(moveProcess(stage, "c", 1)), ["a", "b", "c"]);
}

console.log("\ncrossing a block boundary");
{
  const stage = [proc("a", 1, S1), proc("b", 2, S1), proc("c", 3, S2)];
  const moved = moveProcess(stage, "b", 1);
  is("stepping into the next block joins it", labels(moved), ["Stage 1", "Stage 2", "Stage 2"]);
  is("and carries that block's id", moved.map(p => p.substageId), ["s1", "s2", "s2"]);
  is("and lands after the row it stepped past", names(moved), ["a", "c", "b"]);
  // Symmetry, and it caught me out writing this: stepping back UP past a row takes that
  // row's block as well. `b` moving above `c` lands between a Stage 1 row and a Stage 2
  // row, and the rule is "join the block you stepped into", not "go back where you were".
  // To return to Stage 1 you step past `a`. Blocks stay contiguous either way, which is
  // the property that actually matters — a block split in two is not a block.
  const back = moveProcess(moved, "b", -1);
  is("stepping back up takes that row's block too", labels(back), ["Stage 1", "Stage 2", "Stage 2"]);
  is("and blocks are still contiguous", new Set(labels(back)).size, 2);
  is("dropping onto a row takes that row's block",
    labels(spliceProcess(stage, "a", 2, proc("c", 3, S2))), ["Stage 1", "Stage 2", "Stage 2"]);
}

console.log("\nmoving a whole block");
{
  // The blocks are their own list now, and moving one writes one row per block that
  // moved — not a renumbering of every process in the stage.
  const subs = [S1, S2, S3];
  is("a block moves as one", moveSubstage(subs, "s2", -1).map(s => s.id), ["s2", "s1", "s3"]);
  is("and back again", moveSubstage(moveSubstage(subs, "s2", -1), "s2", 1).map(s => s.id),
    ["s1", "s2", "s3"]);
  is("past the last block is a no-op", moveSubstage(subs, "s3", 1).map(s => s.id), ["s1", "s2", "s3"]);
  is("off the top is a no-op", moveSubstage(subs, "s1", -1).map(s => s.id), ["s1", "s2", "s3"]);
  is("a block nothing knows about is a no-op",
    spliceSubstage(subs, "s9", 0).map(s => s.id), ["s1", "s2", "s3"]);
  is("moving a block writes only the blocks that moved",
    substageOrdersToWrite(subs, moveSubstage(subs, "s2", -1)),
    [{ id: "s2", position: 1 }, { id: "s1", position: 2 }]);
  is("an unchanged order writes nothing", substageOrdersToWrite(subs, subs), []);
}

console.log("\nwhat a move writes");
{
  const before = [proc("a", 1, S1), proc("b", 2, S1), proc("c", 3, S1),
    proc("d", 4, S2), proc("e", 5, S2)];
  const writes = ordersToWrite(before, moveProcess(before, "a", 1));
  is("a nudge writes only what moved", writes.map(w => w.id).sort(), ["a", "b"]);
  is("renumbered from one, across the stage", writes.map(w => w.position).sort(), [1, 2]);
  is("an unchanged order writes nothing", ordersToWrite(before, before), []);
  const joined = ordersToWrite(before, spliceProcess(before, "e", 0, proc("a", 1, S1)));
  is("a block change is a write even at the same number",
    joined.filter(w => w.id === "e").map(w => w.substageId), ["s1"]);
  // The whole stage renumbers, never the filtered view: a hidden row must not be shoved
  // to the end because a filter was on when somebody dragged.
  is("every row it touches is renumbered contiguously",
    ordersToWrite(before, spliceProcess(before, "e", 0, proc("a", 1, S1))).map(w => w.position),
    [1, 2, 3, 4, 5]);
}

await server.close();
if (failures) { console.error(`\nTHE PIPELINE ORDER IS WRONG (${failures} failed)\n`); process.exit(1); }
console.log("\nTHE PIPELINE ORDER HOLDS (28 checks)\n");
