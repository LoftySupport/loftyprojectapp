import type { ColumnDef } from "../components/TableColumns";
import { formatValue } from "./propertyFormat";
import type { PropertyDef, PropertyOption, PropertyScope, PropertyValueData } from "./types";

/**
 * A table column for every property the reader may see — jobs and projects alike.
 *
 * Amber, 7 September: *"columns should be able to add any property in the job (including
 * project properties as they are inherited by the job) to the column"*. The tables had a
 * fixed list of a dozen columns, all of them real columns on the row; the eighty-odd
 * property definitions — client, pour date, contract sum, the things people actually
 * scan a list for — could be filtered on but never shown side by side.
 *
 * Every active, readable definition becomes a column, OFF by default so the table does
 * not arrive eighty columns wide; the picker is where somebody turns on the four they
 * want, and the layout is remembered per person like every other column. On the jobs
 * table the project-scope properties are offered too, labelled "(project)", because a
 * job inherits them and the drawer already shows them read through.
 *
 * The cell is `formatValue` — the same sentence the drawer and the reports render — so
 * a pour date cannot read one way in the drawer and another in the table. A blank is an
 * em dash on screen and an empty cell in a file, never a stand-in.
 */
export function propertyColumnDefs<T extends { properties: Record<string, PropertyValueData> }>({
  defs, scopes, canRead, optionsByProperty, people, labelScope
}: {
  defs: PropertyDef[];
  /** Which scopes to offer — `["job", "project"]` on the jobs table, `["project"]` on projects. */
  scopes: PropertyScope[];
  canRead: (key: string) => boolean;
  optionsByProperty: Map<string, PropertyOption[]>;
  people: { id: string; name: string }[];
  /** Whether to say which scope a property came from — only worth it when two are mixed. */
  labelScope?: boolean;
}): ColumnDef<T>[] {
  return defs
    .filter(d => d.isActive && d.format !== "unknown" && scopes.includes(d.scope) && canRead(d.key))
    .map(d => {
      const options = optionsByProperty.get(d.key) ?? [];
      const text = (row: T) => formatValue(d, row.properties[d.key] ?? null, options, people);
      const numeric = d.format === "number" || d.format === "currency";
      return {
        key: `prop:${d.key}`,
        label: labelScope && d.scope === "project" ? `${d.label} (project)` : d.label,
        offByDefault: true,
        /**
         * Their own heading in the picker, by scope.
         *
         * Not "Other", which is where they landed the moment the picker grew groups —
         * and with 174 definitions on this database, one ungrouped heading of 174 rows
         * under eleven tidy ones makes the grouping actively worse for the columns it
         * matters most for. Amber, 11 September: *"in the columns you should be able to
         * add any property job or project to the column view"*, which is exactly these.
         *
         * Two headings rather than one, because the jobs table mixes both scopes: a
         * project property shown on a job is READ THROUGH from the project and is the
         * same answer for every job on that site, which is a different kind of fact from
         * the job's own and worth separating before somebody turns on twenty of each.
         */
        group: d.scope === "project" ? "Project properties" : "Job properties",
        className: numeric ? "num" : undefined,
        // Figures and dates sort as what they are; everything else sorts as it reads.
        sort: (row: T) => {
          const v = row.properties[d.key];
          if (!v) return null;
          if (numeric) return v.number ?? null;
          if (d.format === "date") return v.date ?? null;
          if (d.format === "checkbox") return v.bool == null ? null : v.bool ? 1 : 0;
          return text(row) || null;
        },
        cell: (row: T) => text(row) || "—",
        text: (row: T) => text(row) || null
      };
    });
}
