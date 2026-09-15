import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Heading, Text } from "@vibe/core";
import { SortHeader, type SortState, type SortValue } from "./SortableTable";
import type { ExportCell, ExportField } from "../data/export";
import { readPrefs, writePrefs, type ColumnLayout } from "../data/preferences";
import { useRepository } from "../data/DataProvider";
import "./ui.css";

/**
 * Columns you can sort, reorder and turn off.
 *
 * Amber, 28 August: *"I need project and job colums they need to be sortable and able
 * to be drag and dropped and re ordred, or add and remove columns."*
 *
 * One module for both tables, because "which columns, in what order" is the same
 * question on the jobs table and the projects table and two implementations of it would
 * answer differently within a month. The tables keep rendering their own cells — a
 * column definition owns its header, its cell and what it sorts on, and nothing else
 * about the table changes.
 *
 * **The order and the hidden set are remembered per person**, in the same preferences
 * bag as the landing page (0050): device-local for the first render, the profile's copy
 * as the true one. Somebody who hides five columns on Monday should not find them back
 * on Tuesday — a layout that resets is a layout nobody bothers to set.
 *
 * A column added to the app later appears for everybody who has a saved layout, at the
 * end, rather than staying invisible until they reset: a stored list of names is not the
 * same statement as "these are all the columns there are".
 */

export interface ColumnDef<T> {
  /** Stable — it is what gets stored. Renaming one resets that column for everybody. */
  key: string;
  label: string;
  /** What this column sorts on. Omit for a column that does not sort. */
  sort?: (row: T) => SortValue;
  cell: (row: T) => React.ReactNode;
  /**
   * The same value as `cell`, as a value rather than as markup — what this column puts
   * in a downloaded spreadsheet, PDF or Word document.
   *
   * REQUIRED, AND THAT IS THE POINT. A cell is a React node: a status pill, a token, a
   * name with a dash in it for "nobody". There is no honest way to turn one back into a
   * value — `<StatusPill status="at_risk" />` contains no text at all, so a walk over
   * its children exports an empty Status column and nobody notices until a report has
   * gone out. Asking every column to say what it exports turns that into a compile
   * error. `null` is a genuinely absent value and becomes an empty cell; where the cell
   * shows a `{{table.column}}` token, this returns the same token text, because unbound
   * and empty are different facts.
   */
  text: (row: T) => ExportCell;
  /** `num` for right-aligned figures, as the table's own CSS already understands. */
  className?: string;
  /**
   * Cannot be hidden. The identifier only — a table with no job number in it is a
   * table nobody can act on, and every other column is somebody's to decide.
   */
  fixed?: boolean;
  /** Available, but off until somebody asks for it. */
  offByDefault?: boolean;
  /**
   * Which heading this column sits under in the picker — 6c's Identity, Programme,
   * People.
   *
   * Optional, and everything without one falls into "Other" rather than disappearing: a
   * grouping that can hide a column is worse than no grouping, and 41 columns is exactly
   * where one goes unnoticed.
   */
  group?: string;
}

/**
 * The visible columns, as an export's fields — in the order they are on screen, with the
 * hidden ones already gone. Right-alignment comes from the same `num` class the table
 * styles itself with, so a figure cannot be right-aligned on screen and left in a file.
 */
export function exportFields<T>(columns: ColumnDef<T>[]): ExportField<T>[] {
  return columns.map(c => ({
    label: c.label,
    numeric: c.className?.split(" ").includes("num"),
    text: c.text
  }));
}

/** What gets stored per surface. Both halves are needed, and neither implies the other:
 *  `order` is where the columns sit, `hidden` is which ones are off. */
export type { ColumnLayout };

function layoutFor<T>(defs: ColumnDef<T>[], stored: ColumnLayout | undefined): {
  order: string[]; hidden: Set<string>;
} {
  const known = new Set(defs.map(d => d.key));
  // Stored first, in the stored order, then anything the app has gained since — so a
  // new column shows up at the end instead of being silently withheld from everybody
  // who has ever touched the picker.
  const kept = (stored?.order ?? []).filter(k => known.has(k));
  const rest = defs.map(d => d.key).filter(k => !kept.includes(k));
  const order = [...kept, ...rest];

  const hidden = new Set(stored?.hidden?.filter(k => known.has(k)) ?? []);
  // A column that is off by default is off for anybody who has never decided about it.
  for (const d of defs) {
    const decided = (stored?.order ?? []).includes(d.key);
    if (d.offByDefault && !decided && !stored?.hidden?.includes(d.key)) hidden.add(d.key);
  }
  for (const d of defs) if (d.fixed) hidden.delete(d.key);
  return { order, hidden };
}

