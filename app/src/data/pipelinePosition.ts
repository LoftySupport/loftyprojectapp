import type { BoardJob } from "./boardModel";
import type { Process } from "./types";

/**
 * Where a job has got to in the run of processes its stage is made of.
 *
 * Amber, 3 September, when asked whether jobs needed their processes seeding before any
 * of this could be shown:
 *
 *   *"the process is the same for every job, it has to go through it. even if it isn't
 *   recorded in the app (as it was done befofre app creation) it moves through the
 *   process in lifecycle stage order, then process stage order"*
 *
 * That is the whole rule, and it is worth reading twice because it removes a
 * prerequisite. There is no per-job pipeline to configure and nothing to seed: every job
 * goes through the same processes, in the same order, and the order is
 * **lifecycle stage first, then position within the stage**. So a job's place is
 * DERIVED — from the stage it is in and the runs recorded against it — rather than
 * stored anywhere.
 *
 * THE ONE THING THIS WILL NOT DO
 *
 *   It will not say a job is at the first process just because nothing has been recorded
 *   against it. Most of the 66 jobs on the board were worked before the app existed, so
 *   an empty run list means "the app was not there", not "this job has done nothing" —
 *   and 44 jobs stacked under `Invoice` would be a screen full of confident wrong
 *   answers. Those jobs get `null`, which the board shows as **Nothing recorded**: a
 *   column of its own at the head of the stage, and an honest one. It empties itself as
 *   people record, which is the only way it should ever empty.
 *
 * A process is BEHIND a job once its run is complete or marked not applicable — a job
 * with no retaining wall has finished the retaining process by having none (0078). The
 * current process is the first one that is neither.
 */

/** Processes that make up one stage, in the order a job passes through them. */
export function stagePipeline(processes: Process[], stage: string): Process[] {
  return processes
    .filter(p => p.isActive && p.stageName === stage && p.scope === "job")
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/**
 * Every process name a set of stages contributes, in board-column order: stages in
 * lifecycle order, and within each stage the pipeline order above. Amber's sentence,
 * as an array.
 */
export function pipelineColumns(processes: Process[], stagesInView: string[]): string[] {
  return stagesInView.flatMap(s => stagePipeline(processes, s).map(p => p.name));
}

/**
 * The process a job is currently up to, or `null` when nothing has been recorded against
 * it in its stage. Names, not ids: the board groups by the column heading it prints.
 */
export function currentProcessName(job: BoardJob, processes: Process[]): string | null {
  const pipeline = stagePipeline(processes, job.stage);
  if (pipeline.length === 0) return null;

  // Keyed by process, because a second attempt is a new row (0078) and the latest one is
  // what says where the job stands. `processRuns` is already deduplicated per process by
  // boardModel, so this is a lookup rather than a reduce.
  const runByKey = new Map(job.processRuns.map(r => [r.processKey, r]));

  // "Nothing recorded" is judged against THIS STAGE, not against the job. A job that has
  // just moved from Pre-construction to Construction carries its old runs, and reading
  // those as "something is recorded" would put it under Footings on the strength of
  // evidence about a stage it has left.
  if (!pipeline.some(p => runByKey.has(p.key))) return null;

  const at = pipeline.find(p => {
    const run = runByKey.get(p.key);
    return !run || (run.status !== "complete" && run.status !== "not_applicable");
  });
  // Every process in the stage is behind it: the job is through the stage's work and
  // waiting on somebody to move the lifecycle, which the drawer already says. The last
  // process is where it stands until then.
  return (at ?? pipeline[pipeline.length - 1]).name;
}

/** The board column a job belongs in, with the honest heading for "nothing recorded". */
export const NOTHING_RECORDED = "Nothing recorded";
export const processColumnOf = (job: BoardJob, processes: Process[]): string =>
  currentProcessName(job, processes) ?? NOTHING_RECORDED;
