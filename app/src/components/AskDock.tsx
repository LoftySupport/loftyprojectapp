import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Button, Text } from "@vibe/core";
import { Robot } from "@vibe/icons";
import "./ui.css";

/**
 * "Ask Lofty" — the one AI surface, as the prototype settled it: a floating dock,
 * bottom-right, with a scope line (the open record, else everything in view), and an
 * "Ask about this job" callout in the drawer that opens it pre-scoped, because opening
 * from a job is itself the question.
 *
 * NOTHING ANSWERS YET, AND THE DOCK SAYS SO. Amber's Q3 decided the assistant survives;
 * the sequencing (comparison doc G23) is to build it once comments, SLAs and assignment
 * give it real context to assemble — all three landed 26 Aug, so the shell goes in now
 * and the wiring is the next act. The example questions are previews of what it will
 * take, shown disabled: a chip that pretended to answer would be the "45% on track"
 * mistake with a chat UI on it.
 *
 * One assistant, not two — the prototype tried an in-drawer chat pane and removed it.
 * The drawer's callout opens THIS dock.
 */

interface AskDockApi {
  /** Open the dock, optionally scoped to a record — "1042-01", "Project 1042". */
  openAsk: (scope?: string | null) => void;
}

const Ctx = createContext<AskDockApi | null>(null);

export function useAskDock(): AskDockApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useAskDock needs AskDockProvider above it.");
  return api;
}

const EXAMPLE_QUESTIONS = [
  "What needs my attention today?",
  "Summarise this job for a handover",
  "What is overdue, and by how long?"
];

export function AskDockProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<string | null>(null);

  const openAsk = useCallback((s?: string | null) => {
    setScope(s ?? null);
    setOpen(true);
  }, []);

  const api = useMemo(() => ({ openAsk }), [openAsk]);

  return (
    <Ctx.Provider value={api}>
      {children}

      {open && (
        <aside className="ask-dock" role="dialog" aria-label="Ask Lofty">
          <div className="ask-dock-head">
            <div>
              <Text type="text2" weight="bold">Ask Lofty</Text>
              <Text type="text3" color="secondary" element="div" ellipsis={false}>
                {scope ? `About ${scope}` : "About everything you can see"}
              </Text>
            </div>
            <Button kind="tertiary" size="small" onClick={() => setOpen(false)} aria-label="Close Ask Lofty">
              ×
            </Button>
          </div>

          <div className="ask-dock-body">
            <Text type="text2" color="secondary" ellipsis={false}>
              Coming soon. Lofty will answer from the records you can see — the job&apos;s
              stage and SLA, who holds it, its latest updates. Nothing answers yet, so the
              examples below are a preview, not buttons.
            </Text>
            <div className="ask-dock-chips" aria-hidden>
              {EXAMPLE_QUESTIONS.map(q => (
                <span className="ask-dock-chip" key={q}>{q}</span>
              ))}
            </div>
          </div>

          <div className="ask-dock-input">
            <input type="text" disabled placeholder="Ask about your jobs — coming soon" aria-label="Ask Lofty (coming soon)" />
          </div>
        </aside>
      )}

      <button
        type="button"
        className="ask-fab"
        aria-label={open ? "Close Ask Lofty" : "Open Ask Lofty"}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openAsk(scope))}
      >
        <Robot size={22} aria-hidden />
      </button>
    </Ctx.Provider>
  );
}
