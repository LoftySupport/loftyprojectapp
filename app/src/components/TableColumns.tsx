import { useCallback, useMemo, useState } from "react";
import {
  Button, Modal, ModalBasicLayout, ModalContent, ModalFooter, ModalHeader, Text
} from "@vibe/core";
import { SortHeader, type SortState, type SortValue } from "./SortableTable";
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
  /** `num` for right-aligned figures, as the table's own CSS already understands. */
  className?: string;
  /**
   * Cannot be hidden. The identifier only — a table with no job number in it is a
   * table nobody can act on, and every other column is somebody's to decide.
   */
  fixed?: boolean;
  /** Available, but off until somebody asks for it. */
  offByDefault?: boolean;
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
  const shown = all.filter(c => !hidden.has(c.key)).length;

  return (
    <>
      <Button kind="tertiary" size="small" onClick={() => setOpen(true)}>
        Columns ({shown})
      </Button>
      <Modal show={open} onClose={() => setOpen(false)} id="column-picker">
        <ModalBasicLayout>
          <ModalHeader title={title} />
          <ModalContent>
            <Text type="text3" color="secondary" element="p" ellipsis={false}>
              Drag a heading on the table to reorder it, or use the arrows here. Your
              layout is remembered and follows you to another device.
            </Text>
            <ul className="column-list">
              {all.map((c, i) => (
                <li key={c.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.key)}
                      disabled={c.fixed}
                      onChange={() => onToggle(c.key)}
                    />
                    <span>{c.label}</span>
                    {/* Said out loud rather than left as a disabled box nobody can
                        explain — a control that refuses without a reason reads as
                        broken. */}
                    {c.fixed && <Text type="text3" color="secondary" element="span">always shown</Text>}
                  </label>
                  <span className="column-move">
                    <Button kind="tertiary" size="small" disabled={i === 0}
                      aria-label={`Move ${c.label} left`}
                      onClick={() => onMoveBy(c.key, -1)}>←</Button>
                    <Button kind="tertiary" size="small" disabled={i === all.length - 1}
                      aria-label={`Move ${c.label} right`}
                      onClick={() => onMoveBy(c.key, 1)}>→</Button>
                  </span>
                </li>
              ))}
            </ul>
          </ModalContent>
        </ModalBasicLayout>
        {/* Outside ModalBasicLayout, which is where Vibe renders a footer from — inside
            it, the buttons simply do not appear. Watched: the dialog shipped with no
            way out but the X until this moved. */}
        <ModalFooter
          primaryButton={{ text: "Done", onClick: () => setOpen(false) }}
          secondaryButton={{
            text: "Reset to default", disabled: isDefault, onClick: onReset
          }}
        />
      </Modal>
    </>
  );
}
