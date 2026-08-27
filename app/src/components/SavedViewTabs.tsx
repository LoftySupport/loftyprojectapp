import { useEffect, useRef, useState } from "react";
import { Button, Text, TextField } from "@vibe/core";
import { SAVED_VIEWS } from "../data/savedViews";
import { sameQuery } from "../data/useSavedViews";
import type { UserSavedView } from "../data/types";
import { Problem } from "./Form";
import "./ui.css";

/**
 * Which slice of the pipeline you are looking at.
 *
 * Above the toolbar rather than inside it, because it is a different kind of control: the
 * toolbar narrows what is in front of you, and this chooses what "in front of you" means
 * in the first place. Mixing them into one row made the board look like it had seven
 * equal dropdowns and no starting point.
 *
 * Rendered as links, not buttons. Each view already has a URL, so making them anchors
 * gets middle-click, open-in-new-tab and copy-link-address for nothing — and a saved view
 * you cannot copy the address of is not much of a saved view.
 *
 * **Two kinds of tab, one row (0048).** The three built-ins are slices of the lifecycle
 * everybody needs; after them come the ones this person saved. They are separated by a
 * rule rather than by a heading — the row still reads left to right as "which view", and
 * a heading would make a private habit look like a section of the app.
 */
export function SavedViewTabs({
  activeSlug,
  onSelect,
  hrefFor,
  countFor,
  userViews = [],
  currentQuery = "",
  basePath,
  onOpenView,
  onSaveView,
  onDeleteView,
  onShareView,
  shareTeams = [],
  teamLabel,
  saveProblem,
  saveBusy
}: {
  activeSlug: string;
  onSelect: (slug: string) => void;
  hrefFor: (slug: string) => string;
  countFor?: (slug: string) => number;
  /** This person's own saved views for this board. Empty until they save one. */
  userViews?: UserSavedView[];
  /** The board's current query string, with or without its leading '?'. */
  currentQuery?: string;
  /** '/jobs' or '/projects' — what a saved view's query hangs off. */
  basePath?: string;
  onOpenView?: (v: UserSavedView) => void;
  onSaveView?: (name: string) => Promise<boolean>;
  onDeleteView?: (v: UserSavedView) => void;
  /** Share with a team, or null to make private again. Owner-only by policy. */
  onShareView?: (v: UserSavedView, team: string | null) => void;
  /** The teams this person is in — sharing offers the first, or nothing if they are in none. */
  shareTeams?: { id: string; name: string }[];
  teamLabel?: (id: string) => string;
  saveProblem?: string | null;
  saveBusy?: boolean;
}) {
  // Naming happens inline rather than in a dialog: saving a view is a small, low-stakes
  // act, and a modal for it would out-weigh the thing being done.
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const nameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!naming) return;
    nameRef.current?.querySelector("input")?.focus();
  }, [naming]);

  const q = currentQuery.startsWith("?") ? currentQuery.slice(1) : currentQuery;
  const activeUserView = userViews.find(v => sameQuery(v.query, q));
  // Yours first, then the team's. Same reasoning as the first rule: the row reads left
  // to right from "everybody's" through "mine" to "my team's".
  const mine = userViews.filter(v => v.isMine);
  const theirs = userViews.filter(v => !v.isMine);
  // Already saved → nothing to save. The affordance appears exactly when it would do
  // something, so its presence is the answer to "is this view kept?".
  const canSave = Boolean(onSaveView) && !activeUserView;

  const commit = async () => {
    if (!onSaveView) return;
    const name = draft.trim();
    if (!name) return;
    const ok = await onSaveView(name);
    if (ok) {
      setDraft("");
      setNaming(false);
    }
  };

  return (
    <div className="saved-views-row">
      <nav className="saved-views" aria-label="Saved views">
        {SAVED_VIEWS.map(v => {
          // A user view is showing → none of the built-ins is what you are looking at,
          // even when its slug is still in the query.
          const active = !activeUserView && v.slug === activeSlug;
          return (
            <a
              key={v.slug}
              href={hrefFor(v.slug)}
              aria-current={active ? "page" : undefined}
              className={"saved-view" + (active ? " is-active" : "")}
              onClick={e => {
                // Let the browser have the modified clicks — ctrl/cmd/middle open a new tab,
                // which is the whole reason these are anchors rather than buttons.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                e.preventDefault();
                onSelect(v.slug);
              }}
            >
              <Text type="text2" element="span" weight={active ? "bold" : "normal"}>
                {v.label}
              </Text>
              {countFor && <span className="saved-view-count">{countFor(v.slug)}</span>}
            </a>
          );
        })}

        {mine.length > 0 && <span className="saved-views-rule" aria-hidden />}

        {mine.map(v => {
          const active = activeUserView?.id === v.id;
          return (
            <span key={v.id} className={"saved-view is-mine" + (active ? " is-active" : "")}>
              <a
                href={basePath ? `${basePath}${v.query ? `?${v.query}` : ""}` : undefined}
                aria-current={active ? "page" : undefined}
                onClick={e => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  onOpenView?.(v);
                }}
              >
                <Text type="text2" element="span" weight={active ? "bold" : "normal"}>
                  {v.name}
                </Text>
              </a>
              {/* Sharing and removing appear only on the view you have open, and only
                  when it is yours — a row of controls on every tab invites the
                  mis-click neither can undo. */}
              {active && onShareView && shareTeams.length > 0 && (
                <button
                  type="button"
                  className="saved-view-share"
                  aria-label={v.sharedWithTeam
                    ? `Stop sharing ${v.name}`
                    : `Share ${v.name} with your team`}
                  title={v.sharedWithTeam
                    ? `Shared with ${teamLabel?.(v.sharedWithTeam) ?? v.sharedWithTeam} — click to make private`
                    : "Share this view with your team"}
                  onClick={() => onShareView(v, v.sharedWithTeam ? null : shareTeams[0].id)}
                >
                  {v.sharedWithTeam ? "shared" : "share"}
                </button>
              )}
              {active && onDeleteView && (
                <button
                  type="button"
                  className="saved-view-remove"
                  aria-label={`Remove saved view ${v.name}`}
                  title="Remove this saved view"
                  onClick={() => onDeleteView(v)}
                >
                  ×
                </button>
              )}
            </span>
          );
        })}
        {theirs.length > 0 && <span className="saved-views-rule" aria-hidden />}

        {theirs.map(v => {
          const active = activeUserView?.id === v.id;
          return (
            <span key={v.id} className={"saved-view is-theirs" + (active ? " is-active" : "")}>
              <a
                href={basePath ? `${basePath}${v.query ? `?${v.query}` : ""}` : undefined}
                aria-current={active ? "page" : undefined}
                onClick={e => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                  e.preventDefault();
                  onOpenView?.(v);
                }}
              >
                <Text type="text2" element="span" weight={active ? "bold" : "normal"}>
                  {v.name}
                </Text>
                {/* Whose it is, so two people may both call one "Site this week" without
                    the row becoming a guess — which is why the unique constraint stayed
                    per person rather than being widened. */}
                {v.ownerName && (
                  <Text type="text3" color="secondary" element="span"> · {v.ownerName}</Text>
                )}
              </a>
            </span>
          );
        })}
      </nav>

      {canSave && (
        naming ? (
          <div className="saved-view-namer field-inline" ref={nameRef}>
            <TextField
              inputAriaLabel="Name this view"
              placeholder="Name this view…"
              size="small"
              value={draft}
              onChange={setDraft}
              onKeyDown={e => {
                if (e.key === "Enter") void commit();
                if (e.key === "Escape") { setNaming(false); setDraft(""); }
              }}
            />
            <Button size="small" disabled={saveBusy || !draft.trim()} onClick={() => void commit()}>
              Save
            </Button>
            <Button size="small" kind="tertiary" onClick={() => { setNaming(false); setDraft(""); }}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="small" kind="tertiary" onClick={() => setNaming(true)}>
            Save this view…
          </Button>
        )
      )}
      {saveProblem && <Problem>{saveProblem}</Problem>}
    </div>
  );
}
