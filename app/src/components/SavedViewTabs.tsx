import { Text } from "@vibe/core";
import { SAVED_VIEWS } from "../data/savedViews";
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
 */
export function SavedViewTabs({
  activeSlug,
  onSelect,
  hrefFor,
  countFor
}: {
  activeSlug: string;
  onSelect: (slug: string) => void;
  hrefFor: (slug: string) => string;
  countFor?: (slug: string) => number;
}) {
  return (
    <nav className="saved-views" aria-label="Saved views">
      {SAVED_VIEWS.map(v => {
        const active = v.slug === activeSlug;
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
    </nav>
  );
}
