import { NavLink, Outlet } from "react-router-dom";
import { Avatar, Flex, Label, Text, TextField } from "@vibe/core";
import { useRepository } from "../data/DataProvider";
import { usePermission } from "../data/PermissionProvider";
import { useSearch } from "../data/SearchProvider";
import { PERMISSION_LEVELS, type PermissionLevel } from "../data/types";
import { Select } from "../components/Select";
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
  { to: "/dictionary", label: "Dictionary" },
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
  const { permission, setPermission } = usePermission();
  const { query, setQuery } = useSearch();

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
            <Label
              kind="fill"
              color="dark"
              text="Unbound"
              aria-label={`Reading through the ${repo.name} repository`}
            />
            {/* With no auth there is no honest way to know a permission level, and
                defaulting to superadmin would quietly hide every gate in the app —
                which is the thing that needs reviewing. Switchable, and visible.
                It disappears when Supabase Auth lands. */}
            <span className="app-permission">
              <Select
                aria-label="Signed in as (demo)"
                options={PERMISSION_LEVELS.map(p => ({ value: p, label: p }))}
                value={permission}
                onChange={v => setPermission(v as PermissionLevel)}
              />
            </span>
            <span className="app-user">
              <Avatar size="small" type="text" text="SB" aria-label="Signed in" />
              <Token>profiles.full_name</Token>
            </span>
          </div>
        </Flex>
      </header>

      <div className="app-banner" role="status">
        {/* `ellipsis={false}` or Vibe holds this on one line and pushes the page into a
            horizontal scrollbar below about 1000px. */}
        <Text type="text2" element="span" ellipsis={false}>
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
