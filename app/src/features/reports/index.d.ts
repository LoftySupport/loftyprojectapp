/**
 * Types for the vendored report builder.
 *
 * `core/` and `components/` are JavaScript copied from `amberbeaumont/modules`, and the
 * app is TypeScript with `include: ["src"]` and no `allowJs`. This file is the seam: it
 * describes what `index.js` exports so the screens that use it are checked, without
 * asking tsc to infer types from code that is not ours and gets replaced wholesale on
 * every re-sync.
 *
 * It is hand-written and can therefore drift from the JavaScript beside it. Two things
 * keep that honest: it only declares the surface the app actually imports, and the
 * module's `docs/CONTRACTS.md` is where the real definitions live. When re-syncing, read
 * that file and this one together.
 *
 * Deliberately loose in two places. A widget's `options` is `Record<string, unknown>`
 * because a block's settings are the block's own business — a union of every widget's
 * option shape would have to be edited every time somebody adds a block, which is the
 * coupling the registry exists to avoid. A compiled report is opaque for the same
 * reason: nothing in the app reads inside one, it goes straight from `compile()` to a
 * renderer.
 */

import type { ComponentType, ReactNode } from "react";

// ─── Blocks and layouts ──────────────────────────────────────────────

/** One block in a saved layout: which widget, and the question it was asked. */
export interface ReportWidget {
  id: string;
  kind: string;
  options: Record<string, unknown>;
}

export interface ReportLayout {
  widgets: ReportWidget[];
  page?: { pageSize?: string; orientation?: string };
  theme?: string;
}

/** A report compiled for a renderer. Opaque: nothing in the app reads inside one. */
export type CompiledReport = { readonly __compiledReport: unique symbol };

// ─── Themes ──────────────────────────────────────────────────────────

export interface ReportTheme {
  key: string;
  label: string;
  description?: string;
  colors: Record<string, string>;
  fonts?: Record<string, string | number>;
  header?: { style?: string; rule?: number };
  logo?: { light?: string; dark?: string; height?: number; alt?: string } | null;
}

export type ReportThemeSet = Record<string, ReportTheme>;

export const BUILT_IN_THEMES: ReportThemeSet;
export const DEFAULT_THEME_KEY: string;
export const THEME_COLOR_ROLES: readonly string[];
export function createTheme(spec: Partial<ReportTheme> & { extends?: string }): ReportTheme;
export function createThemeSet(
  custom: Record<string, Partial<ReportTheme>>,
  options?: { includeBuiltIns?: boolean }
): ReportThemeSet;
export function resolveTheme(theme: string | ReportTheme, themes?: ReportThemeSet): ReportTheme;
export function themeToCssVars(theme: string | ReportTheme): Record<string, string>;
export function themeToCssText(theme: string | ReportTheme): string;
export function hexForDocx(hex: string, fallback?: string): string;
export function logoForSurface(
  theme: string | ReportTheme,
  surface?: "light" | "dark"
): { src: string; height: number; alt: string } | null;
export function isDarkColour(hex: string): boolean;
export function themeFromBrandMarkdown(
  markdown: string,
  options?: Record<string, unknown>
): { theme: ReportTheme; report: Record<string, unknown> };
export function themeFromCssVariables(
  css: string,
  options?: Record<string, unknown>
): { theme: ReportTheme; report: Record<string, unknown> };

// ─── The registry and the engine ─────────────────────────────────────

/** The helpers every resolver is handed: callouts, and whether this is a final render. */
export interface WidgetHelpers {
  info: (text: string) => unknown;
  warn: (text: string) => unknown;
  danger: (text: string) => unknown;
  staleRef: (text: string) => unknown;
  forExport: boolean;
  widget: ReportWidget;
}

export interface WidgetDefinition {
  label: string;
  group: string;
  hint?: string;
  defaults?: (ctx: unknown) => Record<string, unknown>;
  settings?: unknown[];
  resolve: (options: Record<string, unknown>, ctx: unknown, helpers: WidgetHelpers) => unknown[];
  scopedOptions?: string[];
  compactable?: boolean;
}

export interface ReportSeed {
  key: string;
  label: string;
  hint?: string;
  build: (ctx: unknown) => { kind: string; options?: Record<string, unknown> }[];
}

export interface ReportRegistry {
  types: Record<string, WidgetDefinition>;
  groups: string[];
  kinds: string[];
  get(kind: string): WidgetDefinition | null;
  has(kind: string): boolean;
  kindsInGroup(group: string): string[];
  newId(): string;
}

export function createReportRegistry(config?: {
  widgets?: Record<string, WidgetDefinition>;
  groups?: readonly string[];
  includeCore?: boolean;
}): ReportRegistry;

export interface ReportEngine {
  registry: ReportRegistry;
  seeds: ReportSeed[];
  createWidget(kind: string, ctx?: unknown): ReportWidget | null;
  remapIds(widgets: ReportWidget[]): ReportWidget[];
  resolve(widget: ReportWidget, ctx?: unknown, opts?: { forExport?: boolean }): unknown[];
  compile(
    report: { title?: string; subtitle?: string; meta?: Record<string, unknown> },
    widgets: ReportWidget[],
    ctx?: unknown
  ): CompiledReport;
  adapt(widgets: ReportWidget[], ctx?: unknown): ReportWidget[];
  seed(key: string, ctx?: unknown): ReportWidget[];
}

