import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Avatar, Dialog, DialogContentContainer, Text, TextField
} from "@vibe/core";
import {
  Announcement, Doc, Home, Menu, NavigationChevronLeft, NavigationChevronRight,
  Person, SettingsKnobs
} from "@vibe/icons";
import { HouseChart, HousePin, Houses } from "../theme/houseIcons";
import { initialsOf, useAuth } from "../data/AuthProvider";
import { useSearch } from "../data/SearchProvider";
import { Tooltip } from "@vibe/tooltip";
import { AskButton, AskDockProvider } from "../components/AskDock";
import { FeedbackButtons, FeedbackProvider } from "../components/Feedback";
import { NotificationsBell } from "../components/NotificationsBell";
import { ToastsProvider } from "../components/Toasts";
import { greetingName } from "../data/types";
import "./AppShell.css";

/**
 * Every destination, each with an icon.
 *
 * The icon is not decoration here — collapsed, it is the only thing left, so it has to
 * carry the meaning on its own. The three record destinations wear Lofty's own house
 * icons (Amber, 27 Aug): **a project holds many houses, a job is one site**, so
 * Projects gets the pair and Jobs gets the pin — her call, and the right way round:
 * the pin marks a single place, which is exactly what a job is. Reports is the house
 * doing well. SettingsKnobs stays for Setup — the app's own configuration as opposed
 * to the person-shaped Admin beside it.
 */
const PAGES = [
  // "/dashboard", not "/": "/" is the front door and forwards to whatever the
  // landing preference names, so a nav link pointing there could never reach the
  // dashboard for anybody who had chosen a different landing page.
  { to: "/dashboard", label: "Dashboard", icon: Home, end: true },
  { to: "/projects", label: "Projects", icon: Houses },
  { to: "/jobs", label: "Jobs", icon: HousePin },
  { to: "/reports", label: "Reports", icon: HouseChart },
  { to: "/templates", label: "Templates", icon: Doc },
  // The tracker (0060–0063). In the main nav rather than in Setup, because it is for
  // everybody: Setup is configuration and this is "what is happening with the app".
  { to: "/updates", label: "Updates", icon: Announcement },
  { to: "/admin", label: "Admin", icon: Person },
  // Setup replaced Dictionary and Wiring as separate destinations: configuration was
  // sitting at the same rank as the work.
  { to: "/setup", label: "Setup", icon: SettingsKnobs }
  // Settings is deliberately absent — it is personal, not a destination, so it lives in
  // the menu under your own name where "User settings" says whose settings they are.
];

const RAIL_KEY = "lofty-nav-collapsed";
/** Below this the rail cannot share a line with the page, so it becomes a drawer. */
const DRAWER_BREAKPOINT = 900;

/**
 * Your name, and the two things that are yours: your settings, and leaving.
 *
 * Settings came out of the main nav to get here. It is not a destination alongside
 * Projects and Jobs — it is personal, and putting it under your own name is what makes
 * "whose settings?" answerable without opening it. The label says "User settings" for
 * the same reason: the app has a Setup screen now, and "Settings" beside it was two
 * words for two unrelated things.
 */
function UserMenu() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const content = (
    <DialogContentContainer>
      <div className="user-menu">
        {profile && (
          <div className="user-menu-head">
            <Text type="text2" weight="bold" ellipsis={false}>{profile.fullName}</Text>
            <Text type="text3" color="secondary" ellipsis={false}>{profile.email}</Text>
          </div>
        )}
        <button type="button" onClick={() => { close(); navigate("/settings"); }}>
          User settings
        </button>
        <button type="button" onClick={() => { close(); void signOut(); }}>
          Sign out
        </button>
      </div>
    </DialogContentContainer>
  );

  return (
    <span className="app-user">
      <Dialog
        open={open}
        onClickOutside={close}
        content={content}
        position="bottom-end"
        showTrigger={[]}
        hideTrigger={[]}
      >
        <button
          type="button"
          className="user-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          onKeyDown={e => { if (e.key === "Escape") close(); }}
        >
          {profile && (
            <Avatar size="small" type="text" text={initialsOf(profile)} aria-hidden />
          )}
          {/* Hidden below 720px in CSS — the avatar carries identity there and the name
              costs a line of header. The accessible name stays on the button either way. */}
          <span className="app-user-name">
            <Text type="text2" element="span">
              {profile ? greetingName(profile) : "Account"}
            </Text>
          </span>
        </button>
      </Dialog>
    </span>
  );
}

