import { useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { Select, toOptions, type SelectOption } from "./Select";
import { DateRangeFilter, parseRange, serialiseRange } from "./DateRange";
import "./ui.css";

/**
 * The one toolbar, used by every list screen so the language never drifts.
 *
 * View   Board / Table / Gantt / Calendar
 * Group  Stage / Project / Team / Team member / Status  (Project is dropped on the
 *        project board — a project cannot be grouped by itself)
 * Filter the Group-by fields, always on show, each reading "Any" until chosen — and one
 *        Advanced row holding every other filter at once
 *
 * WHY THE CHIPS WENT (7 September). Filters were chips: "+ Add filter" put the next
 * unused field on the bar as an unset select, and you chose a value, and repeated. Amber:
 * *"filters on jobs and projects should be same as the group ones and then you can add in
 * the extra detail like an advanced not clicking a million times to get new filters up."*
 * She is describing two things. The fields you group by — stage, team, status, process —
 * are the fields you filter by, so they are on the bar from the start, no adding. The
 * rest — a number typed in, the date moved, process health, a property recorded or not —
 * are one Advanced row that opens whole, so the third filter costs the same one click as
 * the first. A filter that is "Any" is not in the URL; a filter with a value is, so the
 * links people paste still carry exactly what narrowed the board.
 */

export const VIEWS = ["Board", "Table", "Gantt", "Calendar"] as const;
export type View = (typeof VIEWS)[number];

/**
 * "None" first, and it is a real grouping rather than the absence of one (Amber, 28 Aug:
 * "the filters on the job board need a clear all option so i don\'t have to see it
 * grouped by anything"). A board grouped by nothing is one list, which is what somebody
 * scanning for a single job actually wants — the columns are an answer to "how is the
 * work distributed", not to "where is 1042-003".
 */
export const GROUPINGS = [
  "None", "Stage", "Project", "Team", "Team member", "Status",
  // Projects only, and the one pair that puts a record in MORE THAN ONE column: a
  // project appears wherever its jobs are, carrying the jobs that put it there.
  // Amber, 3 Sep: "if jobs are in multijple stages then you show the project card
  // multple times and the jobs split to the different stages".
  "Job stage", "Job process",
  // Jobs only. The columns become the processes of the stages in view, in the order a
  // job passes through them — Amber, 3 Sep: "it moves through the process in lifecycle
  // stage order, then process stage order". See data/pipelinePosition.ts.
  "Process",
  // Projects only — the jobs board never offers it, because a job's type is its
  // project's and grouping by it would just be grouping by project one level up.
  "Type"
] as const;
export type Grouping = (typeof GROUPINGS)[number];

/**
 * Only fields the data actually carries.
 *
 * "Team member", "Type" and "Tag" were dropped when nothing on a job held them —
 * a control that lies about what it does is worse than one that is missing. Type is
 * back (G47): the project's type rides every job through job_display, so filtering on
 * it narrows for real. Tag returns with tag wiring; there is deliberately no separate
 * Team-member filter — the Team filter matches membership (Amber, 26 Aug).
 */
export const FILTERABLE = [
  "Stage", "Job stage", "Team", "Status", "Type", "Project", "Process", "Process health",
  "Property", "Recorded", "Number", "Date"
] as const;

/** Fields that are a box you type into rather than a list you choose from. */
const TYPED = new Set<string>(["Number"]);
/** Sequences, not sets — alphabetical would put Cancelled second and "at risk" before "on track". */
const ORDERED = new Set<string>(["Stage", "Job stage", "Process", "Process health"]);
/** What the box is called, where the field name alone would not say. */
const LABELS: Record<string, string> = { Number: "Job or project number", Date: "Moved" };

/** `field` is the identity — a field appears at most once, so a separate id is a second
 *  way to say the same thing, and the query string keys off the field anyway. */
export interface ToolbarFilter {
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
  primary,
  advanced,
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
  /** The filters on the bar from the start — the same fields the board groups by. */
  primary: readonly string[];
  /** The rest, in the Advanced row. Every one is drawn at once when the row is open. */
  advanced: readonly string[];
  count?: string;
  actions?: React.ReactNode;
}) {
  const valueOf = (field: string) => filters.find(f => f.field === field)?.value ?? null;
  /** Set is upsert; clear is remove — so an "Any" filter leaves no trace in the URL. */
  const setValue = (field: string, value: string | null) => {
    const rest = filters.filter(f => f.field !== field);
    onFiltersChange(value ? [...rest, { field, value }] : rest);
  };
  const advancedActive = advanced.filter(f => valueOf(f)).length;
  // Open from the start when a link arrived with an advanced filter set — a narrowed
  // board whose narrowing is hidden behind a closed row would read as missing jobs.
  const [advancedOpen, setAdvancedOpen] = useState(advancedActive > 0);
  const anySet = filters.some(f => f.value);

  const control = (field: string) => {
    const label = LABELS[field] ?? field;
    if (field === "Date") {
      // The app's standard date control since 1 September (Amber: *"this is the default
      // way for every date picker in the app"*). It filters on `job_stage_entered_at`,
      // the one real date every job carries; the label says which date it is about,
      // because a bare "Date" on a board of jobs reads as a due date.
      return (
        <DateRangeFilter
          key={field}
          label={label}
          ariaLabel="Filter by when a job entered its stage"
          value={parseRange(valueOf("Date"))}
          onChange={v => setValue("Date", serialiseRange(v))}
        />
      );
    }
    if (TYPED.has(field)) {
      return (
        <div className="toolbar-field" key={field}>
          <span className="toolbar-label">{label}</span>
          <TextField
            className="toolbar-text"
            size="small"
            id={`filter-${field.toLowerCase()}`}
            inputAriaLabel={`Filter by ${label.toLowerCase()}`}
            placeholder="e.g. 1042-003"
            value={valueOf(field) ?? ""}
            onChange={v => setValue(field, v.trim() ? v : null)}
          />
        </div>
      );
    }
    return (
      <div className="toolbar-field" key={field}>
        <span className="toolbar-label">{label}</span>
        <Select
          className="toolbar-control"
          clearable
          ordered={ORDERED.has(field)}
          aria-label={`Filter by ${label.toLowerCase()}`}
          placeholder="Any"
          options={optionsFor(field)}
          value={valueOf(field)}
          onChange={v => setValue(field, v)}
        />
      </div>
    );
  };

  return (
    <div className="toolbar">
      {view && onViewChange && (
        <div className="toolbar-field">
          <span className="toolbar-label" id="tb-view">View</span>
          <Select
            className="toolbar-control"
            ordered
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
            /* None, Stage, Project, Team, Team member, Status, Process — authored in
               the order people reach for them, with the two commonest first. */
            ordered
            aria-label="Group by"
            options={toOptions(groupings)}
            value={grouping}
            onChange={g => onGroupingChange(g as Grouping)}
          />
        </div>
      )}

      {/* The Group-by fields, as filters, always here. */}
      {primary.map(control)}

      <div className="toolbar-field filter-chips">
        <Button
          kind="tertiary"
          size="small"
          className={"toolbar-advanced-btn" + (advancedOpen ? " is-on" : "")}
          aria-expanded={advancedOpen}
          aria-controls="toolbar-advanced"
          onClick={() => setAdvancedOpen(o => !o)}
        >
          {/* The count says an advanced filter is narrowing the board even when the
              row is folded away — a hidden filter is how "where did my jobs go" starts. */}
          Advanced{advancedActive ? ` (${advancedActive})` : ""}
        </Button>
        {/* Clear ALL — the filters and the grouping together. They are one state in
            somebody's head ("stop narrowing this"), and clearing half of it left a
            board still split into columns by whatever was chosen ten minutes ago.
            Shown whenever either is set, so the control appears exactly when it would
            do something. */}
        {(anySet || (grouping && grouping !== "None")) && (
          <Button
            kind="tertiary"
            size="small"
            onClick={() => {
              onFiltersChange([]);
              onGroupingChange?.("None");
            }}
          >
            Clear all
          </Button>
        )}
      </div>

      {actions}

      <div className="toolbar-spacer" />
      {count && (
        <>
          <Text type="text2" color="secondary">{count}</Text>
          {/* G48 — the same sentence, announced. Filtering was silent to a screen
              reader; role=status makes count changes audible without a focus move. */}
          <span role="status" aria-live="polite" className="visually-hidden">{count}</span>
        </>
      )}

      {/* Every advanced filter at once, on its own row under the first. Not one at a
          time: the whole complaint was the clicking. */}
      {advancedOpen && (
        <div className="toolbar-advanced" id="toolbar-advanced">
          {advanced.map(control)}
        </div>
      )}
    </div>
  );
}
