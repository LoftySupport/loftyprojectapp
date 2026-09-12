import {
  useCallback, useEffect, useState, type ComponentType
} from "react";
import { useLocation } from "react-router-dom";
import { Board, CloseSmall, Doc, Location, Settings } from "@vibe/icons";
import { useRepository } from "../data/DataProvider";
import { pinKind, type PinKind, type PinnedPage } from "../data/types";
import { Projects as ProjectsGlyph, Reports as ReportsGlyph } from "../theme/railIcons";
import type { RailLink } from "./NavRail";

/**
 * The rail's **Pinned** section — five pages you keep (0112).
 *
 * Amber, 11 September, asked what Pinned pins: *"pinned is new and allows people to
 * save/bookmark a page"* — **any page**, a URL with a name. A filtered board, a settings
 * screen, a job, a report.
 *
 * WHAT THE MOCKUP DRAWS, AND WHY THIS IS NOT THAT
 *
 *   7a renders pinned rows as PROJECTS, each with an 8px health dot in orange, teal or
 *   grey. That is a second, weaker list of projects sitting above the Projects
 *   destination — and a URL has no health. So there is no dot, and the row carries an
 *   icon for the KIND of page instead. `docs/design/handoff/README.md`, correction 3.
 *
 * THE ICON IS THE DESTINATION'S OWN MARK
 *
 *   A pinned project wears the same glyph as the Projects row, a pinned job the same pin
 *   as Jobs. That is the whole value of the icon: you recognise what a bookmark points at
 *   without reading the label, because you already know the mark from six inches below.
 *   Lofty glyphs get 18px against the design system's 16 — the same 24-versus-28 ratio,
 *   for the same reason: they carry their own padding and read lighter at equal size.
 */

/** The kinds, and the mark each borrows from the destination it belongs to. */
const KIND_ICON: Record<PinKind, { icon: ComponentType<{ size?: number }>; size: number }> = {
  job: { icon: Location, size: 16 },
  project: { icon: ProjectsGlyph, size: 18 },
  board: { icon: Board, size: 16 },
  report: { icon: ReportsGlyph, size: 18 },
  settings: { icon: Settings, size: 16 },
  page: { icon: Doc, size: 16 }
};

/**
 * What to call the page you are on, suggested rather than decided.
 *
 * The screen's own heading — "Jobs", "Projects", "Admin" — read out of the DOM at the
 * moment you pin. A real, current fact about the page rather than a label composed from
 * the path, and a SUGGESTION: the field is editable and the person is looking at it
 * before they save. Where a screen has no heading the field opens empty, which is the
 * honest answer rather than a slug dressed up as a name.
 *
 * `h1, h2, h3`, not `h1`. The first version of this asked for `#main h1` and came back
 * empty on every screen in the app, because one page uses `Heading type="h1"` and
 * nineteen use `h2` — caught by photographing the form and seeing an empty box. Taking
 * the first of the three is "the page's own title" however the screen spells it, which
 * is the thing actually wanted.
 */
function suggestLabel(): string {
  const heading = document.querySelector("#main h1, #main h2, #main h3");
  return heading?.textContent?.trim() ?? "";
}

export function PinnedSection({
  collapsed,
  link
}: {
  collapsed: boolean;
  link: RailLink;
}) {
  const repo = useRepository();
  const location = useLocation();
  const [pins, setPins] = useState<PinnedPage[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const here = location.pathname + location.search;
  const alreadyPinned = pins.some(p => p.url === here);
  const full = pins.length >= 5;

  /**
   * Read once on mount, not on every navigation.
   *
   * The rail renders on every screen, and a read keyed to the pathname would be one
   * query per page view for a list that changes only when somebody presses a button on
   * this component. Every write below returns the fresh list, so the state cannot drift
   * from the database without this component having been the one to change it.
   */
  useEffect(() => {
    let cancelled = false;
    repo.listMyPins()
      .then(rows => { if (!cancelled) setPins(rows); })
      // A rail that cannot read its bookmarks shows no bookmarks. It must not take the
      // whole shell down, and there is nothing useful to say about it in a 224px column.
      .catch(() => { if (!cancelled) setPins([]); });
    return () => { cancelled = true; };
  }, [repo]);

  const startAdding = useCallback(() => {
    setDraft(suggestLabel());
    setProblem(null);
    setAdding(true);
  }, []);

  const save = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setPins(await repo.pinPage(draft, here));
      setAdding(false);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, repo, draft, here]);

  const remove = useCallback(async (id: string) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    try {
      setPins(await repo.unpinPage(id));
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [busy, repo]);

  // Collapsed there is nowhere for a label to go, and a flyout of five bookmarks would be
  // a third kind of panel to learn. The group header above this one widens the rail.
  if (collapsed) return null;

  return (
    <>
      {pins.map(p => {
        const { icon: Icon, size } = KIND_ICON[pinKind(p.url)];
        return (
          <div className="nav-pin" key={p.id}>
            {link(
              { label: p.label, to: p.url },
              "nav-row nav-row-small",
              () => {},
              <>
                <span className="nav-row-icon"><Icon size={size} /></span>
                <span className="nav-row-label">{p.label}</span>
              </>
            )}
            {/* Unpin. Its own button rather than a menu: five rows is not a list that
                needs one, and the row is 32px so the target is the row's full height. */}
            <button
              type="button"
              className="nav-pin-off"
              aria-label={`Unpin ${p.label}`}
              title={`Unpin ${p.label}`}
              disabled={busy}
              onClick={() => void remove(p.id)}
            >
              <CloseSmall size={14} aria-hidden />
            </button>
          </div>
        );
      })}

      {adding ? (
        <div className="nav-pin-form">
          {/* A plain input, not Vibe's TextField: this is 208px of a dark rail and the
              component brings its own light-surface chrome and a 32px minimum that does
              not fit the 32px row it sits in. */}
          <input
            className="nav-pin-input"
            autoFocus
            value={draft}
            maxLength={60}
            placeholder="Name this page"
            aria-label="Name for the pinned page"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") { e.preventDefault(); void save(); }
              if (e.key === "Escape") { e.preventDefault(); setAdding(false); }
            }}
          />
          <div className="nav-pin-actions">
            <button type="button" onClick={() => void save()} disabled={busy || !draft.trim()}>
              Save
            </button>
            <button type="button" onClick={() => setAdding(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="nav-row nav-row-small nav-pin-add"
          onClick={startAdding}
          disabled={busy || alreadyPinned || full}
        >
          <span className="nav-row-label">
            {/* The disabled state says WHY, rather than being a control that does
                nothing when pressed. Five is the database's rule and the message names
                the way out of it. */}
            {alreadyPinned ? "This page is pinned"
              : full ? "Five pinned — unpin one"
              : "Pin this page"}
          </span>
        </button>
      )}

      {problem && <p className="nav-pin-problem" role="alert">{problem}</p>}
    </>
  );
}
