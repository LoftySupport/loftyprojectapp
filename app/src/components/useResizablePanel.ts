import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A side panel you can drag wider (Amber, 27 Aug: "should be able to be dragged and
 * resized to wider … so users can adjust it").
 *
 * The width is a preference about how somebody works — a wide screen wants a wide
 * drawer, a laptop beside a board does not — so it is remembered per device rather
 * than reset every time the panel opens. localStorage, the same home as the theme and
 * the collapsed rail, and the same one preferences will move out of together when they
 * roam with the profile.
 *
 * Dragging is not the only way in. The handle is a real focusable control: arrow keys
 * move it 24px at a time, Home and End go to the extremes, and Enter resets. A panel
 * you can only size with a mouse is a panel some people cannot size.
 */

const KEY = "lofty.drawer.w";
export const PANEL_DEFAULT = 460;
export const PANEL_MIN = 360;
/** Never past the point where the panel is the whole main area — that is what expand is for. */
const capFor = (viewport: number) => Math.max(PANEL_MIN, Math.round(viewport * 0.8));

function readStored(): number {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n >= PANEL_MIN ? n : PANEL_DEFAULT;
  } catch {
    return PANEL_DEFAULT;
  }
}

export function useResizablePanel(enabled: boolean) {
  const [width, setWidth] = useState<number>(readStored);
  const dragging = useRef(false);

  const clamp = useCallback(
    (n: number) => Math.min(capFor(window.innerWidth), Math.max(PANEL_MIN, Math.round(n))),
    []
  );

  const commit = useCallback((n: number) => {
    setWidth(n);
    try {
      localStorage.setItem(KEY, String(n));
    } catch {
      // Storage refused — the width still applies for this session.
    }
  }, []);

  // Pointer events rather than mouse: one code path covers a trackpad, a mouse and a
  // touchscreen, and setPointerCapture keeps the drag alive when the cursor outruns
  // the 6px handle — which it does immediately, every time.
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!enabled) return;
      e.preventDefault();
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    },
    [enabled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      // The panel is pinned right, so its width is the distance from the pointer to
      // the right edge of the window.
      setWidth(clamp(window.innerWidth - e.clientX));
    },
    [clamp]
  );

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (!dragging.current) return;
      dragging.current = false;
      e.currentTarget.releasePointerCapture?.(e.pointerId);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      commit(clamp(window.innerWidth - e.clientX));
    },
    [clamp, commit]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 96 : 24;
      // Left widens: the panel is on the right, so dragging its edge left makes it
      // bigger. The keys follow the hand, not the number.
      if (e.key === "ArrowLeft") { e.preventDefault(); commit(clamp(width + step)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); commit(clamp(width - step)); }
      else if (e.key === "Home") { e.preventDefault(); commit(clamp(capFor(window.innerWidth))); }
      else if (e.key === "End") { e.preventDefault(); commit(PANEL_MIN); }
      else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); commit(PANEL_DEFAULT); }
    },
    [width, clamp, commit]
  );

  // A width saved on a big monitor must not swallow a laptop screen when the same
  // person signs in there. Re-clamped on resize rather than on read, so the stored
  // preference survives the smaller screen and comes back on the larger one.
  useEffect(() => {
    const onResize = () => setWidth(w => clamp(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clamp]);

  return {
    width,
    /** Spread onto the handle. Double-click resets, the way a split pane usually does. */
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onKeyDown,
      onDoubleClick: () => commit(PANEL_DEFAULT),
      role: "separator" as const,
      tabIndex: 0,
      "aria-label": "Resize panel — arrow keys, or Enter to reset",
      "aria-orientation": "vertical" as const,
      "aria-valuenow": width,
      "aria-valuemin": PANEL_MIN,
      "aria-valuemax": typeof window === "undefined" ? PANEL_DEFAULT : capFor(window.innerWidth)
    }
  };
}
