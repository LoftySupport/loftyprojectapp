import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Text } from "@vibe/core";
import { Robot } from "@vibe/icons";
import { Tooltip } from "@vibe/tooltip";
import { SidePanel } from "./SidePanel";
import "./ui.css";

/**
 * "Ask Lofty" — the one AI surface, and now in the one place side work happens.
 *
 * IT USED TO FLOAT, AND THAT WAS THE BUG. The prototype's shape was a dock pinned
 * bottom-right, so it sat over whatever was underneath — which, with the job drawer
 * open, was the Save button (Amber, 28 Aug: "the ai button at the bottom of the screen
 * covers the save button… can we move the Ask AI button as an icon next to notification
 * bell instead and it has the sidebar mechanism same as everything else"). A floating
 * layer cannot be laid out around; anything it lands on is unreachable.
 *
 * So the trigger is an icon in the header beside the bell — where the app already puts
 * "things about you rather than about this record" — and the panel is `SidePanel`, the
 * same shell as the drawer and the create forms: same remembered width, same drag edge,
 * same Escape, same expand. Nothing new to learn, and nothing covered.
 *
 * NOTHING ANSWERS YET, AND THE PANEL SAYS SO. Amber's Q3 decided the assistant survives;
 * the sequencing (comparison doc G23) is to build it once comments, SLAs and assignment
 * give it real context to assemble. The example questions are previews of what it will
 * take, shown disabled: a chip that pretended to answer would be the "45% on track"
 * mistake with a chat UI on it.
 *
 * One assistant, not two — the prototype tried an in-drawer chat pane and removed it.
 * The drawer's callout opens THIS panel, pre-scoped, because opening from a job is
 * itself the question.
 */

interface AskDockApi {
  /** Open the panel, optionally scoped to a record — "1042-01", "Project 1042". */
  openAsk: (scope?: string | null) => void;
  close: () => void;
  open: boolean;
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

/**
 * The header trigger. Rendered by the shell next to the bell rather than by the
 * provider, so its position is a layout decision the shell makes — which is what went
 * wrong with the dock, where the component placed itself and nothing could move it.
 */
export function AskButton() {
  const { open, openAsk, close } = useAskDock();
  return (
    <Tooltip content="Ask Lofty" position="bottom">
      <button
        type="button"
        className="notif-bell-trigger"
        aria-label={open ? "Close Ask Lofty" : "Ask Lofty"}
        aria-expanded={open}
        onClick={() => (open ? close() : openAsk())}
      >
        <Robot size={20} aria-hidden />
      </button>
    </Tooltip>
  );
}

export function AskDockProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<string | null>(null);

  const openAsk = useCallback((s?: string | null) => {
    setScope(s ?? null);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const api = useMemo(() => ({ openAsk, close, open }), [openAsk, close, open]);

  return (
    <Ctx.Provider value={api}>
      {children}

      <SidePanel open={open} title="Ask Lofty" onClose={close}>
        <div className="ask-body">
          {/* What it would be answering about, said before anything is asked — the dock
              carried this under its title and it is the one line that makes the scope
              of an answer checkable rather than assumed. */}
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            {scope ? `About ${scope}` : "About everything you can see"}
          </Text>

          <Text type="text2" color="secondary" element="p" ellipsis={false}>
            Coming soon. Lofty will answer from the records you can see — the job&apos;s
            stage and SLA, who holds it, its latest updates. Nothing answers yet, so the
            examples below are a preview, not buttons.
          </Text>

          <div className="ask-chips" aria-hidden>
            {EXAMPLE_QUESTIONS.map(q => (
              <span className="ask-chip" key={q}>{q}</span>
            ))}
          </div>

          <div className="ask-input">
            <input
              type="text"
              disabled
              placeholder="Ask about your jobs — coming soon"
              aria-label="Ask Lofty (coming soon)"
            />
          </div>
        </div>
      </SidePanel>
    </Ctx.Provider>
  );
}