/**
 * The left rail.
 *
 * Nav moved off the top for room: seven destinations across a header wrapped to two and
 * three rows on anything narrower than a laptop, and every one of those rows was board
 * the work did not get. Down the side it costs one column that the reader can shrink to
 * icons — and the board, which scrolls sideways, gets the whole height back.
 *
 * Collapsed still renders every label; CSS hides them visually and leaves them in the
 * accessibility tree, so a screen reader hears "Jobs" whether or not you can see it.
 * `title` covers the sighted case, since an icon on its own is a guess until you hover.
 */
function Rail({
  collapsed,
  onToggleCollapsed,
  drawerOpen,
  onCloseDrawer
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
}) {
  return (
    <aside
      className={
        "app-side" + (collapsed ? " is-collapsed" : "") + (drawerOpen ? " is-open" : "")
      }
      // Hidden from everyone, not just from view, when the drawer is shut. Left visible
      // it would still be in the tab order — a screen reader walking a menu that is not
      // on screen is the classic off-canvas bug.
      inert={drawerOpen ? undefined : true}
    >
      <div className="app-side-head">
        {/* Two files, not one image scaled: the mark is a separate asset because the
            wordmark at 28px is unreadable rather than small. */}
        <img
          src={collapsed ? "/faivcon.png" : "/lofty_logo_orange.png"}
          alt="Lofty"
          className={"app-logo" + (collapsed ? " app-logo-mark" : "")}
        />
        {/* G3 — the styled tooltip, from @vibe/tooltip (pinned to the version core
            already carries; core's own bundle doesn't export the type). Shows on focus
            as well as hover, which the native title never did. */}
        <Tooltip content={collapsed ? "Expand navigation" : "Collapse navigation"} position="right">
          <button
            type="button"
            className="app-side-toggle"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation to icons"}
          >
            {collapsed
              ? <NavigationChevronRight aria-hidden size={16} />
              : <NavigationChevronLeft aria-hidden size={16} />}
          </button>
        </Tooltip>
      </div>

      <nav className="app-nav" aria-label="Main">
        {PAGES.map(p => {
          const Icon = p.icon;
          const link = (
            <NavLink
              key={p.to}
              to={p.to}
              end={p.end}
              // On a phone the rail is a drawer over the page — leaving it open on top of
              // the destination you just chose is the thing everyone complains about.
              onClick={onCloseDrawer}
              className={({ isActive }) => "app-nav-item" + (isActive ? " is-active" : "")}
            >
              <span className="app-nav-icon" aria-hidden><Icon size={20} /></span>
              <span className="app-nav-label">{p.label}</span>
            </NavLink>
          );
          // Collapsed, the icon is all a sighted person gets — the tooltip names it on
          // hover AND focus, which the old native title never did for a keyboard.
          return collapsed ? (
            <Tooltip key={p.to} content={p.label} position="right">
              {link}
            </Tooltip>
          ) : (
            link
          );
        })}
      </nav>
    </aside>
  );
}

/**
 * The frame every page sits in.
 *
 * A row: the rail down the left, everything else in a column beside it. That column is
 * still a flex column so the footer lands at the bottom of a short viewport instead of
 * floating mid-screen, and the scrollbar still belongs to the page.
 *
 * The theme control lives on Settings rather than up here — it is a preference, and the
 * top bar is for search and identity.
 */
