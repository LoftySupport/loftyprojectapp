import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Heading, Loader, Text, ThemeProvider } from "@vibe/core";
import { loftyTheme, type SystemTheme } from "./theme/loftyTheme";
import { AuthProvider, useAuth } from "./data/AuthProvider";
import { LegalPage } from "./pages/LegalPage";
import { NotSetUpPage } from "./pages/NotSetUpPage";
import { DemoGatePage } from "./pages/DemoGatePage";
import { SignInPage } from "./pages/SignInPage";
import { DataProvider } from "./data/DataProvider";
import { PermissionProvider } from "./data/PermissionProvider";
import { SearchProvider } from "./data/SearchProvider";
import { AppShell } from "./shell/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { JobsPage } from "./pages/JobsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { TemplatesPage } from "./pages/TemplatesPage";
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
          <Routes>
            <Route path="signin" element={<RedirectIfSignedIn />} />
            {/* Public, and outside RequireAuth on purpose: a policy that cannot be read
                without an account has not been published. */}
            <Route path="privacy" element={<LegalPage kind="privacy" />} />
            <Route path="terms" element={<LegalPage kind="terms" />} />
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
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route
                path="settings"
                element={<SettingsPage theme={theme} onThemeChange={setTheme} />}
              />
              {/* Setup owns Properties, Dictionary, Wiring and Automations. The
                  section is in the path so a tab can be linked to. */}
              {/* The tracker everybody can see: what has been asked for, what is
                  planned, and what shipped. The section is in the path so a link to
                  the roadmap is a link somebody can send. */}
              <Route path="updates" element={<UpdatesPage />} />
              <Route path="updates/:section" element={<UpdatesPage />} />
              <Route path="setup" element={<SetupPage />} />
              <Route path="setup/:section" element={<SetupPage />} />
              {/* The old top-level routes still resolve — they were in the nav for
                  weeks and will be in somebody's bookmarks and Teams messages. */}
              <Route path="dictionary" element={<Navigate to="/setup/dictionary" replace />} />
              <Route path="wiring" element={<Navigate to="/setup/wiring" replace />} />
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
