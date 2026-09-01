import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@vibe/core";
import { Bug, Idea } from "@vibe/icons";
import { SidePanel } from "./SidePanel";
import { ReportForm } from "./ReportForm";
import type { FeedbackKind } from "../data/types";
import "./ui.css";

/**
 * Reporting a bug, and suggesting an idea (0052) — the slide-out, and the way any screen
 * asks for it.
 *
 * WHY THE FOOTER, AND NOT A MENU. The moment somebody wants to report a bug is the
 * moment they hit it — on whatever screen they were on, mid-task. A route to a form loses
 * the screen they were looking at; an item three clicks into a menu loses the person.
 *
 * THE FORM ITSELF LIVES IN `ReportForm`, because since 1 September it is also a page of
 * its own at `/report` — a link that can be sent to somebody who cannot get into the app.
 * This file is now the slide-out and the context that opens it, nothing more.
 */

interface FeedbackApi {
  /** Open the form. A kind may be suggested; the form still lets them change it. */
  report: (kind?: FeedbackKind) => void;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useFeedback needs FeedbackProvider above it.");
  return api;
}

/**
 * The two footer controls. Rendered by the shell, so the shell decides where they go.
 *
 * The second link is not decoration: "it is already planned" is the thing this whole
 * feature exists to say, and the person most likely to file a duplicate is the one about
 * to open this form.
 */
export function FeedbackButtons() {
  const { report } = useFeedback();
  const navigate = useNavigate();
  return (
    <>
      <button type="button" className="foot-action" onClick={() => report()}>
        <Bug size={16} aria-hidden />
        Report a bug or request a feature
      </button>
      <button type="button" className="foot-action" onClick={() => navigate("/updates")}>
        <Idea size={16} aria-hidden />
        What's planned
      </button>
    </>
  );
}

/** The id the footer's Send submits, across the SidePanel boundary. */
const PANEL_FORM_ID = "report-panel-form";

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const report = useCallback((_k?: FeedbackKind) => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const api = useMemo(() => ({ report }), [report]);

  return (
    <Ctx.Provider value={api}>
      {children}

      <SidePanel
        open={open}
        title="Report a bug or request a feature"
        onClose={close}
        footer={
          <>
            {/* `requestSubmit()` rather than a callback: the footer is rendered outside
                the form, and this drives the form's real submit path — the same one the
                page's own Send uses — so the guards live in one place. Vibe's Button has
                no `form` prop, which is what rules out the plain HTML version. */}
            <Button onClick={() => {
              const el = document.getElementById(PANEL_FORM_ID);
              if (el instanceof HTMLFormElement) el.requestSubmit();
            }}>Send</Button>
            <Button kind="tertiary" onClick={close}>Cancel</Button>
          </>
        }
      >
        {/* Mounted only while open, so every opening starts from a blank form rather than
            from whatever the last person typed and abandoned. */}
        {open && <ReportForm formId={PANEL_FORM_ID} onSent={close} />}
      </SidePanel>
    </Ctx.Provider>
  );
}
