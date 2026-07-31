import { NavLink, Outlet } from "react-router-dom";
import { Avatar, Flex, Label, Text } from "@vibe/core";
import { useRepository } from "../data/DataProvider";
import { Token } from "../components/Token";
import "./AppShell.css";

const PAGES = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/projects", label: "Projects" },
  { to: "/jobs", label: "Jobs" },
  { to: "/reports", label: "Reports" },
  { to: "/templates", label: "Templates" },
  { to: "/admin", label: "Admin" },
  { to: "/settings", label: "Settings" },
  { to: "/wiring", label: "Wiring" }
];

/**
 * The frame every page sits in.
 *
 * Laid out as a flex column from `html` down, so the footer sits at the bottom of the
 * viewport on a short page instead of floating halfway up it, and the scrollbar belongs
 * to the page rather than to an inner div.
 *
 * The theme control lives on Settings rather than up here — it is a preference, and the
 * header is for navigation and identity.
 */
export function AppShell() {
  const repo = useRepository();

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="app-header" role="banner">
        <Flex align="center" gap="medium" wrap>
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

          <div className="app-header-right">
            <Label
              kind="fill"
              color="dark"
              text="Unbound"
              aria-label={`Reading through the ${repo.name} repository`}
            />
            <span className="app-user">
              <Avatar size="small" type="text" text="SB" aria-label="Signed in" />
              <Token>users.full_name</Token>
            </span>
          </div>
        </Flex>
      </header>

      <div className="app-banner" role="status">
        <Text type="text2" element="span">
          <strong>Supabase binding template.</strong> Every{" "}
          <code className="sb-token">{"{{table.column}}"}</code> marks a value that comes from
          Supabase. Layout, spacing and components are final — only the data is unbound.
        </Text>
      </div>

      <main id="main" role="main" tabIndex={-1} className="app-main">
        <Outlet />
      </main>

      <footer className="app-foot" role="contentinfo">
        <Text type="text3" color="secondary">
          Lofty Job Oversight Board — React, Vibe and Supabase
        </Text>
      </footer>
    </>
  );
}
