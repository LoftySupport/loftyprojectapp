import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import "./ui.css";

/**
 * The board, with a scrollbar you can reach.
 *
 * The board has always scrolled sideways — `overflow-x: auto` on `.board`, since the
 * first column went in. What it did not have was a way to *ask* it to. The scrollbar
 * belongs to the board element, so it sits at the bottom of the board's own content:
 * seven stage columns with a dozen jobs in one of them put it below the fold, and
 * on a Mac it is an overlay bar that is not painted at all until something is already
 * scrolling. A trackpad swipe worked. A mouse had nothing to grab, and the stages past
 * the right-hand edge may as well not have existed — Lofty: *"add a horizontal scroll
 * to the main app board at the base so you can scroll left and right when the stages go
 * past the screen."*
 *
 * So: a second scroll container, one pixel of content wide enough to overflow by exactly
 * as much as the board does, stuck to the bottom of the viewport. Dragging it drags the
 * board; swiping the board moves it. It is the board's scrollbar, relocated to where the
 * hand is.
 *
 * WHY A PROXY AND NOT THE BOARD ITSELF
 *
 *   The alternative is to cap the board's height at the viewport, which puts the native
 *   scrollbar on screen for free. It also takes the page's vertical scroll away from the
 *   page and gives it to a div — the header stops being the thing that scrolls away, the
 *   footer becomes unreachable, and every column gets its own little scrolling world.
 *   That is a different board. This is a scrollbar.
 *
 * The rail is `aria-hidden`: it duplicates a scroll the board already exposes, and a
 * screen reader announcing a second empty scroll region would be reading out the
 * plumbing. Keyboard and assistive-tech users move through the cards themselves, which
 * scrolls the board to whatever they land on.
 */
export function Board({ children }: { children: ReactNode }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);
  /** The board's content width while it overflows; 0 when every column already fits. */
  const [contentWidth, setContentWidth] = useState(0);

  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    // A pixel of slack. Sub-pixel layout leaves `scrollWidth` a fraction over
    // `clientWidth` on a board that plainly fits, and a rail whose thumb fills the whole
    // track is a control that does nothing.
    setContentWidth(board.scrollWidth > board.clientWidth + 1 ? board.scrollWidth : 0);
  }, []);

  /**
   * Two elements, one scroll position. Assigning a `scrollLeft` that already holds fires
   * no scroll event, so the mirror settles after a single bounce instead of looping. The
   * rounding guard is what makes that true: browsers report fractional scroll offsets,
   * and two containers a third of a pixel apart would hand the difference back and forth
   * forever.
   */
  const mirror = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to) return;
    if (Math.abs(to.scrollLeft - from.scrollLeft) > 0.5) to.scrollLeft = from.scrollLeft;
  };

  // Measured on every render, because a column arriving is what changes the content
  // width and a ResizeObserver on the board never sees it: the board's own box does not
  // move when the row inside it gets longer. `setState` to the value it already holds is
  // a no-op, so this does not loop.
  useLayoutEffect(() => {
    measure();
    // The rail mounts at zero while the board may already be scrolled — a saved view
    // restored mid-board, or a re-render during a drag.
    mirror(boardRef.current, railRef.current);
  });

  // The other half: the board's box changing under a fixed set of columns — the window
  // resized, the nav rail collapsed, a side panel opening beside it.
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className="board-scroll">
      <div
        className={contentWidth ? "board board-railed" : "board"}
        ref={boardRef}
        onScroll={() => mirror(boardRef.current, railRef.current)}
      >
        {children}
      </div>

      {/* Absent, not merely hidden, when the columns fit: a disabled-looking bar under a
          board that has nowhere to go is a promise of content that is not there. */}
      {contentWidth > 0 && (
        <div
          className="board-rail"
          ref={railRef}
          onScroll={() => mirror(railRef.current, boardRef.current)}
          aria-hidden="true"
        >
          <div className="board-rail-track" style={{ width: contentWidth }} />
        </div>
      )}
    </div>
  );
}
