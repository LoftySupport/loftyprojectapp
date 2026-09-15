import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button, Heading } from "@vibe/core";
import { ExpandButton, usePanelExpand } from "./PanelExpand";
import { useResizablePanel } from "./useResizablePanel";
import "./ui.css";

/**
 * The shell every side panel sits in — create forms, Ask Lofty, reporting a bug.
 *
 * It was `CreatePanel`, and only creating used it. Ask Lofty arrived as a floating dock
 * instead, and the dock sat on top of the drawer's Save button (Amber, 28 Aug: "the ai
 * button at the bottom of the screen covers the save button"). The fix was not to move
 * the dock a few pixels: a second kind of panel, with its own size, its own close and no
 * grab edge, is a second thing to learn. So this became the one shell, and everything
 * that opens down the right gets the same width, the same drag handle, the same Escape.
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
 * Which panels are open, in the order they opened.
 *
 * Two can be open at once now — the split-into-jobs form over the project's own panel,
 * a person's activity over their edit form — and before this each of them answered
 * Escape. One press closed the form you were in AND the record behind it, which is how
 * "create a job should open the interface, not make you close out" (Amber, 7 Sep) came to
 * be filed: the split panel opened, the drawer under it heard the same Escape, and both
 * went. Only the panel on top of the stack listens now.
 */
const OPEN_PANELS: string[] = [];

export function SidePanel({
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
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    OPEN_PANELS.push(panelId);
    return () => {
      const at = OPEN_PANELS.indexOf(panelId);
      if (at >= 0) OPEN_PANELS.splice(at, 1);
    };
  }, [open, panelId]);
  // The expand control and its rules live in PanelExpand, so the job drawer gets the
  // identical behaviour rather than a second implementation of it.
  const { expanded, canExpand, toggle } = usePanelExpand(open);
  // The same grab edge the job drawer has, and deliberately the same remembered width:
  // both are "the panel on the right", and having one at 700 and the other at 460 would
  // read as two different things rather than one place the app puts side work.
  const { width, handleProps } = useResizablePanel(!expanded);

  /**
   * Focus moves into the panel WHEN IT OPENS, and only then.
   *
   * This was one effect with `onClose` in its dependencies, and `onClose` is a fresh
   * closure on every render at every call site — `onClose={close}`, where `close` is
   * defined in the component body. So the effect re-ran after each keystroke and called
   * `panel.current?.focus()` again, pulling focus out of the field being typed into.
   * Typing one letter into "Project name" put the caret on the panel and the next letter
   * went nowhere: the form accepted exactly one character per click.
   *
   * `[open]` alone is the fix. Focusing on open is a deliberate behaviour — a panel you
   * can only leave with the mouse is a trap for anyone driving from the keyboard — and
   * it is a thing that happens once, not a thing that re-asserts itself on every render.
   */
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  /**
   * Escape closes. Separate from the focus effect, and reading `onClose` through a ref,
   * so a new closure re-binds nothing and cannot drag focus with it.
   */
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the panel on top. The one beneath gets the next press.
      if (OPEN_PANELS[OPEN_PANELS.length - 1] !== panelId) return;
      close.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, panelId]);

  if (!open) return null;

  return (
    <>
      {/* Quieter than the modal's scrim on purpose: the list behind is meant to stay
          readable. It still catches a click, because clicking away from a panel is how
          most people close one. */}
      <div className="side-panel-scrim" onClick={onClose} />
      <aside
        className={`side-panel${expanded ? " is-expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panel}
        style={expanded ? undefined : { width: `min(${width}px, calc(100vw - var(--shell-rail-w, 0px)))` }}
      >
        {!expanded && <div className="drawer-grip" {...handleProps} />}
        <header className="side-panel-head">
          <Heading type="h3" weight="medium">{title}</Heading>
          <div className="side-panel-actions">
            {canExpand && <ExpandButton expanded={expanded} onToggle={toggle} />}
            <Button kind="tertiary" size="small" onClick={onClose} aria-label="Close">
              ×
            </Button>
          </div>
        </header>

        <div className="side-panel-body">{children}</div>

        {footer && <footer className="side-panel-foot">{footer}</footer>}
      </aside>
    </>
  );
}
