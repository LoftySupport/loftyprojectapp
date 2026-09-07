import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@vibe/core";
import { Bug, Idea } from "@vibe/icons";
import { SidePanel } from "./SidePanel";
import { EMPTY_DRAFT, ReportForm, type ReportDraft } from "./ReportForm";
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

/**
 * Where the unsent draft lives between openings — this tab's session storage.
 *
 * Session, not local: a half-written bug report belongs to the sitting that started it,
 * and turning up in next week's first report would be stranger than being lost. Files
 * cannot go in and are kept in the provider's own state instead, which survives closing
 * the panel and changing pages — the two ways text was being lost — but not a reload.
 */
const DRAFT_KEY = "lofty.report-draft";

function readDraft(): ReportDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY_DRAFT;
    const p = JSON.parse(raw) as Partial<ReportDraft>;
    return {
      kind: p.kind === "idea" ? "idea" : "bug",
      title: typeof p.title === "string" ? p.title : "",
      detail: typeof p.detail === "string" ? p.detail : "",
      onBehalfOf: typeof p.onBehalfOf === "string" ? p.onBehalfOf : "",
      files: []
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

function writeDraft(d: ReportDraft) {
  try {
    const { files: _files, ...words } = d;
    if (!words.title && !words.detail && !words.onBehalfOf && words.kind === "bug") {
      sessionStorage.removeItem(DRAFT_KEY);
    } else {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(words));
    }
  } catch {
    // Storage refused — the draft still lives in state for this page.
  }
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ReportDraft>(readDraft);
  const onDraftChange = useCallback((d: ReportDraft) => { setDraft(d); writeDraft(d); }, []);

  // A suggested kind only lands on a draft with nothing in it yet; a half-written idea
  // is not turned into a bug because the button that reopened it said so.
  const report = useCallback((k?: FeedbackKind) => {
    if (k) setDraft(d => (d.title || d.detail ? d : { ...d, kind: k }));
    setOpen(true);
  }, []);
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
        {/* Mounted only while open, and the DRAFT is not: what was typed comes back with
            the panel (Amber, 7 Sep: "it should persist when moving pages"). Sending is
            what clears it — the form resets its draft to empty on success. */}
        {open && (
          <ReportForm
            formId={PANEL_FORM_ID}
            onSent={close}
            onLeave={close}
            draft={draft}
            onDraftChange={onDraftChange}
          />
        )}
      </SidePanel>
    </Ctx.Provider>
  );
}
