import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@vibe/core";
import { loftyTheme, type SystemTheme } from "./theme/loftyTheme";
import { DataProvider } from "./data/DataProvider";
import { PermissionProvider } from "./data/PermissionProvider";
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
      <PermissionProvider>
      <DataProvider>
        {/* Served from /app/, so the router has to know that is the root. */}
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
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
          </Routes>
        </BrowserRouter>
      </DataProvider>
      </PermissionProvider>
    </ThemeProvider>
  );
}
