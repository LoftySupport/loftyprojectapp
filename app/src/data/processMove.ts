import { stagePipeline, currentProcessName } from "./pipelinePosition";
import type { BoardJob } from "./boardModel";
import { STAGE_NAMES, type Process, type ProcessRunStatus, type StageName } from "./types";

/**
 * What dropping a job onto a process column would actually write.
 *
 * Amber, 3 September: *"i cant drag and drop jobs jobs between stages on the board and
 * when multiselecting items i can't update the stage eg update items that have no stage
 * assigned or by process or pipelien"*.
 *
 * THE AWKWARD FACT THIS MODULE EXISTS TO FACE
 *
 *   A job's place in a stage is DERIVED, not stored — `pipelinePosition.ts` reads it as
 *   "the first process that is neither complete nor not-applicable". So a job cannot be
 *   put at Working Drawings by writing something about Working Drawings. It reads as
 *   Working Drawings only once the processes BEFORE it are behind it.
 *
 *   That USED to mean a drop had to complete everything before the target or the card
 *   would spring back. Amber corrected the premise on 3 September: *"note a process might
 *   not be complete before moving onto the next stage"* — work runs ahead of its
 *   paperwork, and `pipelinePosition.ts` now reads the furthest process anybody has
 *   recorded against rather than the first unfinished one.
 *
 *   So **starting the target is the whole move**. The card lands where it was dropped
 *   even with a process still open behind it, which is the truth about the job rather
 *   than a tidy fiction about its records.
 *
 *   Completing what is behind is still OFFERED, because a drop is often the moment
 *   somebody realises the earlier steps are done — and it is offered rather than done,
 *   because `0078` stamps a completion with `now()` and the profile clicking it (the
 *   CHECK forbids a complete run with no date). Recording June's work as finished today
 *   under your name is a real cost, and the dialog says so instead of discovering it.
 *
 * MOVING BACKWARDS NEEDS A VARIATION
 *
 *   Amber, 3 September: *"it can only go backwards if there is a Variation where a
 *   variation is required and an 'Internal Amendment Form' (IAF) is filled out and
 *   variation raised (and reason listed) which is the only reason it can go backwards"*.
 *
 *   That is what `0031` was built for, and its header says the same thing from the other
 *   end: rewinding is coherent INSIDE a phase, on a variation, and never across phases —
 *   "nobody at Lofty would say the job is back at working drawings; they would say it is
 *   in construction with an open variation".
 *
 *   `variations` is not wired into the app yet — the table has existed since 0031 and
 *   nothing reads or writes it — so a backwards drop is refused HERE, in those words,
 *   pointing at the form it needs. It is a refusal with a route, not a wall, and the
 *   route is the next change rather than a guess made now.
 */

export type DropRefusal =
  | { kind: "no-pipeline"; stage: string }
  /**
   * `passed` is the difference between two situations that look identical and need
   * opposite advice. Amber hit the second on 3 September: PWA is filed under
   * Acquisition & Development, her jobs are in Pre-construction, and the refusal told
   * her to "move its stage first" — which would have meant moving 50 jobs BACKWARDS to
   * record a process they never recorded on the way through.
   */
  | { kind: "other-stage"; stage: string; processStage: string; passed: boolean }
  | { kind: "needs-variation"; from: string; to: string }
  | { kind: "already-there"; at: string };

export interface DropPlan {
  /** The process the job would be up to once this is written. */
  target: Process;
  /**
   * The processes before it still open — offered for completion, never required. The card
   * moves whether or not they are ticked; this is the tidy-up, not the move.
   */
  outstanding: Process[];
}

/**
 * There is no "does the target need starting" flag, and there was one until the rule
 * above changed. It is now unreachable: the position is the furthest process with a run
 * against it, so a target that HAS a run is at or behind the job, and a drop onto it is
 * refused as backwards or as already-there before it gets here. Every legal forward drop
 * lands on a process with no run at all. A field that is always true is a field that will
 * one day be believed.
 */

export type DropOutcome = { ok: true; plan: DropPlan } | { ok: false; refusal: DropRefusal };

const BEHIND: ProcessRunStatus[] = ["complete", "not_applicable"];
const isBehind = (s: ProcessRunStatus | undefined) => s != null && BEHIND.includes(s);

/**
 * Whether landing `job` on the column headed `processName` is a legal move, and what it
 * would write.
 *
 * `processName` rather than an id because the board groups by the heading it prints —
 * the same reason `processColumnOf` returns a name.
 */
export function planProcessDrop(job: BoardJob, processName: string, processes: Process[]): DropOutcome {
  const pipeline = stagePipeline(processes, job.stage);
  if (pipeline.length === 0) return { ok: false, refusal: { kind: "no-pipeline", stage: job.stage } };

  const targetIndex = pipeline.findIndex(p => p.name === processName);
  if (targetIndex === -1) {
    // The column exists — it just belongs to another stage. Moving the job there is a
    // lifecycle move, which is its own act with its own confirmation, so this refuses
    // rather than quietly doing two things at once.
    const elsewhere = processes.find(p => p.name === processName && p.isActive);
    const processStage = elsewhere?.stageName ?? "another stage";
    const at = (s: string) => STAGE_NAMES.indexOf(s as StageName);
    return {
      ok: false,
      refusal: {
        kind: "other-stage",
        stage: job.stage,
        processStage,
        // Both must be known stages to compare; an unknown one is not claimed as passed.
        passed: at(processStage) !== -1 && at(job.stage) !== -1 && at(processStage) < at(job.stage)
      }
    };
  }

  const statusByKey = new Map(job.processRuns.map(r => [r.processKey, r.status]));
  const at = currentProcessName(job, processes);
  const currentIndex = at === null ? -1 : pipeline.findIndex(p => p.name === at);

  if (currentIndex === targetIndex) return { ok: false, refusal: { kind: "already-there", at: pipeline[targetIndex].name } };
  if (currentIndex > targetIndex) {
    return { ok: false, refusal: { kind: "needs-variation", from: pipeline[currentIndex].name, to: pipeline[targetIndex].name } };
  }

  const target = pipeline[targetIndex];
  return {
    ok: true,
    plan: {
      target,
      outstanding: pipeline.slice(0, targetIndex).filter(p => !isBehind(statusByKey.get(p.key)))
    }
  };
}

/** The refusal, in the words the board prints on the column and in the bulk bar. */
export function refusalText(r: DropRefusal): string {
  switch (r.kind) {
    case "no-pipeline":
      return `${r.stage} has no processes yet, so there is nothing to move through.`;
    case "other-stage":
      return r.passed
        // The job is PAST that stage. Telling it to move its stage would mean moving
        // backwards, which is the opposite of what recording an outstanding process needs.
        ? `That process belongs to ${r.processStage}, which this job has already left — `
          + "so it cannot be reached from this board, which only draws the stage the job is in. "
          + "Record it in the job's drawer, where every stage is listed. If it belongs to "
          + `${r.stage} instead, move it there in Setup → Processes and it becomes a column here.`
        : `That process belongs to ${r.processStage}; this job is in ${r.stage}, which comes before it. `
          + "Move the job's stage first, then drop it on the process.";
    case "needs-variation":
      return `${r.to} runs before ${r.from}. Going back needs a variation — an IAF filled out and the variation raised with its reason. Raising one from here is not built yet.`;
    case "already-there":
      return `Already up to ${r.at}.`;
  }
}
