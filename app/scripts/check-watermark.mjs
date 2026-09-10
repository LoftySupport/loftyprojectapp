/**
 * The DRAFT mark reaches every renderer, and nothing else carries it.
 *
 * Amber, 10 September: *"have a DRAFT watermark across it while editable"*. The mark has
 * to appear on screen, in Print / Save PDF, in the .html download and in the .docx —
 * and a document watermarked in three of the four is worse than one watermarked in none,
 * because somebody will send the fourth. Four renderers means four places for it to be
 * quietly dropped by a refactor, and nothing else in the repo would notice.
 *
 * The negative half matters as much: a PUBLISHED document must come out clean. A check
 * that only proved the mark appears would pass just as happily if it appeared always.
 *
 *   node scripts/check-watermark.mjs
 */
import assert from "node:assert/strict";
import {
  watermarkBackground,
  watermarkLayerCss,
  watermarkLayerCssText,
  docxWatermarkText
} from "../src/features/reports/core/watermark.js";
import { reportToHtml } from "../src/features/reports/core/html.js";

let checks = 0;
const ok = (label) => { checks++; console.log(`ok  ${label}`); };

// ── the tile itself ────────────────────────────────────────────────────────
const bg = watermarkBackground("DRAFT");
assert.match(bg, /^url\("data:image\/svg\+xml;utf8,/, "the tile is an inline SVG data URI");
// Encoded, because the SVG carries `#` in the colour and `<` throughout, and a raw data
// URI ends the CSS url() at the first of them.
assert.ok(!bg.includes("<svg"), "the SVG is URL-encoded rather than inlined raw");
assert.ok(bg.includes(encodeURIComponent("DRAFT")), "the label reaches the tile");
assert.ok(bg.includes(encodeURIComponent("rotate(-30")), "the label is set on the diagonal");
ok("the tile is an encoded SVG data URI carrying the label");

assert.equal(watermarkBackground(""), null, "no label, no tile");
assert.equal(watermarkBackground("   "), null, "whitespace is not a label");
assert.equal(watermarkBackground(null), null, "null is not a label");
ok("a published document gets no tile at all, not an invisible one");

// Upper-cased at the source, so four callers cannot disagree about the casing.
assert.ok(watermarkBackground("draft").includes(encodeURIComponent("DRAFT")));
ok("the label is upper-cased once, in the tile rather than at each caller");

// ── the screen and print layer ─────────────────────────────────────────────
const layer = watermarkLayerCss(bg);
assert.equal(layer.position, "fixed", "fixed, so Chromium repeats it on every printed page");
assert.equal(layer.pointerEvents, "none", "the layer must not eat clicks on the document");
assert.equal(layer.printColorAdjust, "exact", "printers drop backgrounds without this");
assert.equal(layer.WebkitPrintColorAdjust, "exact");
ok("the layer is fixed, inert to the pointer, and survives a printer");

// ── the .html download ─────────────────────────────────────────────────────
assert.equal(watermarkLayerCssText(null), "", "no tile, no CSS");
const css = watermarkLayerCssText(bg);
assert.ok(css.includes("position:fixed"), "the standalone file uses the same mechanism");
assert.ok(css.includes("print-color-adjust:exact"));
ok("the .html download carries the same layer, or none");

const report = {
  title: "Progress report",
  sections: [{ id: "s1", title: "Where it is up to", blocks: [{ type: "paragraph", text: "Frame is up." }] }],
  meta: { generatedAt: "2026-09-10T00:00:00.000Z" }
};
const draftHtml = reportToHtml(report, { branding: "Lofty", watermark: "DRAFT" });
assert.ok(draftHtml.includes("body::before"), "a draft's .html paints the layer");
assert.ok(draftHtml.includes(encodeURIComponent("DRAFT")), "with the label in it");

const publishedHtml = reportToHtml(report, { branding: "Lofty" });
assert.ok(!publishedHtml.includes("body::before"), "a published .html has no layer");
assert.ok(!publishedHtml.includes(encodeURIComponent("DRAFT")), "and no label anywhere");
// The report itself still renders — the negative check above would also pass on an empty
// string, which would be a broken export reported as a clean one.
assert.ok(publishedHtml.includes("Progress report"), "and is still a whole document");
ok("reportToHtml marks a draft and leaves a published document clean");

// ── Word ───────────────────────────────────────────────────────────────────
// Spaced, because Word has no diagonal ghost available through the `docx` package and a
// centred header reads as running head unless it is unmistakably a stamp.
assert.equal(docxWatermarkText("DRAFT"), "D R A F T");
assert.equal(docxWatermarkText("draft"), "D R A F T", "upper-cased here too");
assert.equal(docxWatermarkText(""), "", "no header on a published document");
assert.equal(docxWatermarkText(null), "");
ok("Word gets a spaced stamp for a draft and no header at all otherwise");

console.log(`\nwatermark: ${checks} checks, all passing`);
