import { Redo, Undo } from "@vibe/icons";
import { Tooltip } from "@vibe/tooltip";
import { useUndo } from "../data/UndoProvider";
import "./ui.css";

/**
 * The two arrows in the header (Amber, 7 September: "add the undo and redo bar to the
 * top navigation").
 *
 * The same 32px trigger the bell, Ask and the cog use, so the header reads as one row
 * of identical targets. Disabled rather than hidden when there is nothing to take back:
 * a control that appears only after your first edit is a control nobody learns is there.
 * The tooltip names the step — "Undo: Assigned 1042-001 to Deanna" — because an arrow
 * on its own asks you to remember what you did last, and the whole point is that you
 * might not.
 *
 * `aria-disabled` and a real `disabled` both: Vibe's Tooltip needs a focusable child to
 * attach to, and a disabled button is not one, so the tooltip wraps a span and the
 * button's own label carries the same words for a screen reader.
 */
export function UndoRedoBar() {
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel, busy } = useUndo();
  const undoText = undoLabel ? `Undo: ${undoLabel}` : "Nothing to undo";
  const redoText = redoLabel ? `Redo: ${redoLabel}` : "Nothing to redo";
  return (
    <span className="undo-bar" role="group" aria-label="Undo and redo">
      <Tooltip content={`${undoText} (Ctrl+Z)`} position="bottom">
        <span>
          <button
            type="button"
            className="notif-bell-trigger undo-btn"
            onClick={() => void undo()}
            disabled={!canUndo || busy}
            aria-label={undoText}
          >
            <Undo size={20} aria-hidden />
          </button>
        </span>
      </Tooltip>
      <Tooltip content={`${redoText} (Ctrl+Shift+Z)`} position="bottom">
        <span>
          <button
            type="button"
            className="notif-bell-trigger undo-btn"
            onClick={() => void redo()}
            disabled={!canRedo || busy}
            aria-label={redoText}
          >
            <Redo size={20} aria-hidden />
          </button>
        </span>
      </Tooltip>
    </span>
  );
}
