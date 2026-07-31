# Lofty Job Oversight Board — Prototype

A dummy-data, stakeholder-facing prototype of a proposed "Job Oversight Board" (Kanban-style) for Lofty's job pipeline. Built to demonstrate a data visibility/oversight concept before any real platform decision is made.

**This is not connected to live data.** All jobs, names, dates, and activity shown are placeholder content for demonstration purposes only.

## What's here

- `index.html` — the interactive prototype. Open directly in a browser, or enable GitHub Pages on this repo to serve it at a public URL.
- `concept-spec.md` — the underlying data architecture / concept write-up this prototype is based on.

## Design system

The interface is built on [Vibe](https://vibe.monday.com), monday.com's design system —
its type ramp, 4px spacing scale, radii, motion curves, elevation, neutrals and semantic
colours, plus its accessibility contract. Lofty's logo and its two hero colours (the logo
orange `#f47e63` and the deep green `#005058`) sit in Vibe's primary slots in place of
Vibe's blue.

`.mcp.json` wires the [Vibe MCP server](https://vibe.monday.com/?path=/docs/mcp--docs) into
this repo, so any MCP-capable editor can query component APIs, tokens and accessibility
requirements directly while working on the UI.

These documents cover it:

- `design-system-evaluation.md` — the evaluation of the previous UI against Vibe, and a
  record of what changed.
- `vibe-catalog-status.md` — component-by-component status against the Vibe catalog.
- `supabase-template.html` + `supabase-schema.md` — **the binding template.** The prototype
  with every data value replaced by a `{{table.column}}` token, and the schema those tokens
  point at. Build the schema, bind the tokens.
- `react-migration.md` — **the plan for the real build: React, Vibe and Supabase.** Step
  one is standing up React with Supabase connected, before any UI is ported. Covers the
  schema, the Row Level Security mapping for the permission model, the component mapping,
  the `ThemeProvider` config for Lofty's brand colours, what ports as-is versus what has
  to be rebuilt, and the build order.

## Views

Board, Table, Gantt and Calendar — the same four names on both Jobs and Projects, switchable from the toolbar. The board groups by Stage, Project, Team, Team member or Status. The toolbar also carries a date-range picker and add/remove filters, which follow the page you are on.

Free-text search across every view; drag-and-drop between phases; and a job detail panel with breadcrumbs, its own job search, a full-screen mode, one activity feed, comments with @mentions, and editable team, phase, build stage, type and health status fields.

Light, dark and black themes, switchable in Settings.
