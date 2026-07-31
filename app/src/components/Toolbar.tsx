import { useState } from "react";
import { Button, Text } from "@vibe/core";
import { Select, toOptions, type SelectOption } from "./Select";
import "./ui.css";

/**
 * The one toolbar, used by every list screen so the language never drifts.
 *
 * View   Board / Table / Gantt / Calendar
 * Group  Stage / Project / Team / Team member / Status  (Project is dropped on the
 *        project board — a project cannot be grouped by itself)
 * Date   one control holding the whole range, not two fields to keep in step
 * Filter chips you add and remove, each arriving unset so adding one never silently
 *        narrows the result set to whatever happened to be first in its list
 */

export const VIEWS = ["Board", "Table", "Gantt", "Calendar"] as const;
export type View = (typeof VIEWS)[number];

export const GROUPINGS = ["Stage", "Project", "Team", "Team member", "Status"] as const;
export type Grouping = (typeof GROUPINGS)[number];

export const FILTERABLE = ["Stage", "Team", "Team member", "Status", "Type", "Tag"] as const;

export interface ToolbarFilter {
  id: number;
  field: string;
  value: string | null;
}

export function Toolbar({
  views = VIEWS,
  view,
  onViewChange,
  groupings,
  grouping,
  onGroupingChange,
  filters,
  onFiltersChange,
  optionsFor,
  count,
  actions
}: {
  views?: readonly View[];
  view?: View;
  onViewChange?: (v: View) => void;
  groupings?: readonly Grouping[];
  grouping?: Grouping;
  onGroupingChange?: (g: Grouping) => void;
  filters: ToolbarFilter[];
  onFiltersChange: (f: ToolbarFilter[]) => void;
  optionsFor: (field: string) => SelectOption[];
  count?: string;
  actions?: React.ReactNode;
}) {
  const [nextId, setNextId] = useState(1);

  const addFilter = () => {
    const used = filters.map(f => f.field);
    const field = FILTERABLE.find(f => !used.includes(f));
    if (!field) return;
    // Arrives unset. A filter that defaults to its first option looks like it did
    // nothing while quietly hiding most of the board.
    onFiltersChange([...filters, { id: nextId, field, value: null }]);
    setNextId(nextId + 1);
  };

  return (
    <div className="toolbar">
      {view && onViewChange && (
        <div className="toolbar-field">
          <span className="toolbar-label" id="tb-view">View</span>
          <Select
            className="toolbar-control"
            aria-label="View"
            options={toOptions(views)}
            value={view}
            onChange={v => onViewChange(v as View)}
          />
        </div>
      )}

      {grouping && onGroupingChange && groupings && (
        <div className="toolbar-field">
          <span className="toolbar-label">Group</span>
          <Select
            className="toolbar-control"
            aria-label="Group by"
            options={toOptions(groupings)}
            value={grouping}
            onChange={g => onGroupingChange(g as Grouping)}
          />
        </div>
      )}

      <div className="toolbar-field">
        <span className="toolbar-label">Date</span>
        <Select
          className="toolbar-control"
          aria-label="Date range"
          placeholder="Any date"
          clearable
          options={toOptions(["Any date", "Last 30 days", "This quarter", "This year", "Custom range…"])}
          value={null}
          onChange={() => {}}
        />
      </div>

      <div className="toolbar-field filter-chips">
        <span className="toolbar-label">Filter by</span>
        {filters.map(f => (
          <span className="toolbar-field" key={f.id}>
            <Select
              className="toolbar-control"
              clearable
              aria-label={`Filter by ${f.field}`}
              placeholder={`${f.field}: Any`}
              options={optionsFor(f.field)}
              value={f.value}
              onChange={v =>
                onFiltersChange(filters.map(x => (x.id === f.id ? { ...x, value: v } : x)))
              }
            />
            <Button
              kind="tertiary"
              size="small"
              aria-label={`Remove the ${f.field} filter`}
              onClick={() => onFiltersChange(filters.filter(x => x.id !== f.id))}
            >
              ×
            </Button>
          </span>
        ))}
        <Button kind="tertiary" size="small" onClick={addFilter}>
          + Add filter
        </Button>
        {filters.length > 0 && (
          <Button kind="tertiary" size="small" onClick={() => onFiltersChange([])}>
            Clear
          </Button>
        )}
      </div>

      {actions}

      <div className="toolbar-spacer" />
      {count && <Text type="text2" color="secondary">{count}</Text>}
    </div>
  );
}
