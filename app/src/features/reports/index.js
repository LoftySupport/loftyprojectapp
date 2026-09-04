// index.js — the public surface of the vendored report-builder.
//
// Import from here, not from deep paths. Anything not exported here is an internal
// detail of the module and may change when it is re-synced from
// `amberbeaumont/modules → packages/report-builder`.
//
// This is the module's own index with two changes, both listed in README.md beside it:
// the placeholder "Example Co" adapters are replaced by the Lofty ones, and the Supabase
// and in-memory stores are gone because this app's store goes through the repository
// seam instead.

// ─── Core: the block model and its serialisers ───────────────────────
export {
  BLOCK_TYPES, CHIP_TONES,
  cellText, stripHtml, isEmptyHtml,
  paragraph, subheading, keyValues, list, table, callout, image, richText,
  divider, staleRef, emptyReport,
} from './core/blocks.js';

export { reportToMarkdown, blockToMarkdown } from './core/markdown.js';
export { reportToHtml, blockToHtml } from './core/html.js';
// `core/docx.js` is deliberately NOT re-exported. It statically imports the ~1.5 MB
// `docx` package, and a static export here would put that in the main bundle for
// everybody who opens the app. `ReportDocument.jsx` imports it dynamically inside the
// Word button's handler, so it arrives as its own chunk when somebody actually clicks.

// ─── Core: theming ───────────────────────────────────────────────────
export {
  BUILT_IN_THEMES, DEFAULT_THEME_KEY, THEME_COLOR_ROLES,
  createTheme, createThemeSet, resolveTheme,
  themeToCssVars, themeToCssText, hexForDocx, logoForSurface, isDarkColour,
} from './core/theme.js';

export { themeFromBrandMarkdown, themeFromCssVariables } from './core/themeImport.js';

// ─── Core: the widget registry and engine ────────────────────────────
export {
  createReportRegistry, CORE_WIDGETS, TEXT_GROUP, COMPACTABLE_BLOCK_TYPES, helpers,
} from './core/registry.js';

export {
  createReportEngine, createWidget, resolveWidget, compileReport,
  remapWidgetIds, adaptWidgets, seedWidgets,
} from './core/widgetEngine.js';

// ─── UI ──────────────────────────────────────────────────────────────
export { default as ReportBuilder, ReportSharePanel } from './components/ReportBuilder.jsx';
export {
  default as ReportOverlay,
  ReportDocument, ReportBlocks, themePresentation, REPORT_STYLES, PAGE_SIZES, reportFilename,
} from './components/ReportDocument.jsx';
export { default as SettingsPanel } from './components/SettingsPanel.jsx';
export { default as RichTextEditor, sanitizeHtml } from './components/RichTextEditor.jsx';

// ─── Adapters: Lofty ─────────────────────────────────────────────────
// Everything the module cannot know: which entities are worth reporting on, what the
// brand looks like, and where a template is kept.
export { LOFTY_WIDGETS, LOFTY_GROUPS, LOFTY_SEEDS } from './adapters/lofty/widgets.js';
export { LOFTY_THEME, LOFTY_THEME_QUIET, LOFTY_THEME_SPECS } from './adapters/lofty/theme.js';
export { createLibraryStore, createDocumentStore } from './adapters/lofty/store.js';
