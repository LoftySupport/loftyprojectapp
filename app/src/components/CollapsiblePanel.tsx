import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Text } from "@vibe/core";

/**
 * A `.panel` whose heading collapses it.
 *
 * Amber, 7 September: the job drawer *"looks terrible … the way it worked in the prototype
 * was better, but having collapsable states for headings (accordions) for properties or
 * comments or tasks"*. Docked, the drawer stacks eleven panels into one column — numbers,
 * who it's with, folders, phase, processes, documents, project properties, job properties,
 * tasks, maintenance, comments — so finding the one you came for means scrolling past ten
 * you did not.
 *
 * THE SUMMARY STAYS VISIBLE WHEN CLOSED, and that is the point of doing this rather than
 * just hiding things. Every one of these panels already puts a count opposite its title —
 * "3 of 5 done · 1 overdue", "4 updates", "12 of 18 filled". Collapsed, that line is the
 * whole value: you can see whether a section wants attention without opening it. An
 * accordion that hides the count too would make the drawer shorter and less useful, which
 * is a worse trade than the scroll.
 *
 * WHY THE STATE IS REMEMBERED. A drawer that reopens with everything shut is as annoying as
 * one that reopens with everything open — the sections somebody uses are the sections they
 * use every time. `open:<id>` in localStorage, read once on mount, so a person's own layout
 * survives navigating between jobs and reloading. It is a per-viewer convenience and
 * nothing depends on it: every read and write is wrapped, because a private window, cleared
 * site data, or a browser set to block storage all make `localStorage` throw on ACCESS
 * rather than return null, and an exception here would take the whole drawer down.
 *
 * The head is a real `<button>`, not a div with an onClick: it needs to be reachable by
 * keyboard and to announce its state, and `aria-expanded` on a div announces nothing.
 */

/**
 * "Collapse all" / "Expand all", for the panels inside one `<PanelGroup>`.
 *
 * Amber, 7 September: the drawer is *"a disaster, you can't find anything on it"*. Per-section
 * folding fixes the scroll but not the finding — with nine sections in unknown states you
 * still have to look at each one. Shutting the lot turns the drawer into a nine-line contents
 * page you can read at a glance, which is the thing the reference designs she sent all do.
 *
 * A `seq` counter rather than a boolean: the command has to fire again even when `want` has
 * not changed. Two "collapse all" clicks in a row are two commands, and a plain boolean
 * would make the second one a no-op — leaving any section reopened in between still open.
 */
interface Bulk { seq: number; want: boolean }
const BulkContext = createContext<Bulk | null>(null);

export function PanelGroup({ children }: { children: (bulk: { collapseAll: () => void; expandAll: () => void }) => ReactNode }) {
  const [cmd, setCmd] = useState<Bulk>({ seq: 0, want: true });
  const api = useMemo(() => ({
    collapseAll: () => setCmd(c => ({ seq: c.seq + 1, want: false })),
    expandAll: () => setCmd(c => ({ seq: c.seq + 1, want: true }))
  }), []);
  return <BulkContext.Provider value={cmd}>{children(api)}</BulkContext.Provider>;
}
interface CollapsiblePanelProps {
  /** Stable key for remembering open/closed. Not the visible title — renaming a heading
   *  should not silently reset everybody's layout. */
  id: string;
  title: ReactNode;
  /** The line opposite the title: a count, a hint, a status. Shown open AND closed. */
  summary?: ReactNode;
  /** Whether it starts open the first time this person sees it. */
  defaultOpen?: boolean;
  children: ReactNode;
}

const KEY = (id: string) => `lofty.panel.${id}`;

function remembered(id: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(KEY(id));
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function CollapsiblePanel({ id, title, summary, defaultOpen = true, children }: CollapsiblePanelProps) {
  // Lazy initialiser: reading localStorage on every render is wasted work, and reading it
  // during the first render rather than in an effect avoids a frame of the wrong state.
  const [open, setOpen] = useState(() => remembered(id, defaultOpen));
  const bodyId = useId();

  // If the id changes (a different job's drawer reusing this component), re-read rather
  // than keeping the previous section's state.
  useEffect(() => { setOpen(remembered(id, defaultOpen)); }, [id, defaultOpen]);

  // Collapse-all / expand-all. Skips seq 0, which is the provider's initial value and not a
  // command — obeying it would override every section's remembered state on first paint.
  const bulk = useContext(BulkContext);
  useEffect(() => {
    if (!bulk || bulk.seq === 0) return;
    setOpen(bulk.want);
    try { localStorage.setItem(KEY(id), bulk.want ? "1" : "0"); } catch { /* ignore */ }
  }, [bulk, id]);

  const toggle = useCallback(() => {
    setOpen(prev => {
      const next = !prev;
      try { localStorage.setItem(KEY(id), next ? "1" : "0"); } catch { /* not worth a broken drawer */ }
      return next;
    });
  }, [id]);

  return (
    <section className="panel panel-collapsible">
      <h3 className="panel-head-h">
        <button
          type="button"
          className="panel-toggle"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
        >
          <span className="panel-toggle-chevron" aria-hidden>
            {/* Inline rather than an icon import: it rotates, so it has to be one path
                whose transform is ours to control. */}
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M4 2.5 L8 6 L4 9.5" stroke="currentColor" strokeWidth="1.75"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="panel-toggle-title">
            <Text type="text2" weight="bold" element="span">{title}</Text>
          </span>
          {summary != null && <span className="panel-toggle-summary">{summary}</span>}
        </button>
      </h3>
      {/* Unmounted rather than hidden when closed. These bodies are not cheap — property
          slots, a comment thread, a task list — and `display: none` would keep every one
          of them mounted and re-rendering behind a closed heading. The trade is that
          reopening re-renders, which is the cheaper side. */}
      {open && <div id={bodyId} className="panel-collapsible-body">{children}</div>}
    </section>
  );
}
