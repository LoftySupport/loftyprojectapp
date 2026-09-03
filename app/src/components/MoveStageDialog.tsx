import { useState } from "react";
import {
  Button, Modal, ModalBasicLayout, ModalContent, ModalFooter, ModalHeader, Text
} from "@vibe/core";
import {
  LINEAR_STAGES, STAGE_NAMES, WORKING_STAGES, type StageName
} from "../data/types";
import { usePermission } from "../data/PermissionProvider";
import { Problem } from "./Form";
import { Select } from "./Select";
import "./ui.css";

/**
 * Where a stage sits in the lifecycle. STAGE_NAMES is already in board order, so the
 * index IS the position — the same fact `lifecycle_position()` holds in Postgres, read
 * from the same list the CHECK constraints were written from.
 */
export const stagePosition = (stage: string): number =>
  STAGE_NAMES.indexOf(stage as StageName);

const isLinear = (stage: string): boolean =>
  (LINEAR_STAGES as readonly string[]).includes(stage);

/**
 * The stages a record at `from` may still reach by moving FORWARDS. The linear run
 * only — Cancelled is entered by cancelling and left by reviving, never offered here,
 * and nothing moves forwards out of Cancelled or Closed.
 */
export const stagesAhead = (from: string): StageName[] =>
  isLinear(from)
    ? LINEAR_STAGES.filter(s => stagePosition(s) > stagePosition(from))
    : [];

/**
 * Whether a drag from one board column to another is a legal forward move. The board
 * calls this while the drag is still in the air, so an illegal drop is refused before
 * it lands. Cancelling and reviving are deliberate acts with their own confirmations —
 * neither is a thing a card drag should do, so both ends must be on the linear run.
 */
export function isForwardMove(from: string, to: string): boolean {
  return isLinear(from) && isLinear(to) && stagePosition(to) > stagePosition(from);
}

type MoveVerb = "Move" | "Cancel";

/**
 * The confirmation for a lifecycle change. Lofty, 25 August: "any manager, admin or
 * super admin can move stages with a popup modal asking for confirmation if moving
 * lifecycle stages. in a pipeline no modal popup is require[d]."
 *
 * A Modal rather than a panel for the same reason DeactivateDialog is one: a
 * confirmation is supposed to interrupt. Three verbs share it because they are one
 * decision — "this record's place in the lifecycle changes" — with different
 * consequences, and the copy states the consequence that belongs to each:
 *
 *   - **Move** is irreversible by design. The lifecycle only goes forwards, so there
 *     is no "move it back" to reach for afterwards, and the dialog says that.
 *   - **Cancel** ends it. Nothing fires while cancelled — no notifications,
 *     automations or health alerts — and twelve months on the clock archives it to
 *     Closed.
 *
 * **There is no Revive, as of 0057.** There was: 0045 made Cancelled the one stage a
 * record could leave backwards. Amber, 28 Aug: "cancelled will not be revived — if
 * revived, it will need a new job number as a lot of the initial info will be
 * outdated." What comes back is the work, not the record; the row's dates, selections
 * and costings are stale by then, and its number is on contracts. So coming back is a
 * clone, and this dialog lost a verb.
 *
 * The team pipelines (`job_pipeline_positions`) are a different object and get no
 * modal; this component is only ever mounted for a lifecycle change.
 *
 * The app's `can("manager")` hides the controls that open this; the database's guards
 * (0038, 0039, 0045) are the security. A refusal is shown verbatim — the database's
 * sentence names the actual rule.
 */
