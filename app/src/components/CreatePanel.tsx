import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Heading } from "@vibe/core";
import "./ui.css";

/**
 * The shell every create form sits in.
 *
 * Lofty, 23 August, on whether creating should be a side panel or a row on the board:
 * *"both. they can add either way."* So the button opens this — a panel down the right —
 * and the board's own last row is the other way in.
 *
 * WHY A PANEL AND NOT THE CENTRED DIALOG IT REPLACES
 *
 *   The list stays visible and usable behind it, which is the thing the modal actually
 *   cost: you create a project to add to a list you can no longer see, and adding four
 *   sites meant four round trips through a dimmed screen.
 *
 *   It also reuses the job drawer's shape, which is already `min(460px, 100vw)` and
 *   already survives a phone — where it goes full width and the × gets a finger.
 *
 * AND WHY IT STILL EXPANDS
 *
 *   A panel is 460px and the create form is nine fields; a long council name and a
 *   street on one line is tight. The expand control swaps the panel for the full window
 *   without losing what has been typed, because it is the same form either way — only
 *   the shell around it changes. Vibe's Modal has `size="full-view"` for this, but it
 *   also dims and centres, which is the behaviour being moved away from; a class on the
 *   same element gets the width without the scrim coming back.
 */
/**
 * Below this the panel is already the full window, so expanding cannot change anything.
 *
 * The panel is `min(460px, 100vw)` and expanded is `min(1100px, 100vw)`; the two are
 * identical at 460 and below, and the difference is not worth a control much above it.
 * 560 is where expanding buys a hundred pixels — beneath that the button would be one
 * that visibly does nothing, which is the same fault the rail's collapse toggle is
 * hidden for on a phone.
 */
const EXPAND_WORTH_IT = 560;

export function CreatePanel({
  open,
  title,
  onClose,
  footer,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  /** The actions row. Pinned to the bottom, never scrolled away from. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(
    () => window.matchMedia(`(min-width: ${EXPAND_WORTH_IT}px)`).matches
  );

  // Watched, not read once: dragging a window narrower with the panel expanded would
  // otherwise leave a Shrink button on a panel that is already the whole screen.
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${EXPAND_WORTH_IT}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      setCanExpand(e.matches);
      if (!e.matches) setExpanded(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Escape closes, and focus moves into the panel when it opens. A panel you can only
  // leave with the mouse is a trap for anyone driving from the keyboard — the same
  // reason JobDrawer does this.
  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Collapsed again on close, so the next thing opened is a panel rather than inheriting
  // whatever the last person left it as.
  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Quieter than the modal's scrim on purpose: the list behind is meant to stay
          readable. It still catches a click, because clicking away from a panel is how
          most people close one. */}
      <div className="create-panel-scrim" onClick={onClose} />
      <aside
        className={`create-panel${expanded ? " is-expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
      >
        <header className="create-panel-head">
          <Heading type="h3" weight="medium">{title}</Heading>
          <div className="create-panel-actions">
            {canExpand && (
              <Button
                kind="tertiary"
                size="small"
                onClick={() => setExpanded(e => !e)}
                aria-label={expanded ? "Shrink to a panel" : "Expand to full screen"}
                aria-pressed={expanded}
              >
                {expanded ? "Shrink" : "Expand"}
              </Button>
            )}
            <Button kind="tertiary" size="small" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        <div className="create-panel-body">{children}</div>

        {footer && <footer className="create-panel-foot">{footer}</footer>}
      </aside>
    </>
  );
}
