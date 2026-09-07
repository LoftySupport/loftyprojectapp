import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Heading, Loader, Text, ThemeProvider } from "@vibe/core";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { loftyTheme, type SystemTheme } from "./theme/loftyTheme";
import { AuthProvider, useAuth } from "./data/AuthProvider";
import { LegalPage } from "./pages/LegalPage";
import { NotSetUpPage } from "./pages/NotSetUpPage";
import { DemoGatePage } from "./pages/DemoGatePage";
import { ReportPage } from "./pages/ReportPage";
import { SharedDocumentPage } from "./pages/SharedDocumentPage";
import { SignInPage } from "./pages/SignInPage";
import { DataProvider } from "./data/DataProvider";
import { PermissionProvider, usePermission } from "./data/PermissionProvider";
import { type PermissionLevel } from "./data/types";
import { SearchProvider } from "./data/SearchProvider";
import { AppShell } from "./shell/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { JobsPage } from "./pages/JobsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { ContactsPage } from "./pages/ContactsPage";
import { MaintenancePage } from "./pages/MaintenancePage";
import { AdminPage } from "./pages/AdminPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";
import { UpdatesPage } from "./pages/UpdatesPage";
import { LANDING_ROUTES, readPrefs } from "./data/preferences";

const THEME_KEY = "lofty-theme";

/**
 * The gate.
 *
 * Two conditions, not one: a Microsoft session **and** a Lofty staff record. Anyone in
 * the Entra directory can pass the first; only someone created in the app passes the
 * second.
 *
 * Nothing renders without a session — not the board, not the dictionary, not an empty
 * page with the nav on it. The cost of that is real and worth stating: a deploy preview
 * now needs a Lofty account to review, so a PR cannot be eyeballed by anyone outside the
 * directory.
 *
 * `loading` renders a wait rather than the sign-in page, because a session restored from
 * local storage arrives a beat after first paint — redirecting on it would flash the
 * sign-in screen at every already-signed-in person on every reload.
 *
 * `unavailable` — a build with no Supabase client — goes to the sign-in page too, where
 * it says so. A gated app that quietly ungates itself when its configuration is missing
 * is worse than one that stops.
 */
function RequireAuth() {
  const { status, profileState, profile } = useAuth();
  const location = useLocation();

  if (status === "loading") {
    return (
      <div className="app-wait" role="status" aria-live="polite">
        <Loader size="medium" />
      </div>
    );
  }
  if (status !== "signed-in") {
    // `state` carries where they were headed, so a deep link survives the round trip
    // through Microsoft instead of dumping everyone on the dashboard.
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }

  // A session is not admission. Only people created in the app have a profiles row, and
  // without one every RLS policy denies — so rendering the board would show an empty
  // shell that looks broken rather than closed.
  if (profileState === "loading") {
    return (
      <div className="app-wait" role="status" aria-live="polite">
        <Loader size="medium" />
      </div>
    );
  }
  if (profileState === "unlinked") return <NotSetUpPage />;

  // Held at the door (0049). The database has already stopped them — every read hangs
  // off is_active_user(), which a demo account fails — so this is the screen that says
  // so rather than letting them meet an app full of empty tables and read it as broken.
  if (profile?.isDemo) return <DemoGatePage />;

  return <Outlet />;
}

/**
 * Signed in with a profile, whether or not they are held at the demo gate.
 *
 * `RequireAuth` minus its last line, and that line is the difference: it exists for
 * `/report` (Amber, 1 Sep), so a person who cannot use the app can still tell Lofty what
 * they need. `0075` is the half of that which matters — the database lets a held account
 * write one table — and this is only the routing that lets them reach the form.
 *
 * Everything else stays behind `RequireAuth`. A guard that admits held accounts must
 * never be the app's general one: the gate is the product decision, and this is a
 * deliberate hole of exactly one page.
 */
