import { useEffect, useRef, useState } from "react";
import { Button, Text } from "@vibe/core";
import { download, FORMAT_LABELS, FORMAT_NOUNS, type ExportDocument, type ExportFormat } from "../data/export";
import { useToasts } from "./Toasts";
import { Problem } from "./Form";
import "./ui.css";

/**
 * The one export control, on every screen that shows a list or a report.
 *
 * Amber, 3 September: *"can you add an export to excel, pdf download for all views and
 * reports"*. One component, for the reason the toolbar is one component: two screens
 * with two ways of saying "download this" is somebody learning the app twice, and the
 * second one always ends up exporting something subtly different.
 *
 * `build` IS A FUNCTION, NOT A VALUE, and that is the design. Collecting two hundred
 * jobs into a table on every render of every board — for a menu nobody has opened — is
 * work the screen does not need to do, and the closure also settles the question of
 * *when* the snapshot is taken: at the click, from the state on screen at that moment.
 *
 * WHAT IT PROMISES, SAID OUT LOUD IN THE MENU. The download is what you are looking at:
 * the search, the filters, the sort and the columns you have switched on. That sentence
 * is in the UI rather than only in this comment because the alternative reading — "the
 * export is everything" — is the one somebody assumes, and they assume it right up until
 * they send a client a spreadsheet of every job in the company.
 */
/** Kept in step with `min-width` on `.export-pop` — see `fromRight` below. */
const MENU_WIDTH = 260;

export function ExportMenu({
  build,
  label = "Export",
  /** While the screen is still loading, there is nothing true to put in a file yet. */
  disabled
}: {
  build: () => ExportDocument;
  label?: string;
  disabled?: boolean;
}) {
  const { toast } = useToasts();
  const wrap = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /**
   * Which edge the menu hangs from.
   *
   * Watched happening: on the dictionary the Export button sits at the right-hand end of
   * its toolbar, and a menu anchored to its left edge opened half off the screen — the
   * two items were readable and the line explaining what the download contains was not
   * there at all. A media query cannot fix it, because the trigger's position depends on
   * which toolbar it is in and not on how wide the window is; so it is measured, on
   * open, against the width the menu actually needs.
   */
  const [fromRight, setFromRight] = useState(false);

  // The same dismissal the date picker uses: a click anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    const at = wrap.current?.getBoundingClientRect();
    if (at) setFromRight(at.left + MENU_WIDTH > window.innerWidth);
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (format: ExportFormat) => {
    setProblem(null);
    try {
      const doc = build();
      download(doc, format);
      setOpen(false);
      // A download completes off-screen — in a corner of the browser this app does not
      // own — which is exactly the case the toasts were kept for. Named, because the
      // next question is always which file it was.
      toast(`${doc.title} downloaded as a ${FORMAT_NOUNS[format]}.`);
    } catch (e) {
      // Inline and verbatim, never a toast: an error that dismisses itself after five
      // seconds is an error nobody read. Staying open keeps it next to the button that
      // caused it.
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="toolbar-field export-wrap" ref={wrap}>
      <Button
        kind="tertiary"
        size="small"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {label} ▾
      </Button>

      {open && (
        <div
          className={`export-pop${fromRight ? " is-from-right" : ""}`}
          role="menu"
          aria-label="Download this view"
        >
          {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map(format => (
            <button key={format} type="button" role="menuitem" onClick={() => run(format)}>
              {FORMAT_LABELS[format]}
            </button>
          ))}
          <Text type="text3" color="secondary" element="p" ellipsis={false} className="export-hint">
            Downloads what is on screen — the search, the filters and the columns you have
            switched on.
          </Text>
          {problem && <Problem>{problem}</Problem>}
        </div>
      )}
    </div>
  );
}
