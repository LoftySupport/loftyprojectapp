// app/src/components/BoardColumn.tsx
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Text } from "@vibe/core";
import "./ui.css";

/**
 * One column of a kanban board, and the only one.
 *
 * Amber, 12 September: *"on Kanban boards can you make them collapsible so they have a
 * narrow view like the side navigation, with completed closed cancelled and acquisitions
 * and development closed by default"*.
 *
 * WHY THIS IS A COMPONENT RATHER THAN A CLASS ON THREE PAGES
 *
 *   Jobs, Projects and Tasks each wrote the same forty lines: a `<section
 *   className="board-column">` carrying the accent, a head with the grouping's name above
 *   the column's name, a count chip, and an empty line reading "No jobs" / "No projects" /
 *   "No tasks". Three copies of one thing is how a fix lands on one board and not the
 *   other two — the failure the element sweep exists to catch. Collapsing is written once
 *   here, so it is on every board the day it ships rather than on the board that was
 *   asked about.
 *
 *   The drag handlers stay on the pages. What a drop MEANS differs per board — a stage
 *   move that asks for confirmation, a process move, an ordinary edit — and a component
 *   that took a generic `onDrop` would be a worse home for that than the page that knows.
 *
 * COLLAPSED IS A NARROW STRIP, NOT A HIDDEN COLUMN
 *
 *   "Like the side navigation" is 64px of rail with the labels gone and the icons kept. A
 *   column has no icon, so what is kept is its name, written down the strip, and its
 *   count. The point of the collapsed state is that the column is still THERE — you can
 *   see how many are in it, and a card still drops into it — which is what "put Completed
 *   out of the way" means and what hiding it would not do.
 *
 * WHAT IS SHUT BY DEFAULT, AND WHY IT IS BY NAME
 *
 *   The four Amber named: Completed, Closed, Cancelled, Acquisition & Development. Three
 *   are ends — work that is finished, dropped, or was never going to happen — and the
 *   fourth is the stage a job sits in before anybody is building anything. They match by
 *   the column's own name rather than by a per-board list, so the rule holds on the Jobs
 *   board's stages, the Projects board's, and anywhere else those words are a column.
 *
 *   Only until somebody says otherwise. A person's own choice is remembered per board and
 *   per column and beats the default, the same way `CollapsiblePanel` remembers a panel:
 *   a board that reopens with your columns shut again is a board you have to re-arrange
 *   every morning.
 */

/** The four Amber named. Matched on the column's name, not on a per-board list. */
const SHUT_BY_DEFAULT = new Set([
  "completed",
  "complete",
  "closed",
  "cancelled",
  "acquisition & development"
]);

/**
 * Remembered per person, per board, per column.
 *
 * Every read and write is wrapped for the reason `CollapsiblePanel` gives: a private
 * window, cleared site data or a browser set to block storage make `localStorage` throw
 * on ACCESS rather than return null, and an exception here would take the board down.
 */
/* The Tasks board's group keys carry a deliberate NUL prefix — `const NONE = "\0none"`,
   so a group key can never collide with a real value. Stripped here so a storage key and
   an aria-label never carry a control character. */
const clean = (s: string) => s.replace(/[\u0000-\u001f]/g, "");
const KEY = (board: string, column: string) => `board-col:${board}:${clean(column)}`;
const remembered = (board: string, column: string): boolean | null => {
  try {
    const v = localStorage.getItem(KEY(board, column));
    return v === null ? null : v === "shut";
  } catch { return null; }
};
const remember = (board: string, column: string, shut: boolean) => {
  try { localStorage.setItem(KEY(board, column), shut ? "shut" : "open"); } catch { /* not important enough to fail on */ }
};

export function BoardColumn({
  board,
  name,
  label,
  grouping,
  count,
  empty,
  accent,
  head,
  children,
  ...drag
}: {
  /** Which board this is, so one page's columns do not remember another's. */
  board: string;
  /** The column's own value — what the default-shut rule matches on, and the storage key. */
  name: string;
  /** What the head reads, when it differs from `name` (Tasks labels its status keys). */
  label?: ReactNode;
  /** The eyebrow above the label — "Stage", "Status". `None` when the board is ungrouped. */
  grouping: string;
  count: number;
  /** "No jobs" / "No projects" / "No tasks" — said in the board's own noun. */
  empty: string;
  accent?: CSSProperties;
  /** A head that does more than read, like the Jobs board's drill-down button. */
  head?: ReactNode;
  children?: ReactNode;
  onDragEnter?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}) {
  /** What a person reads and hears: the label where there is one, else the key. */
  const said = clean(typeof label === "string" ? label : name).trim() || "this";

  const [shut, setShut] = useState(() =>
    remembered(board, name) ?? SHUT_BY_DEFAULT.has(clean(name).trim().toLowerCase()));

  // Regrouping replaces every column, and a column that keeps the last one's state shows
  // "Blocked" open because "Completed" was. Keyed on the pair the state belongs to.
  useEffect(() => {
    setShut(remembered(board, name) ?? SHUT_BY_DEFAULT.has(clean(name).trim().toLowerCase()));
  }, [board, name]);

  const toggle = useCallback(() => {
    setShut(was => { remember(board, name, !was); return !was; });
  }, [board, name]);

  return (
    <section
      className={"board-column" + (shut ? " is-shut" : "")}
      style={accent}
      {...drag}
      /* A card dropped on a shut column lands in it AND opens it. Refusing the drop
         because the column is narrow would make collapsing a column a way to stop using
         it, and reopening silently would leave somebody wondering where the card went. */
      onDrop={e => { if (shut) toggle(); drag.onDrop?.(e); }}
    >
      <div className="board-column-head">
        <button
          type="button"
          className="board-column-toggle"
          aria-expanded={!shut}
          aria-label={shut ? `Open the ${said} column` : `Collapse the ${said} column`}
          onClick={toggle}
        >
          <span className={"board-column-chevron" + (shut ? " is-shut" : "")} aria-hidden>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </span>
        </button>

        {/* Shut, the name is written down the strip and the eyebrow goes: "Stage" above a
            vertical "Completed" is two words of rotated text where one is the answer. */}
        {shut ? (
          <span className="board-column-spine" title={`${grouping === "None" ? "" : grouping + ": "}${said}`}>
            <Text type="text2" element="span" weight="medium">{label ?? name}</Text>
          </span>
        ) : head ?? (
          grouping === "None"
            ? <div><Text type="text3" color="secondary">{empty.replace(/^No /, "All ")}</Text></div>
            : (
              <div>
                <Text type="text3" color="secondary">{grouping}</Text>
                <Text type="text2" weight="medium">{label ?? name}</Text>
              </div>
            )
        )}

        {/* Kept when shut — how many are in Completed is the reason to glance at it. */}
        <span className="col-count">{count}</span>
      </div>

      {!shut && (count === 0 ? (
        <div className="board-column-empty">
          <Text type="text3" color="secondary">{empty}</Text>
        </div>
      ) : children)}
    </section>
  );
}
