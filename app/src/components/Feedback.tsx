import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, RadioButton, Text, TextArea, TextField } from "@vibe/core";
import { Bug, Idea } from "@vibe/icons";
import { useQuery, useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useToasts } from "./Toasts";
import { Field, Problem } from "./Form";
import { Select } from "./Select";
import { SidePanel } from "./SidePanel";
import { FEEDBACK_STAGE_LABELS, type FeedbackItem, type FeedbackKind } from "../data/types";
import "./ui.css";

/**
 * Reporting a bug, and asking for a feature (0052, reshaped by 0060–0062).
 *
 * Amber, 30 Aug: *"the ability to update bug tracking and Wishlist so it submits the form
 * with who submitted it and idea and any screenshots and what page it was on and errors.
 * It should just be one as bugs and Wishlist but have a radio select if it is a bug/error
 * or if it is an idea or feature request."*
 *
 * WHY ONE CONTROL AND A RADIO, NOT TWO BUTTONS. It was two footer buttons, and the split
 * asked the wrong question at the wrong moment: somebody who has just hit something
 * annoying does not first decide whether it is a defect or a missing feature — that is a
 * triage judgement, and it is often wrong when made by the person who hit it. One door,
 * and the radio inside it, means the choice is made after the form is open and can be
 * changed without losing what has been typed. It is also the difference between "where do
 * I report this" having one answer and having two.
 *
 * WHY THE FOOTER STILL. The moment somebody wants to report something is the moment they
 * hit it, on whatever screen they were on, mid-task. A route to a form loses the screen;
 * an item three clicks into a menu loses the person.
 *
 * WHAT THE FORM DOES NOT ASK: the page (captured), who you are (stamped by the repository
 * from the signed-in profile), the browser (captured), the error (captured — see below),
 * a severity or a category. Every field a form asks for is a reason not to fill it in.
 *
 * WHAT CHANGED WITH THE TRACKER. 0052's toast was the whole receipt, because the sender
 * could never read their own report back. Since 0060 they can: the confirmation now
 * offers the queue itself, because "did that go anywhere" should be answerable by looking
 * rather than by remembering a toast.
 */

interface FeedbackApi {
  /** Open the form, optionally with a kind already chosen. */
  report: (kind?: FeedbackKind) => void;
}

const Ctx = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useFeedback needs FeedbackProvider above it.");
  return api;
}

const COPY: Record<FeedbackKind, { label: string; placeholder: string; hint: string }> = {
  bug: {
    label: "What happened?",
    placeholder: "Saving a job did nothing",
    hint: "What you expected, what happened instead, and anything you did just before."
  },
  idea: {
    label: "What would you change?",
    placeholder: "Let me filter jobs by council",
    hint: "What you are trying to do, and what would make it quicker."
  }
};

/** How many screenshots one report may carry, and why it is capped at all. */
const MAX_SCREENSHOTS = 4;
/** The bucket refuses anything larger (0062). Checked here so the message is readable. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * The one footer control. The shell decides where it goes.
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

/**
 * The last error the app hit, captured so the form does not have to ask for it.
 *
 * Amber asked for "errors" with the report, and the only version of that worth having is
 * the one nobody has to retype. Two listeners cover what a React app actually throws: an
 * uncaught exception (`error`) and a rejected promise nobody caught
 * (`unhandledrejection`) — which is what a failed Supabase call becomes when a screen
 * forgets to handle it.
 *
 * Held for fifteen minutes and then dropped. An error from an hour ago attached to a
 * report about something else is worse than no error at all: it sends whoever reads it
 * to the wrong place, confidently.
 */
const ERROR_TTL_MS = 15 * 60 * 1000;

function useLastError(): { text: string | null; clear: () => void } {
  const [entry, setEntry] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      setEntry({
        text: [e.message, e.filename && `${e.filename}:${e.lineno}`].filter(Boolean).join(" — "),
        at: Date.now()
      });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      const text = r instanceof Error ? `${r.name}: ${r.message}` : String(r);
      setEntry({ text, at: Date.now() });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const fresh = entry && Date.now() - entry.at < ERROR_TTL_MS ? entry.text : null;
  return { text: fresh, clear: () => setEntry(null) };
}

/**
 * "Somebody may have asked this already" — searched while the title is still being typed.
 *
 * This is the feature Amber's whole brief turns on: *"stop people saying I want this to
 * happen when it is already planned"*. Merging duplicates afterwards (0066) tidies up;
 * this is what stops the duplicate being written, and it is the thing Canny's portal does
 * that a plain form does not.
 *
 * Debounced at 300ms and only from three characters. Not because the query is expensive —
 * it is an indexed ilike over a few hundred rows — but because a list that rearranges
 * itself on every keystroke is unreadable, and a suggestion nobody can finish reading is
 * a suggestion nobody acts on.
 */
