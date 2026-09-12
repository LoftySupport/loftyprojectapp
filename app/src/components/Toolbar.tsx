import { useEffect, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { Select, toOptions, type SelectOption } from "./Select";
import { DateRangeFilter, parseRange, serialiseRange } from "./DateRange";
import type { SortState } from "./SortableTable";
import "./ui.css";

/**
 * The one toolbar, used by every list screen so the language never drifts.
 *
 * View   Board / Table / Gantt / Calendar
 * Group  Stage / Project / Team / Team member / Status  (Project is dropped on the
 *        project board — a project cannot be grouped by itself)
 * Filter the Group-by fields, always on show, each reading "Any" until chosen — and one
 *        Advanced row holding every other filter at once
 * Sort   any column the screen offers, either direction — in the Advanced row, because
 *        the header click is the fast way and this is the way that works on a board,
 *        a Gantt and a calendar, where there is no header to click
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

/**
 * Below this the toolbar folds into one line — Amber, 12 September, over a screenshot of
 * six stacked dropdowns: *"condense filters for mobile view so they look better. You
 * might be able to just do advanced on mobile"*, and on the Projects board, *"condense
 * these in one line on mobile view"*.
 *
 * 720px is the width the rest of the app already treats as "a phone" (`ui.css` and
 * `AppShell.css` both cut there), and a third breakpoint would be a third thing to keep
 * in step.
 */
const ONE_LINE_BELOW = 720;

/**
 * Matches `@media (max-width: 720px)`, watched rather than read once.
 *
 * Exported because the page heads need the same answer: the create button moves up onto
 * the heading's line at the same width the toolbar folds (Amber, 12 September: *"on
 * mobile view the add new button should be in top right on same line as the header right
 * aligned. We need the most above the fold possible"*). One breakpoint, one hook — two
 * would drift, and the fold would move under one of them.
 */
export function useOneLine(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia(`(max-width: ${ONE_LINE_BELOW}px)`).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${ONE_LINE_BELOW}px)`);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

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
  "Type",
  // Tasks only. A task is not a job: it is held by a person, it is late or it is not,
  // it was written by a workflow or typed in by hand, and it hangs off a record. Those
  // are the five questions asked of the tasks board, so they are its columns.
  "Assignee", "Health", "Record", "Source", "Created by"
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
  "Property", "Recorded", "Number", "Date",
  // Tasks (0102). "Assignee" is a filter here where the jobs board deliberately has
  // none — on a job, Team matches membership and answers "what is my team's" (Amber,
  // 26 Aug); on a task, the assignee IS the record's point, and "who is doing this"
  // cannot be asked of a team.
  "Assignee", "Health", "Source", "External", "Created by", "Due", "Scheduled"
] as const;

/** Fields that are a box you type into rather than a list you choose from. */
const TYPED = new Set<string>(["Number"]);
/**
 * Fields whose control is the app's standard date range picker rather than a dropdown —
 * Amber, 1 Sep: *"this is the default way for every date picker in the app"*. A date is
 * never a list of typed strings, on any screen.
 */
const DATED: Record<string, string> = {
  Date: "Filter by when a job entered its stage",
  Due: "Filter by when a task is due",
  Scheduled: "Filter by when a task is planned to be worked"
};
/** Sequences, not sets — alphabetical would put Cancelled second and "at risk" before "on track". */
const ORDERED = new Set<string>(["Stage", "Job stage", "Process", "Process health", "Health"]);
/** What the box is called, where the field name alone would not say. */
const LABELS: Record<string, string> = {
  Number: "Job or project number",
  Date: "Moved",
  Due: "Due",
  Scheduled: "Scheduled",
  Health: "Health",
  Source: "Raised by",
  External: "Waiting on"
};

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
  orderedFields,
  sortFields,
  sort,
  onSortChange,
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
  /**
   * Fields whose options carry a sequence on THIS screen. `Status` is the case that
   * needs it: a job's status is a set and sorts alphabetically, a task's runs To do →
   * In progress → Blocked → Done → Cancelled, and alphabetical would open that list on
   * "Blocked". One screen's ordering is not the other's, so the screen says.
   */
  orderedFields?: readonly string[];
  /**
   * Sort by any column, on any view (0102). Omitted, no sort control is drawn and the
   * screen sorts by its header clicks alone — which is every board before Tasks.
   */
  sortFields?: readonly SelectOption[];
  sort?: SortState<string> | null;
  onSortChange?: (s: SortState<string> | null) => void;
  count?: string;
  actions?: React.ReactNode;
}) {
  const valueOf = (field: string) => filters.find(f => f.field === field)?.value ?? null;
  /** Set is upsert; clear is remove — so an "Any" filter leaves no trace in the URL. */
  const setValue = (field: string, value: string | null) => {
    const rest = filters.filter(f => f.field !== field);
    onFiltersChange(value ? [...rest, { field, value }] : rest);
  };
  /**
   * On a phone the bar is one line and everything else is behind Advanced.
   *
   * Not a second design: the same controls, in the same order, in the panel that already
   * existed for the rest of them. What the bar keeps is View — which is what the screen
   * IS rather than how it is narrowed — and the button that opens the others.
   */
  const oneLine = useOneLine();
  const advancedActive = advanced.filter(f => valueOf(f)).length;
  // A sort chosen from here counts as advanced too: it is set in that row, and a board
  // in an order nobody can see the reason for is the same "where did my rows go".
  //
  // On one line the button stands for every filter, not just the advanced ones, so it
  // counts every filter — a Status set inside the panel with the button reading "(0)"
  // is the hidden-filter fault the count exists to prevent.
  const advancedSet = (oneLine ? filters.filter(f => f.value).length : advancedActive) + (sort ? 1 : 0);
  // Open from the start when a link arrived with an advanced filter set — a narrowed
  // board whose narrowing is hidden behind a closed row would read as missing jobs.
  const [advancedOpen, setAdvancedOpen] = useState(advancedSet > 0);
  const anySet = filters.some(f => f.value);

  const control = (field: string) => {
    const label = LABELS[field] ?? field;
    if (DATED[field]) {
      // The app's standard date control since 1 September (Amber: *"this is the default
      // way for every date picker in the app"*). The label says WHICH date it is about,
      // because a bare "Date" on a board of jobs reads as a due date and on a board of
      // tasks a due date and a scheduled date are two different questions.
      return (
        <DateRangeFilter
          key={field}
          label={label}
          ariaLabel={DATED[field]}
          value={parseRange(valueOf(field))}
          onChange={v => setValue(field, serialiseRange(v))}
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
          ordered={ORDERED.has(field) || (orderedFields?.includes(field) ?? false)}
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

      {grouping && onGroupingChange && groupings && !oneLine && (
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

      {/* The Group-by fields, as filters — on the bar at a desk, inside Advanced on a
          phone (see `oneLine`). */}
      {!oneLine && primary.map(control)}

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
          Advanced{advancedSet ? ` (${advancedSet})` : ""}
        </Button>
        {/* Clear ALL — the filters and the grouping together. They are one state in
            somebody's head ("stop narrowing this"), and clearing half of it left a
            board still split into columns by whatever was chosen ten minutes ago.
            Shown whenever either is set, so the control appears exactly when it would
            do something. */}
        {(anySet || sort || (grouping && grouping !== "None")) && (
          <Button
            kind="tertiary"
            size="small"
            onClick={() => {
              onFiltersChange([]);
              onGroupingChange?.("None");
              onSortChange?.(null);
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
          {/* On a phone, the grouping and the primary filters live here — first, in the
              order they have on the bar, so the panel reads as the bar folded rather
              than as a different screen. */}
          {oneLine && grouping && onGroupingChange && groupings && (
            <div className="toolbar-field">
              <span className="toolbar-label">Group</span>
              <Select
                className="toolbar-control"
                ordered
                aria-label="Group by"
                options={toOptions(groupings)}
                value={grouping}
                onChange={g => onGroupingChange(g as Grouping)}
              />
            </div>
          )}
          {oneLine && primary.map(control)}
          {advanced.map(control)}

          {/**
            * Sort by any column, and reverse it.
            *
            * The table header click already sorts, and it stays: it is one click and it
            * is where the hand is. This exists because THREE of the four views have no
            * header — a board, a Gantt and a calendar cannot be sorted by clicking
            * something that is not on screen — and because "sort by any property" has to
            * include the properties whose column is switched off in the picker.
            *
            * Direction is a button rather than a second dropdown: it is a two-state
            * thing, and the arrow says which state it is in without being read.
            */}
          {sortFields && sortFields.length > 0 && onSortChange && (
            <div className="toolbar-field">
              <span className="toolbar-label">Sort</span>
              <Select
                className="toolbar-control"
                clearable
                aria-label="Sort by"
                placeholder="Nothing — natural order"
                options={sortFields as SelectOption[]}
                value={sort?.key ?? null}
                onChange={key => onSortChange(key ? { key, direction: sort?.direction ?? "asc" } : null)}
              />
              <Button
                kind="tertiary"
                size="small"
                disabled={!sort}
                aria-label={
                  sort?.direction === "desc" ? "Sorting Z to A — switch to A to Z" : "Sorting A to Z — switch to Z to A"
                }
                onClick={() =>
                  sort && onSortChange({ key: sort.key, direction: sort.direction === "asc" ? "desc" : "asc" })
                }
              >
                {sort?.direction === "desc" ? "↓ Z–A" : "↑ A–Z"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
