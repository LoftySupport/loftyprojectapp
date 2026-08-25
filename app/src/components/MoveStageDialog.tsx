import { useState } from "react";
import { Modal, ModalContent, ModalFooter, ModalHeader, Text } from "@vibe/core";
import { STAGE_NAMES, type StageName } from "../data/types";
import { useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { Problem } from "./Form";
import { Select } from "./Select";
import "./ui.css";

/**
 * Where a stage sits in the five-phase lifecycle. STAGE_NAMES is already in board
 * order, so the index IS the position — the same fact `lifecycle_position()` holds in
 * Postgres, read from the same list the CHECK constraints were written from.
 */
export const stagePosition = (stage: string): number =>
  STAGE_NAMES.indexOf(stage as StageName);

/** The stages a job at `from` may still reach. Forwards only — 0039 refuses the rest. */
export const stagesAhead = (from: string): StageName[] =>
  STAGE_NAMES.filter(s => stagePosition(s) > stagePosition(from));

/**
 * The confirmation for a lifecycle move. Lofty, 25 August: "any manager, admin or super
 * admin can move stages with a popup modal asking for confirmation if moving lifecycle
 * stages. in a pipeline no modal popup is require[d]."
 *
 * A Modal rather than a panel for the same reason DeactivateDialog is one: a
 * confirmation is supposed to interrupt. And it interrupts because the move is
 * irreversible by design — the lifecycle only goes forwards, so there is no "move it
 * back" to reach for afterwards. The dialog says that instead of letting the refusal
 * be discovered on the next attempt.
 *
 * The team pipelines (`job_pipeline_positions`) are a different object and get no modal;
 * this component is only ever mounted for a lifecycle move.
 *
 * The app's `can("manager")` hides the controls that open this; the database's guards
 * (0038, 0039) are the security. If a refusal comes back anyway, it is shown verbatim —
 * the database's sentence names the actual rule.
 */
export function MoveStageDialog({
  show, jobNumber, fromStage, toStage, onClose, onMoved
}: {
  show: boolean;
  jobNumber: string;
  fromStage: string;
  toStage: StageName | null;
  onClose: () => void;
  /** Called after the database accepted the move, so the caller can re-read the board. */
  onMoved: () => void;
}) {
  const repo = useRepository();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // How far the move jumps. Skipping phases is legal — linear means no backwards, not
  // no shortcuts — but a jump past two phases is worth saying out loud before it lands.
  const skipped = toStage
    ? stagePosition(toStage) - stagePosition(fromStage) - 1
    : 0;

  async function go() {
    if (!toStage) return;
    setSaving(true);
    setError(null);
    try {
      await repo.moveJobStage(jobNumber, toStage);
      onMoved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal show={show} onClose={onClose} id="move-job-stage">
      <ModalHeader title={`Move ${jobNumber} to ${toStage ?? ""}`} />
      <ModalContent>
        <Text type="text2" element="p" ellipsis={false}>
          From <strong>{fromStage}</strong> to <strong>{toStage}</strong>.
        </Text>
        {skipped > 0 && (
          <Text type="text2" element="p" ellipsis={false}>
            That skips {skipped === 1 ? "a phase" : `${skipped} phases`} — allowed, but
            worth being sure of.
          </Text>
        )}
        <Text type="text3" color="secondary" ellipsis={false}>
          The lifecycle only moves forwards, so this cannot be undone by moving it back.
          If every job on the project has now passed this phase, the project moves up
          with it.
        </Text>
        {error && <Problem>{error}</Problem>}
      </ModalContent>
      <ModalFooter
        primaryButton={{
          text: saving ? "Moving…" : "Move",
          onClick: go,
          disabled: saving || !toStage
        }}
        secondaryButton={{ text: "Cancel", onClick: onClose }}
      />
    </Modal>
  );
}

/**
 * The picker that opens the dialog — the drawer's "move this job" control.
 *
 * Offers only the stages still ahead: a dropdown listing "Acquisition & Development"
 * to a job at Construction would be offering a choice the database refuses, and the
 * refusal would arrive after the person had already decided. At `Closed` there is
 * nowhere left to go and the control says so instead of rendering an empty menu.
 *
 * Selecting does not move anything — it opens the confirmation, and cancelling puts
 * the picker back to empty.
 */
export function MoveStageControl({
  jobNumber, stage, onMoved
}: {
  jobNumber: string;
  stage: string;
  onMoved: () => void;
}) {
  const { can } = usePermission();
  const [target, setTarget] = useState<StageName | null>(null);

  if (!can("manager")) return null;

  const ahead = stagesAhead(stage);
  if (ahead.length === 0) {
    return (
      <Text type="text3" color="secondary">
        Closed is the last phase — there is nowhere further to move it.
      </Text>
    );
  }

  return (
    <>
      <Select
        aria-label={`Move ${jobNumber} to a later phase`}
        placeholder="Move to…"
        options={ahead.map(s => ({ value: s, label: s }))}
        value={null}
        onChange={v => setTarget(v as StageName)}
      />
      <MoveStageDialog
        show={target != null}
        jobNumber={jobNumber}
        fromStage={stage}
        toStage={target}
        onClose={() => setTarget(null)}
        onMoved={onMoved}
      />
    </>
  );
}

/**
 * Kept exported for the board: dropping a card on an earlier column is refused before
 * the drag even lands (the column does not accept the drop), but a click-driven path
 * can still ask, and the answer should be the same sentence everywhere.
 */
export function isForwardMove(from: string, to: string): boolean {
  return stagePosition(to) > stagePosition(from);
}
