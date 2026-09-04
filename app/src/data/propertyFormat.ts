import type { PropertyDef, PropertyOption, PropertyValueData } from "./types";

/**
 * A recorded property value, as a sentence.
 *
 * Lifted out of `components/PropertyField.tsx`, which is where it was written and where
 * its own comment already said what it was for — "the value as a sentence, for tables and
 * reports". The reports arrived (0094, Tools → Template Builder) and could not import it:
 * a widget adapter that pulled in a React component would drag Vibe and React into
 * `npm run check:report-widgets`, which is a plain-Node process on purpose.
 *
 * So it lives in the pure layer now and `PropertyField` re-exports it. There is still ONE
 * implementation, which is the point — a report and the job drawer rendering the same
 * pour date differently is the kind of disagreement nobody notices until a client does.
 */

export function hasValue(def: PropertyDef, v: PropertyValueData): boolean {
  switch (def.format) {
    case "date": return v.date != null;
    case "checkbox": return v.bool != null;
    case "person": return v.profileId != null;
    case "single select": return v.optionKey != null;
    case "multi select": return (v.optionKeys?.length ?? 0) > 0;
    case "number": case "currency": return v.number != null;
    case "unknown": return false;
    default: return v.text != null && v.text !== "";
  }
}

/**
 * The value as a sentence, for tables and reports.
 *
 * Returns "" for a value nobody has recorded, and the caller decides what a blank looks
 * like — the drawer draws an empty slot, a report draws an em dash. Never a stand-in.
 */
export function formatValue(
  def: PropertyDef,
  v: PropertyValueData | null,
  options: PropertyOption[] = [],
  people: { id: string; name: string }[] = []
): string {
  if (!v || !hasValue(def, v)) return "";
  switch (def.format) {
    case "date": return fmtDate(v.date!);
    case "checkbox": return v.bool ? "Yes" : "No";
    // "Someone you cannot see" is not written here: an unresolvable person is an em dash
    // in a document, and the drawer's wording is the drawer's.
    case "person": return people.find(p => p.id === v.profileId)?.name ?? "—";
    case "single select": return options.find(o => o.key === v.optionKey)?.label ?? v.optionKey!;
    case "multi select": return (v.optionKeys ?? []).map(k => options.find(o => o.key === k)?.label ?? k).join(", ");
    case "currency": return fmtMoney(v.number!);
    case "number": return String(v.number);
    default: return v.text ?? "";
  }
}

export const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString();
export const fmtMoney = (n: number) =>
  n.toLocaleString(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