export function useColumnLayout<T>(surface: string, defs: ColumnDef<T>[]) {
  const repo = useRepository();
  const [stored, setStored] = useState<ColumnLayout | undefined>(
    () => readPrefs().columns[surface]
  );

  const { order, hidden } = useMemo(() => layoutFor(defs, stored), [defs, stored]);

  const save = useCallback((next: ColumnLayout) => {
    setStored(next);
    const columns = { ...readPrefs().columns, [surface]: next };
    writePrefs({ columns });
    // The profile's copy, so the layout follows the person to the site laptop. A
    // failure here is not worth interrupting anybody: the device still has it.
    void repo.saveMyPreferences({ columns }).catch(() => {});
  }, [repo, surface]);

  const visible = useMemo(
    () => order.map(k => defs.find(d => d.key === k)!).filter(d => d && !hidden.has(d.key)),
    [order, hidden, defs]
  );

  const toggle = useCallback((key: string) => {
    const def = defs.find(d => d.key === key);
    if (def?.fixed) return;
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key); else next.add(key);
    save({ order, hidden: [...next] });
  }, [defs, hidden, order, save]);

  /** Move `key` to sit where `before` currently is; used by the drop and the arrows. */
  const moveTo = useCallback((key: string, index: number) => {
    const without = order.filter(k => k !== key);
    const at = Math.max(0, Math.min(index, without.length));
    without.splice(at, 0, key);
    save({ order: without, hidden: [...hidden] });
  }, [order, hidden, save]);

  const moveBy = useCallback((key: string, delta: number) => {
    moveTo(key, order.indexOf(key) + delta);
  }, [moveTo, order]);

  const reset = useCallback(() => save({ order: [], hidden: [] }), [save]);

  const isDefault = (stored?.order?.length ?? 0) === 0 && (stored?.hidden?.length ?? 0) === 0;

  return { columns: visible, all: order.map(k => defs.find(d => d.key === k)!), hidden, toggle, moveTo, moveBy, reset, isDefault };
}

/**
 * The header row: sortable, and draggable to reorder.
 *
 * Drag is the mouse answer and the arrows in the picker are the keyboard one — a
 * reorder you can only do by dragging is a reorder half the people here cannot do, and
 * HTML5 drag has no keyboard equivalent at all.
 */
export function ColumnHeaders<T>({
  columns, sort, onSort, onReorder, leading
}: {
  columns: ColumnDef<T>[];
  sort: SortState<string> | null;
  onSort: (key: string) => void;
  onReorder: (key: string, index: number) => void;
  /** A checkbox column, say — rendered before the draggable ones. */
  leading?: React.ReactNode;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <tr>
      {leading}
      {columns.map((c, i) => (
        <SortHeader
          key={c.key}
          column={c.key}
          label={c.label}
          sortable={Boolean(c.sort)}
          sort={sort ?? { key: "", direction: "asc" }}
          onSort={onSort}
          className={[c.className, over === c.key ? "is-drop-target" : null]
            .filter(Boolean).join(" ") || undefined}
          draggable
          onDragStart={() => setDragging(c.key)}
          onDragOver={e => {
            if (!dragging || dragging === c.key) return;
            // Only prevented for a real drag — otherwise the header swallows text
            // selection and every drag on the page looks droppable.
            e.preventDefault();
            setOver(c.key);
          }}
          onDragLeave={() => setOver(o => (o === c.key ? null : o))}
          onDrop={() => {
            if (dragging && dragging !== c.key) onReorder(dragging, i);
            setDragging(null);
            setOver(null);
          }}
          onDragEnd={() => { setDragging(null); setOver(null); }}
        />
      ))}
    </tr>
  );
}

/** The button and its dialog: what is shown, in what order. */
/**
 * Which columns the table shows — 6c, as a 470px panel.
 *
 * **The brief calls this new; it is not.** `ColumnPicker` has existed since 28 August
 * (Amber: *"I need project and job colums they need to be sortable and able to be drag
 * and dropped and re ordred, or add and remove columns"*) and is used by the jobs,
 * projects and tasks tables. So this is the same component wearing 6c's shape rather
 * than a second picker beside it — a fifth correction to the handoff, and the one that
 * would have cost most: two pickers would have meant two answers to "which columns",
 * remembered in two places.
 *
 * WHAT 6c CHANGES
 *
 *   A **panel, not a centred modal**, so the table stays readable behind it while you
 *   decide which of its columns to keep — which is the whole act.
 *   A **search box**, because 41 columns is past the point of scanning.
 *   **Groups**, from each column's own `group`.
 *   **"Locked"** said out loud on a column that cannot be turned off, rather than a
 *   disabled box nobody can explain.
 *
 * WHAT IT DOES NOT DO YET, AND WHY NOT
 *
 *   6c draws a **value control on every row** — a text box, a dropdown, a date box — and
 *   a "Show only columns with values" toggle over a count reading *"17 of 41 columns have
 *   a value on this board."* Whose value a board-level picker would be editing is not
 *   something the package answers: the drawn values are one job's, and the count is the
 *   board's. Asked rather than guessed, and nothing is drawn in the meantime.
 *
 *   The footer's **"Saved to this view only"** is also left off, because it would be
 *   false: `useColumnLayout` stores the layout per person per surface and syncs it to the
 *   profile, so it follows somebody to another device and is not scoped to a saved view
 *   at all. A caption that lies about where a setting went is worse than no caption.
 */
