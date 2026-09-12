import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Dialog, DialogContentContainer, Text } from "@vibe/core";
import { Bookmark, Menu, Note, Search, Settings, CheckList } from "@vibe/icons";
import { initialsOf, useAuth } from "../data/AuthProvider";
import { InboxProvider } from "../data/InboxProvider";
import { usePermission } from "../data/PermissionProvider";
import { GlobalSearch } from "../components/GlobalSearch";
import { AskButton, AskDockProvider } from "../components/AskDock";
import { FeedbackButtons, FeedbackProvider } from "../components/Feedback";
import { NotificationsBell } from "../components/NotificationsBell";
import { ToastsProvider } from "../components/Toasts";
import { UndoProvider } from "../data/UndoProvider";
import { UndoRedoBar } from "../components/UndoRedoBar";
import { greetingName } from "../data/types";
import { AdminConsole, Dashboard } from "../theme/railIcons";
import { NavRail, NavRailGroup, type RailLink } from "./NavRail";
import { useNavDestinations } from "./navDestinations";
import { PinnedSection } from "./PinnedSection";
import "./AppShell.css";

const RAIL_KEY = "lofty-nav-collapsed";
/** Below this the rail cannot share a line with the page, so it becomes a drawer. */
const DRAWER_BREAKPOINT = 900;

/**
 * Which destination the current URL belongs to.
 *
 * Prefix matching on the pathname, longest first, because `/jobs/1209-002` is still Jobs
 * and `/setup/processes` is still Settings. Exact matching would leave the rail unlit on
 * every record and every settings tab — which is the state it spent months in on the old
 * shell, where `NavLink`'s `end` was set on one item and forgotten on the rest.
 */
function activeIdFor(pathname: string, ids: { id: string; to: string }[]): string | null {
  let best: { id: string; length: number } | null = null;
  for (const d of ids) {
    const base = d.to.split("?")[0];
    if (pathname === base || pathname.startsWith(base + "/")) {
      if (!best || base.length > best.length) best = { id: d.id, length: base.length };
    }
  }
  return best?.id ?? null;
}

/**
 * Your name at the foot of the rail, and the two things that are yours behind it.
 *
 * It was in the header, and moved on 11 September with Search, Settings and Admin —
 * decision 10: *"a slim bar survives, holding only undo/redo, Ask Lofty and the
 * notifications bell — the rail owns navigation and identity, the bar owns 'what I just
 * did' and 'what happened to me'."* Those four are **removed** from the header rather
 * than left there to duplicate the rail.
 *
 * The label stays "User settings" rather than "Settings": the rail now has a Settings
 * row two lines above this one, and the app's dials and yours are not the same thing.
 */
function UserMenu({ collapsed }: { collapsed: boolean }) {
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

  const name = profile ? greetingName(profile) : "Account";

  return (
    <Dialog
      open={open}
      onClickOutside={close}
      content={content}
      position={collapsed ? "right-end" : "top-start"}
      showTrigger={[]}
      hideTrigger={[]}
    >
      <button
        type="button"
        className={collapsed ? "nav-icon-btn nav-user-btn" : "nav-row"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={collapsed ? name : undefined}
        title={collapsed ? name : undefined}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "Escape") close(); }}
      >
        {/* Crisp Orange with white initials — the pairing Amber named as acceptable on
            11 September, at 2.6:1. Not Vibe's Avatar: that paints its own theme colour
            and sizes itself, and this is 24px on the rail and 32px collapsed. */}
        <span className="nav-user-avatar" aria-hidden>
          {profile ? initialsOf(profile) : "?"}
        </span>
        {!collapsed && <span className="nav-row-label">{name}</span>}
      </button>
    </Dialog>
  );
}

/**
 * The frame every page sits in.
 *
 * A row: the rail down the left, everything else in a column beside it. That column is
 * still a flex column so the footer lands at the bottom of a short viewport instead of
 * floating mid-screen, and the scrollbar still belongs to the page.
 *
 * Rebuilt on 11 September from `docs/design/handoff/sidebar-navigation/`. What changed,
 * and it is all of the chrome: the rail is 224/64 rather than 232/68, dark with a white
 * wash for selection rather than a white pill with teal ink, and it now carries search,
 * My work, the six destinations, Settings, Admin and you. The header is what is left.
 */