function useSimilar(title: string, open: boolean) {
  const repo = useRepository();
  const [similar, setSimilar] = useState<FeedbackItem[]>([]);

  useEffect(() => {
    if (!open || title.trim().length < 3) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      repo.searchFeedback(title)
        .then(rows => { if (!cancelled) setSimilar(rows); })
        // Silent: a search that fails must not stop somebody reporting. The form still
        // works, and the worst case is a duplicate that gets merged later.
        .catch(() => { if (!cancelled) setSimilar([]); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [repo, title, open]);

  return similar;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const repo = useRepository();
  const { toast } = useToasts();
  const location = useLocation();
  const navigate = useNavigate();
  const lastError = useLastError();

  const [open, setOpen] = useState(false);
  // Defaults to a bug, and that is a considered default rather than the first value in
  // the list: most things sent from a footer are sent because something did not work.
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [voted, setVoted] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const similar = useSimilar(title, open);

  /**
   * "Requested by" — an admin filing something somebody told them about (Amber, 31 Aug;
   * 0070). Empty means "me", which is the ordinary case and the default.
   *
   * The list is only fetched for the people who can use it. Below admin the second insert
   * policy matches nothing, so a control here would be one that always fails on save —
   * and the house rule is that a control which cannot work should not be drawn.
   */
  const { can } = usePermission();
  const canFileForOthers = can("admin");
  const { data: people } = useQuery(
    r => (canFileForOthers ? r.listProfiles() : Promise.resolve([])),
    [],
    [canFileForOthers]
  );
  const [onBehalfOf, setOnBehalfOf] = useState("");

  const report = useCallback((k?: FeedbackKind) => {
    if (k) setKind(k);
    setProblem(null);
    setOpen(true);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setProblem(null);
  }, []);

  const api = useMemo(() => ({ report }), [report]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = [...list];
    const tooBig = picked.find(f => f.size > MAX_BYTES);
    if (tooBig) {
      setProblem(`"${tooBig.name}" is larger than 10MB — the app will not accept it.`);
      return;
    }
    setProblem(null);
    setFiles(current => [...current, ...picked].slice(0, MAX_SCREENSHOTS));
  };

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      await repo.submitFeedback({
        kind,
        title,
        detail,
        // Read at send rather than at open: the panel does not stop the page behind it
        // changing, and where they were when they sent it is the useful fact.
        page: location.pathname + location.search,
        // Only on a bug. An error caught fifteen minutes ago, stapled to a feature
        // request, is noise that reads like evidence.
        errorText: kind === "bug" ? lastError.text : null,
        screenshots: files,
        // Empty string means "me" — sent as undefined rather than as the signed-in id,
        // because a report on behalf of yourself is refused by the CHECK and is anyway
        // just a report.
        onBehalfOf: onBehalfOf || undefined
      });
      toast(
        kind === "bug"
          ? "Bug sent — it's in the tracker as Requested."
          : "Request sent — it's in the tracker as Requested."
      );
      // Cleared only on success: a refusal that also wiped what somebody typed would cost
      // them the report itself.
      setTitle("");
      setDetail("");
      setFiles([]);
      // Cleared with the rest. A "requested by" left standing would silently file the
      // NEXT report under the last person named, which is the one mistake on this form
      // nobody would notice they had made.
      setOnBehalfOf("");
      lastError.clear();
      setOpen(false);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = COPY[kind];

  return (
    <Ctx.Provider value={api}>
      {children}

      <SidePanel
        open={open}
        title="Report a bug or request a feature"
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
          <Field label="What kind of thing is this?" required>
            {/* A radio group and not a dropdown: two options, both of which need their
                gloss read, and a closed dropdown shows one of them. */}
            <div className="feedback-kinds" role="radiogroup" aria-label="Kind">
              <div className={"feedback-kind" + (kind === "bug" ? " is-on" : "")}>
                <RadioButton
                  name="feedback-kind"
                  value="bug"
                  checked={kind === "bug"}
                  onSelect={() => setKind("bug")}
                  text="A bug or an error"
                />
                <Text type="text3" color="secondary" element="span" ellipsis={false}>
                  Something went wrong, or did not do what you expected.
                </Text>
              </div>
              <div className={"feedback-kind" + (kind === "idea" ? " is-on" : "")}>
                <RadioButton
                  name="feedback-kind"
                  value="idea"
                  checked={kind === "idea"}
                  onSelect={() => setKind("idea")}
                  text="An idea or a feature request"
                />
                <Text type="text3" color="secondary" element="span" ellipsis={false}>
                  Something that would make this easier or quicker.
                </Text>
              </div>
            </div>
          </Field>

          {canFileForOthers && people.length > 0 && (
            <Field
              label="Requested by"
              hint={
                onBehalfOf
                  ? "It goes into the tracker under their name, with yours beside it as who entered it."
                  : "Leave as yourself unless somebody told you about this — on site, on a call, in a meeting."
              }
            >
              <Select
                options={[
                  { value: "", label: "Me" },
                  ...people
                    .filter(p => p.fullName)
                    .map(p => ({ value: p.id, label: p.fullName }))
                ]}
                value={onBehalfOf}
                onChange={v => setOnBehalfOf(v as string)}
                aria-label="Requested by"
                size="small"
              />
            </Field>
          )}

          <Field label="One line" required hint="What the tracker will show.">
            <TextField
              id="feedback-title"
              value={title}
              onChange={setTitle}
              placeholder={copy.placeholder}
              inputAriaLabel="One-line summary"
            />
          </Field>

          {similar.length > 0 && (
            <div className="feedback-similar">
              <Text type="text3" weight="medium" element="div" ellipsis={false}>
                {/* Not "duplicate detected". Nobody is being told off — they are being
                    offered a shortcut to the thing they wanted. */}
                Someone may have asked this already
              </Text>
              <ul>
                {similar.map(f => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className="feedback-similar-vote"
                      disabled={voted === f.id}
                      onClick={() => {
                        void repo.setFeedbackVote(f.id, true)
                          .then(() => setVoted(f.id))
                          .catch(e => setProblem(e instanceof Error ? e.message : String(e)));
                      }}
                    >
                      {/* Voting for it IS the useful action here: it adds this person to
                          the count instead of adding a second request to the queue, and
                          it follows them, so they hear when it moves. */}
                      {voted === f.id ? "Voted ✓" : `+1 (${f.voteCount})`}
                    </button>
                    <span>
                      <Text type="text3" element="span" ellipsis={false}>{f.title}</Text>
                      <Text type="text3" color="secondary" element="span">
                        {" "}· {FEEDBACK_STAGE_LABELS[f.stage]}
                      </Text>
                    </span>
                  </li>
                ))}
              </ul>
              <Text type="text3" color="secondary" element="div" ellipsis={false}>
                Voting for one of these tells you when it moves. Send yours anyway if none
                of them is what you mean.
              </Text>
            </div>
          )}

          <Field label={copy.label} hint={copy.hint}>
            <TextArea
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={5}
              aria-label={copy.label}
            />
          </Field>

          <Field
            label="Screenshots"
            hint={`Up to ${MAX_SCREENSHOTS}, 10MB each. A picture of the screen is usually faster than describing it.`}
          >
            <input
              ref={fileInput}
              type="file"
              className="feedback-file"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              multiple
              onChange={e => {
                addFiles(e.target.files);
                // Cleared so picking the same file twice in a row still fires a change.
                e.target.value = "";
              }}
              aria-label="Attach screenshots"
            />
            {files.length > 0 && (
              <ul className="feedback-files">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`}>
                    <Text type="text3" element="span">{f.name}</Text>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setFiles(current => current.filter((_, n) => n !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          {/* Said out loud rather than captured silently. Everything in this block is
              sent with the report, and somebody should be able to see that before they
              send it — particularly the error, which is the one thing here they did not
              type and might not expect to be attached. */}
          <div className="feedback-captured">
            <Text type="text3" weight="medium" element="div" ellipsis={false}>Sent with this</Text>
            <Text type="text3" color="secondary" element="div" ellipsis={false}>
              Your name, the page you are on ({location.pathname}), and your browser.
            </Text>
            {kind === "bug" && lastError.text && (
              <Text type="text3" color="secondary" element="div" ellipsis={false}>
                The last error the app hit: <span className="dict-type">{lastError.text}</span>
              </Text>
            )}
          </div>

          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            Everyone can see the tracker, so check{" "}
            <button
              type="button"
              className="link-button"
              onClick={() => { close(); navigate("/updates"); }}
            >
              what's already planned
            </button>{" "}
            — someone may have asked for this already.
          </Text>

          {problem && <Problem>{problem}</Problem>}
        </div>
      </SidePanel>
    </Ctx.Provider>
  );
}
