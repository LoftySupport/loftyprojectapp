import { NavLink, Outlet } from "react-router-dom";
import { AlertBanner, AlertBannerText, ButtonGroup, Flex, Text } from "@vibe/core";
import { SYSTEM_THEMES, type SystemTheme } from "../theme/loftyTheme";
import { useRepository } from "../data/DataProvider";
import "./AppShell.css";

const PAGES = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/projects", label: "Projects" },
  { to: "/jobs", label: "Jobs" },
  { to: "/reports", label: "Reports" },
  { to: "/admin", label: "Admin" },
  { to: "/settings", label: "Settings" },
  { to: "/wiring", label: "Wiring" }
];

export function AppShell({
  theme,
  onThemeChange
}: {
  theme: SystemTheme;
  onThemeChange: (t: SystemTheme) => void;
}) {
  const repo = useRepository();

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="app-header" role="banner">
        <Flex align="center" justify="space-between" gap="medium" wrap>
          <img src="/lofty_logo_orange.png" alt="Lofty" className="app-logo" />

          <nav className="app-nav" aria-label="Main">
            {PAGES.map(p => (
              <NavLink
                key={p.to}
                to={p.to}
                end={p.end}
                className={({ isActive }) => "app-nav-item" + (isActive ? " is-active" : "")}
              >
                {p.label}
              </NavLink>
            ))}
          </nav>

          <ButtonGroup
            size="small"
            groupAriaLabel="Theme"
            value={theme}
            options={SYSTEM_THEMES.map(t => ({ value: t, text: t[0].toUpperCase() + t.slice(1) }))}
            onSelect={value => onThemeChange(value as SystemTheme)}
          />
        </Flex>
      </header>

      <AlertBanner backgroundColor="warning" isCloseHidden>
        <AlertBannerText
          text={`Interface only — reading from the "${repo.name}" repository. Screens go through the data seam, so tables come online one at a time. See Wiring.`}
        />
      </AlertBanner>

      <main id="main" role="main" tabIndex={-1} className="app-main">
        <Outlet />
      </main>

      <footer className="app-foot" role="contentinfo">
        <Text type="text2" color="secondary">
          Lofty Job Oversight Board — React, Vibe and Supabase
        </Text>
      </footer>
    </>
  );
}