export function MoveStageDialog({
  show, subject, fromStage, toStage, verb = "Move", move, note, onClose, onMoved
}: {
  show: boolean;
  /** What is being moved, as the title says it — "1042-01", or "Project 1042". */
  subject: string;
  fromStage: string;
  toStage: StageName | null;
  verb?: MoveVerb;
  /** The write itself. A job and a project confirm identically; only this differs. */
  move: (to: StageName) => Promise<unknown>;
  /** The consequence worth stating — what else moves, or does not, with this one. */
  note: string;
  onClose: () => void;
  /** Called after the database accepted the change, so the caller can re-read. */
  onMoved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // How far a forward move jumps. Skipping phases is legal — linear means no
  // backwards, not no shortcuts — but a jump past two phases is worth saying out loud.
  const skipped = verb === "Move" && toStage
    ? stagePosition(toStage) - stagePosition(fromStage) - 1
    : 0;

  async function go() {
    if (!toStage) return;
    setSaving(true);
    setError(null);
    try {
      await move(toStage);
      onMoved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const title =
    verb === "Cancel" ? `Cancel ${subject}`
    : `Move ${subject} to ${toStage ?? ""}`;

  return (
    <Modal show={show} onClose={onClose} id="move-job-stage">
      {/* The layout wrapper is where Vibe's modal padding lives — header and content
          composed without it sit flush against the modal's edges, which is exactly how
          this dialog first shipped and exactly how it looked. Footer stays outside,
          per Vibe's own composition. */}
      <ModalBasicLayout>
      <ModalHeader title={title} />
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
          {verb === "Cancel"
            ? "This is an ending, not a pause. It keeps its data but fires nothing — no " +
              "notifications, automations or health alerts — and twelve months from now " +
              "it archives to Closed. It cannot be revived: if the work restarts, clone " +
              "it, and the new record starts with its own number."
            : "The lifecycle only moves forwards, so this cannot be undone by moving " +
              "it back."}
          {" "}{note}
        </Text>
        {error && <Problem>{error}</Problem>}
      </ModalContent>
      </ModalBasicLayout>
      <ModalFooter
        primaryButton={{
          text: saving
            ? "Saving…"
            : verb === "Cancel" ? `Cancel ${subject}`
            : "Move",
          onClick: go,
          disabled: saving || !toStage
        }}
        secondaryButton={{
          // "Cancel" as the dismiss label under a "Cancel the job" primary would be
          // two buttons fighting over one word.
          text: verb === "Cancel" ? "Keep it as it is" : "Cancel",
          onClick: onClose
        }}
      />
    </Modal>
  );
}

/**
 * The picker that opens the dialog — the drawer's and project page's stage control.
 *
 * Offers only what the database would accept, because a menu of refusals is a menu of
 * traps. Three shapes, one per kind of stage:
 *
 *   - On the linear run: "Move to…" over the stages still ahead, plus — from a working
 *     phase only — a "Cancel…" action. Completed is done, so cancelling it stopped
 *     making sense the moment it finished ("a job can be cancelled but it isn't
 *     complete" — the two are different endings, not a sequence).
 *   - At Cancelled or Closed: a sentence. Both are terminal (0057 made Cancelled so),
 *     and the control says which rather than rendering a menu of refusals.
 */
export function MoveStageControl({
  subject, stage, move, note, onMoved
}: {
  subject: string;
  stage: string;
  move: (to: StageName) => Promise<unknown>;
  note: string;
  onMoved: () => void;
}) {
  const { can } = usePermission();
  const [target, setTarget] = useState<StageName | null>(null);
  const [verb, setVerb] = useState<MoveVerb>("Move");

  if (!can("manager")) return null;

  const open = (v: MoveVerb, to: StageName) => { setVerb(v); setTarget(to); };

  if (stage === "Closed") {
    return (
      <Text type="text3" color="secondary">
        Closed is the archive — nothing moves out of it.
      </Text>
    );
  }

  const dialog = (
    <MoveStageDialog
      show={target != null}
      subject={subject}
      fromStage={stage}
      toStage={target}
      verb={verb}
      move={move}
      note={note}
      onClose={() => setTarget(null)}
      onMoved={onMoved}
    />
  );

  if (stage === "Cancelled") {
    return (
      <Text type="text3" color="secondary">
        Cancelled is an ending — clone it if the work restarts.
      </Text>
    );
  }

  const ahead = stagesAhead(stage);
  return (
    <>
      <Select
        aria-label={`Move ${subject} to a later phase`}
        placeholder="Move to…"
        ordered options={ahead.map(s => ({ value: s, label: s }))}
        value={null}
        onChange={v => open("Move", v as StageName)}
      />
      {(WORKING_STAGES as readonly string[]).includes(stage) && (
        <Button
          kind="tertiary"
          size="small"
          onClick={() => open("Cancel", "Cancelled")}
        >
          Cancel…
        </Button>
      )}
      {dialog}
    </>
  );
}

/** The sentence a job's confirmation adds — the project can move with it. */
export const JOB_MOVE_NOTE =
  "If every job on the project has now passed this phase, the project moves up with it.";

/** And a project's — its lagging jobs come with it (0046, Amber's rule). */
export const PROJECT_MOVE_NOTE =
  "Every job still behind this phase moves up with it. Jobs already at or past it, " +
  "cancelled or archived, stay where they are.";
