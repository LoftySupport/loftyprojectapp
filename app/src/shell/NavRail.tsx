import {
  useCallback, useEffect, useId, useRef, useState,
  type ComponentType, type ReactNode
} from "react";
import { NavigationChevronDown, NavigationChevronRight } from "@vibe/icons";
import "./NavRail.css";

/**
 * The persistent dark application rail — one sidebar in four states, not four sidebars.
 *
 * Built from the approved handoff of 11 September
 * (`docs/design/handoff/sidebar-navigation/`), which is marked high fidelity: the
 * colours, type, spacing and sizes below are measured, not chosen here. The four states
 * are 224px expanded (7a), 224px with a flyout (7b), 64px with a flyout (7c) and 64px
 * resting (7d) — and they are the same component with two widths and a panel, which is
 * why there is one file rather than four.
 *
 * WHY THESE NAMES
 *
 *   `NavRail`, `NavFlyout` and the `wash` constant are the names the same patterns are
 *   being added to Lofty's App Design System under, with the props in
 *   `docs/design/handoff/component-contracts/`. The handoff's instruction is to build
 *   against them even though the library merge has not happened yet, *"so the two
 *   converge rather than having to be reconciled"*. Where this file departs from the
 *   contract it is noted at the prop, and there is exactly one real departure: a
 *   destination carries a `to` and renders as whatever `link` returns, because a rail
 *   that navigates on `onSelect` alone cannot be middle-clicked, copied or opened in a
 *   new tab — and this one is the only way to every screen in the app.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 *   Anything that knows what a project is. This file knows about rows, washes, widths
 *   and a panel; `navDestinations.tsx` knows Lofty. That split is the point of the
 *   exercise the handoff describes — *"8 sort implementations, 37 header idioms, 13
 *   hand-built filter rows"* — every one of which started as a rule written as a
 *   behaviour that each screen then satisfied its own way.
 */

/**
 * The rail's alpha values, all white over Foundation Black, published because they are
 * the one part of the design that cannot come from a token.
 *
 * They are alphas rather than colours on purpose: the rail is `--lofty-foundation-black`
 * and a hover drawn as a hex would stop tracking it the moment the dark theme moves the
 * ground. `NavRail.wash` in the contract; a plain export here because a namespace on a
 * function is not a thing this codebase does anywhere else.
 *
 * Contrast, measured, against the bar Amber set on 11 September — *"it needs to be
 * readable but not meet full accessibility guidelines"*: white on Foundation Black is
 * 10.4:1, `muted` is 6.8:1 on the plain ground and **3.86:1 on a selected row**. That
 * last one is below AA and inside the bar, and the sidebar README's claim that all rail
 * text clears 4.5:1 is wrong — recorded here rather than repeated.
 */
export const wash = {
  rule: "rgba(255,255,255,.16)",
  hover: "rgba(255,255,255,.12)",
  selected: "rgba(255,255,255,.20)",
  /** The hovered row behind an open flyout, one step above selected. */
  flyout: "rgba(255,255,255,.28)",
  muted: "rgba(255,255,255,.72)"
} as const;

export interface NavDestination {
  id: string;
  label: string;
  /** The route. Not in the contract — see the header for why it has to be. */
  to: string;
  /**
   * Rendered at the size the family needs: 24 for a design-system glyph, 28 for a Lofty
   * one. `ComponentType` rather than a plain function type because React 19 types a
   * component's return as `ReactNode | Promise<ReactNode>`, and @vibe/icons are `FC`.
   */
  icon: ComponentType<{ size?: number }>;
  /**
   * 28 for the client's construction glyphs, 24 for design-system ones.
   *
   * Not a rounding preference. Every traced Lofty glyph sits inside a 3–21 box on a 24
   * grid, so it carries its own padding and reads lighter than a design-system glyph
   * that fills the box. 28 is what makes the two families the same weight — and
   * `ICONS.md` is explicit that the fix is the size, not the crop: *"Do not re-crop
   * them."*
   */
  iconSize?: number;
  count?: number | string;
  /** The views panel, or nothing. A destination with nothing to list gets no flyout. */
  panel?: NavPanel;
}

