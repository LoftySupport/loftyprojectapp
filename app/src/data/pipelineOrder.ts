import type { LifecycleSubstage, Process } from "./types";

/**
 * The maths behind dragging a process, lifted out of the screen so it can be checked.
 *
 * Amber, 3 Sep, on what Setup → Processes had to become:
 *
 *   *"the Groups need to be able to be sorted and have processes nested beneath them and
 *   be in ordered as this defines how the job moves through a build cycle stage, so it is
 *   more like a pipeline as each process has an number and they should be able to be
 *   dragged and dropped in order"*
 *
 * — and, on 3 Sep with four screenshots sent as a *"ui and ux reference"*, that the
 * screen should be a short ordered list you drag, rename in place and add to, rather
 * than a table with a handle hidden in one of its cells.
 *
 * Since 0127 the groups are rows of their own, `lifecycle_substages`, with a position of
 * their own. So there are two orders here and two things a drag can write: a process's
 * number and sub-stage (`ordersToWrite`), and a sub-stage's position among its stage's
 * sub-stages (`substageOrdersToWrite`). Before 0127 a block's order was wherever its first
 * process happened to fall, which meant moving a block meant renumbering every process.
 *
 * This lived inside the page component, which meant the rules below could only be proved
 * by dragging things in a browser against a database. They decide what a job's board
 * column IS (`pipelinePosition.ts` sorts on the `position` they write), so they are worth
 * a check that runs.
 */

/** What a parked process shows under: one with no sub-stage, which is only ever a retired one. */
export const NO_GROUP = "Not in a sub-stage";
/** The key a process is grouped by: its sub-stage's id, or the empty key for a parked one. */
export const groupKey = (p: Pick<Process, "substageId">) => p.substageId ?? "";
export const groupLabel = (p: Pick<Process, "substageName">) => p.substageName ?? NO_GROUP;

/**
 * The stage's canonical order: sub-stages as contiguous blocks in sub-stage position order,
 * each block in process position order; a parked process (no sub-stage) last. Two processes
 * with the same position fall back to their names so the order is stable rather than
 * whatever the array arrived in.
 */
export function stageOrder(list: Process[]): Process[] {
  const last = Number.MAX_SAFE_INTEGER;
  return [...list].sort((a, b) =>
    (a.substagePosition ?? last) - (b.substagePosition ?? last)
    || (a.substageName ?? "").localeCompare(b.substageName ?? "")
    || a.position - b.position
    || a.name.localeCompare(b.name));
}

type SubstageOf = Pick<Process, "substageId" | "substageName" | "substagePosition">;

/** Lift one process out and drop it at `index`, taking the sub-stage of that place with it. */
export function spliceProcess(arr: Process[], id: string, index: number, into: SubstageOf): Process[] {
  const from = arr.findIndex(p => p.id === id);
  if (from === -1) return arr;
  const out = arr.slice();
  const [moved] = out.splice(from, 1);
  const at = from < index ? index - 1 : index;
  out.splice(at, 0, { ...moved, substageId: into.substageId, substageName: into.substageName, substagePosition: into.substagePosition });
  return out;
}

/** Step one process up or down, joining the sub-stage it steps into. */
export function moveProcess(arr: Process[], id: string, dir: -1 | 1): Process[] {
  const i = arr.findIndex(p => p.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= arr.length) return arr;
  // Stepping past a block boundary joins the block you stepped into, which is what
  // moving a process down out of "Stage 1" and into "Stage 2" is asking to do.
  return spliceProcess(arr, id, dir === -1 ? j : j + 1, arr[j]);
}

export type ProcessOrder = { id: string; substageId: string | null; position: number };

/**
 * What a move actually writes: the stage renumbered 1..n, narrowed to the rows whose
 * number or sub-stage changed.
 *
 * Two rules are load-bearing and neither is obvious.
 *
 *   **The whole stage renumbers, not the visible rows.** The filters are the point of the
 *   filters. If a drag renumbered only what was on screen, filtering to one team and
 *   nudging a process would silently shove every hidden process to the end of the stage.
 *   So `before` is always the stage's FULL list.
 *
 *   **Only what changed is written.** A nudge near the top of a 49-process stage is two
 *   writes, not forty-nine, and `updated_by` (0091) stays honest: a row nobody moved
 *   should not claim somebody touched it this morning.
 */
export function ordersToWrite(before: Process[], after: Process[]): ProcessOrder[] {
  const was = new Map(before.map(p => [p.id, { position: p.position, substageId: p.substageId }]));
  return after
    .map((p, i) => ({ id: p.id, substageId: p.substageId, position: i + 1 }))
    .filter(o => {
      const b = was.get(o.id);
      return !b || b.position !== o.position || b.substageId !== o.substageId;
    });
}

// ---------------------------------------------------------------- the blocks themselves

/** Lift one sub-stage out of its stage's list and drop it in front of the one at `index`. */
export function spliceSubstage(subs: LifecycleSubstage[], id: string, index: number): LifecycleSubstage[] {
  const from = subs.findIndex(s => s.id === id);
  if (from === -1 || index < 0) return subs;
  const out = subs.slice();
  const [moved] = out.splice(from, 1);
  const at = from < index ? index - 1 : index;
  out.splice(Math.min(at, out.length), 0, moved);
  return out;
}

/** Step one sub-stage up or down past the one beside it. */
export function moveSubstage(subs: LifecycleSubstage[], id: string, dir: -1 | 1): LifecycleSubstage[] {
  const i = subs.findIndex(s => s.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= subs.length) return subs;
  return spliceSubstage(subs, id, dir === -1 ? j : j + 1);
}

export type SubstageOrder = { id: string; position: number };

/** The stage's sub-stages renumbered 1..n, narrowed to the rows whose position changed. */
export function substageOrdersToWrite(before: LifecycleSubstage[], after: LifecycleSubstage[]): SubstageOrder[] {
  const was = new Map(before.map(s => [s.id, s.position]));
  return after
    .map((s, i) => ({ id: s.id, position: i + 1 }))
    .filter(o => was.get(o.id) !== o.position);
}
