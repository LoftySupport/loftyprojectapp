/**
 * What an export IS, before anything decides what file it becomes.
 *
 * One shape for both writers. The alternative — a spreadsheet builder and a PDF builder
 * each reading the screen's own state — is two answers to "what does the jobs table
 * contain", and they drift the first time a column is added.
 *
 * THE RULE THIS SHAPE EXISTS TO KEEP: **an export is what you are looking at.** The
 * rows are the rows after the search, the filters and the sort; the columns are the
 * columns you have left switched on, in the order you dragged them into. A download
 * that quietly returned all 200 jobs when the screen said "Showing 11 of 200" is worse
 * than no download, because the number in the toolbar is the only thing anybody checks
 * it against.
 *
 * A CELL IS `string | number | null`, and `null` means the record has no answer — it
 * becomes an **empty cell**, not a dash and not a zero. The screen writes "—" because a
 * blank table cell reads as a rendering failure; a spreadsheet is the opposite, where a
 * dash in a numeric column is what stops `SUM` working. Where the screen shows a
 * `{{table.column}}` token, the export carries the same token text: the value is not
 * missing, it is unbound, and those are different facts (CLAUDE.md — never fill a gap
 * with a plausible value).
 */

export type ExportCell = string | number | null;

export interface ExportColumn {
  label: string;
  /** Right-aligned in both writers, and written as a number in the spreadsheet. */
  numeric?: boolean;
}

export interface ExportTable {
  /** The sheet name, and the heading over the table in the PDF. */
  name: string;
  /** One line under the heading — what was filtered, or what the figures count. */
  note?: string;
  columns: ExportColumn[];
  rows: ExportCell[][];
}

export interface ExportDocument {
  /** The file name stem and the running head on every PDF page. */
  title: string;
  /** What the reader needs to know about the whole download: the filter, the count. */
  note?: string;
  /** Stamped into both files. Passed in so a check can pin it; defaults to now. */
  takenAt?: Date;
  /** One sheet each in the spreadsheet, one page each in the PDF. */
  tables: ExportTable[];
}

/**
 * A column of an export, from the caller's own row type.
 *
 * `text` is **required**, and that is the point of the type. A cell on screen is a React
 * node — a pill, a token, a button — and there is no honest way to turn one back into a
 * value: `<StatusPill status="at_risk" />` has no text in it at all, so a walk over its
 * children would export an empty column and nobody would notice until a report went out
 * with a blank Status. Making every column say what it exports moves that from a bug you
 * find later to a compile error you fix now.
 */
export interface ExportField<T> {
  label: string;
  numeric?: boolean;
  text: (row: T) => ExportCell;
}

export function tableFromFields<T>(
  name: string,
  fields: ExportField<T>[],
  rows: readonly T[],
  note?: string
): ExportTable {
  return {
    name,
    note,
    columns: fields.map(f => ({ label: f.label, numeric: f.numeric })),
    rows: rows.map(row => fields.map(f => f.text(row)))
  };
}

/** A two-column table of figures — the stat tiles and the bar panels on Reports. */
export function tableOfFigures(
  name: string,
  label: string,
  rows: { key: string; n: number }[],
  note?: string
): ExportTable {
  return {
    name,
    note,
    columns: [{ label }, { label: "Count", numeric: true }],
    rows: rows.map(r => [r.key, r.n])
  };
}

/**
 * `Jobs · at risk` → `lofty-jobs-at-risk-2026-09-03`. The date is in the name because
 * these get mailed around and opened weeks later, and "jobs.xlsx" in a downloads folder
 * is four files with the same name and no way to tell which is this morning's.
 */
export function fileStem(title: string, takenAt: Date): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const day = [
    takenAt.getFullYear(),
    String(takenAt.getMonth() + 1).padStart(2, "0"),
    String(takenAt.getDate()).padStart(2, "0")
  ].join("-");
  return `lofty-${slug || "export"}-${day}`;
}

/** "3 September 2026, 4:12 pm" — spelled out, because 03/09 and 09/03 are both dates. */
export function stamp(takenAt: Date): string {
  return takenAt.toLocaleString(undefined, {
    day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit"
  });
}
