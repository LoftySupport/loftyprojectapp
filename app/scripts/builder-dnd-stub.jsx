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
  ReportBuilder, createReportEngine, createReportRegistry, createThemeSet,
  makeFillTokens, tokensFor
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

/**
 * Enough of a record for the "Insert field" menu to have something in it, and for a
 * placeholder to resolve to a real value. Kept tiny on purpose — the check is about the
 * builder accepting blocks and filling tokens, not about the shape of Lofty's data.
 */
const base = {
  jobs: [{ jobNumber: "1042-001", projectNumber: "1042", projectId: 1042, currentAddress: "28 Corner Street" }],
  projects: [{ projectNumber: "1042", projectId: 1042, currentAddress: "28 Corner Street" }],
  teams: [], stages: [], stageNames: [], processes: [],
  propertyDefs: [{ key: "slab_cost", label: "Slab cost", format: "currency", stageName: "Construction", position: 1 }],
  propertyValues: [{ propertyKey: "slab_cost", format: "currency", jobId: "1042-001", projectId: null, value: { number: 18400 } }],
  propertyOptions: [], people: [],
  subject: { jobId: "1042-001", projectId: null }
};
/**
 * The snippet half, stubbed the way the page supplies it.
 *
 * `saveTextSnippet` records rather than stores — the page opens a naming panel and writes
 * a library row, neither of which this check is about. What it IS about is WHICH html the
 * editor decides to hand over: the selection when there is one, the whole block when
 * there is not. So the last call is parked on `window` for the assertion to read.
 */
const ctx = {
  ...base,
  textTokens: tokensFor(base),
  fillTokens: makeFillTokens(base),
  textSnippets: [
    { value: "sn_signoff", label: "Standard sign-off", html: "<p>Kind regards,<br><b>Lofty</b></p>" }
  ],
  saveTextSnippet: (html) => { window.__savedSnippet = html; }
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
