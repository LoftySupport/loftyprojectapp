import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ThemeProvider } from "@vibe/core";
import { loftyTheme, type SystemTheme } from "./theme/loftyTheme";
import { DataProvider } from "./data/DataProvider";
import { AppShell } from "./shell/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { JobsPage } from "./pages/JobsPage";
import { WiringPage } from "./pages/WiringPage";
import { AdminPage, ReportsPage, SettingsPage } from "./pages/SimplePages";

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
      <DataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell theme={theme} onThemeChange={setTheme} />}>
              <Route index element={<DashboardPage />} />
              <Route path="projects" element={<ProjectsPage />} />
              <Route path="jobs" element={<JobsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="wiring" element={<WiringPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </DataProvider>
    </ThemeProvider>
  );
}
