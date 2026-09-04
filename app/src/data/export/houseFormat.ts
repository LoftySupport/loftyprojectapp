/**
 * Lofty's house document format: the palette, once.
 *
 * Every document Lofty sends wears this — the exported PDF and Word file (0026), and now
 * the documents built in Tools → Template Builder. It is one look, so it is one set of
 * numbers.
 *
 * WHY THIS FILE EXISTS
 *
 *   `pdf.ts` and `docx.ts` each carried their own copy of these eight roles, in their own
 *   encodings, and the copies had already drifted: the PDF drew the row hairline as
 *   `0.925 0.929 0.933` — #ECEDEE — while its own comment and the Word writer both said
 *   #ECECEE. One digit in one channel, invisible on screen, and exactly what two copies
 *   of a palette produce given a little time.
 *
 *   Adding a third consumer was the moment to stop. The report builder's Lofty theme is
 *   built from these values too, so a document composed in the builder and a table
 *   exported from Jobs cannot come out in different greys.
 *
 * The brand names in the comments are the brand kit's own words, kept because they are
 * what a designer will search for.
 */

/** The eight roles, as CSS hex. Every other encoding is derived from these. */
export const HOUSE_COLOURS = {
  /** Foundation Black — headings and body. */
  ink: "#414042",
  /** Subtitles and captions. */
  muted: "#67666a",
  /** The footer line. */
  footInk: "#8a898d",
  /** Eco Green — the eyebrow and section labels. */
  green: "#005058",
  /** Crisp Orange — the 2pt rule under a section heading (brand kit: Level 2). */
  orange: "#f47e63",
  /** The table header row. */
  headFill: "#f6f7f7",
  /** The hairline between table rows. */
  rowRule: "#ececee",
  /** The header and footer rules. */
  hairline: "#e7e8e9"
} as const;

export type HouseColour = keyof typeof HOUSE_COLOURS;

/** What the footer says on every page, in both writers. */
export const HOUSE_CONFIDENCE = "Commercial in confidence";

/** The section rule's weight in points — the brand kit's Level 2. */
export const HOUSE_RULE_PT = 2;

/**
 * `#rrggbb` → the three 0–1 components a PDF content stream wants, to three decimals.
 *
 * Three decimals because that is what the hand-written constants used, so this returns
 * exactly the strings they did — which is how the refactor was proved to change nothing.
 */
export function pdfRgb(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a six-digit hex colour: ${hex}`);
  return [1, 2, 3]
    .map(i => (parseInt(m[i], 16) / 255).toFixed(3))
    .join(" ");
}

/** `#rrggbb` → the bare `RRGGBB` OOXML wants. */
export function ooxmlRgb(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Not a six-digit hex colour: ${hex}`);
  return m[1].toUpperCase();
}
