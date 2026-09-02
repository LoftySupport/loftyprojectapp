/**
 * The board's colour rule, carried over from the prototype and re-cut for the
 * seven-position lifecycle: **colour on containers encodes phase; colour on records
 * encodes health; never both on one element.** Columns get a 4px strip and an
 * ink-on-tint count chip; cards stay uncoloured.
 *
 * One hue family — Lofty's teal — with lightness carrying progression: the further a
 * record is through its lifecycle, the deeper the colour. First cut used two families
 * (teal for office phases, rust for site) with semantic ends (green/grey/red); Amber
 * chose the single family on the live board (27 Aug). The reasoning that survives from
 * the first cut: position and lightness, not hue, tell the phases apart, so the ramp
 * holds under colour-vision deficiency. What the single family gives up is Cancelled
 * shouting in red — if it should, that is a one-line change here. Every ink/tint pair
 * clears 4.5:1 (checked with the same math the prototype's ramp was).
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
  // The working phases open light and deepen towards handover…
  "Acquisition & Development": { strip: "#7ec7cd", ink: "#0e4d53", tint: "#eef7f8" },
  "Pre-construction":          { strip: "#4faab2", ink: "#0b454b", tint: "#e7f3f4" },
  "Construction":              { strip: "#218b94", ink: "#08434a", tint: "#e1eff0" },
  "Maintenance":    { strip: "#00747f", ink: "#00434a", tint: "#dbebec" },
  // …and the ends of the lifecycle carry the ramp to its deepest.
  "Completed":                 { strip: "#00565e", ink: "#00343a", tint: "#d5e6e8" },
  "Closed":                    { strip: "#00434a", ink: "#00272c", tint: "#cfe1e3" },
  "Cancelled":                 { strip: "#00272c", ink: "#00181c", tint: "#c9dcdf" }
};

/**
 * Groupings without a fixed order (team, member, project) cycle light/deep alternately,
 * so neighbouring columns never sit at the same lightness.
 */
export const ACCENT_CYCLE: ColumnAccent[] = [
  STAGE_ACCENTS["Acquisition & Development"],
  STAGE_ACCENTS["Completed"],
  STAGE_ACCENTS["Construction"],
  STAGE_ACCENTS["Closed"],
  STAGE_ACCENTS["Pre-construction"],
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
