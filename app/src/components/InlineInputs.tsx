import { useEffect, useState } from "react";
import { Text } from "@vibe/core";
import "./processes.css";

/**
 * The two inputs every Setup editor is made of: a text box and a number box that each
 * commit ON BLUR (or Enter), so one edit is one write and the database's answer comes
 * back once rather than per keystroke.
 *
 * They lived twice — once in Setup → Processes, once in Setup → Properties — under
 * different names with slightly different props, which is exactly the drift `Form.tsx`
 * warns about. One copy now, and both pages import it.
 *
 * Blank in a NumberInput commits NULL, never 0: an unset duration is a real state and
 * it is not "zero days".
 */

export function BlurText({ value, label, onCommit, disabled, wide, plain, placeholder }: {
  value: string;
  label: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  /** Stretch to the control's full width — descriptions, notes. */
  wide?: boolean;
  /** Read-only renders as text rather than a greyed box. */
  plain?: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  if (disabled && plain) return <Text type="text2" element="span" ellipsis={false}>{value || "—"}</Text>;
  return (
    <input
      className="pf-input"
      style={wide ? { width: "100%" } : undefined}
      aria-label={label}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== value) onCommit(draft); }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}

export function NumberInput({ value, label, onCommit, disabled, small, min }: {
  value: number | null;
  label: string;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  /** The 72px box that sits inside a sentence — "then [ 2 ] days". */
  small?: boolean;
  min?: number;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => { setDraft(value == null ? "" : String(value)); }, [value]);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      className={`pf-input${small ? " dep-lag" : ""}`}
      aria-label={label}
      value={draft}
      disabled={disabled}
      placeholder={small ? "" : "not set"}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const v = draft.trim() === "" ? null : Number(draft);
        if (v !== null && !Number.isFinite(v)) { setDraft(value == null ? "" : String(value)); return; }
        if (v !== value) onCommit(v);
      }}
      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    />
  );
}