export function AppShell() {
  const { query, setQuery } = useSearch();
  const { error: authError } = useAuth();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(RAIL_KEY) === "1"
  );
  /** Narrow only. Kept apart from `collapsed` because they are different questions:
   *  one is a preference that persists, the other is "is the drawer showing right now". */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT}px)`).matches
  );

  useEffect(() => {
    localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  // Watched rather than left to CSS alone: the drawer's open/closed state has to exist in
  // JS too, for `inert` and for the Escape handler, and those must agree with the layout.
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      setNarrow(e.matches);
      // Dragging a window wider should not leave a stale overlay sitting over the page.
      if (!e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Belt and braces alongside the per-link handler: a redirect changes the route without
  // anybody clicking a link, and the drawer should not survive that either.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  return (
    <ToastsProvider>
    <AskDockProvider>
    <FeedbackProvider>
    <div className={"app-shell" + (narrow ? " is-narrow" : "")}>
      <a className="skip-link" href="#main">Skip to content</a>

      <Rail
        collapsed={collapsed && !narrow}
        onToggleCollapsed={() => setCollapsed(c => !c)}
        drawerOpen={!narrow || drawerOpen}
        onCloseDrawer={closeDrawer}
      />

      {/* Only rendered when it can do something, so there is never an invisible click
          target sitting over the page on a desktop. */}
      {narrow && drawerOpen && (
        <button
          type="button"
          className="app-side-scrim"
          aria-label="Close navigation"
          onClick={closeDrawer}
        />
      )}

      <div className="app-body">
        <header className="app-header" role="banner">
          {narrow && (
            <button
              type="button"
              className="app-menu-button"
              onClick={() => setDrawerOpen(o => !o)}
              aria-expanded={drawerOpen}
              aria-label="Navigation"
            >
              <Menu size={20} aria-hidden />
            </button>
          )}

          {/* A filter on the view you are looking at, not a separate results page —
              type on the board and the board narrows. Same as the prototype. */}
          <span className="app-search">
            {/* `inputAriaLabel`, not `aria-label` — Vibe's TextField writes its own
                aria-label from the placeholder and drops anything passed through, so a
                plain aria-label here is silently ignored. An explicit id too: without
                one every TextField on the page renders id="input". */}
            <TextField
              id="app-search"
              type="search"
              placeholder="Search jobs…"
              value={query}
              onChange={setQuery}
              size="small"
              inputAriaLabel="Search jobs and projects"
            />
          </span>

          <div className="app-header-right">
            {/* Ask sits before the bell: it is a thing you go and do, where the bell is
                a thing that happens to you, and reading left to right the active one
                comes first. Both are the same 32px target, so the pair reads as one
                cluster rather than two decisions. */}
            <AskButton />
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        {authError && (
          <div className="app-alert" role="alert">
            <Text type="text2" element="span" ellipsis={false}>
              <strong>Sign-in failed.</strong> {authError}
            </Text>
          </div>
        )}

        <main id="main" role="main" tabIndex={-1} className="app-main">
          <Outlet />
        </main>

        <footer className="app-foot" role="contentinfo">
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            {/* The year is computed, not written down — a hardcoded one is wrong every
                January and nobody notices until a client does. */}
            <span className="app-foot-name">
              Lofty © {new Date().getFullYear()} Project Management App
              {" "}
              <span className="app-foot-version" title={`Netlify context: ${__BUILD_CONTEXT__}`}>
                v{__BUILD_REF__}
              </span>
            </span>
            {/* Reporting sits with the footer's other standing links rather than in a
                menu: the moment somebody wants to report a bug is the moment they hit
                one, on whatever screen they were on. */}
            <span className="app-foot-links">
              <FeedbackButtons />
              {/* Privacy and Terms sit OUTSIDE the auth gate deliberately: a policy nobody
                  can read without signing in is not published. Support is Lofty's own
                  portal, hence a full URL and rel="noreferrer". */}
              <NavLink to="/privacy">Privacy Policy</NavLink>
              <NavLink to="/terms">Terms</NavLink>
              <a href="https://app.lofty.com.au" target="_blank" rel="noreferrer noopener">
                Support
              </a>
            </span>
          </Text>
        </footer>
      </div>
    </div>
    </FeedbackProvider>
    </AskDockProvider>
    </ToastsProvider>
  );
}