export interface FlyoutItem {
  label: string;
  to: string;
}

export interface NavPanel {
  title: string;
  /**
   * "New project", and where it goes. Both absent when the person may not create one.
   *
   * A link, not the contract's `onNew` callback. The rail is not the Projects page and
   * cannot reach its dialog — and a URL is the thing somebody can also send, which a
   * callback never is. `?new=1` is the pattern the Maintenance page already uses.
   */
  newLabel?: string;
  newTo?: string;
  views?: FlyoutItem[];
  /** Rendered as "VIEW BY <GROUPLABEL>". */
  groupLabel?: string;
  groups?: FlyoutItem[];
}

/* ------------------------------------------------------------------ the flyout */

/**
 * The 240px panel of a destination's views, anchored to the row that opened it.
 *
 * `position: fixed` and a top computed from the row, rather than absolute inside the
 * rail: the rail scrolls its own nav, and a panel that scrolled with it would slide off
 * the bottom of a long list while the mouse was still on the row that opened it.
 *
 * **No counts on the rows.** The handoff draws one on every line — "All projects 9",
 * "Pre-construction 3" — and Amber chose not to have them (11 September, asked with the
 * two alternatives: a `rail_counts` view, or a fetch per hover). It is the one place
 * this build knowingly departs from the drawing. The reason is cost, and the reason it
 * costs nothing: the flyout exists to jump to a view from anywhere without loading the
 * screen first, and the number was never what it was for.
 */