/**
 * My work — Inbox and Tasks.
 *
 * NEITHER ROW CARRIES A NUMBER, AND THAT IS A DECISION RATHER THAN AN OMISSION
 *
 *   Both badges were built on 11 September — *"Inbox and tasks should have a badge"* —
 *   and taken out again the same day, by Amber: *"they ideally will be for new since
 *   last check on inbox and open tasks but if not correct then will just be ignored. So
 *   until counts are verified and tested remove."*
 *
 *   The two she wants are **new since you last looked** on Inbox and **open tasks** on
 *   Tasks. The first does not exist yet: nothing records when you last looked at the
 *   dashboard, so the honest options were unread notifications (the bell's number, a
 *   different fact) or nothing. The second exists but had not been checked against a
 *   real board. A badge that is nearly right is worse than none, because it is the kind
 *   of wrong nobody reports — they just stop believing the number.
 *
 *   What the build still carries, because none of it is on screen: `InboxProvider` holds
 *   the bell's state, so the rail can read the same number rather than a second one when
 *   the definition is settled; `.nav-row-badge` and `.nav-row-dot` keep their styles in
 *   `NavRail.css`; and `NavRailGroup` still takes `alert`. The count query and the
 *   `RailCounts.myOpenTasks` field went, because an unread round trip on every
 *   navigation for a number nobody sees is a cost with no reader.
 */
function MyWorkGroup({
  open, onToggle, collapsed, onExpandRail, activeId, link
}: {
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
  onExpandRail: () => void;
  activeId: string | null;
  link: RailLink;
}) {
  return (
    <NavRailGroup
      id="myWork"
      label="My work"
      icon={Dashboard}
      iconSize={28}
      open={open}
      onToggle={onToggle}
      collapsed={collapsed}
      onExpandRail={onExpandRail}
    >
      {/* Inbox IS the old dashboard (decision 1) — no new table, no new feed, just the
          name that says what the page is for. Tasks is `/tasks` unchanged: four views,
          saved-view tabs, bulk bar. */}
      {link(
        { label: "Inbox", to: "/dashboard" },
        "nav-row" + (activeId === "inbox" ? " is-active" : ""),
        () => {},
        <>
          <span className="nav-row-icon"><Note size={20} /></span>
          <span className="nav-row-label">Inbox</span>
        </>,
        { "aria-current": activeId === "inbox" ? "page" : undefined }
      )}
      {link(
        { label: "Tasks", to: "/tasks" },
        "nav-row" + (activeId === "tasks" ? " is-active" : ""),
        () => {},
        <>
          <span className="nav-row-icon"><CheckList size={20} /></span>
          <span className="nav-row-label">Tasks</span>
        </>,
        { "aria-current": activeId === "tasks" ? "page" : undefined }
      )}
    </NavRailGroup>
  );
}

