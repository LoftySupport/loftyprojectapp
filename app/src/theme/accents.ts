/**
 * The board's colour rule, carried over from the prototype and re-cut for the
 * seven-position lifecycle: **colour on containers encodes phase; colour on records
 * encodes health; never both on one element.** Columns get a 4px strip and an
 * ink-on-tint count chip; cards stay uncoloured.
 *
 * Two hue families with lightness carrying progression — teal for the office-side
 * phases, rust for the site-side — so the teal→rust crossing IS the handover to site,
 * and the ramp survives colour-vision deficiency because position, not hue, tells the
 * phases within a family apart. The three ends of the lifecycle read semantically:
 * Completed in the positive green the status pills already use, Closed in archive
 * grey, Cancelled in the negative ink. Every ink/tint pair here clears 4.5:1 (checked
 * with the same math the prototype's ramp was).
 */
import type { CSSProperties } from "react";

export interface ColumnAccent {
  /** The 4px strip across the column top. */
  strip: string;
  /** Text on the tint — the count chip's foreground. */
  ink: string;
  /** The chip's background. */
  tint: string;
}

export const STAGE_ACCENTS: Record<string, ColumnAccent> = {
  // Office side — teal, darkening reversed: deepest first so the ramp opens strong.
  "Acquisition & Development": { strip: "#00343a", ink: "#00343a", tint: "#e6ebeb" },
  "Pre-construction":          { strip: "#00666f", ink: "#00565e", tint: "#e6f0f1" },
  // Site side — rust. The hue change is the handover.
  "Construction":              { strip: "#a04a2e", ink: "#8e3f26", tint: "#f6edea" },
  "Handover & Maintenance":    { strip: "#7a331f", ink: "#7a331f", tint: "#f2ebe9" },
  // The ends of the lifecycle carry meaning, not progression.
  "Completed":                 { strip: "#00854d", ink: "#005c35", tint: "#dcefe4" },
  "Closed":                    { strip: "#676879", ink: "#50515f", tint: "#eceef2" },
  "Cancelled":                 { strip: "#a32436", ink: "#a32436", tint: "#f9e7ea" }
};

/**
 * Groupings without a fixed order (team, member, project) cycle through the two
 * families alternately, so neighbouring columns never share a colour.
 */
export const ACCENT_CYCLE: ColumnAccent[] = [
  STAGE_ACCENTS["Acquisition & Development"],
  STAGE_ACCENTS["Construction"],
  STAGE_ACCENTS["Pre-construction"],
  STAGE_ACCENTS["Handover & Maintenance"],
  STAGE_ACCENTS["Completed"],
  STAGE_ACCENTS["Cancelled"]
];

export function columnAccent(grouping: string, key: string, index: number): ColumnAccent {
  if (grouping === "Stage" && STAGE_ACCENTS[key]) return STAGE_ACCENTS[key];
  return ACCENT_CYCLE[index % ACCENT_CYCLE.length];
}

/** The accent as CSS custom properties — the prototype's applyAccent, as a style prop. */
export function accentStyle(a: ColumnAccent): CSSProperties {
  return { "--col-accent": a.strip, "--col-ink": a.ink, "--col-tint": a.tint } as CSSProperties;
}
