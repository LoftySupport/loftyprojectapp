import type { Process } from "./types";

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
 * — and, on 3 Sep with four HubSpot screenshots, that the screen should look like a deal
 * pipeline's settings: a short ordered list you drag, rename in place, and add to.
 *
 * This lived inside the page component, which meant the rules below could only be proved
 * by dragging things in a browser against a database. They decide what a job's board
 * column IS (`pipelinePosition.ts` sorts on the `position` they write), so they are worth
 * a check that runs.
 */

export const NO_GROUP = "Not in a group";
export const groupLabel = (g: string | null) => g ?? NO_GROUP;

/**
 * The stage's canonical order: groups as contiguous blocks in the order their first
 * process falls, each block in position order. Two processes with the same position fall
 * back to their names so the order is stable rather than whatever the array arrived in.
 */
export function stageOrder(list: Process[]): Process[] {
  const sorted = [...list].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const seen: string[] = [];
  const blocks = new Map<string, Process[]>();
  for (const p of sorted) {
    const k = groupLabel(p.stageGroup);
    if (!blocks.has(k)) { blocks.set(k, []); seen.push(k); }
    blocks.get(k)!.push(p);
  }
  return seen.flatMap(k => blocks.get(k)!);
}

/** Lift one process out and drop it at `index`, taking `group` with it. */
export function spliceProcess(arr: Process[], id: string, index: number, group: string | null): Process[] {
  const from = arr.findIndex(p => p.id === id);
  if (from === -1) return arr;
  const out = arr.slice();
  const [moved] = out.splice(from, 1);
  const at = from < index ? index - 1 : index;
  out.splice(at, 0, { ...moved, stageGroup: group });
  return out;
}

/** Lift a whole group block out and drop it in front of the block at `index`. */
export function spliceGroup(arr: Process[], group: string, index: number): Process[] {
  const block = arr.filter(p => groupLabel(p.stageGroup) === group);
  if (block.length === 0) return arr;
  const rest = arr.filter(p => groupLabel(p.stageGroup) !== group);
  const removedBefore = arr.slice(0, index).filter(p => groupLabel(p.stageGroup) === group).length;
  const out = rest.slice();
  out.splice(index - removedBefore, 0, ...block);
  return out;
}

/** Step one process up or down, joining the group it steps into. */
export function moveProcess(arr: Process[], id: string, dir: -1 | 1): Process[] {
  const i = arr.findIndex(p => p.id === id);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= arr.length) return arr;
  // Stepping past a group boundary joins the group you stepped into — which is what
  // moving a process down out of "Stage 1" and into "Stage 2" is asking to do.
  return spliceProcess(arr, id, dir === -1 ? j : j + 1, arr[j].stageGroup ?? null);
}

/** Step a whole group block up or down, past the block beside it. */
export function moveGroup(arr: Process[], group: string, dir: -1 | 1): Process[] {
  const order = [...new Set(arr.map(p => groupLabel(p.stageGroup)))];
  const i = order.indexOf(group);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= order.length) return arr;
  const target = dir === -1
    ? arr.findIndex(p => groupLabel(p.stageGroup) === order[j])
    : arr.map(p => groupLabel(p.stageGroup)).lastIndexOf(order[j]) + 1;
  return spliceGroup(arr, group, target);
}

export type ProcessOrder = { id: string; stageGroup: string | null; position: number };

/**
 * What a move actually writes: the stage renumbered 1..n, narrowed to the rows whose
 * number or group changed.
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
  const was = new Map(before.map(p => [p.id, { position: p.position, group: p.stageGroup ?? null }]));
  return after
    .map((p, i) => ({ id: p.id, stageGroup: p.stageGroup ?? null, position: i + 1 }))
    .filter(o => {
      const b = was.get(o.id);
      return !b || b.position !== o.position || b.group !== o.stageGroup;
    });
}
