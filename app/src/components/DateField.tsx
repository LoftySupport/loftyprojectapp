// app/src/components/DateField.tsx
import { useRef } from "react";
import "./ui.css";

/**
 * A date you can take back.
 *
 * Amber, 12 September: *"when you are on a date field the reset button isn't working —
 * for example on a job if I hit the completion date by accident you can't undo it. You
 * should be able to x it out."*
 *
 * WHY A BARE `<input type="date">` IS NOT ENOUGH
 *
 *   The browser's own clear is not a promise. Chrome on a desktop draws a small ✕ inside
 *   the field; Safari draws nothing; on a phone the control is a wheel picker with no way
 *   back to empty at all. So a date set by accident is a date you are stuck with — which
 *   is what she hit on the job record, where Completion date had no other way out.
 *
 *   The record's other date-shaped fields DO have one, and that is the tell: a property
 *   of format `date` carries a tick box beside it, and unticking clears the value. The
 *   job's completion date is a column rather than a property, so it never got one.
 *
 * THE EMPTY VALUE HAS TO REACH THE CALLER
 *
 *   Clearing is `onChange(null)`, and the input's own empty string is `null` too. That
 *   second half matters: `PropertyField` guarded its date with `if (e.target.value)`, so
 *   somebody using Chrome's built-in ✕ watched the field empty itself and the value stay
 *   exactly where it was. A control that swallows an empty value is a control that lies
 *   about what it did.
 */

export function DateField({
  value,
  onChange,
  ariaLabel,
  disabled = false,
  className
}: {
  /** `yyyy-mm-dd`, or null for empty. */
  value: string | null;
  /** Null when cleared — by the ✕ or by the browser's own control. */
  onChange: (value: string | null) => void;
  ariaLabel: string;
  disabled?: boolean;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <span className={"date-field" + (className ? ` ${className}` : "")}>
      <input
        ref={input}
        type="date"
        className="date-field-input"
        aria-label={ariaLabel}
        value={value ?? ""}
        disabled={disabled}
        onChange={e => onChange(e.target.value || null)}
      />
      {/* Only when there is something to clear. A ✕ over an empty field is a control that
          does nothing, and the row shifts by 28px the first time somebody picks a date —
          so the button's box is reserved either way, and only its contents come and go. */}
      <button
        type="button"
        className={"date-field-clear" + (value && !disabled ? "" : " is-hidden")}
        aria-label={`Clear ${ariaLabel}`}
        tabIndex={value && !disabled ? 0 : -1}
        aria-hidden={value && !disabled ? undefined : true}
        onClick={() => {
          onChange(null);
          // Focus goes back to the field rather than nowhere: the commonest reason to
          // clear a date is to type a different one.
          input.current?.focus();
        }}
      >
        ×
      </button>
    </span>
  );
}
