import type { CSSProperties } from "react";
import "./record.css";

/**
 * The record panel's tab strip — Tasks, Comments, Activity Log.
 *
 * Built against `component-contracts/RecordTabs.d.ts`. It sits beside Vibe's own `Tabs`
 * rather than replacing it, which is the design system's instruction: this one is a strip
 * on a Flint 100 ground with the active tab **lifted as a white card** carrying a Crisp
 * Orange underline, and Vibe's is an underline on a white ground. Two different shapes
 * for two different grounds, and using Vibe's here would put an underline on a tinted
 * strip where nothing reads as lifted.
 *
 * The count rides in a pill on the tab rather than in the label, so "Tasks 5" cannot be
 * mistaken for a tab called "Tasks 5" by a screen reader — `aria-label` says
 * "Tasks, 5 items".
 */

export interface RecordTabDef {
  id: string;
  label: string;
  count?: number | string;
}

export interface RecordTabsProps {
  tabs?: RecordTabDef[];
  value?: string;
  onChange?: (id: string) => void;
  /** Right-aligned control on the same line — the thread's "Oldest" / "Newest" toggle. */
  trailing?: React.ReactNode;
  style?: CSSProperties;
}

export function RecordTabs({ tabs = [], value, onChange, trailing, style }: RecordTabsProps) {
  return (
    <div className="record-tabs" style={style}>
      <div className="record-tabs-strip" role="tablist">
        {tabs.map(t => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`record-tab-${t.id}`}
              aria-selected={active}
              aria-controls={`record-panel-${t.id}`}
              // Only the selected tab is in the tab order; the arrow keys move between
              // them, which is what a tablist is supposed to do and what a row of
              // tabbable buttons is not.
              tabIndex={active ? 0 : -1}
              aria-label={t.count !== undefined ? `${t.label}, ${t.count} items` : undefined}
              className={"record-tab" + (active ? " is-active" : "")}
              onClick={() => onChange?.(t.id)}
              onKeyDown={e => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                e.preventDefault();
                const at = tabs.findIndex(x => x.id === value);
                const next = e.key === "ArrowRight"
                  ? (at + 1) % tabs.length
                  : (at - 1 + tabs.length) % tabs.length;
                onChange?.(tabs[next].id);
                document.getElementById(`record-tab-${tabs[next].id}`)?.focus();
              }}
            >
              {t.label}
              {t.count !== undefined && <span className="record-tab-count" aria-hidden>{t.count}</span>}
            </button>
          );
        })}
        {trailing && <span className="record-tabs-trailing">{trailing}</span>}
      </div>
    </div>
  );
}