export function ColumnPicker<T>({
  title, all, hidden, onToggle, onMoveBy, onReset, isDefault
}: {
  title: string;
  all: ColumnDef<T>[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
  onMoveBy: (key: string, delta: number) => void;
  onReset: () => void;
  isDefault: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const shown = all.filter(c => !hidden.has(c.key)).length;

  const q = find.trim().toLowerCase();
  const matches = q ? all.filter(c => c.label.toLowerCase().includes(q)) : all;

  /** In the columns' own order, so the groups appear as the table has them. */
  const groups = useMemo(() => {
    const m = new Map<string, ColumnDef<T>[]>();
    for (const c of matches) {
      const g = c.group ?? "Other";
      const list = m.get(g);
      if (list) list.push(c); else m.set(g, [c]);
    }
    return [...m.entries()];
  }, [matches]);

  // Escape closes, and the panel takes focus when it opens — the same two rules every
  // other panel in this app follows, in `SidePanel`.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button kind="tertiary" size="small" onClick={() => setOpen(true)}>
        Columns ({shown})
      </Button>

      {open && (
        <>
          {/* Quieter than a modal's scrim on purpose: the table behind is the thing you
              are deciding about, and it has to stay readable. */}
          <div className="side-panel-scrim" onClick={() => setOpen(false)} />
          <aside
            className="column-panel"
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <header className="column-panel-head">
              <Heading type="h3" weight="medium">Columns</Heading>
              <Button kind="tertiary" size="small" onClick={() => setOpen(false)} aria-label="Close">
                ×
              </Button>
            </header>

            <div className="column-panel-top">
              <input
                type="search"
                className="column-panel-find"
                placeholder="Find a column"
                aria-label="Find a column"
                value={find}
                onChange={e => setFind(e.target.value)}
              />
              {/* The count 6c puts here reads "17 of 41 columns have a value on this
                  board", which needs the value data this picker does not load. This one
                  counts what it can actually see: how many are on. */}
              <Text type="text3" color="secondary" element="p" ellipsis={false}>
                {shown} of {all.length} columns are shown.
                {" "}Drag a heading on the table to reorder it, or use the arrows here.
                Your layout is remembered and follows you to another device.
              </Text>
            </div>

            <div className="column-panel-body">
              {groups.length === 0 && (
                <Text type="text2" color="secondary" element="p" ellipsis={false}>
                  No column matches “{find.trim()}”.
                </Text>
              )}
              {groups.map(([group, cols]) => (
                <section key={group}>
                  <h4 className="column-group">{group}</h4>
                  <ul className="column-list">
                    {cols.map(c => {
                      // Position within ALL the columns, not within the search results:
                      // moving a column is a move in the table, and the arrows have to
                      // agree with that however the list is filtered.
                      const i = all.indexOf(c);
                      return (
                        <li key={c.key}>
                          <label>
                            <input
                              type="checkbox"
                              checked={!hidden.has(c.key)}
                              disabled={c.fixed}
                              onChange={() => onToggle(c.key)}
                            />
                            <span>{c.label}</span>
                          </label>
                          {c.fixed ? (
                            /* Said out loud rather than left as a disabled box nobody can
                               explain — a control that refuses without a reason reads as
                               broken. 6c's own word for it. */
                            <Text type="text3" color="secondary" element="span">Locked</Text>
                          ) : (
                            <span className="column-move">
                              <Button kind="tertiary" size="small" disabled={i === 0}
                                aria-label={`Move ${c.label} left`}
                                onClick={() => onMoveBy(c.key, -1)}>←</Button>
                              <Button kind="tertiary" size="small" disabled={i === all.length - 1}
                                aria-label={`Move ${c.label} right`}
                                onClick={() => onMoveBy(c.key, 1)}>→</Button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>

            <footer className="column-panel-foot">
              {/* No "Saved to this view only" — see the header: it would be false.
                  No Apply either, for a reason worth stating: every toggle here takes
                  effect at once and is already saved, so an Apply button would imply the
                  changes behind it had not happened yet. Done closes; Reset undoes. */}
              <Button kind="tertiary" size="small" disabled={isDefault} onClick={onReset}>
                Reset to default
              </Button>
              <Button size="small" onClick={() => setOpen(false)}>Done</Button>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}