export function NavFlyout({
  panel, left, top, onMouseEnter, onMouseLeave, onLinkClick, link
}: {
  panel: NavPanel;
  /** 232 beside the expanded rail, 72 beside the collapsed one. */
  left: number;
  top: number;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onLinkClick: () => void;
  link: (item: FlyoutItem, className: string, onClick: () => void) => ReactNode;
}) {
  return (
    <div
      className="nav-flyout"
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="nav-flyout-head">
        <span className="nav-flyout-title">{panel.title}</span>
        {panel.newLabel && panel.newTo &&
          link({ label: panel.newLabel, to: panel.newTo }, "nav-flyout-new", onLinkClick)}
      </div>

      {panel.views && panel.views.length > 0 && (
        <>
          <div className="nav-flyout-rule" />
          <div className="nav-flyout-eyebrow">Views</div>
          {panel.views.map(v => link(v, "nav-flyout-row", onLinkClick))}
        </>
      )}

      {panel.groupLabel && panel.groups && panel.groups.length > 0 && (
        <>
          <div className="nav-flyout-rule" />
          <div className="nav-flyout-eyebrow">View by {panel.groupLabel}</div>
          {panel.groups.map(g => link(g, "nav-flyout-row", onLinkClick))}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the groups */

/**
 * A collapsible section of the rail — My work, Pinned.
 *
 * Both start closed, which is the handoff's call and not an oversight: the rail's job
 * at rest is the six destinations, and two open accordions above them push Tools off a
 * laptop screen. The chevron rotates right → down, and the header is a real `<button>`
 * with `aria-expanded` because that is the only thing a screen reader can act on.
 *
 * Collapsed to 64px the group is a single icon button that opens the section again at
 * full width — there is nowhere for children to go in a 64px column, and a flyout for
 * them would be a third kind of panel to learn.
 */
export function NavRailGroup({
  id, label, icon, iconSize, open, onToggle, collapsed, onExpandRail, children
}: {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  iconSize?: number;
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
  /** Collapsed, opening a group has to widen the rail first — its rows need labels. */
  onExpandRail: () => void;
  children: ReactNode;
}) {
  const Icon = icon;
  const panelId = `nav-group-${id}`;

  if (collapsed) {
    return (
      <button
        type="button"
        className="nav-icon-btn"
        title={label}
        aria-label={label}
        onClick={() => { onExpandRail(); if (!open) onToggle(); }}
      >
        <Icon size={iconSize ?? 24} />
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        className="nav-row nav-group-head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        <span className="nav-row-icon"><Icon size={20} /></span>
        <span className="nav-row-label">{label}</span>
        <span className="nav-row-chev" aria-hidden>
          {open ? <NavigationChevronDown size={14} /> : <NavigationChevronRight size={14} />}
        </span>
      </button>
      {open && <div id={panelId} className="nav-group-body">{children}</div>}
    </>
  );
}

/* -------------------------------------------------------------------- the rail */

export function NavRail({
  collapsed,
  destinations,
  activeId,
  onToggleCollapse,
  header,
  search,
  groups,
  footer,
  user,
  link
}: {
  collapsed: boolean;
  destinations: NavDestination[];
  activeId: string | null;
  onToggleCollapse: () => void;
  /** Wordmark expanded, twin-triangle mark collapsed. */
  header: ReactNode;
  /** The search field, expanded only — collapsed it is the 44px button below. */
  search: ReactNode;
  /** My work and Pinned, above the rule. */
  groups: ReactNode;
  /** Settings and Admin, below it. Gated by the caller, and again by RLS. */
  footer: ReactNode;
  user: ReactNode;
  /**
   * How a row becomes a link. Passed in rather than imported so this file never sees
   * the router — the design-system version of it will not have one.
   */
  link: (
    item: { label: string; to: string },
    className: string,
    onClick: () => void,
    body: ReactNode,
    extra?: Record<string, unknown>
  ) => ReactNode;
  /** Collapsed, the search button widens the rail and puts focus in the field. */
  onSearchClick?: () => void;
}) {
  /** Which destination's panel is showing, and where the row that opened it sits. */
  const [flyout, setFlyout] = useState<{ id: string; top: number } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const railId = useId();

  const clearTimer = () => {
    if (timer.current !== undefined) window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  /**
   * A short delay before opening, none before closing.
   *
   * The delay is what stops the panel flashing open on a mouse crossing the rail on its
   * way somewhere else — the classic fault of every hover menu. 180ms is long enough to
   * mean "I stopped here" and short enough not to feel broken.
   */
  const openAfterDelay = useCallback((id: string, el: HTMLElement) => {
    clearTimer();
    const top = el.getBoundingClientRect().top;
    timer.current = window.setTimeout(() => setFlyout({ id, top }), 180);
  }, []);

  /** Keyboard opens it at once: somebody tabbing here has already chosen the row. */
  const openNow = useCallback((id: string, el: HTMLElement) => {
    clearTimer();
    setFlyout({ id, top: el.getBoundingClientRect().top });
  }, []);

  const close = useCallback(() => { clearTimer(); setFlyout(null); }, []);

  useEffect(() => clearTimer, []);

  /** Escape closes the panel without moving focus or navigating. */
  useEffect(() => {
    if (!flyout) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyout, close]);

  /**
   * A panel anchored to a row that has scrolled is a panel pointing at nothing, so the
   * rail's own scroll closes it rather than chasing it. Same for the window's.
   */
  const onNavScroll = useCallback(() => { if (flyout) close(); }, [flyout, close]);

  const open = flyout ? destinations.find(d => d.id === flyout.id) : null;

  /**
   * Clamped so a panel opened from Tools at the bottom of a short window still fits.
   * 12px of air top and bottom, and the panel is at most 520px tall by its own CSS.
   */
  const flyoutTop = flyout
    ? Math.max(12, Math.min(flyout.top, window.innerHeight - 320))
    : 0;

  return (
    <>
      <div className="nav-rail-head">
        {header}
        {!collapsed && (
          <button
            type="button"
            className="nav-collapse"
            onClick={onToggleCollapse}
            aria-expanded
            aria-label="Collapse navigation to icons"
            title="Collapse navigation"
          >
            {/* The double chevron, drawn rather than imported: @vibe/icons carries
                NavigationChevronLeft but no double, and two stacked singles do not butt
                the way the mark in the handoff does. 20px, per the utility rank. */}
            <DoubleChevron />
          </button>
        )}
      </div>

      {!collapsed && <div className="nav-rail-search">{search}</div>}

      <nav
        className="nav-rail-nav"
        aria-label="Main"
        onScroll={onNavScroll}
        id={railId}
      >
        {groups}

        <div className="nav-rule" />

        {destinations.map(d => {
          const Icon = d.icon;
          const isActive = d.id === activeId;
          const isFlyingOut = flyout?.id === d.id;
          const cls =
            (collapsed ? "nav-icon-btn" : "nav-row nav-dest") +
            (isActive ? " is-active" : "") +
            (isFlyingOut ? " is-flyout" : "");

          const body = collapsed ? (
            <Icon size={d.iconSize ?? 24} />
          ) : (
            <>
              <span className="nav-row-icon"><Icon size={20} /></span>
              <span className="nav-row-label">{d.label}</span>
              {d.count !== undefined && <span className="nav-row-count">{d.count}</span>}
            </>
          );

          return link(d, cls, close, body, {
            // Collapsed there is no visible label, so `title` is the tooltip AND the
            // accessible name. Expanded the label is real text and a title would only
            // repeat it under the cursor.
            title: collapsed ? d.label : undefined,
            "aria-label": collapsed ? d.label : undefined,
            "aria-current": isActive ? "page" : undefined,
            onMouseEnter: d.panel
              ? (e: React.MouseEvent<HTMLElement>) => openAfterDelay(d.id, e.currentTarget)
              : close,
            onMouseLeave: d.panel ? () => { clearTimer(); window.setTimeout(() => {
                // Left open only if the pointer has landed on the panel itself, which
                // sets its own enter handler. A bare close here would shut the panel
                // while the mouse was crossing the 8px gap to reach it.
                setFlyout(f => (f && document.querySelector(".nav-flyout:hover") ? f : null));
              }, 120); } : undefined,
            onFocus: d.panel
              ? (e: React.FocusEvent<HTMLElement>) => openNow(d.id, e.currentTarget)
              : undefined
          });
        })}
      </nav>

      <div className="nav-rail-foot">
        {collapsed && (
          <>
            <button
              type="button"
              className="nav-icon-btn nav-expand"
              onClick={onToggleCollapse}
              aria-expanded={false}
              aria-label="Expand navigation"
              title="Expand navigation"
            >
              {/* The same control as 7a's «, mirrored so it reads ». */}
              <DoubleChevron mirrored />
            </button>
            <div className="nav-rule nav-rule-short" />
          </>
        )}
        {footer}
        {user}
      </div>

      {open?.panel && (
        <NavFlyout
          panel={open.panel}
          left={collapsed ? 72 : 232}
          top={flyoutTop}
          onMouseEnter={clearTimer}
          onMouseLeave={close}
          onLinkClick={close}
          link={(item, className, onClick) =>
            link(item, className, onClick, <span className="nav-row-label">{item.label}</span>)
          }
        />
      )}
    </>
  );
}

/**
 * `«` and `»` as one glyph.
 *
 * @vibe/icons has no double chevron, and two `NavigationChevronLeft` side by side do not
 * butt the way the handoff's mark does — they sit a stroke apart and read as two
 * controls. Drawn at the design system's 24 grid and 1.7 weight so it belongs to the
 * same family as everything else in the rail, and rendered at 20px, which is the
 * utility rank: navigation reads heavier than tooling, deliberately.
 */
function DoubleChevron({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
      aria-hidden
    >
      <path d="M11.5 6.5 L6 12 l5.5 5.5" />
      <path d="M18 6.5 L12.5 12 l5.5 5.5" />
    </svg>
  );
}
