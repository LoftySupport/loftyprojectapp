// watermark.js — the DRAFT mark a document wears until it is published.
//
// Amber, 10 September: *"have a DRAFT watermark across it while editable and saved to the
// job … if editing it in the app it reverts to draft watermark"*.
//
// ONE DEFINITION, FOUR RENDERERS. The mark has to appear on screen, in Print / Save PDF,
// in the .html download and in the .docx — and a document that is watermarked in three of
// them is worse than one watermarked in none, because somebody will send the fourth. The
// first three share the SVG below; Word cannot take it and gets its own shape, which is
// why `docxWatermarkText` exists beside it rather than inside it.
//
// WHY A TILED BACKGROUND AND NOT ONE BIG DIAGONAL WORD. A single rotated word is what a
// watermark usually looks like, and it only marks the page it is on. A tiled one marks
// every page of a long report without anything having to know where the page breaks fall
// — which matters here because the report builder has no page model at all: it renders one
// flowing column and lets the printer paginate it.

/** Pale enough to read through, dark enough to see. Crisp Orange, the brand's own. */
const DEFAULT_COLOUR = '#f47e63';

/**
 * A repeating-tile background, as a CSS `url(...)` value.
 *
 * Returns null for an empty label, so a caller can spread the result and get nothing when
 * there is nothing to say — a published document must not carry an invisible tile that
 * some future change makes visible.
 */
export function watermarkBackground(text, { colour = DEFAULT_COLOUR, opacity = 0.16, tile = 300 } = {}) {
  const label = String(text || '').trim().toUpperCase();
  if (!label) return null;
  const half = tile / 2;
  // `dominant-baseline` rather than a hand-computed dy: the label is set in whatever face
  // the reader has, and guessing at its metrics puts the word off-centre in the tile.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}">` +
    `<text x="${half}" y="${half}" fill="${colour}" fill-opacity="${opacity}"` +
    ` font-family="Montserrat, Arial, sans-serif" font-size="${Math.round(tile / 5.5)}"` +
    ` font-weight="700" letter-spacing="${Math.round(tile / 50)}" text-anchor="middle"` +
    ` dominant-baseline="middle" transform="rotate(-30 ${half} ${half})">${escapeXml(label)}</text>` +
    `</svg>`;
  // encodeURIComponent rather than a raw data URI: the SVG carries `#` in the colour and
  // `<` throughout, and both end a CSS url() early.
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/**
 * The CSS for the layer that carries it — a fixed sheet over the document.
 *
 * FIXED, AND THE REASON IS PRINTING. An absolutely positioned overlay paints once, on the
 * first page. A fixed one repeats on every printed page in Chromium, which is what
 * Print / Save PDF is. **Firefox prints it on the first page only**, and that is a real
 * limitation rather than a theoretical one — said here so the next person reads it before
 * wondering, and so nobody treats a Firefox PDF as proof the mark is absent.
 *
 * `print-color-adjust: exact` is what stops a printer helpfully dropping it.
 */
export function watermarkLayerCss(background) {
  return {
    position: 'fixed',
    inset: 0,
    zIndex: 1,
    pointerEvents: 'none',
    backgroundImage: background,
    backgroundRepeat: 'repeat',
    printColorAdjust: 'exact',
    WebkitPrintColorAdjust: 'exact',
  };
}

/** The same layer as a CSS text block, for the standalone .html download. */
export function watermarkLayerCssText(background) {
  if (!background) return '';
  return `body::before{content:"";position:fixed;inset:0;z-index:1;pointer-events:none;` +
    `background-image:${background};background-repeat:repeat;` +
    `print-color-adjust:exact;-webkit-print-color-adjust:exact}`;
}

/**
 * What Word gets instead.
 *
 * A true Word watermark is a VML shape in the header, which the `docx` package does not
 * expose. Rather than hand-writing XML into somebody else's document part — which breaks
 * silently on their next release — this is a large, pale, centred word in the page header,
 * which Word repeats on every page by itself.
 *
 * It is NOT the diagonal ghost behind the text that Word users expect, and pretending
 * otherwise would be the wrong kind of quiet: it sits above the content rather than
 * behind it. It is unmissable on every page, which is the job.
 */
export function docxWatermarkText(text) {
  const label = String(text || '').trim().toUpperCase();
  return label ? label.split('').join(' ') : '';
}

export const WATERMARK_COLOUR = DEFAULT_COLOUR;

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]
  ));
}