export function AppShell() {
  const { error: authError } = useAuth();
  const location = useLocation();
  const { can } = usePermission();
  const { destinations } = useNavDestinations();

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(RAIL_KEY) === "1"
  );
  /** Narrow only. Kept apart from `collapsed` because they are different questions:
   *  one is a preference that persists, the other is "is the drawer showing right now". */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia(`(max-width: ${DRAWER_BREAKPOINT}px)`).matches
  );
  /** Both start closed — the handoff's call, and the rail's job at rest is the six rows. */
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const toggleGroup = (id: string) =>
    setOpenGroups(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const searchBox = useRef<HTMLDivElement>(null);
  /** Set by the collapsed search button, read once the rail has widened. */
  const wantSearchFocus = useRef(false);

  useEffect(() => {
    localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0");
    if (!collapsed && wantSearchFocus.current) {
      wantSearchFocus.current = false;
      searchBox.current?.querySelector("input")?.focus();
    }
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

  /**
   * The footer's height, published as `--shell-foot-h` beside the rail's width and the
   * header's height.
   *
   * The other two are constants in CSS; this one cannot be, because the footer wraps to
   * two lines on a narrow window and to three on a phone. It is measured so that a panel
   * expanded into the dock can be exactly the space between the header and the footer —
   * which is what makes the record fill the window and scroll its own body, rather than
   * growing to its content and pushing the conversation tabs below the fold.
   *
   * `ResizeObserver`, not a one-off read: the wrap point depends on the window, and a
   * height measured at first paint is wrong the moment somebody drags the window.
   */
  const foot = useRef<HTMLElement>(null);
  const [footHeight, setFootHeight] = useState(0);
  useEffect(() => {
    const el = foot.current;
    if (!el) return;
    // The BORDER box, not `contentRect` — which is the content box and excludes the
    // footer's 24px of padding top and bottom. Measured that way the footer reported 24
    // where it draws 72, the dock was 48px too tall, and the page grew a scrollbar with
    // nothing to scroll to.
    const ro = new ResizeObserver(() => {
      setFootHeight(Math.round(el.getBoundingClientRect().height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Belt and braces alongside the per-link handler: a redirect changes the route without
  // anybody clicking a link, and the drawer should not survive that either.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  /** The drawer is always full width, whatever the stored preference says. */
  const railCollapsed = collapsed && !narrow;

  /**
   * How a rail row becomes a link.
   *
   * Passed into `NavRail` rather than imported by it, so that component never sees the
   * router — the design-system version of it will not have one, and the two are meant to
   * converge. `Link`, not `NavLink`: selection is computed once here from the pathname
   * (`activeIdFor`) rather than per link, because a flyout row carries a query string
   * that `NavLink` would ignore and light up wrongly.
   */
  const link = useCallback(
    (
      item: { label: string; to: string },
      className: string,
      onClick: () => void,
      body: ReactNode,
      extra?: Record<string, unknown>
    ) => (
      <Link
        key={`${className}:${item.to}`}
        to={item.to}
        className={className}
        // On a phone the rail is a drawer over the page — leaving it open on top of the
        // destination you just chose is the thing everyone complains about.
        onClick={() => { onClick(); closeDrawer(); }}
        {...extra}
      >
        {body}
      </Link>
    ),
    [closeDrawer]
  );

  const activeId = useMemo(
    () => activeIdFor(location.pathname, [
      ...destinations,
      // Not destinations, but they light the same way. `/setup` is Settings and
      // `/settings` is your own — two words for two unrelated things, which is exactly
      // why the rail's row says Settings and the menu under your name says User settings.
      { id: "settings", to: "/setup" },
      { id: "admin", to: "/admin" },
      { id: "inbox", to: "/dashboard" },
      { id: "tasks", to: "/tasks" }
    ]),
    [location.pathname, destinations]
  );

  const footRow = (to: string, label: string, icon: ReactNode, id: string) =>
    link(
      { label, to },
      (railCollapsed ? "nav-icon-btn" : "nav-row") + (activeId === id ? " is-active" : ""),
      () => {},
      railCollapsed ? icon : (
        <>
          <span className="nav-row-icon">{icon}</span>
          <span className="nav-row-label">{label}</span>
        </>
      ),
      {
        title: railCollapsed ? label : undefined,
        "aria-label": railCollapsed ? label : undefined,
        "aria-current": activeId === id ? "page" : undefined
      }
    );

  return (
    <ToastsProvider>
    <UndoProvider>
    <AskDockProvider>
    <FeedbackProvider>
    {/* Above the rail AND the header, because the Inbox badge and the bell are the same
        number read once — see `InboxProvider`. */}
    <InboxProvider>
    <div
      className={"app-shell" + (narrow ? " is-narrow" : "")}
      style={{ "--shell-foot-h": `${footHeight}px` } as CSSProperties}
    >
      <a className="skip-link" href="#main">Skip to content</a>

      <aside
        className={
          "nav-rail" + (railCollapsed ? " is-collapsed" : "") + (drawerOpen ? " is-open" : "")
        }
        // Hidden from everyone, not just from view, when the drawer is shut. Left visible
        // it would still be in the tab order — a screen reader walking a menu that is not
        // on screen is the classic off-canvas bug.
        inert={narrow && !drawerOpen ? true : undefined}
      >
        <NavRail
          collapsed={railCollapsed}
          destinations={destinations}
          activeId={activeId}
          onToggleCollapse={() => setCollapsed(c => !c)}
          link={link}
          header={
            /* Two files, not one image scaled: the wordmark at 26px is unreadable
               rather than small, so collapsed gets the twin-triangle mark. */
            <Link to="/" className="nav-logo-link" aria-label="Lofty Hub — home">
              <img
                src={railCollapsed ? "/faivcon.png" : "/lofty_logo_orange.png"}
                alt="Lofty Hub"
                className={"nav-logo" + (railCollapsed ? " nav-logo-mark" : "")}
              />
            </Link>
          }
          search={<div ref={searchBox}><GlobalSearch /></div>}
          groups={
            <>
              {railCollapsed && (
                <button
                  type="button"
                  className="nav-icon-btn"
                  title="Search"
                  aria-label="Search"
                  onClick={() => { wantSearchFocus.current = true; setCollapsed(false); }}
                >
                  <Search size={20} />
                </button>
              )}

              <MyWorkGroup
                open={openGroups.has("myWork")}
                onToggle={() => toggleGroup("myWork")}
                collapsed={railCollapsed}
                onExpandRail={() => setCollapsed(false)}
                activeId={activeId}
                link={link}
              />

              <div className="nav-rule" />

              {/* Pinned (0112). Bookmark, the design system's own — `ICONS.md` lists it
                  among the glyphs the Lofty set should not redraw. 24px collapsed, where
                  a Lofty glyph would take 28: this one fills its box. */}
              <NavRailGroup
                id="pinned"
                label="Pinned"
                icon={Bookmark}
                iconSize={24}
                open={openGroups.has("pinned")}
                onToggle={() => toggleGroup("pinned")}
                collapsed={railCollapsed}
                onExpandRail={() => setCollapsed(false)}
              >
                <PinnedSection collapsed={railCollapsed} link={link} />
              </NavRailGroup>
            </>
          }
          footer={
            <>
              {/* Manager and above, matching `0096_settings_belong_to_the_managers`.
                  Filtered rather than disabled: a greyed-out destination is an invitation
                  to ask why, and "you are a user, not a manager" is not something a nav
                  rail says well. The policy is what actually refuses it. */}
              {can("manager") && footRow("/setup", "Settings", <Settings size={20} />, "settings")}
              {/* Admin and above. Not rendered at all below that rung — there is nothing
                  useful to tell somebody about a door that is not theirs, and `/admin` is
                  refused by its own route guard and by every policy behind it either way. */}
              {can("admin") && footRow("/admin", "Admin", <AdminConsole size={20} />, "admin")}
            </>
          }
          user={<UserMenu collapsed={railCollapsed} />}
        />
      </aside>

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
        {/* The slim bar (decision 10). Search, the user menu, Settings and Admin have
            gone to the rail; what is left is what the rail is not for — undo and redo,
            which are about what you just did to the page, and Ask and the bell, which are
            about what you want and what happened to you. */}
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

          <div className="app-header-right">
            <UndoRedoBar />
            {/* Ask sits before the bell: it is a thing you go and do, where the bell is a
                thing that happens to you, and reading left to right the active one comes
                first. Both are the same 32px target, so the pair reads as one cluster. */}
            <AskButton />
            <NotificationsBell />
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

        {/* Where a panel goes when it is expanded to full screen.
            ==========================================================================
            Amber, 12 September, looking at the expanded job record: *"the full screen
            view sits inside the main frame so still has top and side nav and footer"*.

            It already kept the rail and the top bar — that was her 26 August call, and
            `.app-shell` says so — but it was a fixed overlay from the header down to
            `bottom: 0`, which put it OVER the footer. The footer was still in the
            document, still 72px tall, and completely invisible.

            Reserving footer-height at the bottom of the viewport would not have fixed
            it: the footer is at the bottom of the DOCUMENT, so on any page taller than
            the window that strip shows the board behind rather than the footer.

            So an expanded panel stops being an overlay and becomes a row of the frame:
            it portals in here, `.app-main` hides while it is here, and the footer
            follows it down the page like it follows anything else. Empty the rest of
            the time, and `:empty` keeps it out of the layout. */}
        <div id="panel-dock" className="app-dock" />

        <footer className="app-foot" role="contentinfo" ref={foot}>
          <Text type="text3" color="secondary" element="div" ellipsis={false}>
            {/* The year is computed, not written down — a hardcoded one is wrong every
                January and nobody notices until a client does. */}
            <span className="app-foot-name">
              Lofty © {new Date().getFullYear()} Project Management App
              {" "}
              <span className="app-foot-version" title={`${__BUILD_HOST__} · ${__BUILD_CONTEXT__}`}>
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
              <Link to="/updates">Updates</Link>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms</Link>
              <a href="https://app.lofty.com.au" target="_blank" rel="noreferrer noopener">
                Support
              </a>
            </span>
          </Text>
        </footer>
      </div>
    </div>
    </InboxProvider>
    </FeedbackProvider>
    </AskDockProvider>
    </UndoProvider>
    </ToastsProvider>
  );
}
