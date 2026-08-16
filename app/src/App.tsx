import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Loader, ThemeProvider } from "@vibe/core";
import { loftyTheme, type SystemTheme } from "./theme/loftyTheme";
import { AuthProvider, useAuth } from "./data/AuthProvider";
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
import { DictionaryPage } from "./pages/DictionaryPage";
import { WiringPage } from "./pages/WiringPage";

const THEME_KEY = "lofty-theme";

/**
 * The gate.
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
  const { status } = useAuth();
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
  return <Outlet />;
}

/** Signing in and then being shown the sign-in page again reads as a failure. */
function RedirectIfSignedIn() {
  const { status } = useAuth();
  if (status === "signed-in") return <Navigate to="/" replace />;
  return <SignInPage />;
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
            <Route element={<RequireAuth />}>
            <Route element={<AppShell />}>
              <Route index element={<DashboardPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="templates" element={<TemplatesPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route
                path="settings"
                element={<SettingsPage theme={theme} onThemeChange={setTheme} />}
              />
              <Route path="dictionary" element={<DictionaryPage />} />
              <Route path="wiring" element={<WiringPage />} />
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
