/**
 * The builder, mounted on its own, for `npm run check:builder-dnd`.
 *
 * Not the app: no router, no Supabase, no sign-in. Just `<ReportBuilder>` with an
 * in-memory store and an empty context, because the thing under test is the drag, and
 * the drag does not care what is in the database.
 *
 * The context is deliberately empty. Every data block will render "nothing to show yet",
 * which is correct and irrelevant — the assertion is that a block APPEARS, not what it
 * says once it is there.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import {
  LOFTY_GROUPS, LOFTY_SEEDS, LOFTY_THEME_SPECS, LOFTY_WIDGETS,
  ReportBuilder, createReportEngine, createReportRegistry, createThemeSet
} from "../src/features/reports/index.js";
import "../src/features/reports/reports.css";

const registry = createReportRegistry({ widgets: LOFTY_WIDGETS, groups: LOFTY_GROUPS });
const engine = createReportEngine(registry, { seeds: LOFTY_SEEDS });
const themes = createThemeSet(LOFTY_THEME_SPECS);

let row = { id: "check", title: "Drag check", layout: { widgets: [] }, updatedAt: new Date().toISOString() };
const store = {
  async get() { return row; },
  async save(patch) { row = { ...row, ...patch }; return row; }
};

const ctx = {
  jobs: [], projects: [], teams: [], stages: [], processes: [],
  propertyDefs: [], propertyValues: [], people: []
};

createRoot(document.getElementById("root")).render(
  <ReportBuilder
    report={row}
    engine={engine}
    store={store}
    ctx={ctx}
    themes={themes}
    branding="Lofty"
    onClose={() => {}}
    onSaved={() => {}}
  />
);
