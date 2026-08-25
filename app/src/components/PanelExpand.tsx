import { useEffect, useState } from "react";
import { Button } from "@vibe/core";
import { Collapse, Expand } from "@vibe/icons";
import "./ui.css";

/**
 * The expand-to-full-screen control, shared by every side panel.
 *
 * It existed on `CreatePanel` and nowhere else, as a text button reading "Expand" —
 * Lofty: *"the expand button should be a default expand icon on all sidebar forms to
 * see fullscreen. it is not showing in jobs."* Both halves of that are addressed here,
 * and it is one module rather than two copies for the reason `Form.tsx` is: a second
 * copy of a control is how two panels end up disagreeing about what expanding means.
 *
 * WHY IT DISAPPEARS ON A NARROW SCREEN
 *
 *   A panel is `min(460px, 100vw)` and expanded is `min(1100px, 100vw)`. The two are
 *   identical at 460 and below, so beneath that the control is a button that visibly
 *   does nothing. 560 is where expanding first buys about a hundred pixels — the same
 *   threshold, and the same reasoning, as the rail's collapse toggle being hidden on a
 *   phone.
 */
const EXPAND_WORTH_IT = 560;

export function usePanelExpand(open: boolean) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(
    () => window.matchMedia(`(min-width: ${EXPAND_WORTH_IT}px)`).matches
  );

  // Watched, not read once: dragging a window narrower while expanded would otherwise
  // leave a Shrink button on a panel that is already the whole screen.
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${EXPAND_WORTH_IT}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      setCanExpand(e.matches);
      if (!e.matches) setExpanded(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Collapsed again on close, so the next thing opened is a panel rather than inheriting
  // whatever the last person left it as.
  useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);

  return { expanded, canExpand, toggle: () => setExpanded(e => !e) };
}

/**
 * An icon, not the word "Expand".
 *
 * The label lives in `aria-label`, so a screen reader still gets words — what changes is
 * that the control reads as a control at a glance and takes the same room in every panel
 * head. Vibe's Button has no `title` prop, so there is no hover tooltip to add one to.
 */
export function ExpandButton({
  expanded,
  onToggle
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const label = expanded ? "Shrink to a panel" : "Expand to full screen";
  return (
    <Button
      kind="tertiary"
      size="small"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={expanded}
    >
      {expanded ? <Collapse size={16} aria-hidden /> : <Expand size={16} aria-hidden />}
    </Button>
  );
}