export function createReportEngine(
  registry: ReportRegistry,
  options?: { seeds?: ReportSeed[] }
): ReportEngine;

export const CORE_WIDGETS: Record<string, WidgetDefinition>;
export const TEXT_GROUP: string;
export const COMPACTABLE_BLOCK_TYPES: ReadonlySet<string>;
export const helpers: Omit<WidgetHelpers, "forExport" | "widget">;

// ─── The store ───────────────────────────────────────────────────────

/**
 * What the builder persists through. The optional half (sharing, saved layouts) is
 * feature-detected by the components, so a store without it hides controls rather than
 * breaking them — which is why those methods are optional here too.
 */
export interface ReportStoreRow {
  id: string;
  title: string;
  layout: ReportLayout;
  scopeId: string | null;
  shareToken: string | null;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export interface ReportStore {
  list(scopeId?: string | null): Promise<ReportStoreRow[]>;
  get(id: string): Promise<ReportStoreRow>;
  create(input?: { title?: string; layout?: ReportLayout; scopeId?: string | null }): Promise<ReportStoreRow>;
  /** Partial: the builder autosaves title and layout independently. */
  save(id: string, patch: { title?: string; layout?: ReportLayout }): Promise<ReportStoreRow>;
  remove(id: string): Promise<{ ok: boolean }>;
  createShareLink?(id: string, password?: string): Promise<ReportStoreRow>;
  deleteShareLink?(id: string): Promise<ReportStoreRow>;
  fetchShared?(token: string, password?: string): Promise<ReportStoreRow>;
  listTemplates?(): Promise<unknown[]>;
  saveTemplate?(input: { name: string; type?: string; data: unknown }): Promise<unknown>;
}

// ─── Components ──────────────────────────────────────────────────────

export const ReportBuilder: ComponentType<{
  report: { id: string; title: string; layout?: ReportLayout | null };
  engine: ReportEngine;
  store: ReportStore;
  ctx: unknown;
  onClose: () => void;
  onSaved?: (row: ReportStoreRow) => void;
  branding?: string;
  shareUrlBase?: string;
  canSaveTemplate?: boolean;
  themes?: ReportThemeSet;
}>;

export const ReportOverlay: ComponentType<{
  report: CompiledReport;
  onClose: () => void;
  initialPageSize?: string;
  initialOrientation?: string;
  onPageChange?: (page: { pageSize: string; orientation: string }) => void;
  branding?: string;
  themes?: ReportThemeSet;
  initialTheme?: string;
  onThemeChange?: (key: string) => void;
}>;

export const ReportSharePanel: ComponentType<Record<string, unknown>>;
export const ReportDocument: ComponentType<Record<string, unknown>>;
export const ReportBlocks: ComponentType<{ blocks: unknown[]; theme?: string | ReportTheme }>;
export const SettingsPanel: ComponentType<Record<string, unknown>>;
export const RichTextEditor: ComponentType<Record<string, unknown>>;
export const REPORT_STYLES: Record<string, unknown>;
export const PAGE_SIZES: Record<string, unknown>;
export function themePresentation(theme: string | ReportTheme): Record<string, unknown>;
export function reportFilename(title: string): string;
export function sanitizeHtml(html: string): string;

// ─── Serialisers ─────────────────────────────────────────────────────

export function reportToMarkdown(report: CompiledReport, options?: Record<string, unknown>): string;
export function blockToMarkdown(block: unknown): string;
export function reportToHtml(report: CompiledReport, options?: Record<string, unknown>): string;
export function blockToHtml(block: unknown, options?: Record<string, unknown>): string;

// ─── Block constructors ──────────────────────────────────────────────

export const BLOCK_TYPES: readonly string[];
export const CHIP_TONES: readonly string[];
export function cellText(cell: unknown): string;
export function stripHtml(html?: string): string;
export function isEmptyHtml(html?: string): boolean;
export function paragraph(text: string): unknown;
export function subheading(text: string, color?: string): unknown;
export function keyValues(items: { label: string; value: string }[]): unknown;
export function list(items: string[]): unknown;
export function table(headers: unknown[], rows: unknown[][]): unknown;
export function callout(text: string, tone?: string): unknown;
export function image(src: string, caption?: string): unknown;
export function richText(html: string): unknown;
export function divider(pageBreak?: boolean): unknown;
export function staleRef(text: string): unknown;
export function emptyReport(title?: string): CompiledReport;

// ─── Lofty adapters ──────────────────────────────────────────────────

export const LOFTY_WIDGETS: Record<string, WidgetDefinition>;
export const LOFTY_GROUPS: readonly string[];
export const LOFTY_SEEDS: ReportSeed[];
export const LOFTY_THEME: ReportTheme;
export const LOFTY_THEME_QUIET: ReportTheme;
export const LOFTY_THEME_SPECS: Record<string, ReportTheme>;

/**
 * The two stores, over the app's repository seam rather than a Supabase client.
 *
 * Both satisfy `ReportStore`; the builder is handed whichever matches what is open. The
 * document store also implements `saveTemplate`, which is how "Save as template" becomes
 * a proposal into the library rather than a second kind of save.
 */
export function createLibraryStore(repo: unknown, kind?: "template" | "section"): ReportStore;
export function createDocumentStore(
  repo: unknown,
  subject?: { jobId?: string | null; projectId?: number | null }
): ReportStore;

export type { ReactNode };
