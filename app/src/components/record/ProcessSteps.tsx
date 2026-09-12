import { useId, useState, type CSSProperties } from "react";
import { NavigationChevronDown, NavigationChevronRight } from "@vibe/icons";
import { FieldList, FieldRow, type FieldType } from "./FieldRow";
import "./record.css";

/**
 * The process checklist — a Flint 50 card with a Crisp Orange progress bar.
 *
 * Built against `component-contracts/ProcessSteps.d.ts`.
 *
 * **Progress and the step count are DERIVED, never stored.** The contract says it and the
 * handoff says it twice: *"progress and step counts derive from the tick state; never
 * store them twice."* Two numbers for one fact is how a card comes to say "4 of 9" over
 * five ticks — so `done` is the only state, and the bar and the summary are both read off
 * it on every render.
 *
 * TICKING STAMPS TODAY, AND UNTICKING CLEARS IT
 *
 *   The date is a record of when the step was completed, so it is written by the act of
 *   completing it rather than typed. It stays editable afterwards, because the tick often
 *   happens days after the work — but the default is the truth in the commonest case, and
 *   a blank date on a ticked step is a gap somebody has to remember to fill.
 *
 *   The caller does the stamping, not this component: the date has to reach the database
 *   through the repository seam, and a component that generated its own would be a second
 *   place that decides what "today" means.
 */

export interface ProcessStepField {
  label: string;
  value?: string | null;
  type?: FieldType;
}

export interface ProcessStep {
  name: string;
  done?: boolean;
  /** dd/mm/yyyy. Stamped on tick, cleared on untick, editable afterwards. */
  date?: string | null;
  /** Initials. The owner's avatar on the row's right. */
  owner?: string;
  fields?: ProcessStepField[];
}

export interface ProcessStepsProps {
  steps?: ProcessStep[];
  /** The one open step, or null. One at a time — nine open disclosures is not a list. */
  openStep?: number | null;
  onToggleStep?: (index: number, date: string | null) => void;
  onOpenStep?: (index: number | null) => void;
  /** Show only the first N behind a "Show all N steps" control. */
  visible?: number;
  /** False when the reader may not tick — the boxes render disabled rather than absent. */
  canEdit?: boolean;
  style?: CSSProperties;
}

/** dd/mm/yyyy, which is what every date in this app reads as. */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function ProcessSteps({
  steps = [],
  openStep = null,
  onToggleStep,
  onOpenStep,
  visible,
  canEdit = true,
  style
}: ProcessStepsProps) {
  const [showAll, setShowAll] = useState(false);
  const listId = useId();

  if (!steps.length) return null;

  const done = steps.filter(s => s.done).length;
  // Derived, both of them, on every render. See the header.
  const pct = Math.round((done / steps.length) * 100);
  const shown = visible && !showAll ? steps.slice(0, visible) : steps;

  return (
    <div className="process-card" style={style}>
      <div
        className="process-progress"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-label={`${done} of ${steps.length} steps complete`}
      >
        <div className="process-progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <ul className="process-list" id={listId}>
        {shown.map((s, i) => {
          const open = openStep === i;
          const boxId = `${listId}-step-${i}`;
          return (
            <li className="process-step" key={s.name + i}>
              <div className="process-step-row">
                <button
                  type="button"
                  className="process-step-chev"
                  aria-expanded={open}
                  aria-label={open ? `Hide ${s.name} fields` : `Show ${s.name} fields`}
                  onClick={() => onOpenStep?.(open ? null : i)}
                >
                  {open ? <NavigationChevronDown size={16} aria-hidden /> : <NavigationChevronRight size={16} aria-hidden />}
                </button>

                {/* A real checkbox with a real label association — the step name IS the
                    label, which is what the accessibility note in the handoff asks for
                    and what makes the whole name a 36px target. */}
                <input
                  type="checkbox"
                  id={boxId}
                  className="process-step-box"
                  checked={!!s.done}
                  disabled={!canEdit}
                  onChange={e => onToggleStep?.(i, e.target.checked ? today() : null)}
                />
                <label
                  htmlFor={boxId}
                  className={"process-step-name" + (s.done ? " is-done" : "")}
                >
                  {s.name}
                </label>

                <span className={"process-step-date" + (s.done ? "" : " is-due")}>
                  {s.date ?? ""}
                </span>
                {s.owner && <span className="process-step-owner" aria-hidden>{s.owner}</span>}
              </div>

              {open && s.fields && s.fields.length > 0 && (
                <div className="process-step-fields">
                  <FieldList variant="drawer">
                    {s.fields.map(f => (
                      <FieldRow key={f.label} label={f.label} value={f.value} type={f.type} />
                    ))}
                  </FieldList>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {visible && steps.length > visible && !showAll && (
        <button type="button" className="process-more" onClick={() => setShowAll(true)}>
          Show all {steps.length} steps
        </button>
      )}
    </div>
  );
}
