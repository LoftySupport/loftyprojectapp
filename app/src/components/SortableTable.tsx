import { useMemo, useState } from "react";
import "./ui.css";

/**
 * Sorting for the plain `.data-table`s.
 *
 * Not a table component. The tables in this app each render their own cells and there
 * is no reason for them to stop — what they were missing is the one behaviour every
 * list of forty-seven people needs, which is being able to put it in an order.
 *
 * WHERE NULLS GO, AND WHY IT IS NOT "WHEREVER THE COMPARATOR PUTS THEM"
 *
 *   Blanks sort last in **both** directions. Half the columns here are legitimately
 *   empty — a job title nobody has filled in, a person who has never signed in — and
 *   reversing the sort should not fill the top of the screen with the rows carrying
 *   no answer. "Sort by last login, descending" means "who was here most recently",
 *   and the people who have never been here are not the answer to that.
 *
 * Strings compare with `localeCompare` under `numeric`, so "Lot 9" precedes "Lot 10"
 * and "1042-2" precedes "1042-10" — which is the order the numbers in them are said
 * in, and the order a string comparison gets wrong.
 */

export type SortDirection = "asc" | "desc";
export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/** What a column sorts on. Null means "this row has no answer" — see above. */
export type SortValue = string | number | boolean | null | undefined;

const isEmpty = (v: SortValue) => v === null || v === undefined || v === "";

/** Two present values, in ascending order. Blanks are handled by the caller. */
function compare(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}


/**
 * The sort itself, on its own so a grouped table (one tbody per group) can apply it
 * per group while useTableSort keeps serving the flat case. Always a copy — sorting
 * another memo's array in place is where "the order sticks" comes from.
 */
export function sortRows<T, K extends string>(
  rows: T[],
  columns: Record<K, (row: T) => SortValue>,
  sort: SortState<K>
): T[] {
  const read = columns[sort.key];
  if (!read) return rows;
  const out = rows.slice();
  const flip = sort.direction === "asc" ? 1 : -1;
  out.sort((a, b) => {
    const av = read(a);
    const bv = read(b);
    const aEmpty = isEmpty(av);
    const bEmpty = isEmpty(bv);
    // Decided before `flip` is applied, and never multiplied by it: that is the whole
    // mechanism keeping blanks at the bottom of an ascending and a descending sort.
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    return compare(av, bv) * flip;
  });
  return out;
}

export function useTableSort<T, K extends string>(
  rows: T[],
  /** One reader per sortable column, keyed by whatever the header calls it. */
  columns: Record<K, (row: T) => SortValue>,
  initial: SortState<K>
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);

  /** Click a header: the same column reverses, a new column starts ascending. */
  const toggle = (key: K) =>
    setSort(s =>
      s.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );

  return { sorted, sort, toggle };
}

/**
 * A `<th>` that sorts. `aria-sort` is on the cell because that is where assistive
 * technology looks for it; the arrow is `aria-hidden` because it would otherwise be
 * read as a character.
 */
export function SortHeader<K extends string>({
  column,
  label,
  sort,
  onSort,
  className,
  /**
   * A column that carries no comparable value — nothing to sort on, so it renders as a
   * plain heading rather than a button that does nothing when pressed.
   */
  sortable = true,
  ...dragProps
}: {
  column: K;
  label: string;
  sort: SortState<K>;
  onSort: (key: K) => void;
  className?: string;
  sortable?: boolean;
} & React.HTMLAttributes<HTMLTableCellElement> & { draggable?: boolean }) {
  const active = sort.key === column;
  return (
    <th
      className={`${sortable ? "is-sortable" : ""}${className ? ` ${className}` : ""}`.trim() || undefined}
      aria-sort={
        !sortable ? undefined : active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
      }
      scope="col"
      {...dragProps}
    >
      {sortable ? (
        <button
          type="button"
          className="sort-header"
          onClick={() => onSort(column)}
          aria-pressed={active}
          title={`Sort by ${label}`}
        >
          <span>{label}</span>
          <span className="sort-arrow" aria-hidden="true">
            {active ? (sort.direction === "asc" ? "↑" : "↓") : "↑"}
          </span>
        </button>
      ) : label}
    </th>
  );
}