function RequireSignedIn() {
  const { status, profileState } = useAuth();
  const location = useLocation();

  if (status === "loading" || profileState === "loading") {
    return (
      <div className="app-wait" role="status" aria-live="polite">
        <Loader size="medium" />
      </div>
    );
  }
  if (status !== "signed-in") {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  // Still refused without a profile row: that is not "held", it is "not on the staff
  // list", and no policy would accept their insert either.
  if (profileState === "unlinked") return <NotSetUpPage />;

  return <Outlet />;
}

/**
 * A rung on the route, for the two screens that are not everybody's.
 *
 * Amber, 4 September: Settings is *"for managers and above"* and Admin appears *"when an
 * admin or super admin login"*. The nav already declines to draw what is not yours
 * (`PAGES[].need` in AppShell), but a nav item is not a boundary — a URL typed, pasted
 * from Teams, or left in somebody's history reaches the route regardless, and until this
 * existed it rendered the whole screen.
 *
 * THIS IS STILL NOT THE SECURITY BOUNDARY, and the file it lives in should say so once:
 * RLS is. Every table behind Settings and Admin has a policy, so a manager who reached
 * /admin/users before today saw an empty list rather than the company — this turns that
 * into an answer instead of a screen that looks broken.
 */
function RequireLevel({ need }: { need: PermissionLevel }) {
  const { can } = usePermission();
  if (!can(need)) return <NoAccess need={need} />;
  return <Outlet />;
}

/**
 * What a person below the rung is told.
 *
 * It names the rung and their own level, and stops. No invented "request access" button
 * that posts nowhere, and no list of what they are missing: the honest content of this
 * page is which door this is, who it is for, and who to ask.
 */
function NoAccess({ need }: { need: PermissionLevel }) {
  const { permission } = usePermission();
  const location = useLocation();
  return (
    <section className="panel not-found">
      <Heading type="h2">{location.pathname.startsWith("/admin") ? "Admin" : "Settings"} is for {need}s and above</Heading>
      <Text type="text2" color="secondary" element="p">
        You are signed in with <strong>{permission}</strong> access. An admin can change
        that on the Admin screen if you need it.
      </Text>
      <NavLink to="/">Go to the dashboard</NavLink>
    </section>
  );
}

/** Signing in and then being shown the sign-in page again reads as a failure. */
function RedirectIfSignedIn() {
  const { status } = useAuth();
  if (status === "signed-in") return <Navigate to="/" replace />;
  return <SignInPage />;
}

/**
 * The index route honours the landing-page preference (G39). "/" is the app's one front
 * door — sign-in and the header logo both point here — and this decides what it opens
 * onto, so the preference needs no second URL scheme to work.
 *
 * ============================================================================
 * THE DASHBOARD HAS ITS OWN URL, AND IT HAS TO
 *
 *   This used to render `<DashboardPage />` here when the preference was Dashboard, and
 *   redirect otherwise. That made "/" mean two different things, and it cost the
 *   dashboard its only way in: the nav's Dashboard link pointed at "/", so for anybody
 *   whose landing page was Projects, clicking Dashboard went to "/" and was immediately
 *   sent to /projects. **The page was unreachable, and it looked like the link was
 *   broken rather than like a setting doing its job.**
 *
 *   Reported by Amber, 31 Aug: "dashboard isn't working — it changes to project screen."
 *
 *   So the dashboard is `/dashboard`, like every other page, and "/" only ever forwards.
 *   The rule the app already follows everywhere else — a screen is a URL — turns out to
 *   apply to the front door too: a route that is sometimes a page and sometimes a
 *   redirect cannot be linked to when it is in the wrong mood.
 * ============================================================================
 */
function Landing() {
  return <Navigate to={LANDING_ROUTES[readPrefs().landingPage]} replace />;
}

/**
 * The catch-all. Without it an unknown URL rendered a completely blank page — no shell,
 * no message, no way back — which is the worst possible answer to a stale bookmark or a
 * typo in a pasted link. Says what happened rather than silently redirecting: a person
 * who followed a dead link deserves to know the link was dead, not to wonder why it
 * landed them somewhere else.
 */
function NotFound() {
  const location = useLocation();
  return (
    <section className="panel not-found">
      <Heading type="h2">There's nothing at {location.pathname}</Heading>
      <Text type="text2" color="secondary" element="p">
        The address may have moved, or the link may have a typo. Everything in the app is
        reachable from the navigation on the left.
      </Text>
      <NavLink to="/">Go to the dashboard</NavLink>
    </section>
  );
}

/**
 * The two routes whose second segment is a record rather than a page.
 *
 * Speed Insights groups its numbers by the `route` it is given, and given none it groups
 * by the literal path — so once there are jobs, `/jobs/1042-001` and `/jobs/1042-002`
 * would be two rows with one sample each, and the dashboard would have nothing to say
 * about how the Jobs page performs.
 *
 * `:section` is deliberately NOT in here. `/tools/template-builder` and `/setup/processes`
 * are pages from a short fixed list, and seeing them apart is the point.
 *
 * A Map rather than an object literal so a path segment called `constructor` is a miss
 * rather than a hit. It lives beside the routes it mirrors: adding a parameterised route
 * means editing the block below, and this is the paragraph above it.
 */
const RECORD_ROUTES = new Map([
  ["projects", "/projects/:projectNumber"],
  ["jobs", "/jobs/:jobNumber"]
]);

/**
 * Speed Insights, and only where its endpoint exists.
 *
 * Vercel is the host, and it serves `/_vercel/speed-insights/script.js`. The gate is not
 * about which host — it is about whether that endpoint exists: `npm run dev` and
 * `npm run preview` do not serve it, and mounting this there would put a 404 in the
 * console and collect nothing for it.
 *
 * The full URL reaches Vercel either way — it is the host, and its access log already
 * has every path — so `route` is about the dashboard being readable, not about holding
 * anything back.
 */
function SpeedInsightsOnVercel() {
  const { pathname } = useLocation();
  if (__BUILD_HOST__ !== "vercel") return null;
  const [, head, tail, ...rest] = pathname.split("/");
  const grouped = tail && rest.length === 0 ? RECORD_ROUTES.get(head) : undefined;
  return <SpeedInsights route={grouped ?? pathname} />;
}

export default function App() {
  const [theme, setTheme] = useState<SystemTheme>(() => {
    const saved = localStorage.getItem(THEME_KEY) as SystemTheme | null;
    if (saved) return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    localStorage.setItem(THEME_KEY, theme);
    // ThemeProvider scopes its class to its own subtree; the tokens.css overrides key
    // off the same class, so mirror it on <body> for anything outside that tree.
    document.body.classList.toggle("dark-app-theme", theme !== "light");
    document.body.classList.toggle("black-app-theme", theme === "black");
    // And the design system's own switch, on <html>: its dark.css declares the whole
    // --lofty-dark-* palette under [data-theme="dark"], and tokens.css references those
    // names. Without this stamp they are undefined and the dark theme silently falls back
    // to the light values. Body classes cannot do this job on their own — they win the
    // specificity fight against Vibe, but they are not where the mirror declares its palette.
    document.documentElement.dataset.theme = theme === "light" ? "light" : "dark";
  }, [theme]);

  return (
    <ThemeProvider themeConfig={loftyTheme} systemTheme={theme}>
      {/* Order matters, outermost first: AuthProvider asks the repository for the
          signed-in profile, and PermissionProvider reads its level off that profile. */}
      <DataProvider>
      <AuthProvider>
      <PermissionProvider>
      <SearchProvider>
        {/* BASE_URL rather than a literal, so `base` in vite.config.ts stays the one
            place the app's location is decided — the OAuth redirectTo reads it too. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          {/* Inside the router because it needs the current path; a sibling of <Routes>
              rather than inside one, so it mounts once and survives navigation. */}
          <SpeedInsightsOnVercel />
          <Routes>
            <Route path="signin" element={<RedirectIfSignedIn />} />
            {/* Public, and outside RequireAuth on purpose: a policy that cannot be read
                without an account has not been published. */}
            <Route path="privacy" element={<LegalPage kind="privacy" />} />
            <Route path="terms" element={<LegalPage kind="terms" />} />
            {/* The one route that renders to somebody with no Lofty account. Outside
                RequireAuth because that is the whole point of a share link, and outside
                AppShell because a client should get the document and not our navigation.

                It reads nothing through the repository — see the file. Everything it
                shows comes from the report-share endpoint, which returns one stored
                snapshot: no jobs, no properties, no people, nothing to scope wrongly. */}
            <Route path="shared/:token" element={<SharedDocumentPage />} />
            {/* Outside RequireAuth on purpose — see RequireSignedIn. This is the one
                page a held account may open. */}
            <Route element={<RequireSignedIn />}>
              <Route path="report" element={<ReportPage />} />
            </Route>
            <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<Landing />} />
              <Route path="dashboard" element={<DashboardPage />} />
              {/* A record is a URL. The drawer and the detail view used to be component
                  state, which made an open job unlinkable, unbookmarkable, and lost on
                  refresh — and put Back on the browser's "leave the page" behaviour
                  rather than "close what I opened".

                  Flat, not nested under the project: a job number already carries its
                  project (PRJ-001-02), so /projects/PRJ-001/PRJ-001-02 would repeat it
                  for a longer URL and a second way to say the same thing. */}
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="projects/:projectNumber" element={<ProjectsPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="jobs/:jobNumber" element={<JobsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="contacts" element={<ContactsPage />} />
              {/* Tools: things you use to make something, as opposed to the records you
                  work on. One tab today — the report Template Builder — and the section
                  is in the path so the second one is a route rather than a rewrite. */}
              <Route path="tools" element={<ToolsPage />} />
              <Route path="tools/:section" element={<ToolsPage />} />
              <Route path="maintenance" element={<MaintenancePage />} />
              {/* Processes are configuration, not a destination (Amber, 2 Sep: "processes
                  are not a page on the sidebar, they are part of setup only"). The two
                  addresses the page has had — /templates until 1 Sep, /processes after —
                  both land on Setup → Processes, so nothing bookmarked or pasted into Teams
                  goes dead. */}
              <Route path="processes" element={<Navigate to="/setup/processes" replace />} />
              <Route path="templates" element={<Navigate to="/setup/processes" replace />} />
              {/* Admin, behind the header cog rather than the sidebar (Amber, 4 Sep).
                  The section is in the path like Settings' — a link to Teams or to the
                  bug queue is a link somebody can send. Two rungs, two guards: this one
                  is admin's, Settings below is manager's. */}
              <Route element={<RequireLevel need="admin" />}>
                <Route path="admin" element={<AdminPage />} />
                <Route path="admin/:section" element={<AdminPage />} />
              </Route>
              <Route
                path="settings"
                element={<SettingsPage theme={theme} onThemeChange={setTheme} />}
              />
              {/* Settings owns the dials a manager turns: properties, processes,
                  contacts, maintenance, and the SLAs and notification rules on
                  Automations. The section is in the path so a tab can be linked to.
                  It kept the /setup path when it was renamed — /settings is the personal
                  screen above, and swapping the two would break every bookmark in the
                  company to save a word. */}
              {/* The tracker everybody can see: what has been asked for, what is
                  planned, and what shipped. The section is in the path so a link to
                  the roadmap is a link somebody can send. */}
              <Route path="updates" element={<UpdatesPage />} />
              <Route path="updates/:section" element={<UpdatesPage />} />
              <Route element={<RequireLevel need="manager" />}>
                <Route path="setup" element={<SetupPage />} />
                <Route path="setup/:section" element={<SetupPage />} />
              </Route>
              {/* The old top-level routes still resolve — they were in the nav for
                  weeks and will be in somebody's bookmarks and Teams messages. Both now
                  land on Admin: the dictionary and the wiring went there with the cog on
                  4 September, and a redirect that lands on a tab which no longer exists
                  is worse than the dead link it was meant to fix. */}
              <Route path="dictionary" element={<Navigate to="/admin/dictionary" replace />} />
              <Route path="wiring" element={<Navigate to="/admin/wiring" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </SearchProvider>
      </PermissionProvider>
      </AuthProvider>
      </DataProvider>
    </ThemeProvider>
  );
}
