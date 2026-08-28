import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Button, Text, TextArea, TextField } from "@vibe/core";
import { Bug, Idea } from "@vibe/icons";
import { useRepository } from "../data/DataProvider";
import { useToasts } from "./Toasts";
import { Field, Problem } from "./Form";
import { SidePanel } from "./SidePanel";
import type { FeedbackKind } from "../data/types";
import "./ui.css";

/**
 * Reporting a bug, and suggesting an idea (0052).
 *
 * Amber, 28 Aug: *"an icon for each in the bottom footer that opens a form… Anyone from
 * a viewer up can submit a bug or an idea. Only admins and superadmins can see these in
 * the setup tab. This way I can track what needs to be implemented."*
 *
 * WHY THE FOOTER, AND NOT A MENU. The moment somebody wants to report a bug is the
 * moment they hit it — on whatever screen they were on, mid-task. A route to a form
 * loses the screen they were looking at; an item three clicks into a menu loses the
 * person. The footer is on every page, out of the way of the work, and always in the
 * same place, so "where do I report this" has one answer.
 *
 * WHAT THE FORM DOES NOT ASK. Not the page (captured), not who you are (stamped by the
 * repository from the signed-in profile), not a category or a severity. Every field a
 * form asks for is a reason not to fill it in, and the two that matter — what happened,
 * and anything else — are the two that are here.
 *
 * The sender never sees their report again: the SELECT policy is admin-only, by her
 * instruction. So the toast is the whole receipt, and it says where the report went
 * rather than just "sent" — otherwise the honest question "did that go anywhere?" has
 * no answer on screen.
 */

interface FeedbackApi {
  /** Open the form for one kind. */
  report: (kind: FeedbackKind) => void;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useFeedback needs FeedbackProvider above it.");
  return api;
}

const COPY: Record<FeedbackKind, { title: string; hint: string; label: string; sent: string }> = {
  bug: {
    title: "Report a bug",
    hint: "Something went wrong, or did not do what you expected.",
    label: "What happened?",
    sent: "Bug sent — it's on the list in Setup."
  },
  idea: {
    title: "Suggest an idea",
    hint: "Something that would make this easier or quicker.",
    label: "What would you change?",
    sent: "Idea sent — it's on the list in Setup."
  }
};

/** The two footer controls. Rendered by the shell, so the shell decides where they go. */
export function FeedbackButtons() {
  const { report } = useFeedback();
  return (
    <>
      <button type="button" className="foot-action" onClick={() => report("bug")}>
        <Bug size={16} aria-hidden />
        Report a bug
      </button>
      <button type="button" className="foot-action" onClick={() => report("idea")}>
        <Idea size={16} aria-hidden />
        Suggest an idea
      </button>
    </>
  );
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const { toast } = useToasts();
  const location = useLocation();
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const report = useCallback((k: FeedbackKind) => {
    setKind(k);
    setProblem(null);
  }, []);

  const close = useCallback(() => {
    setKind(null);
    setProblem(null);
  }, []);

  const api = useMemo(() => ({ report }), [report]);

  const send = async () => {
    if (!kind || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await repo.submitFeedback({
        kind,
        title,
        detail,
        // Where they were when they hit it. Read at send rather than at open, because
        // the panel does not stop the page behind it changing.
        page: location.pathname + location.search
      });
      toast(COPY[kind].sent);
      // Cleared only on success: a refusal that also wiped what somebody typed would
      // cost them the report itself.
      setTitle("");
      setDetail("");
      setKind(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = kind ? COPY[kind] : null;

  return (
    <Ctx.Provider value={api}>
      {children}

      <SidePanel
        open={kind !== null}
        title={copy?.title ?? ""}
        onClose={close}
        footer={
          <>
            <Button onClick={() => void send()} disabled={busy || !title.trim()}>
              {busy ? "Sending…" : "Send"}
            </Button>
            <Button kind="tertiary" onClick={close} disabled={busy}>Cancel</Button>
          </>
        }
      >
        <div className="create-form">
          <Text type="text2" color="secondary" element="p" ellipsis={false}>
            {copy?.hint}
          </Text>

          <Field label="One line" required hint="What the list will show.">
            <TextField
              id="feedback-title"
              value={title}
              onChange={setTitle}
              placeholder={kind === "bug" ? "Saving a job did nothing" : "Let me filter by council"}
              inputAriaLabel="One-line summary"
            />
          </Field>

          <Field label={copy?.label ?? ""} hint="Anything that helps — what you expected, what happened instead.">
            <TextArea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={5}
              aria-label={copy?.label ?? "Detail"}
            />
          </Field>

          {/* Said out loud rather than captured silently: this is sent with the report,
              and somebody should be able to see that before they send it. */}
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            Sent with this: the page you are on ({location.pathname}) and your name.
          </Text>

          {problem && <Problem>{problem}</Problem>}
        </div>
      </SidePanel>
    </Ctx.Provider>
  );
}
