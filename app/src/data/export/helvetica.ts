/**
 * How wide a string is in Helvetica, and which byte each character becomes.
 *
 * A PDF that uses one of the fourteen standard fonts embeds no font programme — the
 * viewer supplies Helvetica — which is what keeps these downloads a few kilobytes
 * instead of a few hundred. The catch is that nothing in the file says how wide a glyph
 * is, so the writer has to know: laying a table out means measuring every cell, and
 * measuring means these numbers.
 *
 * WHERE THE NUMBERS COME FROM. The Adobe AFM metrics for Helvetica and Helvetica-Bold,
 * read out of the URW Nimbus Sans metrics shipped with matplotlib (`phvr8a.afm`,
 * `phvb8a.afm`) — the same metrics Helvetica has, which is why Nimbus is its substitute
 * everywhere. They are indexed by WinAnsi code from 32, in units of 1/1000 em, so the
 * width of a string at 9pt is `sum(widths) * 9 / 1000`. They were **read, not
 * remembered**: a table of widths that is close but wrong is invisible in review and
 * shows up as columns that overlap on the third page of somebody's report.
 *
 * The five zeroes are the codes CP1252 leaves undefined (0x81, 0x8D, 0x8F, 0x90, 0x9D)
 * and DEL. `encode` below can never produce them, and `widthOf` treats a zero as
 * unencodable for the same reason.
 */

const REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722,
  722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722,
  667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556,
  556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
  500, 334, 260, 334, 584, 0, 556, 0, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333,
  1000, 0, 611, 0, 0, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 0, 500,
  667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400,
  584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667,
  667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778,
  778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889,
  500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611,
  556, 556, 556, 556, 500, 556, 500
];

const BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722,
  722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722,
  667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611,
  611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
  500, 389, 280, 389, 584, 0, 556, 0, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333,
  1000, 0, 611, 0, 0, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 0, 500,
  667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400,
  584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722,
  722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778,
  778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889,
  556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611,
  611, 611, 611, 611, 556, 611, 556
];

/**
 * The characters WinAnsi puts in 0x80–0x9F, which Latin-1 leaves empty. All eight of the
 * ones this app actually produces are in here — the em dash the tables use for "no
 * answer", the middle dot in "1042 · Pre-construction", and the curly quotes and
 * ellipsis that arrive in text pasted from Word.
 */
const HIGH: Record<string, number> = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f
};

const QUESTION = 0x3f;

/**
 * One WinAnsi byte per character, with `?` for anything the encoding cannot carry.
 *
 * A `?` is the honest answer here and a mojibake box is not: the fourteen standard fonts
 * have 224 glyphs between them and there is no arrangement of them that spells a Chinese
 * name. Anything outside WinAnsi — and anything whose glyph is absent, which is what a
 * zero width means — becomes `?` at this one point, so the width the layout measured and
 * the bytes the page carries can never disagree.
 */
export function encode(text: string, bold = false): number[] {
  const widths = bold ? BOLD : REGULAR;
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    let byte =
      code >= 0x20 && code <= 0x7e ? code
      : code >= 0xa0 && code <= 0xff ? code
      : (HIGH[ch] ?? QUESTION);
    // A no-break space and a soft hyphen both have metrics, but a tab, a newline or a
    // NUL inside a table cell is a layout accident rather than a character; they become
    // spaces so a pasted multi-line note stays on one row.
    if (code < 0x20) byte = 0x20;
    // Belt and braces, and it holds nothing up today: every byte the two branches above
    // can produce has a width. It is here because the one way to break that is to add a
    // character to `HIGH` whose glyph Helvetica lacks — and a zero width is invisible,
    // since the character still draws as nothing while the layout reserves no room for
    // it and the rest of the row shifts left. `export-check` asserts the property.
    if (!widths[byte - 32]) byte = QUESTION;
    out.push(byte);
  }
  return out;
}

/** Width of already-encoded bytes, in points. */
export function widthOfBytes(bytes: number[], size: number, bold = false): number {
  const widths = bold ? BOLD : REGULAR;
  let units = 0;
  for (const b of bytes) units += widths[b - 32] ?? 0;
  return (units * size) / 1000;
}

export function widthOf(text: string, size: number, bold = false): number {
  return widthOfBytes(encode(text, bold), size, bold);
}

/**
 * `text` shortened to fit `max` points, with an ellipsis if anything came off.
 *
 * Measured against the same tables the drawing uses, so a truncated cell is guaranteed
 * to fit rather than nearly fit — this is what stops the Address column writing over the
 * Stage column. An ellipsis, not a hard cut: "12 Hawthorn Cres" and "12 Hawthorn Cr…"
 * are different claims about an address.
 */
export function truncate(text: string, max: number, size: number, bold = false): string {
  if (widthOf(text, size, bold) <= max) return text;
  const ellipsis = "…";
  const room = max - widthOf(ellipsis, size, bold);
  if (room <= 0) return "";
  const chars = [...text];
  let width = 0;
  let taken = 0;
  while (taken < chars.length) {
    const next = widthOf(chars[taken], size, bold);
    if (width + next > room) break;
    width += next;
    taken++;
  }
  return chars.slice(0, taken).join("").trimEnd() + ellipsis;
}
