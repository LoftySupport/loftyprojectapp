import "./ui.css";

/**
 * A value that will come from Supabase, shown as the column it will come from.
 *
 * An empty field tells you nothing about what a record looks like; `{{jobs.address}}`
 * in the place the address will sit tells you the shape, and doubles as the binding
 * checklist. Every one of these disappears on its own when its table comes online.
 */
export function Token({ children }: { children: string }) {
  return <span className="sb-token">{`{{${children}}}`}</span>;
}
