import { useState } from "react";
import {
  Checkbox, Modal, ModalBasicLayout, ModalContent, ModalFooter, ModalHeader, Text
} from "@vibe/core";
import { Problem } from "./Form";
import "./ui.css";

/**
 * The confirmation for moving a job onto a process — the one Amber asked for when asked
 * what a drop should record: *ask each time*.
 *
 * WHAT IT ASKS, AND WHAT IT DOES NOT
 *
 *   Starting the target IS the move: since Amber's correction that *"a process might not
 *   be complete before moving onto the next stage"*, the board reads the furthest process
 *   anybody has recorded, so the card lands where it was dropped whatever is still open
 *   behind it. Nothing has to be completed for that to work.
 *
 *   So completing what is behind is a tick box, not a condition — offered because a drop
 *   is often the moment somebody realises the earlier steps really are done. It is left
 *   OFF, and the cost is stated beside it: `0078` stamps a completion with `now()` and
 *   the profile ticking it, because the CHECK forbids a complete run with no date. June's
 *   work recorded as finished today, under your name, is a real thing to choose.
 *
 * The same modal serves one card and a selection of forty — `count` is what changes.
 */
export function MoveProcessDialog({
  subject, count, target, completes, onConfirm, onClose
}: {
  /** '1042-01', or '12 jobs' — the thing being moved, in the words on screen. */
  subject: string;
  count: number;
  target: string;
  /** The process names that a "yes" marks complete. Empty means nothing to weigh up. */
  completes: string[];
  onConfirm: (alsoComplete: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Off by default: the move does not need it, and a pre-ticked box that back-dates
  // history to today is a decision made for somebody rather than by them.
  const [alsoComplete, setAlsoComplete] = useState(false);

  const go = async () => {
    setBusy(true); setError(null);
    try { await onConfirm(alsoComplete); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const many = completes.length;

  return (
    <Modal show onClose={busy ? () => {} : onClose} id="move-process">
      <ModalBasicLayout>
        <ModalHeader title={`Move ${subject} to ${target}`} />
        <ModalContent>
          {error && <Problem>{error}</Problem>}
          <Text type="text2" element="p" ellipsis={false}>
            {count === 1 ? "This job moves" : `These ${count} jobs move`} to <strong>{target}</strong>,
            recorded as under way.
          </Text>
          {many > 0 && (
            <>
              <Checkbox
                label={`Also mark ${many === 1 ? "the process" : `the ${many} processes`} before it complete`}
                checked={alsoComplete}
                onChange={() => setAlsoComplete(v => !v)}
              />
              <Text type="text3" color="secondary" element="p" ellipsis={false}>
                {completes.join(", ")} {many === 1 ? "is" : "are"} still open. The move does not need
                {many === 1 ? " it" : " them"} closed — a job can be at {target} with earlier work
                unfinished. Ticking this records {many === 1 ? "it" : "them"} as completed
                <strong> today, by you</strong>, because the database stamps the date and the name and
                will not take a completion without one.
              </Text>
            </>
          )}
        </ModalContent>
      </ModalBasicLayout>
      <ModalFooter
        primaryButton={{
          text: busy ? "Saving…" : `Move to ${target}`,
          disabled: busy,
          onClick: () => { void go(); }
        }}
        secondaryButton={{ text: "Cancel", onClick: onClose }}
      />
    </Modal>
  );
}
