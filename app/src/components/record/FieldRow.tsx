import type { CSSProperties, ReactNode } from "react";
import "./record.css";

/**
 * One property row: a label column and a typed control, on a 32px line.
 *
 * Built against `component-contracts/FieldRow.d.ts`. Two rules from the handoff do all
 * the work here, and both are about not lying to the reader:
 *
 *   **A field with a type shows its control, not the word "Empty".** An empty date is a
 *   date box reading `dd/mm/yyyy`; an empty pick is a dropdown reading `Select`; an empty
 *   text field reads `Enter text`. "Empty" tells somebody what is missing and not what to
 *   do about it, and a row of the same word six times is a screen nobody reads.
 *
 *   **In a column of controls, every control is the same width and height.** Ragged
 *   right edges make a form look like six unrelated decisions. `FieldList` sets both
 *   widths once, as CSS variables, so a row cannot opt out.
 *
 * THE 460px OVERFLOW, WHICH IS FIXED HERE RATHER THAN REPRODUCED
 *
 *   The supplied 6a screenshot has a horizontal scrollbar, the "Currently with" control
 *   running past the card edge and the SharePoint row clipped. The cause is arithmetic:
 *   a `120px | 1fr` grid inside 16px padding leaves ~308px for a control that has to hold
 *   a name, a role and a chevron — and "Current address" also carries a 28px `+`. So the
 *   drawer's label column is **110px** and the control column is `minmax(0, 1fr)` with
 *   `min-width: 0` on everything inside it, which is what actually stops a grid child
 *   refusing to shrink below its content. The handoff's own review says to fix this
 *   rather than reproduce it (correction 1).
 */

export type FieldType = "text" | "date" | "pick" | "person" | "link";

/** What an empty field of each type says. Never the bare word "Empty". */
const PLACEHOLDER: Record<FieldType, string> = {
  text: "Enter text",
  date: "dd/mm/yyyy",
  pick: "Select",
  person: "Select",
  link: "—"
};

export interface FieldListProps {
  /** `drawer` — 110px labels, controls fill. `page` — 136px labels, 300px controls. */
  variant?: "drawer" | "page";
  children?: ReactNode;
  style?: CSSProperties;
}

/**
 * The column both widths are set on.
 *
 * Once, here, rather than per row — the contract says *"set once via FieldList"* and the
 * reason is the rule above: a row that could set its own width is a row that eventually
 * does.
 *
 * 300px on the page is the README's measured number. The supplied screenshot appears to
 * show the control stretching to the column instead; the written spec is what is
 * followed, and it is one custom property to change if the drawing turns out to be the
 * intention.
 */
export function FieldList({ variant = "drawer", children, style }: FieldListProps) {
  return (
    <div className={`field-list is-${variant}`} style={style}>
      {children}
    </div>
  );
}

export interface FieldRowProps {
  label: string;
  value?: string | null;
  type?: FieldType;
  /** A real control — a Select, a date field, a person picker. Replaces the plain value. */
  children?: ReactNode;
  /** Sits outside the control, on the right: the address row's Crisp Orange `+`. */
  action?: ReactNode;
}

export function FieldRow({ label, value, type, children, action }: FieldRowProps) {
  const empty = value == null || value === "";
  return (
    <div className="field-row-r">
      <div className="field-row-label">{label}</div>
      <div className="field-row-control">
        {children ?? (
          type
            ? (
              // A typed field with nothing in it draws its control and says what to do,
              // which is the whole rule above.
              <span className={"field-box" + (empty ? " is-empty" : "")}>
                {empty ? PLACEHOLDER[type] : value}
              </span>
            )
            // No type means no control: a computed or read-only fact — "Orders stage 1
            // requested · 18/09/2026" — reads as text, not as a box somebody can edit.
            : <span className={"field-plain" + (empty ? " is-empty" : "")}>{empty ? "—" : value}</span>
        )}
      </div>
      {action && <div className="field-row-action">{action}</div>}
    </div>
  );
}
